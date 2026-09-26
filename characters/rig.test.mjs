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
  DANCES, DANCE_NAMES, makeDance, stepDance, LIMB_TAPER,
} from './npc.js';
import './owl.js';
import './llama.js';
import { MANE_PRESETS, maneCrownGap, maneSeat, snoutGap } from './lion.js';

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

// --- the dances actually move the rig -----------------------------------------------------------
//
// motion.test.mjs proves the dance DATA is well-formed and that the runner walks it. Neither says
// anything about what reaches a character: a dance whose every key pose was accidentally authored
// at rest would pass every assertion there and be an invisible celebration here.
//
// So this runs a performance exactly as the lab page does -- stepDance for the target, stepMotion
// to drive the rig -- and asserts the thing each dance is FOR. The rig is the same one the shop
// builds, so if these hold, the shop's dances are real.
{
  /** Run a whole performance and collect the extremes of everything worth judging. */
  function perform(built, name, seconds = 3) {
    const o = { ...MOTION_DEFAULTS, idleAmount: 0, stiff: DANCES[name].stiff, zeta: DANCES[name].zeta };
    const perf = makeDance(name);
    // footLift and footStride are DIFFERENT AXES and the distinction is the whole point: a high
    // knee separates the feet vertically, a stride separates them fore-aft. Measured on the owl at
    // the strut's own speed: the walk layer gives 0.221 fore-aft but only 0.012 vertical, so
    // asserting "the feet move" on y alone says a walking character is standing still.
    // Every measurement here is per AXIS, because the channels are: armOutAlt raises an arm (y),
    // armSwingAlt swings it fore-aft (z), a stride separates the feet fore-aft and a high knee
    // separates them vertically. Collapsing those into "did it move" is how a working dance gets
    // reported as inert -- which happened twice while writing this.
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
      // Only while the walk layer is OFF -- what the legs look like during a held beat.
      if (d.walk === 0) seen.frozenStride = Math.max(seen.frozenStride, Math.abs(lFoot.z - rFoot.z));
      // A STEP-BEHIND: a foot reaching back with BOTH feet still on the floor. The levelness test
      // is what makes this different from every other beat in a step dance -- those all lift a leg,
      // and a lifted leg swung back would pass a reach-only check while looking nothing like it.
      //
      // COUNTED, not maxed. A max is satisfied by a single frame in transit, so a step-behind whose
      // knee bends -- which lifts the back foot off and turns it into another leg raise -- still
      // passed, because the pose passes through level on its way to wrong. What has to be true is
      // that the shape HOLDS for a beat.
      if (Math.abs(lFoot.y - rFoot.y) < 0.02 && -Math.min(lFoot.z, rFoot.z) > 0.10) {
        seen.groundedBack += 1;
      }
      seen.roll = Math.max(seen.roll, Math.abs(valueOf(built.motion, 'spineRoll')));
      seen.armGapY = Math.max(seen.armGapY, Math.abs(lHand.y - rHand.y));
      seen.armGapX = Math.max(seen.armGapX, Math.abs(Math.abs(lHand.x) - Math.abs(rHand.x)));
      seen.armGapZ = Math.max(seen.armGapZ, Math.abs(lHand.z - rHand.z));
      // Where the PAIR of hands sits relative to the body, not which side each one is on. Both
      // hands can travel right while the left is still left of centre -- that IS the floss, and
      // comparing each hand's absolute side reports it as not happening.
      const pair = (lHand.x + rHand.x) / 2 - d.shift;
      seen.armPair = Math.max(seen.armPair, Math.abs(pair));
      seen.shift = Math.max(seen.shift, Math.abs(d.shift));
      // Hips one way, shoulders the other, counted only on frames where the hips are actually out.
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
    // Every dance must move SOMETHING, on every species -- the blanket check, so a newly added
    // dance cannot be silently inert.
    for (const name of DANCE_NAMES) {
      const s = perform(build(id), name);
      const moved = s.footLift + s.footStride + s.armGapY + s.armGapZ + s.twist + s.turn
        + s.travel + (s.rootY.max - s.rootY.min);
      assert.ok(moved > 0.05, `${id}/${name}: the dance barely moves the rig (${moved.toFixed(3)})`);
    }

    // ...and then what each one is actually for.
    const rd = perform(build(id), 'riverdance');
    assert.ok(rd.footLift > 0.08,
      `${id}: a riverdance is all in the feet -- got ${rd.footLift.toFixed(3)} of lift`);
    assert.ok(rd.twist < 1e-6 && rd.armGapY < 1e-6,
      `${id}: ...with a stiff upper body -- twist ${rd.twist.toFixed(3)}, arms ${rd.armGapY.toFixed(3)}`);
    // IT MUST LEAVE THE GROUND. The first version alternated a high knee with a beat where both
    // feet were planted and the body did not move, which is the definition of a march -- reported
    // as "isn't bouncing, it reads as a march". The hop is what fixes that, so it is what is
    // asserted: a body that never rises is the regression.
    assert.ok(rd.rise > 0.03,
      `${id}: a riverdance has to leave the floor -- peak rise ${rd.rise.toFixed(3)}`);
    // AND IT MUST KICK. A kick and a high knee are the same leg isolation with opposite knees, so
    // they are told apart by REACH, not by lift: measured, a kick puts the free foot 0.239 in
    // front of the planted one against a high knee's 0.152. Below 0.20 the dance is all knees.
    assert.ok(rd.footStride > 0.20,
      `${id}: ...and at least one real kick -- furthest reach ${rd.footStride.toFixed(3)}`);
    // AND A STEP-BEHIND. The rig has no lateral rotation at the hip, so a step that crosses behind
    // the other foot is out of reach -- but swinging the leg STRAIGHT back with the foot still down
    // is the fore-aft half of it, and that this rig can do.
    //
    // What this pins is that a held step-behind EXISTS, not the knee value that makes it cleanest.
    // Bending the knee is a visible downgrade (the back foot hovers 0.027 and the dance loses 0.012
    // of bounce) but not a different move, and a threshold tight enough to fail it would be tuned
    // to one species' leg length rather than to anything true.
    assert.ok(rd.groundedBack > 15,
      `${id}: ...and a step-behind that HOLDS -- only ${rd.groundedBack} frames of 180 had a foot `
      + 'reaching back with both feet on the floor');

    // The floss, against the wikiHow breakdown. The first version had the arms swinging fore-and-aft
    // like a march and nothing whatever at the hips -- reported as "total lack of hip motion and
    // coordinated arm motion" -- so all three halves of it are pinned.
    const floss = perform(build(id), 'floss');
    assert.ok(floss.twist > 0.2,
      `${id}: a floss is shoulders against hips -- got ${floss.twist.toFixed(3)} of twist`);
    assert.ok(floss.armPair > 0.10,
      `${id}: ...arms travelling as a PAIR to one side -- centroid only ${floss.armPair.toFixed(3)} off centre`);
    assert.ok(floss.armGapZ > 0.10,
      `${id}: ...with one of them in front of the body and one behind (${floss.armGapZ.toFixed(3)})`);
    assert.ok(floss.shift > 0.02,
      `${id}: ...and the HIPS actually moving -- got ${floss.shift.toFixed(3)}`);
    // The counter-motion is the joke of the dance: hips one way, shoulders the other. Having them
    // agree is not a smaller version of the floss, it is a different move -- and it is what was on
    // screen, countering on 6 frames out of 247.
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
    // Side to side, which is a different channel from the twist and was the thing most missing:
    // the first pass leaned 5.7 degrees, which is a polite sway rather than a strut.
    assert.ok(uf.roll > 0.40,
      `${id}: ...and a real lateral lean -- got ${(uf.roll * 57.3).toFixed(1)} degrees`);
    // Fore-aft, not vertical: this one is a WALK with swagger on top, and a walking character's
    // feet separate along the stride. The layers are additive, so this is the assertion that the
    // strut is the walk cycle plus a torso pose rather than a second leg animation.
    assert.ok(uf.footStride > 0.10,
      `${id}: ...and the walk layer running underneath it -- stride ${uf.footStride.toFixed(3)}`);
    // FREEZE MID-STEP, not freeze standing. The walk layer is switched off during a snap, so
    // without leg content in those poses the character tidily brings their feet together on every
    // beat -- measured 0.000 stride separation, a dancer coming to attention. The pause is the
    // whole dance, so what it looks like is worth an assertion of its own.
    assert.ok(uf.frozenStride > 0.06,
      `${id}: a snap must catch the legs mid-stride -- got ${uf.frozenStride.toFixed(3)} apart`);
  }
}

