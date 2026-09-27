// Owl species kit.
//
// Everything here is owl-specific: head shape, ear tufts, beak, wings and plumage. The shared
// body lives in npc.js. Kits may ADD or SCALE, never REPLACE -- wings are the clearest case,
// since they bolt onto the shared upper arm rather than replacing the arm chain.

import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addConeEars, addEyes, addTail, createCharacter, deriveCoatColor,
  feltMaterial, part, randomiseBase, registerSpecies, scallopGeometry, scallopMesh,
} from './npc.js';

export {
  TONE_MAPPING, POSES, POSE_KEYS, GEO_DETAIL, NAMES,
  rand, pick, randHex, randomFur, slugify,
  feltMaterial, eyeMaterial, knitMaterial, greyMat, blackMat,
  setGeometryDetail, getGeometryDetail, setViewMode, applyPose,
  disposeCharacter as disposeOwl,
} from './npc.js';

// ---------------------------------------------------------------- params

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Hoot',
  footColor:     '#e0a53c',

  // The swivel. A real owl clears about 270 degrees, and it is the single most recognisable
  // thing an owl does -- so it is anatomy, set once here, and every system that turns a head
  // gets it for free without knowing what an owl is. The neck takes its usual share, which is
  // invisible on a cylinder and hidden under plumage anyway.
  headYawMax:    4.60,    // ~264 degrees

  // species kit
  tuftSize:      0.049,
  tuftSpread:    0.694,
  tuftTilt:      0.800,
  beakSize:      0.090,
  beakColor:     '#e0a53c',
  wingLength:    0.349,
  wingWidth:     0.200,   // ratio of wingLength, so short wings shrink rather than go pancake
  wingDepth:     0.360,   // ratio of wingLength

  // feathers: LOW frequency on purpose. The removed felt normal map failed because
  // high-frequency relief reads as grain; a handful of large scallops reads as plumage.
  feathers:      true,
  featherColor:  '#8d93a8',
  featherPreset: 2,
  featherRows:   3,
  featherPerRow: 9,
  featherSize:   0.276,   // RATIO of body radius, not world units - keeps shells shareable
  featherFlat:   0.40,    // how far each scallop sinks into the body
  featherProud:  0.32,    // protrusion along the normal, as a fraction of size
  featherTop:    0.40,    // start latitude, 0 = top of torso
  featherBottom: 0.95,
  featherStagger:true,    // offset alternate rows so they overlap like shingles

  featherHead:   true,
  featherHeadScale: 0.74,
  featherFaceGap: 1.25,   // radians of clear space at the front, so plumage misses the eyes
  featherWings:  true,
  featherWingScale: 0.62,

  // A short fan of tail feathers poking out below the back, angled down. Stiff: a bird's tail
  // flicks, it does not swing.
  tailLength:    0.110,
  tailThick:     0.030,   // one feather's width
  tailDroop:    -0.75,
  tailStiff:     380,
  tailZeta:      0.40,
};

// Quantised so feather geometry can be SHARED between characters. Per-character generated
// geometry blocks instancing entirely, and the visual variety is carried by colour anyway.
//
// featherProud is protrusion along the surface normal. Kept well under 0.5: a wide scallop
// that also stands proud stops reading as a shingle and starts reading as a ball stuck on.
export const FEATHER_PRESETS = Object.freeze([
  { featherRows: 2, featherPerRow: 7,  featherSize: 0.330, featherProud: 0.40, featherFlat: 0.34, featherStagger: true,  featherTop: 0.44, featherBottom: 0.94 },
  { featherRows: 2, featherPerRow: 11, featherSize: 0.245, featherProud: 0.34, featherFlat: 0.42, featherStagger: false, featherTop: 0.40, featherBottom: 0.92 },
  { featherRows: 3, featherPerRow: 9,  featherSize: 0.276, featherProud: 0.32, featherFlat: 0.40, featherStagger: true,  featherTop: 0.40, featherBottom: 0.95 },
  { featherRows: 3, featherPerRow: 13, featherSize: 0.205, featherProud: 0.44, featherFlat: 0.36, featherStagger: true,  featherTop: 0.34, featherBottom: 0.96 },
  { featherRows: 4, featherPerRow: 8,  featherSize: 0.300, featherProud: 0.26, featherFlat: 0.48, featherStagger: true,  featherTop: 0.46, featherBottom: 0.98 },
  { featherRows: 4, featherPerRow: 12, featherSize: 0.220, featherProud: 0.46, featherFlat: 0.30, featherStagger: false, featherTop: 0.36, featherBottom: 0.94 },
  { featherRows: 5, featherPerRow: 10, featherSize: 0.235, featherProud: 0.38, featherFlat: 0.44, featherStagger: true,  featherTop: 0.30, featherBottom: 0.97 },
  { featherRows: 3, featherPerRow: 6,  featherSize: 0.330, featherProud: 0.30, featherFlat: 0.28, featherStagger: true,  featherTop: 0.48, featherBottom: 0.93 },
]);

