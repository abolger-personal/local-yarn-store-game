// The match host: one fixed tick of pure logic, no three.js, no Math.random. REUSE-SPEC.md §Milestones 1.
// The stage is a depth band (§Navigation): fighters walk in x/z on floor tops and jump in y.
import { BRICK, DONUTS_PER_SHELF, HITSTOP_TICKS, HIT_DEPTH, ROUND_SECONDS, STAGE, TICK_HZ, coreOf, outside } from './match.js';
import { EMPTY, anySlot, footprint, gridSize, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { canHit } from './roster.js';

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
export const LEDGE_MARGIN = 0.05;
export const CELL = 0.2;
export const JUMP_UP = 1.3;
const JUMP_REACH = 1.2;
const JUMP_COST = 2;
const DROP_COST = 0.5;
const SOFT_COST = 3;
const HOP_COST = 8;
const WP_ARRIVE = 0.25;
const ARRIVE = 0.02;
const GOAL_SEARCH = 3;
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
export const LAUNCH_SPEED = 5;
export const STUN_TICKS = 8;
export const STUN_PER_SPEED = 2;
export const POP = Object.freeze({ vx: 1.5, vy: 6 });
const DONUT_REACH = 0.25;
const DONUT_EDGE = 0.1;
export const SHELF_REACH = 0.3;
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

const GROUND = STAGE.floors.reduce((g, p) => (p.y < g.y ? p : g));
const Z0 = STAGE.backWall;
const NX = Math.round((GROUND.x1 - GROUND.x0) / CELL);
const NZ = Math.round((GROUND.z1 - Z0) / CELL);
const OPEN = 0, SOFT = 1, HOP = 2, BLOCKED = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inXZ = (b, x, z) => outside(b, x, z) === 0;
const toBox = outside;
const FLOOR_BOXES = STAGE.floors.map((f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: -Infinity, y1: f.y, round: f.round, kind: 'floor' }));
const brickBox = (b) => ({ x0: b.x, x1: b.x + BRICK, z0: b.z, z1: b.z + BRICK, y0: b.y, y1: b.y + BRICK, kind: 'brick' });
const shelfBox = (sh) => ({ x0: sh.x - sh.half, x1: sh.x + sh.half, z0: Z0, z1: sh.z, y0: sh.y, y1: sh.y + SHELF_H, kind: 'shelf' });
const shelfOf = (s, team) => s.shelves.find((sh) => sh.team === team);
const inStage = (p) => {
  p.x = clamp(p.x, GROUND.x0 + LEDGE_MARGIN, GROUND.x1 - LEDGE_MARGIN);
  p.z = Math.min(p.z, GROUND.z1 - LEDGE_MARGIN);
};

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

function pushOnce(list, p, r, h) {
  let moved = false;
  for (const b of list) {
    if (p.y >= b.y1 - STEP || p.y + h <= b.y0) continue;
    const q = coreOf(b, p.x, p.z), d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d >= r + q.r) continue;
    moved = true;
    if (d > EPS) {
      p.x = q.x + ((p.x - q.x) / d) * (r + q.r);
      p.z = q.z + ((p.z - q.z) / d) * (r + q.r);
    } else escapeBox(p, b, r);
  }
  p.z = Math.max(p.z, Z0 + r);
  return moved;
}

// ponytail: a few passes, so a body wedged between many boxes could still end inside one; a proper depenetration solve if forts get dense
/** Pushes a body (circle r in x/z, h tall, feet at p.y) out of every solid it overlaps, and off the back wall. */
function pushOut(list, p, r, h) {
  for (let pass = 0; pass < PUSH_PASSES; pass++) if (!pushOnce(list, p, r, h)) return;
}

function floorFor(x, z, y) {
  let best = null;
  for (const fl of STAGE.floors)
    if (inXZ(fl, x, z) && (!best || Math.abs(fl.y - y) < Math.abs(best.y - y))) best = fl;
  return best ? best.y : GROUND.y;
}

