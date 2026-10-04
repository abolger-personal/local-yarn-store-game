// Yarn as real geometry — one instanced mesh per shape, plus band, tail and ink outline.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

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

// ---------------------------------------------------------------- yarn
//
// The look, as SETTLED by the bake-off — see ai_planning_sessions/inventory/YARN-ASSET-SPIKE.md
// §8. These are results, not knobs: the demo is where they get retuned, and giving the shop its
// own sliders is how the two pages would start disagreeing about what yarn looks like.
export const YARN = {
  tier:   'low',                                                    // the measured poly budget
  // A matcap MULTIPLIES albedo, so its lit midtone belongs near 1.0 or it quietly darkens the
  // whole palette. Contrast comes from the shadow side descending instead.
  matcap: { base: '#f0ebe3', light: '#ffffff', shadow: '#4a3550', rim: 1.0, wrap: 0.55 },
  paper:  { rim: 0.0, wrap: 0.22 },                                 // the band: matte, no sheen
  hatch:  { freq: 26, depth: 0.16 },                                // wound-strand marks
  outlineWidth: 0.016,
  edgeColor: '#1b1418',
  bandColor: '#f6efe1',
};

// Strand density per yarn weight, inverse to bulk and then some: a bulky ball is also drawn three
// times larger, so without the extra falloff its strands would still be finer on screen than a
// lace ball's. Costs one float per instance (addHatchScale).
const HATCH_FOR_BULK = [1.8, 1.0, 0.62];

// Everything the shared fit needs to know about THIS page's grid. The shop's footprint comes from
// catalog.js (a yarn's weight), not from the geometry — see yarnFit.
export const YARN_FIT = { cell: CELL, boxHeight: BOX_H, fill: FILL, tier: YARN.tier };

// One InstancedMesh per shape, an inverted-hull outline sharing its instanceMatrix, and one band
// and one tail mesh covering every shape at once (the per-shape placement is baked into the
// instance matrix, so neither needs a mesh per shape).
//
// All of them are allocated at CAPACITY and indexed by the ITEM'S OWN index, exactly like the
// notion boxes — so there is no second slot-allocation scheme to keep in step with items[]. The
// cost is a few mostly-empty matrix buffers and some zero-scale instances the rasteriser throws
// away before it shades anything; the saving is that refresh(index) stays one number, which is
// the invariant every pick, place and NPC purchase in this file already relies on.
export const yarnMeshes = {};    // shape -> InstancedMesh

const yarnHulls = {};     // shape -> InstancedMesh sharing the above's instanceMatrix

export let bandMesh = null, tailMesh = null;

let yarnMatcap = null, yarnPaper = null;

const _yarnMat = new THREE.Matrix4();

const _bandLocal = new THREE.Matrix4();

const _tailLocal = new THREE.Matrix4();

const _yarnCol = new THREE.Color();

const _q = new THREE.Quaternion();

const _s3 = new THREE.Vector3();

const _p3 = new THREE.Vector3();

/** Matcap yarn, optionally on matte paper (the band) and optionally hatched (never the band). */
function yarnMat({ paper = false, hatch = false } = {}) {
  yarnMatcap ??= makeMatcap(YARN.matcap);
  yarnPaper ??= makePaperMatcap(YARN.paper);
  // A second matcap texture is the ENTIRE cost of giving paper its own surface: no extra draw
  // call, no extra material slot, no shader variant.
  const m = yarnMaterial('matcap', { matcap: paper ? yarnPaper : yarnMatcap });
  // Out of the tone mapper, like the UI colours (config.js). A matcap is UNLIT: its shading is
  // painted in, so it never receives the shop's bright lights that let lit materials survive ACES.
  // Through ACES at the shop's exposure the palette's mean lightness fell from 0.48 to 0.34 and its
  // darks to near black (0.19 -> 0.06): the yarn sat in a basement while the lit room and cast
  // around it were bright. Measured in scratchpad/yarn-tone.mjs. The cost: yarn does not dim with
  // the evening light, since it never took the light in the first place.
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
  // Start every slot HIDDEN rather than leaning on the zero-filled buffer three.js allocates. An
  // all-zero matrix has w = 0 as well as no scale, so it divides by zero in the perspective step
  // instead of collapsing to a point — same invisible result on most drivers, and not the kind of
  // thing to leave to a driver.
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

/** Blank an item's yarn instances. `except` is the one shape that is about to be drawn instead. */
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

/**
 * Where one ball, cone or skein sits, as a matrix — and the horizontal scale that produced it,
 * which the contact shadow needs too.
 *
 * UNIFORM horizontally, settled vertically. Never one scale per axis: that is what turned skeins
 * into donuts and left everything stacked on air. See yarnFit.
 */
function yarnMatrix(item, p, F, grow) {
  const fit = yarnFit(item.shape, item.w, item.h, YARN_FIT);
  const k = fit.k * grow;
  _yarnMat.compose(_p3.set(p.cx, p.base, p.cz), _q.setFromAxisAngle(UP, p.yaw),
                   _s3.set(k, fit.ky * grow, k)).premultiply(F);
  return k;
}

/** The wool itself: colour per instance, and a strand density that follows the yarn's weight. */
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

/**
 * The ball band and the loose yarn end, each a family-local matrix premultiplied onto the item's.
 *
 * A band is PAPER: near-white and independent of the wool, which is the readability win — it
 * breaks a plain blob into two colour regions that survive being 40px tall. The tail is the
 * opposite: the end IS the yarn, so it takes the ball's own colour, and that is what makes it
 * read as a strand escaping the wind rather than a separate object stuck on.
 */
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

/**
 * Sized to what is actually DRAWN, not to the slot.
 *
 * With a uniform fit a shape rarely fills its footprint exactly, and a shadow bigger than the
 * object is a way to make it look like it is hovering — the opposite of what a contact shadow is
 * for. So this cannot reuse paint.js's box shadow, which is sized to the slot.
 */
function paintYarnShadow(index, item, p, F, k) {
  const [uw, , ud] = familyExtent(item.shape, YARN.tier);
  _pos.set(p.shX ?? p.cx, p.shadowBase + 0.003, p.shZ ?? p.cz);
  shadows.setMatrixAt(index,
    placeMatrix(_pos, k * uw * 1.02, k * ud * 1.02, p.yaw, _shadowMat).premultiply(F));
  shadows.instanceMatrix.needsUpdate = true;
}

/**
 * One ball, cone or skein — the real mesh, in place of the box-with-a-sticker every other item
 * gets. Same contract as paintInstance: it takes the same placement record, everything is
 * computed in LEVEL-LOCAL space, and the level's frame projects it into the world — so a tilted
 * wall shelf needs no separate version.
 */
export function paintYarn(display, index, p) {
  const item = items[index];
  // The caller has already blanked this item's box and labels — see paintInstance. Doing it here
  // meant yarn.js importing paint.js while paint.js imported yarn.js, which is a cycle for no
  // reason: the dispatcher knows it is switching representations, the painter does not need to.
  hideYarn(index, item.shape);
  const F = levelFrame(display, p.shelf ?? item.shelf);
  const k = yarnMatrix(item, p, F, p.grow ?? 1);
  paintWool(index, item);
  paintTrim(index, item);
  paintYarnShadow(index, item, p, F, k);
}
