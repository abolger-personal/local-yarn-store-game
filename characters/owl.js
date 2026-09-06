// Shared owl construction for the LYS concept viewers.
// Deliberately pure: nothing here touches a scene, camera or DOM, so both the single-character
// tuner and the crowd view can use it unchanged.
//
// Node names mirror the shared base rig in P1-SPIKE-PLAN.md.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- params

export const DEFAULT_PARAMS = {
  name:          'Hoot',

  // proportions: total figure height is normalised to ~1.0
  headRadius:    0.171,
  headOverlap:   0.099,   // how far the head sinks into the torso; hides the neck
  neckLength:    0.100,   // REAL length even though concealed - never zero
  torsoW:        0.210,
  torsoH:        0.193,
  torsoD:        0.215,
  legHeight:     0.193,
  tuftSize:      0.049,
  tuftSpread:    0.694,
  tuftTilt:      0.800,
  eyeRadius:     0.084,
  eyeSpread:     0.389,
  eyeLift:       0.12,
  pupilScale:    0.46,
  pupilDepth:    0.012,   // 0 makes pupil and eye white coplanar and they z-fight
  beakSize:      0.090,
  wingLength:    0.349,
  wingWidth:     0.200,   // ratio of wingLength, so short wings shrink rather than go pancake
  wingDepth:     0.360,   // ratio of wingLength

  // rig
  hipInset:      0.045,   // how far the hips sit INTO the torso; 0 leaves the legs floating
  legSpread:     0.085,
  limbThick:     0.034,
  upperArmLen:   0.092,
  forearmLen:    0.082,

  // pose - static only. proves joint topology without an animation system.
  armSwing:      0.00,
  armOut:        0.16,
  elbowBend:     0.00,
  legSwing:      0.00,
  kneeBend:      0.00,
  holdItem:      false,
  heldColor:     '#7a9e6b',

  // material
  bodyColor:     '#a0a6ba',
  eyeColor:      '#f6f0e4',
  pupilColor:    '#241a15',
  beakColor:     '#e0a53c',
  sheen:         0.34,
  sheenRoughness:0.21,
  sheenTint:     '#c9a892',
  roughness:     1.00,

  // feathers: LOW frequency on purpose. The removed felt normal map failed because
  // high-frequency relief reads as grain; a handful of large scallops reads as plumage.
  feathers:      true,
  featherColor:  '#8d93a8',
  featherPreset: 2,
  featherRows:   3,
  featherPerRow: 9,
  featherSize:   0.276,   // RATIO of body radius, not world units - keeps shells shareable
  featherFlat:   0.40,    // how far each scallop sinks into the body
  featherProud:  0.55,    // how far it stands off, as a fraction of size
  featherTop:    0.40,    // start latitude, 0 = top of torso
  featherBottom: 0.95,
  featherStagger:true,    // offset alternate rows so they overlap like shingles

  featherHead:   true,
  featherHeadScale: 0.74,
  featherFaceGap: 1.25,   // radians of clear space at the front, so plumage misses the eyes
  featherWings:  true,
  featherWingScale: 0.62,

  partShadows:   true,    // small parts casting shadows doubles their draw cost

  // eyes read as wet/glassy against the matte body - deliberately NOT randomised
  eyeSheen:      1.00,
  eyeSheenRough: 0.08,
  eyeRough:      0.22,
  eyeClearcoat:  0.70,

  // garment
  scarf:         true,
  scarfColor:    '#b8443f',

  // scene
  view:          'felted',
  exposure:      0.40,
  toneMapping:   'ACES',
};

export const TONE_MAPPING = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  None: THREE.NoToneMapping,
};

