// The match host: one fixed tick of pure logic, no three.js, no Math.random. REUSE-SPEC.md §Milestones 1.
import { BRICK, DONUTS_PER_SHELF, ROUND_SECONDS, STAGE, TICK_HZ } from './match.js';
import { EMPTY, anySlot, footprint, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { canHit } from './roster.js';

const DT = 1 / TICK_HZ;
const EPS = 1e-6;
export const GRAVITY = 30;
export const WALK_SPEED = 3.5;
export const AIR_SPEED = 4;
export const JUMP_SPEED = 10;
export const LEDGE_MARGIN = 0.05;
const DROP_OUT = 0.25;
const TAP_LIFT = 0.35;
const ARRIVE = 0.02;
const FOLLOW_GAP = 0.05;
const HOP_CLEAR = 0.05;
const JUMP_COST = 1.5;
const TURN_SPEED = 0.05;
const MAX_FLIGHT_TICKS = 3 * TICK_HZ;
export const RESPAWN_Y = 3;
export const INVINCIBLE_TICKS = 2 * TICK_HZ;
export const LAUNCH_SPEED = 5;
export const STUN_TICKS = 8;
export const STUN_PER_SPEED = 2;
export const POP = Object.freeze({ vx: 1.5, vy: 6 });
const DONUT_REACH = 0.15;
const DONUT_EDGE = 0.1;
export const SHELF_REACH = 0.3;
const SHELF_COLS = 4;
const SPAWN_GAP = 0.5;
export const DUMMY_X = 2;
const DUMMY_GAP = 0.6;
const DEFAULT_LOOKS = Object.freeze({
  heroes: Object.freeze({ dough: '#e8c48a', frosting: '#ff3b7f', stripe: false }),
  badGuys: Object.freeze({ dough: '#2a1a14', frosting: '#7a2bbf', stripe: true }),
});

/**
 * Hit spheres are in units of the attacker's height (dx is scaled by reach too), forward of its facing.
 * active is the first and last step that hits; knockback speed = base + growth × percent, at angle degrees.
 * @typedef {{ dx: number, dy: number, r: number }} HitSphere
 * @typedef {{ steps: number, active: [number, number], spheres: HitSphere[], damage: number,
 *             kb: { base: number, growth: number, angle: number }, brick: number, walks: boolean,
 *             dive?: number, shows: 'punch'|'kick' }} Move
 * @type {Readonly<Record<'punch'|'kick'|'stomp', Move>>}
 */
export const MOVES = Object.freeze({
  punch: { steps: 16, active: [4, 8], spheres: [{ dx: 0.45, dy: 0.6, r: 0.14 }], damage: 6,
    kb: { base: 5, growth: 0.1, angle: 50 }, brick: 1, walks: true, shows: 'punch' },
  kick: { steps: 22, active: [7, 12], spheres: [{ dx: 0.62, dy: 0.3, r: 0.16 }], damage: 8,
    kb: { base: 6, growth: 0.12, angle: 25 }, brick: 2, walks: false, shows: 'kick' },
  stomp: { steps: 20, active: [2, 14], spheres: [{ dx: 0.1, dy: -0.05, r: 0.22 }], damage: 7,
    kb: { base: 4, growth: 0.1, angle: -60 }, brick: 2, walks: true, dive: 6, shows: 'kick' },
});

const PLATFORMS = STAGE.platforms.map((p, i) => ({ ...p, i }));
const GROUND = PLATFORMS.reduce((g, p) => (p.y < g.y ? p : g));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sign = (v) => (v < 0 ? -1 : 1);

function landing(x, prevY, y, list) {
  let best = null;
  for (const p of list)
    if (x >= p.x0 && x <= p.x1 && y <= p.y && prevY >= p.y - EPS && (!best || p.y > best.y)) best = p;
  return best;
}

function fly(b, steerX) {
  if (steerX != null) b.vx = clamp((steerX - b.x) / DT, -AIR_SPEED, AIR_SPEED);
  b.vy -= GRAVITY * DT;
  const prevY = b.y;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  return prevY;
}

function flight(from, tx, lx) {
  const b = { x: tx, y: from.y, vx: 0, vy: JUMP_SPEED };
  for (let t = 0; t < MAX_FLIGHT_TICKS && b.y > STAGE.ringOut.y; t++) {
    const prevY = fly(b, lx);
    const top = b.vy <= 0 ? landing(b.x, prevY, b.y, PLATFORMS) : null;
    if (top) return { to: top.i, lx: b.x };
  }
  return null;
}

const inner = (p) => [p.x0 + LEDGE_MARGIN, p.x1 - LEDGE_MARGIN];
const takeoffs = (a) => [...new Set(PLATFORMS.flatMap(inner).map((x) => clamp(x, ...inner(a))))];
const landingXs = PLATFORMS.flatMap((p) => [...inner(p), p.x0 - DROP_OUT, p.x1 + DROP_OUT]);

function addLink(links, from, tx, hit) {
  if (!hit || hit.to === from) return;
  const near = (l) => l.from === from && l.to === hit.to && Math.abs(l.tx - tx) < 0.1 && Math.abs(l.lx - hit.lx) < 0.1;
  if (links.some(near)) return;
  links.push({ from, to: hit.to, tx, lx: hit.lx, cost: JUMP_COST + Math.abs(hit.lx - tx) });
}

/** Every jump between platforms, found by flying the real air physics from each edge toward each edge. */
export function jumpLinks() {
  const links = [];
  for (const a of PLATFORMS)
    for (const tx of takeoffs(a))
      for (const lx of [tx, ...landingXs]) addLink(links, a.i, tx, flight(a, tx, lx));
  return links;
}

function closest(dist, done) {
  let best = -1;
  for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
  return best;
}

function relax(links, dist, first, i) {
  const l = links[i];
  links.forEach((n, j) => {
    const d = dist[i] + Math.abs(l.lx - n.tx) + n.cost;
    if (n.from === l.to && d < dist[j]) { dist[j] = d; first[j] = first[i]; }
  });
}

// ponytail: O(links²) Dijkstra per replan (~100 links); a heap if stages grow big
function firstLink(links, from, x, goal) {
  const dist = links.map((l) => (l.from === from ? Math.abs(x - l.tx) + l.cost : Infinity));
  const first = links.map((_, i) => i), done = new Uint8Array(links.length);
  let best = Infinity, pick = null;
  for (let i = closest(dist, done); i >= 0; i = closest(dist, done)) {
    done[i] = 1;
    const total = dist[i] + Math.abs(links[i].lx - goal.x);
    if (links[i].to === goal.p && total < best) { best = total; pick = links[first[i]]; }
    relax(links, dist, first, i);
  }
  return pick;
}

const on = (p, x) => ({ p: p.i, x: clamp(x, ...inner(p)), y: p.y });

function standable(x, y) {
  const d = (p) => Math.hypot(x - clamp(x, ...inner(p)), y - p.y - TAP_LIFT);
  return on(PLATFORMS.reduce((a, b) => (d(b) < d(a) ? b : a)), x);
}

function goalAt(x, y) {
  let best = null;
  for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && p.y <= y + EPS && (!best || p.y > best.y)) best = p;
  return best ? on(best, x) : standable(x, y);
}

