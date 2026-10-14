import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  POSES, POSE_KEYS, MOTION_DEFAULTS, BASE_PARAMS, createCharacter, stepMotion, applyPose,
  valueOf, walkPhase, walkLayer, speciesIds, getSpecies, resetMotion,
  DANCES, DANCE_NAMES, makeDance, stepDance, LIMB_TAPER,
  motionOf, walkGain, tailBaseHeight, seatedHipsAlong, lowestResting, GEO,
} from './npc.js';
import { CHAIR_BACK_Z, CHAIR_W } from './store/core/config.js';
import './owl.js';
import './llama.js';
import { MANE_PRESETS, lightness as maneLightness, maneBases, maneCrownGap, snoutGap } from './lion.js';

const build = (id) => createCharacter(
  { ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false }, id);

function tipOf(built, node) {
  built.root.updateMatrixWorld(true);
  const origin = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
  let best = origin, far = -1;
  node.traverse((c) => {
    const p = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    const d = p.distanceTo(origin);
    if (d > far) { far = d; best = p; }
  });
  return best;
}
const limb = (built, part, side) => built.joints[part].find((j) => j.side === side).node;
const pose = (built, extra) => applyPose(built, { ...POSES.rest, ...extra });

{
  for (const id of speciesIds()) {
    const built = build(id);
    const o = { ...MOTION_DEFAULTS };
    const out = stepMotion(built, POSES.rest, 1 / 60, o);
    assert.ok(out, `${id}: stepMotion must return its composed pose`);
    for (const k of ['kneeSwing', 'neckCurve']) {
      assert.ok(k in out, `${id}: stepMotion's scratch must carry ${k} -- compose() writes it, `
        + 'and a sealed object without it throws on the first frame');
      assert.ok(Number.isFinite(out[k]), `${id}: ${k} must be a number`);
    }
    for (const k of POSE_KEYS) {
      assert.ok(Number.isFinite(out[k]), `${id}: ${k} went non-finite -- NaN on a joint reaches `
        + 'the bounding sphere and culls the whole character');
    }
  }
}

{
  const built = build(speciesIds()[0]);
  const o = { ...MOTION_DEFAULTS };
  const P = built.params;
  const L = P.legHeight + P.hipInset;
  let dist = 0;
  for (let i = 0; i < 600; i++) {
    dist += 0.5 / 60;
    const w = walkPhase(dist, 0.5, L, o);
    stepMotion(built, POSES.rest, 1 / 60, o, (out) => walkLayer(out, w, 1, o));
    assert.ok(Number.isFinite(built.root.position.y),
      `frame ${i}: grounding produced a non-finite root height`);
  }
  assert.ok(Math.abs(built.root.position.y) < 0.5,
    `a walking character must stay near the floor (root y ${built.root.position.y})`);
}

{
  for (const id of speciesIds()) {
    const built = build(id);
    for (const k of POSE_KEYS) {
      assert.equal(valueOf(built.motion, k), POSES.rest[k],
        `${id}: motion must spawn already AT POSES.rest on ${k} -- seeding it from params `
        + 'instead starts the character in a pose nothing ever asked for');
    }
  }
}

{
  const built = build(speciesIds()[0]);
  applyPose(built, POSES.rest);
  const floor = built.root.position.y;

  built.groundOffset = 0.16;
  applyPose(built, POSES.rest);
  const lifted = built.root.position.y;
  assert.ok(Math.abs(lifted - floor - 0.16) < 1e-9,
    `groundOffset must raise the character by exactly itself (floor ${floor.toFixed(4)}, `
    + `lifted ${lifted.toFixed(4)}) -- this is what the seat lift writes instead of touching y`);

  applyPose(built, POSES.sit);
  const seated = built.root.position.y;
  built.groundOffset = 0;
  applyPose(built, POSES.sit);
  assert.ok(Math.abs(seated - built.root.position.y - 0.16) < 1e-9,
    'and the same offset on the seated pose, whose legs ground differently');

  built.groundOffset = 0;
  applyPose(built, POSES.rest);
  assert.ok(Math.abs(built.root.position.y - floor) < 1e-9,
    'clearing groundOffset must put them back on the floor');
}

{
  const built = build(speciesIds()[0]);
  const o = { ...MOTION_DEFAULTS, idleAmount: 0 };

  applyPose(built, POSES.browse);
  const staticY = built.root.position.y;

  resetMotion(built.motion, POSES.browse);
  stepMotion(built, POSES.browse, 1 / 60, o);
  for (const k of POSE_KEYS) {
    assert.equal(valueOf(built.motion, k), POSES.browse[k],
      `${k} moved on the handover frame -- seeding the engine from the pose the rig is already `
      + 'in must leave it nothing to do, or toggling the checker into play lurches');
  }

  for (let i = 0; i < 120; i++) stepMotion(built, POSES.browse, 1 / 60, o);
  for (const k of POSE_KEYS) {
    assert.ok(Math.abs(valueOf(built.motion, k) - POSES.browse[k]) < 1e-6,
      `${k} drifted off its target under the engine -- with idle off the layer must contribute `
      + 'exactly nothing, so a standing character is bit-identical to the base pose');
  }
  assert.ok(Math.abs(built.root.position.y - staticY) < 1e-9,
    'and grounding must put them at the height the static page did');

  applyPose(built, POSES.browse);
  assert.ok(Math.abs(built.root.position.y - staticY) < 1e-9,
    'taking the rig back from the engine must leave it where the static path puts it');
}

{
  const built = build(speciesIds()[0]);
  const off = { ...MOTION_DEFAULTS, idleAmount: 0 };

  resetMotion(built.motion, POSES.browse);
  for (let i = 0; i < 120; i++) stepMotion(built, POSES.browse, 1 / 60, off);

  const bare = stepMotion(built, POSES.browse, 1 / 60, off);
  for (const k of POSE_KEYS) {
    assert.equal(bare[k], POSES.browse[k],
      `${k}: with every layer off the composed output must equal the pose exactly -- the lab `
      + 'shows this as "pose alone", and it has to match what the static rig draws');
  }
  for (const k of ['blink', 'kneeSwing', 'neckCurve']) {
    assert.equal(bare[k], 0, `${k} must be 0 with no layer running`);
  }

  const on = { ...MOTION_DEFAULTS };
  let moved = 0;
  for (let i = 0; i < 120; i++) {
    const out = stepMotion(built, POSES.browse, 1 / 60, on);
    if (POSE_KEYS.some((k) => Math.abs(out[k] - POSES.browse[k]) > 1e-4)) moved++;
  }
  assert.ok(moved > 60,
    `the idle layer moved the pose on only ${moved} of 120 frames -- with idleAmount 1 a standing `
    + 'character must visibly breathe, or the "+ idle" switch is toggling nothing');
}

