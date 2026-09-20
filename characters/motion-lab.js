// Motion lab — the tuning surface for continuous character motion.
//
// The page answers two questions the other viewers cannot:
//
//   1. Which interpolator survives an INTERRUPT? The two are indistinguishable on a clean
//      blend and differ only when a transition is cut off mid-flight, so the same interrupt
//      has to hit both on the same frame. Hence two rows driven from one event stream, and a
//      scope that plots VELOCITY -- the difference is invisible to the eye at 60fps and
//      unmistakable on a velocity trace.
//   2. How much motion variation should ONE MEMBER of a species get? The trait values decide
//      where in a span a character lands; the species decides how wide the span is. Drag a
//      span's min/max and the whole row spreads or converges live.
//
// Not species-checker.html: that page's idiom is "params ARE the pose" (its sliders rebuild the
// character), which cannot hold once motion is continuous -- every slider would be stomped 60
// times a second.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  BASE_PARAMS, BASE_MOTION_RANGES, MOTION_DEFAULTS, POSES, POSE_KEYS, BUILD, TONE_MAPPING,
  createCharacter, disposeCharacter, setViewMode, setGeometryDetail,
  getSpecies, speciesIds, makeMotion, resetMotion, integrate, compose, applyPose,
  motionOf, walkPhase, walkLayer, walkGain, valueOf, velocityOf,
} from './npc.js';
import { randomTraits } from './visit.js';
import './owl.js';
import './llama.js';

console.info('LYS build', BUILD);

// Three rows, front to back. 'smoothstep' is the CURRENT behaviour, on screen as the control:
// the whole question is whether the other two look better than what the game does today, and
// that is not answerable without it in the same frame.
const ENGINES = ['spring', 'hermite', 'smoothstep'];
const LANE = 2.4;                 // characters wrap at +/- this, so a walk has somewhere to go
const POSE_NAMES = Object.keys(POSES);

const S = {
  species: speciesIds()[0],
  count: 2,
  allSpecies: false,       // one character per species from IDENTICAL traits
  view: 'felted',
  // bake-off
  interruptAfter: 0.15,    // seconds into a transition -- default BLEND is 0.35, so mid-flight
  chaos: false,
  dtScale: 1,
  // walk
  speed: 0.0,
  scopeChannel: 'armSwing',
  // tuning, copied so the lab never mutates a frozen export
  opts: { ...MOTION_DEFAULTS },
  ranges: structuredClone(BASE_MOTION_RANGES),
};

// ---------------------------------------------------------------- scene

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = TONE_MAPPING.ACES;
renderer.toneMappingExposure = 0.4;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e4dc');
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
const HOME = new THREE.Vector3(3.2, 2.5, 5.2);   // angled, so three rows read as three rows
camera.position.copy(HOME);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight('#fff6e8', 1.5);
key.position.set(2.2, 3.4, 2.0);
scene.add(key, new THREE.AmbientLight('#cfd6e2', 0.35));

// A grid, not a blank plane: a planted foot must hold still against a fixed reference, and
// against a featureless floor even total skate looks like normal walking.
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e4ded3';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,.09)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(160, 160);
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 1 }),
);
scene.add(ground);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- the cast

/**
 * @typedef {{built: any, motion: any, opts: any, engine: string, traits: any,
 *   walkDist: number, lane: number, maxDv?: number, skate?: number}} Actor
 */
/** @type {Actor[]} */
let cast = [];
const group = new THREE.Group();
scene.add(group);

function clearCast() {
  for (const a of cast) { group.remove(a.built.root); disposeCharacter(a.built); }
  cast = [];
}

/** The trait set every species shares while `allSpecies` is on. */
let shared = null;

/**
 * Builds one TRIO per slot: identical params, identical traits, one engine each.
 *
 * Identical is the whole point -- if the rows differed in proportion or temperament the
 * comparison would be between characters, not between interpolators.
 */
