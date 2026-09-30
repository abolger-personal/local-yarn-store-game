// Self-check for garments.js. Run: node characters/garments.test.mjs
//
// The garment generator has two ways to fail quietly. One is a NaN or an empty mesh from a corner
// of the vocabulary nobody looked at -- which culls a character rather than drawing a bad sweater.
// The other is fit: a garment that sits inside the body it is meant to cover, on one species only.
// Both are checked on real rigs of all three species, because fit is MEASURED off the rig.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE_PARAMS, createCharacter, getSpecies, speciesIds, mergeCharacter, applyPose, POSES } from './npc.js';
import './owl.js';
import './llama.js';
import './lion.js';
import {
  GARMENTS, STITCHES, STITCHES_BY_CRAFT, EDGES, ACCESSORIES, COLOURWORKS, FORMS, SLEEVES, FIT_RANGE, MAX_COLOURS, fabric,
  LOOK, WEIGHTS, madeItem, usualTool, bodyFit, defaultItem, dress, undress, resolveColourwork, hasForm, garmentMaterial,
} from './garments.js';

// Judge the look close up, as the dress-up page does; the game's 150px cull has its own check.
LOOK.viewPx = 0;

const build = (id) => createCharacter({ ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false, scarf: false }, id);
const item = (type, over = {}) => ({ ...defaultItem(type), on: true, ...over });
const craftOf = (stitch) => Object.keys(STITCHES_BY_CRAFT).find((c) => STITCHES_BY_CRAFT[c].includes(stitch));
const boxOf = (mesh) => new THREE.Box3().setFromObject(mesh);
// A scarf with ends is one mesh on the chest, skinned to the neck; `onNeck(i)`: vertex i is round it.
const bandOf = (built) => built.garments.find((m) => m.isSkinnedMesh);
const onNeck = (mesh) => (i) => mesh.geometry.attributes.skinWeight.getY(i) > 0.5;

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
            stitch: STITCHES[(i + n) % STITCHES.length], craft: craftOf(STITCHES[(i + n) % STITCHES.length]),
            edge: EDGES[(i + 1) % EDGES.length],
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
  dress(built, { hat: item('hat', { silhouette: 'slouch', fit: 1, edge: 'none', stitch: 'stockinette' }) });
  const g = built.garments[0].geometry, p = g.attributes.position, { uv } = g.attributes;
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
  const { head } = built.joints;
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
  for (const fit of [FIT_RANGE[0], 1, FIT_RANGE[1]]) {
    dress(built, { hat: item('hat', { silhouette: 'hood', fit }) });
    assert.ok(built.joints.eye.every((e) => e.node.visible), `${id}: a hood at fit ${fit} hides the eyes`);
  }
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
    dress(built, { hat: item('hat', { stitch, craft: craftOf(stitch), edge: 'none', colourwork: 'checks', colorCount: 2 }) });
    const g = built.garments[0].geometry, p = g.attributes.position, n = g.attributes.normal, { uv } = g.attributes;
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

// --- a pom-pom is its own size, whatever the stitch size -------------------------------------
//
// Sized from fabric thickness, the stitch-size slider blew pom-poms up with the stitches. The pom
// is the last piece built, so it is the last SPHERE_VERTS vertices of the merged mesh.
{
  const SPHERE_VERTS = 15 * 11;   // pomPom's SphereGeometry(size, 14, 10)
  const built = build('lion');
  const pomWidth = (type, silhouette) => {
    dress(built, { [type]: item(type, { silhouette, accessory: 'pom-pom', edge: 'none' }) });
    const p = built.garments.at(-1).geometry.attributes.position;
    let lo = Infinity, hi = -Infinity;
    for (let i = p.count - SPHERE_VERTS; i < p.count; i++) { lo = Math.min(lo, p.getX(i)); hi = Math.max(hi, p.getX(i)); }
    return hi - lo;
  };
  const was = LOOK.stitchScale;
  for (const [type, silhouette] of [['hat', 'beanie'], ['shawl', 'triangle'], ['socks', 'crew']]) {
    LOOK.stitchScale = 1;
    const small = pomWidth(type, silhouette);
    LOOK.stitchScale = 6;
    const big = pomWidth(type, silhouette);
    assert.ok(Math.abs(big / small - 1) < 0.05, `${type}: the pom-pom grows ${(big / small).toFixed(2)}x with the stitch size`);
  }
  LOOK.stitchScale = was;
}

