import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMotion, integrate, compose, tailStep, POSE_KEYS, POSES } from './motion.js';
import { paintMaterial } from './paint.js';

export const BUILD = '2026-09-26.8-tails';

const SPECIES = new Map();

/** ai_planning_sessions/characters/ADDING-A-SPECIES.md: a kit, filled with the defaults it may leave out */
export function registerSpecies(species) {
  const kit = { coatOf: deriveCoatColor, ...species };
  kit.randomise ??= (P) => randomiseKit(P, kit);
  SPECIES.set(kit.id, kit);
  return kit;
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
  legOut:        0.00,
  legOutAlt:     0.00,
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
  earFlap:       0.00,
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

  lookAt:        false,
  eyeGlint:      false,
  facePaint:     'none',
  facePaintSize: 1.00,
  facePaintDown: 1.20,
  facePaintOut:  0.40,
  facePaintColor: '',
  painterly:     false,

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
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
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

// BODIES.md §Face: the fur's complement, straight across the hue circle; scarlet on grey fur, which has no hue
const GREY_FUR = 0.12, GREY_ACCENT = 0.03;

export function facePaintColorFor(bodyHex) {
  const body = {};
  new THREE.Color(bodyHex).getHSL(body);
  return hsl(body.s < GREY_FUR ? GREY_ACCENT : (body.h + 0.5) % 1, 0.85, 0.55);
}

export const facePaintColorOf = (P) => P.facePaintColor || facePaintColorFor(P.bodyColor);

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
    if (source.userData.paint) paintMaterial(shared, source.userData.paint, false);
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

function cachedGeometry(key, make) {
  const at = `${key}|${currentDetail}`;
  if (!scallopCache.has(at)) scallopCache.set(at, make());
  return scallopCache.get(at);
}

export const scallopGeometry = (opts) => cachedGeometry(JSON.stringify(opts), () => makeScallopShell(opts));

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

/** BODIES.md §Coats: a coat's curl size, sized to touch its neighbours when `${coat}AutoSize` */
export const coatSize = (P, coat, shape) => (P[`${coat}AutoSize`] ? touchingScallopSize(shape) * P[`${coat}Touch`] : P[`${coat}Size`]);

/** The torso's scallop shell from a coat's params: `${coat}Rows`, `${coat}PerRow`, `${coat}Top`, … */
function torsoShell(P, coat) {
  const shape = { rows: P[`${coat}Rows`], perRow: P[`${coat}PerRow`], top: P[`${coat}Top`], bottom: P[`${coat}Bottom`] };
  return { ...shape, size: coatSize(P, coat, shape), flat: P[`${coat}Flat`], proud: P[`${coat}Proud`], stagger: P[`${coat}Stagger`] };
}

/** How far a torso coat, worn while `P[on]`, stands proud of the torso: a kit's coatBulge. */
export function coatBulge(P, on, coat) {
  if (!P[on]) return 0;
  const { size, proud, flat } = torsoShell(P, coat);
  return Math.max(0, size * (proud - flat));
}

/** The kit's head: an ellipsoid of `headShape` × headRadius in the body felt; its radii go in ctx.headScale. */
export function addHead(ctx, P) {
  ctx.headScale = ctx.species.headShape.map((k) => P.headRadius * k);
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale: ctx.headScale }));
}

