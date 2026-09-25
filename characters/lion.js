// Lion species kit.
//
// The reference case for a silhouette carried on the HEAD. The owl's identity is plumage on the
// torso, the llama's is neck length plus a ruff at the neck base; the lion's is a mane, and a
// mane is not a collar -- it is a halo that frames a bare face. That distinction is the whole
// kit:
//
//   1. The mane is a scallop shell on `ctx.head`, not `ctx.neck`. Two reasons, both structural.
//      The base neck is 0.100 long against the llama's 0.380, so there is barely any neck to
//      hang fleece from; and `buildScarf` already puts a torus at neckLength * 0.35 with radius
//      max(neckThick * 1.9, headRadius * 0.92), so the neck ring is occupied. Every character in
//      this shop wears a scarf.
//   2. `skipFront` does the framing. It is the same face-gap mechanism the owl already uses for
//      its head plumage (owl.js headShell) -- the mane is that shell, wider, hung lower, and with
//      a much bigger gap.
//
// The cost of anchoring to the head is that the mane turns with the head, because `ctx.head` is
// an articulated joint. That is correct for cheek and jaw fur and overstated for the shoulder
// mass, which is why a second shell on `ctx.chest` is the obvious next move if this reads too
// light. Deliberately not built yet: one shell first, see how it sits.

import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addEars, addEyes, createCharacter, deriveCoatColor, touchingScallopSize,
  feltMaterial, part, randomiseBase, registerSpecies, scallopGeometry, scallopMesh,
} from './npc.js';

// ---------------------------------------------------------------- params

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Bramble',
  footColor:     '#6b5336',

  // A cat turns its head less than a llama and far less than an owl.
  headYawMax:    1.30,    // ~74 degrees

  shoulderOut:   0.88,    // the mane is on the head, so the shoulders stay near the base value
  shoulderLift:  0.32,
  clampArmOut:   true,    // lion arms are visible against the body, never buried

  // Short neck: the mane hangs from the skull, so a long neck would push it up off the shoulders.
  neckLength:    0.105,
  neckThick:     0.082,
  headOverlap:   0.070,
  headRadius:    0.178,   // a broad skull; the mane then reads as mass rather than as a fringe
  eyeFront:      0.680,
  eyeSpread:     0.420,   // forward-set, like the owl: a predator's eyes face the same way
  eyeRadius:     0.070,

  // species kit -- snout. Short and BROAD where the llama's is long and blunt. It tapers, which
  // is the whole difference: GEO.taper narrows to LIMB_TAPER (0.78) along its length, and the
  // nose pad then steps in again, so base to tip reads much narrower than 0.78 alone.
  // muzzleStart is the one that bites. A cat's snout is SHORT, so a short length on a broad head
  // buries it: at the llama's 0.30 start with length 0.118 the tip lands at z 0.1607 against a
  // head that is 0.1687 deep at that height, and the whole snout sits inside the skull. The llama
  // gets away with 0.30 because its head is small (0.112) next to a 0.215 muzzle -- 1.92x. Here
  // the ratio is 0.66x, so the snout has to START near the surface instead of being lengthened
  // into a camelid one. At 0.65 it protrudes 0.0520 and still reads short.
  muzzleStart:   0.65,    // where the taper begins, as a fraction of head radius
  muzzleLength:  0.105,
  muzzleWidth:   0.104,   // X half-width at the skull end -- wider than it is deep, like a cat
  muzzleDepth:   0.082,   // Z half-depth at the skull end
  muzzleDrop:    0.300,   // below head centre, as a fraction of head radius
  muzzleColor:   '#e8d9bd',
  noseColor:     '#241a1c',
  noseSize:      0.52,    // nose pad radius as a fraction of the muzzle's narrow end
  earLength:     0.088,
  earWidth:      0.040,
  earFlatten:    0.40,
  earSpread:     0.520,
  earTilt:       0.300,
  earPoint:      0.55,    // 0 = the llama's rounded leaf, 1 = a spike. Scales the tip cone.

  // mane
  mane:          true,
  maneColor:     '#8a5a2b',
  manePreset:    2,
  maneRows:      4,
  manePerRow:    11,
  maneAutoSize:  true,
  maneTouch:     1.10,    // above 1.0 the curls overlap, which is what closes the mass
  maneSize:      0.230,   // manual override, only used when maneAutoSize is off
  maneFlat:      0.38,
  // Faceted spikes, not domes. A dome has no direction, so a mane built from them reads as
  // wool however the counts are tuned -- which is the owl's and the llama's whole point and
  // exactly wrong here. 0 falls back to the dome; 3 is a sharp triangular spike, 4 a pyramid,
  // and by 6 it is rounding off again.
  maneSides:     4,
  // a spike wants to be LONGER than it is wide; a dome at 0.92 is a bump
  maneProud:     1.85,
  maneTop:       0.10,    // near the crown
  maneBottom:    0.97,    // hangs well below head centre, onto the shoulders
  maneStagger:   true,
  // Radians of +Z left open. The parameter that makes it a mane rather than a hood -- and it has
  // to be bigger than it looks, because skipFront culls scallop CENTRES while each scallop still
  // has a base radius, so the ones flanking the gap spill across it. It also quantises by
  // manePerRow: at 11 the steps are 0.571 rad, so a range of values collapses to one shell.
  // Measured with the spikes in: the eyes are covered with no gap at all and clear from 1.5 up,
  // so 2.50 sits well clear and still brings the mane around the cheeks.
  maneFaceGap:   2.50,
  // BELOW 1 deliberately -- this places the spike BASES, which belong inside the skull so the
  // mane grows out of the head instead of hovering around it. Reach is maneProud's job.
  maneSpread:    0.88,
  maneTall:      1.06,    // Y scale relative to the spread, so the halo can hang oval
  maneDrop:      0.16,    // shell centre below head centre, as a fraction of head radius
  manePush:     -0.10,    // shell centre behind head centre, so it frames rather than wraps
};

