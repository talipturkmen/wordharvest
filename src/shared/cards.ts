// Pure card logic: ids, creating, merging re-saved words, validating imports.
import type { Card, Example, SaveStatus, SaveWordInput, SrsState } from './types.ts';
import { newSrs } from './srs.ts';

export const CARD_KEY_PREFIX = 'card:';

export function normalizeTerm(term: string): string {
  return term.normalize('NFC').trim().toLocaleLowerCase();
}

export function cardId(lang: string, term: string): string {
  return `${lang}:${normalizeTerm(term)}`;
}

export function storageKey(id: string): string {
  return CARD_KEY_PREFIX + id;
}

function normalizeSentence(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function hasExample(card: Card, sentence: string): boolean {
  const n = normalizeSentence(sentence);
  return card.examples.some((e) => normalizeSentence(e.sentence) === n);
}

/**
 * Applies a save to an existing card (or creates one). Saving the same word
 * again adds the new sentence as another example instead of duplicating the card.
 */
export function applySave(
  existing: Card | undefined,
  input: SaveWordInput,
  now: number,
): { card: Card; status: SaveStatus } {
  const example: Example | undefined = input.example?.sentence
    ? { ...input.example, addedAt: now }
    : undefined;

  if (!existing) {
    return {
      status: 'created',
      card: {
        id: cardId(input.lang, input.term),
        term: input.term.trim(),
        lang: input.lang,
        translation: input.translation.trim(),
        examples: example ? [example] : [],
        srs: newSrs(now),
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  const fillTranslation = !existing.translation && input.translation;
  if (!example || hasExample(existing, example.sentence)) {
    if (!fillTranslation) return { status: 'duplicate', card: existing };
    return {
      status: 'merged',
      card: { ...existing, translation: input.translation.trim(), updatedAt: now },
    };
  }
  return {
    status: 'merged',
    card: {
      ...existing,
      translation: fillTranslation ? input.translation.trim() : existing.translation,
      examples: [...existing.examples, example],
      updatedAt: now,
    },
  };
}

/** Merges an imported card into an existing one with the same id. */
export function mergeCards(existing: Card, incoming: Card): Card {
  const newer = incoming.updatedAt > existing.updatedAt ? incoming : existing;
  const examples = [...existing.examples];
  for (const ex of incoming.examples) {
    if (!examples.some((e) => normalizeSentence(e.sentence) === normalizeSentence(ex.sentence))) {
      examples.push(ex);
    }
  }
  return {
    ...newer,
    translation: newer.translation || existing.translation || incoming.translation,
    notes: newer.notes || existing.notes || incoming.notes,
    examples,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
  };
}

/** Picks the example to show for a review, rotating through them as the card is learned. */
export function exampleForReview(card: Card): Example | undefined {
  if (card.examples.length === 0) return undefined;
  return card.examples[(card.srs.reps + card.srs.lapses) % card.examples.length];
}

// ---- validation for imported data ------------------------------------------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function sanitizeExample(raw: unknown, now: number): Example | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sentence = str(r.sentence).trim();
  if (!sentence) return null;
  const ex: Example = {
    sentence,
    word: str(r.word),
    url: str(r.url),
    title: str(r.title),
    addedAt: num(r.addedAt, now),
  };
  const translation = str(r.translation).trim();
  if (translation) ex.translation = translation;
  return ex;
}

function sanitizeSrs(raw: unknown, now: number): SrsState {
  const d = newSrs(now);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    due: num(r.due, d.due),
    interval: Math.max(0, num(r.interval, d.interval)),
    ease: Math.max(1.3, num(r.ease, d.ease)),
    reps: Math.max(0, Math.floor(num(r.reps, d.reps))),
    lapses: Math.max(0, Math.floor(num(r.lapses, d.lapses))),
    ...(typeof r.lastReviewed === 'number' ? { lastReviewed: r.lastReviewed } : {}),
  };
}

/** Turns untrusted JSON into a valid Card, or null if it lacks a term/language. */
export function sanitizeCard(raw: unknown, now: number): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const term = str(r.term).trim();
  const lang = str(r.lang).trim();
  if (!term || !lang) return null;
  const examples = Array.isArray(r.examples)
    ? r.examples.map((e) => sanitizeExample(e, now)).filter((e): e is Example => e !== null)
    : [];
  const card: Card = {
    id: cardId(lang, term),
    term,
    lang,
    translation: str(r.translation).trim(),
    examples,
    srs: sanitizeSrs(r.srs, now),
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
  };
  const notes = str(r.notes).trim();
  if (notes) card.notes = notes;
  return card;
}
