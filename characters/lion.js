import * as THREE from 'three';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addEars, addEyes, addTail, createCharacter, hsl, pick, rand, tailBaseHeight, touchingScallopSize,
  feltMaterial, LIMB_TAPER, POSES, part, randomiseBase, registerSpecies, scallopAngles,
  scallopBases, scallopGeometry, scallopMesh,
} from './npc.js';

const TIP = LIMB_TAPER;

// BODIES.md §Lion: snout gap
const SNOUT_GAP = Object.freeze([0.00, 0.45]);

const MIN_MUZZLE = 0.030;

const NOSE_PROUD = 0.30;

// BODIES.md §Lion: mane floors
const MIN_MANE_ROWS = 5;

const MIN_MANE_BOTTOM = 0.50;

const MIN_MANE_PROUD = 1.0;

// BODIES.md §Lion: mane
const MANE_SEAT = 0.95;

const UNDERFUR = 1.02;

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Bramble',
  footColor:     '#6b5336',

  headYawMax:    1.30,

  shoulderOut:   0.88,
  shoulderLift:  0.32,
  clampArmOut:   true,

  neckLength:    0.105,
  neckThick:     0.082,
  headOverlap:   0.070,
  headRadius:    0.178,
  eyeFront:      0.680,
  eyeSpread:     0.420,
  eyeRadius:     0.070,

  muzzleStart:   0.65,
  muzzleLength:  0.056,
  muzzleWidth:   0.104,
  muzzleDepth:   0.082,
  muzzleRound:   0.85,
  muzzleDrop:    0.300,
  muzzleColor:   '#e8d9bd',
  noseColor:     '#241a1c',
  noseSize:      0.52,
  earLength:     0.088,
  earWidth:      0.040,
  earFlatten:    0.40,
  earSpread:     0.520,
  earTilt:       0.300,
  earPoint:      0.30,

  mane:          true,
  tailLength:    0.300,
  tailThick:     0.016,
  tailDroop:    -1.00,
  tailCurl:      0.85,
  maneColor:     '#6e4220',
  manePreset:    0,
  maneRows:      8,
  manePerRow:    11,
  maneAutoSize:  true,
  maneTouch:     1.155,
  maneSize:      0.230,
  maneSides:     5,
  maneProud:     1.524,
  maneTop:       0.00,
  maneBottom:    0.58,
  maneStagger:   false,
  maneFaceGap:   3.20,
  maneTall:      0.981,
  maneHug:       0.60,
  maneDrop:      0.111,
  manePush:      0.185,
};

// BODIES.md §Lion: maneProud solved per preset; preset 0 is the default
export const MANE_PRESETS = Object.freeze([
  { maneRows: 8, manePerRow: 11, maneProud: 1.524, maneStagger: false, maneTop: 0.00, maneBottom: 0.58 },
  { maneRows: 8, manePerRow: 13, maneProud: 1.740, maneStagger: true,  maneTop: 0.02, maneBottom: 0.63 },
  { maneRows: 7, manePerRow: 11, maneProud: 1.291, maneStagger: false, maneTop: 0.04, maneBottom: 0.70 },
  { maneRows: 7, manePerRow: 13, maneProud: 1.885, maneStagger: true,  maneTop: 0.06, maneBottom: 0.78 },
  { maneRows: 6, manePerRow: 13, maneProud: 1.617, maneStagger: true,  maneTop: 0.08, maneBottom: 0.86 },
  { maneRows: 6, manePerRow: 15, maneProud: 1.501, maneStagger: false, maneTop: 0.10, maneBottom: 0.92 },
  { maneRows: 5, manePerRow: 15, maneProud: 1.140, maneStagger: true,  maneTop: 0.12, maneBottom: 0.97 },
]);

export function applyManePreset(P, index) {
  const count = MANE_PRESETS.length;
  P.manePreset = index;
  Object.assign(P, MANE_PRESETS[((index % count) + count) % count]);
  return P;
}

const DRAWN_AS_ONE = new Set(['torsoW', 'torsoH', 'torsoD', 'upperArmLen', 'forearmLen']);

