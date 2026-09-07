// Notions as instanced billboards, and the slot grid they sit in.
//
// Pure: nothing here touches a scene, camera or DOM.
//
// Two decisions from inventory/DESIGN-DECISIONS.md are load-bearing here:
//   1. Every notion is the SAME quad. A hook differs from a button only by which cell of the
//      atlas it samples, so the whole shop is one InstancedMesh and one draw call.
//   2. The atlas stores shape in alpha with white RGB, so colour is per-instance and a theme
//      that only recolours ships no new art.

import * as THREE from 'three';

export const EMPTY = -1;

// ---------------------------------------------------------------- atlas

export async function loadAtlas(baseUrl, theme = 'default') {
  const manifest = await (await fetch(`${baseUrl}/${theme}.json`)).json();
  const texture = await new THREE.TextureLoader().loadAsync(`${baseUrl}/${manifest.atlas}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { texture, manifest, names: Object.keys(manifest.cells) };
}

/** Atlas rect for one notion, as the shader wants it: origin plus size. */
export function cellRect(manifest, name) {
  const c = manifest.cells[name];
  if (!c) return [0, 0, 1, 1];
  return [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0];
}

// ---------------------------------------------------------------- slot grid

export const makeGrid = (cols, rows, cell) => ({ cols, rows, cell, slots: new Array(cols * rows).fill(EMPTY) });

export const gridSize = (grid) => ({ w: grid.cols * grid.cell, d: grid.rows * grid.cell });

/**
 * Slot under a point on the surface, or -1 if outside.
 * This is the O(1) lookup the design record calls for: raycast the surface ONCE, convert to a
 * grid index. Items are never raycast, and with instancing they are not raycastable anyway.
 */
export function slotAt(grid, x, z) {
  const { w, d } = gridSize(grid);
  const col = Math.floor((x + w / 2) / grid.cell);
  const row = Math.floor((z + d / 2) / grid.cell);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return EMPTY;
  return row * grid.cols + col;
}

/** Centre of a slot, in surface-local space. */
export function slotCentre(grid, index, target = new THREE.Vector3()) {
  const { w, d } = gridSize(grid);
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return target.set(
    (col + 0.5) * grid.cell - w / 2,
    0,
    (row + 0.5) * grid.cell - d / 2,
  );
}

const _centre = new THREE.Vector3();

/**
 * The slot a click should grab, which is not always the slot it landed in.
 * An ink drawing occupies a fraction of its slot, so an exact hit test feels like the item is
 * not where it looks. Falls back to the nearest occupied neighbour within `radius`.
 */
export function pickSlot(grid, x, z, radius = grid.cell * 0.75) {
  const exact = slotAt(grid, x, z);
  if (exact !== EMPTY && grid.slots[exact] !== EMPTY) return exact;

  let best = EMPTY;
  let bestDist = radius * radius;
  for (let i = 0; i < grid.slots.length; i++) {
    if (grid.slots[i] === EMPTY) continue;
    slotCentre(grid, i, _centre);
    const dist = (_centre.x - x) ** 2 + (_centre.z - z) ** 2;
    if (dist < bestDist) [best, bestDist] = [i, dist];
  }
  return best;
}

/** Lines matching the ACTUAL slot grid. `GridHelper` only draws squares. */
export function makeGridLines(grid, color = '#8d8172') {
  const { w, d } = gridSize(grid);
  const points = [];
  for (let c = 0; c <= grid.cols; c++) {
    const x = c * grid.cell - w / 2;
    points.push(x, 0, -d / 2, x, 0, d / 2);
  }
  for (let r = 0; r <= grid.rows; r++) {
    const z = r * grid.cell - d / 2;
    points.push(-w / 2, 0, z, w / 2, 0, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

// ---------------------------------------------------------------- instanced field

// Remaps the quad's UVs into its atlas cell. Without this every notion would need its own
// geometry or its own material, which is the cost the whole approach exists to avoid.
// `vLocalUv` survives the remap so the fragment stage can still shade across the card.
function patchAtlasUV(material, extraVertex = '', extraFragment = '') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCell;\nvarying vec2 vLocalUv;\nuniform float uGrow;\nuniform float uPush;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLocalUv = vMapUv;\nvMapUv = aCell.xy + vMapUv * aCell.zw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${extraVertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocalUv;\nuniform float uShade;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${extraFragment}`);
  };
  material.customProgramCacheKey = () => `notion-${extraVertex}${extraFragment}`;
}

const uniform = (value) => ({ value });

export function notionMaterial(texture, { unlit = true, shade = 0 } = {}) {
  const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const material = new Material({
    map: texture,
    transparent: false,
    alphaTest: 0.45,   // cutout, not blend: no sorting, and far cheaper on tile-based GPUs
    side: THREE.DoubleSide,
    ...(unlit ? {} : { roughness: 0.85, metalness: 0 }),
  });
  material.userData.uniforms = { uGrow: uniform(1), uPush: uniform(0), uShade: uniform(shade) };
  // a gentle gradient across the card reads as form without leaving billboard territory
  patchAtlasUV(material, '', 'diffuseColor.rgb *= mix(1.0 - uShade, 1.0, vLocalUv.y);');
  return material;
}

/**
 * A dark copy rendered slightly larger and pushed behind the card.
 * Gives thickness AND the ink outline in ONE extra draw call for the whole field, because it
 * shares the main field's instance attributes rather than keeping its own copy in sync.
 */
export function makeEdge(field, color = '#1b1418') {
  const material = new THREE.MeshBasicMaterial({
    map: field.material.map,
    color: new THREE.Color(color),
    transparent: false,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  material.userData.uniforms = { uGrow: uniform(1.06), uPush: uniform(0.012), uShade: uniform(0) };
  patchAtlasUV(material, 'transformed.xy *= uGrow;\ntransformed.z -= uPush;');

  const edge = new THREE.InstancedMesh(field.geometry, material, field.instanceMatrix.count);
  edge.instanceMatrix = field.instanceMatrix;   // shared, so it can never drift out of sync
  edge.frustumCulled = false;
  edge.renderOrder = -1;
  edge.count = field.count;
  return edge;
}

/** One InstancedMesh for every notion on the surface. */
export function makeField(texture, capacity, opts = {}) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const cells = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  geometry.setAttribute('aCell', cells);

  const mesh = new THREE.InstancedMesh(geometry, notionMaterial(texture, opts), capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.userData.cells = cells;
  return mesh;
}

/** Partial update: a drag only moves an instance, it does not restage its cell or colour. */
export function setInstance(field, index, { matrix, rect, color }) {
  if (matrix) {
    field.setMatrixAt(index, matrix);
    field.instanceMatrix.needsUpdate = true;
  }
  if (rect) {
    field.userData.cells.setXYZW(index, ...rect);
    field.userData.cells.needsUpdate = true;
  }
  if (color) {
    field.setColorAt(index, color);
    field.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- placement

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);

/**
 * Transform for a notion sitting in the world.
 * `lying` puts the card face-up on the surface; upright leaves it standing, which is what a
 * shelf wants. Which of these reads better under an orbiting camera is a P1 question.
 */
export function placeMatrix(position, scale, lying, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(lying ? FLAT : new THREE.Euler(0, yaw, 0));
  if (lying) _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw));
  return target.compose(position, _q, _s.set(scale, scale, scale));
}
