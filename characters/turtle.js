import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, GEO,
  addEyes, addHead, addTail, addTorsoCoat, coatBulge,
  feltMaterial, hsl, part, rand, registerSpecies, skinDecal,
} from './npc.js';
import { named, onFront, softGeometry, softTriangle } from './faces.js';

const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Shelly',
  // BODIES.md §Turtle: the designer's Zephyr (2026-11-09)
  bodyColor:     '#ffd21a',

  // BODIES.md §Turtle: burly, low and round
  legHeight:     0.152,
  hipInset:      0.140,
  legSpread:     0.086,
  torsoW:        0.257,
  torsoH:        0.201,
  headRadius:    0.180,
  torsoD:        0.217,
  limbThick:     0.047,
  upperArmLen:   0.105,
  forearmLen:    0.091,
  shoulderOut:   0.820,
  shoulderLift:  0.648,
  clampArmOut:   true,
  neckLength:    0.095,
  neckThick:     0.130,
  headOverlap:   0.070,

  eyeRadius:     0.109,
  // BODIES.md §Turtle: eyes far apart, out on the sides, or it doesn't read reptile
  eyeSpread:     0.630,
  eyeLift:       0.099,
  pupilScale:    0.429,

  beakSize:      0.049,
  beakColor:     '#e0a53c',

  neckFolds:     2,
  stripes:       true,
  stripeColor:   '',
  stripeWidth:   0.055,

  shell:         true,
  scuteColor:    '#5d4d18',
  rimColor:      '',
  shellRim:      true,
  plastron:      true,
  scutePreset:   4,
  scuteRows:     3,
  scutePerRow:   7,
  scuteSides:    0,
  scuteAutoSize: true,
  scuteTouch:    1.05,
  scuteSize:     0.550,
  scuteFlat:     0.16,
  scuteProud:    0.30,
  scuteTop:      0.08,
  scuteBottom:   0.70,
  // BODIES.md §Turtle: the shell's edge down the sides, behind the arms
  scuteGap:      3.00,
  scuteStagger:  true,

  tailLength:    0.084,
  tailThick:     0.047,
  tailDroop:    -0.581,
  tailCurl:      0.8,
  tailStiff:     420,
  tailZeta:      0.29,
};

