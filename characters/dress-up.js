import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  TONE_MAPPING, POSES, GEO_DETAIL, BUILD,
  createCharacter, setViewMode, disposeCharacter, setGeometryDetail, getSpecies, stepMotion, resetMotion, DANCE_NAMES,
} from './npc.js';
import { addGround, addLights, cameraKeys, frameObjects, makeViewer, onKeys } from './viewer.js';
import { danceSlots, freshParams, nextDance, randomOpts, stepSlot } from './slot-motion.js';
import {
  GARMENTS, STITCHES_BY_CRAFT, COLOURWORKS, EDGES, formsOf, accessoriesOf, CRAFTS, SLEEVES, WEIGHTS, FIBRES, craftStitch,
  FIT_RANGE, TOOL_RANGE, LOOK, MAX_COLOURS, defaultItem, dress, undress, garmentMaterial, resolveColourwork, hasForm, randomItem,
  madeItem, usualTool,
} from './garments.js';
import { SPECIES_IDS } from './species.js';

console.info('LYS build', BUILD);

const SLOTS = SPECIES_IDS;
const perSlot = (make) => Object.fromEntries(SLOTS.map((id) => [id, make()]));
const STORE_KEY = 'lys.dressUp.v1';

function freshPattern(type) {
  const p = defaultItem(type);
  return { ...p, tool: usualTool(p.craft, p.weight) };
}
function freshPatterns() { return Object.fromEntries(Object.keys(GARMENTS).map((t) => [t, freshPattern(t)])); }

const AS = 'as pattern';
function freshUse() {
  return {
    ownTool: false, tool: 5, weight: AS, fibre: AS,
    ownColours: false, colorCount: 2, ...Object.fromEntries(Array.from({ length: MAX_COLOURS }, (_, i) => [`color${i + 1}`, defaultItem('hat')[`color${i + 1}`]])),
    colourwork: AS, stitch: AS, edge: AS, accessory: AS, forceFit: false, fit: 1, cover: 0,
  };
}
function freshUsed() { return Object.fromEntries(Object.keys(GARMENTS).map((t) => [t, freshUse()])); }

const state = {
  detail: 'high', view: 'felted', pose: 'rest', exposure: 0.40, toneMapping: 'ACES', spacing: 0.62,
  play: false, idle: true, walk: false, speed: 0.5, dance: 'none', repeat: true,
  look: { ...LOOK, viewPx: 0 },
  patterns: freshPatterns(),
  used: freshUsed(),
  params: perSlot(() => null),
};

function usedOf(type) {
  const u = state.used[type], out = {};
  if (u.ownTool) out.tool = u.tool;
  for (const k of ['weight', 'fibre', 'colourwork', 'stitch', 'edge', 'accessory']) if (u[k] !== AS) out[k] = u[k];
  if (u.ownColours) {
    out.colorCount = u.colorCount;
    for (let i = 1; i <= MAX_COLOURS; i++) out[`color${i}`] = u[`color${i}`];
  }
  if (u.forceFit) out.fit = u.fit;
  if (u.cover) out.cover = u.cover;
  return out;
}
const madeOf = (type) => madeItem(state.patterns[type], usedOf(type));
const madeOutfit = () => Object.fromEntries(Object.keys(GARMENTS).map((t) => [t, madeOf(t)]));

const viewer = makeViewer();
const { renderer, scene, camera, controls } = viewer;
addLights(scene, { near: 0.5, far: 14, left: -2.4, right: 2.4, top: 2, bottom: -2 });
const ground = addGround(scene, 3.2);

const built = perSlot(() => null);
const slotState = perSlot(() => ({}));
const slotX = (id) => (SLOTS.indexOf(id) - (SLOTS.length - 1) / 2) * state.spacing;

function buildSlot(id) {
  if (built[id]) {
    undress(built[id]);
    scene.remove(built[id].root);
    disposeCharacter(built[id]);
  }
  state.params[id] ??= freshParams(id);
  const character = createCharacter(state.params[id], id);
  character.root.position.x = slotX(id);
  scene.add(character.root);
  built[id] = character;
  const slot = slotState[id];
  slot.opts ??= randomOpts(getSpecies(id));
  slot.base ??= { stiff: slot.opts.stiff, zeta: slot.opts.zeta };
  slot.phase ??= Math.random();
  if (state.play) resetMotion(character.motion, POSES[state.pose]);
  dressSlot(id);
}

function dressSlot(id) {
  if (!built[id]) return;
  dress(built[id], madeOutfit());
  setViewMode(built[id].root, state.view);
  slotState[id].height = new THREE.Box3().setFromObject(built[id].root).getSize(new THREE.Vector3()).y;
}

function dressAll() {
  SLOTS.forEach(dressSlot);
  updatePlates();
  save();
}

