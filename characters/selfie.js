// The Guestbook selfie: how a character holds the phone, and where the phone is.
//
// What makes a picture read as a selfie rather than a portrait, in order of how much it matters:
// one arm reaching toward the lens, the lens above eye level and off to that arm's side looking
// down, a wide lens held close (so the face is big and the body falls away), and a horizon that is
// not level. Kept apart from the shop's photo studio so it can be checked in node.

import * as THREE from 'three';
import { POSES, applyPose } from './npc.js';

/**
 * Arm 0 (the -x one) out and up toward the lens. The rig has no one-arm channel: armSwingAlt is
 * armSwing's anti-symmetric partner, so equal amounts of both swing arm 0 by twice that and leave
 * arm 1 hanging. Measured on all three species: at -1.0 the hand comes up level with the shoulder
 * and forward of the face; past -1.2 it folds back toward the head.
 */
const ARM = { armSwing: -1.0, armSwingAlt: -1.0, armOut: 0.25, armOutAlt: 0.25, elbowBend: 0.1, earPerk: 0.3 };

/**
 * Ways to take one, tried in this order until one shows what they made. Signs measured: -headYaw
 * turns the face to -x (toward the lens), -headPitch lifts it, -headTilt drops the crown toward -x.
 *
 * close: the face lifted into a wide lens held close. The owl's, tuned by eye: first, so any body
 *   it works for keeps it. Flat faces only: a snout aimed down a close wide lens comes out
 *   enormous whether or not it happens to hide anything, so a long one never gets this shot.
 * high: lifted into a close wide lens, a llama's snout points straight down it, comes out
 *   enormous, and hides its own eyes (2% in view) and its hat (0%). So the nose goes down, the lens
 *   goes up (the crown is what faces it), and the lens is narrower from further back, which takes
 *   out most of the big-nose distortion. Lower only when the hand would be in front of the face.
 * neck: the high shot shows a crown and hides a throat, so a cowl on a long neck disappears under
 *   the snout. Chin up and turned aside, a lower lens: the throat is what faces it.
 */
const STYLES = Object.freeze([
  { name: 'close', pose: { headYaw: -0.35, headPitch: -0.3 }, fov: 62, heights: [0.38], flatFaced: true },
  { name: 'high', pose: { headYaw: -0.2, headPitch: 0.2 }, fov: 40, heights: [0.7, 0.55, 0.38] },
  { name: 'neck', pose: { headYaw: 0.3, headPitch: -0.45 }, fov: 40, heights: [0.15, 0.3, 0.45] },
].map((s) => Object.freeze({ ...s, pose: Object.freeze({ ...POSES.rest, ...ARM, headTilt: -0.15, ...s.pose }) })));

/**
 * The other arm, when what they made is IN it (garments.js HELD_BUILDERS, on holds[1]): swung
 * straight out in front, which turns the hold the way held pieces are built (their up is up).
 * Per side the swing is armSwing - side * armSwingAlt, so this keeps arm 0 at ARM's -2 and puts
 * arm 1 at -1.45.
 */
const SHOW = Object.freeze({ armSwing: -1.725, armSwingAlt: -0.275 });

/**
 * A photo someone else takes from behind (a shot's `behind`, the shawl's): no phone, both arms
 * straight out to the sides to spread what is on their back -- armOut 1.57 brings each paw level
 * with its shoulder, measured the same on all three species -- and the body twisted against the
 * head's turn (shoot), which measured 67-79% of the eyes seen on every species where twisting with it
 * left a lion's at 0%. How far the head itself goes
 * is the species' own (headYawMax): an owl looks straight back, a lion only over its shoulder.
 */
const SPREAD = Object.freeze({ armSwing: 0, armSwingAlt: 0, armOut: 1.57, armOutAlt: 0, elbowBend: 0.05, spineTwist: 0.6 });

/**
 * Authored shots, by what the selfie is of (an outfit key: a garment type, a held decor type, or
 * `pile`), and by species where one needs its own (`owl`, `llama`, `lion`; else `all`). Picked by
 * eye on crowd.html (selfies -> tune), then frozen here. A shot is the head's turn and lift, and a
 * framing for aim(): `up` the lens height (below 0, under the face looking up), `k` how far out
 * (1 is the face framing), `drop`/`off` how far the aim slides from the head (down toward what they
 * made, away from the phone arm), in frame halves, and the lens's `fov`. No shot: searched (STYLES).
 *
 * A fixed framing gives up the search's guarantees (the phone hand out, the eyes in), so each is
 * held to the scored search's rules instead. Generated 2026-10-11 by tools/selfie-tuning/
 * tune-shots.mjs (report: shots-report.md beside it): per species and silhouette (a
 * `type:silhouette` key, shotFor), the shot with the best mean scoreShot over 6 random bodies of the species, each in a random item of that
 * silhouette, and on every one of them the floors garments.test.mjs sets an authored shot. Each
 * comment is that mean and its worst body; `flagged`, under 0.4 after 10 seeds. The hand-tuned table
 * it replaced is in shots-hand-tuned.js; the shawl's shots, from behind, are those hand-tuned ones.
 */
