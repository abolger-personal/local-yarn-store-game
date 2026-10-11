// Self-check for garments.js. Run: node characters/garments.test.mjs
//
// The garment generator has two ways to fail quietly. One is a NaN or an empty mesh from a corner
// of the vocabulary nobody looked at -- which culls a character rather than drawing a bad sweater.
// The other is fit: a garment that sits inside the body it is meant to cover, on one species only.
// Both are checked on real rigs of all three species, because fit is MEASURED off the rig.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE_PARAMS, createCharacter, getSpecies, speciesIds, mergeCharacter, applyPose, POSES, DANCE_POSES } from './npc.js';
import './owl.js';
import './llama.js';
import './lion.js';
import {
  GARMENTS, STITCHES, STITCHES_BY_CRAFT, EDGES, ACCESSORIES, COLOURWORKS, FORMS, SLEEVES, FIT_RANGE, MAX_COLOURS, fabric,
  LOOK, WEIGHTS, madeItem, usualTool, bodyFit, defaultItem, dress, undress, resolveColourwork, hasForm, garmentMaterial, randomItem, outfitPieces,
  formsOf, accessoriesOf, wornAs, heldAs, pileAs,
} from './garments.js';
import { gradeSelfie, seenShare, shotFor, takeSelfie } from './selfie.js';
import { PATTERN_DESIGNS, PATTERN_TITLES, PATTERN_TYPES } from '../inventory/catalog.js';
import { WEAR_SLOTS, WEAR_SLOT_FOR } from './wip.js';

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
  // A hat cuts away the mane it covers: pressed only, it showed through the crown of a big beret (15
  // triangles) and a pixie, where the real hat slumps inside the volume pressing works to. Seen out
  // from the head's centre, no mane in the hat's top half lies past the hat.
  if (mane) {
    const ray = new THREE.Raycaster(), v = [0, 1, 2].map(() => new THREE.Vector3());
    for (const [silhouette, fit] of [['beret', 1.4], ['pixie', 1.2], ['pixie', 1.4], ['beanie', 1]]) {
      dress(built, { hat: item('hat', { silhouette, fit, edge: 'none' }) });
      built.root.updateMatrixWorld(true);
      const hat = built.garments[0], box = new THREE.Box3().setFromObject(hat), crown = (box.min.y + box.max.y) / 2;
      hat.material.side = THREE.DoubleSide;
      const centre = head.getWorldPosition(new THREE.Vector3()), pos = mane.geometry.attributes.position, idx = mane.geometry.index.array;
      let poke = 0;
      for (let t = 0; t < idx.length; t += 3) {
        v.forEach((p, k) => p.fromBufferAttribute(pos, idx[t + k]).applyMatrix4(mane.matrixWorld));
        const m = v[0].clone().add(v[1]).add(v[2]).divideScalar(3), out = m.clone().sub(centre);
        if (m.y < crown || m.y > box.max.y) continue;
        ray.set(centre, out.clone().normalize());
        const hit = ray.intersectObject(hat, false)[0];
        if (hit && hit.distance < out.length() - 1e-4) poke++;
      }
      assert.equal(poke, 0, `${id}: ${poke} mane triangles show through the crown of a ${silhouette} at fit ${fit}`);
    }
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
  for (const [type, silhouette] of [['hat', 'beanie'], ['socks', 'crew']]) {
    LOOK.stitchScale = 1;
    const small = pomWidth(type, silhouette);
    LOOK.stitchScale = 6;
    const big = pomWidth(type, silhouette);
    assert.ok(Math.abs(big / small - 1) < 0.05, `${type}: the pom-pom grows ${(big / small).toFixed(2)}x with the stitch size`);
  }
  LOOK.stitchScale = was;
  // A pixie's point is fabric: it folds over behind and its tip hangs near plumb. Bent back as a
  // stiff horn it stood out ~72 degrees, near parallel to the floor.
  for (const id of speciesIds()) {
    const who = build(id);
    dress(who, { hat: item('hat', { silhouette: 'pixie', edge: 'none', accessory: 'pom-pom' }) });
    who.root.updateMatrixWorld(true);
    const m = who.garments[0], pos = m.geometry.attributes.position, { uv } = m.geometry.attributes;
    const centre = (a, b) => {
      const c = new THREE.Vector3(); let n = 0;
      for (let i = 0; i < pos.count; i++) if (uv.getY(i) >= a && uv.getY(i) <= b) { c.add(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)); n++; }
      return c.divideScalar(n);
    };
    const tip = centre(0, 0.06), tail = tip.clone().sub(centre(0.15, 0.25)).normalize();
    const off = THREE.MathUtils.radToDeg(Math.acos(-tail.y));
    assert.ok(off < 20, `${id}: a pixie's tip stands ${off.toFixed(0)} degrees off plumb -- a stick, not fabric`);
    // ...and its pom-pom hangs off that tip, on along the tail; pushed out from the head's centre it
    // sat on the back of the tail.
    const pomMesh = who.garments.at(-1), pp = pomMesh.geometry.attributes.position, pom = new THREE.Vector3();
    for (let i = pp.count - SPHERE_VERTS; i < pp.count; i++) pom.add(new THREE.Vector3().fromBufferAttribute(pp, i).applyMatrix4(pomMesh.matrixWorld).divideScalar(SPHERE_VERTS));
    const along = THREE.MathUtils.radToDeg(pom.sub(tip).angleTo(tail));
    assert.ok(along < 30, `${id}: a pixie's pom-pom is ${along.toFixed(0)} degrees off the line of its tail -- not on the end`);
  }
  // A headband has no crown: its pom-pom sits at a temple, not mid-forehead, at about half a
  // beanie's size (half its own head-sized one; a beanie is sized 0.9 of the head, so 0.56).
  const ratio = 1 / pomWidth('hat', 'beanie') * pomWidth('hat', 'headband');   // the headband stays on
  assert.ok(ratio > 0.4 && ratio < 0.65, `a headband's pom-pom is ${ratio.toFixed(2)}x a beanie's, not about half`);
  const p = built.garments.at(-1).geometry.attributes.position;
  let x = 0;
  for (let i = p.count - SPHERE_VERTS; i < p.count; i++) x += p.getX(i) / SPHERE_VERTS;
  const band = new THREE.Box3().setFromBufferAttribute(built.garments[0].geometry.attributes.position);
  const off = Math.abs(x - band.getCenter(new THREE.Vector3()).x) / band.getSize(new THREE.Vector3()).x;
  assert.ok(off > 0.25, `a headband's pom-pom is ${off.toFixed(2)} band-widths off centre -- mid-forehead`);
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

// --- lace holes are triangles with straight edges ------------------------------------------------
//
// Round holes cut from whole quads were staircases: pixelated circles. An eyelet's edges run along
// quad sides across the fabric (its base) and along diagonals: never straight up the fabric, which
// is the riser of every stair. Counted on the hole edges inside the sheet.
{
  const built = build('lion');
  dress(built, { hat: item('hat', { stitch: 'lace', craft: 'crochet', edge: 'none' }) });
  const g = built.garments[0].geometry, { uv } = g.attributes, idx = g.index.array;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  const rows = uv.count / cols, uses = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const k = Math.min(a, b) * uv.count + Math.max(a, b);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  let risers = 0, edges = 0;
  for (const [k, n] of uses) {
    if (n !== 1) continue;
    const a = Math.floor(k / uv.count), b = k % uv.count, [ca, ra, cb, rb] = [a % cols, Math.floor(a / cols), b % cols, Math.floor(b / cols)];
    if ([ca, cb].some((c) => c === 0 || c === cols - 1) || [ra, rb].some((r) => r === 0 || r === rows - 1)) continue;
    edges++;
    if (ca === cb) risers++;
  }
  assert.ok(edges > 50, `the lace hat has only ${edges} hole edges -- no holes to check`);
  assert.equal(risers, 0, `${risers} of the lace holes' ${edges} edges run straight up the fabric -- they are stair-stepped, not triangles`);
}

// --- a folded hat's lace holes are not stretched into stripes ------------------------------------
//
// The slouch's fold tore the bag off at the hinge, one row spanning the gap, and its rows were
// counted down the bag's short back, so the long folded front stretched every hole: quads forty
// times taller than wide, lace read as ribbons. Below the crown (where quads narrow to its point)
// a quad stays within a few widths tall, as on a beanie.
for (const id of speciesIds()) for (const silhouette of ['slouch', 'pixie']) {
  const built = build(id);
  dress(built, { hat: item('hat', { silhouette, stitch: 'lace', craft: 'crochet', edge: 'none' }) });
  const g = built.garments[0].geometry, p = g.attributes.position, { uv } = g.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  const at = (i) => new THREE.Vector3().fromBufferAttribute(p, i), tall = [];
  for (let k = 0; k < p.count - cols; k++) {
    if (k % cols < cols - 1 && uv.getY(k) > 0.15) tall.push(at(k).distanceTo(at(k + cols)) / at(k).distanceTo(at(k + 1)));
  }
  const p99 = tall.sort((a, b) => a - b)[Math.floor(tall.length * 0.99)];
  assert.ok(p99 < 8, `${id}: a lace ${silhouette}'s quads are up to ${p99.toFixed(1)}x taller than wide -- its holes are stripes`);
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
  // Under the eyes, not under the head: a lion's or an owl's head comes down to its shoulders, and
  // kept under it the scarf ringed the shoulders, out to the arms.
  assert.ok(loop.boundingBox.max.y < fit.neck.eyeBottom + 0.002, `${id}: the infinity scarf reaches ${loop.boundingBox.max.y.toFixed(3)}, up past the eyes at ${fit.neck.eyeBottom.toFixed(3)}`);
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

// --- wrapped, a scarf is a strip of fabric snug round the neck, not a tube out to the arms ---------
//
// Round the neck a band was bunched about a centre line, as thick as wide, at the radius of the
// widest thing at its middle height, each turn a tube's width further out: wrapped, it reached the
// arms, and an infinity scarf passed them even in lace weight. Measured: the part round the neck.
{
  const reach = (id, over) => {
    const built = build(id), fit = bodyFit(built);
    let r = 0;
    for (const m of dress(built, { scarf: item('scarf', { edge: 'none', accessory: 'none', ...over }) })) {
      const p = m.geometry.attributes.position, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < p.count; i++) if (m.parent === built.joints.neck || sw?.getY(i) > 0.5) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
    }
    return r / fit.shoulderX;
  };
  for (const id of speciesIds()) {
    for (const [silhouette, form, most] of [['long', 'wrapped once', 1], ['long', 'wrapped twice', 1.1], ['chunky wrap', 'wrapped once', 1.2], ['infinity', 'draped', 1]]) {
      const r = reach(id, { silhouette, form });
      assert.ok(r <= most, `${id}: a worsted ${silhouette} ${form} reaches ${r.toFixed(2)} of the way to the shoulder's edge -- at most ${most}`);
    }
    const lace = reach(id, { silhouette: 'infinity', weight: 'lace', tool: null });
    assert.ok(lace <= 0.8, `${id}: a lace-weight infinity scarf reaches ${lace.toFixed(2)} of the way to the shoulder's edge -- it is a fine scarf, snug`);
  }
}

