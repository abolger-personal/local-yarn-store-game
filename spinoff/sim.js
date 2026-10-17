// The match host: one fixed tick of pure logic, no three.js, no Math.random. REUSE-SPEC.md §Milestones 1.
// The stage is a depth band (§Navigation): fighters walk in x/z on floor tops and jump in y.
import { BRICK, DONUTS_PER_SHELF, HITSTOP_TICKS, HIT_DEPTH, PILE_DX, ROUND_SECONDS, TICK_HZ, coreOf, groundOf, outside } from './match.js';
import { EMPTY, anySlot, footprint, gridSize, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { MATCH, canHit } from './roster.js';
import { facedCell, fortGrid, onTop } from './build.js';

const DT = 1 / TICK_HZ;
const EPS = 1e-6;
const STEP = 0.01;
const PUSH_PASSES = 4;
export const GRAVITY = 30;
export const WALK_SPEED = 3.5;
export const AIR_SPEED = 4;
/** Walking speed is multiplied by this while standing in syrup (REUSE-SPEC.md §Forts, Level 1). */
export const SYRUP_SLOW = 0.45;
export const JUMP_SPEED = 10;
/** A route jumps up at most this share of a jump's height (v²/2g), leaving time to get over the edge: 1.3 at JUMP_SPEED. */
export const JUMP_MARGIN = 0.78;
/** A trampoline's launch goes this many times as high as the stage's jump (REUSE-SPEC.md §Stages and difficulty are separate). */
export const SPRING_LIFT = 2;
/** On butter the velocity closes this share of the gap to the wanted one each tick, so you slide on and turn slowly... */
export const BUTTER_GRIP = 0.05;
/** ...and the wanted speed toward the target is at most distance × this a second, so you overshoot a little and come back. */
export const BUTTER_BRAKE = 2.5;
const SETTLE = 0.1;
export const LEDGE_MARGIN = 0.05;
export const CELL = 0.2;
const JUMP_REACH = 1.2;
const JUMP_COST = 2;
const DROP_COST = 0.5;
const SOFT_COST = 3;
const HOP_COST = 8;
const WP_ARRIVE = 0.25;
const ARRIVE = 0.02;
const GOAL_SEARCH = 3;
const OFF_SEARCH = 8;
const REPLAN_TICKS = 10;
const STUCK_TICKS = 20;
const MAX_FAILS = 2;
const FOLLOW_GAP = 0.15;
const BRICK_GAP = 0.1;
const TURN_SPEED = 0.05;
export const LUNGE = 0.3;
export const LUNGE_RANGE = 0.8;
const LUNGE_KEEP = 0.1;
export const RESPAWN_Y = 3;
const RESPAWN_DZ = 0.6;
export const INVINCIBLE_TICKS = 2 * TICK_HZ;
/** After a ring-out the faller is out of play this long, then drops in (REUSE-SPEC.md §Scoring; 2-5 s to tune). */
export const RESPAWN_WAIT = 3 * TICK_HZ;
export const LAUNCH_SPEED = 5;
/** Untouched this long, a fighter steadies: percent (and its wobble) drains at CALM_DRAIN a second. */
export const CALM_TICKS = 1.5 * TICK_HZ;
export const CALM_DRAIN = 30;
export const STUN_TICKS = 8;
export const STUN_PER_SPEED = 2;
export const POP = Object.freeze({ vx: 1.5, vy: 6 });
const DONUT_REACH = 0.25;
const DONUT_EDGE = 0.1;
export const SHELF_REACH = 0.3;
/** How far in front of their shelf a foe stands guard: deep enough for where a ring-out drops them in. */
export const GUARD_REACH = 1;
const SHELF_GAP = 0.05;
const SHELF_H = 2;
const SHELF_COLS = 4;
const SPAWN_GAP = 0.6;
const SPAWN_ROW = 3;
const SPAWN_Z = 0.2;
export const DUMMY = Object.freeze({ x: -3, z: 0.3, gap: 0.8 });
const DEFAULT_LOOKS = Object.freeze({
  heroes: Object.freeze({ dough: '#e8c48a', frosting: '#ff3b7f', stripe: false }),
  badGuys: Object.freeze({ dough: '#2a1a14', frosting: '#7a2bbf', stripe: true }),
});
export const BAD_ICING = '#4a1d6b';
/** How close to its pile, or past a block's edge, a fighter reaches to pick a block up. */
const FETCH_REACH = 0.35;
const BLOCK_HITS = 2;

/**
 * A hit sphere sits along the attacker's facing, at its body edge + max(reach × scale, min)
 * (reach null: under the body), dy × height up, radius r. active is the first and last step that
 * hits; knockback speed = base + growth × percent, at angle degrees.
 * @typedef {{ steps: number, active: [number, number], reach: { scale: number, min: number }|null,
 *             dy: number, r: number, damage: number, kb: { base: number, growth: number, angle: number },
 *             brick: number, walks: boolean, dive?: number, shows: 'punch'|'kick' }} Move
 * @type {Readonly<Record<'punch'|'kick'|'stomp', Move>>}
 */
export const MOVES = Object.freeze({
  punch: { steps: 16, active: [4, 8], reach: { scale: 0.5, min: 0.2 }, dy: 0.6, r: 0.17, damage: 6,
    kb: { base: 5, growth: 0.1, angle: 50 }, brick: 1, walks: true, shows: 'punch' },
  kick: { steps: 22, active: [7, 12], reach: { scale: 0.8, min: 0.3 }, dy: 0.3, r: 0.21, damage: 8,
    kb: { base: 6, growth: 0.12, angle: 25 }, brick: 2, walks: false, shows: 'kick' },
  stomp: { steps: 20, active: [2, 14], reach: null, dy: -0.05, r: 0.3, damage: 7,
    kb: { base: 4, growth: 0.1, angle: -60 }, brick: 2, walks: true, dive: 6, shows: 'kick' },
});

const OPEN = 0, SOFT = 1, HOP = 2, BLOCKED = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The highest rise a route jumps for at this take-off speed. */
export const reachUp = (speed) => (JUMP_MARGIN * speed * speed) / (2 * GRAVITY);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inXZ = (b, x, z) => outside(b, x, z) === 0;
const toBox = outside;
const floorBox = (f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: -Infinity, y1: f.y, round: f.round, kind: 'floor' });
const brickBox = (b) => ({ x0: b.x, x1: b.x + BRICK, z0: b.z, z1: b.z + BRICK, y0: b.y, y1: b.y + BRICK, kind: 'brick' });
const shelfBox = (z0) => (sh) => ({ x0: sh.x - sh.half, x1: sh.x + sh.half, z0, z1: sh.z, y0: sh.y, y1: sh.y + SHELF_H, kind: 'shelf' });
/** The index of the patch in `list` that (x, z) on the top at y stands in, or within `grow` of; -1 if none. */
const patchAt = (s, list, p, grow = 0) => (list ?? []).findIndex((q) => Math.abs(p.y - (q.y ?? s.band.y)) <= STEP
  && Math.hypot(p.x - q.x, p.z - q.z) < q.r + grow);
