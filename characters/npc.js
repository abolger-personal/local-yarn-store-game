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
import { makeMotion, integrate, compose, tailStep, POSE_KEYS, POSES } from './motion.js';

// Bumped on every meaningful change. Viewers log it, so a stale browser cache shows up as an
// old value in the console instead of as mysteriously unchanged behaviour.
export const BUILD = '2026-09-26.8-tails';

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
  spineRoll:     0.00,    // LATERAL lean at the waist; positive leans to the character's left.
                          // Every other body channel rotates about X (fore-aft), so this is the
                          // only way anything on the rig moves side to side.
  earPerk:       0.00,    // forward/back hinge at the ear base; the expression channel
  earSplay:      0.00,    // extra outward tilt, added to the species' resting tilt
  armSwingAlt:   0.00,    // anti-symmetric arm swing: armSwing moves both arms together, so a
                          // walk's counter-swing needs a channel of its own
  armOutAlt:     0.00,    // anti-symmetric arm ELEVATION -- armOut raises both arms by the same
                          // angle and is mirrored by construction, so the rig could not put one
                          // arm up and the other out. Measured: across armOut, armSwing and
                          // armSwingAlt the two hands never differed laterally by more than 0.00.
                          // Positive raises the character's LEFT arm and lowers the right. It is
                          // clamped PER SIDE, so an asymmetric line still cannot drive an arm
                          // through the body. A ballet port de bras needs this and nothing else
                          // on the rig provides it.
  spineTwist:    0.00,    // axial twist at the waist; positive turns the chest to the character's
                          // LEFT while the hips stay put. The spine's Y rotation slot was
                          // literally unused -- set(bend, 0, -roll) -- so the torso could bend and
                          // lean but never turn. Shoulders-against-hips is the whole read of a
                          // floss, and half of what makes a strut swagger rather than march.
  headYaw:       0.00,    // positive turns to the character's LEFT
  headYawMax:    1.40,    // HOW FAR this species can physically turn its head, radians (~80deg,
                          // a mammal). Anatomy, not personality, so it lives with neckLength
                          // rather than in the motion ranges -- an owl overrides it to ~260deg
                          // and everything that turns a head is then correct for free.
  headPitch:     0.00,    // positive looks DOWN, matching spineBend's positive-forward
  headTilt:      0.00,    // positive takes the top of the head to the character's left
  tailLift:      0.00,    // raises the tail from the species' resting droop; negative tucks it
  tailWag:       0.00,    // wag amount, 0 still, 1 a happy wag. A rate lives in motion.js
  blink:         0.00,    // 0 open, 1 shut. Not interpolated -- see motion.js
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
  mergeMeshes:   true,    // bake each joint's static meshes down to one per material

  // tail -- every species has one, shaped by its kit. Length and droop are the silhouette;
  // stiff and zeta are the spring, per species, so a llama's stub stays stiff and a lion's rope
  // swings. See tailStep in motion.js.
  tailLength:    0.200,   // root to tip, world units
  tailThick:     0.020,
  tailDroop:    -0.90,    // resting pitch at the root: 0 straight out behind, negative hangs down
  tailCurl:      0.00,    // added pitch per segment after the first; positive curls the tip up
  tailStiff:     260,     // spring stiffness; natural frequency is sqrt(stiff) rad/s
  tailZeta:      0.35,    // under-damped on purpose: a tail that settles without swinging is a stick

  // scene
  view:          'felted',
  exposure:      0.40,
  toneMapping:   'ACES',
});

// Pose data and the maths that drives it moved to motion.js, which is pure: no three.js, so
// characters/motion.test.mjs can drive the interpolator under bare node. Re-exported here so
// every existing importer (cast.js, owl.js, the viewers) is untouched.
//
// armOut is the shoulder's outward rotation in radians: ~1.57 is straight out sideways,
// ~3.0 is overhead. Positive kneeBend takes the heel backward, which is the natural knee.
// Positive armSwing takes the arm BACKWARD, so carrying wants a small negative value: the
// upper arm stays near vertical and the elbow does the work.
export { POSES, MOTION_KEYS, REST_POSE, MOTION_DEFAULTS, BASE_MOTION_RANGES,
         motionOf, factors, walkPhase, walkLayer, walkGain, topSpeed, valueOf, velocityOf,
         phaseStep, spanBounds, strideFor,
         DANCES, DANCE_POSES, DANCE_NAMES, makeDance, stepDance,
         resetMotion } from './motion.js';
export { makeMotion, integrate, compose, POSE_KEYS };

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

// Deep enough that a shop with returning regulars does not run out. Customers accumulate on the
// roster across days and a name is never handed to a second character, so this list is consumed
// rather than cycled — see claimName in store.html.
export const NAMES = [
  'Marguerite', 'Bramble', 'Winifred', 'Otto', 'Pip', 'Hazel', 'Thistle', 'Cormac',
  'Juniper', 'Barnaby', 'Wren', 'Fennel', 'Rosalind', 'Mabel', 'Tobias', 'Clementine',
  'Rook', 'Sorrel', 'Agnes', 'Linus', 'Perpetua', 'Alder', 'Marlow', 'Bea',
  'Ivo', 'Nesta', 'Quill', 'Dorcas', 'Ambrose', 'Tamsin',
  'Bertie', 'Cressida', 'Dunstan', 'Elspeth', 'Ferdinand', 'Greta', 'Horace', 'Isolde',
  'Jasper', 'Katriona', 'Lumen', 'Merrily', 'Nolan', 'Ottoline', 'Peregrine', 'Quenby',
  'Rufus', 'Saffron', 'Tovah', 'Ursula', 'Vesper', 'Wilbur', 'Xanthe', 'Yolanda',
  'Zephyr', 'Aubrey', 'Blythe', 'Caspian', 'Delphine', 'Edwin', 'Flossie', 'Gideon',
  'Harriet', 'Inigo', 'Jemima', 'Kester', 'Lavender', 'Montague', 'Nettle', 'Orla',
  'Primrose', 'Quilla', 'Rowan', 'Seraphina', 'Tarquin', 'Una', 'Verity', 'Wendell',
  'Xenia', 'Yarrow', 'Zinnia', 'Aloysius', 'Birdie', 'Clover', 'Dilly', 'Eustace',
  'Fintan', 'Gilbert', 'Hattie', 'Idris', 'Josephine', 'Kingsley', 'Lettice', 'Mordecai',
  'Norah', 'Osric', 'Petronella', 'Quinlan', 'Rosamund', 'Silas', 'Temperance', 'Ulric',
  'Violetta', 'Wilhelmina', 'Ximena', 'Yusuf', 'Zadie', 'Archibald', 'Bluebell', 'Casimir',
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
//
// `family` marks materials that differ ONLY by colour. The merge pass collapses each family
// to one shared material and moves colour into a vertex attribute, which is what stops the
// renderer re-uploading uniforms once per character per draw.
export function feltMaterial(P, color) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: P.roughness,
    metalness: 0,
    sheen: P.sheen,
    sheenRoughness: P.sheenRoughness,
    sheenColor: new THREE.Color(P.sheenTint),
  });
  material.userData.family = 'felt';
  return material;
}

// glassy against the matte body - the contrast is what makes the eyes read
export function eyeMaterial(P, color) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: P.eyeRough,
    metalness: 0,
    sheen: P.eyeSheen,
    sheenRoughness: P.eyeSheenRough,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: P.eyeClearcoat,
    clearcoatRoughness: 0.06,
  });
  material.userData.family = 'eye';
  return material;
}