{
  for (const id of speciesIds()) {
    const built = build(id);

    for (const p of [{ armOut: 1.2 }, { armSwing: -1.0 }, { armOut: 2.55, armSwingAlt: 0.9 }]) {
      pose(built, p);
      const l = tipOf(built, limb(built, 'upperArm', 1));
      const r = tipOf(built, limb(built, 'upperArm', -1));
      assert.ok(Math.abs(Math.abs(l.x) - Math.abs(r.x)) < 1e-9,
        `${id}: ${JSON.stringify(p)} must leave the arms laterally mirrored`);
    }

    pose(built, { armOut: 1.2, armOutAlt: 0.9 });
    const l = tipOf(built, limb(built, 'upperArm', 1));
    const r = tipOf(built, limb(built, 'upperArm', -1));
    assert.ok(l.y - r.y > 0.02,
      `${id}: positive armOutAlt must raise the LEFT hand above the right -- got ${(l.y - r.y).toFixed(4)}`);
    assert.ok(Math.abs(l.x) - Math.abs(r.x) > 0.01,
      `${id}: and carry it further out -- the two arms must stop being mirror images`);
  }
}

{
  const built = build(speciesIds()[0]);
  pose(built, {});
  const footBefore = tipOf(built, limb(built, 'upperLeg', 1)).clone();
  const yBefore = built.root.position.y;

  pose(built, { spineTwist: 0.8 });
  built.root.updateMatrixWorld(true);
  const spineYaw = new THREE.Euler().setFromRotationMatrix(built.joints.spine.matrixWorld).y;
  assert.ok(Math.abs(spineYaw - 0.8) < 1e-6,
    `spineTwist must reach the spine's world yaw -- got ${spineYaw.toFixed(4)}`);

  const footAfter = tipOf(built, limb(built, 'upperLeg', 1));
  assert.ok(footAfter.distanceTo(footBefore) < 1e-9, 'a twist at the waist must not move the legs');
  assert.ok(Math.abs(built.root.position.y - yBefore) < 1e-9, 'nor change the grounding height');
}

{
  for (const id of speciesIds()) {
    const built = build(id);
    let planted = null, rootY = null;
    for (const k of [0.6, 0.9, 1.2]) {
      for (const sign of [1, -1]) {
        pose(built, { legSwing: sign * k, hipFlex: -sign * k, kneeBend: 1.2 });
        const l = tipOf(built, limb(built, 'lowerLeg', 1));
        const r = tipOf(built, limb(built, 'lowerLeg', -1));
        const [low, high] = l.y <= r.y ? [l, r] : [r, l];
        assert.ok(high.y - low.y > 0.05,
          `${id}: legSwing ${sign * k} must lift a leg clear -- got ${(high.y - low.y).toFixed(3)}`);
        if (sign !== 1) continue;
        if (planted !== null) {
          assert.ok(Math.abs(low.y - planted) < 2e-3,
            `${id}: the planted foot left the floor at legSwing ${k}`);
          assert.ok(Math.abs(built.root.position.y - rootY) < 1e-3,
            `${id}: the body bobbed at legSwing ${k} -- grounding must follow the STANDING leg`);
        }
        planted = low.y;
        rootY = built.root.position.y;
      }
    }
  }
}

{
  function perform(built, name, seconds = 3) {
    const o = { ...MOTION_DEFAULTS, idleAmount: 0, stiff: DANCES[name].stiff, zeta: DANCES[name].zeta };
    const perf = makeDance(name);
    const seen = {
      footLift: 0, footStride: 0, frozenStride: 0, armGapY: 0, armGapX: 0, armGapZ: 0,
      armPair: 0, shift: 0, counter: 0, swung: 0, groundedBack: 0,
      roll: 0, twist: 0, turn: 0, travel: 0, rise: 0, rootY: { min: Infinity, max: -Infinity },
    };
    let phase = 0;
    const L = built.params.legHeight + built.params.hipInset;
    for (let i = 0; i < seconds * 60; i++) {
      const d = stepDance(perf, 1 / 60);
      const w = walkPhase(phase, d.walk, L, o);
      phase = (phase + (d.walk > 0 ? (d.walk / 60) / w.strideLen : 0)) % 1;
      stepMotion(built, d.pose, 1 / 60, o, d.walk > 0 ? (out) => walkLayer(out, w, 1, o) : null);
      const lFoot = tipOf(built, limb(built, 'lowerLeg', 1));
      const rFoot = tipOf(built, limb(built, 'lowerLeg', -1));
      const lHand = tipOf(built, limb(built, 'upperArm', 1));
      const rHand = tipOf(built, limb(built, 'upperArm', -1));
      seen.footLift = Math.max(seen.footLift, Math.abs(lFoot.y - rFoot.y));
      seen.footStride = Math.max(seen.footStride, Math.abs(lFoot.z - rFoot.z));
      if (d.walk === 0) seen.frozenStride = Math.max(seen.frozenStride, Math.abs(lFoot.z - rFoot.z));
      if (Math.abs(lFoot.y - rFoot.y) < 0.02 && -Math.min(lFoot.z, rFoot.z) > 0.10) {
        seen.groundedBack += 1;
      }
      seen.roll = Math.max(seen.roll, Math.abs(valueOf(built.motion, 'spineRoll')));
      seen.armGapY = Math.max(seen.armGapY, Math.abs(lHand.y - rHand.y));
      seen.armGapX = Math.max(seen.armGapX, Math.abs(Math.abs(lHand.x) - Math.abs(rHand.x)));
      seen.armGapZ = Math.max(seen.armGapZ, Math.abs(lHand.z - rHand.z));
      const pair = (lHand.x + rHand.x) / 2 - d.shift;
      seen.armPair = Math.max(seen.armPair, Math.abs(pair));
      seen.shift = Math.max(seen.shift, Math.abs(d.shift));
      if (Math.abs(d.shift) > 0.02) {
        seen.swung += 1;
        if (Math.sign(d.shift) !== Math.sign(valueOf(built.motion, 'spineRoll'))) seen.counter += 1;
      }
      seen.twist = Math.max(seen.twist, Math.abs(valueOf(built.motion, 'spineTwist')));
      seen.turn = Math.max(seen.turn, Math.abs(d.turn));
      seen.travel = Math.max(seen.travel, Math.abs(d.travel));
      seen.rise = Math.max(seen.rise, Math.abs(d.rise));
      seen.rootY.min = Math.min(seen.rootY.min, built.root.position.y);
      seen.rootY.max = Math.max(seen.rootY.max, built.root.position.y);
    }
    return seen;
  }

  for (const id of speciesIds()) {
    for (const name of DANCE_NAMES) {
      const s = perform(build(id), name);
      const moved = s.footLift + s.footStride + s.armGapY + s.armGapZ + s.twist + s.turn
        + s.travel + (s.rootY.max - s.rootY.min);
      assert.ok(moved > 0.05, `${id}/${name}: the dance barely moves the rig (${moved.toFixed(3)})`);
    }

    const rd = perform(build(id), 'riverdance');
    assert.ok(rd.footLift > 0.08,
      `${id}: a riverdance is all in the feet -- got ${rd.footLift.toFixed(3)} of lift`);
    assert.ok(rd.twist < 1e-6 && rd.armGapY < 1e-6,
      `${id}: ...with a stiff upper body -- twist ${rd.twist.toFixed(3)}, arms ${rd.armGapY.toFixed(3)}`);
    assert.ok(rd.rise > 0.03,
      `${id}: a riverdance has to leave the floor -- peak rise ${rd.rise.toFixed(3)}`);
    assert.ok(rd.footStride > 0.20,
      `${id}: ...and at least one real kick -- furthest reach ${rd.footStride.toFixed(3)}`);
    assert.ok(rd.groundedBack > 15,
      `${id}: ...and a step-behind that HOLDS -- only ${rd.groundedBack} frames of 180 had a foot `
      + 'reaching back with both feet on the floor');

    const floss = perform(build(id), 'floss');
    assert.ok(floss.twist > 0.2,
      `${id}: a floss is shoulders against hips -- got ${floss.twist.toFixed(3)} of twist`);
    assert.ok(floss.armPair > 0.10,
      `${id}: ...arms travelling as a PAIR to one side -- centroid only ${floss.armPair.toFixed(3)} off centre`);
    assert.ok(floss.armGapZ > 0.10,
      `${id}: ...with one of them in front of the body and one behind (${floss.armGapZ.toFixed(3)})`);
    assert.ok(floss.shift > 0.02,
      `${id}: ...and the HIPS actually moving -- got ${floss.shift.toFixed(3)}`);
    assert.ok(floss.counter > floss.swung * 0.9,
      `${id}: ...opposite each other -- hips countered the lean on only ${floss.counter}/${floss.swung} frames`);

    const att = perform(build(id), 'attitude');
    assert.ok(att.footLift > 0.08, `${id}: an attitude lifts the working leg behind`);
    assert.ok(att.armGapY > 0.02 || att.armGapX > 0.01,
      `${id}: ...with an asymmetric port de bras -- the arms must stop being mirror images`);

    const pir = perform(build(id), 'pirouette');
    assert.ok(Math.abs(pir.turn - Math.PI * 2) < 1e-6, `${id}: a pirouette turns a full circle`);
    assert.ok(pir.rise > 0.01, `${id}: ...rising onto the standing leg as it goes`);

    const uf = perform(build(id), 'uptown-funk');
    assert.ok(uf.travel > 1.0, `${id}: the strut travels -- got ${uf.travel.toFixed(2)}`);
    assert.ok(uf.twist > 0.15, `${id}: ...with some swagger in the shoulders`);
    assert.ok(uf.roll > 0.40,
      `${id}: ...and a real lateral lean -- got ${(uf.roll * 57.3).toFixed(1)} degrees`);
    assert.ok(uf.footStride > 0.10,
      `${id}: ...and the walk layer running underneath it -- stride ${uf.footStride.toFixed(3)}`);
    assert.ok(uf.frozenStride > 0.06,
      `${id}: a snap must catch the legs mid-stride -- got ${uf.frozenStride.toFixed(3)} apart`);
  }
}