const shelfOf = (s, team) => s.shelves.find((sh) => sh.team === team);
const standingAt = (f, sh, reach = SHELF_REACH) => f.onGround && Math.abs(f.y - sh.y) <= STEP
  && Math.abs(f.x - sh.x) < sh.half && f.z >= sh.z && f.z - sh.z < f.r + reach;
/** REUSE-SPEC.md §Mode: a guard blocks the grab. */
const guarding = (s, f) => standingAt(f, shelfOf(s, f.team), GUARD_REACH);
const guardOf = (s, team) => s.fighters.find((o) => o.team === team && guarding(s, o));
const inStage = ({ band }, p) => {
  p.x = clamp(p.x, band.x0 + LEDGE_MARGIN, band.x1 - LEDGE_MARGIN);
  p.z = Math.min(p.z, band.z1 - LEDGE_MARGIN);
};

/** The ground's x/z extent from the back wall, its height, and its floor grid's size. @param {import('./match.js').Stage} stage */
function bandOf(stage) {
  const g = groundOf(stage), z0 = stage.backWall;
  return { x0: g.x0, x1: g.x1, z0, z1: g.z1, y: g.y, nx: Math.round((g.x1 - g.x0) / CELL), nz: Math.round((g.z1 - z0) / CELL) };
}

/** The highest top under (x, z) no higher than maxY. */
function supportAt(list, x, z, maxY) {
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
function pushOut(s, p, r, h) {
  for (let pass = 0; pass < PUSH_PASSES; pass++) if (!pushOnce(s, p, r, h)) return;
}

function floorFor(s, x, z, y) {
  let best = null;
  for (const fl of s.stage.floors)
    if (inXZ(fl, x, z) && (!best || Math.abs(fl.y - y) < Math.abs(best.y - y))) best = fl;
  return best ? best.y : s.band.y;
}

// --- the floor grid -------------------------------------------------------------------------

const cellX = (g, n) => g.x0 + ((n % g.nx) + 0.5) * CELL;
const cellZ = (g, n) => g.z0 + (Math.floor(n / g.nx) + 0.5) * CELL;
const cellOf = (g, x, z) => clamp(Math.floor((z - g.z0) / CELL), 0, g.nz - 1) * g.nx + clamp(Math.floor((x - g.x0) / CELL), 0, g.nx - 1);

function cellKind(s, x, z, top, body) {
  if (z < s.band.z0 + body.r - EPS) return BLOCKED;
  let soft = false, bricks = -Infinity;
  for (const b of s.solids) {
    if (b.y1 <= top + STEP || b.y0 >= top + body.h || toBox(b, x, z) >= body.r) continue;
    if (b.kind === 'shelf') return BLOCKED;
    if (b.kind === 'floor') soft = true;
    else bricks = Math.max(bricks, b.y1);
  }
  if (bricks > top + BRICK + STEP) return BLOCKED;
  if (bricks > -Infinity) return HOP;
  return soft ? SOFT : OPEN;
}

/** Each cell's floor top and whether a body of radius r fits there (open), hugs a raised floor (soft), must hop a one-high brick wall, or can't;
 *  how high a jump from it rises (a trampoline's launch, or the stage's jump); and which trampoline it is on or next to (index + 1, else 0). */
function buildGrid(s, body) {
  const { nx, nz } = s.band, size = nx * nz;
  const g = { ...s.band, top: new Float64Array(size), kind: new Uint8Array(size), up: new Float64Array(size), spring: new Uint8Array(size), jumpUp: s.jump.up };
  for (let n = 0; n < size; n++) {
    const p = { x: cellX(g, n), y: supportAt(s.floorBoxes, cellX(g, n), cellZ(g, n), Infinity), z: cellZ(g, n) };
    g.top[n] = p.y;
    g.kind[n] = cellKind(s, p.x, p.z, p.y, body);
    g.up[n] = patchAt(s, s.stage.springs, p) < 0 ? s.jump.up : s.jump.springUp;
    g.spring[n] = patchAt(s, s.stage.springs, p, CELL) + 1;
  }
  return g;
}

function navGrid(s, f) {
  const key = `${f.r}/${f.h}`;
  if (!s.grids.has(key)) s.grids.set(key, buildGrid(s, f));
  return s.grids.get(key);
}

function stepCost(g, a, b, len) {
  const hopping = g.kind[b] === HOP && g.kind[a] !== HOP, rise = g.top[b] - g.top[a];
  if (g.kind[b] === BLOCKED || rise + (hopping ? BRICK : 0) > g.up[a]) return Infinity;
  const hop = (hopping ? HOP_COST : 0) + (g.spring[b] && !g.spring[a] ? HOP_COST : 0);
  const climb = (rise > STEP ? JUMP_COST : 0) + (rise < -STEP ? DROP_COST : 0);
  return len * CELL * (g.kind[b] === SOFT ? SOFT_COST : 1) + hop + climb;
}

const onGrid = (g, i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.nz;

function edges(g, n) {
  const i = n % g.nx, j = (n - i) / g.nx, out = [];
  for (const [di, dj] of DIRS) {
    if (!onGrid(g, i + di, j + dj)) continue;
    if (di && dj && (g.kind[n + di] === BLOCKED || g.kind[n + dj * g.nx] === BLOCKED)) continue;
    const m = n + di + dj * g.nx, c = stepCost(g, n, m, di && dj ? Math.SQRT2 : 1);
    if (c < Infinity) out.push([m, c]);
  }
  return out;
}

function swap(h, a, b) {
  const t = h[a];
  h[a] = h[b];
  h[b] = t;
}

function heapPush(h, item) {
  h.push(item);
  for (let i = h.length - 1; i > 0;) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    swap(h, p, i);
    i = p;
  }
}

function heapPop(h) {
  const top = h[0], last = h.pop();
  if (!h.length) return top;
  h[0] = last;
  for (let i = 0; ;) {
    const l = 2 * i + 1, r = l + 1;
    let m = i;
    if (l < h.length && h[l][0] < h[m][0]) m = l;
    if (r < h.length && h[r][0] < h[m][0]) m = r;
    if (m === i) return top;
    swap(h, m, i);
    i = m;
  }
}

function trace(from, n) {
  const cells = [];
  for (let c = n; c !== -1; c = from[c]) cells.push(c);
  return cells.reverse();
}

// ponytail: A* over the whole 90×20 grid, rebuilt when bricks change; a coarser grid or cached paths if it ever shows in a profile
/** The cheapest cells from start to goal, or to the reachable cell nearest the goal if there is no way. */
function search(g, start, goal) {
  const n = g.top.length, cost = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n), heap = [];
  const away = (c) => Math.hypot(cellX(g, c) - cellX(g, goal), cellZ(g, c) - cellZ(g, goal));
  let best = start;
  cost[start] = 0;
  heapPush(heap, [away(start), start]);
  while (heap.length) {
    const [, c] = heapPop(heap);
    if (done[c]) continue;
    done[c] = 1;
    if (c === goal) return { cells: trace(from, c), reached: true };
    if (away(c) < away(best)) best = c;
    for (const [m, k] of edges(g, c))
      if (cost[c] + k < cost[m]) { cost[m] = cost[c] + k; from[m] = c; heapPush(heap, [cost[m] + away(m), m]); }
  }
  return { cells: trace(from, best), reached: false };
}