export const POSES = {
  rest:   { armSwing: 0.00, armOut: 0.16, elbowBend: 0.00, legSwing: 0.00, kneeBend: 0.00, holdItem: false },
  walk:   { armSwing: 0.42, armOut: 0.14, elbowBend: 0.30, legSwing: 0.38, kneeBend: -0.45, holdItem: false },
  carry:  { armSwing: 0.70, armOut: 0.05, elbowBend: 1.35, legSwing: 0.00, kneeBend: 0.00, holdItem: true },
  reach:  { armSwing: -1.15, armOut: 0.30, elbowBend: 0.35, legSwing: 0.00, kneeBend: 0.00, holdItem: false },
  browse: { armSwing: -0.45, armOut: 0.34, elbowBend: 0.85, legSwing: 0.00, kneeBend: 0.00, holdItem: false },
  'walk+carry': { armSwing: 0.72, armOut: 0.06, elbowBend: 1.30, legSwing: 0.38, kneeBend: -0.45, holdItem: true },
};

export const POSE_KEYS = ['armSwing', 'armOut', 'elbowBend', 'legSwing', 'kneeBend'];

// ---------------------------------------------------------------- randomisation

// Two tiers, not one global percentage.
//
// TIER 1 - silhouette carriers, roughly +/-50%. These are what let you tell one owl from
// another as a flat black shape at 150px, so they need real room to move.
// TIER 2 - supporting dimensions, roughly +/-15%. Kept tight so the cast still reads as a
// single species rather than a zoo.
export const RANDOM_RANGES = {
  // --- tier 1: silhouette
  legHeight:   [0.085, 0.345],
  neckLength:  [0.050, 0.160],   // head float vs head sunk into the body
  headOverlap: [0.050, 0.150],
  tuftSize:    [0.024, 0.075],
  tuftSpread:  [0.350, 1.040],
  tuftTilt:    [-0.150, 1.350],  // slight negative reads as upright tufts, not broken ones
  // feather shape is NOT continuous - it comes from FEATHER_PRESETS so shells can be shared

  // --- tier 2: supporting
  headRadius:  [0.150, 0.195],
  torsoW:      [0.185, 0.235],
  torsoH:      [0.170, 0.215],
  torsoD:      [0.190, 0.240],
  legSpread:   [0.060, 0.115],
  limbThick:   [0.022, 0.050],
  wingLength:  [0.300, 0.390],
  wingWidth:   [0.150, 0.260],
  wingDepth:   [0.280, 0.440],
  eyeRadius:   [0.070, 0.098],
  eyeSpread:   [0.340, 0.440],
  eyeLift:     [0.050, 0.200],
  pupilScale:  [0.380, 0.560],
  beakSize:    [0.070, 0.110],
  upperArmLen: [0.078, 0.108],
  forearmLen:  [0.070, 0.096],
};

// Hue is uniform across the wheel, so variety has to come from SATURATION and LIGHTNESS
// spread. A single narrow band (low sat, mid light) collapses every hue into pastel - the
// Easter-egg failure. Weighted modes give a mostly-natural cast with occasional pops.
//
// Note this also serves `characterRange` better than muting did: the yarn wall is pale and
// pastel, so characters separate by being DARKER and RICHER, not by being quieter.
export const FUR_MODES = [
  { weight: 45, sat: [0.06, 0.26], light: [0.22, 0.78] },  // natural: browns, greys, cream, charcoal
  { weight: 35, sat: [0.26, 0.52], light: [0.32, 0.62] },  // tinted
  { weight: 20, sat: [0.52, 0.82], light: [0.28, 0.55] },  // vivid: the occasional teal or plum owl
];

export const ACCENT_SAT = [0.42, 0.78];
export const ACCENT_LIGHT = [0.32, 0.62];

export const NAMES = [
  'Marguerite', 'Bramble', 'Winifred', 'Otto', 'Pip', 'Hazel', 'Thistle', 'Cormac',
  'Juniper', 'Barnaby', 'Wren', 'Fennel', 'Rosalind', 'Mabel', 'Tobias', 'Clementine',
  'Rook', 'Sorrel', 'Agnes', 'Linus', 'Perpetua', 'Alder', 'Marlow', 'Bea',
  'Ivo', 'Nesta', 'Quill', 'Dorcas', 'Ambrose', 'Tamsin',
];

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randHex = (sat, light) =>
  '#' + new THREE.Color().setHSL(Math.random(), rand(...sat), rand(...light)).getHexString();

