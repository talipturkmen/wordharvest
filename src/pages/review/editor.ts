// Card editor dialog, shared by the review and browse views.
import type { Card, Example } from '../../shared/types.ts';
import { deleteCards, saveEditedCard } from '../../shared/storage.ts';
import { newSrs } from '../../shared/srs.ts';
import { LANGUAGE_CODES, languageName } from '../../shared/languages.ts';
import { $, h, hostname } from '../dom.ts';

/** Resolves with the saved card, null if deleted, or undefined if cancelled. */
export type EditResult = Card | null | undefined;

const dialog = $<HTMLDialogElement>('editor');
const form = $<HTMLFormElement>('editor-form');
const field = <T extends HTMLElement>(name: string) => form.elements.namedItem(name) as unknown as T;

let editing: { card: Card; examples: Example[]; resetSrs: boolean; resolve: (r: EditResult) => void } | null = null;

function renderExamples(): void {
  const list = $('ed-examples');
  if (!editing) return;
  const { examples } = editing;
  if (examples.length === 0) {
    list.replaceChildren(h('p', { class: 'muted', text: 'No example sentences.' }));
    return;
  }
  list.replaceChildren(
    ...examples.map((ex, i) => {
      const sentence = h('textarea', { rows: '2', 'aria-label': 'Sentence' });
      sentence.value = ex.sentence;
      sentence.addEventListener('input', () => (ex.sentence = sentence.value));
      const tr = h('input', { type: 'text', placeholder: 'Sentence translation (optional)', 'aria-label': 'Sentence translation' });
      tr.value = ex.translation ?? '';
      tr.addEventListener('input', () => (ex.translation = tr.value));
      const remove = h('button', { type: 'button', class: 'btn link', text: 'Remove' });
      remove.addEventListener('click', () => {
        examples.splice(i, 1);
        renderExamples();
      });
      const source = ex.url
        ? h('a', { href: ex.url, target: '_blank', rel: 'noopener', title: ex.url, text: ex.title || hostname(ex.url) })
        : h('span', { text: 'No source' });
      return h('div', { class: 'example-edit' }, sentence, tr, h('div', { class: 'src' }, source, remove));
    }),
  );
}

export function openEditor(card: Card): Promise<EditResult> {
  editing?.resolve(undefined);
  return new Promise((resolve) => {
    editing = { card, examples: card.examples.map((e) => ({ ...e })), resetSrs: false, resolve };

    const lang = field<HTMLSelectElement>('lang');
    const codes: string[] = [...LANGUAGE_CODES];
    if (!codes.includes(card.lang)) codes.unshift(card.lang);
    lang.replaceChildren(...codes.map((c) => new Option(languageName(c), c)));
    lang.value = card.lang;
    field<HTMLInputElement>('term').value = card.term;
    field<HTMLInputElement>('translation').value = card.translation;
    field<HTMLTextAreaElement>('notes').value = card.notes ?? '';
    $('ed-meta').textContent =
      `Added ${new Date(card.createdAt).toLocaleDateString()} · reviewed ${card.srs.reps} time(s) in a row · ` +
      `${card.srs.lapses} lapse(s) · next due ${new Date(card.srs.due).toLocaleDateString()}`;
    $('ed-reset').textContent = 'Reset progress';
    renderExamples();
    dialog.showModal();
  });
}

function finish(result: EditResult): void {
  const current = editing;
  editing = null;
  dialog.close();
  current?.resolve(result);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editing) return;
  const { card, examples, resetSrs } = editing;
  const next: Card = {
    ...card,
    term: field<HTMLInputElement>('term').value.trim(),
    lang: field<HTMLSelectElement>('lang').value,
    translation: field<HTMLInputElement>('translation').value.trim(),
    examples: examples
      .map((ex) => ({ ...ex, sentence: ex.sentence.trim(), translation: ex.translation?.trim() || undefined }))
      .filter((ex) => ex.sentence),
    srs: resetSrs ? newSrs(Date.now()) : card.srs,
  };
  const notes = field<HTMLTextAreaElement>('notes').value.trim();
  if (notes) next.notes = notes;
  else delete next.notes;
  if (!next.term) return;
  finish(await saveEditedCard(card.id, next));
});

$('ed-cancel').addEventListener('click', () => finish(undefined));
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  finish(undefined);
});

$('ed-reset').addEventListener('click', () => {
  if (!editing) return;
  editing.resetSrs = true;
  $('ed-reset').textContent = 'Progress will reset on save';
});

$('ed-delete').addEventListener('click', async () => {
  if (!editing) return;
  if (!confirm(`Delete “${editing.card.term}” and its ${editing.card.examples.length} example(s)?`)) return;
  await deleteCards([editing.card.id]);
  finish(null);
});

export function isEditorOpen(): boolean {
  return dialog.open;
}
