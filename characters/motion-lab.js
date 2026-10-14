import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../inventory/room-environment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  BASE_PARAMS, BASE_MOTION_RANGES, MOTION_DEFAULTS, POSES, POSE_KEYS, BUILD, TONE_MAPPING,
  createCharacter, disposeCharacter, setViewMode, setGeometryDetail,
  getSpecies, speciesIds, makeMotion, resetMotion, integrate, compose, applyPose,
  motionOf, factors, walkPhase, phaseStep, walkLayer, walkGain, topSpeed, valueOf, velocityOf,
  spanBounds,
} from './npc.js';
import { randomTraits } from './visit.js';
import './owl.js';
import './llama.js';
import './lion.js';

console.info('LYS build', BUILD);

// MOTION-TODO.md "The interpolator bake-off: decided"
const CHOSEN = 'spring';
const ENGINES = [CHOSEN, 'hermite', 'smoothstep'];

const POSE_MEANS = {
  rest: 'standing, arms down',
  walk: 'a frozen snapshot of one stride frame -- NOT the walk cycle. Pick rest + treadmill for that.',
  carry: 'holding something at the chest',
  reach: 'arm out to a shelf',
  browse: 'leaning in, looking at goods',
  sit: 'seated, knees up',
  delighted: 'arms up, ears perked \u2014 the buy reaction',
  'walk+carry': 'the same frozen snapshot, holding something -- also not the walk cycle',
};
const LANE = 2.4;
const POSE_NAMES = Object.keys(POSES);

const S = {
  species: speciesIds()[0],
  count: 2,
  extremes: false,
  allSpecies: false,
  view: 'felted',
  interruptAt: 0.45,
  cutSlow: 0.2,
  loopCut: false,
  chaos: false,
  compare: { hermite: false, smoothstep: false },
  dtScale: 1,
  speed: 0.0,
  lookOver: 0,
  scopeChannel: 'armSwing',
  opts: { ...MOTION_DEFAULTS },
  scale: { stiff: 1, zeta: 1, stride: 1, bounce: 1, idleRate: 1,
           armGain: 1, sway: 1, lean: 1, headCarry: 1, headCock: 1, attend: 1, kneeLift: 1,
           armTuck: 1, tailCarry: 1 },
  ranges: spansOf(speciesIds()[0]),
};

function shownEngines() {
  return ENGINES.filter((e) => e === CHOSEN || S.compare[e]);
}

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = TONE_MAPPING.ACES;
renderer.toneMappingExposure = 0.4;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e4dc');
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
const HOME = new THREE.Vector3(3.2, 2.5, 5.2);
camera.position.copy(HOME);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight('#fff6e8', 1.5);
key.position.set(2.2, 3.4, 2.0);
scene.add(key, new THREE.AmbientLight('#cfd6e2', 0.35));

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

/**
 * @typedef {{built: any, motion: any, opts: any, engine: string, traits: any,
 *   walkDist: number, phase: number, lane: number, maxDv?: number, skate?: number, top?: number,
 *   label?: string, odd?: string}} Actor
 */
/** @type {Actor[]} */
let cast = [];
function spansOf(id) {
  return structuredClone(getSpecies(id)?.motionRanges ?? BASE_MOTION_RANGES);
}

const group = new THREE.Group();
scene.add(group);

function clearCast() {
  for (const a of cast) { group.remove(a.built.root); disposeCharacter(a.built); }
  cast = [];
}

let shared = null;

/** @type {Corner[] | null} */
let matrix = null;

// MOTION-TODO.md "Reading the motion range: the extremes matrix"
const FACTOR_ORDER = ['E', 'N', 'C', 'O'];

/**
 * @typedef {{E: number, N: number, C: number, O: number, label: string, odd: string}} Corner
 * @returns {Corner[]}
 */
function extremesMatrix() {
  const rows = [];
  for (const [base, odd] of [[5, 1], [1, 5]]) {
    for (const k of FACTOR_ORDER) {
      const v = (x) => (x === k ? odd : base);
      rows.push({
        E: v('E'), N: v('N'), C: v('C'), O: v('O'),
        label: FACTOR_ORDER.map((x) => (v(x) === 5 ? x : x.toLowerCase())).join(''),
        odd: k,
      });
    }
  }
  return rows;
}

/** @param {Corner} row */
function traitsOf(row) {
  return {
    Enthusiasm: row.E, Assertiveness: row.E,
    Volatility: row.N, Withdrawal: row.N,
    Industriousness: row.C, Orderliness: row.C,
    Openness: row.O, Intellect: row.O,
    Compassion: 3, Politeness: 3,
  };
}

