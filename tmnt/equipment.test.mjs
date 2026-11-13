import assert from 'node:assert/strict';
import { MATCH } from '../spinoff/combat.js';
import { createControls } from '../spinoff/controls.js';
import { SIM } from '../spinoff/sim.js';
import { BRIDGE, FLIGHT, SWING, airSpan, airTime, dismountOf, dismountTime, bridgeLift, bridgeSlide, climbStep, onBridge, rideStep, startClimb, startRide, onStairs, stairDip, stairsOff, startSwing, swingStep, tappedPivot } from './equipment.js';
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
// the rocking bridge: a hero on it slides across it, downhill, far enough over one rock to matter, and is drawn on its planks
const span = { x0: 0, x1: 2.5, z0: -0.8, z1: 0.8, y: 0.9, h: 0 }, turned = { ...span, h: 90 };
const rider = { x: 1, z: 0, y: 0.9, onGround: true };
assert.ok(onBridge(rider, span) && !onBridge({ ...rider, onGround: false }, span) && !onBridge({ ...rider, z: 1 }, span));
let far = 0;
for (let i = 0; i < 60 * Math.PI / BRIDGE.rate; i++) { bridgeSlide(rider, span, Math.sin((i / 60) * BRIDGE.rate)); far = Math.max(far, rider.z); }
assert.ok(rider.x === 1 && far > 0.6 * (span.z1 - span.z0) / 2, `half a rock slides a hero most of the way to the bridge's side (${far.toFixed(2)})`);
const side = { x: 1, z: 0, y: 0.9, onGround: true };
bridgeSlide(side, turned, 1);
assert.ok(side.x < 1 && Math.abs(side.z) < 1e-9, 'a bridge turned across the band slides you along x');
assert.ok(bridgeLift({ x: 1.25, z: 0.5 }, span, 1) < -0.1 && bridgeLift({ x: 1.25, z: -0.5 }, span, 1) > 0.1 && bridgeLift({ x: 1.25, z: 0 }, span, 1) === 0, 'the downhill side is drawn lower');
// a bar: caught by jumping into it, or by tapping it from close by; never by walking past
const bar = /** @type {any} */ ({ x: 5, z: 0, y: 0.675, h: 0, arm: 0.315, span: 1.1, kind: 'bar' }), far2 = { ...bar, x: 5.45 };
const body = (o) => ({ x: 5, z: 0, y: 0.5, r: 0.47, onGround: false, ...o });
assert.ok(startSwing([bar], body({})) && !startSwing([bar], body({ onGround: true, y: 0 })), 'jumping into a bar catches it, walking under it does not');
assert.ok(startSwing([bar], body({ onGround: true, y: 0, x: 4.2 }), bar) && !startSwing([bar], body({ onGround: true, y: 0, x: 2 }), bar), 'wanted, it is hopped onto from close by, not from far off');
// a tap counts anywhere along the bar, and where a finger on the bar itself lands on the ground behind it
assert.ok([{ x: 5.1, z: 0.1 }, { x: 5, z: 0.5 }, { x: 5.3, z: -0.6 }, { x: 5, z: -1 }].every((tap) => tappedPivot([bar], tap) === bar) && tappedPivot([bar], { x: 7, z: 0 }) === null, 'a generous tap');
assert.ok(!startSwing([bar], body({ z: 1 })), 'not from off its end');
// hanging there, the hero stays at arm's length; a tap somewhere else takes it once all the way round, then launches it that way
const hung = body({}), k = startSwing([bar], hung);
for (let i = 0; i < 60; i++) assert.ok(swingStep(hung, k, { tap: null, jump: false }, [bar, far2]) && Math.abs(Math.hypot(hung.x - bar.x, hung.y - bar.y) - bar.arm) < 1e-9);
let round = 0, was = k.a, on = swingStep(hung, k, { tap: { x: 8, z: 0 }, jump: false }, [bar, far2]);
for (let i = 0; i < 200 && on; i++) { round += Math.abs(k.a - was); was = k.a; on = swingStep(hung, k, { tap: null, jump: false }, [bar, far2]); }
assert.ok(!on && round >= 2 * Math.PI - 0.5 && hung.vy === SWING.up && hung.freeze === 0 && hung.airTo === null, `once round (${round.toFixed(2)} rad) and launched`);
assert.ok(Math.abs(hung.x + hung.vx * airTime(hung.y) - 8) < 1e-9 && hung.vz === 0 && airTime(hung.y) > FLIGHT, 'at the speed that comes down on the spot tapped');
// tapped the other bar: it steers for that bar; a tap to the left goes round the other way
const second = body({}), k2 = startSwing([bar], second);
swingStep(second, k2, { tap: null, jump: false }, [bar, far2]);
for (let i = 0; i < 20; i++) swingStep(second, k2, { tap: null, jump: false }, [bar, far2]);
swingStep(second, k2, { tap: { x: 5.5, z: 0 }, jump: false }, [bar, far2]);
assert.equal(k2.to, far2);
const back = body({}), k3 = startSwing([bar], back);
swingStep(back, k3, { tap: null, jump: true }, [bar]);
assert.equal(k3.dir, 1, 'a jump goes the way the level runs');
while (swingStep(back, k3, { tap: null, jump: false }, [bar]));
assert.equal(back.vx, SWING.launch, 'at full speed, with no spot tapped');
// the buttons pressed once the player has said where to go pick the dismount, the same ones the same move, and none
// pressed before; its jump is played through the flight
const pressed = body({}), k4 = startSwing([bar], pressed);
swingStep(pressed, k4, { tap: null, jump: false, punch: true }, [bar]);
assert.equal(k4.keys, '', 'not before the launch is asked for');
swingStep(pressed, k4, { tap: null, jump: true }, [bar]);
swingStep(pressed, k4, { tap: null, jump: false, kick: true }, [bar]);
swingStep(pressed, k4, { tap: null, jump: false, kick: true }, [bar]);
assert.deepEqual([dismountOf(k4.keys), dismountOf(''), dismountOf('p'), dismountOf('k'), dismountOf('pp'), dismountOf('kp'), dismountOf('kkpp'), dismountOf('kpk')],
  ['biles-ii-vault', undefined, 'biles', 'biles-ii', 'biles-wolf', 'biles', 'biles-wolf', 'biles-beam']);
