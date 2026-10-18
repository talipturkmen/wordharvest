import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLesson, checkAnswer, clozeParts, distractors, exerciseFor, gradeFor, mulberry32,
  lessonLanguage, pickLessonCards, strength, type Exercise,
} from '../src/shared/exercises.ts';
import { applySave } from '../src/shared/cards.ts';
import { DAY } from '../src/shared/srs.ts';
import type { Card } from '../src/shared/types.ts';

const now = new Date(2026, 5, 1, 12).getTime();
const make = (term: string, translation: string, srs: Partial<Card['srs']> = {}, sentence?: string): Card => {
  const c = applySave(undefined, {
    term, lang: 'es', translation,
    example: sentence ? { sentence, word: term, url: '', title: '' } : undefined,
  }, now - DAY).card;
  return { ...c, srs: { ...c.srs, ...srs } };
};
const learned = (interval: number) => ({ lastReviewed: now - DAY, interval, reps: 2, due: now - 1000 });

const deck = [
  make('gato', 'cat', {}, 'El gato duerme.'),
  make('perro', 'dog', learned(0), 'El perro ladra.'),
  make('casa', 'house', learned(1), 'Mi casa es pequeña.'),
  make('libro', 'book', learned(5), 'Leo un libro.'),
  make('agua', 'water', learned(30)),
];
const rng = () => mulberry32(42);
const noSpeech = () => false;

test('strength follows the review interval', () => {
  assert.deepEqual(deck.map(strength), [0, 1, 2, 3, 5]);
});

test('exercise difficulty grows with strength, with variety per level', () => {
  const allowed: Record<number, string[]> = {
    0: ['choose-translation'],
    1: ['choose-translation', 'sentence-meaning', 'cloze-choose'],
    2: ['cloze-choose', 'choose-word', 'sentence-meaning', 'build-sentence'],
    3: ['cloze-type', 'build-sentence', 'listen-type', 'cloze-choose'],
    5: ['cloze-type', 'listen-type', 'build-sentence', 'type-word'],
  };
  for (const card of deck) {
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => exerciseFor(card, deck, mulberry32(i), noSpeech).kind));
    for (const k of kinds) assert.ok(allowed[strength(card)]!.includes(k), `${card.term} (strength ${strength(card)}): ${k}`);
  }
  // A learning word gets more than one kind of exercise across lessons.
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => exerciseFor(deck[2]!, deck, mulberry32(i), noSpeech).kind));
  assert.ok(kinds.size >= 2, [...kinds].join());
});

test('listening exercises appear only when a voice exists', () => {
  const kinds = new Set(Array.from({ length: 60 }, (_, i) => exerciseFor(deck[3]!, deck, mulberry32(i), () => true).kind));
  assert.ok(kinds.has('listen-type'));
  const none = new Set(Array.from({ length: 60 }, (_, i) => exerciseFor(deck[3]!, deck, mulberry32(i), noSpeech).kind));
  assert.ok(!none.has('listen-type'));
});

test('build-sentence uses translated sentences and its tiles are the words of the sentence', () => {
  const card = { ...make('perro', 'dog', learned(1)), more: { lang: 'en', fetchedAt: 0, sentences: [
    { text: 'Mi perro come mucho.', translation: 'My dog eats a lot.', source: 'tatoeba' as const, id: 1 },
  ] } };
  const found = Array.from({ length: 60 }, (_, i) => exerciseFor(card, [card, ...deck.slice(1)], mulberry32(i), noSpeech))
    .find((e) => e.kind === 'build-sentence');
  assert.ok(found && found.kind === 'build-sentence');
  assert.deepEqual(found.answer, ['Mi', 'perro', 'come', 'mucho']);
  assert.deepEqual([...found.tiles].sort(), [...found.answer].sort());
  assert.equal(found.context.source, 'tatoeba');
});

test('lessonLanguage keeps a lesson to one language', () => {
  const de = [make('Haus', 'house', learned(1)), make('Hund', 'dog', learned(1))].map((c) => ({ ...c, lang: 'de', id: `de:${c.term}` }));
  const cards = [...deck, ...de];
  assert.equal(lessonLanguage(cards, now, 'all', false), 'es');
  assert.equal(lessonLanguage(cards, now, 'de', false), 'de');
  assert.equal(lessonLanguage(cards, now, 'fr', false), null);
  assert.ok(pickLessonCards(cards, now, false, 'de').every((c) => c.lang === 'de'));
});

test('multiple-choice options contain the answer once and no duplicates', () => {
  const ex = exerciseFor(deck[0]!, deck, rng(), noSpeech) as Extract<Exercise, { kind: 'choose-translation' }>;
  assert.equal(ex.options.length, 4);
  assert.equal(ex.options.filter((o) => o === 'cat').length, 1);
  assert.equal(new Set(ex.options).size, 4);
});

test('cloze splits the sentence around the saved word', () => {
  assert.deepEqual(clozeParts('El Gato duerme.', 'gato'), { before: 'El ', answer: 'Gato', after: ' duerme.' });
  assert.equal(clozeParts('Nada aquí.', 'gato'), null);
});

test('distractors skip the answer and case-duplicates', () => {
  assert.deepEqual(distractors('Cat', ['cat', 'dog', 'Dog', 'bird'], 5, rng()).sort(), ['bird', 'dog']);
});

test('a lesson introduces new words before testing them and ends with matching', () => {
  const lesson = buildLesson(deck, deck, rng(), noSpeech);
  const intro = lesson.findIndex((e) => e.kind === 'intro');
  const test = lesson.findIndex((e, i) => i > intro && e.kind !== 'intro' && e.kind !== 'match' && e.card.id === deck[0]!.id);
  assert.ok(intro !== -1 && test > intro);
  assert.equal(lesson.at(-1)!.kind, 'match');
});

test('with a single word there are no options, so the test is typed', () => {
  const lesson = buildLesson([deck[0]!], [deck[0]!], rng(), noSpeech);
  assert.deepEqual(lesson.map((e) => e.kind), ['intro', 'cloze-type']);
});

test('the intro shows every sentence the word is known from', () => {
  const [intro] = buildLesson([deck[0]!], deck, rng(), noSpeech);
  assert.ok(intro && intro.kind === 'intro');
  assert.deepEqual(intro.contexts.map((c) => c.sentence), ['El gato duerme.']);
});

test('pickLessonCards takes due reviews first and limits new words', () => {
  const fresh = Array.from({ length: 10 }, (_, i) => make(`w${i}`, `t${i}`));
  const picked = pickLessonCards([...fresh, deck[1]!, deck[2]!], now, false);
  assert.equal(picked[0]!.term, 'perro');
  assert.equal(picked.filter((c) => strength(c) === 0).length, 4);
});

test('checkAnswer accepts accents and small typos as nearly right', () => {
  assert.equal(checkAnswer(' Gato! ', 'gato'), 'correct');
  assert.equal(checkAnswer('cancion', 'canción'), 'accent');
  assert.equal(checkAnswer('aprovehar', 'aprovechar'), 'typo');
  assert.equal(checkAnswer('gata', 'gato'), 'typo');
  assert.equal(checkAnswer('sol', 'sal'), 'wrong'); // short words must be exact
  assert.equal(checkAnswer('', 'gato'), 'wrong');
});

test('answers map to SM-2 grades', () => {
  assert.equal(gradeFor('wrong', false, deck[1]!), 'again');
  assert.equal(gradeFor('typo', true, deck[1]!), 'hard');
  assert.equal(gradeFor('correct', false, deck[1]!), 'good');
  assert.equal(gradeFor('correct', true, deck[4]!), 'easy');
});