/** The walkable cell nearest p, within `reach` cells, that `ok` accepts; p's own cell if none. */
function nearestCell(g, p, ok, reach) {
  const c = cellOf(g, p.x, p.z), ci = c % g.nx, cj = (c - ci) / g.nx;
  let best = c, bestD = Infinity;
  for (let j = Math.max(0, cj - reach); j <= Math.min(g.nz - 1, cj + reach); j++)
    for (let i = Math.max(0, ci - reach); i <= Math.min(g.nx - 1, ci + reach); i++) {
      const n = j * g.nx + i, d = Math.hypot(cellX(g, n) - p.x, cellZ(g, n) - p.z);
      if (g.kind[n] < HOP && ok(n) && d < bestD) { best = n; bestD = d; }
    }
  return best;
}

/** The walkable cell at the goal's height nearest the goal point. */
const goalCell = (g, p) => nearestCell(g, p, (n) => Math.abs(g.top[n] - p.y) <= STEP, GOAL_SEARCH);

/** Up on blocks too tall to hop (the grid only knows floors), the route starts with a step off them, to the nearest cell at or below. */
function startCell(g, f) {
  const at = cellOf(g, f.x, f.z);
  return g.kind[at] === BLOCKED && f.y > g.top[at] + STEP ? nearestCell(g, f, (n) => g.top[n] <= f.y + STEP, OFF_SEARCH) : at;
}

/** Cells to waypoints: a waypoint reached across a hop or up onto a higher top is a jump; `spring` names the trampoline it bounces up from. */
function waypoints(g, cells) {
  const out = [];
  let hopped = false;
  for (let i = 1; i < cells.length; i++) {
    const n = cells[i];
    if (g.kind[n] === HOP) { hopped = true; continue; }
    const a = cells[i - 1], up = g.top[n] > (out.at(-1)?.y ?? g.top[cells[0]]) + STEP;
    out.push({ x: cellX(g, n), y: g.top[n], z: cellZ(g, n), jump: hopped || up, spring: up && g.up[a] > g.jumpUp ? g.spring[a] - 1 : -1 });
    hopped = false;
  }
  return out;
}

function clearLine(g, a, b) {
  const n = Math.ceil(flat(a, b) / (CELL / 2));
  for (let t = 1; t <= n; t++) {
    const c = cellOf(g, a.x + ((b.x - a.x) * t) / n, a.z + ((b.z - a.z) * t) / n);
    if (g.kind[c] !== OPEN || g.spring[c] || Math.abs(g.top[c] - a.y) > STEP) return false;
  }
  return true;
}

/** Drops waypoints a straight walk on open floor can skip. */
function pull(g, from, wps) {
  const out = [];
  let a = from;
  for (let k = 0; k < wps.length; k++) {
    if (!wps[k].jump) while (k + 1 < wps.length && !wps[k + 1].jump && clearLine(g, a, wps[k + 1])) k++;
    out.push(wps[k]);
    a = wps[k];
  }
  return out;
}

// --- where a target is ----------------------------------------------------------------------

/** The nearest spot a body can stand at (x, z), on the floor whose top is nearest y. */
function pointGoal(s, f, x, z, y) {
  const p = { x, y: 0, z: Math.max(z, s.band.z0) };
  inStage(s, p);
  p.y = floorFor(s, p.x, p.z, y ?? s.band.y);
  pushOut(s, p, f.r, f.h);
  inStage(s, p);
  return p;
}

function brickGoal(s, f, b) {
  const q = { x: clamp(f.x, b.x, b.x + BRICK), z: clamp(f.z, b.z, b.z + BRICK) }, d = flat(f, q);
  const [ux, uz] = d > EPS ? [(f.x - q.x) / d, (f.z - q.z) / d] : [-1, 0], away = f.r + BRICK_GAP;
  return { ...pointGoal(s, f, q.x + ux * away, q.z + uz * away, b.y), face: { x: b.x + BRICK / 2, z: b.z + BRICK / 2 } };
}

function besideGoal(s, f, it) {
  const side = f.x < it.x ? -1 : 1;
  return { ...pointGoal(s, f, it.x + side * (it.r + f.r + FOLLOW_GAP), it.z, it.y), face: it };
}

function thingGoal(s, f, t) {
  if (t.thing === 'shelf') {
    // REUSE-SPEC.md §Mode: a guarded shelf walks you up to the guard instead, facing it
    const guard = t.team !== f.team && guardOf(s, t.team);
    if (guard) return besideGoal(s, f, guard);
    const sh = shelfOf(s, t.team);
    return { ...pointGoal(s, f, sh.x, sh.z + f.r + SHELF_GAP, sh.y), face: sh };
  }
  if (t.thing === 'pile') {
    const pile = s.piles.find((p) => p.owner === t.id);
    return pile ? { ...pointGoal(s, f, pile.x, pile.z, pile.y), face: pile } : null;
  }
  const list = { donut: s.donuts, brick: s.bricks, fighter: s.fighters }[t.thing];
  const it = list?.find((o) => o.id === t.id && o !== f);
  if (!it) return null;
  if (t.thing === 'brick') return brickGoal(s, f, it);
  if (t.thing === 'donut') return { ...pointGoal(s, f, it.x, it.z, it.y), face: it };
  return besideGoal(s, f, it);
}

function resolve(s, f) {
  const t = f.target;
  if ('x' in t) return pointGoal(s, f, t.x, t.z, t.y);
  const g = thingGoal(s, f, t);
  if (!g) f.target = null;
  return g;
}

// --- following a route ----------------------------------------------------------------------

function plan(s, f) {
  const g = navGrid(s, f), goal = f.dest, start = startCell(g, f), end = goalCell(g, goal);
  const found = f.fails >= MAX_FAILS ? { cells: [start], reached: false } : search(g, start, end);
  const wps = waypoints(g, found.cells);
  if (start !== cellOf(g, f.x, f.z)) wps.unshift({ x: cellX(g, start), y: g.top[start], z: cellZ(g, start), jump: false, spring: -1 });
  const exact = found.reached && Math.hypot(goal.x - cellX(g, end), goal.z - cellZ(g, end)) <= CELL;
  if (exact) wps.push({ x: goal.x, y: goal.y, z: goal.z, jump: goal.y > (wps.at(-1)?.y ?? f.y) + STEP, spring: -1 });
  f.nav = { goal: { x: goal.x, y: goal.y, z: goal.z }, wps: pull(g, f, wps), k: 0, done: false, failed: false,
    blocked: !found.reached, at: s.tick, bricks: s.brickKey, end: null };
}

