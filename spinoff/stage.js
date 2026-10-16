import * as THREE from 'three';
import { roomEnvironment } from '../inventory/room-environment.js';
import { studioLights } from '../characters/selfie-studio.js';

function makeRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  container.appendChild(renderer.domElement);
  return renderer;
}

function followSize(container, renderer, camera) {
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(container);
  fit();
}

export function makeStage(container, { background = '#f6e7d4' } = {}) {
  const renderer = makeRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  scene.add(camera, ...studioLights(camera));
  followSize(container, renderer, camera);

  const clock = new THREE.Timer();
  const run = (step) => renderer.setAnimationLoop(() => {
    step(Math.min(clock.update().getDelta(), 0.1));
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, run, frame: (objects, opts) => frame(camera, objects, opts) };
}

const VIEW = new THREE.Vector3(0, 0.28, 1).normalize();

/** Fits the camera to every corner of the box around `objects`, seen from `view` (slightly above by default). */
export function frame(camera, objects, { margin = 1.2, view = VIEW } = {}) {
  const box = new THREE.Box3();
  for (const o of objects) box.expandByObject(o);
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const right = new THREE.Vector3(0, 1, 0).cross(view).normalize(), up = view.clone().cross(right);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect, o = new THREE.Vector3();
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    o.set(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z);
    dist = Math.max(dist, o.dot(view) + margin * Math.max(Math.abs(o.dot(up)) / tanV, Math.abs(o.dot(right)) / tanH));
  }
  camera.position.copy(centre).addScaledVector(view, dist);
  camera.lookAt(centre);
}
