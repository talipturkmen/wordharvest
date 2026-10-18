// The translation bubble. Rendered inside a closed Shadow DOM so the page's CSS
// can't style it and our CSS can't leak into the page.
import { LANGUAGE_CODES, languageName } from '../shared/languages.ts';
import type { SaveStatus } from '../shared/types.ts';

export interface PopupState {
  word: string;
  lang: string | null;
  targetLang: string;
  translation: string | null;
  provider: string | null;
  error: string | null;
  loading: boolean;
  save: 'idle' | 'saving' | 'error' | SaveStatus;
  saveError: string | null;
}

export interface PopupHandlers {
  onSave(): void;
  onLangChange(lang: string): void;
}

const CSS = `
:host { all: initial; }
.card {
  box-sizing: border-box; width: max-content; min-width: 220px; max-width: 340px;
  padding: 12px 14px; border-radius: 12px;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2330; background: #fff; border: 1px solid #e2e4ec;
  box-shadow: 0 10px 30px rgba(20, 24, 40, .18), 0 2px 6px rgba(20, 24, 40, .08);
  animation: pop .12s ease-out;
}
@keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
.head { display: flex; align-items: center; gap: 8px; }
.word { font-weight: 650; font-size: 16px; overflow-wrap: anywhere; }
select {
  margin-left: auto; font: inherit; font-size: 12px; color: #5b6075; background: #f3f4f8;
  border: 0; border-radius: 6px; padding: 2px 4px; cursor: pointer; max-width: 120px;
}
.close {
  font: inherit; font-size: 18px; line-height: 1; color: #8a8fa3; background: none; border: 0;
  cursor: pointer; padding: 0 2px;
}
.close:hover { color: #1f2330; }
.translation { margin-top: 6px; font-size: 15px; overflow-wrap: anywhere; }
.translation.loading { color: #8a8fa3; }
.translation.error { color: #c0392b; font-size: 13px; }
.foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.via { font-size: 11px; color: #8a8fa3; }
.save {
  margin-left: auto; font: inherit; font-size: 13px; font-weight: 600; color: #fff;
  background: #4f46e5; border: 0; border-radius: 8px; padding: 5px 14px; cursor: pointer;
}
.save:hover { background: #4338ca; }
.save:disabled { cursor: default; background: #a5a1f0; }
.save.done { background: #16a34a; }
.save.err { background: #c0392b; }
.msg { font-size: 12px; color: #c0392b; margin-top: 6px; }
@media (prefers-color-scheme: dark) {
  .card { color: #e8e9f0; background: #20222b; border-color: #343746; }
  select { color: #b4b8c9; background: #2c2f3b; }
  .close:hover { color: #fff; }
  .translation.error, .msg { color: #ff7b6b; }
}
`;

const SAVE_LABEL: Record<PopupState['save'], string> = {
  idle: 'Save',
  saving: 'Saving…',
  created: 'Saved ✓ +1 XP',
  merged: 'Example added ✓',
  duplicate: 'Already saved ✓',
  error: 'Retry',
};

export class WordPopup {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly el: {
    word: HTMLElement; lang: HTMLSelectElement; translation: HTMLElement;
    via: HTMLElement; save: HTMLButtonElement; msg: HTMLElement; close: HTMLButtonElement;
  };

  private readonly onClose: () => void;

  constructor(handlers: PopupHandlers, onClose: () => void) {
    this.onClose = onClose;
    this.host = document.createElement('wordharvest-popup');
    this.root = this.host.attachShadow({ mode: 'closed' });
    this.root.innerHTML = `
      <style>${CSS}</style>
      <div class="card" role="dialog" aria-label="Translation">
        <div class="head">
          <span class="word"></span>
          <select class="lang" title="Source language (change if detected wrong)"></select>
          <button class="close" title="Close (Esc)" aria-label="Close">×</button>
        </div>
        <div class="translation" aria-live="polite"></div>
        <div class="msg" hidden></div>
        <div class="foot"><span class="via"></span><button class="save">Save</button></div>
      </div>`;
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.el = {
      word: q('.word'), lang: q('select'), translation: q('.translation'), via: q('.via'),
      save: q('.save'), msg: q('.msg'), close: q('.close'),
    };

    const unknown = new Option('Language?', '');
    unknown.disabled = true;
    this.el.lang.append(unknown, ...LANGUAGE_CODES.map((c) => new Option(languageName(c), c)));
    this.el.lang.addEventListener('change', () => handlers.onLangChange(this.el.lang.value));
    this.el.save.addEventListener('click', () => handlers.onSave());
    this.el.close.addEventListener('click', () => this.hide());
  }

  get isOpen(): boolean {
    return this.host.isConnected;
  }

  /** True if the event happened inside the popup. */
  contains(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  show(anchor: DOMRect, state: PopupState): void {
    const s = this.host.style;
    for (const [k, v] of Object.entries({
      position: 'absolute', 'z-index': '2147483647', top: '0', left: '0', margin: '0',
      visibility: 'hidden', display: 'block',
    })) {
      s.setProperty(k, v, 'important');
    }
    document.documentElement.append(this.host);
    this.render(state);
    this.place(anchor);
    s.setProperty('visibility', 'visible', 'important');
  }

  hide(): void {
    if (!this.isOpen) return;
    this.host.remove();
    this.onClose();
  }

  render(st: PopupState): void {
    const { el } = this;
    el.word.textContent = st.word;
    if (st.lang && !LANGUAGE_CODES.includes(st.lang as (typeof LANGUAGE_CODES)[number])) {
      el.lang.append(new Option(languageName(st.lang), st.lang));
    }
    el.lang.value = st.lang ?? '';

    el.translation.className = 'translation';
    if (st.loading) {
      el.translation.classList.add('loading');
      el.translation.textContent = 'Translating…';
    } else if (st.error) {
      el.translation.classList.add('error');
      el.translation.textContent = st.error;
    } else {
      el.translation.textContent = st.translation ?? '';
    }

    el.via.textContent = st.provider ? `${languageName(st.targetLang)} · ${st.provider}` : '';

    el.save.textContent = SAVE_LABEL[st.save];
    el.save.className = 'save';
    if (st.save === 'created' || st.save === 'merged' || st.save === 'duplicate') el.save.classList.add('done');
    if (st.save === 'error') el.save.classList.add('err');
    el.save.disabled = st.loading || !!st.error || !st.translation || (st.save !== 'idle' && st.save !== 'error');

    el.msg.hidden = !st.saveError;
    el.msg.textContent = st.saveError ?? '';
  }

  /** Places the popup below the word (or above if there's no room), inside the viewport. */
  private place(anchor: DOMRect): void {
    const card = this.root.querySelector('.card') as HTMLElement;
    const { width, height } = card.getBoundingClientRect();
    const gap = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let top = anchor.bottom + gap;
    if (top + height > vh && anchor.top - gap - height > 0) top = anchor.top - gap - height;
    const left = Math.min(Math.max(gap, anchor.left), Math.max(gap, vw - width - gap));
    // Absolute positioning in document coordinates so the popup scrolls with the word.
    this.host.style.setProperty('top', `${top + window.scrollY}px`, 'important');
    this.host.style.setProperty('left', `${left + window.scrollX}px`, 'important');
  }
}
