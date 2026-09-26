// Llama species kit.
//
// The reference case for the SCALE half of "kits may ADD or SCALE, never REPLACE": the llama
// is defined by neck length, and the neck is shared-base equipment.
//
// Two rules this exists to prove:
//   1. The neck ADDS height. Torso dimensions stay identical to every other species so one
//      sweater fits everyone, which makes the llama the tallest species rather than the one
//      with a squashed body.
//   2. Bipedal, not quadruped. The neck, head, ear and fluff silhouette is borrowed from
//      quadruped reference art, then stood upright.

import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addEars, addEyes, createCharacter, deriveCoatColor, touchingScallopSize,
  feltMaterial, part, randomiseBase, registerSpecies, scallopGeometry, scallopMesh,
} from './npc.js';

// ---------------------------------------------------------------- params

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Perpetua',
  footColor:     '#5d4a3c',

  // A long neck bends further than a stubby one, but nothing like a bird's swivel.
  headYawMax:    1.90,    // ~109 degrees

  shoulderOut:   1.00,    // arms ride on the fleece surface, not inside it
  shoulderLift:  0.34,
  clampArmOut:   true,    // llama arms are visible, so never let a pose bury the elbow

  // The long neck is the whole species. Absolute, never a multiplier: a multiplier on the
  // owl's near-concealed neck would still be near-concealed.
  neckLength:    0.380,
  neckThick:     0.052,
  headOverlap:   0.020,   // the head does not sink; it sits on top of a visible neck
  headRadius:    0.112,   // smaller head than the owl, so the neck reads as the long part
  eyeFront:      0.700,   // proud of the wedge-shaped skull, or it swallows the eye white

  // species kit
  muzzleLength:  0.215,   // a camelid snout is long and BLUNT; short plus tapered reads as a beak
  muzzleThick:   0.076,
  muzzleDrop:    0.240,   // how far below head centre the muzzle sits, as a fraction of radius
  muzzleColor:   '#efe6d5',
  noseColor:     '#141013',
  noseSize:      0.60,    // Y arm length, as a fraction of muzzle thickness
  earLength:     0.140,
  earWidth:      0.032,
  earFlatten:    0.45,    // depth vs width; low values make the ear a blade, not a sausage
  earSpread:     0.440,
  earTilt:       0.160,   // near-upright: banana ears are the llama tell

  // fleece uses the same scallop machinery as owl plumage, but larger and rounder: plumage is
  // a set of plates, fleece is a mass of curls that has to read as continuous
  fleece:        true,
  fleeceColor:   '#cbb9a2',
  fleecePreset:  2,
  fleeceRows:    5,
  fleecePerRow:  9,
  fleeceAutoSize:true,    // derive size from the counts so curls always touch
  fleeceTouch:   1.08,    // 1.0 = exactly touching, above that = overlapping
  fleeceSize:    0.250,   // manual override, only used when fleeceAutoSize is off
  fleeceFlat:    0.44,
  fleeceProud:   0.76,
  fleeceTop:     0.28,
  fleeceBottom:  0.96,
  fleeceStagger: true,

  fleeceNeck:    true,
  fleeceNeckCoverage: 0.50,   // fraction of neck LENGTH the ruff spans
  fleeceNeckSpread:   2.40,   // multiple of neck THICKNESS for the ruff radius
  fleeceNeckScale:    0.85,   // curl size relative to the body's
};

