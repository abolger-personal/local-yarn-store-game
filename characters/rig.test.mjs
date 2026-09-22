// Self-check for the parts of npc.js that motion.test.mjs cannot reach. Run:
//   node characters/rig.test.mjs
//
// motion.test.mjs deliberately imports motion.js ALONE, so it runs under bare node with no
// three.js resolution at all. That is worth keeping -- but it means everything where the pure
// maths meets the actual rig is untested, and two bugs had been sitting in exactly that gap:
//
//   * stepMotion() -- the whole intended per-frame path -- threw TypeError on its FIRST call,
//     because npc.js's sealed scratch object was missing the kneeSwing and neckCurve keys that
//     compose() writes. It had never executed. Nothing called it, so nothing noticed.
//   * createCharacter seeded its motion state from `params` rather than from a pose, so every
//     character spawned with dead straight arms and sprang to the resting elbow bend over the
//     first third of a second -- the exact lurch the comment there promises cannot happen.
//
// Both are invisible to a pure test and invisible on screen until you know to look. npc.js does
// import headless (three resolves from node_modules and the geometry builds with no GL context),
// so this costs one small file.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  POSES, POSE_KEYS, MOTION_DEFAULTS, BASE_PARAMS, createCharacter, stepMotion, applyPose,
  valueOf, walkPhase, walkLayer, speciesIds, getSpecies, resetMotion,
} from './npc.js';
import './owl.js';
import './llama.js';

const build = (id) => createCharacter(
  { ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false }, id);

/**
 * World position of the farthest descendant of a joint -- the hand at the end of an arm, the foot
 * at the end of a leg. Angles alone cannot answer "is one arm higher than the other", because the
 * two shoulders sit at mirrored offsets and a mirrored rotation about a mirrored origin lands
 * somewhere different. So these assertions measure where the limb actually ENDS UP.
 */
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