function buildCast() {
  clearCast();
  const ids = S.allSpecies ? speciesIds() : Array.from({ length: S.count }, () => S.species);
  // "one per species, SAME traits" means one trait roll shared by every species -- that is the
  // whole comparison, temperament held constant so any difference left is the species' own
  // MOTION_RANGES. Rolling per slot instead made each species a different character and there
  // was nothing to compare. Rerolling then replaces the shared set, which is what makes the
  // button do something visible in this mode.
  shared = S.allSpecies ? randomTraits() : null;
  ids.forEach((id, i) => addPair(id, i, ids.length));
  setViewMode(group, S.view);
  refreshRoster();
}


/**
 * One slot: the same character and the same traits, built once per engine.
 *
 * Everyone walks along +X, so each build gets a Z lane of its own and nobody can walk through
 * anybody. The three engines of one slot sit adjacent, because those are what get compared and
 * a difference this small is only readable between neighbours.
 */
function addPair(id, slot, slots) {
  const kit = getSpecies(id);
  const params = { ...BASE_PARAMS, ...kit.defaults };
  if (!S.allSpecies) kit.randomise?.(params);
  const traits = shared ?? randomTraits();
  const walkDist = Math.random() * 0.4;   // shared, or the trio strides out of step

  ENGINES.forEach((engine, row) => {
    const built = createCharacter({ ...params }, kit);
    const lane = slot * (ENGINES.length + 0.7) + row;
    const z = (lane - (slots * (ENGINES.length + 0.7) - 1.7) / 2) * 0.8;
    built.root.position.set(0, 0, z);
    group.add(built.root);
    cast.push({
      built, engine, traits, lane: z, walkDist,
      motion: makeMotion(built.params, Math.random()),
      opts: coeffs(traits, kit, engine),
    });
  });
}

/** Species span + trait position + the lab's global knobs, merged in that order. */
function coeffs(traits, kit, engine) {
  const ranges = S.allSpecies ? (kit.motionRanges ?? S.ranges) : S.ranges;
  return { ...S.opts, ...motionOf(traits, ranges), mode: engine };
}

/** Re-derives coefficients without rebuilding. Dragging a span must be felt immediately. */
function retune() {
  for (const a of cast) {
    Object.assign(a.opts, coeffs(a.traits, a.built.species, a.engine));
  }
  refreshRoster();
}

const scratch = Object.fromEntries(
  [...POSE_KEYS.map((k) => [k, 0]), ['holdItem', false], ['blink', 0]],
);

// ---------------------------------------------------------------- the pose event stream
//
// ONE source for both rows. Two independently-driven rows would be two experiments.

let target = POSES.rest;
let poseIndex = 0;
let pendingInterrupt = 0;
let pendingTarget = null;
let markNextSample = false;   // drawn as a vertical rule on the scope

/**
 * `reset` clears the peak-velocity-step readout.
 *
 * It must NOT happen on the interrupt itself: the interrupt IS the frame being measured, and
 * zeroing there wipes the number one frame before it is read. So the setup pose resets and the
 * interrupt does not.
 */
function setTarget(pose, reset = true) {
  target = pose;
  if (reset) for (const a of cast) a.maxDv = 0;
  markNextSample = true;
}

function cyclePose() {
  poseIndex = (poseIndex + 1) % POSE_NAMES.length;
  setTarget(POSES[POSE_NAMES[poseIndex]]);
}

/**
 * Fire one pose, then cut it off after exactly `interruptAfter` seconds.
 *
 * Deterministic and repeatable, which matters: eyeballing an interrupt by clicking twice fast
 * never lands on the same frame twice, and the whole comparison is about what happens on that
 * one frame.
 */