export function applyFeatherPreset(P, index) {
  const count = FEATHER_PRESETS.length;
  P.featherPreset = index;
  Object.assign(P, FEATHER_PRESETS[((index % count) + count) % count]);
  return P;
}

// tier 1 entries carry the silhouette; feather shape is quantised, not continuous
export const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  neckLength:  [0.050, 0.160],
  headOverlap: [0.050, 0.150],
  headRadius:  [0.150, 0.195],
  tuftSize:    [0.024, 0.075],
  tuftSpread:  [0.350, 1.040],
  tuftTilt:    [-0.150, 1.350],  // slight negative reads as upright tufts, not broken ones
  wingLength:  [0.300, 0.390],
  wingWidth:   [0.175, 0.260],
  wingDepth:   [0.280, 0.440],
  beakSize:    [0.070, 0.110],
  tailLength:  [0.080, 0.140],
});

// ---------------------------------------------------------------- shell settings

const headScale = (P) => [P.headRadius * 1.06, P.headRadius, P.headRadius * 0.98];

// the wing sits slightly outboard of the arm, which also thins its inner coverage
const WING_OFFSET = 0.012;

// A wing has to enclose the upper arm it wraps, offset included, or the arm pokes out through
// the inner edge. Thick limbs with narrow wings hit this often enough to need a floor.
const wingScale = (P) => {
  const cover = P.limbThick * 1.05 + WING_OFFSET + 0.004;
  return [
    Math.max(P.wingLength * P.wingWidth, cover),
    P.wingLength * 0.52,
    Math.max(P.wingLength * P.wingDepth, cover),
  ];
};

const torsoShell = (P) => ({
  rows: P.featherRows, perRow: P.featherPerRow, size: P.featherSize,
  flat: P.featherFlat, proud: P.featherProud,
  top: P.featherTop, bottom: P.featherBottom, stagger: P.featherStagger,
});

const headShell = (P) => ({
  rows: Math.max(1, Math.round(P.featherRows * 0.7)),
  perRow: P.featherPerRow,
  size: P.featherSize * P.featherHeadScale,
  flat: P.featherFlat, proud: P.featherProud,
  top: 0.06, bottom: 0.62, stagger: P.featherStagger,
  skipFront: P.featherFaceGap,
});

const wingShell = (P) => ({
  rows: P.featherRows,
  perRow: Math.max(3, Math.round(P.featherPerRow * 0.6)),
  size: P.featherSize * P.featherWingScale,
  flat: P.featherFlat, proud: P.featherProud,
  top: 0.42, bottom: 0.96, stagger: P.featherStagger,
});

// ---------------------------------------------------------------- kit

// Owl plumage sinks in more than it stands out, so it never pushes the shoulders.
export const coatBulge = (P) => {
  if (!P.feathers) return 0;
  const { size, proud, flat } = torsoShell(P);
  return Math.max(0, size * (proud - flat));
};

function addHead(ctx, P) {
  const scale = headScale(P);
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale }));
  if (!P.feathers || !P.featherHead) return;
  const shell = scallopMesh(scallopGeometry(headShell(P)), ctx.mat.feather, scale);
  if (shell) ctx.head.add(shell);
}

function addTorsoPlumage(ctx, P) {
  if (!P.feathers) return;
  const scale = [P.torsoW, P.torsoH, P.torsoD];
  const shell = scallopMesh(scallopGeometry(torsoShell(P)), ctx.mat.feather, scale);
  if (shell) ctx.chest.add(shell);
}

function addBeak(ctx, P) {
  ctx.head.add(part(GEO.cone, ctx.mat.beak, {
    pos: [0, -P.headRadius * 0.10, P.headRadius * 0.86],
    scale: [P.beakSize, P.beakSize * 2.1, P.beakSize],
    rot: [Math.PI * 0.5, 0, 0],
  }));
}

// a blob on the upper arm plus its own scallop shell, both parented to the shoulder
function addWing(shoulder, side, ctx, P) {
  const scale = wingScale(P);
  const pos = [side * WING_OFFSET, -P.wingLength * 0.42, 0];
  const rot = [0, 0, side * 0.08];
  shoulder.add(part(GEO.sphere, ctx.mat.body, { pos, scale, rot }));
  if (!P.feathers || !P.featherWings) return;

  const shell = scallopMesh(scallopGeometry(wingShell(P)), ctx.mat.feather, scale);
  if (!shell) return;
  shell.position.set(...pos);
  shell.rotation.set(...rot);
  shoulder.add(shell);
}