export const SHOTS = {
  'hat:beanie': {
    owl: { headYaw: 0.07, headPitch: -0.16, fov: 37.25, up: 0.93, k: 0.71, drop: -0.27, off: -0.07 },   // 0.410, worst 0.399
    llama: { headYaw: -0.09, headPitch: -0.09, fov: 28.83, up: 1.09, k: 1.01, drop: 0.1, off: 0.04 },   // 0.379, worst 0.374, flagged, its #3: the higher fail the test body
    lion: { headYaw: -0.04, headPitch: 0.09, fov: 35.84, up: 0.61, k: 0.75, drop: -0.18, off: -0.01 },   // 0.393, worst 0.371, flagged
  },
  'hat:slouch': {
    owl: { headYaw: -0.43, headPitch: 0.23, fov: 45.71, up: 0.51, k: 0.72, drop: -0.27, off: 0.08 },   // 0.442, worst 0.429
    llama: { headYaw: -0.14, headPitch: 0.07, fov: 25, up: 0.63, k: 0.93, drop: -0.49, off: -0.09 },   // 0.430, worst 0.416
    lion: { headYaw: -0.03, headPitch: 0.12, fov: 25.38, up: 0.52, k: 0.72, drop: -0.5, off: -0.22 },   // 0.420, worst 0.301
  },
  'hat:fisherman': {
    owl: { headYaw: -0.14, headPitch: 0.11, fov: 49.84, up: 0.6, k: 0.74, drop: -0.12, off: 0.08 },   // 0.420, worst 0.393, its #4: the higher fail the test body
    llama: { headYaw: 0.04, headPitch: 0.12, fov: 26.87, up: 0.58, k: 0.97, drop: -0.16, off: 0.03 },   // 0.346, worst 0.278, flagged
    lion: { headYaw: 0.1, headPitch: -0.05, fov: 29.95, up: 0.79, k: 0.74, drop: -0.19, off: -0.05 },   // 0.392, worst 0.361, its #6: the higher fail the test body
  },
  'hat:beret': {
    owl: { headYaw: -0.39, headPitch: 0.2, fov: 40.28, up: 0.54, k: 0.74, drop: -0.27, off: 0.15 },   // 0.458, worst 0.446
    llama: { headYaw: -0.18, headPitch: -0.02, fov: 25.47, up: 0.96, k: 0.9, drop: -0.29, off: 0.06 },   // 0.422, worst 0.410
    lion: { headYaw: -0.29, headPitch: 0.12, fov: 27.36, up: 0.72, k: 0.73, drop: -0.2, off: 0.07 },   // 0.455, worst 0.390
  },
  'hat:earflap': {
    owl: { headYaw: -0.18, headPitch: -0.02, fov: 27.09, up: 0.82, k: 0.69, drop: -0.19, off: 0.08 },   // 0.446, worst 0.409
    llama: { headYaw: 0, headPitch: -0.01, fov: 26.57, up: 0.97, k: 0.96, drop: 0.09, off: -0.02 },   // 0.373, worst 0.310, flagged
    lion: { headYaw: -0.15, headPitch: -0.09, fov: 29.01, up: 0.77, k: 0.7, drop: -0.2, off: 0.01 },   // 0.426, worst 0.398
  },
  'hat:hood': {
    owl: { headYaw: 0.72, headPitch: -0.91, fov: 37.98, up: 1.16, k: 0.72, drop: -0.05, off: 0.02 },   // 0.403, worst 0.337
    llama: { headYaw: 0.53, headPitch: -0.7, fov: 34.18, up: 0.67, k: 1.04, drop: 0.24, off: 0.2 },   // 0.340, worst 0.296, flagged
    lion: { headYaw: -0.32, headPitch: -0.14, fov: 27.24, up: 1.16, k: 0.6, drop: -0.07, off: 0.04 },   // 0.382, worst 0.280, flagged
  },
  'hat:headband': {
    owl: { headYaw: -0.04, headPitch: 0.09, fov: 39.02, up: 0.69, k: 0.73, drop: -0.15, off: 0.09 },   // 0.402, worst 0.375
    llama: { headYaw: 0.16, headPitch: -0.02, fov: 34.56, up: 0.55, k: 0.97, drop: -0.05, off: -0.06 },   // 0.361, worst 0.323, flagged
    lion: { headYaw: -0.01, headPitch: -0.32, fov: 61.46, up: 1.19, k: 0.67, drop: -0.3, off: -0.08 },   // 0.393, worst 0.381, its #6: the higher fail the test body
  },
  'hat:bucket': {
    owl: { headYaw: 0.09, headPitch: -0.05, fov: 31.35, up: 0.85, k: 0.73, drop: -0.08, off: 0.02 },   // 0.450, worst 0.446
    llama: { headYaw: -0.1, headPitch: -0.11, fov: 31.13, up: 0.87, k: 1.01, drop: 0.18, off: -0.04 },   // 0.394, worst 0.375, flagged, its #2: the higher fail the test body
    lion: { headYaw: 0.01, headPitch: -0.17, fov: 36.88, up: 1.12, k: 0.68, drop: -0.08, off: 0.02 },   // 0.455, worst 0.435, its #2: the higher fail the test body
  },
  'hat:cloche': {
    owl: { headYaw: -0.16, headPitch: 0.16, fov: 37.09, up: 0.57, k: 0.74, drop: -0.07, off: 0.01 },   // 0.431, worst 0.379
    llama: { headYaw: 0.06, headPitch: 0.19, fov: 36.71, up: 0.35, k: 0.97, drop: 0.14, off: 0 },   // 0.362, worst 0.283, flagged, its #2: the higher fail the test body
    lion: { headYaw: -0.12, headPitch: -0.03, fov: 31.3, up: 0.71, k: 0.73, drop: -0.1, off: 0.01 },   // 0.427, worst 0.419
  },
  'hat:pixie': {
    owl: { headYaw: -0.16, headPitch: 0, fov: 25, up: 0.88, k: 0.71, drop: -0.39, off: 0.03 },   // 0.441, worst 0.431
    llama: { headYaw: -0.18, headPitch: 0.02, fov: 25.43, up: 0.91, k: 0.95, drop: -0.26, off: 0.07 },   // 0.405, worst 0.390
    lion: { headYaw: 0.02, headPitch: 0.06, fov: 25.36, up: 0.6, k: 0.74, drop: -0.33, off: -0.06 },   // 0.436, worst 0.428
  },
  'scarf:cowl': {
    owl: { headYaw: -0.22, headPitch: -0.93, fov: 33.65, up: 0.38, k: 0.82, drop: 0.54, off: 0.28 },   // 0.317, worst 0.280, flagged
    llama: { headYaw: 0.2, headPitch: -0.84, fov: 32.06, up: 0.65, k: 1.11, drop: 0.68, off: 0.25 },   // 0.411, worst 0.360
    lion: { headYaw: 0.04, headPitch: -0.23, fov: 66.46, up: -0.02, k: 0.81, drop: 0.32, off: 0.19 },   // 0.392, worst 0.325, flagged
  },
  'scarf:infinity': {
    owl: { headYaw: -0.66, headPitch: -0.39, fov: 64.75, up: 0.29, k: 0.89, drop: 0.55, off: 0.26 },   // 0.373, worst 0.309, flagged
    llama: { headYaw: -1, headPitch: 0.47, fov: 41.81, up: -0.36, k: 0.95, drop: 0.51, off: 0.33 },   // 0.395, worst 0.375, flagged
    lion: { headYaw: 0, headPitch: -0.15, fov: 39.76, up: 0.07, k: 0.78, drop: 0.51, off: 0.15 },   // 0.404, worst 0.343
  },
  'scarf:ascot': {
    owl: { headYaw: 0.39, headPitch: 0.11, fov: 67.54, up: 0.01, k: 0.84, drop: 0.44, off: 0.36 },   // 0.377, worst 0.302, flagged
    llama: { headYaw: 0.37, headPitch: -0.08, fov: 36.17, up: 0.05, k: 1.04, drop: 0.71, off: 0.32 },   // 0.445, worst 0.416
    lion: { headYaw: -0.81, headPitch: -0.18, fov: 64.88, up: 0.13, k: 0.82, drop: 0.44, off: 0.17 },   // 0.408, worst 0.382
  },
  'scarf:long': {
    owl: { headYaw: -0.79, headPitch: -0.08, fov: 49.88, up: -0.38, k: 0.71, drop: 0.52, off: 0.2 },   // 0.406, worst 0.369
    llama: { headYaw: 0.2, headPitch: 0.34, fov: 25.62, up: -0.31, k: 0.96, drop: 0.82, off: 0.3 },   // 0.415, worst 0.318
    lion: { headYaw: 0.2, headPitch: 0.34, fov: 65.34, up: -0.05, k: 0.79, drop: 0.72, off: 0.16 },   // 0.461, worst 0.296
  },
  'scarf:trailing': {
    owl: { headYaw: -0.03, headPitch: -0.93, fov: 31.21, up: 0.89, k: 0.71, drop: -0.24, off: -0.23 },   // 0.345, worst 0.277, flagged, its #3: the higher fail the test body
    llama: { headYaw: 0, headPitch: -0.68, fov: 43.68, up: 1.19, k: 1.03, drop: 0.16, off: -0.18 },   // 0.350, worst 0.235, its #6: the higher fail the test body
    lion: { headYaw: -0.08, headPitch: 0.59, fov: 33.46, up: -0.02, k: 0.77, drop: 1.04, off: 0.18 },   // 0.370, worst 0.330, flagged
  },
  'scarf:skinny': {
    owl: { headYaw: -0.23, headPitch: -0.53, fov: 40.16, up: 0.41, k: 0.89, drop: 0.78, off: 0.3 },   // 0.379, worst 0.318, flagged, its #2: the higher fail the test body
    llama: { headYaw: 0.35, headPitch: 0.95, fov: 25.36, up: -0.77, k: 0.85, drop: 1.32, off: -0.07 },   // 0.353, worst 0.308, flagged
    lion: { headYaw: 0.11, headPitch: 0.19, fov: 67.51, up: 0.21, k: 0.87, drop: 0.72, off: 0.14 },   // 0.411, worst 0.354
  },
  'scarf:kerchief': {
    owl: { headYaw: -0.21, headPitch: -0.79, fov: 41.79, up: 0.28, k: 0.83, drop: 0.54, off: 0.31 },   // 0.396, worst 0.358, flagged
    llama: { headYaw: 0.38, headPitch: 0.13, fov: 26.98, up: 0.52, k: 1.12, drop: 1, off: 0.26 },   // 0.385, worst 0.360, flagged
    lion: { headYaw: 0.09, headPitch: 0.31, fov: 65.77, up: -0.12, k: 0.71, drop: 0.56, off: 0.02 },   // 0.408, worst 0.361
  },
  'scarf:chunky wrap': {
    owl: { headYaw: -0.27, headPitch: -0.52, fov: 51.31, up: 0.37, k: 0.86, drop: 0.67, off: 0.18 },   // 0.407, worst 0.344
    llama: { headYaw: 0.3, headPitch: 0.6, fov: 28.75, up: -0.39, k: 0.95, drop: 0.88, off: 0.05 },   // 0.459, worst 0.340
    lion: { headYaw: 0.06, headPitch: 0.29, fov: 65.8, up: -0.13, k: 0.77, drop: 0.71, off: 0.22 },   // 0.419, worst 0.362
  },
  'sweater:pullover': {
    owl: { headYaw: -0.05, headPitch: 0.39, fov: 65.65, up: -0.23, k: 0.7, drop: 0.79, off: 0.06 },   // 0.410, worst 0.378
    llama: { headYaw: 0.41, headPitch: 0.29, fov: 33.46, up: -0.08, k: 1.24, drop: 0.87, off: 0.23 },   // 0.356, worst 0.331, flagged
    lion: { headYaw: 0.07, headPitch: 0.49, fov: 69.48, up: -0.21, k: 0.71, drop: 0.83, off: 0.08 },   // 0.444, worst 0.385
  },
  'sweater:cardigan': {
    owl: { headYaw: 0.29, headPitch: 0.36, fov: 48.96, up: -0.36, k: 0.67, drop: 0.71, off: 0.17 },   // 0.424, worst 0.336
    llama: { headYaw: -0.26, headPitch: 0.9, fov: 39.27, up: 0.15, k: 1.06, drop: 1.06, off: 0.2 },   // 0.380, worst 0.309, flagged
    lion: { headYaw: -0.08, headPitch: 0.46, fov: 66.67, up: -0.22, k: 0.69, drop: 0.87, off: -0.01 },   // 0.456, worst 0.417
  },
  'sweater:vest': {
    owl: { headYaw: 0.07, headPitch: 0.54, fov: 44.81, up: -0.81, k: 0.63, drop: 0.85, off: 0.03 },   // 0.407, worst 0.368
    llama: { headYaw: -0.09, headPitch: 0.9, fov: 40.74, up: 0.01, k: 1.13, drop: 1.04, off: 0.22 },   // 0.374, worst 0.312, flagged, its #5: the higher fail the test body
    lion: { headYaw: 0.02, headPitch: 0.57, fov: 68.33, up: -0.32, k: 0.65, drop: 0.89, off: 0.02 },   // 0.478, worst 0.404
  },
  'sweater:turtleneck': {
    owl: { headYaw: -0.29, headPitch: 0.36, fov: 53.04, up: -0.48, k: 0.7, drop: 0.63, off: 0.25 },   // 0.407, worst 0.296
    llama: { headYaw: 0.32, headPitch: -0.13, fov: 43.37, up: 0.52, k: 1.21, drop: 0.81, off: 0.35 },   // 0.398, worst 0.349, its #3: the higher fail the test body
    lion: { headYaw: 0.04, headPitch: 0.55, fov: 70, up: -0.21, k: 0.71, drop: 0.81, off: 0.07 },   // 0.445, worst 0.370
  },
  'sweater:cropped': {
    owl: { headYaw: -0.02, headPitch: 0.28, fov: 65.21, up: -0.51, k: 0.65, drop: 0.66, off: 0.07 },   // 0.435, worst 0.418
    llama: { headYaw: 0.28, headPitch: 0.5, fov: 40.43, up: 0.01, k: 1.38, drop: 0.88, off: 0.16 },   // 0.351, worst 0.331, its #4: the higher fail the test body
    lion: { headYaw: 0.19, headPitch: 0.26, fov: 67.88, up: -0.25, k: 0.72, drop: 0.66, off: 0.09 },   // 0.419, worst 0.339
  },
  'sweater:tunic': {
    owl: { headYaw: 0.26, headPitch: 0.43, fov: 67.74, up: -0.35, k: 0.67, drop: 0.82, off: 0.16 },   // 0.414, worst 0.328
    llama: { headYaw: 0.08, headPitch: -0.06, fov: 44.01, up: 0.87, k: 1.37, drop: 0.92, off: 0.36 },   // 0.372, worst 0.342, its #5: the higher fail the test body
    lion: { headYaw: 0.28, headPitch: 0.41, fov: 51.54, up: -0.24, k: 0.73, drop: 0.87, off: 0.17 },   // 0.438, worst 0.374
  },
  'sweater:raglan': {
    owl: { headYaw: -0.06, headPitch: 0.41, fov: 65.79, up: -0.23, k: 0.7, drop: 0.81, off: 0.05 },   // 0.424, worst 0.352
    llama: { headYaw: 0.08, headPitch: 0.32, fov: 43.28, up: 0.75, k: 1.35, drop: 1.03, off: 0.3 },   // 0.361, worst 0.289, flagged, its #2: the higher fail the test body
    lion: { headYaw: 0.18, headPitch: 0.29, fov: 69.96, up: -0.35, k: 0.69, drop: 0.63, off: 0.11 },   // 0.422, worst 0.333
  },
  'bag:shoulder bag': {
    owl: { headYaw: 0.5, headPitch: -0.07, fov: 43.2, up: 1.25, k: 1.04, drop: 0.67, off: 0.71 },   // 0.358, worst 0.319, flagged
    llama: { headYaw: 0.2, headPitch: 0.39, fov: 35.51, up: 0.82, k: 1.39, drop: 1.13, off: 0.74 },   // 0.376, worst 0.369, flagged
    lion: { headYaw: 0.85, headPitch: 0.36, fov: 69.8, up: -0.18, k: 0.92, drop: 0.42, off: 0.79 },   // 0.390, worst 0.383, flagged
  },
  'bag:market bag': {
    owl: { headYaw: 0.19, headPitch: -0.03, fov: 35.19, up: 1.33, k: 0.97, drop: 0.68, off: 0.71 },   // 0.355, worst 0.333, flagged
    llama: { headYaw: 0.02, headPitch: 0.7, fov: 34.74, up: 0.4, k: 1.24, drop: 1, off: 0.82 },   // 0.375, worst 0.369, flagged
    lion: { headYaw: 0.53, headPitch: 0.45, fov: 67.14, up: -0.34, k: 0.9, drop: 0.31, off: 0.84 },   // 0.392, worst 0.387, flagged
  },
  'bag:backpack': {
    owl: { headYaw: 0.7, headPitch: 0.48, fov: 69.3, up: -0.04, k: 0.93, drop: 0.32, off: 0.73 },   // 0.391, worst 0.379, flagged
    llama: { headYaw: 0.42, headPitch: 0.95, fov: 32.52, up: -0.32, k: 1.01, drop: 0.91, off: 0.94 },   // 0.403, worst 0.389
    lion: { headYaw: 0.65, headPitch: 0.04, fov: 57.49, up: -0.53, k: 0.85, drop: 0.24, off: 0.78 },   // 0.409, worst 0.394
  },
  'bag:tote': {
    owl: { headYaw: -0.32, headPitch: -0.45, fov: 68.29, up: 1.49, k: 0.99, drop: 0.29, off: 0.49 },   // 0.350, worst 0.331, flagged
    llama: { headYaw: 0.13, headPitch: 0.81, fov: 69.48, up: 0.46, k: 1.55, drop: 0.77, off: 0.63 },   // 0.373, worst 0.369, flagged
    lion: { headYaw: 0.48, headPitch: 0.68, fov: 68.88, up: -0.59, k: 0.85, drop: 0.25, off: 0.78 },   // 0.391, worst 0.385, flagged
  },
  'bag:bucket bag': {
    owl: { headYaw: 0.45, headPitch: 0.03, fov: 44.89, up: 1.18, k: 1.07, drop: 0.72, off: 0.69 },   // 0.372, worst 0.370, flagged
    llama: { headYaw: 0.3, headPitch: 0.99, fov: 32.29, up: -0.11, k: 1.05, drop: 1.03, off: 0.82 },   // 0.376, worst 0.374, flagged
    lion: { headYaw: 0.72, headPitch: 0.43, fov: 68.75, up: -0.25, k: 0.9, drop: 0.37, off: 0.78 },   // 0.381, worst 0.374, flagged
  },
  'bag:crossbody pouch': {
    owl: { headYaw: 0.36, headPitch: 0.1, fov: 42.06, up: 0.99, k: 1, drop: 0.73, off: 0.5 },   // 0.270, worst 0.172, flagged
    llama: { headYaw: -0.03, headPitch: 0.96, fov: 39.15, up: 0.16, k: 1.18, drop: 1.03, off: 0.77 },   // 0.364, worst 0.358, flagged
    lion: { headYaw: -0.14, headPitch: 0.71, fov: 29.76, up: -0.97, k: 0.77, drop: 0.33, off: 0.68 },   // 0.363, worst 0.357, flagged
  },
  'bag:drawstring bag': {
    owl: { headYaw: -0.03, headPitch: -0.72, fov: 57.03, up: 0.62, k: 1.04, drop: 0.6, off: 0.64 },   // 0.368, worst 0.365, flagged
    llama: { headYaw: 0.35, headPitch: 0.75, fov: 30.6, up: 0.05, k: 1.11, drop: 0.97, off: 0.92 },   // 0.382, worst 0.380, flagged
    lion: { headYaw: 0.76, headPitch: 0.11, fov: 62.2, up: -0.43, k: 0.87, drop: 0.29, off: 0.83 },   // 0.388, worst 0.381, flagged
  },
  'socks:crew': {
    owl: { headYaw: -0.26, headPitch: 0.09, fov: 36.56, up: 0.54, k: 0.94, drop: 1.01, off: 0.38 },   // 0.352, worst 0.316, flagged
    llama: { headYaw: -0.03, headPitch: 0.85, fov: 59.05, up: 0.55, k: 1.43, drop: 0.99, off: 0.29 },   // 0.312, worst 0.267, flagged
    lion: { headYaw: -0.42, headPitch: 0.66, fov: 25.45, up: 0.22, k: 0.83, drop: 1.18, off: 0.21 },   // 0.360, worst 0.338, flagged
  },
  'socks:knee-high': {
    owl: { headYaw: -0.38, headPitch: 0.75, fov: 40.23, up: 0.34, k: 0.9, drop: 1.1, off: 0.27 },   // 0.365, worst 0.342, flagged
    llama: { headYaw: -0.01, headPitch: 0.89, fov: 69.41, up: 0.43, k: 1.39, drop: 0.9, off: 0.27 },   // 0.341, worst 0.329, flagged
    lion: { headYaw: -0.06, headPitch: 0.67, fov: 32.21, up: 0.27, k: 0.85, drop: 1.07, off: 0.16 },   // 0.370, worst 0.348, flagged
  },
  'socks:over-knee': {
    owl: { headYaw: 0.11, headPitch: 0.34, fov: 52.22, up: 0.24, k: 0.9, drop: 0.9, off: 0.32 },   // 0.366, worst 0.339, flagged
    llama: { headYaw: 0.01, headPitch: 0.94, fov: 58.84, up: 0.37, k: 1.3, drop: 0.93, off: 0.26 },   // 0.304, worst 0.249, flagged
    lion: { headYaw: -0.48, headPitch: 0.86, fov: 38.02, up: 0.04, k: 0.8, drop: 1.12, off: 0.24 },   // 0.382, worst 0.365, flagged
  },
  'socks:slouch': {
    owl: { headYaw: -0.04, headPitch: 0.81, fov: 60.19, up: 0.43, k: 0.99, drop: 0.98, off: 0.16 },   // 0.357, worst 0.337, flagged
    llama: { headYaw: -0.02, headPitch: 0.85, fov: 62, up: 0.5, k: 1.39, drop: 0.95, off: 0.27 },   // 0.334, worst 0.299, flagged
    lion: { headYaw: -0.32, headPitch: 0.47, fov: 37.4, up: 0.32, k: 0.87, drop: 0.93, off: 0.23 },   // 0.363, worst 0.343, flagged
  },
  'socks:leg warmers': {
    owl: { headYaw: -0.05, headPitch: 0.12, fov: 26.06, up: 0.24, k: 0.84, drop: 1.02, off: 0.36 },   // 0.333, worst 0.317, flagged
    llama: { headYaw: -0.09, headPitch: 0.98, fov: 62.83, up: 0.42, k: 1.37, drop: 0.96, off: 0.31 },   // 0.298, worst 0.271, flagged
    lion: { headYaw: -0.47, headPitch: 0.74, fov: 33.85, up: 0.02, k: 0.78, drop: 1.11, off: 0.13 },   // 0.341, worst 0.312, flagged
  },
  'socks:slipper socks': {
    owl: { headYaw: -0.25, headPitch: 0.7, fov: 30.87, up: 0.37, k: 0.87, drop: 1.15, off: 0.27 },   // 0.359, worst 0.328, flagged
    llama: { headYaw: 0.04, headPitch: 0.76, fov: 60.31, up: 0.57, k: 1.45, drop: 0.93, off: 0.29 },   // 0.315, worst 0.297, flagged
    lion: { headYaw: -0.31, headPitch: 0.98, fov: 60.01, up: 0.24, k: 0.9, drop: 1.07, off: 0.05 },   // 0.360, worst 0.350, flagged
  },
  'potholder': {
    owl: { headYaw: 0.28, headPitch: 0.39, fov: 57.57, up: -0.92, k: 0.95, drop: -0.19, off: 0.84 },   // 0.380, worst 0.360, flagged
    llama: { headYaw: 0.08, headPitch: 0.22, fov: 37.43, up: 1.3, k: 1.53, drop: 1.15, off: 0.68 },   // 0.371, worst 0.366, flagged
    lion: { headYaw: -0.04, headPitch: -0.67, fov: 35.81, up: 1.43, k: 1.05, drop: 0.83, off: 0.7 },   // 0.373, worst 0.372, flagged
  },
  'pile': {
    owl: { headYaw: 0.43, headPitch: 0.09, fov: 39.24, up: 0.87, k: 0.96, drop: 0.62, off: 0.68 },   // 0.417, worst 0.395
    llama: { headYaw: 0.3, headPitch: 0.97, fov: 51.78, up: -0.34, k: 1.07, drop: 0.59, off: 0.93 },   // 0.436, worst 0.419
    lion: { headYaw: 0.44, headPitch: -0.15, fov: 60.52, up: 0.45, k: 1.03, drop: 0.39, off: 0.82 },   // 0.421, worst 0.388
  },
  shawl: {
    all: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 2.2, drop: 0.35, off: 0, behind: true },
    owl: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 1.51, drop: 0.35, off: 0, behind: true },
  },
};

