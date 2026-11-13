import assert from 'node:assert/strict';
import { MATCH } from '../spinoff/combat.js';
import { createControls } from '../spinoff/controls.js';
import { SIM } from '../spinoff/sim.js';
import { climbStep, rideStep, startClimb, startRide } from './equipment.js';
import { forSim } from './generate.js';

// a dome 1.575 up (7 ft), from the ground to the tall tower's deck, across the band, and a slide down off the deck's
// far end; a hero holding → from the left
const dome = { x0: 3, x1: 3.56, z0: -2, z1: 2, y0: 0, y1: 1.575, h: 0, kind: 'dome' };
const slide = { x0: 5, z0: 0, y0: 1.575, x1: 7, z1: 0, y1: 0, kind: 'slide' };
const level = forSim(/** @type {any} */ ({
  floors: [{ kind: 'ground', x0: 0, x1: 10, z0: -2, z1: 2, y: 0 }, { kind: 'deck', x0: 3.56, x1: 5, z0: -2, z1: 2, y: 1.575 }],
  backWall: -2, shelves: [{ team: 'heroes', x: 0.5, z: -1.7, y: 0 }], zones: [], puddles: [], bricks: [],
  ringOut: { x0: -2, x1: 12, z1: 3.5, y: -3 }, starts: [{ x: 1, z: 0 }], climbs: [dome], stairs: [], rides: [slide], swings: [],
}));
const hero = { id: 'me', team: 'heroes', height: 0.86, width: 0.3, reach: 0.3, look: { dough: '#e8c38e', frosting: '#1fd18b', stripe: false }, hands: 'gloves' };

/** Holds → for `seconds`, climbing and riding what it comes to (none given, it doesn't); where the hero ends up, how
 *  high it got, and how high it was halfway down the slide. */
function walk(climbs, seconds, rides = []) {
  const s = SIM.createMatch([/** @type {any} */ (hero)], /** @type {any} */ (level), { match: MATCH }), c = createControls('me', /** @type {any} */ (level));
  let snap = SIM.snapshot(s), k = null, ride = null, high = 0, mid = null;
  c.walk(1, 0);
  for (let i = 0; i < seconds * 60; i++) {
    s.t0 = s.tick;
    SIM.tick(s, { me: c.take(snap) });
    k ??= startClimb(climbs, s.fighters[0]);
    if (k && !climbStep(s.fighters[0], k)) k = null;
    ride ??= k ? null : startRide(rides, s.fighters[0]);
    if (ride && !rideStep(s.fighters[0], ride)) ride = null;
    snap = SIM.snapshot(s);
    const f = snap.fighters[0];
    high = Math.max(high, f.y);
    if (mid === null && f.x >= 6) mid = f.y;
  }
  return { ...snap.fighters[0], high, mid };
}

const up = walk([dome], 4);
assert.ok(up.high > 1.5 && up.x > dome.x1, `walked into the dome, up it and on over the deck (${up.x.toFixed(2)}, up to ${up.high.toFixed(2)})`);
const stuck = walk([], 4);
assert.ok(stuck.high < 1.4 && stuck.x < dome.x0, `without climbing, a 7 ft dome is a wall (${stuck.x.toFixed(2)}, up to ${stuck.high.toFixed(2)})`);
// off the deck's end onto the slide: carried down it, halfway down halfway up, not dropped straight to the ground
const down = walk([dome], 6, [slide]);
assert.ok(down.mid > 0.5 && down.mid < 1.1 && down.x > slide.x1 && down.y < 0.01, `rode the slide down (halfway along ${down.mid?.toFixed(2)} up)`);
const fell = walk([dome], 6);
assert.ok(fell.mid < 0.05, `without riding, off the deck's end is straight down (${fell.mid?.toFixed(2)})`);
// the fire pole is grabbed anywhere up it, jumping: from higher, a longer ride; not from above its top
const pole = /** @type {any} */ ({ x0: 5, z0: 0, y0: 1.35, x1: 5, z1: 0, y1: 0, top: 3, kind: 'pole' });
const grab = (y) => startRide([pole], { x: 4.6, z: 0, y, r: 0.47, onGround: false });
assert.ok(grab(2.5)?.len === 2.5 && grab(1.35)?.len === 1.35 && grab(3.6) === null, 'the higher the grab, the longer the ride');
console.log('equipment ok');
