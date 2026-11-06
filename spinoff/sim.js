// The match host: one fixed tick of pure logic, no three.js, no Math.random. REUSE-SPEC.md §Milestones 1.
// The stage is a depth band (§Navigation): fighters walk in x/z on floor tops and jump in y.
import { BRICK, DONUTS_PER_SHELF, PILE_DX, ROUND_SECONDS, SHELF_WIDTH, TICK_HZ, outside } from './match.js';
import { EMPTY, anySlot, footprint, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { MATCH } from './roster.js';
import { cellUnder, facedCell, fortGrid, onTop } from './build.js';
import {
  CELL, DT, EPS, GRAVITY, STEP, bandOf, brickBox, clamp, flat, floorBox, inXZ, supportAt,
} from './world.js';
import {
  FOLLOW_GAP, JUMP_SPEED, SPRING_LIFT, TURN_SPEED, WP_ARRIVE, airStep, besideGoal, brickGoal, facingGoal, jump, navigate,
  pointGoal, reachUp, separate, walkStep,
} from './walk.js';
import { MOVES, attackInput, attacks, chainOf, countDown, lungeStep, release, stompAir } from './combat.js';

const toBox = outside;

export const RESPAWN_Y = 3;
const RESPAWN_DZ = 0.6;
export const INVINCIBLE_TICKS = 2 * TICK_HZ;
/** After a ring-out the faller is out of play this long, then drops in (REUSE-SPEC.md §Scoring; 2-5 s to tune). */
export const RESPAWN_WAIT = 3 * TICK_HZ;
/** A ring-out counts for whoever hit the fighter last, if that was this recent. */
const CREDIT_TICKS = 5 * TICK_HZ;
/** The power bar, 0 to 1: a little a second in play, and more for each of these. */
export const POWER = Object.freeze({ perSecond: 1 / 45, hit: 0.06, ringOut: 0.12, pickup: 0.05, steal: 0.15, bank: 0.25 });
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



const shelfBox = (z0) => (sh) => ({ x0: sh.x - sh.half, x1: sh.x + sh.half, z0, z1: sh.z, y0: sh.y, y1: sh.y + SHELF_H, kind: 'shelf' });
const shelfOf = (s, team) => s.shelves.find((sh) => sh.team === team);
/** In front of the shelf: touching it anywhere along its front, or with `side` 0, your middle in front of it (REUSE-SPEC.md §Mode). */
const standingAt = (f, sh, reach = SHELF_REACH, side = f.r) => f.onGround && Math.abs(f.y - sh.y) <= STEP
  && Math.abs(f.x - sh.x) < sh.half + side && f.z >= sh.z && f.z - sh.z < f.r + reach;
/** REUSE-SPEC.md §Mode: a guard standing in front of its shelf blocks the grab; one knocked to its end doesn't. */
const guarding = (s, f) => standingAt(f, shelfOf(s, f.team), GUARD_REACH, 0);
const guardOf = (s, team) => s.fighters.find((o) => o.team === team && guarding(s, o));


/** The nearest spot touching the shelf's front; empty-handed at your own, right in front of it (to guard) where there's room.
 * Picked once a tap, again when the blocks or your hands change. */
function shelfGoal(s, f, sh) {
  const why = `${sh.team}/${s.brickKey}/${Boolean(f.carrying)}`;
  if (f.shelfSpot?.why === why) return f.shelfSpot.goal;
  const z = sh.z + f.r + SHELF_GAP, n = Math.ceil((sh.half + f.r) / CELL), at = (p) => ({ ...p, r: f.r, onGround: true });
  const off = (p) => Number(sh.team === f.team && !f.carrying && !standingAt(at(p), sh, SHELF_REACH, 0));
  const spots = Array.from({ length: 2 * n + 1 }, (_, i) => pointGoal(s, f, sh.x + (i - n) * CELL, z, sh.y))
    .filter((p) => standingAt(at(p), sh))
    .sort((a, b) => off(a) - off(b) || flat(f, a) - flat(f, b));
  f.shelfSpot = { why, goal: { ...(spots[0] ?? pointGoal(s, f, sh.x, z, sh.y)), face: sh } };
  return f.shelfSpot.goal;
}

function thingGoal(s, f, t) {
  if (t.thing === 'shelf') {
    // REUSE-SPEC.md §Mode: a guarded shelf walks you up to the guard instead, facing it
    const guard = t.team !== f.team && guardOf(s, t.team);
    if (guard) return besideGoal(s, f, guard);
    return shelfGoal(s, f, shelfOf(s, t.team));
  }
  if (t.thing === 'pile') {
    const pile = s.piles.find((p) => p.owner === t.id);
    return pile ? { ...pointGoal(s, f, pile.x, pile.z, pile.y), face: pile } : null;
  }
  const list = { donut: s.donuts, brick: s.bricks, fighter: s.fighters }[t.thing];
  // a fighter rung out is gone until it drops in: chasing it would walk you to its shelf (playtest)
  const it = list?.find((o) => o.id === t.id && o !== f && !(o.out > 0));
  if (!it) return null;
  if (t.thing === 'brick') return brickGoal(s, f, it);
  if (t.thing === 'donut') return { ...pointGoal(s, f, it.x, it.z, it.y), face: it };
  return facingGoal(s, f, it);
}

function resolve(s, f) {
  const t = f.target;
  if ('x' in t) return f.placeCell ? brickGoal(s, f, f.placeCell) : pointGoal(s, f, t.x, t.z, t.y);
  const g = thingGoal(s, f, t);
  if (!g) f.target = null;
  return g;
}

function drop(s, f, d) {
  if (!f.carrying) return false;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying, by: f.id });
  f.carrying = null;
  return true;
}