// --- yarn, stitch and craft each read differently at fit 1 (spec §2b) ------------------------
//
// If a player cannot see the difference, they have no reason to help the NPC find the right yarn.
{
  const at = (over) => fabric({ ...defaultItem('hat'), ...over });
  const widths = WEIGHTS.map((weight) => at({ weight }).stitchW);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] > widths[i - 1] * 1.05,
      `${WEIGHTS[i]} stitches are within 5% of ${WEIGHTS[i - 1]}'s (${widths[i].toFixed(4)} vs ${widths[i - 1].toFixed(4)})`);
  }
  assert.ok(widths.at(-1) / widths[0] > 2, `super-bulky stitches are only ${(widths.at(-1) / widths[0]).toFixed(2)}x lace's`);
  // Thickness is yarn weight's own input: the real spread in yarn gauge, whatever the tool.
  const [lace, sb] = [at({ weight: WEIGHTS[0] }), at({ weight: WEIGHTS.at(-1) })];
  assert.ok(Math.abs(sb.thick / lace.thick - 0.011 / 0.0035) < 1e-9, 'fabric thickness must keep the real spread between weights');
  // Craft: crochet rows are taller and its fabric thicker; every crochet stitch is bumpy.
  const knit = at({ craft: 'knit' }), crochet = at({ craft: 'crochet', stitch: 'waffle' });
  assert.ok(crochet.rowH > knit.rowH * 1.2 && crochet.thick > knit.thick * 1.2, 'crochet must stand taller and thicker than knit');
  assert.ok(crochet.bump > 0 && knit.bump === 0, 'crochet is bumpy all over; knit is smooth');
  // A stitch from the other craft falls back to this craft's plain.
  assert.equal(at({ craft: 'knit', stitch: 'puff' }).stitch, 'stockinette');
  assert.equal(at({ craft: 'crochet', stitch: 'cable' }).stitch, 'single crochet');
}

// --- every stitch's relief survives being sampled, even at lace weight ------------------------
//
// At exactly two segments a repeat a sine is sampled at its zeros: crochet's bumps, garter's
// ridges and linen stitch's dashes all but vanished. The peak displacement relief makes must reach
// a real fraction of a stitch width (every textured stitch's depth or bump is 0.35 or more).
{
  const built = build('lion');
  const was = LOOK.relief;
  const positions = (over, relief) => {
    LOOK.relief = relief;
    dress(built, { hat: item('hat', { edge: 'none', ...over }) });
    return built.garments[0].geometry.attributes.position.array.slice();
  };
  for (const weight of ['lace', 'worsted']) {
    for (const stitch of STITCHES) {
      if (stitch === 'stockinette' || stitch === 'lace') continue;   // smooth, or holes not bumps
      const over = { weight, stitch, craft: craftOf(stitch) };
      const flat = positions(over, 0), raised = positions(over, 1);
      let peak = 0;
      for (let i = 0; i < flat.length; i += 3) peak = Math.max(peak, Math.hypot(raised[i] - flat[i], raised[i + 1] - flat[i + 1], raised[i + 2] - flat[i + 2]));
      const w = fabric({ ...defaultItem('hat'), ...over }).stitchW;
      assert.ok(peak > 0.25 * w, `${weight} ${stitch}: relief peaks at ${(peak / w).toFixed(2)} stitch widths -- it is aliased away`);
    }
  }
  LOOK.relief = was;
}

// --- buttons come in rows, and sit on the fabric ----------------------------------------------
//
// One button, centred in the unrelieved surface, was half-buried and invisible on a hat.
{
  const built = build('lion');
  const verts = (over) => {
    dress(built, { hat: item('hat', { edge: 'none', ...over }) });
    return built.garments[0].geometry.attributes.position.count;
  };
  const one = new THREE.CylinderGeometry(1, 1, 1, 12).attributes.position.count;
  const plain = verts({ stitch: 'rib' });
  assert.equal((verts({ stitch: 'rib', accessory: 'buttons' }) - plain) / one, 5, 'a hat wears a row of five buttons');
  // Every button vertex stands outside the deepest relief under it: rib is 0.6 stitch widths.
  const p = built.garments[0].geometry.attributes.position;
  const fit = bodyFit(built), deep = fabric(item('hat', { stitch: 'rib' }));
  const skin = (i) => Math.hypot(p.getX(i) / fit.skull[0], p.getY(i) / fit.skull[1], p.getZ(i) / fit.skull[2]);
  // Each button against the knit under it: every fabric vertex within ~6 degrees of its centre.
  const at = (i) => new THREE.Vector3(p.getX(i) / fit.skull[0], p.getY(i) / fit.skull[1], p.getZ(i) / fit.skull[2]);
  for (let k = 0; k < 5; k++) {
    const first = p.count - (5 - k) * one;
    const centre = new THREE.Vector3();
    for (let i = first; i < first + one; i++) centre.add(at(i));
    centre.divideScalar(one).normalize();
    let knit = 0, low = Infinity;
    for (let i = 0; i < plain; i++) if (at(i).normalize().dot(centre) > Math.cos(0.1)) knit = Math.max(knit, skin(i));
    for (let i = first; i < first + one; i++) low = Math.min(low, skin(i));
    assert.ok(low > knit * 0.99, `hat button ${k} sinks into the ${deep.stitch} under it (${low.toFixed(3)} vs ${knit.toFixed(3)})`);
  }
}