{
  const kit = getSpecies('lion');

  const lionOf = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    assert.ok(mane, 'the mane shell must exist -- scallopGeometry returns null when every dome '
      + 'falls inside the face gap, which presents as a lion with no mane at all');
    return { built, mane };
  };
  const inspect = (P) => {
    const { built, mane } = lionOf(P);
    const eye = built.joints.eye[0].node.position;
    const ex = Math.abs(eye.x);
    const ey = eye.y;
    const ez = eye.z;
    const win = P.eyeRadius * 1.5;
    const pos = mane.geometry.attributes.position;
    const v = new THREE.Vector3();
    let overEye = 0, maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mane.matrix);
      maxR = Math.max(maxR, Math.hypot(v.x, v.z));
      if (Math.abs(Math.abs(v.x) - ex) <= win && Math.abs(v.y - ey) <= win && v.z > ez) overEye++;
    }
    return { overEye, maxR };
  };

  const skinZ = (P) => {
    const k = 1 - ((-P.headRadius * P.muzzleDrop) / (P.headRadius * 0.94)) ** 2;
    return k > 0 ? P.headRadius * Math.sqrt(k) : 0;
  };
  const protrusion = (P) => P.headRadius * P.muzzleStart + P.muzzleLength - skinZ(P);

  for (const maneFaceGap of [kit.defaults.maneFaceGap, ...kit.randomRanges.maneFaceGap]) {
    const P = { ...kit.defaults, maneFaceGap };
    assert.equal(inspect(P).overEye, 0,
      `lion: mane must not hang in front of the eyes at gap ${maneFaceGap} -- `
      + 'that is a hood, not a mane');
  }

  for (const maneTouch of [kit.defaults.maneTouch, ...kit.randomRanges.maneTouch]) {
    for (const preset of [{}, ...MANE_PRESETS]) {
      const P = { ...kit.defaults, ...preset, maneTouch };
      const headHalf = P.headRadius * 1.04;
      const { maxR, overEye } = inspect(P);
      assert.ok(maxR - headHalf > headHalf * 0.15,
        `lion: mane must stand off the skull, not cling to it -- clearance `
        + `${(maxR - headHalf).toFixed(4)} is ${((maxR - headHalf) / headHalf).toFixed(2)}x `
        + `head half-width at touch ${maneTouch}, proud ${P.maneProud}`);
      assert.equal(overEye, 0,
        `lion: mane must not reach in front of the eyes at touch ${maneTouch}, `
        + `proud ${P.maneProud}`);
    }
  }

  {
    const capFront = (P) => P.headRadius * P.muzzleStart + P.muzzleLength
      + P.muzzleWidth * LIMB_TAPER * P.muzzleRound - skinZ(P);

    assert.ok(capFront(kit.defaults) > 0.02,
      `lion: the default snout must clear the skull -- cap front `
      + `${capFront(kit.defaults).toFixed(4)}`);
    assert.ok(snoutGap(kit.defaults) >= 0 && snoutGap(kit.defaults) < 0.5,
      `lion: the default snout must read as a cat -- gap ${snoutGap(kit.defaults).toFixed(3)}`);

    const real = Math.random;
    let seed = 0x2545f491;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    try {
      let worstCap = Infinity, worstGap = -Infinity, bestGap = Infinity;
      for (let n = 0; n < 600; n++) {
        const P = kit.randomise(structuredClone(kit.defaults));
        worstCap = Math.min(worstCap, capFront(P));
        worstGap = Math.max(worstGap, snoutGap(P));
        bestGap = Math.min(bestGap, snoutGap(P));
        assert.ok(P.muzzleLength > 0, `lion: solveSnout produced muzzleLength ${P.muzzleLength}`);
      }
      assert.ok(bestGap >= 0,
        `lion: the nose must never sink behind the face -- got ${bestGap.toFixed(4)}`);
      assert.ok(worstGap < 0.5,
        `lion: a randomised lion must not grow a fox snout -- worst gap ${worstGap.toFixed(4)}`);
      assert.ok(worstCap > 0.02,
        `lion: the round cap must stand out of the skull -- worst ${worstCap.toFixed(4)}`);

      assert.ok(worstGap + 1 <= 2 && bestGap + 1 >= 1,
        `lion: a snout must be 1 to 2 nose-depths off the face -- got `
        + `${(bestGap + 1).toFixed(3)} to ${(worstGap + 1).toFixed(3)}`);
    } finally {
      Math.random = real;
    }
  }

  assert.ok(inspect({ ...kit.defaults, maneFaceGap: 0 }).overEye > 0,
    'lion: a mane with no face gap is a hood and must cover the eyes -- if it does not, the eye '
    + 'check is measuring nothing');
  assert.ok(protrusion({ ...kit.defaults, muzzleStart: 0.24 }) < 0,
    'lion: a 0.24 muzzle start is meant to bury the snout -- that was the first shipped bug');
  assert.ok(snoutGap({ ...kit.defaults, muzzleLength: 0.105 }) > 0.5,
    'lion: muzzleLength 0.105 is meant to read as a fox -- it was the shipped default, and if it '
    + 'now passes the band then the nose or the head moved and the band needs re-measuring');
}