// --- wrapped, a band stands upright round the neck: its edges are no further out than its face -------
//
// Out to the body at each height, in the owl's and the lion's crease the top edge rode out over the
// head and the bottom out over the shoulders, past the band's own outer face: a C in section, a
// saucer round the neck. Measured round the neck, in each row across the band.
{
  for (const id of speciesIds()) {
    for (const [silhouette, form] of [['long', 'wrapped once'], ['chunky wrap', 'wrapped twice'], ['infinity', 'draped'], ['kerchief', 'draped']]) {
      const built = build(id);
      const m = dress(built, { scarf: item('scarf', { silhouette, form, edge: 'none', accessory: 'none' }) })[0];
      const { position: p, uv, skinWeight: sw } = m.geometry.attributes;
      const rows = new Map();
      for (let i = 0; i < p.count; i++) {
        if (sw && sw.getY(i) < 0.99) continue;
        const row = rows.get(uv.getY(i)) ?? [];
        rows.set(uv.getY(i), [...row, [p.getY(i), Math.hypot(p.getX(i), p.getZ(i))]]);
      }
      let worst = Infinity;
      for (const row of rows.values()) {
        const ys = row.map(([y]) => y), lo = Math.min(...ys), hi = Math.max(...ys), mid = (lo + hi) / 2;
        const edges = (row.find(([y]) => y === lo)[1] + row.find(([y]) => y === hi)[1]) / 2;
        const face = Math.max(...row.filter(([y]) => Math.abs(y - mid) < (hi - lo) * 0.25).map(([, r]) => r));
        worst = Math.min(worst, face - edges);
      }
      assert.ok(worst > 0, `${id}: a ${silhouette} ${form}'s edges stand ${(-worst).toFixed(3)} further out than its face -- a saucer, not a band`);
    }
  }
}

// --- a kerchief's triangle hangs from its band ------------------------------------------------------
//
// The triangle was a flat piece on the chest and the band a loop on the neck, and they never met:
// the triangle's top must be tucked inside the band at the front, and follow the neck with it.
for (const id of speciesIds()) for (const form of ['draped', 'wrapped once', 'tied']) for (const weight of ['lace', 'super-bulky']) {
  const built = build(id), fit = bodyFit(built);
  dress(built, { scarf: item('scarf', { silhouette: 'kerchief', form, weight, tool: null, edge: 'none', accessory: 'none' }) });
  const band = built.garments.find((m) => m.parent === built.joints.neck).geometry.attributes.position;
  const tri = built.garments.find((m) => m.parent === built.joints.chest).geometry;
  const p = tri.attributes.position, { uv, skinWeight } = tri.attributes;
  let tops = 0;
  for (let i = 0; i < p.count; i++) {
    if (uv.getY(i) !== 0) continue;
    tops++;
    assert.ok(skinWeight.getY(i) > 0.99, `${id} ${form}: the kerchief's top follows the neck by ${skinWeight.getY(i).toFixed(2)} -- it parts from the band when the head turns`);
    const y = p.getY(i) - fit.neck.y, az = Math.atan2(p.getX(i), p.getZ(i)), r = Math.hypot(p.getX(i), p.getZ(i));
    let lo = Infinity, hi = -Infinity, outR = 0;
    for (let k = 0; k < band.count; k++) {
      const d = Math.abs(((Math.atan2(band.getX(k), band.getZ(k)) - az + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 0.2) continue;
      lo = Math.min(lo, band.getY(k));
      hi = Math.max(hi, band.getY(k));
      outR = Math.max(outR, Math.hypot(band.getX(k), band.getZ(k)));
    }
    assert.ok(y > lo && y < hi && r < outR, `${id} ${form} ${weight}: the kerchief's top is at y ${y.toFixed(3)} r ${r.toFixed(3)}, outside its band (y ${lo.toFixed(3)}..${hi.toFixed(3)}, out to ${outR.toFixed(3)}) -- it floats free of it`);
  }
  assert.ok(tops > 0, `${id}: the kerchief has no top row to check`);
}

// --- a trailing scarf lies on the floor, bends onto it, and stays there as the body leans ----------
//
// Its ends met the floor in a corner, and rode the chest: lean forward and the part on the floor
// rose behind like skis. The floor part follows the root; the bend onto it is gradual.
for (const id of speciesIds()) {
  const built = build(id), fit = bodyFit(built), f = fabric(item('scarf'));
  dress(built, { scarf: item('scarf', { silhouette: 'trailing', form: 'wrapped once', edge: 'none', accessory: 'none' }) });
  const m = bandOf(built), v = new THREE.Vector3();
  const world = () => {
    built.root.updateMatrixWorld(true);
    return Array.from({ length: m.geometry.attributes.position.count }, (_, i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld).y);
  };
  const still = world(), floorY = Math.min(...still);
  const lying = still.map((y, i) => (y < floorY + f.thick * 2.5 ? i : -1)).filter((i) => i >= 0);
  assert.ok(lying.length > 20, `${id}: only ${lying.length} vertices of a trailing scarf lie on the floor`);
  built.joints.spine.rotation.x = 0.45;
  const leant = world();
  const rose = Math.max(...lying.map((i) => leant[i] - still[i]));
  assert.ok(rose < f.thick, `${id}: leaning forward lifts the trailing scarf ${rose.toFixed(3)} off the floor -- it should stay down`);
  built.joints.spine.rotation.x = 0;
  // the bend onto the floor: no two row steps along the band more than 40 degrees apart near it
  const p = m.geometry.attributes.position, { uv } = m.geometry.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  let sharpest = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = cols; i + cols < p.count; i += cols) {
    if (p.getY(i) > fit.floor + fit.torso[1] * 0.6) continue;
    a.fromBufferAttribute(p, i).sub(v.fromBufferAttribute(p, i - cols));
    b.fromBufferAttribute(p, i + cols).sub(v.fromBufferAttribute(p, i));
    if (a.lengthSq() > 1e-10 && b.lengthSq() > 1e-10) sharpest = Math.max(sharpest, a.angleTo(b));
  }
  assert.ok(sharpest < THREE.MathUtils.degToRad(40), `${id}: the trailing scarf turns ${THREE.MathUtils.radToDeg(sharpest).toFixed(0)} degrees in one step onto the floor -- a kink, not a drape`);
  // Dressed mid-lean (the dress-up page dresses whatever the idle is doing), then standing up: the
  // floor run was built in the leaning chest's frame and lay tilted 15 degrees off the floor.
  built.joints.spine.rotation.x = 0.26;
  dress(built, { scarf: item('scarf', { silhouette: 'trailing', form: 'wrapped once', edge: 'none', accessory: 'none' }) });
  built.joints.spine.rotation.x = 0;
  const lean = bandOf(built);
  built.root.updateMatrixWorld(true);
  let high = 0;
  for (let i = 0; i < lean.geometry.attributes.position.count; i++) {
    const w = lean.getVertexPosition(i, v).applyMatrix4(lean.matrixWorld);
    if (w.z < -fit.torso[2] * 1.5) high = Math.max(high, w.y);
  }
  assert.ok(high < f.thick * 4, `${id}: dressed while leaning, the trailing scarf's floor run rises to ${high.toFixed(3)} behind -- it lies at an angle, not on the floor`);
}

// --- a trailing scarf's floor run stays on the floor through a plié and a relevé ---------------------
//
// Bound to the root, it went wherever grounding put the root: 66mm down into the floor as the
// attitude's knees bent, and up with the relevé after, like skis bobbing with the dancer.
for (const id of speciesIds()) {
  const built = build(id), f = fabric(item('scarf'));
  const m = dress(built, { scarf: item('scarf', { silhouette: 'trailing', form: 'wrapped once', edge: 'none', accessory: 'none' }) }).find((g) => g.isSkinnedMesh);
  const v = new THREE.Vector3();
  const world = () => {
    built.root.updateMatrixWorld(true);
    return Array.from({ length: m.geometry.attributes.position.count }, (_, i) => m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).y);
  };
  const still = world(), floorY = Math.min(...still);
  const lying = still.map((y, i) => (y < floorY + f.thick * 2.5 ? i : -1)).filter((i) => i >= 0);
  let moved = 0;
  for (const [pose, rise] of [['att-prep', 0], ['att-hold', 0.02]]) {
    applyPose(built, DANCE_POSES[pose]);
    built.root.position.y += rise;   // a dance's relevé, as dress-up adds it
    const now = world();
    moved = Math.max(moved, ...lying.map((i) => Math.abs(now[i] - still[i])));
  }
  assert.ok(moved < 0.005, `${id}: the attitude moves the trailing scarf's floor run ${moved.toFixed(3)} up or down -- it should lie still on the floor`);
}

// --- a pom-pom on a scarf's end hangs off the end ---------------------------------------------------
//
// Centred on the tip, half of each pom-pom sat up on the scarf.
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'long', form: 'draped', edge: 'none', accessory: 'pom-pom', colourwork: 'checks', colorCount: 3, color1: '#ff0000', color2: '#ff0000', color3: '#00ff00' }) });   // the third colour is the trim
  const g = bandOf(built).geometry, p = g.attributes.position, c = g.attributes.color;
  // Its centre is most of its own radius clear of the scarf: past the tip, below it or (trailing, on
  // the owl's short legs) along the floor beyond it.
  for (const side of [1, -1]) {
    const scarf = [], pom = [];
    for (let i = 0; i < p.count; i++) {
      if (Math.sign(p.getX(i)) !== side) continue;
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      if (c.getX(i) > 0.5) scarf.push(v);
      else if (c.getY(i) > 0.5) pom.push(v);
    }
    assert.ok(pom.length > 0, `${id}: no pom-pom found on the ${side > 0 ? 'left' : 'right'} end`);
    const centre = pom.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(pom.length);
    const radius = Math.max(...pom.map((v) => v.distanceTo(centre)));
    const clear = Math.min(...scarf.map((v) => v.distanceTo(centre)));
    assert.ok(clear > radius * 0.8, `${id}: a pom-pom's centre is ${(clear / radius).toFixed(2)} of its radius from the scarf -- it sits on the scarf, not off its end`);
  }
}

