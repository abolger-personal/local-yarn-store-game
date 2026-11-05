import * as THREE from 'three';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addConeEars, addEyes, addTail, createCharacter, deriveCoatColor,
  feltMaterial, part, randomiseBase, registerSpecies, scallopGeometry, scallopMesh, tailBaseHeight,
} from './npc.js';
import { MOUTHS, addMouth, mouthFor, named, onFront, softGeometry } from './faces.js';

export {
  TONE_MAPPING, POSES, POSE_KEYS, GEO_DETAIL, NAMES,
  rand, pick, randHex, randomFur, slugify,
  feltMaterial, eyeMaterial, knitMaterial, greyMat, blackMat,
  setGeometryDetail, getGeometryDetail, setViewMode, applyPose,
  disposeCharacter as disposeOwl,
} from './npc.js';

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Hoot',
  footColor:     '#e0a53c',

  headYawMax:    4.60,

  // BODIES.md §Face
  faceAccentSize:  1.00,

  tuftSize:      0.049,
  tuftSpread:    0.694,
  tuftTilt:      0.800,
  beakSize:      0.090,
  beakColor:     '#e0a53c',
  shapedFaces:   false,
  mouth:         'smile',
  wingLength:    0.349,
  wingWidth:     0.200,
  wingDepth:     0.360,

  feathers:      true,
  featherColor:  '#8d93a8',
  featherPreset: 2,
  featherRows:   3,
  featherPerRow: 9,
  featherSize:   0.276,
  featherFlat:   0.40,
  featherProud:  0.32,
  featherTop:    0.40,
  featherBottom: 0.95,
  featherStagger:true,

  featherHead:   true,
  featherHeadScale: 0.74,
  featherFaceGap: 1.25,
  featherWings:  true,
  featherWingScale: 0.62,

  tailLength:    0.250,
  tailThick:     0.030,
  tailDroop:    -0.75,
  tailStiff:     380,
  tailZeta:      0.40,
};

// BODIES.md §Owl
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

export const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  neckLength:  [0.050, 0.160],
  headOverlap: [0.050, 0.150],
  headRadius:  [0.150, 0.195],
  tuftSize:    [0.024, 0.075],
  tuftSpread:  [0.350, 1.040],
  tuftTilt:    [-0.150, 1.350],
  wingLength:  [0.300, 0.390],
  wingWidth:   [0.175, 0.260],
  wingDepth:   [0.280, 0.440],
  beakSize:    [0.070, 0.110],
  tailLength:  [0.160, 0.450],
  eyeRingWidth: [0.200, 0.450],
  faceAccentSize: [0.70, 1.30],
});

const headScale = (P) => [P.headRadius * 1.06, P.headRadius, P.headRadius * 0.98];

const WING_OFFSET = 0.012;

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

// BODIES.md §Shaped faces: a short beak whose blunt tip curls gently down, a small lower mandible, a soft cere
const BEAK = Object.freeze({ wide: 0.50, tall: 0.42, length: 1.45, buried: 0.60, curl: 0.85, rings: 6 });

const curledBeak = () => {
  const g = new THREE.CylinderGeometry(0.18, 1, 1, 12, BEAK.rings), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + BEAK.curl * (pos.getY(i) + 0.5) ** 3);
  g.translate(0, 0.5, 0).computeVertexNormals();
  return g;
};
let beakGeometry = null;

// the mandible drops for an 'o', tilts for a smug one
const MANDIBLE = Object.freeze({ smile: [0, 0], smug: [0, 0.18], deadpan: [0, 0], o: [0.14, 0] });