// Fewer and bigger than the owl's, and much rounder. Size is derived from the counts, so a
// preset only chooses how many curls there are. Row counts start at 4 because with fewer than
// that the vertical gap is so wide that touching curls would have to be absurdly large.
export const FLEECE_PRESETS = Object.freeze([
  { fleeceRows: 4, fleecePerRow: 7,  fleeceProud: 0.80, fleeceFlat: 0.42, fleeceStagger: true,  fleeceTop: 0.32, fleeceBottom: 0.95 },
  { fleeceRows: 4, fleecePerRow: 9,  fleeceProud: 0.72, fleeceFlat: 0.44, fleeceStagger: true,  fleeceTop: 0.30, fleeceBottom: 0.96 },
  { fleeceRows: 5, fleecePerRow: 9,  fleeceProud: 0.76, fleeceFlat: 0.44, fleeceStagger: true,  fleeceTop: 0.28, fleeceBottom: 0.96 },
  { fleeceRows: 5, fleecePerRow: 11, fleeceProud: 0.68, fleeceFlat: 0.46, fleeceStagger: true,  fleeceTop: 0.28, fleeceBottom: 0.97 },
  { fleeceRows: 6, fleecePerRow: 10, fleeceProud: 0.82, fleeceFlat: 0.46, fleeceStagger: true,  fleeceTop: 0.26, fleeceBottom: 0.97 },
  { fleeceRows: 6, fleecePerRow: 13, fleeceProud: 0.66, fleeceFlat: 0.48, fleeceStagger: false, fleeceTop: 0.24, fleeceBottom: 0.98 },
  { fleeceRows: 7, fleecePerRow: 12, fleeceProud: 0.78, fleeceFlat: 0.48, fleeceStagger: true,  fleeceTop: 0.22, fleeceBottom: 0.98 },
  { fleeceRows: 8, fleecePerRow: 15, fleeceProud: 0.62, fleeceFlat: 0.50, fleeceStagger: true,  fleeceTop: 0.20, fleeceBottom: 0.99 },
]);

export function applyFleecePreset(P, index) {
  const count = FLEECE_PRESETS.length;
  P.fleecePreset = index;
  Object.assign(P, FLEECE_PRESETS[((index % count) + count) % count]);
  return P;
}

// neckLength is the tier 1 carrier here, where the owl's is legHeight and tuft shape
export const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  neckLength:   [0.260, 0.520],
  neckThick:    [0.042, 0.066],
  legHeight:    [0.130, 0.430],   // leggy: a stumpy llama and a stilt llama are both llamas
  headRadius:   [0.098, 0.128],
  headOverlap:  [0.010, 0.045],
  muzzleLength: [0.170, 0.290],
  muzzleThick:  [0.062, 0.094],
  muzzleDrop:   [0.150, 0.340],
  earLength:    [0.105, 0.185],
  earWidth:     [0.024, 0.042],
  earFlatten:   [0.32, 0.62],
  earSpread:    [0.340, 0.560],
  earTilt:      [0.020, 0.320],
  fleeceTouch:        [1.020, 1.180],
  // the ruff is the second silhouette carrier after the neck: a bare-necked llama and one in a
  // huge collar of fleece read as different animals at 150px
  fleeceNeckCoverage: [0.360, 0.820],
  fleeceNeckSpread:   [1.800, 3.300],
  eyeRadius:    [0.048, 0.070],   // smaller than the owl's; the neck carries identity instead
  eyeSpread:    [0.520, 0.660],   // set wider, toward the sides of the head
  eyeFront:     [0.620, 0.780],
});

// ---------------------------------------------------------------- shell settings

// narrow and deep: a llama skull is a wedge, where the owl's is a ball
const headScale = (P) => [P.headRadius * 0.80, P.headRadius * 0.94, P.headRadius * 1.16];

// Size is derived, not chosen: curls have to keep touching as the counts change, or the coat
// stops reading as a mass and starts reading as scattered lumps.
const curlSize = (P, shape, scale = 1) => (P.fleeceAutoSize
  ? touchingScallopSize(shape) * P.fleeceTouch * scale
  : P.fleeceSize * scale);

const torsoShell = (P) => {
  const shape = {
    rows: P.fleeceRows, perRow: P.fleecePerRow,
    top: P.fleeceTop, bottom: P.fleeceBottom,
  };
  return {
    ...shape, size: curlSize(P, shape),
    flat: P.fleeceFlat, proud: P.fleeceProud, stagger: P.fleeceStagger,
  };
};

const neckShell = (P) => {
  const shape = {
    rows: Math.max(2, Math.round(P.fleeceRows * 0.8)),
    perRow: Math.max(5, Math.round(P.fleecePerRow * 0.7)),
    top: 0.30, bottom: 0.92,
  };
  return {
    ...shape, size: curlSize(P, shape, P.fleeceNeckScale),
    flat: P.fleeceFlat, proud: P.fleeceProud, stagger: P.fleeceStagger,
  };
};

