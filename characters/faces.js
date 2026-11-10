import * as THREE from 'three';

// ponytail: fixed low-poly unit shapes shared by every face, whatever GEO detail; tie to GEO_DETAIL if faces get close-ups
const UNIT = {};
export const unit = (key, make) => (UNIT[key] ??= make());

export const softGeometry = () => unit('soft', () => new THREE.SphereGeometry(1, 16, 12));

/** A rounded inverted triangle: a soft sphere, wide on top, narrowing below. */
export const softTriangle = () => unit('triangle', () => {
  const g = softGeometry().clone(), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (0.62 + 0.38 * (pos.getY(i) + 1) / 2));
  g.computeVertexNormals();
  return g;
});

/** @template {THREE.Object3D} T @param {T} node @param {string} name @returns {T} */
export const named = (node, name) => {
  node.name = name;
  return node;
};

/** How far in front of the middle of an ellipsoid of radii `head` its skin lies over (x, y); 0 off its outline. */
export const skinZ = (x, y, head) => head[2] * Math.sqrt(Math.max(0, 1 - (x / head[0]) ** 2 - (y / head[1]) ** 2));

/** The point (x, y) off the middle of ellipsoid `on` ({ at, size }), on its front surface and `lift` proud of it. */
export const onFront = ({ at, size }, x, y, lift = 0) => [at[0] + x, at[1] + y, at[2] + skinZ(x, y, size) + lift];
