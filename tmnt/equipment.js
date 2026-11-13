import { JUMP_SPEED } from '../spinoff/walk.js';
import { DT, GRAVITY } from '../spinoff/world.js';

// REUSE-SPEC.md §Level 1, Building it, step 3: the equipment a hero uses, on top of the donut fighters' sim, each held
// in the sim's freeze while it acts (so the sim neither moves nor drops the hero):
// - climbing the dome, the grid and the squiggle climber: a climb is solid to its top in the sim (forSim,
//   generate.js); walk into it from its foot and you go up its face and step on at the top;
// - riding the slides and the fire pole down: step or jump onto the top and you're carried to the bottom.

/** How fast a hero climbs, game units a second (generate.js budgets the same). */
export const CLIMB_SPEED = 1.2;
// how close to the face a hero's edge has to be to take hold (walking into a wall stops a little short, the route-finder's
// grid); how far from its foot's height it can start
const REACH = 0.3, FOOT = 0.15;
// ticks after letting go before a hero takes hold of anything again, so it doesn't grab straight back on
const REST = 20;

/** @typedef {import('./generate.js').Climb} Climb @typedef {{ c: Climb, out: { x: number, z: number }, lean: number }} Hold
 *  `lean`: how far in it carries you for each unit up (the climbing grid leans; the others go straight up) */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Still resting from the last piece of equipment? Counts the rest down. */
const resting = (f) => (f.rest ?? 0) > 0 && f.rest-- > 0;

/** The lean of the climbing grid, or of a flight of stairs, climbed from its foot (heading the way it runs): its run
 *  over its rise; else 0, straight up. */
function leanOf(c, ox, oz) {
  const t = (c.h * Math.PI) / 180, facing = -(ox * Math.cos(t) + oz * Math.sin(t)) > 0.5;
  if (!facing || !['grid', 'stairs'].includes(c.kind)) return 0;
  return (Math.abs(Math.cos(t)) > 0.5 ? c.x1 - c.x0 : c.z1 - c.z0) / (c.y1 - c.y0);
}

/**
 * The climb sim fighter `f` takes hold of: standing at its foot, beside its face, walking into it; or null.
 * @param {Climb[]} climbs @returns {Hold|null}
 */
export function startClimb(climbs, f) {
  if (resting(f) || !f.onGround || !f.walkTo) return null;
  for (const c of climbs) {
    const nx = clamp(f.x, c.x0, c.x1), nz = clamp(f.z, c.z0, c.z1), dx = f.x - nx, dz = f.z - nz, d = Math.hypot(dx, dz);
    const into = (f.walkTo.x - f.x) * -dx + (f.walkTo.z - f.z) * -dz;
    if (Math.abs(f.y - c.y0) <= FOOT && d > 1e-6 && d <= f.r + REACH && into > 0) return { c, out: { x: dx / d, z: dz / d }, lean: leanOf(c, dx / d, dz / d) };
  }
  return null;
}

/** Off the equipment, standing, its route planned afresh from here (the old one was from before, playtest 2026-11-10:
 *  stuck at the top of the ladder). */
function letGo(f) {
  Object.assign(f, { freeze: 0, onGround: true, walkTo: null, airTo: null, nav: null, navJump: null, fails: 0, stuck: 0, rest: REST });
}

/** One tick up climb `k` for sim fighter `f`: up its face, and at the top onto it. True while still climbing. @param {Hold} k */
export function climbStep(f, k) {
  const y = Math.min(k.c.y1, f.y + CLIMB_SPEED * DT), inn = (y - f.y) * k.lean;
  Object.assign(f, { freeze: 2, vx: 0, vy: 0, vz: 0, onGround: false, y, x: f.x - k.out.x * inn, z: f.z - k.out.z * inn });
  if (f.y < k.c.y1) return true;
  Object.assign(f, { x: f.x - k.out.x * (f.r * 2 + REACH), z: f.z - k.out.z * (f.r * 2 + REACH) });
  letGo(f);
  return false;
}

