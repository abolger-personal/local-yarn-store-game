import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, GEO,
  addConeEars, addEyes, addHead, addTail, facePaintColorFor, feltMaterial, part, registerSpecies, skinDecal,
} from './npc.js';
import { named, onFront, softGeometry } from './faces.js';

const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Ember',
  footColor:     '#fbf6e9',

  headRadius:    0.195,
  headOverlap:   0.080,
  neckLength:    0.070,
  neckThick:     0.085,
  torsoW:        0.230,
  torsoH:        0.215,
  torsoD:        0.235,
  legHeight:     0.150,
  limbThick:     0.044,
  upperArmLen:   0.085,
  forearmLen:    0.075,
  shoulderOut:   0.95,
  shoulderLift:  0.32,
  clampArmOut:   true,

  eyeLift:       0.18,
  eyeRadius:     0.090,

  hornColor:     '#fbf6e9',
  hornSize:      0.065,
  hornLength:    0.160,
  hornSpread:    0.500,
  hornTilt:      0.150,
  hornCurl:      2.00,
  muzzleSize:    1.20,
  muzzleLength:  0.55,
  muzzleDrop:    0.08,
  crestCount:    4,
  crestSize:     0.110,

  spikes:        true,
  spikeColor:    '',
  spikeCount:    4,
  spikeSize:     0.090,
  belly:         true,
  bellyColor:    '#fff1cc',
  bellyPlates:   7,
  bellyWidth:    0.60,

  tailLength:    0.200,
  tailThick:     0.040,
  tailDroop:    -0.55,
  tailCurl:      0.55,
  tailStiff:     320,
  tailZeta:      0.30,
  tipSize:       0.110,
  tailSpikeSize: 0.028,
};

const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  headRadius:  [0.180, 0.212],
  legHeight:   [0.100, 0.190],
  torsoW:      [0.200, 0.270],
  torsoH:      [0.185, 0.245],
  torsoD:      [0.200, 0.270],
  limbThick:   [0.038, 0.052],
  eyeLift:     [0.12, 0.24],
  eyeRadius:   [0.078, 0.100],
  hornSize:    [0.055, 0.075],
  hornLength:  [0.130, 0.190],
  hornSpread:  [0.400, 0.600],
  hornTilt:    [0.000, 0.300],
  hornCurl:    [1.60, 2.60],
  muzzleSize:  [1.05, 1.35],
  muzzleLength: [0.45, 0.70],
  crestCount:  [3, 5],
  crestSize:   [0.090, 0.130],
  spikeSize:   [0.075, 0.105],
  tipSize:     [0.090, 0.130],
});

// BODIES.md §Dragon: the crest and spikes are the fur's complement until picked, as face paint is
const spikeColorOf = (P) => P.spikeColor || facePaintColorFor(P.bodyColor);

// a soft spike: an egg narrowing to a rounded point up +y, the cute rule's spike
const softSpike = () => {
  const g = new THREE.SphereGeometry(1, 16, 12), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - 0.75 * (pos.getY(i) + 1) / 2;
    pos.setX(i, pos.getX(i) * k).setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
};

// a horn: a cone whose tip bends back (-z) by `curl` of its base radius
const curvedHorn = (curl) => {
  const g = new THREE.ConeGeometry(1, 1, 12, 6), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - curl * (pos.getY(i) + 0.5) ** 2);
  g.computeVertexNormals();
  return g;
};

let spikeGeometry = null;
const hornGeometries = new Map();

/** A soft spike on ellipsoid `size` (centred on `node`), on its midline `phi` radians up from straight back. */
function ridgeSpike(node, mat, { size, phi, s, sunk = 0.25 }) {
  const [, b, c] = size, up = Math.sin(phi) / b, out = -Math.cos(phi) / c, len = Math.hypot(up, out), lift = s * (1 - sunk);
  node.add(part(spikeGeometry, mat, {
    pos: [0, b * Math.sin(phi) + (up / len) * lift, -c * Math.cos(phi) + (out / len) * lift],
    scale: [s * 0.45, s, s * 0.8], rot: [Math.atan2(out, up), 0, 0],
  }));
}

/** `n` spikes from `top` to `bottom` (radians up from straight back), the biggest `peak` of the way down. */
function ridge(node, mat, { size, n, top, bottom, s, peak = 0.3 }) {
  const count = Math.max(0, Math.round(n));
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    ridgeSpike(node, mat, { size, phi: top + (bottom - top) * t, s: s * (1 - 0.35 * Math.abs(t - peak)) });
  }
}