// --- the floor grid -------------------------------------------------------------------------

const cellX = (n) => GROUND.x0 + ((n % NX) + 0.5) * CELL;
const cellZ = (n) => Z0 + (Math.floor(n / NX) + 0.5) * CELL;
const cellOf = (x, z) => clamp(Math.floor((z - Z0) / CELL), 0, NZ - 1) * NX + clamp(Math.floor((x - GROUND.x0) / CELL), 0, NX - 1);

function cellKind(list, x, z, top, body) {
  if (z < Z0 + body.r - EPS) return BLOCKED;
  let soft = false, bricks = -Infinity;
  for (const b of list) {
    if (b.y1 <= top + STEP || b.y0 >= top + body.h || toBox(b, x, z) >= body.r) continue;
    if (b.kind === 'shelf') return BLOCKED;
    if (b.kind === 'floor') soft = true;
    else bricks = Math.max(bricks, b.y1);
  }
  if (bricks > top + BRICK + STEP) return BLOCKED;
  if (bricks > -Infinity) return HOP;
  return soft ? SOFT : OPEN;
}

/** Each cell's floor top and whether a body of radius r fits there (open), hugs a raised floor (soft), must hop a one-high brick wall, or can't. */
function buildGrid(list, body) {
  const top = new Float64Array(NX * NZ), kind = new Uint8Array(NX * NZ);
  for (let n = 0; n < NX * NZ; n++) {
    top[n] = supportAt(FLOOR_BOXES, cellX(n), cellZ(n), Infinity);
    kind[n] = cellKind(list, cellX(n), cellZ(n), top[n], body);
  }
  return { top, kind };
}

function navGrid(s, f) {
  const key = `${f.r}/${f.h}`;
  if (!s.grids.has(key)) s.grids.set(key, buildGrid(s.solids, f));
  return s.grids.get(key);
}

function stepCost(g, a, b, len) {
  const hopping = g.kind[b] === HOP && g.kind[a] !== HOP, rise = g.top[b] - g.top[a];
  if (g.kind[b] === BLOCKED || rise + (hopping ? BRICK : 0) > JUMP_UP) return Infinity;
  const hop = hopping ? HOP_COST : 0;
  const climb = (rise > STEP ? JUMP_COST : 0) + (rise < -STEP ? DROP_COST : 0);
  return len * CELL * (g.kind[b] === SOFT ? SOFT_COST : 1) + hop + climb;
}

const onGrid = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ;

