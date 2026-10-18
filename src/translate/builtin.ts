// Chrome's built-in, on-device Translator and Language Detector APIs (Chrome 138+).
// https://developer.chrome.com/docs/ai/translator-api
// https://developer.chrome.com/docs/ai/language-detection
// They exist only in window contexts (not service workers), so these run in the
// content script and extension pages. Model downloads need a user gesture —
// the double-click provides it.
import type { LanguageDetector, TranslationProvider } from './types.ts';
import { TranslationError } from './types.ts';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface ChromeTranslator {
  translate(input: string): Promise<string>;
}
interface ChromeTranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeTranslator>;
}
interface ChromeLanguageDetector {
  detect(input: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
}
interface ChromeLanguageDetectorApi {
  availability(): Promise<Availability>;
  create(): Promise<ChromeLanguageDetector>;
}

const api = globalThis as unknown as {
  Translator?: ChromeTranslatorApi;
  LanguageDetector?: ChromeLanguageDetectorApi;
};

export function hasBuiltinTranslator(): boolean {
  return typeof api.Translator?.create === 'function';
}

export function hasBuiltinDetector(): boolean {
  return typeof api.LanguageDetector?.create === 'function';
}

const translators = new Map<string, Promise<ChromeTranslator>>();

export const builtinTranslator: TranslationProvider = {
  id: 'chrome-builtin',
  label: 'Chrome on-device translator',

  async canTranslate(source, target) {
    if (!hasBuiltinTranslator()) return false;
    try {
      const a = await api.Translator!.availability({ sourceLanguage: source, targetLanguage: target });
      return a !== 'unavailable';
    } catch {
      return false;
    }
  },

  async translate(text, source, target) {
    const key = `${source}>${target}`;
    let pending = translators.get(key);
    if (!pending) {
      pending = api.Translator!.create({ sourceLanguage: source, targetLanguage: target });
      translators.set(key, pending);
      pending.catch(() => translators.delete(key));
    }
    try {
      return await (await pending).translate(text);
    } catch (err) {
      throw new TranslationError(`On-device translation failed: ${(err as Error).message}`);
    }
  },
};

let detector: Promise<ChromeLanguageDetector> | undefined;

export const builtinDetector: LanguageDetector = {
  id: 'chrome-builtin',
  async detect(text) {
    if (!hasBuiltinDetector()) return null;
    try {
      if (!detector) {
        if ((await api.LanguageDetector!.availability()) === 'unavailable') return null;
        detector = api.LanguageDetector!.create();
        detector.catch(() => (detector = undefined));
      }
      const [best] = await (await detector).detect(text);
      return best && best.confidence >= 0.5 && best.detectedLanguage !== 'und' ? best.detectedLanguage : null;
    } catch {
      return null;
    }
  },
};

/** Chrome's older compact language detector (chrome.i18n), available everywhere without permissions. */
export const i18nDetector: LanguageDetector = {
  id: 'chrome-i18n',
  async detect(text) {
    if (!chrome.i18n?.detectLanguage) return null;
    try {
      const r = await chrome.i18n.detectLanguage(text);
      const best = r.languages[0];
      return r.isReliable && best && best.language !== 'und' ? best.language : null;
    } catch {
      return null;
    }
  },
};