// BODIES.md §Lion: mane ranges, size variety
export const RANDOM_RANGES = Object.freeze({
  ...Object.fromEntries(Object.entries(BASE_RANDOM_RANGES).filter(([k]) => !DRAWN_AS_ONE.has(k))),
  headRadius:   [0.158, 0.198],
  headOverlap:  [0.050, 0.098],
  neckLength:   [0.085, 0.140],
  legHeight:    [0.120, 0.300],
  pupilScale:   [0.280, 0.580],
  muzzleStart:  [0.620, 0.800],
  muzzleWidth:  [0.086, 0.126],
  muzzleDepth:  [0.068, 0.098],
  muzzleRound:  [0.620, 1.150],
  muzzleDrop:   [0.220, 0.380],
  earLength:    [0.066, 0.118],
  earWidth:     [0.030, 0.052],
  earFlatten:   [0.28, 0.56],
  earSpread:    [0.440, 0.600],
  earTilt:      [0.160, 0.440],
  earPoint:     [0.150, 0.550],
  maneTouch:    [1.040, 1.200],
  maneFaceGap:  [2.600, 3.800],
  maneHug:      [0.300, 0.900],
  manePush:     [0.100, 0.220],
  maneTall:     [0.940, 1.200],
  maneDrop:     [0.080, 0.260],
  eyeRadius:    [0.058, 0.082],
  eyeSpread:    [0.360, 0.480],
  eyeFront:     [0.620, 0.740],
});

const HEAD_SHAPE = Object.freeze([1.04, 0.94, 1.00]);
const headScale = (P) => HEAD_SHAPE.map((k) => P.headRadius * k);

const curlSize = (P, shape) => (P.maneAutoSize
  ? touchingScallopSize(shape) * P.maneTouch
  : P.maneSize);

// ponytail: one mane geometry per lion (~1k tris, 1 draw); quantise drawn values to share it if crowds grow
const skullInShell = (P) => ({
  centre: [0, P.maneDrop / P.maneTall, -P.manePush],
  axes: [HEAD_SHAPE[0] * MANE_SEAT, HEAD_SHAPE[1] * MANE_SEAT / P.maneTall, HEAD_SHAPE[2] * MANE_SEAT],
  scale: [1, P.maneTall, 1],
  sweep: P.maneHug * Math.PI * 0.5,
});

const maneShell = (P) => {
  const shape = {
    rows: P.maneRows, perRow: P.manePerRow,
    top: P.maneTop, bottom: P.maneBottom,
    skipFront: P.maneFaceGap,
    sides: P.maneSides,
  };
  return {
    ...shape, size: curlSize(P, shape),
    flat: 0, proud: P.maneProud, stagger: P.maneStagger,
    inside: skullInShell(P),
    underfur: UNDERFUR / MANE_SEAT,
  };
};

export function maneCrownGap(P) {
  const shell = maneShell(P);
  const reach = Math.atan(shell.size);
  const y = (HEAD_SHAPE[1] + P.maneDrop) / P.maneTall;
  const z = -P.manePush;
  const n = Math.hypot(y, z);
  let nearest = Infinity;
  for (const { phi, theta } of scallopAngles(shell)) {
    const dot = (Math.cos(phi) * y + Math.sin(phi) * Math.sin(theta) * z) / n;
    nearest = Math.min(nearest, Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  return nearest - reach;
}

export const maneBases = (P) => scallopBases(maneShell(P));

export const coatBulge = () => 0;

function addHead(ctx, P) {
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale: headScale(P) }));
}

function addMuzzle(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const start = P.headRadius * P.muzzleStart;
  const { muzzleLength: len, muzzleWidth: w, muzzleDepth: d } = P;

  ctx.head.add(part(GEO.taper, ctx.mat.muzzle, {
    pos: [0, y, start + len / 2],
    scale: [w, len, d],
    rot: [-Math.PI * 0.5, 0, 0],
  }));
  if (P.muzzleRound <= 0) return;
  ctx.head.add(part(GEO.sphere, ctx.mat.muzzle, {
    pos: [0, y, start + len],
    scale: [w * TIP, d * TIP, w * TIP * P.muzzleRound],
  }));
}

function noseAt(P) {
  const tipW = P.muzzleWidth * TIP;
  const r = tipW * P.noseSize;
  const depth = r * 1.80;
  const capFront = P.headRadius * P.muzzleStart + P.muzzleLength + tipW * P.muzzleRound;
  const front = capFront + NOSE_PROUD * depth;
  return { r, centre: front - r * 0.90, back: front - depth, depth, front };
}

function headSkinZ(P) {
  const k = 1 - (-P.muzzleDrop / HEAD_SHAPE[1]) ** 2;
  return k > 0 ? P.headRadius * HEAD_SHAPE[2] * Math.sqrt(k) : 0;
}