const shelfOf = (s, team) => s.shelves.find((sh) => sh.team === team);
const beside = (f, ox, ow) => ox + sign(f.x - ox) * (f.w / 2 + ow / 2 + FOLLOW_GAP);

function brickGoal(f, b) {
  const x = f.x < b.x + BRICK / 2 ? b.x - f.w / 2 - FOLLOW_GAP : b.x + BRICK + f.w / 2 + FOLLOW_GAP;
  return { ...goalAt(b.x + BRICK / 2, b.y), x, faceX: b.x + BRICK / 2 };
}

function thingGoal(s, f, t) {
  if (t.thing === 'shelf') {
    const sh = shelfOf(s, t.team);
    return { ...goalAt(sh.x, sh.y), faceX: sh.x, shelf: sh };
  }
  const list = { donut: s.donuts, brick: s.bricks, fighter: s.fighters }[t.thing];
  const it = list.find((o) => o.id === t.id && o !== f);
  if (!it) return null;
  if (t.thing === 'brick') return brickGoal(f, it);
  if (t.thing === 'donut') return { ...goalAt(it.x, it.y), faceX: it.x, donut: it };
  const g = goalAt(it.x, it.y);
  return { ...g, x: clamp(beside(f, it.x, it.w), ...inner(PLATFORMS[g.p])), faceX: it.x };
}

