// CSV import/export: a lossless format (one row per example) and an Anki-ready export.
import type { Card } from './types.ts';
import { applySave, cardId, sanitizeCard } from './cards.ts';
import { escapeHtml, highlightHtml } from './highlight.ts';

/** RFC 4180 serialization. */
export function toCsv(rows: readonly (readonly string[])[], sep = ','): string {
  const needsQuote = new RegExp(`["\\r\\n${sep === '\t' ? '\\t' : sep}]`);
  const cell = (v: string) => (needsQuote.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}

/** RFC 4180 parsing (quoted fields, escaped quotes, CRLF/LF, embedded newlines). */
export function parseCsv(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // skip BOM

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export const CSV_COLUMNS = [
  'term', 'translation', 'language', 'sentence', 'sentence_translation', 'word',
  'url', 'title', 'notes', 'added_at', 'due', 'interval', 'ease', 'reps', 'lapses',
] as const;

const iso = (t: number) => new Date(t).toISOString();

/** Lossless CSV: one row per example (cards without examples get one row). */
export function cardsToCsv(cards: readonly Card[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const c of cards) {
    const examples = c.examples.length > 0 ? c.examples : [undefined];
    for (const e of examples) {
      rows.push([
        c.term, c.translation, c.lang,
        e?.sentence ?? '', e?.translation ?? '', e?.word ?? '', e?.url ?? '', e?.title ?? '',
        c.notes ?? '', iso(e?.addedAt ?? c.createdAt), iso(c.srs.due),
        String(c.srs.interval), String(c.srs.ease), String(c.srs.reps), String(c.srs.lapses),
      ]);
    }
  }
  return toCsv(rows);
}

/** Parses the lossless CSV back into cards. Rows of the same term+language are merged. */
export function csvToCards(text: string, now: number): Card[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  if (!col.has('term') || !col.has('translation')) {
    throw new Error('CSV must have at least "term" and "translation" columns.');
  }
  const get = (r: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? '' : (r[i] ?? '').trim();
  };
  const time = (v: string, fallback: number) => {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : fallback;
  };

  const byId = new Map<string, Card>();
  for (const r of rows) {
    const term = get(r, 'term');
    if (!term) continue;
    const lang = get(r, 'language') || 'und';
    const id = cardId(lang, term);
    const addedAt = time(get(r, 'added_at'), now);
    const sentence = get(r, 'sentence');
    const { card } = applySave(
      byId.get(id),
      {
        term,
        lang,
        translation: get(r, 'translation'),
        example: sentence
          ? {
              sentence,
              word: get(r, 'word') || term,
              translation: get(r, 'sentence_translation') || undefined,
              url: get(r, 'url'),
              title: get(r, 'title'),
            }
          : undefined,
      },
      addedAt,
    );
    if (!byId.has(id)) {
      // First row of this card carries its notes and scheduling.
      const raw = {
        ...card,
        notes: get(r, 'notes'),
        createdAt: addedAt,
        srs: {
          due: time(get(r, 'due'), now),
          interval: Number(get(r, 'interval')) || 0,
          ease: Number(get(r, 'ease')) || 2.5,
          reps: Number(get(r, 'reps')) || 0,
          lapses: Number(get(r, 'lapses')) || 0,
        },
      };
      byId.set(id, sanitizeCard(raw, now)!);
    } else {
      byId.set(id, card);
    }
  }
  return [...byId.values()];
}

/**
 * Anki CSV (Anki ≥ 2.1.55 reads the `#` header lines; choose the "Basic" note type).
 * Front: word + example sentence(s) with the word in bold. Back: translation (+ sentence translation).
 */
export function cardsToAnkiCsv(cards: readonly Card[]): string {
  const rows = cards.map((c) => {
    const ex = c.examples[c.examples.length - 1];
    const front = [`<b>${escapeHtml(c.term)}</b>`];
    if (ex) front.push(`<br><br>${highlightHtml(ex.sentence, ex.word || c.term)}`);
    const back = [escapeHtml(c.translation)];
    if (ex?.translation) back.push(`<br><br><i>${escapeHtml(ex.translation)}</i>`);
    if (c.notes) back.push(`<br><br>${escapeHtml(c.notes)}`);
    const tags = ['wordharvest', `lang::${c.lang}`].join(' ');
    return [front.join(''), back.join(''), tags];
  });
  const header = '#separator:Comma\r\n#html:true\r\n#columns:Front,Back,Tags\r\n#tags column:3\r\n';
  return header + toCsv(rows);
}