function ringOut(s, f) {
  const r = s.stage.ringOut;
  if (f.x >= r.x0 && f.x <= r.x1 && f.z <= r.z1 && f.y >= r.y) return;
  const b = s.band, x = clamp(f.x, b.x0 + DONUT_EDGE, b.x1 - DONUT_EDGE), z = clamp(f.z, b.z0 + DONUT_EDGE, b.z1 - DONUT_EDGE);
  drop(s, f, { x, y: supportAt(s.solids, x, z, Infinity), z, vx: 0, vy: 0, vz: 0 });
  s.ringOuts.push({ fighter: f.id, by: f.lastHit && s.tick - f.lastHit.at <= CREDIT_TICKS ? f.lastHit.by : null, x: f.x, y: f.y, z: f.z });
  const sh = shelfOf(s, f.team);
  Object.assign(f, { x: sh.x, y: sh.y + RESPAWN_Y, z: sh.z + RESPAWN_DZ, vx: 0, vy: 0, vz: 0, onGround: false,
    jumps: 1, airTo: null, attack: null, stun: 0, pending: null, freeze: 0, percent: 0, calm: 0, inv: 0, out: RESPAWN_WAIT,
    nav: null, navJump: null, stuck: 0, chain: 0, lastHit: null, hitBy: [], toy: null, peak: sh.y + RESPAWN_Y });
}


/** What walking asks the game (walk.js Mind): targets by thing, attacks that root or busy a fighter, the stomp's pop, guards. */
/** @type {import('./walk.js').Mind} */
const MIND = {
  goal: resolve,
  busy: (f) => Boolean(f.attack),
  rooted: (f) => Boolean(f.attack && !MOVES[f.attack.id].walks),
  lift: (s, f) => (stompAir(s, f) ? MOVES.stomp.pop : null),
  holds,
};

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
  navigate(s, f, MIND);
  if (f.onGround) walkStep(s, f, MIND);
  else airStep(s, f, MIND);
  f.peak = f.onGround ? f.y : Math.max(f.peak, f.y);
  lungeStep(s, f);
  // Facing is set on the ground and by a jump, then held in the air: drifting back toward a ledge mustn't spin you round.
  // An attack holds it too, so one turned to a foe behind you still lands while you walk on (playtest)
  if (f.onGround && f.stun === 0 && !f.attack && Math.hypot(f.vx, f.vz) > TURN_SPEED) f.facing = Math.atan2(f.vz, f.vx);
  ringOut(s, f);
}