function stale(s, f) {
  const n = f.nav;
  if (!n || n.failed) return true;
  if (n.bricks !== s.brickKey) { f.fails = 0; return true; }
  const moved = flat(n.goal, f.dest) > CELL || Math.abs(n.goal.y - f.dest.y) > STEP;
  const pushed = n.done && (flat(f, n.end) > WP_ARRIVE || Math.abs(f.y - n.end.y) > STEP);
  return pushed || (moved && s.tick - n.at >= REPLAN_TICKS);
}

function fail(f) {
  f.fails++;
  f.stuck = 0;
  if (f.nav) f.nav.failed = true;
}

function arrive(f) {
  const n = f.nav, face = n.blocked ? f.dest : f.dest.face;
  if (f.slick) Object.assign(f, { vx: 0, vz: 0 });
  f.passed = false;
  n.done = true;
  n.end = { x: f.x, y: f.y, z: f.z };
  if (face && flat(f, face) > EPS) f.facing = Math.atan2(face.z - f.z, face.x - f.x);
}

/** A jump from a trampoline is its launch (REUSE-SPEC.md §Stages and difficulty are separate); `sprung` remembers which one. */
function jump(s, f, to) {
  if (flat(f, to) > EPS) f.facing = Math.atan2(to.z - f.z, to.x - f.x);
  f.sprung = patchAt(s, s.stage.springs, f);
  f.vy = f.sprung < 0 ? s.jump.speed : s.jump.spring;
  f.onGround = false;
  f.airTo = to;
}

function leapTo(s, f, w) {
  const n = f.nav;
  n.k = n.wps.indexOf(w);
  w.jump = false;
  f.navJump = w;
  jump(s, f, w);
}

/** Stepping or landing on trampoline p launches you: up to the top the route bounces to from it, if that is the next jump, else on where you were going. */
function launch(s, f, p) {
  const n = f.nav, up = n && !n.done ? n.wps.slice(n.k).find((w) => w.jump) : null;
  if (up?.spring === p) leapTo(s, f, up);
  else jump(s, f, f.walkTo ?? { x: f.x, z: f.z });
}

/** The share of WALK_SPEED a fighter walks at: the level's `badGuyPace` for bad guys (REUSE-SPEC.md §Forts, Level 2). */
const paceOf = (s, f) => (f.team === 'badGuys' ? s.rules.badGuyPace ?? 1 : 1);

// ponytail: a slowed fighter's jumps slow too, but no further than this share, which still lands a route's hop onto a
// deck (it takes off nearer); a slower jump would need a shorter take-off than a fighter's body allows against the wall
const SLOWEST_JUMP = 0.4;
/** The share of a full jump's reach and air speed a fighter jumps with: slowed with its pace, down to SLOWEST_JUMP. */
const jumpPace = (s, f) => Math.max(paceOf(s, f), SLOWEST_JUMP);

// On butter you arrive only once you've stopped sliding; a bounce up from a trampoline is only taken standing on it
const arrived = (f, n, wp) => !wp || (n.k === n.wps.length - 1 && !wp.jump && flat(f, wp) < (n.blocked ? WP_ARRIVE : ARRIVE)
  && (!f.slick || f.passed || Math.hypot(f.vx, f.vz) < SETTLE));
const canLeap = (s, f, w) => w?.jump && flat(f, w) < JUMP_REACH * jumpPace(s, f) && (w.spring < 0 || patchAt(s, s.stage.springs, f) === w.spring);

function follow(s, f) {
  const n = f.nav;
  if (n.done) return;
  while (n.k < n.wps.length - 1 && !n.wps[n.k].jump && n.wps[n.k + 1].spring < 0 && flat(f, n.wps[n.k]) < WP_ARRIVE) n.k++;
  const wp = n.wps[n.k];
  if (arrived(f, n, wp)) { arrive(f); return; }
  const leap = [wp, n.wps[n.k + 1]].find((w) => canLeap(s, f, w));
  if (leap && !f.attack) leapTo(s, f, leap);
  else f.walkTo = wp;
}

function navigate(s, f) {
  f.slick = f.onGround && patchAt(s, s.stage.butter, f) >= 0;
  f.walkTo = null;
  f.dest = f.dummy || !f.target ? null : resolve(s, f);
  if (!f.dest) { f.nav = null; return; }
  if (!f.onGround || f.stun > 0) return;
  if (stale(s, f)) plan(s, f);
  follow(s, f);
}

// --- physics --------------------------------------------------------------------------------

function slide(s, f, dx, dz) {
  f.x += dx;
  f.z += dz;
  pushOut(s, f, f.r, f.h);
  if (f.onGround) inStage(s, f);
}

/** Stuck: barely moving for STUCK_TICKS. On butter, barely moving for the speed it's sliding at, since it slows right down to settle. */
function stuckCheck(s, f, moved) {
  if (moved == null || moved >= DT * 0.2 * (f.slick ? Math.hypot(f.vx, f.vz) : WALK_SPEED * paceOf(s, f))) f.stuck = 0;
  else if (++f.stuck >= STUCK_TICKS) fail(f);
}

// REUSE-SPEC.md §Mode: players wade straight through; ponytail: weight syrup cells in A* if NPCs should go round
/**
 * The velocity toward `to`: slowed in syrup; on butter it eases there from the one it had, so you slide past and come back.
 * Once you've slid past, the comeback stops on the spot: otherwise a small slick could keep you sliding off, walking back and
 * sliding off again. ponytail: routing ignores butter too.
 */
function walkVelocity(s, f, to) {
  const dx = to ? to.x - f.x : 0, dz = to ? to.z - f.z : 0, d = Math.hypot(dx, dz);
  const top = WALK_SPEED * paceOf(s, f) * (patchAt(s, s.stage.puddles, f) < 0 ? 1 : SYRUP_SLOW);
  const v = d > EPS ? Math.min(top, f.slick ? d * BUTTER_BRAKE : d / DT) / d : 0;
  if (!f.slick) { Object.assign(f, { vx: dx * v, vy: 0, vz: dz * v }); return d; }
  if (dx * f.vx + dz * f.vz < 0) f.passed = true;
  Object.assign(f, { vx: f.vx + (dx * v - f.vx) * BUTTER_GRIP, vy: 0, vz: f.vz + (dz * v - f.vz) * BUTTER_GRIP });
  const over = f.passed ? (Math.hypot(f.vx, f.vz) * DT) / Math.max(d, EPS) : 0;
  if (over > 1) Object.assign(f, { vx: f.vx / over, vz: f.vz / over });
  return d;
}

