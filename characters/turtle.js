import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, GEO,
  addEyes, addHead, addTail, addTorsoCoat, coatBulge, facePaintColorFor,
  feltMaterial, hsl, part, rand, registerSpecies, skinDecal, skinPatch,
} from './npc.js';
import { named, onFront, softGeometry, softTriangle } from './faces.js';

const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Shelly',
  bodyColor:     '#1fd18b',

  // BODIES.md §Turtle: burly, low and round
  legHeight:     0.140,
  hipInset:      0.070,
  torsoW:        0.245,
  torsoH:        0.220,
  headRadius:    0.180,
  torsoD:        0.235,
  limbThick:     0.046,
  shoulderLift:  0.40,
  neckLength:    0.060,
  neckThick:     0.125,
  headOverlap:   0.070,

  eyeRadius:     0.108,
  // BODIES.md §Turtle: eyes far apart, out on the sides, or it doesn't read reptile
  eyeSpread:     0.650,
  eyeLift:       0.200,

  beakSize:      0.055,
  beakColor:     '#e0a53c',

  neckFolds:     2,
  stripes:       true,
  stripeColor:   '',
  stripeWidth:   0.070,

  shell:         true,
  scuteColor:    '#0b5e3d',
  rimColor:      '',
  shellRim:      true,
  plastron:      true,
  scutePreset:   1,
  scuteRows:     3,
  scutePerRow:   8,
  scuteSides:    6,
  scuteAutoSize: true,
  scuteTouch:    1.10,
  scuteSize:     0.300,
  scuteFlat:     0.12,
  scuteProud:    0.30,
  scuteTop:      0.06,
  scuteBottom:   0.70,
  scuteGap:      2.20,
  scuteStagger:  true,

  tailLength:    0.080,
  tailThick:     0.034,
  tailDroop:    -0.60,
  tailStiff:     420,
  tailZeta:      0.45,
};

// BODIES.md §Turtle: plates, not bumps (low proud, flat just under it), a bare belly for the plastron
const SCUTE_PRESETS = Object.freeze([
  { scuteRows: 2, scutePerRow: 7,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.30, scuteTop: 0.08, scuteBottom: 0.68, scuteGap: 2.20, scuteStagger: true },
  { scuteRows: 3, scutePerRow: 8,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.30, scuteTop: 0.06, scuteBottom: 0.70, scuteGap: 2.20, scuteStagger: true },
  { scuteRows: 3, scutePerRow: 10, scuteSides: 5, scuteTouch: 1.15, scuteFlat: 0.14, scuteProud: 0.30, scuteTop: 0.06, scuteBottom: 0.72, scuteGap: 2.00, scuteStagger: true },
  { scuteRows: 4, scutePerRow: 9,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.26, scuteTop: 0.05, scuteBottom: 0.74, scuteGap: 2.40, scuteStagger: false },
  { scuteRows: 3, scutePerRow: 7,  scuteSides: 0, scuteTouch: 1.05, scuteFlat: 0.16, scuteProud: 0.30, scuteTop: 0.08, scuteBottom: 0.70, scuteGap: 2.20, scuteStagger: true },
]);

const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  legHeight:   [0.100, 0.160],
  torsoW:      [0.215, 0.275],
  // BODIES.md §Turtle: deeper, the arms can't reach round the shell to knit
  torsoD:      [0.205, 0.240],
  limbThick:   [0.040, 0.052],
  neckThick:   [0.110, 0.135],
  eyeRadius:   [0.096, 0.118],
  eyeSpread:   [0.600, 0.700],
  beakSize:    [0.042, 0.068],
  stripeWidth: [0.050, 0.090],
  tailLength:  [0.055, 0.110],
});

const hslOf = (hex) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });

// BODIES.md §Turtle: the painted turtle's dark shell, a deep shade of the skin
function deepShellColor(bodyHex) {
  const { h, s, l } = hslOf(bodyHex);
  return hsl(h, Math.min(0.9, s * rand(0.9, 1.2)), THREE.MathUtils.clamp(l * rand(0.38, 0.52), 0.06, 0.30));
}

// BODIES.md §Turtle: the rim and plastron take the face-paint complement; the stripes, that complement lightened
const rimColorOf = (P) => P.rimColor || facePaintColorFor(P.bodyColor);
const stripeColorOf = (P) => {
  if (P.stripeColor) return P.stripeColor;
  const { h, s } = hslOf(facePaintColorFor(P.bodyColor));
  return hsl(h, s, 0.80);
};

