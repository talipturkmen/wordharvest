// Lesson building: picks cards and turns each into an exercise whose difficulty
// grows with how well the word is known, drawing on every sentence the word
// appears in (see contexts.ts). Pure (randomness is injected) and unit-tested.
import type { Card } from './types.ts';
import type { Grade } from './srs.ts';
import { isDueToday } from './srs.ts';
import { highlightParts } from './highlight.ts';
import { contextsFor, findWord, tokenize, type Context } from './contexts.ts';

export type Rng = () => number;

type WithContext = { context: Context };

export type Exercise =
  /** First meeting with a new word: shown, not tested. */
  | { kind: 'intro'; card: Card; contexts: Context[] }
  /** See (or hear) the word, pick its meaning. */
  | { kind: 'choose-translation'; card: Card; options: string[]; answer: string; listen: boolean }
  /** See the meaning, pick the word. */
  | { kind: 'choose-word'; card: Card; options: string[]; answer: string }
  /** Fill the blank in a sentence from word chips. */
  | ({ kind: 'cloze-choose'; card: Card; before: string; after: string; options: string[]; answer: string } & WithContext)
  /** Type the missing word into a sentence. */
  | ({ kind: 'cloze-type'; card: Card; before: string; after: string; answer: string } & WithContext)
  /** Read a sentence with the word, pick its translation. */
  | ({ kind: 'sentence-meaning'; card: Card; options: string[]; answer: string } & WithContext)
  /** Arrange word tiles to build the sentence for a translation. */
  | ({ kind: 'build-sentence'; card: Card; tiles: string[]; answer: string[] } & WithContext)
  /** Hear the word, type it. */
  | { kind: 'listen-type'; card: Card; answer: string }
  /** Type the word for a given meaning (cards without a usable sentence). */
  | { kind: 'type-word'; card: Card; answer: string }
  /** Bonus round: match words to meanings. Not graded. */
  | { kind: 'match'; cards: Card[] };

export type AnswerResult = 'correct' | 'accent' | 'typo' | 'wrong';

export const LESSON_MAX_CARDS = 8;
export const LESSON_MAX_NEW = 4;

