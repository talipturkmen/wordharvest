/** Languages offered in the UI. Codes follow the Chrome Translator API (BCP 47). */
export const LANGUAGE_CODES = [
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr', 'hu',
  'id', 'it', 'ja', 'ko', 'lt', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta',
  'te', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant',
] as const;

const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });

export function languageName(code: string): string {
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Normalizes a detected/declared language tag to the form we store:
 * the base language, except Traditional Chinese which keeps its script.
 */
export function normalizeLang(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const t = tag.trim().replace('_', '-').toLowerCase();
  if (!t || t === 'und' || t === 'unknown') return null;
  if (t.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(t) ? 'zh-Hant' : 'zh';
  }
  const base = t.split('-')[0]!;
  if (base === 'iw') return 'he';
  if (base === 'nb' || base === 'nn') return 'no';
  return base;
}
