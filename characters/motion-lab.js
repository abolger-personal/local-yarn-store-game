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

// What each pose is meant to read as. A motion cannot be judged without knowing what it was
// aiming for -- "is that arrival wrong, or is browse just like that?" is unanswerable otherwise.
const POSE_MEANS = {
  rest: 'standing, arms down',
  walk: 'mid-stride (static pose; the real walk is the walking folder)',
  carry: 'holding something at the chest',
  reach: 'arm out to a shelf',
  browse: 'leaning in, looking at goods',
  sit: 'seated, knees up',
  delighted: 'arms up, ears perked \u2014 the buy reaction',
  'walk+carry': 'mid-stride holding something',
};
const LANE = 2.4;                 // characters wrap at +/- this, so a walk has somewhere to go
const POSE_NAMES = Object.keys(POSES);

const S = {
  species: speciesIds()[0],
  count: 2,
  allSpecies: false,       // one character per species from IDENTICAL traits
  view: 'felted',
  // bake-off
  // A FRACTION of the move, not a wall-clock time. Absolute seconds made the duration knob
  // change two things at once: how long a move takes AND how far through it the interrupt
  // landed. Worse, at any duration shorter than the interrupt delay the move simply FINISHED
  // first, so there was no interrupt to survive and the two duration-based engines printed
  // identical numbers -- which reads as "the duration slider does nothing to smoothstep".
  interruptAt: 0.45,       // 0..1 through the move
  chaos: false,
  dtScale: 1,
  // walk
  speed: 0.0,
  lookOver: 0,             // -1..1 of the species' own headYawMax. An owl reaches ~264deg here
                           // and a llama ~109, from one shared control and no per-species code.
  scopeChannel: 'armSwing',
  // tuning, copied so the lab never mutates a frozen export
  opts: { ...MOTION_DEFAULTS },
  // MULTIPLIERS for the coefficients motionOf derives from personality, 1 = as authored.
  // These cannot live in `opts`: coeffs() spreads motionOf() over it, so anything motionOf
  // returns silently overwrote the slider and five knobs did nothing at all. Scaling after the
  // merge keeps BOTH -- personality still spreads the cast, these shift the whole cast at once.
  scale: { stiff: 1, zeta: 1, stride: 1, bounce: 1, idleRate: 1,
           armGain: 1, sway: 1, lean: 1 },
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
  // Shared ACROSS the trio, varied across slots. The three rows of one slot must differ by the
  // interpolator and nothing else, or the comparison is contaminated -- but two different slots
  // should still look like two different characters, which is what the idle seed provides.
  const walkDist = Math.random() * 0.4;
  const seed = Math.random();

  ENGINES.forEach((engine, row) => {
    const built = createCharacter({ ...params }, kit);
    const lane = slot * (ENGINES.length + 0.7) + row;
    const z = (lane - (slots * (ENGINES.length + 0.7) - 1.7) / 2) * 0.8;
    built.root.position.set(0, 0, z);
    group.add(built.root);
    cast.push({
      built, engine, traits, lane: z, walkDist,
      motion: makeMotion(built.params, seed),
      opts: coeffs(traits, kit, engine),
    });
  });
}