// Fewer, larger curls than the llama's fleece: a mane is coarse. Size is derived from the counts
// so a preset only chooses how many curls there are and how far they stand proud.
export const MANE_PRESETS = Object.freeze([
  { maneRows: 3, manePerRow: 9,  maneProud: 1.70, maneFlat: 0.34, maneStagger: true,  maneTop: 0.14, maneBottom: 0.94, maneSpread: 0.80 },
  { maneRows: 3, manePerRow: 11, maneProud: 1.95, maneFlat: 0.36, maneStagger: true,  maneTop: 0.12, maneBottom: 0.95, maneSpread: 0.83 },
  { maneRows: 4, manePerRow: 11, maneProud: 1.85, maneFlat: 0.38, maneStagger: true,  maneTop: 0.10, maneBottom: 0.97, maneSpread: 0.86 },
  { maneRows: 4, manePerRow: 13, maneProud: 1.75, maneFlat: 0.40, maneStagger: true,  maneTop: 0.10, maneBottom: 0.97, maneSpread: 0.88 },
  { maneRows: 5, manePerRow: 13, maneProud: 2.10, maneFlat: 0.40, maneStagger: true,  maneTop: 0.08, maneBottom: 0.98, maneSpread: 0.91 },
  { maneRows: 5, manePerRow: 15, maneProud: 1.60, maneFlat: 0.42, maneStagger: false, maneTop: 0.08, maneBottom: 0.98, maneSpread: 0.94 },
  { maneRows: 6, manePerRow: 15, maneProud: 2.00, maneFlat: 0.44, maneStagger: true,  maneTop: 0.06, maneBottom: 0.99, maneSpread: 0.97 },
]);

export function applyManePreset(P, index) {
  const count = MANE_PRESETS.length;
  P.manePreset = index;
  Object.assign(P, MANE_PRESETS[((index % count) + count) % count]);
  return P;
}

// maneSpread and maneFaceGap are the tier 1 carriers here, the way neckLength is for the llama:
// a lion in a huge dark halo and one with a thin fringe read as different animals at 150px.
export const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  headRadius:   [0.158, 0.198],
  headOverlap:  [0.050, 0.098],
  neckLength:   [0.085, 0.140],
  legHeight:    [0.150, 0.250],   // stocky; a lion is not a leggy animal
  // floor is geometry, not taste: below about 0.60 the shortest muzzle on the widest head
  // never leaves the skull. rig.test walks the worst corner of these four spans together.
  muzzleStart:  [0.620, 0.800],
  muzzleLength: [0.090, 0.155],
  muzzleWidth:  [0.086, 0.126],
  muzzleDepth:  [0.068, 0.098],
  muzzleDrop:   [0.220, 0.380],
  earLength:    [0.066, 0.118],
  earWidth:     [0.030, 0.052],
  earFlatten:   [0.28, 0.56],
  earSpread:    [0.440, 0.600],
  earTilt:      [0.160, 0.440],
  earPoint:     [0.30, 0.85],
  maneTouch:    [1.040, 1.200],
  maneSpread:   [0.800, 0.980],
  // floor is 2.20, not taste: below about 2.10 the curls flanking the gap close over the muzzle.
  // rig.test walks this span and asserts the face stays clear at both ends.
  maneFaceGap:  [2.200, 3.100],
  maneTall:     [0.940, 1.200],
  maneDrop:     [0.080, 0.260],
  eyeRadius:    [0.058, 0.082],
  eyeSpread:    [0.360, 0.480],
  eyeFront:     [0.620, 0.740],
});