function weightedPick(modes) {
  const total = modes.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of modes) { r -= m.weight; if (r <= 0) return m; }
  return modes[modes.length - 1];
}

export function randomFur() {
  const m = weightedPick(FUR_MODES);
  return randHex(m.sat, m.light);
}

// Derived from the body colour rather than drawn independently: plumage that shares a hue
// family reads as one animal, where a free-random second colour reads as two glued together.
// A minority get a real hue shift so the crowd is not entirely tonal.
export function randomFeather(bodyHex) {
  const hsl = {};
  new THREE.Color(bodyHex).getHSL(hsl);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const l = THREE.MathUtils.clamp(hsl.l + dir * rand(0.12, 0.30), 0.06, 0.94);
  const s = THREE.MathUtils.clamp(hsl.s * rand(0.65, 1.5), 0.03, 0.88);
  const h = (hsl.h + (Math.random() < 0.22 ? rand(-0.14, 0.14) : 0) + 1) % 1;
  return '#' + new THREE.Color().setHSL(h, s, l).getHexString();
}

export function slugify(s) {
  return (s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
}

/** Applies randomised identity onto a params object, in place. */
export function randomiseInto(P) {
  for (const [k, [a, b]] of Object.entries(RANDOM_RANGES)) {
    P[k] = Math.round(rand(a, b) * 1000) / 1000;
  }
  applyFeatherPreset(P, Math.floor(Math.random() * FEATHER_PRESETS.length));
  P.bodyColor = randomFur();
  P.featherColor = randomFeather(P.bodyColor);
  P.scarf = Math.random() < 0.7;
  P.scarfColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.heldColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.name = pick(NAMES);
  return P;
}

/** A fresh randomised params object, with optional fixed overrides. */
export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

// ---------------------------------------------------------------- materials

// A noise normal map plus a fuzz shell were tried here and removed: at crowd distance the
// high-frequency relief read as granular stone rather than soft fibre. Felt is about how
// light diffuses, not about surface bumps.
export function feltMaterial(P, color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: P.roughness,
    metalness: 0,
    sheen: P.sheen,
    sheenRoughness: P.sheenRoughness,
    sheenColor: new THREE.Color(P.sheenTint),
  });
}

// glassy against the matte body - the contrast is what makes the eyes read
export function eyeMaterial(P, color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: P.eyeRough,
    metalness: 0,
    sheen: P.eyeSheen,
    sheenRoughness: P.eyeSheenRough,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: P.eyeClearcoat,
    clearcoatRoughness: 0.06,
  });
}

// knitted garments read crisper than the body - tighter sheen, less roughness
export function knitMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0,
    sheen: 1.0,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ffffff'),
  });
}

export const greyMat = new THREE.MeshStandardMaterial({ color: '#b9b4ad', roughness: 0.9, metalness: 0 });
export const blackMat = new THREE.MeshBasicMaterial({ color: '#000000' });

// ---------------------------------------------------------------- geometry

// Segment counts, not shapes. A sphere at 48x32 is film tessellation; these characters are
// ~150px tall in play, so most of those triangles are invisible.
export const GEO_DETAIL = {
  high: { sphere: [48, 32], cone: 24, cyl: 16, torus: [16, 40], dome: [12, 6] },
  med:  { sphere: [24, 16], cone: 16, cyl: 10, torus: [10, 24], dome: [8, 4] },
  low:  { sphere: [14, 10], cone: 10, cyl: 7,  torus: [8, 16],  dome: [6, 3] },
};

let SPHERE, CONE, CYL, TORUS, DOME;
let currentDetail = null;

