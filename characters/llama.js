import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, GEO,
  addEars, addEyes, addHead, addTail, addTorsoCoat, coatBulge, coatSize,
  feltMaterial, POSES, part, registerSpecies, scallopGeometry, scallopMesh,
} from './npc.js';
import { named, softGeometry } from './faces.js';

const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Perpetua',
  footColor:     '#5d4a3c',

  headYawMax:    1.90,

  // BODIES.md §Face
  facePaintSize:   0.80,
  facePaintDown:   0.00,
  facePaintOut:    1.30,

  shoulderOut:   1.00,
  shoulderLift:  0.34,
  clampArmOut:   true,

  neckLength:    0.380,
  neckThick:     0.052,
  headOverlap:   0.020,
  headRadius:    0.112,
  eyeFront:      0.700,

  muzzleLength:  0.215,
  muzzleThick:   0.076,
  muzzleDrop:    0.240,
  muzzleColor:   '#efe6d5',
  noseColor:     '#141013',
  noseSize:      0.60,
  earLength:     0.140,
  earWidth:      0.032,
  earFlatten:    0.45,
  earSpread:     0.440,
  earTilt:       0.160,

  fleece:        true,
  fleeceColor:   '#cbb9a2',
  fleecePreset:  2,
  fleeceRows:    5,
  fleecePerRow:  9,
  fleeceAutoSize:true,
  fleeceTouch:   1.08,
  fleeceSize:    0.250,
  fleeceFlat:    0.44,
  fleeceProud:   0.76,
  fleeceTop:     0.28,
  fleeceBottom:  0.96,
  fleeceStagger: true,

  fleeceNeck:    true,
  fleeceNeckCoverage: 0.50,
  fleeceNeckSpread:   2.40,
  fleeceNeckScale:    0.85,

  tailLength:    0.085,
  tailThick:     0.036,
  tailDroop:    -0.35,
  tailStiff:     420,
  tailZeta:      0.45,
};

const FLEECE_PRESETS = Object.freeze([
  { fleeceRows: 4, fleecePerRow: 7,  fleeceProud: 0.80, fleeceFlat: 0.42, fleeceStagger: true,  fleeceTop: 0.32, fleeceBottom: 0.95 },
  { fleeceRows: 4, fleecePerRow: 9,  fleeceProud: 0.72, fleeceFlat: 0.44, fleeceStagger: true,  fleeceTop: 0.30, fleeceBottom: 0.96 },
  { fleeceRows: 5, fleecePerRow: 9,  fleeceProud: 0.76, fleeceFlat: 0.44, fleeceStagger: true,  fleeceTop: 0.28, fleeceBottom: 0.96 },
  { fleeceRows: 5, fleecePerRow: 11, fleeceProud: 0.68, fleeceFlat: 0.46, fleeceStagger: true,  fleeceTop: 0.28, fleeceBottom: 0.97 },
  { fleeceRows: 6, fleecePerRow: 10, fleeceProud: 0.82, fleeceFlat: 0.46, fleeceStagger: true,  fleeceTop: 0.26, fleeceBottom: 0.97 },
  { fleeceRows: 6, fleecePerRow: 13, fleeceProud: 0.66, fleeceFlat: 0.48, fleeceStagger: false, fleeceTop: 0.24, fleeceBottom: 0.98 },
  { fleeceRows: 7, fleecePerRow: 12, fleeceProud: 0.78, fleeceFlat: 0.48, fleeceStagger: true,  fleeceTop: 0.22, fleeceBottom: 0.98 },
  { fleeceRows: 8, fleecePerRow: 15, fleeceProud: 0.62, fleeceFlat: 0.50, fleeceStagger: true,  fleeceTop: 0.20, fleeceBottom: 0.99 },
]);

const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  neckLength:   [0.260, 0.520],
  neckThick:    [0.042, 0.066],
  legHeight:    [0.130, 0.430],
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
  fleeceNeckCoverage: [0.360, 0.820],
  fleeceNeckSpread:   [1.800, 3.300],
  eyeRadius:    [0.048, 0.070],
  eyeSpread:    [0.520, 0.660],
  eyeFront:     [0.620, 0.780],
  tailLength:   [0.065, 0.110],
  facePaintSize:  [0.60, 1.00],
});

const neckShell = (P) => {
  const shape = {
    rows: Math.max(2, Math.round(P.fleeceRows * 0.8)),
    perRow: Math.max(5, Math.round(P.fleecePerRow * 0.7)),
    top: 0.30, bottom: 0.92,
  };
  return {
    ...shape, size: coatSize(P, 'fleece', shape) * P.fleeceNeckScale,
    flat: P.fleeceFlat, proud: P.fleeceProud, stagger: P.fleeceStagger,
  };
};

