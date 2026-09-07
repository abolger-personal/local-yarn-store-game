// Shared, species-agnostic NPC construction for the LYS concept viewers.
//
// Pure: nothing here touches a scene, camera or DOM, so every viewer uses it unchanged.
// Node names mirror the shared base rig in P1-SPIKE-PLAN.md.
//
// The split with species modules follows the rule from DESIGN-DECISIONS.md: species kits may
// ADD or SCALE, never REPLACE. This file owns the shared body -- torso, arms, hands, legs,
// feet, neck -- and the machinery every species needs. A species module owns everything above
// the neck plus anything it bolts on: wings, fleece, tails.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- species registry

const SPECIES = new Map();

/** Species modules call this on import, so adding a file is all it takes to add a species. */
export function registerSpecies(species) {
  SPECIES.set(species.id, species);
  return species;
}

export const getSpecies = (id) => SPECIES.get(id);
export const speciesIds = () => [...SPECIES.keys()];
export const speciesList = () => [...SPECIES.values()];

function resolveSpecies(species) {
  const kit = typeof species === 'string' ? getSpecies(species) : species;
  if (!kit) throw new Error(`unknown species: ${species}`);
  return kit;
}

// ---------------------------------------------------------------- shared params

export const TONE_MAPPING = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  None: THREE.NoToneMapping,
};

// Only genuinely shared values live here. Anything one species has and another does not
// belongs in that species module.
export const BASE_PARAMS = Object.freeze({
  name:          'Character',

  // proportions - total figure height normalises to ~1.0 for the owl
  headRadius:    0.171,
  headOverlap:   0.099,   // how far the head sinks toward the torso
  neckLength:    0.100,   // REAL length even when concealed - never zero
  neckThick:     0.075,
  torsoW:        0.210,
  torsoH:        0.193,
  torsoD:        0.215,
  legHeight:     0.193,

  // rig
  hipInset:      0.045,   // hips sit INTO the torso; 0 leaves the legs floating
  legSpread:     0.085,
  limbThick:     0.034,
  upperArmLen:   0.092,
  forearmLen:    0.082,
  shoulderOut:   0.82,    // fraction of torsoW; a species coat is added on top of this
  shoulderLift:  0.30,    // fraction of torsoH
  clampArmOut:   false,   // opt-in: species whose arms are meant to be visible turn this on.
                          // A concealed arm (an owl's, inside its wing) wants to stay inside.
  armClearance:  0.006,

  // pose - static only. proves joint topology without an animation system.
  armSwing:      0.00,
  armOut:        0.16,
  elbowBend:     0.00,
  legSwing:      0.00,
  kneeBend:      0.00,
  hipFlex:       0.00,    // both legs forward together. Positive = knees come UP, which is
                          // the opposite sign to legSwing, because flexion reads that way.
  spineBend:     0.00,    // forward lean at the waist; positive folds the chest toward +Z
  earPerk:       0.00,    // forward/back hinge at the ear base; the expression channel
  earSplay:      0.00,    // extra outward tilt, added to the species' resting tilt
  holdItem:      false,
  heldColor:     '#7a9e6b',

  // eyes - every species has them, so construction is shared even though placement is not
  eyeRadius:     0.084,
  eyeSpread:     0.389,
  eyeLift:       0.12,
  eyeFront:      0.72,    // how far along +Z the eye sits, as a fraction of head radius.
                          // Too low and the skull swallows the white, leaving a bare pupil.
  pupilScale:    0.46,
  pupilDepth:    0.012,   // 0 makes pupil and eye white coplanar and they z-fight
  eyeColor:      '#f6f0e4',
  pupilColor:    '#241a15',
  eyeSheen:      1.00,
  eyeSheenRough: 0.08,
  eyeRough:      0.22,
  eyeClearcoat:  0.70,

  // material
  bodyColor:     '#a0a6ba',
  footColor:     '#e0a53c',
  sheen:         0.34,
  sheenRoughness:0.21,
  sheenTint:     '#c9a892',
  roughness:     1.00,

  partShadows:   true,    // small parts casting shadows roughly doubles their draw cost

  // garment
  scarf:         true,
  scarfColor:    '#b8443f',

  // scene
  view:          'felted',
  exposure:      0.40,
  toneMapping:   'ACES',
});

// armOut is the shoulder's outward rotation in radians: ~1.57 is straight out sideways,
// ~3.0 is overhead. Positive kneeBend takes the heel backward, which is the natural knee.
// Positive armSwing takes the arm BACKWARD, so carrying wants a small negative value: the
// upper arm stays near vertical and the elbow does the work.
const REST_POSE = {
  armSwing: 0, armOut: 0, elbowBend: 0, legSwing: 0, kneeBend: 0,
  hipFlex: 0, spineBend: 0, earPerk: 0, earSplay: 0, holdItem: false,
};