function buildKit(ctx, P) {
  ctx.mat.feather = ctx.addMaterial(feltMaterial(P, P.featherColor));
  ctx.mat.beak = ctx.addMaterial(feltMaterial(P, P.beakColor));

  addHead(ctx, P);
  addEyes(ctx, P, { head: headScale(P) });
  addBeak(ctx, P);
  addTorsoPlumage(ctx, P);
  // tufts fill the ears slot: not anatomically ears, but rigged as them so they can express
  addConeEars(ctx, P, {
    size: P.tuftSize, length: P.tuftSize * 2.4,
    spread: P.tuftSpread, tilt: P.tuftTilt, lift: 0.55, head: headScale(P),
  });
  for (const { node, side } of ctx.joints.upperArm) addWing(node, side, ctx, P);
  addTail(ctx, P, { dress: (node, i, len) => addTailFan(node, len, ctx, P) });
}

// Five flat feathers fanned about the tail's own axis, lying in its plane, so the fan spreads
// sideways and tips down with the droop. In the plumage colour.
const TAIL_FAN = [-0.55, -0.28, 0, 0.28, 0.55];

function addTailFan(node, len, ctx, P) {
  const w = P.tailThick;
  for (const a of TAIL_FAN) {
    node.add(part(GEO.sphere, P.feathers ? ctx.mat.feather : ctx.mat.body, {
      pos: [-Math.sin(a) * len * 0.5, 0, -Math.cos(a) * len * 0.5],
      scale: [w * 0.5, w * 0.16, len * 0.5],
      rot: [0, a, 0],
    }));
  }
}

// ---------------------------------------------------------------- randomisation

/** Applies randomised owl identity onto a params object, in place. */
export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  applyFeatherPreset(P, Math.floor(Math.random() * FEATHER_PRESETS.length));
  P.featherColor = deriveCoatColor(P.bodyColor);
  return P;
}

/** A fresh randomised params object, with optional fixed overrides. */
export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

// ---------------------------------------------------------------- gui

export const OWL_GUI = Object.freeze({
  'face & tufts': [
    ['tuftSize', 0.01, 0.14], ['tuftSpread', 0.1, 1.1], ['tuftTilt', -1.5, 1.5],
    ['beakSize', 0.01, 0.18], ['beakColor', 'color'],
  ],
  feathers: [
    ['feathers', 'bool'], ['featherColor', 'color'],
    ['featherHead', 'bool'], ['featherWings', 'bool'],
    ['featherPreset', 0, FEATHER_PRESETS.length - 1, 1],
    ['featherRows', 1, 8, 1], ['featherPerRow', 3, 20, 1],
    ['featherSize', 0.08, 0.55], ['featherProud', 0.1, 1.2], ['featherFlat', 0, 1.2],
    ['featherTop', 0, 1], ['featherBottom', 0, 1],
    ['featherHeadScale', 0.2, 1.4], ['featherWingScale', 0.2, 1.4],
    ['featherFaceGap', 0, 3.2], ['featherStagger', 'bool'],
  ],
  wings: [
    ['wingLength', 0.08, 0.40], ['wingWidth', 0.06, 0.45], ['wingDepth', 0.10, 0.70],
  ],
});

// ---------------------------------------------------------------- motion

// How much motion variation ONE owl gets. The trait values decide where in a span a character
// lands; this decides how wide the span is. Spread from the base the same way RANDOM_RANGES is,
// so a key that is not a base key simply has no effect -- "ADD or SCALE, never REPLACE" holds
// without any validation code.
//
// An owl is a snappy bird: it commits to a movement fast and it holds still between movements,
// which is the opposite of a llama. The head arc is the species tell -- an owl's swivel is the
// one piece of motion nobody will mistake for anything else, so it gets the widest span here.
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [140, 300],
  idleRate: [1.20, 3.00],   // a bird is twitchy: the top of the range, and never fully still
  idleAmp:  [0.30, 1.10],
  headArc:  [1.20, 2.20],
  stride:   [1.30, 1.90],   // stumpier than a llama, so shorter steps for the same legs
});

// ---------------------------------------------------------------- species

export const owl = registerSpecies({
  id: 'owl',
  label: 'Owl',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: { ...BASE_GUI, ...OWL_GUI },
  buildKit,
  coatBulge,
  coatColorKey: 'featherColor',
  randomise: randomiseInto,
  onPresetChange: applyFeatherPreset,
  presetKey: 'featherPreset',
});

// crowd.html and felted-owl.html import this name directly
export const createOwl = (P) => createCharacter(P, owl);