// --- the lion's mane frames the face, and its snout leaves the skull ----------------------------
//
// Both of these shipped wrong and both looked reasonable in the source.
//
// The snout: a cat's muzzle is SHORT, so on a broad head a short length starting where the
// llama's starts never emerges at all -- the tip landed at z 0.1607 inside a skull 0.1687 deep.
// The llama survives a 0.30 start because its head is small next to its muzzle (1.92x); the lion
// is 0.66x, so muzzleStart carries it instead of length.
//
// The mane: "does it cover the muzzle" was the wrong landmark. Once the snout protrudes properly
// it out-reaches the mane at EVERY face gap -- even a gap of 0, a full hood, leaves the nose
// poking through -- so that assertion could never fail again. A hood buries the EYES long before
// the nose, and that is what separates a mane from a balaclava. Measured: 275 mane vertices sit
// in front of an eye at gap 0, 26 at 1.8, and 0 from 2.0 up.
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
  // vertices sitting in front of an eye, and the widest radius the curls reach
  //
  // The eye landmark is read off the BUILT eye node, not recomputed from eyeFront. eyeSeat now
  // pushes an eye forward when eyeFront would bury the white in the skull, so the parameter and
  // the position are no longer the same number -- and a landmark that outlives the geometry it
  // measured is how three assertions in this file went quietly vacuous already.
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

  // head is an ellipsoid [r*1.04, r*0.94, r]; how deep in Z at the muzzle's height?
  const skinZ = (P) => {
    const k = 1 - ((-P.headRadius * P.muzzleDrop) / (P.headRadius * 0.94)) ** 2;
    return k > 0 ? P.headRadius * Math.sqrt(k) : 0;
  };
  const protrusion = (P) => P.headRadius * P.muzzleStart + P.muzzleLength - skinZ(P);

  // The default and BOTH ends of the shipped span. The span is what randomisation actually
  // draws from, and it was the span -- not the default -- that produced the bad ones on screen.
  for (const maneFaceGap of [kit.defaults.maneFaceGap, ...kit.randomRanges.maneFaceGap]) {
    const P = { ...kit.defaults, maneFaceGap };
    assert.equal(inspect(P).overEye, 0,
      `lion: mane must not hang in front of the eyes at gap ${maneFaceGap} -- `
      + 'that is a hood, not a mane');
  }

  // Stand-off. Not "does any curl poke out of the skull": the scallops sit PROUD along their
  // normals, so tips clear a head half-width even at absurd settings and that test never fires.
  // What matters is how thick the halo reads.
  //
  // Crossed with the presets, because each one carries its own maneSpread paired with its own
  // SOLVED maneProud, and the worst corner is a preset against a randomised extreme rather than
  // either alone. The crossed axis used to be randomRanges.maneSpread; that span is gone, because
  // applyManePreset runs after randomiseBase and overwrote it on every roll -- the test was
  // walking a span no character could ever have.
  //
  // maneTouch is what replaces it: it scales the derived curl size, so its floor is the corner
  // where the same maneProud reaches least far. Measured worst across all of it: 0.213x head
  // half-width. Threshold sits below that so this catches a mane collapsing onto the skull rather
  // than firing on a tuning pass.
  for (const maneTouch of [kit.defaults.maneTouch, ...kit.randomRanges.maneTouch]) {
    for (const preset of [{}, ...MANE_PRESETS]) {
      const P = { ...kit.defaults, ...preset, maneTouch };
      const headHalf = P.headRadius * 1.04;
      const { maxR, overEye } = inspect(P);
      assert.ok(maxR - headHalf > headHalf * 0.15,
        `lion: mane must stand off the skull, not cling to it -- clearance `
        + `${(maxR - headHalf).toFixed(4)} is ${((maxR - headHalf) / headHalf).toFixed(2)}x `
        + `head half-width at touch ${maneTouch}, spread ${P.maneSpread}, proud ${P.maneProud}`);
      // spread moves the spikes forward as well as outward, so the eyes are its business too
      assert.equal(overEye, 0,
        `lion: mane must not reach in front of the eyes at touch ${maneTouch}, `
        + `spread ${P.maneSpread}, proud ${P.maneProud}`);
    }
  }

  // The snout has to leave the head, and it has to keep the one ratio that makes it a cat.
  //
  // The ratio is bare snout between the skull and the back of the nose, over the nose's own
  // depth: 0 puts the nose against the face, and past ~0.5 there is enough naked muzzle to read
  // as a fox. Drawn independently it landed outside that band 98.7% of 4000 draws and reached
  // 2.12 -- and the shipped DEFAULT sat at 0.748, so this caught the character, not just the
  // randomiser. muzzleLength is solved from a drawn gap now, which is why no randomRanges corner
  // scan can reach it and this walks the real randomiser instead, under a seeded PRNG.
  //
  // Note which landmark is asserted. With the gap solved the TAPER's straight section tucks
  // inside the skull on about a fifth of draws (worst -0.0223), and that is fine -- it is a
  // flat-faced cat, and the round cap and nose still stand out (worst +0.0493 and +0.0629). The
  // taper tip is only the right landmark for the default, where it documents the original bug.
  {
    const capFront = (P) => P.headRadius * P.muzzleStart + P.muzzleLength
      + P.muzzleWidth * LIMB_TAPER * P.muzzleRound - skinZ(P);

    // NOT the taper tip, for the default either. That assertion retired when the nose moved out
    // to a fixed protrusion and the default muzzle shortened to keep its ratio: the taper tip now
    // clears by 0.0030 while the cap clears by 0.072. A cat's straight muzzle section belongs
    // inside the skull -- the cap and nose are the snout you see. The taper tip survives only in
    // the teeth check below, where it documents the original buried-snout bug.
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

      // The same invariant in the units it was asked for: total snout depth off the face,
      // counted in nose-depths, between 1 and 2. It is the gap plus one by construction -- the
      // whole snout is the bare part plus the nose itself -- but stating it both ways is what
      // makes the requirement legible next to the number that implements it. Measured across
      // 4000 draws: 1.000 to 1.450, where the code before the gap constraint gave 1.27 to 3.12.
      assert.ok(worstGap + 1 <= 2 && bestGap + 1 >= 1,
        `lion: a snout must be 1 to 2 nose-depths off the face -- got `
        + `${(bestGap + 1).toFixed(3)} to ${(worstGap + 1).toFixed(3)}`);
    } finally {
      Math.random = real;
    }
  }

  // teeth: the assertions above must be able to fail. Both of these were real bugs on screen.
  // A gap of ZERO, not a number near the shipped floor. The first version of this pinned 1.80
  // and went stale the moment the spikes let the bases pull in to spread 0.88 -- a tuned number
  // measures the tuning, where "a mane with no face gap is a hood" stays true by construction.
  assert.ok(inspect({ ...kit.defaults, maneFaceGap: 0 }).overEye > 0,
    'lion: a mane with no face gap is a hood and must cover the eyes -- if it does not, the eye '
    + 'check is measuring nothing');
  assert.ok(protrusion({ ...kit.defaults, muzzleStart: 0.24 }) < 0,
    'lion: a 0.24 muzzle start is meant to bury the snout -- that was the first shipped bug');
  assert.ok(snoutGap({ ...kit.defaults, muzzleLength: 0.105 }) > 0.5,
    'lion: muzzleLength 0.105 is meant to read as a fox -- it was the shipped default, and if it '
    + 'now passes the band then the nose or the head moved and the band needs re-measuring');
}