// BODIES.md §Shaped faces: a small blunt upper beak, wide on top, low on the snout
const BEAK = Object.freeze({ drop: 0.34, wide: 1.10, tall: 0.70, deep: 0.80, buried: 0.45 });

function addBeak(ctx, P) {
  const s = P.beakSize, y = -P.headRadius * BEAK.drop;
  const skin = onFront({ at: [0, 0, 0], size: ctx.headScale }, 0, y)[2];
  if (P.shapedFaces) {
    ctx.head.add(named(part(softTriangle(), ctx.mat.beak, {
      pos: [0, y, skin - s * BEAK.buried], scale: [s * BEAK.wide, s * BEAK.tall, s * BEAK.deep],
    }), 'beak'));
    return;
  }
  ctx.head.add(part(GEO.cone, ctx.mat.beak, {
    pos: [0, y, skin], scale: [s, s * 1.2, s * 0.7], rot: [Math.PI * 0.5, 0, 0],
  }));
}

// BODIES.md §Turtle: soft skin rolls where the neck meets the shell, each a little narrower going up
const FOLD = Object.freeze({ wide: 1.22, step: 0.07, tall: 0.18, gap: 0.30 });

const foldRadius = (P, i) => P.neckThick * (FOLD.wide - FOLD.step * i);

function addNeckFolds(ctx, P) {
  const tall = P.neckThick * FOLD.tall;
  for (let i = 0; i < P.neckFolds; i++) {
    const r = foldRadius(P, i);
    ctx.neck.add(part(softGeometry(), ctx.mat.body, { pos: [0, P.headOverlap * 0.6 + i * tall * 2 * (1 - FOLD.gap), 0], scale: [r, tall, r] }));
  }
}

// BODIES.md §Turtle: raised felt strips, two along each side of the head behind the eye, one down each side of the neck
const STRIPE_ROWS = Object.freeze([0.0, -0.42]);
const STRIPE = Object.freeze({ back: -0.30, half: 0.52, proud: 0.35 });

function addHeadStripe(ctx, P, side, row) {
  const [hx, hy, hz] = ctx.headScale, w = P.stripeWidth * P.headRadius;
  const y = row * hy, z = STRIPE.back * hz, k = Math.sqrt(1 - row * row - STRIPE.back ** 2);
  const slope = (hx * -STRIPE.back) / (hz * k);
  ctx.head.add(part(softGeometry(), ctx.mat.stripe, {
    pos: [side * (hx * k - w * (1 - STRIPE.proud)), y, z], scale: [w, w * 0.5, hz * STRIPE.half], rot: [0, side * Math.atan(slope), 0],
  }));
}

function addStripes(ctx, P) {
  if (!P.stripes) return;
  const w = P.stripeWidth * P.headRadius, r = P.neckFolds ? foldRadius(P, 0) : P.neckThick;
  for (const side of [-1, 1]) {
    for (const row of STRIPE_ROWS) addHeadStripe(ctx, P, side, row);
    ctx.neck.add(part(softGeometry(), ctx.mat.stripe, {
      pos: [side * (r - w * (1 - STRIPE.proud)), P.headOverlap + P.neckLength / 2, 0], scale: [w, P.neckLength / 2 + P.headOverlap, w * 0.5],
    }));
  }
}

const shells = new Map();

/**
 * Part of the torso ellipsoid, `lift` proud, from `from` to `to` (radians down from the top), all the way round but
 * the belly gap: the carapace and its rim follow the shell's own surface.
 */
function shellBand(P, lift, from, to) {
  const key = `${P.torsoW}|${P.torsoH}|${P.torsoD}|${lift}|${from}|${to}|${P.scuteGap}`;
  if (!shells.has(key)) {
    const gap = P.scuteGap, g = new THREE.SphereGeometry(1, 40, 12, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, from, to - from);
    shells.set(key, g.scale(P.torsoW + lift, P.torsoH + lift, P.torsoD + lift));
  }
  return shells.get(key);
}

// BODIES.md §Turtle: one carapace under the scutes, so they are plates on a shell and never loose tiles; the marginal
// scutes a band along its lower edge, on the shell's surface, flush with the scute tops
const SHELL = Object.freeze({ under: 0.55, rim: 0.07 });

function addCarapace(ctx, P) {
  if (!P.shell) return;
  const top = Math.PI * P.scuteTop, bottom = Math.PI * P.scuteBottom, proud = ctx.bulge * P.torsoD;
  ctx.chest.add(named(part(shellBand(P, proud * SHELL.under, top, bottom), ctx.mat.scute), 'carapace'));
  if (P.shellRim) ctx.chest.add(named(part(shellBand(P, proud, bottom - Math.PI * SHELL.rim, bottom), ctx.mat.rim), 'rim'));
}