{
  const kit = getSpecies('lion');

  const measure = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    const ear = built.joints.ear[0];
    const span = (mesh) => {
      const pos = mesh.geometry.attributes.position;
      const v = new THREE.Vector3();
      let maxX = 0, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
        maxX = Math.max(maxX, Math.abs(v.x));
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { maxX, minY, maxY };
    };
    const meshes = ear.node.children.filter((c) => c.isMesh).map(span);
    assert.equal(meshes.length, 2, 'lion: an ear is a leaf plus a point');
    const [leaf, tip] = meshes[0].maxY > meshes[1].maxY ? [meshes[1], meshes[0]] : meshes;
    const t = (tip.minY - ear.midY) / ear.halfH;
    const leafAtJoin = ear.size * Math.sqrt(Math.max(0, 1 - t * t));
    return { leaf, tip, leafAtJoin, past: tip.maxY - leaf.maxY, length: ear.length };
  };

  const R = kit.randomRanges;
  for (const earWidth of [kit.defaults.earWidth, ...R.earWidth]) {
    for (const earFlatten of [kit.defaults.earFlatten, ...R.earFlatten]) {
      const m = measure({ ...kit.defaults, earWidth, earFlatten });
      assert.ok(Math.abs(m.tip.maxX / m.leafAtJoin - 1) < 0.02,
        `lion: the ear point must be as wide as the ear where it joins -- `
        + `${m.tip.maxX.toFixed(4)} against ${m.leafAtJoin.toFixed(4)} `
        + `at earWidth ${earWidth}, flatten ${earFlatten}`);
    }
  }

  for (const earPoint of [kit.defaults.earPoint, ...R.earPoint]) {
    const m = measure({ ...kit.defaults, earPoint });
    assert.ok(m.past > m.length * 0.10,
      `lion: the point must clear the leaf -- only ${m.past.toFixed(4)} at earPoint ${earPoint}`);
  }

  {
    const m = measure(kit.defaults);
    assert.ok(Math.abs((m.leafAtJoin * 0.92) / m.leafAtJoin - 1) > 0.02,
      'lion: a 0.92 constant is meant to fail tangency -- if 0.02 no longer catches it the '
      + 'tolerance is too loose to measure anything');
  }
}

{
  const asymmetry = (mesh) => {
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    const xs = [];
    let maxAbs = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      xs.push(v.x);
      maxAbs = Math.max(maxAbs, Math.abs(v.x));
    }
    const a = [...xs].sort((p, q) => p - q);
    const b = xs.map((x) => -x).sort((p, q) => p - q);
    let err = 0;
    for (let i = 0; i < a.length; i++) err += Math.abs(a[i] - b[i]);
    return err / a.length / maxAbs;
  };

  const maneOf = (over) => {
    const P = { ...BASE_PARAMS, ...getSpecies('lion').defaults, ...over, mergeMeshes: false };
    const built = createCharacter(P, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    return mane;
  };

  for (const manePerRow of [3, 4, 9, 11]) {
    for (const maneFaceGap of [0, 1.124, 2.5, 3.1]) {
      const mane = maneOf({ manePerRow, maneFaceGap, maneStagger: false });
      if (!mane) continue;
      const m = asymmetry(mane);
      assert.ok(m < 1e-6,
        `lion: the mane must be left-right symmetric -- asymmetry ${m.toExponential(2)} `
        + `at perRow ${manePerRow}, face gap ${maneFaceGap}`);
    }
  }

  for (const manePerRow of [3, 11]) {
    const m = asymmetry(maneOf({ manePerRow, maneStagger: true }));
    assert.ok(m < 1e-6,
      `lion: a staggered mane must be symmetric too -- ${m.toExponential(2)} `
      + `at perRow ${manePerRow}`);
  }
}

{
  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    if (!kit.presetKey && !kit.onPresetChange) continue;
    assert.ok(kit.presetKey && kit.onPresetChange,
      `${id}: presetKey and onPresetChange are one contract -- declaring half of it gives a `
      + 'slider that silently does nothing');
    assert.ok(kit.presetKey in kit.defaults,
      `${id}: presetKey "${kit.presetKey}" must be a real param, or the slider never appears`);

    const P = structuredClone(kit.defaults);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      kit.onPresetChange(P, i);
      assert.equal(P[kit.presetKey], i, `${id}: onPresetChange must record which preset is live`);
      const others = Object.entries(P)
        .filter(([k, v]) => k !== kit.presetKey && v !== kit.defaults[k])
        .map(([k]) => k);
      seen.add(others.join(','));
    }
    assert.ok(seen.size > 1,
      `${id}: the presets must differ from each other -- every one of them wrote the same params`);

    for (const i of [-3, 999]) {
      kit.onPresetChange(P, i);
      for (const [k, v] of Object.entries(P)) {
        assert.ok(!Number.isNaN(v), `${id}: preset index ${i} left ${k} NaN`);
      }
    }
  }
}

{
  const HEAD = { owl: [1.06, 1.00, 0.98], llama: [0.80, 0.94, 1.16], lion: [1.04, 0.94, 1.00] };
  const SPREAD = { owl: 'tuftSpread', llama: 'earSpread', lion: 'earSpread' };

  const deepest = (id, over) => {
    const P = { ...BASE_PARAMS, ...getSpecies(id).defaults, ...over, mergeMeshes: false };
    const built = createCharacter(P, id);
    built.root.updateMatrixWorld(true);
    const [ax, ay, az] = HEAD[id].map((f) => f * P.headRadius);
    const v = new THREE.Vector3();
    let best = Infinity;
    for (const ear of built.joints.ear) {
      for (const child of ear.node.children) {
        if (!child.isMesh) continue;
        const pos = child.geometry.attributes.position;
        const m = new THREE.Matrix4().multiplyMatrices(ear.node.matrix, child.matrix);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          best = Math.min(best, Math.hypot(v.x / ax, v.y / ay, v.z / az));
        }
      }
    }
    return best;
  };

  for (const id of Object.keys(HEAD)) {
    if (!getSpecies(id)) continue;
    for (const spread of [0.10, 0.44, 0.60, 0.75, 0.90]) {
      for (const tilt of [-0.6, 0, 0.3, 0.9]) {
        const over = { [SPREAD[id]]: spread };
        if (id === 'owl') over.tuftTilt = tilt; else over.earTilt = tilt;
        const d = deepest(id, over);
        assert.ok(d < 0.98,
          `${id}: the ear must stay in the head -- deepest point is ${d.toFixed(3)} of the way `
          + `out at spread ${spread}, tilt ${tilt}`);
      }
    }
  }
}

{
  const kit = getSpecies('lion');
  const MIN = 5;

  assert.ok(kit.defaults.maneRows >= MIN,
    `lion: the default mane needs at least ${MIN} rows, has ${kit.defaults.maneRows}`);

  MANE_PRESETS.forEach((preset, i) => {
    assert.ok(preset.maneRows >= MIN,
      `lion: mane preset ${i} has ${preset.maneRows} rows, below the ${MIN} floor -- presets are `
      + 'what randomise draws from, so a short one ships on rerolls');
  });

  const rowsEntry = kit.gui.mane.find((e) => e[0] === 'maneRows');
  assert.ok(rowsEntry, 'lion: maneRows must still be on the mane folder');
  assert.ok(rowsEntry[1] >= MIN,
    `lion: the maneRows slider starts at ${rowsEntry[1]}, below the ${MIN} floor`);
}