function buildCast() {
  clearCast();
  const n = S.extremes ? 8 : S.count;
  const ids = S.allSpecies ? speciesIds() : Array.from({ length: n }, () => S.species);
  shared = S.allSpecies ? randomTraits() : null;
  matrix = S.extremes && !S.allSpecies ? extremesMatrix() : null;
  ids.forEach((id, i) => addPair(id, i, ids.length));
  setViewMode(group, S.view);
  refreshRoster();
  showPose();
  syncEngineControls();
}

function addPair(id, slot, slots) {
  const kit = getSpecies(id);
  const params = { ...BASE_PARAMS, ...kit.defaults };
  if (!S.allSpecies && !matrix) kit.randomise?.(params);
  const corner = matrix?.[slot];
  if (corner) {
    const hue = (slot / 8) * 360;
    params.bodyColor = `hsl(${hue.toFixed(0)}, 42%, 62%)`;
    if (kit.coatColorKey) params[kit.coatColorKey] = `hsl(${hue.toFixed(0)}, 38%, 52%)`;
  }
  const traits = corner ? traitsOf(corner) : (shared ?? randomTraits());
  const walkDist = matrix ? (slot / slots) * 0.4 : Math.random() * 0.4;
  const seed = matrix ? (slot + 0.5) / slots : Math.random();

  const shown = shownEngines();
  shown.forEach((engine, row) => {
    const lane = slot * (shown.length + 0.7) + row;
    const z = (lane - (slots * (shown.length + 0.7) - 1.7) / 2) * 0.8;
    addOne(kit, params, engine, { traits, seed, walkDist, z, label: corner?.label, odd: corner?.odd });
  });
}

function addOne(kit, params, engine, { traits, seed, walkDist, z, label, odd }) {
  const built = createCharacter({ ...params }, kit);
  built.root.position.set(0, 0, z);
  group.add(built.root);
  cast.push({
    built, engine, traits, lane: z, walkDist, phase: walkDist, label, odd,
    motion: makeMotion(built.params, seed),
    opts: coeffs(traits, kit, engine),
  });
}

function coeffs(traits, kit, engine) {
  const ranges = S.allSpecies ? (kit.motionRanges ?? S.ranges) : S.ranges;
  const per = motionOf(traits, ranges);
  for (const k of Object.keys(S.scale)) per[k] *= S.scale[k];
  return { ...S.opts, ...per, mode: engine };
}

function retune() {
  for (const a of cast) {
    Object.assign(a.opts, coeffs(a.traits, a.built.species, a.engine));
  }
  refreshRoster();
}

const scratch = Object.fromEntries(
  [...POSE_KEYS.map((k) => [k, 0]), ['holdItem', false], ['blink', 0], ['kneeSwing', 0],
    ['neckCurve', 0]],
);

let target = POSES.rest;
let poseIndex = 0;
let runStage = 'done';
let runTimer = 0;
let markNextSample = false;
const poseTrail = [];

const RUN_STAGES = {
  settle: 'settling back to rest \u2014 so every run starts from the same place',
  reach:  'reaching \u2026 about to be cut off partway',
  cut:    'CUT \u2014 the reach was interrupted by a browse. Which row glided, and which stopped dead?',
};
const poseEl = document.getElementById('pose');

function setTarget(pose, reset = true) {
  const name = POSE_NAMES.find((n) => POSES[n] === pose) ?? '?';
  if (target !== pose) poseTrail.push(name);
  while (poseTrail.length > 2) poseTrail.shift();
  target = pose;
  if (reset) for (const a of cast) a.maxDv = 0;
  markNextSample = true;
  showPose();
}

function showPose() {
  const now = poseTrail.at(-1) ?? 'rest';
  const prev = poseTrail.length > 1 ? poseTrail.at(-2) : null;
  let tail;
  if (runStage !== 'done') tail = `<span class="stage">${RUN_STAGES[runStage] ?? ''}</span>`;
  else if (shownEngines().length > 1) {
    tail = '<span class="hint">the rows differ ONLY across a pose change \u2014 press '
      + '<kbd>Enter</kbd> to interrupt one. Walking and fidgeting are added after the '
      + 'interpolator, the same way for every row.</span>';
  } else {
    tail = '<span class="hint">spring \u2014 press <kbd>Enter</kbd> to interrupt a move. Switch on '
      + 'hermite or smoothstep under \u201chow motion gets from A to B\u201d to compare '
      + 'against it.</span>';
  }
  const arrow = prev ? `${prev} \u2192 ` : '';
  poseEl.innerHTML = `<b>${arrow}${now}</b><span>${POSE_MEANS[now] ?? ''}</span>${tail}`;
}