// ---------------------------------------------------------------- shell settings

// broad and slightly flattened: a cat skull is wider than it is tall, where the owl's is a ball
const headScale = (P) => [P.headRadius * 1.04, P.headRadius * 0.94, P.headRadius];

const curlSize = (P, shape) => (P.maneAutoSize
  ? touchingScallopSize(shape) * P.maneTouch
  : P.maneSize);

const maneShell = (P) => {
  const shape = {
    rows: P.maneRows, perRow: P.manePerRow,
    top: P.maneTop, bottom: P.maneBottom,
    skipFront: P.maneFaceGap,
    sides: P.maneSides,
  };
  return {
    ...shape, size: curlSize(P, shape),
    flat: P.maneFlat, proud: P.maneProud, stagger: P.maneStagger,
  };
};

// The mane rides on the HEAD, not the torso, so it never pushes the shoulders out. Returning 0
// is the honest answer rather than an oversight: `bulge` exists to stop a thick coat swallowing
// the elbows, and nothing on this species' torso can reach them.
export const coatBulge = () => 0;

// ---------------------------------------------------------------- kit

function addHead(ctx, P) {
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale: headScale(P) }));
}

/**
 * A taper, not a tube. GEO.taper is radius 1 at +Y and LIMB_TAPER (0.78) at -Y, so rotating by
 * -PI/2 about X puts the NARROW end forward: broad at the skull, narrowing to the nose. The
 * llama's snout is the opposite shape deliberately -- a blunt tube reads camelid, a taper reads
 * cat -- so this does not share that code.
 */
function addMuzzle(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const start = P.headRadius * P.muzzleStart;
  const { muzzleLength: len, muzzleWidth: w, muzzleDepth: d } = P;

  ctx.head.add(part(GEO.taper, ctx.mat.muzzle, {
    pos: [0, y, start + len / 2],
    scale: [w, len, d],
    rot: [-Math.PI * 0.5, 0, 0],
  }));
}

// The nose pad steps in again from the taper's narrow end, which is what stops the snout reading
// as a cone with a ball stuck on it. Sits slightly proud so the muzzle curve cannot swallow it.
function addNose(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const tipW = P.muzzleWidth * 0.78;
  const z = P.headRadius * P.muzzleStart + P.muzzleLength;
  const r = tipW * P.noseSize;

  ctx.head.add(part(GEO.sphere, ctx.mat.nose, {
    pos: [0, y + r * 0.30, z],
    scale: [r * 1.25, r * 0.85, r * 0.90],
  }));
}

/**
 * The mane: one scallop shell on the head with a gap cut out of the front.
 *
 * Offset back and down inside the head node rather than centred, so it frames the face instead
 * of wrapping it.
 *
 * maneSpread is now BELOW 1, which looks wrong and is not: it positions the spike BASES, and the
 * bases belong inside the skull so the mane grows out of the head rather than hovering around it.
 * Reach comes from maneProud instead. Measured stand-off, as a multiple of head half-width: 0.35
 * at the 0.80 span floor, 0.47 at the default, 0.63 at the ceiling, and 0.21 at the worst corner
 * once the presets' own maneProud is crossed in. rig.test pins that corner.
 */
function addMane(ctx, P) {
  if (!P.mane) return;
  const radius = P.headRadius * P.maneSpread;
  const shell = scallopMesh(scallopGeometry(maneShell(P)), ctx.mat.mane,
    [radius, radius * P.maneTall, radius]);
  if (!shell) return;
  shell.name = 'mane';   // rig.test finds it by name to measure the face gap and the stand-off
  shell.position.set(0, -P.headRadius * P.maneDrop, P.headRadius * P.manePush);
  ctx.head.add(shell);
}