// --- a scalloped border lies in the fabric and hangs past the edge ----------------------------
//
// The scallops were spheres on the brim, bulging straight out of the hat like a frill. Lying in
// the fabric, every scallop vertex sits within about a fabric thickness of the surface at the
// nearest brim point, measured along the hat's own normal there (the brim is tilted back, so no
// fixed direction will do).
{
  const built = build('lion');
  dress(built, { hat: item('hat', { edge: 'none' }) });
  const bare = built.garments[0].geometry.attributes.position.count;
  let low = Infinity;
  for (let i = 0, q = built.garments[0].geometry.attributes.position; i < bare; i++) low = Math.min(low, q.getY(i));
  dress(built, { hat: item('hat', { edge: 'scalloped' }) });
  const g = built.garments[0].geometry, p = g.attributes.position, nrm = g.attributes.normal;
  const { thick } = fabric(item('hat'));
  const v = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity, hangs = Infinity;
  for (let k = bare; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    hangs = Math.min(hangs, v.y);
    let near = 0, best = Infinity;
    for (let i = 0; i < bare; i++) {
      const d = b.fromBufferAttribute(p, i).distanceToSquared(v);
      if (d < best) { best = d; near = i; }
    }
    const off = v.clone().sub(b.fromBufferAttribute(p, near)).dot(n.fromBufferAttribute(nrm, near).normalize());
    lo = Math.min(lo, off);
    hi = Math.max(hi, off);
  }
  assert.ok(hi - lo < thick * 1.4, `the scallops stand ${((hi - lo) / thick).toFixed(2)} fabric thicknesses deep off the hat -- they stick out`);
  assert.ok(hangs < low - thick * 0.5, 'the scallops must hang on past the brim');
}

// --- made to pattern fits; the wrong yarn or tool does not (spec §3) -------------------------
//
// A good fit has to be the player's doing: the pattern's own yarn and tool, stocked together.
{
  const pattern = { ...defaultItem('hat'), weight: 'fingering' };
  assert.equal(madeItem(pattern).fit, 1, 'made to pattern is fit 1');
  assert.equal(madeItem(pattern).tool, usualTool('knit', 'fingering'), "a pattern with no tool named uses the usual one for its yarn");
  assert.ok(madeItem(pattern, { weight: 'worsted' }).fit > 1.1, 'worsted on a fingering pattern comes out big, even on its needle');
  assert.ok(madeItem(pattern, { weight: 'lace' }).fit < 0.97, 'lace on a fingering pattern comes out small');
  const loose = madeItem(pattern, { tool: 5 }), usual = madeItem(pattern);
  assert.ok(loose.fit > 1.2, 'a bigger needle on the same yarn comes out big');
  assert.ok(fabric(loose).stitchW > fabric(usual).stitchW * 1.2, 'a bigger needle opens the stitch');
  assert.equal(fabric(loose).thick, fabric(usual).thick, 'the tool never changes fabric thickness (spec §2b.2)');
  assert.equal(madeItem(pattern, { weight: 'bulky', fit: 0.7 }).fit, 0.7, 'a forced fit wins');
  assert.equal(madeItem(pattern, { tool: 15, weight: 'super-bulky' }).fit, FIT_RANGE[1], 'fit stays within its range');
}

// --- lace holes are big enough to read ---------------------------------------------------------
//
// Holes 0.6 of a stitch across were lost in the texture. They are cut, so the lace hat's body is
// missing a real share of its quads: at least a fifth (a full grid has two triangles a vertex).
{
  const built = build('lion');
  for (const craft of ['crochet']) {
    dress(built, { hat: item('hat', { stitch: 'lace', craft, edge: 'none' }) });
    const g = built.garments[0].geometry;
    const kept = g.index.count / 3 / (2 * g.attributes.position.count);
    assert.ok(kept < 0.8, `${craft} lace keeps ${(kept * 100).toFixed(0)}% of its fabric -- the holes are too small to read`);
  }
}

// --- puff stitch is poofs, not spikes ---------------------------------------------------------
//
// Spikes, three ways: a sharpened sine sampled a couple of times a bump; crochet's bumps stacked on
// the puffs; and puffs as tall as they were wide. A poof has no vertex much higher than its
// neighbours, and stands well under half as tall as it is wide (three stitches), at the tuned depth.
{
  const built = build('lion');
  const was = LOOK.relief;
  const surface = (relief) => {
    LOOK.relief = relief;
    dress(built, { hat: item('hat', { stitch: 'puff', craft: 'crochet', edge: 'none' }) });
    return built.garments[0].geometry;
  };
  const flat = surface(0).attributes.position.array.slice(), g = surface(was);
  LOOK.relief = was;
  const p = g.attributes.position.array, idx = g.index.array;
  const lift = (i) => Math.hypot(p[i * 3] - flat[i * 3], p[i * 3 + 1] - flat[i * 3 + 1], p[i * 3 + 2] - flat[i * 3 + 2]);
  let peak = 0, step = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map(lift);
    peak = Math.max(peak, a, b, c);
    step = Math.max(step, Math.abs(a - b), Math.abs(b - c), Math.abs(c - a));
  }
  assert.ok(step < peak * 0.6, `puff relief jumps ${(step / peak).toFixed(2)} of its height between neighbours -- it reads as spikes`);
  const across = 3 * fabric(item('hat', { stitch: 'puff', craft: 'crochet' })).stitchW;
  assert.ok(peak / across < 0.4, `a puff stands ${(peak / across).toFixed(2)} as tall as it is wide -- a spike, not a poof`);
}