/** How fast a slide or the fire pole carries a hero down, game units a second. */
export const RIDE_SPEED = 4;
// the pole half that (playtest 2026-11-12: the pole was too fast, the slides fine)
const POLE_SPEED = 2;
// how close to a ride's top a hero gets on: half a slide's breadth, and its height give or take a little
const GRAB = 0.6, GRAB_Y = 0.3;

/** @typedef {import('./generate.js').Path} Path @typedef {{ p: Path, t: number, len: number }} Ride */

/** How high `f` gets on ride `p`: its top; a pole anywhere up it, jumping: the higher, the longer the ride (playtest
 *  2026-11-12). */
const grabAt = (p, f) => (f.onGround ? p.y0 : clamp(f.y, p.y0, p.top ?? p.y0));

/**
 * The ride sim fighter `f` gets on: at its top, heading onto it (a pole: toward it), or in the air there; or null.
 * @param {Path[]} rides @returns {Ride|null}
 */
export function startRide(rides, f) {
  if (resting(f)) return null;
  for (const p of rides) {
    const dx = p.x0 - f.x, dz = p.z0 - f.z, ax = p.x1 - p.x0, az = p.z1 - p.z0, to = f.walkTo ?? f.airTo;
    const y0 = grabAt(p, f);
    if (Math.hypot(dx, dz) > f.r + GRAB || Math.abs(f.y - y0) > GRAB_Y) continue;
    const onto = to ? (to.x - f.x) * (ax || dx) + (to.z - f.z) * (az || dz) : 0;
    if (onto > 0 || !f.onGround) return { p: { ...p, y0 }, t: 0, len: Math.hypot(ax, p.y1 - y0, az) };
  }
  return null;
}

/** One tick down ride `k` for sim fighter `f`: along it, top to bottom, and off at the bottom. True while still riding. @param {Ride} k */
export function rideStep(f, k) {
  const { p } = k;
  k.t = Math.min(1, k.t + ((p.kind === 'pole' ? POLE_SPEED : RIDE_SPEED) * DT) / k.len);
  Object.assign(f, { freeze: 2, vx: 0, vy: 0, vz: 0, onGround: false,
    x: p.x0 + (p.x1 - p.x0) * k.t, y: p.y0 + (p.y1 - p.y0) * k.t, z: p.z0 + (p.z1 - p.z0) * k.t });
  if (k.t < 1) return true;
  letGo(f);
  return false;
}

// REUSE-SPEC.md §The pieces, the clatter bridge (playtest 2026-11-12: the wobble was cute but no trouble): it rocks
// from side to side under whoever is on it, far enough that they slide across it, and off its side if they aren't
// careful. How fast it rocks (radians a second), how far it rolls (radians), how fast a hero slides at full roll.
export const BRIDGE = Object.freeze({ rate: 2.5, roll: 0.25, slide: 1.5 });

/** Is sim fighter `f` standing on bridge `b`? */
export const onBridge = (f, b) => f.onGround && Math.abs(f.y - b.y) < 0.05 && f.x > b.x0 && f.x < b.x1 && f.z > b.z0 && f.z < b.z1;

/** Across bridge `b`, toward the side that goes down when it rolls the positive way (scenery.js turns it the same). */
const acrossOf = (b) => ({ x: -Math.sin((b.h * Math.PI) / 180), z: Math.cos((b.h * Math.PI) / 180) });

/** One tick on rocking bridge `b`, `sway` (-1..1) of its full roll: the fighter slides across it, downhill. */
export function bridgeSlide(f, b, sway) {
  const a = acrossOf(b), d = BRIDGE.slide * sway * DT;
  f.x += a.x * d;
  f.z += a.z * d;
}

