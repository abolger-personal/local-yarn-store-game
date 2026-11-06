import * as THREE from 'three';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, GEO,
  addConeEars, addEyes, addHead, addTail, addTorsoCoat, coatBulge,
  feltMaterial, part, registerSpecies, scallopGeometry, scallopMesh, tailBaseHeight,
} from './npc.js';
import { named, onFront } from './faces.js';

const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Hoot',
  footColor:     '#e0a53c',

  headYawMax:    4.60,

  // BODIES.md §Face
  facePaintSize:   1.00,

  tuftSize:      0.049,
  tuftSpread:    0.694,
  tuftTilt:      0.800,
  beakSize:      0.090,
  beakColor:     '#e0a53c',
  shapedFaces:   false,
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
const FEATHER_PRESETS = Object.freeze([
  { featherRows: 2, featherPerRow: 7,  featherSize: 0.330, featherProud: 0.40, featherFlat: 0.34, featherStagger: true,  featherTop: 0.44, featherBottom: 0.94 },
  { featherRows: 2, featherPerRow: 11, featherSize: 0.245, featherProud: 0.34, featherFlat: 0.42, featherStagger: false, featherTop: 0.40, featherBottom: 0.92 },
  { featherRows: 3, featherPerRow: 9,  featherSize: 0.276, featherProud: 0.32, featherFlat: 0.40, featherStagger: true,  featherTop: 0.40, featherBottom: 0.95 },
  { featherRows: 3, featherPerRow: 13, featherSize: 0.205, featherProud: 0.44, featherFlat: 0.36, featherStagger: true,  featherTop: 0.34, featherBottom: 0.96 },
  { featherRows: 4, featherPerRow: 8,  featherSize: 0.300, featherProud: 0.26, featherFlat: 0.48, featherStagger: true,  featherTop: 0.46, featherBottom: 0.98 },
  { featherRows: 4, featherPerRow: 12, featherSize: 0.220, featherProud: 0.46, featherFlat: 0.30, featherStagger: false, featherTop: 0.36, featherBottom: 0.94 },
  { featherRows: 5, featherPerRow: 10, featherSize: 0.235, featherProud: 0.38, featherFlat: 0.44, featherStagger: true,  featherTop: 0.30, featherBottom: 0.97 },
  { featherRows: 3, featherPerRow: 6,  featherSize: 0.330, featherProud: 0.30, featherFlat: 0.28, featherStagger: true,  featherTop: 0.48, featherBottom: 0.93 },
]);

const RANDOM_RANGES = Object.freeze({
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
  facePaintSize:  [0.70, 1.30],
});

const WING_OFFSET = 0.012;

const wingScale = (P) => {
  const cover = P.limbThick * 1.05 + WING_OFFSET + 0.004;
  return [
    Math.max(P.wingLength * P.wingWidth, cover),
    P.wingLength * 0.52,
    Math.max(P.wingLength * P.wingDepth, cover),
  ];
};

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

function addHeadPlumage(ctx, P) {
  if (!P.feathers || !P.featherHead) return;
  const shell = scallopMesh(scallopGeometry(headShell(P)), ctx.mat.feather, ctx.headScale);
  if (shell) ctx.head.add(shell);
}

// BODIES.md §Shaped faces: one short beak whose blunt tip curls gently down
const BEAK = Object.freeze({ wide: 0.50, tall: 0.42, length: 1.45, buried: 0.60, curl: 0.85, rings: 6 });

const curledBeak = () => {
  const g = new THREE.CylinderGeometry(0.18, 1, 1, 12, BEAK.rings), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + BEAK.curl * (pos.getY(i) + 0.5) ** 3);
  g.translate(0, 0.5, 0).computeVertexNormals();
  return g;
};
let beakGeometry = null;