export function addTorsoCoat(ctx, P, { on, coat, material }) {
  if (!P[on]) return;
  const shell = scallopMesh(scallopGeometry(torsoShell(P, coat)), material, [P.torsoW, P.torsoH, P.torsoD]);
  if (shell) ctx.chest.add(shell);
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

const skinZ = (x, y, head) => {
  const k = 1 - (x / head[0]) ** 2 - (y / head[1]) ** 2;
  return k > 0 ? head[2] * Math.sqrt(k) : 0;
};

function eyeSeat(P, { spread, lift, front, head }) {
  if (!head) return front;
  const skin = skinZ(P.headRadius * spread, P.headRadius * lift, head);
  return Math.max(front, (skin - eyeWhiteDepth(P) * (1 - EYE_PROUD)) / P.headRadius);
}

// BODIES.md §Face: a glint up and out on the pupil, to the key light's side
const GLINT = Object.freeze({ size: 0.22, up: 0.42, out: 0.30 });

function buildGlint(P, mat, pupilR, squash) {
  const g = pupilR * GLINT.size, x = pupilR * GLINT.out, y = pupilR * squash * GLINT.up;
  const z = pupilR * 0.72 * Math.sqrt(1 - GLINT.out ** 2 - GLINT.up ** 2);
  const glint = part(GEO.sphere, mat.glint, { pos: [x, y, z], scale: [g, g * squash, g * 0.3], shadow: false });
  glint.name = 'glint';
  return glint;
}

function buildPupil(side, P, mat, { squash, depth }) {
  const pupilR = P.eyeRadius * P.pupilScale;
  const pupil = joint(new THREE.Group(), `${sideName(side)}Pupil`);
  pupil.position.z = depth * 0.6 + P.pupilDepth;
  pupil.add(part(GEO.sphere, mat.pupil, { scale: [pupilR, pupilR * squash, pupilR * 0.72] }));
  if (P.eyeGlint) pupil.add(buildGlint(P, mat, pupilR, squash));
  return pupil;
}

const REACH_STEPS = 24;

/** How far (a share of the eye's radius) the white shows above the skin from the eye's middle along `dir`. @param {number[]} dir */
function whiteReach(P, { squash, head }, at, dir) {
  if (!head) return 1;
  const [ux, uy] = dir;
  const depth = eyeWhiteDepth(P);
  for (let i = 1; i <= REACH_STEPS; i++) {
    const t = i / REACH_STEPS;
    const x = at.x + t * P.eyeRadius * ux, y = at.y + t * P.eyeRadius * squash * uy, z = at.z + depth * Math.sqrt(1 - t * t);
    if (Math.hypot(x / head[0], y / head[1], z / head[2]) < 1) return (i - 1) / REACH_STEPS;
  }
  return 1;
}

/** BODIES.md §Look-at: how far a pupil may slide each way (-x, +x, -y, +y) and stay on the white that shows. */
function pupilRoom(P, placement, at) {
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].map((u) => {
    const r = u[0] ? P.eyeRadius : P.eyeRadius * placement.squash;
    return Math.max(0, whiteReach(P, placement, at, u) - P.pupilScale) * r * 0.9;
  });
}

function buildEye(side, P, mat, placement) {
  const { spread, lift, front, squash } = placement;
  const group = new THREE.Group();
  const depth = eyeWhiteDepth(P);
  group.position.set(side * P.headRadius * spread, P.headRadius * lift, P.headRadius * front);
  group.add(part(GEO.sphere, mat.eye, { scale: [P.eyeRadius, P.eyeRadius * squash, depth] }));
  const pupil = buildPupil(side, P, mat, { squash, depth });
  group.add(pupil);
  return { group, pupil, rest: pupil.position.z, depth, r: P.eyeRadius, ry: P.eyeRadius * squash, room: pupilRoom(P, placement, group.position) };
}

export function addEyes(ctx, P, opts = {}) {
  const placement = {
    spread: opts.spread ?? P.eyeSpread,
    lift: opts.lift ?? P.eyeLift,
    front: opts.front ?? P.eyeFront,
    squash: opts.squash ?? 1,
    head: opts.head,
  };
  placement.front = eyeSeat(P, placement);
  if (P.eyeGlint) ctx.mat.glint ??= ctx.addMaterial(Object.assign(eyeMaterial(P, '#ffffff'), { emissive: new THREE.Color('#ffffff') }));
  for (const side of [-1, 1]) {
    const { group, ...eye } = buildEye(side, P, ctx.mat, placement);
    ctx.head.add(joint(group, `${sideName(side)}Eye`));
    ctx.joints.eye.push({ node: group, ...eye });
  }
  if (opts.head) addFace(ctx, P, placement);
}

// BODIES.md §Face paint: it lies this far proud of the skull
const ACCENT_LIFT = 0.003;
const PATCH_SEGMENTS = 24;

/**
 * A patch of skin `lift` proud of head ellipsoid `head`, round the skin point over (x, y), `from` to `to` radians out.
 * @param {number[]} head @param {number[]} at @param {number[]} span @param {number} lift
 */
