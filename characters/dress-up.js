// A HARNESS, not game code: everything a garment is lives in garments.js, everything a character is
// lives in npc.js and the species kits. This page only holds three characters, one outfit and the
// controls to change them, so that one silhouette at one fit can be judged on every species at once.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  TONE_MAPPING, POSES, GEO_DETAIL, BUILD, MOTION_DEFAULTS,
  createCharacter, setViewMode, disposeCharacter, setGeometryDetail, getSpecies,
  stepMotion, resetMotion, motionOf, walkPhase, walkLayer, walkGain, phaseStep,
  DANCES, DANCE_NAMES, makeDance, stepDance,
} from './npc.js';
import { randomTraits } from './visit.js';
import {
  GARMENTS, STITCHES_BY_CRAFT, COLOURWORKS, EDGES, formsOf, accessoriesOf, CRAFTS, SLEEVES, WEIGHTS, FIBRES, craftStitch,
  FIT_RANGE, TOOL_RANGE, LOOK, MAX_COLOURS, defaultItem, dress, undress, garmentMaterial, resolveColourwork, hasForm, randomItem,
  madeItem, usualTool,
} from './garments.js';
import './owl.js';
import './llama.js';
import './lion.js';

console.info('LYS build', BUILD);

// Fixed: the point of the page is the same item on all three at once.
const SLOTS = ['owl', 'llama', 'lion'];
const STORE_KEY = 'lys.dressUp.v1';

// A pattern names its tool; the page keeps it a number so a slider can hold it.
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
    colourwork: AS, stitch: AS, edge: AS, accessory: AS, forceFit: false, fit: 1,
  };
}
function freshUsed() { return Object.fromEntries(Object.keys(GARMENTS).map((t) => [t, freshUse()])); }

const state = {
  detail: 'high', view: 'felted', pose: 'rest', exposure: 0.40, toneMapping: 'ACES', spacing: 0.62,
  play: false, idle: true, walk: false, speed: 0.5, dance: 'none', repeat: true,
  // Close-ups by default: the page is where the look is judged. LOOK's own default is the game's.
  look: { ...LOOK, viewPx: 0 },
  // Per wearable: the PATTERN (the item as designed, made to pattern it is fit 1), and what the NPC
  // USED instead -- each override off, or 'as pattern', until set. garments.js's madeItem joins them.
  patterns: freshPatterns(),
  used: freshUsed(),
  params: { owl: null, llama: null, lion: null },
};

/** The overrides that are on, as madeItem takes them: only what differs from the pattern. */
function usedOf(type) {
  const u = state.used[type], out = {};
  if (u.ownTool) out.tool = u.tool;
  for (const k of ['weight', 'fibre', 'colourwork', 'stitch', 'edge', 'accessory']) if (u[k] !== AS) out[k] = u[k];
  if (u.ownColours) {
    out.colorCount = u.colorCount;
    for (let i = 1; i <= MAX_COLOURS; i++) out[`color${i}`] = u[`color${i}`];
  }
  if (u.forceFit) out.fit = u.fit;
  return out;
}
const madeOf = (type) => madeItem(state.patterns[type], usedOf(type));
const madeOutfit = () => Object.fromEntries(Object.keys(GARMENTS).map((t) => [t, madeOf(t)]));

// Un-merged, because garments.js dresses an un-merged rig -- see the ponytail note at the top of
// garments.js.
const freshParams = (id) => Object.assign(structuredClone(getSpecies(id).defaults), { mergeMeshes: false });


// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

function addLights() {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
  key.position.set(2.2, 3.4, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { near: 0.5, far: 14, left: -2.4, right: 2.4, top: 2, bottom: -2 });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight('#bcd4ff', 1.1);
  rim.position.set(-2.4, 1.6, -2.4);
  scene.add(key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55));
}
addLights();

const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- characters
const built = { owl: null, llama: null, lion: null };
const slotState = { owl: {}, llama: {}, lion: {} };
const slotX = (id) => (SLOTS.indexOf(id) - 1) * state.spacing;

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
  slot.opts ??= { ...MOTION_DEFAULTS, ...motionOf(randomTraits(), getSpecies(id).motionRanges) };
  slot.base ??= { stiff: slot.opts.stiff, zeta: slot.opts.zeta };
  slot.phase ??= Math.random();
  if (state.play) resetMotion(character.motion, POSES[state.pose]);
  dressSlot(id);
}