function addShapedBeak(ctx, P) {
  const s = P.beakSize, y = -P.headRadius * 0.10, head = { at: [0, 0, 0], size: ctx.headScale };
  const skin = onFront(head, 0, y)[2];
  beakGeometry ??= curledBeak();
  ctx.head.add(named(part(beakGeometry, ctx.mat.beak, {
    pos: [0, y, skin - s * BEAK.buried], scale: [s * BEAK.wide, s * BEAK.length, s * BEAK.tall], rot: [Math.PI * 0.5, 0, 0],
  }), 'beak'));
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
  addHeadPlumage(ctx, P);
  addEyes(ctx, P, { head: ctx.headScale });
  addBeak(ctx, P);
  addTorsoCoat(ctx, P, { on: 'feathers', coat: 'feather', material: ctx.mat.feather });
  addConeEars(ctx, P, {
    size: P.tuftSize, length: P.tuftSize * 2.4,
    spread: P.tuftSpread, tilt: P.tuftTilt, lift: 0.55, head: ctx.headScale,
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

// a long tail only on an owl high enough off the floor for it, as the lion's
const shortenTail = (P) => { P.tailLength = Math.min(P.tailLength, 0.9 * tailBaseHeight(P)); };

// spinoff/REUSE-SPEC.md §Costumes: the owl's hand is buried mid-wing, so its wing tips go into the gloves,
// each big enough to swallow its tip whatever the owl's wing size, and never smaller than a glove on a hand (`hand`)
const WING_TIP = 0.8;

function wingTipGloves(built, hand) {
  const { pos, scale } = wingShape(built.params);
  const across = Math.sqrt(1 - WING_TIP ** 2);
  const r = 1.05 * Math.max(hand, scale[0] * across, (scale[2] * across) / 1.1, (scale[1] * (1 - WING_TIP)) / 0.95);
  return built.joints.upperArm.map(({ node, side }) => ({ parent: node, at: [side * pos[0], pos[1] - scale[1] * WING_TIP, 0], r }));
}

const OWL_GUI = Object.freeze({
  'head & face': [
    ['tuftSize', 0.01, 0.14], ['tuftSpread', 0.1, 1.1], ['tuftTilt', -1.5, 1.5],
    ['beakSize', 0.01, 0.18], ['beakColor', 'color'],
  ],
  coat: [
    ['feathers', 'bool'], ['featherColor', 'color'],
    ['featherHead', 'bool'], ['featherWings', 'bool'],
    ['featherPreset', 0, FEATHER_PRESETS.length - 1, 1],
    ['featherRows', 1, 8, 1], ['featherPerRow', 3, 20, 1],
    ['featherSize', 0.08, 0.55], ['featherProud', 0.1, 1.2], ['featherFlat', 0, 1.2],
    ['featherTop', 0, 1], ['featherBottom', 0, 1],
    ['featherHeadScale', 0.2, 1.4], ['featherWingScale', 0.2, 1.4],
    ['featherFaceGap', 0, 3.2], ['featherStagger', 'bool'],
    ['wingLength', 0.08, 0.40], ['wingWidth', 0.06, 0.45], ['wingDepth', 0.10, 0.70],
  ],
});

// BODIES.md §Owl
const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [140, 300],
  idleRate: [1.20, 3.00],
  idleAmp:  [0.30, 1.10],
  headArc:  [1.20, 2.20],
  stride:   [1.30, 1.90],
});

registerSpecies({
  id: 'owl',
  label: 'Owl',
  emoji: '🦉',
  firstFur: '#0fc8c5',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: OWL_GUI,
  headShape: [1.06, 1.00, 0.98],
  buildKit,
  coatBulge: (P) => coatBulge(P, 'feathers', 'feather'),
  wingShape,
  gloveAnchors: wingTipGloves,
  coatColorKey: 'featherColor',
  vary: shortenTail,
  // BODIES.md §Painterly
  paint: { style: 'ink', plume: ['feather', 'body'] },
  presets: FEATHER_PRESETS,
  presetKey: 'featherPreset',
});