/** Species span + trait position + the lab's global knobs, merged in that order. */
function coeffs(traits, kit, engine) {
  const ranges = S.allSpecies ? (kit.motionRanges ?? S.ranges) : S.ranges;
  const per = motionOf(traits, ranges);
  for (const k of Object.keys(S.scale)) per[k] *= S.scale[k];
  return { ...S.opts, ...per, mode: engine };
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
const poseTrail = [];         // the last two target names, so the banner can read "reach -> browse"
const poseEl = document.getElementById('pose');

/**
 * `reset` clears the peak-velocity-step readout.
 *
 * It must NOT happen on the interrupt itself: the interrupt IS the frame being measured, and
 * zeroing there wipes the number one frame before it is read. So the setup pose resets and the
 * interrupt does not.
 */
function setTarget(pose, reset = true) {
  const name = POSE_NAMES.find((n) => POSES[n] === pose) ?? '?';
  if (target !== pose) poseTrail.push(name);
  while (poseTrail.length > 2) poseTrail.shift();
  target = pose;
  if (reset) for (const a of cast) a.maxDv = 0;
  markNextSample = true;
  showPose();
}

/** The banner: what they are doing, and what it is supposed to look like. */
function showPose() {
  const now = poseTrail.at(-1) ?? 'rest';
  const prev = poseTrail.length > 1 ? poseTrail.at(-2) : null;
  poseEl.innerHTML = `<b>${prev ? `${prev} \u2192 ` : ''}${now}</b>`
    + `<span>${POSE_MEANS[now] ?? ''}</span>`;
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
  // Scaled by the move duration, so changing that knob changes ONLY how fast the move is and
  // never where the interrupt lands. The spring has no duration of its own, but all three rows
  // run off one event stream and so must share one interrupt instant.
  pendingInterrupt = S.interruptAt * S.opts.blend;
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
  // Deliberate head turn, as a fraction of what this species can physically do. applyPose
  // clamps to headYawMax, so asking for more than an animal has simply saturates.
  if (S.lookOver !== 0) out.headYaw += S.lookOver * (a.built.params.headYawMax ?? 1.4);

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

/**
 * Add a control with a readable name and a hover explanation.
 *
 * lil-gui shows only the property name, and the property names here are the maths ("zeta",
 * "sinMax", "armGain") -- fine in the source, useless on a tuning surface where the whole job is
 * deciding what to drag. Every knob says what it does and which way is which.
 */
function knob(folder, obj, prop, label, help, ...rest) {
  const c = folder.add(obj, prop, ...rest).name(label);
  c.domElement.title = help;
  const name = c.domElement.querySelector('.name');
  if (name) name.title = help;
  return c;
}

const fCast = gui.addFolder('cast');
knob(fCast, S, 'species', 'species', 'Which species to fill the lab with.', speciesIds())
  .onChange(buildCast);
knob(fCast, S, 'count', 'how many', 'Characters per row. Each gets its own random personality.',
  1, 8, 1).onChange(buildCast);
knob(fCast, S, 'allSpecies', 'compare species',
  'One of every species, all given the SAME personality. Any difference you then see comes only '
  + 'from that species\u2019 own variation spans.').onChange(buildCast);
knob(fCast, { reroll: buildCast }, 'reroll', 'new personalities (R)',
  'Roll fresh trait values for everyone. Watch the roster bottom-right change with them.');
knob(fCast, S, 'view', 'render as',
  'Silhouette is the honest test: if a motion does not read as a flat black shape, it will not '
  + 'read at play distance either.', ['felted', 'grey', 'silhouette'])
  .onChange((v) => setViewMode(group, v));

// The per-species knob: drag a span and the row spreads or converges, live.
// How much ONE member of a species differs from another. Each row is a RANGE, not a value:
// personality decides where in the range a character lands, the species decides how wide the
// range is. Narrow the gap and every member moves alike; widen it and they vary.
const SPAN_HELP = {
  stiff: 'how eagerly they move',
  zeta: 'how much they wobble on arrival',
  idleAmp: 'how much they fidget',
  idleRate: 'how fast they fidget',
  stride: 'step length',
  bounce: 'walking bounce',
  headArc: 'how far they turn their head',
};

const fRanges = gui.addFolder('how much members of a species differ');
for (const k of Object.keys(BASE_MOTION_RANGES)) {
  const [lo, hi] = BASE_MOTION_RANGES[k];
  const pad = (hi - lo) * 1.5;
  const row = { min: S.ranges[k][0], max: S.ranges[k][1] };
  const help = `${SPAN_HELP[k]}. Narrow the gap and every member of the species moves alike; `
    + 'widen it and they vary. Where one character sits inside it is set by their personality.';
  knob(fRanges, row, 'min', `${SPAN_HELP[k]} \u2014 least`, help, lo - pad, hi + pad)
    .onChange((v) => { S.ranges[k][0] = v; retune(); });
  knob(fRanges, row, 'max', `${SPAN_HELP[k]} \u2014 most`, help, lo - pad, hi + pad)
    .onChange((v) => { S.ranges[k][1] = v; retune(); });
}
knob(fRanges, { copy: exportRanges }, 'copy', 'copy these spans as code',
  'Puts a paste-ready MOTION_RANGES block on the clipboard, for owl.js or llama.js.');
fRanges.close();

const fBake = gui.addFolder('how motion gets from A to B');
knob(fBake, { go: fireInterrupt }, 'go', '\u25b6 CUT OFF A MOVE (Enter)',
  'The whole point of this page. Starts a reach, then interrupts it partway with a browse. '
  + 'Watch whether each row glides into the new move or stops dead and restarts.');
knob(fBake, S, 'interruptAt', 'cut it off how far in',
  'Where the interrupt lands, as a fraction of the move: 0.5 is halfway. A fraction rather than '
  + 'a time, so changing the duration below does not also change where the cut happens.',
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
knob(fBake, S.scale, 'stiff', 'how eagerly they move',
  'Spring rows only. Higher = snaps to a new pose decisively; lower = dawdles into it. Scales '
  + 'the whole cast at once; personality still spreads them apart (see the roster).',
  0.15, 3).onChange(retune);
knob(fBake, S.scale, 'zeta', 'wobble on arrival',
  'Spring rows only. Below 1 the move overshoots and settles back \u2014 the cute bounce. '
  + 'Above 1 it arrives sluggishly. Scales the whole cast; personality still spreads them.',
  0.4, 2).onChange(retune);
knob(fBake, S.opts, 'blend', 'move duration (s)',
  'Hermite and smoothstep rows only: how long a move takes, start to finish.',
  0.08, 1.2).onChange(retune);

const fWalk = gui.addFolder('walking');
knob(fWalk, S, 'speed', 'walking speed',
  'Drives them along the floor. 0 = standing still. Stride phase follows DISTANCE, so the feet '
  + 'stay planted at any speed and any leg length.', 0, 2.5);
knob(fWalk, S.scale, 'stride', 'step length',
  'How far each step reaches. Past about 1.13x leg length the legs physically cannot reach and '
  + 'the feet slide \u2014 the skate readout will say so. Scales the whole cast.',
  0.5, 1.5).onChange(retune);
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

knob(fWalk, S, 'lookOver', 'look over the shoulder',
  'Turns every head as far as ITS OWN SPECIES can manage. An owl clears about 264 degrees, a '
  + 'llama about 109 \u2014 set once in each kit as headYawMax, next to neckLength.',
  -1, 1).onChange(() => { if (S.speed === 0) showPose(); });

const fIdle = gui.addFolder('standing still');
knob(fIdle, S.opts, 'idleAmount', 'how much they fidget',
  'Master dial for breathing, weight shifting and looking around. 0 freezes them solid \u2014 '
  + 'which is what the game looks like today.', 0, 3).onChange(retune);
knob(fIdle, S.scale, 'idleRate', 'how fast they fidget',
  'Speeds up or slows down every idle rhythm \u2014 breathing, swaying, looking around. '
  + 'Scales the whole cast; personality still spreads them.', 0.25, 3).onChange(retune);
knob(fIdle, S.opts, 'idleDuty', 'how often they fidget',
  'Duty cycle, separate from size. At 1 they sway continuously; lower and the sway comes in '
  + 'bursts with real stillness between them, which is how animals actually stand around. '
  + 'Breathing never stops.', 0.15, 1).onChange(retune);

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
  // (named `k`, not `key`: `key` is the scene's directional light)
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
showPose();