// --- cable is ropes, not rows of bumps ------------------------------------------------------
//
// A wavy ridge every 8 stitches read as bumps. A cable is a rope: two strands crossing, so along it
// some rows show two strands side by side and some one strand crossing over; and few ropes, with
// plain fabric between wider than the rope, so each reads as a raised braid.
{
  const built = build('lion');
  const was = LOOK.relief;
  const it = item('hat', { stitch: 'cable', edge: 'none' });
  const surface = (relief) => {
    LOOK.relief = relief;
    dress(built, { hat: it });
    return built.garments[0].geometry;
  };
  const flat = surface(0).attributes.position.array.slice(), g = surface(was);
  LOOK.relief = was;
  const p = g.attributes.position.array, uv = g.attributes.uv.array;
  const lift = (i) => Math.hypot(p[i * 3] - flat[i * 3], p[i * 3 + 1] - flat[i * 3 + 1], p[i * 3 + 2] - flat[i * 3 + 2]);
  let cols = 0;
  while (uv[cols * 2 + 1] === 0) cols++;
  const rows = g.attributes.uv.count / cols;
  const peak = Math.max(...Array.from({ length: g.attributes.uv.count }, (_, i) => lift(i)));
  const strands = new Set();
  for (let r = Math.floor(rows * 0.3); r < rows * 0.6; r++) {
    const h = Array.from({ length: cols - 1 }, (_, c) => lift(r * cols + c));   // the last column is the first again
    const up = h.map((x) => x > peak * 0.15);
    const start = up.findIndex((x, c) => x && !up[(c + 1) % up.length]);   // the end of a rope
    let ropes = 0, tops = 0, widest = 0, run = 0, gap = 0, narrowestGap = Infinity;
    for (let k = 1; k <= h.length; k++) {
      const c = (start + k) % h.length, prev = (c + h.length - 1) % h.length, next = (c + 1) % h.length;
      if (up[c]) {
        if (!up[prev]) { ropes++; narrowestGap = Math.min(narrowestGap, gap); run = 0; }
        run++; widest = Math.max(widest, run);
        if (h[c] > h[prev] && h[c] >= h[next]) tops++;
      } else { if (up[prev]) gap = 0; gap++; }
    }
    assert.ok(ropes >= 2 && ropes <= 8, `row ${r}: ${ropes} cables around the hat -- a few ropes, not a ridge every few stitches`);
    assert.ok(narrowestGap > widest, `row ${r}: ${narrowestGap} plain columns between ropes ${widest} wide -- they crowd into bumps`);
    strands.add(Math.round(tops / ropes));
  }
  assert.ok(strands.has(1) && strands.has(2), `along the cable, rows show ${[...strands]} strands a rope -- a rope shows two, then one crossing over`);
}

// --- relief too small to see at the game's size is not built ---------------------------------
//
// At 150px a lace-weight stitch is under a pixel; its relief was several triangles a pixel.
{
  const built = build('lion');
  const tris = (over, viewPx) => {
    LOOK.viewPx = viewPx;
    dress(built, { hat: item('hat', { edge: 'none', ...over }) });
    return built.garments[0].geometry.index.count / 3;
  };
  const was = LOOK.viewPx;
  const plain = tris({ weight: 'lace', craft: 'knit', stitch: 'stockinette' }, 0);   // the bare grid
  const fine = { weight: 'lace', craft: 'crochet', stitch: 'puff' }, bulky = { ...fine, weight: 'bulky' };
  assert.ok(tris(fine, 0) > plain * 2, 'close up, lace-weight puff keeps its relief');
  const culled = tris(fine, 150);
  assert.ok(culled <= plain * 1.2, `at 150px, lace-weight puff is built plain -- ${culled} triangles against ${plain}`);
  assert.equal(tris(bulky, 150), tris(bulky, 0), 'at 150px, bulky puff (a visible stitch) keeps its relief');
  LOOK.viewPx = was;
}

// --- the purchase fallback (spec §3) ----------------------------------------------------------
assert.equal(resolveColourwork('solid', 1), 'solid');
assert.equal(resolveColourwork('solid', 2), 'stripes', 'two colours on a solid pattern become stripes');
assert.equal(resolveColourwork('solid', 3), 'stripes', 'three colours on a solid pattern become three-colour stripes');
assert.equal(resolveColourwork('stripes', 3), 'stripes', 'stripes repeat through three colours; they do not become fair isle');
assert.equal(resolveColourwork('checks', 3), 'checks', 'a colourwork with its own slots is left alone');