const jump = airSpan([{ hold: 0.3 }, { hold: 0.2, air: true }, { hold: 0.1 }, { hold: 0.75, air: true }, { hold: 0.7, air: true }, { hold: 0.3 }]);
assert.deepEqual([jump.from, jump.to, jump.end].map((n) => Math.round(n * 100)), [60, 205, 235], 'the last jump of the dance');
assert.ok(dismountTime(jump, 0, null) === jump.from && dismountTime(jump, FLIGHT * 2, null) === jump.to && dismountTime(jump, 9, 0.2) === jump.to + 0.2);
// a flight of stairs, solid to its high end: a hero on it is drawn down on its slope, and off its low end is put down there
const rise = /** @type {any} */ ({ x0: 2, x1: 3, z0: -1, z1: 1, y0: 0.9, y1: 1.7, h: 0, kind: 'stairs' }), fall = { ...rise, h: 180 };
const stood = (x) => ({ x, z: 0, y: 1.7, onGround: true });
assert.ok(onStairs([rise], stood(2.5)) === rise && !onStairs([rise], stood(3.5)) && !onStairs([rise], { ...stood(2.5), y: 0.9 }));
assert.ok(Math.abs(stairDip(rise, stood(2)) + 0.8) < 1e-9 && Math.abs(stairDip(rise, stood(2.5)) + 0.4) < 1e-9 && stairDip(rise, stood(3)) === 0, 'down the slope by how far from the top');
assert.ok(Math.abs(stairDip(fall, stood(3)) + 0.8) < 1e-9 && stairDip(fall, stood(2)) === 0, 'a flight going down the other way');
const off = { x: 1.9, z: 0, y: 1.68, onGround: false, vy: -1 }, over = { x: 3.1, z: 0, y: 1.68, onGround: false, vy: -1 };
stairsOff(rise, off);
stairsOff(rise, over);
assert.ok(off.y === 0.9 && off.vy === 0 && over.y === 1.68, 'off the low end you are at its foot; off the high end nothing changes');
console.log('equipment ok');