// Every pose carries every channel, even the ones it does not use. A pose missing a key makes
// interpolation produce NaN, NaN reaches the bounding sphere, and the renderer culls the whole
// character -- which looks like characters popping in and out rather than like a broken pose.
const definePoses = (raw) => Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([name, pose]) => [name, Object.freeze({ ...REST_POSE, ...pose })])
));

export const POSES = definePoses({
  rest:   { armOut: 0.16 },
  walk:   { armSwing: 0.42, armOut: 0.14, elbowBend: 0.30, legSwing: 0.30, kneeBend: 1.50 },
  carry:  { armSwing: -0.12, armOut: 0.02, elbowBend: 1.45, holdItem: true },
  reach:  { armSwing: -1.15, armOut: 0.30, elbowBend: 0.35 },
  browse: { armSwing: -0.45, armOut: 0.34, elbowBend: 0.85, spineBend: 0.14 },
  // thighs forward to horizontal, shins dropped back to vertical: kneeBend has to match hipFlex
  sit:    { armSwing: -0.10, armOut: 0.22, elbowBend: 0.75, kneeBend: 1.45, hipFlex: 1.45, spineBend: 0.10 },
  delighted: { armSwing: -0.30, armOut: 2.55, elbowBend: 0.55, kneeBend: 0.10, earPerk: 0.38, earSplay: 0.22 },
  'walk+carry': { armSwing: -0.10, armOut: 0.03, elbowBend: 1.40, legSwing: 0.30, kneeBend: 1.50, holdItem: true },
});

export const POSE_KEYS = [
  'armSwing', 'armOut', 'elbowBend', 'legSwing', 'kneeBend',
  'hipFlex', 'spineBend', 'earPerk', 'earSplay',
];

// Two tiers, not one global percentage.
// TIER 1 - silhouette carriers, roughly +/-50%. These let you tell one character from another
// as a flat black shape at 150px, so they need real room to move.
// TIER 2 - supporting dimensions, roughly +/-15%, so the cast reads as one species not a zoo.
export const BASE_RANDOM_RANGES = Object.freeze({
  legHeight:   [0.085, 0.345],
  // body mass is a tier 1 silhouette carrier, not a supporting dimension: at +/-12% every
  // character read as the same blob. Garments scale from these same params, so per-character
  // spread costs nothing -- the rule the docs care about is species not differing SYSTEMATICALLY.
  torsoW:      [0.155, 0.265],
  torsoH:      [0.145, 0.245],
  torsoD:      [0.160, 0.270],
  legSpread:   [0.060, 0.115],
  limbThick:   [0.022, 0.050],
  eyeRadius:   [0.070, 0.098],
  eyeSpread:   [0.340, 0.440],
  eyeLift:     [0.050, 0.200],
  pupilScale:  [0.380, 0.560],
  upperArmLen: [0.078, 0.108],
  forearmLen:  [0.070, 0.096],
});

// ---------------------------------------------------------------- colour