function fireInterrupt() {
  // Snap everyone back to rest first. Firing twice in a row from wherever the last run happened
  // to end measures nothing -- the second run starts already at the target and no channel moves,
  // which reads as "0.00" and looks like the instrument is broken rather than the setup.
  //
  // `target` has to be reset alongside the per-character state: integrate() detects a retarget by
  // object IDENTITY, so leaving it pointing at POSES.reach from the previous run means the setup
  // pose below is not seen as a change at all and nothing ever starts moving.
  for (const a of cast) resetMotion(a.motion, POSES.rest);
  target = POSES.rest;
  setTarget(POSES.reach);
  pendingTarget = POSES.browse;
  pendingInterrupt = S.interruptAfter;
}

// ---------------------------------------------------------------- per-frame

const clock = new THREE.Clock();
let stepOnce = false;
let paused = false;

/** One character: interpolate, sum the additive layers, apply. */
function tickOne(a, dt) {
  const before = velocityOf(a.motion, S.scopeChannel);
  integrate(a.motion, target, dt, a.opts);
  const after = velocityOf(a.motion, S.scopeChannel);
  a.maxDv = Math.max(a.maxDv ?? 0, Math.abs(after - before));

  const out = compose(scratch, a.motion, a.opts);

  // walk: distance-driven, so the phase freezes when the character does
  const P = a.built.params;
  const L = P.legHeight + P.hipInset;
  a.walkDist += S.speed * dt;
  const w = walkPhase(a.walkDist, S.speed, L, a.opts);
  const gain = walkGain(a.motion, S.speed, dt, a.opts);
  walkLayer(out, w, gain, a.opts);
  a.skate = w.skate;

  applyPose(a.built, out);

  // Walk along +X, in a lane of their own, and TURN to face the way they are going -- reusing
  // the gait's own gain, so the turn lands exactly as the stride starts and there is no snap.
  // Facing is the whole point here: the rig faces +Z, so translating along X without the turn
  // is a character sliding sideways while its legs stride forward.
  a.built.root.rotation.y = gain * (Math.PI / 2);
  const travelled = ((a.walkDist % (LANE * 2)) + LANE * 2) % (LANE * 2) - LANE;
  a.built.root.position.x = travelled * gain;
}