/** How far the planks under `f` have risen (or dropped) with the roll, to draw it standing on them. */
export function bridgeLift(f, b, sway) {
  const a = acrossOf(b), off = (f.x - (b.x0 + b.x1) / 2) * a.x + (f.z - (b.z0 + b.z1) / 2) * a.z;
  return -off * Math.sin(BRIDGE.roll * sway);
}

// REUSE-SPEC.md §The pieces, the two yellow bars and the arch swings (built 2026-11-12): get on by jumping into one,
// or by tapping it from close by; you hang there, swinging (a swing higher the longer you ride). A tap somewhere else,
// or a jump, takes you all the way round and lets go on the way up: launched that way, toward where you tapped. Tap the
// other bar and you fly to it and catch it.
// How close along its swing you have to be to catch one in the air; how near a tap has to land, and you have to stand,
// to hop on; how fast you go round (radians a second); how hard you're launched, along and up (a little more than a
// jump, so a launch from a bar lands you on a deck).
export const SWING = Object.freeze({ reach: 0.45, tap: 0.7, near: 1.3, spin: 11, launch: 7.5, up: JUMP_SPEED * 1.25 });
/** How long a launch is in the air, seconds, coming down `drop` lower than it left (none: FLIGHT). */
export const airTime = (drop = 0) => (SWING.up + Math.sqrt(SWING.up ** 2 + 2 * GRAVITY * Math.max(0, drop))) / GRAVITY;
export const FLIGHT = airTime();
// ticks after a launch in which the bar just left can't be caught again (the other can, straight away)
const LEFT_FOR = 30;
const LET_GO_AT = Math.PI / 4, TAU = Math.PI * 2;

/** @typedef {import('./generate.js').Pivot} Pivot
 *  @typedef {{ p: Pivot, a: number, t: number, left: number, dir: number, to: { x: number, z: number }|null, keys: string }} Hang
 *  hanging from `p`, `a` radians round from straight down, `t` seconds on; going round, `left` radians to go; `keys`,
 *  the 🥊 (p) and 🦶 (k) pressed while on it, which pick the dismount */

const alongOf = (p) => ({ x: Math.cos((p.h * Math.PI) / 180), z: Math.sin((p.h * Math.PI) / 180) });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** How far a tap on the ground is from pivot `p`: from anywhere along its bar, and from where a finger on the bar or
 *  the seat itself lands on the ground, which is behind it, as far as that is high (playtest 2026-11-12: four taps to
 *  get on). */
function tapOff(p, tap) {
  const d = alongOf(p), high = p.y - (p.kind === 'swing' ? p.arm : 0);
  return Math.min(...[0, 0.6, 1.2].map((k) => {
    const x = tap.x - p.x, z = tap.z + high * k - p.z, across = Math.min(p.span / 2, Math.max(-p.span / 2, z * d.x - x * d.z));
    return Math.hypot(x + d.z * across, z - d.x * across);
  }));
}

/** The bar or swing a tap is on: the nearest within reach, or null. @param {Pivot[]} pivots @returns {Pivot|null} */
export function tappedPivot(pivots, tap) {
  const near = pivots.filter((p) => tapOff(p, tap) <= SWING.tap).sort((a, b) => tapOff(a, tap) - tapOff(b, tap));
  return near[0] ?? null;
}

/** Can `f` take hold of pivot `p`: in the air where it swings, or standing near it and wanting it (`want`)? */
function catches(p, f, want) {
  if (f.onGround) return p === want && flat(f, p) <= SWING.near;
  const d = alongOf(p), along = (f.x - p.x) * d.x + (f.z - p.z) * d.z, across = (f.z - p.z) * d.x - (f.x - p.x) * d.z;
  return Math.abs(across) <= p.span / 2 && Math.abs(along) <= SWING.reach && f.y >= p.y - p.arm - 0.3 && f.y <= p.y + 0.3;
}

/**
 * The bar or swing sim fighter `f` gets on; or null. `want`: the one the player tapped (`tappedPivot`), which it hops
 * onto once it has walked close enough.
 * @param {Pivot[]} pivots @param {Pivot|null} want @returns {Hang|null}
 */
