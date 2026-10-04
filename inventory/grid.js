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
 * @param round (item index) => boolean — is that item round (a yarn ball or cone)? Anything resting
 *   on a round item has to cover its centre; see restsOnCentres. Omit and everything is flat.
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
  g.piles = Array.from({ length: n }, () => []);   // pile[layer] = item index, bottom→top
  return g;
}

export const gridSize = (g) => ({ w: g.cols * g.cell, d: g.rows * g.cell });

export function usableAt(g, s, c, r) {
  if (s < 0 || s >= g.shelves || c < 0 || c >= g.cols || r < 0 || r >= g.rows) return false;
  return g.usable[key(g, s, c, r)] === 1;
}

/** Column keys a footprint [w, h] at cell [c, r] would cover, or null if any cell is off-grid or masked. */
export function footprint(g, s, [c, r], [w, h]) {
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
  keys !== null && dropLayer(g, keys) + layers <= g.headroom && restsOnCentres(g, keys);

/**
 * Does every ROUND item this footprint would rest on have a centre cell under it?
 *
 * A ball or cone is round, so only the middle of its top is a surface. A box laid wide across
 * three cells is still on it as long as one of them is that middle; one set on the rim of a 3x3
 * ball is drawn hanging in the air. Each round support is checked, so a box half on a flat box
 * and half on a ball's rim hangs too. Flat supports are unrestricted.
 *
 * The support's extent is read off the grid itself — its own index fills a rectangle at its top
 * layer — so there is no per-item bookkeeping here to fall out of step with the piles.
 */
export function restsOnCentres(g, keys) {
  if (!g.round) return true;
  const L = dropLayer(g, keys);
  if (L === 0) return true;
  const under = new Set(keys);
  const seen = new Set();
  for (const k of keys) {
    const index = g.piles[k].length === L ? g.piles[k][L - 1] : EMPTY;   // shorter = bridged over
    if (index === EMPTY || seen.has(index) || !g.round(index)) continue;
    seen.add(index);
    if (!centreKeys(g, k, L - 1, index).some((ck) => under.has(ck))) return false;
  }
  return true;
}

/**
 * The cell(s) holding the centre of the item `index`, which tops column `k` at `layer`: the middle
 * one along an odd side, both middle ones along an even side — a 2x2's centre is a corner all
 * four of its cells touch, so any overlap with one rests on it.
 */
function centreKeys(g, k, layer, index) {
  const s = Math.floor(k / (g.cols * g.rows)), c = k % g.cols, r = Math.floor(k / g.cols) % g.rows;
  const same = (cc, rr) => usableAt(g, s, cc, rr) && g.piles[key(g, s, cc, rr)][layer] === index;
  const reach = (dc, dr) => { let n = 0; while (same(c + dc * (n + 1), r + dr * (n + 1))) n++; return n; };
  const c0 = c - reach(-1, 0), c1 = c + reach(1, 0), r0 = r - reach(0, -1), r1 = r + reach(0, 1);
  const mid = (a, b) => [Math.floor((a + b) / 2), Math.ceil((a + b) / 2)];
  const [ca, cb] = mid(c0, c1), [ra, rb] = mid(r0, r1);
  return [key(g, s, ca, ra), key(g, s, cb, ra), key(g, s, ca, rb), key(g, s, cb, rb)];
}

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
 * Is every cell of this item's footprint topped by the item itself?
 *
 * A package bridging two columns with something stacked on its other half is NOT exposed: lifting
 * it would pop that column too and evict whatever sits on it. Both the NPC's "can I notice this"
 * test and the player's pick need the same answer, and it is pure grid occupancy — no NPC, no
 * scene — so it lives here rather than in either caller.
 */
export function fullyExposed(display, items, index) {
  const item = items[index];
  for (let dr = 0; dr < (item.h ?? 1); dr++)
    for (let dc = 0; dc < (item.w ?? 1); dc++)
      if (topAt(display.g, item.shelf, item.c + dc, item.r + dr) !== index) return false;
  return true;
}

/** How far (x, z) lies outside a slot rect — 0 anywhere on it. */
const outside = (rect, x, z) => Math.hypot(Math.max(0, Math.abs(rect.x - x) - rect.w / 2),
                                           Math.max(0, Math.abs(rect.z - z) - rect.d / 2));

/** Nearer the footprint first; equally near (both under the point, usually), more centred. */
const beats = (gap, score, best) =>
  gap < best.gap - 1e-9 || (gap <= best.gap + 1e-9 && score < best.score);

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
 * UNDER the point first: a footprint that covers it beats one that does not, however centred, and
 * `reach` is how far outside a footprint's edge the point may be. Ranking by centre distance alone
 * put the drop wherever the nearest legal CENTRE was — for a 3x3 aimed at a corner cell, more than
 * 1.6 slots off and so nowhere at all, though a 3x3 covering that cell was free — and the player
 * could not predict where a click would land. Among the footprints that do cover it, the most
 * CENTRED wins, so a 3x3 centres on the pointer's cell and a 2x2 takes the side of the cell the
 * pointer is nearer.
 */
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
        // Then by distance PLUS the turn's bias, so a turn has to actually earn itself. Report the
        // plain distance, since that is what a caller means by "how close was this".
        const score = d + o.bias;
        if (best && !beats(gap, score, best)) continue;
        best = { c, r, keys, layer: dropLayer(g, keys), d, gap, score, turned: o.turned, w: o.w, h: o.h };
      }
  return best;
}

/**
 * The orientations a footprint may be tried in: as given, and turned a quarter turn.
 *
 * A 2x1 package simply does not fit a one-column peg board, but a 1x2 obviously does, and making
 * the player rotate it first is asking them to do the search by hand. So the snap does the search.
 *
 * The turn carries a small distance PENALTY rather than being free. Without it, a turned slot half
 * a millimetre nearer would win and things would spin as the pointer wandered — the placement has
 * to be predictable, so a turn should happen when it is *needed*, not when it is marginally
 * closer. 0.6 of a slot is enough that the unturned fit wins wherever one exists nearby.
 *
 * A square footprint is skipped rather than turned. That is a COST guard, not a correctness one:
 * a turned square is the same square, so the penalty would make it lose anyway — it would just
 * double the search first. No test can fail on it, which is why this says so.
 */
function orientations(item, turn, bias) {
  const asGiven = { w: item.w, h: item.h, turned: false, bias: 0 };
  if (!turn || item.w === item.h) return [asGiven];
  return [asGiven, { w: item.h, h: item.w, turned: true, bias }];
}

/**
 * Anywhere on this display at all, on any shelf, that `item` fits — or null.
 *
 * Turns too, and must: this is what the "this display is full" warning is built on, and telling
 * the player a display cannot take an item that would fit perfectly well sideways is worse than
 * saying nothing.
 */
export function anySlot(g, item, { turn = true } = {}) {
  for (const o of orientations(item, turn, 0))
    for (let s = 0; s < g.shelves; s++) {
      const spot = slotOnShelf(g, s, item, o);
      if (spot) return spot;
    }
  return null;
}

/** The first slot on shelf `s` that `item` fits, in orientation `o` — or null. */
function slotOnShelf(g, s, item, o) {
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const keys = footprint(g, s, [c, r], [o.w, o.h]);
      if (fits(g, keys, item.layers ?? 1)) return { shelf: s, c, r, keys, turned: o.turned, w: o.w, h: o.h };
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
