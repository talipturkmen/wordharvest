import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLesson, checkAnswer, clozeParts, distractors, exerciseFor, gradeFor, mulberry32,
  pickLessonCards, strength, type Exercise,
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

test('exercise difficulty grows with strength', () => {
  const kinds = deck.map((c) => exerciseFor(c, deck, rng(), noSpeech).kind);
  assert.deepEqual(kinds, ['choose-translation', 'choose-translation', 'cloze-choose', 'cloze-type', 'type-word']);
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