/**
 * The authored shot of `type` for this species, or null: searched. A species set to null opts out
 * of `all`. A `silhouette` (a hat's 'beret') looks under `type:silhouette` first, and falls back to
 * `type` where that has nothing for the species, not even `all`.
 */
export const shotFor = (type, speciesId, silhouette = null) => {
  const own = SHOTS[`${type}:${silhouette}`] ?? {};
  const shots = Object.hasOwn(own, speciesId) || Object.hasOwn(own, 'all') ? own : SHOTS[type] ?? {};
  return (Object.hasOwn(shots, speciesId) ? shots[speciesId] : shots.all) ?? null;
};

/** A snout longer than the head is wide: a llama's is 1.3-3 head radii, a lion's under 0.5. */
const longSnout = (P) => (P.muzzleLength ?? 0) > P.headRadius;

// How much of what they made, and of their eyes, must be in view for a style to do. A hat's back
// half faces away from any lens. Measured: the owl's own hat shot shows 15-30% of it, and that is
// the shot to keep; a llama's close shot shows 0% of its hat and at most 6% of its eyes.
const ENOUGH = 0.1;

/**
 * Where the lens is from the head: out along arm 0 in front, or, for a shot someone else takes from
 * behind (`back`, the side the head turns to: 1 or -1), behind them on that side.
 */
