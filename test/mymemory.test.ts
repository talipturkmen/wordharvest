import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTranslation } from '../src/translate/mymemory.ts';

test('skips an echoed source word and ALL-CAPS alternatives', () => {
  const data = {
    responseData: { translatedText: 'Atrevidos' },
    matches: [
      { translation: 'Atrevidos', match: 0.98 },
      { translation: 'BOLD', match: 0.96 },
      { translation: 'Bold', match: 0.96 },
    ],
  };
  assert.equal(pickTranslation('atrevidos', data), 'bold');
});

test('keeps a good top result and sentence casing', () => {
  assert.equal(pickTranslation('gato', { responseData: { translatedText: 'cat' } }), 'cat');
  assert.equal(pickTranslation('Hola mundo.', { responseData: { translatedText: 'Hello world.' } }), 'Hello world.');
  assert.equal(pickTranslation('Berlin', { responseData: { translatedText: 'Berlin' } }), 'Berlin');
});
