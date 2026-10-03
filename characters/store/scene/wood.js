// Joinery: the parts traditional wooden furniture is made of, and gluing them into one mesh.
//
// Farmhouse, not flat-pack: boards with rounded, milled edges (RoundedBoxGeometry), legs and
// spindles turned on a lathe with beads and coves (LatheGeometry), and shaped panels with a curve
// cut into them and the edge routed round (a bevelled ExtrudeGeometry).
//
// Every piece of furniture is MERGED into one geometry. A turned table is a top, four aprons and
// four legs; as nine meshes it would cost nine draw calls, as one it costs one — the same as the
// slab-on-a-box it replaces.
//
// UVs are re-laid in metres, along the grain (see woodUVs), so one worn-wood texture reads at the
// same scale on a chair spindle and a counter top, and the grain runs the length of every part.
//
// No scene imports, so the self-check (wood.test.mjs) can build furniture in node.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WOOD_TILE = 0.45;   // metres of wood one repeat of the texture covers

const _p = new THREE.Vector3(), _n = new THREE.Vector3();

/**
 * Lay UVs in metres with V along the part's longest axis — the grain — so a leg's grain runs up
 * it and a board's along it. A face looking down the grain (end grain) takes the other two axes.
 */
export function woodUVs(geo) {
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3()).toArray();
  const grain = size.indexOf(Math.max(...size));
  const { position, normal, uv } = geo.attributes;
  for (let i = 0; i < position.count; i++) {
    const p = _p.fromBufferAttribute(position, i).toArray();
    const n = _n.fromBufferAttribute(normal, i).toArray().map(Math.abs);
    const face = n.indexOf(Math.max(...n));
    const across = face === grain ? (face + 1) % 3 : 3 - face - grain;
    const along = face === grain ? (face + 2) % 3 : grain;
    uv.setXY(i, p[across] / WOOD_TILE, p[along] / WOOD_TILE);
  }
  uv.needsUpdate = true;
  return geo;
}

/** A board with its edges rounded over. `round` is the router bit; it is capped to fit the board. */
export function board(w, h, d, round = 0.008) {
  const r = Math.min(round, Math.min(w, h, d) / 2 - 1e-4);
  return woodUVs(new RoundedBoxGeometry(w, h, d, 2, r));
}

/**
 * A lathe profile as (radius, height) fractions of the part, bottom to top. Each is the classic
 * farmhouse leg read from the floor up: a foot, a long taper, a bead-and-cove, and a plain block at
 * the top where the apron is jointed in.
 */
const PROFILES = {
  leg: [[0, 0], [0.72, 0], [0.86, 0.03], [0.7, 0.07], [0.56, 0.42], [0.82, 0.47], [0.6, 0.52],
    [0.92, 0.6], [0.66, 0.66], [1, 0.7], [1, 1], [0, 1]],
  spindle: [[0, 0], [0.8, 0], [0.8, 0.06], [1, 0.1], [0.55, 0.3], [0.7, 0.55], [0.5, 0.8],
    [0.85, 0.9], [0.85, 1], [0, 1]],
  post: [[0, 0], [0.85, 0], [0.7, 0.1], [0.95, 0.2], [0.65, 0.3], [0.6, 0.85], [0.9, 0.9],
    [0.55, 0.95], [0.8, 0.985], [0, 1]],
};

/** A turned part: `kind` of PROFILES, `h` tall, `r` at its widest. */
export function turned(kind, h, r, sides = 14) {
  const pts = PROFILES[kind].map(([pr, py]) => new THREE.Vector2(pr * r, py * h));
  return woodUVs(new THREE.LatheGeometry(pts, sides));
}

/**
 * A flat panel cut to `outline` (an array of [x, y], counter-clockwise) and `t` thick, its edge
 * routed round. For shaped parts a box cannot be: a shelf's curved side, a chair's arched rail.
 * Centred on its thickness, so it sits like a board.
 */
export function panel(outline, t, round = 0.005) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - round * 2, 1e-3), bevelEnabled: true, bevelThickness: round,
    bevelSize: round, bevelSegments: 2, curveSegments: 16,
  });
  geo.translate(0, 0, -(t - round * 2) / 2);
  return woodUVs(geo);
}

/** Points along an arc, for an outline: centre (cx, cy), radius, from angle a0 to a1, n steps. */
export const arc = ([cx, cy], radius, [a0, a1], n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
  });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** A geometry ready to merge: non-indexed, only position/normal/uv, no groups, moved by `matrix`. */
function mergeable(geo, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  return g;
}

/**
 * Glue parts into one geometry. Each part is `[geometry, [x, y, z], [rx, ry, rz]?]`. The parts'
 * own geometries are consumed (disposed) — they are only ever built to be glued.
 */
export function glue(parts) {
  const placed = parts.map(([geo, at, rot = [0, 0, 0]]) => {
    const g = mergeable(geo, _m.compose(_p.set(...at), _q.setFromEuler(_e.set(...rot)), _n.set(1, 1, 1)));
    geo.dispose();
    return g;
  });
  return mergeGeometries(placed);
}

/**
 * Collapse every mesh under `root` that `keep` accepts into ONE mesh per material, in root's frame.
 * For things already built as many small parts — a plant is a dozen leaves, a window frame is six
 * boards — where each part was a draw call (and another in the shadow pass) for no reason. Lights
 * and anything `keep` refuses stay as they are. The originals' geometries may be shared (a plant's
 * leaf shape is), so they are dropped, not disposed.
 *
 * @param {THREE.Object3D} root
 * @param {(n: THREE.Mesh) => boolean} [keep]
 */
export function mergeMeshes(root, keep = () => true) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), byMaterial = new Map(), merged = [];
  root.traverse((n) => {
    if (n === root || !n.isMesh || !keep(n)) return;
    const list = byMaterial.get(n.material) ?? [];
    list.push(mergeable(n.geometry, _m.multiplyMatrices(inv, n.matrixWorld)));
    byMaterial.set(n.material, list);
    merged.push(n);
  });
  for (const n of merged) n.removeFromParent();
  for (const [material, geos] of byMaterial) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  return root;
}

/** A glued piece as a mesh that casts and takes shadow, like all the furniture. */
export function woodMesh(parts, material) {
  const m = new THREE.Mesh(glue(parts), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