// knitted garments read crisper than the body - tighter sheen, less roughness
export function knitMaterial(color) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0,
    sheen: 1.0,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ffffff'),
  });
  material.userData.family = 'knit';
  return material;
}

// One per family for the whole cast. Cloned from the first character's material, so the
// non-colour properties still come from params -- they are not randomised, so every character
// agrees on them anyway.
const sharedMaterials = new Map();

function sharedMaterial(source) {
  // Already one for the whole cast (garments' knit, with its own shader hooks a clone would drop).
  if (source.userData.shared) return source;
  const family = source.userData.family ?? 'felt';
  if (!sharedMaterials.has(family)) {
    const shared = source.clone();
    shared.color = new THREE.Color(0xffffff);   // vertex colour multiplies this
    shared.vertexColors = true;
    shared.userData.family = family;
    shared.userData.shared = true;
    sharedMaterials.set(family, shared);
  }
  return sharedMaterials.get(family);
}

export function clearSharedMaterials() {
  for (const material of sharedMaterials.values()) material.dispose();
  sharedMaterials.clear();
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

// the character faces +Z, which puts its right side at -X
const sideName = (side) => (side < 0 ? 'right' : 'left');

const named = (node, name) => {
  node.name = name;
  return node;
};

// Marks a node as articulated. Meshes beneath one move together and can be baked into a
// single geometry; anything that rotates on its own has to stay a node of its own.
const joint = (node, name) => {
  node.userData.joint = true;
  return named(node, name);
};

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
  sides: o.sides ? Math.max(3, Math.round(o.sides)) : 0,
});

/**
 * The scallop primitive. 0 sides is the dome -- soft, and what plumage and fleece want. Three or
 * more is a faceted spike, which is what fur wants: a mane built from domes reads as wool no
 * matter how the counts are tuned, because a dome has no direction.
 *
 * Built to the same unit convention as GEO.dome -- base at y=0, tip at y=1 -- so scallopMatrix
 * places and scales it identically and `proud` goes on meaning length.
 */
const spikeGeometry = (sides) =>
  new THREE.ConeGeometry(1, 1, sides).translate(0, 0.5, 0);

// +Z is the face direction, which sits at theta = PI/2
const inFaceGap = (theta, gap) => {
  if (gap <= 0) return false;
  const delta = Math.abs(((theta - Math.PI / 2 + Math.PI) % (Math.PI * 2)) - Math.PI);
  return delta < gap * 0.5;
};

export function scallopAngles({ rows, perRow, top, bottom, stagger, skipFront }) {
  const angles = [];
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    const phi = Math.PI * (top + (bottom - top) * t);
    const offset = stagger && r % 2 ? Math.PI / perRow : 0;
    // Columns are laid out symmetrically about +Z -- the FACE -- rather than from +X. skipFront
    // cuts its gap about +Z, so a grid starting anywhere else decides which columns survive by
    // an accident of where the first one landed, and the result is not left-right symmetric at
    // ANY count. With small, numerous domes that is invisible; at perRow 3 it puts the whole
    // mane down one side of the head and looks like the shell has been rotated 90 degrees.
    const step = (Math.PI * 2) / perRow;
    for (let s = 0; s < perRow; s++) {
      const theta = Math.PI / 2 + (s + 0.5) * step + offset;
      if (!inFaceGap(theta, skipFront)) angles.push({ phi, theta });
    }
  }
  return angles;
}

/**
 * How far out along its normal a scallop base sits. On a bare shell that is the unit sphere less
 * however far `flat` sinks it.
 *
 * `inside` is an axis-aligned ellipsoid in the shell's own unit space -- the body part the shell
 * is laid over -- and with it every base sits ON that surface, along its own normal. Both ways:
 * a base that would hang out past the part is pulled in, so the shell wraps round underneath
 * instead of floating off it; and a base that would be buried is pushed out, because a buried
 * spike shows only its narrowing tip and the tips do not meet. Measured on the lion before the
 * push-out: the back of the skull was 53-72% covered where the mane had rows, and 19% on the
 * longest preset, all of it gaps between tips.
 */
function baseDistance(normal, sunk, inside) {
  if (!inside) return sunk;
  const n = [normal.x / inside.axes[0], normal.y / inside.axes[1], normal.z / inside.axes[2]];
  const c = inside.centre.map((v, i) => v / inside.axes[i]);
  // |t*n - c| = 1 in the ellipsoid's own units: a quadratic in t
  const a = n[0] ** 2 + n[1] ** 2 + n[2] ** 2;
  const b = -2 * (n[0] * c[0] + n[1] * c[1] + n[2] * c[2]);
  const k = c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - 1;
  // a shell centred OUTSIDE the part has no one surface to wrap, so leave it alone
  if (k >= 0) return sunk;
  return (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a);
}

/** Where one scallop's base sits in the shell's unit space, and which way it faces. */
function scallopBase({ phi, theta }, { size, flat, inside }) {
  const sinPhi = Math.sin(phi);
  const normal = new THREE.Vector3(sinPhi * Math.cos(theta), Math.cos(phi), sinPhi * Math.sin(theta));
  return { normal, position: normal.clone().multiplyScalar(baseDistance(normal, 1 - size * flat, inside)) };
}

/**
 * Every base of a shell, in its unit space. The SAME path the geometry is built from, which is
 * what lets a test check the bases without the geometry and still be checking the geometry.
 */
export const scallopBases = (opts) => {
  const shell = normaliseShell(opts);
  return scallopAngles(shell).map((a) => scallopBase(a, shell).position);
};

// the way hair falls, for inside.sweep: down, and somewhat back (characters face +Z)
const FLOW = new THREE.Vector3(0, -1, -0.5).normalize();

/**
 * Which way a seated scallop points: out of the part's own surface, then folded toward it.
 *
 * Not along the seating ray. That ray starts at the shell's centre, which sits wherever the
 * species put it -- the lion's is forward of and below its head's -- so from there the lower rows
 * pointed 12-16 degrees further OUT than the skull, and flared like a collar while everything
 * under them followed the head down.
 *
 * `inside.sweep` then folds a scallop from the normal toward FLOW, by that many radians on the
 * shell's LAST row, ramped linearly from nothing at its middle row. By row, not by how far down
 * the part a scallop sits: it is the shell's bottom edge that lies against the part, wherever
 * `bottom` puts that edge -- ramping by height left a short mane's last row folded by 24 degrees
 * where the same setting laid a long one's flat. The upper half, and so a crown, is untouched.
 *
 * `inside.scale` is the non-uniform scale the mesh gets AFTER this (the lion's maneTall). A normal
 * does not survive a non-uniform scale, so it is carried there by the inverse transpose, bent in
 * that space, and brought back -- or a tall mane's spikes lean off it, 10.1 degrees at maneTall 1.2.
 */
function scallopFacing(position, row, { centre: c, axes: a, scale = [1, 1, 1], sweep = 0 }) {
  const n = new THREE.Vector3(
    (position.x - c[0]) / a[0] ** 2 / scale[0],
    (position.y - c[1]) / a[1] ** 2 / scale[1],
    (position.z - c[2]) / a[2] ** 2 / scale[2],
  ).normalize();
  const fold = sweep * Math.max(0, row * 2 - 1);
  const along = FLOW.clone().addScaledVector(n, -FLOW.dot(n));
  if (fold > 0 && along.lengthSq() > 1e-6) {
    n.multiplyScalar(Math.cos(fold)).addScaledVector(along.normalize(), Math.sin(fold));
  }
  return new THREE.Vector3(n.x / scale[0], n.y / scale[1], n.z / scale[2]).normalize();
}