const lensDir = (up, back = 0) => (back ? new THREE.Vector3(0.42 * back, up, -1) : new THREE.Vector3(-0.42, up, 1)).normalize();
const ROLL = -0.15;                                                        // the held-out phone's tilt
// The face spans half the frame's width: the owl's, tuned by eye, and the one that reads as a selfie.
// Framing head-to-chest instead left a llama's small head on its long neck at a quarter of it, the
// llama a third of the picture away from either edge.
const FACE = 2.95;                // frame half-height, in head radii, at k = 1

const _v = new THREE.Vector3();
const onScreen = (camera, p, m = 1) => {
  _v.copy(p).project(camera);
  return Math.abs(_v.x) <= m && Math.abs(_v.y) <= m && _v.z < 1;
};

/**
 * Put the camera `k` times the face framing's distance out, `up` high, aimed at the head moved
 * `drop` frame halves down (toward what they made) and `off` halves away from arm 0 (off-centre).
 */
function aim(camera, head, half, { up, k, drop, off, back = 0 }) {
  const target = head.clone().add(new THREE.Vector3(off * half * k, -drop * half * k, 0));
  camera.position.copy(target).addScaledVector(lensDir(up, back), (k * half) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.rotateZ(back ? 0 : ROLL);     // a friend holds the camera level
  camera.updateMatrixWorld(true);
}

/**
 * Whether the phone hand is wholly in the picture. Cut by the edge is fine; all of it in, and the
 * phone it holds would be in too -- the illusion that the lens IS the phone breaks.
 */
function handWhole(camera, built) {
  const paw = built.holds[0].parent.children[0];
  const arm = built.joints.upperArm.find(({ node }) => node.getObjectById(paw.id)).node;
  // An owl's wing wraps its arm, paw and all: the wing is what shows, so it is what must be cut.
  // The arm's own taper and cap come first; garments (a sleeve) are not part of the hand.
  const wing = arm.children.slice(2).filter((c) => c.isMesh && !c.userData.worn);
  const p = new THREE.Vector3();
  return [paw, ...wing].every(({ geometry: { attributes: { position } }, matrixWorld }) => {
    for (let i = 0; i < position.count; i++) if (!onScreen(camera, p.fromBufferAttribute(position, i).applyMatrix4(matrixWorld))) return false;
    return true;
  });
}

/** The points a selfie is framed by, in world space, as the character stands now. */
function landmarks(built, subject) {
  const at = (o) => o.getWorldPosition(new THREE.Vector3());
  const head = at(built.joints.head), hand = at(built.holds[0]);
  const worn = subject.length ? subject.reduce((b, g) => b.expandByObject(g), new THREE.Box3()) : null;
  return {
    head, hand,
    crown: head.clone().setY(head.y + built.params.headRadius),
    // what they made has to be IN it, not just its edge: a quarter of the way down from its top
    made: worn ? worn.getCenter(new THREE.Vector3()).setY(worn.max.y - (worn.max.y - worn.min.y) * 0.25) : head,
  };
}

/** Candidate framings: the highest lens first, then closest first, so zooming out is given up last. */
function* framings(heights) {
  for (const up of heights) for (let k = 1; k <= 2.21; k += 0.1) {
    for (const drop of [0.3, 0.55, 0.8, 1.05]) for (let off = 0.1; off <= 0.61; off += 0.05) yield { up, k, drop, off };
  }
}

/**
 * Pupils on the lens. The rig has no gaze, but buildEye puts the white (child 0) and the pupil
 * (child 1) on one joint at the eyeball's centre, so the pupil can slide across the white's face
 * toward the camera, kept on its surface. Eyes at the side of the head (a llama's) look forward out
 * of their front edge. GAZE is how far across, as a share of the white's radius.
 */
const GAZE = 0.45;
function lookAtLens(built, camera) {
  for (const { node } of built.joints.eye) {
    const [white, pupil] = node.children;
    if (!white || !pupil) continue;
    const to = node.worldToLocal(camera.position.clone()).normalize();
    const r = white.scale.x, ry = white.scale.y, depth = white.scale.z;
    const x = to.x * r * GAZE, y = to.y * ry * GAZE;
    const surface = depth * Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / ry) ** 2));
    // from where the rig put it, not from the last call's: from there, every call sank it deeper
    const rest = (pupil.userData.restZ ??= pupil.position.z);
    pupil.position.set(x, y, rest - depth + surface);
  }
}

