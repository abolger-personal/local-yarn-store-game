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

/** Fits the camera to everything in `objects`, seen slightly from above. */
export function frame(camera, objects, { margin = 1.2, view = VIEW } = {}) {
  const box = new THREE.Box3();
  for (const o of objects) box.expandByObject(o);
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov), hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = margin * Math.max(size.y / (2 * Math.tan(vFov / 2)), size.x / (2 * Math.tan(hFov / 2))) + size.z / 2;
  camera.position.copy(centre).addScaledVector(view, dist);
  camera.lookAt(centre);
}