// --- a flower or buttons on a scarf are on the scarf -----------------------------------------------
//
// They went down the middle of the chest whatever the scarf did: between its ends, on the body.
for (const id of speciesIds()) for (const accessory of ['flower', 'buttons']) for (const form of ['draped', 'wrapped once']) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'long', form, edge: 'none', accessory, colourwork: 'checks', colorCount: 3, color1: '#ff0000', color2: '#ff0000', color3: '#00ff00' }) });
  const g = bandOf(built).geometry, p = g.attributes.position, c = g.attributes.color;
  const scarf = [], acc = [];
  for (let i = 0; i < p.count; i++) (c.getX(i) > 0.5 ? scarf : c.getY(i) > 0.5 ? acc : []).push(new THREE.Vector3().fromBufferAttribute(p, i));
  const centre = acc.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(acc.length);
  const off = Math.min(...scarf.map((v) => v.distanceTo(centre)));
  assert.ok(acc.length && off < bodyFit(built).torso[0] * 0.1, `${id} ${form}: the ${accessory} sits ${off.toFixed(3)} from the scarf -- it is on the body, not on the scarf`);
}

// --- every scarf wears the accessories it can -----------------------------------------------------
//
// A loop (kerchief, infinity) offered no place for any: a flower on a kerchief was simply not made.
// Every scarf takes every one: a pom-pom or tassel hangs off an end or a point, or a loop's or a
// cowl's bottom edge.
for (const silhouette of GARMENTS.scarf.silhouettes) for (const accessory of ['flower', 'buttons', 'pom-pom', 'tassel']) {
  const built = build('lion');
  const meshes = dress(built, { scarf: item('scarf', { silhouette, form: 'wrapped twice', weight: 'super-bulky', tool: null, edge: 'none', accessory, colourwork: 'checks', colorCount: 3, color1: '#ff0000', color2: '#ff0000', color3: '#00ff00' }) });
  const trim = meshes.reduce((n, m) => {
    const c = m.geometry.attributes.color;
    let k = 0;
    for (let i = 0; i < c.count; i++) if (c.getY(i) > 0.5 && c.getX(i) < 0.5) k++;
    return n + k;
  }, 0);
  assert.ok(trim > 0, `a ${silhouette} with a ${accessory} has none -- it offers nowhere to put one`);
}

// --- a flower on super-bulky stands on the stitches, not sunk among them, nor over them -----------
//
// It was placed on the fabric's surface before relief, and super-bulky's deep stitches swallowed all
// but its centre. Then lifted by the deepest stitch wherever it was, between two cables it hovered.
// Little of it is behind the fabric's face, and it touches the stitches.
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'long', form: 'draped', edge: 'none', accessory: 'flower', weight: 'super-bulky', tool: null, stitch: 'cable', colourwork: 'checks', colorCount: 3, color1: '#ff0000', color2: '#ff0000', color3: '#00ff00' }) });
  const g = bandOf(built).geometry, p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal;
  const scarf = [], bloom = [];
  for (let i = 0; i < p.count; i++) (c.getX(i) > 0.5 ? scarf : c.getY(i) > 0.5 ? bloom : []).push(i);
  const v = new THREE.Vector3(), s = new THREE.Vector3(), centre = new THREE.Vector3();
  bloom.forEach((i) => centre.add(v.fromBufferAttribute(p, i)));
  centre.divideScalar(bloom.length);
  const size = Math.max(...bloom.map((i) => v.fromBufferAttribute(p, i).distanceTo(centre)));
  let behind = 0, touch = Infinity;
  for (const i of bloom) {
    v.fromBufferAttribute(p, i);
    let best = -1, d = Infinity;
    for (const k of scarf) {
      const e = v.distanceToSquared(s.fromBufferAttribute(p, k));
      if (e < d) [d, best] = [e, k];
    }
    touch = Math.min(touch, Math.sqrt(d));
    if (v.sub(s.fromBufferAttribute(p, best)).dot(new THREE.Vector3().fromBufferAttribute(n, best)) < 0) behind++;
  }
  assert.ok(behind / bloom.length < 0.15, `${id}: ${((100 * behind) / bloom.length).toFixed(0)}% of a flower on super-bulky is behind the fabric -- sunk among the stitches`);
  assert.ok(touch < size * 0.15, `${id}: a flower on super-bulky is ${(touch / size).toFixed(2)} of its size off the stitches -- it hovers`);
}

// --- a kerchief hangs off its band, with no shelf where the neck's coat starts ---------------------
//
// On the llama its band sat above the ruff and the triangle stepped straight out over the ruff's top:
// a shelf round the neck.
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'kerchief', form: 'draped', edge: 'none', accessory: 'none' }) });
  const g = built.garments.find((m) => m.parent === built.joints.chest).geometry, p = g.attributes.position, { uv } = g.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  const mid = Math.round((cols - 1) / 2);
  // Draped, it runs out less steeply the further down it gets (round a lion's chest it starts steep
  // and eases). A shelf is the slope jumping UP partway down.
  let last = Infinity, jump = 0;
  for (let i = mid + cols; i < p.count; i += cols) {
    const dr = Math.hypot(p.getX(i), p.getZ(i)) - Math.hypot(p.getX(i - cols), p.getZ(i - cols)), dy = Math.abs(p.getY(i) - p.getY(i - cols));
    if (dy < 1e-6) continue;
    jump = Math.max(jump, dr / dy - last);
    last = dr / dy;
  }
  assert.ok(jump < 0.5, `${id}: partway down its middle the kerchief turns ${jump.toFixed(1)} steeper outward at once -- a shelf, not a drape`);
}

// --- every accessory on every scarf is on it: touching the fabric, not sunk in it -----------------
//
// Lifted by the deepest stitch, a button between two cables hovered; hung off a band's centre line, a
// tassel hung below the open end of a flat band; a straight row of buttons left a curved kerchief at
// both ends. Super-bulky cable is the deepest fabric there is. Each accessory -- the pieces that are
// trim-coloured and not there without it -- has some point within 15% of its size of the fabric, and
// its centre is not sunk in it.
{
  const q = new THREE.Vector3(), v = new THREE.Vector3();
  const PARTS = { 'pom-pom': 1, tassel: 2, flower: 6, buttons: 1 }, SUNK = { 'pom-pom': 0.3, tassel: 0.3, flower: 0.08, buttons: 0.08 };
  const near = (tris, p, box) => {
    let d = Infinity;
    for (const t of tris) {
      if (box && !box.intersectsTriangle(t)) continue;
      d = Math.min(d, t.closestPointToPoint(p, q).distanceTo(p));
    }
    return d;
  };
  for (const id of speciesIds()) {
    const built = build(id);
    built.root.updateMatrixWorld(true);
    const world = (pcs) => pcs.map(({ joint, geo }) => geo.clone().applyMatrix4(joint.matrixWorld));
    const trim = ({ geo }) => geo.attributes.color.getY(0) > 0.5;
    const key = ({ geo }) => { const a = geo.attributes.position; return `${a.count}:${a.getX(0)}:${a.getY(0)}:${a.getZ(0)}`; };
    for (const silhouette of GARMENTS.scarf.silhouettes) {
      const base = { silhouette, form: 'wrapped twice', weight: 'super-bulky', tool: null, stitch: 'cable', edge: 'none', colourwork: 'solid', colorCount: 2, color1: '#ff0000', color2: '#00ff00' };
      const bare = outfitPieces(built, { scarf: item('scarf', { ...base, accessory: 'none' }) });
      const had = new Set(bare.filter(trim).map(key));
      const tris = world(bare.filter((pc) => !trim(pc))).flatMap((g) => {
        const p = g.attributes.position, idx = g.index.array, out = [];
        for (let t = 0; t < idx.length; t += 3) out.push(new THREE.Triangle(...[0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx[t + k]))));
        return out;
      });
      for (const accessory of ['pom-pom', 'tassel', 'flower', 'buttons']) {
        const parts = world(outfitPieces(built, { scarf: item('scarf', { ...base, accessory }) }).filter((pc) => trim(pc) && !had.has(key(pc))));
        assert.ok(parts.length, `${id}: a ${silhouette} with a ${accessory} has none`);
        for (let u = 0; u < parts.length; u += PARTS[accessory]) {
          const box = new THREE.Box3();
          parts.slice(u, u + PARTS[accessory]).forEach((g) => box.expandByObject(new THREE.Mesh(g)));
          const size = box.getSize(new THREE.Vector3()).length() / 2, centre = box.getCenter(new THREE.Vector3()), around = box.clone().expandByScalar(size);
          let gap = Infinity;
          for (const g of parts.slice(u, u + PARTS[accessory])) {
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i += 3) gap = Math.min(gap, near(tris, v.fromBufferAttribute(p, i), around));
          }
          const what = `${id}: a ${accessory} (#${u / PARTS[accessory]}) on a super-bulky cable ${silhouette}`;
          assert.ok(gap < size * 0.15, `${what} is ${(gap / size).toFixed(2)} of its size off the fabric -- it hovers`);
          assert.ok(near(tris, centre, null) > size * SUNK[accessory], `${what} has its centre ${(near(tris, centre, null) / size).toFixed(2)} of its size from the fabric -- sunk in it`);
        }
      }
    }
  }
}