function edges(g, n) {
  const i = n % NX, j = (n - i) / NX, out = [];
  for (const [di, dj] of DIRS) {
    if (!onGrid(i + di, j + dj)) continue;
    if (di && dj && (g.kind[n + di] === BLOCKED || g.kind[n + dj * NX] === BLOCKED)) continue;
    const m = n + di + dj * NX, c = stepCost(g, n, m, di && dj ? Math.SQRT2 : 1);
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
  const away = (c) => Math.hypot(cellX(c) - cellX(goal), cellZ(c) - cellZ(goal));
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

/** The walkable cell at the goal's height nearest the goal point. */
function goalCell(g, p) {
  const c = cellOf(p.x, p.z), ci = c % NX, cj = (c - ci) / NX;
  let best = c, bestD = Infinity;
  for (let j = Math.max(0, cj - GOAL_SEARCH); j <= Math.min(NZ - 1, cj + GOAL_SEARCH); j++)
    for (let i = Math.max(0, ci - GOAL_SEARCH); i <= Math.min(NX - 1, ci + GOAL_SEARCH); i++) {
      const n = j * NX + i, d = Math.hypot(cellX(n) - p.x, cellZ(n) - p.z);
      if (g.kind[n] < HOP && Math.abs(g.top[n] - p.y) <= STEP && d < bestD) { best = n; bestD = d; }
    }
  return best;
}

/** Cells to waypoints: a waypoint reached across a hop or up onto a higher top is a jump. */
function waypoints(g, cells) {
  const out = [];
  let hopped = false;
  for (const n of cells.slice(1)) {
    if (g.kind[n] === HOP) { hopped = true; continue; }
    const below = out.at(-1)?.y ?? g.top[cells[0]];
    out.push({ x: cellX(n), y: g.top[n], z: cellZ(n), jump: hopped || g.top[n] > below + STEP });
    hopped = false;
  }
  return out;
}

function clearLine(g, a, b) {
  const n = Math.ceil(flat(a, b) / (CELL / 2));
  for (let t = 1; t <= n; t++) {
    const c = cellOf(a.x + ((b.x - a.x) * t) / n, a.z + ((b.z - a.z) * t) / n);
    if (g.kind[c] !== OPEN || Math.abs(g.top[c] - a.y) > STEP) return false;
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
  const p = { x, y: 0, z: Math.max(z, Z0) };
  inStage(p);
  p.y = floorFor(p.x, p.z, y ?? GROUND.y);
  pushOut(s.solids, p, f.r, f.h);
  inStage(p);
  return p;
}

function brickGoal(s, f, b) {
  const q = { x: clamp(f.x, b.x, b.x + BRICK), z: clamp(f.z, b.z, b.z + BRICK) }, d = flat(f, q);
  const [ux, uz] = d > EPS ? [(f.x - q.x) / d, (f.z - q.z) / d] : [-1, 0], away = f.r + BRICK_GAP;
  return { ...pointGoal(s, f, q.x + ux * away, q.z + uz * away, b.y), face: { x: b.x + BRICK / 2, z: b.z + BRICK / 2 } };
}

function thingGoal(s, f, t) {
  if (t.thing === 'shelf') {
    const sh = shelfOf(s, t.team);
    return { ...pointGoal(s, f, sh.x, sh.z + f.r + SHELF_GAP, sh.y), face: sh };
  }
  const list = { donut: s.donuts, brick: s.bricks, fighter: s.fighters }[t.thing];
  const it = list?.find((o) => o.id === t.id && o !== f);
  if (!it) return null;
  if (t.thing === 'brick') return brickGoal(s, f, it);
  if (t.thing === 'donut') return { ...pointGoal(s, f, it.x, it.z, it.y), face: it };
  const side = f.x < it.x ? -1 : 1;
  return { ...pointGoal(s, f, it.x + side * (it.r + f.r + FOLLOW_GAP), it.z, it.y), face: it };
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
  const g = navGrid(s, f), goal = f.dest, start = cellOf(f.x, f.z), end = goalCell(g, goal);
  const found = f.fails >= MAX_FAILS ? { cells: [start], reached: false } : search(g, start, end);
  const wps = waypoints(g, found.cells);
  const exact = found.reached && Math.hypot(goal.x - cellX(end), goal.z - cellZ(end)) <= CELL;
  if (exact) wps.push({ x: goal.x, y: goal.y, z: goal.z, jump: goal.y > (wps.at(-1)?.y ?? f.y) + STEP });
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
  n.done = true;
  n.end = { x: f.x, y: f.y, z: f.z };
  if (face && flat(f, face) > EPS) f.facing = Math.atan2(face.z - f.z, face.x - f.x);
}

function jump(f, to) {
  if (flat(f, to) > EPS) f.facing = Math.atan2(to.z - f.z, to.x - f.x);
  f.vy = JUMP_SPEED;
  f.onGround = false;
  f.airTo = to;
}

function follow(f) {
  const n = f.nav;
  if (n.done) return;
  while (n.k < n.wps.length - 1 && !n.wps[n.k].jump && flat(f, n.wps[n.k]) < WP_ARRIVE) n.k++;
  const wp = n.wps[n.k];
  if (!wp || (n.k === n.wps.length - 1 && !wp.jump && flat(f, wp) < (n.blocked ? WP_ARRIVE : ARRIVE))) { arrive(f); return; }
  const leap = [wp, n.wps[n.k + 1]].find((w) => w?.jump && flat(f, w) < JUMP_REACH);
  if (leap && !f.attack) {
    n.k = n.wps.indexOf(leap);
    leap.jump = false;
    f.navJump = leap;
    jump(f, leap);
    return;
  }
  f.walkTo = wp;
}

function navigate(s, f) {
  f.walkTo = null;
  f.dest = f.dummy || !f.target ? null : resolve(s, f);
  if (!f.dest) { f.nav = null; return; }
  if (!f.onGround || f.stun > 0) return;
  if (stale(s, f)) plan(s, f);
  follow(f);
}

// --- physics --------------------------------------------------------------------------------

function slide(s, f, dx, dz) {
  f.x += dx;
  f.z += dz;
  pushOut(s.solids, f, f.r, f.h);
  if (f.onGround) inStage(f);
}

function stuckCheck(f, moved) {
  if (moved == null || moved >= WALK_SPEED * DT * 0.2) f.stuck = 0;
  else if (++f.stuck >= STUCK_TICKS) fail(f);
}

// REUSE-SPEC.md §Mode: players wade straight through; ponytail: weight syrup cells in A* if NPCs should go round
const inSyrup = (s, f) => f.y < STEP && s.puddles.some((p) => Math.hypot(f.x - p.x, f.z - p.z) < p.r);

function walkStep(s, f) {
  const paused = f.stun > 0 || (f.attack && !MOVES[f.attack.id].walks);
  const to = paused ? null : f.walkTo;
  const dx = to ? to.x - f.x : 0, dz = to ? to.z - f.z : 0, d = Math.hypot(dx, dz);
  const v = d > EPS ? Math.min(WALK_SPEED * (inSyrup(s, f) ? SYRUP_SLOW : 1), d / DT) / d : 0, x0 = f.x, z0 = f.z;
  Object.assign(f, { vx: dx * v, vy: 0, vz: dz * v });
  slide(s, f, f.vx * DT, f.vz * DT);
  stuckCheck(f, to && !f.attack && d > ARRIVE ? Math.hypot(f.x - x0, f.z - z0) : null);
  const top = supportAt(s.solids, f.x, f.z, f.y);
  if (top < f.y - STEP) { f.onGround = false; f.airTo = f.walkTo; } else f.y = top;
}

function land(f, top) {
  Object.assign(f, { y: top, vx: 0, vy: 0, vz: 0, onGround: true, jumps: 1, airTo: null });
  if (f.navJump && top < f.navJump.y - STEP) fail(f);
  f.navJump = null;
}

function airStep(s, f) {
  const to = f.stun > 0 ? null : f.airTo;
  if (to) {
    const d = flat(f, to), v = d > EPS ? Math.min(AIR_SPEED, d / DT) / d : 0;
    f.vx = (to.x - f.x) * v;
    f.vz = (to.z - f.z) * v;
  }
  if (f.attack?.id === 'stomp') f.vy = Math.min(f.vy, -MOVES.stomp.dive);
  f.vy -= GRAVITY * DT;
  slide(s, f, f.vx * DT, f.vz * DT);
  const prevY = f.y;
  f.y += f.vy * DT;
  const top = f.vy <= 0 ? supportAt(s.solids, f.x, f.z, prevY) : -Infinity;
  if (top >= f.y) land(f, top);
}

function drop(s, f, d) {
  if (!f.carrying) return;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying });
  f.carrying = null;
}

function ringOut(s, f) {
  const r = STAGE.ringOut;
  if (f.x >= r.x0 && f.x <= r.x1 && f.z <= r.z1 && f.y >= r.y) return;
  const x = clamp(f.x, GROUND.x0 + DONUT_EDGE, GROUND.x1 - DONUT_EDGE), z = clamp(f.z, Z0 + DONUT_EDGE, GROUND.z1 - DONUT_EDGE);
  drop(s, f, { x, y: supportAt(s.solids, x, z, Infinity), z, vx: 0, vy: 0, vz: 0 });
  const sh = shelfOf(s, f.team);
  Object.assign(f, { x: sh.x, y: sh.y + RESPAWN_Y, z: sh.z + RESPAWN_DZ, vx: 0, vy: 0, vz: 0, onGround: false,
    jumps: 1, airTo: null, attack: null, stun: 0, pending: null, freeze: 0, percent: 0, inv: INVINCIBLE_TICKS,
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

/** Foes are solid to each other (teammates pass through): each overlapping pair is pushed apart, half each, then off any wall. */
function separate(s) {
  const fs = s.fighters;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), gap = a.r + b.r - d;
      if (a.team === b.team || gap <= 0 || !overlapY(a, b)) continue;
      const [ux, uz] = d > EPS ? [dx / d, dz / d] : [a.team === 'heroes' ? 1 : -1, 0];
      for (const [f, sign] of [[a, -1], [b, 1]]) {
        f.x += (sign * ux * gap) / 2;
        f.z += (sign * uz * gap) / 2;
        pushOut(s.solids, f, f.r, f.h);
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

const canStrike = (f, o) => canHit(f, o) && o.inv === 0 && Math.abs(o.z - f.z) <= HIT_DEPTH + f.r + o.r;

/** The gap to the nearest thing in front that the attack could reach with a step, or Infinity. */
function frontGap(s, f) {
  const u = ahead(f);
  let best = Infinity;
  for (const o of s.fighters) {
    const dx = o.x - f.x, dz = o.z - f.z, along = dx * u.x + dz * u.z;
    if (!canStrike(f, o) || along <= 0 || Math.abs(dx * u.z - dz * u.x) > HIT_DEPTH + o.r || Math.abs(o.y - f.y) > f.h) continue;
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
    const p = !a.hit.includes(o.id) && canStrike(f, o) ? bodyContact(sp, o) : null;
    if (p) strike(s, f, o, p);
  }
  if (!a.brickDone) hitBrick(s, f, sp);
}

// --- bricks and donuts ----------------------------------------------------------------------

function brickFloor(s, b) {
  let floor = supportAt(FLOOR_BOXES, b.x + BRICK / 2, b.z + BRICK / 2, b.y);
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
  const prev = { x: d.x, y: d.y, z: d.z };
  d.vy -= GRAVITY * DT;
  d.x = clamp(d.x + d.vx * DT, GROUND.x0 + DONUT_EDGE, GROUND.x1 - DONUT_EDGE);
  d.z = clamp(d.z + d.vz * DT, Z0 + DONUT_EDGE, GROUND.z1 - DONUT_EDGE);
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
    if (f.touching.includes(d.id)) continue;
    if (f.carrying) s.fullBag.push(event(f, d));
    else if (f.target?.thing === 'donut' && f.target.id === d.id) {
      f.carrying = d.look;
      s.donuts = s.donuts.filter((o) => o !== d);
      f.target = null;
      s.donutEvents.push({ ...event(f, d), kind: 'pickup' });
    }
  }
  f.touching = now.map((d) => d.id);
}

const standingAt = (f, sh) => f.onGround && Math.abs(f.y - sh.y) <= STEP && Math.abs(f.x - sh.x) < sh.half
  && f.z >= sh.z && f.z - sh.z < f.r + SHELF_REACH;

function shelfStep(s, f) {
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

// --- input ----------------------------------------------------------------------------------

function tapAbove(f, t) {
  if (t.y == null || f.stun > 0 || t.y <= f.y + f.h || Math.hypot(t.x - f.x, t.z - f.z) > f.w) return;
  if (f.onGround) jump(f, { x: f.x, z: f.z });
  else if (f.jumps > 0) { f.jumps--; f.vy = JUMP_SPEED; }
}

function aim(f, t) {
  Object.assign(f, { target: 'stop' in t ? null : { ...t }, nav: null, fails: 0, shelfDone: false, stuck: 0 });
  if ('x' in t) tapAbove(f, t);
}

const busy = (f) => Boolean(f.attack || f.stun > 0 || f.freeze > 0 || f.pending);

function applyInput(s, f, input) {
  if (input?.target) aim(f, input.target);
  if (busy(f) || !(input?.kick || input?.punch)) return;
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
  const sh = shelfOf(s, e.team), dir = sh.x < 0 ? 1 : -1, k = (cursor[e.team] = (cursor[e.team] ?? -1) + 1);
  return { x: sh.x + dir * SPAWN_GAP * (1 + (k % SPAWN_ROW)), z: SPAWN_Z + SPAWN_GAP * Math.floor(k / SPAWN_ROW) };
}

function newFighter(e, at) {
  return { id: e.id, team: e.team, h: e.height, w: e.width, r: e.width / 2, reach: e.reach, dummy: Boolean(e.dummy),
    x: at.x, y: GROUND.y, z: at.z, vx: 0, vy: 0, vz: 0, facing: e.team === 'heroes' ? 0 : Math.PI, onGround: true, jumps: 1,
    target: null, dest: null, nav: null, walkTo: null, airTo: null, navJump: null, fails: 0, stuck: 0,
    attack: null, stun: 0, stunMax: 1, hitMove: 'hurt', pending: null, freeze: 0, still: false, inv: 0, percent: 0,
    carrying: null, touching: [], shelfDone: false };
}

function refresh(s) {
  s.solids = [...FLOOR_BOXES, ...s.shelves.map(shelfBox), ...s.bricks.map(brickBox)];
  const key = s.bricks.map((b) => `${b.id}@${b.y.toFixed(3)}`).join(',');
  if (key !== s.brickKey) { s.brickKey = key; s.grids.clear(); }
}

/**
 * @param {import('./match.js').Entrant[]} entrants
 * @param {readonly import('./match.js').BrickSpot[]} [bricks] for tests: a fort other than STAGE.bricks
 * @param {readonly import('./match.js').Puddle[]} [puddles] the level's syrup
 */
export function createMatch(entrants, bricks = STAGE.bricks, puddles = STAGE.puddles) {
  const s = { tick: 0, puddles, nextDonut: 0, fighters: [], donuts: [], shelves: [], solids: [], grids: new Map(), brickKey: '',
    hits: [], fullBag: [], donutEvents: [],
    bricks: bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, z: b.z, vy: 0, hits: b.hits,
      maxHits: b.hits, icing: icingOf(entrants, b.team) })) };
  s.shelves = STAGE.shelves.map((spot) => makeShelf(spot, teamLooks(entrants, spot.team)));
  refresh(s);
  const cursor = { dummies: 0 };
  s.fighters = entrants.map((e) => newFighter(e, spawnSpot(s, e, cursor)));
  for (const f of s.fighters) if (f.dummy) f.carrying = grab(shelfOf(s, f.team));
  return s;
}

const isOver = (s) => s.tick >= ROUND_SECONDS * TICK_HZ;

/** One fixed 1/TICK_HZ step. @param {Record<string, import('./match.js').Input>} inputs */
export function tick(s, inputs) {
  if (isOver(s)) return;
  Object.assign(s, { hits: [], fullBag: [], donutEvents: [] });
  for (const f of s.fighters) if (!f.dummy) applyInput(s, f, inputs[f.id]);
  for (const f of s.fighters) moveFighter(s, f);
  separate(s);
  for (const f of s.fighters) attackStep(s, f);
  settleBricks(s);
  refresh(s);
  for (const d of s.donuts) stepDonut(s, d);
  for (const f of s.fighters) {
    touchDonuts(s, f);
    shelfStep(s, f);
    if (f.still) continue;
    f.stun = Math.max(0, f.stun - 1);
    f.inv = Math.max(0, f.inv - 1);
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
  invincible: f.inv > 0, target: f.dest ? { x: f.dest.x, y: f.dest.y, z: f.dest.z } : null,
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
    tick: s.tick, secondsLeft: Math.max(0, ROUND_SECONDS - s.tick / TICK_HZ), over: isOver(s), winner: winnerOf(s),
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
