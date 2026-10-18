// Every sentence a word can be practised in: the ones the user saved it from,
// other saved sentences that happen to contain it, and extra sentences from
// Tatoeba. Pure and unit-tested.
import type { Card } from './types.ts';
import { highlightParts } from './highlight.ts';

export interface Context {
  sentence: string;
  /** The word's form in this sentence. */
  word: string;
  translation?: string;
  source: 'saved' | 'reading' | 'tatoeba';
  /** Link for attribution (page URL or Tatoeba sentence). */
  ref?: string;
  /** Attribution text, e.g. "Tatoeba · user · CC BY 2.0 FR". */
  credit?: string;
}

/** Languages written without spaces between words. */
const NO_SPACES = new Set(['ja', 'zh', 'zh-Hant', 'th']);

/**
 * Finds `word` in `sentence` as a whole word (not inside a longer word),
 * case-insensitively. Returns the text before, the matched form, and after.
 */
export function findWord(sentence: string, word: string, lang: string): { before: string; answer: string; after: string } | null {
  const parts = highlightParts(sentence, word);
  let offset = 0;
  for (const [i, p] of parts.entries()) {
    if (p.hit) {
      const prev = sentence[offset - 1] ?? '';
      const next = sentence[offset + p.text.length] ?? '';
      const isLetter = (c: string) => /[\p{L}\p{M}\p{N}]/u.test(c);
      if (NO_SPACES.has(lang) || (!isLetter(prev) && !isLetter(next))) {
        return {
          before: parts.slice(0, i).map((x) => x.text).join(''),
          answer: p.text,
          after: parts.slice(i + 1).map((x) => x.text).join(''),
        };
      }
    }
    offset += p.text.length;
  }
  return null;
}

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export function contextsFor(card: Card, all: readonly Card[]): Context[] {
  const out: Context[] = [];
  const seen = new Set<string>();
  const add = (c: Context) => {
    const k = norm(c.sentence);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  for (const ex of card.examples) {
    const found = findWord(ex.sentence, ex.word || card.term, card.lang) ?? findWord(ex.sentence, card.term, card.lang);
    if (found) add({ sentence: ex.sentence, word: found.answer, translation: ex.translation, source: 'saved', ref: ex.url || undefined });
  }
  for (const other of all) {
    if (other.id === card.id || other.lang !== card.lang) continue;
    for (const ex of other.examples) {
      const found = findWord(ex.sentence, card.term, card.lang);
      if (found) add({ sentence: ex.sentence, word: found.answer, translation: ex.translation, source: 'reading', ref: ex.url || undefined });
    }
  }
  for (const s of card.more?.sentences ?? []) {
    const found = findWord(s.text, card.term, card.lang);
    if (found) {
      add({
        sentence: s.text, word: found.answer, translation: s.translation, source: 'tatoeba',
        ref: `https://tatoeba.org/en/sentences/show/${s.id}`,
        credit: `Tatoeba${s.author ? ` · ${s.author}` : ''} · CC BY 2.0 FR`,
      });
    }
  }
  return out;
}

/** Splits a sentence into word tiles (no punctuation), locale-aware for languages without spaces. */
export function tokenize(sentence: string, lang: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const seg = new Intl.Segmenter(lang, { granularity: 'word' });
      return [...seg.segment(sentence)].filter((s) => s.isWordLike).map((s) => s.segment);
    } catch {
      // fall through
    }
  }
  return sentence.split(/\s+/).map((w) => w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')).filter(Boolean);
}
