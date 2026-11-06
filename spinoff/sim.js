// The match host: one fixed tick of pure logic, no three.js, no Math.random. REUSE-SPEC.md §Milestones 1.
// The stage is a depth band (§Navigation): fighters walk in x/z on floor tops and jump in y.
import { BRICK, DONUTS_PER_SHELF, HITSTOP_TICKS, HIT_DEPTH, PILE_DX, ROUND_SECONDS, SHELF_WIDTH, TICK_HZ, outside } from './match.js';
import { EMPTY, anySlot, footprint, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { MATCH, canHit } from './roster.js';
import { cellUnder, facedCell, fortGrid, onTop } from './build.js';
import { HAMMER, hammerPath, handOf } from './hammer.js';
import {
  CELL, DT, EPS, GRAVITY, STEP, bandOf, brickBox, clamp, flat, floorBox, inXZ, supportAt,
} from './world.js';
import {
  FOLLOW_GAP, JUMP_SPEED, SLIDE_DRAG, SPRING_LIFT, TURN_SPEED, WP_ARRIVE, airStep, besideGoal, brickGoal, facingGoal, jump, navigate,
  pointGoal, reachUp, separate, slide, walkStep,
} from './walk.js';

const toBox = outside;

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
/** A hit chain (REUSE-SPEC.md §Power moves): hits landed with no miss, no hit taken, and no pause this long. */
const CHAIN_TICKS = 2.5 * TICK_HZ;
/** A ring-out counts for whoever hit the fighter last, if that was this recent. */
const CREDIT_TICKS = 5 * TICK_HZ;
/** Fighters hitting the same foe this close together are a crowd (the fight cloud). */
const CROWD_TICKS = TICK_HZ;
/** The power bar, 0 to 1: a little a second in play, and more for each of these. */
export const POWER = Object.freeze({ perSecond: 1 / 45, hit: 0.06, ringOut: 0.12, pickup: 0.05, steal: 0.15, bank: 0.25 });
/** What a full bar fires (Input.power): `toy` turns a foe into one of TOY's silly objects for a while. */
export const POWERS = Object.freeze(['toy']);
export const TOY = Object.freeze({ ticks: 3 * TICK_HZ, knock: 1.5, kinds: Object.freeze(['cottonBall', 'rubberDuck', 'teapot', 'sock']) });
export const POP = Object.freeze({ vy: 6 });
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
 *             brick: number, walks: boolean, dive?: number, hang?: number, pop?: number, home?: { reach: number, speed: number }, trip?: number, shows: 'punch'|'kick'|'sweep' }} Move
 * A stomp rises at `pop` for `hang` steps (the tablet draws a backflip; playtest: pressed late in a jump, a pause alone
 * flipped near the floor), then dives, steering at `home.speed` onto the nearest foe
 * below within `home.reach` of its body when it started (playtest: you fell too fast to stomp anyone, and only straight down).
 * `hammer` is the thrown Greathammer's hit: a kick's damage and knockback (REUSE-SPEC.md §Costumes), at its head.
 */
/** @type {Move} */
const KICK = { steps: 22, active: [7, 12], reach: { scale: 0.8, min: 0.3 }, dy: 0.3, r: 0.21, damage: 8,
  kb: { base: 6, growth: 0.12, angle: 25 }, brick: 2, walks: false, shows: 'kick' };
/** @type {Readonly<Record<'punch'|'kick'|'stomp'|'hammer'|'sweep'|'shot', Move>>} */
export const MOVES = Object.freeze({
  punch: { steps: 16, active: [4, 8], reach: { scale: 0.5, min: 0.2 }, dy: 0.6, r: 0.17, damage: 6,
    kb: { base: 5, growth: 0.1, angle: 50 }, brick: 1, walks: true, shows: 'punch' },
  kick: KICK,
  hammer: { ...KICK, reach: null, dy: HAMMER.chest, r: HAMMER.r },
  stomp: { steps: 38, active: [20, 32], reach: null, dy: -0.05, r: 0.3, damage: 7,
    kb: { base: 4, growth: 0.1, angle: -60 }, brick: 2, walks: true, dive: 6, hang: 18, pop: 2, home: { reach: 1, speed: 5 }, shows: 'kick' },
  // the wuxia sweep (characters/DANCES.md §Gymnastics), 🦶 held and let go: crouch, one low turn with the leg along the
  // floor hitting all the way round, a short freeze; timed to the dance's own steps (0.22, 0.60 s). It trips: a low, short
  // knock away from the sweeper, on their back till the sweep is over and `trip` steps more (playtest: knocked up and
  // away, they wandered off; down a fixed while, they were up again before the sweeper)
  // a trick's shot (§Trick shots): `shoots` from the hand, flying, not an attack the fighter makes; listed for its hit
  shot: { steps: 1, active: [0, 0], reach: null, dy: 0, r: 0.2, damage: 4, kb: { base: 3, growth: 0.08, angle: 30 },
    brick: 0, walks: true, shows: 'punch' },
  sweep: { steps: 58, active: [14, 49], reach: null, dy: 0.12, r: 0.55, damage: 7,
    kb: { base: 3, growth: 0.06, angle: 20 }, trip: 30, brick: 1, walks: false, shows: 'sweep' },
});


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
  if (!f.carrying) return;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying, by: f.id });
  f.carrying = null;
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

