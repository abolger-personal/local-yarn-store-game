import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMotion, integrate, compose, tailStep, POSE_KEYS, POSES } from './motion.js';

export const BUILD = '2026-09-26.8-tails';

const SPECIES = new Map();

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

export const TONE_MAPPING = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  None: THREE.NoToneMapping,
};

export const BASE_PARAMS = Object.freeze({
  name:          'Character',

  headRadius:    0.171,
  headOverlap:   0.099,
  neckLength:    0.100,
  neckThick:     0.075,
  torsoW:        0.210,
  torsoH:        0.193,
  torsoD:        0.215,
  legHeight:     0.193,

  hipInset:      0.045,
  legSpread:     0.085,
  limbThick:     0.034,
  upperArmLen:   0.092,
  forearmLen:    0.082,
  shoulderOut:   0.82,
  shoulderLift:  0.30,
  clampArmOut:   false,
  armClearance:  0.006,

  armSwing:      0.00,
  armOut:        0.16,
  elbowBend:     0.00,
  legSwing:      0.00,
  kneeBend:      0.00,
  hipFlex:       0.00,
  spineBend:     0.00,
  spineRoll:     0.00,
  earPerk:       0.00,
  earSplay:      0.00,
  armSwingAlt:   0.00,
  armOutAlt:     0.00,
  spineTwist:    0.00,
  headYaw:       0.00,
  headYawMax:    1.40,
  headPitch:     0.00,
  headTilt:      0.00,
  tailLift:      0.00,
  tailWag:       0.00,
  blink:         0.00,
  holdItem:      false,
  heldColor:     '#7a9e6b',

  eyeRadius:     0.084,
  eyeSpread:     0.389,
  eyeLift:       0.12,
  eyeFront:      0.72,
  pupilScale:    0.46,
  pupilDepth:    0.012,
  eyeColor:      '#f6f0e4',
  pupilColor:    '#241a15',
  eyeSheen:      1.00,
  eyeSheenRough: 0.08,
  eyeRough:      0.22,
  eyeClearcoat:  0.70,

  bodyColor:     '#a0a6ba',
  footColor:     '#e0a53c',
  sheen:         0.34,
  sheenRoughness:0.21,
  sheenTint:     '#c9a892',
  roughness:     1.00,

  partShadows:   true,
  mergeMeshes:   true,

  tailLength:    0.200,
  tailThick:     0.020,
  tailDroop:    -0.90,
  tailCurl:      0.00,
  tailStiff:     260,
  tailZeta:      0.35,

  view:          'felted',
  exposure:      0.40,
  toneMapping:   'ACES',
});

export { POSES, MOTION_KEYS, REST_POSE, MOTION_DEFAULTS, BASE_MOTION_RANGES,
         motionOf, factors, walkPhase, walkLayer, walkGain, topSpeed, valueOf, velocityOf,
         phaseStep, spanBounds, strideFor,
         DANCES, DANCE_POSES, DANCE_NAMES, makeDance, stepDance,
         resetMotion } from './motion.js';
export { makeMotion, integrate, compose, POSE_KEYS };