/** Rebuilds shared geometry. Callers must rebuild any existing owls afterwards. */
export function setGeometryDetail(level = 'high') {
  const d = GEO_DETAIL[level] ?? GEO_DETAIL.high;
  if (currentDetail !== null) {
    [SPHERE, CONE, CYL, TORUS, DOME].forEach((g) => g?.dispose());
    clearFeatherCache();   // scallops are built from DOME, so every shell is now stale
  }
  currentDetail = level;
  SPHERE = new THREE.SphereGeometry(1, d.sphere[0], d.sphere[1]);
  CONE = new THREE.ConeGeometry(1, 1, d.cone);
  CYL = new THREE.CylinderGeometry(1, 1, 1, d.cyl);
  TORUS = new THREE.TorusGeometry(1, 0.34, d.torus[0], d.torus[1]);
  // one scallop
  DOME = new THREE.SphereGeometry(1, d.dome[0], d.dome[1], 0, Math.PI * 2, 0, Math.PI * 0.5);
}
setGeometryDetail('high');

export const getGeometryDetail = () => currentDetail;

// Quantised so feather geometry can be SHARED between characters. Per-owl generated geometry
// blocks instancing entirely, and the visual variety is carried by colour anyway.
export const FEATHER_PRESETS = [
  { featherRows: 2, featherPerRow: 7,  featherSize: 0.330, featherProud: 0.80, featherFlat: 0.34, featherStagger: true,  featherTop: 0.44, featherBottom: 0.94 },
  { featherRows: 2, featherPerRow: 11, featherSize: 0.245, featherProud: 0.60, featherFlat: 0.42, featherStagger: false, featherTop: 0.40, featherBottom: 0.92 },
  { featherRows: 3, featherPerRow: 9,  featherSize: 0.276, featherProud: 0.55, featherFlat: 0.40, featherStagger: true,  featherTop: 0.40, featherBottom: 0.95 },
  { featherRows: 3, featherPerRow: 13, featherSize: 0.205, featherProud: 0.72, featherFlat: 0.36, featherStagger: true,  featherTop: 0.34, featherBottom: 0.96 },
  { featherRows: 4, featherPerRow: 8,  featherSize: 0.300, featherProud: 0.45, featherFlat: 0.48, featherStagger: true,  featherTop: 0.46, featherBottom: 0.98 },
  { featherRows: 4, featherPerRow: 12, featherSize: 0.220, featherProud: 0.85, featherFlat: 0.30, featherStagger: false, featherTop: 0.36, featherBottom: 0.94 },
  { featherRows: 5, featherPerRow: 10, featherSize: 0.235, featherProud: 0.62, featherFlat: 0.44, featherStagger: true,  featherTop: 0.30, featherBottom: 0.97 },
  { featherRows: 3, featherPerRow: 6,  featherSize: 0.390, featherProud: 0.95, featherFlat: 0.28, featherStagger: true,  featherTop: 0.48, featherBottom: 0.93 },
];

export function applyFeatherPreset(P, index) {
  const p = FEATHER_PRESETS[((index % FEATHER_PRESETS.length) + FEATHER_PRESETS.length) % FEATHER_PRESETS.length];
  P.featherPreset = index;
  Object.assign(P, p);
  return P;
}

/**
 * Lays scalloped domes over a UNIT sphere and merges them into ONE geometry.
 * Unit space is the point: the mesh is scaled to the body part afterwards, so identical
 * settings yield identical geometry regardless of how big that character's torso is.
 * `skipFront` clears an arc around +Z so head plumage does not cover the face.
 */
