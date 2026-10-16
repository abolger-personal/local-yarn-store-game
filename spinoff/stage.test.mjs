import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frame } from './stage.js';

// Seven rows deep under a 35° camera (moves.html): every corner must land on screen, in portrait and landscape.
const view = new THREE.Vector3(0, Math.sin(0.61), Math.cos(0.61));
const rows = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 12));
rows.position.set(0, 0.5, -5.4);
for (const aspect of [0.6, 0.75, 1.33, 1.8]) {
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.01, 100);
  frame(camera, [rows], { view, margin: 1.05 });
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rows), p = new THREE.Vector3();
  let most = 0;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    most = Math.max(most, Math.abs(p.x), Math.abs(p.y));
  }
  assert.ok(most <= 1 && most > 0.9, `aspect ${aspect}: the farthest corner reaches ${most.toFixed(3)} of the screen, want 0.9..1`);
}

console.log('stage: ok');
