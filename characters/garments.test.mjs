// Self-check for garments.js. Run: node characters/garments.test.mjs
//
// The garment generator has two ways to fail quietly. One is a NaN or an empty mesh from a corner
// of the vocabulary nobody looked at -- which culls a character rather than drawing a bad sweater.
// The other is fit: a garment that sits inside the body it is meant to cover, on one species only.
// Both are checked on real rigs of all three species, because fit is MEASURED off the rig.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE_PARAMS, createCharacter, getSpecies, speciesIds } from './npc.js';
import './owl.js';
import './llama.js';
import './lion.js';
import {
  GARMENTS, STITCHES, EDGES, ACCESSORIES, COLOURWORKS, FORMS, SLEEVES, FIT_RANGE,
  bodyFit, defaultItem, dress, undress, resolveColourwork,
} from './garments.js';

const build = (id) => createCharacter({ ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false, scarf: false }, id);
const item = (type, over = {}) => ({ ...defaultItem(type), on: true, ...over });
const boxOf = (mesh) => new THREE.Box3().setFromObject(mesh);

// --- every silhouette, on every species, at both fit extremes, builds finite geometry ------------
//
// Each dressing also cycles the stitch, edge, accessory, colourwork, form and sleeves, so across the
// run every vocabulary entry meets several silhouettes.
{
  let n = 0;
  for (const id of speciesIds()) {
    const built = build(id);
    for (const [type, g] of Object.entries(GARMENTS)) {
      g.silhouettes.forEach((silhouette, i) => {
        for (const fit of [FIT_RANGE[0], 1, FIT_RANGE[1]]) {
          const it = item(type, {
            silhouette, fit, colorCount: 1 + (i % 3),
            stitch: STITCHES[(i + n) % STITCHES.length], edge: EDGES[(i + 1) % EDGES.length],
            accessory: ACCESSORIES[(i + 2) % ACCESSORIES.length], colourwork: COLOURWORKS[i % COLOURWORKS.length],
            form: FORMS[i % FORMS.length], sleeves: SLEEVES[i % SLEEVES.length],
          });
          n++;
          const meshes = dress(built, { [type]: it });
          built.root.updateMatrixWorld(true);
          assert.ok(meshes.length > 0, `${id} ${type} ${silhouette} at fit ${fit} produced nothing`);
          for (const m of meshes) {
            const b = boxOf(m);
            assert.ok(!b.isEmpty() && Number.isFinite(b.min.x + b.min.y + b.min.z + b.max.x + b.max.y + b.max.z),
              `${id} ${type} ${silhouette} at fit ${fit} (${it.stitch}/${it.edge}/${it.accessory}) has non-finite bounds`);
          }
        }
      });
    }
  }
}

// --- one mesh per joint, and undress removes every one ---------------------------------------
{
  const built = build('lion');
  const outfit = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, item(type, { sleeves: 'long', silhouette: type === 'socks' ? 'over-knee' : GARMENTS[type].silhouettes[0] })]));
  const meshes = dress(built, outfit);
  const joints = new Set(meshes.map((m) => m.parent));
  assert.equal(joints.size, meshes.length, 'two garment meshes share a joint -- everything worn on one joint must merge into one draw');
  // The rig's posed nodes. `chest` is not flagged a joint -- it rides the spine, and the merge pass
  // folds it into the spine's mesh -- but it moves with the body all the same.
  const j = built.joints;
  const rig = new Set([j.head, j.neck, j.chest, ...['upperArm', 'lowerArm', 'upperLeg', 'lowerLeg'].flatMap((k) => j[k].map((e) => e.node))]);
  assert.ok([...joints].every((node) => rig.has(node)), 'every garment mesh must hang on a node the rig poses, or it will not move with the body');
  undress(built);
  let left = 0;
  built.root.traverse((o) => { if (o.userData.garment) left++; });
  assert.equal(left, 0, `undress left ${left} garment meshes behind`);
}

