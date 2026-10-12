import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../inventory/room-environment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  TONE_MAPPING, POSES, MOTION_DEFAULTS, BUILD, createCharacter, disposeCharacter, applyPose, getSpecies,
  stepMotion, resetMotion, motionOf, lowestResting, seatedHipsAlong,
} from './npc.js';
import { randomTraits } from './visit.js';
import { CRAFT_MODES, TELLS, makeCraft, stepCraft, poseCraft, disposeCraft } from './craft-anim.js';
import { makeSparkle, playSparkle, stepSparkle } from './sparkle.js';
import { PATTERN_NAMES } from '../inventory/catalog.js';
import { CHAIR_BACK_Z, CHAIR_W, SEAT_H } from './store/core/config.js';
import './owl.js';
import './llama.js';
import './lion.js';

console.info('LYS build', BUILD);

const state = {
  species: 'owl', mode: 'knit', tell: 'none', pattern: 'hat', skill: 3, speed: 1.5, progress: 0.2, grow: true,
  color: '#c8657a', wallYaw: 0.9, view: 'close',
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = TONE_MAPPING.ACES;
renderer.toneMappingExposure = 0.4;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e2d9');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function addLights() {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
  key.position.set(2.2, 3.4, 1.8);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5 });
  const rim = new THREE.DirectionalLight('#bcd4ff', 1.1);
  rim.position.set(-2.4, 1.6, -2.4);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55), ground);
}

function addChair() {
  const wood = new THREE.MeshStandardMaterial({ color: '#b27c51', roughness: 0.72 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(CHAIR_W, 0.025, CHAIR_W), wood);
  top.position.y = SEAT_H - 0.0125;
  const back = new THREE.Mesh(new THREE.BoxGeometry(CHAIR_W, 0.36, 0.02), wood);
  back.position.set(0, SEAT_H + 0.18, CHAIR_BACK_Z);
  for (const m of [top, back]) m.castShadow = m.receiveShadow = true;
  scene.add(top, back);
}
addLights();
addChair();

let built = null, craft = null, sparkle = null, opts = null, seatY = 0;

function seat(b) {
  applyPose(b, POSES.sit);
  seatY = SEAT_H + b.root.position.y - lowestResting(b) - 0.01;
  b.root.position.z = seatedHipsAlong(b.params, CHAIR_W);
  resetMotion(b.motion, POSES.sit);
}

function buildCraft() {
  if (craft) disposeCraft(craft);
  const { mode, color, pattern, skill, progress, wallYaw } = state;
  craft = makeCraft(built, { mode, color, pattern, skill, progress, wallYaw });
  Object.assign(craft, { tell: state.tell, speed: state.speed, perStitch: state.grow ? 1 / 400 : 0 });
}

function buildSitter(randomise = false) {
  if (craft) disposeCraft(craft);
  craft = null;
  if (built) { scene.remove(built.root); disposeCharacter(built); }
  const kit = getSpecies(state.species);
  const P = structuredClone(kit.defaults);
  built = createCharacter(randomise ? kit.randomise(P) : P, state.species);
  scene.add(built.root);
  opts = { ...MOTION_DEFAULTS, ...motionOf(randomTraits(), kit.motionRanges) };
  seat(built);
  sparkle = makeSparkle(built);
  buildCraft();
  frame();
}

const VIEW_DIR = new THREE.Vector3(0.45, 0.35, 1).normalize();

function frame() {
  const box = new THREE.Box3().setFromObject(built.root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const px = state.view === 'shop' ? 150 : innerHeight * 0.7;
  const dist = (size.y * innerHeight) / px / (2 * half);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
  controls.update();
}

const live = (k) => (v) => { if (craft) craft[k] = v; };

function buildGui() {
  const gui = new GUI({ title: 'sit and knit' });
  gui.add(state, 'species', ['owl', 'llama', 'lion']).onChange(() => buildSitter());
  gui.add({ roll: () => buildSitter(true) }, 'roll').name('new individual');
  gui.add(state, 'mode', CRAFT_MODES).onChange(live('mode'));
  gui.add(state, 'tell', TELLS).name('tell (out = out of yarn)').onChange(live('tell'));
  gui.add({ ready: () => playSparkle(sparkle) }, 'ready').name('Ready!  (gap closed)');
  gui.add(state, 'pattern', PATTERN_NAMES).name('pattern (piece size)').onChange(live('pattern'));
  gui.add(state, 'skill', 1, 5, 1).name('crafter skill').onChange(live('skill'));
  gui.add(state, 'speed', 0.1, 3, 0.05).name('stitch speed').onChange(live('speed'));
  gui.add(state, 'progress', 0, 1, 0.01).name('piece progress').listen().onChange(live('progress'));
  gui.add(state, 'grow').name('grows as they knit').onChange((v) => live('perStitch')(v ? 1 / 400 : 0));
  gui.addColor(state, 'color').name('yarn').onChange(buildCraft);
  gui.add(state, 'wallYaw', -1.4, 1.4, 0.05).name('yarn wall direction').onChange(live('wallYaw'));
  gui.add(state, 'view', ['close', 'shop']).name('camera').onChange(frame);
}

const clock = new THREE.Timer();
const stats = document.getElementById('stats');

function tick() {
  const dt = Math.min(clock.update().getDelta(), 0.1);
  stepCraft(craft, dt);
  stepMotion(built, POSES.sit, dt, opts, craft.add);
  built.root.position.y = seatY;
  poseCraft(craft);
  stepSparkle(sparkle, dt);
  state.progress = craft.progress;
  stats.textContent = `stitches ${craft.count} · progress ${(craft.progress * 100).toFixed(0)}%`;
  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

buildSitter();
buildGui();
renderer.setAnimationLoop(tick);