// --- the lion's ear point is part of the ear, not stuck on it -----------------------------------
//
// The point is a cone added to the leaf the shared addEars() builds. Sized from a constant it
// reads as a tuft: the first version used earWidth * 0.92 at a height where the leaf is already
// at its FULL earWidth, so the leaf bulged out around the cone base and only 0.045 * earLength of
// apex cleared the top. "The triangles don't widen when the ear widens" is exactly that -- 0.92
// of the leaf's MAXIMUM, not 1.0 of its width where they actually meet.
//
// So the assertion is tangency: the cone's base radius must equal the leaf's own half-width at
// the junction height, which makes it track earWidth and earFlatten for free. That is why
// addEars now records size/midY/halfH on the joint instead of the species re-deriving them.
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
    // the point is whichever reaches higher; order is an implementation detail
    const [leaf, tip] = meshes[0].maxY > meshes[1].maxY ? [meshes[1], meshes[0]] : meshes;
    // the leaf is an ellipsoid: its half-width at the tip's base height
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

  // and it has to actually clear the leaf, or there is no point to see
  for (const earPoint of [kit.defaults.earPoint, ...R.earPoint]) {
    const m = measure({ ...kit.defaults, earPoint });
    assert.ok(m.past > m.length * 0.10,
      `lion: the point must clear the leaf -- only ${m.past.toFixed(4)} at earPoint ${earPoint}`);
  }

  // teeth: the constant that caused this must fail the tangency check
  {
    const m = measure(kit.defaults);
    assert.ok(Math.abs((m.leafAtJoin * 0.92) / m.leafAtJoin - 1) > 0.02,
      'lion: a 0.92 constant is meant to fail tangency -- if 0.02 no longer catches it the '
      + 'tolerance is too loose to measure anything');
  }
}