// --- a fitted sweater covers the coat it goes over, on every species --------------------------
//
// Fit is measured from the torso's bounding box, but coats are spikes and curls, and a box's
// half-extents do not bound an ellipsoid's diagonals. The llama's fleece reaches 1.6% past it;
// the sweater's thickness pad is what keeps the curls inside.
function carriedVerts(joint) {
  const inv = joint.matrixWorld.clone().invert();
  const out = [];
  joint.traverse((o) => {
    if (!o.isMesh || o.userData.garment) return;
    for (let n = o.parent; n && n !== joint; n = n.parent) if (n.userData.joint) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
  });
  return out;
}

for (const id of speciesIds()) {
  const built = build(id);
  const fit = bodyFit(built);
  dress(built, { sweater: item('sweater') });
  built.root.updateMatrixWorld(true);
  const body = built.garments.find((m) => m.parent === built.joints.chest);
  // The sweater's own radius at each coat vertex's direction, read off its geometry: the widest
  // garment vertex within a few degrees of that direction.
  const shell = carriedVerts(built.joints.chest).length && body.geometry.attributes.position;
  const dirs = [];
  for (let i = 0; i < shell.count; i += 7) dirs.push(new THREE.Vector3().fromBufferAttribute(shell, i));
  const norm = (p) => Math.hypot(p.x / fit.torso[0], p.y / fit.torso[1], p.z / fit.torso[2]);
  const sweaterMin = Math.min(...dirs.filter((p) => p.y > -fit.torso[1] * 0.4 && p.y < fit.torso[1] * 0.5).map(norm));
  const coatMax = Math.max(...carriedVerts(built.joints.chest).filter((p) => p.y > -fit.torso[1] * 0.4 && p.y < fit.torso[1] * 0.5).map(norm));
  assert.ok(sweaterMin > coatMax,
    `${id}: a fitted sweater sits inside the coat -- sweater ${sweaterMin.toFixed(3)} vs coat ${coatMax.toFixed(3)} (torso-normalised)`);
}

// --- the two silhouettes the spec names on purpose are reachable ------------------------------
//
// "A scarf so long it trails on the ground, or a hat so big it slips to the side."
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'trailing' }) });
  built.root.updateMatrixWorld(true);
  const low = boxOf(built.garments.find((m) => m.parent === built.joints.chest)).min.y;
  assert.ok(low < 0.05, `${id}: the trailing scarf stops ${low.toFixed(3)} above the floor`);

  const hatAt = (fit) => {
    dress(built, { hat: item('hat', { fit, edge: 'none' }) });
    built.root.updateMatrixWorld(true);
    return boxOf(built.garments[0]);
  };
  const small = hatAt(FIT_RANGE[0]), fitted = hatAt(1), big = hatAt(FIT_RANGE[1]);
  assert.ok(small.min.y > fitted.min.y, `${id}: a hat too small must perch higher than a fitted one`);
  const lean = (b) => (b.max.x + b.min.x) / 2 - built.joints.head.getWorldPosition(new THREE.Vector3()).x;
  assert.ok(Math.abs(lean(big)) > Math.abs(lean(fitted)) + 0.01, `${id}: an oversized hat must slip to one side`);
}

// --- the purchase fallback (spec §3) ----------------------------------------------------------
assert.equal(resolveColourwork('solid', 1), 'solid');
assert.equal(resolveColourwork('solid', 2), 'stripes', 'two colours on a solid pattern become stripes');
assert.equal(resolveColourwork('solid', 3), 'fair isle', 'three colours on a solid pattern become fair isle');
assert.equal(resolveColourwork('stripes', 3), 'fair isle', 'stripes become fair isle at three colours');
assert.equal(resolveColourwork('checks', 3), 'checks', 'a colourwork with its own slots is left alone');

console.log('garments.js self-check: all assertions passed');