/** Put the one outfit on one character. Garments ride the rig's joints, so motion needs nothing. */
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

// ---------------------------------------------------------------- framing
const VIEW_DIR = new THREE.Vector3(0.32, 0.20, 1).normalize();

function frameAll(targetPx = 0) {
  const box = new THREE.Box3();
  SLOTS.forEach((id) => built[id] && box.expandByObject(built[id].root));
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const depth = Math.max(size.z, 0.01) * 0.5;
  const dist = targetPx
    ? (Math.max(size.y, 0.01) * innerHeight / targetPx) / (2 * Math.tan(vFov / 2)) + depth
    : 1.15 * Math.max(size.y / (2 * Math.tan(vFov / 2)), size.x / (2 * Math.tan(hFov / 2))) + depth;
  if (!Number.isFinite(dist) || !Number.isFinite(center.y)) return;
  // The GUI covers the right third: shift the film, not the target, so the orbit pivot stays on them.
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

// ---------------------------------------------------------------- nameplates
const plates = {
  owl: document.getElementById('plateOwl'),
  llama: document.getElementById('plateLlama'),
  lion: document.getElementById('plateLion'),
};
const projected = new THREE.Vector3();

function updatePlates() {
  for (const id of SLOTS) {
    plates[id].innerHTML = `${state.params[id]?.name ?? ''}<small>${id} · height ${slotState[id].height?.toFixed(3) ?? '?'}</small>`;
  }
}

function positionPlates() {
  const gap = Math.abs(projected.set(slotX('owl'), 0, 0).project(camera).x
    - projected.set(slotX('llama'), 0, 0).project(camera).x) * 0.5 * innerWidth;
  for (const id of SLOTS) {
    projected.set(slotX(id), 0, 0).project(camera);
    plates[id].classList.toggle('compact', gap < 170);
    plates[id].style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
    plates[id].style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight + 8}px`;
  }
}

// ---------------------------------------------------------------- persistence
function save() {
  const { play, dance: _dance, ...rest } = state;
  // `dance` is not saved: reloading mid-pirouette reads as broken, not restored.
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...rest, play })); } catch { /* quota */ }
}

// Merged OVER defaults, never used wholesale: a save from before a key existed would leave it
// undefined, and one undefined number is a NaN mesh scale and a culled character.
/**
 * A saved pattern made good against today's vocabulary: a form or accessory its type no longer
 * offers (a shawl wrapped twice) becomes the first it does, or none; a stitch off its craft, a
 * missing tool and a fit (patterns no longer keep one) as they always were.
 */
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
    const { spread: _spread, ...look } = saved.look ?? {};   // `spread` was removed from LOOK (tuned to 1)
    Object.assign(state, saved, { dance: 'none', look: { ...LOOK, viewPx: 0, ...look } });
    // A save from before patterns kept one `outfit`: its items become the patterns, fit dropped.
    const pats = saved.patterns ?? saved.outfit;
    state.patterns = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...freshPattern(type), ...pats?.[type] }]));
    for (const [type, p] of Object.entries(state.patterns)) mendPattern(type, p);
    state.used = Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...freshUse(), ...saved.used?.[type] }]));
    delete state.outfit;
    state.params = /** @type {typeof state.params} */ (Object.fromEntries(SLOTS.map((id) => [id, saved.params?.[id] ? { ...freshParams(id), ...saved.params[id] } : null])));
    if (!(state.pose in POSES)) state.pose = 'rest';
  } catch { /* corrupt save, defaults */ }
}

// ---------------------------------------------------------------- actions
let gui = null;   // built by buildGui, rebuilt when a menu's choices change
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

/** A random PATTERN for one item, made to pattern: the fastest way to find a pairing that breaks. */
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

// ---------------------------------------------------------------- motion (as species-checker)
const clock = new THREE.Clock();

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
  const slot = slotState[id];
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

function restoreSpring(slot) {
  if (!slot.base) return;
  slot.opts.stiff = slot.base.stiff;
  slot.opts.zeta = slot.base.zeta;
}

function setDance(name) {
  state.dance = name;
  if (name !== 'none' && !state.play) setPlay(true);
  for (const id of SLOTS) {
    const slot = slotState[id];
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
  const root = built[id]?.root;
  if (!root) return;
  root.position.set(slotX(id), root.position.y, 0);
  root.rotation.y = 0;
}

// ---------------------------------------------------------------- gui
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

/** The look knobs garments.js exposes: stylisation scale, relief depth, rim strength. */
function addLookFolder() {
  const folder = gui.addFolder('knit look (all items)');
  const apply = () => { Object.assign(LOOK, state.look); dressAll(); };
  folder.add(state.look, 'stitchScale', 1, 6, 0.1).name('stitch size ×').onFinishChange(apply);
  // What the game builds for its crowd (LOOK's default): relief too small to see there is skipped.
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

/**
 * One folder per wearable (spec §1), in two tabs: the PATTERN -- the item as designed, which made to
 * pattern is fit 1 -- and what the NPC MADE IT WITH instead. Changes redress all three characters on
 * RELEASE (onFinishChange): a sweater with cables is tens of thousands of triangles, and regenerating
 * three of them per slider tick makes the drag stutter.
 */
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
  // The item last touched is the one O randomises. A DOM listener, not lil-gui's onOpenClose: three
  // 0.160 bundles lil-gui 0.17.0, which does not have it -- calling it threw inside buildGui, before
  // the render loop started, and the page drew nothing at all.
  folder.domElement.addEventListener('pointerdown', () => { openItem = type; });
  if (type !== openItem) folder.close();
}

/** The item's shape: silhouette, and form and sleeves where the item has them. */
function addShapeControls(folder, type, redress) {
  const g = GARMENTS[type], p = state.patterns[type];
  // Form only where it changes the item: an infinity scarf or a cowl has no ends to tie.
  let form = null;
  folder.add(p, 'silhouette', g.silhouettes).onChange(() => { form?.show(hasForm(type, p.silhouette)); redress(); });
  if (formsOf(type).length) form = folder.add(p, 'form', formsOf(type)).onChange(redress).show(hasForm(type, p.silhouette));
  if (g.sleeves) folder.add(p, 'sleeves', SLEEVES).onChange(redress);
}

/** The yarn: weight, tool, fibre and colours, plus the pattern's randomise and reset. */
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
  // Changing the craft or the yarn resets the pattern's tool to the usual one for them.
  const retool = () => { p.tool = usualTool(p.craft, p.weight); };
  folder.add(p, 'craft', CRAFTS).onChange(() => {
    p.stitch = craftStitch(p.craft, p.stitch);
    retool();
    redress();
    queueMicrotask(buildGui);   // the stitch menus are the craft's; rebuilt after lil-gui's own handler returns
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

// ---------------------------------------------------------------- keys
const KEY_ACTIONS = {
  r: () => randomiseAll(),
  o: () => randomiseItem(openItem),
  f: () => { snapIndex = 0; frameAll(); },
  d: () => frameAll(150),
  arrowleft: () => orbitBy(-ORBIT_STEP, 0),
  arrowright: () => orbitBy(ORBIT_STEP, 0),
  arrowup: () => orbitBy(0, -ORBIT_STEP),
  arrowdown: () => orbitBy(0, ORBIT_STEP),
  v: () => { snapIndex = (snapIndex + 1) % SNAP_VIEWS.length; setOrbit(SNAP_VIEWS[snapIndex]); },
  t: () => { controls.autoRotate = !controls.autoRotate; },
  b: () => renderer.domElement.classList.toggle('squint'),
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  p: () => nextPose(),
  m: () => setPlay(!state.play),
  w: () => { state.walk = !state.walk; refreshGui(); save(); },
  x: () => {
    const all = ['none', ...DANCE_NAMES];
    setDance(all[(all.indexOf(state.dance) + 1) % all.length]);
  },
};

const isFormField = (el) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

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

// ---------------------------------------------------------------- go
load();
Object.assign(LOOK, state.look);
setGeometryDetail(state.detail);
renderer.toneMapping = TONE_MAPPING[state.toneMapping];
renderer.toneMappingExposure = state.exposure;
buildAll();
setView(state.view);
buildGui();
frameAll();

// Draw calls and triangles for the whole frame, for WEARABLE-LOOK-VS-PERFORMANCE.md. Unthrottled
// desktop numbers: a count, not a frame budget -- measure frame time under the 20x throttle.
const stats = document.getElementById('stats');
let statsAt = 0;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.play) SLOTS.forEach((id) => stepSlot(id, dt));
  controls.update();
  renderer.render(scene, camera);
  positionPlates();
  if (now - statsAt > 500) {
    statsAt = now;
    const { calls, triangles } = renderer.info.render;
    stats.textContent = `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris (3 characters, shadow pass included)`;
  }
});
