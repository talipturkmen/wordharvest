import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsToAnkiCsv, cardsToCsv, csvToCards, parseCsv, toCsv } from '../src/shared/csv.ts';
import { applySave } from '../src/shared/cards.ts';

test('toCsv/parseCsv round-trip quotes, commas and newlines', () => {
  const rows = [['a', 'b,c', 'say "hi"'], ['line\nbreak', '', ' padded ']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('parseCsv handles BOM, LF endings and a missing final newline', () => {
  assert.deepEqual(parseCsv('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('lossless CSV round-trips cards with several examples', () => {
  let card = applySave(undefined, {
    term: 'Haus', lang: 'de', translation: 'house',
    example: { sentence: 'Das Haus ist alt.', word: 'Haus', translation: 'The house is old.', url: 'https://x/1', title: 'X, "quoted"' },
  }, Date.UTC(2026, 0, 1)).card;
  card = applySave(card, {
    term: 'Haus', lang: 'de', translation: 'house',
    example: { sentence: 'Ein Haus, zwei Türen.', word: 'Haus', url: 'https://y/', title: 'Y' },
  }, Date.UTC(2026, 0, 2)).card;
  card = { ...card, notes: 'neuter', srs: { ...card.srs, interval: 6, reps: 2, ease: 2.36 } };

  const [back] = csvToCards(cardsToCsv([card]), 0);
  assert.ok(back);
  assert.equal(back.id, card.id);
  assert.equal(back.notes, 'neuter');
  assert.equal(back.srs.interval, 6);
  assert.equal(back.srs.ease, 2.36);
  assert.deepEqual(back.examples.map((e) => e.sentence), card.examples.map((e) => e.sentence));
  assert.equal(back.examples[0]!.translation, 'The house is old.');
  assert.equal(back.examples[0]!.title, 'X, "quoted"');
});

test('csvToCards rejects files without the required columns', () => {
  assert.throws(() => csvToCards('foo,bar\n1,2', 0), /term/);
});

test('Anki export has headers, escapes HTML and bolds the word', () => {
  const card = applySave(undefined, {
    term: 'chat', lang: 'fr', translation: 'cat <pet>',
    example: { sentence: 'Le chat dort.', word: 'chat', url: '', title: '' },
  }, 0).card;
  const out = cardsToAnkiCsv([card]);
  assert.match(out, /^#separator:Comma\r\n#html:true\r\n/);
  const rows = parseCsv(out.split('\r\n').slice(4).join('\r\n'));
  assert.equal(rows[0]![0], '<b>chat</b><br><br>Le <b>chat</b> dort.');
  assert.equal(rows[0]![1], 'cat &lt;pet&gt;');
  assert.equal(rows[0]![2], 'context-cards lang::fr');
});