function cyclePose() {
  poseIndex = (poseIndex + 1) % POSE_NAMES.length;
  setTarget(POSES[POSE_NAMES[poseIndex]]);
}

function fireInterrupt() {
  runStage = 'settle';
  runTimer = 0;
}

function atRest() {
  return cast.every((a) => POSE_KEYS.every((k) => Math.abs(velocityOf(a.motion, k)) < 2e-3
    && Math.abs(valueOf(a.motion, k) - (POSES.rest[k] ?? 0)) < 2e-3));
}

function stepRun(dt) {
  runTimer += dt;
  if (runStage === 'settle') {
    if (target !== POSES.rest) setTarget(POSES.rest);
    if (!atRest() && runTimer < 3) return;
    for (const a of cast) resetMotion(a.motion, POSES.rest);
    setTarget(POSES.reach);
    runStage = 'reach';
    runTimer = 0;
  } else if (runStage === 'reach') {
    if (runTimer < S.interruptAt * S.opts.blend) return;
    setTarget(POSES.browse, false);
    runStage = 'cut';
    runTimer = 0;
  } else if (runTimer > Math.max(0.6, S.opts.blend * 2)) {
    runStage = S.loopCut ? 'settle' : 'done';
    runTimer = 0;
  }
}

const clock = new THREE.Timer();
let stepOnce = false;
let paused = false;

function walkStep(a, out, dt) {
  const P = a.built.params;
  const L = P.legHeight + P.hipInset;
  const moved = S.speed * dt;
  a.walkDist += moved;
  const w = walkPhase(a.phase, S.speed, L, a.opts);
  a.phase = (a.phase + phaseStep(moved, S.speed, L, a.opts)) % 1;
  const gain = walkGain(a.motion, S.speed, dt, a.opts);
  walkLayer(out, w, gain, a.opts);
  a.skate = w.skate;
  a.top = topSpeed(L, a.opts);
  return gain;
}

function tickOne(a, dt) {
  const before = velocityOf(a.motion, S.scopeChannel);
  integrate(a.motion, target, dt, a.opts);
  const after = velocityOf(a.motion, S.scopeChannel);
  a.maxDv = Math.max(a.maxDv ?? 0, Math.abs(after - before));

  const out = compose(scratch, a.motion, a.opts);
  if (S.lookOver !== 0) out.headYaw += S.lookOver * (a.built.params.headYawMax ?? 1.4);

  const gain = walkStep(a, out, dt);
  applyPose(a.built, out);

  a.built.root.rotation.y = gain * (Math.PI / 2);
  const travelled = ((a.walkDist % (LANE * 2)) + LANE * 2) % (LANE * 2) - LANE;
  a.built.root.position.x = travelled * gain;
}

