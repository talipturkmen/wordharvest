// Card persistence in chrome.storage.local. Each card lives under its own key
// ("card:<lang>:<term>") so saving one word never rewrites the whole collection.
import type { Card, SaveWordInput, SaveWordResult } from './types.ts';
import { applySave, CARD_KEY_PREFIX, cardId, mergeCards, storageKey } from './cards.ts';
import { isDueToday } from './srs.ts';
import { emptyProgress, type Progress } from './progress.ts';

export async function getAllCards(): Promise<Card[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(CARD_KEY_PREFIX))
    .map(([, v]) => v as Card);
}

export async function getCard(id: string): Promise<Card | undefined> {
  const key = storageKey(id);
  const { [key]: card } = await chrome.storage.local.get(key);
  return card as Card | undefined;
}

export async function putCards(cards: readonly Card[]): Promise<void> {
  if (cards.length === 0) return;
  await chrome.storage.local.set(Object.fromEntries(cards.map((c) => [storageKey(c.id), c])));
}

export async function deleteCards(ids: readonly string[]): Promise<void> {
  await chrome.storage.local.remove(ids.map(storageKey));
}

export async function saveWord(input: SaveWordInput, now = Date.now()): Promise<SaveWordResult> {
  const existing = await getCard(cardId(input.lang, input.term));
  const result = applySave(existing, input, now);
  if (result.status !== 'duplicate') await putCards([result.card]);
  return result;
}

/**
 * Saves an edited card. If the term or language changed, the card moves to its
 * new id (merging into a card that already uses that id).
 */
export async function saveEditedCard(oldId: string, card: Card): Promise<Card> {
  const id = cardId(card.lang, card.term);
  let next: Card = { ...card, id, updatedAt: Date.now() };
  if (id !== oldId) {
    const clash = await getCard(id);
    if (clash) next = mergeCards(clash, next);
    await deleteCards([oldId]);
  }
  await putCards([next]);
  return next;
}

/** Imports cards, merging with existing ones. Returns counts for the UI. */
export async function importCards(incoming: readonly Card[]): Promise<{ added: number; merged: number }> {
  const existing = new Map((await getAllCards()).map((c) => [c.id, c]));
  const toWrite = new Map<string, Card>();
  let added = 0;
  let merged = 0;
  for (const card of incoming) {
    const current = toWrite.get(card.id) ?? existing.get(card.id);
    if (current) {
      toWrite.set(card.id, mergeCards(current, card));
      merged++;
    } else {
      toWrite.set(card.id, card);
      added++;
    }
  }
  await putCards([...toWrite.values()]);
  return { added, merged };
}

export async function getStats(now = Date.now()): Promise<{ total: number; dueToday: number }> {
  const cards = await getAllCards();
  return { total: cards.length, dueToday: cards.filter((c) => isDueToday(c.srs, now)).length };
}

export function onCardsChanged(cb: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => k.startsWith(CARD_KEY_PREFIX))) cb();
  });
}

const PROGRESS_KEY = 'progress';

export async function getProgress(): Promise<Progress> {
  const { [PROGRESS_KEY]: stored } = await chrome.storage.local.get(PROGRESS_KEY);
  const empty = emptyProgress();
  const p = stored as Partial<Progress> | undefined;
  return { ...empty, ...p, streak: { ...empty.streak, ...p?.streak } };
}

/** Only the service worker writes progress (see src/background). */
export async function putProgress(progress: Progress): Promise<void> {
  await chrome.storage.local.set({ [PROGRESS_KEY]: progress });
}

export function onProgressChanged(cb: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[PROGRESS_KEY]) cb();
  });
}
