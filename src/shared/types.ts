/** One place a word was seen. A card collects one or more of these. */
export interface Example {
  /** The full sentence the word appeared in. */
  sentence: string;
  /** The surface form that was double-clicked (used for highlighting). */
  word: string;
  /** Translation of the sentence, when available. */
  translation?: string;
  url: string;
  title: string;
  addedAt: number;
}

/** Spaced-repetition state (SM-2 variant, see srs.ts). */
export interface SrsState {
  /** Epoch ms when the card is next due. */
  due: number;
  /** Current interval in days (0 = learning / relearning). */
  interval: number;
  /** Ease factor, starts at 2.5, never below 1.3. */
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
  /** Times the card was forgotten after being learned. */
  lapses: number;
  lastReviewed?: number;
}

/** An extra example sentence fetched for a word (not from the user's reading). */
export interface MoreSentence {
  text: string;
  /** Translation into the target language, when the source has one. */
  translation?: string;
  source: 'tatoeba';
  /** Tatoeba sentence id (for the attribution link). */
  id: number;
  author?: string;
}

export interface Card {
  /** `${lang}:${normalized term}` — deterministic so re-saving a word merges. */
  id: string;
  term: string;
  /** Source language (BCP 47, e.g. "es", "zh-Hant"). */
  lang: string;
  translation: string;
  notes?: string;
  examples: Example[];
  srs: SrsState;
  /** Extra example sentences for more varied exercises (see src/shared/tatoeba.ts). */
  more?: {
    sentences: MoreSentence[];
    fetchedAt: number;
    /** Target language the translations are in. */
    lang: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface SaveWordInput {
  term: string;
  lang: string;
  translation: string;
  example?: Omit<Example, 'addedAt'>;
}

export type SaveStatus = 'created' | 'merged' | 'duplicate';

export interface SaveWordResult {
  status: SaveStatus;
  card: Card;
}
