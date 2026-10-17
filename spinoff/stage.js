import * as THREE from 'three';
import { roomEnvironment } from '../inventory/room-environment.js';
import { studioLights } from '../characters/selfie-studio.js';

/** `?tone=`, `?exposure=` and `?env=` (room light strength, 1 = as tuned; `map` = the old PMREM room map) on this page, or carried from the tap page (index.html) through sessionStorage. */
function lookParam(key) {
  const v = new URLSearchParams(location.search).get(key);
  try {
    return v ?? sessionStorage.getItem(`donut.${key}`);
  } catch {
    return v;
  }
}

const TONE = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping };

function makeRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // neutral shows a colour as itself (the chooser's swatches match the fighter); ACES clipped the loud palette
  renderer.toneMapping = TONE[lookParam('tone')] ?? TONE.neutral;
  renderer.toneMappingExposure = Number(lookParam('exposure')) || 0.7;
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

/** roomEnvironment()'s irradiance as L2 spherical harmonics (grey), from LightProbeGenerator on an M3. */
const ROOM_SH = [1.496, 1.488, 1.152, 0.093, 0.122, 1.25, 0.657, -0.232, -0.479];

// ponytail: tablet GPUs prefilter the PMREM room map differently (mediump), so the room is a light probe plus a camera fill that the material shader evaluates like the other lights; loses the map's soft reflections; tuned to the map's look with colors.html.
function roomLights(camera, strength) {
  const probe = new THREE.LightProbe(new THREE.SphericalHarmonics3().fromArray(ROOM_SH.flatMap((v) => [v, v, v])), strength);
  const fill = new THREE.DirectionalLight('#ffffff', 0.3 * strength);
  fill.position.set(0, 0, 1);
  camera.add(probe, fill, fill.target);
  return [probe, fill];
}

export function makeStage(container, { background = '#f6e7d4' } = {}) {
  const renderer = makeRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const env = lookParam('env');
  const room = env === 'map' ? [] : roomLights(camera, env !== null && Number(env) >= 0 ? Number(env) : 1);
  if (env === 'map') scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
  scene.add(camera, ...studioLights(camera));
  followSize(container, renderer, camera);

  const clock = new THREE.Timer();
  const run = (step) => renderer.setAnimationLoop(() => {
    step(Math.min(clock.update().getDelta(), 0.1));
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, room, run, frame: (objects, opts) => frame(camera, objects, opts) };
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