// Hue is uniform across the wheel, so variety has to come from SATURATION and LIGHTNESS
// spread. A single narrow band collapses every hue into pastel - the Easter-egg failure.
export const FUR_MODES = [
  { weight: 45, sat: [0.06, 0.26], light: [0.22, 0.78] },  // natural: browns, greys, cream, charcoal
  { weight: 35, sat: [0.26, 0.52], light: [0.32, 0.62] },  // tinted
  { weight: 20, sat: [0.52, 0.82], light: [0.28, 0.55] },  // vivid: the occasional teal or plum one
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
export const hsl = (h, s, l) => `#${new THREE.Color().setHSL(h, s, l).getHexString()}`;
export const randHex = (sat, light) => hsl(Math.random(), rand(...sat), rand(...light));

function weightedPick(modes) {
  const total = modes.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * total;
  for (const m of modes) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return modes.at(-1);
}

export function randomFur() {
  const mode = weightedPick(FUR_MODES);
  return randHex(mode.sat, mode.light);
}

// Derived from the body colour rather than drawn independently: a coat sharing a hue family
// reads as one animal, where a free-random second colour reads as two glued together.
// A minority get a real hue shift so the crowd is not entirely tonal.
export function deriveCoatColor(bodyHex) {
  const base = {};
  new THREE.Color(bodyHex).getHSL(base);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const l = THREE.MathUtils.clamp(base.l + dir * rand(0.12, 0.30), 0.06, 0.94);
  const s = THREE.MathUtils.clamp(base.s * rand(0.65, 1.5), 0.03, 0.88);
  const h = (base.h + (Math.random() < 0.22 ? rand(-0.14, 0.14) : 0) + 1) % 1;
  return hsl(h, s, l);
}

export function slugify(text) {
  const slug = (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'character';
}

// ---------------------------------------------------------------- materials

// A noise normal map plus a fuzz shell were tried and removed: at crowd distance the
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

function baseMaterials(P, addMaterial) {
  return {
    body: addMaterial(feltMaterial(P, P.bodyColor)),
    eye: addMaterial(eyeMaterial(P, P.eyeColor)),
    pupil: addMaterial(eyeMaterial(P, P.pupilColor)),
    foot: addMaterial(feltMaterial(P, P.footColor)),
  };
}

// ---------------------------------------------------------------- geometry

// Segment counts, not shapes. A sphere at 48x32 is film tessellation; these characters are
// ~150px tall in play, so most of those triangles are invisible. Measured spread between
// low and high is ~10x triangles.
export const GEO_DETAIL = Object.freeze({
  high: { sphere: [48, 32], cone: 24, cyl: 16, torus: [16, 40], dome: [12, 6] },
  med:  { sphere: [24, 16], cone: 16, cyl: 10, torus: [10, 24], dome: [8, 4] },
  low:  { sphere: [14, 10], cone: 10, cyl: 7,  torus: [8, 16],  dome: [6, 3] },
});

// mutated in place so species modules can hold one reference across detail changes
export const GEO = { sphere: null, cone: null, cyl: null, taper: null, torus: null, dome: null };

let currentDetail = null;

// Baked into the geometry rather than exposed as a parameter: a per-character taper ratio
// would mean per-character geometry, which is the thing that costs frame time.
export const LIMB_TAPER = 0.78;

const buildPrimitives = (d) => ({
  sphere: new THREE.SphereGeometry(1, d.sphere[0], d.sphere[1]),
  cone: new THREE.ConeGeometry(1, 1, d.cone),
  cyl: new THREE.CylinderGeometry(1, 1, 1, d.cyl),
  taper: new THREE.CylinderGeometry(1, LIMB_TAPER, 1, d.cyl),
  torus: new THREE.TorusGeometry(1, 0.34, d.torus[0], d.torus[1]),
  dome: new THREE.SphereGeometry(1, d.dome[0], d.dome[1], 0, Math.PI * 2, 0, Math.PI * 0.5),
});

/** Rebuilds shared geometry. Callers must rebuild any existing characters afterwards. */
export function setGeometryDetail(level = 'high') {
  if (currentDetail !== null) {
    Object.values(GEO).forEach((g) => g?.dispose());
    clearScallopCache();   // scallops are built from GEO.dome, so every shell is now stale
  }
  currentDetail = level;
  Object.assign(GEO, buildPrimitives(GEO_DETAIL[level] ?? GEO_DETAIL.high));
}
setGeometryDetail('high');

export const getGeometryDetail = () => currentDetail;

export function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

// ---------------------------------------------------------------- scallop shells
//
// Owl plumage and llama fleece are the same operation: overlapping domes laid over a body
// part. Low frequency on purpose - the removed felt normal map failed because
// high-frequency relief reads as grain, where a handful of large scallops reads as coat.

const UP = new THREE.Vector3(0, 1, 0);

const normaliseShell = (o) => ({
  ...o,
  rows: Math.max(1, Math.round(o.rows)),
  perRow: Math.max(3, Math.round(o.perRow)),
  skipFront: o.skipFront ?? 0,
});

// +Z is the face direction, which sits at theta = PI/2
const inFaceGap = (theta, gap) => {
  if (gap <= 0) return false;
  const delta = Math.abs(((theta - Math.PI / 2 + Math.PI) % (Math.PI * 2)) - Math.PI);
  return delta < gap * 0.5;
};

function scallopAngles({ rows, perRow, top, bottom, stagger, skipFront }) {
  const angles = [];
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    const phi = Math.PI * (top + (bottom - top) * t);
    const offset = stagger && r % 2 ? Math.PI / perRow : 0;
    for (let s = 0; s < perRow; s++) {
      const theta = (s / perRow) * Math.PI * 2 + offset;
      if (!inFaceGap(theta, skipFront)) angles.push({ phi, theta });
    }
  }
  return angles;
}

function scallopMatrix({ phi, theta }, { size, flat, proud }) {
  const sinPhi = Math.sin(phi);
  const normal = new THREE.Vector3(sinPhi * Math.cos(theta), Math.cos(phi), sinPhi * Math.sin(theta));
  const position = normal.clone().multiplyScalar(1 - size * flat);
  const rotation = new THREE.Quaternion().setFromUnitVectors(UP, normal);
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(size, size * proud, size));
}

/**
 * Lays scalloped domes over a UNIT sphere and merges them into ONE geometry.
 * Unit space is the point: the mesh is scaled to the body part afterwards, so identical
 * settings yield identical geometry regardless of that character's dimensions. Without it
 * every character generates unique geometry, which blocks instancing and costs frame time
 * in attribute rebinds.
 */
