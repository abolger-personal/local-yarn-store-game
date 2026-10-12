import * as THREE from 'three';
import { CELL, ROOM, shopView } from '../core/config.js';
import { camera, controls } from '../scene/stage.js';
import { FILL } from '../goods/items.js';

export const isUnder = (node, ancestor) => {
  for (let n = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
};

/** @param {{x: number, z: number}} [at] */
const TARGET_SLOT_PX = 56;   // STORE-SCENE.md §Camera

export function frameRoom(at = { x: 0, z: 0 }) {
  restoreLimits();
  const center = new THREE.Vector3(at.x, 0, at.z);
  const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const wanted = (CELL * FILL * innerHeight) / (2 * Math.tan(halfFov) * TARGET_SLOT_PX);
  const dist = THREE.MathUtils.clamp(wanted, controls.minDistance + 0.3, controls.maxDistance);

  controls.target.set(center.x, 0.55, center.z);
  // STORE-SCENE.md §Camera
  const v = new THREE.Vector3(0.30, 0.62, 0.82).normalize().multiplyScalar(dist);
  camera.position.set(center.x + v.x, v.y, center.z + v.z);
  controls.update();
}

const FIT = 1.08;          // STORE-SCENE.md §Camera
let saved = null;
let side = null;

export function restoreLimits() {
  if (!saved) return;
  Object.assign(controls, saved);
  saved = null;
  side = null;
}

function liftLimits(maxDistance) {
  if (!saved) {
    saved = { maxPolarAngle: controls.maxPolarAngle, maxDistance: controls.maxDistance };
    controls.addEventListener('start', restoreLimits, { once: true });
  }
  controls.maxPolarAngle = Math.PI / 2;
  controls.maxDistance = Math.max(saved.maxDistance, maxDistance + 1);
}

function fitDistance(w, h) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return Math.max((h / 2) * FIT / t, (w / 2) * FIT / (t * camera.aspect));
}

export function viewTop() {
  const d = fitDistance(ROOM.w, ROOM.d) + ROOM.wallH;
  liftLimits(d);
  side = null;
  controls.target.set(0, 0, 0);
  camera.position.set(0, d, 1e-3);
  controls.update();
}

export function viewShop() {
  const { target, eye, dist } = shopView(camera.aspect);
  if (dist > controls.maxDistance) liftLimits(dist);
  else restoreLimits();
  side = null;
  controls.target.set(...target);
  camera.position.set(...eye);
  controls.update();
}

export function viewSide(step = 1) {
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  side = side === null ? Math.round(az / (Math.PI / 2)) : side + step;
  const along = side % 2 === 0;
  const d = (along ? ROOM.d : ROOM.w) / 2 + fitDistance(along ? ROOM.w : ROOM.d, ROOM.wallH);
  liftLimits(d);
  const a = side * (Math.PI / 2), y = ROOM.wallH / 2;
  controls.target.set(0, y, 0);
  camera.position.set(Math.sin(a) * d, y, Math.cos(a) * d);
  controls.update();
}