// --- a band never shears from one row to the next ----------------------------------------------------
//
// Its width was taken fresh at each point, from "round the body" leaning to "up" as it bunched. Where
// it turned up off the llama's chest into its wrap, its way passed through that very direction, the
// width flipped, and the band sheared inside out across one row: a blade off the neck. And pressed
// onto the body at each stitch's own height, a band crossing the top of the llama's ruff tore in two.
// From each row to the next no stitch moves far more than stitches usually do. (The QA scarf.)
for (const id of speciesIds()) for (const tool of [2.5, 6]) for (const form of ['wrapped once', 'wrapped twice']) {
  const built = build(id);
  dress(built, { scarf: item('scarf', { silhouette: 'long', form, craft: 'crochet', stitch: 'single crochet', colourwork: 'solid', edge: 'ribbed', accessory: 'pom-pom', weight: 'worsted', fibre: 'alpaca', tool }) });
  const { position: p, uv } = bandOf(built).geometry.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  // the band's own rows: what is merged after it (its edging, its pom-poms) starts v over
  let rows = 1;
  while ((rows + 1) * cols <= p.count && uv.getY(rows * cols) > uv.getY((rows - 1) * cols)) rows++;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), steps = [];
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < cols; c++) steps.push(a.fromBufferAttribute(p, r * cols + c).distanceTo(b.fromBufferAttribute(p, (r + 1) * cols + c)));
  const sorted = [...steps].sort((x, y) => x - y), worst = sorted.at(-1) / sorted[sorted.length >> 1];
  assert.ok(worst < 7, `${id}: a crochet scarf ${form} with a ${tool}mm hook steps ${worst.toFixed(1)} times the usual from one row to the next -- it shears`);
}

// --- a scarf the wrong size reads as wrong: too big slumps to one side, too small chokes -------------
//
// Fit only made the ends longer or shorter: an oversized scarf looked like a long one, an undersized
// one like a short one. Like a hat, a scarf too big is a ring too wide for the neck: it slides down
// onto the shoulders and slumps to one side -- or, held up by an owl's wings, hangs from the back of
// the neck and droops in front, not round it like a hula hoop; too small, it is a ribbon pulled tight,
// high under the chin. Measured on what goes round the neck, in the world, against fit 1.
{
  const round = (id, silhouette, fit) => {
    const built = build(id);
    const meshes = dress(built, { scarf: item('scarf', { silhouette, form: 'wrapped once', fit, edge: 'none', accessory: 'none' }) });
    built.root.updateMatrixWorld(true);
    const axis = new THREE.Vector3().setFromMatrixPosition(built.joints.neck.matrixWorld), pts = [];
    for (const m of meshes) {
      const sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        if (m.parent === built.joints.neck || sw?.getY(i) > 0.5) pts.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld).sub(axis));
      }
    }
    const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
    const side = (sg) => mean(pts.filter((q) => Math.sign(q.x) === sg).map((q) => q.y));
    const end = (sg) => mean(pts.filter((q) => Math.sign(q.z) === sg).map((q) => q.y));
    // the band's own width, across its tip row
    const g = meshes[0].geometry, { uv, position: p } = g.attributes, tip = [];
    for (let i = 0; i < uv.count && uv.getY(i) === 0; i++) tip.push(new THREE.Vector3().fromBufferAttribute(p, i));
    const wide = Math.max(...tip.flatMap((a) => tip.map((b) => a.distanceTo(b))));
    return { y: mean(pts.map((q) => q.y)), r: mean(pts.map((q) => Math.hypot(q.x, q.z))), slump: side(-1) - side(1), droop: end(-1) - end(1), wide };
  };
  for (const id of speciesIds()) for (const silhouette of ['long', 'chunky wrap', 'infinity', 'kerchief', 'cowl']) {
    const [small, fitted, big] = [FIT_RANGE[0], 1, FIT_RANGE[1]].map((fit) => round(id, silhouette, fit));
    const what = `${id}: a ${silhouette}`;
    const fell = Math.max(big.slump - fitted.slump, big.droop - fitted.droop);
    assert.ok(fell > 0.04, `${what} too big slumps ${fell.toFixed(3)} to one side or the front -- it should slump over a shoulder or droop`);
    assert.ok(big.y < fitted.y && big.r > fitted.r * 1.3, `${what} too big sits at ${big.y.toFixed(3)}, ${big.r.toFixed(3)} out -- it should drop, loose, onto the shoulders (fitted: ${fitted.y.toFixed(3)}, ${fitted.r.toFixed(3)})`);
    if (['long', 'chunky wrap'].includes(silhouette)) {
      assert.ok(small.wide < fitted.wide * 0.5, `${what} too small is ${small.wide.toFixed(3)} wide -- a ribbon, not ${fitted.wide.toFixed(3)}`);
    } else {
      // tighter, or up under the chin -- where a lion's head is wider, but it is pulled tight there
      assert.ok(small.y >= fitted.y - 1e-6 && (small.r < fitted.r || small.y > fitted.y + 0.02), `${what} too small sits at ${small.y.toFixed(3)}, ${small.r.toFixed(3)} out -- it should be tight and high (fitted: ${fitted.y.toFixed(3)}, ${fitted.r.toFixed(3)})`);
    }
  }
}

// --- a bag's strap is a flat strap, its ends in the bag ---------------------------------------------
//
// A cross strap was a loop round the body that never met the bag: two pieces, the bag hung from
// nothing. Every strap was a round tube, a cord; and a backpack's ran from the chest straight back
// through the body to the bag. Each strap's two ends are inside the bag's body, it is at least three
// times as wide as it is thick, and its middle stays out of the torso. (A drawstring's cords are cords.)
for (const id of speciesIds()) for (const silhouette of GARMENTS.bag.silhouettes) {
  if (silhouette === 'drawstring bag') continue;
  const built = build(id), fit = bodyFit(built);
  const pieces = outfitPieces(built, { bag: item('bag', { silhouette, edge: 'none', accessory: 'none', colourwork: 'solid', colorCount: 2, color1: '#ff0000', color2: '#00ff00' }) });
  const bag = new THREE.Box3().setFromBufferAttribute(pieces[0].geo.attributes.position).expandByScalar(0.002);
  const straps = pieces.slice(1).filter(({ geo }) => geo.attributes.color.getY(0) > 0.5);
  assert.ok(straps.length, `${id}: a ${silhouette} has no strap`);
  for (const { geo } of straps) {
    const { position: p, uv } = geo.attributes;
    let cols = 0;
    while (uv.getY(cols) === 0) cols++;
    const rows = p.count / cols, row = (r) => Array.from({ length: cols }, (_, c) => new THREE.Vector3().fromBufferAttribute(p, r * cols + c));
    const middle = (r) => row(r).reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(cols);
    for (const r of [0, rows - 1]) assert.ok(bag.containsPoint(middle(r)), `${id}: a ${silhouette}'s strap ends at ${middle(r).toArray().map((x) => x.toFixed(3))}, outside the bag -- it does not meet it`);
    const mid = row(Math.floor(rows / 2)), wide = Math.max(...mid.flatMap((a) => mid.map((b) => a.distanceTo(b))));
    const [a, b] = mid.flatMap((x) => mid.map((y) => [x, y])).find(([x, y]) => x.distanceTo(y) === wide);
    const line = new THREE.Line3(a, b), q = new THREE.Vector3();
    const thick = 2 * Math.max(...mid.map((x) => line.closestPointToPoint(x, false, q).distanceTo(x)));
    assert.ok(wide > thick * 3, `${id}: a ${silhouette}'s strap is ${wide.toFixed(3)} wide and ${thick.toFixed(3)} thick -- a tube, not a strap`);
    const c = middle(Math.floor(rows / 2)), t = fit.torso, inside = Math.hypot(c.x / t[0], c.y / t[1], c.z / t[2]);
    assert.ok(inside > 0.97, `${id}: a ${silhouette}'s strap runs through the body at ${c.toArray().map((x) => x.toFixed(3))}`);
  }
}

// One bag's body box and its (first) strap: every vertex, the centreline row by row, and its width midway.
function bagStrap(built, silhouette, fit) {
  const pieces = outfitPieces(built, { bag: item('bag', { silhouette, fit, edge: 'none', accessory: 'none', colourwork: 'solid', colorCount: 2, color1: '#ff0000', color2: '#00ff00' }) });
  const bag = new THREE.Box3().setFromBufferAttribute(pieces[0].geo.attributes.position);
  const { position: p, uv } = pieces.slice(1).find(({ geo }) => geo.attributes.color.getY(0) > 0.5).geo.attributes;
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  const verts = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
  const row = (r) => verts.slice(r * cols, (r + 1) * cols);
  const line = Array.from({ length: p.count / cols }, (_, r) => row(r).reduce((a, b) => a.clone().add(b)).divideScalar(cols));
  const mid = row(Math.floor(line.length / 2));
  return { bag, verts, line, wide: Math.max(...mid.flatMap((a) => mid.map((b) => a.distanceTo(b)))) };
}

// --- a bag's strap is knitted at its gauge: it grows and lengthens with fit ------------------------
//
// The bag hung at a fixed height and swelled about it, and its strap -- sized from the torso alone --
// stayed put, the same width, a hoop round the hips at any fit, lace or super-bulky. Its strap is
// knitted at the bag's gauge: a bigger fit is a wider strap and a longer drop, so the strap's lowest
// point falls with it. A cross strap at the hip comes down to the bag's top, not past it.
for (const id of speciesIds()) for (const silhouette of GARMENTS.bag.silhouettes) {
  if (silhouette === 'backpack' || silhouette === 'drawstring bag') continue;   // worn on the back
  const built = build(id), t = bodyFit(built).torso;
  const [small, big] = [0.6, 1.4].map((fit) => bagStrap(built, silhouette, fit));
  const low = (s) => Math.min(...s.line.map((p) => p.y));
  assert.ok(big.wide > small.wide * 1.8, `${id}: a ${silhouette}'s strap is ${small.wide.toFixed(3)} wide at fit 0.6 and ${big.wide.toFixed(3)} at 1.4 -- fit does not widen it`);
  assert.ok(low(big) < low(small) - t[1] * 0.3, `${id}: a ${silhouette}'s strap comes down to ${low(small).toFixed(3)} at fit 0.6 and ${low(big).toFixed(3)} at 1.4 -- fit does not lengthen it`);
  if (silhouette !== 'shoulder bag' && silhouette !== 'bucket bag') continue;
  for (const s of [small, big]) {
    const free = s.line.filter((p) => !s.bag.containsPoint(p));
    assert.ok(Math.min(...free.map((p) => p.y)) > s.bag.max.y - t[1] * 0.1, `${id}: a ${silhouette}'s strap hangs to ${Math.min(...free.map((p) => p.y)).toFixed(3)}, past the bag's top at ${s.bag.max.y.toFixed(3)} -- a hoop round the hips`);
  }
}

