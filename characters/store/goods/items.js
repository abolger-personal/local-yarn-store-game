import * as THREE from 'three';
import { CARD_LOOK, extendAtlas, makeField, makeEdge, makeShadows, makeBoxes, makeSizeAtlas } from '../../../inventory/notions.js';
import { HOOK_SIZES_MM } from '../../../inventory/catalog.js';
import { scene } from '../scene/stage.js';
import { PLACEHOLDER_ART } from './art.js';

export let atlas = null, sizeAtlas = null;
export let sideField = null, sideEdge = null, fieldTop = null, edgeTop = null;
export let shadows = null, boxes = null, sizeSide = null, sizeTop = null;


// ponytail: hard ceiling over the GUI's 200-box max (InstancedMesh cannot grow); reallocate if that rises.
export const CAPACITY = 256;
export const FILL = 0.9;

export const _pos = new THREE.Vector3();
export const _mat = new THREE.Matrix4();
export const _topMat = new THREE.Matrix4();
export const _sizeMat = new THREE.Matrix4();
export const _sizeTopMat = new THREE.Matrix4();
export const _boxMat = new THREE.Matrix4();
export const _shadowMat = new THREE.Matrix4();
export const _col = new THREE.Color();
export const _hide = new THREE.Matrix4().makeScale(0, 0, 0);

export function buildItemMeshes(loaded) {
  atlas = extendAtlas(loaded, PLACEHOLDER_ART);
  sideField = makeField(atlas.texture, CAPACITY * 4, { unlit: true, shade: CARD_LOOK.shade });
  sideEdge = makeEdge(sideField);
  fieldTop = makeField(atlas.texture, CAPACITY, { unlit: true, shade: CARD_LOOK.shade });
  edgeTop = makeEdge(fieldTop);
  shadows = makeShadows(CAPACITY);
  boxes = makeBoxes(CAPACITY, '#e7ddc9');
  sizeAtlas = makeSizeAtlas(HOOK_SIZES_MM.map((mm) => mm.toFixed(1)));
  sizeSide = makeField(sizeAtlas.texture, CAPACITY * 4, { unlit: true, shade: 0 });
  sizeTop = makeField(sizeAtlas.texture, CAPACITY, { unlit: true, shade: 0 });
  scene.add(sideField, sideEdge, fieldTop, edgeTop, shadows, boxes, sizeSide, sizeTop);
}