// --- neck items start above the llama's ruff, not through it --------------------------------
//
// The ruff is the llama's silhouette: a cowl or a scarf loop wraps the bare neck above it, and a
// scarf's ends come down outside it. The ruff's nominal size comes from the llama's own params (its
// scalloped shape stops a little short).
for (const id of speciesIds()) {
  const built = build(id);
  const P = built.params;
  const ruffTop = P.fleece && P.fleeceNeck ? P.neckLength * P.fleeceNeckCoverage : 0;
  const ruffR = Math.min(P.neckThick * P.fleeceNeckSpread, ruffTop * 0.85);
  assert.ok(id !== 'llama' || ruffTop > 0.1, 'the default llama has a neck ruff to clear');
  dress(built, { scarf: item('scarf', { silhouette: 'long', edge: 'none' }) });
  const band = bandOf(built).geometry.attributes.position, neckY = bodyFit(built).neck.y;
  for (let i = 0; i < band.count; i++) {
    const y = band.getY(i) - neckY, r = Math.hypot(band.getX(i), band.getZ(i));
    assert.ok(!(y > ruffTop * 0.3 && y < ruffTop * 0.7 && r < ruffR * 0.95), `${id}: a scarf end comes down ${r.toFixed(3)} from the neck, inside a ruff ${ruffR.toFixed(3)} wide`);
  }
  undress(built);
  for (const silhouette of ['cowl', 'infinity']) {
    dress(built, { scarf: item('scarf', { silhouette, edge: 'none' }) });
    const loop = built.garments.find((m) => m.parent === built.joints.neck);
    loop.geometry.computeBoundingBox();
    const low = loop.geometry.boundingBox.min.y;
    assert.ok(!ruffTop || low > ruffTop - 0.02, `${id}: the ${silhouette} reaches ${low.toFixed(3)}, through a neck ruff that tops out at ${ruffTop.toFixed(3)}`);
    if (!ruffTop && silhouette === 'cowl') assert.ok(low < 0.05, `${id}: the ${silhouette} starts ${low.toFixed(3)} up a bare neck -- it should wrap from its base`);
    undress(built);
  }
}

// --- a scarf is one piece of fabric ------------------------------------------------------------
//
// Its ends used to be strips starting at the chest and its wrap a ring round the neck: two parts
// that never met. Now a scarf with ends is one band, cut where it passes from the chest to the
// neck joint, so the two meshes share whole rows of vertices there. Draped is a U over the nape,
// open at the throat; wrapped goes round the front too. An infinity scarf closes on itself.
{
  const built = build('lion');
  // triangles round the neck that straddle the front midline (x = 0, in front of the neck)
  const throat = (m) => {
    const p = m.geometry.attributes.position, idx = m.geometry.index.array, round = onNeck(m);
    let n = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]];
      if (tri.every((k) => round(k) && p.getZ(k) > 0) && Math.min(...tri.map((k) => p.getX(k))) < 0 && Math.max(...tri.map((k) => p.getX(k))) > 0) n++;
    }
    return n;
  };
  // the longest step between neighbouring rows, as the character stands now (skinned)
  const longestRowStep = (m, cols) => {
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i + cols < m.geometry.attributes.position.count; i++) {
      worst = Math.max(worst, m.getVertexPosition(i, v).distanceTo(m.getVertexPosition(i + cols, w)));
    }
    return worst;
  };
  for (const form of ['draped', 'wrapped once', 'wrapped twice']) {
    const meshes = dress(built, { scarf: item('scarf', { silhouette: 'long', form, edge: 'none' }) });
    const band = bandOf(built), { uv } = band.geometry.attributes;
    assert.ok(band && meshes.length === 1 && band.skeleton.bones.includes(built.joints.neck), `${form}: the scarf is ${meshes.length} meshes -- it is one band, following the neck round it`);
    // The head turns, nods and tilts; the band bends with it and stays one piece. Cut in two, one
    // piece on each joint, the ends stayed on the chest and a gap opened at the cut.
    let cols = 0;
    while (uv.getY(cols) === uv.getY(0)) cols++;
    built.root.updateMatrixWorld(true);
    const still = longestRowStep(band, cols);
    built.joints.neck.rotation.set(0.35, 0.6, -0.25);
    built.root.updateMatrixWorld(true);
    const turned = longestRowStep(band, cols);
    built.joints.neck.rotation.set(0, 0, 0);
    built.root.updateMatrixWorld(true);
    assert.ok(turned < still * 2, `${form}: with the head turned, the band's rows step ${turned.toFixed(3)} apart, ${(turned / still).toFixed(1)}x standing still -- it tears at the neck`);
    const round = band, ends = band;
    const front = throat(round);
    assert.ok(form === 'draped' ? front === 0 : front > 0, `${form}: ${front} triangles of the scarf cross the throat -- draped is a U, open there; wrapped goes round`);
    if (form === 'draped') {
      // The U meets each end over the shoulder, straight above it. Starting in front of the neck, it
      // hooked back out to the ends and read as a separate piece.
      // Nor does it swing out past them on the way.
      const across = (m, which) => {
        const p = m.geometry.attributes.position;
        let lo = Infinity, hi = 0;
        for (let i = 0; i < p.count; i++) if (which(i) && p.getZ(i) > 0) { lo = Math.min(lo, Math.abs(p.getX(i))); hi = Math.max(hi, Math.abs(p.getX(i))); }
        return [lo, hi];
      };
      const [uIn, uOut] = across(round, onNeck(round)), [eIn, eOut] = across(ends, (i) => !onNeck(ends)(i));
      assert.ok(uIn >= eIn * 0.95, `draped: the U comes in to ${uIn.toFixed(3)} from the middle, inside its ends at ${eIn.toFixed(3)} -- it hooks round to meet them`);
      assert.ok(uOut <= eOut * 1.05, `draped: the U swings out to ${uOut.toFixed(3)}, past its ends at ${eOut.toFixed(3)} -- it bows out to meet them`);
    }
  }
  const loop = dress(built, { scarf: item('scarf', { silhouette: 'infinity', edge: 'none', stitch: 'stockinette' }) })[0].geometry;
  const p = loop.attributes.position, { uv } = loop.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  const last = p.count - cols;
  let gap = 0;
  for (let c = 0; c < cols; c++) gap = Math.max(gap, Math.hypot(p.getX(c) - p.getX(last + c), p.getY(c) - p.getY(last + c), p.getZ(c) - p.getZ(last + c)));
  assert.ok(gap < 1e-4, `the infinity scarf's ends are ${gap.toFixed(3)} apart -- it should close on itself`);
  // At fit 1 an ascot is a small tie at the throat: its ends stop well up the chest.
  dress(built, { scarf: item('scarf', { silhouette: 'ascot', edge: 'none' }) });
  const fit = bodyFit(built);
  const ends = built.garments.find((m) => m.parent === built.joints.neck).geometry;   // an ascot rides the neck
  ends.computeBoundingBox();
  const drop = -ends.boundingBox.min.y / fit.torso[1];
  assert.ok(drop < 0.45, `the ascot's ends hang ${drop.toFixed(2)} of the torso below the neck -- it is a scarf, not a tie`);
  undress(built);
}

