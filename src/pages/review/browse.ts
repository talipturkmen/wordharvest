// Browse & search saved cards.
import type { Card } from '../../shared/types.ts';
import { getAllCards } from '../../shared/storage.ts';
import { formatDays, isDueToday, startOfDay, DAY } from '../../shared/srs.ts';
import { languageName } from '../../shared/languages.ts';
import { $, h, renderHighlighted } from '../dom.ts';
import { openEditor } from './editor.ts';
import { strength } from '../../shared/exercises.ts';

const PAGE = 100;
let all: Card[] = [];
let limit = PAGE;

const search = $<HTMLInputElement>('search');
const sort = $<HTMLSelectElement>('sort');

export async function loadBrowse(): Promise<void> {
  all = await getAllCards();
  render();
}

function matches(c: Card, q: string): boolean {
  if (!q) return true;
  const hay = [c.term, c.translation, c.notes ?? '', ...c.examples.flatMap((e) => [e.sentence, e.translation ?? '', e.title])]
    .join('\n')
    .toLocaleLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function sorted(cards: Card[]): Card[] {
  switch (sort.value) {
    case 'alpha':
      return cards.sort((a, b) => a.term.localeCompare(b.term));
    case 'due':
      return cards.sort((a, b) => a.srs.due - b.srs.due);
    default:
      return cards.sort((a, b) => b.createdAt - a.createdAt);
  }
}

function dueLabel(c: Card, now: number): HTMLElement {
  if (!c.srs.lastReviewed) return h('span', { class: 'due', text: 'new' });
  if (isDueToday(c.srs, now)) return h('span', { class: 'due', text: 'due today' });
  return h('span', { text: `in ${formatDays(Math.round((startOfDay(c.srs.due) - startOfDay(now)) / DAY))}` });
}

function strengthBars(c: Card): HTMLElement {
  const s = strength(c);
  const label = s === 0 ? 'New' : s === 5 ? 'Mastered' : `Strength ${s}/5`;
  return h('span', { class: `strength s${s}`, title: label, 'aria-label': label },
    ...Array.from({ length: 5 }, (_, i) => h('i', { class: i < s ? 'on' : '' })));
}

function item(c: Card, now: number): HTMLLIElement {
  const latest = c.examples[c.examples.length - 1];
  const ex = h('div', { class: 'ex' });
  if (latest) renderHighlighted(ex, latest.sentence, latest.word || c.term);
  const li = h(
    'li',
    { class: 'card-item', tabindex: '0', role: 'button' },
    h('div', { class: 't' }, c.term, h('span', { class: 'badge', title: languageName(c.lang), text: c.lang }), ' ', h('span', { class: 'tr', text: `— ${c.translation}` })),
    h('div', { class: 'meta' }, strengthBars(c), dueLabel(c, now), c.examples.length > 1 ? ` · ${c.examples.length} examples` : ''),
    latest ? ex : null,
  );
  const edit = async () => {
    if ((await openEditor(c)) !== undefined) await loadBrowse();
  };
  li.addEventListener('click', edit);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void edit();
  });
  return li;
}

function render(): void {
  const now = Date.now();
  const q = search.value.trim().toLocaleLowerCase();
  const list = sorted(all.filter((c) => matches(c, q)));
  $('count').textContent = q ? `${list.length} of ${all.length}` : `${all.length} card${all.length === 1 ? '' : 's'}`;
  $('card-list').replaceChildren(...list.slice(0, limit).map((c) => item(c, now)));
  $('more').hidden = list.length <= limit;

  const empty = $('browse-empty');
  empty.hidden = list.length > 0;
  empty.replaceChildren(
    all.length === 0
      ? h('p', { class: 'muted', text: 'No saved words yet. Double-click a word on any web page to get started.' })
      : h('p', { class: 'muted', text: 'No cards match your search.' }),
  );
}

search.addEventListener('input', () => {
  limit = PAGE;
  render();
});
sort.addEventListener('change', render);
$('more').addEventListener('click', () => {
  limit += PAGE;
  render();
});
