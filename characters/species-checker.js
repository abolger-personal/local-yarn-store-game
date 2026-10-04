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
// Motion coefficients are derived from personality, and personality lives in the sim. Only the
// trait roll is wanted here -- the same import motion-lab.js makes, for the same reason.
import { randomTraits } from './visit.js';

console.info('LYS build', BUILD);

// importing a species file is all it takes to register it
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
  // MOTION. Off by default, and that default is the point: with `play` off this page is exactly
  // what it was -- the rig sliders ARE the pose, nothing writes a joint behind your back, and the
  // loop has no dt. With it on, the engine owns every joint and the pose folder is disabled for
  // the duration. The two contracts are never live at the same time, which is the only way a
  // slider you are dragging cannot be stomped 60 times a second.
  play: false,
  // THE LAYERS, as switches. The engine is a stack -- commanded pose, then idle summed on top,
  // then the walk summed on that -- and every layer is additive and never written back upstream.
  // So each one has an honest off: `idleAmount: 0` is the engine's own reduce-motion path, and
  // the walk layer contributes exactly 0 when it is not run. Turning one off is subtraction, not
  // a different code path, which is what makes "pose alone" here the same pose the static rig
  // shows. Replaced the auto-cycle: rotating through poses on a timer meant you could never look
  // at ONE thing, and what you were looking at kept changing under you.
  idle: true,
  walk: false,
  speed: 0.5,     // walk IN PLACE: the gait phase advances, the root never moves
  // A DANCE takes over the pose target while it runs -- it IS a sequence of pose targets -- so the
  // pose dropdown is disabled for the duration rather than left lying about what is on screen.
  dance: 'none',
  repeat: true,   // restart a finished dance, so a one-shot can be watched on a loop while tuning
  slots: {
    A: { speciesId: 'owl', params: null },
    B: { speciesId: 'llama', params: null },
  },
};

const freshParams = (speciesId) => Object.assign(
  structuredClone(getSpecies(speciesId).defaults),
  // merging collapses per-character materials into shared ones, which would make the material
  // sliders here edit the whole cast. Two characters cost nothing, so keep them un-merged.
  { mergeMeshes: false },
);

// ---------------------------------------------------------------- renderer
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
controls.autoRotateSpeed = 1.5;   // a slow turntable: one turn in ~40s, slow enough to read

// sheen needs image-based light to read at all
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;

function addLights() {
  const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
  key.position.set(2.2, 3.4, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { near: 0.5, far: 14, left: -2, right: 2, top: 2, bottom: -2 });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 1;   // three 0.160 ignored this under PCFSoft; 1 keeps that edge now PCF is soft
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

// ---------------------------------------------------------------- characters
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
  // Kept ACROSS a rebuild, cleared only by randomise and by a species change: nudging a
  // proportion slider under `play` rebuilds the mesh, and rerolling temperament or restarting
  // the stride on every nudge would make the very thing you are judging jump.
  slot.opts ??= {
    ...MOTION_DEFAULTS,
    ...motionOf(randomTraits(), getSpecies(slot.speciesId).motionRanges),
  };
  // A dance overrides the spring while it runs -- a riverdance step is faster than this character
  // settles -- so their own values are kept to put back afterwards.
  slot.base ??= { stiff: slot.opts.stiff, zeta: slot.opts.zeta };
  // Not zero: two characters starting at phase 0 march in lockstep, which is the chorus line
  // crowd.html already learned to avoid.
  slot.phase ??= Math.random();
  // Start the engine where the static rig already is, so a rebuild mid-play does not re-blend.
  if (state.play) resetMotion(character.motion, POSES[state.pose]);
}

function buildAll() {
  SLOTS.forEach(buildSlot);
  updatePlates();
}

// ---------------------------------------------------------------- framing
function sceneBounds() {
  const box = new THREE.Box3();
  SLOTS.forEach((id) => built[id] && box.expandByObject(built[id].root));
  return box;
}

const VIEW_DIR = new THREE.Vector3(0.32, 0.20, 1).normalize();