// --- a scallop shell is left-right symmetric ----------------------------------------------------
//
// scallopAngles used to lay its columns out from +X while skipFront cuts its gap about +Z, so
// which columns survived was an accident of where the first one landed. The shells were not
// mirror-symmetric at ANY count -- measured 0.0% mirror-match on the owl's plumage and wings and
// 0.1% on the llama's fleece, against 94.2% for an ordinary body mesh. With small, numerous domes
// nobody could see it. At perRow 3 it puts the entire mane down one side of the head and reads as
// the shell having been rotated 90 degrees, which is how it was finally spotted.
//
// perRow 3 is the case to assert, not the default: three columns is the coarsest the shell
// allows, so it is where a misaligned grid is impossible to miss. The face gap is swept too,
// because the bug was in the INTERACTION -- the gap decides which columns die.
{
  // Mirror the x coordinates, sort both, compare. Aggregate on purpose: a single scallop's own
  // vertices are NOT mirror-symmetric (the sphere and cone primitives carry a seam), so a
  // per-vertex pairing test reads 73.7% on a perfectly symmetric three-column shell and is
  // measuring the primitive rather than the arrangement.
  //
  // A centroid test is not enough either -- it was tried. With the old code at perRow 3 and no
  // face gap the centroid sits at ~0 while the shell is plainly lopsided (sorted-mirror 9.6e-2),
  // because two columns can balance about x=0 without being mirror images.
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
      if (!mane) continue;                       // every column culled is a separate concern
      // 1e-6 sits a long way below the 9.6e-2 the bug produced and a long way above the 5e-17
      // float noise a symmetric shell leaves behind.
      const m = asymmetry(mane);
      assert.ok(m < 1e-6,
        `lion: the mane must be left-right symmetric -- asymmetry ${m.toExponential(2)} `
        + `at perRow ${manePerRow}, face gap ${maneFaceGap}`);
    }
  }

  // and with the rows staggered, which shifts alternate rows by half a column
  for (const manePerRow of [3, 11]) {
    const m = asymmetry(maneOf({ manePerRow, maneStagger: true }));
    assert.ok(m < 1e-6,
      `lion: a staggered mane must be symmetric too -- ${m.toExponential(2)} `
      + `at perRow ${manePerRow}`);
  }
}

