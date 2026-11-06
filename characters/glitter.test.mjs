import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MOTION_DEFAULTS, BASE_PARAMS, POSES, createCharacter, getSpecies, applyPose, stepMotion,
  DANCES, makeDance, stepDance, placeDancer,
} from './npc.js';
import { stepGlitter } from './glitter.js';
import './species.js';

const scene = new THREE.Scene();
const b = createCharacter({ ...BASE_PARAMS, ...getSpecies('llama').defaults, mergeMeshes: false }, 'llama');
scene.add(b.root);
applyPose(b, { ...POSES.rest });

// DANCES.md §Gymnastics, Leotards: the glitter rides the chest through the flips, sheds a trail only in the air,
// and is gone with the dance
const perf = makeDance('biles-beam'), o = { ...MOTION_DEFAULTS, idleAmount: 0, stiff: 700, zeta: 0.85 };
const chest = new THREE.Vector3(), at = new THREE.Vector3(), reach = Math.max(b.params.torsoW, b.params.torsoH, b.params.torsoD) * 1.2;
let g = null, groundShed = 0, airShed = 0, far = 0;
for (let i = 0; i < 260 && !perf.done; i++) {
  const d = stepDance(perf, 1 / 60);
  stepMotion(b, d.pose, 1 / 60, o);
  placeDancer(b, d);
  g = stepGlitter(g, b, perf, d, 1 / 60);
  b.root.updateMatrixWorld(true);
  b.joints.chest.getWorldPosition(chest);
  for (const m of g.bits) far = Math.max(far, m.getWorldPosition(at).distanceTo(chest));
  const fresh = g.trail.filter((m) => m.userData.age === 0).length;
  if (d.air) airShed += fresh; else if (perf.i === 0) groundShed += fresh;
}
assert.ok(far < reach, `the glitter stays on the chest through the flips (${far.toFixed(3)} from it)`);
assert.equal(groundShed, 0, 'no trail before the jump');
assert.ok(airShed > 30, `...a trail in the air (${airShed} shed)`);

const tokyo = stepGlitter(null, b, makeDance('biles-ii'), null, 0);
const top = tokyo.bits[0], bottom = tokyo.bits.at(-1), [red, , blue] = DANCES['biles-ii'].glitter.colours;
assert.ok(top.position.y > bottom.position.y && top.material.color.equals(new THREE.Color(red))
  && bottom.material.color.equals(new THREE.Color(blue)), "Tokyo's fade runs red at the top to blue at the bottom");

const before = scene.children.length;
assert.equal(stepGlitter(tokyo, b, null, null, 0), null, 'the glitter goes with the dance');
assert.equal(scene.children.length, before - tokyo.trail.length, '...trail and all');
assert.equal(stepGlitter(null, b, makeDance('back-tuck'), null, 0), null, 'a dance with no leotard has none');

// the wuxia sweep's action line: the out foot draws it round the floor during the turn, and nothing before it
{
  const w = makeDance('wuxia-turn'), ow = { ...o, stiff: DANCES['wuxia-turn'].stiff, zeta: DANCES['wuxia-turn'].zeta };
  let line = null, early = 0, swept = 0, high = 0;
  const around = new Set();
  for (let i = 0; i < 90; i++) {
    const d = stepDance(w, 1 / 60);
    stepMotion(b, d.pose, 1 / 60, ow);
    placeDancer(b, d);
    line = stepGlitter(line, b, w, d, 1 / 60);
    const fresh = line.trail.filter((m) => m.visible && m.userData.age < 1 / 60);
    if (w.i === 0) early += fresh.length;
    if (w.i === 1) swept += fresh.length;
    for (const m of fresh) {
      high = Math.max(high, m.position.y);
      around.add(Math.floor((Math.atan2(m.position.z, m.position.x) + Math.PI) / (Math.PI / 4)));
    }
  }
  assert.equal(early, 0, 'no action line in the crouch');
  assert.ok(swept > 60 && around.size >= 7, `...a line all the way round in the sweep (${swept} dots, ${around.size}/8 of the circle)`);
  assert.ok(high < 0.08, `...along the floor (highest ${high.toFixed(3)})`);
  stepGlitter(line, b, null, null, 0);
}

// Uptown Funk: sunglasses on the head for the strut, a ring of neon speed lines off each snap, all gone after
{
  const f = makeDance('uptown-funk'), snaps = DANCES['uptown-funk'].steps.filter((st) => st.pose.startsWith('uf-snap')).length;
  let look = null, bursts = 0, wasLit = 0;
  for (let i = 0; i < 300 && !f.done; i++) {
    const d = stepDance(f, 1 / 60);
    placeDancer(b, d);
    look = stepGlitter(look, b, f, d, 1 / 60);
    const lit = look.rods.filter((m) => m.visible && m.userData.age <= 1 / 60).length;
    if (lit && !wasLit) bursts += 1;
    wasLit = lit;
  }
  assert.equal(look.shades.parent, b.joints.head, 'sunglasses on the head');
  assert.equal(bursts, snaps, `...a burst of speed lines on every snap (${bursts} of ${snaps})`);
  stepGlitter(look, b, null, null, 0);
  assert.equal(look.shades.parent, null, '...and the glasses come off when it ends');
}
console.log('glitter ok');