// ---------------------------------------------------------------- what the lens sees
//
// An ID buffer, rasterized in plain JS: every mesh's triangles drawn into a picture-sized grid that
// keeps, per pixel, the nearest mesh. Was a raycast per sample, which tested every ray against every
// triangle: 4-14s a selfie against a full outfit's 60-190k triangles. One pass a camera instead, on
// the CPU so node's tests run the very code the game does.

const LOOK_W = 240;            // the photo's own width: what a pixel can hide is what the picture shows
const _p = new THREE.Vector3(), _p4 = new THREE.Vector4(), _vp = new THREE.Matrix4(), _q = new THREE.Vector3();

/**
 * A `look` for seenShare: is world point `p` (on one of `parts`) seen from `camera`, in frame with
 * nothing of the character's in front of it? Its pixel shows one of `parts`, or nothing at all.
 * ponytail: plain geometry, so the sleeves' shader-side arm push (garments.js ARM_ATTRIBUTES) is not
 * in it, and a triangle crossing behind the lens is dropped rather than clipped. Millimetres, and
 * only the phone arm reaches that close.
 */
export function idLook(built) {
  const meshes = [];
  // what the renderer draws: an eye under a hat is hidden at its joint, not at its meshes
  built.root.traverseVisible((o) => { if (o.isMesh) meshes.push(o); });
  const buf = { w: 0, h: 0, id: null, z: null, key: '' };
  return (camera, p, parts) => {
    const key = `${camera.matrixWorld.elements.join(',')},${camera.projectionMatrix.elements.join(',')}`;
    if (key !== buf.key) { buf.key = key; drawIds(buf, meshes, camera); }
    _q.copy(p).project(camera);
    if (Math.abs(_q.x) > 1 || Math.abs(_q.y) > 1 || _q.z >= 1) return false;
    const col = Math.min(buf.w - 1, Math.floor(((_q.x + 1) / 2) * buf.w));
    const id = buf.id[Math.min(buf.h - 1, Math.floor(((1 - _q.y) / 2) * buf.h)) * buf.w + col];
    return id === 0 || parts.includes(meshes[id - 1]);
  };
}