function makeScallopShell(opts) {
  const shell = normaliseShell(opts);
  const angles = scallopAngles(shell);
  if (!angles.length) return null;
  const domes = angles.map((a) => GEO.dome.clone().applyMatrix4(scallopMatrix(a, shell)));
  const merged = mergeGeometries(domes, false);
  domes.forEach((g) => g.dispose());
  return merged;
}

// keyed on the settings, so quantised presets collapse to a handful of shared geometries
// while a tuner can still slide freely - it just adds its own entries
const scallopCache = new Map();

export function scallopGeometry(opts) {
  const key = `${JSON.stringify(opts)}|${currentDetail}`;
  if (!scallopCache.has(key)) scallopCache.set(key, makeScallopShell(opts));
  return scallopCache.get(key);
}

export function clearScallopCache() {
  for (const geometry of scallopCache.values()) geometry?.dispose();
  scallopCache.clear();
}

// widest row wins: size for it and every narrower row overlaps rather than gaps
function widestRowSin(rows, top, bottom) {
  let widest = 0;
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    widest = Math.max(widest, Math.sin(Math.PI * (top + (bottom - top) * t)));
  }
  return widest || 1e-3;
}

/**
 * The scallop radius at which neighbours just touch, in unit-sphere space.
 * Lets a caller change row and column counts without re-tuning size by hand: fleece that is
 * supposed to read as a continuous mass has to stay closed as the counts move.
 */
export function touchingScallopSize({ rows, perRow, top, bottom, maxSize = 0.45 }) {
  const rowCount = Math.max(1, Math.round(rows));
  const columns = Math.max(3, Math.round(perRow));
  const across = ((Math.PI * 2) / columns) * widestRowSin(rowCount, top, bottom);
  const down = rowCount > 1 ? ((bottom - top) * Math.PI) / (rowCount - 1) : across;
  return Math.min(Math.max(across, down) * 0.5, maxSize);
}

/** A scallop shell scaled onto a body part. Geometry is shared, so never dispose it. */
export function scallopMesh(geometry, material, scale) {
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- shared kit helpers

const eyeWhiteDepth = (P) => P.eyeRadius * 0.55;

function buildEye(side, P, mat, { spread, lift, front, squash }) {
  const group = new THREE.Group();
  const depth = eyeWhiteDepth(P);
  const pupilR = P.eyeRadius * P.pupilScale;
  group.position.set(side * P.headRadius * spread, P.headRadius * lift, P.headRadius * front);
  group.add(part(GEO.sphere, mat.eye, { scale: [P.eyeRadius, P.eyeRadius * squash, depth] }));
  // centred near the eye-white surface so the pupil domes out of it rather than floating free
  group.add(part(GEO.sphere, mat.pupil, {
    pos: [0, 0, depth * 0.6 + P.pupilDepth],
    scale: [pupilR, pupilR * squash, pupilR * 0.72],
  }));
  return group;
}

/** Eyes on the head node. Placement is species business, construction is not. */
export function addEyes(ctx, P, opts = {}) {
  const placement = {
    spread: opts.spread ?? P.eyeSpread,
    lift: opts.lift ?? P.eyeLift,
    front: opts.front ?? P.eyeFront,
    squash: opts.squash ?? 1,
  };
  for (const side of [-1, 1]) ctx.head.add(buildEye(side, P, ctx.mat, placement));
}

/**
 * Ears as rigged joint nodes, for any species whose ears carry the silhouette.
 * `cone` is a spike -- owl tufts. `leaf` is a flattened ellipsoid, widest in the middle and
 * soft at both ends, which is what reads as a mammal ear.
 *
 * Each ear is a Group so it can be animated. The geometry is offset UP inside that group, so
 * the pivot sits at the base where the ear meets the head: rotating a centre-pivoted ear
 * slides it through the skull instead of hinging it.
 */
export function addEars(ctx, P, opts) {
  const { size, length, spread, tilt, shape = 'cone',
          lift = 0.78, back = -0.06, flatten = 0.5, material } = opts;
  const leaf = shape === 'leaf';
  const geometry = leaf ? GEO.sphere : GEO.cone;
  const scale = leaf ? [size, length * 0.5, size * flatten] : [size, length, size];

  for (const side of [-1, 1]) {
    const ear = named(new THREE.Group(), `${sideName(side)}Ear`);
    ear.position.set(side * P.headRadius * spread, P.headRadius * lift, P.headRadius * back);
    ear.rotation.set(P.earPerk ?? 0, 0, side * -(tilt + (P.earSplay ?? 0)));
    ear.add(part(geometry, material ?? ctx.mat.body, { pos: [0, length * 0.35, 0], scale }));
    ctx.head.add(ear);
    ctx.joints.ear.push({ node: ear, side, tilt });
  }
}

export const addConeEars = (ctx, P, opts) => addEars(ctx, P, { ...opts, shape: 'cone' });

// ---------------------------------------------------------------- arm clearance

// Elbow position in torso-local space. three.js Euler XYZ applies as Rx * Ry * Rz, and with
// no Y term that reduces to a closed form for the arm's downward vector.
function elbowAt(P, bulge, armOut, armSwing) {
  const L = P.upperArmLen;
  const down = Math.cos(armOut) * L;
  return {
    x: P.torsoW * (P.shoulderOut + bulge) + Math.sin(armOut) * L,
    y: P.torsoH * P.shoulderLift - down * Math.cos(armSwing),
    z: -down * Math.sin(armSwing),
  };
}

/**
 * The smallest armOut that keeps the elbow outside the body, coat included.
 *
 * Scanned rather than solved: folding the coat scale and the elbow's own radius into the
 * ellipsoid test makes the closed form a quartic, and 24 samples over a quarter turn is well
 * inside the precision a resting pose needs.
 */
export function minArmOut(P, bulge = 0, armSwing = 0) {
  const coat = 1 + bulge;   // the coat surface is exactly this multiple of the torso
  const pad = P.limbThick * 1.05 * LIMB_TAPER + (P.armClearance ?? 0);
  const [a, b, c] = [coat * P.torsoW + pad, coat * P.torsoH + pad, coat * P.torsoD + pad];

  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (Math.PI / 2);
    const e = elbowAt(P, bulge, t, armSwing);
    if ((e.x / a) ** 2 + (e.y / b) ** 2 + (e.z / c) ** 2 > 1) return t;
  }
  return Math.PI / 2;
}

