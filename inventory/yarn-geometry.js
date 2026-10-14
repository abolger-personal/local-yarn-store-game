import * as THREE from 'three';
import { SHAPE_UNITS } from './catalog.js';

export const TIERS = Object.freeze(['chunky', 'low', 'med']);
export const tierIndex = (t) => Math.max(0, TIERS.indexOf(t));

export const YARN_FAMILIES = Object.freeze(['ball', 'cake', 'skein', 'cone', 'mini']);

const SEG = {
  ball:    { w: [8, 12, 16], h: [6, 8, 12] },
  cake:    { w: [8, 12, 16] },
  cone:    { w: [8, 12, 16] },
  skein:   { r: [5, 6, 8], t: [12, 16, 24] },
  mini:    { r: [4, 5, 6], t: [8, 12, 16] },
};

const v2 = (x, y) => new THREE.Vector2(x, y);

const SKEIN_DEPTH = 1.6, SKEIN_LIFT = 0.8;

const CAKE_PROFILE = [
  [0.08, 0.00], [0.48, 0.00], [0.50, 0.10], [0.50, 0.66], [0.46, 0.74], [0.20, 0.74], [0.14, 0.62],
].map(([x, y]) => v2(x, y));

const CONE_PROFILE = [
  [0.06, 0.00], [0.34, 0.00], [0.31, 0.07], [0.13, 0.90], [0.08, 1.00], [0.03, 1.00],
].map(([x, y]) => v2(x, y));

// YARN-ASSET-SPIKE.md §11: lift is sin(t), and twist must exceed the tube radius.
function skeinCurve(length, thickness, twist) {
  const pts = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      length * Math.cos(t),
      0.5 + twist * Math.sin(t),
      thickness * Math.sin(2 * t) / 2,
    ));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

const BUILDERS = {
  ball: (t) => new THREE.SphereGeometry(0.5, SEG.ball.w[t], SEG.ball.h[t]).scale(1, 0.92, 1),

  cake: (t) => new THREE.LatheGeometry(CAKE_PROFILE, SEG.cake.w[t]),

  cone: (t) => new THREE.LatheGeometry(CONE_PROFILE, SEG.cone.w[t]),

  // YARN-ASSET-SPIKE.md §15; YARN.md "Units": a hank half as tall as it is long, whatever its units
  skein: (t) => new THREE.TubeGeometry(
    skeinCurve(0.35, 0.13, 0.17), SEG.skein.t[t], 0.125, SEG.skein.r[t], true).scale(1, SKEIN_LIFT, SKEIN_DEPTH),

  // YARN-ASSET-SPIKE.md §15
  mini: (t) => new THREE.TubeGeometry(
    skeinCurve(0.20, 0.082, 0.155), SEG.mini.t[t], 0.115, SEG.mini.r[t], true).scale(1, 0.50, 1),

};

function seat(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** @param {string} name @param {number|string} [tier] index into TIERS, or its name */
export function buildFamily(name, tier = 1) {
  const make = BUILDERS[name];
  if (!make) throw new Error(`unknown yarn family: ${name}`);
  return seat(make(typeof tier === 'string' ? tierIndex(tier) : tier));
}

export const FAMILY_FOOTPRINT = Object.freeze({
  ball:    [1, 1],
  cake:    [1, 1],
  cone:    [1, 1],
  skein:   [2, 1],
  mini:    [1, 1],
});

/** @returns {[number, number]} */
export const familyFootprint = (name, bulk = 1) => {
  const [w, h] = FAMILY_FOOTPRINT[name] ?? [1, 1];
  return [w + bulk - 1, h + bulk - 1];
};

export const buildAll = (tier = 1) =>
  Object.fromEntries(YARN_FAMILIES.map((n) => [n, buildFamily(n, tier)]));

export const BANDS = Object.freeze({
  ball:    { r: 0.53, y: 0.50, h: 0.30, axis: 'y' },
  cake:    { r: 0.53, y: 0.49, h: 0.34, axis: 'y' },
  // YARN-ASSET-SPIKE.md §11
  cone:    { r: 0.285, y: 0.28, h: 0.10, axis: 'y' },
  skein:   { r: 0.37 * SKEIN_LIFT, rz: 0.215 * SKEIN_DEPTH, y: 0.50, h: 0.26, axis: 'x' },
  mini:    { r: 0.178, y: 0.50, h: 0.20, axis: 'x' },
});

const _height = new Map();
const familyHeight = (name) => {
  if (!_height.has(name)) _height.set(name, buildFamily(name, 1).boundingBox.max.y);
  return _height.get(name);
};

/** @param {number|string} [tier] */
export const buildBand = (tier = 1) =>
  new THREE.CylinderGeometry(1, 1, 1, [10, 14, 18][typeof tier === 'string' ? tierIndex(tier) : tier],
                             1, true);

const _rz = new THREE.Matrix4();
const _tz = new THREE.Matrix4();

export function bandMatrix(name, target = new THREE.Matrix4()) {
  const b = BANDS[name];
  if (!b) return null;
  target.makeScale(b.r, b.h, b.rz ?? b.r);
  if (b.axis === 'x') target.premultiply(_rz.makeRotationZ(Math.PI / 2));
  return target.premultiply(_tz.makeTranslation(0, b.y * familyHeight(name), 0));
}

function tailCurve() {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 2.3;
    const r = 0.42 * (1 - 0.55 * t);
    pts.push(new THREE.Vector3(Math.cos(a) * r, -0.55 * t, Math.sin(a) * r * 0.7));
  }
  return new THREE.CatmullRomCurve3(pts, false);
}