function walkStep(s, f) {
  const paused = f.stun > 0 || (f.attack && !MOVES[f.attack.id].walks);
  const to = paused ? null : f.walkTo, x0 = f.x, z0 = f.z, was = patchAt(s, s.stage.springs, f);
  const d = walkVelocity(s, f, to);
  slide(s, f, f.vx * DT, f.vz * DT);
  stuckCheck(s, f, to && !f.attack && d > ARRIVE ? Math.hypot(f.x - x0, f.z - z0) : null);
  const top = supportAt(s.solids, f.x, f.z, f.y);
  if (top < f.y - STEP) { f.onGround = false; f.airTo = f.walkTo; return; }
  f.y = top;
  const p = patchAt(s, s.stage.springs, f);
  if (p >= 0 && p !== was) launch(s, f, p);
}

/** Landing on a trampoline launches you, unless it's the one that just did, so a bounce settles rather than looping. */
function land(s, f, top) {
  Object.assign(f, { y: top, vx: 0, vy: 0, vz: 0, onGround: true, jumps: 1, airTo: null });
  if (f.navJump && top < f.navJump.y - STEP) fail(f);
  f.navJump = null;
  const p = patchAt(s, s.stage.springs, f);
  if (p >= 0 && p !== f.sprung) launch(s, f, p);
  else f.sprung = -1;
}

function airStep(s, f) {
  const to = f.stun > 0 ? null : f.airTo;
  if (to) {
    const d = flat(f, to), v = d > EPS ? Math.min(AIR_SPEED * jumpPace(s, f), d / DT) / d : 0;
    f.vx = (to.x - f.x) * v;
    f.vz = (to.z - f.z) * v;
  }
  if (f.attack?.id === 'stomp') f.vy = Math.min(f.vy, -MOVES.stomp.dive);
  f.vy -= GRAVITY * DT;
  slide(s, f, f.vx * DT, f.vz * DT);
  const prevY = f.y;
  f.y += f.vy * DT;
  const top = f.vy <= 0 ? supportAt(s.solids, f.x, f.z, prevY) : -Infinity;
  if (top >= f.y) land(s, f, top);
}

function drop(s, f, d) {
  if (!f.carrying) return;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying });
  f.carrying = null;
}

function ringOut(s, f) {
  const r = s.stage.ringOut;
  if (f.x >= r.x0 && f.x <= r.x1 && f.z <= r.z1 && f.y >= r.y) return;
  const b = s.band, x = clamp(f.x, b.x0 + DONUT_EDGE, b.x1 - DONUT_EDGE), z = clamp(f.z, b.z0 + DONUT_EDGE, b.z1 - DONUT_EDGE);
  drop(s, f, { x, y: supportAt(s.solids, x, z, Infinity), z, vx: 0, vy: 0, vz: 0 });
  const sh = shelfOf(s, f.team);
  Object.assign(f, { x: sh.x, y: sh.y + RESPAWN_Y, z: sh.z + RESPAWN_DZ, vx: 0, vy: 0, vz: 0, onGround: false,
    jumps: 1, airTo: null, attack: null, stun: 0, pending: null, freeze: 0, percent: 0, calm: 0, inv: 0, out: RESPAWN_WAIT,
    nav: null, navJump: null, stuck: 0 });
}

function lungeStep(s, f) {
  const a = f.attack;
  if (a?.lunge && a.t < MOVES[a.id].active[0]) slide(s, f, a.lunge.x, a.lunge.z);
}

function release(f) {
  const k = f.pending;
  f.pending = null;
  if (k) Object.assign(f, { vx: k.vx, vy: k.vy, vz: k.vz, onGround: false, airTo: null, navJump: null, stun: k.stun, stunMax: k.stun });
}

function moveFighter(s, f) {
  if (f.out > 0) {
    if (--f.out === 0) f.inv = INVINCIBLE_TICKS;
    return;
  }
  f.still = f.freeze > 0;
  if (f.still) {
    if (--f.freeze === 0) release(f);
    return;
  }
  navigate(s, f);
  if (f.onGround) walkStep(s, f);
  else airStep(s, f);
  lungeStep(s, f);
  // Facing is set on the ground and by a jump, then held in the air: drifting back toward a ledge mustn't spin you round
  if (f.onGround && f.stun === 0 && Math.hypot(f.vx, f.vz) > TURN_SPEED) f.facing = Math.atan2(f.vz, f.vx);
  ringOut(s, f);
}

const overlapY = (a, b) => a.y < b.y + b.h - STEP && b.y < a.y + a.h - STEP;

/**
 * Foes are solid to each other (teammates pass through): each overlapping pair is pushed apart, half each, then off
 * any wall. A guard holds its ground, so only a hit moves it.
 */
function separate(s) {
  const fs = s.fighters;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), gap = a.r + b.r - d;
      if (a.team === b.team || a.out || b.out || gap <= 0 || !overlapY(a, b)) continue;
      const [ux, uz] = d > EPS ? [dx / d, dz / d] : [a.team === 'heroes' ? 1 : -1, 0];
      const held = [guarding(s, a), guarding(s, b)];
      for (const [f, sign, k] of [[a, -1, 0], [b, 1, 1]]) {
        const share = held[k] ? 0 : (1 + Number(held[1 - k])) / 2;
        f.x += sign * ux * gap * share;
        f.z += sign * uz * gap * share;
        pushOut(s, f, f.r, f.h);
      }
    }
  }
}

// --- attacks --------------------------------------------------------------------------------

const ahead = (f) => ({ x: Math.cos(f.facing), z: Math.sin(f.facing) });

function hitSphere(f, m) {
  const fwd = m.reach ? f.r + Math.max(f.reach * m.reach.scale, m.reach.min) : 0, u = ahead(f);
  return { x: f.x + u.x * fwd, y: f.y + m.dy * f.h, z: f.z + u.z * fwd, r: m.r };
}

/** Where the hit sphere meets o's body (an upright cylinder), or null if it doesn't. */
function bodyContact(sp, o) {
  const d = flat(sp, o), k = d > EPS ? Math.min(d, o.r) / d : 0;
  const p = { x: o.x + (sp.x - o.x) * k, y: clamp(sp.y, o.y, o.y + o.h), z: o.z + (sp.z - o.z) * k };
  return Math.hypot(sp.x - p.x, sp.y - p.y, sp.z - p.z) <= sp.r ? p : null;
}

function brickContact(sp, b) {
  const p = { x: clamp(sp.x, b.x, b.x + BRICK), y: clamp(sp.y, b.y, b.y + BRICK), z: clamp(sp.z, b.z, b.z + BRICK) };
  const d = Math.hypot(sp.x - p.x, sp.y - p.y, sp.z - p.z);
  return d <= sp.r ? { p, d } : null;
}

const canStrike = (s, f, o) => canHit(f, o, s.rules) && o.inv === 0 && !o.out && Math.abs(o.z - f.z) <= HIT_DEPTH + f.r + o.r;