export function startSwing(pivots, f, want = null) {
  f.leftFor = Math.max(0, (f.leftFor ?? 0) - 1);
  if (resting(f)) return null;
  const p = pivots.find((o) => !(f.leftFor && o === f.left) && catches(o, f, want));
  return p ? { p, a: 0, t: 0, left: 0, dir: 1, to: null, keys: '' } : null;
}

/** Holds `f` on its pivot at the hang's angle: its feet out at arm's length, straight down at 0. */
function hangAt(f, k) {
  const { p } = k, d = alongOf(p), out = p.arm * Math.sin(k.a);
  Object.assign(f, { freeze: 2, vx: 0, vy: 0, vz: 0, onGround: false, x: p.x + d.x * out, y: p.y - p.arm * Math.cos(k.a), z: p.z + d.z * out });
}

/** The other bar or swing a tap is on: within reach of the tap, and nearer it than the one `k` hangs from (the two
 *  bars stand closer together than a tap's reach). */
const otherAt = (k, tap, pivots) => { const p = tappedPivot(pivots, tap); return p && p !== k.p ? p : null; };
/** Is a tap a new place to go: off this pivot, or on another? Not in the first moment, which is the tap that got on. */
const elsewhere = (k, tap, pivots) => Boolean(tap) && k.t > 0.2 && tappedPivot(pivots, tap) !== k.p;

/** Lets go for the turn round: which way (toward the tap, else the way the level runs), and how far to the let-go. */
function wind(k, tap, pivots) {
  const d = alongOf(k.p), toward = tap ? (tap.x - k.p.x) * d.x + (tap.z - k.p.z) * d.z : d.x;
  k.dir = toward < 0 ? -1 : 1;
  k.to = tap ? otherAt(k, tap, pivots) ?? tap : null;
  k.left = TAU + ((((LET_GO_AT - k.a * k.dir) % TAU) + TAU) % TAU);
}

/** How fast along the ground a launch goes: full speed the way it was going round; with a spot tapped, as fast as
 *  lands on it, up to that. */
function launchSpeed(f, k) {
  const d = alongOf(k.p);
  if (!k.to) return { vx: d.x * k.dir * SWING.launch, vz: d.z * k.dir * SWING.launch };
  const dx = k.to.x - f.x, dz = k.to.z - f.z, far = Math.hypot(dx, dz) || 1;
  const v = Math.min(SWING.launch, far / airTime(f.y - (/** @type {any} */ (k.to).y ?? 0))) / far;
  return { vx: dx * v, vz: dz * v };
}

/** Off the bar on the way up: launched to come down where the player tapped; at another bar or swing, steering for
 *  it, to catch it at once (anything else, not for a moment). */
function launch(f, k) {
  const other = Boolean(k.to) && 'arm' in k.to;
  Object.assign(f, { freeze: 0, onGround: false, ...launchSpeed(f, k), vy: SWING.up, walkTo: null, airTo: other ? { x: k.to.x, z: k.to.z } : null,
    nav: null, navJump: null, fails: 0, stuck: 0, rest: other ? 0 : REST, left: k.p, leftFor: LEFT_FOR });
}

/**
 * One tick on a bar or swing for sim fighter `f`: swinging there; from a new tap or a jump, once all the way round
 * and off. True while still on.
 * @param {Hang} k @param {{ tap: { x: number, z: number }|null, jump: boolean, punch?: boolean, kick?: boolean }} cmd
 */
