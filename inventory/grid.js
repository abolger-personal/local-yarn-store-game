// Display slot model: shelves × columns, with free stacking on each shelf.
//
// Pure: no three.js, no DOM. This is the `sim/grid` layer from DESIGN-DECISIONS.md — it decides
// WHERE things sit; notions.js decides how they look. Node-testable (see grid.test.mjs).
//
// A display is O shelves at fixed heights. Each shelf is a cols×rows lattice of columns. Items have
// a footprint (1×1, 2×1, 1×2, 2×2) and stack within a shelf up to `headroom` layers. A masked-off
// slot is a hole — a shop window or a fancy shelf where only certain positions are available.

export const EMPTY = -1;

const key = (g, s, c, r) => (s * g.rows + r) * g.cols + c;

/**
 * @param mask (shelf,col,row) => boolean — false makes that slot a hole. Omit for a full lattice.
 */
export function makeDisplay(cols, rows, opts = {}) {
  const { shelves = 1, headroom = 4, cell = 0.26, mask = null } = opts;
  const g = { cols, rows, cell, shelves, headroom, usable: null, piles: null };
  const n = shelves * cols * rows;
  g.usable = new Uint8Array(n);
  for (let s = 0; s < shelves; s++)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        g.usable[key(g, s, c, r)] = mask ? (mask(s, c, r) ? 1 : 0) : 1;
  g.piles = Array.from({ length: n }, () => []);   // pile[layer] = item index, bottom→top
  return g;
}

export const gridSize = (g) => ({ w: g.cols * g.cell, d: g.rows * g.cell });

export function usableAt(g, s, c, r) {
  if (s < 0 || s >= g.shelves || c < 0 || c >= g.cols || r < 0 || r >= g.rows) return false;
  return g.usable[key(g, s, c, r)] === 1;
}

/** Column keys a footprint would cover, or null if any cell is off-grid or masked. */
export function footprint(g, s, c, r, w, h) {
  const keys = [];
  for (let dr = 0; dr < h; dr++)
    for (let dc = 0; dc < w; dc++) {
      if (!usableAt(g, s, c + dc, r + dr)) return null;
      keys.push(key(g, s, c + dc, r + dr));
    }
  return keys;
}

/** Layer a footprint rests at: on top of the tallest column it covers (it bridges shorter ones). */
export const dropLayer = (g, keys) => keys.reduce((m, k) => Math.max(m, g.piles[k].length), 0);

/**
 * Can this footprint be placed — cells all exist AND the tallest column it covers has room for all
 * `layers` of it. A tall item needs tall clearance: YARN.md runs from 1x1x1 up to 3x3x3, and a
 * super-bulky ball that is three cells wide is three layers high as well.
 */
export const fits = (g, keys, layers = 1) =>
  keys !== null && dropLayer(g, keys) + layers <= g.headroom;

/** Place item into its columns; returns the layer it landed on. Assumes fits() is true. */
export function place(g, keys, index, layers = 1) {
  const L = dropLayer(g, keys);
  for (const k of keys) {
    while (g.piles[k].length < L) g.piles[k].push(EMPTY);   // bridge over a shorter neighbour
    // The same index occupies every layer it is tall, so anything stacked on top of it lands on
    // its ACTUAL surface rather than clipping through it, and topAt still answers in O(1).
    for (let i = 0; i < layers; i++) g.piles[k][L + i] = index;
  }
  return L;
}

/** Remove a top item from its columns. Only the top of a column is ever grabbable, so this pops. */
export function lift(g, keys) {
  for (const k of keys) {
    const pile = g.piles[k];
    // Pop EVERY layer this item occupies, not just one — a three-layer ball would otherwise leave
    // two ghost layers behind, and the column would never come back down.
    const top = pile[pile.length - 1];
    while (pile.length && pile[pile.length - 1] === top) pile.pop();
    while (pile.length && pile[pile.length - 1] === EMPTY) pile.pop();
  }
}

/** Top item index at a column, or EMPTY. This is the O(1) pick: one column lookup, no item raycast. */
export function topAt(g, s, c, r) {
  if (!usableAt(g, s, c, r)) return EMPTY;
  const p = g.piles[key(g, s, c, r)];
  return p.length ? p[p.length - 1] : EMPTY;
}

/** Empty every column on one shelf. "Tidy up" rebuilds a shelf from scratch rather than lifting
 *  items one at a time in a carefully-ordered way. */
export function clearShelf(g, s) {
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      g.piles[key(g, s, c, r)] = [];
}

/** Column under a surface point (shelf-local x,z), or null if outside the lattice bounds. */
export function columnAt(g, x, z) {
  const { w, d } = gridSize(g);
  const c = Math.floor((x + w / 2) / g.cell);
  const r = Math.floor((z + d / 2) / g.cell);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return null;
  return { c, r };
}

/** Footprint centre + size in shelf-local space (y is the caller's job — shelf base + layer). */
export function slotRect(g, c, r, w, h) {
  const { w: W, d: D } = gridSize(g);
  return { x: (c + w / 2) * g.cell - W / 2, z: (r + h / 2) * g.cell - D / 2, w: w * g.cell, d: h * g.cell };
}

/**
 * The slot a drop should land in: the nearest one on this shelf that `item` ACTUALLY FITS IN,
 * within `reach` (in the display's own units) of the point (x,z). Null if nothing fits in range.
 *
 * Not the same question as columnAt, and the difference is the whole point. columnAt answers
 * "which cell is under the pointer", which asks the input for a precision it does not have: a slot
 * is a couple of dozen pixels once a diorama angle foreshortens it, against a fingertip that lands
 * somewhere inside forty or fifty. Worse, the honest answer is often "a column that is full", and
 * a drop that silently does nothing is indistinguishable from a broken one.
 *
 * Reach is measured in the display's plane rather than on screen deliberately: it is then a fixed
 * number of SLOTS, which is what the player is reasoning about, and it does not drift with zoom.
 *
 * Anchored on the footprint CENTRE, so a 2x2 package centres on the pointer rather than hanging
 * off one corner of it.
 */
export function nearestSlot(g, s, item, x, z, reach) {
  let best = null;
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const keys = footprint(g, s, c, r, item.w, item.h);
      if (!fits(g, keys, item.layers ?? 1)) continue;
      const rect = slotRect(g, c, r, item.w, item.h);
      const d = Math.hypot(rect.x - x, rect.z - z);
      if (d > reach || (best && d >= best.d)) continue;
      best = { c, r, keys, layer: dropLayer(g, keys), d };
    }
  return best;
}

/** Anywhere on this display at all, on any shelf, that `item` fits — or null. */
export function anySlot(g, item) {
  for (let s = 0; s < g.shelves; s++)
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        const keys = footprint(g, s, c, r, item.w, item.h);
        if (fits(g, keys, item.layers ?? 1)) return { shelf: s, c, r, keys };
      }
  return null;
}

/**
 * Recompute which slots are holes, for a display that has MOVED (DISPLAYS.md rule 10). A cell that
 * is holding stock is never revoked however the mask votes: the move brought its inventory with it,
 * and there is nowhere to evict it to.
 */
export function remask(g, mask) {
  for (let s = 0; s < g.shelves; s++)
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        const k = key(g, s, c, r);
        g.usable[k] = (mask(s, c, r) || g.piles[k].length > 0) ? 1 : 0;
      }
}