// BODIES.md §Turtle: the plastron in panels, two columns of four, its seams the dark shell showing between them
const PLASTRON = Object.freeze({ rows: [0.42, 0.08, -0.26, -0.60], col: 0.27, size: 0.50, cap: 1.05, lift: 0.004 });

function plastronPanels(P) {
  const torso = [P.torsoW, P.torsoH, P.torsoD], size = P.torsoW * PLASTRON.size, key = `plastron|${torso}`;
  if (!shells.has(key)) {
    shells.set(key, mergeGeometries(PLASTRON.rows.flatMap((y) => [-1, 1].map((side) =>
      skinDecal(torso, 'panel', [side * P.torsoW * PLASTRON.col, y * P.torsoH], size, PLASTRON.lift * 2))), false));
  }
  return shells.get(key);
}

function addPlastron(ctx, P) {
  if (!P.plastron) return;
  const torso = [P.torsoW, P.torsoH, P.torsoD];
  ctx.chest.add(part(skinPatch(torso, [0, -P.torsoH * 0.1], [0, PLASTRON.cap], PLASTRON.lift), ctx.mat.scute));
  ctx.chest.add(named(part(plastronPanels(P), ctx.mat.rim), 'plastron'));
}

function addTurtleTail(ctx, P) {
  const r = P.tailThick;
  addTail(ctx, P, {
    dress: (node, i, len) => node.add(part(GEO.cone, ctx.mat.body, {
      pos: [0, 0, -len * 0.45], scale: [r, len, r * 0.8], rot: [-Math.PI * 0.5, 0, 0],
    })),
  });
}

function buildKit(ctx, P) {
  ctx.mat.scute = ctx.addMaterial(feltMaterial(P, P.scuteColor));
  ctx.mat.rim = ctx.addMaterial(feltMaterial(P, rimColorOf(P)));
  ctx.mat.stripe = ctx.addMaterial(feltMaterial(P, stripeColorOf(P)));
  ctx.mat.beak = ctx.addMaterial(feltMaterial(P, P.beakColor));

  addHead(ctx, P);
  addEyes(ctx, P, { head: ctx.headScale });
  addBeak(ctx, P);
  addNeckFolds(ctx, P);
  addStripes(ctx, P);
  addTorsoCoat(ctx, P, { on: 'shell', coat: 'scute', material: ctx.mat.scute });
  addCarapace(ctx, P);
  addPlastron(ctx, P);
  addTurtleTail(ctx, P);
}

const TURTLE_GUI = Object.freeze({
  'head & face': [
    ['beakSize', 0.02, 0.12], ['beakColor', 'color'],
    ['stripes', 'bool'], ['stripeColor', 'color', stripeColorOf], ['stripeWidth', 0.02, 0.14],
  ],
  body: [['neckFolds', 0, 3, 1]],
  coat: [
    ['shell', 'bool'], ['scuteColor', 'color'], ['shellRim', 'bool'], ['plastron', 'bool'], ['rimColor', 'color', rimColorOf],
    ['scutePreset', 0, SCUTE_PRESETS.length - 1, 1],
    ['scuteRows', 1, 6, 1], ['scutePerRow', 3, 14, 1], ['scuteSides', 0, 8, 1],
    ['scuteAutoSize', 'bool'], ['scuteTouch', 0.8, 1.6], ['scuteSize', 0.08, 0.55],
    ['scuteProud', 0.05, 1.0], ['scuteFlat', 0, 1.0],
    ['scuteTop', 0, 1], ['scuteBottom', 0, 1], ['scuteGap', 0, 3.2], ['scuteStagger', 'bool'],
  ],
});

// BODIES.md §Turtle
const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [50, 140],
  idleRate: [0.40, 0.95],
  idleAmp:  [0.40, 1.10],
  headArc:  [0.60, 1.20],
  bounce:   [0.00, 0.03],
  stride:   [1.25, 1.60],
});

registerSpecies({
  id: 'turtle',
  label: 'Turtle',
  emoji: '🐢',
  firstFur: '#1fd18b',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: TURTLE_GUI,
  headShape: [1.05, 0.90, 1.00],
  buildKit,
  coatBulge: (P) => coatBulge(P, 'shell', 'scute'),
  coatColorKey: 'scuteColor',
  coatOf: deepShellColor,
  // BODIES.md §Painterly
  paint: { style: 'fur', accent: ['scute', 'rim'] },
  presets: SCUTE_PRESETS,
  presetKey: 'scutePreset',
});