export const snoutGap = (P) => {
  const nose = noseAt(P);
  return (nose.back - headSkinZ(P)) / nose.depth;
};

function addNose(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const { r, centre } = noseAt(P);

  ctx.head.add(part(GEO.sphere, ctx.mat.nose, {
    pos: [0, y + r * 0.30, centre],
    scale: [r * 1.25, r * 0.85, r * 0.90],
  }));
}

function addMane(ctx, P) {
  if (!P.mane) return;
  const radius = P.headRadius;
  const shell = scallopMesh(scallopGeometry(maneShell(P)), ctx.mat.mane,
    [radius, radius * P.maneTall, radius]);
  if (!shell) return;
  shell.name = 'mane';
  shell.userData.trimUnderHat = true;
  shell.position.set(0, -P.headRadius * P.maneDrop, P.headRadius * P.manePush);
  ctx.head.add(shell);
}

const JOIN = 0.5;

function addEarTips(ctx, P) {
  if (P.earPoint <= 0) return;
  for (const ear of ctx.joints.ear) {
    const { size, length, midY, halfH, flatten } = ear;
    const k = Math.sqrt(1 - JOIN * JOIN);
    const base = midY + halfH * JOIN;
    const h = halfH * (1 - JOIN) + length * P.earPoint;
    ear.node.add(part(GEO.cone, ctx.mat.body, {
      pos: [0, base + h / 2, 0],
      scale: [size * k, h, size * flatten * k],
    }));
  }
}

function buildKit(ctx, P) {
  ctx.mat.mane = ctx.addMaterial(feltMaterial(P, P.maneColor));
  ctx.mat.muzzle = ctx.addMaterial(feltMaterial(P, P.muzzleColor));
  ctx.mat.nose = ctx.addMaterial(feltMaterial(P, P.noseColor));

  addHead(ctx, P);
  addEyes(ctx, P, { squash: 1.0, head: headScale(P) });
  addMuzzle(ctx, P);
  addNose(ctx, P);
  addEars(ctx, P, {
    size: P.earWidth, length: P.earLength, shape: 'leaf',
    spread: P.earSpread, tilt: P.earTilt, lift: 0.70, back: -0.14,
    flatten: P.earFlatten, head: headScale(P),
  });
  addEarTips(ctx, P);
  addMane(ctx, P);
  addLionTail(ctx, P);
}

function addLionTail(ctx, P) {
  const r = P.tailThick;
  addTail(ctx, P, {
    segments: 3,
    dress(node, i, len) {
      node.add(part(GEO.cyl, ctx.mat.body, { pos: [0, 0, -len / 2], scale: [r, len, r], rot: [Math.PI / 2, 0, 0] }));
      node.add(part(GEO.sphere, ctx.mat.body, { scale: [r, r, r] }));
      if (i === 2) {
        node.add(part(GEO.sphere, ctx.mat.mane, { pos: [0, 0, -len], scale: [r * 2.6, r * 2.6, r * 3.4] }));
      }
    },
  });
}

function solveSnout(P) {
  const gap = SNOUT_GAP[0] + Math.random() * (SNOUT_GAP[1] - SNOUT_GAP[0]);
  const tipW = P.muzzleWidth * TIP;
  const r = tipW * P.noseSize;
  const depth = r * 1.80;
  const front = headSkinZ(P) + gap * depth + (1 - NOSE_PROUD) * depth - tipW * P.muzzleRound;
  P.muzzleLength = front - P.headRadius * P.muzzleStart;
  if (P.muzzleLength >= MIN_MUZZLE) return;
  P.muzzleLength = MIN_MUZZLE;
  P.muzzleStart = (front - MIN_MUZZLE) / P.headRadius;
}

