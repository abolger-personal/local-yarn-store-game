// How bodies get round a stage (REUSE-SPEC.md §Navigation): the floor grid and A* over it, routes to a point or up to
// a thing, walking, jumping, trampolines, butter and syrup, and bodies pushing each other apart. Knows nothing of
// fighting or donuts; the game answers four questions through `Mind` (below). State it reads: world.js's, plus
// `s.jump`, `s.rules.doubleJump`, `s.grids`, `s.tick`, `s.brickKey`, `s.fighters`.
import { BRICK, TICK_HZ, outside as toBox } from './match.js';
import { CELL, DT, EPS, GRAVITY, STEP, clamp, flat, floorFor, inStage, patchAt, pushOut, supportAt } from './world.js';

/**
 * What the game tells walking: where `f`'s target is (a point to stand, with `face` to turn to, or null when it's gone);
 * whether `f` is busy (an attack: no leaping off mid-swing, no being stuck), rooted (an attack it can't walk through);
 * the upward speed a move gives it mid-air this tick, if any (a stomp's pop); whether it holds its ground when bumped.
 * @typedef {{ goal: (s: any, f: any) => any, busy: (f: any) => boolean, rooted: (f: any) => boolean,
 *             lift: (s: any, f: any) => number|null, holds: (s: any, f: any) => boolean }} Mind
 */

export const WALK_SPEED = 3.5;
export const AIR_SPEED = 4;
/** Walking speed is multiplied by this while standing in syrup (REUSE-SPEC.md §Forts, Level 1). */
export const SYRUP_SLOW = 0.45;
export const JUMP_SPEED = 10;
/** A route jumps up at most this share of a jump's height (v²/2g), leaving time to get over the edge: 1.3 at JUMP_SPEED. */
const JUMP_MARGIN = 0.78;
/** A trampoline's launch goes this many times as high as the stage's jump (REUSE-SPEC.md §Stages and difficulty are separate). */
export const SPRING_LIFT = 2;
/** On butter the velocity closes this share of the gap to the wanted one each tick, so you slide on and turn slowly... */
const BUTTER_GRIP = 0.05;
/** ...and the wanted speed toward the target is at most distance × this a second, so you overshoot a little and come back. */
const BUTTER_BRAKE = 2.5;
const SETTLE = 0.1;
const JUMP_REACH = 1.2;
const JUMP_COST = 2;
const DROP_COST = 0.5;
const SOFT_COST = 3;
/** A squeeze deeper than a cell costs this much more for each cell deeper: only a wide body meets one, and goes round if it can. */
const DEEP_COST = 200;
const HOP_COST = 8;
export const WP_ARRIVE = 0.25;
const ARRIVE = 0.02;
const GOAL_SEARCH = 3;
const OFF_SEARCH = 8;
const REPLAN_TICKS = 10;
const STUCK_TICKS = 20;
const MAX_FAILS = 2;
/** Blocked is a pause, never for good (playtest): a fighter that gave up on its way (stuck, not walled off: a broken wall replans) tries again this often. */
const RETRY_TICKS = 2 * TICK_HZ;

export const FOLLOW_GAP = 0.15;
const BRICK_GAP = 0.1;
export const TURN_SPEED = 0.05;

/** A fighter hit while down on its back skids along the floor, slowing at this (m/s²) (REUSE-SPEC.md §Discoverable moves). */
export const SLIDE_DRAG = 6;

const OPEN = 0, SOFT = 1, HOP = 2, BLOCKED = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The highest rise a route jumps for at this take-off speed. */
export const reachUp = (speed) => (JUMP_MARGIN * speed * speed) / (2 * GRAVITY);

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

/** How far into a body's room the taller floors at a soft cell reach: past a cell, a wide body is shoved hard (squeeze cost). */
function squeezeAt(s, x, z, top, body) {
  let most = 0;
  for (const b of s.solids) if (b.kind === 'floor' && b.y1 > top + STEP && b.y0 < top + body.h) most = Math.max(most, body.r - toBox(b, x, z));
  return most;
}

