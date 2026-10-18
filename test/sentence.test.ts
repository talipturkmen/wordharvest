import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWord, extractSentence, segmentWithRegex } from '../src/content/sentence.ts';
import { highlightParts } from '../src/shared/highlight.ts';
import { normalizeLang } from '../src/shared/languages.ts';

const text = 'Primera frase aquí. El perro corre rápido por el parque! ¿Vienes mañana?';

test('extractSentence returns the sentence containing the offset', () => {
  assert.equal(extractSentence(text, text.indexOf('perro'), 'es'), 'El perro corre rápido por el parque!');
  assert.equal(extractSentence(text, 0, 'es'), 'Primera frase aquí.');
  assert.equal(extractSentence(text, text.indexOf('mañana'), 'es'), '¿Vienes mañana?');
});

test('regex fallback splits on . ! ? and CJK punctuation', () => {
  assert.equal(segmentWithRegex(text, text.indexOf('perro')).trim(), 'El perro corre rápido por el parque!');
  const ja = '今日は晴れです。猫が寝ています。';
  assert.equal(segmentWithRegex(ja, ja.indexOf('猫')), '猫が寝ています。');
});

test('extractSentence collapses whitespace and clamps run-on text around the word', () => {
  assert.equal(extractSentence('  Hola\n\n   mundo  ', 3, 'es'), 'Hola mundo');
  const long = `${'palabra '.repeat(200)}objetivo ${'palabra '.repeat(200)}`;
  const s = extractSentence(long, long.indexOf('objetivo'), 'es');
  assert.ok(s.length <= 410, `length ${s.length}`);
  assert.ok(s.includes('objetivo'));
  assert.ok(s.startsWith('…') && s.endsWith('…'));
});

test('cleanWord strips punctuation and rejects non-words', () => {
  assert.equal(cleanWord(' «Hola», '), 'Hola');
  assert.equal(cleanWord('l’homme'), 'l’homme');
  assert.equal(cleanWord('1234'), null);
  assert.equal(cleanWord('   '), null);
  assert.equal(cleanWord('a whole lot of words here'), null);
});

test('highlightParts marks case-insensitive matches', () => {
  assert.deepEqual(highlightParts('Gato y gato.', 'gato'), [
    { text: 'Gato', hit: true },
    { text: ' y ', hit: false },
    { text: 'gato', hit: true },
    { text: '.', hit: false },
  ]);
});

test('normalizeLang maps tags to stored codes', () => {
  assert.equal(normalizeLang('es-419'), 'es');
  assert.equal(normalizeLang('zh-TW'), 'zh-Hant');
  assert.equal(normalizeLang('zh-Hans-CN'), 'zh');
  assert.equal(normalizeLang('iw'), 'he');
  assert.equal(normalizeLang('und'), null);
});