// BODIES.md §Randomisation: tier 1 ±50%, tier 2 ±15%
export const BASE_RANDOM_RANGES = Object.freeze({
  legHeight:   [0.085, 0.345],
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

// BODIES.md §Colour
export const FUR_MODES = [
  { weight: 45, sat: [0.06, 0.26], light: [0.22, 0.78] },
  { weight: 35, sat: [0.26, 0.52], light: [0.32, 0.62] },
  { weight: 20, sat: [0.52, 0.82], light: [0.28, 0.55] },
];

export const ACCENT_SAT = [0.42, 0.78];
export const ACCENT_LIGHT = [0.32, 0.62];

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

// BODIES.md §Colour
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

const sharedMaterials = new Map();

function sharedMaterial(source) {
  if (source.userData.shared) return source;
  const family = source.userData.family ?? 'felt';
  if (!sharedMaterials.has(family)) {
    const shared = source.clone();
    shared.color = new THREE.Color(0xffffff);
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

export const GEO_DETAIL = Object.freeze({
  high: { sphere: [48, 32], cone: 24, cyl: 16, torus: [16, 40], dome: [12, 6] },
  med:  { sphere: [24, 16], cone: 16, cyl: 10, torus: [10, 24], dome: [8, 4] },
  low:  { sphere: [14, 10], cone: 10, cyl: 7,  torus: [8, 16],  dome: [6, 3] },
});

export const GEO = { sphere: null, cone: null, cyl: null, taper: null, torus: null, dome: null };

let currentDetail = null;

export const LIMB_TAPER = 0.78;

const buildPrimitives = (d) => ({
  sphere: new THREE.SphereGeometry(1, d.sphere[0], d.sphere[1]),
  cone: new THREE.ConeGeometry(1, 1, d.cone),
  cyl: new THREE.CylinderGeometry(1, 1, 1, d.cyl),
  taper: new THREE.CylinderGeometry(1, LIMB_TAPER, 1, d.cyl),
  torus: new THREE.TorusGeometry(1, 0.34, d.torus[0], d.torus[1]),
  dome: new THREE.SphereGeometry(1, d.dome[0], d.dome[1], 0, Math.PI * 2, 0, Math.PI * 0.5),
});

export function setGeometryDetail(level = 'high') {
  if (currentDetail !== null) {
    Object.values(GEO).forEach((g) => g?.dispose());
    clearScallopCache();
  }
  currentDetail = level;
  Object.assign(GEO, buildPrimitives(GEO_DETAIL[level] ?? GEO_DETAIL.high));
}
setGeometryDetail('high');

export const getGeometryDetail = () => currentDetail;

const sideName = (side) => (side < 0 ? 'right' : 'left');

const named = (node, name) => {
  node.name = name;
  return node;
};

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

const UP = new THREE.Vector3(0, 1, 0);

const normaliseShell = (o) => ({
  ...o,
  rows: Math.max(1, Math.round(o.rows)),
  perRow: Math.max(3, Math.round(o.perRow)),
  skipFront: o.skipFront ?? 0,
  sides: o.sides ? Math.max(3, Math.round(o.sides)) : 0,
});

const spikeGeometry = (sides) =>
  new THREE.ConeGeometry(1, 1, sides).translate(0, 0.5, 0);

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
    const step = (Math.PI * 2) / perRow;
    for (let s = 0; s < perRow; s++) {
      const theta = Math.PI / 2 + (s + 0.5) * step + offset;
      if (!inFaceGap(theta, skipFront)) angles.push({ phi, theta });
    }
  }
  return angles;
}

function baseDistance(normal, sunk, inside) {
  if (!inside) return sunk;
  const n = [normal.x / inside.axes[0], normal.y / inside.axes[1], normal.z / inside.axes[2]];
  const c = inside.centre.map((v, i) => v / inside.axes[i]);
  const a = n[0] ** 2 + n[1] ** 2 + n[2] ** 2;
  const b = -2 * (n[0] * c[0] + n[1] * c[1] + n[2] * c[2]);
  const k = c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - 1;
  if (k >= 0) return sunk;
  return (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a);
}

function scallopBase({ phi, theta }, { size, flat, inside }) {
  const sinPhi = Math.sin(phi);
  const normal = new THREE.Vector3(sinPhi * Math.cos(theta), Math.cos(phi), sinPhi * Math.sin(theta));
  return { normal, position: normal.clone().multiplyScalar(baseDistance(normal, 1 - size * flat, inside)) };
}

export const scallopBases = (opts) => {
  const shell = normaliseShell(opts);
  return scallopAngles(shell).map((a) => scallopBase(a, shell).position);
};

const FLOW = new THREE.Vector3(0, -1, -0.5).normalize();

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
  const row = shell.bottom > shell.top ? (angle.phi / Math.PI - shell.top) / (shell.bottom - shell.top) : 0;
  const normal = shell.inside ? scallopFacing(position, row, shell.inside) : ray;
  const size = shell.inside ? shell.size * position.length() : shell.size;
  const { proud } = shell;
  const rotation = new THREE.Quaternion().setFromUnitVectors(UP, normal);
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(size, size * proud, size));
}