/** @param {number|string} [tier] */
export const buildTail = (tier = 1) => {
  const t = typeof tier === 'string' ? tierIndex(tier) : tier;
  return new THREE.TubeGeometry(tailCurve(), [8, 12, 16][t], 0.075, [3, 4, 5][t], false);
};

export const TAILS = Object.freeze({
  // YARN-ASSET-SPIKE.md §10
  ball:    { at: [0.22, 0.88, 0.17], size: 0.26, spin: 0.6 },
  cake:    { at: [0.00, 0.74, 0.00], size: 0.32, spin: 0.0 },
  skein:   { at: [0.34, 0.44, 0.10 * SKEIN_DEPTH], size: 0.26, spin: 2.2 },
  mini:    { at: [0.22, 0.46, 0.08], size: 0.20, spin: 2.0 },
  cone:    null,
});

const _ts = new THREE.Matrix4();
const _tr = new THREE.Matrix4();

export function tailMatrix(name, target = new THREE.Matrix4()) {
  const t = TAILS[name];
  if (!t) return null;
  target.makeScale(t.size, t.size, t.size);
  target.premultiply(_tr.makeRotationY(t.spin));
  return target.premultiply(_ts.makeTranslation(t.at[0], t.at[1] * familyHeight(name), t.at[2]));
}

export const triangleCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

const _extent = new Map();

/** @param {string} name @param {number|string} [tier] */
export function familyExtent(name, tier = 1) {
  const cacheKey = `${name}@${tier}`;
  if (_extent.has(cacheKey)) return _extent.get(cacheKey);
  const g = buildFamily(name, tier);
  const b = g.boundingBox;
  const out = Object.freeze([b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]);
  g.dispose();
  _extent.set(cacheKey, out);
  return out;
}

// YARN-ASSET-SPIKE.md §14: squash to meet the layer grid, never stretch.
export const SETTLE_MIN = 0.82;

function meshVolume(g) {
  const p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count;
  const at = (i) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i) : i);
  let v = 0;
  for (let i = 0; i < n; i += 3) v += at(i).dot(at(i + 1).cross(at(i + 2)));
  return Math.abs(v) / 6;
}

const _perUnit = new Map();
const volumePerUnit = (name, tier) => {
  const cacheKey = `${name}@${tier}`;
  if (!_perUnit.has(cacheKey)) {
    const g = buildFamily(name, tier);
    const [uw, , ud] = familyExtent(name, tier);
    _perUnit.set(cacheKey, meshVolume(g) / Math.max(uw, ud) ** 3 / SHAPE_UNITS[name]);
    g.dispose();
  }
  return _perUnit.get(cacheKey);
};

const SCALED_TO_UNITS = ['ball', 'cone'];

/** YARN.md "Units": shrink ball and cone inside their footprints until drawn volume follows their units;
 * the skein fills its footprint.
 * @param {string} family @param {number|string} [tier] */
export const unitScale = (family, tier = 1) => (!SCALED_TO_UNITS.includes(family) ? 1 : Math.cbrt(
  Math.min(...SCALED_TO_UNITS.map((n) => volumePerUnit(n, tier))) / volumePerUnit(family, tier)));

/**
 * @param {string} family
 * @param {number} footW
 * @param {number} footD
 * @param {{cell: number, boxHeight: number, fill?: number, tier?: number|string,
 *          settleMin?: number}} grid
 */
export function yarnFit(family, footW, footD,
                        { cell, boxHeight, fill = 0.9, tier = 1, settleMin = SETTLE_MIN }) {
  const [uw, uh, ud] = familyExtent(family, tier);
  const k = unitScale(family, tier) * Math.min((footW * cell * fill) / uw, (footD * cell * fill) / ud);
  const natural = k * uh;
  const layers = Math.max(1, Math.ceil((natural * settleMin) / boxHeight));
  const settle = Math.min(1, (layers * boxHeight) / natural);
  return { k, ky: k * settle, layers, w: footW, h: footD };
}

const _aspect = new Map();