/** How far back the camera sits to fit `size`: to a target height in pixels, or to the view. */
function fitDistance(size, targetPx) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const depth = Math.max(size.z, 0.01) * 0.5;
  return targetPx
    ? (Math.max(size.y, 0.01) * innerHeight / targetPx) / (2 * Math.tan(vFov / 2)) + depth
    : 1.15 * Math.max(size.y / (2 * Math.tan(vFov / 2)), size.x / (2 * Math.tan(hFov / 2))) + depth;
}

// Fits BOTH axes. Using vertical extent alone puts a wide pair of characters off the sides,
// and the GUI panel covers the right third, so the target is nudged right to compensate.
function frameAll(targetPx = 0) {
  const box = sceneBounds();
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = fitDistance(size, targetPx);

  // a NaN anywhere in a mesh scale reaches the camera through the bounding box
  if (!Number.isFinite(dist) || !Number.isFinite(center.y)) {
    console.warn('frameAll: non-finite bounds, check for undefined params');
    return;
  }
  // The GUI covers the right third, so the characters are pushed left of screen centre -- by
  // shifting the FILM, not the target. Moving the target used to put the orbit pivot beside the
  // characters instead of on them, so every drag swung them off to one side and a back view
  // left them off-screen entirely.
  // three shifts the frustum by near * filmOffset / filmWidth -- tangent units -- so this is the
  // old world-space nudge (size.x * 0.16 at the target, `dist` away) as an angle
  camera.filmOffset = ((size.x * 0.16) / dist) * camera.getFilmWidth();
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
  controls.update();
}

// Keyboard orbit about the current pivot -- the step-at-a-time half of what dragging does, and
// the only way to land exactly on a side or back view. Stops just short of the poles, where the
// azimuth goes undefined and OrbitControls flips.
const ORBIT_STEP = Math.PI / 12;   // 15 degrees
const SNAP_VIEWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // front, side, back, other side
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

// ---------------------------------------------------------------- nameplates
const plates = { A: document.getElementById('plateA'), B: document.getElementById('plateB') };
const projected = new THREE.Vector3();
/** Each plate's width with its metadata showing. See positionPlate for why it is not read live. */
const fullPlateWidth = { A: 0, B: 0 };

/**
 * How many screen pixels there are between the two characters right now.
 *
 * A plate is a FIXED pixel size while the characters shrink with the zoom, so at the 150px distance
 * test a 220px label lies straight across its neighbour's feet -- measured 219px and 225px wide
 * against a 93px gap, overlapping each other by 104px. That button exists to judge the silhouette,
 * so a label covering it defeats the whole point of pressing it.
 */
function plateRoom() {
  const a = projected.set(slotX('A'), 0, 0).project(camera).x;
  const b = projected.set(slotX('B'), 0, 0).project(camera).x;
  return Math.abs(a - b) * 0.5 * innerWidth;
}

function positionPlate(id) {
  const el = plates[id];
  const character = built[id];
  if (!character) return;
  // Compared against the width measured with the metadata SHOWING (updatePlates), never against
  // the live width: compacting makes the plate narrower, which would make it fit, which would
  // un-compact it -- a flicker every frame at exactly the distance this is meant to fix.
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
    // Measured HERE, with the metadata showing, because this is the only place the content
    // changes -- a rename or a species swap. positionPlate then has a stable number to compare
    // the gap against, which is what keeps compacting from oscillating. See positionPlate.
    plates[id].classList.remove('compact');
    fullPlateWidth[id] = plates[id].offsetWidth;
  }
}

// ---------------------------------------------------------------- persistence
function save() {
  const payload = {
    active: state.active, view: state.view, pose: state.pose, detail: state.detail,
    exposure: state.exposure, toneMapping: state.toneMapping, spacing: state.spacing,
    linkShared: state.linkShared,
    play: state.play, speed: state.speed, idle: state.idle, walk: state.walk,
    // `dance` is deliberately NOT saved: a page that reloads mid-pirouette with a disabled pose
    // dropdown and a character facing backwards reads as a broken page, not a restored one.
    repeat: state.repeat,
    slots: Object.fromEntries(SLOTS.map((id) => [id, {
      speciesId: state.slots[id].speciesId,
      params: state.slots[id].params,
    }])),
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch { /* quota */ }
}

// Saved params are merged OVER the species defaults, never used wholesale. A save written
// before a parameter existed would otherwise leave it undefined, and one undefined number
// turns a mesh scale into NaN, which propagates to the bounding box and the camera.
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
    // A pose name that no longer exists used to cost one wrong-looking frame; under `play` it is
    // handed to the interpolator sixty times a second, where an undefined target is a crash and
    // a blank page. Renaming a pose is exactly the kind of thing this branch has been doing.
    if (!(state.pose in POSES)) state.pose = 'rest';
    for (const id of SLOTS) restoreSlot(id, saved.slots?.[id]);
  } catch { /* corrupt save, fall back to defaults */ }
}