// --- a cross strap goes round the body and into the bag, never through the body ---------------------
//
// Opened at its lowest, on the near hip, a pouch hung in front took the strap's back end straight
// through the torso to it: a pie-slice V. Every vertex of a cross strap outside the bag is outside the
// torso, both ends are in the bag, and it bends smoothly: no corner between two rows of its centreline.
for (const id of speciesIds()) for (const silhouette of ['shoulder bag', 'bucket bag', 'crossbody pouch']) for (const fit of [0.2, 1, 1.6]) {
  const built = build(id), t = bodyFit(built).torso;
  const { bag, verts, line } = bagStrap(built, silhouette, fit), at = (p) => p.toArray().map((x) => x.toFixed(3));
  for (const p of verts) {
    if (bag.containsPoint(p)) continue;
    assert.ok(Math.hypot(p.x / t[0], p.y / t[1], p.z / t[2]) > 0.97, `${id}: a ${silhouette}'s strap at fit ${fit} runs through the body at ${at(p)}`);
  }
  for (const p of [line[0], line.at(-1)]) assert.ok(bag.clone().expandByScalar(0.002).containsPoint(p), `${id}: a ${silhouette}'s strap at fit ${fit} ends at ${at(p)}, outside the bag`);
  const turn = Math.max(...line.slice(1, -1).map((p, i) => p.clone().sub(line[i]).angleTo(line[i + 2].clone().sub(p))));
  assert.ok(turn < THREE.MathUtils.degToRad(45), `${id}: a ${silhouette}'s strap at fit ${fit} turns ${THREE.MathUtils.radToDeg(turn).toFixed(0)} degrees between two rows -- a V`);
}

// --- a draped shawl goes over the shoulders and arms, not under them -------------------------------
//
// Hung from inside the shoulders' width, a shawl's sides came down between the arm and the body, and
// the arm came out through it as through a vest's armhole. A shawl has no armhole: it goes round the
// body, over the shoulder and the arm. Nothing of it -- no vertex, no triangle's middle -- is inside
// an upper arm below the shoulder.
for (const id of speciesIds()) for (const silhouette of GARMENTS.shawl.silhouettes) {
  if (silhouette === 'shrug') continue;   // a shrug is sleeves: its back meets them
  const built = build(id), fit = bodyFit(built);
  const meshes = dress(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  built.root.updateMatrixWorld(true);
  const arms = built.joints.upperArm.map(({ node }) => new THREE.Line3(node.getWorldPosition(new THREE.Vector3()), node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0))));
  const q = new THREE.Vector3();
  const inArm = (v) => arms.some((l) => l.closestPointToPoint(v, true, q).distanceTo(v) < fit.arm.r * 0.9 && q.distanceTo(l.start) > fit.arm.r);
  let inside = 0;
  for (const m of meshes.filter((mm) => mm.parent === built.joints.chest)) {
    const p = m.geometry.attributes.position, idx = m.geometry.index.array, w = (i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < p.count; i++) if (inArm(w(i))) inside++;
    for (let t = 0; t < idx.length; t += 3) if (inArm(w(idx[t]).add(w(idx[t + 1])).add(w(idx[t + 2])).divideScalar(3))) inside++;
  }
  assert.equal(inside, 0, `${id}: ${inside} points of a draped ${silhouette} are inside an arm -- the arm comes through it, as through a vest`);
}

// --- an open shawl's top edge rolls over the collarbone, not round a square corner -----------------
//
// Its long straight edge went round the neck as a level ring and the front was cut straight down
// from it: a right angle at each collarbone. The edge goes round the nape and on down the front, so
// at the opening the fabric starts well below the top of the ring.
for (const id of speciesIds()) for (const silhouette of GARMENTS.shawl.silhouettes) {
  if (silhouette === 'shrug' || silhouette === 'capelet') continue;   // open to the shoulders; closed round the neck
  const built = build(id), fit = bodyFit(built);
  const [{ geo }] = outfitPieces(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  const p = geo.attributes.position, ys = [], front = [];
  for (let i = 0; i < p.count; i++) (Math.atan2(Math.abs(p.getX(i)), p.getZ(i)) < 0.5 ? front : ys).push(p.getY(i));
  const sag = Math.max(...ys) - Math.max(...front);
  assert.ok(sag > fit.torso[1] * 0.05, `${id}: a draped ${silhouette}'s front edges start only ${sag.toFixed(3)} below its neck -- a square corner at the collarbone`);
}

// --- a shawl is draped or tied, and takes a pin: across its front edges draped, on a shoulder tied ----
//
// Wrapped or tucked, a shawl read as nothing in particular. A pin is a shawl's alone. Draped, it
// spans the two front edges -- across the middle of the chest; tied (and on a shrug, open to the
// shoulders), it is on one shoulder.
{
  assert.deepEqual([...formsOf('shawl')], ['draped', 'tied'], 'a shawl is worn draped or tied, nothing else');
  assert.ok(accessoriesOf('shawl').includes('pin') && !accessoriesOf('hat').includes('pin'), 'a pin is a shawl\'s accessory, and only a shawl\'s');
  for (const id of speciesIds()) for (const silhouette of GARMENTS.shawl.silhouettes) for (const form of formsOf('shawl')) {
    // the pin's pieces are brass (a capelet without one has buttons, so counting pieces will not do)
    const brass = new THREE.Color('#b8975a'), c = new THREE.Color();
    const pin = outfitPieces(build(id), { shawl: item('shawl', { silhouette, form, edge: 'none', accessory: 'pin' }) })
      .filter(({ geo }) => { c.fromBufferAttribute(geo.attributes.color, 0); return Math.abs(c.r - brass.r) + Math.abs(c.g - brass.g) + Math.abs(c.b - brass.b) < 1e-3; });
    assert.ok(pin.length, `${id}: a ${form} ${silhouette} with a pin has none`);
    const box = pin.reduce((b, { geo }) => b.union(new THREE.Box3().setFromBufferAttribute(geo.attributes.position)), new THREE.Box3());
    const across = form === 'draped' && silhouette !== 'shrug';
    if (across) assert.ok(box.min.x < 0 && box.max.x > 0, `${id}: a draped ${silhouette}'s pin is at x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)} -- not across its front edges`);
    else assert.ok(box.min.x > 0 || box.max.x < 0, `${id}: a ${form} ${silhouette}'s pin is across the chest (x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)}) -- not on a shoulder`);
  }
}

// --- an over-knee sock is one piece over the knee -------------------------------------------------
//
// It was two tubes, the thigh's on its joint and the shin's on its own: an open step at the knee,
// where the thigh is wider, and a hole as the knee bent. One tube on the thigh, its stitches below
// the knee following the shin: only the foot is on the shin, and bent, its rows stretch but hold.
for (const id of speciesIds()) {
  const built = build(id);
  const meshes = dress(built, { socks: item('socks', { silhouette: 'over-knee', edge: 'none', accessory: 'none' }) });
  const thigh = built.joints.upperLeg[0].node, shin = built.joints.lowerLeg[0].node;
  const m = meshes.find((x) => x.parent === thigh);
  assert.ok(m?.isSkinnedMesh && m.skeleton.bones.includes(shin), `${id}: an over-knee sock's leg is not one piece on the thigh following the shin`);
  assert.equal(meshes.filter((x) => x.parent === shin).length, 1, `${id}: an over-knee sock has more than its foot on the shin -- a second tube, and a hole at the knee`);
  shin.rotation.x = 1.2;
  built.root.updateMatrixWorld(true);
  const { position: p, uv } = m.geometry.attributes, w = (i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld);
  let cols = 0;
  while (uv.getY(cols) === 0) cols++;
  let rows = 1;
  while ((rows + 1) * cols <= p.count && uv.getY(rows * cols) > uv.getY((rows - 1) * cols)) rows++;
  const steps = [];
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < cols; c++) steps.push(w(r * cols + c).distanceTo(w((r + 1) * cols + c)));
  steps.sort((a, b) => a - b);
  assert.ok(steps.at(-1) < steps[steps.length >> 1] * 8, `${id}: bent, an over-knee sock's rows part by ${(steps.at(-1) / steps[steps.length >> 1]).toFixed(1)} times the usual at the knee`);
  shin.rotation.x = 0;
}

// --- a sweater has a neckline: a band worked on round its opening -------------------------------------
//
// Its neck was a raw edge; in a knitted or crocheted sweater the neckline is much of how it reads. Every
// sweater but a turtleneck (its collar is its neckline) has a band in the trim colour at the top of its
// body; a cardigan's runs on down both fronts to the hem, a button band.
for (const silhouette of GARMENTS.sweater.silhouettes) {
  if (silhouette === 'turtleneck') continue;
  const built = build('lion');
  const pieces = outfitPieces(built, { sweater: item('sweater', { silhouette, edge: 'none', accessory: 'none', sleeves: 'none', colourwork: 'solid', colorCount: 2, color1: '#ff0000', color2: '#00ff00' }) });
  const body = new THREE.Box3().setFromBufferAttribute(pieces[0].geo.attributes.position);
  const bands = pieces.slice(1).filter(({ geo }) => geo.attributes.color.getY(0) > 0.5).map(({ geo }) => new THREE.Box3().setFromBufferAttribute(geo.attributes.position));
  const band = bands.find((b) => b.max.y > body.max.y - 0.01);
  assert.ok(band, `a ${silhouette} has no neckline band at the top of its body -- its neck is a raw edge`);
  if (silhouette === 'cardigan') assert.ok(band.min.y < body.min.y + 0.02, `a cardigan's neckline band stops at ${band.min.y.toFixed(3)}, above its hem at ${body.min.y.toFixed(3)} -- no button band`);
}

