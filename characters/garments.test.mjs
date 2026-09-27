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
  GARMENTS, STITCHES, EDGES, ACCESSORIES, COLOURWORKS, FORMS, SLEEVES, FIT_RANGE, MAX_COLOURS,
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
            silhouette, fit, colorCount: 1 + (i % MAX_COLOURS),
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

  // Too small gets SHORTER, never tighter: the smallest sweater is a collar, still outside the coat.
  dress(built, { sweater: item('sweater', { fit: FIT_RANGE[0] }) });
  const tiny = built.garments.find((m) => m.parent === built.joints.chest).geometry.attributes.position;
  let tinyMin = Infinity;
  for (let i = 0; i < tiny.count; i++) tinyMin = Math.min(tinyMin, norm(new THREE.Vector3().fromBufferAttribute(tiny, i)));
  assert.ok(tinyMin >= 1, `${id}: a too-small sweater cuts into the body (${tinyMin.toFixed(3)} of the torso's clearance)`);
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
  // Fit 1 hugs the skull: sized to the head's box instead, a lion's hat sits out on its mane.
  const skullX = bodyFit(built).skull[0];
  assert.ok((fitted.max.x - fitted.min.x) / 2 < skullX * 1.35,
    `${id}: a fitted hat is ${((fitted.max.x - fitted.min.x) / 2 / skullX).toFixed(2)}x the skull's width`);
  const lean = (b) => (b.max.x + b.min.x) / 2 - built.joints.head.getWorldPosition(new THREE.Vector3()).x;
  assert.ok(Math.abs(lean(big)) > Math.abs(lean(fitted)) + 0.01, `${id}: an oversized hat must slip to one side`);
}

// --- every hat rests ON the skull, never through it -----------------------------------------
//
// The slump pulls crowns down; a beret's started at the skull's own height and sank into it.
for (const id of speciesIds()) {
  const built = build(id);
  const [a, b, c] = bodyFit(built).skull;
  for (const silhouette of GARMENTS.hat.silhouettes) {
    for (const fit of [FIT_RANGE[0], 1, FIT_RANGE[1]]) {
      dress(built, { hat: item('hat', { silhouette, fit, edge: 'none', fibre: 'silk' }) });
      const p = built.garments[0].geometry.attributes.position;
      let inside = Infinity;
      for (let i = 0; i < p.count; i++) inside = Math.min(inside, Math.hypot(p.getX(i) / a, p.getY(i) / b, p.getZ(i) / c));
      assert.ok(inside >= 1, `${id}: a ${silhouette} at fit ${fit} goes into the skull (${inside.toFixed(3)} of its radius)`);
    }
  }
}

// --- the slouch's fold hangs behind the head, not down into it ------------------------------
//
// Hinged at the head's centreline, the fold swung its end into the back of the skull, where the
// skull clamp flattened it on: 28% of the bag lay on the skull at fit 1.
for (const id of speciesIds()) {
  const built = build(id);
  const [a, b, c] = bodyFit(built).skull;
  dress(built, { hat: item('hat', { silhouette: 'slouch', fit: 1, edge: 'none', stitch: 'plain' }) });
  const g = built.garments[0].geometry, p = g.attributes.position, uv = g.attributes.uv;
  let onSkull = 0;
  for (let i = 0; i < p.count; i++) {
    if (uv.getY(i) <= 0.5) onSkull += Math.hypot(p.getX(i) / a, p.getY(i) / b, p.getZ(i) / c) < 1.12;
  }
  assert.equal(onSkull, 0, `${id}: ${onSkull} points of the slouch's fold lie on the skull`);
}