// ---------------------------------------------------------------- actions
let gui = null;   // built by buildGui, rebuilt when a menu's choices change
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
  slot.opts = null;   // temperament is part of "a different individual", so it rerolls too
  buildSlot(id);
  updatePlates();
  refreshGui();
  save();
}

// A is rolled normally, then B keeps its own species-specific roll but adopts everything the
// two species randomise identically. Whatever still differs is the species kit's doing.
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
  frameAll();   // species differ enough in height that the old framing rarely still fits
  save();
}

// A preset writes into each slot's params, so the rig sliders show what is actually applied.
// Re-applying it on every rebuild instead would silently stomp any manual joint edit.
//
// Under `play` it does NOT write params: the engine is the only writer of a joint then, and a
// pose is a TARGET it blends toward rather than a value to assign. Writing both would put two
// authors on every channel, and the sliders would fight the interpolator every frame.
function setPose(name) {
  state.pose = name;
  if (!state.play) {
    for (const id of SLOTS) {
      Object.assign(state.slots[id].params, POSES[name]);
      if (built[id]) applyPose(built[id], POSES[name]);
    }
  }
  // Outside the branch. Under `play` nothing is written to params, but the dropdown still has to
  // show which pose is being targeted -- skipping it left the auto-cycle advancing invisibly:
  // measured, the rig walked through delighted -> walk+carry -> rest -> walk while the readout
  // said `delighted` for the whole run.
  refreshGui();
  save();
}

const POSE_NAMES = Object.keys(POSES);

function nextPose() {
  setPose(POSE_NAMES[(POSE_NAMES.indexOf(state.pose) + 1) % POSE_NAMES.length]);
}

/**
 * Hand the rig over to the motion engine, or take it back.
 *
 * Taking it back re-applies the current pose cleanly, so params and the rig agree again -- left
 * alone the character would keep whatever half-blended joints the last frame happened to leave,
 * and every slider would then be lying about the pose on screen.
 *
 * Handing it over snaps to the pose preset, which discards any manual joint edit. That is the
 * honest reading of "the engine owns the pose now": there is nowhere for a hand-authored joint
 * to live once something is writing all of them every frame.
 */