function makeFeatherShell({ rows, perRow, size, flat, proud, top, bottom, stagger, skipFront = 0 }) {
  const parts = [];
  rows = Math.max(1, Math.round(rows));
  perRow = Math.max(3, Math.round(perRow));

  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat = new THREE.Matrix4();

  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    const phi = Math.PI * (top + (bottom - top) * t);
    const offset = stagger && r % 2 ? Math.PI / perRow : 0;

    for (let s = 0; s < perRow; s++) {
      const theta = (s / perRow) * Math.PI * 2 + offset;

      if (skipFront > 0) {
        // +Z is the face direction, which sits at theta = PI/2
        const d = Math.abs(((theta - Math.PI / 2 + Math.PI) % (Math.PI * 2)) - Math.PI);
        if (d < skipFront * 0.5) continue;
      }

      const sp = Math.sin(phi), cp = Math.cos(phi);
      nrm.set(sp * Math.cos(theta), cp, sp * Math.sin(theta));
      pos.copy(nrm).multiplyScalar(1 - size * flat);

      quat.setFromUnitVectors(up, nrm);
      scl.set(size, size * proud, size);
      mat.compose(pos, quat, scl);

      parts.push(DOME.clone().applyMatrix4(mat));
    }
  }

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

// keyed on the settings, so the 8 presets collapse to a handful of shared geometries while
// the tuner can still slide freely (it just adds its own entries)
const featherCache = new Map();

function featherGeometry(opts) {
  const key = JSON.stringify(opts) + '|' + getGeometryDetail();
  if (!featherCache.has(key)) featherCache.set(key, makeFeatherShell(opts));
  return featherCache.get(key);
}

export function clearFeatherCache() {
  for (const g of featherCache.values()) g?.dispose();
  featherCache.clear();
}

function featherMesh(geo, material, scale) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, material);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/**
 * Builds one owl.
 * Returns the root plus the joint handles, so poses can be changed without rebuilding.
 */