// BODIES.md §Dragon: a snout pushed out of the face, a bearded dragon's: broad, flat-topped, rounded at the tip, in
// the head's colour; `muzzleSize` its width, `muzzleLength` how far it reaches out (head radii), its back buried
const MUZZLE = Object.freeze({ wide: 0.42, flat: 0.60, out: 0.85 });

function addMuzzle(ctx, P) {
  const hr = P.headRadius, y = -hr * P.muzzleDrop, w = hr * MUZZLE.wide * P.muzzleSize, len = hr * P.muzzleLength;
  const face = onFront({ at: [0, 0, 0], size: ctx.headScale }, 0, y)[2];
  const muzzle = { at: [0, y, face + len * (MUZZLE.out - 1)], size: [w, w * MUZZLE.flat, len] };
  ctx.head.add(named(part(GEO.sphere, ctx.mat.body, { pos: muzzle.at, scale: muzzle.size }), 'muzzle'));
  if (P.shapedFaces) addFaceShapes(ctx, P, muzzle);
}

// BODIES.md §Shaped faces: two nostril bumps on the muzzle and a soft brow over each eye, shape only
const NOSTRIL = Object.freeze({ out: 0.34, up: 0.40, size: 0.15 });
const BROW = Object.freeze({ up: 1.30, out: 0.15, w: 0.75, h: 0.30, d: 0.45 });

function addFaceShapes(ctx, P, muzzle) {
  const [w, h] = muzzle.size, d = w * NOSTRIL.size, head = { at: [0, 0, 0], size: ctx.headScale }, e = P.eyeRadius;
  for (const side of [-1, 1]) {
    const at = onFront(muzzle, side * w * NOSTRIL.out, h * NOSTRIL.up, -d * 0.3);
    ctx.head.add(named(part(softGeometry(), ctx.mat.body, { pos: at, scale: [d, d * 0.8, d] }), 'nostril'));
    const brow = onFront(head, side * (P.headRadius * P.eyeSpread + e * BROW.out), P.headRadius * P.eyeLift + e * BROW.up, -e * BROW.d * 0.5);
    ctx.head.add(named(part(softGeometry(), ctx.mat.body, { pos: brow, scale: [e * BROW.w, e * BROW.h, e * BROW.d] }), 'brow'));
  }
}

function addHorns(ctx, P) {
  addConeEars(ctx, P, {
    size: P.hornSize, length: P.hornLength, spread: P.hornSpread, tilt: P.hornTilt,
    lift: 0.95, back: -0.12, head: ctx.headScale, material: ctx.mat.horn,
  });
  const key = P.hornCurl.toFixed(2);
  if (!hornGeometries.has(key)) hornGeometries.set(key, curvedHorn(P.hornCurl));
  for (const { node } of ctx.joints.ear) node.children[0].geometry = hornGeometries.get(key);
}

// BODIES.md §Dragon: a leafy crest down the back of the head, from behind the horns to the nape
const CREST = Object.freeze({ top: 1.05, bottom: -0.20, peak: 0.2 });

// BODIES.md §Dragon: the back ridge, shoulders to just above the tail root; on a joint of
// its own so garments fit the torso (garments.js carried), not the spikes
const RIDGE = Object.freeze({ top: 1.00, bottom: -0.25 });

function addRidge(ctx, P) {
  if (!P.spikes) return;
  const back = Object.assign(new THREE.Group(), { name: 'ridge' });
  back.userData.joint = true;
  ctx.chest.add(back);
  const k = 1 + ctx.bulge;
  ridge(back, ctx.mat.spike, { size: [P.torsoW * k, P.torsoH * k, P.torsoD * k], n: P.spikeCount, s: P.spikeSize, ...RIDGE });
}

// BODIES.md §Dragon: the belly, an alligator's: chevron plates pointing down from the neck to under the tail root, each
// a little prouder than the one below, so its point lies over the next
const BELLY = Object.freeze({ top: 0.75, bottom: -0.92, lift: 0.003, step: 0.0015 });
const bellies = new Map();