function setPlay(on) {
  state.play = on;
  // Taking the rig back has to stop the dance too: a performance still holding the pose target
  // while the sliders claim to own it is the exact ambiguity `play` exists to prevent. Not via
  // setDance -- it calls back into here.
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
  buildGui();   // the pose folder is enabled in one state and disabled in the other
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

// ---------------------------------------------------------------- motion
//
// Walk IN PLACE. The store drives the gait phase from ground actually covered; here the ground is
// imaginary, so `speed` is a dial and the distance moved in a frame is speed * dt. Everything
// downstream is the shop's own code, unchanged: the phase still ACCUMULATES rather than being a
// running total divided by a speed-dependent stride, which is the bug that made legs spin on
// deceleration. The root is never moved, so the feet skate by construction -- skate is measured
// in the motion lab; this page is for judging the SHAPE of a stride against another species.
const clock = new THREE.Timer();

/**
 * Advance the dance, if one is running, and report what it wants of this character.
 *
 * The ROOT EXTRAS are applied here rather than inside the engine, because the root belongs to
 * whoever placed the character: this page puts slot A on the left and slot B on the right, and the
 * shop will put them wherever the route ended. Both add the dance's offsets on top of their own
 * placement -- which is the same arrangement `built.groundOffset` already uses for grounding.
 */
function stepDanceFor(id, character, slot, dt) {
  if (!slot.perf) return null;
  const d = stepDance(slot.perf, dt);
  if (d.done) {
    if (state.repeat) slot.perf = makeDance(state.dance);
    else { slot.perf = null; state.dance = 'none'; restoreSpring(slot); buildGui(); }
  }
  // The slot's own placement, plus what the dance asks for. Travel is along +Z because that is
  // the direction a character faces, and shift is across it; the two slots keep their own X so
  // they stay side by side.
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
  // Written every frame rather than on the checkbox, so it survives a randomise clearing opts.
  // Assignment, not a fresh object: opts is read 60 times a second by two characters, and a
  // per-frame spread is exactly the GC pressure crowd.html already had to learn about.
  slot.opts.idleAmount = state.idle ? 1 : 0;
  const d = stepDanceFor(id, character, slot, dt);
  // A dance that runs the walk layer (the Uptown Funk strut) drives the gait itself, so its speed
  // outranks the dial -- otherwise the strut would only work while the walk checkbox happened to
  // be on. Speed 0 with the layer ON would show closed legs and read as the switch being broken,
  // so the gate is the switch itself -- not run at all, which is the layer's documented zero.
  const walking = d ? d.walk > 0 : state.walk;
  const dial = state.walk ? state.speed : 0;
  const speed = d ? d.walk : dial;
  const L = character.params.legHeight + character.params.hipInset;
  const w = walkPhase(slot.phase, speed, L, slot.opts);
  const gain = walkGain(character.motion, speed, dt, slot.opts);
  slot.phase = (slot.phase + phaseStep(speed * dt, speed, L, slot.opts)) % 1;
  // Both POSES[name] and a dance's pose are frozen singletons, which is what lets integrate()
  // detect an interrupt by identity -- so a key-pose change mid-blend carries its velocity across.
  // That is the whole reason a dance can be a list of poses rather than a curve per channel.
  stepMotion(character, d ? d.pose : POSES[state.pose], dt, slot.opts,
    walking ? (out) => walkLayer(out, w, gain, slot.opts) : null);
  // AFTER stepMotion: grounding writes root.y absolutely, so a releve added before it is erased.
  if (slot.rise) character.root.position.y += slot.rise;
}

function stepAll(dt) {
  for (const id of SLOTS) stepSlot(id, dt);
}

/** Put a character's own spring back after a dance borrowed it. */
function restoreSpring(slot) {
  if (!slot.base) return;
  slot.opts.stiff = slot.base.stiff;
  slot.opts.zeta = slot.base.zeta;
}

/**
 * Start or stop a dance on BOTH slots at once -- the point of this page is comparing two species
 * doing the same thing, and two dances started a frame apart would be unjudgeable.
 *
 * Starting one turns `play` on: a dance is the engine driving the rig, so asking for a dance while
 * the page is in static-slider mode should just work rather than silently do nothing.
 */
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
      // A dance's own spring, kept off the character's temperament: a riverdance step is faster
      // than any character settles, and tuning that per dance is what stops every dance feeling
      // like the same dance at a different speed.
      slot.opts.stiff = DANCES[name].stiff;
      slot.opts.zeta = DANCES[name].zeta;
    }
  }
  buildGui();   // the pose dropdown is enabled in one state and disabled in the other
  save();
}

/** Back to the slot's own spot, facing front -- undoing whatever a dance did to the root. */
function resetPlacement(id) {
  const { root } = built[id];
  root.position.x = slotX(id);
  root.position.z = 0;
  root.rotation.y = 0;
}

// ---------------------------------------------------------------- gui

// entry forms: [key, min, max, step?] | [key, 'color'] | [key, 'bool'] | [key, [options]]
function addControl(folder, params, entry, onChange) {
  const [key, a, b, step] = entry;
  if (!(key in params)) return;
  if (a === 'color') folder.addColor(params, key).onChange(onChange);
  else if (a === 'bool') folder.add(params, key).onChange(onChange);
  else if (Array.isArray(a)) folder.add(params, key, a).onChange(onChange);
  else folder.add(params, key, a, b, step ?? 0.001).onChange(onChange);
}

/**
 * A preset slider is not a parameter -- it is a BUNDLE of the other sliders in its folder. So it
 * has to write them into params and then refresh their displays, or the character changes shape
 * while every slider under it still reads the old number.
 *
 * `presetKey` and `onPresetChange` are the species' own declaration of which slider that is. All
 * three species have declared them from the start and nothing ever read them, so every preset
 * slider was inert: it set an integer that no builder looks at. The presets themselves only ever
 * took effect through randomise, which picks one at random.
 */