{
  const MIN_PROUD = 0.15;
  const EYE_KEYS = ['eyeRadius', 'eyeSpread', 'eyeLift', 'eyeFront', 'headRadius'];

  const proudness = (id, P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, id);
    let head = null;
    for (const c of built.joints.head.children) {
      if (c.isMesh && c.geometry?.type === 'SphereGeometry' && !head) head = c.scale.toArray();
    }
    assert.ok(head, `${id}: expected a sphere head to measure the eye against`);
    const eye = built.joints.eye[0].node.position;
    const depth = P.eyeRadius * 0.55;
    const k = 1 - (eye.x / head[0]) ** 2 - (eye.y / head[1]) ** 2;
    const skin = k > 0 ? head[2] * Math.sqrt(k) : 0;
    return (eye.z + depth - skin) / depth;
  };

  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    const D = { ...BASE_PARAMS, ...kit.defaults };
    const spans = EYE_KEYS.map((k) => kit.randomRanges[k] ?? [D[k], D[k]]);
    for (let corner = 0; corner < (1 << EYE_KEYS.length); corner++) {
      const P = { ...D };
      EYE_KEYS.forEach((k, i) => { P[k] = spans[i][(corner >> i) & 1]; });
      const v = proudness(id, P);
      assert.ok(v > MIN_PROUD,
        `${id}: the eye white must stand out of the skull -- ${v.toFixed(3)}x its own depth at `
        + `${EYE_KEYS.map((k) => `${k}=${P[k]}`).join(' ')}`);
    }
    assert.ok(proudness(id, D) > MIN_PROUD, `${id}: the default eye white is buried in the skull`);
  }
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const KEYS = ['maneDrop', 'maneTall', 'maneTouch', 'maneFaceGap', 'maneHug', 'manePush'];
  const spans = KEYS.map((k) => kit.randomRanges[k]);
  const corners = [];
  for (const preset of [{}, ...MANE_PRESETS]) {
    for (const maneSides of [4, 6]) {
      for (let m = 0; m < (1 << KEYS.length); m++) {
        const P = { ...D, ...preset, maneSides };
        KEYS.forEach((k, j) => { P[k] = spans[j][(m >> j) & 1]; });
        corners.push(P);
      }
    }
  }
  const where = (P) => `${KEYS.map((k) => `${k}=${P[k]}`).join(' ')} sides=${P.maneSides} `
    + `rows=${P.maneRows} bottom=${P.maneBottom} proud=${P.maneProud}`;

  const HEAD = [1.04, 0.94, 1.00];
  for (const P of corners) {
    for (const maneBottom of [P.maneBottom, 0.5, 1.0]) {
      const Q = { ...P, maneBottom };
      const built = createCharacter({ ...BASE_PARAMS, ...Q, mergeMeshes: false }, 'lion');
      built.root.updateMatrixWorld(true);
      let mane = null;
      built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
      assert.ok(mane, `lion: no mane shell to measure at ${where(Q)}`);
      for (const b of maneBases(Q)) {
        const v = b.clone().applyMatrix4(mane.matrix).divideScalar(Q.headRadius);
        const out = Math.hypot(v.x / HEAD[0], v.y / HEAD[1], v.z / HEAD[2]);
        assert.ok(Math.abs(out - 0.95) < 1e-6,
          `lion: every spike base must sit on the skull, neither hanging off it nor buried in it `
          + `-- one sits at ${out.toFixed(3)} of the skull's radius at ${where(Q)}`);
      }
    }
  }

  for (const P of corners) {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let shell = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') shell = c; });

    const eye = built.joints.eye[0].node.position;
    const win = P.eyeRadius * 1.5;
    const pos = shell.geometry.attributes.position;
    const v = new THREE.Vector3();
    let overEye = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(shell.matrix);
      if (Math.abs(Math.abs(v.x) - Math.abs(eye.x)) <= win && Math.abs(v.y - eye.y) <= win
        && v.z > eye.z) overEye++;
    }
    assert.equal(overEye, 0,
      `lion: mane must not hang in front of the eyes -- ${overEye} vertices do at ${where(P)}`);
  }

  for (const P of corners) {
    const gap = maneCrownGap(P);
    assert.ok(gap <= 0,
      `lion: the mane must cover the crown, not ring a bald patch -- ${gap.toFixed(3)} rad of `
      + `bare head at maneTop=${P.maneTop} ${where(P)}`);
  }

  const MIN = 0.50;
  assert.ok(kit.defaults.maneBottom >= MIN,
    `lion: the default mane stops at ${kit.defaults.maneBottom}, above the ${MIN} equator floor`);
  MANE_PRESETS.forEach((preset, i) => {
    assert.ok(preset.maneBottom >= MIN,
      `lion: mane preset ${i} stops at ${preset.maneBottom}, above the ${MIN} equator floor`);
  });
  const bottomEntry = kit.gui.mane.find((e) => e[0] === 'maneBottom');
  assert.ok(bottomEntry, 'lion: maneBottom must still be on the mane folder');
  assert.ok(bottomEntry[1] >= MIN,
    `lion: the maneBottom slider starts at ${bottomEntry[1]}, above the ${MIN} equator floor`);

  const dropEntry = kit.gui.mane.find((e) => e[0] === 'maneDrop');
  assert.ok(dropEntry && dropEntry[1] >= 0,
    `lion: the maneDrop slider starts at ${dropEntry?.[1]} -- a mane never sits ABOVE the skull `
    + 'it grows from, and the skull pull-in can only crush those rows flat onto the crown');
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const HEAD = [1.04, 0.94, 1.00];

  const backCover = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    const { head } = built.joints;
    const toLocal = head.matrixWorld.clone().invert();
    const r = P.headRadius;
    let lowest = Infinity;
    for (const b of maneBases(P)) lowest = Math.min(lowest, b.clone().applyMatrix4(mane.matrix).y / r);
    const ray = new THREE.Raycaster();
    let n = 0, covered = 0;
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const x = (-1 + i / 20) * HEAD[0];
        const y = (-1 + j / 20) * HEAD[1];
        const k = 1 - (x / HEAD[0]) ** 2 - (y / HEAD[1]) ** 2;
        if (k <= 0 || y < lowest) continue;
        const from = new THREE.Vector3(x * r, y * r, -5 * r).applyMatrix4(head.matrixWorld);
        const to = new THREE.Vector3(x * r, y * r, 0).applyMatrix4(head.matrixWorld);
        ray.set(from, to.sub(from).normalize());
        const hit = ray.intersectObject(mane, false)[0];
        n++;
        if (hit && hit.point.clone().applyMatrix4(toLocal).z / r < -HEAD[2] * Math.sqrt(k)) covered++;
      }
    }
    return covered / n;
  };

  for (const [label, preset] of [['default', {}], ...MANE_PRESETS.map((p, i) => [`preset ${i}`, p])]) {
    const extremes = [{}, { maneSides: 4, maneHug: kit.randomRanges.maneHug[1], manePush: kit.randomRanges.manePush[0] }];
    for (const extra of extremes) for (const maneTouch of [kit.defaults.maneTouch, kit.randomRanges.maneTouch[0]]) {
      const cover = backCover({ ...D, ...preset, ...extra, maneTouch });
      assert.ok(cover >= 0.98,
        `lion: from behind, the mane must cover the back of the head -- ${label} covers `
        + `${Math.round(cover * 100)}% of the skull within its own reach at maneTouch ${maneTouch}`);
    }
  }
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const crownCovered = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    const { head } = built.joints;
    const r = P.headRadius;
    const from = new THREE.Vector3(0, 5 * r, 0).applyMatrix4(head.matrixWorld);
    const to = new THREE.Vector3(0, 0, 0).applyMatrix4(head.matrixWorld);
    const hit = new THREE.Raycaster(from, to.sub(from).normalize()).intersectObject(mane, false)[0];
    return Boolean(hit)
      && hit.point.clone().applyMatrix4(head.matrixWorld.clone().invert()).y / r > 0.94;
  };
  for (const base of [D, { ...D, maneDrop: 0.4 }, { ...D, maneSides: 4 }, { ...D, maneSides: 6 }]) {
    for (let i = 0; i <= 15; i++) {
      const P = { ...base, maneTop: i * 0.02 };
      const saysCovered = maneCrownGap(P) <= 0;
      assert.equal(saysCovered, crownCovered(P),
        `lion: maneCrownGap says the crown is ${saysCovered ? 'covered' : 'bare'} at maneTop `
        + `${P.maneTop.toFixed(2)}, maneDrop ${P.maneDrop} but a ray straight down says otherwise`);
    }
  }
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const HEAD = [1.04, 0.94, 1.00];
  const cases = [['default', {}], ...MANE_PRESETS.map((p, i) => [`preset ${i}`, p])]
    .flatMap(([name, p]) => [[name, p], [`${name} at maneBottom 1.0`, { ...p, maneBottom: 1.0 }]]);
  for (const [label, preset] of cases) {
    const P = { ...D, ...preset };
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    const pos = mane.geometry.attributes.position;
    const { index } = mane.geometry;
    const at = (i) => new THREE.Vector3().fromBufferAttribute(pos, i)
      .applyMatrix4(mane.matrix).divideScalar(P.headRadius);
    const norm = (v) => Math.hypot(v.x / HEAD[0], v.y / HEAD[1], v.z / HEAD[2]);
    const fur = new Set();
    for (let i = 0; i < pos.count; i++) if (Math.abs(norm(at(i)) - 1.02) < 1e-7) fur.add(i);
    assert.ok(fur.size > 50, `lion: ${label} has no underfur to check (${fur.size} vertices)`);
    let lowest = Infinity;
    for (let t = 0; t < index.count; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      if (!tri.every((i) => fur.has(i))) continue;
      for (let e = 0; e < 3; e++) {
        lowest = Math.min(lowest, norm(at(tri[e]).add(at(tri[(e + 1) % 3])).multiplyScalar(0.5)));
      }
    }
    assert.ok(lowest > 1.003,
      `lion: ${label}'s underfur sags to ${lowest.toFixed(5)} of the skull between its vertices -- `
      + 'at or under 1.0 the head shows through it and the two flicker');
  }
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const HEAD = [1.04, 0.94, 1.00];
  const leans = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    const per = new THREE.ConeGeometry(1, 1, P.maneSides).attributes.position.count;
    const pos = mane.geometry.attributes.position;
    return maneBases(P).map((unit, i) => {
      const base = unit.clone().applyMatrix4(mane.matrix);
      const tip = new THREE.Vector3().fromBufferAttribute(pos, i * per).applyMatrix4(mane.matrix);
      const n = new THREE.Vector3(base.x / HEAD[0] ** 2, base.y / HEAD[1] ** 2, base.z / HEAD[2] ** 2);
      const phi = Math.acos(unit.y / unit.length()) / Math.PI;
      const row = P.maneBottom > P.maneTop ? (phi - P.maneTop) / (P.maneBottom - P.maneTop) : 0;
      return { row, lean: THREE.MathUtils.radToDeg(tip.sub(base).angleTo(n.normalize())) };
    });
  };

  for (const maneTall of [D.maneTall, ...kit.randomRanges.maneTall]) {
    for (const maneBottom of [D.maneBottom, 1.0]) {
      const worst = Math.max(...leans({ ...D, maneHug: 0, maneTall, maneBottom }).map((s) => s.lean));
      assert.ok(worst < 0.5,
        `lion: at maneHug 0 every spike must grow straight out of the skull -- one leans `
        + `${worst.toFixed(1)} degrees off it at maneTall ${maneTall}, maneBottom ${maneBottom}`);
    }
  }

  for (const maneBottom of [D.maneBottom, 0.8, 1.0]) {
    const spikes = leans({ ...D, maneBottom });
    const last = spikes.filter((s) => s.row > 1 - 1e-9).map((s) => s.lean);
    const want = D.maneHug * 90;
    assert.ok(last.length && last.every((l) => Math.abs(l - want) < 1),
      `lion: the mane's last row must fold ${want.toFixed(0)} degrees against the skull at `
      + `maneBottom ${maneBottom} -- got ${last.map((l) => l.toFixed(1)).join(', ')}`);
    const upper = Math.max(...spikes.filter((s) => s.row <= 0.5).map((s) => s.lean));
    assert.ok(upper < 0.5,
      `lion: maneHug must leave the upper half of the mane alone -- a spike there leans `
      + `${upper.toFixed(1)} degrees at maneBottom ${maneBottom}`);
  }
}