export const clampArmOut = (P, bulge, armOut, armSwing) => (P.clampArmOut
  ? Math.max(armOut, minArmOut(P, bulge, armSwing))
  : armOut);

// ---------------------------------------------------------------- shared body
//
// Node names follow the VRM humanoid bone set (hips, spine, chest, neck, head, upperArm,
// lowerArm, hand, upperLeg, lowerLeg, foot). Nothing here reads those names, but matching the
// standard keeps a retargeting layer a mapping table rather than a rewrite, and it makes the
// hierarchy legible to anything that expects a humanoid.

// the character faces +Z, which puts its right side at -X
const sideName = (side) => (side < 0 ? 'right' : 'left');

const named = (node, name) => {
  node.name = name;
  return node;
};

function buildFoot(shinLen, mat, side) {
  const foot = named(new THREE.Group(), `${sideName(side)}Foot`);
  foot.position.y = -shinLen;
  foot.add(part(GEO.sphere, mat.foot, { pos: [0, 0.016, 0.038], scale: [0.055, 0.028, 0.078] }));
  return foot;
}

/**
 * One limb bone, hung downward from its joint node.
 * Two flat-capped cylinders butted together is what reads as a robot arm, so segments taper
 * and the joint gets a sphere sized to the segment radius. `cap` is off for joints buried
 * inside the torso, where the sphere would cost a draw call and never be seen.
 */
function limbSegment(node, material, radius, length, cap = true) {
  node.add(part(GEO.taper, material, {
    pos: [0, -length / 2, 0],
    scale: [radius, length, radius],
  }));
  if (cap) node.add(part(GEO.sphere, material, { scale: [radius, radius * 0.92, radius] }));
}

// hips sit ABOVE the waist plane so the thighs penetrate the torso sphere; butting them
// against the waist leaves a gap, because the torso is a sphere whose surface at the leg
// offset is higher than at its centre.
/**
 * How far this knee actually bends, given which way its leg is swinging.
 *
 * The LEADING leg bends and lifts -- that is the swing phase, where the thigh drives forward
 * and the shin tucks back under it. The trailing leg stays nearly straight, pushing off.
 * Bending both equally, or bending the trailing one, reads as a hyperextended back leg.
 *
 * With no swing at all (standing, sitting) both knees get the full bend, which is what a
 * crouch or a seated pose needs.
 */
const kneeAmount = (kneeBend, legSwing, side) =>
  kneeBend * (1 - 0.85 * Math.max(0, Math.tanh(legSwing * side * 4)));

