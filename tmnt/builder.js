// REUSE-SPEC.md §Build my playground: a kid's own playground, as the pieces they placed and where. A piece goes only
// where it works: one that starts on the ground, on the ground; one that starts up high, off the end or a side of a
// piece that leaves you that high. Engine-free: the builder's page draws it, the level plays it.
import { BAND, along, corner, emptyLevel, fits, landsOn, place, r3, shared, slicesOf, strip } from './generate.js';
import { FT, PIECES, joins } from './pieces.js';

/** @typedef {{ x: number, z: number, h: number }} Cursor  where a piece starts, and its heading in degrees */
/** @typedef {{ id: string, at: Cursor, colour?: string }} Placed  `colour`: the builder's, for this piece */

/** The colours a piece can be: loud ones, as the heroes' clothes. */
export const PAINTS = Object.freeze(['#f0b648', '#ff6a00', '#e0245e', '#b51a00', '#874efe', '#0056d6', '#1fb8c9', '#2a7f6f', '#7ac943', '#f5ec00', '#ffffff', '#3a3a3a']);
const HEX = /^#[0-9a-f]{6}$/i, COLOURED = ['floors', 'climbs', 'rides', 'stairs', 'swings'];

/** max: pieces to a playground; x0..x1: where along the ground pieces may stand; step, lanes: the ground's snap spots;
 *  end: the ground past the last piece, to the gate. */
export const BUILD = Object.freeze({ max: 100, x0: 3, x1: 110, step: 0.5, lanes: Object.freeze([-1.1, 0, 1.1]), end: 4, least: 12 });
const KEY = 'tmnt.playground.v1', PAINT_KEY = 'tmnt.playground.paint.v1';

const runOf = (q) => strip(q.at, 0, PIECES[q.id].w * FT);
/** Where each placed piece ends, as a cursor. */
const endOf = (q) => ({ ...along(q.at, PIECES[q.id].w * FT), h: q.at.h });

/** Can piece `id` start at `c`: its run in the band, on the buildable ground, and over no other piece's? */
function free(placed, id, c) {
  const len = PIECES[id].w * FT, box = strip(c, 0, len);
  return fits(c, len) && box.x0 >= BUILD.x0 - 1e-6 && box.x1 <= BUILD.x1 + 1e-6 && Math.abs(c.z) <= BAND.z1
    && !placed.some((q) => shared(box, runOf(q)) > 0.01);
}

function groundSpots() {
  const spots = [];
  for (let x = /** @type {number} */ (BUILD.x0); x <= BUILD.x1; x = r3(x + BUILD.step)) for (const z of BUILD.lanes) spots.push({ x, z, h: 0 });
  return spots;
}

/** Does piece `p` start with somewhere to stand, so it can be jumped up or stepped down onto? A slide, a pole's or stairs'
 *  top doesn't: it needs a deck at its own height to come off. */
const deckAt = (p) => Boolean(p.bridge) || (p.decks ?? []).some((d) => d.y === p.in);

/** Off the end of placed piece `q`, straight on and round each side, for piece `p`. */
function endSpots(q, p) {
  const { out } = PIECES[q.id];
  if (out === 0 || !(deckAt(p) ? joins(out, p.in) : out === p.in)) return [];
  const e = endOf(q);
  return [0, 90, -90].map((d) => e.h + d).filter((h) => Math.abs(h) <= 90).map((h) => corner(e, h));
}

/**
 * Everywhere piece `id` can go in the playground so far; none, and the builder hides its button.
 * @param {Placed[]} placed @param {string} id @returns {Cursor[]}
 */
export function spotsFor(placed, id) {
  const p = PIECES[id];
  if (!p || placed.length >= BUILD.max) return [];
  const up = placed.flatMap((q) => endSpots(q, p)), ground = p.in === 0 || landsOn(p) ? groundSpots() : [];
  return [...up, ...ground].filter((c) => free(placed, id, c));
}

/** The middle of piece `id` laid from `c`: what a finger drags. */
export const middleOf = (id, c) => along(c, (PIECES[id].w * FT) / 2);

/** The spot of `spots` whose piece's middle is nearest the point a finger let go at, or null. @param {Cursor[]} spots */
export function snap(spots, id, at) {
  const far = (c) => Math.hypot(middleOf(id, c).x - at.x, middleOf(id, c).z - at.z);
  return spots.reduce((best, c) => (!best || far(c) < far(best) ? c : best), null);
}

/** The playground as a level to play: its pieces, the ground out to the gate past the last of them, pizza slices
 *  where the generator hangs them; each piece's parts in its colour. @param {Placed[]} placed */
export function builtLevel(placed) {
  const L = emptyLevel(), good = placed.filter((q) => PIECES[q.id]);
  for (const q of good) {
    const from = COLOURED.map((k) => L[k].length);
    place(L, PIECES[q.id], q.at);
    if (q.colour) COLOURED.forEach((k, i) => { for (const part of L[k].slice(from[i])) part.colour = q.colour; });
  }
  const x = r3(Math.max(BUILD.least, ...good.map((q) => runOf(q).x1 + BUILD.end)));
  L.floors.unshift({ kind: 'ground', x0: 0, x1: x, z0: BAND.z0, z1: BAND.z1, y: 0 });
  Object.assign(L.ringOut, { x1: r3(x + 2) });
  L.slices = slicesOf(L);
  return L;
}

const cursorOf = (c) => (c && [c.x, c.z, c.h].every(Number.isFinite) ? { x: c.x, z: c.z, h: c.h } : null);
/** A saved playground read back: only pieces there are, each where it can still go, in order. @returns {Placed[]} */
export function readPlayground(raw) {
  /** @type {Placed[]} */
  const placed = [];
  for (const q of Array.isArray(raw?.placed) ? raw.placed : []) {
    const at = cursorOf(q?.at);
    if (at && PIECES[q.id] && spotsFor(placed, q.id).some((c) => c.x === at.x && c.z === at.z && c.h === at.h)) placed.push({ id: q.id, at, ...(HEX.test(q.colour) && { colour: q.colour }) });
  }
  return placed;
}
/** The playground with its `i`th piece taken away, and with it any piece that was standing on it and now has nowhere to. */
export const without = (placed, i) => readPlayground({ placed: placed.filter((_, k) => k !== i) });

export function loadPlayground() {
  try { return readPlayground(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return []; }
}
/** @param {Placed[]} placed */
export function savePlayground(placed) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, placed })); } catch {}
}
/** The colour the builder last had in hand. */
export function loadPaint() {
  try { return PAINTS.find((c) => c === localStorage.getItem(PAINT_KEY)) ?? PAINTS[0]; } catch { return PAINTS[0]; }
}
export function savePaint(colour) {
  try { localStorage.setItem(PAINT_KEY, colour); } catch {}
}