/** The gap to the nearest thing in front that the attack could reach with a step, or Infinity. */
function frontGap(s, f) {
  const u = ahead(f);
  let best = Infinity;
  for (const o of s.fighters) {
    const dx = o.x - f.x, dz = o.z - f.z, along = dx * u.x + dz * u.z;
    if (!canStrike(s, f, o) || along <= 0 || Math.abs(dx * u.z - dz * u.x) > HIT_DEPTH + o.r || Math.abs(o.y - f.y) > f.h) continue;
    best = Math.min(best, along - f.r - o.r);
  }
  for (const b of s.bricks) {
    const q = { x: clamp(f.x, b.x, b.x + BRICK), z: clamp(f.z, b.z, b.z + BRICK) };
    const dx = q.x - f.x, dz = q.z - f.z, along = dx * u.x + dz * u.z;
    if (along <= 0 || Math.abs(dx * u.z - dz * u.x) > f.r || b.y >= f.y + f.h || b.y + BRICK <= f.y) continue;
    best = Math.min(best, along - f.r);
  }
  return best;
}

function lungeFor(s, f, m) {
  const gap = frontGap(s, f);
  if (!m.reach || gap > LUNGE_RANGE) return null;
  const step = clamp(gap - LUNGE_KEEP, 0, LUNGE) / m.active[0], u = ahead(f);
  return step > 0 ? { x: u.x * step, z: u.z * step } : null;
}

function strike(s, f, o, p) {
  const m = MOVES[f.attack.id], u = ahead(f), broke = Boolean(o.carrying);
  drop(s, o, { x: o.x, y: o.y + o.h, z: o.z, vx: u.x * POP.vx, vy: POP.vy, vz: u.z * POP.vx });
  o.percent += m.damage;
  o.calm = 0;
  const speed = m.kb.base + m.kb.growth * o.percent, a = (m.kb.angle * Math.PI) / 180, along = Math.cos(a) * speed;
  const up = o.onGround ? Math.abs(Math.sin(a) * speed) : Math.sin(a) * speed;
  o.pending = { vx: u.x * along, vy: up, vz: u.z * along, stun: Math.round(STUN_TICKS + STUN_PER_SPEED * speed) };
  Object.assign(o, { attack: null, hitMove: speed >= LAUNCH_SPEED ? 'launched' : 'hurt', freeze: HITSTOP_TICKS });
  f.freeze = HITSTOP_TICKS;
  f.attack.hit.push(o.id);
  s.hits.push({ ...p, move: f.attack.id, on: 'fighter', target: o.id, broke });
}

function hitBrick(s, f, sp) {
  let best = null;
  for (const b of s.bricks) {
    const c = brickContact(sp, b);
    if (c && (!best || c.d < best.d)) best = { ...c, b };
  }
  if (!best) return;
  const { b } = best, a = f.attack;
  a.brickDone = true;
  b.hits = Math.max(0, b.hits - MOVES[a.id].brick);
  if (b.hits === 0) s.bricks = s.bricks.filter((o) => o !== b);
  s.hits.push({ ...best.p, move: a.id, on: 'brick', target: b.id, broke: b.hits === 0 });
}

function attackStep(s, f) {
  const a = f.attack;
  if (!a || f.still || f.freeze > 0) return;
  const m = MOVES[a.id];
  if (++a.t >= m.steps) { f.attack = null; return; }
  if (a.t < m.active[0] || a.t > m.active[1]) return;
  const sp = hitSphere(f, m);
  for (const o of s.fighters) {
    const p = !a.hit.includes(o.id) && canStrike(s, f, o) ? bodyContact(sp, o) : null;
    if (p) strike(s, f, o, p);
  }
  if (!a.brickDone) hitBrick(s, f, sp);
}

// --- bricks and donuts ----------------------------------------------------------------------

function brickFloor(s, b) {
  let floor = supportAt(s.floorBoxes, b.x + BRICK / 2, b.z + BRICK / 2, b.y);
  for (const o of s.bricks)
    if (o !== b && Math.abs(o.x - b.x) < BRICK - EPS && Math.abs(o.z - b.z) < BRICK - EPS && o.y + BRICK <= b.y + EPS)
      floor = Math.max(floor, o.y + BRICK);
  return floor;
}

function settleBricks(s) {
  for (const b of [...s.bricks].sort((p, q) => p.y - q.y)) {
    const floor = brickFloor(s, b);
    b.vy = b.y <= floor + EPS ? 0 : b.vy - GRAVITY * DT;
    b.y = Math.max(floor, b.y + b.vy * DT);
    if (b.y === floor) b.vy = 0;
  }
}

function stepDonut(s, d) {
  const prev = { x: d.x, y: d.y, z: d.z }, { band } = s;
  d.vy -= GRAVITY * DT;
  d.x = clamp(d.x + d.vx * DT, band.x0 + DONUT_EDGE, band.x1 - DONUT_EDGE);
  d.z = clamp(d.z + d.vz * DT, band.z0 + DONUT_EDGE, band.z1 - DONUT_EDGE);
  d.y += d.vy * DT;
  if (s.solids.some((b) => inXZ(b, d.x, d.z) && prev.y < b.y1 - STEP && d.y < b.y1 && !inXZ(b, prev.x, prev.z)))
    Object.assign(d, { x: prev.x, z: prev.z, vx: 0, vz: 0 });
  const top = supportAt(s.solids, d.x, d.z, prev.y);
  if (d.y <= top) Object.assign(d, { y: top, vx: 0, vy: 0, vz: 0 });
}

// --- shelves --------------------------------------------------------------------------------

function grab(shelf) {
  const { g } = shelf;
  for (let lv = g.shelves - 1; lv >= 0; lv--)
    for (let c = g.cols - 1; c >= 0; c--) {
      const index = topAt(g, lv, c, 0);
      if (index === EMPTY) continue;
      lift(g, footprint(g, lv, [c, 0], [1, 1]));
      return shelf.items[index];
    }
  return null;
}

function bank(shelf, look) {
  const spot = anySlot(shelf.g, { w: 1, h: 1 }, { turn: false });
  if (!spot) return false;
  shelf.items.push(look);
  place(shelf.g, spot.keys, shelf.items.length - 1);
  return true;
}

const touching = (f, d) => flat(f, d) < f.r + DONUT_REACH && d.y >= f.y - 0.1 && d.y <= f.y + f.h;
const event = (f, p) => ({ fighter: f.id, x: p.x, y: p.y, z: p.z });

function touchDonuts(s, f) {
  const now = s.donuts.filter((d) => touching(f, d));
  for (const d of now) {
    // A full bag says so once per touch; a tapped donut is picked up even if it landed on you first
    if (f.carrying) { if (!f.touching.includes(d.id)) s.fullBag.push(event(f, d)); }
    else if (f.target?.thing === 'donut' && f.target.id === d.id) {
      f.carrying = d.look;
      s.donuts = s.donuts.filter((o) => o !== d);
      f.target = null;
      s.donutEvents.push({ ...event(f, d), kind: 'pickup' });
    }
  }
  f.touching = now.map((d) => d.id);
}