function frame() {
  let dt = Math.min(clock.getDelta(), 0.1) * S.dtScale;
  if (paused && !stepOnce) dt = 0;
  if (stepOnce) { dt = (1 / 60) * S.dtScale; stepOnce = false; }

  if (pendingInterrupt > 0 && dt > 0) {
    pendingInterrupt -= dt;
    if (pendingInterrupt <= 0 && pendingTarget) {
      setTarget(pendingTarget, false);
      pendingTarget = null;
    }
  }
  if (S.chaos && dt > 0 && Math.random() < dt * 4) cyclePose();

  for (const a of cast) tickOne(a, dt);
  drawScope();
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------------- the scope
//
// The instrument the page exists for. Velocity continuity through an interrupt is invisible on
// the characters and obvious here: smoothstep's trace drops to the axis and climbs back out.

const scopeCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scope'));
const ctx2d = scopeCanvas.getContext('2d');
const history = new Map();      // engine -> {v: number[], d: number[]}

const COLOUR = { spring: '#2f7fd1', hermite: '#d1642f', smoothstep: '#8a8f98' };

function sampleScope() {
  const W = scopeCanvas.width;
  for (const engine of ENGINES) {
    const a = cast.find((c) => c.engine === engine);
    if (!a) continue;
    const h = history.get(engine) ?? { v: [], d: [], mark: [] };
    h.v.push(valueOf(a.motion, S.scopeChannel));
    h.d.push(velocityOf(a.motion, S.scopeChannel));
    h.mark.push(markNextSample);
    while (h.v.length > W) { h.v.shift(); h.d.shift(); h.mark.shift(); }
    history.set(engine, h);
  }
  markNextSample = false;
}

function drawScope() {
  sampleScope();
  const W = scopeCanvas.width, H = scopeCanvas.height;
  ctx2d.clearRect(0, 0, W, H);
  ctx2d.strokeStyle = 'rgba(0,0,0,.18)';
  ctx2d.beginPath(); ctx2d.moveTo(0, H / 2); ctx2d.lineTo(W, H / 2); ctx2d.stroke();

  // a vertical rule at each interrupt: the only place on the trace worth looking at
  const marks = history.get(ENGINES[0])?.mark ?? [];
  ctx2d.strokeStyle = 'rgba(0,0,0,.30)';
  ctx2d.beginPath();
  marks.forEach((m, i) => { if (m) { ctx2d.moveTo(i, 0); ctx2d.lineTo(i, H); } });
  ctx2d.stroke();

  for (const engine of ENGINES) {
    const h = history.get(engine);
    if (!h) continue;
    trace(h.v, COLOUR[engine], 1, 0.35);      // value: solid
    trace(h.d, COLOUR[engine], 0.45, 0.06);   // velocity: faint, scaled down
  }
}

function trace(series, colour, alpha, scale) {
  const H = scopeCanvas.height;
  ctx2d.globalAlpha = alpha;
  ctx2d.strokeStyle = colour;
  ctx2d.lineWidth = alpha === 1 ? 1.6 : 1;
  ctx2d.beginPath();
  series.forEach((v, i) => {
    const y = H / 2 - v * H * scale;
    if (i === 0) ctx2d.moveTo(i, y); else ctx2d.lineTo(i, y);
  });
  ctx2d.stroke();
  ctx2d.globalAlpha = 1;
}

// ---------------------------------------------------------------- readouts

const rosterEl = document.getElementById('roster');

function refreshRoster() {
  const rows = cast.filter((a) => a.engine === 'spring').map((a) => {
    const o = a.opts;
    return `<tr><td>${a.built.species.label}</td><td>${o.stiff.toFixed(0)}</td>`
      + `<td>${o.zeta.toFixed(2)}</td><td>${o.idleAmp.toFixed(2)}</td>`
      + `<td>${o.stride.toFixed(2)}</td><td>${o.headArc.toFixed(2)}</td></tr>`;
  }).join('');
  // With shared traits on screen, a difference between rows can only come from the species'
  // own spans -- so the traits have to be visible or the comparison cannot be read.
  const head = shared
    ? `<div class="shared">same traits — Assertiveness ${shared.Assertiveness}, `
      + `Withdrawal ${shared.Withdrawal}, Volatility ${shared.Volatility}, `
      + `Enthusiasm ${shared.Enthusiasm}</div>`
    : '';
  rosterEl.innerHTML = `${head}<table><tr><th>species</th><th>stiff</th><th>zeta</th>`
    + `<th>idle</th><th>stride</th><th>head</th></tr>${rows}</table>`;
}

const readoutEl = document.getElementById('readout');
setInterval(() => {
  const parts = ENGINES.map((engine) => {
    const a = cast.find((c) => c.engine === engine);
    return a ? `${engine} ${(a.maxDv ?? 0).toFixed(2)}` : engine;
  });
  const skate = cast[0]?.skate ?? 0;
  readoutEl.textContent = `max |dv| at interrupt — ${parts.join('  ·  ')}`
    + `   ·   skate ${(skate * 100).toFixed(0)}%`;
}, 120);

// ---------------------------------------------------------------- gui

const gui = new GUI({ title: 'motion lab' });

const fCast = gui.addFolder('cast');
fCast.add(S, 'species', speciesIds()).onChange(buildCast);
fCast.add(S, 'count', 1, 8, 1).onChange(buildCast);
fCast.add(S, 'allSpecies').name('one per species, same traits').onChange(buildCast);
fCast.add({ reroll: buildCast }, 'reroll').name('reroll traits (R)');
fCast.add(S, 'view', ['felted', 'grey', 'silhouette']).onChange((v) => setViewMode(group, v));

// The per-species knob: drag a span and the row spreads or converges, live.
const fRanges = gui.addFolder('species variation');
for (const k of Object.keys(BASE_MOTION_RANGES)) {
  const [lo, hi] = BASE_MOTION_RANGES[k];
  const pad = (hi - lo) * 1.5;
  const row = { min: S.ranges[k][0], max: S.ranges[k][1] };
  fRanges.add(row, 'min', lo - pad, hi + pad).name(`${k} min`)
    .onChange((v) => { S.ranges[k][0] = v; retune(); });
  fRanges.add(row, 'max', lo - pad, hi + pad).name(`${k} max`)
    .onChange((v) => { S.ranges[k][1] = v; retune(); });
}
fRanges.add({ copy: exportRanges }, 'copy').name('copy MOTION_RANGES to clipboard');
fRanges.close();

const fBake = gui.addFolder('interpolator bake-off');
fBake.add(S.opts, 'stiff', 20, 800).onChange(retune).name('stiff (spring)');
fBake.add(S.opts, 'zeta', 0.3, 2).onChange(retune).name('zeta (spring)');
fBake.add(S.opts, 'blend', 0.08, 1.2).onChange(retune).name('blend (hermite)');
fBake.add(S, 'interruptAfter', 0.02, 0.5).name('interrupt after (s)');
fBake.add({ go: fireInterrupt }, 'go').name('INTERRUPT (Enter)');
fBake.add({ next: cyclePose }, 'next').name('next pose (P)');
fBake.add(S, 'chaos').name('chaos — random interrupts');
fBake.add(S, 'dtScale', 0.1, 2).name('dt scale');
fBake.add({ step: () => { stepOnce = true; } }, 'step').name('single frame (.)');
fBake.add(S, 'scopeChannel', POSE_KEYS).name('scope channel');

const fWalk = gui.addFolder('walk');
fWalk.add(S, 'speed', 0, 2.5).name('treadmill speed');
fWalk.add(S.opts, 'stride', 1.0, 2.4).onChange(retune);
fWalk.add(S.opts, 'bounce', -0.12, 0.2).onChange(retune);
fWalk.add(S.opts, 'armGain', 0, 1.5).onChange(retune);
fWalk.add(S.opts, 'lean', 0, 0.3).onChange(retune);
fWalk.add(S.opts, 'idleAmount', 0, 2).onChange(retune).name('idle amount');

/** Paste-ready for a kit file, so lab tuning lands in source without retyping. */
function exportRanges() {
  const body = Object.keys(BASE_MOTION_RANGES)
    .map((k) => `  ${k}: [${S.ranges[k][0].toFixed(2)}, ${S.ranges[k][1].toFixed(2)}],`)
    .join('\n');
  const text = `export const MOTION_RANGES = Object.freeze({\n  ...BASE_MOTION_RANGES,\n${body}\n});`;
  navigator.clipboard?.writeText(text);
  console.info(text);
}

// ---------------------------------------------------------------- keys

addEventListener('keydown', (e) => {
  if (/input|textarea/i.test(/** @type {HTMLElement} */ (e.target)?.tagName ?? '')) return;
  const k = e.key.toLowerCase();
  if (k === 'enter') fireInterrupt();
  else if (k === 'p') cyclePose();
  else if (k === 'r') buildCast();
  else if (k === '.') stepOnce = true;
  else if (k === ' ') { paused = !paused; e.preventDefault(); }
  else if (k === 'b') renderer.domElement.classList.toggle('squint');
  else if (k === 'd') camera.position.copy(HOME).multiplyScalar(2.1);   // ~150px tall
  else if (k === 'f') camera.position.copy(HOME);
  else if (k === '1') setViewMode(group, 'felted');
  else if (k === '2') setViewMode(group, 'grey');
  else if (k === '3') setViewMode(group, 'silhouette');
});

setGeometryDetail('high');
buildCast();