/** Every mesh into a fresh buffer the camera's shape, mesh i as id i + 1 (0 is nothing). */
function drawIds(buf, meshes, camera) {
  buf.w = LOOK_W;
  buf.h = Math.round(LOOK_W / camera.aspect);
  buf.id = new Uint16Array(buf.w * buf.h);
  buf.z = new Float32Array(buf.w * buf.h).fill(Infinity);
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  meshes.forEach((m, i) => drawMesh(buf, m, i + 1));
}

/**
 * One mesh's triangles. Which faces are drawn follows its material's side, as a raycast's would:
 * `cull` 1 keeps the front faces only, -1 the back, 0 both. A mirroring transform swaps them.
 */
const CULL = { [THREE.FrontSide]: 1, [THREE.BackSide]: -1, [THREE.DoubleSide]: 0 };
function drawMesh(buf, mesh, id) {
  const pos = screenPositions(buf, mesh);
  const [{ side }] = [mesh.material].flat();
  const cull = CULL[side] * Math.sign(mesh.matrixWorld.determinant());
  const { index } = mesh.geometry, n = index ? index.count : pos.length / 3;
  for (let t = 0; t + 2 < n; t += 3) {
    /** @type {[number, number, number]} */
    const tri = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
    drawTri(buf, pos, tri, id, cull);
  }
}

/** Each vertex as [pixel x, pixel y, depth], skinned where drawn; NaN behind the lens. */
function screenPositions(buf, mesh) {
  const { count } = mesh.geometry.attributes.position;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    mesh.getVertexPosition(i, _p).applyMatrix4(mesh.matrixWorld);
    _p4.set(_p.x, _p.y, _p.z, 1).applyMatrix4(_vp);
    if (_p4.w <= 0) { out[i * 3] = Number.NaN; continue; }
    out[i * 3] = ((_p4.x / _p4.w + 1) / 2) * buf.w;
    out[i * 3 + 1] = ((1 - _p4.y / _p4.w) / 2) * buf.h;
    out[i * 3 + 2] = _p4.z / _p4.w;
  }
  return out;
}