function resolve(s, f) {
  const t = f.target;
  if (!t) return null;
  if ('x' in t) return standable(t.x, t.y);
  const g = thingGoal(s, f, t);
  if (!g) f.target = null;
  return g;
}

function jump(f, airX) {
  f.vy = JUMP_SPEED;
  f.on = null;
  f.airX = airX;
}

function hopX(s, f, b) {
  const top = Math.max(...s.bricks.filter((o) => Math.abs(o.x - b.x) < EPS).map((o) => o.y + BRICK));
  if (top - f.y > BRICK + EPS) return null;
  return f.x < b.x ? b.x + BRICK + f.w / 2 + HOP_CLEAR : b.x - f.w / 2 - HOP_CLEAR;
}

function route(s, f, goal) {
  const from = typeof f.on === 'number' ? f.on : goalAt(f.x, f.y).p;
  if (from === goal.p) return null;
  const key = `${from}>${goal.p}@${goal.x.toFixed(2)}`;
  if (f.plan?.key !== key) f.plan = { key, link: firstLink(s.links, from, f.x, goal) };
  return f.plan.link;
}

function navigate(s, f) {
  f.walkX = null;
  f.dest = f.dummy ? null : resolve(s, f);
  const g = f.dest;
  if (!g || f.on === null || f.stun > 0) return;
  const link = route(s, f, g);
  f.walkX = link ? link.tx : g.x;
  const ahead = f.blocked && sign(f.blocked.x - f.x) === sign(f.walkX - f.x);
  const hop = ahead && hopX(s, f, f.blocked);
  if (hop) jump(f, hop);
  else if (link && Math.abs(f.x - link.tx) < ARRIVE) jump(f, link.lx);
}

function blockX(s, f, x0, x1) {
  const half = f.w / 2;
  let x = x1;
  f.blocked = null;
  for (const b of s.bricks) {
    if (f.y >= b.y + BRICK - EPS || f.y + f.h <= b.y + EPS) continue;
    if (x > x0 && x0 + half <= b.x + EPS && x + half > b.x) { x = b.x - half; f.blocked = b; }
    if (x < x0 && x0 - half >= b.x + BRICK - EPS && x - half < b.x + BRICK) { x = b.x + BRICK + half; f.blocked = b; }
  }
  return x;
}

const brickTops = (s) => s.bricks.map((b) => ({ x0: b.x, x1: b.x + BRICK, y: b.y + BRICK, i: 'brick' }));
const surfaces = (s) => [...PLATFORMS, ...brickTops(s)];

function walkStep(s, f) {
  const kicking = f.attack && !MOVES[f.attack.id].walks;
  const want = f.walkX == null || kicking || f.stun > 0 ? f.x : f.walkX;
  f.vx = clamp((want - f.x) / DT, -WALK_SPEED, WALK_SPEED);
  let x = f.x + f.vx * DT;
  if (typeof f.on === 'number') {
    const [lo, hi] = inner(PLATFORMS[f.on]);
    x = clamp(x, Math.min(f.x, lo), Math.max(f.x, hi));
  }
  f.x = blockX(s, f, f.x, x);
  if (f.on === 'brick' && !brickTops(s).some((t) => Math.abs(t.y - f.y) < 1e-3 && f.x >= t.x0 && f.x <= t.x1)) f.on = null;
}

function land(f, top) {
  f.y = top.y;
  f.vx = 0;
  f.vy = 0;
  f.on = top.i;
  f.jumps = 1;
  f.airX = null;
}

function groundSide(f, prevX) {
  const under = f.y < GROUND.y - EPS && f.x > GROUND.x0 && f.x < GROUND.x1;
  if (under && (prevX <= GROUND.x0 || prevX >= GROUND.x1)) f.x = prevX <= GROUND.x0 ? GROUND.x0 : GROUND.x1;
}

const steerOf = (f) => (f.stun > 0 ? null : f.airX ?? f.dest?.x);

