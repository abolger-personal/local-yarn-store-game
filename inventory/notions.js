// Notions as instanced billboards, and the slot grid they sit in.
//
// Pure: nothing here touches a scene, camera or DOM.
//
// Two decisions from inventory/DESIGN-DECISIONS.md are load-bearing here:
//   1. Every LABEL is the SAME quad. A hook differs from a button only by which cell of the
//      atlas it samples, so all labels are one InstancedMesh and one draw call (plus one more
//      each for their ink outline, their box volume, and their contact shadow — still a small,
//      fixed number of draw calls regardless of item count).
//   2. The atlas stores shape in alpha with white RGB, so colour is per-instance and a theme
//      that only recolours ships no new art.

import * as THREE from 'three';
import { gridSize, usableAt } from './grid.js';

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

/**
 * Add procedurally drawn cells to a loaded atlas, returning a NEW atlas that contains both.
 *
 * Yarn and patterns have no illustrations yet, and the alternative — a second texture — costs a
 * second instanced mesh and a second draw call for every label channel. Compositing the loaded PNG
 * and the placeholder shapes into one canvas keeps the whole shop at the same draw-call count it
 * had with three notions, and means nothing downstream learns that some art is stand-in.
 *
 * Drawn WHITE-on-transparent, per DESIGN-DECISIONS.md: the atlas stores shape in the alpha channel
 * so that colour stays per-instance. A yarn cell drawn in an actual yarn colour could not be
 * recoloured, which is exactly what yarn most needs.
 *
 * TODO(YARN.md): real illustrations, with ball bands, gradients, sparkle and fuzziness. These are
 * silhouettes — they read at diorama distance and they are not the art.
 */
