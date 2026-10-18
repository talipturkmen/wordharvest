// Extra example sentences from Tatoeba (https://tatoeba.org), a free, community-
// made collection of sentences and translations licensed CC BY 2.0 FR.
// The API allows cross-origin requests, so no host permission is needed. Only the
// word and the two language codes are sent.
import type { MoreSentence } from './types.ts';
import { findWord } from './contexts.ts';

/** Our language codes → Tatoeba's ISO 639-3 codes. */
const ISO3: Record<string, string> = {
  ar: 'ara', bg: 'bul', bn: 'ben', cs: 'ces', da: 'dan', de: 'deu', el: 'ell', en: 'eng', es: 'spa',
  fi: 'fin', fr: 'fra', he: 'heb', hi: 'hin', hr: 'hrv', hu: 'hun', id: 'ind', it: 'ita', ja: 'jpn',
  ko: 'kor', lt: 'lit', nl: 'nld', no: 'nob', pl: 'pol', pt: 'por', ro: 'ron', ru: 'rus', sk: 'slk',
  sl: 'slv', sv: 'swe', ta: 'tam', te: 'tel', th: 'tha', tr: 'tur', uk: 'ukr', vi: 'vie', zh: 'cmn',
  'zh-Hant': 'cmn',
};

const ENDPOINT = 'https://api.tatoeba.org/unstable/sentences';
const MAX_LENGTH = 140;
export const MAX_MORE = 4;

export function tatoebaUrl(term: string, lang: string, target: string, withTranslations: boolean): string | null {
  const from = ISO3[lang];
  const to = ISO3[target];
  if (!from) return null;
  const url = new URL(ENDPOINT);
  url.searchParams.set('lang', from);
  url.searchParams.set('q', `=${term}`); // "=" means exact word, not stemmed
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('limit', '20');
  if (withTranslations && to && to !== from) url.searchParams.set('trans:lang', to);
  return url.href;
}

interface ApiSentence {
  id?: number;
  text?: string;
  owner?: string | null;
  is_unapproved?: boolean;
  translations?: { text?: string; lang?: string; is_direct?: boolean; is_unapproved?: boolean }[];
}

/** Picks short, approved sentences that contain the word, preferring ones with a translation. */
export function parseTatoeba(json: unknown, term: string, lang: string, target: string): MoreSentence[] {
  const data = (json as { data?: ApiSentence[] })?.data;
  if (!Array.isArray(data)) return [];
  const to = ISO3[target];
  const out: MoreSentence[] = [];
  const seen = new Set<string>();
  for (const s of data) {
    const text = s.text?.trim();
    if (!text || typeof s.id !== 'number' || s.is_unapproved || text.length > MAX_LENGTH) continue;
    if (!findWord(text, term, lang)) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const translations = (s.translations ?? []).filter((t) => t.lang === to && t.text && !t.is_unapproved);
    const best = translations.find((t) => t.is_direct) ?? translations[0];
    out.push({ text, translation: best?.text?.trim(), source: 'tatoeba', id: s.id, author: s.owner ?? undefined });
  }
  // Translated sentences enable more exercise types; shorter ones are easier to build.
  out.sort((a, b) => Number(!!b.translation) - Number(!!a.translation) || a.text.length - b.text.length);
  return out.slice(0, MAX_MORE);
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Tatoeba HTTP ${res.status}`);
  return res.json();
}

/** Fetches extra sentences for a word. Throws on network errors (so callers can retry later). */
export async function fetchMoreSentences(term: string, lang: string, target: string, signal: AbortSignal): Promise<MoreSentence[]> {
  const url = tatoebaUrl(term, lang, target, true);
  if (!url) return [];
  let found = parseTatoeba(await getJson(url, signal), term, lang, target);
  if (found.length < 2) {
    // Few translated sentences: untranslated ones still work for fill-in and listening.
    const plain = parseTatoeba(await getJson(tatoebaUrl(term, lang, target, false)!, signal), term, lang, target);
    const have = new Set(found.map((s) => s.id));
    found = [...found, ...plain.filter((s) => !have.has(s.id))].slice(0, MAX_MORE);
  }
  return found;
}
