// The stage as terrain: the solids a body stands on and is pushed out of, the patches it stands in (syrup, butter,
// trampolines), the band it stays in (REUSE-SPEC.md §Navigation). Knows nothing of fighting or donuts: any game on these
// stages can use it. State it reads: `s.stage`, `s.band`, `s.solids`; bricks: `s.bricks`, `s.floorBoxes`.
import { BRICK, TICK_HZ, coreOf, groundOf, outside } from './match.js';

export const DT = 1 / TICK_HZ;
export const EPS = 1e-6;
export const STEP = 0.01;
const PUSH_PASSES = 4;

export const GRAVITY = 30;

export const LEDGE_MARGIN = 0.05;
export const CELL = 0.2;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const inXZ = (b, x, z) => outside(b, x, z) === 0;
export const floorBox = (f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: -Infinity, y1: f.y, round: f.round, kind: 'floor' });
export const brickBox = (b) => ({ x0: b.x, x1: b.x + BRICK, z0: b.z, z1: b.z + BRICK, y0: b.y, y1: b.y + BRICK, kind: 'brick' });

/** The index of the patch in `list` that (x, z) on the top at y stands in, or within `grow` of; -1 if none. */
export const patchAt = (s, list, p, grow = 0) => (list ?? []).findIndex((q) => Math.abs(p.y - (q.y ?? s.band.y)) <= STEP
  && Math.hypot(p.x - q.x, p.z - q.z) < q.r + grow);

export const inStage = ({ band }, p) => {
  p.x = clamp(p.x, band.x0 + LEDGE_MARGIN, band.x1 - LEDGE_MARGIN);
  p.z = Math.min(p.z, band.z1 - LEDGE_MARGIN);
};

/** The ground's x/z extent from the back wall, its height, and its floor grid's size. @param {import('./match.js').Stage} stage */
export function bandOf(stage) {
  const g = groundOf(stage), z0 = stage.backWall;
  return { x0: g.x0, x1: g.x1, z0, z1: g.z1, y: g.y, nx: Math.round((g.x1 - g.x0) / CELL), nz: Math.round((g.z1 - z0) / CELL) };
}

/** The highest top under (x, z) no higher than maxY. */
export function supportAt(list, x, z, maxY) {
  let top = -Infinity;
  for (const b of list) if (inXZ(b, x, z) && b.y1 <= maxY + STEP && b.y1 > top) top = b.y1;
  return top;
}

function escapeBox(p, b, r) {
  const ways = [[p.x - b.x0, 'x', b.x0 - r], [b.x1 - p.x, 'x', b.x1 + r], [p.z - b.z0, 'z', b.z0 - r], [b.z1 - p.z, 'z', b.z1 + r]];
  const [, axis, v] = ways.reduce((a, w) => (w[0] < a[0] ? w : a));
  p[axis] = v;
}

function pushOnce(s, p, r, h) {
  let moved = false;
  for (const b of s.solids) {
    if (p.y >= b.y1 - STEP || p.y + h <= b.y0) continue;
    const q = coreOf(b, p.x, p.z), d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d >= r + q.r) continue;
    moved = true;
    if (d > EPS) {
      p.x = q.x + ((p.x - q.x) / d) * (r + q.r);
      p.z = q.z + ((p.z - q.z) / d) * (r + q.r);
    } else escapeBox(p, b, r);
  }
  p.z = Math.max(p.z, s.band.z0 + r);
  return moved;
}

// ponytail: a few passes, so a body wedged between many boxes could still end inside one; a proper depenetration solve if forts get dense
/** Pushes a body (circle r in x/z, h tall, feet at p.y) out of every solid it overlaps, and off the back wall. */
export function pushOut(s, p, r, h) {
  for (let pass = 0; pass < PUSH_PASSES; pass++) if (!pushOnce(s, p, r, h)) return;
}

export function floorFor(s, x, z, y) {
  let best = null;
  for (const fl of s.stage.floors)
    if (inXZ(fl, x, z) && (!best || Math.abs(fl.y - y) < Math.abs(best.y - y))) best = fl;
  return best ? best.y : s.band.y;
}

// bricks are terrain that falls: one knocked out from under drops the one above (REUSE-SPEC.md §Forts)
function brickFloor(s, b) {
  let floor = supportAt(s.floorBoxes, b.x + BRICK / 2, b.z + BRICK / 2, b.y);
  for (const o of s.bricks)
    if (o !== b && Math.abs(o.x - b.x) < BRICK - EPS && Math.abs(o.z - b.z) < BRICK - EPS && o.y + BRICK <= b.y + EPS)
      floor = Math.max(floor, o.y + BRICK);
  return floor;
}

export function settleBricks(s) {
  for (const b of [...s.bricks].sort((p, q) => p.y - q.y)) {
    const floor = brickFloor(s, b);
    b.vy = b.y <= floor + EPS ? 0 : b.vy - GRAVITY * DT;
    b.y = Math.max(floor, b.y + b.vy * DT);
    if (b.y === floor) b.vy = 0;
  }
}