export function skinPatch(head, [x, y], [from, to], lift) {
  const key = `patch|${head}|${x}|${y}|${from}|${to}|${lift}`;
  return cachedGeometry(key, () => {
    const dir = new THREE.Vector3(x / head[0], y / head[1], skinZ(x, y, head) / head[2]).normalize();
    const g = new THREE.SphereGeometry(1, PATCH_SEGMENTS, 3, 0, Math.PI * 2, from, to - from);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    return g.scale(head[0] + lift, head[1] + lift, head[2] + lift);
  });
}

const meanOf = (head) => (head[0] + head[1] + head[2]) / 3;

const RIM_STEP = 0.02, RIM_AROUND = 16;
const _rimQ = new THREE.Quaternion(), _rimP = new THREE.Vector3(), _rimN = new THREE.Vector3();

/** Is the circle `a` radians round the patch middle (rotated there by `_rimQ`), `lift` proud, wholly outside the white? */
function clearOfWhite(head, white, a, lift) {
  for (let i = 0; i < RIM_AROUND; i++) {
    const phi = (i / RIM_AROUND) * Math.PI * 2;
    _rimP.set(Math.sin(a) * Math.cos(phi), Math.cos(a), Math.sin(a) * Math.sin(phi)).applyQuaternion(_rimQ);
    const d = [0, 1, 2].map((k) => (_rimP.getComponent(k) * (head[k] + lift) - white.at[k]) / white.size[k]);
    if (Math.hypot(...d) < 1) return false;
  }
  return true;
}

/** The angle round the skin under the eye's middle at which a patch `lift` proud clears the eye's white. */
function rimAngle(P, { spread, lift: up, front, squash, head }, side, lift) {
  const at = [side * P.headRadius * spread, P.headRadius * up, P.headRadius * front];
  const white = { at, size: [P.eyeRadius, P.eyeRadius * squash, eyeWhiteDepth(P)] };
  _rimQ.setFromUnitVectors(UP, _rimN.set(at[0] / head[0], at[1] / head[1], skinZ(at[0], at[1], head) / head[2]).normalize());
  let a = RIM_STEP;
  while (a < Math.PI / 2 && !clearOfWhite(head, white, a, lift)) a += RIM_STEP;
  return a;
}

// BODIES.md §Face paint: what a player paints on (spinoff chooser); more unlock later
export const FACE_PAINTS = Object.freeze(['none', 'rings', 'slashes', 'heart']);

const capsule = (w, h) => new THREE.Shape().moveTo(-w, -h).lineTo(w, -h).absarc(w, 0, h, -Math.PI / 2, Math.PI / 2)
  .lineTo(-w, h).absarc(-w, 0, h, Math.PI / 2, Math.PI * 1.5);
const heart = () => new THREE.Shape().moveTo(0, -0.5).bezierCurveTo(-0.15, -0.3, -0.5, -0.1, -0.5, 0.15)
  .bezierCurveTo(-0.5, 0.42, -0.15, 0.5, 0, 0.28).bezierCurveTo(0.15, 0.5, 0.5, 0.42, 0.5, 0.15)
  .bezierCurveTo(0.5, -0.1, 0.15, -0.3, 0, -0.5);
const DECALS = { slashes: () => capsule(0.36, 0.2), heart };

/** Triangles `p` (flat xyz, three corners each), each split in four. */
function split(p) {
  const out = [], mid = (a, b) => [0, 1, 2].map((k) => (p[a + k] + p[b + k]) / 2);
  for (let i = 0; i < p.length; i += 9) {
    const [a, b, c] = [i, i + 3, i + 6].map((j) => [p[j], p[j + 1], p[j + 2]]), ab = mid(i, i + 3), bc = mid(i + 3, i + 6), ca = mid(i + 6, i);
    out.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
  }
  return new Float32Array(out);
}

/** `g` (non-indexed) with each triangle split in four, `times` over, so a flat shape can bend onto a curve. */
function subdivide(g, times) {
  let p = g.attributes.position.array;
  for (let t = 0; t < times; t++) p = split(p);
  const uv = new Float32Array((p.length / 3) * 2).map((_, i) => p[Math.floor(i / 2) * 3 + (i % 2)] + 0.5);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3)).setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    .setIndex([...Array(p.length / 3).keys()]);
}

