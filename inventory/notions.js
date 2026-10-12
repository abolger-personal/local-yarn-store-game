// One atlas, one quad, one draw call per channel: inventory/DESIGN-DECISIONS.md §3.

import * as THREE from 'three';
import { gridSize, usableAt } from './grid.js';

export async function loadAtlas(baseUrl, theme = 'default') {
  const manifest = await (await fetch(`${baseUrl}/${theme}.json`)).json();
  const texture = await new THREE.TextureLoader().loadAsync(`${baseUrl}/${manifest.atlas}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { texture, manifest, names: Object.keys(manifest.cells) };
}

export function extendAtlas(loaded, shapes, { cell = 128 } = {}) {
  const names = Object.keys(shapes);
  const source = loaded.texture.image;
  const { width } = source;
  const band = Math.min(cell, Math.floor(width / Math.max(1, names.length)));
  const topH = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = topH + band;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const cells = squashedCells(loaded.manifest.cells, topH / canvas.height);
  drawShapes(ctx, shapes, names, { band, topH, width, height: canvas.height }, cells);
  return { texture: atlasTexture(canvas), manifest: { ...loaded.manifest, cells }, names: Object.keys(cells) };
}

function squashedCells(loadedCells, vScale) {
  const cells = {};
  for (const [name, c] of Object.entries(loadedCells)) {
    cells[name] = { u0: c.u0, u1: c.u1, v0: 1 - (1 - c.v0) * vScale, v1: 1 - (1 - c.v1) * vScale };
  }
  return cells;
}

function drawShapes(ctx, shapes, names, { band, topH, width, height }, cells) {
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
      v0: 0, v1: band / height,
    };
  });
}

function atlasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

export function cellRect(manifest, name) {
  const c = manifest.cells[name];
  if (!c) return [0, 0, 1, 1];
  return [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0];
}

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
  return { texture: atlasTexture(canvas), manifest: { cells } };
}

export function makeGridLines(g, shelf, color = '#8d8172') {
  const { w, d } = gridSize(g);
  const points = [];
  const seg = (x0, z0, x1, z1) => { points.push(x0, 0, z0, x1, 0, z1); };
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      if (!usableAt(g, shelf, c, r)) continue;
      const x = c * g.cell - w / 2, z = r * g.cell - d / 2, e = g.cell;
      seg(x, z, x + e, z); seg(x, z + e, x + e, z + e);
      seg(x, z, x, z + e); seg(x + e, z, x + e, z + e);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

function patchAtlasUV(material, extraVertex = '', extraFragment = '') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCell;\nvarying vec2 vLocalUv;\nuniform float uGrow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLocalUv = vMapUv;\nvMapUv = aCell.xy + vMapUv * aCell.zw;')
      .replace('#include <begin_vertex>', () => `#include <begin_vertex>\n${extraVertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocalUv;\nuniform float uShade;')
      .replace('#include <color_fragment>', () => `#include <color_fragment>\n${extraFragment}`);
  };
  material.customProgramCacheKey = () => `notion-${extraVertex}${extraFragment}`;
}

const uniform = (value) => ({ value });

export function notionMaterial(texture, { unlit = true, shade = 0 } = {}) {
  const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const material = new Material({
    map: texture,
    transparent: false,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    ...(unlit ? {} : { roughness: 0.85, metalness: 0 }),
  });
  material.userData.uniforms = { uGrow: uniform(1), uShade: uniform(shade) };
  patchAtlasUV(material, '', 'diffuseColor.rgb *= mix(1.0 - uShade, 1.0, vLocalUv.y);');
  return material;
}

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
  edge.instanceMatrix = field.instanceMatrix;
  edge.frustumCulled = false;
  edge.renderOrder = -1;
  edge.count = field.count;
  return edge;
}

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

/**
 * @param {import('three').InstancedMesh} field
 * @param {number} index
 * @param {{matrix?: import('three').Matrix4, rect?: number[],
 *          color?: import('three').Color}} update
 */
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
  mesh.renderOrder = -2;
  return mesh;
}

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

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _zRot = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);

export function placeMatrix(position, sx, sy, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(FLAT);
  _q.multiply(_zRot.setFromAxisAngle(_zAxis, yaw));
  return target.compose(position, _q, _s.set(sx, sy, 1));
}

const _yaw = new THREE.Euler();

export function placeBoxMatrix(position, [w, d, h], yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(_yaw.set(0, yaw, 0));
  return target.compose(position, _q, _s.set(w, h, d));
}

export function placeLabelMatrix(position, w, h, yaw, target = new THREE.Matrix4()) {
  _q.setFromEuler(_yaw.set(0, yaw, 0));
  return target.compose(position, _q, _s.set(w, h, 1));
}