function airStep(s, f) {
  const prevX = f.x;
  if (f.attack?.id === 'stomp') f.vy = Math.min(f.vy, -MOVES.stomp.dive);
  const prevY = fly(f, steerOf(f));
  f.x = blockX(s, f, prevX, f.x);
  groundSide(f, prevX);
  const top = f.vy <= 0 ? landing(f.x, prevY, f.y, surfaces(s)) : null;
  if (top) land(f, top);
}

function popDonut(s, f, d) {
  if (!f.carrying) return;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying });
  f.carrying = null;
}

function ringOut(s, f) {
  const r = STAGE.ringOut;
  if (f.x >= r.x0 && f.x <= r.x1 && f.y >= r.y) return;
  popDonut(s, f, { x: clamp(f.x, GROUND.x0 + DONUT_EDGE, GROUND.x1 - DONUT_EDGE), y: clamp(f.y, GROUND.y, RESPAWN_Y), vx: 0, vy: 0 });
  const sh = shelfOf(s, f.team);
  Object.assign(f, { x: sh.x, y: sh.y + RESPAWN_Y, vx: 0, vy: 0, on: null, jumps: 1, airX: null,
    attack: null, stun: 0, percent: 0, inv: INVINCIBLE_TICKS, plan: null });
}

function stepFighter(s, f) {
  if (f.on === null) airStep(s, f);
  else walkStep(s, f);
  if (Math.abs(f.vx) > TURN_SPEED && f.stun === 0) f.facing = f.vx > 0 ? 1 : -1;
  ringOut(s, f);
}

const sphereOf = (f, h) => ({ x: f.x + f.facing * h.dx * f.h * f.reach, y: f.y + h.dy * f.h, r: h.r * f.h });
const bodySpheres = (f) => [
  { x: f.x, y: f.y + 0.2 * f.h, r: 0.35 * f.w },
  { x: f.x, y: f.y + 0.5 * f.h, r: 0.5 * f.w },
  { x: f.x, y: f.y + 0.82 * f.h, r: 0.18 * f.h },
];
const overlaps = (as, bs) => as.some((a) => bs.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r));

function knock(s, f, o, m) {
  o.percent += m.damage;
  const speed = m.kb.base + m.kb.growth * o.percent, a = (m.kb.angle * Math.PI) / 180;
  o.vx = Math.cos(a) * speed * f.facing;
  o.vy = o.on === null ? Math.sin(a) * speed : Math.abs(Math.sin(a) * speed);
  Object.assign(o, { on: null, airX: null, attack: null, hitMove: speed >= LAUNCH_SPEED ? 'launched' : 'hurt' });
  o.stun = o.stunMax = Math.round(STUN_TICKS + STUN_PER_SPEED * speed);
  popDonut(s, o, { x: o.x, y: o.y + o.h, vx: f.facing * POP.vx, vy: POP.vy });
}

const boxGap = (sp, b) => Math.hypot(Math.max(b.x - sp.x, 0, sp.x - b.x - BRICK), Math.max(b.y - sp.y, 0, sp.y - b.y - BRICK));

function hitBrick(s, a, spheres, m) {
  let best = null, bestD = Infinity;
  for (const b of s.bricks)
    for (const sp of spheres) {
      const d = boxGap(sp, b);
      if (d < sp.r && d < bestD) { best = b; bestD = d; }
    }
  if (!best) return;
  a.brickDone = true;
  best.hits = Math.max(0, best.hits - m.brick);
  if (best.hits === 0) s.bricks = s.bricks.filter((b) => b !== best);
}

function attackStep(s, f) {
  const a = f.attack;
  if (!a) return;
  const m = MOVES[a.id];
  if (++a.t >= m.steps) { f.attack = null; return; }
  if (a.t < m.active[0] || a.t > m.active[1]) return;
  const spheres = m.spheres.map((h) => sphereOf(f, h));
  for (const o of s.fighters)
    if (!a.hit.includes(o.id) && canHit(f, o) && o.inv === 0 && overlaps(spheres, bodySpheres(o))) {
      a.hit.push(o.id);
      knock(s, f, o, m);
    }
  if (!a.brickDone) hitBrick(s, a, spheres, m);
}

