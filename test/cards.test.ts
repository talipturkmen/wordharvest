import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySave, cardId, mergeCards, sanitizeCard } from '../src/shared/cards.ts';
import type { SaveWordInput } from '../src/shared/types.ts';

const input = (sentence: string, url = 'https://a.example/1'): SaveWordInput => ({
  term: 'Gato',
  lang: 'es',
  translation: 'cat',
  example: { sentence, word: 'Gato', url, title: 'A' },
});

test('ids are case-insensitive per language', () => {
  assert.equal(cardId('es', ' Gato '), 'es:gato');
  assert.notEqual(cardId('es', 'gato'), cardId('pt', 'gato'));
});

test('first save creates a card with one example', () => {
  const { status, card } = applySave(undefined, input('El gato duerme.'), 1);
  assert.equal(status, 'created');
  assert.equal(card.id, 'es:gato');
  assert.equal(card.examples.length, 1);
  assert.equal(card.srs.due, 1);
});

test('saving the same word from another page adds an example, not a card', () => {
  const first = applySave(undefined, input('El gato duerme.'), 1).card;
  const second = applySave(first, input('Mi gato es negro.', 'https://b.example/'), 2);
  assert.equal(second.status, 'merged');
  assert.equal(second.card.id, first.id);
  assert.deepEqual(second.card.examples.map((e) => e.sentence), ['El gato duerme.', 'Mi gato es negro.']);
  assert.equal(second.card.updatedAt, 2);
});

test('saving the same sentence again is a no-op', () => {
  const first = applySave(undefined, input('El gato duerme.'), 1).card;
  const again = applySave(first, input('El  gato duerme. '), 2);
  assert.equal(again.status, 'duplicate');
  assert.equal(again.card, first);
});

test('mergeCards unions examples and keeps the newer fields', () => {
  const a = applySave(undefined, input('Uno.'), 1).card;
  const b = { ...applySave(undefined, input('Dos.'), 5).card, translation: 'cat (animal)' };
  const m = mergeCards(a, b);
  assert.equal(m.translation, 'cat (animal)');
  assert.equal(m.examples.length, 2);
  assert.equal(m.createdAt, 1);
});

test('sanitizeCard rejects junk and repairs fields', () => {
  assert.equal(sanitizeCard({ term: 'x' }, 0), null);
  assert.equal(sanitizeCard('nope', 0), null);
  const c = sanitizeCard({ term: 'Hund', lang: 'de', examples: [{ sentence: '' }, { sentence: 'Der Hund.' }], srs: { ease: 0.2 } }, 7)!;
  assert.equal(c.id, 'de:hund');
  assert.equal(c.examples.length, 1);
  assert.equal(c.srs.ease, 1.3);
  assert.equal(c.createdAt, 7);
});