const BACK = Math.PI * 1.5;
const fromBack = (theta) => ((((theta - BACK) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

// rad per underfur quad; caps the flat-triangle sag at 1.006
const UNDERFUR_STEP = 0.2;

function underfurGeometry(shell, angles) {
  const phis = angles.map((a) => a.phi);
  const top = Math.min(...phis), bottom = Math.max(...phis);
  const culled = angles.length < shell.rows * shell.perRow;
  const half = culled ? Math.max(...angles.map((a) => Math.abs(fromBack(a.theta)))) : Math.PI;
  const across = Math.max(3, Math.ceil((half * 2) / UNDERFUR_STEP));
  const down = Math.max(1, Math.ceil((bottom - top) / UNDERFUR_STEP));
  const skin = new THREE.SphereGeometry(1, across, down, -Math.PI / 2 - half, half * 2, top, bottom - top);
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
  const unit = shell.sides ? spikeGeometry(shell.sides) : GEO.dome;
  const scallops = angles.map((a) => unit.clone().applyMatrix4(scallopMatrix(a, shell)));
  if (shell.inside && shell.underfur) scallops.push(underfurGeometry(shell, angles));
  const merged = mergeGeometries(scallops, false);
  scallops.forEach((g) => g.dispose());
  if (shell.sides) unit.dispose();
  return merged;
}

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

function widestRowSin(rows, top, bottom) {
  let widest = 0;
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    widest = Math.max(widest, Math.sin(Math.PI * (top + (bottom - top) * t)));
  }
  return widest || 1e-3;
}

export function touchingScallopSize({ rows, perRow, top, bottom, maxSize = 0.45 }) {
  const rowCount = Math.max(1, Math.round(rows));
  const columns = Math.max(3, Math.round(perRow));
  const across = ((Math.PI * 2) / columns) * widestRowSin(rowCount, top, bottom);
  const down = rowCount > 1 ? ((bottom - top) * Math.PI) / (rowCount - 1) : across;
  return Math.min(Math.max(across, down) * 0.5, maxSize);
}

export function scallopMesh(geometry, material, scale) {
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const eyeWhiteDepth = (P) => P.eyeRadius * 0.55;

// BODIES.md §Eyes and ears
const EYE_PROUD = 0.25;

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
  group.add(part(GEO.sphere, mat.pupil, {
    pos: [0, 0, depth * 0.6 + P.pupilDepth],
    scale: [pupilR, pupilR * squash, pupilR * 0.72],
  }));
  return group;
}

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

// BODIES.md §Eyes and ears
const EAR_SEAT = 0.95;

function earSeat(P, { spread, lift, back, head }) {
  const x = P.headRadius * spread, y = P.headRadius * lift, z = P.headRadius * back;
  if (!head) return [x, y, z];
  const norm = Math.hypot(x / head[0], y / head[1], z / head[2]);
  const k = norm > EAR_SEAT ? EAR_SEAT / norm : 1;
  return [x * k, y * k, z * k];
}

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
    ctx.joints.ear.push({
      node: ear, side, tilt, leaf, flatten,
      size, length, midY: length * 0.35, halfH: length * 0.5,
    });
  }
}

export const addConeEars = (ctx, P, opts) => addEars(ctx, P, { ...opts, shape: 'cone' });

// BODIES.md §Tail
const TAIL_BASE = 0.55;
const TAIL_SEAT = 0.9;

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

function tailChord(tail) {
  let y = 0, z = 0, angle = 0;
  for (let i = 0; i < tail.length; i++) {
    if (i) angle += tail[i].rest;
    y += Math.sin(angle);
    z -= Math.cos(angle);
  }
  return Math.atan2(y, -z);
}

const _arm = { a: 0, b: 0, c: 0, reach: 0, x0: 0, y0: 0, cs: 0, sn: 0 };

function armFrame(P, bulge, armSwing) {
  const coat = 1 + bulge;
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

export function minArmOut(P, bulge = 0, armSwing = 0) {
  const { a, b, c, reach, x0, y0, cs, sn } = armFrame(P, bulge, armSwing);

  let prev = 0;
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (Math.PI / 2);
    const down = Math.cos(t) * reach;
    const x = (x0 + Math.sin(t) * reach) / a;
    const y = (y0 - down * cs) / b;
    const z = (down * sn) / c;
    const d = x * x + y * y + z * z;
    if (d > 1) return i === 0 ? 0 : t - (Math.PI / 48) * ((d - 1) / (d - prev));
    prev = d;
  }
  return Math.PI / 2;
}

export const clampArmOut = (P, bulge, armOut, armSwing) => (P.clampArmOut
  ? Math.max(armOut, minArmOut(P, bulge, armSwing))
  : armOut);

function buildFoot(shinLen, mat, side) {
  const foot = named(new THREE.Group(), `${sideName(side)}Foot`);
  foot.position.y = -shinLen;
  foot.add(part(GEO.sphere, mat.foot, { pos: [0, 0.016, 0.038], scale: [0.055, 0.028, 0.078] }));
  return foot;
}

