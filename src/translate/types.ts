/**
 * Every translation backend implements this interface. To add or swap a
 * provider, implement it and register it in ./registry.ts.
 */
export interface TranslationProvider {
  /** Stable id, shown in the popup ("via …") and used in the registry. */
  readonly id: string;
  /** Human-readable name. */
  readonly label: string;
  /** Can this provider translate source → target in the current context? */
  canTranslate(source: string, target: string): Promise<boolean>;
  /** Translates `text`. Throws TranslationError on failure. */
  translate(text: string, source: string, target: string): Promise<string>;
}

/** Detects the language of a piece of text; resolves null when unsure. */
export interface LanguageDetector {
  readonly id: string;
  detect(text: string): Promise<string | null>;
}

export class TranslationError extends Error {
  override name = 'TranslationError';
}