/** A kid standing still beside its team's block: there's a wall for a bad guy to kick, so the kid in its gap holds (playtest). */
const walled = (s, f) => s.bricks.some((b) => b.team === f.team && b.y < f.y + f.h && b.y + BRICK > f.y && toBox(brickBox(b), f.x, f.z) < f.r + BRICK);
/** A guard at its shelf, or a kid standing still in a wall, isn't shoved by a fighter walking into it. */
function holds(s, f) {
  return guarding(s, f) || (f.team === 'heroes' && f.onGround && !f.walkTo && walled(s, f));
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
    if (f.carrying) { if (!f.touching.includes(d.id)) s.fullBag.push({ ...event(f, d), donut: d.id }); }
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
  grabAt(s, f, sh);
}

/** REUSE-SPEC.md §Scoring: one donut at a time for a bad guy; while one it dropped is loose, a shelf gives it nothing. Kids are free. */
function grabAt(s, f, sh) {
  if (f.carrying || (f.team === 'badGuys' && s.donuts.some((d) => d.by === f.id))) { s.fullBag.push(event(f, sh)); return; }
  if ((f.carrying = grab(sh))) s.donutEvents.push({ ...event(f, sh), kind: 'steal' });
}

// --- the build round (REUSE-SPEC.md §Forts) ------------------------------------------------

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
  Object.assign(f, { target: 'stop' in t ? null : { ...t }, shelfSpot: null, nav: null, fails: 0, shelfDone: false, stuck: 0, passed: false });
  // REUSE-SPEC.md §Forts, Building is carrying blocks: carrying, a floor tap is where the block goes, so you walk up facing that cell
  f.placeCell = s.phase === 'build' && f.block && 'x' in t ? cellUnder(fortGrid(s.stage, f.team, s.bricks, s.piles), t) : null;
  if ('x' in t) tapAbove(s, f, t);
}

/** A jump tap (playtest: a second jump timed by hand was too hard to hit): on the ground a jump where you stand; in the air the
 * double jump, saved for the top of the first however early it's tapped. */
function jumpTap(s, f) {
  if (f.stun > 0) return;
  if (f.onGround) jump(s, f, { x: f.x, z: f.z });
  else if (f.jumps > 0) f.again = true;
}


function setAway(s, f, away) {
  if (away == null || away === f.away) return;
  f.away = away;
  if (away) aim(s, f, { stop: true });
}

function applyInput(s, f, input) {
  setAway(s, f, input?.away);
  if (f.away || !input) return;
  if (input.target && !f.out && 'jump' in input.target) jumpTap(s, f);
  else if (input.target && !f.out) aim(s, f, input.target);
  if (s.phase === 'build') readyInput(s, f, input);
  else attackInput(s, f, input);
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
  const shelf = { team: spot.team, x: spot.x, y: spot.y, z: spot.z, half: SHELF_WIDTH / 2, g, items: [] };
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
  return { id: e.id, team: e.team, hands: e.hands ?? 'gloves', trick: e.trick ?? null, icing: e.look.frosting, block: null, placeCell: null, h: e.height, w: e.width, r: e.width / 2, reach: e.reach, dummy: Boolean(e.dummy),
    x: at.x, y, z: at.z, vx: 0, vy: 0, vz: 0, facing: e.team === 'heroes' ? 0 : Math.PI, onGround: true, jumps: 1,
    target: null, dest: null, nav: null, walkTo: null, airTo: null, navJump: null, again: false, fails: 0, stuck: 0, gain: 0, away: false, slick: false, passed: false, sprung: -1,
    attack: null, charging: false, stun: 0, stunMax: 1, hitMove: 'hurt', sliding: false, pending: null, freeze: 0, still: false, inv: 0, out: 0, percent: 0, calm: 0,
    carrying: null, touching: [], shelfDone: false, shelfSpot: null, blocked: false,
    chain: 0, chainAt: -Infinity, lastHit: null, hitBy: [], peak: y, power: 0, toy: null };
}

