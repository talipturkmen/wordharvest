// Translation service used by the content script: picks providers according to
// the user's preference and falls through the chain until one succeeds.
import type { LanguageDetector, TranslationProvider } from './types.ts';
import { TranslationError } from './types.ts';
import { builtinDetector, builtinTranslator, createBuiltinTranslator, i18nDetector } from './builtin.ts';
import type { ProviderPreference } from '../shared/settings.ts';
import { normalizeLang } from '../shared/languages.ts';
import { send } from '../shared/messages.ts';
import { createRemoteProvider } from './registry.ts';

export type { TranslationProvider, LanguageDetector } from './types.ts';
export { TranslationError } from './types.ts';

/** Forwards to the remote provider, which runs in the service worker. */
export const remoteProxy: TranslationProvider = {
  id: 'remote',
  label: createRemoteProvider().label,
  canTranslate: async () => true,
  translate: async (text, source, target) => (await send({ type: 'translate', text, source, target })).text,
};

const sameLanguage: TranslationProvider = {
  id: 'same-language',
  label: 'Same as target language',
  canTranslate: async (source, target) => source === target,
  translate: async (text) => text,
};

// In "auto" mode, don't make the user wait for an on-device model download:
// use the remote provider meanwhile and let the model download in the background.
const builtinIfReady = createBuiltinTranslator({ waitForDownload: false });

export function providerChain(pref: ProviderPreference): TranslationProvider[] {
  switch (pref) {
    case 'builtin':
      return [builtinTranslator];
    case 'remote':
      return [remoteProxy];
    case 'auto':
      return [builtinIfReady, remoteProxy];
  }
}

/** Per-provider time limit (first use of the on-device translator may download a model). */
const TIMEOUT_MS = { default: 15_000, download: 120_000 };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TranslationError('Translation timed out.')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export interface TranslationResult {
  text: string;
  provider: TranslationProvider;
}

export async function translate(
  text: string,
  source: string,
  target: string,
  chain: readonly TranslationProvider[],
): Promise<TranslationResult> {
  if (source === target) return { text, provider: sameLanguage };
  let lastError: unknown;
  for (const provider of chain) {
    try {
      if (!(await withTimeout(provider.canTranslate(source, target), TIMEOUT_MS.default))) continue;
      const ms = provider === builtinTranslator ? TIMEOUT_MS.download : TIMEOUT_MS.default;
      const out = (await withTimeout(provider.translate(text, source, target), ms)).trim();
      if (out) return { text: out, provider };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new TranslationError(
    chain.length === 1 && chain[0] === builtinTranslator
      ? 'On-device translation is not available for this language pair. Allow the online fallback in settings.'
      : 'No translation available.',
  );
}

const detectors: LanguageDetector[] = [builtinDetector, i18nDetector];

/** Detects the language from the sentence (more reliable than a single word), then the page's lang attribute. */
export async function detectLanguage(text: string, pageLang?: string | null): Promise<string | null> {
  for (const d of detectors) {
    const lang = normalizeLang(await d.detect(text));
    if (lang) return lang;
  }
  return normalizeLang(pageLang);
}