function frame() {
  let dt = Math.min(clock.update().getDelta(), 0.1) * S.dtScale;
  if (paused && !stepOnce) dt = 0;
  if (stepOnce) { dt = (1 / 60) * S.dtScale; stepOnce = false; }

  if (runStage !== 'done') {
    if (runStage !== 'settle') dt *= S.cutSlow;
    const was = runStage;
    stepRun(dt);
    if (runStage !== was) showPose();
  }
  if (S.chaos && dt > 0 && Math.random() < dt * 4) cyclePose();

  for (const a of cast) tickOne(a, dt);
  drawScope();
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

const scopeCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scope'));
const ctx2d = scopeCanvas.getContext('2d');
const history = new Map();

const COLOUR = { spring: '#2f7fd1', hermite: '#d1642f', smoothstep: '#7a4fd1' };

function sampleScope() {
  const W = scopeCanvas.width;
  for (const engine of shownEngines()) {
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

  const marks = history.get(CHOSEN)?.mark ?? [];
  ctx2d.strokeStyle = 'rgba(0,0,0,.30)';
  ctx2d.beginPath();
  marks.forEach((m, i) => { if (m) { ctx2d.moveTo(i, 0); ctx2d.lineTo(i, H); } });
  ctx2d.stroke();

  for (const engine of shownEngines()) {
    const h = history.get(engine);
    if (!h) continue;
    trace(h.v, COLOUR[engine], 1, 0.35);
    trace(h.d, COLOUR[engine], 0.45, 0.06);
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

const rosterEl = document.getElementById('roster');

const TRAIT_COLS = Object.freeze([
  ['E', 'Extraversion', 'Enthusiasm + Assertiveness'],
  ['N', 'Neuroticism', 'Volatility + Withdrawal'],
  ['C', 'Conscientiousness', 'Industriousness + Orderliness'],
  ['O', 'Openness/Intellect', 'Openness + Intellect'],
]);

function rosterRow(a) {
  const o = a.opts;
  const P = a.built.params;
  const coat = a.built.species.coatColorKey;
  const second = coat && P[coat] !== P.bodyColor
    ? `<span class="chip" style="background:${P[coat]}"></span>` : '';
  const swatch = `<span class="chip" style="background:${P.bodyColor}"></span>${second}`;
  const F = factors(a.traits);
  const traits = TRAIT_COLS.map(([ab, full]) => {
    const v = F[full.replace('/', '')].toFixed(1);
    return a.odd === ab ? `<td class="odd">${v}</td>` : `<td>${v}</td>`;
  }).join('');
  const who = a.label ? `<span class="corner">${a.label}</span>` : a.built.species.label;
  return `<tr><td>${swatch} ${who}</td>${traits}`
    + `<td class="co">${o.stiff.toFixed(0)}</td><td class="co">${o.zeta.toFixed(2)}</td>`
    + `<td class="co">${o.idleAmp.toFixed(2)}</td><td class="co">${o.stride.toFixed(2)}</td>`
    + `<td class="co">${o.headArc.toFixed(2)}</td></tr>`;
}

function refreshRoster() {
  const rows = cast.filter((a) => a.engine === CHOSEN)
    .sort((x, y) => y.lane - x.lane)
    .map(rosterRow).join('');
  const head = shared
    ? '<div class="shared">Same traits on every row, so anything that differs below is the '
      + 'species’ own MOTION_RANGES.</div>'
    : '';
  const th = TRAIT_COLS.map(([ab, full, from]) =>
    `<th title="${full} — the mean of ${from}">${ab}</th>`).join('');
  rosterEl.innerHTML = `${head}<table><tr><th>species</th>${th}`
    + '<th class="co" title="how eagerly they move">stiff</th>'
    + '<th class="co" title="how much they wobble on arrival">zeta</th>'
    + '<th class="co" title="how much they fidget">idle</th>'
    + '<th class="co" title="step length">stride</th>'
    + '<th class="co" title="how much they look around while idling — NOT how far they CAN '
    + 'turn, which is headYawMax in the species kit: anatomy, not temperament">head</th>'
    + `</tr>${rows}</table>`;
}

const readoutEl = document.getElementById('readout');
setInterval(() => {
  const parts = shownEngines().map((engine) => {
    const a = cast.find((c) => c.engine === engine);
    return a ? `${engine} ${(a.maxDv ?? 0).toFixed(2)}` : engine;
  });
  const shown = cast.filter((c) => c.engine === CHOSEN);
  const worst = Math.max(0, ...shown.map((c) => c.skate ?? 0));
  const slowest = Math.min(Infinity, ...shown.map((c) => c.top ?? Infinity));
  const sliding = worst > 0.25;
  const warn = sliding ? ' — the feet are sliding' : '';
  const top = Number.isFinite(slowest)
    ? `<br />fastest honest walk for this cast: <b>${slowest.toFixed(2)}</b> (set by the shortest legs)`
    : '';
  readoutEl.innerHTML = `max |dv| at interrupt — ${parts.join('  ·  ')}`
    + `   ·   <span class="${sliding ? 'bad' : ''}">worst skate `
    + `${(worst * 100).toFixed(0)}%${warn}</span>${top}`;
}, 120);

const gui = new GUI({ title: 'motion lab' });

function knob(folder, obj, prop, label, ...rest) {
  const [help, ...range] = rest;
  const c = folder.add(obj, prop, ...range).name(label);
  c.domElement.title = help;
  const name = c.domElement.querySelector('.name');
  if (name) name.title = help;
  return c;
}

const tagged = [];

function forEngines(c, ...engines) {
  const name = c.domElement.querySelector('.name');
  if (name) {
    if (engines.length === 1) name.style.color = COLOUR[engines[0]];
    const dots = engines.map((e) =>
      `<span class="dot" style="background:${COLOUR[e]}"></span>`).join('');
    name.insertAdjacentHTML('beforeend', ` ${dots}`);
    name.title = `${name.title}\n\nOnly affects: ${engines.join(', ')}.`;
  }
  tagged.push({ c, engines });
  return c;
}

function syncEngineControls() {
  const shown = shownEngines();
  for (const { c, engines } of tagged) c.show(engines.some((e) => shown.includes(e)));
}

const fCast = gui.addFolder('cast');
knob(fCast, S, 'species', 'species',
  'Which species to fill the lab with. Switching also loads THAT species\u2019 own spans into '
  + '\u201chow much members of a species differ\u201d, so the numbers you see and edit are the '
  + 'ones the kit actually ships.', speciesIds())
  .onChange((id) => { S.ranges = spansOf(id); refreshSpans(); buildCast(); });
knob(fCast, S, 'count', 'how many', 'Characters per row. Each gets its own random personality.',
  1, 8, 1).onChange(buildCast);
knob(fCast, S, 'extremes', 'extremes, not random',
  'Replaces the random cast with the EIGHT corner personalities: four with three factors at 5 '
  + 'and one at 1, four with three at 1 and one at 5. Every factor is low twice and high twice '
  + 'across the row, so reading down a roster column shows what that one factor is worth. '
  + 'Bodies, idle seeds and stride phase are all held identical in this mode — leg length '
  + 'dominates a walk far more than temperament does, so randomised bodies would bury exactly '
  + 'the thing you are trying to see. Forces the cast to 8.').onChange(buildCast);

knob(fCast, S, 'allSpecies', 'compare species',
  'One of every species, all given the SAME personality. Any difference you then see comes only '
  + 'from that species\u2019 own variation spans.').onChange(buildCast);
knob(fCast, { reroll: buildCast }, 'reroll', 'new personalities (R)',
  'Roll fresh trait values for everyone. Watch the roster bottom-right change with them.');
knob(fCast, S, 'view', 'render as',
  'Silhouette is the honest test: if a motion does not read as a flat black shape, it will not '
  + 'read at play distance either.', ['felted', 'grey', 'silhouette'])
  .onChange((v) => setViewMode(group, v));

const SPRING_ONLY = new Set(['stiff', 'zeta']);

const SPAN_HELP = {
  stiff: 'how eagerly they move',
  zeta: 'how much they wobble on arrival',
  idleAmp: 'how much they fidget',
  idleRate: 'how fast they fidget',
  stride: 'step length',
  bounce: 'walking bounce',
  kneeLift: 'how high they pick their feet up',
  headArc: 'how much they look around',
  armGain: 'how much the arms swing',
  sway: 'how far they roll side to side',
  lean: 'how far they lean into a walk',
  headCarry: 'how low they carry their head',
  armTuck: 'how much they hold their arms in',
  tailCarry: 'how high they carry their tail',
};

const fRanges = gui.addFolder('how much members of a species differ');
fRanges.domElement.querySelector('.children')?.insertAdjacentHTML('afterbegin',
  '<div class="engine-key">Walking STYLE is deliberately not here: arm swing, sway, lean, head '
  + 'carriage and arms-held-in are the same spans for every species, so a walk reads the same '
  + 'way whatever animal is doing it. Their global knobs are under “walking”.</div>');
function sliderBounds(k) {
  let lo = BASE_MOTION_RANGES[k][0], hi = BASE_MOTION_RANGES[k][1];
  for (const id of speciesIds()) {
    const r = getSpecies(id)?.motionRanges?.[k];
    if (r) { lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]); }
  }
  return spanBounds(k, lo, hi);
}

const spanRows = [];

function refreshSpans() {
  for (const { k, row, mn, mx } of spanRows) {
    row.min = S.ranges[k][0];
    row.max = S.ranges[k][1];
    mn.updateDisplay();
    mx.updateDisplay();
  }
}

for (const k of Object.keys(BASE_MOTION_RANGES)) {
  const [lo, hi] = sliderBounds(k);
  const row = { min: S.ranges[k][0], max: S.ranges[k][1] };
  const help = `${SPAN_HELP[k]}. Narrow the gap and every member of the species moves alike; `
    + 'widen it and they vary. Where one character sits inside it is set by their personality.';
  const mn = knob(fRanges, row, 'min', `${SPAN_HELP[k]} \u2014 least`, help, lo, hi)
    .onChange((v) => { S.ranges[k][0] = v; retune(); });
  const mx = knob(fRanges, row, 'max', `${SPAN_HELP[k]} \u2014 most`, help, lo, hi)
    .onChange((v) => { S.ranges[k][1] = v; retune(); });
  spanRows.push({ k, row, mn, mx });
  if (SPRING_ONLY.has(k)) { forEngines(mn, 'spring'); forEngines(mx, 'spring'); }
}
knob(fRanges, { copy: exportRanges }, 'copy', 'copy these spans as code',
  'Puts a paste-ready MOTION_RANGES block on the clipboard, for the kit file of whichever '
  + 'species is currently selected.');
fRanges.close();

const fBake = gui.addFolder('how motion gets from A to B');
fBake.domElement.querySelector('.children')?.insertAdjacentHTML('afterbegin',
  '<div class="engine-key">label colour = which engine a control reaches:<br />'
  + `<i style="color:${COLOUR.spring}">spring</i> · `
  + `<i style="color:${COLOUR.hermite}">hermite</i> · `
  + `<i style="color:${COLOUR.smoothstep}">smoothstep</i> · `
  + 'grey = all of them. A control reaching some but not all gets one dot per engine.</div>');

knob(fBake, S.compare, 'hermite', 'also show: hermite',
  'A second row per character running the velocity-carrying cubic instead of the spring. Smooth '
  + 'across an interrupt, but identical to smoothstep on any move that is NOT interrupted, and '
  + 'it can never overshoot — so the wobble dial does nothing on it. Off by default: spring is '
  + 'the chosen engine.').onChange(buildCast);
knob(fBake, S.compare, 'smoothstep', 'also show: smoothstep',
  'A third row running what the game used before this work: zero slope at both ends, so an '
  + 'interrupted move throws its speed away and restarts from a standstill. That is the twitch. '
  + 'Kept only so you can see the problem again on demand.').onChange(buildCast);

knob(fBake, { go: fireInterrupt }, 'go', '\u25b6 CUT OFF A MOVE (Enter)',
  'The whole point of this page. Starts a reach, then interrupts it partway with a browse. '
  + 'Watch whether each row glides into the new move or stops dead and restarts.');
knob(fBake, S, 'cutSlow', 'slow motion during the cut',
  'Velocity continuity is a sub-100ms event, so at real time there is nothing for an eye to '
  + 'catch. This slows time only while a cut is running — walking speed is untouched the '
  + 'rest of the time. 0.1 is ten times slower than life.', 0.05, 1);
knob(fBake, S, 'loopCut', 'keep repeating the cut',
  'Off: one press of Enter runs ONE cut and stops. On: it settles back to rest and runs the '
  + 'same cut again, over and over, so you can watch a single instant as many times as you '
  + 'need without reaching for the keyboard.');
knob(fBake, S, 'interruptAt', 'cut it off how far in (fraction)',
  'Where the cut lands as a FRACTION of the move, not a time: 0.5 is halfway, 0.1 is almost '
  + 'immediately. A fraction rather than seconds, so changing the move duration below does not '
  + 'also move where the cut happens.',
  0.05, 0.95);
knob(fBake, { next: cyclePose }, 'next', 'next pose (P)',
  'Step through the poses one at a time, uninterrupted.');
knob(fBake, S, 'chaos', 'never stop interrupting',
  'Fires random moves at random times forever. This is what shakes out blow-ups.');
knob(fBake, S, 'dtScale', 'slow motion', 'Below 1 runs slower than real time, so you can watch '
  + 'a single interrupt happen. Above 1 fast-forwards.', 0.1, 2);
knob(fBake, { step: () => { stepOnce = true; } }, 'step', 'advance one frame (.)',
  'Pause with Space, then tap this to step frame by frame through an interrupt.');
knob(fBake, S, 'scopeChannel', 'graph which joint',
  'Which joint angle the graph top-left plots. armSwing shows the most during a reach.',
  POSE_KEYS);
forEngines(knob(fBake, S.scale, 'stiff', 'how eagerly they move',
  'Higher = snaps to a new pose decisively; lower = dawdles into it. Scales the whole cast at '
  + 'once; personality still spreads them apart (see the roster).',
  0.15, 3).onChange(retune), 'spring');
forEngines(knob(fBake, S.scale, 'zeta', 'wobble on arrival',
  'Below 1 the move overshoots and settles back \u2014 the cute bounce. Above 1 it arrives '
  + 'sluggishly. Measured overshoot: 0.45 gives 19.6%, 0.65 gives 5.7%, and anything from 0.85 '
  + 'up is indistinguishable. Scales the whole cast; personality still spreads them.',
  0.4, 2).onChange(retune), 'spring');
forEngines(knob(fBake, S.opts, 'blend', 'move duration (s)',
  'How long a move takes, start to finish. The spring has no duration of its own \u2014 it '
  + 'settles at a rate set by how eagerly they move and the wobble on arrival \u2014 so this '
  + 'reaches the other two engines only, and disappears when neither is on screen.',
  0.08, 1.2).onChange(retune), 'hermite', 'smoothstep');

const fWalk = gui.addFolder('walking');
knob(fWalk, S, 'speed', 'walking speed',
  'Drives them along the floor. 0 = standing still. Stride phase follows DISTANCE, so the feet '
  + 'stay planted at any speed and any leg length.', 0, 2.5);
knob(fWalk, S.scale, 'stride', 'step length',
  'How far each step reaches, as a multiple of leg length. Past about 2.26x the legs physically '
  + 'cannot reach and the feet slide \u2014 the skate readout will say so. Scales the whole cast.',
  0.5, 1.5).onChange(retune);
knob(fWalk, S.scale, 'kneeLift', 'knee lift',
  'How much the swinging leg bends its knee to clear the floor. At 0 the legs are rigid sticks '
  + 'and BOTH feet reach the ground at the same instant twice a step — that is the stomp '
  + 'that reads as a limp, so drag it to 0 to see what this fixed. The knee only lifts the foot '
  + 'while that leg is BEHIND the hip, so very high values buckle it rather than lifting more.',
  0, 2.5).onChange(retune);
knob(fWalk, S.scale, 'sway', 'side-to-side sway',
  'How far the body rolls over the planted foot each step. An excitable character rolls, an '
  + 'orderly one walks a tidy line. Scales the whole cast.', 0, 3).onChange(retune);
knob(fWalk, S.scale, 'bounce', 'up-and-down bounce',
  'Extra dip at each footfall, on top of the bob that comes free from the legs scissoring. '
  + 'Scales the whole cast.', 0, 3).onChange(retune);
knob(fWalk, S.scale, 'armGain', 'arm swing',
  'How much the arms counter-swing against the legs. Outgoing characters swing; withdrawn ones '
  + 'pin their arms to their sides. Scales the whole cast.', 0, 2.5).onChange(retune);
knob(fWalk, S.scale, 'lean', 'forward lean',
  'How far they lean into the walk. Assertive, industrious characters lean in. Scales the '
  + 'whole cast.', 0, 2.5).onChange(retune);

knob(fWalk, S.opts, 'sinMax', 'biggest believable step',
  'A ceiling on how far the legs will scissor, as a sine: 0.56 is sin(0.6 rad), about 34 '
  + 'degrees. Step length is clamped to this no matter what the stride knob asks for, so past '
  + 'it the body outruns the legs and the skate readout climbs instead of the step growing.',
  0.15, 0.85).onChange(retune);
knob(fWalk, S.opts, 'swayRateMax', 'fastest the body will roll',
  'A speed limit on the side-to-side sway, in radians per second. Sway is an AMPLITUDE, which '
  + 'says nothing about how fast the torso gets there — the same 8 degrees of lean is 26 deg/s '
  + 'at a stroll and 87 at a scurry, and the second one reads as a vibration rather than a '
  + 'swagger. This caps the rate, so a character who already sways gently is untouched and only '
  + 'someone asking for more roll than they have time for gets damped. Turn it all the way up '
  + 'to see the shudder it prevents.', 0.15, 3).onChange(retune);
knob(fWalk, S.opts, 'cadenceMax', 'fastest step rate',
  'Steps per second before the legs stop moving faster and start reaching further instead. Low '
  + 'values give a long striding walk, high values a quick scurry.', 0.5, 8).onChange(retune);
knob(fWalk, S.opts, 'cadenceMin', 'slowest step rate',
  'Steps per second below which a slow walk takes shorter steps instead of slower ones. 0 is off, '
  + 'and a long-legged character strolling steps in slow motion; the shop uses 1.5.', 0, 3).onChange(retune);
knob(fWalk, S.opts, 'gateSpeed', 'speed to reach a full walk',
  'How fast they must be moving before the walk is at full strength. Below it the cycle fades '
  + 'out, which is what brings the feet together when they stop. Raise it and they creep into '
  + 'and out of walking; lower it and the legs snap on the instant they move.',
  0.05, 1.5).onChange(retune);

knob(fWalk, S.scale, 'headCarry', 'head carriage',
  'How high or low they hold their head. Open and confident, or down and closed — the single '
  + 'most readable posture signal there is, and completely free of leg length. Scales the whole '
  + 'cast; personality still spreads them.', 0, 2.5).onChange(retune);
knob(fWalk, S.opts, 'marchRatio', 'march vs butt-kick',
  'Where the knee lift goes. At 0 only the shin folds, so the heel kicks back and more knee '
  + 'lift just kicks harder — that is a butt-kicker. Turn it up and the THIGH comes forward '
  + 'with the bend, so the knee rises in front of the body: a march. Around 0.5 reads as '
  + 'picking your feet up smartly.', 0, 1).onChange(retune);
knob(fWalk, S.scale, 'attend', 'leans in, paying attention',
  'Torso forward while STANDING — the focused, intent posture. Conscientiousness drives it, and '
  + 'it is the only thing C does that you can see before a character sets off walking. It '
  + 'crossfades with forward lean rather than adding to it: at rest the lean is attention, at '
  + 'full stride it is gait.', 0, 2.5).onChange(retune);
knob(fWalk, S.scale, 'headCock', 'head cocked to one side',
  'A sideways head tilt held while curious — the head-cock a bird or a dog does at something '
  + 'interesting. Openness drives it, and which SIDE each character cocks to is fixed for life, '
  + 'because a head that changed sides would read as a twitch. Deliberately a different axis '
  + 'from head carriage, so confidence and curiosity cannot be mistaken for each other.',
  0, 2.5).onChange(retune);
knob(fWalk, S.scale, 'armTuck', 'arms held in',
  'How much they keep their elbows bent and their arms against the body. Withdrawn characters '
  + 'hold themselves in. Scales the whole cast; personality still spreads them.',
  0, 2.5).onChange(retune);
knob(fWalk, S.scale, 'tailCarry', 'tail carried high',
  'Tail up when outgoing, tucked down when anxious — the same read as head carriage, at the '
  + 'other end. Added to each species\' own resting droop. Scales the whole cast.',
  0, 2.5).onChange(retune);

knob(fWalk, S, 'lookOver', 'look over the shoulder',
  'Turns every head as far as ITS OWN SPECIES can manage. An owl clears about 264 degrees, a '
  + 'llama about 109 \u2014 set once in each kit as headYawMax, next to neckLength.',
  -1, 1).onChange(() => { if (S.speed === 0) showPose(); });

const fIdle = gui.addFolder('standing still');
knob(fIdle, S.opts, 'idleAmount', 'fidgeting, whole cast',
  'Master dial over every character at once, on top of whatever their personality gives them. '
  + '0 freezes them solid — which is what the game looks like today. How much any ONE of them '
  + 'fidgets comes from Enthusiasm minus Withdrawal: see the roster\u2019s "idle" column, and '
  + 'the "how much they fidget" pair under "how much members of a species differ".',
  0, 3).onChange(retune);
knob(fIdle, S.scale, 'idleRate', 'how fast they fidget',
  'Speeds up or slows down every idle rhythm \u2014 breathing, swaying, looking around. '
  + 'Scales the whole cast; personality still spreads them.', 0.25, 3).onChange(retune);
knob(fIdle, S.opts, 'idleDuty', 'how often they fidget',
  'Duty cycle, separate from size. At 1 they sway continuously; lower and the sway comes in '
  + 'bursts with real stillness between them, which is how animals actually stand around. '
  + 'Two things deliberately never stop: breathing, and the occasional ear flick — both slow '
  + 'down here but neither switches off, because a character frozen absolutely solid reads as '
  + 'a dropped frame rather than as stillness.', 0.15, 1).onChange(retune);

function exportRanges() {
  const body = Object.keys(BASE_MOTION_RANGES)
    .map((k) => `  ${k}: [${S.ranges[k][0].toFixed(2)}, ${S.ranges[k][1].toFixed(2)}],`)
    .join('\n');
  const text = `export const MOTION_RANGES = Object.freeze({\n  ...BASE_MOTION_RANGES,\n${body}\n});`;
  navigator.clipboard?.writeText(text);
  console.info(text);
}

const SHORTCUTS = {
  enter: () => fireInterrupt(),
  p: () => cyclePose(),
  r: () => buildCast(),
  '.': () => { stepOnce = true; },
  ' ': () => { paused = !paused; },
  b: () => renderer.domElement.classList.toggle('squint'),
  d: () => camera.position.copy(HOME).multiplyScalar(2.1),
  f: () => camera.position.copy(HOME),
  1: () => setViewMode(group, 'felted'),
  2: () => setViewMode(group, 'grey'),
  3: () => setViewMode(group, 'silhouette'),
};

addEventListener('keydown', (e) => {
  if (/input|textarea/i.test(/** @type {HTMLElement} */ (e.target)?.tagName ?? '')) return;
  const k = e.key.toLowerCase();

  const act = SHORTCUTS[k];
  if (!act) return;
  act();

  e.preventDefault();
  const focused = /** @type {HTMLElement} */ (document.activeElement);
  if (focused && focused !== document.body && focused.closest?.('.lil-gui')) focused.blur();
});

setGeometryDetail('high');
buildCast();
showPose();