function brickFloor(s, b) {
  let floor = -Infinity;
  for (const p of PLATFORMS) if (b.x + BRICK / 2 >= p.x0 && b.x + BRICK / 2 <= p.x1 && p.y <= b.y + EPS) floor = Math.max(floor, p.y);
  for (const o of s.bricks) if (o !== b && Math.abs(o.x - b.x) < EPS && o.y + BRICK <= b.y + EPS) floor = Math.max(floor, o.y + BRICK);
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
  d.vy -= GRAVITY * DT;
  const prevY = d.y;
  d.x = clamp(d.x + d.vx * DT, GROUND.x0 + DONUT_EDGE, GROUND.x1 - DONUT_EDGE);
  d.y += d.vy * DT;
  const top = landing(d.x, prevY, d.y, surfaces(s));
  if (top) Object.assign(d, { y: top.y, vx: 0, vy: 0 });
}

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

const touching = (f, d) => Math.abs(f.x - d.x) < f.w / 2 + DONUT_REACH && d.y >= f.y - 0.1 && d.y <= f.y + f.h;

function pickUp(s, f, d) {
  if (!d || f.carrying || !touching(f, d)) return;
  f.carrying = d.look;
  s.donuts = s.donuts.filter((o) => o !== d);
  f.target = null;
}

function act(s, f) {
  const g = f.dest;
  if (!g || f.on === null || f.stun > 0) return;
  if (g.faceX != null && Math.abs(f.x - g.x) < ARRIVE && Math.abs(g.faceX - f.x) > EPS) f.facing = g.faceX > f.x ? 1 : -1;
  pickUp(s, f, g.donut);
  if (g.shelf && g.shelf.team !== f.team && !f.carrying && Math.abs(f.x - g.shelf.x) < SHELF_REACH) f.carrying = grab(g.shelf);
}

function bankIfHome(s, f) {
  const sh = shelfOf(s, f.team);
  if (f.carrying && f.on !== null && Math.abs(f.x - sh.x) < SHELF_REACH && bank(sh, f.carrying)) f.carrying = null;
}

function applyInput(f, input) {
  const t = input?.target;
  if (t) aim(f, t);
  if (f.attack || f.stun > 0) return;
  const air = f.on === null ? 'stomp' : 'kick';
  if (input?.kick || input?.punch) f.attack = { id: input.kick ? air : 'punch', t: 0, hit: [], brickDone: false };
}

function aim(f, t) {
  f.target = { ...t };
  f.plan = null;
  if (!('x' in t) || f.stun > 0 || t.y <= f.y + f.h) return;
  if (f.on !== null && Math.abs(t.x - f.x) <= f.w) jump(f, null);
  else if (f.on === null && f.jumps > 0) { f.jumps--; f.vy = JUMP_SPEED; f.airX = null; }
}

function moveOf(f) {
  if (f.stun > 0) return f.hitMove;
  if (f.attack) return MOVES[f.attack.id].shows;
  if (f.on === null) return f.vy > 0 ? 'jump' : 'fall';
  return Math.abs(f.vx) > TURN_SPEED ? 'walk' : 'idle';
}

function stepOf(f) {
  if (f.stun > 0) return 1 - f.stun / f.stunMax;
  return f.attack ? f.attack.t / MOVES[f.attack.id].steps : 0;
}

const teamLooks = (entrants, team) => {
  const looks = entrants.filter((e) => e.team === team).map((e) => e.look);
  return looks.length ? looks : [DEFAULT_LOOKS[team]];
};

function makeShelf(spot, looks) {
  const levels = Math.ceil((2 * DONUTS_PER_SHELF) / SHELF_COLS);
  const shelf = { team: spot.team, x: spot.x, y: spot.y, g: makeDisplay(SHELF_COLS, 1, { shelves: levels, headroom: 1 }), items: [] };
  for (let i = 0; i < DONUTS_PER_SHELF; i++) bank(shelf, looks[i % looks.length]);
  return shelf;
}