{
  const kit = getSpecies('lion');
  const MIN = 28;
  const real = Math.random;
  let seed = 7;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let worst = Infinity, at = '';
  try {
    for (let i = 0; i < 2000; i++) {
      const P = kit.randomise(structuredClone({ ...BASE_PARAMS, ...kit.defaults }));
      const gap = Math.abs(maneLightness(P.maneColor) - maneLightness(P.bodyColor));
      if (gap < worst) { worst = gap; at = `body ${P.bodyColor}, mane ${P.maneColor}`; }
    }
  } finally {
    Math.random = real;
  }
  assert.ok(worst >= MIN,
    `lion: a random mane must differ from its body by at least ${MIN} L* -- got ${worst.toFixed(1)} (${at})`);
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const gap = Math.abs(maneLightness(D.maneColor) - maneLightness(D.bodyColor));
  assert.ok(gap >= MIN, `lion: the default mane is only ${gap.toFixed(1)} L* from the default body`);
}

{
  const kit = getSpecies('lion');
  const MIN = 1.0;
  assert.ok(kit.defaults.maneProud >= MIN,
    `lion: the default maneProud ${kit.defaults.maneProud} is under the ${MIN} floor`);
  MANE_PRESETS.forEach((preset, i) => {
    assert.ok(preset.maneProud >= MIN,
      `lion: mane preset ${i} has maneProud ${preset.maneProud}, under the ${MIN} floor`);
  });
  const entry = kit.gui.mane.find((e) => e[0] === 'maneProud');
  assert.ok(entry, 'lion: maneProud must still be on the mane folder');
  assert.ok(entry[1] >= MIN && entry[2] === 3,
    `lion: the maneProud slider must run ${MIN} to 3 -- it runs ${entry[1]} to ${entry[2]}`);
}