function buildLeg(side, P, mat, joints) {
  const total = P.legHeight + P.hipInset;
  const [thigh, shin] = [total * 0.55, total * 0.45];
  const upperLeg = named(new THREE.Group(), `${sideName(side)}UpperLeg`);
  upperLeg.position.set(side * P.legSpread, P.hipInset, 0);
  upperLeg.rotation.x = P.legSwing * side - P.hipFlex;
  limbSegment(upperLeg, mat.body, P.limbThick, thigh, false);   // hip sits inside the torso
  joints.upperLeg.push({ node: upperLeg, side });

  const lowerLeg = named(new THREE.Group(), `${sideName(side)}LowerLeg`);
  lowerLeg.position.y = -thigh;
  lowerLeg.rotation.x = kneeAmount(P.kneeBend, P.legSwing, side);
  limbSegment(lowerLeg, mat.body, P.limbThick * LIMB_TAPER, shin);
  lowerLeg.add(buildFoot(shin, mat, side));
  upperLeg.add(lowerLeg);
  joints.lowerLeg.push({ node: lowerLeg, side });
  return upperLeg;
}

function buildLowerBody(P, mat, joints) {
  const lowerBody = named(new THREE.Group(), 'lowerBody');
  for (const side of [-1, 1]) lowerBody.add(buildLeg(side, P, mat, joints));
  return lowerBody;
}

function buildChest(P, mat) {
  const chest = named(new THREE.Group(), 'chest');
  chest.position.y = P.torsoH;
  chest.add(part(GEO.sphere, mat.body, { scale: [P.torsoW, P.torsoH, P.torsoD] }));
  return chest;
}

function buildHand(P, mat, side) {
  const hand = named(new THREE.Group(), `${sideName(side)}Hand`);
  hand.position.y = -P.forearmLen;
  hand.add(part(GEO.sphere, mat.body, { scale: [0.042, 0.038, 0.042] }));
  const hold = named(new THREE.Group(), `${sideName(side)}Hold`);
  hold.position.set(0, -0.030, 0.028);
  hand.add(hold);
  return { hand, hold };
}

// Without the elbow and hand there is nowhere to put a carried item and no way to bring it in
// front of the body. Wings, for species that have them, attach to the upper arm.
//
// `bulge` is how far the species' coat stands proud of the torso. Arms sit at the torso
// surface plus that, otherwise a thick coat swallows the whole limb and only the hand shows.
function buildArm(side, P, mat, joints, bulge) {
  const upperR = P.limbThick * 1.05;
  const upperArm = named(new THREE.Group(), `${sideName(side)}UpperArm`);
  upperArm.position.set(side * P.torsoW * (P.shoulderOut + bulge), P.torsoH * P.shoulderLift, 0);
  upperArm.rotation.set(P.armSwing, 0, side * clampArmOut(P, bulge, P.armOut, P.armSwing));
  limbSegment(upperArm, mat.body, upperR, P.upperArmLen);
  joints.upperArm.push({ node: upperArm, side });

  const lowerArm = named(new THREE.Group(), `${sideName(side)}LowerArm`);
  lowerArm.position.y = -P.upperArmLen;
  lowerArm.rotation.x = -P.elbowBend;
  limbSegment(lowerArm, mat.body, upperR * LIMB_TAPER, P.forearmLen);
  const { hand, hold } = buildHand(P, mat, side);
  lowerArm.add(hand);
  upperArm.add(lowerArm);
  joints.lowerArm.push({ node: lowerArm, side });
  return { upperArm, hold };
}

// always built, visibility toggled, so poses change without a rebuild
function buildHeldItem(P, addMaterial) {
  const skein = addMaterial(knitMaterial(P.heldColor));
  const band = addMaterial(feltMaterial(P, '#efe6d5'));
  const held = new THREE.Group();
  held.rotation.z = Math.PI * 0.5;
  held.add(part(GEO.sphere, skein, { scale: [0.052, 0.088, 0.052] }));
  held.add(part(GEO.torus, band, { scale: [0.050, 0.050, 0.030], rot: [Math.PI * 0.5, 0, 0] }));
  held.visible = Boolean(P.holdItem);
  return held;
}

function attachArms(chest, P, mat, joints, addMaterial, bulge) {
  const arms = [-1, 1].map((side) => buildArm(side, P, mat, joints, bulge));
  arms.forEach(({ upperArm }) => chest.add(upperArm));
  const held = buildHeldItem(P, addMaterial);
  arms[0].hold.add(held);
  return { held, holds: arms.map(({ hold }) => hold) };
}

// Length is real even when hidden: a multiplier on a near-zero neck stays near-zero, which is
// what would make a long-necked species impossible to express.
function buildNeck(P, mat) {
  const neck = named(new THREE.Group(), 'neck');
  neck.position.y = P.torsoH - P.headOverlap;
  neck.add(part(GEO.cyl, mat.body, {
    scale: [P.neckThick, P.neckLength, P.neckThick],
    pos: [0, P.neckLength / 2, 0],
  }));
  return neck;
}

// the node only - head geometry belongs to the species kit
function buildHeadNode(P) {
  const head = named(new THREE.Group(), 'head');
  head.position.y = P.neckLength + P.headRadius * 0.62;
  return head;
}

