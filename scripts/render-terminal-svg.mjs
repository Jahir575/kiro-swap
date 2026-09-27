// Renders captured, real ANSI-colored CLI output into a small "terminal window" SVG
// for embedding in the README. Deterministic character-grid positioning (rather than
// letting the SVG renderer lay out the text) keeps table borders aligned regardless of
// small monospace-metric differences between viewers.
const FONT_SIZE = 14;
const CHAR_W = FONT_SIZE * 0.6;
const LINE_H = 20;
const PAD_X = 16;
const PAD_TOP = 44;
const PAD_BOTTOM = 16;
const FONT_FAMILY = "SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const FG = {
  30: '#4b5263',
  31: '#ff6b6b',
  32: '#59d185',
  33: '#f6c453',
  34: '#6cb6ff',
  35: '#cd8cff',
  36: '#56d1c9',
  37: '#e6e6e6',
  90: '#6b7280',
  91: '#ff8787',
  92: '#7ee2a8',
  93: '#f9db7a',
  94: '#8ec8ff',
  95: '#dba8ff',
  96: '#7fe3dc',
  97: '#f3f3f3',
  39: null,
};
const DEFAULT_FG = '#e6e6e6';

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenizeLine(line) {
  const tokens = [];
  let state = { bold: false, dim: false, fg: null };
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) {
      tokens.push({ text: line.slice(last, m.index), ...state });
    }
    const codes = m[1].length ? m[1].split(';').map(Number) : [0];
    for (const code of codes) {
      if (code === 0) state = { bold: false, dim: false, fg: null };
      else if (code === 1) state = { ...state, bold: true };
      else if (code === 2) state = { ...state, dim: true };
      else if (code === 22) state = { ...state, bold: false, dim: false };
      else if (code === 39) state = { ...state, fg: null };
      else if (FG[code] !== undefined) state = { ...state, fg: FG[code] };
    }
    last = re.lastIndex;
  }
  if (last < line.length) {
    tokens.push({ text: line.slice(last), ...state });
  }
  return tokens;
}

function visibleLength(line) {
  return line.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function renderTerminalSvg({ title, lines }) {
  const maxCols = Math.max(1, ...lines.map(visibleLength));
  const width = Number((PAD_X * 2 + maxCols * CHAR_W).toFixed(1));
  const height = PAD_TOP + lines.length * LINE_H + PAD_BOTTOM;

  const textLines = lines
    .map((line, i) => {
      const tokens = tokenizeLine(line);
      let col = 0;
      const tspans = tokens
        .map((t) => {
          const x = (PAD_X + col * CHAR_W).toFixed(1);
          col += t.text.length;
          const fill = t.fg ?? DEFAULT_FG;
          const weight = t.bold ? 600 : 400;
          const opacity = t.dim ? 0.65 : 1;
          return `<tspan x="${x}" fill="${fill}" font-weight="${weight}" opacity="${opacity}">${escapeXml(t.text)}</tspan>`;
        })
        .join('');
      const y = PAD_TOP + i * LINE_H;
      return `<text y="${y}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" xml:space="preserve">${tspans}</text>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" />
  <rect width="${width}" height="28" rx="10" fill="#161b22" />
  <rect y="18" width="${width}" height="10" fill="#161b22" />
  <circle cx="18" cy="14" r="5" fill="#ff5f56" />
  <circle cx="36" cy="14" r="5" fill="#ffbd2e" />
  <circle cx="54" cy="14" r="5" fill="#27c93f" />
  <text x="${(width / 2).toFixed(1)}" y="18" font-family="${FONT_FAMILY}" font-size="12" fill="#8b949e" text-anchor="middle">${escapeXml(title)}</text>
  <g>
    ${textLines}
  </g>
</svg>
`;
}