function limbSegment(node, material, radius, length, cap = true) {
  node.add(part(GEO.taper, material, {
    pos: [0, -length / 2, 0],
    scale: [radius, length, radius],
  }));
  if (cap) node.add(part(GEO.sphere, material, { scale: [radius, radius * 0.92, radius] }));
}

// BODIES.md §Legs and grounding: leading leg bends, trailing stays straight
const kneeAmount = (kneeBend, legSwing, side) =>
  kneeBend * (1 - 0.85 * Math.max(0, Math.tanh(legSwing * side * 4)));

const swingKnee = (pose, side) => Math.max(0, side * (pose.kneeSwing ?? 0));

// BODIES.md §Rig: 55/45 leg split
export const femurOf = (P) => (P.legHeight + P.hipInset) * 0.55;

// BODIES.md §Seating
export const seatedHipsAlong = (P, chairW) => Math.max(-chairW * 0.45, chairW / 2 - femurOf(P));

function limbNodes(joints) {
  const limbs = new Set();
  for (const j of [...joints.upperArm, ...joints.upperLeg, ...joints.tail.slice(0, 1)]) {
    j.node.traverse((n) => limbs.add(n));
  }
  return limbs;
}

const _rest = new THREE.Vector3();

export function lowestResting(built) {
  built.root.updateMatrixWorld(true);
  const limbs = limbNodes(built.joints);
  let lowest = Infinity;
  built.root.traverse((m) => {
    if (!m.isMesh || limbs.has(m) || m.userData.prop) return;
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
  limbSegment(upperLeg, mat.body, P.limbThick, thigh, false);
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

function buildHeldItem(P, addMaterial) {
  const skein = addMaterial(knitMaterial(P.heldColor));
  const band = addMaterial(feltMaterial(P, '#efe6d5'));
  const held = new THREE.Group();
  held.rotation.z = Math.PI * 0.5;
  held.add(part(GEO.sphere, skein, { scale: [0.052, 0.088, 0.052] }));
  held.add(part(GEO.torus, band, { scale: [0.050, 0.050, 0.030], rot: [Math.PI * 0.5, 0, 0] }));
  held.visible = Boolean(P.holdItem);
  held.userData.noMerge = true;
  return held;
}

function attachArms(chest, P, { mat, joints, addMaterial, bulge }) {
  const arms = [-1, 1].map((side) => buildArm(side, P, mat, joints, bulge));
  arms.forEach(({ upperArm }) => chest.add(upperArm));
  const held = buildHeldItem(P, addMaterial);
  arms[0].hold.add(held);
  return { held, holds: arms.map(({ hold }) => hold) };
}

function buildNeck(P, mat) {
  const neck = joint(new THREE.Group(), 'neck');
  neck.position.y = P.torsoH - P.headOverlap;
  neck.rotation.order = 'YXZ';
  neck.add(part(GEO.cyl, mat.body, {
    scale: [P.neckThick, P.neckLength, P.neckThick],
    pos: [0, P.neckLength / 2, 0],
  }));
  return neck;
}

function buildHeadNode(P) {
  const head = joint(new THREE.Group(), 'head');
  head.position.y = P.neckLength + P.headRadius * 0.62;
  head.rotation.order = 'YXZ';
  return head;
}

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

function disableShadowCasting(root) {
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
}

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

  const ctx = { ...body, joints, materials, mat, addMaterial, params: P, species: kit, bulge,
                motion: makeMotion(POSES.rest), groundOffset: 0, seatDrop: 0 };
  kit.buildKit(ctx, P);
  if (!P.partShadows) disableShadowCasting(body.root);
  if (P.mergeMeshes !== false) mergeCharacter(ctx);
  applyPose(ctx, P);
  return ctx;
}

function staticMeshes(node, out = []) {
  for (const child of node.children) {
    if (child.userData.noMerge) continue;
    if (child.isMesh) out.push(child);
    else if (!child.userData.joint) staticMeshes(child, out);
  }
  return out;
}

function bakedGeometry(mesh, toJointSpace) {
  const local = new THREE.Matrix4().multiplyMatrices(toJointSpace, mesh.matrixWorld);
  const geometry = mesh.geometry.clone().applyMatrix4(local);
  for (const name of mesh.userData.dropOnMerge ?? []) geometry.deleteAttribute(name);
  return paintGeometry(geometry, mesh.material.color);
}

function paintGeometry(geometry, color) {
  if (geometry.attributes.color) return geometry;
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
  if (parts.length > 1) parts.forEach((geo) => geo.dispose());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.userData.merged = true;
  return mesh;
}

function unmerge(mesh) {
  mesh.removeFromParent();
  if (mesh.userData.garment) mesh.geometry.dispose();
}

function skinnedJoints(root) {
  const joints = [];
  root.traverse((node) => { if (node.userData.joint) joints.push(node); });
  return joints;
}

function skinnedGroups(bones, toRoot) {
  const groups = new Map();
  const boneOf = (node) => {
    for (let n = node; n; n = n.parent) if (bones.includes(n)) return bones.indexOf(n);
    return 0;
  };
  bones.forEach((bone, index) => {
    if (!bone.visible) return;
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

function skinnedPart(mesh, toRoot, index, boneOf) {
  const geo = bakedGeometry(mesh, toRoot);
  if (mesh.isSkinnedMesh) remapSkin(geo, mesh.skeleton.bones.map(boneOf));
  else rigidTo(geo, index);
  return geo;
}

function remapSkin(geo, to) {
  const index = geo.attributes.skinIndex.array;
  for (let i = 0; i < index.length; i++) index[i] = to[index[i]];
}

function skinAt(bones) {
  const [root] = bones;
  const groups = skinnedGroups(bones, new THREE.Matrix4().copy(root.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(bones);
  for (const entry of groups.values()) {
    const merged = mergedMesh(entry);
    const mesh = new THREE.SkinnedMesh(merged.geometry, merged.material);
    Object.assign(mesh, { castShadow: merged.castShadow, receiveShadow: merged.receiveShadow });
    mesh.userData.merged = true;
    root.add(mesh);
    mesh.bind(skeleton, root.matrixWorld);
  }
}

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

export function mergeCharacter(built) {
  built.root.updateMatrixWorld(true);
  const skinned = skinnedJoints(built.root);
  if (skinned.length) skinAt(skinned);
}

// foot sphere: y +0.016, radius 0.028
const FOOT_SOLE = 0.012;

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

export function groundCharacter(built, pose = built.params) {
  const y = (built.groundOffset ?? 0) + FOOT_SOLE - lowestFoot(built.params, pose);
  if (Number.isFinite(y)) built.root.position.y = y;
}

// BODIES.md §Head and neck
function neckShare(P) {
  const len = P.neckLength ?? 0.1;
  return Math.max(0.20, Math.min(0.72, 0.20 + 1.3 * len));
}

// BODIES.md §Head and neck: roll only
function neckStabilise(P) {
  return Math.min(0.75, 1.6 * (P.neckLength ?? 0.1));
}

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

function applyHead(joints, pose, P) {
  const lim = P.headYawMax ?? 1.40;
  const yaw = Math.max(-lim, Math.min(lim, pose.headYaw ?? 0));
  const pitch = pose.headPitch ?? 0, tilt = pose.headTilt ?? 0;
  const neck = neckShare(P);
  const head = 1 - neck;
  const curve = pose.neckCurve ?? 0;
  const steady = (pose.spineRoll ?? 0) * neckStabilise(P);
  if (joints.neck) {
    joints.neck.rotation.set(pitch * neck + curve, yaw * neck, -tilt * neck + steady);
  }
  if (joints.head) {
    joints.head.rotation.set(pitch * head - curve, yaw * head, -tilt * head);
  }
  // ponytail: blink is a y-squash of the eye (reads as a squint); a lid disc if it matters at play distance
  const lid = 1 - (pose.blink ?? 0);
  for (const { node } of joints.eye) node.scale.y = lid;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const _tailQX = new THREE.Quaternion(), _tailQY = new THREE.Quaternion();

function applyTail(tail, pose) {
  const n = tail.length;
  if (!n) return;
  const yaw = pose.tailYaw ?? 0, pitch = pose.tailPitch ?? pose.tailLift ?? 0;
  const lagYaw = n > 1 ? ((pose.tailYawTip ?? yaw) - yaw) / (n - 1) : 0;
  const lagPitch = n > 1 ? ((pose.tailPitchTip ?? pitch) - pitch) / (n - 1) : 0;
  const { node, rest, chord } = tail[0];
  node.quaternion.setFromAxisAngle(X_AXIS, rest + pitch + chord)
    .multiply(_tailQY.setFromAxisAngle(UP, yaw))
    .multiply(_tailQX.setFromAxisAngle(X_AXIS, -chord));
  for (let i = 1; i < n; i++) tail[i].node.rotation.set(tail[i].rest + lagPitch, lagYaw, 0);
}

const _out = Object.seal(Object.fromEntries(
  [...POSE_KEYS.map((k) => [k, 0]),
    ['holdItem', false], ['blink', 0], ['kneeSwing', 0], ['neckCurve', 0],
    ['tailYaw', 0], ['tailPitch', 0], ['tailYawTip', 0], ['tailPitchTip', 0]],
));

export function applyPose(built, pose) {
  const { joints, held, params, bulge = 0 } = built;
  const alt = pose.armOutAlt ?? 0;
  const out = [
    clampArmOut(params, bulge, pose.armOut + alt, pose.armSwing),
    clampArmOut(params, bulge, pose.armOut - alt, pose.armSwing),
  ];
  applyLimbs(joints, pose, out);
  if (joints.spine) {
    joints.spine.rotation.set(pose.spineBend ?? 0, pose.spineTwist ?? 0, -(pose.spineRoll ?? 0));
  }
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

export function stepMotion(built, target, dt, opts, add) {
  integrate(built.motion, target, dt, opts);
  compose(_out, built.motion, opts);
  if (add) add(_out);
  applyPose(built, _out);
  if (built.joints.tail.length) {
    tailStep(built.motion, _out, tailAcceleration(built, dt), dt, tailSpring(built.params));
    applyTail(built.joints.tail, _out);
  }
  return _out;
}

// BODIES.md §Tail
const TAIL_TELEPORT = 6;
const _tailAt = new THREE.Vector3(), _tailV = new THREE.Vector3(), _tailQ = new THREE.Quaternion();
const _tailA = [0, 0, 0];

function tailAcceleration(built, dt) {
  const root = built.joints.tail[0].node;
  root.getWorldPosition(_tailAt);
  _tailA.fill(0);
  if (!(dt > 1e-4)) return _tailA;
  const track = (built.tailTrack ??= { at: null, vel: null });
  const v = track.at && _tailV.subVectors(_tailAt, track.at).divideScalar(dt);
  track.at = (track.at ?? new THREE.Vector3()).copy(_tailAt);
  if (!v || v.length() > TAIL_TELEPORT) {
    track.vel = null;
    return _tailA;
  }
  if (track.vel) {
    track.vel.sub(v).multiplyScalar(-1 / dt)
      .applyQuaternion(root.parent.getWorldQuaternion(_tailQ).invert()).toArray(_tailA);
  }
  track.vel = (track.vel ?? new THREE.Vector3()).copy(v);
  return _tailA;
}

export function setViewMode(root, mode) {
  const override = { grey: greyMat, silhouette: blackMat }[mode];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.felt ??= o.material;
    o.material = override ?? o.userData.felt;
  });
}

export function disposeCharacter(built) {
  for (const material of built.materials) {
    if (!material.userData.shared) material.dispose();
  }
  built.root.traverse((o) => {
    if (o.isMesh && o.userData.merged) o.geometry.dispose();
    o.skeleton?.dispose();
  });
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export function applyRanges(P, ranges) {
  for (const [key, [a, b]] of Object.entries(ranges)) P[key] = round3(rand(a, b));
  return P;
}

/**
 * @param {Record<string, any>} P
 * @param {Record<string, number[]>} [ranges]
 */
export function randomiseBase(P, ranges = BASE_RANDOM_RANGES) {
  applyRanges(P, ranges);
  P.bodyColor = randomFur();
  P.heldColor = randHex(ACCENT_SAT, ACCENT_LIGHT);
  P.name = pick(NAMES);
  return P;
}

export const SHARED_RANDOM_KEYS = ['bodyColor', 'heldColor'];

const sameRange = (a, b) => Boolean(a) && Boolean(b) && a[0] === b[0] && a[1] === b[1];

export function shareRandomParams(from, to, fromKit, toKit) {
  for (const key of Object.keys(BASE_RANDOM_RANGES)) {
    if (!(key in from) || !(key in to)) continue;
    if (!sameRange(fromKit.randomRanges[key], toKit.randomRanges[key])) continue;
    to[key] = from[key];
  }
  for (const key of SHARED_RANDOM_KEYS) {
    if (key in from && key in to) to[key] = from[key];
  }
  if (fromKit.coatColorKey && toKit.coatColorKey) {
    to[toKit.coatColorKey] = from[fromKit.coatColorKey];
  }
  return to;
}

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
