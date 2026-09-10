// The stock registry: items[], the instanced meshes every item draws into, and the scratch
// objects the paint path reuses.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.
//
// One rule holds this file together: an item's index in `items` IS its instance index in every
// mesh here. Not a lookup, an identity — see paint.js. It is what lets refresh(index) stay one
// number across picking, placing, NPC purchases and the yarn meshes added later.

import * as THREE from 'three';
import { extendAtlas, makeField, makeEdge, makeShadows, makeBoxes, makeSizeAtlas } from '../../../inventory/notions.js';
import { HOOK_SIZES_MM } from '../../../inventory/catalog.js';
import { scene } from '../scene/stage.js';
import { PLACEHOLDER_ART } from './art.js';

export let atlas = null, sizeAtlas = null;
export let sideField = null, sideEdge = null, fieldTop = null, edgeTop = null;
export let shadows = null, boxes = null, sizeSide = null, sizeTop = null;


// Sized for the largest layout the dropdowns allow (6 displays plus every NPC's seeded targets),
// with headroom. An InstancedMesh cannot grow after allocation, so this is a hard ceiling.
export const CAPACITY = 256;
export const FILL = 0.9;

// Scratch. Allocated once and reused: the paint path runs per item per frame, and a Vector3 per
// item per frame is the classic way to hand the garbage collector a stutter.
export const _pos = new THREE.Vector3();
export const _mat = new THREE.Matrix4();
export const _topMat = new THREE.Matrix4();
export const _sizeMat = new THREE.Matrix4();
export const _sizeTopMat = new THREE.Matrix4();
export const _boxMat = new THREE.Matrix4();
export const _shadowMat = new THREE.Matrix4();
export const _col = new THREE.Color();
export const _hide = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Build every instanced mesh the stock draws into, once the atlas has loaded.
 *
 * Lives here rather than in main.js because these are this module's own bindings: assigning them
 * from the boot script meant main.js reaching in and writing another module's state, which ES
 * modules forbid outright once the file is split (you cannot assign to an import).
 *
 * It does NOT build the yarn meshes, though it used to. yarn.js reads `FILL` from this module at
 * module-eval time, so importing yarn.js from here closed a cycle and put `FILL` in the TDZ:
 * "Cannot access 'FILL' before initialization", and a blank page. main.js calls buildYarnMeshes
 * immediately after this instead.
 */
export function buildItemMeshes(loaded) {
  // Yarn, patterns and knitting needles have no illustrations yet. Compositing placeholders into
  // the SAME atlas keeps the whole shop on one draw call per label channel — see extendAtlas.
  atlas = extendAtlas(loaded, PLACEHOLDER_ART);
  // 4x capacity: instance index*4 + k is face k of item `index`. One mesh, one draw call, four
  // labelled sides — see paintInstance.
  sideField = makeField(atlas.texture, CAPACITY * 4, { unlit: true, shade: 0.28 });
  sideEdge = makeEdge(sideField, '#1b1418');
  sideEdge.material.userData.uniforms.uGrow.value = 1.07;
  fieldTop = makeField(atlas.texture, CAPACITY, { unlit: true, shade: 0.28 });
  edgeTop = makeEdge(fieldTop, '#1b1418');
  edgeTop.material.userData.uniforms.uGrow.value = 1.07;
  shadows = makeShadows(CAPACITY);
  boxes = makeBoxes(CAPACITY, '#e7ddc9');
  sizeAtlas = makeSizeAtlas(HOOK_SIZES_MM.map((mm) => mm.toFixed(1)));
  sizeSide = makeField(sizeAtlas.texture, CAPACITY * 4, { unlit: true, shade: 0 });
  sizeTop = makeField(sizeAtlas.texture, CAPACITY, { unlit: true, shade: 0 });
  scene.add(sideField, sideEdge, fieldTop, edgeTop, shadows, boxes, sizeSide, sizeTop);
}
