import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  TONE_MAPPING, POSES, GEO_DETAIL, BUILD, BASE_PARAMS,
  createCharacter, applyPose, setViewMode, disposeCharacter,
  setGeometryDetail, getSpecies, speciesList, slugify, shareRandomParams, applyPreset, BASE_GUI, GUI_SECTIONS,
  resetMotion, DANCES, DANCE_NAMES,
} from './npc.js';
import { addGround, addLights, cameraKeys, frameObjects, makeViewer, onKeys } from './viewer.js';
import { danceSlots, freshParams, nextDance, randomOpts, stepSlot } from './slot-motion.js';
import { aimGameCamera } from '../spinoff/stage.js';
import { FUR, LOOKS, setFur } from '../spinoff/fighter.js';
import { PAINT, inkMaterial, inkOutline } from './paint.js';

console.info('LYS build', BUILD);

import './species.js';

const SLOTS = ['A', 'B', 'C', 'D', 'E'];
const slotIndex = (id) => SLOTS.indexOf(id);
// partners square up: A and B, C and D; the odd one out (E) faces D
const partnerOf = (id) => SLOTS[slotIndex(id) ^ 1] ?? SLOTS[slotIndex(id) - 1];

// BODIES.md §Face, §Look-at: one row per style switch, a boolean rig param set on every slot (default: the
// game's, spinoff/fighter.js LOOKS); `live` switches take effect on the next frame, the rest rebuild the slots
const STYLE_SWITCHES = Object.freeze([
  { key: 'lookAt', name: 'look-at', live: true },
  { key: 'eyeGlint', name: 'eye glint' },
  { key: 'painterly', name: 'painterly' },
  { key: 'shapedFaces', name: 'shaped faces' },
]);
const STYLE = Object.freeze(Object.fromEntries(STYLE_SWITCHES.map(({ key }) => [key, LOOKS[key] ?? BASE_PARAMS[key] ?? false])));
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
  editAll: false,
  play: false,
  idle: true,
  walk: false,
  speed: 0.5,
  dance: 'none',
  repeat: true,
  side: false,
  slow: 1,
  style: { ...STYLE },
  lookAtOther: false,
  matchCamera: false,
  slots: /** @type {Record<string, any>} */ (
    Object.fromEntries(SLOTS.map((id, i) => [id, { speciesId: speciesList()[i % speciesList().length].id, params: null }]))),
};

const viewer = makeViewer();
const { renderer, scene, camera, controls } = viewer;
addLights(scene, { near: 0.5, far: 14, left: -2, right: 2, top: 2, bottom: -2 });
const ground = addGround(scene, 2.6);

const built = Object.fromEntries(SLOTS.map((id) => [id, null]));

function slotX(id) {
  return (2 * slotIndex(id) - (SLOTS.length - 1)) * state.spacing;
}

// the match camera sees fighters side on, facing each other (spinoff/play.js placeFighter)
const slotYaw = (id) => (state.matchCamera ? Math.sign(slotX(partnerOf(id)) - slotX(id)) * Math.PI / 2 : 0);

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
  Object.assign(slot.params, state.style);
  const character = createCharacter(slot.params, slot.speciesId);
  inkOutline(character.root);
  character.root.position.x = slotX(id);
  character.root.rotation.y = slotYaw(id);
  setViewMode(character.root, state.view);
  scene.add(character.root);
  built[id] = character;
  slot.height = measureHeight(character.root);
  slot.opts ??= randomOpts(getSpecies(slot.speciesId));
  slot.base ??= { stiff: slot.opts.stiff, zeta: slot.opts.zeta };
  slot.phase ??= Math.random();
  if (state.play) resetMotion(character.motion, POSES[state.pose]);
}

function buildAll() {
  SLOTS.forEach(buildSlot);
  updatePlates();
}

const frameAll = (targetPx = 0) => frameObjects(viewer, Object.values(built).filter(Boolean).map((c) => c.root), targetPx);

