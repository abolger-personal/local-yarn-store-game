import { items } from '../core/state.js';
import { YARN_SHAPES } from '../../../inventory/catalog.js';
import { placeMatrix } from '../../../inventory/notions.js';
import {
  BANDS,
  TAILS,
  bandMatrix,
  buildBand,
  buildFamily,
  buildTail,
  familyExtent,
  tailMatrix,
  yarnFit,
} from '../../../inventory/yarn-geometry.js';
import {
  addHatchScale,
  applyHatching,
  bakeVertexAO,
  makeHull,
  makeMatcap,
  makePaperMatcap,
  yarnMaterial,
} from '../../../inventory/yarn-look.js';
import * as THREE from 'three';
import { BOX_H, CELL } from '../core/config.js';
import { scene } from '../scene/stage.js';
import { UP } from '../scene/room.js';
import { levelFrame } from '../scene/displays.js';
import { CAPACITY, FILL, _hide, _pos, _shadowMat, shadows } from './items.js';

// inventory/YARN-ASSET-SPIKE.md §16: settled values, retuned in the demo, not here
export const YARN = {
  tier:   'low',
  matcap: { base: '#f0ebe3', light: '#ffffff', shadow: '#4a3550', rim: 1.0, wrap: 0.55 },
  paper:  { rim: 0.0, wrap: 0.22 },
  hatch:  { freq: 26, depth: 0.16 },
  outlineWidth: 0.016,
  edgeColor: '#1b1418',
  bandColor: '#f6efe1',
};

// inventory/YARN-ASSET-SPIKE.md §11: strand density per weight
const HATCH_FOR_BULK = [1.8, 1.0, 0.62];

export const YARN_FIT = { cell: CELL, boxHeight: BOX_H, fill: FILL, tier: YARN.tier };

export const yarnMeshes = {};

const yarnHulls = {};

export let bandMesh = null, tailMesh = null;

let yarnMatcap = null, yarnPaper = null;

const _yarnMat = new THREE.Matrix4();

const _bandLocal = new THREE.Matrix4();

const _tailLocal = new THREE.Matrix4();

const _yarnCol = new THREE.Color();

const _q = new THREE.Quaternion();

const _s3 = new THREE.Vector3();

const _p3 = new THREE.Vector3();

function yarnMat({ paper = false, hatch = false } = {}) {
  yarnMatcap ??= makeMatcap(YARN.matcap);
  yarnPaper ??= makePaperMatcap(YARN.paper);
  const m = yarnMaterial('matcap', { matcap: paper ? yarnPaper : yarnMatcap });
  m.toneMapped = false;
  if (hatch) applyHatching(m, YARN.hatch);
  return m;
}

function yarnInstances(geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.instanceColor =
    new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3).fill(1), 3);
  mesh.count = CAPACITY;
  mesh.frustumCulled = false;
  for (let i = 0; i < CAPACITY; i++) mesh.setMatrixAt(i, _hide);
  scene.add(mesh);
  return mesh;
}

export function buildYarnMeshes() {
  for (const shape of YARN_SHAPES) {
    const mesh = yarnInstances(bakeVertexAO(buildFamily(shape, YARN.tier)), yarnMat({ hatch: true }));
    addHatchScale(mesh, CAPACITY);
    yarnMeshes[shape] = mesh;
    yarnHulls[shape] = makeHull(mesh, { color: YARN.edgeColor, width: YARN.outlineWidth });
    scene.add(yarnHulls[shape]);
  }
  bandMesh = yarnInstances(buildBand(YARN.tier), yarnMat({ paper: true }));
  tailMesh = yarnInstances(buildTail(YARN.tier), yarnMat());
}

export function hideYarn(index, except = null) {
  for (const shape of YARN_SHAPES) {
    if (shape === except) continue;
    yarnMeshes[shape].setMatrixAt(index, _hide);
    yarnMeshes[shape].instanceMatrix.needsUpdate = true;
  }
  for (const m of [bandMesh, tailMesh]) {
    m.setMatrixAt(index, _hide);
    m.instanceMatrix.needsUpdate = true;
  }
}

function yarnMatrix(item, p, F, grow) {
  const fit = yarnFit(item.shape, item.w, item.h, YARN_FIT);
  const k = fit.k * grow;
  _yarnMat.compose(_p3.set(p.cx, p.base, p.cz), _q.setFromAxisAngle(UP, p.yaw),
                   _s3.set(k, fit.ky * grow, k)).premultiply(F);
  return k;
}

function paintWool(index, item) {
  const mesh = yarnMeshes[item.shape];
  mesh.setMatrixAt(index, _yarnMat);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(index, _yarnCol.set(item.color));
  mesh.instanceColor.needsUpdate = true;
  const hs = mesh.userData.hatchScale;
  hs.setX(index, HATCH_FOR_BULK[(item.w ?? 1) - 1] ?? 1);
  hs.needsUpdate = true;
}

function paintTrim(index, item) {
  if (BANDS[item.shape]) {
    bandMesh.setMatrixAt(index, bandMatrix(item.shape, _bandLocal).premultiply(_yarnMat));
    bandMesh.instanceMatrix.needsUpdate = true;
    bandMesh.setColorAt(index, _yarnCol.set(YARN.bandColor));
    bandMesh.instanceColor.needsUpdate = true;
  }
  if (TAILS[item.shape]) {
    tailMesh.setMatrixAt(index, tailMatrix(item.shape, _tailLocal).premultiply(_yarnMat));
    tailMesh.instanceMatrix.needsUpdate = true;
    tailMesh.setColorAt(index, _yarnCol.set(item.color));
    tailMesh.instanceColor.needsUpdate = true;
  }
}

function paintYarnShadow(index, item, p, F, k) {
  const [uw, , ud] = familyExtent(item.shape, YARN.tier);
  _pos.set(p.shX ?? p.cx, p.shadowBase + 0.003, p.shZ ?? p.cz);
  shadows.setMatrixAt(index,
    placeMatrix(_pos, k * uw * 1.02, k * ud * 1.02, p.yaw, _shadowMat).premultiply(F));
  shadows.instanceMatrix.needsUpdate = true;
}

export function paintYarn(display, index, p) {
  const item = items[index];
  hideYarn(index, item.shape);
  const F = levelFrame(display, p.shelf ?? item.shelf);
  const k = yarnMatrix(item, p, F, p.grow ?? 1);
  paintWool(index, item);
  paintTrim(index, item);
  paintYarnShadow(index, item, p, F, k);
}