// length-aware so a long-necked species wears the same scarf
function buildScarf(P, addMaterial) {
  const radius = Math.max(P.neckThick * 1.9, P.headRadius * 0.92);
  return part(GEO.torus, addMaterial(knitMaterial(P.scarfColor)), {
    pos: [0, P.neckLength * 0.35, 0],
    scale: [radius, radius, radius * 0.67],
    rot: [Math.PI * 0.5, 0, 0],
  });
}

// spine pivots at the waist plane, so a lean folds the whole upper body rather than shearing it
function buildUpperBody(P, mat, joints, addMaterial, bulge) {
  const spine = named(new THREE.Group(), 'spine');
  spine.rotation.x = P.spineBend;
  const chest = buildChest(P, mat);
  spine.add(chest);

  const { held, holds } = attachArms(chest, P, mat, joints, addMaterial, bulge);
  const neck = buildNeck(P, mat);
  const head = buildHeadNode(P);
  neck.add(head);
  chest.add(neck);

  Object.assign(joints, { spine, chest, neck, head });
  return { spine, chest, neck, head, held, holds };
}

function buildBody(P, mat, joints, addMaterial, bulge) {
  const root = named(new THREE.Group(), 'root');
  const hips = named(new THREE.Group(), 'hips');
  hips.position.y = P.legHeight;
  root.add(hips);
  joints.hips = hips;

  hips.add(buildLowerBody(P, mat, joints));
  const upper = buildUpperBody(P, mat, joints, addMaterial, bulge);
  hips.add(upper.spine);

  return { root, hips, ...upper };
}

// shadow casters are re-drawn in the depth pass, so this roughly doubles a character's cost
function disableShadowCasting(root) {
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
}

/**
 * Builds the shared base rig, then hands off to the species kit.
 *
 * The base deliberately does NOT build head geometry, wings or a coat. Baking any of those in
 * here is how a shared rig quietly becomes a single-species rig.
 */
export function createCharacter(P, species) {
  const kit = resolveSpecies(species);
  const materials = [];
  const addMaterial = (m) => (materials.push(m), m);
  const mat = baseMaterials(P, addMaterial);
  const joints = {
    hips: null, spine: null, chest: null, neck: null, head: null,
    upperArm: [], lowerArm: [], upperLeg: [], lowerLeg: [], ear: [],
  };
  const bulge = Math.max(0, kit.coatBulge?.(P) ?? 0);
  const body = buildBody(P, mat, joints, addMaterial, bulge);

  const ctx = { ...body, joints, materials, mat, addMaterial, params: P, species: kit, bulge };
  kit.buildKit(ctx, P);
  if (P.scarf) body.neck.add(buildScarf(P, addMaterial));
  if (!P.partShadows) disableShadowCasting(body.root);
  groundCharacter(ctx);
  return ctx;
}

/**
 * Drops the character so its lowest point rests on y = 0.
 * Any knee bend shortens the leg, so a posed figure floats without this. Idempotent, because
 * a already-grounded character measures a minimum of zero.
 */
export function groundCharacter(built) {
  built.root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(built.root);
  if (Number.isFinite(box.min.y)) built.root.position.y -= box.min.y;
}

/** Re-poses an existing character without rebuilding it. */
export function applyPose(built, pose) {
  const { joints, held, params, bulge = 0 } = built;
  const out = clampArmOut(params, bulge, pose.armOut, pose.armSwing);
  for (const { node, side } of joints.upperArm) node.rotation.set(pose.armSwing, 0, side * out);
  for (const { node } of joints.lowerArm) node.rotation.x = -pose.elbowBend;
  for (const { node, side } of joints.upperLeg) {
    node.rotation.x = pose.legSwing * side - (pose.hipFlex ?? 0);
  }
  for (const { node, side } of joints.lowerLeg) {
    node.rotation.x = kneeAmount(pose.kneeBend, pose.legSwing, side);
  }
  if (joints.spine) joints.spine.rotation.x = pose.spineBend ?? 0;
  // resting tilt belongs to the species, so the pose adds to it rather than replacing it
  for (const { node, side, tilt } of joints.ear) {
    node.rotation.set(pose.earPerk ?? 0, 0, side * -(tilt + (pose.earSplay ?? 0)));
  }
  if (held && pose.holdItem !== undefined) held.visible = Boolean(pose.holdItem);
  groundCharacter(built);
}

/** Swaps every mesh to grey or flat black for the shape and silhouette checks. */
export function setViewMode(root, mode) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.felt ??= o.material;
    o.material = mode === 'grey' ? greyMat : mode === 'silhouette' ? blackMat : o.userData.felt;
  });
}

