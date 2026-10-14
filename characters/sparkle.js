// PROJECTS-AND-AUTHORSHIP.md §1 "ready"; CRAFT-ANIM.md §7
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SPARKLE_TIME = 3;

export const SPARKLE_BITS = Object.freeze([
  [0, 0.02, 0, 0.11], [-0.15, -0.05, 0.02, 0.07], [0.14, -0.07, 0.03, 0.075],
  [-0.07, 0.13, -0.02, 0.06], [0.09, 0.12, 0.01, 0.055],
]);

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function sparkleScale(t) {
  if (!(t >= 0) || t >= SPARKLE_TIME) return 0;
  const pop = t < 0.18 ? (t / 0.18) * 1.35 : 1 + 0.35 * Math.exp(-(t - 0.18) * 9);
  const pulse = 1 + 0.12 * Math.sin(t * 14);
  return pop * pulse * clamp01((SPARKLE_TIME - t) / 0.5);
}

function star(x, y, z, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, k = i % 2 ? 0.26 * r : r;
    if (i) s.lineTo(Math.sin(a) * k, Math.cos(a) * k);
    else s.moveTo(0, k);
  }
  const front = new THREE.ShapeGeometry(s);
  return mergeGeometries([front, front.clone().rotateY(Math.PI / 2)]).translate(x, y, z);
}

let geo = null, mat = null;

export function makeSparkle(built) {
  geo ??= mergeGeometries(SPARKLE_BITS.map(([x, y, z, r]) => star(x, y, z, r)));
  mat ??= new THREE.MeshBasicMaterial({ color: '#fff4b0', side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.userData.prop = true;
  mesh.userData.noMerge = true;
  built.root.add(mesh);
  return { built, mesh, t: Infinity };
}

const _v = new THREE.Vector3();

export function playSparkle(s) {
  const { root, joints, params } = s.built;
  root.updateMatrixWorld(true);
  root.worldToLocal(joints.head.getWorldPosition(_v));
  s.mesh.position.set(_v.x, _v.y + params.headRadius * 1.6 + 0.08, _v.z);
  s.t = 0;
}

export function stepSparkle(s, dt) {
  s.t += dt;
  const k = sparkleScale(s.t);
  s.mesh.visible = k > 0;
  if (!k) return;
  s.mesh.scale.setScalar(k);
  s.mesh.rotation.y = s.t * 2.2;
}

export function disposeSparkle(s) {
  s.mesh.removeFromParent();
}
