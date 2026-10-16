import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, newFighter, stepFighter } from './fighter.js';
import { kickLeg } from './kicks.js';
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

console.log('kicks: ok');