// How far the fleece stands proud of the torso, in torso-radius fractions. The shared rig
// uses this to push the shoulders out, so a thick coat does not swallow the arms.
export const coatBulge = (P) => {
  if (!P.fleece) return 0;
  const { size, proud, flat } = torsoShell(P);
  return Math.max(0, size * (proud - flat));
};

// ---------------------------------------------------------------- kit

function addHead(ctx, P) {
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale: headScale(P) }));
}

// A tube, not a taper. The snout starts inside the skull so it reads as part of the head, and
// ends blunt with a rounded cap -- a pointed muzzle on a round head is what reads as a beak.
function addMuzzle(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const start = P.headRadius * 0.30;
  const { muzzleLength: len, muzzleThick: r } = P;

  ctx.head.add(part(GEO.cyl, ctx.mat.muzzle, {
    pos: [0, y, start + len / 2],
    scale: [r, len, r * 0.92],
    rot: [Math.PI * 0.5, 0, 0],
  }));
  ctx.head.add(part(GEO.sphere, ctx.mat.muzzle, {
    pos: [0, y, start + len],
    scale: [r, r * 0.96, r * 0.80],
  }));
}

// The camelid philtrum: two nostril slits meeting a vertical lip split. Pieces are given extra
// depth so the curve of the snout cap cannot swallow them at the edges.
function addNose(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const z = P.headRadius * 0.30 + P.muzzleLength + P.muzzleThick * 0.58;
  const arm = P.muzzleThick * P.noseSize;
  const thick = P.muzzleThick * 0.10;
  const tilt = 0.62;

  for (const side of [-1, 1]) {
    ctx.head.add(part(GEO.cyl, ctx.mat.nose, {
      pos: [side * Math.sin(tilt) * arm * 0.5, y + Math.cos(tilt) * arm * 0.5, z],
      scale: [thick, arm, thick * 2.4],
      rot: [0, 0, -side * tilt],
    }));
  }
  ctx.head.add(part(GEO.cyl, ctx.mat.nose, {
    pos: [0, y - arm * 0.34, z],
    scale: [thick, arm * 0.68, thick * 2.4],
  }));
}

function addTorsoFleece(ctx, P) {
  if (!P.fleece) return;
  const scale = [P.torsoW, P.torsoH, P.torsoD];
  const shell = scallopMesh(scallopGeometry(torsoShell(P)), ctx.mat.fleece, scale);
  if (shell) ctx.chest.add(shell);
}

// A ruff at the base of the long neck, so the neck does not read as a bare pole. Both axes
// track the neck: radius follows thickness, height follows length, so a randomised neck keeps
// its proportions instead of growing a fixed-size collar.
function addNeckFleece(ctx, P) {
  if (!P.fleece || !P.fleeceNeck) return;
  const half = (P.neckLength * P.fleeceNeckCoverage) / 2;
  // capped against its own height: wider than about 1.7x reads as a flat disc collar, not fleece
  const radius = Math.min(P.neckThick * P.fleeceNeckSpread, half * 1.7);
  const shell = scallopMesh(scallopGeometry(neckShell(P)), ctx.mat.fleece, [radius, half, radius]);
  if (!shell) return;
  shell.position.y = half;   // bottom of the ruff sits on the neck base
  ctx.neck.add(shell);
}

function buildKit(ctx, P) {
  ctx.mat.fleece = ctx.addMaterial(feltMaterial(P, P.fleeceColor));
  ctx.mat.muzzle = ctx.addMaterial(feltMaterial(P, P.muzzleColor));
  ctx.mat.nose = ctx.addMaterial(feltMaterial(P, P.noseColor));

  addHead(ctx, P);
  // set wide and shallow: eyes on the sides of a narrow head, not owl-style forward discs
  addEyes(ctx, P, { squash: 1.1, head: headScale(P) });
  addMuzzle(ctx, P);
  addNose(ctx, P);
  addEars(ctx, P, {
    size: P.earWidth, length: P.earLength, shape: 'leaf',
    spread: P.earSpread, tilt: P.earTilt, lift: 0.72, back: -0.10,
    flatten: P.earFlatten, head: headScale(P),
  });
  addTorsoFleece(ctx, P);
  addNeckFleece(ctx, P);
}

