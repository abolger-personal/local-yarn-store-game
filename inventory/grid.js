export const EMPTY = -1;

const key = (g, s, c, r) => (s * g.rows + r) * g.cols + c;

/**
 * @param mask (shelf,col,row) => false for a hole
 * @param round (item index) => true for a ball or cone
 */
export function makeDisplay(cols, rows, opts = {}) {
  const { shelves = 1, headroom = 4, cell = 0.26, mask = null, round = null } = opts;
  const g = { cols, rows, cell, shelves, headroom, round, usable: null, piles: null };
  const n = shelves * cols * rows;
  g.usable = new Uint8Array(n);
  for (let s = 0; s < shelves; s++)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        g.usable[key(g, s, c, r)] = !mask || mask(s, c, r) ? 1 : 0;
  g.piles = Array.from({ length: n }, () => []);
  return g;
}

export const gridSize = (g) => ({ w: g.cols * g.cell, d: g.rows * g.cell });

export function usableAt(g, s, c, r) {
  if (s < 0 || s >= g.shelves || c < 0 || c >= g.cols || r < 0 || r >= g.rows) return false;
  return g.usable[key(g, s, c, r)] === 1;
}

export function footprint(g, s, [c, r], [w, h]) {
  const keys = [];
  for (let dr = 0; dr < h; dr++)
    for (let dc = 0; dc < w; dc++) {
      if (!usableAt(g, s, c + dc, r + dr)) return null;
      keys.push(key(g, s, c + dc, r + dr));
    }
  return keys;
}

export const dropLayer = (g, keys) => keys.reduce((m, k) => Math.max(m, g.piles[k].length), 0);

export const fits = (g, keys, layers = 1) =>
  keys !== null && dropLayer(g, keys) + layers <= g.headroom && restsOnCentres(g, keys);

export function restsOnCentres(g, keys) {
  if (!g.round) return true;
  const L = dropLayer(g, keys);
  if (L === 0) return true;
  const under = new Set(keys);
  const seen = new Set();
  for (const k of keys) {
    const index = g.piles[k].length === L ? g.piles[k][L - 1] : EMPTY;
    if (index === EMPTY || seen.has(index) || !g.round(index)) continue;
    seen.add(index);
    if (!centreKeys(g, k, L - 1, index).some((ck) => under.has(ck))) return false;
  }
  return true;
}

function centreKeys(g, k, layer, index) {
  const s = Math.floor(k / (g.cols * g.rows)), c = k % g.cols, r = Math.floor(k / g.cols) % g.rows;
  const same = (cc, rr) => usableAt(g, s, cc, rr) && g.piles[key(g, s, cc, rr)][layer] === index;
  const reach = (dc, dr) => { let n = 0; while (same(c + dc * (n + 1), r + dr * (n + 1))) n++; return n; };
  const c0 = c - reach(-1, 0), c1 = c + reach(1, 0), r0 = r - reach(0, -1), r1 = r + reach(0, 1);
  const mid = (a, b) => [Math.floor((a + b) / 2), Math.ceil((a + b) / 2)];
  const [ca, cb] = mid(c0, c1), [ra, rb] = mid(r0, r1);
  return [key(g, s, ca, ra), key(g, s, cb, ra), key(g, s, ca, rb), key(g, s, cb, rb)];
}

export function place(g, keys, index, layers = 1) {
  const L = dropLayer(g, keys);
  for (const k of keys) {
    while (g.piles[k].length < L) g.piles[k].push(EMPTY);
    for (let i = 0; i < layers; i++) g.piles[k][L + i] = index;
  }
  return L;
}

export function lift(g, keys) {
  for (const k of keys) {
    const pile = g.piles[k];
    const top = pile[pile.length - 1];
    while (pile.length && pile[pile.length - 1] === top) pile.pop();
    while (pile.length && pile[pile.length - 1] === EMPTY) pile.pop();
  }
}

export function topAt(g, s, c, r) {
  if (!usableAt(g, s, c, r)) return EMPTY;
  const p = g.piles[key(g, s, c, r)];
  return p.length ? p[p.length - 1] : EMPTY;
}

export function clearShelf(g, s) {
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      g.piles[key(g, s, c, r)] = [];
}

export function columnAt(g, x, z) {
  const { w, d } = gridSize(g);
  const c = Math.floor((x + w / 2) / g.cell);
  const r = Math.floor((z + d / 2) / g.cell);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return null;
  return { c, r };
}

export function slotRect(g, c, r, w, h) {
  const { w: W, d: D } = gridSize(g);
  return { x: (c + w / 2) * g.cell - W / 2, z: (r + h / 2) * g.cell - D / 2, w: w * g.cell, d: h * g.cell };
}

export function fullyExposed(display, items, index) {
  const item = items[index];
  for (let dr = 0; dr < (item.h ?? 1); dr++)
    for (let dc = 0; dc < (item.w ?? 1); dc++)
      if (topAt(display.g, item.shelf, item.c + dc, item.r + dr) !== index) return false;
  return true;
}

const outside = (rect, x, z) => Math.hypot(Math.max(0, Math.abs(rect.x - x) - rect.w / 2),
                                           Math.max(0, Math.abs(rect.z - z) - rect.d / 2));

const beats = (gap, score, best) =>
  gap < best.gap - 1e-9 || (gap <= best.gap + 1e-9 && score < best.score);

// reach and turnPenalty: inventory/DESIGN-DECISIONS.md §7, "Dropping"
export function nearestSlot(g, s, item, [x, z], { reach, turn = true, turnPenalty = 0.6 }) {
  let best = null;
  for (const o of orientations(item, turn, turnPenalty * g.cell))
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        const keys = footprint(g, s, [c, r], [o.w, o.h]);
        if (!fits(g, keys, item.layers ?? 1)) continue;
        const rect = slotRect(g, c, r, o.w, o.h);
        const gap = outside(rect, x, z);
        if (gap > reach) continue;
        const d = Math.hypot(rect.x - x, rect.z - z);
        const score = d + o.bias;
        if (best && !beats(gap, score, best)) continue;
        best = { c, r, keys, layer: dropLayer(g, keys), d, gap, score, turned: o.turned, w: o.w, h: o.h };
      }
  return best;
}

function orientations(item, turn, bias) {
  const asGiven = { w: item.w, h: item.h, turned: false, bias: 0 };
  if (!turn || item.w === item.h) return [asGiven];
  return [asGiven, { w: item.h, h: item.w, turned: true, bias }];
}

export function anySlot(g, item, { turn = true } = {}) {
  for (const o of orientations(item, turn, 0))
    for (let s = 0; s < g.shelves; s++) {
      const spot = slotOnShelf(g, s, item, o);
      if (spot) return spot;
    }
  return null;
}

function slotOnShelf(g, s, item, o) {
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const keys = footprint(g, s, [c, r], [o.w, o.h]);
      if (fits(g, keys, item.layers ?? 1)) return { shelf: s, c, r, keys, turned: o.turned, w: o.w, h: o.h };
    }
  return null;
}

// DISPLAYS.md rule 10
export function remask(g, mask) {
  for (let s = 0; s < g.shelves; s++)
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        const k = key(g, s, c, r);
        g.usable[k] = (mask(s, c, r) || g.piles[k].length > 0) ? 1 : 0;
      }
}
