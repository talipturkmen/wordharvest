// Pure text helpers for the content script (no DOM access, unit-tested).

const MAX_SENTENCE = 400;
const WINDOW = 2000;
// Sentence-ending punctuation: Latin, CJK full-width, Arabic, Devanagari, Armenian, Ethiopic, ellipsis.
const TERMINATORS = '.!?。！？؟।॥։።…';
const TERMINATOR_RE = new RegExp(`[${TERMINATORS}]+["'”’»)\\]]*(?=\\s|$)|[。！？]+`, 'gu');

/** Trims whitespace and surrounding punctuation from a double-click selection. */
export function cleanWord(raw: string): string | null {
  const word = raw.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
  if (!word || word.length > 64) return null;
  if (!/\p{L}/u.test(word)) return null; // numbers, symbols
  if (/\s/.test(word) && !/^[\p{L}'’-]+(?: [\p{L}'’-]+){0,2}$/u.test(word)) return null;
  return word;
}

/**
 * Returns the sentence of `text` that contains character `offset`, with
 * whitespace collapsed. Uses Intl.Segmenter (locale-aware) when available and
 * falls back to splitting on sentence punctuation.
 */
export function extractSentence(text: string, offset: number, lang?: string | null): string {
  // Only look at a window around the word so huge text blocks stay cheap.
  const start = Math.max(0, offset - WINDOW);
  // Newlines in HTML source render as spaces, so they must not end sentences.
  // Replacing 1:1 keeps `offset` valid.
  const slice = text.slice(start, offset + WINDOW).replace(/\s/g, ' ');
  const at = offset - start;

  let sentence = segmentWithIntl(slice, at, lang) ?? segmentWithRegex(slice, at);
  sentence = sentence.replace(/\s+/g, ' ').trim();
  return clampAround(sentence, slice.slice(at, at + 40).replace(/\s+/g, ' ').trim().split(' ')[0] ?? '');
}

function segmentWithIntl(text: string, at: number, lang?: string | null): string | null {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return null;
  try {
    const seg = new Intl.Segmenter(lang ?? undefined, { granularity: 'sentence' });
    const hit = seg.segment(text).containing(at);
    return hit ? hit.segment : null;
  } catch {
    return null;
  }
}

export function segmentWithRegex(text: string, at: number): string {
  let begin = 0;
  let end = text.length;
  for (const m of text.matchAll(TERMINATOR_RE)) {
    const stop = m.index + m[0].length;
    if (stop <= at) begin = stop;
    else {
      end = stop;
      break;
    }
  }
  return text.slice(begin, end);
}

/** Keeps very long "sentences" (lists, run-on text) to a readable window around the word. */
function clampAround(sentence: string, word: string): string {
  if (sentence.length <= MAX_SENTENCE) return sentence;
  const i = Math.max(0, sentence.indexOf(word));
  let from = Math.max(0, i - MAX_SENTENCE / 2);
  let to = Math.min(sentence.length, from + MAX_SENTENCE);
  from = Math.max(0, to - MAX_SENTENCE);
  // Snap to word boundaries.
  if (from > 0) from = sentence.indexOf(' ', from) + 1 || from;
  if (to < sentence.length) to = sentence.lastIndexOf(' ', to) > from ? sentence.lastIndexOf(' ', to) : to;
  return `${from > 0 ? '… ' : ''}${sentence.slice(from, to).trim()}${to < sentence.length ? ' …' : ''}`;
}
