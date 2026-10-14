export const CELL = 28;
export const STROKE = 4.4;
export const INK = '#1c1712';
const KEYLINE = '#4a2f0c', KEY = 1.2;
const GAP = 7, SPACE = 18;
const BRASS = [[0, '#fbe9a3'], [0.35, '#e0b64d'], [0.65, '#b8862b'], [1, '#7d5517']];

export const GOLD_DEFS = `<defs><linearGradient id="letterGold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${CELL}">`
  + `${BRASS.map(([at, c]) => `<stop offset="${at}" stop-color="${c}" />`).join('')}</linearGradient></defs>`;

// VISUAL-DESIGN-2D.md, "Type"
export const GLYPHS = {
  L: [16, 'M2.2 0 V25.8 H16'],
  O: [20, 'M10 2.2 A7.8 11.8 0 1 0 10.01 2.2'],
  C: [18, 'M15 4.96 A7.8 11.8 0 1 0 15 23.04'],
  A: [20, 'M1 28 L10 1.5 L19 28 M4.1 19 H15.9'],
  Y: [20, 'M1 0 L10 14 L19 0 M10 14 V28'],
  R: [18, 'M2.2 28 V2.2 H9.5 A6.2 6.2 0 0 1 9.5 14.6 H2.2 M9 14.6 L16.5 28'],
  N: [19, 'M2.2 28 V1 L16.8 27 V0'],
  S: [18, 'M16 6.4 C15.2 3.2 12 2.2 9.2 2.2 C5.2 2.2 2.2 4 2.2 7.6 C2.2 11.2 5.6 12.4 9.2 13.6 ' +
         'C12.8 14.8 16.2 16 16.2 20 C16.2 23.6 13.2 25.8 9.2 25.8 C5.6 25.8 2.8 24.4 2 21.2'],
  T: [18, 'M0 2.2 H18 M9 2.2 V28'],
  E: [16, 'M16 2.2 H2.2 V25.8 H16 M2.2 14 H14'],
  B: [18, 'M2.2 28 V2.2 H9.5 A5.6 5.6 0 0 1 9.5 13.4 H2.2 M9.5 13.4 H10 A6.2 6.2 0 0 1 10 25.8 H0'],
  D: [19, 'M2.2 28 V2.2 H8 A9 11.8 0 0 1 8 25.8 H0'],
  F: [16, 'M16 2.2 H2.2 V28 M2.2 14 H13'],
  G: [20, 'M15 4.96 A7.8 11.8 0 1 0 17.8 14 H11'],
  H: [19, 'M2.2 0 V28 M16.8 0 V28 M2.2 14 H16.8'],
  I: [6.4, 'M3.2 0 V28'],
  J: [14, 'M11.8 0 V19 A4.8 6.8 0 0 1 2.2 19 V17'],
  K: [18, 'M2.2 0 V28 M17 0 L2.2 15.5 M7.5 10 L17.5 28'],
  M: [23, 'M2.2 28 V1 L11.5 22 L20.8 1 V28'],
  P: [18, 'M2.2 28 V2.2 H9.5 A6.2 6.2 0 0 1 9.5 14.6 H2.2'],
  Q: [20, 'M10 2.2 A7.8 11.8 0 1 0 10.01 2.2 M12 20 L18.5 28.5'],
  U: [19, 'M2.2 0 V18 A7.3 7.8 0 0 0 16.8 18 V0'],
  V: [20, 'M1 0 L10 26.5 L19 0'],
  W: [28, 'M1 0 L7.5 27 L14 4 L20.5 27 L27 0'],
  X: [19, 'M1.5 0 L17.5 28 M17.5 0 L1.5 28'],
  Z: [17, 'M1.5 2.2 H15.5 L1.5 25.8 H15.5'],
  0: [18, 'M9 2.2 A6.8 11.8 0 1 0 9.01 2.2'],
  1: [14, 'M4.5 6 L9.5 1.5 V28'],
  2: [18, 'M2.6 7.6 C2.6 4 5.4 2.2 9 2.2 C12.8 2.2 15.4 4.6 15.4 8 C15.4 11 13.6 13 11.4 15 L2.2 25.8 H16'],
  3: [18, 'M2.4 4.5 C4 2.8 6.4 2.2 8.8 2.2 C12.6 2.2 15 4.4 15 7.6 C15 10.8 12.6 13.2 8.6 13.2 H7 ' +
         'M8.6 13.2 C13 13.2 15.6 15.8 15.6 19.4 C15.6 23.2 12.8 25.8 8.8 25.8 C6 25.8 3.6 24.8 2.2 22.8'],
  4: [18, 'M12.5 28 V1 L1.5 19.5 H17'],
  5: [18, 'M15 2.2 H4 L3 12.6 C4.6 11.6 6.6 11 8.8 11 C13 11 15.6 13.8 15.6 18.2 ' +
         'C15.6 22.8 12.8 25.8 8.6 25.8 C5.8 25.8 3.6 24.6 2.2 22.6'],
  6: [18, 'M14 3.6 C12.6 2.6 11 2.2 9.4 2.2 C5 2.2 2.4 7 2.4 14.8 C2.4 21.8 5 25.8 9 25.8 ' +
         'C13 25.8 15.6 22.8 15.6 18.6 C15.6 14.4 13 11.6 9.2 11.6 C6.2 11.6 3.6 13.2 2.6 15.6'],
  7: [18, 'M2 2.2 H16 L7 28'],
  8: [18, 'M9 13.2 C5.4 13.2 3 11 3 7.7 C3 4.4 5.4 2.2 9 2.2 C12.6 2.2 15 4.4 15 7.7 C15 11 12.6 13.2 9 13.2 ' +
         'C4.8 13.2 2.2 15.8 2.2 19.5 C2.2 23.2 5 25.8 9 25.8 C13 25.8 15.8 23.2 15.8 19.5 C15.8 15.8 13.2 13.2 9 13.2 Z'],
  9: [18, 'M4 24.4 C5.4 25.4 7 25.8 8.6 25.8 C13 25.8 15.6 21 15.6 13.2 C15.6 6.2 13 2.2 9 2.2 ' +
         'C5 2.2 2.4 5.2 2.4 9.4 C2.4 13.6 5 16.4 8.8 16.4 C11.8 16.4 14.4 14.8 15.4 12.4'],
  '.': [6, '', [[3, 25.6]]],
  ',': [6, 'M4.6 25.6 L2.6 30.5', [[3, 25.6]]],
  ':': [6, '', [[3, 11], [3, 25.6]]],
  '!': [6, 'M3 0 V19', [[3, 25.6]]],
  '?': [16, 'M2.4 7 C2.4 4 5 2.2 8.4 2.2 C12 2.2 14.6 4.4 14.6 7.6 C14.6 10.6 12.6 12 10.4 13.4 ' +
          'C8.8 14.4 8.4 15.6 8.4 18.6', [[8.4, 25.6]]],
  '-': [12, 'M2 15 H10'],
  '—': [20, 'M2 15 H18'],
  "'": [6, 'M3 0 V8'],
  '/': [12, 'M1 28 L11 0'],
  '×': [14, 'M2.5 10 L11.5 21 M11.5 10 L2.5 21'],
  '&': [18, 'M15.5 28 L4.6 11.2 C3.6 9.6 3.2 8.4 3.2 7 C3.2 4.2 5.2 2.2 8 2.2 C10.6 2.2 12.4 4 12.4 6.4 ' +
          'C12.4 9.2 10 10.8 7.2 12.6 C4.2 14.6 2.2 16.6 2.2 20 C2.2 23.4 4.8 25.8 8.4 25.8 C12 25.8 14.6 23.6 16.2 19.4'],
  i: [6.4, 'M3.2 11 V28', [[3.2, 3]]],
};