const plates = Object.fromEntries(SLOTS.map((id) => {
  const el = document.createElement('div');
  el.className = 'plate';
  document.body.append(el);
  return [id, el];
}));
const projected = new THREE.Vector3();
const fullPlateWidth = Object.fromEntries(SLOTS.map((id) => [id, 0]));

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
  const { dance: _dance, slots, ...rest } = state;
  const payload = { ...rest, slots: Object.fromEntries(SLOTS.map((id) => [id, { speciesId: slots[id].speciesId, params: slots[id].params }])) };
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
    if (!(state.slow >= 1 && state.slow <= 10)) state.slow = 1;
    state.style = { ...STYLE };
    for (const k of Object.keys(STYLE)) if (typeof saved.style?.[k] === 'boolean') state.style[k] = saved.style[k];
    state.lookAtOther = saved.lookAtOther === true;
    state.matchCamera = saved.matchCamera === true;
    for (const id of SLOTS) restoreSlot(id, saved.slots?.[id]);
  } catch { /* corrupt save, fall back to defaults */ }
}

let gui = null;
const activeSlot = () => state.slots[state.active];
const refreshGui = () => gui?.controllersRecursive().forEach((c) => c.updateDisplay());

const editedIds = () => (state.editAll ? SLOTS : [state.active]);

function rebuildEdited() {
  editedIds().forEach(buildSlot);
  updatePlates();
  save();
}

/** A trait row changed on the active slot; with edit all, every slot whose species has that trait follows. */
function traitChanged(key) {
  const value = activeSlot().params[key];
  for (const id of editedIds()) if (key in state.slots[id].params) state.slots[id].params[key] = value;
  rebuildEdited();
}

// the game's riot fur (spinoff/fighter.js), not the store's muted one, so the checker shows what a match shows
function randomise(slot) {
  getSpecies(slot.speciesId).randomise(slot.params);
  setFur({ species: slot.speciesId, params: slot.params }, FUR[Math.floor(Math.random() * FUR.length)].hex);
  slot.opts = null;
}

function randomiseSlot(id) {
  randomise(state.slots[id]);
  buildSlot(id);
  updatePlates();
  refreshGui();
  save();
}

