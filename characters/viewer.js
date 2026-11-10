import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../inventory/room-environment.js';

// The designer pages' shared stage: species checker, dress-up, crowd, sit and knit (motion lab: fitToWindow only).

/** Keeps the renderer and camera the window's size, now and on every resize. */
export function fitToWindow(renderer, camera) {
  const fit = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', fit);
  fit();
}

/** A shadowed renderer in #app, the shop's wall colour and room light, a 35° orbit camera. */
export function makeViewer({ far = 100, minDistance = 0.3, maxDistance = 40 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8e2d9');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, far);
  fitToWindow(renderer, camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance, maxDistance, autoRotateSpeed: 1.5 });
  return { renderer, scene, camera, controls };
}

/** Warm key light casting the shadow (`shadow` sets its camera), cool rim, sky fill. Returns the key. */
export function addLights(scene, shadow, { at = [2.2, 3.4, 1.8], rimAt = [-2.4, 1.6, -2.4], mapSize = 1024, bias = -0.0012 } = {}) {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
  key.position.fromArray(at);
  key.castShadow = true;
  key.shadow.mapSize.set(mapSize, mapSize);
  Object.assign(key.shadow.camera, shadow);
  key.shadow.bias = bias;
  const rim = new THREE.DirectionalLight('#bcd4ff', 1.1);
  rim.position.fromArray(rimAt);
  scene.add(key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55));
  return key;
}

/** A shadow catcher disc on the floor. */
export function addGround(scene, radius, segments = 64, opacity = 0.22) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), new THREE.ShadowMaterial({ opacity }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

const VIEW_DIR = new THREE.Vector3(0.32, 0.20, 1).normalize();

function fitDistance(camera, size, targetPx) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const depth = Math.max(size.z, 0.01) * 0.5;
  return targetPx
    ? (Math.max(size.y, 0.01) * innerHeight / targetPx) / (2 * Math.tan(vFov / 2)) + depth
    : 1.15 * Math.max(size.y / (2 * Math.tan(vFov / 2)), size.x / (2 * Math.tan(hFov / 2))) + depth;
}

/** Frames `roots` from front right and a little above: all of them, or so they stand `targetPx` tall. */
export function frameObjects({ camera, controls }, roots, targetPx = 0) {
  const box = new THREE.Box3();
  roots.forEach((root) => box.expandByObject(root));
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = fitDistance(camera, size, targetPx);
  if (!Number.isFinite(dist) || !Number.isFinite(center.y)) {
    console.warn('frameObjects: non-finite bounds, check for undefined params');
    return;
  }
  camera.filmOffset = ((size.x * 0.16) / dist) * camera.getFilmWidth();
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
  controls.update();
}

const ORBIT_STEP = Math.PI / 12;
const SNAP_VIEWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Moves the camera round its target to `turn(spherical)`, never quite over the top. */
function orbit({ camera, controls }, turn) {
  const offset = camera.position.clone().sub(controls.target);
  const s = turn(new THREE.Spherical().setFromVector3(offset));
  s.phi = THREE.MathUtils.clamp(s.phi, 0.05, Math.PI - 0.05);
  camera.position.copy(controls.target).add(offset.setFromSpherical(s));
  controls.update();
}

/** The camera keys the slot pages share: F frame, D 150px test, arrows orbit, V front/side/back, T turntable, B squint. */
export function cameraKeys(viewer, frame) {
  let snap = 0;
  const by = (dTheta, dPhi) => () => orbit(viewer, (s) => Object.assign(s, { theta: s.theta + dTheta, phi: s.phi + dPhi }));
  return {
    f: () => { snap = 0; frame(); },
    d: () => frame(150),
    arrowleft: by(-ORBIT_STEP, 0),
    arrowright: by(ORBIT_STEP, 0),
    arrowup: by(0, -ORBIT_STEP),
    arrowdown: by(0, ORBIT_STEP),
    v: () => { snap = (snap + 1) % SNAP_VIEWS.length; orbit(viewer, (s) => Object.assign(s, { theta: SNAP_VIEWS[snap] })); },
    t: () => { viewer.controls.autoRotate = !viewer.controls.autoRotate; },
    b: () => viewer.renderer.domElement.classList.toggle('squint'),
  };
}

export const isFormField = (el) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

/** `actions[e.key lower-cased](e)` on keydown (capture, default prevented), except while typing in a form field. */
export function onKeys(actions) {
  addEventListener('keydown', (e) => {
    if (isFormField(e.target)) return;
    const action = actions[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    action(e);
  }, true);
}