// --- a declared preset hook actually does something ---------------------------------------------
//
// Every species declares `presetKey` and `onPresetChange`, and until now NOTHING read them -- so
// each species' preset slider set an integer no builder looks at, and the presets only ever
// reached the character through randomise. The checker wires them now, which makes the
// declaration load-bearing, so it is worth one assertion that the contract holds.
//
// The failure this guards is silent in exactly the same way: a presetKey naming a param that does
// not exist, or a preset table whose entries write nothing, leaves a slider that moves and does
// nothing rather than throwing.
{
  for (const id of speciesIds()) {
    const kit = getSpecies(id);
    if (!kit.presetKey && !kit.onPresetChange) continue;      // a species may have no presets
    assert.ok(kit.presetKey && kit.onPresetChange,
      `${id}: presetKey and onPresetChange are one contract -- declaring half of it gives a `
      + 'slider that silently does nothing');
    assert.ok(kit.presetKey in kit.defaults,
      `${id}: presetKey "${kit.presetKey}" must be a real param, or the slider never appears`);

    // walking the presets must actually move other params, and must land back where it started
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

    // out-of-range indices wrap rather than throwing: the slider's max is a list length that
    // changes whenever a preset is added
    for (const i of [-3, 999]) {
      kit.onPresetChange(P, i);
      for (const [k, v] of Object.entries(P)) {
        assert.ok(!Number.isNaN(v), `${id}: preset index ${i} left ${k} NaN`);
      }
    }
  }
}