function lungeStep(s, f) {
  const a = f.attack;
  if (a?.lunge && a.t < MOVES[a.id].active[0]) slide(s, f, a.lunge.x, a.lunge.z);
}

function release(f) {
  const k = f.pending;
  f.pending = null;
  if (!k) return;
  Object.assign(f, { vx: k.vx, vy: k.vy, vz: k.vz, onGround: false, airTo: null, navJump: null, stun: k.stun, stunMax: k.stun, sliding: k.slide });
  // a skid stays on the floor (landing would stop it dead), still flat on its back: the tablet lays a tripped fighter
  // down over its stun's first 15% (play.js trippedTilt)
  if (k.slide) Object.assign(f, { onGround: true, stunMax: Math.round(k.stun / 0.85) });
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

/** playtest: a foe that walks past you got away, so with nothing to hit in front an attack turns you to the nearest foe a step away. */
function faceFoe(s, f, m) {
  if (!m.reach || frontGap(s, f) <= LUNGE_RANGE) return;
  let best = null, bestGap = LUNGE_RANGE;
  for (const o of s.fighters) {
    const gap = flat(f, o) - f.r - o.r;
    if (canStrike(s, f, o) && Math.abs(o.y - f.y) <= f.h && gap <= bestGap) [best, bestGap] = [o, gap];
  }
  if (best && flat(f, best) > EPS) f.facing = Math.atan2(best.z - f.z, best.x - f.x);
}

/** A stomp steers onto its foe, and hangs before it dives. True while it hangs. */
function stompAir(s, f) {
  const a = f.attack;
  if (a?.id !== 'stomp') return false;
  const m = MOVES.stomp, o = s.fighters.find((p) => p.id === a.on);
  if (o && canStrike(s, f, o)) {
    const d = flat(f, o), v = d > EPS ? Math.min(m.home.speed, d / DT) / d : 0;
    Object.assign(f, { vx: (o.x - f.x) * v, vz: (o.z - f.z) * v });
  }
  if (a.t < m.hang) return true;
  f.vy = Math.min(f.vy, -m.dive);
  return false;
}

/** The foe a stomp starting now homes onto: the nearest one below within reach, faced. */
function stompTarget(s, f) {
  let best = null, bestGap = MOVES.stomp.home.reach;
  for (const o of s.fighters) {
    const gap = flat(f, o) - f.r - o.r;
    if (canStrike(s, f, o) && o.y < f.y && gap <= bestGap) [best, bestGap] = [o, gap];
  }
  if (best && flat(f, best) > EPS) f.facing = Math.atan2(best.z - f.z, best.x - f.x);
  return best?.id ?? null;
}

function lungeFor(s, f, m) {
  const gap = frontGap(s, f);
  if (!m.reach || gap > LUNGE_RANGE) return null;
  const step = clamp(gap - LUNGE_KEEP, 0, LUNGE) / m.active[0], u = ahead(f);
  return step > 0 ? { x: u.x * step, z: u.z * step } : null;
}

/** `o` takes f's `id` hit at p, knocked along `u`. */
/** On its back on the floor: a trip's stun. Hit there, it skids instead (playtest: hilarious). */
const downed = (o) => o.hitMove === 'tripped' && o.stun > 0 && o.onGround;
/** The whole hit flat along the floor, away from the hitter; down at least till the skid has stopped, and a little more. */
const skidFrom = (o, u, speed) => ({ vx: u.x * speed, vy: 0, vz: u.z * speed, slide: true,
  stun: Math.max(o.stun, Math.round((speed / SLIDE_DRAG) * TICK_HZ) + STUN_TICKS) });
/** A trip keeps them down till the sweep is over, and `trip` steps more: the sweeper is always up first. */
const tripFor = (f, m) => (m.trip ? m.steps - f.attack.t + m.trip : 0);
const hitMoveOf = (m, speed) => {
  if (m.trip) return 'tripped';
  return speed >= LAUNCH_SPEED ? 'launched' : 'hurt';
};
/** The flat direction from f out to o (f's facing if they stand on the same spot). */
function awayFrom(f, o) {
  const d = flat(f, o);
  return d > EPS ? { x: (o.x - f.x) / d, z: (o.z - f.z) / d } : ahead(f);
}

function strike(s, f, o, p, { id, u } = { id: f.attack.id, u: ahead(f) }) {
  const m = MOVES[id], broke = Boolean(o.carrying);
  o.percent += m.damage;
  o.calm = 0;
  const speed = (m.kb.base + m.kb.growth * o.percent) * (o.toy ? TOY.knock : 1), a = (m.kb.angle * Math.PI) / 180, along = Math.cos(a) * speed;
  const up = o.onGround ? Math.abs(Math.sin(a) * speed) : Math.sin(a) * speed;
  o.pending = downed(o) ? skidFrom(o, u, speed)
    : { vx: u.x * along, vy: up, vz: u.z * along, stun: Math.round(STUN_TICKS + STUN_PER_SPEED * speed) + tripFor(f, m) };
  Object.assign(o, { attack: null, charging: false, hitMove: downed(o) ? 'tripped' : hitMoveOf(m, speed), freeze: HITSTOP_TICKS });
  f.freeze = HITSTOP_TICKS;
  // REUSE-SPEC.md §Scoring: the donut flies with the hit, so it lands just past its carrier however hard the hit
  // (playtest: a fixed pop left a fresh bad guy on top of its donut and a battered kid metres past theirs)
  const k = o.pending;
  drop(s, o, { x: o.x, y: o.y + o.h / 2, z: o.z, vx: k.vx, vy: k.vy, vz: k.vz });
  if (f.attack?.id === id) f.attack.hit.push(o.id);
  s.hits.push({ ...p, move: id, on: 'fighter', target: o.id, broke, by: f.id, ...credit(s, f, o) });
}

const chainOf = (s, f) => (s.tick - f.chainAt <= CHAIN_TICKS ? f.chain : 0);

/** f's chain goes on and o's ends; o remembers f, for a ring-out's credit and a crowd. What else the hit was (HitEvent). */
function credit(s, f, o) {
  Object.assign(f, { chain: chainOf(s, f) + 1, chainAt: s.tick });
  o.chain = 0;
  o.lastHit = { by: f.id, at: s.tick };
  o.hitBy = [...o.hitBy.filter((h) => s.tick - h.at < CROWD_TICKS && h.by !== f.id), o.lastHit];
  return { air: !o.onGround, bounced: !f.onGround && f.sprung >= 0, fell: Math.max(0, f.peak - f.y), crowd: o.hitBy.length, chain: f.chain };
}

/** The nearest brick (not team `spare`'s) the sphere touches takes `id`'s hit. True if one did. */
function hitBrick(s, sp, id, spare = null) {
  let best = null;
  for (const b of s.bricks) {
    const c = b.team === spare ? null : brickContact(sp, b);
    if (c && (!best || c.d < best.d)) best = { ...c, b };
  }
  if (!best) return false;
  const { b } = best;
  b.hits = Math.max(0, b.hits - MOVES[id].brick);
  if (b.hits === 0) s.bricks = s.bricks.filter((o) => o !== b);
  s.hits.push({ ...best.p, move: id, on: 'brick', target: b.id, broke: b.hits === 0 });
  return true;
}

/** An attack that hit nothing ends the chain. */
function endAttack(f) {
  if (!f.attack.hit.length && !f.attack.brickDone) f.chain = 0;
  f.attack = null;
}


function attackStep(s, f) {
  const a = f.attack;
  if (!a || f.still || f.freeze > 0) return;
  const m = MOVES[a.id];
  if (++a.t >= m.steps) { endAttack(f); return; }
  if (a.t >= m.active[0] && a.t <= m.active[1]) strikeAround(s, f, a, m);
}

function strikeAround(s, f, a, m) {
  if (a.shot && a.t === m.active[0]) launchShot(s, f, a.shot);
  const sp = hitSphere(f, m);
  for (const o of s.fighters) {
    const p = !a.hit.includes(o.id) && canStrike(s, f, o) ? bodyContact(sp, o) : null;
    if (p) strike(s, f, o, p, { id: a.id, u: m.trip || downed(o) ? awayFrom(f, o) : ahead(f) });
  }
  if (!a.brickDone) a.brickDone = hitBrick(s, sp, a.id);
}

// --- the Greathammer (REUSE-SPEC.md §Costumes) ---------------------------------------------

/** Thrown once the path showed: ignored unless the hammer is in the hand of a fighter in play. */
function throwHammer(s, f, k) {
  if (typeof k !== 'number' || !Number.isFinite(k) || f.hands !== 'hammer' || f.out || f.stun > 0 || f.pending || f.toy) return;
  if (s.hammers.some((h) => h.owner === f.id)) return;
  const from = handOf(f, f.h);
  s.hammers.push({ owner: f.id, k: clamp(k, 0, 1), t: 0, from, x: from.x, y: from.y, z: from.z });
}

/** One tick of flight; false once it's back in the hand: a lap done, a hit, or its thrower rung out. */
function flyHammer(s, hm) {
  const f = s.fighters.find((o) => o.id === hm.owner);
  if (f.out) return false;
  hm.t += DT;
  const p = hammerPath(hm.from, hm.k, hm.t, s.stage, handOf(f, f.h)), d = flat(p, hm);
  if (hm.t >= p.T) { f.chain = 0; return false; }
  const u = d > EPS ? { x: (p.x - hm.x) / d, z: (p.z - hm.z) / d } : ahead(f), sp = { x: p.x, y: p.y, z: p.z, r: HAMMER.r };
  Object.assign(hm, { x: p.x, y: p.y, z: p.z });
  for (const o of s.fighters) {
    const c = o.team !== f.team && canStrike(s, { ...f, z: p.z }, o) ? bodyContact(sp, o) : null;
    if (c) { strike(s, f, o, c, { id: 'hammer', u }); return false; }
  }
  return !hitBrick(s, sp, 'hammer', f.team);
}

function attacks(s) {
  for (const f of s.fighters) attackStep(s, f);
  s.hammers = s.hammers.filter((hm) => flyHammer(s, hm));
  s.shots = s.shots.filter((t) => flyShot(s, t));
}

/** Doing something already: attacking, hit, or out. */
const busy = (f) => Boolean(f.attack || f.stun > 0 || f.freeze > 0 || f.pending || f.out || f.toy);

// --- trick shots (REUSE-SPEC.md §Trick shots) ------------------------------------------------

/** How far each trick's shot can fly (m), and how fast (m/s, SHOT_SPEED if left out); a trick not here has none. */
export const SHOTS = Object.freeze({
  sparkle: { reach: 2 }, bubble: { reach: 1.5, speed: 3 }, flame: { reach: 2 }, bebop: { reach: 2 }, starPunch: { reach: 3 },
  fireball: { reach: 3.5 }, loveTap: { reach: 1.5 }, bubblegumPop: { reach: 1.5, speed: 4 }, powerPuff: { reach: 2 },
  magicStar: { reach: 3 }, heartBlast: { reach: 2.5 }, smiteOfLight: { reach: 3 }, speedLines: { reach: 3.5, speed: 12 },
  lightningStorm: { reach: 2.5, speed: 14 }, atomicBall: { reach: 2.5 }, shootingStar: { reach: 4, speed: 10 }, music: { reach: 2.5 },
});
export const SHOT_TAP = 0.15;
const SHOT_SPEED = 8, SHOT_HOLD_PER_M = 0.3, SHOT_FIZZLE = 0.4;

/**
 * 🥊 held `seconds` with `trick`: how much of its reach a shot let go now flies (0 to 1), or null for none: a tap (only the
 * punch it pressed), or held past full so long it fizzled. The tablet fills 🥊 with it; the host trusts only 0 to 1.
 */
export function shotCharge(trick, seconds) {
  const shot = SHOTS[trick];
  if (!shot || !(seconds >= SHOT_TAP)) return null;
  const full = shot.reach * SHOT_HOLD_PER_M;
  return seconds > full + SHOT_FIZZLE ? null : Math.min(1, seconds / full);
}

const canShoot = (f) => Boolean(SHOTS[f.trick]) && f.hands !== 'hammer';

/** 🥊 held: the fighter winds up, its swing held at its start (`charge`), till let go or 🦶; any press ends it. */
function chargeInput(f, input) {
  if (input.charge !== undefined) f.charging = input.charge === true && canShoot(f) && !busy(f);
  if (input.kick || input.punch || input.shot !== undefined) f.charging = false;
}

/** Let go with `k` of its reach: the swing, and its shot leaves as it strikes (`launchShot`); one of yours in the air at a time. */
function shoot(s, f, k) {
  if (!canShoot(f) || typeof k !== 'number' || !(k > 0 && k <= 1) || busy(f) || s.shots.some((t) => t.by === f.id)) return;
  startAttack(s, f, 'punch');
  f.attack.shot = k;
}

function launchShot(s, f, k) {
  const shot = SHOTS[f.trick], from = handOf(f, f.h), u = ahead(f);
  s.nextShot += 1;
  s.shots.push({ id: `shot${s.nextShot}`, by: f.id, trick: f.trick, ux: u.x, uz: u.z, left: k * shot.reach, speed: shot.speed ?? SHOT_SPEED, ...from });
}

/** One tick of a shot's flight; false once it hit someone or ran out. ponytail: flies through walls; stop at bricks if it shows. */
function flyShot(s, t) {
  const f = s.fighters.find((o) => o.id === t.by), step = Math.min(t.left, t.speed * DT);
  Object.assign(t, { x: t.x + t.ux * step, z: t.z + t.uz * step, left: t.left - step });
  const sp = { x: t.x, y: t.y, z: t.z, r: MOVES.shot.r };
  for (const o of s.fighters) {
    const c = o.team !== f.team && canStrike(s, f, o) ? bodyContact(sp, o) : null;
    if (c) { strike(s, f, o, c, { id: 'shot', u: { x: t.ux, z: t.uz } }); return false; }
  }
  return t.left > EPS;
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

/** 🦶 let go after a hold sweeps; otherwise a free fighter punches, kicks or stomps. */
// REUSE-SPEC.md §Discoverable moves: 🦶 held and let go is the sweep (the tablet times the hold), on the ground; it cuts
// short the kick the press started
const sweeps = (f, input) => input.sweep && f.onGround && !f.stun && !f.freeze && !f.pending && !f.out && !f.toy
  && (!f.attack || f.attack.id === 'kick');

function nextMove(f, input) {
  if (sweeps(f, input)) return 'sweep';
  if (busy(f) || !(input.kick || input.punch)) return null;
  if (!input.kick) return 'punch';
  return f.onGround ? 'kick' : 'stomp';
}

/** @param {import('./match.js').Input} input */
function attackInput(s, f, input) {
  usePower(s, f, input.power);
  throwHammer(s, f, input.throw);
  chargeInput(f, input);
  shoot(s, f, input.shot);
  const id = nextMove(f, input);
  if (id) startAttack(s, f, id);
}

function startAttack(s, f, id) {
  if (f.attack) endAttack(f);
  faceFoe(s, f, MOVES[id]);
  // a stomp on the way up is a spinning jump kick, on the way down a backflip (playtest: both read well, each at its time)
  f.attack = { id, t: 0, hit: [], brickDone: false, lunge: lungeFor(s, f, MOVES[id]), on: id === 'stomp' ? stompTarget(s, f) : null,
    turn: id === 'stomp' && (f.vy > 0 ? 'spin' : 'flip') };
}

/** A full bar fires `power`, recognised on the tablet; the host ignores one it can't fire. */
function usePower(s, f, power) {
  if (!power || f.power < 1 || f.out || f.toy || !POWERS.includes(power.kind)) return;
  const o = s.fighters.find((x) => x.id === power.on);
  if (!o || !canHit(f, o, s.rules) || o.out || o.toy) return;
  f.power = 0;
  drop(s, o, { x: o.x, y: o.y + o.h, z: o.z, vx: 0, vy: POP.vy, vz: 0 });
  Object.assign(o, { attack: null, toy: { kind: TOY.kinds[s.tick % TOY.kinds.length], t: TOY.ticks } });
  s.powers.push({ fighter: f.id, kind: power.kind, on: o.id, x: o.x, y: o.y, z: o.z });
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
  const s = { stage, band: bandOf(stage), jump: jumpsOn(stage), floorBoxes: stage.floors.map(floorBox), tick: 0, nextDonut: 0, fighters: [], donuts: [], shelves: [], solids: [], grids: new Map(), brickKey: '',
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

/** A tick off each timer: a toy, stun, invincibility; percent drains once calm. */
function countDown(f) {
  if (f.toy && --f.toy.t <= 0) f.toy = null;
  f.stun = Math.max(0, f.stun - 1);
  f.inv = Math.max(0, f.inv - 1);
  if (++f.calm > CALM_TICKS) f.percent = Math.max(0, f.percent - CALM_DRAIN / TICK_HZ);
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
