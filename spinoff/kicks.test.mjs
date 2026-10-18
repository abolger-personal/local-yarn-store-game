import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, newFighter, stepFighter } from './fighter.js';
import { SHOWN_FRAMES, kickLeg, shownStrike } from './kicks.js';
import { MOVES } from './sim.js';

LOOK.viewPx = 0;
setGeometryDetail('low');

const at = (o) => o.getWorldPosition(new THREE.Vector3());
const STRIKE = MOVES.kick.active[0] / MOVES.kick.steps, LAST = MOVES.kick.active[1] / MOVES.kick.steps;

/** Feet, hips, head and lunge in the fighter's own frame (facing +z), `kick` posed over rest. */
function measure(built, kick) {
  for (let i = 0; i < 3; i++) stepFighter(built, 1e-4, POSES.rest, 0, kick);
  built.root.updateMatrixWorld(true);
  const { foot, upperLeg, head } = built.joints;
  const hips = upperLeg.map(({ node }) => at(node)).reduce((a, b) => a.add(b).multiplyScalar(0.5));
  return { feet: foot.map(({ node }) => at(node)), hips, head: at(head), lunge: built.root.position.z };
}

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species)), P = built.params, L = P.legHeight + P.hipInset;
  const rest = measure(built, null);
  for (const leg of [-1, 1]) {
    const i = leg < 0 ? 0 : 1, why = `${species} (leg ${leg})`;
    for (const step of [STRIKE, LAST]) {
      const m = measure(built, { name: 'thrust', leg, step }), foot = m.feet[i], standing = m.feet[1 - i];
      assert.ok(foot.z - m.hips.z > 0.8 * L, `${why} thrust: kicking foot ${((foot.z - m.hips.z) / L).toFixed(2)} legs ahead of the hips, want > 0.8`);
      assert.ok(foot.y > m.hips.y - 0.1 * L, `${why} thrust: kicking foot at ${foot.y.toFixed(3)}, want about hip height ${m.hips.y.toFixed(3)} or above`);
      const lean = Math.atan2(m.hips.z - m.head.z, m.head.y - m.hips.y);
      assert.ok(lean > 0.8, `${why} thrust: head ${lean.toFixed(2)} rad back from over the hips, want > 0.8`);
      assert.ok(Math.abs(standing.y - rest.feet[1 - i].y) < 0.01, `${why} thrust: standing foot on the floor (${standing.y.toFixed(3)} vs ${rest.feet[1 - i].y.toFixed(3)})`);
      assert.ok(m.lunge > 0.3 * L, `${why} thrust: the body lunges forward (${(m.lunge / L).toFixed(2)} legs)`);
    }
    const wind = measure(built, { name: 'thrust', leg, step: 0.18 });
    assert.ok(wind.hips.y < rest.hips.y - 0.05 * L && wind.feet[i].y > rest.feet[i].y + 0.3 * L, `${why} thrust: sinks and chambers the knee first`);
    const k = measure(built, { name: 'kick', leg, step: STRIKE });
    assert.ok(k.feet[i].z - k.hips.z > 0.7 * L && k.head.z > k.hips.z - 0.3 * L, `${why} kick: a quick front kick, no big lean`);
    assert.ok(Math.abs(k.feet[1 - i].y - rest.feet[1 - i].y) < 0.01, `${why} kick: standing foot on the floor`);
  }
  const done = measure(built, null);
  assert.ok(done.lunge === 0 && Math.abs(done.hips.z - rest.hips.z) < 1e-9, `${species}: back in place after a kick`);
  for (const facing of [0, Math.PI]) {
    const g = new THREE.Group().add(built.root);
    g.rotation.y = Math.PI / 2 - facing;
    const { feet } = measure(built, null), side = kickLeg(facing);
    assert.ok(feet[side < 0 ? 0 : 1].z > feet[side < 0 ? 1 : 0].z, `${species} facing ${facing}: the leg nearer the camera (+z) kicks`);
    g.remove(built.root);
  }
  disposeFighter(built);
}

// A strike is drawn over at least SHOWN_FRAMES frames (playtest: slow tablets showed only keyframes)
{
  /** The steps drawn, frame by frame, for the sim's steps `live` (null once its strike has ended). */
  const shown = (live) => {
    let was = null;
    const out = [];
    for (const step of [...live, null, null, null, null, null, null, null, null]) {
      was = shownStrike(was, step === null ? null : { name: 'jab', arm: 1, step });
      if (was) out.push(was.step);
    }
    return out;
  };
  const fast = Array.from({ length: 16 }, (_, i) => i / 16);
  assert.deepEqual(shown(fast), fast, 'at 60 frames a second, the strike drawn is the sim\'s');
  const slow = shown([0, 0.4, 0.8]);
  assert.ok(slow.length >= SHOWN_FRAMES && slow.every((v, i) => i === 0 || v - slow[i - 1] <= 1 / SHOWN_FRAMES + 1e-9),
    `on a slow tablet, the strike moves in small steps over at least ${SHOWN_FRAMES} frames, playing out after the sim's (${slow})`);
  let was = shownStrike(null, { name: 'jab', arm: 1, step: 0.5 });
  was = shownStrike(was, { name: 'cross', arm: -1, step: 0.5 });
  assert.deepEqual([was.name, was.step], ['cross', 1 / SHOWN_FRAMES], 'the next strike starts from its beginning');
}

console.log('kicks: ok');