// --- an ascot moves with the head; an infinity scarf sits on the shoulders and has no form --------
//
// An ascot's short ends rode the chest while its wrap rode the neck: turn the head and the ends
// hung in midair. An infinity scarf climbed a short neck into the face. And a scarf with no ends
// can't be tied or tucked, so its form is neither offered nor used.
for (const id of speciesIds()) {
  const built = build(id);
  for (const fitK of [1, FIT_RANGE[1]]) {
    const meshes = dress(built, { scarf: item('scarf', { silhouette: 'ascot', fit: fitK, edge: 'none', accessory: 'tassel' }) });
    assert.ok(meshes.every((m) => m.parent === built.joints.neck), `${id}: an ascot at fit ${fitK} hangs partly on the ${meshes.map((m) => m.parent.name).join(', ')} -- it must all turn with the head`);
  }
  const fit = bodyFit(built);
  const loop = dress(built, { scarf: item('scarf', { silhouette: 'infinity', edge: 'none' }) })[0].geometry;
  loop.computeBoundingBox();
  const headBottom = fit.neck.headY - fit.skull[1];
  assert.ok(loop.boundingBox.max.y < headBottom + 0.01, `${id}: the infinity scarf reaches ${loop.boundingBox.max.y.toFixed(3)}, up past the bottom of the head at ${headBottom.toFixed(3)}`);
  undress(built);
}
{
  assert.ok(!hasForm('scarf', 'infinity') && !hasForm('scarf', 'cowl'), 'a scarf with no ends offers a form');
  assert.ok(hasForm('scarf', 'long') && hasForm('shawl', 'triangle') && !hasForm('hat', 'beanie'), 'form is offered where it is not, or hidden where it matters');
  const built = build('lion');
  const tris = (form) => dress(built, { scarf: item('scarf', { silhouette: 'infinity', form, edge: 'none' }) }).reduce((n, m) => n + m.geometry.index.count, 0);
  assert.equal(tris('tied'), tris('wrapped once'), 'an infinity scarf grew a knot: its form must be ignored');
  undress(built);
}