export function extendAtlas(loaded, shapes, { cell = 128 } = {}) {
  const names = Object.keys(shapes);
  const source = loaded.texture.image;
  // The source is drawn at its NATIVE size and the new row is fitted to it. Scaling the sheet up
  // to fit a 128px-per-cell row instead would resample every existing illustration — the notions
  // all went soft the first time this was written that way.
  const width = source.width;
  const band = Math.min(cell, Math.floor(width / Math.max(1, names.length)));
  const topH = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = topH + band;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);

  const cells = {};
  // The loaded cells keep their content but are squashed into the top band of the taller canvas.
  const vScale = topH / canvas.height;
  for (const [name, c] of Object.entries(loaded.manifest.cells)) {
    cells[name] = { u0: c.u0, u1: c.u1, v0: 1 - (1 - c.v0) * vScale, v1: 1 - (1 - c.v1) * vScale };
  }

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  names.forEach((name, i) => {
    ctx.save();
    ctx.translate(i * band, topH);
    shapes[name](ctx, band);
    ctx.restore();
    cells[name] = {
      u0: (i * band) / width, u1: ((i + 1) * band) / width,
      v0: 0, v1: band / canvas.height,
    };
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { texture, manifest: { ...loaded.manifest, cells }, names: Object.keys(cells) };
}

/** Atlas rect for one notion, as the shader wants it: origin plus size. */
export function cellRect(manifest, name) {
  const c = manifest.cells[name];
  if (!c) return [0, 0, 1, 1];
  return [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0];
}

// ---------------------------------------------------------------- size atlas
//
// A second, tiny atlas for a size number — reuses the exact same cellRect/aCell/makeField
// machinery as the illustration atlas (one canvas-drawn texture, one instanced mesh, one draw
// call), rather than inventing a separate text-rendering path.

/** A row of number labels baked into one canvas, plus a fully-transparent "blank" cell for items
 *  with no size — alphaTest then draws nothing for those instances, no per-instance branching. */
export function makeSizeAtlas(labels, { cell = 128 } = {}) {
  const all = ['blank', ...labels];
  const canvas = document.createElement('canvas');
  canvas.width = cell * all.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${Math.round(cell * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a2a2a';

  const cells = {};
  all.forEach((label, i) => {
    if (label !== 'blank') ctx.fillText(label, i * cell + cell / 2, cell / 2);
    cells[label] = { u0: i / all.length, u1: (i + 1) / all.length, v0: 0, v1: 1 };
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { texture, manifest: { cells } };
}

// ---------------------------------------------------------------- grid lines

/**
 * Outline of the USABLE slots on one shelf, drawn per-cell so a masked display (a shop window, a
 * stepped shelf) shows its true silhouette instead of a full rectangle. `GridHelper` can't do this.
 */
export function makeGridLines(g, shelf, color = '#8d8172') {
  const { w, d } = gridSize(g);
  const points = [];
  const seg = (x0, z0, x1, z1) => points.push(x0, 0, z0, x1, 0, z1);
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      if (!usableAt(g, shelf, c, r)) continue;
      const x = c * g.cell - w / 2, z = r * g.cell - d / 2, e = g.cell;
      seg(x, z, x + e, z); seg(x, z + e, x + e, z + e);   // top / bottom
      seg(x, z, x, z + e); seg(x + e, z, x + e, z + e);   // left / right
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
      .replace('#include <common>', '#include <common>\nattribute vec4 aCell;\nvarying vec2 vLocalUv;\nuniform float uGrow;')
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
  material.userData.uniforms = { uGrow: uniform(1), uShade: uniform(shade) };
  // a gentle gradient across the card reads as form without leaving billboard territory
  patchAtlasUV(material, '', 'diffuseColor.rgb *= mix(1.0 - uShade, 1.0, vLocalUv.y);');
  return material;
}

/**
 * A dark copy rendered slightly larger, coplanar with the card, in ONE extra draw call for the
 * whole field (it shares the main field's instance attributes rather than keeping its own copy
 * in sync). The ink outline comes from `uGrow` alone — scaling the copy up in its own local XY
 * so it peeks out around the card's silhouette.
 *
 * This used to also push the copy back along its local Z ("depth") to dodge z-fighting with the
 * card. That worked when cards lay flat on a surface (a tiny Z offset read as negligible from a
 * top-down camera), but once labels stand flush against a box's face, "back" means "into the
 * box" — the offset either buried the outline inside the opaque box or landed it exactly on the
 * box's own surface, and depth precision can't consistently resolve that: the flicker. Fixed by
 * `polygonOffset` instead, which biases the DEPTH TEST, not the geometry — the outline never
 * moves in world space (so no more embedding-in-the-box), and it reliably loses the depth test
 * to the card wherever the two overlap, leaving only the peeked-out border visible.
 */
export function makeEdge(field, color = '#1b1418') {
  const material = new THREE.MeshBasicMaterial({
    map: field.material.map,
    color: new THREE.Color(color),
    transparent: false,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  material.userData.uniforms = { uGrow: uniform(1.06), uShade: uniform(0) };
  patchAtlasUV(material, 'transformed.xy *= uGrow;');

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

// ---------------------------------------------------------------- contact shadows

// A soft round blot; instanced flat on each layer so a stacked pile casts onto the thing below it.
// Design record: items get fake contact-shadow quads rather than casting into a shadow map.
function softDiscTexture() {
  const size = 64, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeShadows(capacity) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: softDiscTexture(), transparent: true, depthWrite: false }),
    capacity,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = -2;   // under the cards and their edge shells
  return mesh;
}

// ---------------------------------------------------------------- boxes
//
// A flat card left a stack full of dead air between layers. A plain box gives each item real
// volume — cheap because it is one more shared InstancedMesh, not per-item geometry — and the
// illustrated card becomes a label glued to the box's forward face instead of the whole item.

/** One InstancedMesh for every box on the surface — plain, unlit by the atlas, one more draw call. */
export function makeBoxes(capacity, color = '#e7ddc9') {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
    capacity,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

// ---------------------------------------------------------------- placement

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _zRot = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);

/**
 * Transform for a notion lying face-up on a shelf. Cards lie flat and stack in Y — the pile IS the
 * 2.5D. Footprint sizing is anisotropic (sx≠sy) so a 2×1 reads as a genuinely wider object; the
 * atlas art stretches, which is fine for a spike whose real items will be 3D geometry anyway.
 */
export function placeMatrix(position, sx, sy, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(FLAT);
  _q.multiply(_zRot.setFromAxisAngle(_zAxis, yaw));
  return target.compose(position, _q, _s.set(sx, sy, 1));
}

const _yaw = new THREE.Euler();

/** A box standing on the shelf — the physical volume that gives an item real depth. */
export function placeBoxMatrix(position, w, d, h, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(_yaw.set(0, yaw, 0));
  return target.compose(position, _q, _s.set(w, h, d));
}

/** The illustrated label, standing upright and flush with the box's forward face. */
export function placeLabelMatrix(position, w, h, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(_yaw.set(0, yaw, 0));
  return target.compose(position, _q, _s.set(w, h, 1));
}
