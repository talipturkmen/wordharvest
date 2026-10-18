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

function getTranslator(source: string, target: string): Promise<ChromeTranslator> {
  const key = `${source}>${target}`;
  let pending = translators.get(key);
  if (!pending) {
    pending = api.Translator!.create({ sourceLanguage: source, targetLanguage: target });
    translators.set(key, pending);
    pending.catch(() => translators.delete(key));
  }
  return pending;
}

async function availability(source: string, target: string): Promise<Availability> {
  if (!hasBuiltinTranslator()) return 'unavailable';
  try {
    return await api.Translator!.availability({ sourceLanguage: source, targetLanguage: target });
  } catch {
    return 'unavailable';
  }
}

/**
 * @param waitForDownload If false, a language pair whose model isn't downloaded
 *   yet is reported as unavailable (so the chain falls through to the next
 *   provider) while the download starts in the background for next time.
 */
export function createBuiltinTranslator({ waitForDownload }: { waitForDownload: boolean }): TranslationProvider {
  return {
    id: 'chrome-builtin',
    label: 'Chrome on-device translator',

    async canTranslate(source, target) {
      const a = await availability(source, target);
      if (a === 'available' || (waitForDownload && a !== 'unavailable')) return true;
      if (a !== 'unavailable') getTranslator(source, target).catch(() => {}); // warm up for next time
      return false;
    },

    async translate(text, source, target) {
      try {
        return await (await getTranslator(source, target)).translate(text);
      } catch (err) {
        throw new TranslationError(`On-device translation failed: ${(err as Error).message}`);
      }
    },
  };
}

export const builtinTranslator = createBuiltinTranslator({ waitForDownload: true });

let detector: Promise<ChromeLanguageDetector> | undefined;
let detectorReady: ChromeLanguageDetector | undefined;

export const builtinDetector: LanguageDetector = {
  id: 'chrome-builtin',
  async detect(text) {
    if (!hasBuiltinDetector()) return null;
    try {
      if (!detectorReady) {
        // Still being created (e.g. model downloading): let chrome.i18n answer meanwhile.
        if (detector) return null;
        const a = await api.LanguageDetector!.availability();
        if (a === 'unavailable') return null;
        detector = api.LanguageDetector!.create();
        detector.then((d) => (detectorReady = d), () => (detector = undefined));
        if (a !== 'available') return null;
        detectorReady = await detector;
      }
      const [best] = await detectorReady.detect(text);
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