export function lightness(hex) {
  const c = new THREE.Color(hex);
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

// BODIES.md §Lion: mane colour
const MIN_MANE_CONTRAST = 28;

export function deriveManeColor(bodyHex) {
  const body = {};
  new THREE.Color(bodyHex).getHSL(body);
  const target = rand(MIN_MANE_CONTRAST, 44);
  const bodyL = lightness(bodyHex);
  const darker = Math.random() < 0.75;
  const hue = (body.h + (Math.random() < 0.3 ? rand(-0.06, 0.06) : 0) + 1) % 1;
  const sat = THREE.MathUtils.clamp(body.s * (darker ? rand(1.0, 1.4) : rand(0.7, 1.0)), 0.05, 0.9);
  const gap = (l) => Math.abs(lightness(hsl(hue, sat, l)) - bodyL);
  const end = (d) => (d < 0 ? 0.05 : 0.95);
  const dir = [darker ? -1 : 1, darker ? 1 : -1].find((d) => gap(end(d)) >= MIN_MANE_CONTRAST)
    ?? (gap(0.05) > gap(0.95) ? -1 : 1);
  const want = Math.min(target, gap(end(dir)));
  let { l } = body;
  while (gap(l) < want && Math.abs(l - end(dir)) > 1e-9) {
    l = dir < 0 ? Math.max(end(dir), l - 0.01) : Math.min(end(dir), l + 0.01);
  }
  return hsl(hue, sat, l);
}

// BODIES.md §Lion: size variety
const BODY_SIZE = [0.72, 1.30];
const ARM_SIZE = [0.75, 1.30];

const MAX_ARM_RATIO = 0.70;

// BODIES.md §Lion: tail clears the floor
const TAIL_RATIO = [0.85, 1.00];
const round3 = (n) => Math.round(n * 1000) / 1000;

function varyBody(P) {
  const body = rand(...BODY_SIZE);
  for (const k of ['torsoW', 'torsoH', 'torsoD']) P[k] = round3(DEFAULT_PARAMS[k] * body * rand(0.92, 1.08));
  const arm = rand(...ARM_SIZE);
  for (const k of ['upperArmLen', 'forearmLen']) P[k] = DEFAULT_PARAMS[k] * arm * rand(0.95, 1.05);
  const over = (P.upperArmLen + P.forearmLen) / ((P.legHeight + P.torsoH) * MAX_ARM_RATIO);
  for (const k of ['upperArmLen', 'forearmLen']) P[k] = round3(P[k] / Math.max(1, over));
}

export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  varyBody(P);
  P.tailLength = rand(...TAIL_RATIO) * tailBaseHeight(P);
  solveSnout(P);
  applyManePreset(P, Math.floor(Math.random() * MANE_PRESETS.length));
  P.maneSides = pick([4, 5, 6]);
  P.maneColor = deriveManeColor(P.bodyColor);
  return P;
}

export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

export const LION_GUI = Object.freeze({
  'snout & ears': [
    ['muzzleStart', 0.2, 1.0], ['muzzleLength', 0.04, 0.24],
    ['muzzleWidth', 0.04, 0.18], ['muzzleDepth', 0.03, 0.14],
    ['muzzleRound', 0, 1.8],
    ['muzzleDrop', 0, 0.8], ['muzzleColor', 'color'], ['noseColor', 'color'],
    ['noseSize', 0.2, 1.0],
    ['earLength', 0.03, 0.20], ['earWidth', 0.010, 0.08], ['earFlatten', 0.15, 1.0],
    ['earSpread', 0.1, 0.9], ['earTilt', -0.6, 0.9], ['earPoint', 0, 0.9],
  ],
  mane: [
    ['mane', 'bool'], ['maneColor', 'color'],
    ['manePreset', 0, MANE_PRESETS.length - 1, 1],
    ['maneFaceGap', 0, 4.2], ['maneTall', 0.7, 1.4], ['maneHug', 0, 1],
    ['maneDrop', 0, 0.6], ['manePush', -0.6, 0.3],
    ['maneSides', 0, 8, 1],
    ['maneRows', MIN_MANE_ROWS, 10, 1], ['manePerRow', 3, 20, 1],
    ['maneAutoSize', 'bool'], ['maneTouch', 0.8, 1.6], ['maneSize', 0.08, 0.55],
    ['maneProud', MIN_MANE_PROUD, 3.0],
    ['maneTop', 0, 0.4], ['maneBottom', MIN_MANE_BOTTOM, 1], ['maneStagger', 'bool'],
  ],
});

// BODIES.md §Lion
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [70, 210],
  idleRate: [0.55, 1.35],
  idleAmp:  [0.45, 1.25],
  headArc:  [0.70, 1.30],
  bounce:   [0.01, 0.05],
  stride:   [1.30, 1.75],
  kneeLift: [0.45, 1.05],
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
  // The arms vanish against the mane, so the tail carries the cheer: lifted clear of the body.
  delighted: Object.freeze({ ...POSES.delighted, tailLift: 0.9, tailWag: 1.6 }),
});

export const createLion = (P) => createCharacter(P, lion);
