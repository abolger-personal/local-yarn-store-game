import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../inventory/room-environment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  TONE_MAPPING, POSES, GEO_DETAIL, BUILD, MOTION_DEFAULTS,
  createCharacter, applyPose, setViewMode, disposeCharacter,
  setGeometryDetail, getSpecies, speciesList, slugify, shareRandomParams,
  stepMotion, resetMotion, motionOf, walkPhase, walkLayer, walkGain, phaseStep,
  DANCES, DANCE_NAMES, makeDance, stepDance,
} from './npc.js';
import { randomTraits } from './visit.js';

console.info('LYS build', BUILD);

import './owl.js';
import './llama.js';
import './lion.js';

const SLOTS = ['A', 'B'];
const STORE_KEY = 'lys.speciesChecker.v1';

const state = {
  active: 'A',
  detail: 'high',
  view: 'felted',
  pose: 'rest',
  exposure: 0.40,
  toneMapping: 'ACES',
  spacing: 0.62,
  linkShared: true,
  play: false,
  idle: true,
  walk: false,
  speed: 0.5,
  dance: 'none',
  repeat: true,
  slots: {
    A: { speciesId: 'owl', params: null },
    B: { speciesId: 'llama', params: null },
  },
};

const freshParams = (speciesId) => Object.assign(
  structuredClone(getSpecies(speciesId).defaults),
  { mergeMeshes: false },
);

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e2d9');

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 40;
controls.autoRotateSpeed = 1.5;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;

