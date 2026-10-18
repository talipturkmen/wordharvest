import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextsFor, findWord, tokenize } from '../src/shared/contexts.ts';
import { parseTatoeba, tatoebaUrl } from '../src/shared/tatoeba.ts';
import { applySave } from '../src/shared/cards.ts';

const card = (term: string, translation: string, sentence: string, lang = 'es') =>
  applySave(undefined, { term, lang, translation, example: { sentence, word: term, url: 'https://x/', title: 'X', translation: `${translation}!` } }, 0).card;

test('findWord matches whole words only (except in languages without spaces)', () => {
  assert.equal(findWord('Los gatos duermen.', 'gato', 'es'), null);
  assert.deepEqual(findWord('¡Gato, ven!', 'gato', 'es'), { before: '¡', answer: 'Gato', after: ', ven!' });
  assert.ok(findWord('猫が寝ています。', '猫', 'ja'));
});

test('contexts come from the saved sentence, other reading and Tatoeba, without duplicates', () => {
  const gato = { ...card('gato', 'cat', 'El gato duerme.'), more: { lang: 'en', fetchedAt: 0, sentences: [
    { text: 'Tengo un gato negro.', translation: 'I have a black cat.', source: 'tatoeba' as const, id: 42, author: 'ana' },
    { text: 'El gato duerme.', source: 'tatoeba' as const, id: 43 },
  ] } };
  const other = card('perro', 'dog', 'El perro y el gato juegan.');
  const german = card('Katze', 'cat', 'Die Katze und el gato.', 'de');
  const ctx = contextsFor(gato, [gato, other, german]);
  assert.deepEqual(ctx.map((c) => [c.source, c.sentence]), [
    ['saved', 'El gato duerme.'],
    ['reading', 'El perro y el gato juegan.'],
    ['tatoeba', 'Tengo un gato negro.'],
  ]);
  assert.equal(ctx[2]!.ref, 'https://tatoeba.org/en/sentences/show/42');
  assert.match(ctx[2]!.credit!, /Tatoeba · ana · CC BY 2\.0 FR/);
});

test('tokenize splits into words without punctuation', () => {
  assert.deepEqual(tokenize('¡Hola, mundo!', 'es'), ['Hola', 'mundo']);
  assert.ok(tokenize('猫が寝ています。', 'ja').length > 1);
});

test('tatoebaUrl uses ISO 639-3 codes and exact-word search', () => {
  const url = new URL(tatoebaUrl('gato', 'es', 'en', true)!);
  assert.equal(url.searchParams.get('lang'), 'spa');
  assert.equal(url.searchParams.get('trans:lang'), 'eng');
  assert.equal(url.searchParams.get('q'), '=gato');
  assert.equal(tatoebaUrl('x', 'xx', 'en', true), null);
});

test('parseTatoeba keeps short approved sentences containing the word, translated ones first', () => {
  const json = { data: [
    { id: 1, text: 'Un gato.', owner: 'a', translations: [] },
    { id: 2, text: 'Mi gato es negro.', owner: 'b', translations: [
      { text: 'Il mio gatto.', lang: 'ita', is_direct: true },
      { text: 'My cat is black.', lang: 'eng', is_direct: true },
    ] },
    { id: 3, text: 'Los gatos.', translations: [] },
    { id: 4, text: 'Gato malo.', is_unapproved: true },
    { id: 5, text: `El gato ${'muy '.repeat(40)}largo.` },
  ] };
  const out = parseTatoeba(json, 'gato', 'es', 'en');
  assert.deepEqual(out.map((s) => s.id), [2, 1]);
  assert.equal(out[0]!.translation, 'My cat is black.');
  assert.deepEqual(parseTatoeba({ nope: 1 }, 'gato', 'es', 'en'), []);
});