function addMuzzle(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const start = P.headRadius * 0.30;
  const { muzzleLength: len, muzzleThick: r } = P;

  ctx.head.add(part(GEO.cyl, ctx.mat.muzzle, {
    pos: [0, y, start + len / 2],
    scale: [r, len, r * 0.92],
    rot: [Math.PI * 0.5, 0, 0],
  }));
  if (P.shapedFaces) {
    addLips(ctx, P, { y, end: start + len, r });
    return;
  }
  ctx.head.add(part(GEO.sphere, ctx.mat.muzzle, {
    pos: [0, y, start + len],
    scale: [r, r * 0.96, r * 0.80],
  }));
}

// BODIES.md §Shaped faces: two soft lobes with the llama's cleft between, a jaw a hair further forward
const LIP = Object.freeze({ out: 0.38, w: 0.64, h: 0.84, d: 0.78 });
const JAW = Object.freeze({ down: 0.66, w: 0.50, h: 0.32, d: 0.55, underbite: 0.04 });

function addLips(ctx, P, { y, end, r }) {
  for (const side of [-1, 1]) {
    ctx.head.add(named(part(softGeometry(), ctx.mat.muzzle, {
      pos: [side * r * LIP.out, y, end], scale: [r * LIP.w, r * LIP.h, r * LIP.d],
    }), 'lip'));
  }
  const jaw = {
    at: [0, y - r * JAW.down, end + r * (LIP.d + JAW.underbite - JAW.d)],
    size: [r * JAW.w, r * JAW.h, r * JAW.d],
  };
  ctx.head.add(named(part(softGeometry(), ctx.mat.muzzle, { pos: jaw.at, scale: jaw.size }), 'jaw'));
}

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

function addNeckFleece(ctx, P) {
  if (!P.fleece || !P.fleeceNeck) return;
  const half = (P.neckLength * P.fleeceNeckCoverage) / 2;
  // BODIES.md §Llama: ruff cap
  const radius = Math.min(P.neckThick * P.fleeceNeckSpread, half * 1.7);
  const shell = scallopMesh(scallopGeometry(neckShell(P)), ctx.mat.fleece, [radius, half, radius]);
  if (!shell) return;
  shell.position.y = half;
  ctx.neck.add(shell);
}

function buildKit(ctx, P) {
  ctx.mat.fleece = ctx.addMaterial(feltMaterial(P, P.fleeceColor));
  ctx.mat.muzzle = ctx.addMaterial(feltMaterial(P, P.muzzleColor));
  ctx.mat.nose = ctx.addMaterial(feltMaterial(P, P.noseColor));

  addHead(ctx, P);
  addEyes(ctx, P, { squash: 1.1, head: ctx.headScale });
  addMuzzle(ctx, P);
  addNose(ctx, P);
  addEars(ctx, P, {
    size: P.earWidth, length: P.earLength, shape: 'leaf',
    spread: P.earSpread, tilt: P.earTilt, lift: 0.72, back: -0.10,
    flatten: P.earFlatten, head: ctx.headScale,
  });
  addTorsoCoat(ctx, P, { on: 'fleece', coat: 'fleece', material: ctx.mat.fleece });
  addNeckFleece(ctx, P);
  addLlamaTail(ctx, P);
}

function addLlamaTail(ctx, P) {
  const r = P.tailThick;
  addTail(ctx, P, {
    dress(node, i, len) {
      node.add(part(GEO.sphere, ctx.mat.fleece, { pos: [0, 0, -len * 0.35], scale: [r, r * 1.1, len * 0.45] }));
      node.add(part(GEO.sphere, ctx.mat.fleece, { pos: [0, 0, -len * 0.80], scale: [r * 0.75, r * 0.8, len * 0.30] }));
    },
  });
}

const LLAMA_GUI = Object.freeze({
  'head & face': [
    ['muzzleLength', 0.05, 0.40], ['muzzleThick', 0.02, 0.14], ['muzzleDrop', 0, 0.8],
    ['muzzleColor', 'color'], ['noseColor', 'color'], ['noseSize', 0.2, 1.4],
    ['earLength', 0.03, 0.30], ['earWidth', 0.008, 0.07], ['earFlatten', 0.15, 1.0],
    ['earSpread', 0.1, 0.9], ['earTilt', -0.6, 0.9],
  ],
  coat: [
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

// BODIES.md §Llama
const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [55, 190],
  idleRate: [0.60, 1.60],
  idleAmp:  [0.50, 1.50],
  headArc:  [0.90, 1.80],
  bounce:   [0.00, 0.02],
  stride:   [1.78, 2.20],
  kneeLift: [0.70, 1.70],
});

registerSpecies({
  id: 'llama',
  label: 'Llama',
  emoji: '🦙',
  firstFur: '#fd9bd9',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: LLAMA_GUI,
  headShape: [0.80, 0.94, 1.16],
  buildKit,
  coatBulge: (P) => coatBulge(P, 'fleece', 'fleece'),
  coatColorKey: 'fleeceColor',
  // BODIES.md §Painterly
  paint: { style: 'fur', accent: ['fleece'] },
  presets: FLEECE_PRESETS,
  presetKey: 'fleecePreset',
  // The arms vanish against the fleece, so the ears carry the cheer.
  delighted: Object.freeze({ ...POSES.delighted, earFlap: 1 }),
});