/** 0 = new, 1 = learning, 2–4 = growing, 5 = mastered (interval ≥ 21 days). */
export function strength(card: Card): number {
  const { lastReviewed, interval } = card.srs;
  if (lastReviewed === undefined) return 0;
  if (interval === 0) return 1;
  if (interval < 3) return 2;
  if (interval < 7) return 3;
  if (interval < 21) return 4;
  return 5;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const key = (s: string) => s.trim().toLocaleLowerCase();

/** Up to `n` distinct wrong options, none equal to the answer. */
export function distractors(answer: string, pool: readonly string[], n: number, rng: Rng): string[] {
  const seen = new Set([key(answer)]);
  const out: string[] = [];
  for (const candidate of shuffle(pool, rng)) {
    const k = key(candidate);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(candidate.trim());
    if (out.length === n) break;
  }
  return out;
}

/** Splits a sentence around the first occurrence of `word`, or null if it isn't there. */
export function clozeParts(sentence: string, word: string): { before: string; answer: string; after: string } | null {
  const parts = highlightParts(sentence, word);
  const i = parts.findIndex((p) => p.hit);
  if (i === -1) return null;
  return {
    before: parts.slice(0, i).map((p) => p.text).join(''),
    answer: parts[i]!.text,
    after: parts.slice(i + 1).map((p) => p.text).join(''),
  };
}

const BUILD_MIN_TILES = 3;
const BUILD_MAX_TILES = 9;

/**
 * An exercise for `card`: picks at random among the exercise types that suit
 * its strength and the material available (sentences, translations, voices).
 */
export function exerciseFor(
  card: Card,
  all: readonly Card[],
  rng: Rng,
  canSpeak: (lang: string) => boolean,
  level = strength(card),
): Exercise {
  const others = all.filter((c) => c.id !== card.id);
  const sameLang = others.filter((c) => c.lang === card.lang);
  const meanings = distractors(card.translation, others.map((c) => c.translation), 3, rng);
  const words = distractors(card.term, (sameLang.length >= 3 ? sameLang : others).map((c) => c.term), 3, rng);
  const contexts = shuffle(contextsFor(card, all), rng);
  const speech = canSpeak(card.lang);

  const cloze = contexts
    .map((context) => ({ context, parts: findWord(context.sentence, context.word, card.lang) }))
    .find((c) => c.parts);
  const translated = contexts.find((c) => c.translation);
  const buildable = contexts.find((c) => {
    const n = c.translation ? tokenize(c.sentence, card.lang).length : 0;
    return n >= BUILD_MIN_TILES && n <= BUILD_MAX_TILES;
  });
  // Wrong options for "what does this sentence mean": translations of other sentences.
  const otherSentenceMeanings = others.flatMap((c) => contextsFor(c, all).map((x) => x.translation ?? ''));

  const make: Record<string, (() => Exercise) | null> = {
    chooseTranslation: meanings.length
      ? () => ({ kind: 'choose-translation', card, answer: card.translation, options: shuffle([card.translation, ...meanings], rng), listen: false })
      : null,
    listen: meanings.length && speech
      ? () => ({ kind: 'choose-translation', card, answer: card.translation, options: shuffle([card.translation, ...meanings], rng), listen: true })
      : null,
    chooseWord: words.length
      ? () => ({ kind: 'choose-word', card, answer: card.term, options: shuffle([card.term, ...words], rng) })
      : null,
    clozeChoose: cloze && words.length
      ? () => {
          const { before, answer, after } = cloze.parts!;
          return { kind: 'cloze-choose', card, context: cloze.context, before, after, answer, options: shuffle([answer, ...distractors(answer, words, 3, rng)], rng) };
        }
      : null,
    clozeType: cloze
      ? () => ({ kind: 'cloze-type', card, context: cloze.context, before: cloze.parts!.before, after: cloze.parts!.after, answer: cloze.parts!.answer })
      : null,
    sentenceMeaning: translated && distractors(translated.translation!, otherSentenceMeanings, 2, rng).length >= 2
      ? () => {
          const wrong = distractors(translated.translation!, otherSentenceMeanings, 3, rng);
          return { kind: 'sentence-meaning', card, context: translated, answer: translated.translation!, options: shuffle([translated.translation!, ...wrong], rng) };
        }
      : null,
    buildSentence: buildable
      ? () => {
          const answer = tokenize(buildable.sentence, card.lang);
          return { kind: 'build-sentence', card, context: buildable, answer, tiles: shuffle(answer, rng) };
        }
      : null,
    listenType: speech ? () => ({ kind: 'listen-type', card, answer: card.term }) : null,
  };

  const byLevel: string[][] = [
    ['chooseTranslation'],
    ['chooseTranslation', 'listen', 'sentenceMeaning', 'clozeChoose'],
    ['clozeChoose', 'chooseWord', 'sentenceMeaning', 'buildSentence'],
    ['clozeType', 'buildSentence', 'listenType', 'clozeChoose'],
    ['clozeType', 'buildSentence', 'listenType', 'sentenceMeaning'],
    ['clozeType', 'listenType', 'buildSentence'],
  ];
  const options = byLevel[Math.min(level, 5)]!.map((k) => make[k]).filter((f): f is () => Exercise => !!f);
  if (options.length) return options[Math.floor(rng() * options.length)]!();
  // Fallbacks when there's little material (few saved words, no sentences):
  // known words are typed; new ones get multiple choice when possible.
  const typeWord = (): Exercise => ({ kind: 'type-word', card, answer: card.term });
  if (level >= 3) return (make.clozeType ?? typeWord)();
  return (make.clozeType ?? make.chooseTranslation ?? typeWord)();
}

/** A simpler re-test for a word answered wrong (shown again at the end of the lesson). */
export function retryFor(card: Card, all: readonly Card[], rng: Rng): Exercise {
  return exerciseFor(card, all, rng, () => false, Math.min(strength(card), 2));
}

/** Cards for practice when nothing is due: weakest and longest-unseen first. */
export function weakestCards(cards: readonly Card[], n: number): Card[] {
  return [...cards]
    .sort((a, b) => strength(a) - strength(b) || (a.srs.lastReviewed ?? 0) - (b.srs.lastReviewed ?? 0))
    .slice(0, n);
}

/**
 * The language a lesson uses: the chosen one, or (for "all") the language with
 * the most due words, so a lesson never mixes languages.
 */
export function lessonLanguage(cards: readonly Card[], now: number, active: string, practice: boolean): string | null {
  const eligible = cards.filter((c) => (practice ? strength(c) > 0 : isDueToday(c.srs, now)));
  if (active !== 'all') return eligible.some((c) => c.lang === active) ? active : null;
  const counts = new Map<string, number>();
  for (const c of eligible) counts.set(c.lang, (counts.get(c.lang) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function pickLessonCards(cards: readonly Card[], now: number, practice: boolean, lang?: string | null): Card[] {
  const pool = lang ? cards.filter((c) => c.lang === lang) : cards;
  if (practice) return weakestCards(pool.filter((c) => strength(c) > 0), LESSON_MAX_CARDS);
  const due = pool.filter((c) => isDueToday(c.srs, now)).sort((a, b) => a.srs.due - b.srs.due);
  const reviews = due.filter((c) => strength(c) > 0);
  const fresh = due.filter((c) => strength(c) === 0).slice(0, LESSON_MAX_NEW);
  // Reviews first so new words never crowd out what you're about to forget.
  return [...reviews, ...fresh].slice(0, LESSON_MAX_CARDS);
}

export function buildLesson(picked: readonly Card[], all: readonly Card[], rng: Rng, canSpeak: (lang: string) => boolean): Exercise[] {
  const out: Exercise[] = [];
  const pendingTests: Exercise[] = [];
  for (const card of shuffle(picked, rng)) {
    if (strength(card) === 0) {
      out.push({ kind: 'intro', card, contexts: contextsFor(card, all) });
      pendingTests.push(exerciseFor(card, all, rng, canSpeak));
    } else {
      out.push(exerciseFor(card, all, rng, canSpeak));
    }
    // Test new words a little later, not straight after the intro.
    if (pendingTests.length > 0 && out.length % 2 === 0 && out[out.length - 1]!.kind !== 'intro') {
      out.push(pendingTests.shift()!);
    }
  }
  out.push(...pendingTests);
  const distinctMeanings = new Set(picked.map((c) => key(c.translation)));
  if (picked.length >= 4 && distinctMeanings.size >= 4) {
    out.push({ kind: 'match', cards: shuffle(picked, rng).slice(0, 5) });
  }
  return out;
}

// ---- checking typed answers -------------------------------------------------------

const normalize = (s: string) =>
  s.normalize('NFC').toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

export function checkAnswer(input: string, expected: string): AnswerResult {
  const a = normalize(input);
  const e = normalize(expected);
  if (!a) return 'wrong';
  if (a === e) return 'correct';
  if (stripMarks(a) === stripMarks(e)) return 'accent';
  if (e.length >= 4 && levenshtein(a, e) <= (e.length >= 8 ? 2 : 1)) return 'typo';
  return 'wrong';
}

/** How an answer feeds the spaced-repetition schedule. */
export function gradeFor(result: AnswerResult, typed: boolean, card: Card): Grade {
  if (result === 'wrong') return 'again';
  if (result !== 'correct') return 'hard';
  return typed && strength(card) >= 4 ? 'easy' : 'good';
}
