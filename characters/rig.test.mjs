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
  DANCES, DANCE_NAMES, makeDance, stepDance,
} from './npc.js';
import './owl.js';
import './llama.js';
import './lion.js';

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

// --- the lion's mane frames the face ------------------------------------------------------------
//
// A mane is a halo around a BARE face; if it closes over the muzzle it is a hood, and the
// character loses the only feature that carries expression. `skipFront` culls dome CENTRES, but
// each dome still has a radius, so the curls flanking the gap spill across it -- which is why the
// authored gap has to be much wider than the opening you actually want. The first default here
// (1.70) buried the muzzle and looked entirely reasonable in the source.
//
// Measured in HEAD-LOCAL space and banded to the face, because the crown domes wrap over the top
// where the XZ angle is meaningless -- an unbanded "closest vertex to +Z" reads 0.003 rad no
// matter how wide the gap is, and so reports a buried face as a clear one.
{
  const kit = getSpecies('lion');

  const maneOf = (P) => {
    const built = createCharacter({ ...BASE_PARAMS, ...P, mergeMeshes: false }, 'lion');
    built.root.updateMatrixWorld(true);
    let mane = null;
    built.joints.head.traverse((c) => { if (c.name === 'mane') mane = c; });
    return mane;
  };

  const reach = (P) => {
    const mane = maneOf(P);
    assert.ok(mane, 'the mane shell must exist -- scallopGeometry returns null when every dome '
      + 'falls inside the face gap, which presents as a lion with no mane at all');
    const lo = -P.headRadius * P.muzzleDrop - P.muzzleWidth;
    const hi = P.headRadius * P.eyeLift + P.eyeRadius;
    const pos = mane.geometry.attributes.position;
    const v = new THREE.Vector3();
    let frontZ = -Infinity, maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mane.matrix);
      maxR = Math.max(maxR, Math.hypot(v.x, v.z));
      if (v.y >= lo && v.y <= hi) frontZ = Math.max(frontZ, v.z);
    }
    return { frontZ, maxR };
  };

  const muzzleTip = (P) => P.headRadius * 0.24 + P.muzzleLength;

  // Both ends of the randomisation span, not just the default: the span is what ships, and its
  // floor was wrong too. 2.20 is the floor because 2.10 is the first clear value and the gap
  // quantises by manePerRow.
  for (const maneFaceGap of [kit.defaults.maneFaceGap, 2.20, 3.10]) {
    const P = { ...kit.defaults, maneFaceGap };
    const { frontZ, maxR } = reach(P);
    const tip = muzzleTip(P);
    assert.ok(frontZ < tip,
      `lion: mane must not close over the muzzle at gap ${maneFaceGap} -- `
      + `mane reaches z ${frontZ.toFixed(4)}, muzzle tip is ${tip.toFixed(4)}`);

    // Stand-off, not mere visibility. "Does any curl poke out of the skull" is almost
    // un-failable: the domes sit PROUD along their normals, so the tips clear a head half-width
    // of 0.1851 even at spread 0.80. The number that matters is how thick the halo reads, and
    // it is calibrated to the shipped span rather than to an eyeballed perceptual threshold --
    // clearance over head half-width measures 0.27 at spread 1.00, 0.48 at the 1.18
    // randomisation floor, 0.67 at the default. 0.40 sits between the floor and failure.
    const headHalf = P.headRadius * 1.04;
    assert.ok(maxR - headHalf > headHalf * 0.40,
      `lion: mane must stand off the skull, not cling to it -- clearance `
      + `${(maxR - headHalf).toFixed(4)} is ${((maxR - headHalf) / headHalf).toFixed(2)}x `
      + `head half-width ${headHalf.toFixed(4)}`);
  }

  // the bottom of the randomisation span has to pass too, not just the default
  {
    const P = { ...kit.defaults, maneSpread: 1.18 };
    const headHalf = P.headRadius * 1.04;
    assert.ok(reach(P).maxR - headHalf > headHalf * 0.40,
      'lion: the maneSpread randomisation floor must still read as a halo');
  }

  // and the regression that started all this
  const bad = { ...kit.defaults, maneFaceGap: 1.70 };
  assert.ok(reach(bad).frontZ > muzzleTip(bad),
    'lion: the 1.70 gap is meant to FAIL -- if it now clears the muzzle then skipFront or the '
    + 'curl sizing changed, and the floor on maneFaceGap needs re-measuring');
}

console.log('npc.js rig self-check: all assertions passed');