// --- what the hat covers stays under it ------------------------------------------------------
//
// Eyes and ears under the hat are not drawn; the mane is pressed in; a fitted hat keeps the eyes.
for (const id of speciesIds()) {
  const built = build(id);
  const head = built.joints.head;
  const mane = head.getObjectByName('mane');
  const original = mane?.geometry;
  dress(built, { hat: item('hat', { fit: 1 }) });
  assert.ok(built.joints.eye.every((e) => e.node.visible), `${id}: a fitted beanie hides the eyes`);
  for (const silhouette of ['headband', 'fisherman']) {
    for (const fit of [1, FIT_RANGE[1]]) {
      dress(built, { hat: item('hat', { silhouette, fit }) });
      assert.ok(built.joints.ear.every((e) => e.node.visible), `${id}: a ${silhouette} at fit ${fit} hides the ears`);
    }
  }
  dress(built, { hat: item('hat', { silhouette: 'hood', fit: 1 }) });
  assert.ok(built.joints.eye.every((e) => e.node.visible), `${id}: a fitted hood's face opening hides the eyes`);
  dress(built, { hat: item('hat', { fit: FIT_RANGE[1] }) });
  assert.ok(built.joints.ear.every((e) => !e.node.visible), `${id}: the ears poke through an oversized hat`);
  if (mane) {
    built.root.updateMatrixWorld(true);
    const hatTop = new THREE.Box3().setFromObject(built.garments[0]).max.y;
    const maneTop = new THREE.Box3().setFromObject(mane).max.y;
    assert.ok(maneTop < hatTop, `${id}: the mane pokes out of the hat's crown (${maneTop.toFixed(3)} vs ${hatTop.toFixed(3)})`);
  }
  // The face is not a coat: a bucket's brim reads as solid, and pressing the snout sank it into the skull.
  undress(built);
  const face = [];
  head.traverse((o) => {
    if (o.isMesh && o !== mane && head.worldToLocal(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())).z > 0.05) face.push([o, o.geometry]);
  });
  for (const silhouette of GARMENTS.hat.silhouettes) {
    dress(built, { hat: item('hat', { silhouette, fit: 1 }) });
    const moved = face.filter(([o, g]) => o.geometry !== g).length;
    assert.equal(moved, 0, `${id}: a fitted ${silhouette} presses ${moved} face parts into the head`);
  }
  undress(built);
  assert.ok([...built.joints.eye, ...built.joints.ear].every((e) => e.node.visible), `${id}: undress leaves parts hidden`);
  assert.equal(mane?.geometry, original, `${id}: undress leaves the mane pressed`);
}

// --- knit in the round has no seam, whatever the relief ---------------------------------------
//
// A non-whole number of pattern repeats round the hat made the relief jump where the sheet meets
// itself, and relief's own normals re-creased it: the hat looked split.
{
  const built = build('lion');
  for (const stitch of STITCHES) {
    dress(built, { hat: item('hat', { stitch, edge: 'none', colourwork: 'checks', colorCount: 2 }) });
    const g = built.garments[0].geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const start = new Map();
    for (let i = 0; i < uv.count; i++) if (uv.getX(i) === 0) start.set(uv.getY(i), i);
    let worst = 0, crease = 0;
    for (let i = 0; i < uv.count; i++) {
      const j = uv.getX(i) === 1 ? start.get(uv.getY(i)) : undefined;
      if (j === undefined) continue;
      worst = Math.max(worst, Math.hypot(p.getX(i) - p.getX(j), p.getY(i) - p.getY(j), p.getZ(i) - p.getZ(j)));
      crease = Math.max(crease, Math.hypot(n.getX(i) - n.getX(j), n.getY(i) - n.getY(j), n.getZ(i) - n.getZ(j)));
    }
    assert.ok(worst < 1e-5, `${stitch}: the hat's seam opens by ${worst.toFixed(5)}`);
    assert.ok(crease < 1e-5, `${stitch}: the hat's seam is creased (normals differ by ${crease.toFixed(4)})`);
  }
}

// --- the purchase fallback (spec §3) ----------------------------------------------------------
assert.equal(resolveColourwork('solid', 1), 'solid');
assert.equal(resolveColourwork('solid', 2), 'stripes', 'two colours on a solid pattern become stripes');
assert.equal(resolveColourwork('solid', 3), 'stripes', 'three colours on a solid pattern become three-colour stripes');
assert.equal(resolveColourwork('stripes', 3), 'stripes', 'stripes repeat through three colours; they do not become fair isle');
assert.equal(resolveColourwork('checks', 3), 'checks', 'a colourwork with its own slots is left alone');

console.log('garments.js self-check: all assertions passed');