// --- a sleeve is closed at the shoulder ------------------------------------------------------------
//
// Its top was an open ring, and the shoulder joint sits out where the body has narrowed, so the ring
// stood outside the body by up to 1.6 arm radii: a hole down into the sleeve on every sweater but the
// vest. An open edge -- one triangle's alone, matched by place, since the sheet's seam is a copy --
// above the shoulder joint is that hole; the cuff, below it, is open on purpose.
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { sweater: item('sweater', { silhouette: 'pullover', sleeves: 'long', edge: 'none', accessory: 'none' }) });
  const sleeve = built.garments.find((m) => m.parent === built.joints.upperArm[0].node);
  const pos = sleeve.geometry.attributes.position, index = sleeve.geometry.index, uses = new Map();
  const at = (i) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
  for (let t = 0; t < index.count; t++) {
    const a = index.getX(t), b = index.getX(t - (t % 3) + ((t + 1) % 3)), edge = [at(a), at(b)].sort().join('|');
    if (at(a) !== at(b)) uses.set(edge, { n: (uses.get(edge)?.n ?? 0) + 1, y: Math.max(pos.getY(a), pos.getY(b)) });
  }
  const open = [...uses.values()].filter(({ n, y }) => n === 1 && y > 0).length;
  assert.equal(open, 0, `${id}: a sleeve has ${open} open edges above the shoulder joint -- a hole at the shoulder`);
}

// --- a pattern's random colours are the shop's yarn, not an Easter parade -----------------------
//
// They came from one HSL band, at least a third saturated and never dark: every pattern pastel-ish.
// Undyed and heathered yarns are low in chroma, and the shop runs from muted mid tones up to pastel
// (inventory/yarn-look.js FULL: the floor was charcoal until the yarn read as sitting in a basement).
{
  const hsl = Array.from({ length: 300 }, () => new THREE.Color(randomItem('scarf').color1).getHSL({}, THREE.SRGBColorSpace));
  assert.ok(Math.min(...hsl.map((h) => h.s)) < 0.2, 'no random pattern is in a natural, undyed or heathered colour');
  assert.ok(Math.min(...hsl.map((h) => h.l)) < 0.5, 'no random pattern is in a muted mid tone');
  assert.ok(Math.max(...hsl.map((h) => h.l)) > 0.8, 'no random pattern is in a pastel');
  // The mix, by family: mostly bold and muted, pastels a minority (yarn-look.js YARN_FAMILIES).
  // OKLCH-ish proxy from HSL: bold is saturated and mid, pastel is light.
  const bold = hsl.filter((h) => h.s > 0.45 && h.l < 0.7).length / hsl.length;
  const pastel = hsl.filter((h) => h.l > 0.78).length / hsl.length;
  assert.ok(bold > 0.3, `only ${(bold * 100).toFixed(0)}% of random patterns are bold -- the shop reads as Easter`);
  assert.ok(pastel < 0.35, `${(pastel * 100).toFixed(0)}% of random patterns are pastel -- the shop reads as Easter`);
}

// --- an open shawl's long edge has no corner at the collarbone --------------------------------
//
// Its top edge round the neck and its cut down the front are one edge. Turned down by the roll
// alone, it met the cut at two kinks of ~50 degrees each, on the collarbones.
for (const id of speciesIds()) for (const silhouette of ['triangle', 'half circle', 'crescent', 'rectangular wrap']) {
  const built = build(id);
  dress(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  const g = built.garments[0].geometry, pos = g.attributes.position, { uv } = g.attributes, idx = g.index.array;
  // weld the closed seam, then the open boundary is the edges one triangle uses
  const ids = new Map(), rep = [];
  const w = Array.from({ length: pos.count }, (_, i) => {
    const k = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => Math.round(x * 1e4)).join();
    if (!ids.has(k)) { ids.set(k, rep.length); rep.push(i); }
    return ids.get(k);
  });
  const count = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = w[idx[t + k]], b = w[idx[t + (k + 1) % 3]], e = a < b ? `${a} ${b}` : `${b} ${a}`;
    if (a !== b) count.set(e, (count.get(e) ?? 0) + 1);
  }
  const adj = new Map();
  for (const [e, n] of count) if (n === 1) for (const [a, b] of [e.split(' ').map(Number), e.split(' ').map(Number).reverse()]) adj.set(a, [...(adj.get(a) ?? []), b]);
  const at = (i) => new THREE.Vector3().fromBufferAttribute(pos, rep[i]);
  let worst = 0;
  for (const [b, [a, c]] of adj) {
    if (uv.getY(rep[b]) > 0.5) continue;   // the hem has its points; only the long edge is judged
    worst = Math.max(worst, THREE.MathUtils.radToDeg(at(b).sub(at(a)).angleTo(at(c).sub(at(b)))));
  }
  assert.ok(worst < 35, `${id}: a ${silhouette} shawl's long edge turns ${worst.toFixed(0)} degrees at one stitch -- a corner`);
  // A stole's front: each end's two square bottom corners, and no other corner short of the arms.
  // Stepped from its long ends straight to its side hem, it turned a right angle there as well.
  if (silhouette === 'rectangular wrap') {
    built.root.updateMatrixWorld(true);
    const fit = bodyFit(built), toWorld = built.garments[0].matrixWorld;
    const arms = built.joints.upperArm.map(({ node }) => new THREE.Line3(node.getWorldPosition(new THREE.Vector3()), node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0))));
    let corners = 0;
    for (const [b, [a, c]] of adj) {
      const p = at(b), world = p.clone().applyMatrix4(toWorld);
      if (p.z < 0.02 || arms.some((arm) => arm.closestPointToPoint(world, true, new THREE.Vector3()).distanceTo(world) < fit.arm.r * 3)) continue;
      if (THREE.MathUtils.radToDeg(p.clone().sub(at(a)).angleTo(at(c).sub(p))) > 45) corners++;
    }
    assert.ok(corners <= 4, `${id}: a rectangular wrap's front has ${corners} corners, more than its ends' four`);
    // A stole is a band: round the back it is far shorter than its ends. Hung to the owl's long
    // wings, its back came down as far as its ends -- a blanket.
    let backHem = Infinity, endHem = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(uv.getX(i) - 0.5) < 0.05) backHem = Math.min(backHem, pos.getY(i));
      endHem = Math.min(endHem, pos.getY(i));
    }
    const top = new THREE.Box3().setFromBufferAttribute(pos).max.y;
    assert.ok(top - backHem < (top - endHem) * 0.75, `${id}: a rectangular wrap's back hangs ${((top - backHem) / (top - endHem)).toFixed(2)} as far as its ends -- a blanket`);
  }
}

// --- a shawl drapes over the arms, not round them like a sleeve ----------------------------------
//
// Its side hem ended on the lion's splayed arm and hugged it front, top and back -- a cuff; hung on
// past it, the side went back in under the arm. Now the hem hangs clear of the arm, and nothing is
// in the hollow under it.
for (const id of speciesIds()) for (const silhouette of ['triangle', 'half circle', 'crescent', 'rectangular wrap']) {
  const built = build(id);
  dress(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  built.root.updateMatrixWorld(true);
  const fit = bodyFit(built), m = built.garments[0], pos = m.geometry.attributes.position, { uv } = m.geometry.attributes;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), flatP = new THREE.Vector3(), flatQ = new THREE.Vector3();
  for (const { node } of built.joints.upperArm) {
    const arm = new THREE.Line3(node.getWorldPosition(new THREE.Vector3()), node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0)));
    const flat = new THREE.Line3(arm.start.clone().setY(0), arm.end.clone().setY(0));
    let cuff = 0, hollow = 0;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const t = arm.closestPointToPointParameter(p, false);
      if (uv.getY(i) > 0.99 && t > 0.1 && t < 1.1 && arm.at(t, q).distanceTo(p) < fit.arm.r * 3) cuff++;
      const s = flat.closestPointToPointParameter(flatP.set(p.x, 0, p.z), true);
      if (s > 0.05 && flat.at(s, flatQ).distanceTo(flatP) < fit.arm.r && p.y < arm.at(s, q).y - fit.arm.r) hollow++;
    }
    // Only a splayed arm can be cuffed: a hem across a wing hanging straight down (the owl's) is
    // cloth over an arm, as a stole's band crosses it.
    const splayed = arm.delta(new THREE.Vector3()).normalize().y > -Math.cos(THREE.MathUtils.degToRad(20));
    if (splayed && silhouette !== 'crescent') assert.equal(cuff, 0, `${id}: a ${silhouette} shawl's hem hugs the upper arm at ${cuff} points -- a cuff, a sleeve`);
    assert.equal(hollow, 0, `${id}: a ${silhouette} shawl has ${hollow} points in the hollow under the arm -- round it, not over it`);
  }
}

// --- an over-knee sock bends with the knee ------------------------------------------------------
//
// Its weights were the wrong way up (a smoothstep given its edges high then low): the half below
// the knee followed the thigh and the half above it the shin. Straight, nothing showed; in the
// attitude both tubes turned half a turn about the knee, its rings 3 thigh radii off the leg.
for (const id of speciesIds()) {
  const built = build(id);
  dress(built, { socks: item('socks', { silhouette: 'over-knee', accessory: 'none', edge: 'none' }) });
  applyPose(built, { ...POSES.rest, ...DANCE_POSES['att-hold'] });
  built.root.updateMatrixWorld(true);
  const fit = bodyFit(built);
  built.joints.upperLeg.forEach(({ node: thigh }, k) => {
    const shin = built.joints.lowerLeg[k].node, m = built.garments.find((g) => g.parent === thigh && g.isSkinnedMesh);
    m.skeleton.update();
    const knee = shin.getWorldPosition(new THREE.Vector3());
    const leg = [new THREE.Line3(thigh.getWorldPosition(new THREE.Vector3()), knee), new THREE.Line3(knee, shin.localToWorld(new THREE.Vector3(0, -fit.leg.tibia, 0)))];
    const rings = new Map(), { uv } = m.geometry.attributes;
    for (let i = 0; i < uv.count; i++) {
      const v = Math.round(uv.getY(i) * 40);
      rings.set(v, [...(rings.get(v) ?? []), m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld)]);
    }
    let off = 0;
    for (const ring of rings.values()) {
      const c = ring.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(ring.length);
      off = Math.max(off, Math.min(...leg.map((b) => b.closestPointToPoint(c, true, new THREE.Vector3()).distanceTo(c))) / fit.leg.thighR);
    }
    assert.ok(off < 0.5, `${id}: in the attitude an over-knee sock's ring is ${off.toFixed(2)} thigh radii off leg ${k}`);
  });
}

