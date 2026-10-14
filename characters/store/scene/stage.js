import { TONE_MAPPING } from '../../npc.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../../../inventory/room-environment.js';
import { ROOM, S } from '../core/config.js';
import { shop } from '../core/state.js';

const app = document.getElementById('app');

export const renderer = new THREE.WebGLRenderer({ antialias: true });

export const applyRenderScale = () =>
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * S.renderScale);

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 200);

export const controls = new OrbitControls(camera, renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);

export const key = new THREE.DirectionalLight('#ffe6c4', 2.4);

export const rim = new THREE.DirectionalLight('#bcd4ff', 0.9);

function setUpRenderer() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = TONE_MAPPING[S.toneMapping];
  renderer.toneMappingExposure = S.exposure;
  app.appendChild(renderer.domElement);
  scene.background = new THREE.Color('#e8e2d9');
  scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;
}

function setUpControls() {
  controls.enableDamping = true;
  controls.minDistance = 2.5;
  controls.maxPolarAngle = Math.PI * 0.42;
  // STORE-SCENE.md §Camera
  controls.maxDistance = 20;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.screenSpacePanning = false;
}

export const hemi = new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.6);

function setUpLights() {
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  const r = Math.hypot(ROOM.w, ROOM.d) / 2 + 0.8;
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 1;
  rim.position.set(-4, 2.5, -5);
  scene.add(key, hemi, rim);
  applyDaylight(0);
}

// STORE-SCENE.md §Daylight
const LOOKS = {
  morning: {
    sunDir: [-0.4, 1.1, -0.2], sun: '#fff4e4', sunI: 2.6,
    sky: '#e4eeff', ground: '#9a8a74', hemiI: 0.8, rimI: 0.7, bg: '#e6ecee', lamp: 0,
  },
  afternoon: {
    sunDir: [0.25, 0.30, -0.9], sun: '#ffb46e', sunI: 3.2,
    sky: '#ffd8b0', ground: '#6e5242', hemiI: 0.5, rimI: 0.15, bg: '#f0c493', lamp: 1,
  },
};

export const lamps = [];

const LAMPS_ON = [0.45, 0.8];

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixColor = (target, a, b, t) => target.copy(_ca.set(a)).lerp(_cb.set(b), t);
const mix = (a, b, t) => a + (b - a) * t;

export function applyDaylight(t) {
  const { morning: m, afternoon: a } = LOOKS;
  key.position.copy(_a.fromArray(m.sunDir).normalize()
    .lerp(_b.fromArray(a.sunDir).normalize(), t).normalize().multiplyScalar(10));
  mixColor(key.color, m.sun, a.sun, t);
  key.intensity = mix(m.sunI, a.sunI, t);
  mixColor(hemi.color, m.sky, a.sky, t);
  mixColor(hemi.groundColor, m.ground, a.ground, t);
  hemi.intensity = mix(m.hemiI, a.hemiI, t);
  rim.intensity = mix(m.rimI, a.rimI, t);
  if (scene.background instanceof THREE.Color) mixColor(scene.background, m.bg, a.bg, t);
  const glow = mix(m.lamp, a.lamp, THREE.MathUtils.smoothstep(t, LAMPS_ON[0], LAMPS_ON[1]));
  for (const l of lamps) {
    if (l.light) l.light.intensity = glow * l.power;
    l.shade.emissiveIntensity = 0.15 + glow * 0.85;
  }
}

let shownT = 0;

export function tickDaylight(dt) {
  const target = S.followDay ? shop.dayT : S.timeOfDay;
  if (Math.abs(target - shownT) < 1e-4) return;
  shownT += (target - shownT) * (1 - Math.exp(-dt / 1.2));
  applyDaylight(shownT);
}

export function installStage() {
  setUpRenderer();
  setUpControls();
  setUpLights();
}