function bellyGeometry(P) {
  const torso = [P.torsoW, P.torsoH, P.torsoD], n = Math.max(1, Math.round(P.bellyPlates)), size = 2 * P.torsoW * P.bellyWidth;
  const key = `${torso}|${n}|${size}`;
  if (!bellies.has(key)) {
    bellies.set(key, mergeGeometries(Array.from({ length: n }, (_, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5, y = P.torsoH * (BELLY.top + (BELLY.bottom - BELLY.top) * t);
      return skinDecal(torso, 'chevron', [0, y], size * (1 - 0.3 * t), BELLY.lift + (n - 1 - i) * BELLY.step);
    }), false));
  }
  return bellies.get(key);
}

function addBelly(ctx, P) {
  if (P.belly) ctx.chest.add(named(part(bellyGeometry(P), ctx.mat.belly), 'belly'));
}

function addDragonTail(ctx, P) {
  addTail(ctx, P, {
    segments: 3,
    dress(node, i, len) {
      const r = P.tailThick * 0.8 ** i, s = P.tailSpikeSize * 0.85 ** i;
      node.add(part(GEO.taper, ctx.mat.body, { pos: [0, 0, -len / 2], scale: [r, len, r], rot: [Math.PI / 2, 0, 0] }));
      node.add(part(GEO.sphere, ctx.mat.body, { scale: [r, r, r] }));
      if (P.spikes) node.add(part(spikeGeometry, ctx.mat.spike, { pos: [0, r * 0.85, -len * 0.5], scale: [s * 0.45, s, s * 0.8], rot: [-0.35, 0, 0] }));
      if (i < 2) return;
      const t = P.tipSize;
      node.add(named(part(spikeGeometry, ctx.mat.horn, { pos: [0, 0, -len - t * 0.6], scale: [t * 0.35, t * 1.3, t], rot: [-Math.PI / 2, 0, 0] }), 'tailTip'));
    },
  });
}

function buildKit(ctx, P) {
  ctx.mat.horn = ctx.addMaterial(feltMaterial(P, P.hornColor));
  ctx.mat.spike = ctx.addMaterial(feltMaterial(P, spikeColorOf(P)));
  ctx.mat.belly = ctx.addMaterial(feltMaterial(P, P.bellyColor));
  spikeGeometry ??= softSpike();

  addHead(ctx, P);
  addEyes(ctx, P, { head: ctx.headScale });
  addMuzzle(ctx, P);
  addHorns(ctx, P);
  ridge(ctx.head, ctx.mat.spike, { size: ctx.headScale, n: P.crestCount, s: P.crestSize, ...CREST });
  addBelly(ctx, P);
  addRidge(ctx, P);
  addDragonTail(ctx, P);
}

const DRAGON_GUI = Object.freeze({
  'head & face': [
    ['hornSize', 0.010, 0.15], ['hornLength', 0.02, 0.35], ['hornSpread', 0.05, 1.0],
    ['hornTilt', -0.4, 0.8], ['hornCurl', 0, 4], ['hornColor', 'color'],
    ['muzzleSize', 0.5, 2.2], ['muzzleLength', 0.05, 1.2], ['muzzleDrop', -0.2, 0.6],
    ['crestCount', 0, 7, 1], ['crestSize', 0.02, 0.22],
  ],
  coat: [
    ['spikes', 'bool'], ['spikeColor', 'color', spikeColorOf], ['spikeCount', 0, 8, 1], ['spikeSize', 0.02, 0.18],
    ['belly', 'bool'], ['bellyColor', 'color'], ['bellyPlates', 1, 12, 1], ['bellyWidth', 0.2, 1.0],
  ],
  tail: [['tipSize', 0.02, 0.20], ['tailSpikeSize', 0, 0.10]],
});

// BODIES.md §Dragon
const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [120, 260],
  idleRate: [1.00, 2.40],
  idleAmp:  [0.60, 1.40],
  headArc:  [0.80, 1.60],
  bounce:   [0.04, 0.10],
  stride:   [1.40, 1.90],
  kneeLift: [0.50, 0.85],
});

registerSpecies({
  id: 'dragon',
  label: 'Dragon',
  emoji: '🐉',
  firstFur: '#8154ff',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: DRAGON_GUI,
  headShape: [1.00, 0.95, 1.05],
  buildKit,
  // BODIES.md §Painterly, §Dragon: scales painted over the felt; the spikes, horns and belly plates go without
  paint: { style: 'scale', accent: ['spike', 'horn', 'belly'] },
});