// --- an arm lifts a shawl, it never goes up through it ---------------------------------------------
//
// Hung on the chest, shaped round the arms as they stand, a swinging arm went through it (the
// lion's: 6-14 points inside the arm), and one raised in the attitude more (the owl's wing, 154).
// Its side panels now lift with the arms, as a cape held out (garments.js flapSkin); pushed off the
// arm instead, it stacked round it like a sleeve. A sweater's body is still pushed: `armPushed`
// mirrors the shader's offArm (garments.js addArmPush) on a skinned vertex, in the mesh's frame.
const offArm = (p, a, b, r) => {
  const ab = b.clone().sub(a), t = p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-8), q = a.clone().addScaledVector(ab, Math.min(t, 1));
  const l = p.distanceTo(q);
  return t >= 0 && l < r && l > 1e-6 ? q.addScaledVector(p.clone().sub(q), r / l) : p;
};
const armPushed = (m, i, p) => {
  const g = m.geometry.attributes;
  if (!(g.aArmR?.getX(i) > 0)) return p;
  for (const s of [0, 1]) {
    const toNow = m.bindMatrixInverse.clone().multiply(m.skeleton.bones[3 + s].matrixWorld).multiply(m.skeleton.boneInverses[3 + s]);
    const end = (name) => new THREE.Vector3().fromBufferAttribute(g[name], i).applyMatrix4(toNow);
    p = offArm(p, end(`aArmA${s}`), end(`aArmB${s}`), g.aArmR.getX(i));
  }
  return p;
};
/**
 * Points of `m` inside either upper arm, past its root, as the character stands now: their indices.
 * `above`: only those in the arm's upper half -- a drape hangs below an arm, hidden in it.
 */
const insideArms = (built, m, { above = false } = {}) => {
  const fit = bodyFit(built), q = new THREE.Vector3(), inside = new Set();
  built.root.updateMatrixWorld(true);
  m.skeleton.update();
  const arms = built.joints.upperArm.map(({ node }) => new THREE.Line3(node.getWorldPosition(new THREE.Vector3()), node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0))));
  for (let i = 0; i < m.geometry.attributes.position.count; i++) {
    const p = armPushed(m, i, m.getVertexPosition(i, new THREE.Vector3())).applyMatrix4(m.matrixWorld);
    if (arms.some((arm) => arm.closestPointToPointParameter(p, true) > 0.15 && arm.closestPointToPoint(p, true, q).distanceTo(p) < fit.arm.r * 0.9
      && (!above || p.y >= q.y))) inside.add(i);
  }
  return inside;
};
{
  // the shader really gets the push: a replace that matched nothing would leave it out silently
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  garmentMaterial().onBeforeCompile(shader, null);
  for (const piece of ['attribute float aArmR;', 'vec3 offArm(', 'getBoneMatrix(3.0)', 'transformed = offArm(transformed']) {
    assert.ok(shader.vertexShader.includes(piece), `the garment vertex shader is missing "${piece}"`);
  }
  assert.ok(shader.vertexShader.indexOf('vec3 offArm(') < shader.vertexShader.indexOf('transformed = offArm('), 'offArm is used before it is declared');
}
for (const id of speciesIds()) for (const silhouette of ['triangle', 'rectangular wrap']) {
  const built = build(id);
  dress(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  const m = built.garments.find((g) => g.parent === built.joints.chest);
  for (const swing of [{ armSwing: 0.5 }, { armSwing: -0.5 }, { armOut: 0.4 }, DANCE_POSES['att-hold']]) {
    applyPose(built, { ...POSES.rest, ...swing });
    const inside = insideArms(built, m, { above: true }).size;
    assert.equal(inside, 0, `${id}: a ${silhouette} shawl has ${inside} points inside the top of an arm at ${JSON.stringify(swing)}`);
  }
}
// ...and is the same shawl whenever it is put on: the dress-up page redresses mid-dance, and one
// cut round the arms where they swung came out with other points (the owl's: 5303 for 5081) or
// off by up to 0.3m (the lion's), and stayed so. The pose it was dressed in is left as it was.
for (const id of speciesIds()) {
  const built = build(id), shawl = { shawl: item('shawl', { silhouette: 'triangle', form: 'draped', edge: 'picot', accessory: 'none' }) };
  const worn = () => {
    applyPose(built, POSES.rest);
    built.root.updateMatrixWorld(true);
    const m = built.garments.find((g) => g.parent === built.joints.chest);
    m.skeleton.update();
    return Array.from({ length: m.geometry.attributes.position.count }, (_, i) => m.getVertexPosition(i, new THREE.Vector3()));
  };
  applyPose(built, POSES.rest);
  dress(built, shawl);
  const atRest = worn();
  applyPose(built, { ...POSES.rest, ...DANCE_POSES['att-hold'] });
  const arm = built.joints.upperArm[0].node.quaternion.clone();
  dress(built, shawl);
  assert.ok(built.joints.upperArm[0].node.quaternion.equals(arm), `${id}: dressing put the arm back to rest`);
  const again = worn();
  assert.equal(again.length, atRest.length, `${id}: a shawl dressed mid-dance has ${again.length} points, ${atRest.length} at rest`);
  const off = Math.max(...again.map((p, i) => p.distanceTo(atRest[i])));
  assert.ok(off < 1e-6, `${id}: a shawl dressed mid-dance sits ${(off * 1000).toFixed(0)}mm off one dressed at rest`);
}
// ...and the cloth on top of the shoulder stays resting on it: turned with the arm from inside the
// shoulder joint, it swung down into the body as the arm rose (240-300 points in the attitude).
for (const id of speciesIds()) for (const silhouette of ['triangle', 'rectangular wrap']) {
  const built = build(id);
  dress(built, { shawl: item('shawl', { silhouette, form: 'draped', edge: 'none', accessory: 'none' }) });
  const m = built.garments.find((g) => g.parent === built.joints.chest), [rx, ry, rz] = bodyFit(built).torso;
  const inBody = () => {
    built.root.updateMatrixWorld(true);
    m.skeleton.update();
    return Array.from({ length: m.geometry.attributes.position.count }, (_, i) => {
      const p = m.getVertexPosition(i, new THREE.Vector3());
      return (p.x / rx) ** 2 + (p.y / ry) ** 2 + (p.z / rz) ** 2 < 0.9;
    });
  };
  applyPose(built, POSES.rest);
  const worn = inBody();
  applyPose(built, { ...POSES.rest, ...DANCE_POSES['att-hold'] });
  const sunk = inBody().filter((v, i) => v && !worn[i]).length;
  assert.equal(sunk, 0, `${id}: a ${silhouette} shawl sinks ${sunk} points into the body in the attitude`);
}
// ...and its edging stays on its hem, whatever the edging: skinned to follow the arms on its own
// weights, a triangle's ribbed edge came 20-30mm off its hem with an arm raised (seen from the side,
// a tear); fringe and picot standing off the hem found no weights at all and stayed put while the
// hem rose, stretched out under the arm like gum (up to 290mm).
for (const id of speciesIds()) for (const edge of EDGES.filter((e) => e !== 'none')) {
  const built = build(id), shawl = item('shawl', { silhouette: 'triangle', form: 'draped', edge, accessory: 'none' });
  const sheetN = outfitPieces(built, { shawl })[0].geo.attributes.position.count;
  dress(built, { shawl });
  const m = built.garments.find((g) => g.parent === built.joints.chest), n = m.geometry.attributes.position.count;
  // the hem: the sheet's last row, in order round -- measured to as a line, not to its vertices,
  // which a raised arm draws apart where the hem stretches over it
  const { uv } = m.geometry.attributes, hem = [];
  for (let j = 0; j < sheetN; j++) if (uv.getY(j) === 1) hem.push(j);
  hem.sort((a, b) => uv.getX(a) - uv.getX(b));
  const seg = new THREE.Line3(), q = new THREE.Vector3();
  const gaps = () => {
    built.root.updateMatrixWorld(true);
    m.skeleton.update();
    const P = (i) => armPushed(m, i, m.getVertexPosition(i, new THREE.Vector3()));
    const line = hem.map(P), out = [];
    for (let i = sheetN; i < n; i += 9) {
      const p = P(i);
      out.push(Math.min(...line.slice(1).map((b, k) => seg.set(line[k], b).closestPointToPoint(p, true, q).distanceTo(p))));
    }
    return out;
  };
  applyPose(built, POSES.rest);
  const worn = gaps();
  applyPose(built, { ...POSES.rest, ...DANCE_POSES['att-hold'] });
  const off = Math.max(...gaps().map((g, k) => g - worn[k]));
  assert.ok(off < 0.012, `${id}: a shawl's ${edge} edge comes ${(off * 1000).toFixed(0)}mm off its hem with an arm raised`);
}
// A sweater's body stays on the chest, and an arm raised overhead went through it (the owl's wing
// in the attitude: up to 91 points). Under its sleeve at the armhole it is inside the arm as worn,
// and stays so; nothing else may be.
for (const id of speciesIds()) for (const silhouette of GARMENTS.sweater.silhouettes) {
  const built = build(id);
  dress(built, { sweater: item('sweater', { silhouette, accessory: 'none' }) });
  const m = built.garments.find((g) => g.parent === built.joints.chest);
  applyPose(built, POSES.rest);
  const worn = insideArms(built, m);
  for (const swing of [{ armSwing: 0.5 }, { armSwing: -0.5 }, DANCE_POSES['att-hold']]) {
    applyPose(built, { ...POSES.rest, ...swing });
    const into = [...insideArms(built, m)].filter((i) => !worn.has(i)).length;
    assert.equal(into, 0, `${id}: an arm goes ${into} points into a ${silhouette}'s body at ${JSON.stringify(swing)}`);
  }
}

// A shop WIP becomes the garment it was made as: the design's silhouette (the OwlyCowly is a scarf
// worn as a cowl), its yarn its colours, decor nothing.
{
  const wip = (patternType, colours, silhouette) => ({
    pattern: { patternType, silhouette, craft: 'knitting', weight: 'dk', materials: ['alpaca'], toolSize: 4 },
    yarn: colours.map((c) => ({ c })),
  });
  const cowl = wornAs(wip('scarf', ['#112233', '#112233'], 'cowl'), (y) => y.c);
  assert.equal(cowl.type, 'scarf');
  assert.equal(cowl.item.silhouette, 'cowl');
  assert.equal(cowl.item.craft, 'knit');
  assert.equal(cowl.item.colourwork, 'solid', 'two balls of one colour are still one colour');
  assert.equal(cowl.item.color1, '#112233');
  assert.equal(cowl.item.fibre, 'alpaca');
  const shawl = wornAs(wip('shawl', ['#aa0000', '#00aa00']), (y) => y.c);
  assert.equal(shawl.item.colourwork, 'stripes');
  assert.equal(shawl.item.colorCount, 2);
  assert.equal(wornAs(wip('potholder', ['#000000']), (y) => y.c), null);
  assert.equal(wornAs(wip('hat', ['#000000'], 'beret'), (y) => y.c).item.silhouette, 'beret');
  assert.equal(wornAs(wip('hat', ['#000000']), (y) => y.c).item.silhouette, 'beanie', 'a one-off pattern makes the first');
  assert.equal(wornAs(wip('toString', ['#000000']), (y) => y.c), null, 'only GARMENTS\' own types');
  // it dresses: the sim's numbers are numbers garments.js can build from
  const built = build('owl');
  dress(built, { [shawl.type]: shawl.item });
  assert.ok(built.garments.length > 0, 'a shop shawl puts something on');
}

// The shop and the generator share one vocabulary: catalog.js's pattern types are GARMENTS' types,
// each named design makes one of garments.js's silhouettes and every silhouette has named designs,
// and wip.js wears each in GARMENTS' slot. catalog.js and wip.js are pure and cannot import this.
{
  const sorted = (list) => [...list].sort();
  const decor = (type) => PATTERN_TYPES[type].decor === true;
  assert.deepEqual(sorted(Object.keys(PATTERN_TYPES).filter((t) => !decor(t))), sorted(Object.keys(GARMENTS)), 'a pattern type per garment');
  for (const [type, g] of Object.entries(GARMENTS)) {
    assert.deepEqual(sorted(Object.keys(PATTERN_TITLES[type])), sorted(g.silhouettes), `${type}: named designs for every silhouette`);
    assert.equal(WEAR_SLOT_FOR[type], g.slot, `${type} is worn in its garment slot`);
  }
  assert.deepEqual(sorted(WEAR_SLOTS), sorted(Object.values(GARMENTS).map((g) => g.slot)), 'the same slots');
  for (const d of PATTERN_DESIGNS) {
    const worn = wornAs({ pattern: d, yarn: [{ c: '#123456' }] }, (y) => y.c);
    if (decor(d.patternType)) { assert.equal(worn, null, `"${d.title}" is decor: not worn`); continue; }
    assert.ok(worn.type === d.patternType && worn.item.silhouette === d.silhouette, `"${d.title}" is worn as a ${d.silhouette}`);
  }
}

// The Guestbook selfie: the lens is up, out on the raised arm's side, tilted, and close enough that
// the face fills the top of the frame while what they made is still in the picture.
//
// An AUTHORED shot (selfie.js SHOTS) was framed by eye: it may show part of the phone hand (never all of it: the phone would show) or crop the crown,
// and its lens and zoom are its own. It still keeps what they made and the eyes visible, the pupils
// on the lens. One taken from behind (`behind`) has no phone: both arms out, the horizon level. The
// framing rules below hold for the searched shots only.
{
  const cam = new THREE.PerspectiveCamera(30, 240 / 300, 0.01, 50);
  const onScreen = (v) => { const p = v.clone().project(cam); return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1 ? p : null; };
  for (const id of speciesIds()) for (const type of ['hat', 'scarf', 'shawl', 'sweater']) {
    const built = build(id);
    dress(built, { [type]: item(type) });
    takeSelfie(built, cam, type);
    const shot = shotFor(type, id);
    const head = built.joints.head.getWorldPosition(new THREE.Vector3());
    const top = onScreen(head.clone().add(new THREE.Vector3(0, built.params.headRadius, 0)));
    const holdingArm = built.holds[0].getWorldPosition(new THREE.Vector3());
    if (!shot) {
      assert.ok(top && top.y < 0.9, `${id} ${type}: the top of the head is in the selfie, with room above it`);
      assert.ok(onScreen(head).y > -0.1, `${id} ${type}: the face is not low in the frame`);
      const box = new THREE.Box3();
      built.garments.forEach((g) => box.expandByObject(g));
      const upperQuarter = box.getCenter(new THREE.Vector3()).setY(box.max.y - (box.max.y - box.min.y) * 0.25);
      assert.ok(onScreen(upperQuarter), `${id} ${type}: what they made is in the picture, cropped no higher than its top quarter`);
      // The face fills the picture: half its width across a head, whatever the neck below it.
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(built.params.headRadius);
      const face = (head.clone().add(right).project(cam).x - head.clone().sub(right).project(cam).x) / 2;
      assert.ok(face > 0.4, `${id} ${type}: the face spans ${face.toFixed(2)} of the frame, under 0.4`);
      assert.ok(cam.position.y > head.y && cam.position.x < head.x && cam.position.z > head.z,
        `${id} ${type}: the lens is above, in front, and out on the raised arm's side`);
      assert.equal(onScreen(holdingArm), null, `${id} ${type}: the hand holding the phone is out of the picture`);
    }
    // every shot with a phone, authored too: the hand may be in it, cut by the edge, never whole
    if (!shot?.behind) assert.ok(gradeSelfie(built, cam, type).handOut, `${id} ${type}: the phone hand is wholly in the picture`);
    const hangingArm = built.holds[1].getWorldPosition(new THREE.Vector3());
    const roll = Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).y);
    if (shot?.behind) {
      assert.ok(Math.abs(holdingArm.y - hangingArm.y) < 0.05 && holdingArm.distanceTo(hangingArm) > 0.5,
        `${id} ${type}: both arms are out to the sides, spreading it`);
      assert.ok(roll < 0.01, `${id} ${type}: a photo from behind is taken level`);
    } else {
      assert.ok(holdingArm.y > hangingArm.y + 0.1, `${id}: one arm is up holding the phone, the other hangs`);
      assert.ok(roll > 0.1, 'the horizon is off level');
    }
    // Nothing of theirs is in the way: a llama's snout up close used to hide its hat and its eyes.
    // ...and what they made shows, whatever it is: the shot that showed a llama's hat hid its cowl
    // (0%), and the one before that hid the hat. A hat's back half faces away from any lens.
    const made = built.garments.filter((g) => g.userData.worn.includes(type));
    const madeSeen = seenShare(built, cam, made, 120);
    assert.ok(madeSeen > 0.15, `${id}: ${(madeSeen * 100).toFixed(0)}% of the ${type} can be seen in its selfie`);
    const eyes = built.joints.eye.flatMap(({ node }) => node.children.filter((c) => c.isMesh));
    // An authored shot may be a three-quarter view, where a llama's far eye is round the side of its
    // head: most of one eye (25%) is its floor. A searched one shows both.
    const eyesSeen = seenShare(built, cam, eyes, 120);
    assert.ok(eyesSeen > (shotFor(type, id) ? 0.25 : 0.3), `${id} ${type}: ${(eyesSeen * 100).toFixed(0)}% of the eyes can be seen in the selfie`);
    // and they look into it: the pupil sits toward the lens, not wherever the head points -- every
    // eye the picture shows. One round the side of the head (a three-quarter shot) cannot turn that far.
    // Not from behind: a head that stops short of straight back glances over the shoulder rather than
    // into the lens -- a lion's turns 74 degrees, and its profile was judged fine.
    for (const { node } of shot?.behind ? [] : built.joints.eye) {
      if (seenShare(built, cam, node.children.filter((m) => m.isMesh), 60) < 0.2) continue;
      const c = node.getWorldPosition(new THREE.Vector3());
      const off = node.children[1].getWorldPosition(new THREE.Vector3()).sub(c).angleTo(cam.position.clone().sub(c));
      assert.ok(off < 0.25, `${id} ${type}: a pupil looks ${THREE.MathUtils.radToDeg(off).toFixed(0)} degrees away from the lens`);
    }
  }
}

