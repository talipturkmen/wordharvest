// Typed messages between the content script / pages and the service worker.
import type { SaveWordInput, SaveWordResult } from './types.ts';

export type Message =
  | { type: 'translate'; text: string; source: string; target: string }
  | { type: 'saveWord'; input: SaveWordInput };

export interface ResponseMap {
  translate: { text: string; provider: string };
  saveWord: SaveWordResult;
}

export type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

export async function send<M extends Message>(msg: M): Promise<ResponseMap[M['type']]> {
  let reply: Reply<ResponseMap[M['type']]> | undefined;
  try {
    reply = await chrome.runtime.sendMessage(msg);
  } catch (err) {
    // Happens in tabs that were open while the extension was updated or reloaded.
    if (String(err).includes('Extension context invalidated')) {
      throw new Error('WordHarvest was updated. Reload this page to keep using it.');
    }
    throw err;
  }
  if (!reply) throw new Error('No response from the extension.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}