function randomiseAll() {
  const [first, ...rest] = SLOTS.map((id) => state.slots[id]);
  SLOTS.forEach((id) => randomise(state.slots[id]));
  if (state.linkShared) {
    for (const s of rest) shareRandomParams(first.params, s.params, getSpecies(first.speciesId), getSpecies(s.speciesId));
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
  if (!on && state.dance !== 'none') setDance('none');
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

// side on, a pass that travels starts half its length back, so it ends as far past the slot
const passOf = (perf) => (state.side && DANCES[perf?.name]?.extras.at(-1).travel) || 0;

const page = { state, ended: () => buildGui() };

function lookTargetFor(id, slot) {
  const other = built[partnerOf(id)];
  if (!state.lookAtOther || !other) return camera.position;
  return other.joints.head.getWorldPosition(slot.lookAt ??= new THREE.Vector3());
}

function stepAll(dt) {
  for (const id of SLOTS) {
    const character = built[id];
    if (!character) continue;
    const slot = state.slots[id];
    stepSlot(character, slot, dt, page, { x: slotX(id) - passOf(slot.perf) / 2, yaw: state.side ? Math.PI / 2 : slotYaw(id) });
    character.lookTarget = lookTargetFor(id, slot);
  }
}

function setDance(name) {
  state.dance = name;
  if (name !== 'none' && !state.play) setPlay(true);
  danceSlots(SLOTS.map((id) => state.slots[id]), name);
  if (name === 'none') SLOTS.forEach((id) => built[id] && resetPlacement(id));
  buildGui();
  save();
}

function resetPlacement(id) {
  const { root } = built[id];
  root.position.x = slotX(id);
  root.position.z = 0;
  root.rotation.set(0, slotYaw(id), 0);
}

/** A picker on a colour that is derived (by `derive`) until picked. */
const derivedColor = (params, key, derive) => ({
  get v() { return derive(params); },
  set v(c) { params[key] = c; },
});

function addControl(folder, params, entry, onChange) {
  const [key, a, b, step] = entry;
  if (!(key in params)) return;
  if (a === 'color' && b) folder.addColor(derivedColor(params, key, b), 'v').name(key).onChange(onChange);
  else if (a === 'color') folder.addColor(params, key).onChange(onChange);
  else if (a === 'bool' || a === 'text') folder.add(params, key).onChange(onChange);
  else if (Array.isArray(a)) folder.add(params, key, a).onChange(onChange);
  else folder.add(params, key, a, b, step ?? 0.001).onChange(onChange);
}

function presetHandler(species, params) {
  return () => {
    for (const id of editedIds()) {
      const slot = state.slots[id], kit = getSpecies(slot.speciesId);
      if (kit.presets && kit.presetKey === species.presetKey) applyPreset(slot.params, kit, params[species.presetKey]);
    }
    rebuildEdited();
    refreshGui();
  };
}

/** ADDING-A-SPECIES.md §Menus: BASE_GUI's rows for `title`, then the kit's, in a closed folder; null when there are none. */
function addRows(parent, title, species, params) {
  const rows = [...(BASE_GUI[title] ?? []), ...(species.gui?.[title] ?? [])];
  if (!rows.length) return null;
  const folder = parent.addFolder(title);
  const isPreset = (key) => key === species.presetKey && species.presets;
  rows.forEach((row) => addControl(folder, params, row,
    isPreset(row[0]) ? presetHandler(species, params) : () => traitChanged(row[0])));
  folder.close();
  return folder;
}

function addCharacterFolder(species) {
  const folder = gui.addFolder('character');
  folder.add(state, 'active', SLOTS).name('editing slot  (Tab)').onChange(() => { buildGui(); updatePlates(); });
  folder.add({ id: species.id }, 'id', speciesList().map((s) => s.id))
    .name('species').onChange((v) => setSpecies(state.active, v));
  folder.add(activeSlot().params, 'name').onChange(() => { updatePlates(); save(); });
  folder.add({ f: () => randomiseSlot(state.active) }, 'f').name('randomise slot  (R)');
  folder.add({ f: randomiseAll }, 'f').name('randomise all  (Shift R)');
  folder.add(state, 'linkShared').name('link shared params').onChange(save);
  folder.add(state, 'editAll').name('edit all slots at once').onChange(save);
  folder.add({ f: () => setSpecies(state.active, activeSlot().speciesId) }, 'f').name('reset slot');
  folder.add({ f: exportActive }, 'f').name('export slot  (E)');
}

function addAnimationFolder(species, params) {
  const folder = gui.addFolder('animation');
  folder.add(state, 'play').name('animate  (M)').onChange(setPlay);
  folder.add(state, 'idle').name('+ idle layer  (I)').onChange(save);
  folder.add(state, 'walk').name('+ walk layer  (W)').onChange(save);
  folder.add(state, 'speed', 0, 1.5, 0.01).name('walk speed').onChange(save);
  const poseRow = folder.add(state, 'pose', POSE_NAMES).onChange(setPose);
  if (state.dance !== 'none') poseRow.disable();
  addDances(folder.addFolder('victory dances'));
  const raw = addRows(folder, 'debug pose', species, params);
  if (state.play) raw?.controllers.forEach((c) => c.disable());
}

function addDances(dances) {
  dances.add(state, 'dance', ['none', ...DANCE_NAMES]).name('dance').onChange(setDance);
  dances.add(state, 'repeat').name('repeat one-shots').onChange(save);
  // a flip seen from the front is a nod (DANCES.md §Gymnastics, Reading them)
  dances.add(state, 'side').name('side view (flips)').onChange(save);
  dances.add(state, 'slow', 1, 10, 0.5).name('slow motion (× slower)').onChange(save);
  for (const name of DANCE_NAMES) {
    dances.add({ f: () => { setDance('none'); setDance(name); } }, 'f').name(`▶ ${name}`);
  }
}

function addViewFolder() {
  const folder = gui.addFolder('view');
  folder.add(state, 'view', ['felted', 'grey', 'silhouette']).onChange(setView);
  folder.add(state, 'matchCamera').name('match camera').onChange(setMatchCamera);
  folder.add(state, 'lookAtOther').name('look at partner (A↔B, C↔D, E→D)').onChange(save);
  folder.add(state, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail')
    .onChange((v) => { setGeometryDetail(v); buildAll(); save(); });
  folder.add(state, 'spacing', 0.2, 1.6, 0.01).onChange(() => { buildAll(); save(); });
  folder.add({ f: () => frameAll() }, 'f').name('frame all  (F)');
  folder.add({ f: () => frameAll(150) }, 'f').name('150px test  (D)');
  folder.add({ f: () => renderer.domElement.classList.toggle('squint') }, 'f').name('squint  (B)');
  folder.add(state, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  folder.add(state, 'toneMapping', Object.keys(TONE_MAPPING))
    .onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));
}

// BODIES.md §Painterly: the knobs are shared uniforms, live; named by the paint style they touch
function addPaintKnobs(folder) {
  folder.add(PAINT.bands, 'value', 2, 6, 1).name('paint bands');
  folder.add(PAINT.brush, 'value', 0, 1, 0.01).name('brush strength');
  folder.add(PAINT.light, 'value', 0.3, 1.6, 0.01).name('paint band spacing');
  folder.add(PAINT.size, 'value', 0.3, 6, 0.01).name('fur stroke size');
  folder.add(PAINT.accentSize, 'value', 0.1, 3, 0.01).name('fur accent stroke size (mane, wool)');
  folder.add(PAINT.soft, 'value', 0, 0.5, 0.01).name('fur band edge');
  folder.add(PAINT.fray, 'value', 0, 0.8, 0.01).name('ink fray (outline)');
  folder.add(PAINT.feather, 'value', 0, 1, 0.01).name('ink feather rows');
  folder.add(PAINT.pool, 'value', 0, 1, 0.01).name('ink pool (owl, dark at the edge)');
  folder.add(PAINT.edgePool, 'value', 0, 1, 0.01).name('fur pool (the rest, checker only)');
  folder.add(PAINT.ink, 'value', 0, 0.02, 0.0005).name('ink outline (checker only)').onChange((v) => { inkMaterial().visible = v > 0; }).onFinishChange(buildAll);
  folder.add(PAINT.scales, 'value', 0, 1, 0.01).name('scales (dragon)');
  folder.add(PAINT.scaleSize, 'value', 0.3, 3, 0.01).name('scale size');
  folder.close();
}

/** @param {{ key: string, live?: boolean }} row */
function setStyle({ key, live }) {
  for (const id of SLOTS) state.slots[id].params[key] = state.style[key];
  if (!live) buildAll();
  save();
}

const MATCH_AIM = new THREE.Vector3(0, 0.8, -0.1);

/** Frames every slot as spinoff/stage.js aimGameCamera frames a match, its 30° lens and all. */
function setMatchCamera(on) {
  state.matchCamera = on;
  SLOTS.forEach((id) => built[id] && resetPlacement(id));
  camera.fov = on ? 30 : 35;
  camera.filmOffset = 0;
  camera.updateProjectionMatrix();
  if (on) {
    aimGameCamera(camera, MATCH_AIM);
    controls.target.copy(MATCH_AIM);
    controls.update();
  } else frameAll();
  save();
}

function addLookFolder() {
  const folder = gui.addFolder('look');
  for (const row of STYLE_SWITCHES) folder.add(state.style, row.key).name(row.name).onChange(() => setStyle(row));
  addPaintKnobs(folder.addFolder('paint'));
}

// ADDING-A-SPECIES.md §Menus: top to bottom; a kit's rows land in the GUI_SECTIONS folder of the same name
function buildGui() {
  gui?.destroy();
  gui = new GUI({ title: 'species checker' });
  const slot = activeSlot();
  const species = getSpecies(slot.speciesId);
  addCharacterFolder(species);
  addLookFolder();
  for (const title of GUI_SECTIONS.filter((t) => t !== 'debug pose')) addRows(gui, title, species, slot.params);
  addAnimationFolder(species, slot.params);
  addViewFolder();
  gui.onFinishChange(save);
}

onKeys({
  tab: () => { state.active = SLOTS[(slotIndex(state.active) + 1) % SLOTS.length]; buildGui(); updatePlates(); },
  r: (e) => (e.shiftKey ? randomiseAll() : randomiseSlot(state.active)),
  ...cameraKeys(viewer, frameAll),
  e: () => exportActive(),
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  p: () => nextPose(),
  m: () => setPlay(!state.play),
  i: () => { state.idle = !state.idle; refreshGui(); save(); },
  w: () => { state.walk = !state.walk; refreshGui(); save(); },
  x: () => setDance(nextDance(state.dance)),
  c: () => { if (state.dance !== 'none') { const d = state.dance; setDance('none'); setDance(d); } },
});

load();
setGeometryDetail(state.detail);
renderer.toneMapping = TONE_MAPPING[state.toneMapping];
renderer.toneMappingExposure = state.exposure;
buildAll();
setView(state.view);
buildGui();
if (state.matchCamera) setMatchCamera(true);
else frameAll();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.update().getDelta(), 0.1);
  if (state.play) stepAll(dt / state.slow);
  controls.update();
  renderer.render(scene, camera);
  SLOTS.forEach(positionPlate);
});
