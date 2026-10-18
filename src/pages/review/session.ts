// Review session: shows due cards one at a time and grades them (SM-2).
import type { Card } from '../../shared/types.ts';
import { getAllCards, putCards } from '../../shared/storage.ts';
import { endOfDay, GRADES, intervalLabel, isDueToday, schedule, type Grade } from '../../shared/srs.ts';
import { exampleForReview } from '../../shared/cards.ts';
import { languageName } from '../../shared/languages.ts';
import { $, h, hostname, renderHighlighted } from '../dom.ts';
import { openEditor } from './editor.ts';

let queue: Card[] = [];
let card: Card | undefined;
let revealed = false;
let reviewed = 0;

export function inSession(): boolean {
  return card !== undefined;
}

/** Loads due cards. `fresh: false` keeps the "reviewed" count (used when refreshing after storage changes). */
export async function startSession(fresh = true): Promise<void> {
  const now = Date.now();
  const all = await getAllCards();
  queue = all.filter((c) => isDueToday(c.srs, now)).sort((a, b) => a.srs.due - b.srs.due);
  if (fresh) reviewed = 0;
  next(all);
}

function next(all?: Card[]): void {
  card = queue.shift();
  revealed = false;
  render(all);
}

function render(all?: Card[]): void {
  const hasCard = card !== undefined;
  $('rv-card').hidden = !hasCard;
  $('rv-actions').hidden = !hasCard;
  $('rv-edit').hidden = !hasCard;
  $('rv-empty').hidden = hasCard;
  $('rv-left').textContent = hasCard ? `${queue.length + 1} left` : '';
  $('rv-done').textContent = reviewed > 0 ? `${reviewed} reviewed` : '';

  if (!card) {
    void renderEmpty(all);
    return;
  }

  const example = exampleForReview(card);
  $('rv-term').textContent = card.term;
  $('rv-lang').textContent = card.lang;
  $('rv-lang').title = languageName(card.lang);
  const sentence = $('rv-sentence');
  sentence.hidden = !example;
  if (example) renderHighlighted(sentence, example.sentence, example.word || card.term);

  $('rv-back').hidden = !revealed;
  $('rv-show').hidden = revealed;
  $('rv-grades').hidden = !revealed;
  if (!revealed) {
    $('rv-show').focus();
    return;
  }

  $('rv-translation').textContent = card.translation || '(no translation)';
  const tr = $('rv-sentence-tr');
  tr.textContent = example?.translation ?? '';
  tr.hidden = !example?.translation;
  const notes = $('rv-notes');
  notes.textContent = card.notes ?? '';
  notes.hidden = !card.notes;

  const source = $('rv-source');
  source.replaceChildren();
  if (example?.url) {
    source.append(
      'From ',
      h('a', { href: example.url, target: '_blank', rel: 'noopener', text: example.title || hostname(example.url) }),
      ` · ${hostname(example.url)}`,
    );
  }
  if (card.examples.length > 1) {
    source.append(`${example?.url ? ' · ' : ''}${card.examples.length} examples saved`);
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#rv-grades [data-grade]')) {
    btn.querySelector('small')!.textContent = intervalLabel(card.srs, btn.dataset.grade as Grade);
  }
}

async function renderEmpty(all?: Card[]): Promise<void> {
  const cards = all ?? (await getAllCards());
  const box = $('rv-empty');
  if (cards.length === 0) {
    box.replaceChildren(
      h('div', { class: 'big', text: '📖' }),
      h('h2', { text: 'Welcome to WordHarvest' }),
      h(
        'ol',
        {},
        h('li', { text: 'Open any article in a language you are learning.' }),
        h('li', { text: 'Double-click a word you don’t know to see its translation.' }),
        h('li', { text: 'Click Save — the word and its sentence become a flashcard.' }),
        h('li', { text: 'Come back here to review your cards when they are due.' }),
      ),
      h('p', { class: 'muted' }, 'Tip: choose your language and turn on auto-save in ', h('a', { href: 'options.html', text: 'Settings' }), '.'),
    );
    return;
  }
  const later = cards.map((c) => c.srs.due).filter((d) => d > endOfDay(Date.now()));
  const nextDue = later.length ? new Date(Math.min(...later)) : null;
  box.replaceChildren(
    h('div', { class: 'big', text: '🎉' }),
    h('h2', { text: reviewed > 0 ? `Done! You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}.` : 'All caught up' }),
    h(
      'p',
      { class: 'muted' },
      `${cards.length} word${cards.length === 1 ? '' : 's'} saved.`,
      nextDue ? ` Next review: ${nextDue.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}.` : '',
    ),
    h('a', { class: 'btn', href: '#browse', text: 'Browse cards' }),
  );
}

export function reveal(): void {
  if (!card || revealed) return;
  revealed = true;
  render();
}

async function grade(g: Grade): Promise<void> {
  if (!card || !revealed) return;
  const now = Date.now();
  const updated: Card = { ...card, srs: schedule(card.srs, g, now), updatedAt: now };
  await putCards([updated]);
  reviewed++;
  if (g === 'again') queue.push(updated);
  next();
}

export async function editCurrent(): Promise<void> {
  if (!card) return;
  const result = await openEditor(card);
  if (result === undefined) return;
  if (result === null) next();
  else {
    card = result;
    render();
  }
}

export function handleKey(e: KeyboardEvent): void {
  if (!card) return;
  if ((e.key === ' ' || e.key === 'Enter') && !revealed) {
    e.preventDefault();
    reveal();
  } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
    void grade(GRADES[Number(e.key) - 1]!);
  } else if (e.key === 'e' || e.key === 'E') {
    void editCurrent();
  }
}

$('rv-show').addEventListener('click', reveal);
$('rv-edit').addEventListener('click', () => void editCurrent());
for (const btn of document.querySelectorAll<HTMLButtonElement>('#rv-grades [data-grade]')) {
  btn.addEventListener('click', () => void grade(btn.dataset.grade as Grade));
  btn.append(h('kbd', { text: String(GRADES.indexOf(btn.dataset.grade as Grade) + 1) }));
}