function buildAll() {
  SLOTS.forEach(buildSlot);
  updatePlates();
}

const frameAll = (targetPx = 0) => frameObjects(viewer, Object.values(built).filter(Boolean).map((c) => c.root), targetPx);

const plates = perSlot(() => {
  const plate = Object.assign(document.createElement('div'), { className: 'plate' });
  document.getElementById('hud').before(plate);
  return plate;
});
const projected = new THREE.Vector3();

function updatePlates() {
  for (const id of SLOTS) {
    plates[id].innerHTML = `${state.params[id]?.name ?? ''}<small>${id} · height ${slotState[id].height?.toFixed(3) ?? '?'}</small>`;
  }
}

function positionPlates() {
  const gap = Math.abs(projected.set(slotX(SLOTS[0]), 0, 0).project(camera).x
    - projected.set(slotX(SLOTS[1]), 0, 0).project(camera).x) * 0.5 * innerWidth;
  for (const id of SLOTS) {
    projected.set(slotX(id), 0, 0).project(camera);
    plates[id].classList.toggle('compact', gap < 170);
    plates[id].style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
    plates[id].style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight + 8}px`;
  }
}

function save() {
  const { play, dance: _dance, ...rest } = state;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...rest, play })); } catch {}
}

function mendPattern(type, p) {
  if (!GARMENTS[type].silhouettes.includes(p.silhouette)) p.silhouette = GARMENTS[type].silhouettes[0];
  if (formsOf(type).length && !formsOf(type).includes(p.form)) p.form = formsOf(type)[0];
  if (!accessoriesOf(type).includes(p.accessory)) p.accessory = 'none';
  p.stitch = craftStitch(p.craft, p.stitch);
  p.tool ??= usualTool(p.craft, p.weight);
  delete p.fit;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!saved) return;
    const { spread: _spread, ...look } = saved.look ?? {};
    Object.assign(state, saved, { dance: 'none', look: { ...LOOK, viewPx: 0, ...look } });
    const pats = saved.patterns ?? saved.outfit;
    state.patterns = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...freshPattern(type), ...pats?.[type] }]));
    for (const [type, p] of Object.entries(state.patterns)) mendPattern(type, p);
    state.used = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...freshUse(), ...saved.used?.[type] }]));
    delete state.outfit;
    state.params = /** @type {typeof state.params} */ (Object.fromEntries(SLOTS.map((id) => [id, saved.params?.[id] ? { ...freshParams(id), ...saved.params[id] } : null])));
    if (!(state.pose in POSES)) state.pose = 'rest';
  } catch {}
}

let gui = null;
const refreshGui = () => gui?.controllersRecursive().forEach((c) => c.updateDisplay());

function randomiseSlot(id) {
  getSpecies(id).randomise(state.params[id]);
  slotState[id].opts = null;
  slotState[id].base = null;
  buildSlot(id);
  updatePlates();
  save();
}

const randomiseAll = () => SLOTS.forEach(randomiseSlot);

function randomiseItem(type) {
  Object.assign(state.patterns[type], randomItem(type));
  refreshGui();
  dressAll();
}

function resetItem(type) {
  Object.assign(state.patterns[type], freshPattern(type), { on: true });
  refreshGui();
  dressAll();
}

function clearUsed(type) {
  Object.assign(state.used[type], freshUse());
  refreshGui();
  dressAll();
}

function setPose(name) {
  state.pose = name;
  if (!state.play) SLOTS.forEach((id) => built[id] && resetMotion(built[id].motion, POSES[name]));
  if (!state.play) SLOTS.forEach((id) => built[id] && stepMotion(built[id], POSES[name], 0, { ...slotState[id].opts, idleAmount: 0 }));
  refreshGui();
  save();
}

const POSE_NAMES = Object.keys(POSES);
const nextPose = () => setPose(POSE_NAMES[(POSE_NAMES.indexOf(state.pose) + 1) % POSE_NAMES.length]);

function setPlay(on) {
  state.play = on;
  if (!on && state.dance !== 'none') setDance('none');
  SLOTS.forEach((id) => built[id] && resetMotion(built[id].motion, POSES[state.pose]));
  if (!on) SLOTS.forEach(resetPlacement);
  buildGui();
  save();
}

function setView(mode) {
  state.view = mode;
  scene.background = new THREE.Color(mode === 'silhouette' ? '#ffffff' : '#e8e2d9');
  ground.visible = mode !== 'silhouette';
  SLOTS.forEach((id) => built[id] && setViewMode(built[id].root, mode));
}

const clock = new THREE.Timer();

const page = { state, ended: () => buildGui() };

function setDance(name) {
  state.dance = name;
  if (name !== 'none' && !state.play) setPlay(true);
  danceSlots(Object.values(slotState), name);
  if (name === 'none') SLOTS.forEach(resetPlacement);
  buildGui();
  save();
}

function resetPlacement(id) {
  const root = built[id]?.root;
  if (!root) return;
  root.position.set(slotX(id), root.position.y, 0);
  root.rotation.set(0, 0, 0);
}

let openItem = 'scarf';

function addTopControls() {
  gui.add({ f: randomiseAll }, 'f').name('new individuals, all three  (R)');
  for (const id of SLOTS) gui.add({ f: () => randomiseSlot(id) }, 'f').name(`new ${id}`);
}

function addMotionFolder() {
  const folder = gui.addFolder('motion');
  folder.add(state, 'play').name('animate  (M)').onChange(setPlay);
  folder.add(state, 'idle').name('+ idle layer').onChange(save);
  folder.add(state, 'walk').name('+ walk layer  (W)').onChange(save);
  folder.add(state, 'speed', 0, 1.5, 0.01).name('walk speed').onChange(save);
  folder.add(state, 'dance', ['none', ...DANCE_NAMES]).name('dance  (X)').onChange(setDance);
  folder.add(state, 'repeat').name('repeat one-shots').onChange(save);
  folder.close();
}

function addSceneFolder() {
  const folder = gui.addFolder('scene');
  const poseRow = folder.add(state, 'pose', POSE_NAMES).name('pose  (P)').onChange(setPose);
  if (state.dance !== 'none') poseRow.disable();
  folder.add(state, 'view', ['felted', 'grey', 'silhouette']).onChange(setView);
  folder.add(state, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail')
    .onChange((v) => { setGeometryDetail(v); buildAll(); save(); });
  folder.add(state, 'spacing', 0.3, 1.4, 0.01).onChange(() => { SLOTS.forEach(resetPlacement); save(); });
  folder.add({ f: () => frameAll() }, 'f').name('frame all  (F)');
  folder.add({ f: () => frameAll(150) }, 'f').name('150px test  (D)');
  folder.add({ f: () => renderer.domElement.classList.toggle('squint') }, 'f').name('squint  (B)');
  folder.add(state, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  folder.add(state, 'toneMapping', Object.keys(TONE_MAPPING)).onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));
  folder.close();
}

function addLookFolder() {
  const folder = gui.addFolder('knit look (all items)');
  const apply = () => { Object.assign(LOOK, state.look); dressAll(); };
  folder.add(state.look, 'stitchScale', 1, 6, 0.1).name('stitch size ×').onFinishChange(apply);
  folder.add(state.look, 'viewPx', { 'close-up (no limit)': 0, '300px': 300, '150px (game crowd)': 150 })
    .name('build for').onChange(apply);
  folder.add(state.look, 'relief', 0, 4, 0.05).name('relief depth').onFinishChange(apply);
  folder.add(state.look, 'rim', 0, 1, 0.01).name('rim highlight').onChange((v) => {
    LOOK.rim = v;
    garmentMaterial().userData.rim.value = v;
    save();
  });
  folder.close();
}

function addItemFolder(type) {
  const pattern = state.patterns[type];
  const folder = gui.addFolder(type);
  const redress = () => { dressAll(); refreshGui(); };
  folder.add(pattern, 'on').name(`wear ${type}`).onChange(redress);
  const out = {
    get fit() { return madeOf(type).fit.toFixed(2); },
    get drawn() { const m = madeOf(type); return `${m.stitch}, ${resolveColourwork(m.colourwork, m.colorCount)}`; },
  };
  folder.add(out, 'fit').name(type === 'bag' ? '→ size (1 = pattern)' : '→ fit (1 = fitted)').disable();
  folder.add(out, 'drawn').name('→ drawn as').disable();
  addPatternFolder(folder.addFolder('pattern (as designed)'), type, redress);
  addUsedFolder(folder.addFolder('made with (overrides)'), type, redress);
  folder.domElement.addEventListener('pointerdown', () => { openItem = type; });
  if (type !== openItem) folder.close();
}

function addShapeControls(folder, type, redress) {
  const g = GARMENTS[type], p = state.patterns[type];
  let form = null;
  folder.add(p, 'silhouette', g.silhouettes).onChange(() => { form?.show(hasForm(type, p.silhouette)); redress(); });
  if (formsOf(type).length) form = folder.add(p, 'form', formsOf(type)).onChange(redress).show(hasForm(type, p.silhouette));
  if (g.sleeves) folder.add(p, 'sleeves', SLEEVES).onChange(redress);
}

function addYarnControls(folder, type, redress, retool) {
  const p = state.patterns[type];
  folder.add(p, 'weight', WEIGHTS).name('yarn weight').onChange(() => { retool(); redress(); });
  folder.add(p, 'tool', TOOL_RANGE[0], TOOL_RANGE[1], 0.25).name('hook/needle mm').onFinishChange(redress);
  folder.add(p, 'fibre', FIBRES).name('fibre').onChange(redress);
  folder.add(p, 'colorCount', 1, MAX_COLOURS, 1).name('yarn colours').onFinishChange(redress);
  for (let i = 1; i <= MAX_COLOURS; i++) folder.addColor(p, `color${i}`).name(`colour ${i}`).onFinishChange(redress);
  folder.add({ f: () => randomiseItem(type) }, 'f').name('randomise pattern  (O)');
  folder.add({ f: () => resetItem(type) }, 'f').name('reset pattern');
}

function addPatternFolder(folder, type, redress) {
  const p = state.patterns[type];
  addShapeControls(folder, type, redress);
  const retool = () => { p.tool = usualTool(p.craft, p.weight); };
  folder.add(p, 'craft', CRAFTS).onChange(() => {
    p.stitch = craftStitch(p.craft, p.stitch);
    retool();
    redress();
    queueMicrotask(buildGui);
  });
  folder.add(p, 'stitch', STITCHES_BY_CRAFT[p.craft] ?? STITCHES_BY_CRAFT.knit).onChange(redress);
  folder.add(p, 'colourwork', COLOURWORKS).onChange(redress);
  folder.add(p, 'edge', EDGES).onChange(redress);
  folder.add(p, 'accessory', accessoriesOf(type)).onChange(redress);
  addYarnControls(folder, type, redress, retool);
}

function addUsedFolder(folder, type, redress) {
  const u = state.used[type], { craft } = state.patterns[type];
  folder.add(u, 'ownTool').name('own hook/needle').onChange(redress);
  folder.add(u, 'tool', TOOL_RANGE[0], TOOL_RANGE[1], 0.25).name('  hook/needle mm').onFinishChange(redress);
  folder.add(u, 'weight', [AS, ...WEIGHTS]).name('yarn weight').onChange(redress);
  folder.add(u, 'fibre', [AS, ...FIBRES]).name('fibre').onChange(redress);
  folder.add(u, 'ownColours').name('own colours').onChange(redress);
  folder.add(u, 'colorCount', 1, MAX_COLOURS, 1).name('  yarn colours').onFinishChange(redress);
  for (let i = 1; i <= MAX_COLOURS; i++) folder.addColor(u, `color${i}`).name(`  colour ${i}`).onFinishChange(redress);
  folder.add(u, 'stitch', [AS, ...(STITCHES_BY_CRAFT[craft] ?? STITCHES_BY_CRAFT.knit)]).onChange(redress);
  folder.add(u, 'colourwork', [AS, ...COLOURWORKS]).onChange(redress);
  folder.add(u, 'edge', [AS, ...EDGES]).onChange(redress);
  folder.add(u, 'accessory', [AS, ...accessoriesOf(type)]).onChange(redress);
  folder.add(u, 'forceFit').name('force fit').onChange(redress);
  folder.add(u, 'fit', FIT_RANGE[0], FIT_RANGE[1], 0.01).name('  fit').onFinishChange(redress);
  // tmnt/REUSE-SPEC.md §Bad guys: a wrapped scarf up over the face, to the middle of the eyes at 1
  if (type === 'scarf') folder.add(Object.assign(u, { cover: u.cover ?? 0 }), 'cover', 0, 1, 0.01).name('face cover (wrapped; 0 = off)').onFinishChange(redress);
  folder.add({ f: () => clearUsed(type) }, 'f').name('back to pattern');
  folder.close();
}

function buildGui() {
  gui?.destroy();
  gui = new GUI({ title: 'dress-up' });
  addTopControls();
  addMotionFolder();
  addSceneFolder();
  addLookFolder();
  Object.keys(GARMENTS).forEach(addItemFolder);
  gui.onFinishChange(save);
}

onKeys({
  r: () => randomiseAll(),
  o: () => randomiseItem(openItem),
  ...cameraKeys(viewer, frameAll),
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  p: () => nextPose(),
  m: () => setPlay(!state.play),
  w: () => { state.walk = !state.walk; refreshGui(); save(); },
  x: () => setDance(nextDance(state.dance)),
});

load();
Object.assign(LOOK, state.look);
setGeometryDetail(state.detail);
renderer.toneMapping = TONE_MAPPING[state.toneMapping];
renderer.toneMappingExposure = state.exposure;
buildAll();
setView(state.view);
buildGui();
frameAll();

const stats = document.getElementById('stats');
let statsAt = 0;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(clock.update().getDelta(), 0.1);
  if (state.play) SLOTS.forEach((id) => built[id] && stepSlot(built[id], slotState[id], dt, page, { x: slotX(id) }));
  controls.update();
  renderer.render(scene, camera);
  positionPlates();
  if (now - statsAt > 500) {
    statsAt = now;
    const { calls, triangles } = renderer.info.render;
    stats.textContent = `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris (3 characters, shadow pass included)`;
  }
});
