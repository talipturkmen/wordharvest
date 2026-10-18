// The extension icon as SVG: a flashcard with a highlighted word on an indigo tile.
// `simple` drops detail for 16/32 px. `padding` (in px of the final size) follows the
// Chrome Web Store guidance of 96 px artwork inside a 128 px icon.
export function iconSvg(size, { padding = 0, simple = false } = {}) {
  const inner = size - padding * 2;
  const s = inner / 100;
  const card = simple
    ? `<rect x="17" y="21" width="66" height="58" rx="9" fill="#fff"/>
       <rect x="27" y="35" width="46" height="10" rx="5" fill="#c7cbe0"/>
       <rect x="27" y="55" width="46" height="10" rx="5" fill="#fbbf24"/>`
    : `<rect x="22" y="20" width="56" height="58" rx="8" fill="#fff" fill-opacity=".35" transform="rotate(-9 50 49)"/>
       <rect x="22" y="25" width="56" height="54" rx="8" fill="#fff"/>
       <rect x="30" y="37" width="40" height="6" rx="3" fill="#c7cbe0"/>
       <rect x="30" y="49" width="12" height="6" rx="3" fill="#c7cbe0"/>
       <rect x="45" y="48" width="25" height="8" rx="3" fill="#fbbf24"/>
       <rect x="30" y="61" width="30" height="6" rx="3" fill="#c7cbe0"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/>
  </linearGradient></defs>
  <g transform="translate(${padding} ${padding}) scale(${s})">
    <rect width="100" height="100" rx="22" fill="url(#g)"/>
    ${card}
  </g>
</svg>`;
}
