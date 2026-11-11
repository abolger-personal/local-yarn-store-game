import { DT } from '../spinoff/world.js';

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

/** @typedef {import('./generate.js').Climb} Climb @typedef {{ c: Climb, out: { x: number, z: number } }} Hold */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Still resting from the last piece of equipment? Counts the rest down. */
const resting = (f) => (f.rest ?? 0) > 0 && f.rest-- > 0;

/**
 * The climb sim fighter `f` takes hold of: standing at its foot, beside its face, walking into it; or null.
 * @param {Climb[]} climbs @returns {Hold|null}
 */
export function startClimb(climbs, f) {
  if (resting(f) || !f.onGround || !f.walkTo) return null;
  for (const c of climbs) {
    const nx = clamp(f.x, c.x0, c.x1), nz = clamp(f.z, c.z0, c.z1), dx = f.x - nx, dz = f.z - nz, d = Math.hypot(dx, dz);
    const into = (f.walkTo.x - f.x) * -dx + (f.walkTo.z - f.z) * -dz;
    if (Math.abs(f.y - c.y0) <= FOOT && d > 1e-6 && d <= f.r + REACH && into > 0) return { c, out: { x: dx / d, z: dz / d } };
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
  Object.assign(f, { freeze: 2, vx: 0, vy: 0, vz: 0, onGround: false, y: Math.min(k.c.y1, f.y + CLIMB_SPEED * DT) });
  if (f.y < k.c.y1) return true;
  Object.assign(f, { x: f.x - k.out.x * (f.r * 2 + REACH), z: f.z - k.out.z * (f.r * 2 + REACH) });
  letGo(f);
  return false;
}

/** How fast a slide or the fire pole carries a hero down, game units a second. */
export const RIDE_SPEED = 4;
// how close to a ride's top a hero gets on: half a slide's breadth, and its height give or take a little
const GRAB = 0.6, GRAB_Y = 0.3;

/** @typedef {import('./generate.js').Path} Path @typedef {{ p: Path, t: number, len: number }} Ride */

/**
 * The ride sim fighter `f` gets on: at its top, heading onto it (a pole: toward it), or in the air there; or null.
 * @param {Path[]} rides @returns {Ride|null}
 */
export function startRide(rides, f) {
  if (resting(f)) return null;
  for (const p of rides) {
    const dx = p.x0 - f.x, dz = p.z0 - f.z, ax = p.x1 - p.x0, az = p.z1 - p.z0, to = f.walkTo ?? f.airTo;
    if (Math.hypot(dx, dz) > f.r + GRAB || Math.abs(f.y - p.y0) > GRAB_Y) continue;
    const onto = to ? (to.x - f.x) * (ax || dx) + (to.z - f.z) * (az || dz) : 0;
    if (onto > 0 || !f.onGround) return { p, t: 0, len: Math.hypot(ax, p.y1 - p.y0, az) };
  }
  return null;
}

/** One tick down ride `k` for sim fighter `f`: along it, top to bottom, and off at the bottom. True while still riding. @param {Ride} k */
export function rideStep(f, k) {
  const { p } = k;
  k.t = Math.min(1, k.t + (RIDE_SPEED * DT) / k.len);
  Object.assign(f, { freeze: 2, vx: 0, vy: 0, vz: 0, onGround: false,
    x: p.x0 + (p.x1 - p.x0) * k.t, y: p.y0 + (p.y1 - p.y0) * k.t, z: p.z0 + (p.z1 - p.z0) * k.t });
  if (k.t < 1) return true;
  letGo(f);
  return false;
}