{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const real = Math.random;
  let seed = 11;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lions = [];
  try {
    for (let i = 0; i < 1500; i++) lions.push(kit.randomise(structuredClone(D)));
  } finally {
    Math.random = real;
  }
  const spread = (f) => {
    const v = lions.map(f).sort((a, b) => a - b);
    return v[Math.floor(0.9 * (v.length - 1))] / v[Math.floor(0.1 * (v.length - 1))];
  };
  const want = {
    body: [(P) => Math.cbrt(P.torsoW * P.torsoH * P.torsoD), 1.5],
    arms: [(P) => P.upperArmLen + P.forearmLen, 1.45],
    legs: [(P) => P.legHeight, 1.9],
    pupils: [(P) => P.eyeRadius * P.pupilScale, 1.7],
  };
  for (const [name, [f, min]] of Object.entries(want)) {
    const got = spread(f);
    assert.ok(got >= min,
      `lion: a crowd needs ${min}x between a typical big and small lion in ${name}, got ${got.toFixed(2)}x`);
  }

  for (const key of ['torsoW', 'torsoH', 'torsoD', 'upperArmLen', 'forearmLen']) {
    assert.ok(!(key in kit.randomRanges),
      `lion: ${key} is drawn by varyBody, so randomRanges must not draw it too -- one draw would be thrown away`);
  }

  for (const P of lions) {
    const ratio = (P.upperArmLen + P.forearmLen) / (P.legHeight + P.torsoH);
    assert.ok(ratio <= 0.70 + 0.01, `lion: arm ratio ${ratio.toFixed(3)} is over the 0.70 cap`);
  }
  const torsoH = D.torsoH * 0.72 * 0.92;
  const legHeight = kit.randomRanges.legHeight[0];
  const armTotal = 0.70 * (legHeight + torsoH);
  const split = D.upperArmLen / (D.upperArmLen + D.forearmLen);
  const worst = createCharacter({ ...D, legHeight, torsoH, upperArmLen: armTotal * split,
    forearmLen: armTotal * (1 - split), mergeMeshes: false }, 'lion');
  worst.root.updateMatrixWorld(true);
  const low = (n) => new THREE.Box3().setFromObject(n).min.y;
  const clear = Math.min(...worst.joints.upperArm.map((a) => low(a.node)))
    - Math.min(...worst.joints.upperLeg.map((l) => low(l.node)));
  assert.ok(clear > 0.02, `lion: at the arm cap's worst corner the hands clear the floor by only ${clear.toFixed(4)}`);

  const cap = Math.sqrt(1 - (1 - 0.25) ** 2);
  const ring = cap - kit.randomRanges.pupilScale[1];
  assert.ok(ring >= 0.05,
    `lion: the largest random pupil leaves only ${ring.toFixed(3)} of the eye's radius of white showing`);
}

{
  const traits = (o) => ({ Volatility: 3, Withdrawal: 3, Enthusiasm: 3, Assertiveness: 3, Openness: 3,
    Intellect: 3, Compassion: 3, Politeness: 3, Industriousness: 3, Orderliness: 3, ...o });
  const anxious = traits({ Enthusiasm: 1, Assertiveness: 1, Volatility: 5, Withdrawal: 5 });
  const tailLow = (b) => {
    b.root.updateMatrixWorld(true);
    return Math.min(...b.joints.tail.map(({ node }) => new THREE.Box3().setFromObject(node).min.y));
  };
  const lowestWalking = (P, id) => {
    const kit = getSpecies(id);
    const o = { ...MOTION_DEFAULTS, ...motionOf(anxious, kit.motionRanges) };
    const b = createCharacter({ ...P, mergeMeshes: false }, id);
    const L = P.legHeight + P.hipInset;
    let phase = 0, lo = Infinity;
    for (let i = 0; i < 360; i++) {
      const speed = i < 180 ? 0 : 1.0;
      const w = walkPhase(phase, speed, L, o);
      phase = (phase + speed / 60 / (2 * L)) % 1;
      const g = walkGain(b.motion, speed, 1 / 60, o);
      stepMotion(b, POSES.rest, 1 / 60, o, (out) => walkLayer(out, w, g, o));
      lo = Math.min(lo, tailLow(b));
    }
    return lo;
  };

  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    const D = { ...BASE_PARAMS, ...kit.defaults };
    const b = build(id);
    assert.ok(b.joints.tail.length >= 1, `${id}: every species has a tail`);
    b.root.updateMatrixWorld(true);
    const rel = b.joints.tail[0].node.getWorldPosition(new THREE.Vector3())
      .sub(b.joints.chest.getWorldPosition(new THREE.Vector3()));
    const seat = Math.hypot(rel.x / D.torsoW, rel.y / D.torsoH, rel.z / D.torsoD);
    assert.ok(seat > 0.8 && seat < 1, `${id}: the tail root must sit just inside the torso, at ${seat.toFixed(3)}`);

    const R = kit.randomRanges;
    const torsoH = id === 'lion' ? D.torsoH * 0.72 * 0.92 : R.torsoH[0];
    const worst = { ...D, legHeight: R.legHeight[0], torsoH };
    worst.tailLength = id === 'lion' ? 1.0 * tailBaseHeight(worst) : R.tailLength[1];
    for (const [name, P] of [['default', D], ['worst corner', worst]]) {
      const lo = lowestWalking(P, id);
      assert.ok(lo > 0.01, `${id} ${name}: a tucked tail walking dips to ${lo.toFixed(3)} -- through the floor`);
    }

    const s = build(id);
    const tucked = { ...MOTION_DEFAULTS, ...motionOf(anxious, kit.motionRanges), idleAmount: 0 };
    for (let i = 0; i < 240; i++) stepMotion(s, POSES.sit, 1 / 60, tucked);
    s.root.updateMatrixWorld(true);
    const bottom = new THREE.Box3().setFromObject(s.joints.chest.children[0]).min.y;
    assert.ok(tailLow(s) > bottom, `${id}: seated, the tail goes ${(bottom - tailLow(s)).toFixed(3)} into the seat`);
    const lifted = build(id);
    applyPose(lifted, { ...lifted.params, tailLift: 0.8 });
    assert.ok(tailLow(lifted) > tailLow(build(id)) + 0.01, `${id}: tailLift on a static pose must lift the tail`);

    const o = { ...MOTION_DEFAULTS, idleAmount: 0 };
    const slide = build(id);
    let swing = 0;
    for (let i = 0; i < 90; i++) {
      slide.root.position.x = Math.min(i, 30) * 0.02;
      swing = Math.max(swing, Math.abs(stepMotion(slide, POSES.rest, 1 / 60, o).tailYaw));
    }
    assert.ok(swing > 0.1, `${id}: a body that moves and stops must swing its tail -- peak ${swing.toFixed(3)}`);
    const turned = build(id);
    turned.root.rotation.y = Math.PI / 2;
    let side = 0;
    for (let i = 0; i < 90; i++) {
      turned.root.position.x = Math.min(i, 30) * 0.02;
      side = Math.max(side, Math.abs(stepMotion(turned, POSES.rest, 1 / 60, o).tailYaw));
    }
    assert.ok(side < 1e-3, `${id}: stopping dead ahead swung the tail sideways by ${side.toFixed(3)}`);
    const jump = build(id);
    let fling = 0;
    for (let i = 0; i < 60; i++) {
      if (i === 10) jump.root.position.x = 40;
      fling = Math.max(fling, Math.abs(stepMotion(jump, POSES.rest, 1 / 60, o).tailYaw));
    }
    assert.ok(fling < 1e-9, `${id}: a teleport (spawn, reset) must not fling the tail -- peak ${fling.toFixed(3)}`);
    const cruise = build(id);
    let drift = 0;
    for (let i = 0; i < 30; i++) {
      cruise.root.position.z = i * 0.02;
      drift = Math.max(drift, Math.abs(stepMotion(cruise, POSES.rest, 1 / 60, o).tailPitch));
    }
    assert.ok(drift < 1e-6, `${id}: steady walking from spawn swung the tail ${drift.toFixed(4)}`);

    const merged = createCharacter({ ...D }, id);
    for (const { node } of merged.joints.tail) {
      const meshes = node.children.filter((c) => c.isMesh).length;
      assert.equal(meshes, 0, `${id}: tail joint ${node.name} keeps ${meshes} meshes of its own -- each is a draw call`);
    }
  }

  const L = build('lion');
  const tip = () => {
    L.root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(L.joints.tail.at(-1).node).getCenter(new THREE.Vector3());
  };
  applyPose(L, { ...L.params, tailYaw: 0 });
  const before = tip();
  applyPose(L, { ...L.params, tailYaw: 0.5 });
  const moved = Math.abs(tip().x - before.x);
  const reach = L.params.tailLength * Math.sin(0.5);
  assert.ok(moved > 0.6 * reach, `lion: a 0.5 rad wag moves the tip ${moved.toFixed(3)} of a possible ${reach.toFixed(3)}`);

  const lion = getSpecies('lion');
  for (let i = 0; i < 300; i++) {
    const P = lion.randomise(structuredClone({ ...BASE_PARAMS, ...lion.defaults }));
    const ratio = P.tailLength / tailBaseHeight(P);
    assert.ok(ratio <= 1.0 + 1e-9, `lion: a random tail ${ratio.toFixed(3)}x its base height can reach the floor`);
  }
}