// --- an ear stays attached to the head ----------------------------------------------------------
//
// spread/lift/back are three fractions a species picks independently, and headRadius times them
// lands inside the skull only by luck. Push spread up and the base leaves the head: the lion
// detached at earSpread 0.90 and the llama at 0.75, both well inside their own GUI sliders. Tilt
// never detaches an ear on its own (0.755..0.832 across the whole tilt range) but it compounds --
// at spread 0.75 the lion measured 0.871 leaning one way and 0.970 the other.
//
// It cannot be fixed on a sphere: each head is an ellipsoid with its own proportions (llama 0.80
// wide, owl 1.06), which is why the species passes headScale to addEars rather than addEars
// guessing. This walks EVERY species, because the bug was in the shared function and only two of
// the three had been looked at.
{
  // the ellipsoid each species scales its head sphere by. Duplicated from the kits on purpose:
  // if a kit changes its head shape and forgets to pass the new one to addEars, this should fail.
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
    return best;   // < 1 means some of the ear is inside the head ellipsoid
  };

  for (const id of Object.keys(HEAD)) {
    if (!getSpecies(id)) continue;
    // the whole GUI span, not the randomisation span: this is a hand-tuning bug and the sliders
    // are what the user actually drags
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

// --- the mane has enough rows to be a mane ------------------------------------------------------
//
// Below five rows it stops reading as a mane whatever else is set -- a handful of long spikes is
// a wolf's ruff or a hedgehog. That is a judgement made at the lab and it cannot be measured from
// here, so what is asserted is only that the floor is applied EVERYWHERE it needs to be: the
// default, every preset, and the slider's own minimum. Those are three separate places and the
// presets are the ones randomise actually draws from.
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

  // the slider too: a range whose bottom half produces nothing usable is a trap, not a control
  const rowsEntry = kit.gui.mane.find((e) => e[0] === 'maneRows');
  assert.ok(rowsEntry, 'lion: maneRows must still be on the mane folder');
  assert.ok(rowsEntry[1] >= MIN,
    `lion: the maneRows slider starts at ${rowsEntry[1]}, below the ${MIN} floor`);
}