export function layout(text) {
  const placed = [];
  let x = 0, joined = false;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) { x += SPACE; joined = false; continue; }
    if (joined) x += GAP;
    placed.push([g, x]);
    x += g[0];
    joined = true;
  }
  return { placed, width: x };
}

const round = (v, places) => Number(v.toFixed(places));

function fit(text, x, cap, align, maxWidth) {
  const { placed, width } = layout(text);
  const k = Math.min(cap / CELL, maxWidth / width);
  const shift = { left: 0, right: 1 }[align] ?? 0.5;
  const left = x - width * k * shift;
  return { placed, k, left };
}

export function svgLettering(text, x, y, { cap = CELL, paint = INK, gold = false, align = 'center', maxWidth = Infinity } = {}) {
  const { placed, k, left } = fit(text, x, cap, align, maxWidth);
  if (gold) paint = 'url(#letterGold)';
  return placed.map(([[, d, dots = []], dx]) => {
    const t = `translate(${round(left + dx * k, 2)} ${round(y - CELL * k, 2)}) scale(${round(k, 4)})`;
    const path = d ? `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${STROKE}" />` : '';
    const dot = dots.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${STROKE / 2 + 0.4}" fill="${paint}" />`).join('');
    return `<g transform="${t}">${path}${dot}</g>`;
  }).join('');
}

function strokeAll(ctx, placed, width, paint) {
  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;
  ctx.lineWidth = width;
  for (const [[, d, dots = []], dx] of placed) {
    ctx.save();
    ctx.translate(dx, 0);
    if (d) ctx.stroke(new Path2D(d));
    for (const [cx, cy] of dots) {
      ctx.beginPath();
      ctx.arc(cx, cy, width / 2 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawLettering(ctx, text, x, y, { cap = CELL, gold = false, align = 'center', maxWidth = Infinity } = {}) {
  const { placed, k, left } = fit(text, x, cap, align, maxWidth);
  ctx.save();
  ctx.translate(left, y - CELL * k);
  ctx.scale(k, k);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  if (gold) {
    const g = ctx.createLinearGradient(0, 0, 0, CELL);
    for (const [at, c] of BRASS) g.addColorStop(at, c);
    strokeAll(ctx, placed, STROKE + KEY * 2, KEYLINE);
    strokeAll(ctx, placed, STROKE, g);
  } else {
    strokeAll(ctx, placed, STROKE, INK);
  }
  ctx.restore();
}
