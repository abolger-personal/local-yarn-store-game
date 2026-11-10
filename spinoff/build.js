// The build round's floor grid (REUSE-SPEC.md §Forts, Building is carrying blocks): a team's third cut into BRICK cells
// on inventory/grid.js, rebuilt from the bricks standing there, so the sim and the page find the same cells.
import { BRICK, PILE_DX, SHELF_WIDTH, floorTop, groundOf, overlaps, spotRect } from './match.js';
import { dropLayer, fits, footprint, makeDisplay, place, topAt } from '../inventory/grid.js';
import { clamp, flat } from './world.js';
import { event } from './donut-game.js';

/** Blocks a stack may hold: two is as tall as level 1's wall, which nobody hops (the playability check proves it). */
export const HEIGHT_LIMIT = 2;
/** The cell you face is the one this far in front of your body (a narrow fighter's middle is 0.225 back from its front)... */
export const PLACE_AHEAD = 0.225;
/** ...or, where that one can't take a block (a deck, the fence, the edge), the one this far in front, at your feet. */
export const PLACE_NEAR = 0.2;
const EDGE = 0.01;

/** @typedef {{ x: number, y: number, z: number }} P3 */

/** The one floor top under the whole of a cell, or null when it straddles two (or the stage's edge). */
function cellTop(stage, x0, z0) {
  const tops = [[EDGE, EDGE], [BRICK - EDGE, EDGE], [EDGE, BRICK - EDGE], [BRICK - EDGE, BRICK - EDGE]].map(([dx, dz]) => floorTop(stage, x0 + dx, z0 + dz));
  return tops.every((t) => t !== null && t === tops[0]) ? tops[0] : null;
}

const cellOf = (grid, p) => ({ c: Math.floor((p.x - grid.ox) / BRICK + 1e-6), r: Math.floor((p.z - grid.oz) / BRICK + 1e-6) });
/** A brick's (or point's) cell keys, or null outside the buildable cells. */
const cellKeys = (grid, p) => { const { c, r } = cellOf(grid, p); return footprint(grid.g, 0, [c, r], [1, 1]); };

/**
 * `team`'s third on the world's BRICK grid: a cell is buildable when one floor top lies under all of it and it keeps
 * clear of the shelves and the start spots in use (each pile's); each stack holds the bricks standing in it, by their
 * index in `bricks`.
 * @param {import('./match.js').Stage} stage @param {import('./match.js').Team} team @param {readonly P3[]} bricks
 * @param {readonly { x: number, z: number }[]} piles
 */
export function fortGrid(stage, team, bricks, piles) {
  const zone = stage.zones.find((z) => z.team === team), ground = groundOf(stage);
  const ox = Math.ceil(zone.x0 / BRICK - 1e-9) * BRICK, oz = stage.backWall;
  const cols = Math.floor((zone.x1 - ox) / BRICK + 1e-9), rows = Math.floor((ground.z1 - oz) / BRICK + 1e-9);
  const keep = [...piles.map((p) => spotRect({ x: p.x - PILE_DX, z: p.z })), ...stage.shelves.map((sh) => ({ x0: sh.x - SHELF_WIDTH / 2, x1: sh.x + SHELF_WIDTH / 2, z0: oz, z1: sh.z + EDGE }))];
  const tops = Array.from({ length: cols * rows }, (_, k) => {
    const x0 = ox + (k % cols) * BRICK, z0 = oz + Math.floor(k / cols) * BRICK;
    const rect = { x0, x1: x0 + BRICK, z0, z1: z0 + BRICK };
    return keep.some((q) => overlaps(rect, q)) ? null : cellTop(stage, x0, z0);
  });
  const g = makeDisplay(cols, rows, { cell: BRICK, headroom: HEIGHT_LIMIT, mask: (_, c, r) => tops[r * cols + c] !== null });
  const grid = { g, ox, oz, cols, rows, tops };
  [...bricks.keys()].sort((a, b) => bricks[a].y - bricks[b].y).forEach((i) => {
    const keys = cellKeys(grid, bricks[i]);
    if (keys) place(g, keys, i);
  });
  return grid;
}

/** @typedef {{ x: number, y: number, z: number, facing: number, width: number }} Facing */

/** @param {Facing} f */
function cellAhead(grid, f, ahead) {
  const p = { x: f.x + Math.cos(f.facing) * ahead, z: f.z + Math.sin(f.facing) * ahead };
  const keys = cellKeys(grid, p), { c, r } = cellOf(grid, p);
  if (!keys || Math.abs(grid.tops[r * grid.cols + c] - f.y) > EDGE) return null;
  return { x: grid.ox + c * BRICK, y: grid.tops[r * grid.cols + c] + dropLayer(grid.g, keys) * BRICK, z: grid.oz + r * BRICK, ok: fits(grid.g, keys) };
}

/**
 * The cell in front of a fighter standing on a floor, where ⬇️ puts a block: its corner and the height the block
 * would sit at, and `ok` while the stack there is under the height limit. Null when neither the cell ahead nor the
 * one at your feet can be built on from the floor the fighter stands on.
 * @param {Facing} f
 * @returns {{ x: number, y: number, z: number, ok: boolean }|null}
 */
