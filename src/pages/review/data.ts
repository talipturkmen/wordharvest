// Import & export.
import type { Card } from '../../shared/types.ts';
import { deleteCards, getAllCards, importCards } from '../../shared/storage.ts';
import { cardsToAnkiCsv, cardsToCsv, csvToCards } from '../../shared/csv.ts';
import { sanitizeCard } from '../../shared/cards.ts';
import { $, download } from '../dom.ts';

const stamp = () => new Date().toISOString().slice(0, 10);
const status = $('import-status');

function setStatus(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle('error', error);
}

$('export-json').addEventListener('click', async () => {
  const cards = await getAllCards();
  const doc = { format: 'wordharvest', version: 1, exportedAt: new Date().toISOString(), cards };
  download(`wordharvest-${stamp()}.json`, JSON.stringify(doc, null, 2), 'application/json');
});

$('export-csv').addEventListener('click', async () => {
  // BOM so Excel opens UTF-8 correctly.
  download(`wordharvest-${stamp()}.csv`, '﻿' + cardsToCsv(await getAllCards()), 'text/csv;charset=utf-8');
});

$('export-anki').addEventListener('click', async () => {
  download(`wordharvest-anki-${stamp()}.csv`, cardsToAnkiCsv(await getAllCards()), 'text/csv;charset=utf-8');
});

function parseFile(name: string, text: string): Card[] {
  const now = Date.now();
  const trimmed = text.trimStart().replace(/^﻿/, '');
  if (name.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data: unknown = JSON.parse(trimmed);
    const raw = Array.isArray(data) ? data : (data as { cards?: unknown }).cards;
    if (!Array.isArray(raw)) throw new Error('This JSON file has no "cards" list.');
    return raw.map((c) => sanitizeCard(c, now)).filter((c): c is Card => c !== null);
  }
  return csvToCards(trimmed, now);
}

const fileInput = $<HTMLInputElement>('import-file');
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const cards = parseFile(file.name, await file.text());
    if (cards.length === 0) {
      setStatus('No cards found in that file.', true);
      return;
    }
    const { added, merged } = await importCards(cards);
    setStatus(`Imported ${added} new card${added === 1 ? '' : 's'}${merged ? `, merged ${merged} into existing cards` : ''}.`);
  } catch (err) {
    setStatus(`Import failed: ${(err as Error).message}`, true);
  }
});

$('delete-all').addEventListener('click', async () => {
  const cards = await getAllCards();
  if (cards.length === 0) return;
  if (!confirm(`Permanently delete all ${cards.length} cards? This cannot be undone.`)) return;
  await deleteCards(cards.map((c) => c.id));
  setStatus(`Deleted ${cards.length} cards.`);
});