export function swingStep(f, k, cmd, pivots = []) {
  if (!k.left && (cmd.jump || elsewhere(k, cmd.tap, pivots))) wind(k, cmd.tap, pivots);
  // REUSE-SPEC.md §Dismounts: the buttons count only once the player has said where to go
  if (k.left) k.keys += (cmd.punch ? 'p' : '') + (cmd.kick ? 'k' : '');
  k.t += DT;
  if (k.left) {
    const turn = Math.min(k.left, SWING.spin * DT);
    Object.assign(k, { a: k.a + turn * k.dir, left: k.left - turn });
    if (!k.left) { hangAt(f, k); launch(f, k); return false; }
  } else {
    // a swing goes higher the longer you ride; a bar just rocks
    const high = k.p.kind === 'swing' ? Math.min(1.1, 0.3 + 0.15 * k.t) : 0.3;
    k.a = high * Math.sin(k.t * Math.min(5, Math.max(2, Math.sqrt(9.8 / k.p.arm))));
  }
  hangAt(f, k);
  return true;
}

// REUSE-SPEC.md §Level 1, stairs: a flight is solid to its high end in the sim (generate.js), which only has flat
// floors, so a hero standing on one is level with its top (playtest 2026-11-12: floating over the ramp). It is drawn
// down on the slope instead, and walking off the low end puts it down at the low end's height, not dropped from the top.

/** How far along flight `c` fighter `f` is, from its low end (0) to its high end (1); beyond them, less or more. */
function upFlight(c, f) {
  const t = (c.h * Math.PI) / 180, run = Math.abs(Math.cos(t)) > 0.5 ? c.x1 - c.x0 : c.z1 - c.z0;
  return ((f.x - (c.x0 + c.x1) / 2) * Math.cos(t) + (f.z - (c.z0 + c.z1) / 2) * Math.sin(t)) / run + 0.5;
}

/** The flight of stairs fighter `f` is standing on, or null. @param {Climb[]} flights */
export const onStairs = (flights, f) => flights.find((c) => f.onGround && Math.abs(f.y - c.y1) < 0.05
  && f.x > c.x0 && f.x < c.x1 && f.z > c.z0 && f.z < c.z1) ?? null;

/** How far below flight `c`'s top its slope is under `f`: 0 at the high end, its whole rise at the low end. */
export const stairDip = (c, f) => (c.y1 - c.y0) * (Math.min(1, Math.max(0, upFlight(c, f))) - 1);

/** `f` has just walked off flight `c`: off its low end, it is put down at the low end's height. */
export function stairsOff(c, f) {
  if (!f.onGround && upFlight(c, f) < 0.1 && f.y > c.y0) Object.assign(f, { y: c.y0, vy: 0 });
}

// REUSE-SPEC.md §Dismounts from button combos: coming off a bar or a swing is a Simone Biles dismount, and which one
// is the buttons pressed while on it (built 2026-11-12, the designer to confirm which buttons): none, her beam
// dismount; 🥊, the floor Biles; 🦶, the triple-double; 🥊🥊, the beam dismount into the wolf turn; 🦶🦶, the vault.
// Never at random: the same buttons, the same move.
export const DISMOUNTS = Object.freeze({ p: 'biles', k: 'biles-ii', pp: 'biles-wolf', kk: 'biles-ii-vault', pk: 'biles-beam' });
/** The dismount for the buttons pressed on the bar (`keys`, oldest first): the last two if they pair, else the last. */
export const dismountOf = (keys) => DISMOUNTS[keys.slice(-2)] ?? DISMOUNTS[keys.slice(-1)];

/** When a dance's big jump starts and ends, and when the dance ends, seconds in: its last run of steps in the air. */
export function airSpan(steps) {
  let t = 0, from = 0, to = 0, was = false;
  for (const s of steps) {
    if (s.air && !was) from = t;
    if (s.air) to = t + s.hold;
    was = Boolean(s.air);
    t += s.hold;
  }
  return { from, to, end: t };
}

/** Where in its dance a dismount is: through the jump as the flight goes (`flown` seconds of it), and, once down
 *  (`landed` seconds ago; null in the air), on from the landing. */
export const dismountTime = (span, flown, landed) => (landed === null
  ? span.from + Math.min(1, flown / FLIGHT) * (span.to - span.from) : span.to + landed);
