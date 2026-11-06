import * as THREE from 'three';

// ponytail: fixed low-poly unit shapes shared by every face, whatever GEO detail; tie to GEO_DETAIL if faces get close-ups
const UNIT = {};
const unit = (key, make) => (UNIT[key] ??= make());

export const softGeometry = () => unit('soft', () => new THREE.SphereGeometry(1, 16, 12));

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