function scallopMatrix(angle, shell) {
  const { normal: ray, position } = scallopBase(angle, shell);
  // 0 on the first row, 1 on the last
  const row = shell.bottom > shell.top ? (angle.phi / Math.PI - shell.top) / (shell.bottom - shell.top) : 0;
  const normal = shell.inside ? scallopFacing(position, row, shell.inside) : ray;
  // A base seated on a part is no longer at the unit distance its size was worked out for --
  // touchingScallopSize spaces scallops by ANGLE, so one sitting further out needs to be bigger
  // by the same ratio to keep touching its neighbours. Without this the rows at the back of a
  // forward-pushed mane spread apart: 19% cover on the lion's longest preset became 66%, and
  // this took it to 100%. No `inside`, no change -- owl and llama shells are untouched.
  const size = shell.inside ? shell.size * position.length() : shell.size;
  const { proud } = shell;
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
// back of the shell, where theta = 3PI/2 puts the normal on -Z; the face gap is centred opposite
const BACK = Math.PI * 1.5;
const fromBack = (theta) => ((((theta - BACK) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

/**
 * A skin laid under a seated shell's scallops, over exactly the span they occupy, so the gaps
 * between them show coat colour instead of whatever the shell is laid over. `underfur` is how far
 * out it sits, as a multiple of the `inside` surface -- just past 1/seat puts it just outside the
 * part itself, clear of z-fighting.
 *
 * Bounded by the outermost row and column CENTRES rather than by top/bottom/skipFront, so it never
 * shows as a bare band past the last spikes -- beside the face gap especially, where the columns
 * flanking it sit a whole step back from the cut.
 *
 * SphereGeometry measures azimuth the other way round from scallopAngles (its x is -cos, ours is
 * +cos), so phi = PI - theta: the back is at phi = -PI/2.
 */
// widest angle one underfur quad may span, radians -- see the sag note below
const UNDERFUR_STEP = 0.2;

function underfurGeometry(shell, angles) {
  const phis = angles.map((a) => a.phi);
  const top = Math.min(...phis), bottom = Math.max(...phis);
  const culled = angles.length < shell.rows * shell.perRow;
  const half = culled ? Math.max(...angles.map((a) => Math.abs(fromBack(a.theta)))) : Math.PI;
  // Triangles are flat, so between vertices they sag inside the curve. At a fixed 24 x 10 the
  // lion's underfur sagged from 1.02 to 0.999 of the skull at maneBottom 1.0 -- through the skin,
  // so the head showed through and flickered. Capping the step at 0.2 rad holds it at 1.006.
  const across = Math.max(3, Math.ceil((half * 2) / UNDERFUR_STEP));
  const down = Math.max(1, Math.ceil((bottom - top) / UNDERFUR_STEP));
  const skin = new THREE.SphereGeometry(1, across, down, -Math.PI / 2 - half, half * 2, top, bottom - top);
  // its own copy of the part's surface, same centre, axes scaled -- scaling the seated distance
  // instead would scale it about the SHELL's centre, which is not the part's, and land it off
  // the surface by a different amount in every direction
  const surface = { centre: shell.inside.centre, axes: shell.inside.axes.map((a) => a * shell.underfur) };
  const pos = skin.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    v.multiplyScalar(baseDistance(v, 1, surface));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  skin.computeVertexNormals();
  return skin;
}

function makeScallopShell(opts) {
  const shell = normaliseShell(opts);
  const angles = scallopAngles(shell);
  if (!angles.length) return null;
  // one spike per shell, cloned per scallop and disposed here -- the MERGED result is what the
  // cache holds, so this never runs twice for the same settings
  const unit = shell.sides ? spikeGeometry(shell.sides) : GEO.dome;
  const scallops = angles.map((a) => unit.clone().applyMatrix4(scallopMatrix(a, shell)));
  if (shell.inside && shell.underfur) scallops.push(underfurGeometry(shell, angles));
  const merged = mergeGeometries(scallops, false);
  scallops.forEach((g) => g.dispose());
  if (shell.sides) unit.dispose();   // GEO.dome is shared and must outlive this
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

// How far the eye white's front pole must stand out of the skull, as a fraction of the white's
// own depth. At 0 the white is exactly tangent to the skin and nothing of it shows; this leaves a
// visible ring of white around the pupil, which is what stops the eye reading as a bare pupil
// stuck on the face.
const EYE_PROUD = 0.25;

/**
 * Where the eye sits along +Z, kept OUT of the skull. The mirror of earSeat, and the same bug.
 *
 * eyeFront is a fraction of headRadius, while the depth of skull the eye has to clear depends on
 * eyeSpread, eyeLift and the species' own head ellipsoid -- three numbers eyeFront knows nothing
 * about, so it lands in front of the skin only by luck. Measured before this, as a multiple of
 * the white's own depth: the lion's SHIPPED default sat at -0.04, fully buried, and the worst
 * randomiser corner reached -0.97 on the lion, -0.26 on the llama and -0.05 on the owl.
 *
 * Only ever pushes the eye OUT. A species that wants its eyes further forward still gets them.
 * Without a head scale, behaviour is unchanged.
 */
function eyeSeat(P, { spread, lift, front, head }) {
  if (!head) return front;
  const x = P.headRadius * spread, y = P.headRadius * lift;
  const k = 1 - (x / head[0]) ** 2 - (y / head[1]) ** 2;
  const skin = k > 0 ? head[2] * Math.sqrt(k) : 0;
  return Math.max(front, (skin - eyeWhiteDepth(P) * (1 - EYE_PROUD)) / P.headRadius);
}

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

/**
 * Eyes on the head node. Placement is species business, construction is not.
 *
 * Each eye is an articulated node so a blink can squash it. Marking it joint() rather than
 * noMerge is what keeps that cheap: joint() gives ONE merged mesh per eye on the shared,
 * vertex-coloured eye material, where noMerge would leave the white and the pupil as two
 * separate meshes on a per-character material.
 */
export function addEyes(ctx, P, opts = {}) {
  const placement = {
    spread: opts.spread ?? P.eyeSpread,
    lift: opts.lift ?? P.eyeLift,
    front: opts.front ?? P.eyeFront,
    squash: opts.squash ?? 1,
  };
  placement.front = eyeSeat(P, { ...placement, head: opts.head });
  for (const side of [-1, 1]) {
    const eye = joint(buildEye(side, P, ctx.mat, placement), `${sideName(side)}Eye`);
    ctx.head.add(eye);
    ctx.joints.eye.push({ node: eye });
  }
}

// How far out along its own direction an ear base may sit, as a fraction of the head surface.
// 1.0 would put the pivot exactly on the skin, which leaves nothing buried to hold it there.
const EAR_SEAT = 0.95;

/**
 * Where an ear base sits, kept inside the skull.
 *
 * spread/lift/back are three fractions a species picks INDEPENDENTLY, so `headRadius` times them
 * lands on the head only by luck -- push spread up and the base leaves the skull and the ear
 * floats off. Measured before this: the lion detached at earSpread 0.90 and the llama at 0.75,
 * both well inside their own sliders.
 *
 * It cannot be solved on a sphere either, because every head is an ELLIPSOID with its own
 * proportions -- the llama's is 0.80 wide where the owl's is 1.06 -- which is why the species
 * passes its headScale in rather than this guessing. Without one, behaviour is unchanged.
 */
function earSeat(P, { spread, lift, back, head }) {
  const x = P.headRadius * spread, y = P.headRadius * lift, z = P.headRadius * back;
  if (!head) return [x, y, z];
  const norm = Math.hypot(x / head[0], y / head[1], z / head[2]);
  const k = norm > EAR_SEAT ? EAR_SEAT / norm : 1;
  return [x * k, y * k, z * k];
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
  const [sx, sy, sz] = earSeat(P, { spread, lift, back, head: opts.head });

  for (const side of [-1, 1]) {
    const ear = joint(new THREE.Group(), `${sideName(side)}Ear`);
    ear.position.set(side * sx, sy, sz);
    ear.rotation.set(P.earPerk ?? 0, 0, side * -(tilt + (P.earSplay ?? 0)));
    ear.add(part(geometry, material ?? ctx.mat.body, { pos: [0, length * 0.35, 0], scale }));
    ctx.head.add(ear);
    // the shape is recorded, not just the node: a species adding to the ear (a cat's point, say)
    // has to size itself from the ear's ACTUAL half-width where it joins, and the midY/halfH
    // constants that answer that live here. Copying them into a species kit is how you get a tip
    // that ignores earWidth.
    ctx.joints.ear.push({
      node: ear, side, tilt, leaf, flatten,
      size, length, midY: length * 0.35, halfH: length * 0.5,
    });
  }
}

export const addConeEars = (ctx, P, opts) => addEars(ctx, P, { ...opts, shape: 'cone' });

// Where the tail leaves the body: this far below the torso's equator, round the back, and sunk to
// this fraction of the torso so the root is buried rather than touching.
const TAIL_BASE = 0.55;
const TAIL_SEAT = 0.9;

/**
 * A tail as a chain of rigged joints, for the kit to dress.
 *
 * The chain is shared and the look is not: `dress(node, i, len)` adds segment i's geometry, laid
 * along the node's -Z from its origin to (0, 0, -len). Every segment is a joint, so each costs one
 * draw call after merging -- a kit wants as few as still bend.
 *
 * On the CHEST, not the hips, so the root rides the spine's lean and roll and stays seated in the
 * torso; the tail spring then feels the body's sway as well as its travel.
 */
/** How high above the floor the tail leaves the body, standing. A kit sizes a hanging tail by it. */
export const tailBaseHeight = (P) => P.legHeight + P.torsoH * (1 - Math.sin(TAIL_BASE) * TAIL_SEAT);

export function addTail(ctx, P, { segments = 1, dress }) {
  const len = P.tailLength / segments;
  let parent = ctx.chest;
  for (let i = 0; i < segments; i++) {
    const node = joint(new THREE.Group(), `tail${i}`);
    if (i === 0) {
      node.position.set(0, -P.torsoH * Math.sin(TAIL_BASE) * TAIL_SEAT,
        -P.torsoD * Math.cos(TAIL_BASE) * TAIL_SEAT);
    } else {
      node.position.z = -len;
    }
    dress(node, i, len);
    parent.add(node);
    ctx.joints.tail.push({ node, rest: i === 0 ? P.tailDroop : P.tailCurl, chord: 0 });
    parent = node;
  }
  ctx.joints.tail[0].chord = tailChord(ctx.joints.tail);
}

/**
 * The pitch of the root-to-tip line in the root's own frame, which is what a wag swings ACROSS.
 *
 * Yawing about the body's vertical spins a hanging tail about its own length, and yawing about
 * the root segment's own up leaves a hooked tip -- curled up over that axis -- nearly still:
 * measured, the lion's tip moved half as far as the tail's reach. Across the chord, the whole tail
 * swings sideways whatever its shape.
 */
function tailChord(tail) {
  let y = 0, z = 0, angle = 0;
  for (let i = 0; i < tail.length; i++) {
    if (i) angle += tail[i].rest;
    y += Math.sin(angle);
    z -= Math.cos(angle);
  }
  return Math.atan2(y, -z);
}

// ---------------------------------------------------------------- arm clearance

// Elbow clearance is scanned rather than solved: folding the coat scale and the elbow radius
// into the ellipsoid test makes the closed form a quartic. Deliberately allocation-free -- it
// runs per character per frame while poses blend.

// minArmOut's frame, refilled on every call rather than returned fresh: it runs per frame.
const _arm = { a: 0, b: 0, c: 0, reach: 0, x0: 0, y0: 0, cs: 0, sn: 0 };

/** The body ellipsoid the elbow must clear, padded by the arm; the shoulder; the swing. */
function armFrame(P, bulge, armSwing) {
  const coat = 1 + bulge;   // the coat surface is exactly this multiple of the torso
  const pad = P.limbThick * 1.05 * LIMB_TAPER + (P.armClearance ?? 0);
  _arm.a = coat * P.torsoW + pad;
  _arm.b = coat * P.torsoH + pad;
  _arm.c = coat * P.torsoD + pad;
  _arm.reach = P.upperArmLen;
  _arm.x0 = P.torsoW * (P.shoulderOut + bulge);
  _arm.y0 = P.torsoH * P.shoulderLift;
  _arm.cs = Math.cos(armSwing);
  _arm.sn = Math.sin(armSwing);
  return _arm;
}

/**
 * The smallest armOut that keeps the elbow outside the body, coat included.
 * 24 samples over a quarter turn is well inside the precision a resting pose needs.
 */
export function minArmOut(P, bulge = 0, armSwing = 0) {
  const { a, b, c, reach, x0, y0, cs, sn } = armFrame(P, bulge, armSwing);

  // Interpolated between the bracketing samples rather than returned as the first failing
  // sample. Returning the index made this a STAIRCASE in armSwing, which was invisible while
  // armSwing only moved during a 0.35s blend and chatters visibly once a walk cycle swings the
  // arm every frame. Only llamas notice -- they are the species with clampArmOut on.
  let prev = 0;
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (Math.PI / 2);
    const down = Math.cos(t) * reach;
    const x = (x0 + Math.sin(t) * reach) / a;
    const y = (y0 - down * cs) / b;
    const z = (down * sn) / c;
    const d = x * x + y * y + z * z;                    // linear crossing of the d = 1 surface
    if (d > 1) return i === 0 ? 0 : t - (Math.PI / 48) * ((d - 1) / (d - prev));
    prev = d;
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

// The walk layer's swing-leg knee lift, rectified onto one side. walkLayer emits a single
// cosine; each leg takes the half of it that is positive for that side, so the swing leg flexes
// and the stance leg stays dead straight. Both lowestFoot and applyPose must use it or the
// character is grounded on a leg length it is not actually standing on.
const swingKnee = (pose, side) => Math.max(0, side * (pose.kneeSwing ?? 0));

// The 55/45 split of the leg chain. Three things need it -- building the leg, grounding the
// character, and placing a seated one on a chair -- so it is written down once rather than
// three times, which is how the first two came to hold the same magic number separately.
export const femurOf = (P) => (P.legHeight + P.hipInset) * 0.55;

/**
 * Where along a chair a seated body's HIPS go, from the chair's centre toward its front (+).
 *
 * FROM THE FEMUR, not from a fraction of the chair. When you sit, your thighs lie along the
 * cushion: your knees are at the front edge and your hips are one thigh-length behind them. So the
 * offset is half the chair's depth minus the femur, and it falls out of the body rather than being
 * tuned — a flat fraction sat the llama with its knees in mid-air and the owl on the back edge.
 *
 * Clamped at the back edge, because a thigh longer than the seat is a real case -- the leggiest
 * llamas have one -- and the answer there is to perch on the back of the cushion rather than to
 * hover off the end of it.
 */
export const seatedHipsAlong = (P, chairW) => Math.max(-chairW * 0.45, chairW / 2 - femurOf(P));

/** Every node inside a limb -- arms, legs, tail -- which hang past a seat rather than rest on it. */
function limbNodes(joints) {
  const limbs = new Set();
  for (const j of [...joints.upperArm, ...joints.upperLeg, ...joints.tail.slice(0, 1)]) {
    j.node.traverse((n) => limbs.add(n));
  }
  return limbs;
}

const _rest = new THREE.Vector3();

/**
 * World y of the lowest point of the body that RESTS on a seat, in whatever pose it is in now.
 *
 * Per VERTEX, through the skin, and that is the whole fix for the shop's hovering sitters. This
 * used to be a walk of `spine`'s subtree taking each mesh's bounding box, written before
 * mergeCharacter skinned every joint into one mesh per material hung on the HIPS: merged -- which
 * the shop always is -- there was not one mesh left under the spine, the walk found nothing, the
 * drop came out 0, and the seat put the FEET on the cushion. Measured: every species 80-410mm in
 * the air. A merged mesh holds the legs too, so limbs can only be told apart vertex by vertex, by
 * the bone each one rides. It also retires the bounding boxes, whose corners hang below a tilted
 * ellipsoid and sat even the unmerged rig ~20mm proud.
 */
export function lowestResting(built) {
  built.root.updateMatrixWorld(true);
  const limbs = limbNodes(built.joints);
  let lowest = Infinity;
  built.root.traverse((m) => {
    if (!m.isMesh || limbs.has(m)) return;
    const skin = m.isSkinnedMesh ? m.geometry.attributes.skinIndex : null;
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      if (skin && limbs.has(m.skeleton.bones[skin.getX(i)])) continue;
      lowest = Math.min(lowest, m.getVertexPosition(i, _rest).applyMatrix4(m.matrixWorld).y);
    }
  });
  return lowest;
}

export const tibiaOf = (P) => (P.legHeight + P.hipInset) * 0.45;

function buildLeg(side, P, mat, joints) {
  const [thigh, shin] = [femurOf(P), tibiaOf(P)];
  const upperLeg = joint(new THREE.Group(), `${sideName(side)}UpperLeg`);
  upperLeg.position.set(side * P.legSpread, P.hipInset, 0);
  upperLeg.rotation.x = P.legSwing * side - P.hipFlex;
  limbSegment(upperLeg, mat.body, P.limbThick, thigh, false);   // hip sits inside the torso
  joints.upperLeg.push({ node: upperLeg, side });

  const lowerLeg = joint(new THREE.Group(), `${sideName(side)}LowerLeg`);
  lowerLeg.position.y = -thigh;
  lowerLeg.rotation.x = kneeAmount(P.kneeBend, P.legSwing, side);
  limbSegment(lowerLeg, mat.body, P.limbThick * LIMB_TAPER, shin);
  const foot = buildFoot(shin, mat, side);
  lowerLeg.add(foot);
  upperLeg.add(lowerLeg);
  joints.lowerLeg.push({ node: lowerLeg, side });
  joints.foot.push({ node: foot, side });
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
  const hold = joint(new THREE.Group(), `${sideName(side)}Hold`);
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
  const upperArm = joint(new THREE.Group(), `${sideName(side)}UpperArm`);
  upperArm.position.set(side * P.torsoW * (P.shoulderOut + bulge), P.torsoH * P.shoulderLift, 0);
  upperArm.rotation.set(P.armSwing, 0, side * clampArmOut(P, bulge, P.armOut, P.armSwing));
  limbSegment(upperArm, mat.body, upperR, P.upperArmLen);
  joints.upperArm.push({ node: upperArm, side });

  const lowerArm = joint(new THREE.Group(), `${sideName(side)}LowerArm`);
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
  held.userData.noMerge = true;   // toggled at runtime, so it must survive mergeCharacter intact
  return held;
}

function attachArms(chest, P, { mat, joints, addMaterial, bulge }) {
  const arms = [-1, 1].map((side) => buildArm(side, P, mat, joints, bulge));
  arms.forEach(({ upperArm }) => chest.add(upperArm));
  const held = buildHeldItem(P, addMaterial);
  arms[0].hold.add(held);
  return { held, holds: arms.map(({ hold }) => hold) };
}

// Length is real even when hidden: a multiplier on a near-zero neck stays near-zero, which is
// what would make a long-necked species impossible to express.
function buildNeck(P, mat) {
  const neck = joint(new THREE.Group(), 'neck');
  neck.position.y = P.torsoH - P.headOverlap;
  // YXZ, not the default XYZ: XYZ applies pitch before yaw, which injects a parasitic roll into
  // a head that is both turned and tilted down. Costs nothing -- Euler.set without an order
  // argument keeps whatever order the node already has.
  neck.rotation.order = 'YXZ';
  neck.add(part(GEO.cyl, mat.body, {
    scale: [P.neckThick, P.neckLength, P.neckThick],
    pos: [0, P.neckLength / 2, 0],
  }));
  return neck;
}

// the node only - head geometry belongs to the species kit
function buildHeadNode(P) {
  const head = joint(new THREE.Group(), 'head');
  head.position.y = P.neckLength + P.headRadius * 0.62;
  head.rotation.order = 'YXZ';
  return head;
}

// spine pivots at the waist plane, so a lean folds the whole upper body rather than shearing it
function buildUpperBody(P, mat, joints, addMaterial, bulge) {
  const spine = joint(new THREE.Group(), 'spine');
  spine.rotation.x = P.spineBend;
  const chest = buildChest(P, mat);
  spine.add(chest);

  const { held, holds } = attachArms(chest, P, { mat, joints, addMaterial, bulge });
  const neck = buildNeck(P, mat);
  const head = buildHeadNode(P);
  neck.add(head);
  chest.add(neck);

  Object.assign(joints, { spine, chest, neck, head });
  return { spine, chest, neck, head, held, holds };
}

function buildBody(P, mat, joints, addMaterial, bulge) {
  const root = named(new THREE.Group(), 'root');
  const hips = joint(new THREE.Group(), 'hips');
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
  const addMaterial = (m) => { materials.push(m); return m; };
  const mat = baseMaterials(P, addMaterial);
  const joints = {
    hips: null, spine: null, chest: null, neck: null, head: null,
    upperArm: [], lowerArm: [], upperLeg: [], lowerLeg: [], foot: [], ear: [], eye: [], tail: [],
  };
  const bulge = Math.max(0, kit.coatBulge?.(P) ?? 0);
  const body = buildBody(P, mat, joints, addMaterial, bulge);

  // Seeded from the pose the rig was BUILT in, with zero velocity, so frame 1 has no error to
  // correct and a spawning character cannot lurch. groundOffset is what the seat lift and the
  // arrival tween write into, now that grounding owns root.y absolutely every frame.
  //
  // POSES.rest, not P. Params are not a pose: they carry armOut (0.16, which matches by
  // coincidence) but no elbowBend, so seeding from them started every character with dead
  // straight arms and sprang them to the 0.22 resting bend over the first third of a second --
  // precisely the lurch the line above promises there will not be. Params double as a pose in
  // species-checker, which is what made this look right.
  const ctx = { ...body, joints, materials, mat, addMaterial, params: P, species: kit, bulge,
                // How far below the root this body's backside sits in the sit pose. Filled in by
                // whoever seats characters (the store measures it once at spawn); 0 means the
                // root itself, which is what a viewer with no chairs wants.
                motion: makeMotion(POSES.rest), groundOffset: 0, seatDrop: 0 };
  kit.buildKit(ctx, P);
  if (!P.partShadows) disableShadowCasting(body.root);
  if (P.mergeMeshes !== false) mergeCharacter(ctx);
  // Seed the pose through applyPose rather than leaving each build function to set its own
  // joint from P. The build functions still do (buildArm sets P.armSwing, buildUpperBody sets
  // P.spineBend), but they only know the channels that existed when they were written -- which
  // is why a newly added channel silently did nothing in species-checker.html, whose sliders
  // REBUILD rather than re-pose. One path for build and runtime, so the two cannot drift again.
  applyPose(ctx, P);
  return ctx;
}

// ---------------------------------------------------------------- mesh merging
//
// Draw calls per character are the measured bottleneck, not triangles. Every static mesh is baked
// into one rigidly skinned geometry per material family, each vertex following its own joint -- so
// a character (clothes included) is ~3 draws, with no change to the rig, the poses or the species
// kits. The skin's price is a skinned vertex shader and one bone texture a character.
//
// The cost is per-character geometry, which cannot be shared between characters. That trade
// only pays while draw submission dominates, so it stays switchable.

/** Every mesh under `node` that is not inside a nested joint. */
function staticMeshes(node, out = []) {
  for (const child of node.children) {
    // A subtree the game shows and hides at runtime is NOT static, whatever it looks like from
    // here. Merging bakes it into the joint's single mesh, after which setting `.visible` on the
    // group changes nothing on screen — the held item stayed in every NPC's fist for good.
    if (child.userData.noMerge) continue;
    if (child.isMesh) out.push(child);
    else if (!child.userData.joint) staticMeshes(child, out);
  }
  return out;
}

// geometry expressed in the joint's own space, so the merged mesh lands where the parts were
// `userData.dropOnMerge`: attributes that only mean anything in the mesh's own space and skeleton
// (a garment's arm capsules) -- baked, they would point at whatever bone took their number.
function bakedGeometry(mesh, toJointSpace) {
  const local = new THREE.Matrix4().multiplyMatrices(toJointSpace, mesh.matrixWorld);
  const geometry = mesh.geometry.clone().applyMatrix4(local);
  for (const name of mesh.userData.dropOnMerge ?? []) geometry.deleteAttribute(name);
  return paintGeometry(geometry, mesh.material.color);
}

// colour moves from the material to the vertices, which is what lets one material serve the
// whole cast instead of one per character per part
function paintGeometry(geometry, color) {
  if (geometry.attributes.color) return geometry;   // painted already: a garment's colourwork
  const { count } = geometry.attributes.position;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergedMesh({ parts, shadow, material }) {
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  // `geo`, not `part`: the module exports a part() factory and shadowing it here reads as if
  // this were disposing rig parts rather than the geometries that were just merged.
  if (parts.length > 1) parts.forEach((geo) => geo.dispose());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.userData.merged = true;   // per-character geometry, so disposal has to free it
  return mesh;
}

/** A mesh baked into a merged one leaves the rig; a garment's geometry is its own, so it goes too. */
function unmerge(mesh) {
  mesh.removeFromParent();
  if (mesh.userData.garment) mesh.geometry.dispose();
}

/**
 * Every joint, skinned together onto the topmost (the hips). Each joint was a mesh per material
 * family of its own: 14-20 draws a character, and ~4 more dressed. Skinned, each vertex follows its
 * own joint at full weight, so every limb, the head, the tail still move and the eyes still blink
 * (the rig poses the joints; the skeleton reads them), and the whole character is one mesh per
 * family -- felt, eye, garment.
 */
function skinnedJoints(root) {
  const joints = [];
  root.traverse((node) => { if (node.userData.joint) joints.push(node); });
  return joints;
}

/**
 * Every static mesh of every bone, baked into the root's space and grouped by material family. A
 * part follows its own bone -- or, skinned already (a scarf that bends from the chest up round the
 * neck), keeps its own weights on the same joints here: a joint that is not a bone (the chest) is
 * the bone it rides.
 */
function skinnedGroups(bones, toRoot) {
  const groups = new Map();
  const boneOf = (node) => {
    for (let n = node; n; n = n.parent) if (bones.includes(n)) return bones.indexOf(n);
    return 0;
  };
  bones.forEach((bone, index) => {
    if (!bone.visible) return;   // an eye under a hat stays hidden, and unmerged
    const meshes = staticMeshes(bone);
    for (const mesh of meshes) {
      const family = mesh.material.userData.family ?? 'felt';
      if (!groups.has(family)) groups.set(family, { parts: [], shadow: mesh.castShadow, material: sharedMaterial(mesh.material) });
      groups.get(family).parts.push(skinnedPart(mesh, toRoot, index, boneOf));
    }
    meshes.forEach(unmerge);
  });
  return groups;
}

/** One mesh baked for the skin: following bone `index`, or its own skeleton's bones mapped here. */
function skinnedPart(mesh, toRoot, index, boneOf) {
  const geo = bakedGeometry(mesh, toRoot);
  if (mesh.isSkinnedMesh) remapSkin(geo, mesh.skeleton.bones.map(boneOf));
  else rigidTo(geo, index);
  return geo;
}

/** A skinned part's bone indices, through `to`: its skeleton's bone i is bone to[i] here. */
function remapSkin(geo, to) {
  const index = geo.attributes.skinIndex.array;
  for (let i = 0; i < index.length; i++) index[i] = to[index[i]];
}

/** One rigidly skinned mesh per material family for `bones`' static meshes, hung on the first bone. */
function skinAt(bones) {
  const [root] = bones;
  const groups = skinnedGroups(bones, new THREE.Matrix4().copy(root.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(bones);   // bind inverses from the pose it is built in
  for (const entry of groups.values()) {
    const merged = mergedMesh(entry);
    const mesh = new THREE.SkinnedMesh(merged.geometry, merged.material);
    Object.assign(mesh, { castShadow: merged.castShadow, receiveShadow: merged.receiveShadow });
    mesh.userData.merged = true;
    root.add(mesh);
    mesh.bind(skeleton, root.matrixWorld);
  }
}

/** Every vertex of `geo` follows bone `index` alone. */
function rigidTo(geo, index) {
  const n = geo.attributes.position.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    skinIndex[i * 4] = index;
    skinWeight[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
}

/** Collapses every joint's static meshes into one skinned mesh per material family. */
export function mergeCharacter(built) {
  built.root.updateMatrixWorld(true);
  const skinned = skinnedJoints(built.root);
  if (skinned.length) skinAt(skinned);
}

// the foot sphere sits at y +0.016 with a y radius of 0.028, so its sole is this far below
// the foot node's own origin
const FOOT_SOLE = 0.012;

// Height of the lower foot above the root, derived from the leg chain rather than measured.
// Only hip and knee rotation affect it, and both are known -- so this needs no matrices.
function lowestFoot(P, pose) {
  const total = P.legHeight + P.hipInset;
  const thigh = femurOf(P);
  const shin = tibiaOf(P);
  let lowest = Infinity;

  for (const side of [-1, 1]) {
    const hip = pose.legSwing * side - (pose.hipFlex ?? 0);
    const knee = hip + kneeAmount(pose.kneeBend, pose.legSwing, side) + swingKnee(pose, side);
    const y = total - Math.cos(hip) * thigh - Math.cos(knee) * shin;
    if (y < lowest) lowest = y;
  }
  return lowest;
}

/**
 * Drops the character so its feet rest on y = 0.
 *
 * Runs every frame while poses blend, so it is pure arithmetic. Measuring instead -- a world
 * matrix pass plus a bounding box walk over every mesh -- cost far more frame time than the
 * correction it was making.
 */
export function groundCharacter(built, pose = built.params) {
  const y = (built.groundOffset ?? 0) + FOOT_SOLE - lowestFoot(built.params, pose);
  if (Number.isFinite(y)) built.root.position.y = y;
}

/**
 * A look starts in the neck and finishes in the head. How much starts there is DERIVED from the
 * neck's own length, not a constant -- still no kit knowledge, so "kits may ADD or SCALE, never
 * REPLACE" holds, and a new species gets the right answer by setting `neckLength` alone.
 *
 * It was a flat 0.35, and the result was backwards. Measured over four simulated minutes of
 * idling: the owl's 0.10 stub rotated 7.9 degrees in yaw and the llama's 0.38 neck rotated 6.5.
 * The long, obviously flexible neck was the STIFFER of the two, because both took the same
 * fraction of an arc the owl happens to author wider. A long neck should do most of the turning
 * -- that is what it is for, and it is what a llama or a goose actually does.
 *
 * Total is always 1, so the head still ends up pointing where it was asked to look; only the
 * split between the two joints changes. Zero new nodes: both joints already exist and are
 * already written every frame.
 */
function neckShare(P) {
  const len = P.neckLength ?? 0.1;
  return Math.max(0.20, Math.min(0.72, 0.20 + 1.3 * len));
}

/**
 * HEAD STABILISATION, and it is why a llama neck read as a physics error.
 *
 * The neck is a child of the spine, so every degree the torso rolls is a degree the neck rolls,
 * multiplied by how far up the head sits. Measured while walking at the authored sway: the
 * llama's head swung 112mm side to side per step, 11% of its own height. Nothing about the neck
 * was wrong -- it was faithfully riding a torso that was doing exactly what it was told.
 *
 * Real long-necked animals do the opposite of that. A walking chicken, crane or camelid holds
 * its head almost fixed in space while the body sways underneath: the neck counter-rotates. It
 * is the single most recognisable thing about how they move, and it is free here because the
 * joint is already being written.
 *
 * Scaled by neck length, so a stub barely does it and a llama mostly does -- which is both what
 * is true and what the lever arm allows.
 *
 * ROLL ONLY, deliberately. Pitch carries posture -- `attend` leans a focused character in, and
 * POSES.browse leans in to look at the goods -- and a neck that cancelled pitch would undo the
 * very gesture those exist to make. Roll has no posture on it: it is sway and weight shift,
 * both purely oscillating, which is exactly what a stabiliser should cancel.
 */
function neckStabilise(P) {
  return Math.min(0.75, 1.6 * (P.neckLength ?? 0.1));
}

/**
 * Arms and legs.
 *
 * armSwingAlt is subtracted PER SIDE, so positive armSwingAlt is contralateral to positive
 * legSwing -- the direction a walk needs the arms to go. armSwing alone moves both arms
 * together, which is why the walk could not be expressed without a second channel.
 */
function applyLimbs(joints, pose, out) {
  const alt = pose.armSwingAlt ?? 0;
  for (const { node, side } of joints.upperArm) {
    node.rotation.set(pose.armSwing - side * alt, 0, side * out[side > 0 ? 0 : 1]);
  }
  for (const { node } of joints.lowerArm) node.rotation.x = -pose.elbowBend;
  for (const { node, side } of joints.upperLeg) {
    node.rotation.x = pose.legSwing * side - (pose.hipFlex ?? 0);
  }
  for (const { node, side } of joints.lowerLeg) {
    node.rotation.x = kneeAmount(pose.kneeBend, pose.legSwing, side) + swingKnee(pose, side);
  }
}

/** Head rotation and blink. Split out of applyPose only to keep it under the line limit. */
function applyHead(joints, pose, P) {
  // Clamped to the species' anatomy, OUTPUT ONLY -- never written back into the interpolator,
  // for the same reason clampArmOut is not: a clamp that feeds back ratchets.
  const lim = P.headYawMax ?? 1.40;
  const yaw = Math.max(-lim, Math.min(lim, pose.headYaw ?? 0));
  const pitch = pose.headPitch ?? 0, tilt = pose.headTilt ?? 0;
  const neck = neckShare(P);
  const head = 1 - neck;
  // The neck's own motion, on top of its share of the look. A long neck that only ever moves as
  // a rigid extension of the head reads as a broom handle; this is the soft S-curve at the
  // base. It is a NECK-only channel -- the head counter-rotates by the same amount, so a
  // character glancing at a shelf still ends up looking at the shelf.
  const curve = pose.neckCurve ?? 0;
  // The neck is a CHILD of the spine, so a local +roll here cancels that fraction of the
  // parent's -roll and the head stays put while the body sways under it.
  const steady = (pose.spineRoll ?? 0) * neckStabilise(P);
  if (joints.neck) {
    joints.neck.rotation.set(pitch * neck + curve, yaw * neck, -tilt * neck + steady);
  }
  if (joints.head) {
    joints.head.rotation.set(pitch * head - curve, yaw * head, -tilt * head);
  }
  // ponytail: a blink is a y-squash of the whole eye about its centre, so it reads as a squint
  // rather than a lid coming down. Upgrade path is a lid disc under the eye joint, if it ever
  // matters at play distance -- at ~150px tall it does not.
  const lid = 1 - (pose.blink ?? 0);
  for (const { node } of joints.eye) node.scale.y = lid;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const _tailQX = new THREE.Quaternion(), _tailQY = new THREE.Quaternion();

/**
 * The tail's angles along the chain. The ROOT takes the whole root angle from tailStep, so lifting,
 * tucking and wagging move the tail from its base as a tail does; the segments after it share out
 * only how far the tip LAGS the root, so a trailing tip is a curve down the tail rather than a kink
 * at the end. Without tailStep (a static pose) the tip is the root and the tail is simply held.
 */
function applyTail(tail, pose) {
  const n = tail.length;
  if (!n) return;
  // A raw pose -- a POSES entry, or params in the checker -- has only the commanded lift; compose is
  // what turns that into a target, so without it the lift is the angle.
  const yaw = pose.tailYaw ?? 0, pitch = pose.tailPitch ?? pose.tailLift ?? 0;
  const lagYaw = n > 1 ? ((pose.tailYawTip ?? yaw) - yaw) / (n - 1) : 0;
  const lagPitch = n > 1 ? ((pose.tailPitchTip ?? pitch) - pitch) / (n - 1) : 0;
  // The root: pitched to the chord, yawed across it, then pitched back. See tailChord.
  const { node, rest, chord } = tail[0];
  node.quaternion.setFromAxisAngle(X_AXIS, rest + pitch + chord)
    .multiply(_tailQY.setFromAxisAngle(UP, yaw))
    .multiply(_tailQX.setFromAxisAngle(X_AXIS, -chord));
  for (let i = 1; i < n; i++) tail[i].node.rotation.set(tail[i].rest + lagPitch, lagYaw, 0);
}

// One reused output object for the whole cast: applyPose consumes it synchronously, so one is
// enough, and a fresh object per character per frame is real GC pressure at 40 characters.
//
// kneeSwing and neckCurve are NOT in POSE_KEYS -- they are derived by the layers rather than
// interpolated -- so they have to be listed by hand, and the seal is what makes forgetting them
// loud instead of silent. They were forgotten: compose() threw
// "Cannot add property kneeSwing, object is not extensible" on its first call, which means
// stepMotion has never once executed. Nothing called it, so nothing noticed.
//
// The seal earns its keep here rather than merely documenting: unsealed, the missing keys would
// have been added at runtime and the only symptom would have been a march that never marched
// and a neck that never curved, on a rig where both look plausible.
const _out = Object.seal(Object.fromEntries(
  [...POSE_KEYS.map((k) => [k, 0]),
    ['holdItem', false], ['blink', 0], ['kneeSwing', 0], ['neckCurve', 0],
    ['tailYaw', 0], ['tailPitch', 0], ['tailYawTip', 0], ['tailPitchTip', 0]],
));

/** Re-poses an existing character without rebuilding it. */
export function applyPose(built, pose) {
  const { joints, held, params, bulge = 0 } = built;
  // Per side, because armOutAlt raises one arm and drops the other: one clamp for both would
  // either let the low arm through the body or lift it back to symmetry, and both look like bugs.
  // [left, right] -- the loop in applyLimbs indexes it by side.
  const alt = pose.armOutAlt ?? 0;
  const out = [
    clampArmOut(params, bulge, pose.armOut + alt, pose.armSwing),
    clampArmOut(params, bulge, pose.armOut - alt, pose.armSwing),
  ];
  applyLimbs(joints, pose, out);
  // Roll lives on the SPINE, not the hips: lowestFoot derives grounding from hip and knee
  // angles alone, so rolling the hips would lift one foot off the floor and sink the other with
  // grounding none the wiser. Above the waist the legs are untouched and grounding stays exact.
  if (joints.spine) {
    joints.spine.rotation.set(pose.spineBend ?? 0, pose.spineTwist ?? 0, -(pose.spineRoll ?? 0));
  }
  // resting tilt belongs to the species, so the pose adds to it rather than replacing it
  for (const { node, side, tilt } of joints.ear) {
    node.rotation.set(pose.earPerk ?? 0, 0, side * -(tilt + (pose.earSplay ?? 0)));
  }
  applyHead(joints, pose, params);
  applyTail(joints.tail, pose);
  if (held && pose.holdItem !== undefined) held.visible = Boolean(pose.holdItem);
  groundCharacter(built, pose);
}

const tailSpring = (P) => ({
  stiff: P.tailStiff, zeta: P.tailZeta, reach: P.tailLength, droop: P.tailDroop,
});

/**
 * Advances one character's motion by `dt` and applies it. The whole per-frame path.
 *
 * Lives here rather than in motion.js because it calls applyPose, and motion.js must stay
 * free of three.js so the self-check can run under bare node.
 *
 * `add` is the walk layer, summed AFTER the interpolator and never fed back into it -- see the
 * invariant at the top of motion.js. Grounding therefore sees the composed legs, which is why
 * there is exactly one applyPose call and not one per layer.
 */
export function stepMotion(built, target, dt, opts, add) {
  integrate(built.motion, target, dt, opts);
  compose(_out, built.motion, opts);
  if (add) add(_out);
  applyPose(built, _out);
  // AFTER applyPose, so the tail base is measured where this frame's body put it -- then the tail
  // alone is posed again from its spring. Posing it twice is three rotations; measuring before
  // would read last frame's spine against this frame's root.
  if (built.joints.tail.length) {
    tailStep(built.motion, _out, tailAcceleration(built, dt), dt, tailSpring(built.params));
    applyTail(built.joints.tail, _out);
  }
  return _out;
}

// Faster than anything walks or dances: a jump bigger than this in one frame is a TELEPORT -- a
// spawn, a slot reset, the lab snapping a character home -- and differentiating it would fling
// the tail. Measured top honest walk is ~1.5 units/s.
const TAIL_TELEPORT = 6;
const _tailAt = new THREE.Vector3(), _tailV = new THREE.Vector3(), _tailQ = new THREE.Quaternion();
const _tailA = [0, 0, 0];

/**
 * The tail base's acceleration in the chest's frame, by differencing its world position.
 *
 * World position rather than anything the pose knows, because whoever owns the root moves it --
 * cast.js walks and turns it, a dance spins it, a hop lifts it -- and none of that is in the pose.
 * Differencing catches all of it with no one having to report it.
 */
function tailAcceleration(built, dt) {
  const root = built.joints.tail[0].node;
  root.getWorldPosition(_tailAt);
  _tailA.fill(0);
  if (!(dt > 1e-4)) return _tailA;
  // No velocity until there are two real positions, and no acceleration until two real velocities.
  // Priming either with zero reads a character that spawns already walking as one that went from
  // standing to walking speed in a single frame -- which threw every tail at the door.
  const track = (built.tailTrack ??= { at: null, vel: null });
  const v = track.at && _tailV.subVectors(_tailAt, track.at).divideScalar(dt);
  track.at = (track.at ?? new THREE.Vector3()).copy(_tailAt);
  if (!v || v.length() > TAIL_TELEPORT) {
    track.vel = null;
    return _tailA;
  }
  if (track.vel) {
    track.vel.sub(v).multiplyScalar(-1 / dt)   // (v - vPrev) / dt, in place
      .applyQuaternion(root.parent.getWorldQuaternion(_tailQ).invert()).toArray(_tailA);
  }
  track.vel = (track.vel ?? new THREE.Vector3()).copy(v);
  return _tailA;
}

/** Swaps every mesh to grey or flat black for the shape and silhouette checks. */
export function setViewMode(root, mode) {
  const override = { grey: greyMat, silhouette: blackMat }[mode];   // felted: none
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.felt ??= o.material;
    o.material = override ?? o.userData.felt;
  });
}

export function disposeCharacter(built) {
  // shared materials outlive the character that first created them
  for (const material of built.materials) {
    if (!material.userData.shared) material.dispose();
  }
  built.root.traverse((o) => {
    if (o.isMesh && o.userData.merged) o.geometry.dispose();
    o.skeleton?.dispose();   // its bone texture; shared by a character's skinned meshes, and safe twice
  });
}

// ---------------------------------------------------------------- randomisation

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Applies ranges onto a params object, in place. Counts stay whole. */
export function applyRanges(P, ranges) {
  for (const [key, [a, b]] of Object.entries(ranges)) P[key] = round3(rand(a, b));
  return P;
}

/**
 * Shared randomised identity. Species add their own on top.
 * @param {Record<string, any>} P
 * @param {Record<string, number[]>} [ranges] any subset of the range table -- a species may leave
 *   keys out that it draws itself, as the lion does for its body and arm size
 */
export function randomiseBase(P, ranges = BASE_RANDOM_RANGES) {
  applyRanges(P, ranges);
  P.bodyColor = randomFur();
  P.heldColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.name = pick(NAMES);
  return P;
}

// randomised outside the range table, so they have to be listed explicitly
export const SHARED_RANDOM_KEYS = ['bodyColor', 'heldColor'];

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
    ['spineBend', -0.7, 1.2], ['spineRoll', -0.8, 0.8],
    ['earPerk', -1.2, 1.2], ['earSplay', -0.8, 1.2],
    ['armSwingAlt', -1.0, 1.0], ['armOutAlt', -1.5, 1.5], ['spineTwist', -1.2, 1.2],
    ['headYaw', -5.0, 5.0], ['headPitch', -0.9, 0.9], ['headTilt', -0.8, 0.8],
    ['tailLift', -1.2, 1.2], ['tailWag', 0, 1.5],
    ['blink', 0, 1],
    ['holdItem', 'bool'],
  ],
  rig: [
    ['hipInset', 0.0, 0.14], ['legSpread', 0.02, 0.20], ['limbThick', 0.012, 0.070],
    ['upperArmLen', 0.03, 0.20], ['forearmLen', 0.03, 0.20],
    ['shoulderOut', 0.4, 1.6], ['shoulderLift', -0.2, 0.9],
    ['clampArmOut', 'bool'], ['armClearance', 0, 0.03],
    ['headYawMax', 0.4, 5.0],
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
  tail: [
    ['tailLength', 0.04, 0.50], ['tailThick', 0.006, 0.06],
    ['tailDroop', -1.6, 1.2], ['tailCurl', -0.8, 0.8],
    ['tailStiff', 60, 800], ['tailZeta', 0.1, 1.2],
  ],
});