function presetHandler(species, params, onChange) {
  return () => {
    species.onPresetChange(params, params[species.presetKey]);
    onChange();
    // updateDisplay, not buildGui: the user is mid-drag on one of these controllers and
    // destroying the panel underneath them loses the drag.
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  };
}

function addSlotFolders(species, params, onChange) {
  const isPreset = (key) => key === species.presetKey && species.onPresetChange;
  for (const [title, entries] of Object.entries(species.gui)) {
    const folder = gui.addFolder(title);
    entries.forEach((entry) => addControl(folder, params, entry,
      isPreset(entry[0]) ? presetHandler(species, params, onChange) : onChange));
    // Only the POSE folder. Proportions and rig are built into the mesh rather than written per
    // frame, so they stay live under `play` -- which is half the point of animating here at all:
    // drag a leg length and watch the stride change under it.
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
  // The stack, top-down, in the order it composes. `idle` leaves POSTURE standing on purpose --
  // headCarry, headCock, attend and armTuck sit above the idle early-out in compose(), because
  // carriage is not fidgeting and a character with the fidget turned off is still withdrawn.
  folder.add(state, 'idle').name('+ idle layer  (I)').onChange(save);
  folder.add(state, 'walk').name('+ walk layer  (W)').onChange(save);
  folder.add(state, 'speed', 0, 1.5, 0.01).name('walk speed').onChange(save);

  // The five in DANCES.md. A dance drives the pose target itself, so it is not a layer alongside
  // the other two -- it REPLACES the pose dropdown, and says so by disabling it.
  const dances = gui.addFolder('victory dances');
  dances.add(state, 'dance', ['none', ...DANCE_NAMES]).name('dance').onChange(setDance);
  dances.add(state, 'repeat').name('repeat one-shots').onChange(save);
  // One button per dance as well as the dropdown: picking the same entry twice does not fire
  // onChange, and "play it again" is the single most common thing you do while tuning one.
  for (const name of DANCE_NAMES) {
    dances.add({ f: () => { setDance('none'); setDance(name); } }, 'f').name(`▶ ${name}`);
  }
}

function addSceneFolder() {
  const folder = gui.addFolder('scene');
  // Under `play` this is the TARGET handed to the interpolator rather than a value assigned to
  // the rig. `walk` and `walk+carry` are frozen snapshots of ONE stride frame, not the cycle --
  // for the cycle pick `rest` and push `walk in place`.
  const poseRow = folder.add(state, 'pose', POSE_NAMES).onChange(setPose);
  // A dance IS a sequence of pose targets, so while one runs this control cannot mean anything --
  // disabled rather than left lying about what is on screen, the same call the pose FOLDER gets
  // under `play` for the same reason.
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

// ---------------------------------------------------------------- keys
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
  // Cycle the dances from the keyboard: the whole point is watching one, adjusting, watching the
  // next, and reaching for a dropdown between every look is what makes that tedious.
  x: () => {
    const all = ['none', ...DANCE_NAMES];
    setDance(all[(all.indexOf(state.dance) + 1) % all.length]);
  },
  // Restart whatever is loaded -- "again" is the most common thing you want while tuning one.
  c: () => { if (state.dance !== 'none') { const d = state.dance; setDance('none'); setDance(d); } },
};

const isFormField = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

// capture phase, because lil-gui handles keydown on its own inputs and can swallow it
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
setGeometryDetail(state.detail);
renderer.toneMapping = TONE_MAPPING[state.toneMapping];
renderer.toneMappingExposure = state.exposure;
buildAll();
setView(state.view);
buildGui();
frameAll();

renderer.setAnimationLoop(() => {
  // Capped exactly as the game caps it (store/main.js): a backgrounded tab hands back one
  // enormous frame, and a spring integrated over it diverges to NaN -- which reaches the bounding
  // sphere and culls the whole character, presenting as "they popped out of existence".
  const dt = Math.min(clock.update().getDelta(), 0.1);
  if (state.play) stepAll(dt);
  controls.update();
  renderer.render(scene, camera);
  SLOTS.forEach(positionPlate);
});