// --- stepMotion runs at all --------------------------------------------------------------------
//
// The headline. One call is the whole assertion: it threw before.
{
  for (const id of speciesIds()) {
    const built = build(id);
    const o = { ...MOTION_DEFAULTS };
    const out = stepMotion(built, POSES.rest, 1 / 60, o);
    assert.ok(out, `${id}: stepMotion must return its composed pose`);
    // and the two keys whose absence was the bug must actually be present and written
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

// --- and keeps running, with the walk layer on top ----------------------------------------------
//
// The `add` callback is the walk, and it is the argument the store will pass. Ten seconds of it.
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
  // the feet must still be ON the floor after all that, not sunk or floating
  assert.ok(Math.abs(built.root.position.y) < 0.5,
    `a walking character must stay near the floor (root y ${built.root.position.y})`);
}

// --- a character does not lurch on its first frame ----------------------------------------------
//
// The motion state must be seeded from the pose the rig is actually put into, or frame 1 has a
// real error to correct and the spring visibly springs. elbowBend is the one that bit: params
// carry armOut but no elbow bend, so seeding from params started every arm dead straight.
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

// --- grounding owns root.y, and groundOffset is the one way to move it -------------------------
//
// This is the contract the store's seat lift has to move onto: applyPose writes y absolutely
// every frame, so an offset added afterwards is erased. groundOffset shifts the whole character.
{
  const built = build(speciesIds()[0]);
  applyPose(built, POSES.rest);
  const floor = built.root.position.y;

  // At a FIXED pose, so the only thing changing is the offset. Comparing across poses would be
  // comparing two different lowestFoot values as well: POSES.sit folds the legs up, so a seated
  // character grounds differently even at offset zero, and that is correct.
  built.groundOffset = 0.16;                 // S.seatLift
  applyPose(built, POSES.rest);
  const lifted = built.root.position.y;
  assert.ok(Math.abs(lifted - floor - 0.16) < 1e-9,
    `groundOffset must raise the character by exactly itself (floor ${floor.toFixed(4)}, `
    + `lifted ${lifted.toFixed(4)}) -- this is what the seat lift writes instead of touching y`);

  // and it composes with a pose that grounds differently, which is the seated case itself
  applyPose(built, POSES.sit);
  const seated = built.root.position.y;
  built.groundOffset = 0;
  applyPose(built, POSES.sit);
  assert.ok(Math.abs(seated - built.root.position.y - 0.16) < 1e-9,
    'and the same offset on the seated pose, whose legs ground differently');

  // and it must not be sticky: back to zero is back on the floor
  built.groundOffset = 0;
  applyPose(built, POSES.rest);
  assert.ok(Math.abs(built.root.position.y - floor) < 1e-9,
    'clearing groundOffset must put them back on the floor');
}

// --- handing the rig to the engine and taking it back is lossless ------------------------------
//
// The species checker has two mutually exclusive contracts: with `play` off its sliders ARE the
// pose, with it on the engine writes every joint. Toggling has to land back exactly where the
// static page would have put the character, or every slider is quietly lying about what is on
// screen -- and a rig left mid-blend reads as a posing bug rather than as a handover bug.
//
// Idle off is the honest comparison: idle is SUPPOSED to move things, so leaving it on would
// make this untestable rather than strict. Measured: with idle on, root y differs by 4.0e-5.
{
  const built = build(speciesIds()[0]);
  const o = { ...MOTION_DEFAULTS, idleAmount: 0 };

  applyPose(built, POSES.browse);
  const staticY = built.root.position.y;

  // Hand over. The FIRST frame is where a botched handover lives: seeded at the pose the rig is
  // already in, the spring has zero error to correct and nothing may move at all. Two seconds
  // later it has settled either way and the same assertion proves nothing -- measured, 1.1e-8
  // with the seeding and 1.1e-8 without it, so only frame one discriminates.
  resetMotion(built.motion, POSES.browse);
  stepMotion(built, POSES.browse, 1 / 60, o);
  for (const k of POSE_KEYS) {
    assert.equal(valueOf(built.motion, k), POSES.browse[k],
      `${k} moved on the handover frame -- seeding the engine from the pose the rig is already `
      + 'in must leave it nothing to do, or toggling the checker into play lurches');
  }

  // and it must HOLD the pose rather than drift off it
  for (let i = 0; i < 120; i++) stepMotion(built, POSES.browse, 1 / 60, o);
  for (const k of POSE_KEYS) {
    assert.ok(Math.abs(valueOf(built.motion, k) - POSES.browse[k]) < 1e-6,
      `${k} drifted off its target under the engine -- with idle off the layer must contribute `
      + 'exactly nothing, so a standing character is bit-identical to the base pose');
  }
  assert.ok(Math.abs(built.root.position.y - staticY) < 1e-9,
    'and grounding must put them at the height the static page did');

  // Take it back: applyPose straight from the preset is what the checker does on play-off.
  applyPose(built, POSES.browse);
  assert.ok(Math.abs(built.root.position.y - staticY) < 1e-9,
    'taking the rig back from the engine must leave it where the static path puts it');
}

// --- the layers are switches, and "pose alone" is the static pose -------------------------------
//
// The species checker now offers the stack as checkboxes -- pose, + idle, + walk -- which is only
// honest if turning a layer off is SUBTRACTION rather than a different code path. The existing
// handover block above asserts the COMMANDED pose (cur[]) holds; this asserts the composed OUTPUT,
// which is what actually reaches the joints and is where a layer that leaks would show up.
//
// Both directions, because the off-assertion alone passes vacuously if the idle layer breaks:
// with the switch off the output must BE the pose, and with it on it must not.
{
  const built = build(speciesIds()[0]);
  const off = { ...MOTION_DEFAULTS, idleAmount: 0 };

  // Settle, so the spring is sitting on the target and any difference left is a layer's doing.
  resetMotion(built.motion, POSES.browse);
  for (let i = 0; i < 120; i++) stepMotion(built, POSES.browse, 1 / 60, off);

  const bare = stepMotion(built, POSES.browse, 1 / 60, off);
  for (const k of POSE_KEYS) {
    assert.equal(bare[k], POSES.browse[k],
      `${k}: with every layer off the composed output must equal the pose exactly -- the lab `
      + 'shows this as "pose alone", and it has to match what the static rig draws');
  }
  // The channels the layers own, rather than share, must be untouched too.
  for (const k of ['blink', 'kneeSwing', 'neckCurve']) {
    assert.equal(bare[k], 0, `${k} must be 0 with no layer running`);
  }

  // ...and the switch has to actually do something, or the assertion above means nothing.
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

// --- armOutAlt breaks the arms' mirror ----------------------------------------------------------
//
// applyLimbs writes `rotation.z = side * armOut`, which is mirrored BY CONSTRUCTION: measured
// across armOut, armSwing and armSwingAlt, the two hands never differed laterally by more than
// 0.00, so a ballet port de bras -- one arm up, one out -- was simply unreachable. armOutAlt is
// the anti-symmetric partner, exactly as armSwingAlt is for armSwing.
{
  for (const id of speciesIds()) {
    const built = build(id);

    // First the baseline this exists to break: the symmetric channels must STAY symmetric.
    for (const p of [{ armOut: 1.2 }, { armSwing: -1.0 }, { armOut: 2.55, armSwingAlt: 0.9 }]) {
      pose(built, p);
      const l = tipOf(built, limb(built, 'upperArm', 1));
      const r = tipOf(built, limb(built, 'upperArm', -1));
      assert.ok(Math.abs(Math.abs(l.x) - Math.abs(r.x)) < 1e-9,
        `${id}: ${JSON.stringify(p)} must leave the arms laterally mirrored`);
    }

    // ...and armOutAlt must not.
    pose(built, { armOut: 1.2, armOutAlt: 0.9 });
    const l = tipOf(built, limb(built, 'upperArm', 1));
    const r = tipOf(built, limb(built, 'upperArm', -1));
    assert.ok(l.y - r.y > 0.02,
      `${id}: positive armOutAlt must raise the LEFT hand above the right -- got ${(l.y - r.y).toFixed(4)}`);
    assert.ok(Math.abs(l.x) - Math.abs(r.x) > 0.01,
      `${id}: and carry it further out -- the two arms must stop being mirror images`);
  }
}

// --- spineTwist turns the chest, and only the chest ---------------------------------------------
//
// The spine's Y rotation slot was unused -- set(bend, 0, -roll) -- so the torso could bend and lean
// but never turn. Shoulders against hips is the whole read of a floss. The legs hang off the ROOT,
// not the spine, so a twist must leave them exactly where they were: if it moved them the character
// would screw themselves into the floor and grounding would chase it.
{
  const built = build(speciesIds()[0]);
  pose(built, {});
  const footBefore = tipOf(built, limb(built, 'upperLeg', 1)).clone();
  const yBefore = built.root.position.y;

  pose(built, { spineTwist: 0.8 });
  // applyPose writes LOCAL rotations; nothing has rebuilt the world matrices yet.
  built.root.updateMatrixWorld(true);
  const spineYaw = new THREE.Euler().setFromRotationMatrix(built.joints.spine.matrixWorld).y;
  assert.ok(Math.abs(spineYaw - 0.8) < 1e-6,
    `spineTwist must reach the spine's world yaw -- got ${spineYaw.toFixed(4)}`);

  const footAfter = tipOf(built, limb(built, 'upperLeg', 1));
  assert.ok(footAfter.distanceTo(footBefore) < 1e-9, 'a twist at the waist must not move the legs');
  assert.ok(Math.abs(built.root.position.y - yBefore) < 1e-9, 'nor change the grounding height');
}

// --- standing on one leg ------------------------------------------------------------------------
//
// legSwing is anti-symmetric (legSwing * side) and hipFlex is symmetric, so hipFlex = -legSwing
// cancels one leg and doubles the other. That is the ONLY way this rig can stand on one leg, and
// three of the five dances are built on it -- so it is worth pinning rather than rediscovering.
//
// What has to hold is not the lift but the PLANT: the standing foot stays on the floor and the body
// does not bob, whatever the free leg is doing. Grounding places the body by its LOWEST foot, so if
// this stopped holding, a dance would pump the whole character up and down.
{
  for (const id of speciesIds()) {
    const built = build(id);
    let planted = null, rootY = null;
    for (const k of [0.6, 0.9, 1.2]) {
      // free leg BEHIND (an attitude) and then IN FRONT (a riverdance knee)
      for (const sign of [1, -1]) {
        pose(built, { legSwing: sign * k, hipFlex: -sign * k, kneeBend: 1.2 });
        const l = tipOf(built, limb(built, 'lowerLeg', 1));
        const r = tipOf(built, limb(built, 'lowerLeg', -1));
        const [low, high] = l.y <= r.y ? [l, r] : [r, l];
        assert.ok(high.y - low.y > 0.05,
          `${id}: legSwing ${sign * k} must lift a leg clear -- got ${(high.y - low.y).toFixed(3)}`);
        if (sign !== 1) continue;
        // the same leg stays planted through one direction, so it must not wander
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

console.log('npc.js rig self-check: all assertions passed');
