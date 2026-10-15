// Contact you can feel (REUSE-SPEC.md §Milestones 1): BAM bursts, icing chunks and confetti, screen shake, floor shadows.
import * as THREE from 'three';
import { floorTop } from './controls.js';

/** @typedef {import('./match.js').HitEvent} HitEvent */

export const RIOT = Object.freeze(['#ff3b7f', '#ffd21a', '#14c4e0', '#8be02a', '#ff7a1a', '#8a4dff', '#ffffff']);
const BAM_SIZE = { punch: 0.42, kick: 0.62, stomp: 0.85 };
const SHAKE = { punch: 0, kick: 0.05, stomp: 0.1 };
const BAM_LIFE = 0.3, BIT_LIFE = 0.9, GRAVITY = 9;

export const confettiMats = RIOT.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
const flat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false, depthTest: false, side: THREE.DoubleSide });

function starGeometry(spikes, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * Math.PI) / spikes, r = i % 2 ? inner : 1 - 0.18 * ((i * 7) % 3) / 2;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(r, 0);
  }
  return new THREE.ShapeGeometry(s);
}

const STAR = starGeometry(11, 0.52);
const BIT = new THREE.CapsuleGeometry(0.05, 0.16, 2, 6).rotateZ(Math.PI / 2);
const BAM_LAYERS = [['#ff2d55', 1], ['#ffd21a', 0.74], ['#ffffff', 0.34]].map(([c, s]) => [flat(c), s]);
const BIT_MATS = RIOT.map(flat);

function makeBam(scene) {
  const g = new THREE.Group(), star = new THREE.Group();
  BAM_LAYERS.forEach(([m, s], i) => {
    const mesh = new THREE.Mesh(STAR, m);
    mesh.scale.setScalar(/** @type {number} */ (s));
    mesh.renderOrder = 1000 + i;
    star.add(mesh);
  });
  const bits = RIOT.slice(0, 6).map((_, i) => Object.assign(new THREE.Mesh(BIT, BIT_MATS[i]), { renderOrder: 1003 }));
  g.add(star, ...bits);
  g.visible = false;
  scene.add(g);
  return { g, star, bits, t: Infinity, size: 1 };
}

function stepBam(b, dt) {
  b.t += dt;
  b.g.visible = b.t < BAM_LIFE;
  if (!b.g.visible) return;
  const k = b.t / BAM_LIFE, pop = k < 0.2 ? 1.25 * (k / 0.2) : 1.25 - 0.25 * Math.min(1, (k - 0.2) * 5);
  b.star.scale.setScalar(b.size * pop * (k > 0.6 ? (1 - k) / 0.4 : 1));
  b.bits.forEach((m, i) => {
    const a = (i / b.bits.length) * Math.PI * 2 + b.spin, r = b.size * (0.6 + 2.2 * k);
    m.position.set(Math.cos(a) * r, Math.sin(a) * r - 1.5 * k * k * b.size, 0);
    m.rotation.z = a;
    m.scale.setScalar(b.size * 1.6 * (1 - k * 0.6));
  });
}

// REUSE-SPEC.md §Theme: treats house style: every burst is sprinkles. Unit length, so `size` is the sprinkle's length.
const SPRINKLE = new THREE.CapsuleGeometry(0.19, 0.62, 2, 6), SPRINKLE_R = 0.19;

function makeBit(scene) {
  const mesh = new THREE.Mesh(SPRINKLE);
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, v: new THREE.Vector3(), t: Infinity, floor: 0, size: 0.16 };
}

function stepBit(b, dt) {
  b.t += dt;
  b.mesh.visible = b.t < BIT_LIFE;
  if (!b.mesh.visible) return;
  const p = b.mesh.position, half = b.size * SPRINKLE_R;
  if (p.y > b.floor + half) {
    b.v.y -= GRAVITY * dt;
    p.addScaledVector(b.v, dt);
    b.mesh.rotation.x += dt * 9;
    p.y = Math.max(p.y, b.floor + half);
  }
  b.mesh.scale.setScalar(b.size * Math.min(1, (BIT_LIFE - b.t) * 4));
}


const SHADOW_GEO = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
let shadowMat = null;

function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#ccc');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ color: '#3a1d10', alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.45, depthWrite: false });
}

/** A soft round shadow on the floor, for lining up in depth. */
export function makeShadow(scene) {
  shadowMat ??= softDisc();
  const m = new THREE.Mesh(SHADOW_GEO, shadowMat);
  m.renderOrder = 1;
  scene.add(m);
  return m;
}

/** Puts a shadow on the stage's floor under p, smaller the higher the thing is. @param {import('./match.js').Stage} stage */
export function placeShadow(stage, m, { x, y, z }, r) {
  const top = floorTop(stage, x, z, y + 0.05);
  m.visible = top !== null;
  if (top === null) return;
  m.position.set(x, top + 0.03, z);
  m.scale.setScalar(r * Math.max(0.5, 1 - (y - top) * 0.25));
}

function spawnBit(fx, at, color, speed) {
  const b = fx.debris[fx.next.bit++ % fx.debris.length], a = Math.random() * Math.PI * 2;
  b.mesh.material = color;
  b.mesh.position.set(at.x, at.y, at.z);
  b.v.set(Math.cos(a) * speed, speed * (1.2 + Math.random()), Math.sin(a) * speed * 0.6 + speed * 0.3);
  b.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  Object.assign(b, { t: 0, floor: floorTop(fx.stage, at.x, at.z, at.y) ?? -3, size: 0.13 + Math.random() * 0.06 });
}

/** A BAM sized by the move, and the screen shake that goes with it. @param {HitEvent} h */
function startBam(fx, h) {
  const b = fx.bams[fx.next.bam++ % fx.bams.length];
  b.g.position.set(h.x, h.y, h.z);
  Object.assign(b, { t: 0, size: BAM_SIZE[h.move], spin: Math.random() * 3 });
  b.star.rotation.z = Math.random() * Math.PI;
  fx.shake = Math.max(fx.shake, SHAKE[h.move]);
  fx.shakeT = 0;
}

const pools = (scene) => ({
  bams: Array.from({ length: 6 }, () => makeBam(scene)),
  debris: Array.from({ length: 64 }, () => makeBit(scene)),
  next: { bam: 0, bit: 0 }, shake: 0, shakeT: 0,
});

/** @param {THREE.Scene} scene @param {THREE.Camera} camera @param {import('./match.js').Stage} stage */
export function createFx(scene, camera, stage) {
  const fx = { ...pools(scene), stage };
  return {
    /** @param {HitEvent} h */
    bam(h) { startBam(fx, h); },
    /** n bits flying out of `at`, each in one of `colors` (materials). */
    burst(at, colors, n, speed = 1.6) { for (let i = 0; i < n; i++) spawnBit(fx, at, colors[i % colors.length], speed); },
    step(dt) { stepAll(fx, camera, dt); },
  };
}

function stepAll(fx, camera, dt) {
  for (const b of fx.bams) {
    b.g.quaternion.copy(camera.quaternion);
    stepBam(b, dt);
  }
  for (const b of fx.debris) stepBit(b, dt);
  fx.shakeT += dt;
  const k = fx.shake * Math.max(0, 1 - fx.shakeT / 0.25);
  camera.position.x += Math.sin(fx.shakeT * 90) * k;
  camera.position.y += Math.sin(fx.shakeT * 70 + 1) * k;
}