/** Each cell's floor top and whether a body of radius r fits there (open), hugs a raised floor (soft), must hop a one-high brick wall, or can't;
 *  how high a jump from it rises (a trampoline's launch, or the stage's jump); and which trampoline it is on or next to (index + 1, else 0). */
function buildGrid(s, body) {
  const { nx, nz } = s.band, size = nx * nz;
  const g = { ...s.band, top: new Float64Array(size), kind: new Uint8Array(size), squeeze: new Float64Array(size), up: new Float64Array(size), spring: new Uint8Array(size), jumpUp: s.jump.up,
    again: s.rules.doubleJump ? s.jump.up : 0 };
  for (let n = 0; n < size; n++) {
    const p = { x: cellX(g, n), y: supportAt(s.floorBoxes, cellX(g, n), cellZ(g, n), Infinity), z: cellZ(g, n) };
    g.top[n] = p.y;
    g.kind[n] = cellKind(s, p.x, p.z, p.y, body);
    if (g.kind[n] === SOFT) g.squeeze[n] = squeezeAt(s, p.x, p.z, p.y, body);
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

/** The highest a route climbs from cell a: a jump (or trampoline launch), and on a level with double jumps (REUSE-SPEC.md §Forts, Level 3) another on top. */
const climbFrom = (g, a) => g.up[a] + g.again;

function stepCost(g, a, b, len) {
  const hopping = g.kind[b] === HOP && g.kind[a] !== HOP, rise = g.top[b] - g.top[a];
  if (g.kind[b] === BLOCKED || rise + (hopping ? BRICK : 0) > climbFrom(g, a)) return Infinity;
  const hop = (hopping ? HOP_COST : 0) + (g.spring[b] && !g.spring[a] ? HOP_COST : 0);
  const climb = (rise > STEP ? JUMP_COST : 0) + (rise < -STEP ? DROP_COST : 0);
  const soft = g.kind[b] === SOFT ? SOFT_COST + (DEEP_COST * Math.max(0, g.squeeze[b] - CELL)) / CELL : 1;
  return len * CELL * soft + hop + climb;
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
    out.push({ x: cellX(g, n), y: g.top[n], z: cellZ(g, n), jump: hopped || up, spring: up && g.up[a] > g.jumpUp ? g.spring[a] - 1 : -1,
      double: g.top[n] - g.top[a] > g.up[a] });
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
export function pointGoal(s, f, x, z, y) {
  const p = { x, y: 0, z: Math.max(z, s.band.z0) };
  inStage(s, p);
  p.y = floorFor(s, p.x, p.z, y ?? s.band.y);
  pushOut(s, p, f.r, f.h);
  inStage(s, p);
  return p;
}

export function brickGoal(s, f, b) {
  const q = { x: clamp(f.x, b.x, b.x + BRICK), z: clamp(f.z, b.z, b.z + BRICK) }, d = flat(f, q);
  const [ux, uz] = d > EPS ? [(f.x - q.x) / d, (f.z - q.z) / d] : [-1, 0], away = f.r + BRICK_GAP;
  return { ...pointGoal(s, f, q.x + ux * away, q.z + uz * away, b.y), face: { x: b.x + BRICK / 2, z: b.z + BRICK / 2 } };
}

export function besideGoal(s, f, it) {
  const side = f.x < it.x ? -1 : 1;
  return { ...pointGoal(s, f, it.x + side * (it.r + f.r + FOLLOW_GAP), it.z, it.y), face: it };
}

/** Up to a fighter from the side you're coming from, facing it, so a hit sends it on the way you came (playtest: going round to one side). */
export function facingGoal(s, f, it) {
  const d = flat(f, it), [ux, uz] = d > EPS ? [(f.x - it.x) / d, (f.z - it.z) / d] : [-1, 0], away = it.r + f.r + FOLLOW_GAP;
  return { ...pointGoal(s, f, it.x + ux * away, it.z + uz * away, it.y), face: it };
}

// --- following a route ----------------------------------------------------------------------

function plan(s, f) {
  const g = navGrid(s, f), goal = f.dest, start = startCell(g, f), end = goalCell(g, goal);
  const found = f.fails >= MAX_FAILS ? { cells: [start], reached: false } : search(g, start, end);
  const wps = waypoints(g, found.cells);
  if (start !== cellOf(g, f.x, f.z)) wps.unshift({ x: cellX(g, start), y: g.top[start], z: cellZ(g, start), jump: false, spring: -1 });
  const exact = found.reached && Math.hypot(goal.x - cellX(g, end), goal.z - cellZ(g, end)) <= CELL;
  if (exact) wps.push({ x: goal.x, y: goal.y, z: goal.z, jump: goal.y > (wps.at(-1)?.y ?? f.y) + STEP, spring: -1 });
  // a jump lands where the body fits: a wide one can't land on a cell's middle up against a taller floor (playtest)
  for (const w of wps) if (w.jump) {
    const p = { x: w.x, y: w.y, z: w.z };
    pushOut(s, p, f.r, f.h);
    if (supportAt(s.solids, p.x, p.z, p.y) === w.y) Object.assign(w, { x: p.x, z: p.z });
  }
  f.nav = { goal: { x: goal.x, y: goal.y, z: goal.z }, wps: pull(g, f, wps), k: 0, done: false, failed: false,
    blocked: !found.reached, gaveUp: f.fails >= MAX_FAILS, at: s.tick, bricks: s.brickKey, end: null };
}

function stale(s, f) {
  const n = f.nav;
  if (!n || n.failed) return true;
  if (n.bricks !== s.brickKey || (n.gaveUp && s.tick - n.at >= RETRY_TICKS)) { f.fails = 0; return true; }
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
export function jump(s, f, to) {
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
/** How near a route's jump a fighter takes off: slowed fighters nearer, measured from the front of the body, which can't get closer. */
const leapReach = (s, f) => (paceOf(s, f) < 1 ? f.r + (JUMP_REACH - f.r) * jumpPace(s, f) : JUMP_REACH);

// On butter you arrive only once you've stopped sliding; a bounce up from a trampoline is only taken standing on it
const arrived = (f, n, wp) => !wp || (n.k === n.wps.length - 1 && !wp.jump && flat(f, wp) < (n.blocked ? WP_ARRIVE : ARRIVE)
  && (!f.slick || f.passed || Math.hypot(f.vx, f.vz) < SETTLE));
const canLeap = (s, f, w) => w?.jump && flat(f, w) < leapReach(s, f) && (w.spring < 0 || patchAt(s, s.stage.springs, f) === w.spring);

function follow(s, f, mind) {
  const n = f.nav;
  if (n.done) return;
  while (n.k < n.wps.length - 1 && !n.wps[n.k].jump && n.wps[n.k + 1].spring < 0 && flat(f, n.wps[n.k]) < WP_ARRIVE) n.k++;
  const wp = n.wps[n.k];
  if (arrived(f, n, wp)) { arrive(f); return; }
  // the route's next jump, once in reach: a wide body may never stand on the last ground cells before it (playtest)
  const leap = [wp, n.wps[n.k + 1], n.wps.slice(n.k).find((w) => w.jump)].find((w) => canLeap(s, f, w));
  if (leap && !mind.busy(f)) leapTo(s, f, leap);
  else f.walkTo = wp;
}

/** @param {Mind} mind */
export function navigate(s, f, mind) {
  f.slick = f.onGround && patchAt(s, s.stage.butter, f) >= 0;
  f.walkTo = null;
  f.dest = f.dummy || !f.target ? null : mind.goal(s, f);
  if (!f.dest) { f.nav = null; return; }
  if (!f.onGround || f.stun > 0) return;
  if (stale(s, f)) plan(s, f);
  follow(s, f, mind);
}

// --- physics --------------------------------------------------------------------------------

export function slide(s, f, dx, dz) {
  f.x += dx;
  f.z += dz;
  pushOut(s, f, f.r, f.h);
  if (f.onGround) inStage(s, f);
}

/** How fast a fighter walks where it stands: its pace, slowed in syrup. */
const topSpeed = (s, f) => WALK_SPEED * paceOf(s, f) * (patchAt(s, s.stage.puddles, f) < 0 ? 1 : SYRUP_SLOW);

/**
 * Stuck: barely closing on the waypoint over STUCK_TICKS, net, so jittering on the spot counts as stuck. On butter, barely
 * moving for the speed it's sliding at, since it slows right down to settle.
 */
function stuckCheck(s, f, moved) {
  const slow = DT * 0.2 * (f.slick ? Math.hypot(f.vx, f.vz) : topSpeed(s, f));
  if (moved == null) { f.stuck = 0; return; }
  if (f.stuck === 0) f.gain = 0;
  f.gain += moved;
  if (++f.stuck < STUCK_TICKS) return;
  if (f.gain < slow * STUCK_TICKS) fail(f);
  f.stuck = 0;
}

// REUSE-SPEC.md §Mode: players wade straight through; ponytail: weight syrup cells in A* if NPCs should go round
/**
 * The velocity toward `to`: slowed in syrup; on butter it eases there from the one it had, so you slide past and come back.
 * Once you've slid past, the comeback stops on the spot: otherwise a small slick could keep you sliding off, walking back and
 * sliding off again. ponytail: routing ignores butter too.
 */
function walkVelocity(s, f, to) {
  if (f.sliding) return skid(f);
  const dx = to ? to.x - f.x : 0, dz = to ? to.z - f.z : 0, d = Math.hypot(dx, dz), top = topSpeed(s, f);
  const v = d > EPS ? Math.min(top, f.slick ? d * BUTTER_BRAKE : d / DT) / d : 0;
  if (!f.slick) { Object.assign(f, { vx: dx * v, vy: 0, vz: dz * v }); return d; }
  if (dx * f.vx + dz * f.vz < 0) f.passed = true;
  Object.assign(f, { vx: f.vx + (dx * v - f.vx) * BUTTER_GRIP, vy: 0, vz: f.vz + (dz * v - f.vz) * BUTTER_GRIP });
  const over = f.passed ? (Math.hypot(f.vx, f.vz) * DT) / Math.max(d, EPS) : 0;
  if (over > 1) Object.assign(f, { vx: f.vx / over, vz: f.vz / over });
  return d;
}

/** Down on its back and hit, a fighter skids, slowing, till it stops. */
function skid(f) {
  const v = Math.hypot(f.vx, f.vz), k = v > EPS ? Math.max(0, v - SLIDE_DRAG * DT) / v : 0;
  Object.assign(f, { vx: f.vx * k, vy: 0, vz: f.vz * k, sliding: k > 0 });
  return 0;
}

/** @param {Mind} mind */
export function walkStep(s, f, mind) {
  const paused = f.stun > 0 || mind.rooted(f);
  const to = paused ? null : f.walkTo, x0 = f.x, z0 = f.z, was = patchAt(s, s.stage.springs, f);
  const d = walkVelocity(s, f, to);
  slide(s, f, f.vx * DT, f.vz * DT);
  // closing on the waypoint, not just moving: a body wedged between two things jitters on the spot without getting anywhere
  const moved = f.slick ? Math.hypot(f.x - x0, f.z - z0) : d - flat(f, to ?? f);
  stuckCheck(s, f, to && !mind.busy(f) && d > ARRIVE ? moved : null);
  const top = supportAt(s.solids, f.x, f.z, f.y);
  if (top < f.y - STEP) { f.onGround = false; f.airTo = f.walkTo; return; }
  f.y = top;
  const p = patchAt(s, s.stage.springs, f);
  if (p >= 0 && p !== was) launch(s, f, p);
}

/** Landing on a trampoline launches you, unless it's the one that just did, so a bounce settles rather than looping. */
function land(s, f, top) {
  Object.assign(f, { y: top, vx: 0, vy: 0, vz: 0, onGround: true, jumps: 1, airTo: null, again: false });
  if (f.navJump && top < f.navJump.y - STEP) fail(f);
  f.navJump = null;
  const p = patchAt(s, s.stage.springs, f);
  if (p >= 0 && p !== f.sprung) launch(s, f, p);
  else f.sprung = -1;
}

/** A double jump, a route's or a jump tap's: the mid-air jump at the top of the first. */
const doubleNow = (f) => Boolean(f.navJump?.double || f.again) && f.vy <= 0 && f.jumps > 0;

/** @param {Mind} mind */
export function airStep(s, f, mind) {
  const to = f.stun > 0 ? null : f.airTo;
  if (to) {
    const d = flat(f, to), v = d > EPS ? Math.min(AIR_SPEED * jumpPace(s, f), d / DT) / d : 0;
    f.vx = (to.x - f.x) * v;
    f.vz = (to.z - f.z) * v;
  }
  const lift = mind.lift(s, f);
  if (lift !== null) f.vy = lift;
  else {
    if (doubleNow(f)) Object.assign(f, { jumps: f.jumps - 1, vy: s.jump.speed, again: false });
    f.vy -= GRAVITY * DT;
  }
  slide(s, f, f.vx * DT, f.vz * DT);
  const prevY = f.y;
  f.y += f.vy * DT;
  const top = f.vy <= 0 ? supportAt(s.solids, f.x, f.z, prevY) : -Infinity;
  if (top >= f.y) land(s, f, top);
}

const overlapY = (a, b) => a.y < b.y + b.h - STEP && b.y < a.y + a.h - STEP;

/**
 * Foes are solid to each other (teammates pass through): each overlapping pair is pushed apart, half each, then off
 * any wall. A guard holds its ground, so only a hit moves it.
 */

/**
 * Pushed back by a fighter that `held` its ground counts against a walker's progress, so walking into one is getting stuck; a bump isn't.
 * A bump never shoves a fighter standing on a top off its edge: only a hit's knockback does (REUSE-SPEC.md §Forts, Level 3).
 */
function shove(s, f, px, pz, held) {
  if (f.onGround && supportAt(s.solids, f.x + px, f.z + pz, f.y) < f.y - STEP) return;
  const w = f.walkTo, d = w ? flat(f, w) : 0;
  if (held && d > EPS) f.gain += (px * (w.x - f.x) + pz * (w.z - f.z)) / d;
  f.x += px;
  f.z += pz;
  pushOut(s, f, f.r, f.h);
}

// REUSE-SPEC.md §Foes are solid, teammates aren't: heroes overlap, bad guys bump each other too
const bumps = (a, b) => !(a.team === b.team && a.team === 'heroes') && !a.out && !b.out && overlapY(a, b);

/** @param {Mind} mind */
export function separate(s, mind) {
  const fs = s.fighters;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), gap = a.r + b.r - d;
      if (gap <= 0 || !bumps(a, b)) continue;
      const [ux, uz] = d > EPS ? [dx / d, dz / d] : [a.team === 'heroes' ? 1 : -1, 0];
      const held = [mind.holds(s, a), mind.holds(s, b)];
      for (const [f, sign, k] of [[a, -1, 0], [b, 1, 1]]) {
        const share = held[0] === held[1] ? 0.5 : Number(!held[k]);
        shove(s, f, sign * ux * gap * share, sign * uz * gap * share, held[1 - k]);
      }
    }
  }
}