function addShapedBeak(ctx, P) {
  const s = P.beakSize, y = -P.headRadius * 0.10, head = { at: [0, 0, 0], size: headScale(P) };
  const skin = onFront(head, 0, y)[2];
  beakGeometry ??= curledBeak();
  ctx.head.add(named(part(beakGeometry, ctx.mat.beak, {
    pos: [0, y, skin - s * BEAK.buried], scale: [s * BEAK.wide, s * BEAK.length, s * BEAK.tall], rot: [Math.PI * 0.5, 0, 0],
  }), 'beak'));
  const [drop, tilt] = MANDIBLE[P.mouth] ?? MANDIBLE.smile;
  ctx.head.add(named(part(softGeometry(), ctx.mat.beak, {
    pos: onFront(head, 0, y - s * (0.40 + drop)), scale: [s * 0.36, s * 0.20, s * 0.42], rot: [0, 0, tilt],
  }), 'mandible'));
  ctx.head.add(named(part(softGeometry(), ctx.mat.beak, {
    pos: onFront(head, 0, y + s * 0.42, -s * 0.14), scale: [s * 0.55, s * 0.26, s * 0.32],
  }), 'cere'));
  addMouth(ctx.head, P, {
    on: head, width: s * 1.6, drop: -y + s * 0.30, material: ctx.addMaterial(feltMaterial(P, P.pupilColor)), dot: [s * 0.2, s * 0.07, s * 0.35],
  });
}

function addBeak(ctx, P) {
  if (P.shapedFaces) {
    addShapedBeak(ctx, P);
    return;
  }
  ctx.head.add(part(GEO.cone, ctx.mat.beak, {
    pos: [0, -P.headRadius * 0.10, P.headRadius * 0.86],
    scale: [P.beakSize, P.beakSize * 2.1, P.beakSize],
    rot: [Math.PI * 0.5, 0, 0],
  }));
}

const WING_ROLL = 0.08;

export const wingShape = (P) => ({ pos: [WING_OFFSET, -P.wingLength * 0.42, 0], scale: wingScale(P), roll: WING_ROLL });

function addWing(shoulder, side, ctx, P) {
  const scale = wingScale(P);
  const pos = [side * WING_OFFSET, -P.wingLength * 0.42, 0];
  const rot = [0, 0, side * WING_ROLL];
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
  addConeEars(ctx, P, {
    size: P.tuftSize, length: P.tuftSize * 2.4,
    spread: P.tuftSpread, tilt: P.tuftTilt, lift: 0.55, head: headScale(P),
  });
  for (const { node, side } of ctx.joints.upperArm) addWing(node, side, ctx, P);
  addTail(ctx, P, { dress: (node, i, len) => addTailFan(node, len, ctx, P) });
}

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

export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  // a long tail only on an owl high enough off the floor for it, as the lion's
  P.tailLength = Math.min(P.tailLength, 0.9 * tailBaseHeight(P));
  applyFeatherPreset(P, Math.floor(Math.random() * FEATHER_PRESETS.length));
  P.featherColor = deriveCoatColor(P.bodyColor);
  P.mouth = mouthFor(P);
  return P;
}

export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

export const OWL_GUI = Object.freeze({
  'face & tufts': [
    ['tuftSize', 0.01, 0.14], ['tuftSpread', 0.1, 1.1], ['tuftTilt', -1.5, 1.5],
    ['beakSize', 0.01, 0.18], ['beakColor', 'color'], ['mouth', MOUTHS],
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

// BODIES.md §Owl
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [140, 300],
  idleRate: [1.20, 3.00],
  idleAmp:  [0.30, 1.10],
  headArc:  [1.20, 2.20],
  stride:   [1.30, 1.90],
});

export const owl = registerSpecies({
  id: 'owl',
  label: 'Owl',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: { ...BASE_GUI, ...OWL_GUI },
  buildKit,
  coatBulge,
  wingShape,
  coatColorKey: 'featherColor',
  randomise: randomiseInto,
  // BODIES.md §Painterly
  paint: { style: 'ink', plume: 'feather' },
  onPresetChange: applyFeatherPreset,
  presetKey: 'featherPreset',
});

export const createOwl = (P) => createCharacter(P, owl);