export function disposeCharacter(built) {
  for (const material of built.materials) material.dispose();
}

// ---------------------------------------------------------------- randomisation

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Applies ranges onto a params object, in place. Counts stay whole. */
export function applyRanges(P, ranges) {
  for (const [key, [a, b]] of Object.entries(ranges)) P[key] = round3(rand(a, b));
  return P;
}

/** Shared randomised identity. Species add their own on top. */
export function randomiseBase(P, ranges = BASE_RANDOM_RANGES) {
  applyRanges(P, ranges);
  P.bodyColor = randomFur();
  P.scarf = Math.random() < 0.7;
  P.scarfColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.heldColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.name = pick(NAMES);
  return P;
}

// randomised outside the range table, so they have to be listed explicitly
export const SHARED_RANDOM_KEYS = ['bodyColor', 'scarf', 'scarfColor', 'heldColor'];

const sameRange = (a, b) => Boolean(a) && Boolean(b) && a[0] === b[0] && a[1] === b[1];

/**
 * Copies every parameter two species randomise the same way from one character onto another,
 * so the pair differs ONLY where their kits differ. Turns randomise into a controlled
 * comparison rather than two unrelated rolls.
 *
 * A key whose range the species overrode is skipped: owl and llama both have `neckLength`, but
 * their ranges do not overlap, so copying it would produce a character neither kit intends.
 */
export function shareRandomParams(from, to, fromKit, toKit) {
  for (const key of Object.keys(BASE_RANDOM_RANGES)) {
    if (!(key in from) || !(key in to)) continue;
    if (!sameRange(fromKit.randomRanges[key], toKit.randomRanges[key])) continue;
    to[key] = from[key];
  }
  for (const key of SHARED_RANDOM_KEYS) {
    if (key in from && key in to) to[key] = from[key];
  }
  // the coat is named per species but plays the same role, so carry the colour across
  if (fromKit.coatColorKey && toKit.coatColorKey) {
    to[toKit.coatColorKey] = from[fromKit.coatColorKey];
  }
  return to;
}

// ---------------------------------------------------------------- gui specs
//
// Declarative so a viewer can build a panel for any species without importing it.
// Entry forms: [key, min, max, step?] | [key, 'color'] | [key, 'bool'] | [key, [options]]
//
// `pose` is kept separate from `rig` on purpose: pose values are the ones an animation drives
// and can be applied to a built character without rebuilding it, which is exactly what
// POSE_KEYS lists. Everything in `rig` changes the mesh and needs a rebuild.
export const BASE_GUI = Object.freeze({
  proportions: [
    ['headRadius', 0.06, 0.32], ['headOverlap', 0.0, 0.16], ['neckLength', 0.01, 0.70],
    ['neckThick', 0.02, 0.14],
    ['torsoW', 0.12, 0.36], ['torsoH', 0.14, 0.42], ['torsoD', 0.10, 0.34],
    ['legHeight', 0.02, 0.40],
  ],
  pose: [
    ['armSwing', -1.6, 1.6], ['armOut', -1.0, 3.0], ['elbowBend', -0.2, 2.4],
    ['legSwing', -1.0, 1.0], ['kneeBend', -0.4, 2.4], ['hipFlex', -0.6, 1.9],
    ['spineBend', -0.7, 1.2],
    ['earPerk', -1.2, 1.2], ['earSplay', -0.8, 1.2],
    ['holdItem', 'bool'],
  ],
  rig: [
    ['hipInset', 0.0, 0.14], ['legSpread', 0.02, 0.20], ['limbThick', 0.012, 0.070],
    ['upperArmLen', 0.03, 0.20], ['forearmLen', 0.03, 0.20],
    ['shoulderOut', 0.4, 1.6], ['shoulderLift', -0.2, 0.9],
    ['clampArmOut', 'bool'], ['armClearance', 0, 0.03],
    ['heldColor', 'color'],
  ],
  'body material': [
    ['bodyColor', 'color'], ['footColor', 'color'],
    ['sheen', 0, 1], ['sheenRoughness', 0, 1], ['sheenTint', 'color'], ['roughness', 0, 1],
  ],
  'eyes (glassy)': [
    ['eyeRadius', 0.02, 0.14], ['eyeSpread', 0.1, 0.9], ['eyeLift', -0.5, 0.6],
    ['eyeFront', 0.2, 1.4],
    ['pupilScale', 0.1, 0.9], ['pupilDepth', 0.0, 0.06],
    ['eyeColor', 'color'], ['pupilColor', 'color'],
    ['eyeSheen', 0, 1], ['eyeSheenRough', 0, 1], ['eyeRough', 0, 1], ['eyeClearcoat', 0, 1],
  ],
  garment: [
    ['scarf', 'bool'], ['scarfColor', 'color'],
  ],
});
