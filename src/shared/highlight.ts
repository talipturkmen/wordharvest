export interface Part {
  text: string;
  hit: boolean;
}

/** Splits a sentence into parts, marking case-insensitive occurrences of `word`. */
export function highlightParts(sentence: string, word: string): Part[] {
  const needle = word.trim().toLocaleLowerCase();
  if (!needle) return [{ text: sentence, hit: false }];
  const hay = sentence.toLocaleLowerCase();
  // Lowercasing can change string length for a few characters (e.g. "İ");
  // fall back to no highlighting rather than misaligned highlighting.
  if (hay.length !== sentence.length) return [{ text: sentence, hit: false }];

  const parts: Part[] = [];
  let pos = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    if (i > pos) parts.push({ text: sentence.slice(pos, i), hit: false });
    parts.push({ text: sentence.slice(i, i + needle.length), hit: true });
    pos = i + needle.length;
  }
  if (pos < sentence.length) parts.push({ text: sentence.slice(pos), hit: false });
  return parts;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function highlightHtml(sentence: string, word: string, tag = 'b'): string {
  return highlightParts(sentence, word)
    .map((p) => (p.hit ? `<${tag}>${escapeHtml(p.text)}</${tag}>` : escapeHtml(p.text)))
    .join('');
}