function addLights() {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
  key.position.set(2.2, 3.4, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { near: 0.5, far: 14, left: -2, right: 2, top: 2, bottom: -2 });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 1;
  const rim = new THREE.DirectionalLight('#bcd4ff', 1.1);
  rim.position.set(-2.4, 1.6, -2.4);
  scene.add(key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55));
}
addLights();

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 64),
  new THREE.ShadowMaterial({ opacity: 0.22 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const built = { A: null, B: null };

function slotX(id) {
  return (id === 'A' ? -1 : 1) * state.spacing;
}

function measureHeight(root) {
  const box = new THREE.Box3().setFromObject(root);
  return Math.max(box.max.y - box.min.y, 0.01);
}

function disposeSlot(id) {
  if (!built[id]) return;
  scene.remove(built[id].root);
  disposeCharacter(built[id]);
  built[id] = null;
}

function buildSlot(id) {
  disposeSlot(id);
  const slot = state.slots[id];
  slot.params ??= freshParams(slot.speciesId);
  const character = createCharacter(slot.params, slot.speciesId);
  character.root.position.x = slotX(id);
  setViewMode(character.root, state.view);
  scene.add(character.root);
  built[id] = character;
  slot.height = measureHeight(character.root);
  slot.opts ??= {
    ...MOTION_DEFAULTS,
    ...motionOf(randomTraits(), getSpecies(slot.speciesId).motionRanges),
  };
  slot.base ??= { stiff: slot.opts.stiff, zeta: slot.opts.zeta };
  slot.phase ??= Math.random();
  if (state.play) resetMotion(character.motion, POSES[state.pose]);
}

function buildAll() {
  SLOTS.forEach(buildSlot);
  updatePlates();
}

function sceneBounds() {
  const box = new THREE.Box3();
  SLOTS.forEach((id) => built[id] && box.expandByObject(built[id].root));
  return box;
}

const VIEW_DIR = new THREE.Vector3(0.32, 0.20, 1).normalize();

function fitDistance(size, targetPx) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const depth = Math.max(size.z, 0.01) * 0.5;
  return targetPx
    ? (Math.max(size.y, 0.01) * innerHeight / targetPx) / (2 * Math.tan(vFov / 2)) + depth
    : 1.15 * Math.max(size.y / (2 * Math.tan(vFov / 2)), size.x / (2 * Math.tan(hFov / 2))) + depth;
}

function frameAll(targetPx = 0) {
  const box = sceneBounds();
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = fitDistance(size, targetPx);

  if (!Number.isFinite(dist) || !Number.isFinite(center.y)) {
    console.warn('frameAll: non-finite bounds, check for undefined params');
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
const spherical = new THREE.Spherical();
let snapIndex = 0;

function setOrbit(theta, phi) {
  const offset = camera.position.clone().sub(controls.target);
  spherical.setFromVector3(offset);
  spherical.theta = theta ?? spherical.theta;
  spherical.phi = THREE.MathUtils.clamp(phi ?? spherical.phi, 0.05, Math.PI - 0.05);
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  controls.update();
}

function orbitBy(dTheta, dPhi) {
  spherical.setFromVector3(camera.position.clone().sub(controls.target));
  setOrbit(spherical.theta + dTheta, spherical.phi + dPhi);
}

function nextSnapView() {
  snapIndex = (snapIndex + 1) % SNAP_VIEWS.length;
  setOrbit(SNAP_VIEWS[snapIndex]);
}

const plates = { A: document.getElementById('plateA'), B: document.getElementById('plateB') };
const projected = new THREE.Vector3();
const fullPlateWidth = { A: 0, B: 0 };

function plateRoom() {
  const a = projected.set(slotX('A'), 0, 0).project(camera).x;
  const b = projected.set(slotX('B'), 0, 0).project(camera).x;
  return Math.abs(a - b) * 0.5 * innerWidth;
}

function positionPlate(id) {
  const el = plates[id];
  const character = built[id];
  if (!character) return;
  el.classList.toggle('compact', plateRoom() < (fullPlateWidth[id] ?? 0));
  projected.set(slotX(id), 0, 0).project(camera);
  el.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight + 8}px`;
}

function updatePlates() {
  for (const id of SLOTS) {
    const slot = state.slots[id];
    const height = slot.height?.toFixed(3) ?? '?';
    plates[id].innerHTML =
      `${slot.params?.name ?? ''}<small>${slot.speciesId} · height ${height} · torso ` +
      `${slot.params?.torsoW.toFixed(2)}×${slot.params?.torsoH.toFixed(2)}</small>`;
    plates[id].classList.toggle('active', id === state.active);
    plates[id].classList.remove('compact');
    fullPlateWidth[id] = plates[id].offsetWidth;
  }
}

function save() {
  const payload = {
    active: state.active, view: state.view, pose: state.pose, detail: state.detail,
    exposure: state.exposure, toneMapping: state.toneMapping, spacing: state.spacing,
    linkShared: state.linkShared,
    play: state.play, speed: state.speed, idle: state.idle, walk: state.walk,
    repeat: state.repeat,
    slots: Object.fromEntries(SLOTS.map((id) => [id, {
      speciesId: state.slots[id].speciesId,
      params: state.slots[id].params,
    }])),
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch { /* quota */ }
}

function restoreSlot(id, savedSlot) {
  const species = getSpecies(savedSlot?.speciesId);
  if (!species) return;
  state.slots[id] = {
    speciesId: savedSlot.speciesId,
    params: { ...structuredClone(species.defaults), ...savedSlot.params },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state, saved, { slots: state.slots });
    if (!(state.pose in POSES)) state.pose = 'rest';
    for (const id of SLOTS) restoreSlot(id, saved.slots?.[id]);
  } catch { /* corrupt save, fall back to defaults */ }
}

let gui = null;
const activeSlot = () => state.slots[state.active];
const refreshGui = () => gui?.controllersRecursive().forEach((c) => c.updateDisplay());

function rebuildActive() {
  buildSlot(state.active);
  updatePlates();
  save();
}

function randomiseSlot(id) {
  const slot = state.slots[id];
  getSpecies(slot.speciesId).randomise(slot.params);
  slot.opts = null;
  buildSlot(id);
  updatePlates();
  refreshGui();
  save();
}

function randomiseBoth() {
  const [a, b] = SLOTS.map((id) => state.slots[id]);
  SLOTS.forEach((id) => {
    getSpecies(state.slots[id].speciesId).randomise(state.slots[id].params);
    state.slots[id].opts = null;
  });
  if (state.linkShared) {
    shareRandomParams(a.params, b.params, getSpecies(a.speciesId), getSpecies(b.speciesId));
  }
  buildAll();
  refreshGui();
  save();
}

function setSpecies(id, speciesId) {
  state.slots[id] = { speciesId, params: freshParams(speciesId) };
  buildSlot(id);
  buildGui();
  frameAll();
  save();
}

function setPose(name) {
  state.pose = name;
  if (!state.play) {
    for (const id of SLOTS) {
      Object.assign(state.slots[id].params, POSES[name]);
      if (built[id]) applyPose(built[id], POSES[name]);
    }
  }
  refreshGui();
  save();
}

const POSE_NAMES = Object.keys(POSES);

function nextPose() {
  setPose(POSE_NAMES[(POSE_NAMES.indexOf(state.pose) + 1) % POSE_NAMES.length]);
}

function setPlay(on) {
  state.play = on;
  if (!on && state.dance !== 'none') {
    state.dance = 'none';
    for (const id of SLOTS) {
      const slot = state.slots[id];
      slot.perf = null;
      slot.rise = 0;
      restoreSpring(slot);
      if (built[id]) resetPlacement(id);
    }
  }
  if (on) SLOTS.forEach((id) => built[id] && resetMotion(built[id].motion, POSES[state.pose]));
  else setPose(state.pose);
  buildGui();
  save();
}

function setView(mode) {
  state.view = mode;
  scene.background = new THREE.Color(mode === 'silhouette' ? '#ffffff' : '#e8e2d9');
  ground.visible = mode !== 'silhouette';
  SLOTS.forEach((id) => built[id] && setViewMode(built[id].root, mode));
}

function exportActive() {
  const slot = activeSlot();
  const json = JSON.stringify({ speciesId: slot.speciesId, params: slot.params }, null, 2);
  navigator.clipboard?.writeText(json).catch(() => {});
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(slot.params.name)}.${slot.speciesId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const clock = new THREE.Timer();

function stepDanceFor(id, character, slot, dt) {
  if (!slot.perf) return null;
  const d = stepDance(slot.perf, dt);
  if (d.done) {
    if (state.repeat) slot.perf = makeDance(state.dance);
    else { slot.perf = null; state.dance = 'none'; restoreSpring(slot); buildGui(); }
  }
  character.root.position.x = slotX(id) + d.shift;
  character.root.position.z = d.travel;
  character.root.rotation.y = d.turn;
  slot.rise = d.rise;
  return d;
}

function stepSlot(id, dt) {
  const character = built[id];
  if (!character) return;
  const slot = state.slots[id];
  slot.opts.idleAmount = state.idle ? 1 : 0;
  const d = stepDanceFor(id, character, slot, dt);
  const walking = d ? d.walk > 0 : state.walk;
  const dial = state.walk ? state.speed : 0;
  const speed = d ? d.walk : dial;
  const L = character.params.legHeight + character.params.hipInset;
  const w = walkPhase(slot.phase, speed, L, slot.opts);
  const gain = walkGain(character.motion, speed, dt, slot.opts);
  slot.phase = (slot.phase + phaseStep(speed * dt, speed, L, slot.opts)) % 1;
  stepMotion(character, d ? d.pose : POSES[state.pose], dt, slot.opts,
    walking ? (out) => walkLayer(out, w, gain, slot.opts) : null);
  if (slot.rise) character.root.position.y += slot.rise;
}

function stepAll(dt) {
  for (const id of SLOTS) stepSlot(id, dt);
}

function restoreSpring(slot) {
  if (!slot.base) return;
  slot.opts.stiff = slot.base.stiff;
  slot.opts.zeta = slot.base.zeta;
}

function setDance(name) {
  state.dance = name;
  if (name !== 'none' && !state.play) setPlay(true);
  for (const id of SLOTS) {
    const slot = state.slots[id];
    slot.rise = 0;
    if (name === 'none') {
      slot.perf = null;
      restoreSpring(slot);
      if (built[id]) resetPlacement(id);
    } else {
      slot.perf = makeDance(name);
      slot.opts.stiff = DANCES[name].stiff;
      slot.opts.zeta = DANCES[name].zeta;
    }
  }
  buildGui();
  save();
}

function resetPlacement(id) {
  const { root } = built[id];
  root.position.x = slotX(id);
  root.position.z = 0;
  root.rotation.y = 0;
}

function addControl(folder, params, entry, onChange) {
  const [key, a, b, step] = entry;
  if (!(key in params)) return;
  if (a === 'color') folder.addColor(params, key).onChange(onChange);
  else if (a === 'bool') folder.add(params, key).onChange(onChange);
  else if (Array.isArray(a)) folder.add(params, key, a).onChange(onChange);
  else folder.add(params, key, a, b, step ?? 0.001).onChange(onChange);
}

function presetHandler(species, params, onChange) {
  return () => {
    species.onPresetChange(params, params[species.presetKey]);
    onChange();
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  };
}

function addSlotFolders(species, params, onChange) {
  const isPreset = (key) => key === species.presetKey && species.onPresetChange;
  for (const [title, entries] of Object.entries(species.gui)) {
    const folder = gui.addFolder(title);
    entries.forEach((entry) => addControl(folder, params, entry,
      isPreset(entry[0]) ? presetHandler(species, params, onChange) : onChange));
    if (state.play && title === 'pose') folder.controllers.forEach((c) => c.disable());
    folder.close();
  }
}

function addTopControls(species) {
  gui.add(state, 'active', SLOTS).name('editing slot  (Tab)').onChange(() => { buildGui(); updatePlates(); });
  gui.add({ id: species.id }, 'id', speciesList().map((s) => s.id))
    .name('species').onChange((v) => setSpecies(state.active, v));
  gui.add(activeSlot().params, 'name').onChange(() => { updatePlates(); save(); });
  gui.add({ f: () => randomiseSlot(state.active) }, 'f').name('randomise slot  (R)');
  gui.add({ f: randomiseBoth }, 'f').name('randomise both  (Shift R)');
  gui.add(state, 'linkShared').name('link shared params').onChange(save);
  gui.add({ f: () => setSpecies(state.active, activeSlot().speciesId) }, 'f').name('reset slot');
  gui.add({ f: exportActive }, 'f').name('export slot  (E)');
}

function addMotionFolder() {
  const folder = gui.addFolder('motion');
  folder.add(state, 'play').name('animate  (M)').onChange(setPlay);
  folder.add(state, 'idle').name('+ idle layer  (I)').onChange(save);
  folder.add(state, 'walk').name('+ walk layer  (W)').onChange(save);
  folder.add(state, 'speed', 0, 1.5, 0.01).name('walk speed').onChange(save);

  const dances = gui.addFolder('victory dances');
  dances.add(state, 'dance', ['none', ...DANCE_NAMES]).name('dance').onChange(setDance);
  dances.add(state, 'repeat').name('repeat one-shots').onChange(save);
  for (const name of DANCE_NAMES) {
    dances.add({ f: () => { setDance('none'); setDance(name); } }, 'f').name(`▶ ${name}`);
  }
}

function addSceneFolder() {
  const folder = gui.addFolder('scene');
  const poseRow = folder.add(state, 'pose', POSE_NAMES).onChange(setPose);
  if (state.dance !== 'none') poseRow.disable();
  folder.add(state, 'view', ['felted', 'grey', 'silhouette']).onChange(setView);
  folder.add(state, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail')
    .onChange((v) => { setGeometryDetail(v); buildAll(); save(); });
  folder.add(state, 'spacing', 0.2, 1.6, 0.01).onChange(() => { buildAll(); save(); });
  folder.add({ f: () => frameAll() }, 'f').name('frame both  (F)');
  folder.add({ f: () => frameAll(150) }, 'f').name('150px test  (D)');
  folder.add({ f: () => renderer.domElement.classList.toggle('squint') }, 'f').name('squint  (B)');
  folder.add(state, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  folder.add(state, 'toneMapping', Object.keys(TONE_MAPPING))
    .onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));
}

function buildGui() {
  gui?.destroy();
  gui = new GUI({ title: 'species checker' });
  const slot = activeSlot();
  const species = getSpecies(slot.speciesId);
  addTopControls(species);
  addMotionFolder();
  addSceneFolder();
  addSlotFolders(species, slot.params, rebuildActive);
  gui.onFinishChange(save);
}

const KEY_ACTIONS = {
  tab: () => { state.active = state.active === 'A' ? 'B' : 'A'; buildGui(); updatePlates(); },
  r: (e) => (e.shiftKey ? randomiseBoth() : randomiseSlot(state.active)),
  f: () => { snapIndex = 0; frameAll(); },
  d: () => frameAll(150),
  arrowleft: () => orbitBy(-ORBIT_STEP, 0),
  arrowright: () => orbitBy(ORBIT_STEP, 0),
  arrowup: () => orbitBy(0, -ORBIT_STEP),
  arrowdown: () => orbitBy(0, ORBIT_STEP),
  v: () => nextSnapView(),
  t: () => { controls.autoRotate = !controls.autoRotate; },
  b: () => renderer.domElement.classList.toggle('squint'),
  e: () => exportActive(),
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  p: () => nextPose(),
  m: () => setPlay(!state.play),
  i: () => { state.idle = !state.idle; refreshGui(); save(); },
  w: () => { state.walk = !state.walk; refreshGui(); save(); },
  x: () => {
    const all = ['none', ...DANCE_NAMES];
    setDance(all[(all.indexOf(state.dance) + 1) % all.length]);
  },
  c: () => { if (state.dance !== 'none') { const d = state.dance; setDance('none'); setDance(d); } },
};

const isFormField = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

addEventListener('keydown', (e) => {
  if (isFormField(e.target)) return;
  const action = KEY_ACTIONS[e.key.toLowerCase()];
  if (!action) return;
  e.preventDefault();
  action(e);
}, true);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

load();
setGeometryDetail(state.detail);
renderer.toneMapping = TONE_MAPPING[state.toneMapping];
renderer.toneMappingExposure = state.exposure;
buildAll();
setView(state.view);
buildGui();
frameAll();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.update().getDelta(), 0.1);
  if (state.play) stepAll(dt);
  controls.update();
  renderer.render(scene, camera);
  SLOTS.forEach(positionPlate);
});
