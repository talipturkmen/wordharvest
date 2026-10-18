// Fetches extra example sentences (Tatoeba) for words about to be practised and
// stores them on the cards. Runs in the Learn page; failures are silent and retried later.
import type { Card } from '../../shared/types.ts';
import type { Settings } from '../../shared/settings.ts';
import { getCard, putCards } from '../../shared/storage.ts';
import { fetchMoreSentences } from '../../shared/tatoeba.ts';

const REFRESH_AFTER = 30 * 86_400_000;
const inFlight = new Map<string, Promise<Card | null>>();

export function needsMore(card: Card, settings: Settings, now = Date.now()): boolean {
  if (!settings.moreSentences) return false;
  const more = card.more;
  return !more || more.lang !== settings.targetLang || now - more.fetchedAt > REFRESH_AFTER;
}

async function enrichOne(card: Card, settings: Settings): Promise<Card | null> {
  try {
    const sentences = await fetchMoreSentences(card.term, card.lang, settings.targetLang, AbortSignal.timeout(10_000));
    // Re-read so a save from another tab (new example) isn't overwritten.
    const fresh = await getCard(card.id);
    if (!fresh) return null;
    const updated: Card = { ...fresh, more: { sentences, fetchedAt: Date.now(), lang: settings.targetLang } };
    await putCards([updated]);
    return updated;
  } catch {
    return null; // offline or API error: try again next time
  }
}

/** Starts fetching for every card that needs it; resolves with the updated cards. */
export function enrich(cards: readonly Card[], settings: Settings): Promise<Card[]> {
  const jobs = cards
    .filter((c) => needsMore(c, settings))
    .slice(0, 12)
    .map((c) => {
      let job = inFlight.get(c.id);
      if (!job) {
        job = enrichOne(c, settings).finally(() => inFlight.delete(c.id));
        inFlight.set(c.id, job);
      }
      return job;
    });
  return Promise.all(jobs).then((r) => r.filter((c): c is Card => c !== null));
}

/** Like `enrich`, but gives up waiting after `ms` (fetching continues in the background). */
export async function enrichWithin(cards: readonly Card[], settings: Settings, ms: number): Promise<Card[]> {
  return Promise.race([enrich(cards, settings), new Promise<Card[]>((r) => setTimeout(() => r([]), ms))]);
}