// BODIES.md §Turtle: plates, not bumps (low proud, flat just under it), a bare belly for the plastron
const SCUTE_PRESETS = Object.freeze([
  { scuteRows: 2, scutePerRow: 7,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.30, scuteTop: 0.08, scuteBottom: 0.68, scuteGap: 2.90, scuteStagger: true },
  { scuteRows: 3, scutePerRow: 8,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.30, scuteTop: 0.06, scuteBottom: 0.70, scuteGap: 3.00, scuteStagger: true },
  { scuteRows: 3, scutePerRow: 10, scuteSides: 5, scuteTouch: 1.15, scuteFlat: 0.14, scuteProud: 0.30, scuteTop: 0.06, scuteBottom: 0.72, scuteGap: 2.90, scuteStagger: true },
  { scuteRows: 4, scutePerRow: 9,  scuteSides: 6, scuteTouch: 1.10, scuteFlat: 0.12, scuteProud: 0.26, scuteTop: 0.05, scuteBottom: 0.74, scuteGap: 3.10, scuteStagger: false },
  { scuteRows: 3, scutePerRow: 7,  scuteSides: 0, scuteTouch: 1.05, scuteFlat: 0.16, scuteProud: 0.30, scuteTop: 0.08, scuteBottom: 0.70, scuteGap: 3.00, scuteStagger: true },
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

// BODIES.md §Turtle, colour: the painted turtle's. A dark shell, a deep shade of the skin. (Lightnesses here are
// three.js's working, linear ones: 0.05 shows about as dark as 0.25.)
function deepShellColor(bodyHex) {
  const { h, s } = hslOf(bodyHex);
  return hsl(h, Math.min(0.85, s * rand(0.8, 1.0)), rand(0.05, 0.08));
}

// warm accents, never the skin's opposite: the rim the first of scarlet, orange or yellow far enough round the hue circle
// from the skin; on a skin too warm for any, a pale cream
const WARM = Object.freeze([0.0, 0.07, 0.14]), WARM_LIGHT = Object.freeze([0.25, 0.30, 0.45]);
const hueGap = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

function rimHue(bodyHex) {
  const { h } = hslOf(bodyHex);
  return WARM.findIndex((w) => hueGap(w, h) >= 0.10);
}

const rimColorOf = (P) => {
  if (P.rimColor) return P.rimColor;
  const i = rimHue(P.bodyColor);
  return i < 0 ? '#fff1cc' : hsl(WARM[i], 0.95, WARM_LIGHT[i]);
};
// the plastron a real one's yellow-orange; on a yellow or orange skin, cream
const PLASTRON_HUE = 0.11;
const plastronColorOf = (P) => (hueGap(hslOf(P.bodyColor).h, PLASTRON_HUE) < 0.08 ? '#fff1cc' : hsl(PLASTRON_HUE, 0.95, 0.42));
// the stripes a light yellow; on a yellow skin, cream
const stripeColorOf = (P) => P.stripeColor || (hueGap(hslOf(P.bodyColor).h, WARM[2]) < 0.1 ? '#fff6dc' : hsl(WARM[2], 0.95, 0.42));

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

// BODIES.md §Turtle: painted stripes, as face paint is (lying on the skin, tapered, bowed): two along each side of
// the head behind the eye, one down each side of the neck
const STRIPE = Object.freeze({ rows: [0.05, -0.40], front: 0.10, long: 1.10, lift: 0.003 });

function stripeGeometries(ctx, P, side) {
  const [hx, hy, hz] = ctx.headScale, len = hz * STRIPE.long, w = (P.stripeWidth * P.headRadius) / len;
  return STRIPE.rows.map((row) => {
    const x = side * hx * Math.sqrt(Math.max(0, 1 - row * row - STRIPE.front ** 2));
    return skinDecal(ctx.headScale, ['stripe', w], [x, row * hy], len, STRIPE.lift);
  });
}

function neckStripe(P, side) {
  const r = P.neckFolds ? foldRadius(P, 0) : P.neckThick, half = P.neckLength / 2 + P.headOverlap, len = 2 * half;
  return skinDecal([r, half, r], ['stripe', (P.stripeWidth * P.headRadius) / len, true], [side * r * 0.97, 0], len, STRIPE.lift);
}

function addStripes(ctx, P) {
  if (!P.stripes) return;
  const head = [-1, 1].flatMap((side) => stripeGeometries(ctx, P, side));
  ctx.head.add(named(part(mergeGeometries(head, false), ctx.mat.stripe), 'stripe'));
  const neck = mergeGeometries([-1, 1].map((side) => neckStripe(P, side)), false);
  ctx.neck.add(named(part(neck, ctx.mat.stripe, { pos: [0, P.headOverlap + P.neckLength / 2, 0] }), 'stripe'));
}

const shells = new Map();

/**
 * The torso ellipsoid, `lift` proud, from `from` to `to` radians out from straight back: the turtle stands, so its
 * shell is a cap on its back and the shell's edge a loop standing upright round it, never a ring parallel to the floor.
 */
function shellBand(P, lift, from, to) {
  const key = `${P.torsoW}|${P.torsoH}|${P.torsoD}|${lift}|${from}|${to}`;
  if (!shells.has(key)) {
    const g = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, from, to - from).rotateX(-Math.PI / 2);
    shells.set(key, g.scale(P.torsoW + lift, P.torsoH + lift, P.torsoD + lift));
  }
  return shells.get(key);
}

// BODIES.md §Turtle: one carapace on the back under the scutes, so they are plates on a shell and never loose tiles,
// reaching as far round as the scutes do (the scutes' front gap); the marginal scutes a band along its upright edge,
// flush with the scute tops
const SHELL = Object.freeze({ under: 0.55, rim: 0.07 });

// on a joint of its own, as the dragon's ridge: garments fit the torso and its scutes (garments.js carried), so the
// shell over the shoulders doesn't swell a shawl
function addCarapace(ctx, P) {
  if (!P.shell) return;
  const edge = Math.PI - P.scuteGap / 2, proud = ctx.bulge * P.torsoD;
  const back = Object.assign(new THREE.Group(), { name: 'shell' });
  back.userData.joint = true;
  ctx.chest.add(back);
  back.add(named(part(shellBand(P, proud * SHELL.under, 0, edge), ctx.mat.scute), 'carapace'));
  if (P.shellRim) back.add(named(part(shellBand(P, proud, edge - Math.PI * SHELL.rim, edge), ctx.mat.rim), 'rim'));
}

// BODIES.md §Turtle: the plastron, six pairs of fitted scutes on the skin, the seams between them its "abs"
const PLASTRON = Object.freeze({ at: -0.10, size: 1.75, lift: 0.008 });

const plastronPanels = (P) =>
  skinDecal([P.torsoW, P.torsoH, P.torsoD], 'plastron', [0, PLASTRON.at * P.torsoH], P.torsoW * PLASTRON.size, PLASTRON.lift);

function addPlastron(ctx, P) {
  if (P.plastron) ctx.chest.add(named(part(plastronPanels(P), ctx.mat.plastron), 'plastron'));
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
  ctx.mat.plastron = ctx.addMaterial(feltMaterial(P, plastronColorOf(P)));
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
