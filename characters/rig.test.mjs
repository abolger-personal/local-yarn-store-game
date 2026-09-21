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
import {
  POSES, POSE_KEYS, MOTION_DEFAULTS, BASE_PARAMS, createCharacter, stepMotion, applyPose,
  valueOf, walkPhase, walkLayer, speciesIds, getSpecies,
} from './npc.js';
import './owl.js';
import './llama.js';

const build = (id) => createCharacter(
  { ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false }, id);

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

console.log('npc.js rig self-check: all assertions passed');
