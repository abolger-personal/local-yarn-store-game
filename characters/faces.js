import * as THREE from 'three';
import { part } from './npc.js';

// BODIES.md §Shaped faces: small, simple curves, a little smile by default; 'o' is a tiny surprised dot
export const MOUTHS = Object.freeze(['smile', 'smug', 'deadpan', 'o']);

/** A random mouth, read off the drawn head size rather than a fresh draw, so seeded random streams stay as they were. */
export const mouthFor = (P) => MOUTHS[Math.round(P.headRadius * 1000) % MOUTHS.length];

const MOUTH_CURVES = Object.freeze({
  smile: (u) => 0.14 * u * u,
  smug: (u) => 0.2 * ((u + 1) / 2) ** 3,
  deadpan: () => 0,
});
const MOUTH_SPAN = Object.freeze({ smile: 1, smug: 0.9, deadpan: 0.7 });
const MOUTH_POINTS = 8;

// ponytail: fixed low-poly unit shapes shared by every face, whatever GEO detail; tie to GEO_DETAIL if faces get close-ups
const UNIT = {};
const unit = (key, make) => (UNIT[key] ??= make());

export const softGeometry = () => unit('soft', () => new THREE.SphereGeometry(1, 16, 12));
export const dotGeometry = () => unit('dot', () => new THREE.SphereGeometry(1, 8, 6));

/** A rounded inverted triangle: a soft sphere, wide on top, narrowing below. */
export const softTriangle = () => unit('triangle', () => {
  const g = softGeometry().clone(), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (0.62 + 0.38 * (pos.getY(i) + 1) / 2));
  g.computeVertexNormals();
  return g;
});

/** @param {THREE.Mesh} mesh @param {string} name */
export const named = (mesh, name) => {
  mesh.name = name;
  return mesh;
};

/** The point (x, y) off the middle of ellipsoid `on` ({ at, size }), on its front surface and `lift` proud of it. */
export function onFront({ at, size }, x, y, lift = 0) {
  const k = Math.max(0, 1 - (x / size[0]) ** 2 - (y / size[1]) ** 2);
  return [at[0] + x, at[1] + y, at[2] + size[2] * Math.sqrt(k) + lift];
}

/**
 * The mouth (`P.mouth`) on the front of ellipsoid `on`, `width` across and `drop` below its middle: a thin line
 * bent to the shape, or a tiny dot (`dot` scales it). Its own geometry, merged with the character.
 * @param {THREE.Object3D} node
 * @param {Record<string, any>} P
 * @param {{ on: { at: number[], size: number[] }, width: number, drop: number, material: THREE.Material, dot?: number[] }} opts
 */
export function addMouth(node, P, { on, width, drop, material, dot }) {
  const r = width * 0.06;
  if (P.mouth === 'o') {
    node.add(named(part(dotGeometry(), material, { pos: onFront(on, 0, -drop), scale: dot ?? [r * 1.7, r * 2, r * 1.6] }), 'mouth'));
    return;
  }
  const shape = P.mouth in MOUTH_CURVES ? P.mouth : 'smile', points = [];
  for (let i = 0; i <= MOUTH_POINTS; i++) {
    const u = (i / MOUTH_POINTS) * 2 - 1;
    points.push(new THREE.Vector3(...onFront(on, (u * width * MOUTH_SPAN[shape]) / 2, MOUTH_CURVES[shape](u) * width - drop)));
  }
  // ponytail: per-character geometry; merging bakes a copy, an unmerged lab build leaves it to GC
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), MOUTH_POINTS * 2, r, 4);
  node.add(named(part(geometry, material), 'mouth'));
}