/**
 * Which side of the edge a to b point (px, py) is on, as twice that triangle's signed area in
 * pixels (y down). A triangle's own area is negative when it faces the lens, as three winds them.
 */
const edge = (ax, ay, bx, by) => (px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);

/** One triangle: every pixel centre inside it, nearer than what is there, becomes `id`. */
function drawTri(buf, pos, [a, b, c], id, cull) {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], bx = pos[b * 3], by = pos[b * 3 + 1], cx = pos[c * 3], cy = pos[c * 3 + 1];
  const area = edge(ax, ay, bx, by)(cx, cy);
  if (!area || Number.isNaN(area) || cull * area > 0) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(buf.w - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(buf.h - 1, Math.ceil(Math.max(ay, by, cy)));
  const z = [pos[a * 3 + 2], pos[b * 3 + 2], pos[c * 3 + 2]];
  const toA = edge(bx, by, cx, cy), toB = edge(cx, cy, ax, ay);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const wa = toA(px, py) / area, wb = toB(px, py) / area, wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const k = y * buf.w + x, depth = wa * z[0] + wb * z[1] + wc * z[2];
      if (depth < buf.z[k]) { buf.z[k] = depth; buf.id[k] = id; }
    }
  }
}

/**
 * The share of `parts` the camera sees: of up to `samples` of their vertices, how many `look` says
 * are seen. Skinned parts are sampled where they are drawn.
 */
export function seenShare(built, camera, parts, samples = 30, look = idLook(built)) {
  let n = 0, seen = 0;
  for (const part of parts) {
    const { count } = part.geometry.attributes.position;
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / samples))) {
      n++;
      if (look(camera, part.localToWorld(part.getVertexPosition(i, new THREE.Vector3())), parts)) seen++;
    }
  }
  return n ? seen / n : 0;
}

/** Every eye's meshes: the white and the pupil. An eye a hat hides (garments.js) is none of them. */
const eyesOf = (built) => built.joints.eye.flatMap(({ node }) => (node.visible ? node.children.filter((c) => c.isMesh) : []));

/** Frame one style: pose, lens, and the closest framing that keeps the hand out (see takeSelfie). */
function frame(built, camera, style, subject) {
  applyPose(built, style.pose);
  built.root.updateMatrixWorld(true);
  const { head, hand, crown, made } = landmarks(built, subject);
  const half = built.params.headRadius * FACE;
  camera.fov = style.fov;
  camera.updateProjectionMatrix();
  for (const f of framings(style.heights)) {
    aim(camera, head, half, f);
    if (!onScreen(camera, hand) && onScreen(camera, crown, 0.97) && onScreen(camera, made)) return;
  }
  // nothing kept the hand out: the face, plainly, with the hand in it
  aim(camera, head, half, { up: style.heights[0], k: 1.3, drop: 0.3, off: 0.1 });
}

/**
 * What a taken selfie gets right, as numbers to judge a shot by: the phone hand cut by the frame or out of it,
 * the share of what they made (`type`) and of their eyes that can be seen, and how much of the
 * picture's width the face spans (the close shot's is about half).
 */
export function gradeSelfie(built, camera, type, look = idLook(built)) {
  const at = (o) => o.getWorldPosition(new THREE.Vector3());
  const made = (built.garments ?? []).filter((m) => m.userData.worn?.includes(type));
  const head = at(built.joints.head), across = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    .multiplyScalar(built.params.headRadius);
  return {
    handOut: shotFor(type, built.species?.id)?.behind ? null : !handWhole(camera, built),   // null: no phone
    made: made.length ? seenShare(built, camera, made, 30, look) : null,
    eyes: seenShare(built, camera, eyesOf(built), 30, look),
    face: (head.clone().add(across).project(camera).x - head.clone().sub(across).project(camera).x) / 2,
  };
}

/** What the selfie is of: the meshes holding `type`, or everything worn when none does. */
function subjectParts(worn, type) {
  const subject = worn.filter((m) => m.userData.worn?.includes(type));
  return subject.length ? subject : worn;
}

/** The styles this body can take, in order, with the other arm out when something is in it. */
const stylesFor = (built, showing) => STYLES.filter((st) => !(st.flatFaced && longSnout(built.params)))
  .map((st) => (showing ? { ...st, pose: { ...st.pose, ...SHOW } } : st));

/** Take an authored shot (SHOTS) as written: pose, lens, eyes on it. */
export function shoot(built, camera, { headYaw, headPitch, fov, up, k, drop, off, behind = false }, showing) {
  // From behind, the camera stands on the side the head turns to: a positive headYaw turns it to -x.
  const back = behind ? -Math.sign(headYaw) || -1 : 0;
  applyPose(built, behind ? { ...POSES.rest, ...SPREAD, spineTwist: -SPREAD.spineTwist * back, headYaw, headPitch }
    : { ...POSES.rest, ...ARM, headTilt: -0.15, headYaw, headPitch, ...(showing && SHOW) });
  built.root.updateMatrixWorld(true);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  aim(camera, built.joints.head.getWorldPosition(new THREE.Vector3()), built.params.headRadius * FACE, { up, k, drop, off, back });
  lookAtLens(built, camera);
  return 'authored';
}

/**
 * Pose `built` for the selfie in `type` (the garment it is of) and put `camera` where the phone is.
 *
 * The phone is IN the raised hand, so a selfie never shows that hand: the arm runs out of the frame.
 * Bodies differ too much for one framing (an owl's wing reaches its face, a llama's leg stops halfway
 * up its neck), so it is searched for: face big first, then sliding the aim down toward what they
 * made and away from the arm, and only then zooming out. Kept in: the crown, and what they made.
 *
 * And no one shot shows everything: one that shows a llama's hat hides its cowl. So each style is
 * scored by raycasting what they made and their eyes (the lesser of the two). The close shot is
 * kept whenever it shows both; otherwise whichever style showed the most. Returns the style's name.
 *
 * An authored shot (SHOTS, of `type` and its `silhouette`) skips all of that: it is taken as
 * written, and named 'authored'.
 */
export function takeSelfie(built, camera, type, silhouette, look = idLook(built)) {
  const worn = built.garments ?? [];
  const showing = worn.some((m) => m.parent === built.holds[1]);
  const shot = shotFor(type, built.species?.id, silhouette);
  if (shot) return shoot(built, camera, shot, showing);
  const parts = subjectParts(worn, type);
  let best = null;
  for (const style of stylesFor(built, showing)) {
    frame(built, camera, style, parts);
    lookAtLens(built, camera);
    // the eyes first: a few small meshes, against a garment that can be tens of thousands of triangles
    const eyes = seenShare(built, camera, eyesOf(built), 30, look);
    const score = eyes < ENOUGH || !parts.length ? eyes : Math.min(eyes, seenShare(built, camera, parts, 30, look));
    if (style.flatFaced && score >= ENOUGH) return style.name;    // the shot tuned by eye, when it works
    if (!best || score > best.score) best = { style, score };
  }
  frame(built, camera, best.style, parts);
  lookAtLens(built, camera);
  return best.style.name;
}

