// MyMemory free translation API (no key needed). https://mymemory.translated.net/doc/spec.php
// Anonymous quota: ~5,000 chars/day; adding an e-mail ("de" param) raises it to ~50,000.
// Runs in the service worker, which has a host permission for this one domain only.
import type { TranslationProvider } from './types.ts';
import { TranslationError } from './types.ts';

const ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_BYTES = 500; // API limit per request

/** MyMemory uses region codes for Chinese. */
function toMyMemoryLang(code: string): string {
  if (code === 'zh') return 'zh-CN';
  if (code === 'zh-Hant') return 'zh-TW';
  return code;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean;
  matches?: { translation?: string; match?: number | string }[];
}

/**
 * MyMemory's top result for single words is sometimes the source echoed back
 * (from a translation-memory entry). Prefer the best alternative that actually
 * differs, avoid ALL-CAPS variants, and match the source's lower-case start.
 */
export function pickTranslation(source: string, data: MyMemoryResponse): string {
  const top = data.responseData?.translatedText ?? '';
  const same = (t: string) => t.trim().toLocaleLowerCase() === source.trim().toLocaleLowerCase();
  const shouting = (t: string) => t.length > 1 && t === t.toLocaleUpperCase() && t !== t.toLocaleLowerCase();
  let best = top;
  if (same(top) || shouting(top)) {
    const alternatives = (data.matches ?? [])
      .map((m) => ({ text: m.translation?.trim() ?? '', score: Number(m.match) || 0 }))
      .filter((m) => m.text && !same(m.text))
      .sort((a, b) => Number(shouting(a.text)) - Number(shouting(b.text)) || b.score - a.score);
    if (alternatives[0]) best = alternatives[0].text;
  }
  const isWord = !/\s/.test(source.trim());
  if (isWord && /^\p{Ll}/u.test(source) && /^\p{Lu}\p{Ll}*$/u.test(best)) best = best.toLocaleLowerCase();
  return best;
}

export function createMyMemoryProvider(getEmail: () => Promise<string>): TranslationProvider {
  return {
    id: 'mymemory',
    label: 'MyMemory',

    async canTranslate() {
      return true;
    },

    async translate(text, source, target) {
      if (new TextEncoder().encode(text).length > MAX_BYTES) {
        throw new TranslationError('Text is too long for MyMemory (500 bytes max).');
      }
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', text);
      url.searchParams.set('langpair', `${toMyMemoryLang(source)}|${toMyMemoryLang(target)}`);
      const email = (await getEmail()).trim();
      if (email) url.searchParams.set('de', email);

      let res: Response;
      try {
        res = await fetch(url, { credentials: 'omit' });
      } catch {
        throw new TranslationError('Could not reach MyMemory. Check your connection.');
      }
      if (res.status === 429) throw new TranslationError('MyMemory daily limit reached. Try again tomorrow.');
      if (!res.ok) throw new TranslationError(`MyMemory error (HTTP ${res.status}).`);

      const data = (await res.json()) as MyMemoryResponse;
      const out = data.responseData?.translatedText ?? '';
      if (data.quotaFinished || /MYMEMORY WARNING/i.test(out)) {
        throw new TranslationError('MyMemory daily limit reached. Add an e-mail in settings for a higher quota.');
      }
      if (Number(data.responseStatus) !== 200 || !out) {
        throw new TranslationError(data.responseDetails || 'MyMemory returned no translation.');
      }
      return decodeEntities(pickTranslation(text, data));
    },
  };
}