{
  const SKINNED = { has: (name) => Boolean(name) };
  const pose = { ...POSES.walk, ...POSES.reach, headYaw: 0.9, headPitch: 0.5, headTilt: 0.3, neckCurve: 0.2, blink: 0.6, legSwing: 0.5 };
  const boxes = (built) => {
    applyPose(built, pose);
    built.root.updateMatrixWorld(true);
    const out = new Map();
    built.root.traverse((o) => { if (o.userData.joint) out.set(o.name, new THREE.Box3()); });
    const v = new THREE.Vector3();
    built.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) {
        const { skinIndex } = o.geometry.attributes;
        for (let i = 0; i < skinIndex.count; i++) {
          o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
          out.get(o.skeleton.bones[skinIndex.getX(i)].name).expandByPoint(v);
        }
        return;
      }
      let j = o.parent;
      while (j && !j.userData.joint) j = j.parent;
      if (SKINNED.has(j?.name)) out.get(j.name).expandByObject(o, true);
    });
    return out;
  };
  for (const id of speciesIds()) {
    const P = { ...BASE_PARAMS, ...getSpecies(id).defaults };
    const merged = createCharacter({ ...P, mergeMeshes: true }, id), apart = createCharacter({ ...P, mergeMeshes: false }, id);
    const [m, a2] = [boxes(merged), boxes(apart)];
    for (const k of m.keys()) {
      assert.equal(m.get(k).isEmpty(), a2.get(k).isEmpty(), `${id}: the ${k} lost or gained its parts in the merge`);
      if (a2.get(k).isEmpty()) continue;
      const d = Math.max(...['min', 'max'].flatMap((e) => ['x', 'y', 'z'].map((ax) => Math.abs(m.get(k)[e][ax] - a2.get(k)[e][ax]))));
      assert.ok(d < 1e-4, `${id}: merged, the ${k} lands ${d.toFixed(4)} from where it is unmerged -- the skin does not follow the pose`);
    }
    let draws = 0;
    merged.root.traverse((o) => { if (o.isMesh && SKINNED.has(o.parent.name)) draws++; });
    const families = new Set();
    apart.root.traverse((o) => {
      let j = o.parent;
      while (j && !j.userData.joint) j = j.parent;
      if (o.parent?.userData.noMerge) return;
      if (o.isMesh && SKINNED.has(j?.name)) families.add(o.material.userData.family ?? 'felt');
    });
    assert.equal(draws, families.size, `${id}: the body, neck, head and eyes are ${draws} meshes, one per material family would be ${families.size}`);
  }
}

for (const id of speciesIds()) {
  for (const mergeMeshes of [false, true]) {
    const built = createCharacter({ ...BASE_PARAMS, ...getSpecies(id).defaults, scarf: true, mergeMeshes }, id);
    built.root.traverse((o) => {
      let j = o.parent;
      while (j && !j.userData.joint) j = j.parent;
      assert.ok(!(o.isMesh && o.geometry === GEO.torus && j?.name === 'neck'), `${id}: a torus scarf is back on the neck`);
    });
  }
}

{
  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    let deepest = 0;
    for (let i = 0; i < 1000; i++) {
      const P = kit.randomise(structuredClone(kit.defaults));
      deepest = Math.min(deepest, seatedHipsAlong(P, CHAIR_W) - P.torsoD / 2);
    }
    assert.ok(deepest > CHAIR_BACK_Z,
      `${id}: a seated torso reaches ${deepest.toFixed(3)}, through the chair back at ${CHAIR_BACK_Z.toFixed(3)}`);
  }
}

{
  const box = new THREE.Box3();
  const truth = (built) => {
    built.root.updateMatrixWorld(true);
    const limbs = new Set();
    for (const j of [...built.joints.upperArm, ...built.joints.upperLeg, ...built.joints.tail.slice(0, 1)]) {
      j.node.traverse((n) => limbs.add(n));
    }
    let lowest = Infinity;
    built.root.traverse((m) => { if (m.isMesh && !limbs.has(m)) lowest = Math.min(lowest, box.setFromObject(m, true).min.y); });
    return lowest;
  };
  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    for (let i = 0; i < 5; i++) {
      const P = kit.randomise(structuredClone(kit.defaults));
      const merged = createCharacter({ ...P, mergeMeshes: true }, id), apart = createCharacter({ ...P, mergeMeshes: false }, id);
      applyPose(merged, POSES.sit);
      applyPose(apart, POSES.sit);
      const gap = lowestResting(merged) - truth(apart);
      assert.ok(Math.abs(gap) < 1e-3, `${id}: merged, the seated rump measures ${(gap * 1000).toFixed(1)}mm off where it is -- it hovers over the chair by that much`);
    }
  }
}

{
  const peak = (id, key) => {
    const built = build(id), o = { ...MOTION_DEFAULTS, idleAmount: 0 };
    let p = 0;
    for (let i = 0; i < 96; i++) p = Math.max(p, Math.abs(stepMotion(built, POSES.delighted, 1 / 60, o)[key]));
    return p;
  };
  assert.ok(peak('lion', 'tailYaw') > 0.8, 'a delighted lion wags harder than the base pose');
  assert.ok(peak('llama', 'earSplay') > 0.6, 'a delighted llama flaps its ears');
}

console.log('npc.js rig self-check: all assertions passed');