// --- a scarf's ends lie on the body -----------------------------------------------------------
//
// At no angle to it. They stood off in the air: a stand-off for stiff fibre, and the chest's depth
// read on the centre line when the end hangs to the side, where the torso curves back. Above the
// chest's widest, every height of an end has some vertex within 5% of the torso's own surface
// (below it, an end hangs straight and leaves the body, as it should).
for (const id of speciesIds()) {
  const built = build(id);
  const fit = bodyFit(built), [tx, ty, tz] = fit.torso;
  // per 2 cm of height, the vertex nearest the torso, as a scale of it (1 is on its surface)
  const nearestTo = (m, nearest) => {
    const p = m.geometry.attributes.position, dy = m.parent === built.joints.neck ? fit.neck.y : 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + dy;
      // the hanging ends: from 3 cm under the neck base, below where the wrap's layers bunch
      if (y < 0 || y > fit.neck.y - 0.03 || p.getZ(i) < 0) continue;
      const k = Math.round(y * 50);
      nearest.set(k, Math.min(nearest.get(k) ?? Infinity, Math.hypot(p.getX(i) / tx, y / ty, p.getZ(i) / tz)));
    }
  };
  for (const [silhouette, form] of [['ascot', 'draped'], ['long', 'draped'], ['long', 'wrapped once']]) {
    const meshes = dress(built, { scarf: item('scarf', { silhouette, form, fibre: 'linen', edge: 'none' }) });
    const nearest = new Map();
    for (const m of meshes) nearestTo(m, nearest);
    const gap = Math.max(...nearest.values()) - 1;
    assert.ok(gap < 0.05, `${id} ${silhouette}/${form}: its ends stand ${(gap * 100).toFixed(0)}% of the torso off the body -- they should lie on it`);
  }
  undress(built);
}

// --- the eyes peep over a scarf wrapped up high; a trailing scarf trails behind --------------------
//
// An oversized chunky wrap, wrapped twice, climbed over the eyes. And the trailing scarf's ends
// trailed down the front, under the feet: they go behind, like a scarf flung back.
for (const id of speciesIds()) {
  const built = build(id);
  const fit = bodyFit(built);
  assert.ok(Number.isFinite(fit.neck.eyeBottom), `${id}: no eyes measured`);
  const meshes = dress(built, { scarf: item('scarf', { silhouette: 'chunky wrap', form: 'wrapped twice', fit: FIT_RANGE[1], edge: 'none' }) });
  assert.equal(meshes.length, 1, `${id}: the chunky wrap is ${meshes.length} meshes`);
  const wrap = meshes[0].geometry.attributes.position, round = onNeck(meshes[0]);
  let top = -Infinity;
  for (let i = 0; i < wrap.count; i++) if (round(i)) top = Math.max(top, wrap.getY(i) - fit.neck.y);
  assert.ok(top < fit.neck.eyeBottom + 0.01, `${id}: the chunky wrap reaches ${top.toFixed(3)}, over the eyes at ${fit.neck.eyeBottom.toFixed(3)}`);
  dress(built, { scarf: item('scarf', { silhouette: 'trailing', edge: 'none' }) });
  const ends = built.garments.find((m) => m.parent === built.joints.chest).geometry.attributes.position;
  let low = 0, front = 0;
  for (let i = 0; i < ends.count; i++) if (ends.getY(i) < fit.floor + 0.05) { low++; if (ends.getZ(i) > 0) front++; }
  assert.ok(low > 0 && front === 0, `${id}: ${front} of the trailing scarf's ${low} vertices on the floor are in front -- it trails behind`);
  // Draped with both ends behind, it is flung back over both shoulders: round the throat, not
  // hung off the nape.
  const [draped] = dress(built, { scarf: item('scarf', { silhouette: 'trailing', form: 'draped', edge: 'none' }) });
  const u = draped.geometry.attributes.position, uRound = onNeck(draped);
  let throat = Infinity;
  for (let i = 0; i < u.count; i++) if (uRound(i) && u.getZ(i) > 0) throat = Math.min(throat, Math.abs(u.getX(i)));
  assert.ok(throat < 0.02, `${id}: a draped trailing scarf comes no nearer the throat than ${throat.toFixed(3)} -- it hangs off the nape`);
  undress(built);
}

// --- a fine-yarn scarf has fine stitches ------------------------------------------------------
//
// A scarf's stitches were counted round the bunch at its neck, so a lace scarf got a super-bulky's
// few stitches stretched across its flat ends; and its rows were capped far below what a textured
// stitch needs along its length. Every yarn but super bulky blended into the same mush. Lace has
// about three times super bulky's stitches, around and along.
{
  const built = build('lion');
  const grid = (weight) => {
    const [band] = dress(built, { scarf: item('scarf', { silhouette: 'long', form: 'draped', stitch: 'seed', weight, edge: 'none' }) });
    const g = band.geometry;
    const { uv } = g.attributes;
    let cols = 0;
    while (uv.getY(cols) === uv.getY(0)) cols++;
    return [cols, new Set(Array.from({ length: uv.count }, (_, i) => uv.getY(i))).size];
  };
  const [lace, bulky] = [grid('lace'), grid('super-bulky')];
  assert.ok(lace[0] > bulky[0] * 2.2, `a lace scarf has ${lace[0]} columns round it to super bulky's ${bulky[0]} -- its stitches are drawn as big`);
  assert.ok(lace[1] > bulky[1] * 1.8, `a lace scarf has ${lace[1]} rows along it to super bulky's ${bulky[1]} -- its rows are capped`);
  undress(built);
}

