// Content script: double-click a word → translation popup → save as a card.
import { WordPopup, type PopupState } from './popup-ui.ts';
import { findBlock, isEditable, textWithOffset } from './context.ts';
import { cleanWord, extractSentence } from './sentence.ts';
import { detectLanguage, providerChain, translate } from '../translate/index.ts';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, type Settings } from '../shared/settings.ts';
import { send } from '../shared/messages.ts';

let settings: Settings = DEFAULT_SETTINGS;
getSettings().then((s) => (settings = s), () => {});
onSettingsChanged((s) => (settings = s));

/** One double-click: its context plus the popup state shown for it. */
interface Lookup {
  sentence: string;
  url: string;
  title: string;
  state: PopupState;
}

let current: Lookup | null = null;
let popup: WordPopup | null = null;

function getPopup(): WordPopup {
  popup ??= new WordPopup(
    {
      onSave: () => current && save(current),
      onLangChange: (lang) => {
        if (!current) return;
        update(current, { lang, save: 'idle', saveError: null });
        void runTranslation(current);
      },
    },
    () => (current = null),
  );
  return popup;
}

function update(lookup: Lookup, patch: Partial<PopupState>): void {
  Object.assign(lookup.state, patch);
  if (lookup === current) popup?.render(lookup.state);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function onDoubleClick(e: MouseEvent): void {
  if (popup?.contains(e)) return;
  if (isEditable(e.composedPath()[0] as Node)) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (isEditable(range.startContainer)) return;
  const word = cleanWord(selection.toString());
  if (!word) return;

  // Capture the sentence around the word from its block-level container.
  const block = findBlock(range.startContainer);
  const { text, offset } = textWithOffset(block, range.startContainer, range.startOffset);
  const near = text.indexOf(word, Math.max(0, offset - 2));
  const at = near !== -1 && near - offset < 8 ? near : offset;
  const pageLang = document.documentElement.lang || null;
  const sentence = extractSentence(text, at, pageLang);

  let anchor = range.getBoundingClientRect();
  if (anchor.width === 0 && anchor.height === 0) anchor = new DOMRect(e.clientX, e.clientY, 0, 16);

  const url = new URL(location.href);
  url.hash = '';
  current = {
    sentence,
    url: url.href,
    title: document.title,
    state: {
      word, lang: null, targetLang: settings.targetLang, translation: null, provider: null,
      error: null, loading: true, save: 'idle', saveError: null,
    },
  };
  const lookup = current;
  getPopup().show(anchor, lookup.state);

  void detectLanguage(sentence || word, pageLang).then((lang) => {
    update(lookup, { lang });
    return runTranslation(lookup);
  });
}

async function runTranslation(lookup: Lookup): Promise<void> {
  const { lang, word } = lookup.state;
  if (!lang) {
    update(lookup, { loading: false, error: "Couldn't detect the language — pick it above." });
    return;
  }
  update(lookup, { loading: true, error: null, targetLang: settings.targetLang });
  try {
    const result = await translate(word, lang, settings.targetLang, providerChain(settings.provider));
    if (lookup.state.lang !== lang) return; // language changed while translating
    update(lookup, { translation: result.text, provider: result.provider.label, loading: false });
    if (settings.autoSave) await save(lookup);
  } catch (err) {
    update(lookup, { loading: false, error: errorMessage(err) });
  }
}

async function save(lookup: Lookup): Promise<void> {
  const { state, sentence } = lookup;
  if (!state.lang || !state.translation) return;
  if (state.save !== 'idle' && state.save !== 'error') return;
  update(lookup, { save: 'saving', saveError: null });

  let sentenceTranslation: string | undefined;
  if (settings.translateSentences && sentence && state.lang !== settings.targetLang) {
    try {
      const r = await translate(sentence, state.lang, settings.targetLang, providerChain(settings.provider));
      sentenceTranslation = r.text;
    } catch {
      // The card is still useful without a translated sentence.
    }
  }

  try {
    const result = await send({
      type: 'saveWord',
      input: {
        term: state.word,
        lang: state.lang,
        translation: state.translation,
        example: sentence
          ? { sentence, word: state.word, translation: sentenceTranslation, url: lookup.url, title: lookup.title }
          : undefined,
      },
    });
    update(lookup, { save: result.status });
  } catch (err) {
    update(lookup, { save: 'error', saveError: errorMessage(err) });
  }
}

document.addEventListener('dblclick', onDoubleClick, true);

// Close on outside click or Esc.
document.addEventListener(
  'mousedown',
  (e) => {
    if (popup?.isOpen && !popup.contains(e)) popup.hide();
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && popup?.isOpen) {
      popup.hide();
      e.stopPropagation();
    }
  },
  true,
);
