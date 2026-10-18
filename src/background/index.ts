// Service worker: the single writer for words saved from web pages (so saves
// from several tabs can't race each other) and the proxy for the remote
// translation provider (the only network access the extension makes).
import type { Message, Reply, ResponseMap } from '../shared/messages.ts';
import { saveWord } from '../shared/storage.ts';
import { createRemoteProvider } from '../translate/registry.ts';

const remote = createRemoteProvider();

// Serialize writes: read-modify-write of a card must not interleave.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function handle(msg: Message): Promise<ResponseMap[Message['type']]> {
  switch (msg.type) {
    case 'translate': {
      const text = await remote.translate(msg.text, msg.source, msg.target);
      return { text, provider: remote.label };
    }
    case 'saveWord':
      return serialized(() => saveWord(msg.input));
  }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse: (r: Reply<unknown>) => void) => {
  // Only accept messages from this extension's own content scripts and pages.
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg).then(
    (value) => sendResponse({ ok: true, value }),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true; // keep the channel open for the async reply
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('review.html#welcome') });
  }
});