export function createOwl(P) {
  const materials = [];
  const bodyMat = feltMaterial(P, P.bodyColor);
  const featherMat = feltMaterial(P, P.featherColor);
  const eyeMat = eyeMaterial(P, P.eyeColor);
  const pupMat = eyeMaterial(P, P.pupilColor);
  const beakMat = feltMaterial(P, P.beakColor);
  materials.push(bodyMat, featherMat, eyeMat, pupMat, beakMat);

  const root = new THREE.Group();
  const joints = { shoulders: [], elbows: [], hips: [], knees: [] };

  const waist = new THREE.Group();
  waist.position.y = P.legHeight;
  root.add(waist);

  // ---- lower body (legs variant)
  // hips sit ABOVE the waist plane so the thighs penetrate the torso sphere; butting them
  // against the waist leaves a gap, because the torso is a sphere and its surface at the
  // leg offset is higher than at its centre.
  const lowerBody = new THREE.Group();
  waist.add(lowerBody);

  const legTotal = P.legHeight + P.hipInset;
  const thighLen = legTotal * 0.55;
  const shinLen = legTotal * 0.45;

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * P.legSpread, P.hipInset, 0);
    hip.rotation.x = P.legSwing * side;
    lowerBody.add(hip);
    joints.hips.push({ node: hip, side });

    hip.add(part(CYL, bodyMat, {
      pos: [0, -thighLen * 0.5, 0],
      scale: [P.limbThick, thighLen, P.limbThick],
    }));

    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    knee.rotation.x = P.kneeBend;
    hip.add(knee);
    joints.knees.push({ node: knee, side });

    knee.add(part(CYL, bodyMat, {
      pos: [0, -shinLen * 0.5, 0],
      scale: [P.limbThick * 0.92, shinLen, P.limbThick * 0.92],
    }));

    const foot = new THREE.Group();
    foot.position.y = -shinLen;
    knee.add(foot);
    foot.add(part(SPHERE, beakMat, {
      pos: [0, 0.016, 0.038],
      scale: [0.055, 0.028, 0.078],
    }));
  }

  // ---- torso
  const torso = new THREE.Group();
  torso.position.y = P.torsoH;
  waist.add(torso);
  torso.add(part(SPHERE, bodyMat, { scale: [P.torsoW, P.torsoH, P.torsoD] }));

  if (P.feathers) {
    const m = featherMesh(featherGeometry({
      rows: P.featherRows, perRow: P.featherPerRow, size: P.featherSize,
      flat: P.featherFlat, proud: P.featherProud,
      top: P.featherTop, bottom: P.featherBottom, stagger: P.featherStagger,
    }), featherMat, [P.torsoW, P.torsoH, P.torsoD]);
    if (m) torso.add(m);
  }

  // ---- arms: shoulder -> elbow -> hand.
  // Wing feathers ATTACH to the upper arm, they do not replace the chain. Without the elbow
  // and hand there is nowhere to put a carried item and no way to bring it in front of the body.
  const hands = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * P.torsoW * 0.82, P.torsoH * 0.30, 0);
    shoulder.rotation.set(P.armSwing, 0, side * P.armOut);
    torso.add(shoulder);
    joints.shoulders.push({ node: shoulder, side });

    shoulder.add(part(CYL, bodyMat, {
      pos: [0, -P.upperArmLen * 0.5, 0],
      scale: [P.limbThick * 1.05, P.upperArmLen, P.limbThick * 1.05],
    }));

    // all three axes scale with wingLength so it shrinks rather than changing shape
    const wingScale = [P.wingLength * P.wingWidth, P.wingLength * 0.52, P.wingLength * P.wingDepth];
    const wingPos = [side * 0.012, -P.wingLength * 0.42, 0];
    const wingRot = [0, 0, side * 0.08];

    shoulder.add(part(SPHERE, bodyMat, { pos: wingPos, scale: wingScale, rot: wingRot }));

    if (P.feathers && P.featherWings) {
      const m = featherMesh(featherGeometry({
        rows: P.featherRows, perRow: Math.max(3, Math.round(P.featherPerRow * 0.6)),
        size: P.featherSize * P.featherWingScale,
        flat: P.featherFlat, proud: P.featherProud,
        top: 0.42, bottom: 0.96, stagger: P.featherStagger,
      }), featherMat, wingScale);
      if (m) {
        m.position.set(...wingPos);
        m.rotation.set(...wingRot);
        shoulder.add(m);
      }
    }

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArmLen;
    elbow.rotation.x = -P.elbowBend;
    shoulder.add(elbow);
    joints.elbows.push({ node: elbow, side });

    elbow.add(part(CYL, bodyMat, {
      pos: [0, -P.forearmLen * 0.5, 0],
      scale: [P.limbThick * 0.92, P.forearmLen, P.limbThick * 0.92],
    }));

    const hand = new THREE.Group();
    hand.position.y = -P.forearmLen;
    elbow.add(hand);
    hand.add(part(SPHERE, bodyMat, { scale: [0.042, 0.038, 0.042] }));

    const hold = new THREE.Group();
    hold.position.set(0, -0.030, 0.028);
    hand.add(hold);
    hands.push(hold);
  }

  // ---- carried item. Always built, visibility toggled, so poses can change without a rebuild.
  const skeinMat = knitMaterial(P.heldColor);
  materials.push(skeinMat);
  const held = new THREE.Group();
  held.rotation.z = Math.PI * 0.5;
  held.add(part(SPHERE, skeinMat, { scale: [0.052, 0.088, 0.052] }));
  held.add(part(TORUS, feltMaterial(P, '#efe6d5'), {
    scale: [0.050, 0.050, 0.030],
    rot: [Math.PI * 0.5, 0, 0],
  }));
  held.visible = !!P.holdItem;
  hands[0].add(held);

  // ---- neck: real length, concealed inside the head/torso overlap
  const neck = new THREE.Group();
  neck.position.y = P.torsoH - P.headOverlap;
  torso.add(neck);
  neck.add(part(CYL, bodyMat, { scale: [0.075, P.neckLength, 0.075], pos: [0, P.neckLength * 0.5, 0] }));

  // ---- head
  const head = new THREE.Group();
  head.position.y = P.neckLength + P.headRadius * 0.62;
  neck.add(head);
  head.add(part(SPHERE, bodyMat, { scale: [P.headRadius * 1.06, P.headRadius, P.headRadius * 0.98] }));

  if (P.feathers && P.featherHead) {
    const m = featherMesh(featherGeometry({
      rows: Math.max(1, Math.round(P.featherRows * 0.7)),
      perRow: P.featherPerRow,
      size: P.featherSize * P.featherHeadScale,
      flat: P.featherFlat, proud: P.featherProud,
      top: 0.06, bottom: 0.62, stagger: P.featherStagger,
      skipFront: P.featherFaceGap,
    }), featherMat, [P.headRadius * 1.06, P.headRadius, P.headRadius * 0.98]);
    if (m) head.add(m);
  }

  for (const side of [-1, 1]) {
    const eyeX = side * P.headRadius * P.eyeSpread;
    const eyeY = P.headRadius * P.eyeLift;
    const eyeZ = P.headRadius * 0.72;
    const whiteDepth = P.eyeRadius * 0.55;
    const pupilR = P.eyeRadius * P.pupilScale;

    head.add(part(SPHERE, eyeMat, {
      pos: [eyeX, eyeY, eyeZ],
      scale: [P.eyeRadius, P.eyeRadius, whiteDepth],
    }));
    // centred near the eye-white surface so the pupil domes out of it rather than floating free
    head.add(part(SPHERE, pupMat, {
      pos: [eyeX, eyeY, eyeZ + whiteDepth * 0.6 + P.pupilDepth],
      scale: [pupilR, pupilR, pupilR * 0.72],
    }));
  }

  head.add(part(CONE, beakMat, {
    pos: [0, -P.headRadius * 0.10, P.headRadius * 0.86],
    scale: [P.beakSize, P.beakSize * 2.1, P.beakSize],
    rot: [Math.PI * 0.5, 0, 0],
  }));

  // ear tufts - species kit, additive only
  for (const side of [-1, 1]) {
    head.add(part(CONE, bodyMat, {
      pos: [side * P.headRadius * P.tuftSpread, P.headRadius * 0.78, -P.headRadius * 0.06],
      scale: [P.tuftSize, P.tuftSize * 2.4, P.tuftSize],
      rot: [0, 0, side * -P.tuftTilt],
    }));
  }

  // ---- neck garment slot: sits as a ruff on an apparently neck-less species
  if (P.scarf) {
    const scarfMat = knitMaterial(P.scarfColor);
    materials.push(scarfMat);
    neck.add(part(TORUS, scarfMat, {
      pos: [0, P.neckLength * 0.35, 0],
      scale: [P.headRadius * 0.92, P.headRadius * 0.92, P.headRadius * 0.62],
      rot: [Math.PI * 0.5, 0, 0],
    }));
  }

  // shadow casters are re-drawn in the depth pass, so this roughly doubles a character's cost
  if (!P.partShadows) root.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  return { root, joints, held, materials, params: P };
}

/** Re-poses an existing owl without rebuilding it. */
export function applyPose(built, pose) {
  const { joints, held } = built;
  for (const { node, side } of joints.shoulders) {
    node.rotation.set(pose.armSwing, 0, side * pose.armOut);
  }
  for (const { node } of joints.elbows) node.rotation.x = -pose.elbowBend;
  for (const { node, side } of joints.hips) node.rotation.x = pose.legSwing * side;
  for (const { node } of joints.knees) node.rotation.x = pose.kneeBend;
  if (held && pose.holdItem !== undefined) held.visible = !!pose.holdItem;
}

/** Swaps every mesh to grey or flat black for the shape and silhouette checks. */
export function setViewMode(root, mode) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.felt ??= o.material;
    o.material = mode === 'grey' ? greyMat : mode === 'silhouette' ? blackMat : o.userData.felt;
  });
}

export function disposeOwl(built) {
  for (const m of built.materials) m.dispose();
  built.root.traverse((o) => {
    if (o.isMesh && o.userData.ownGeometry) o.geometry.dispose();
  });
}
