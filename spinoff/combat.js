// Fighting (REUSE-SPEC.md §Combat): moves and their hit spheres, hits, knockback, percent and stun, the sweep's trips
// and skids, chains, the Greathammer, trick shots, the toy power. Works on any stage walk.js can move bodies over, and
// breaks its bricks. Knows nothing of donuts: a struck fighter's loot is the game's (`s.drop`, below).
// State it reads: world.js's, `s.fighters`, `s.bricks`, `s.hits`, `s.hammers`, `s.shots`, `s.powers`, `s.rules`, `s.tick`,
// and `s.drop(s, o, fling)`: the game drops what `o` carries, flung at `fling` ({ x, y, z, vx, vy, vz }); true if it had any.
import { BRICK, HITSTOP_TICKS, HIT_DEPTH, TICK_HZ } from './match.js';
import { HAMMER, hammerPath, handOf } from './hammer.js';
import { DT, EPS, clamp, flat } from './world.js';
import { SLIDE_DRAG, slide } from './walk.js';

// REUSE-SPEC.md §Mode: kids can't hit each other for now, but it is a match setting, not a rule baked in; so is whether
// bad guys may hit heroes (§Forts, Level 2: they don't there), CPU or grownup alike
/** @type {Readonly<{ friendlyFire: boolean, badGuysHit: boolean }>} */
export const MATCH = Object.freeze({ friendlyFire: false, badGuysHit: true });
/** @param {{ id: string, team: string }} a @param {{ id: string, team: string }} b @param {{ friendlyFire: boolean, badGuysHit?: boolean }} [match] */
export const canHit = (a, b, match = MATCH) => a.id !== b.id && (a.team !== b.team || match.friendlyFire)
  && (match.badGuysHit !== false || a.team !== 'badGuys' || b.team !== 'heroes');

export const LUNGE = 0.3;
export const LUNGE_RANGE = 0.8;
const LUNGE_KEEP = 0.1;

export const LAUNCH_SPEED = 5;
/** Untouched this long, a fighter steadies: percent (and its wobble) drains at CALM_DRAIN a second. */
export const CALM_TICKS = 1.5 * TICK_HZ;
export const CALM_DRAIN = 30;
export const STUN_TICKS = 8;
export const STUN_PER_SPEED = 2;
/** A hit chain (REUSE-SPEC.md §Power moves): hits landed with no miss, no hit taken, and no pause this long. */
const CHAIN_TICKS = 2.5 * TICK_HZ;

/** Fighters hitting the same foe this close together are a crowd (the fight cloud). */
const CROWD_TICKS = TICK_HZ;

/** What a full bar fires (Input.power): `toy` turns a foe into one of TOY's silly objects for a while. */
export const POWERS = Object.freeze(['toy']);
/** A toy's loot pops straight up at this speed (m/s). */
export const POP = Object.freeze({ vy: 6 });
export const TOY = Object.freeze({ ticks: 3 * TICK_HZ, knock: 1.5, kinds: Object.freeze(['cottonBall', 'rubberDuck', 'teapot', 'sock']) });

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

export function lungeStep(s, f) {
  const a = f.attack;
  if (a?.lunge && a.t < MOVES[a.id].active[0]) slide(s, f, a.lunge.x, a.lunge.z);
}

export function release(f) {
  const k = f.pending;
  f.pending = null;
  if (!k) return;
  Object.assign(f, { vx: k.vx, vy: k.vy, vz: k.vz, onGround: false, airTo: null, navJump: null, stun: k.stun, stunMax: k.stun, sliding: k.slide });
  // a skid stays on the floor (landing would stop it dead), still flat on its back: the tablet lays a tripped fighter
  // down over its stun's first 15% (play.js trippedTilt)
  if (k.slide) Object.assign(f, { onGround: true, stunMax: Math.round(k.stun / 0.85) });
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
  faceNearest(s, f, LUNGE_RANGE, (o) => Math.abs(o.y - f.y) <= f.h);
}

function faceNearest(s, f, reach, ok) {
  let best = null, bestGap = reach;
  for (const o of s.fighters) {
    const gap = flat(f, o) - f.r - o.r;
    if (canStrike(s, f, o) && ok(o) && gap <= bestGap) [best, bestGap] = [o, gap];
  }
  if (best && flat(f, best) > EPS) f.facing = Math.atan2(best.z - f.z, best.x - f.x);
  return best;
}

/** A stomp steers onto its foe, and hangs before it dives. True while it hangs. */
export function stompAir(s, f) {
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
const stompTarget = (s, f) => faceNearest(s, f, MOVES.stomp.home.reach, (o) => o.y < f.y)?.id ?? null;

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
  const m = MOVES[id];
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
  const broke = s.drop(s, o, { x: o.x, y: o.y + o.h / 2, z: o.z, vx: k.vx, vy: k.vy, vz: k.vz });
  if (f.attack?.id === id) f.attack.hit.push(o.id);
  s.hits.push({ ...p, move: id, on: 'fighter', target: o.id, broke, by: f.id, ...credit(s, f, o) });
}

export const chainOf = (s, f) => (s.tick - f.chainAt <= CHAIN_TICKS ? f.chain : 0);

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
  return !hitFirst(s, f, sp, { id: 'hammer', u }, { ...f, z: p.z }) && !hitBrick(s, sp, 'hammer', f.team);
}

/** Strikes the first foe of f's that sp touches (reaching as `from`, f by default); true if one was. */
function hitFirst(s, f, sp, hit, from = f) {
  for (const o of s.fighters) {
    const c = o.team !== f.team && canStrike(s, from, o) ? bodyContact(sp, o) : null;
    if (c) { strike(s, f, o, c, hit); return true; }
  }
  return false;
}

export function attacks(s) {
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
  return !hitFirst(s, f, sp, { id: 'shot', u: { x: t.ux, z: t.uz } }) && t.left > EPS;
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
export function attackInput(s, f, input) {
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
  s.drop(s, o, { x: o.x, y: o.y + o.h, z: o.z, vx: 0, vy: POP.vy, vz: 0 });
  Object.assign(o, { attack: null, toy: { kind: TOY.kinds[s.tick % TOY.kinds.length], t: TOY.ticks } });
  s.powers.push({ fighter: f.id, kind: power.kind, on: o.id, x: o.x, y: o.y, z: o.z });
}

/** A tick off each timer: a toy, stun, invincibility; percent drains once calm. */
export function countDown(f) {
  if (f.toy && --f.toy.t <= 0) f.toy = null;
  f.stun = Math.max(0, f.stun - 1);
  f.inv = Math.max(0, f.inv - 1);
  if (++f.calm > CALM_TICKS) f.percent = Math.max(0, f.percent - CALM_DRAIN / TICK_HZ);
}