/** Walking up to a guarded shelf: the guard shakes "no" (the full-bag event) once each time. True while guarded. */
function guardStep(s, f) {
  const t = f.target, guard = t?.thing === 'shelf' && t.team !== f.team && guardOf(s, t.team);
  const by = Boolean(guard) && f.onGround && flat(f, guard) < f.r + guard.r + FOLLOW_GAP + WP_ARRIVE;
  if (by && !f.blocked) s.fullBag.push(event(guard, guard));
  f.blocked = by;
  return Boolean(guard);
}

function shelfStep(s, f) {
  if (guardStep(s, f)) return;
  const sh = s.shelves.find((o) => standingAt(f, o));
  if (!sh) { f.shelfDone = false; return; }
  if (sh.team === f.team) {
    if (f.carrying && bank(sh, f.carrying)) {
      f.carrying = null;
      s.donutEvents.push({ ...event(f, sh), kind: 'bank' });
    }
    return;
  }
  if (f.shelfDone || f.target?.thing !== 'shelf' || f.target.team !== sh.team) return;
  f.shelfDone = true;
  if (f.carrying) s.fullBag.push(event(f, sh));
  else if ((f.carrying = grab(sh))) s.donutEvents.push({ ...event(f, sh), kind: 'steal' });
}

// --- the build round (REUSE-SPEC.md §Forts) ------------------------------------------------

function shake(s, f) { s.fullBag.push(event(f, f)); }

/** ⬇️: the carried block goes on the faced cell of your own third, unless the stack there is at the height limit. */
function putDown(s, f) {
  const cell = f.block && f.onGround ? facedCell(fortGrid(s.stage, f.team, s.bricks, s.piles), f) : null;
  if (!cell?.ok) { shake(s, f); return; }
  s.bricks.push({ id: `p${s.nextBrick++}`, team: f.team, owner: f.id, x: cell.x, y: cell.y, z: cell.z, vy: 0,
    hits: BLOCK_HITS, maxHits: BLOCK_HITS, icing: f.block });
  f.block = null;
  s.donutEvents.push({ ...event(f, { x: cell.x + BRICK / 2, y: cell.y, z: cell.z + BRICK / 2 }), kind: 'place' });
}

/** Arriving empty-handed at your pile takes a block from it; at your own block on top of a stack, takes that back. */
function fetchStep(s, f) {
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
function readyInput(s, f, input) {
  if (input.ready === true) s.ready.add(f.id);
  if (input.ready === false) s.ready.delete(f.id);
  if (input.go) s.go = true;
  if (input.drop) putDown(s, f);
}

/** The round starts when every hero here has 👍 (CPU bad guys are ready at once), or someone held 👍: piles and carried blocks go. */
function startWhenReady(s) {
  const heroes = s.fighters.filter((f) => f.team === 'heroes' && !f.dummy && !f.away);
  if (!s.go && !(heroes.length && heroes.every((f) => s.ready.has(f.id)))) return;
  Object.assign(s, { phase: 'play', t0: s.tick, piles: [], go: false });
  s.ready.clear();
  for (const f of s.fighters) f.block = null;
}

// --- input ----------------------------------------------------------------------------------

function tapAbove(s, f, t) {
  if (t.y == null || f.stun > 0 || t.y <= f.y + f.h || Math.hypot(t.x - f.x, t.z - f.z) > f.w) return;
  if (f.onGround) jump(s, f, { x: f.x, z: f.z });
  else if (f.jumps > 0) { f.jumps--; f.vy = s.jump.speed; }
}

function aim(s, f, t) {
  Object.assign(f, { target: 'stop' in t ? null : { ...t }, nav: null, fails: 0, shelfDone: false, stuck: 0, passed: false });
  if ('x' in t) tapAbove(s, f, t);
}

const busy = (f) => Boolean(f.attack || f.stun > 0 || f.freeze > 0 || f.pending || f.out);

function setAway(s, f, away) {
  if (away == null || away === f.away) return;
  f.away = away;
  if (away) aim(s, f, { stop: true });
}

function applyInput(s, f, input) {
  setAway(s, f, input?.away);
  if (f.away || !input) return;
  if (input.target && !f.out) aim(s, f, input.target);
  if (s.phase === 'build') readyInput(s, f, input);
  else attackInput(s, f, input);
}

/** @param {import('./match.js').Input} input */
function attackInput(s, f, input) {
  if (busy(f) || !(input.kick || input.punch)) return;
  let id = 'punch';
  if (input.kick) id = f.onGround ? 'kick' : 'stomp';
  f.attack = { id, t: 0, hit: [], brickDone: false, lunge: lungeFor(s, f, MOVES[id]) };
}

// --- the match ------------------------------------------------------------------------------

const teamLooks = (entrants, team) => {
  const looks = entrants.filter((e) => e.team === team).map((e) => e.look);
  return looks.length ? looks : [DEFAULT_LOOKS[team]];
};
const icingOf = (entrants, team) => (team === 'badGuys' ? BAD_ICING : teamLooks(entrants, team)[0].frosting);

function makeShelf(spot, looks) {
  const levels = Math.ceil((2 * DONUTS_PER_SHELF) / SHELF_COLS);
  const g = makeDisplay(SHELF_COLS, 1, { shelves: levels, headroom: 1 });
  const shelf = { team: spot.team, x: spot.x, y: spot.y, z: spot.z, half: gridSize(g).w / 2, g, items: [] };
  for (let i = 0; i < DONUTS_PER_SHELF; i++) bank(shelf, looks[i % looks.length]);
  return shelf;
}

function spawnSpot(s, e, cursor) {
  if (e.dummy) return { x: DUMMY.x + DUMMY.gap * cursor.dummies++, z: DUMMY.z };
  // REUSE-SPEC.md §Forts, Start spots come first
  const spot = e.team === 'heroes' && s.stage.starts?.[cursor.starts++];
  if (spot) return spot;
  const sh = shelfOf(s, e.team), dir = sh.x < 0 ? 1 : -1, k = (cursor[e.team] = (cursor[e.team] ?? -1) + 1);
  return { x: sh.x + dir * SPAWN_GAP * (1 + (k % SPAWN_ROW)), z: SPAWN_Z + SPAWN_GAP * Math.floor(k / SPAWN_ROW) };
}

function newFighter(e, at, y) {
  return { id: e.id, team: e.team, icing: e.look.frosting, block: null, h: e.height, w: e.width, r: e.width / 2, reach: e.reach, dummy: Boolean(e.dummy),
    x: at.x, y, z: at.z, vx: 0, vy: 0, vz: 0, facing: e.team === 'heroes' ? 0 : Math.PI, onGround: true, jumps: 1,
    target: null, dest: null, nav: null, walkTo: null, airTo: null, navJump: null, fails: 0, stuck: 0, away: false, slick: false, passed: false, sprung: -1,
    attack: null, stun: 0, stunMax: 1, hitMove: 'hurt', pending: null, freeze: 0, still: false, inv: 0, out: 0, percent: 0, calm: 0,
    carrying: null, touching: [], shelfDone: false, blocked: false };
}

function refresh(s) {
  s.solids = [...s.floorBoxes, ...s.shelves.map(shelfBox(s.band.z0)), ...s.bricks.map(brickBox)];
  const key = s.bricks.map((b) => `${b.id}@${b.y.toFixed(3)}`).join(',');
  if (key !== s.brickKey) { s.brickKey = key; s.grids.clear(); }
}

/** How fast a jump and a trampoline launch take off on this stage, and the rise a route jumps for with each. */
function jumpsOn(stage) {
  const speed = JUMP_SPEED * Math.sqrt(stage.bounce ?? 1), spring = speed * Math.sqrt(SPRING_LIFT);
  return { speed, up: reachUp(speed), spring, springUp: reachUp(spring) };
}

/**
 * @param {import('./match.js').Entrant[]} entrants @param {import('./match.js').Stage} stage a level's (levels.js)
 * @param {import('./match.js').MatchOptions} [opts] pieces: each hero's pile, and a build round first if any; match: who can hit whom
 */
export function createMatch(entrants, stage, { pieces = 0, match = MATCH } = {}) {
  const s = { stage, band: bandOf(stage), jump: jumpsOn(stage), floorBoxes: stage.floors.map(floorBox), tick: 0, nextDonut: 0, fighters: [], donuts: [], shelves: [], solids: [], grids: new Map(), brickKey: '',
    hits: [], fullBag: [], donutEvents: [], rules: match, phase: pieces > 0 ? 'build' : 'play', t0: 0, ready: new Set(), go: false, piles: [], nextBrick: 0,
    bricks: stage.bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, z: b.z, vy: 0, hits: b.hits,
      maxHits: b.hits, icing: icingOf(entrants, b.team) })) };
  s.shelves = stage.shelves.map((spot) => makeShelf(spot, teamLooks(entrants, spot.team)));
  refresh(s);
  const cursor = { dummies: 0, starts: 0 };
  s.fighters = entrants.map((e) => newFighter(e, spawnSpot(s, e, cursor), s.band.y));
  for (const f of s.fighters) if (f.dummy) f.carrying = grab(shelfOf(s, f.team));
  if (s.phase === 'build') s.piles = s.fighters.filter((f) => f.team === 'heroes' && !f.dummy)
    .map((f) => ({ owner: f.id, x: f.x + PILE_DX, y: f.y, z: f.z, count: pieces, icing: f.icing }));
  return s;
}