// --- dressed, then merged: the clothes fold into the character's merged meshes ----------------------
//
// Dressing a merged rig broke the fit, the hat's cover and the colourwork, so a crowd dresses first
// and merges after. Then everything worn is ONE mesh more, in the character's skin; the garments
// keep their own material (its shader hooks) and their colourwork; and what the hat hid stays
// hidden.
{
  const SKINNED = new Set(['spine', 'neck', 'head', 'leftEye', 'rightEye']);
  const groupOf = (mesh) => {
    let j = mesh.parent;
    while (j && !j.userData.joint) j = j.parent;
    return SKINNED.has(j?.name) ? 'body' : j?.name;
  };
  // an oversized hat, so it hides the eyes too: they are skinned with the head, the case that can leak
  const outfit = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, item(type, {
    sleeves: 'long', colourwork: 'stripes', colorCount: 2, color1: '#ff0000', color2: '#0000ff', ...(type === 'hat' && { fit: FIT_RANGE[1] }),
  })]));
  for (const id of speciesIds()) {
    const built = build(id);
    dress(built, outfit);
    const wearing = new Set(built.garments.map(groupOf));
    const hidden = [...built.joints.eye, ...built.joints.ear].map(({ node }) => node).filter((n) => !n.visible);
    assert.ok(hidden.some((n) => built.joints.eye.some((e) => e.node === n)), `${id}: the hat hides no eye -- the check below would miss the skinned case`);
    mergeCharacter(built);
    const undressed = createCharacter({ ...BASE_PARAMS, ...getSpecies(id).defaults, scarf: false }, id);
    // drawn: visible all the way up. Hiding under the hat only ever takes draws away.
    const count = (b, clothes) => { let n = 0; b.root.traverseVisible((o) => { if (o.isMesh && (o.material === garmentMaterial()) === clothes) n++; }); return n; };
    assert.ok(wearing.size > 1, `${id}: the outfit sits on one joint -- the check below would pass unmerged`);
    assert.equal(count(built, true), 1, `${id}: dressed and merged, the clothes on ${wearing.size} joints cost ${count(built, true)} draws -- they are one mesh`);
    assert.ok(count(built, false) <= count(undressed, false), `${id}: dressed, the body draws ${count(built, false)} meshes to ${count(undressed, false)} undressed -- dressing split it`);
    const knit = [];
    built.root.traverse((o) => { if (o.isMesh && o.material === garmentMaterial()) knit.push(o); });
    assert.equal(knit.length, 1, `${id}: ${knit.length} merged meshes use the garment material -- the merge swapped it for a plain clone`);
    const c = knit.find((m) => m.isSkinnedMesh).geometry.attributes.color;
    let red = 0, blue = 0;
    for (let i = 0; i < c.count; i++) { if (c.getX(i) > 0.9 && c.getZ(i) < 0.1) red++; if (c.getZ(i) > 0.9 && c.getX(i) < 0.1) blue++; }
    assert.ok(red > 0 && blue > 0, `${id}: the merged clothes lost their stripes (${red} red, ${blue} blue vertices) -- the merge repainted them`);
    for (const node of hidden) {
      let shown = false;
      node.traverse((o) => { if (o.isMesh && o.parent.visible && node.visible) shown = true; });
      built.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const b = o.skeleton.bones.indexOf(node), si = o.geometry.attributes.skinIndex;
        for (let i = 0; b >= 0 && i < si.count; i++) if (si.getX(i) === b) shown = true;
      });
      assert.ok(!shown, `${id}: the ${node.name} the hat hid shows again after the merge`);
    }
  }
}

// --- merged, a scarf still bends from the chest round the neck --------------------------------------
//
// A scarf with ends is one band skinned to the chest and the neck. Merged into the character's
// skinned mesh it must keep both: with the head turned hard, every vertex of the merged scarf lands
// where the unmerged one's does. Pinned to the spine alone, the wrap stayed put as the neck turned.
{
  const turned = { ...POSES.rest, headYaw: 1.1, headPitch: 0.4, neckCurve: 0.3 };
  const scarfBox = (built) => {
    applyPose(built, turned);
    built.root.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    built.root.traverse((o) => {
      if (!o.isSkinnedMesh || o.material !== garmentMaterial()) return;
      for (let i = 0; i < o.geometry.attributes.position.count; i++) box.expandByPoint(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld));
    });
    return box;
  };
  for (const id of speciesIds()) {
    const outfit = { scarf: item('scarf', { silhouette: 'long', form: 'wrapped once', edge: 'none' }) };
    const [merged, apart] = [build(id), build(id)];
    dress(merged, outfit);
    dress(apart, outfit);
    mergeCharacter(merged);
    const [m, a2] = [scarfBox(merged), scarfBox(apart)];
    assert.ok(!a2.isEmpty(), `${id}: the unmerged scarf is not skinned -- the check would be empty`);
    const d = Math.max(...['min', 'max'].flatMap((e) => ['x', 'y', 'z'].map((ax) => Math.abs(m[e][ax] - a2[e][ax]))));
    assert.ok(d < 1e-4, `${id}: merged, the scarf lands ${d.toFixed(4)} from where it is unmerged with the head turned -- it lost the neck`);
  }
}

console.log('garments.js self-check: all assertions passed');
