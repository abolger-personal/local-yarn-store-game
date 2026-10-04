// Self-check for the game's speed button (gameSpeed, core/config.js). Run: node characters/store/speed.test.mjs
//
// ▶ must be a walk every leg in the cast can honestly make, every speed must keep the playground's
// share of stagger to round, and ⏸ must stop the rounds without touching how anyone walks.

import assert from 'node:assert/strict';
import { S, gameSpeed } from './core/config.js';
import { MOTION_DEFAULTS, topSpeed } from '../motion.js';

// The shortest leg chain in the cast: the owl's legHeight floor (npc.js) plus the default hipInset.
const SHORTEST_L = 0.085 + 0.045;
const EASE_PEAK = 1.5;   // smoothstep's peak speed over its mean (stepWalk eases every route)

const one = gameSpeed(1);
// pace scales the walk's DURATION (retarget), so the quickest NPC moves 1 / (1 - paceJitter) as fast
const peak = one.walkSpeed * EASE_PEAK / (1 - S.paceJitter);
const top = topSpeed(SHORTEST_L, MOTION_DEFAULTS);
assert.ok(peak <= top,
  `▶ peak ${peak.toFixed(3)} units/s must not outrun the shortest legs (${top.toFixed(3)}), or they skate`);

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
assert.deepEqual(Object.keys(pause), ['autoRounds'], '⏸ leaves the walk settings alone, so a walk under way finishes');

console.log(`speed: ▶ peak ${peak.toFixed(2)} of ${top.toFixed(2)} units/s, stagger ${(share * 100).toFixed(0)}% of a round at every speed`);