function spawnX(s, e, cursor) {
  const sh = shelfOf(s, e.team), dir = sh.x < 0 ? 1 : -1;
  if (e.dummy) return -dir * (DUMMY_X + DUMMY_GAP * (cursor.dummies++));
  const clear = (x) => !s.bricks.some((b) => x + e.width / 2 > b.x && x - e.width / 2 < b.x + BRICK);
  let x = cursor[e.team] ?? sh.x + dir * SPAWN_GAP;
  while (!clear(x)) x += dir * SPAWN_GAP;
  cursor[e.team] = x + dir * SPAWN_GAP;
  return x;
}

function newFighter(e, x) {
  return { id: e.id, team: e.team, h: e.height, w: e.width, reach: e.reach, dummy: Boolean(e.dummy),
    x, y: GROUND.y, vx: 0, vy: 0, facing: e.team === 'heroes' ? 1 : -1, on: GROUND.i, jumps: 1,
    target: null, dest: null, plan: null, walkX: null, airX: null, blocked: null,
    attack: null, stun: 0, stunMax: 1, hitMove: 'hurt', inv: 0, percent: 0, carrying: null };
}

/** @param {import('./match.js').Entrant[]} entrants */
export function createMatch(entrants) {
  const s = { tick: 0, nextDonut: 0, links: jumpLinks(), fighters: [], donuts: [], shelves: [],
    bricks: STAGE.bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, vy: 0, hits: b.hits, maxHits: b.hits })) };
  s.shelves = STAGE.shelves.map((spot) => makeShelf(spot, teamLooks(entrants, spot.team)));
  const cursor = { dummies: 0 };
  s.fighters = entrants.map((e) => newFighter(e, spawnX(s, e, cursor)));
  for (const f of s.fighters) if (f.dummy) f.carrying = grab(shelfOf(s, f.team));
  return s;
}

const isOver = (s) => s.tick >= ROUND_SECONDS * TICK_HZ;

/** One fixed 1/TICK_HZ step. @param {Record<string, import('./match.js').Input>} inputs */
export function tick(s, inputs) {
  if (isOver(s)) return;
  for (const f of s.fighters) if (!f.dummy) applyInput(f, inputs[f.id]);
  for (const f of s.fighters) navigate(s, f);
  for (const f of s.fighters) stepFighter(s, f);
  for (const f of s.fighters) attackStep(s, f);
  settleBricks(s);
  for (const d of s.donuts) stepDonut(s, d);
  for (const f of s.fighters) {
    act(s, f);
    bankIfHome(s, f);
    f.stun = Math.max(0, f.stun - 1);
    f.inv = Math.max(0, f.inv - 1);
  }
  s.tick++;
}

const lookCopy = (l) => (l ? { ...l } : null);

function shelfLooks(sh) {
  const out = [];
  for (let lv = 0; lv < sh.g.shelves; lv++)
    for (let c = 0; c < sh.g.cols; c++) {
      const index = topAt(sh.g, lv, c, 0);
      if (index !== EMPTY) out.push({ ...sh.items[index] });
    }
  return out;
}

/** @returns {import('./match.js').FighterState} */
const fighterView = (f) => ({
  id: f.id, team: f.team, x: f.x, y: f.y, vx: f.vx, vy: f.vy, facing: f.facing, onGround: f.on !== null,
  move: moveOf(f), step: stepOf(f), percent: f.percent, carrying: lookCopy(f.carrying), invincible: f.inv > 0,
  target: f.dest ? { x: f.dest.x, y: f.dest.y } : null,
});

/** @returns {import('./match.js').Snapshot & { over: boolean }} */
export function snapshot(s) {
  return {
    tick: s.tick, secondsLeft: Math.max(0, ROUND_SECONDS - s.tick / TICK_HZ), over: isOver(s),
    fighters: s.fighters.map(fighterView),
    donuts: s.donuts.map((d) => ({ id: d.id, x: d.x, y: d.y, look: { ...d.look } })),
    bricks: s.bricks.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y, hits: b.hits, maxHits: b.maxHits })),
    shelves: s.shelves.map((sh) => ({ team: sh.team, x: sh.x, y: sh.y, donuts: shelfLooks(sh) })),
  };
}

/** @type {import('./match.js').MatchApi} */
export const SIM = Object.freeze({ createMatch, tick, snapshot });
