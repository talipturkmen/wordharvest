// Service worker: the single writer for saved words and learning progress (so
// saves from several tabs and lesson results can't overwrite each other) and the
// proxy for the remote translation provider (the only network access).
import type { Message, Reply, ResponseMap } from '../shared/messages.ts';
import { getAllCards, getProgress, putProgress, saveWord } from '../shared/storage.ts';
import { addXp, completeLesson, unlockAchievements, type Progress } from '../shared/progress.ts';
import { createRemoteProvider } from '../translate/registry.ts';

const remote = createRemoteProvider();

/** XP for each new word saved while reading. */
const XP_PER_NEW_WORD = 1;

// Serialize writes: read-modify-write must not interleave.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function withAchievements(progress: Progress, now: number) {
  return unlockAchievements({ progress, cards: await getAllCards() }, now);
}

async function handle(msg: Message): Promise<ResponseMap[Message['type']]> {
  switch (msg.type) {
    case 'translate': {
      const text = await remote.translate(msg.text, msg.source, msg.target);
      return { text, provider: remote.label };
    }
    case 'saveWord':
      return serialized(async () => {
        const result = await saveWord(msg.input);
        if (result.status !== 'created') return { ...result, xp: 0 };
        const now = Date.now();
        const { progress } = await withAchievements(addXp(await getProgress(), XP_PER_NEW_WORD, now), now);
        await putProgress(progress);
        return { ...result, xp: XP_PER_NEW_WORD };
      });
    case 'completeLesson':
      return serialized(async () => {
        const now = Date.now();
        const xp = Math.max(0, Math.min(500, Math.round(msg.xp)));
        const outcome = completeLesson(await getProgress(), now, xp, msg.perfect);
        const { progress, unlocked } = await withAchievements(outcome.progress, now);
        await putProgress(progress);
        return { ...outcome, progress, achievements: unlocked.map((a) => a.id) };
      });
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