// ---------------------------------------------------------------- scored search
//
// A search that frames the way the authored shots were framed by eye. Fitted 2026-10-11 to the nine
// front-facing SHOTS: of ~350 shots sampled round each, the score below puts the authored one ahead
// of 89% of those that pass the rules, and 80% fitting on eight and ranking the ninth -- so about
// one shot in five scores higher than the one picked by eye, and only looking says whether those are
// as good. What it rewards: what they made in view, the face at its species' size in the frame,
// its outline filling the frame, and centred. The eyes and the face's aim are rules, not rewards:
// every authored shot faces the lens (0.73 and up), and the search, free to, turned faces away.
// Not the game's: an authoring tool. crowd.html shows its pick beside the authored one ("compare
// scored"), and a click takes a pick into the tuner, to keep as a SHOTS entry.

const RANGES = { headYaw: [-1.2, 1.2], headPitch: [-1, 1], fov: [25, 70], up: [-1, 1.5], k: [0.6, 3], drop: [-0.5, 2], off: [-0.5, 1] };
const WEIGHTS = { fill: 0.21, made: 0.37, face: 0.37, centre: 0.04 };
const FACE_SIZE = { owl: 0.56, llama: 0.43, lion: 0.55 };          // the face's share of the frame's width
const FACING = 0.7;     // with the eyes in the picture, the face points this squarely at the lens (cos)
// The whole of them, not just what they made, at least this big in the frame and this near its
// middle (frame halves): every authored shot is (covers 0.55-0.98, middle 0.38 off at most), and the
// search, free to, put a small owl down in a corner. The head may be well off to the side; a bag
// shot's is.
const BODY = { cover: 0.5, off: 0.4 };

/** How squarely the face points at the lens: 1 straight at it, 0 side on (the head's +z is its face). */
function facing(built, camera) {
  const { head } = built.joints;
  const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  return ahead.dot(camera.position.clone().sub(head.getWorldPosition(new THREE.Vector3())).normalize());
}

/** Seeded, so a character's scored shot is the same each time it is taken. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every mesh of theirs that is drawn. */
function meshesOf(built) {
  const meshes = [];
  built.root.traverseVisible((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

/** How much of the frame `parts`' outline fills, clipped to it, and how far its middle is off centre: every `stride`th vertex. */
function outline(camera, parts, stride = 5) {
  const box = new THREE.Box2(), v = new THREE.Vector3(), q = new THREE.Vector2();
  for (const { geometry: { attributes: { position } }, matrixWorld } of parts) {
    for (let i = 0; i < position.count; i += stride) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrixWorld).project(camera);
      if (v.z < 1) box.expandByPoint(q.set(v.x, v.y));
    }
  }
  const c = box.intersect(new THREE.Box2(new THREE.Vector2(-1, -1), new THREE.Vector2(1, 1)));
  return c.isEmpty() ? { fill: 0, centre: 2 } : { fill: ((c.max.x - c.min.x) * (c.max.y - c.min.y)) / 4, centre: c.getCenter(q).length() };
}

/**
 * How good the shot the camera now has is, or -Infinity when it breaks a rule: the phone hand whole
 * in it, under 30% of what they made seen, under 10% of the eyes, the face turned from the lens, or
 * the whole of them small or off in a corner (BODY).
 */
function scoreShot(built, camera, { type, parts, look, all = meshesOf(built) }) {
  // cheapest first: one dot product, then an outline, then every hand vertex, then the ID buffer
  if (facing(built, camera) < FACING) return -Infinity;
  const whole = outline(camera, all, 31);
  if (whole.fill < BODY.cover || whole.centre > BODY.off || handWhole(camera, built)) return -Infinity;
  const made = seenShare(built, camera, parts, 30, look), eyes = seenShare(built, camera, eyesOf(built), 30, look);
  if (made < 0.3 || eyes < 0.1) return -Infinity;
  const { face } = gradeSelfie(built, camera, type, look), { fill, centre } = outline(camera, parts);
  const size = FACE_SIZE[built.species?.id] ?? 0.55;
  return WEIGHTS.fill * fill + WEIGHTS.made * made - WEIGHTS.face * Math.abs(face - size) - WEIGHTS.centre * centre;
}

/** The scored search's score for the shot the camera now has (-Infinity: it breaks a rule), to set beside a pick. */
export function selfieScore(built, camera, type, look = idLook(built)) {
  return scoreShot(built, camera, { type, parts: subjectParts(built.garments ?? [], type), look });
}

/** A shot drawn from RANGES, or `spread` of each range round `around`. */
export function drawShot(rng, around, spread) {
  return Object.fromEntries(Object.entries(RANGES).map(([key, [lo, hi]]) => {
    const v = around ? around[key] + (rng() - 0.5) * spread * (hi - lo) : lo + rng() * (hi - lo);
    return [key, THREE.MathUtils.clamp(v, lo, hi)];
  }));
}

/**
 * Search for the best-scoring shot of `type`: every authored shot, 300 drawn across the ranges, then
 * three rounds of narrowing round the best. Leaves the character posed and the camera on it, and returns the shot
 * (an authored shot's fields, so a pick can be pasted into SHOTS) and its score; null when no shot
 * passes the rules, the camera then on the last one tried.
 */
export function scoredSelfie(built, camera, type, look = idLook(built)) {
  const worn = built.garments ?? [], showing = worn.some((m) => m.parent === built.holds[1]);
  const ctx = { type, parts: subjectParts(worn, type), look, all: meshesOf(built) }, rng = seeded(0x5e1f1e);
  let best = { shot: null, score: -Infinity };
  const tryShot = (shot) => {
    shoot(built, camera, shot, showing);
    const score = scoreShot(built, camera, ctx);
    if (score > best.score) best = { shot, score };
  };
  // the authored shots first, any garment's or species': good framings, where the rules leave little
  // room and random draws can miss it altogether
  for (const shot of Object.values(SHOTS).flatMap(Object.values)) if (shot && !shot.behind) tryShot(shot);
  for (let i = 0; i < 300; i++) tryShot(drawShot(rng));
  for (const spread of [0.2, 0.1, 0.05]) for (let i = 0; i < 40 && best.shot; i++) tryShot(drawShot(rng, best.shot, spread));
  if (best.shot) shoot(built, camera, best.shot, showing);
  return best.shot && best;
}