// In hand: decor is never worn, so its selfie shows it held up in the free paw -- the tutorial's pot
// holder was missing from its own photo because wornAs drops decor. The armful is the Former Owner's;
// a bag is held up in its own selfie (selfie-studio.js), since worn at the hip no lens finds it.
{
  const cam = new THREE.PerspectiveCamera(30, 240 / 300, 0.01, 50);
  const potholder = PATTERN_DESIGNS.find((d) => d.patternType === 'potholder');
  const hat = PATTERN_DESIGNS.find((d) => d.patternType === 'hat');
  const held = {
    potholder: heldAs({ pattern: potholder, yarn: [{ c: '#c0504d' }] }, (y) => y.c),
    pile: pileAs([potholder, hat, hat].map((pattern, i) => ({ pattern, yarn: [{ c: ['#3d5a80', '#e0b04a', '#5b8c5a'][i] }] })), (y) => y.c),
    ...Object.fromEntries(GARMENTS.bag.silhouettes.map((silhouette) => [`bag:${silhouette}`, { item: item('bag', { silhouette, held: true }) }])),
  };
  assert.equal(heldAs({ pattern: hat, yarn: [{ c: '#123456' }] }, (y) => y.c), null, 'a hat is worn, not held');
  for (const id of speciesIds()) for (const [name, { item: it }] of Object.entries(held)) {
    const type = name.split(':')[0], built = build(id);
    dress(built, { [type]: it });
    const mesh = built.garments.find((g) => g.userData.worn.includes(type));
    assert.ok(mesh && mesh.parent === built.holds[1], `${id} ${name}: built on the free paw`);
    assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite), `${id} ${name}: finite geometry`);
    takeSelfie(built, cam, type);
    const seen = seenShare(built, cam, [mesh], 120);
    assert.ok(seen > 0.3, `${id}: ${(seen * 100).toFixed(0)}% of the ${name} can be seen in its selfie`);
    assert.ok(gradeSelfie(built, cam, type).handOut, `${id} ${name}: the phone hand is wholly in the picture`);
    if (type !== 'potholder') continue;
    // flat as a tray in the shot: stood up, it cut through the paw
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    assert.ok(size.y < 0.3 * Math.max(size.x, size.z), `${id}: the pot holder lies flat, ${size.y.toFixed(3)} tall across ${Math.max(size.x, size.z).toFixed(3)}`);
  }
}

console.log('garments.js self-check: all assertions passed');