// A cat ear is a leaf with a point on it. The leaf alone is the llama's rounded ear, so the tip
// cone is what earPoint buys -- at 0 it is not added at all and the ear is a llama's.
function addEarTips(ctx, P) {
  if (P.earPoint <= 0) return;
  for (const { node } of ctx.joints.ear) {
    node.add(part(GEO.cone, ctx.mat.body, {
      pos: [0, P.earLength * 0.62, 0],
      scale: [P.earWidth * 0.92, P.earLength * P.earPoint, P.earWidth * P.earFlatten * 0.92],
    }));
  }
}

function buildKit(ctx, P) {
  ctx.mat.mane = ctx.addMaterial(feltMaterial(P, P.maneColor));
  ctx.mat.muzzle = ctx.addMaterial(feltMaterial(P, P.muzzleColor));
  ctx.mat.nose = ctx.addMaterial(feltMaterial(P, P.noseColor));

  addHead(ctx, P);
  addEyes(ctx, P, { squash: 1.0 });
  addMuzzle(ctx, P);
  addNose(ctx, P);
  addEars(ctx, P, {
    size: P.earWidth, length: P.earLength, shape: 'leaf',
    spread: P.earSpread, tilt: P.earTilt, lift: 0.70, back: -0.14,
    flatten: P.earFlatten,
  });
  addEarTips(ctx, P);
  addMane(ctx, P);
}

// ---------------------------------------------------------------- randomisation

/** Applies randomised lion identity onto a params object, in place. */
export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  applyManePreset(P, Math.floor(Math.random() * MANE_PRESETS.length));
  P.maneColor = deriveCoatColor(P.bodyColor);
  return P;
}

/** A fresh randomised params object, with optional fixed overrides. */
export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

// ---------------------------------------------------------------- gui

export const LION_GUI = Object.freeze({
  'snout & ears': [
    ['muzzleStart', 0.2, 1.0], ['muzzleLength', 0.04, 0.24],
    ['muzzleWidth', 0.04, 0.18], ['muzzleDepth', 0.03, 0.14],
    ['muzzleDrop', 0, 0.8], ['muzzleColor', 'color'], ['noseColor', 'color'],
    ['noseSize', 0.2, 1.0],
    ['earLength', 0.03, 0.20], ['earWidth', 0.010, 0.08], ['earFlatten', 0.15, 1.0],
    ['earSpread', 0.1, 0.9], ['earTilt', -0.6, 0.9], ['earPoint', 0, 1.2],
  ],
  mane: [
    ['mane', 'bool'], ['maneColor', 'color'],
    ['manePreset', 0, MANE_PRESETS.length - 1, 1],
    ['maneFaceGap', 0, 3.2], ['maneSpread', 1.0, 1.9], ['maneTall', 0.7, 1.4],
    ['maneDrop', -0.2, 0.6], ['manePush', -0.6, 0.3],
    ['maneSides', 0, 8, 1],
    ['maneRows', 1, 8, 1], ['manePerRow', 3, 20, 1],
    ['maneAutoSize', 'bool'], ['maneTouch', 0.8, 1.6], ['maneSize', 0.08, 0.55],
    ['maneProud', 0.1, 3.0], ['maneFlat', 0, 1.2],
    ['maneTop', 0, 1], ['maneBottom', 0, 1], ['maneStagger', 'bool'],
  ],
});

// ---------------------------------------------------------------- species

// How much motion variation ONE lion gets. See owl.js for the shape and the reasoning.
//
// Heavy and deliberate. The owl is snappy and the llama is languid; a lion is neither -- it is
// unhurried but it commits, so the spring is stiff and the idle is slow. Starting values, to be
// tuned in the motion lab the way the llama's were.
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [70, 210],
  idleRate: [0.55, 1.35],
  idleAmp:  [0.45, 1.25],
  headArc:  [0.70, 1.30],   // a short neck carries less of a head turn than the llama's
  bounce:   [0.01, 0.05],   // some weight in the step, unlike the llama's near-flat glide
  stride:   [1.30, 1.75],   // stocky legs, shorter steps
  kneeLift: [0.45, 1.05],   // a cat pads rather than places
});

export const lion = registerSpecies({
  id: 'lion',
  label: 'Lion',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: { ...BASE_GUI, ...LION_GUI },
  buildKit,
  coatBulge,
  coatColorKey: 'maneColor',
  randomise: randomiseInto,
  onPresetChange: applyManePreset,
  presetKey: 'manePreset',
});

export const createLion = (P) => createCharacter(P, lion);
