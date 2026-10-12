import * as THREE from 'three';
import { roomEnvironment } from '../inventory/room-environment.js';
import { createCharacter, disposeCharacter } from './npc.js';
import { LOOK, dress, undress } from './garments.js';
import { gradeSelfie, idLook, scoredSelfie, selfieScore, takeSelfie } from './selfie.js';
import { paintBackdrop } from './store/ui/backdrop.js';

export const W = 240, H = 300;

// ponytail: a second WebGL context, made on the first photo and kept. Rendering through the page's
// renderer into a target and reading the pixels back would save the context; not worth it for one.
let studio = null;

export function studioLights(camera) {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.4);
  key.position.set(1.5, 3, 2.5);
  const rim = new THREE.DirectionalLight('#bcd4ff', 0.9);
  rim.position.set(-2, 2, -2);
  const glow = new THREE.DirectionalLight('#ffffff', 1.5);
  glow.position.set(0, 0, 1);         // SELFIES.md §6
  camera.add(glow, glow.target);
  return [key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55)];
}

function buildStudio() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
  scene.add(...studioLights(camera), camera);
  const print = document.createElement('canvas');
  print.width = W;
  print.height = H;
  return { renderer, scene, camera, print: print.getContext('2d') };
}

function inPicture(camera, p) {
  const q = p.clone().project(camera);
  return { x: ((q.x + 1) / 2) * W, y: ((1 - q.y) / 2) * H };
}

function horizonTilt(camera, built) {
  const head = built.joints.head.getWorldPosition(new THREE.Vector3());
  const across = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const a = inPicture(camera, head), b = inPicture(camera, head.clone().add(across));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function projector(camera) {
  const v = new THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -camera.near) return null;
    v.applyMatrix4(camera.projectionMatrix);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };
}

function viewOf(camera, built) {
  const project = projector(camera);
  const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(1e4).add(camera.position);
  const root = built.root.getWorldPosition(new THREE.Vector3());
  return {
    tilt: horizonTilt(camera, built),
    horizon: project(ahead.x, camera.position.y, ahead.z) ?? { x: W / 2, y: -H * 10 },
    project,
    feet: { x: root.x, y: new THREE.Box3().setFromObject(built.root).min.y, z: root.z, r: built.params.torsoW * 0.9 },
  };
}

function develop(built) {
  studio.renderer.render(studio.scene, studio.camera);
  paintBackdrop(studio.print, viewOf(studio.camera, built));
  studio.print.drawImage(studio.renderer.domElement, 0, 0, W, H);
  return studio.print.canvas.toDataURL('image/png');
}

export function snap({ body, kit, outfit, type = null, silhouette = null }, { toneMapping, exposure }, { grade = false, scored = false } = {}) {
  studio ??= buildStudio();
  studio.renderer.toneMapping = toneMapping;
  studio.renderer.toneMappingExposure = exposure;
  const built = createCharacter({ ...body, mergeMeshes: false }, kit);
  const { viewPx } = LOOK;
  LOOK.viewPx = 0;
  const shown = type === 'bag' && outfit.bag ? { ...outfit, bag: { ...outfit.bag, held: true } } : outfit;
  try { dress(built, shown); } finally { LOOK.viewPx = viewPx; }
  studio.scene.add(built.root);
  const look = idLook(built);
  const shot = scored ? scoredSelfie(built, studio.camera, type, look) : takeSelfie(built, studio.camera, type, silhouette, look);
  const grades = grade ? { ...gradeSelfie(built, studio.camera, type, look), score: selfieScore(built, studio.camera, type, look) } : null;
  const url = develop(built);
  studio.scene.remove(built.root);
  undress(built);
  disposeCharacter(built);
  return { url, shot, grades };
}