const played = (s) => (s.phase === 'play' ? s.tick - s.t0 : 0);
const isOver = (s) => played(s) >= ROUND_SECONDS * TICK_HZ;

function applyInputs(s, inputs) {
  for (const f of s.fighters) if (!f.dummy) applyInput(s, f, inputs[f.id]);
  if (s.phase === 'build') startWhenReady(s);
}

/** One fixed 1/TICK_HZ step. @param {Record<string, import('./match.js').Input>} inputs */
export function tick(s, inputs) {
  if (isOver(s)) return;
  Object.assign(s, { hits: [], fullBag: [], donutEvents: [] });
  applyInputs(s, inputs);
  for (const f of s.fighters) moveFighter(s, f);
  separate(s);
  for (const f of s.fighters) attackStep(s, f);
  settleBricks(s);
  refresh(s);
  for (const d of s.donuts) stepDonut(s, d);
  for (const f of s.fighters) {
    touchDonuts(s, f);
    (s.phase === 'build' ? fetchStep : shelfStep)(s, f);
    if (f.still) continue;
    f.stun = Math.max(0, f.stun - 1);
    f.inv = Math.max(0, f.inv - 1);
    if (++f.calm > CALM_TICKS) f.percent = Math.max(0, f.percent - CALM_DRAIN / TICK_HZ);
  }
  s.tick++;
}

// --- the snapshot ---------------------------------------------------------------------------

function shelfLooks(sh) {
  const out = [];
  for (let lv = 0; lv < sh.g.shelves; lv++)
    for (let c = 0; c < sh.g.cols; c++) {
      const index = topAt(sh.g, lv, c, 0);
      if (index !== EMPTY) out.push({ ...sh.items[index] });
    }
  return out;
}

function moveOf(f) {
  if (f.pending || f.stun > 0) return f.hitMove;
  if (f.attack) return MOVES[f.attack.id].shows;
  if (!f.onGround) return f.vy > 0 ? 'jump' : 'fall';
  if (f.away) return 'sit';
  if (f.nav?.done && f.nav.blocked) return 'blocked';
  return Math.hypot(f.vx, f.vz) > TURN_SPEED ? 'walk' : 'idle';
}

function stepOf(f) {
  if (f.stun > 0) return 1 - f.stun / f.stunMax;
  return f.attack ? f.attack.t / MOVES[f.attack.id].steps : 0;
}

/** @returns {import('./match.js').FighterState} */
const fighterView = (f) => ({
  id: f.id, team: f.team, x: f.x, y: f.y, z: f.z, vx: f.vx, vy: f.vy, vz: f.vz, facing: f.facing, height: f.h,
  onGround: f.onGround, move: moveOf(f), step: stepOf(f), percent: f.percent, carrying: f.carrying ? { ...f.carrying } : null,
  invincible: f.inv > 0, respawn: f.out / TICK_HZ, target: f.dest ? { x: f.dest.x, y: f.dest.y, z: f.dest.z } : null, block: f.block,
});

function winnerOf(s) {
  if (!isOver(s)) return null;
  const [heroes, badGuys] = ['heroes', 'badGuys'].map((t) => shelfLooks(shelfOf(s, t)).length);
  if (heroes === badGuys) return null;
  return heroes > badGuys ? 'heroes' : 'badGuys';
}

/** @returns {import('./match.js').Snapshot} */
export function snapshot(s) {
  return {
    tick: s.tick, secondsLeft: Math.max(0, ROUND_SECONDS - played(s) / TICK_HZ), over: isOver(s), winner: winnerOf(s),
    phase: s.phase, ready: [...s.ready], piles: s.piles.map((p) => ({ ...p })),
    fighters: s.fighters.map(fighterView),
    donuts: s.donuts.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, look: { ...d.look } })),
    bricks: s.bricks.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y, z: b.z, hits: b.hits, maxHits: b.maxHits, icing: b.icing })),
    shelves: s.shelves.map((sh) => ({ team: sh.team, x: sh.x, y: sh.y, z: sh.z, donuts: shelfLooks(sh) })),
    hits: s.hits.map((h) => ({ ...h })),
    fullBag: s.fullBag.map((e) => ({ ...e })),
    donutEvents: s.donutEvents.map((e) => ({ ...e })),
  };
}

/** @type {import('./match.js').MatchApi} */
export const SIM = Object.freeze({ createMatch, tick, snapshot });