export const facedCell = (grid, f) => cellAhead(grid, f, f.width / 2 + PLACE_AHEAD) ?? cellAhead(grid, f, PLACE_NEAR);

/** The buildable cell under point `p`: its corner on the floor, or null where no block can go. @param {{ x: number, z: number }} p */
export function cellUnder(grid, p) {
  if (!cellKeys(grid, p)) return null;
  const { c, r } = cellOf(grid, p);
  return { x: grid.ox + c * BRICK, y: grid.tops[r * grid.cols + c], z: grid.oz + r * BRICK };
}

/** Whether brick `i` (its index in the bricks the grid was built from) is on top of its stack. */
export function onTop(grid, bricks, i) {
  const { c, r } = cellOf(grid, bricks[i]);
  return topAt(grid.g, 0, c, r) === i;
}

// The build round itself (REUSE-SPEC.md §Forts): piles, fetching and placing blocks, 👍 and the start. Reports what
// happened on the match's event channels: `s.fullBag` (a shake: can't do that) and `s.donutEvents` ('place', 'fetch').

/** Each hero's pile beside where it starts, `pieces` blocks in its icing. */
export const pilesFor = (fighters, pieces) => fighters.filter((f) => f.team === 'heroes' && !f.dummy)
  .map((f) => ({ owner: f.id, x: f.x + PILE_DX, y: f.y, z: f.z, count: pieces, icing: f.icing }));

/** How close to its pile, or past a block's edge, a fighter reaches to pick a block up. */
const FETCH_REACH = 0.35;
const BLOCK_HITS = 2;

function shake(s, f) { s.fullBag.push(event(f, f)); }

/** ⬇️: the carried block goes on the faced cell of your own third, unless the stack there is at the height limit. */
function putDown(s, f) {
  const cell = f.block && f.onGround ? facedCell(fortGrid(s.stage, f.team, s.bricks, s.piles), { ...f, width: f.w }) : null;
  if (!cell?.ok) { shake(s, f); return; }
  s.bricks.push({ id: `p${s.nextBrick++}`, team: f.team, owner: f.id, x: cell.x, y: cell.y, z: cell.z, vy: 0,
    hits: BLOCK_HITS, maxHits: BLOCK_HITS, icing: f.block });
  f.block = null;
  f.placeCell = null;
  // a block tapped while carrying was only to face it: it isn't taken back the moment your hands are empty
  if (f.target?.thing === 'brick') f.target = null;
  s.donutEvents.push({ ...event(f, { x: cell.x + BRICK / 2, y: cell.y, z: cell.z + BRICK / 2 }), kind: 'place' });
}

/** Arriving empty-handed at your pile takes a block from it; at your own block on top of a stack, takes that back. */
export function fetchStep(s, f) {
  if (f.block || !f.target) return;
  if (f.target.thing === 'pile') fromPile(s, f);
  if (f.target?.thing === 'brick') fromStack(s, f, f.target.id);
}

function fromPile(s, f) {
  const pile = s.piles.find((p) => p.owner === f.id);
  if (!pile?.count || flat(f, pile) > f.r + FETCH_REACH) return;
  pile.count--;
  take(s, f, pile.icing, pile);
}

function fromStack(s, f, id) {
  const i = s.bricks.findIndex((b) => b.id === id), b = s.bricks[i];
  if (!b || !f.nav?.done || flat(f, { x: clamp(f.x, b.x, b.x + BRICK), z: clamp(f.z, b.z, b.z + BRICK) }) > f.r + FETCH_REACH) return;
  f.target = null;
  if (b.owner !== f.id || !onTop(fortGrid(s.stage, f.team, s.bricks, s.piles), s.bricks, i)) { shake(s, f); return; }
  s.bricks = s.bricks.filter((o) => o !== b);
  take(s, f, b.icing, { x: b.x + BRICK / 2, y: b.y, z: b.z + BRICK / 2 });
}

function take(s, f, icing, from) {
  f.block = icing;
  f.target = null;
  s.donutEvents.push({ ...event(f, from), kind: 'fetch' });
}

/** 👍 and its take-back, and the 2-second hold that starts the round for everyone. */
export function readyInput(s, f, input) {
  if (input.ready === true) s.ready.add(f.id);
  if (input.ready === false) s.ready.delete(f.id);
  if (input.go) s.go = true;
  if (input.drop) putDown(s, f);
}

/** The round starts when every hero here has 👍 (CPU bad guys are ready at once), or someone held 👍: piles and carried blocks go. */
export function startWhenReady(s) {
  const heroes = s.fighters.filter((f) => f.team === 'heroes' && !f.dummy && !f.away);
  if (!s.go && !(heroes.length && heroes.every((f) => s.ready.has(f.id)))) return;
  Object.assign(s, { phase: 'play', t0: s.tick, piles: [], go: false });
  s.ready.clear();
  for (const f of s.fighters) f.block = null;
}
