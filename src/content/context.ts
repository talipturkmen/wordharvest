// DOM side of context capture: find the block around the selection and the
// word's offset inside that block's text.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'RT', 'RP']);

export function isEditable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/** Nearest ancestor that is laid out as a block (p, li, td, div, …). */
export function findBlock(node: Node): Element {
  let el = node instanceof Element ? node : node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const display = getComputedStyle(el).display;
    if (!display.startsWith('inline') && display !== 'contents' && display !== 'ruby') return el;
    el = el.parentElement;
  }
  return el ?? document.body;
}

/** Concatenated visible-ish text of `block` and the offset of (node, offset) within it. */
export function textWithOffset(block: Element, node: Node, offset: number): { text: string; offset: number } {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement && SKIP_TAGS.has(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let text = '';
  let found = -1;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) found = text.length + offset;
    text += (n as Text).data;
  }
  // If the selection started on an element boundary, fall back to the block start.
  return { text, offset: found === -1 ? 0 : found };
}