/** Unit shape `kind` (DECALS) `size` across, upright, wrapped onto head ellipsoid `head` round the skin over (x, y), `lift` proud. */
function skinDecal(head, kind, [x, y], size, lift) {
  return cachedGeometry(`decal|${kind}|${head}|${x}|${y}|${size}|${lift}`, () => {
    const at = new THREE.Vector3(x, y, skinZ(x, y, head));
    const n = new THREE.Vector3(x / head[0] ** 2, y / head[1] ** 2, at.z / head[2] ** 2).normalize();
    const across = new THREE.Vector3().crossVectors(UP, n).normalize(), up = new THREE.Vector3().crossVectors(n, across);
    const g = subdivide(new THREE.ShapeGeometry(DECALS[kind](), 8).toNonIndexed(), 3), pos = g.attributes.position, q = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      q.copy(at).addScaledVector(across, pos.getX(i) * size).addScaledVector(up, pos.getY(i) * size);
      q.multiplyScalar(1 / Math.hypot(q.x / head[0], q.y / head[1], q.z / head[2]));
      q.addScaledVector(q.clone().normalize(), lift);
      pos.setXYZ(i, q.x, q.y, q.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// BODIES.md §Face paint: on the cheekbone (facePaintDown, facePaintOut in eye radii from the eye), or one heart on the right cheek

function facePaintGeometry(P, placement, side) {
  const { spread, lift, squash, head } = placement, eye = [side * P.headRadius * spread, P.headRadius * lift];
  if (P.facePaint !== 'rings') {
    /** @type {[number, number]} */
    const cheek = [eye[0] + side * P.eyeRadius * P.facePaintOut, eye[1] - P.eyeRadius * squash * P.facePaintDown];
    return skinDecal(head, P.facePaint, cheek, P.eyeRadius * 1.5 * P.facePaintSize, ACCENT_LIFT);
  }
  const rim = rimAngle(P, placement, side, ACCENT_LIFT);
  return skinPatch(head, eye, [rim, rim + (P.eyeRadius * P.facePaintSize) / meanOf(head)], ACCENT_LIFT);
}

function addFace(ctx, P, placement) {
  if (!FACE_PAINTS.includes(P.facePaint) || P.facePaint === 'none') return;
  ctx.mat.facePaint ??= ctx.addMaterial(feltMaterial(P, facePaintColorOf(P)));
  for (const side of P.facePaint === 'heart' ? [-1] : [-1, 1]) {
    ctx.head.add(named(part(facePaintGeometry(P, placement, side), ctx.mat.facePaint), 'facePaint'));
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

// BODIES.md §Legs and grounding: leading leg bends, trailing stays straight; a leg swung out to the side
// (`legOut`, DANCES.md §Gymnastics) stays straight too, as in a sweep or a split
const kneeAmount = (kneeBend, legSwing, side, out = 0) =>
  kneeBend * (1 - 0.85 * Math.max(0, Math.tanh(legSwing * side * 4), Math.tanh(out * 4)));

/** How far out to the side a leg is swung: `legOut` both, `legOutAlt` one more than the other, as `armOutAlt` does arms. */
const legOutOf = (pose, side) => (pose.legOut ?? 0) + side * (pose.legOutAlt ?? 0);

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
  upperLeg.rotation.z = side * legOutOf(P, side);
  limbSegment(upperLeg, mat.body, P.limbThick, thigh, false);
  joints.upperLeg.push({ node: upperLeg, side });

  const lowerLeg = joint(new THREE.Group(), `${sideName(side)}LowerLeg`);
  lowerLeg.position.y = -thigh;
  lowerLeg.rotation.x = kneeAmount(P.kneeBend, P.legSwing, side, legOutOf(P, side));
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
  if (P.painterly && kit.paint) paintCharacter(ctx, kit.paint);
  if (!P.partShadows) disableShadowCasting(body.root);
  if (P.mergeMeshes !== false) mergeCharacter(ctx);
  applyPose(ctx, P);
  return ctx;
}

/** BODIES.md §Painterly: every felt material of the character in the species' style; `accent` names the accent pieces. */
function paintCharacter({ materials, mat }, { style, accent = [] }) {
  for (const material of materials) {
    if (material.userData.family === 'felt') paintMaterial(material, style, accent.some((k) => material === mat[k]));
  }
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
  // BODIES.md §Painterly: merged, accent pieces are marked by uv lifted 2 (whole tiles, so the textures don't move)
  if (mesh.material.userData.accent) {
    const { uv } = geometry.attributes;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + 2);
  }
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
    // the thigh turns out (z) inside its swing (x), the Euler order the leg uses; with no turn out it's cos(hip + knee)
    const hip = pose.legSwing * side - (pose.hipFlex ?? 0), out = legOutOf(pose, side);
    const knee = kneeAmount(pose.kneeBend, pose.legSwing, side, out) + swingKnee(pose, side);
    const drop = Math.cos(out) * Math.cos(hip) * (thigh + Math.cos(knee) * shin) - Math.sin(knee) * Math.sin(hip) * shin;
    const y = total - drop;
    if (y < lowest) lowest = y;
  }
  return lowest;
}

export function groundCharacter(built, pose = built.params) {
  const y = (built.groundOffset ?? 0) + FOOT_SOLE - lowestFoot(built.params, pose);
  if (Number.isFinite(y)) built.root.position.y = y;
}

const _mid = new THREE.Vector3(), _midNow = new THREE.Vector3(), _spin = new THREE.Quaternion(), _turn = new THREE.Quaternion();
const _eul = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

/** Turns `obj` by `rotate` about a point `mid` above its origin, not the origin, so that point stays put: a body
 * flipping about its middle rather than its feet (the spinoff's stomp, and dances' flips). */
export function holdMiddle(obj, mid, rotate) {
  _mid.set(0, mid, 0).applyQuaternion(obj.quaternion);
  rotate(obj);
  obj.position.add(_mid).sub(_midNow.set(0, mid, 0).applyQuaternion(obj.quaternion));
}

/**
 * A dance frame's root extras (DANCES.md §Root extras, §Gymnastics) on a character `stepMotion` just posed: `shift`
 * and `travel` from (x, z) the way it faces (`yaw`), then flip, roll and turn about the body's middle. On the ground `rise`
 * adds to the grounded height; in the air grounding lets go: the body lifts from where it took off to standing
 * height as it rises (`launch`), then follows `rise` alone, so a tuck's raised feet don't drop it.
 */
export function placeDancer(built, d, { x = 0, z = 0, yaw = 0 } = {}) {
  const { root, params: P } = built, grounded = root.position.y, stand = (built.groundOffset ?? 0) + FOOT_SOLE;
  if (!d.air) built.takeoffY = grounded;
  const from = built.takeoffY ?? stand;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  root.position.set(x + d.shift * c + d.travel * s, (d.air ? from + (stand - from) * d.launch : grounded) + d.rise,
    z - d.shift * s + d.travel * c);
  root.quaternion.setFromEuler(_eul.set(0, yaw, 0));
  holdMiddle(root, P.legHeight + P.hipInset + P.torsoH / 2, (r) =>
    r.quaternion.multiply(_spin.setFromEuler(_eul.set(d.flip ?? 0, 0, d.roll ?? 0))).multiply(_turn.setFromAxisAngle(_up, d.turn)));
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
    node.rotation.z = side * legOutOf(pose, side);
  }
  for (const { node, side } of joints.lowerLeg) {
    node.rotation.x = kneeAmount(pose.kneeBend, pose.legSwing, side, legOutOf(pose, side)) + swingKnee(pose, side);
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

// BODIES.md §Look-at: the head turns this far at most (3/4 on to a side-on body); the pupils take the rest
const LOOK = Object.freeze({ yaw: 0.8, pitch: 0.35, eyes: 1.0, head: 5, glance: 18, gate: 0.1 });
const _lookTo = new THREE.Vector3(), _lookUp = new THREE.Vector3(), _lookQ = new THREE.Quaternion();
const _aim = { yaw: 0, pitch: 0, upright: 0 };
const clampTo = (v, lim) => Math.max(-lim, Math.min(lim, v));
const clear = (v) => Math.max(0, 1 - Math.abs(v ?? 0) / LOOK.gate);

/** `built.lookTarget` (a world point) as yaw and pitch from the head in the body's frame, or null. */
function lookAim(built) {
  const { lookTarget, params, joints, root } = built;
  if (!lookTarget || params.lookAt === false || !joints.head) return null;
  joints.head.getWorldPosition(_lookTo).sub(lookTarget).negate();
  root.getWorldQuaternion(_lookQ).invert();
  _lookTo.applyQuaternion(_lookQ);
  _aim.upright = Math.min(1, Math.max(0, (_lookUp.set(0, 1, 0).applyQuaternion(_lookQ).y - 0.5) / 0.4));
  _aim.yaw = Math.atan2(_lookTo.x, _lookTo.z);
  _aim.pitch = Math.atan2(-_lookTo.y, Math.hypot(_lookTo.x, _lookTo.z));
  return _aim;
}

/**
 * BODIES.md §Look-at: turns the head toward `built.lookTarget` on top of the pose, eased; a channel the pose sets
 * itself (a dance's head turn, a head shake) blends the look out of that channel. The pupils glance ahead.
 */
function lookLayer(built, out, target, dt) {
  const s = (built.look ??= { yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 });
  const aim = lookAim(built), w = aim ? aim.upright : 0;
  const yaw = aim ? clampTo(aim.yaw, LOOK.yaw) * w * clear(target.headYaw) * clear(target.headTilt) : 0;
  const pitch = aim ? clampTo(aim.pitch, LOOK.pitch) * w * clear(target.headPitch) : 0;
  const k = 1 - Math.exp(-LOOK.head * dt), e = 1 - Math.exp(-LOOK.glance * dt);
  s.yaw += (yaw - s.yaw) * k;
  s.pitch += (pitch - s.pitch) * k;
  out.headYaw += s.yaw;
  out.headPitch += s.pitch;
  s.eyeYaw += ((aim ? clampTo(aim.yaw - out.headYaw, LOOK.eyes) * w : 0) - s.eyeYaw) * e;
  s.eyePitch += ((aim ? clampTo(aim.pitch - out.headPitch, LOOK.eyes) * w : 0) - s.eyePitch) * e;
}

/** Slides each pupil over its white toward where the eyes look, kept on the white's surface. */
export function placePupils(built) {
  const { eyeYaw = 0, eyePitch = 0 } = built.look ?? {};
  for (const { pupil, rest, depth, r, ry, room } of built.joints.eye) {
    if (!pupil) continue;
    const x = Math.sin(eyeYaw) * room[eyeYaw < 0 ? 0 : 1], y = -Math.sin(eyePitch) * room[eyePitch > 0 ? 2 : 3];
    pupil.position.set(x, y, rest - depth + depth * Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / ry) ** 2)));
  }
}

const tailSpring = (P) => ({
  stiff: P.tailStiff, zeta: P.tailZeta, reach: P.tailLength, droop: P.tailDroop,
});

export function stepMotion(built, target, dt, opts, add) {
  if (target === POSES.delighted) target = built.species.delighted ?? target;
  integrate(built.motion, target, dt, opts);
  compose(_out, built.motion, opts);
  if (add) add(_out);
  lookLayer(built, _out, target, dt);
  applyPose(built, _out);
  placePupils(built);
  if (built.joints.tail.length) {
    tailStep(built.motion, _out, tailAcceleration(built, dt), dt, tailSpring(built.params));
    applyTail(built.joints.tail, _out);
  }
  return _out;
}

// BODIES.md §Tail
const TAIL_TELEPORT = 50, TAIL_TELEPORT_STEP = 3;
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
  if (!v || v.length() > Math.min(TAIL_TELEPORT, TAIL_TELEPORT_STEP / dt)) {
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

/** A kit's presets: preset `index` (wrapped) into P, the index into P[presetKey]. */
export function applyPreset(P, { presets, presetKey }, index) {
  const count = presets.length;
  P[presetKey] = index;
  return Object.assign(P, presets[((index % count) + count) % count]);
}

export const randomPreset = (P, kit) => applyPreset(P, kit, Math.floor(Math.random() * kit.presets.length));

/** BODIES.md §Randomisation: the base draw, the kit's own (`vary`), a coat preset, the coat colour from the fur. */
export function randomiseKit(P, kit) {
  randomiseBase(P, kit.randomRanges);
  kit.vary?.(P);
  if (kit.presets) randomPreset(P, kit);
  if (kit.coatColorKey) P[kit.coatColorKey] = kit.coatOf(P.bodyColor);
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

// ADDING-A-SPECIES.md §Menus: the species checker's sections a kit's gui rows may fill, merged after BASE_GUI's
export const GUI_SECTIONS = Object.freeze(['body', 'head & face', 'coat', 'tail', 'rig', 'debug pose']);

export const BASE_GUI = Object.freeze({
  body: [
    ['headRadius', 0.06, 0.32], ['headOverlap', 0.0, 0.16], ['neckLength', 0.01, 0.70],
    ['neckThick', 0.02, 0.14],
    ['torsoW', 0.12, 0.36], ['torsoH', 0.14, 0.42], ['torsoD', 0.10, 0.34],
    ['legHeight', 0.02, 0.40],
    ['bodyColor', 'color'], ['footColor', 'color'],
    ['sheen', 0, 1], ['sheenRoughness', 0, 1], ['sheenTint', 'color'], ['roughness', 0, 1],
  ],
  // BODIES.md §Face paint: a colour left alone follows the fur
  'head & face': [
    ['eyeRadius', 0.02, 0.14], ['eyeSpread', 0.1, 0.9], ['eyeLift', -0.5, 0.6],
    ['eyeFront', 0.2, 1.4],
    ['pupilScale', 0.1, 0.9], ['pupilDepth', 0.0, 0.06],
    ['eyeColor', 'color'], ['pupilColor', 'color'],
    ['eyeSheen', 0, 1], ['eyeSheenRough', 0, 1], ['eyeRough', 0, 1], ['eyeClearcoat', 0, 1],
    ['facePaint', FACE_PAINTS], ['facePaintSize', 0.3, 2.2], ['facePaintDown', -1.5, 2], ['facePaintOut', 0, 2], ['facePaintColor', 'color', facePaintColorOf],
  ],
  tail: [
    ['tailLength', 0.04, 0.50], ['tailThick', 0.006, 0.06],
    ['tailDroop', -1.6, 1.2], ['tailCurl', -0.8, 0.8],
    ['tailStiff', 60, 800], ['tailZeta', 0.1, 1.2],
  ],
  rig: [
    ['hipInset', 0.0, 0.14], ['legSpread', 0.02, 0.20], ['limbThick', 0.012, 0.070],
    ['upperArmLen', 0.03, 0.20], ['forearmLen', 0.03, 0.20],
    ['shoulderOut', 0.4, 1.6], ['shoulderLift', -0.2, 0.9],
    ['clampArmOut', 'bool'], ['armClearance', 0, 0.03],
    ['headYawMax', 0.4, 5.0],
    ['heldColor', 'color'], ['holdItem', 'bool'],
  ],
  'debug pose': [
    ['armSwing', -1.6, 1.6], ['armOut', -1.0, 3.0], ['elbowBend', -0.2, 2.4],
    ['legSwing', -1.0, 1.0], ['kneeBend', -0.4, 2.4], ['hipFlex', -0.6, 1.9],
    ['legOut', -0.2, 1.6], ['legOutAlt', -0.8, 0.8],
    ['spineBend', -0.7, 1.2], ['spineRoll', -0.8, 0.8],
    ['earPerk', -1.2, 1.2], ['earSplay', -0.8, 1.2],
    ['armSwingAlt', -1.0, 1.0], ['armOutAlt', -1.5, 1.5], ['spineTwist', -1.2, 1.2],
    ['headYaw', -5.0, 5.0], ['headPitch', -0.9, 0.9], ['headTilt', -0.8, 0.8],
    ['tailLift', -1.2, 1.2], ['tailWag', 0, 1.5], ['earFlap', 0, 1.5],
    ['blink', 0, 1],
  ],
});