function refresh(s) {
  s.solids = [...s.floorBoxes, ...s.shelves.map(shelfBox(s.band.z0)), ...s.bricks.map(brickBox)];
  // routes replan once a falling brick lands, not on every tick of its fall (each replan rebuilds every body size's grid)
  if (s.bricks.some((b) => b.vy)) return;
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
  const s = { drop, stage, band: bandOf(stage), jump: jumpsOn(stage), floorBoxes: stage.floors.map(floorBox), tick: 0, nextDonut: 0, fighters: [], donuts: [], shelves: [], solids: [], grids: new Map(), brickKey: '',
    hits: [], fullBag: [], donutEvents: [], ringOuts: [], powers: [], hammers: [], shots: [], nextShot: 0, rules: match, phase: pieces > 0 ? 'build' : 'play', t0: 0, ready: new Set(), go: false, piles: [], nextBrick: 0,
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
  Object.assign(s, { hits: [], fullBag: [], donutEvents: [], ringOuts: [], powers: [] });
  applyInputs(s, inputs);
  for (const f of s.fighters) moveFighter(s, f);
  separate(s, MIND);
  attacks(s);
  settleBricks(s);
  refresh(s);
  for (const d of s.donuts) stepDonut(s, d);
  for (const f of s.fighters) {
    if (!f.toy) grabStep(s, f);
    if (!f.still) countDown(f);
  }
  powerUp(s);
  s.tick++;
}


/** Donuts and blocks: what a fighter touches or stands at. A toy (TOY) grabs nothing. */
function grabStep(s, f) {
  touchDonuts(s, f);
  (s.phase === 'build' ? fetchStep : shelfStep)(s, f);
}

/** The bar fills a little a second in play, and more for what this tick's events say each fighter did. */
function powerUp(s) {
  if (s.phase !== 'play') return;
  const byId = new Map(s.fighters.map((f) => [f.id, f])), gain = (f, k) => { if (f) f.power = Math.min(1, f.power + k); };
  for (const f of s.fighters) if (!f.out) gain(f, POWER.perSecond / TICK_HZ);
  for (const h of s.hits) if (h.on === 'fighter') gain(byId.get(h.by), POWER.hit);
  for (const e of s.ringOuts) if (e.by) gain(byId.get(e.by), POWER.ringOut);
  for (const e of s.donutEvents) if (e.kind in POWER) gain(byId.get(e.fighter), POWER[e.kind]);
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
  if (f.charging) return 'charge';
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
const fighterView = (s, f) => ({
  id: f.id, team: f.team, x: f.x, y: f.y, z: f.z, vx: f.vx, vy: f.vy, vz: f.vz, facing: f.facing, height: f.h, width: f.w,
  onGround: f.onGround, move: moveOf(f), step: stepOf(f), shooting: Boolean(f.attack?.shot), percent: f.percent, carrying: f.carrying ? { ...f.carrying } : null,
  invincible: f.inv > 0, respawn: f.out / TICK_HZ, target: f.dest ? { x: f.dest.x, y: f.dest.y, z: f.dest.z } : null, block: f.block,
  power: f.power, chain: chainOf(s, f), toy: f.toy?.kind ?? null, ...(f.attack?.turn && { turn: f.attack.turn }),
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
    fighters: s.fighters.map((f) => fighterView(s, f)),
    donuts: s.donuts.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, look: { ...d.look }, by: d.by })),
    hammers: s.hammers.map((h) => ({ owner: h.owner, x: h.x, y: h.y, z: h.z })),
    shots: s.shots.map((t) => ({ id: t.id, by: t.by, trick: t.trick, x: t.x, y: t.y, z: t.z, ux: t.ux, uz: t.uz, left: t.left })),
    bricks: s.bricks.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y, z: b.z, hits: b.hits, maxHits: b.maxHits, icing: b.icing })),
    shelves: s.shelves.map((sh) => ({ team: sh.team, x: sh.x, y: sh.y, z: sh.z, donuts: shelfLooks(sh) })),
    hits: s.hits.map((h) => ({ ...h })),
    fullBag: s.fullBag.map((e) => ({ ...e })),
    donutEvents: s.donutEvents.map((e) => ({ ...e })),
    ringOuts: s.ringOuts.map((e) => ({ ...e })),
    powers: s.powers.map((e) => ({ ...e })),
  };
}

/** @type {import('./match.js').MatchApi} */
export const SIM = Object.freeze({ createMatch, tick, snapshot });
