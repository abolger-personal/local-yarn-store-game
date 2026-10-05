// Self-check for the game's speed button (gameSpeed, core/config.js). Run: node characters/store/speed.test.mjs
//
// ▶ must be a walk every leg in the cast can honestly make, at full stride and a real cadence; every
// speed must keep the playground's share of stagger to round; and ⏸ must stop the rounds and halt
// the walks without touching the walk settings. walk.test.mjs runs the real cast through all of it.

import assert from 'node:assert/strict';
import { S, SHOP_GAIT, gameSpeed } from './core/config.js';
import { MOTION_DEFAULTS, strideFor, topSpeed } from '../motion.js';

// The shortest leg chain in the cast: the owl's legHeight floor (npc.js) plus the default hipInset.
const SHORTEST_L = 0.085 + 0.045;
const EASE_PEAK = 1.5;   // smoothstep's peak speed over its mean (stepWalk eases every route)

const one = gameSpeed(1);
// pace scales the walk's DURATION (retarget), so the quickest NPC moves 1 / (1 - paceJitter) as fast
const peak = one.walkSpeed * EASE_PEAK / (1 - S.paceJitter);
const top = topSpeed(SHORTEST_L, MOTION_DEFAULTS);
assert.ok(peak <= top,
  `▶ peak ${peak.toFixed(3)} units/s must not outrun the shortest legs (${top.toFixed(3)}), or they skate`);

// The slowest ▶ walker, at mean pace, must be past the gate (full leg swing, or the feet skate),
// and the longest legs in the cast (a stilt llama, llama.js) must still step at cadenceMin.
const gait = { ...MOTION_DEFAULTS, ...SHOP_GAIT };
const slowest = one.walkSpeed / (1 + S.paceJitter);
assert.ok(slowest >= gait.gateSpeed, `▶'s slowest walk ${slowest.toFixed(3)} must clear the gate ${gait.gateSpeed}`);
const LONGEST_L = 0.430 + 0.045;
const cadence = (opts) => (2 * slowest) / strideFor(slowest, LONGEST_L, opts);
assert.ok(cadence(gait) >= gait.cadenceMin - 1e-9, `the longest legs step at ${cadence(gait).toFixed(2)}/s at ▶`);
assert.ok(cadence(MOTION_DEFAULTS) < gait.cadenceMin, 'and cadenceMin is what holds that (without it: slow motion)');

const share = S.travelJitter / S.autoSeconds;   // the playground's 1.6 : 4
for (const k of [1, 2, 3]) {
  const g = gameSpeed(k);
  assert.equal(g.autoRounds, true, `${k}x runs the rounds`);
  assert.ok(Math.abs(g.travelJitter / g.autoSeconds - share) < 1e-12, `${k}x keeps the stagger's share of a round`);
  assert.ok(Math.abs(g.walkSpeed / one.walkSpeed - k) < 1e-12, `${k}x walks k times as fast`);
  assert.ok(Math.abs(one.autoSeconds / g.autoSeconds - k) < 1e-12, `${k}x runs rounds k times as fast`);
}

const pause = gameSpeed(0);
assert.equal(pause.autoRounds, false, '⏸ stops the rounds (tickClocks gates on autoRounds)');
assert.equal(pause.paused, true, '⏸ halts the walks (stepWalk eases them to a stop)');
assert.deepEqual(Object.keys(pause), ['autoRounds', 'paused'], '⏸ leaves the walk settings alone, so a resumed walk keeps its pace');
assert.equal(gameSpeed(1).paused, false, '▶ lets them walk again');

console.log(`speed: ▶ peak ${peak.toFixed(2)} of ${top.toFixed(2)} units/s, stagger ${(share * 100).toFixed(0)}% of a round at every speed`);