// ---------------------------------------------------------------- randomisation

/** Applies randomised llama identity onto a params object, in place. */
export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  applyFleecePreset(P, Math.floor(Math.random() * FLEECE_PRESETS.length));
  P.fleeceColor = deriveCoatColor(P.bodyColor);
  return P;
}

/** A fresh randomised params object, with optional fixed overrides. */
export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

// ---------------------------------------------------------------- gui

export const LLAMA_GUI = Object.freeze({
  'muzzle & ears': [
    ['muzzleLength', 0.05, 0.40], ['muzzleThick', 0.02, 0.14], ['muzzleDrop', 0, 0.8],
    ['muzzleColor', 'color'], ['noseColor', 'color'], ['noseSize', 0.2, 1.4],
    ['earLength', 0.03, 0.30], ['earWidth', 0.008, 0.07], ['earFlatten', 0.15, 1.0],
    ['earSpread', 0.1, 0.9], ['earTilt', -0.6, 0.9],
  ],
  fleece: [
    ['fleece', 'bool'], ['fleeceColor', 'color'], ['fleeceNeck', 'bool'],
    ['fleecePreset', 0, FLEECE_PRESETS.length - 1, 1],
    ['fleeceRows', 1, 8, 1], ['fleecePerRow', 3, 20, 1],
    ['fleeceAutoSize', 'bool'], ['fleeceTouch', 0.8, 1.6],
    ['fleeceSize', 0.08, 0.55],
    ['fleeceProud', 0.1, 1.2], ['fleeceFlat', 0, 1.2],
    ['fleeceTop', 0, 1], ['fleeceBottom', 0, 1],
    ['fleeceNeckScale', 0.2, 1.6],
    ['fleeceNeckCoverage', 0.1, 1.0], ['fleeceNeckSpread', 1.2, 4.0],
    ['fleeceStagger', 'bool'],
  ],
});

// ---------------------------------------------------------------- species

// How much motion variation ONE llama gets. See owl.js for the shape and the reasoning.
//
// A llama is languid where the owl is snappy: slower idle, softer commitment, and a long neck
// that carries a wide head arc without the head itself having to turn far. Because the neck
// takes a fixed SHARE of a head turn, a llama's longer neck already sweeps further per radian
// than an owl's -- so this span is wide but not as wide as the owl's, or it reads as rubbery.
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [55, 190],
  idleRate: [0.60, 1.60],   // languid: a llama takes its time even when it is worked up
  idleAmp:  [0.50, 1.50],
  headArc:  [0.90, 1.80],
  // Tuned in the motion lab. A llama is a tall, deliberate animal: long steps, high knees, and
  // almost no vertical -- the bounce that reads as bird-like bobbing on an owl reads as a limp
  // on something this leggy.
  bounce:   [0.00, 0.02],
  stride:   [1.78, 2.20],   // long steps; 2.26x leg is the geometric ceiling, so this is near it
  // Picks its feet up, where a bird scuttles. Measured swing-foot clearance across this
  // span: 13% of leg length at the bottom and 53% at the top, with the shin reaching 101
  // degrees. Clearance keeps climbing past that and nothing self-intersects until about
  // 2.20, so the ceiling here is taste rather than geometry -- a llama placing its feet,
  // not a dressage horse.
  kneeLift: [0.70, 1.70],
});

export const llama = registerSpecies({
  id: 'llama',
  label: 'Llama',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: { ...BASE_GUI, ...LLAMA_GUI },
  buildKit,
  coatBulge,
  coatColorKey: 'fleeceColor',
  randomise: randomiseInto,
  onPresetChange: applyFleecePreset,
  presetKey: 'fleecePreset',
});

export const createLlama = (P) => createCharacter(P, llama);