/** @param {string} name @param {number|string} [tier] */
export function familyAspect(name, tier = 1) {
  const cacheKey = `${name}@${tier}`;
  if (_aspect.has(cacheKey)) return _aspect.get(cacheKey);
  const g = buildFamily(name, tier);
  const b = g.boundingBox;
  const d = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  const m = Math.max(...d);
  const out = Object.freeze(d.map((v) => v / m));
  g.dispose();
  _aspect.set(cacheKey, out);
  return out;
}

/** @param {string} a @param {string} b @param {number|string} [tier] */
export const aspectDistance = (a, b, tier = 1) => {
  const [p, q] = [familyAspect(a, tier), familyAspect(b, tier)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const _relief = new Map();

const DOWN = new THREE.Vector3(0, -1, 0);

const RELIEF_N = 48;

/**
 * @param {string} name @param {number|string} [tier]
 * @returns {{top: (x: number, z: number) => number, bottom: (x: number, z: number) => number}}
 */
export function familyRelief(name, tier = 1) {
  const cacheKey = `${name}@${tier}`;
  if (_relief.has(cacheKey)) return _relief.get(cacheKey);
  const geo = buildFamily(name, tier);
  const b = geo.boundingBox.clone();
  const { top, bottom } = castRelief(geo, b);
  geo.dispose();
  const out = {
    top: (x, z) => sampleRelief(top, b, x, z, Math.max),
    bottom: (x, z) => sampleRelief(bottom, b, x, z, Math.min),
  };
  _relief.set(cacheKey, out);
  return out;
}


function castRelief(geo, b) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const N = RELIEF_N, size = (N + 1) * (N + 1);
  const top = new Float32Array(size).fill(NaN), bottom = new Float32Array(size).fill(NaN);
  const at = (i, lo, hi) => lo + ((hi - lo) * i) / N + 1e-5;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      ray.set(new THREE.Vector3(at(i, b.min.x, b.max.x), b.max.y + 1, at(j, b.min.z, b.max.z)), DOWN);
      const ys = ray.intersectObject(mesh).map((h) => h.point.y - b.min.y);
      if (ys.length) { top[j * (N + 1) + i] = Math.max(...ys); bottom[j * (N + 1) + i] = Math.min(...ys); }
    }
  return { top, bottom };
}

function sampleRelief(map, b, x, z, edge) {
  const N = RELIEF_N;
  const fx = ((x - b.min.x) / (b.max.x - b.min.x)) * N, fz = ((z - b.min.z) / (b.max.z - b.min.z)) * N;
  if (!(fx >= 0 && fx <= N && fz >= 0 && fz <= N)) return NaN;
  const i = Math.min(N - 1, Math.floor(fx)), j = Math.min(N - 1, Math.floor(fz));
  const tx = fx - i, tz = fz - j, row = N + 1;
  const v = [map[j * row + i], map[j * row + i + 1], map[(j + 1) * row + i], map[(j + 1) * row + i + 1]];
  if (v.every(Number.isFinite))
    return (v[0] * (1 - tx) + v[1] * tx) * (1 - tz) + (v[2] * (1 - tx) + v[3] * tx) * tz;
  const hit = v.filter(Number.isFinite);
  return hit.length ? edge(...hit) : NaN;
}

/**
 * @param {string|null} family
 * @param {{w: number, h: number, layers?: number, yaw?: number}} item
 * @param {{cell: number, boxHeight: number, fill?: number, tier?: number|string}} grid
 */
export function restingSolid(family, item, grid) {
  const { cell, boxHeight, fill = 0.9, tier = 1 } = grid;
  const cos = Math.cos(item.yaw ?? 0), sin = Math.sin(item.yaw ?? 0);
  const local = (dx, dz) => [dx * cos - dz * sin, dx * sin + dz * cos];
  if (!family) {
    const hw = (item.w * cell * fill) / 2, hd = (item.h * cell * fill) / 2;
    const tall = boxHeight * (item.layers ?? 1);
    const inside = (dx, dz) => { const [x, z] = local(dx, dz); return Math.abs(x) <= hw && Math.abs(z) <= hd; };
    return { top: (dx, dz) => (inside(dx, dz) ? tall : NaN), bottom: (dx, dz) => (inside(dx, dz) ? 0 : NaN),
             r: Math.hypot(hw, hd) };
  }
  const { k, ky } = yarnFit(family, item.w, item.h, { cell, boxHeight, fill, tier });
  const relief = familyRelief(family, tier);
  const [uw, , ud] = familyExtent(family, tier);
  const at = (fn) => (dx, dz) => { const [x, z] = local(dx, dz); return fn(x / k, z / k) * ky; };
  return { top: at(relief.top), bottom: at(relief.bottom), r: (k * Math.hypot(uw, ud)) / 2 };
}