// --- an eye has to show some white ------------------------------------------------------------
//
// eyeFront is a fraction of headRadius. The depth of skull the eye has to clear is not: it falls
// out of eyeSpread, eyeLift and the species' own head ellipsoid, which is 0.80 wide on the llama
// and 1.06 on the owl. Four numbers drawn independently, and the one that has to win is the one
// that cannot see the other three -- so the eye landed in front of the skin only by luck.
//
// It was not luck on the lion: its SHIPPED default had the white 0.0017 BEHIND the skin, so what
// showed on screen was the pupil alone, stuck on a bare face. Measured as a multiple of the
// white's own depth, before eyeSeat: lion default -0.04, and worst randomiser corners of -0.97
// (lion), -0.26 (llama), -0.05 (owl). The GUI sliders reached -21x.
//
// Asserted across the corners rather than at the defaults, because the corners are what the
// randomiser ships and they were an order of magnitude worse than any default.
{
  // eyeSeat's own floor is 0.25 of the white's depth; this sits below it so the assertion fires
  // on an eye sinking into the skull rather than on a tuning pass that moves the floor.
  const MIN_PROUD = 0.15;
  const EYE_KEYS = ['eyeRadius', 'eyeSpread', 'eyeLift', 'eyeFront', 'headRadius'];

  // off the BUILT character: eyeSeat is what is under test, so reading eyeFront back out of the
  // params would measure the input and miss the clamp entirely
  const proudness = (id, P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, id);
    let head = null;
    for (const c of built.joints.head.children) {
      if (c.isMesh && c.geometry?.type === 'SphereGeometry' && !head) head = c.scale.toArray();
    }
    assert.ok(head, `${id}: expected a sphere head to measure the eye against`);
    const eye = built.joints.eye[0].node.position;
    const depth = P.eyeRadius * 0.55;                 // eyeWhiteDepth, private to npc.js
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

// --- the mane hangs round the head, is rooted in it, and does not ring a bald patch -------------
//
// Three separate ways the halo comes off wrong, all of them the same shape of bug as earSeat and
// eyeSeat: parameters that have to agree about the skull, set independently by people who cannot
// see each other. Walked over every preset crossed with the randomiser's own corners, because
// every one of these was found at a corner and none of them at a default.
{
  const kit = getSpecies('lion');
  const D = { ...BASE_PARAMS, ...kit.defaults };
  const KEYS = ['maneDrop', 'maneTall', 'maneTouch', 'maneFaceGap'];
  const spans = KEYS.map((k) => kit.randomRanges[k]);
  const corners = [];
  for (const preset of [{}, ...MANE_PRESETS]) {
    for (let m = 0; m < (1 << KEYS.length); m++) {
      const P = { ...D, ...preset };
      KEYS.forEach((k, j) => { P[k] = spans[j][(m >> j) & 1]; });
      corners.push(P);
    }
  }
  const where = (P) => `${KEYS.map((k) => `${k}=${P[k]}`).join(' ')} rows=${P.maneRows} `
    + `bottom=${P.maneBottom} spread=${P.maneSpread}`;

  // 1. Rooted. maneTall stretches the shell in Y and only maneDrop re-centres it, so at maneTall
  //    1.2 with a legal maneDrop of 0.08 the top ring of spikes stood clear of a skull 0.94 tall
  //    and floated. Measured before maneSeat: 1.21 at the worst corner, and 1.06 at maneDrop 0
  //    rising to 1.27 at -0.20 -- the whole negative half of that slider was floating manes.
  //    1.0 is a base exactly on the skin, so anything at or past it has nothing holding it on.
  //
  //    Two halves, and the second one is the half that matters. `worst` alone only proves the
  //    SOLVER is right -- it recomputes the seated drop from the params, so deleting the seat
  //    from addMane left it passing. The mesh's own y is what says the shipped geometry uses it.
  for (const P of corners) {
    const { worst, drop } = maneSeat(P);
    assert.ok(worst < 1,
      `lion: every upper spike base must be inside the skull -- worst ${worst.toFixed(3)} of the `
      + `head's own radius at ${where(P)}`);
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);   // without this shell.matrix is identity and the vertex
    let shell = null;                     // scan below reads unplaced geometry and finds nothing
    built.joints.head.traverse((c) => { if (c.name === 'mane') shell = c; });
    assert.ok(shell, `lion: no mane shell to measure at ${where(P)}`);
    assert.ok(Math.abs(shell.position.y + P.headRadius * drop) < 1e-9,
      `lion: the mane shell must hang at the SEATED drop -- sits at `
      + `${shell.position.y.toFixed(4)}, seat wants ${(-P.headRadius * drop).toFixed(4)} `
      + `at ${where(P)}`);

    // and no curl in front of an eye. The existing face-gap scan walks the span with the DEFAULT
    // counts; the gap quantises by manePerRow, so it takes a preset's own column count crossed
    // with the span to catch the leak -- preset 1's 13 columns put 16 vertices over an eye at a
    // gap the default was clear at.
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

  // 2. No bald patch. maneTop moves the top row off the crown; how far it may go before bare head
  //    shows through the middle depends on the curl size (both counts, and maneTouch), on maneFlat
  //    and on where manePush and the seated drop put the shell -- which is why this is measured
  //    rather than bounded by a constant. Negative is covered. Worst across all corners: -0.116.
  for (const P of corners) {
    const gap = maneCrownGap(P);
    assert.ok(gap <= 0,
      `lion: the mane must cover the crown, not ring a bald patch -- ${gap.toFixed(3)} rad of `
      + `bare head at maneTop=${P.maneTop} ${where(P)}`);
  }

  // 3. Long enough to be a mane. Above the equator it is a cap sitting on the head rather than a
  //    mane hanging round it. Same three sites as the row floor -- default, presets, slider --
  //    because the presets are what randomise draws from and the slider is what a tuner drags.
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

  // and the drop slider, whose negative half maneSeat would now silently clamp away
  const dropEntry = kit.gui.mane.find((e) => e[0] === 'maneDrop');
  assert.ok(dropEntry && dropEntry[1] >= 0,
    `lion: the maneDrop slider starts at ${dropEntry?.[1]} -- a mane never sits ABOVE the skull `
    + 'it grows from, and maneSeat clamps the whole negative half back to the same value');
}

console.log('npc.js rig self-check: all assertions passed');
