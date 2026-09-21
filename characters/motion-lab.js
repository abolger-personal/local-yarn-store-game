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
  motionOf, factors, walkPhase, walkLayer, walkGain, topSpeed, valueOf, velocityOf,
} from './npc.js';
import { randomTraits } from './visit.js';
import './owl.js';
import './llama.js';

console.info('LYS build', BUILD);

// Three rows, front to back. 'smoothstep' is the CURRENT behaviour, on screen as the control:
// the whole question is whether the other two look better than what the game does today, and
// that is not answerable without it in the same frame.
// SPRING IS THE CHOSEN ENGINE. Decided 2026-09-20 in this lab: smoothstep visibly twitches on
// every interrupt (its slope is zero at both ends, so an interrupted move relaunches from a
// standstill), and hermite, while smooth, is bit-identical to smoothstep on any move that is
// NOT interrupted -- measured max difference 0.000000 rad from rest, because its start tangent
// is seeded from incoming velocity and that is zero at rest, leaving a cubic Hermite with both
// tangents zero, which IS t*t*(3-2t). Its end tangent is hard-zero, so it can never overshoot,
// which kills the zeta dial that carries Volatility vs Orderliness.
//
// The other two are kept here as comparison rows, off by default, because the tuning that
// follows is worth being able to sanity-check against. They are NOT kept in the game: the plan
// deletes them from motion.js when cast.js is wired, at three grep-able places all named `mode`.
const CHOSEN = 'spring';
const ENGINES = [CHOSEN, 'hermite', 'smoothstep'];


// What each pose is meant to read as. A motion cannot be judged without knowing what it was
// aiming for -- "is that arrival wrong, or is browse just like that?" is unanswerable otherwise.
const POSE_MEANS = {
  rest: 'standing, arms down',
  // These two are NOT the walk. They are single frozen frames, hand-authored back when nothing
  // moved -- a snapshot of one instant of a stride, held forever. The actual walk is a layer
  // added on top of whichever pose is selected, driven by distance travelled, and you turn it
  // on with the `walking` slider folder (or the treadmill). Pick `rest` and push the treadmill
  // up: that is the real gait. Both of these get deleted once the cycle is wired into the game.
  walk: 'a frozen snapshot of one stride frame -- NOT the walk cycle. Pick rest + treadmill for that.',
  carry: 'holding something at the chest',
  reach: 'arm out to a shelf',
  browse: 'leaning in, looking at goods',
  sit: 'seated, knees up',
  delighted: 'arms up, ears perked \u2014 the buy reaction',
  'walk+carry': 'the same frozen snapshot, holding something -- also not the walk cycle',
};
const LANE = 2.4;                 // characters wrap at +/- this, so a walk has somewhere to go
const POSE_NAMES = Object.keys(POSES);

const S = {
  species: speciesIds()[0],
  count: 2,
  extremes: false,         // the 8 corner personalities instead of random ones
  allSpecies: false,       // one character per species from IDENTICAL traits
  view: 'felted',
  // bake-off
  // A FRACTION of the move, not a wall-clock time. Absolute seconds made the duration knob
  // change two things at once: how long a move takes AND how far through it the interrupt
  // landed. Worse, at any duration shorter than the interrupt delay the move simply FINISHED
  // first, so there was no interrupt to survive and the two duration-based engines printed
  // identical numbers -- which reads as "the duration slider does nothing to smoothstep".
  interruptAt: 0.45,       // 0..1 through the move
  cutSlow: 0.2,            // time scale WHILE a scripted cut runs, so the eye can follow it
  loopCut: true,           // repeat the cut until told to stop -- one press is never enough
  chaos: false,
  // Off: spring is chosen, so these are comparison rows you switch on to check something, not
  // the normal view. Showing them by default triples the cast for no benefit while tuning.
  compare: { hermite: false, smoothstep: false },
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
           armGain: 1, sway: 1, lean: 1, headCarry: 1, headCock: 1, attend: 1,
           armTuck: 1 },
  ranges: structuredClone(BASE_MOTION_RANGES),
};

/** The rows actually on screen. Spring is never hideable -- it is the one being tuned. */
function shownEngines() {
  return ENGINES.filter((e) => e === CHOSEN || S.compare[e]);
}

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
 *   walkDist: number, lane: number, maxDv?: number, skate?: number, top?: number,
 *   label?: string, odd?: string}} Actor
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

/** The eight corner rows while `extremes` is on, else null. @type {Corner[] | null} */
let matrix = null;

// THE EXTREMES MATRIX. Random casts are the wrong instrument for learning the range of the
// system: eight random personalities cluster near the middle of every dial and you end up
// comparing near-duplicates. This walks the corners instead.
//
// Four factors drive motion, so "three at 5 and one at 1" has exactly four members -- one per
// choice of which factor is low -- and "three at 1 and one at 5" has four more. Eight, which is
// the whole cast, and each factor appears low twice and high twice across it. That is a
// near-orthogonal design: read DOWN a column to see one factor's effect with the others held
// at an extreme, and the difference is attributable rather than confounded.
const FACTOR_ORDER = ['E', 'N', 'C', 'O'];

/**
 * The eight corner personalities.
 *
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
        // CASE IS THE VALUE: upper = 5, lower = 1. So "ENCo" is high on everything but
        // Openness and "encO" is low on everything but Openness. Marking merely which factor
        // was the odd one out gave both of those the same label, which is the one thing the
        // label exists to tell apart.
        label: FACTOR_ORDER.map((x) => (v(x) === 5 ? x : x.toLowerCase())).join(''),
        odd: k,
      });
    }
  }
  return rows;
}

/**
 * A corner row as the ten spec-named assets: both halves of a factor take the same value.
 * @param {Corner} row
 */
function traitsOf(row) {
  return {
    Enthusiasm: row.E, Assertiveness: row.E,
    Volatility: row.N, Withdrawal: row.N,
    Industriousness: row.C, Orderliness: row.C,
    Openness: row.O, Intellect: row.O,
    // Agreeableness drives no motion, so it is pinned mid rather than varied -- varying it
    // would suggest it does something here.
    Compassion: 3, Politeness: 3,
  };
}

/**
 * Builds one TRIO per slot: identical params, identical traits, one engine each.
 *
 * Identical is the whole point -- if the rows differed in proportion or temperament the
 * comparison would be between characters, not between interpolators.
 */
function buildCast() {
  clearCast();
  const n = S.extremes ? 8 : S.count;
  const ids = S.allSpecies ? speciesIds() : Array.from({ length: n }, () => S.species);
  // "one per species, SAME traits" means one trait roll shared by every species -- that is the
  // whole comparison, temperament held constant so any difference left is the species' own
  // MOTION_RANGES. Rolling per slot instead made each species a different character and there
  // was nothing to compare. Rerolling then replaces the shared set, which is what makes the
  // button do something visible in this mode.
  shared = S.allSpecies ? randomTraits() : null;
  matrix = S.extremes && !S.allSpecies ? extremesMatrix() : null;
  ids.forEach((id, i) => addPair(id, i, ids.length));
  setViewMode(group, S.view);
  refreshRoster();
  showPose();     // the banner names which engines are on screen, so it changes with the cast
  syncEngineControls();
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
  // In matrix mode every body is IDENTICAL -- no randomise() -- because leg length dominates a
  // walk far more than temperament does, and the point here is to see what temperament alone
  // is worth. Randomised bodies would put a stilt llama next to a stumpy one and the motion
  // difference would be unreadable underneath.
  if (!S.allSpecies && !matrix) kit.randomise?.(params);
  const corner = matrix?.[slot];
  // ...except COLOUR, which is the one thing that cannot affect motion. Eight identical grey
  // owls are a correct experiment and a useless one: the roster chips all match and there is no
  // way to say which critter on screen is which row. A hue per corner fixes that and changes
  // nothing that moves.
  if (corner) {
    const hue = (slot / 8) * 360;
    params.bodyColor = `hsl(${hue.toFixed(0)}, 42%, 62%)`;
    if (kit.coatColorKey) params[kit.coatColorKey] = `hsl(${hue.toFixed(0)}, 38%, 52%)`;
  }
  const traits = corner ? traitsOf(corner) : (shared ?? randomTraits());
  // Shared ACROSS the trio, varied across slots. The three rows of one slot must differ by the
  // interpolator and nothing else, or the comparison is contaminated -- but two different slots
  // should still look like two different characters, which is what the idle seed provides.
  // Matrix mode also fixes the idle seed and the stride phase, for the same reason: they are
  // deliberate noise, and noise is exactly what you do not want while reading a comparison.
  const walkDist = matrix ? (slot / slots) * 0.4 : Math.random() * 0.4;
  const seed = matrix ? (slot + 0.5) / slots : Math.random();

  const shown = shownEngines();
  shown.forEach((engine, row) => {
    const lane = slot * (shown.length + 0.7) + row;
    addOne(kit, params, engine, traits, seed, walkDist,
      (lane - (slots * (shown.length + 0.7) - 1.7) / 2) * 0.8, corner?.label, corner?.odd);
  });
}

/** One built character in one lane, running one engine. */
function addOne(kit, params, engine, traits, seed, walkDist, z, label, odd) {
  const built = createCharacter({ ...params }, kit);
  built.root.position.set(0, 0, z);
  group.add(built.root);
  cast.push({
    built, engine, traits, lane: z, walkDist, label, odd,
    motion: makeMotion(built.params, seed),
    opts: coeffs(traits, kit, engine),
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
  [...POSE_KEYS.map((k) => [k, 0]), ['holdItem', false], ['blink', 0], ['kneeSwing', 0],
    ['neckCurve', 0]],
);

// ---------------------------------------------------------------- the pose event stream
//
// ONE source for both rows. Two independently-driven rows would be two experiments.

let target = POSES.rest;
let poseIndex = 0;
// The scripted run, as a stage machine: settle -> reach -> (cut) -> browse -> done.
// It used to be a one-shot that began by SNAPPING every character to rest in a single frame,
// which is a whole-screen flash an order of magnitude more visible than the 0.35s event it was
// setting up -- it read as the page reloading. The snap is still here, for the determinism it
// buys, but it now happens only once everyone has already ANIMATED back to rest, so it moves
// nothing and you never see it.
let runStage = 'done';
let runTimer = 0;
let markNextSample = false;   // drawn as a vertical rule on the scope
const poseTrail = [];         // the last two target names, so the banner can read "reach -> browse"

// What the banner says at each stage of a scripted cut. Without this the settle stage looks
// like the page doing something random before the thing you asked for.
const RUN_STAGES = {
  settle: 'settling back to rest \u2014 so every run starts from the same place',
  reach:  'reaching \u2026 about to be cut off partway',
  cut:    'CUT \u2014 the reach was interrupted by a browse. Which row glided, and which stopped dead?',
};
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
  // The trap this page is built around and did not warn about: the three engines interpolate the
  // COMMANDED pose, and the walk and idle layers are added AFTERWARDS, identically for all
  // three. Measured spread on armSwing between engines: 0.0000 rad while the target is held,
  // 0.0227 across one clean pose change, 0.2670 across an interrupted one. So a walking cast
  // holding a pose shows three bit-identical rows, and that reads as a broken engine switch
  // when it is the system working correctly.
  const tail = runStage !== 'done'
    ? `<span class="stage">${RUN_STAGES[runStage] ?? ''}</span>`
    : shownEngines().length > 1
      ? '<span class="hint">the rows differ ONLY across a pose change \u2014 press '
        + '<kbd>Enter</kbd> to interrupt one. Walking and fidgeting are added after the '
        + 'interpolator, the same way for every row.</span>'
      : '<span class="hint">spring \u2014 press <kbd>Enter</kbd> to interrupt a move. Switch on '
        + 'hermite or smoothstep under \u201chow motion gets from A to B\u201d to compare '
        + 'against it.</span>';
  const arrow = prev ? `${prev} \u2192 ` : '';
  poseEl.innerHTML = `<b>${arrow}${now}</b><span>${POSE_MEANS[now] ?? ''}</span>${tail}`;
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
  runStage = 'settle';
  runTimer = 0;
}

/** Everyone home and stopped, so a hard reset from here changes nothing you can see. */
function atRest() {
  return cast.every((a) => POSE_KEYS.every((k) => Math.abs(velocityOf(a.motion, k)) < 2e-3
    && Math.abs(valueOf(a.motion, k) - (POSES.rest[k] ?? 0)) < 2e-3));
}

/**
 * One frame of the scripted run.
 *
 * Deterministic and repeatable, which is the whole point: eyeballing an interrupt by clicking
 * twice fast never lands on the same frame twice, and the comparison is about that one frame.
 * Firing again from wherever the last run ended would measure nothing -- the second run would
 * start already at the target, no channel would move, and the readout would say 0.00 and look
 * like a broken instrument rather than a broken setup. Hence the settle stage.
 */
function stepRun(dt) {
  runTimer += dt;
  if (runStage === 'settle') {
    // `target` must be reset alongside the per-character state: integrate() detects a retarget
    // by object IDENTITY, so leaving it pointing at POSES.reach means the setup pose below is
    // not seen as a change at all and nothing ever starts moving.
    if (target !== POSES.rest) setTarget(POSES.rest);
    if (!atRest() && runTimer < 3) return;          // timeout: a very low stiffness may crawl
    for (const a of cast) resetMotion(a.motion, POSES.rest);
    setTarget(POSES.reach);
    runStage = 'reach';
    runTimer = 0;
  } else if (runStage === 'reach') {
    // Scaled by the move duration, so that knob changes ONLY how fast the move is and never
    // where the cut lands. The spring has no duration of its own, but all three rows run off
    // one event stream and so must share one interrupt instant.
    if (runTimer < S.interruptAt * S.opts.blend) return;
    setTarget(POSES.browse, false);
    runStage = 'cut';
    runTimer = 0;
    // Hold after the cut just long enough to see the arrival. This is SIMULATED time, so at
    // cutSlow 0.2 a 1.5s hold is seven and a half real seconds of watching nothing happen --
    // long enough that a looping cut feels broken rather than repetitive.
  } else if (runTimer > Math.max(0.6, S.opts.blend * 2)) {
    runStage = S.loopCut ? 'settle' : 'done';
    runTimer = 0;
  }
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
  a.top = topSpeed(L, a.opts);

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

  // Slowed only while a scripted run is in flight. Velocity continuity is a sub-100ms event:
  // at real time there is nothing for an eye to catch, which is why pressing the button felt
  // like it did nothing but flash. Walking speed is untouched when no run is going.
  if (runStage !== 'done') {
    // Settling is setup, not evidence: run it at real time so the loop does not spend most of
    // its wall clock watching characters stand back up.
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

// ---------------------------------------------------------------- the scope
//
// The instrument the page exists for. Velocity continuity through an interrupt is invisible on
// the characters and obvious here: smoothstep's trace drops to the axis and climbs back out.

const scopeCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scope'));
const ctx2d = scopeCanvas.getContext('2d');
const history = new Map();      // engine -> {v: number[], d: number[]}

// One palette, used by both the scope traces and the slider labels, so a colour means the same
// thing wherever it appears. Smoothstep is purple rather than grey specifically so that GREY can
// mean "applies to every engine" and never be mistaken for an engine of its own.
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

  // a vertical rule at each interrupt: the only place on the trace worth looking at
  const marks = history.get(CHOSEN)?.mark ?? [];
  ctx2d.strokeStyle = 'rgba(0,0,0,.30)';
  ctx2d.beginPath();
  marks.forEach((m, i) => { if (m) { ctx2d.moveTo(i, 0); ctx2d.lineTo(i, H); } });
  ctx2d.stroke();

  for (const engine of shownEngines()) {
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

// The four Big-5 FACTORS that drive motion, each the mean of its two assets. Showing the
// factors rather than the assets is the point: eight asset columns was more personality than
// anyone can hold while tuning, and the coefficients do not read the assets individually
// anyway. Agreeableness is left out rather than shown as a dead column -- it is the factor
// about how you treat people, and it belongs to what an NPC does, not to how their body moves.
const TRAIT_COLS = Object.freeze([
  ['E', 'Extraversion', 'Enthusiasm + Assertiveness'],
  ['N', 'Neuroticism', 'Volatility + Withdrawal'],
  ['C', 'Conscientiousness', 'Industriousness + Orderliness'],
  ['O', 'Openness/Intellect', 'Openness + Intellect'],
]);

/**
 * One row: who it is, the traits that were rolled, then the coefficients they produced.
 *
 * The swatch is that character's actual body colour, plus its coat colour where the kit has one
 * (the owl's plumage, the llama's fleece), because at a glance the coat is what you actually
 * pick a character out by. Numbers alone gave you no way to tell which row was which animal.
 */
function rosterRow(a) {
  const o = a.opts;
  const P = a.built.params;
  const coat = a.built.species.coatColorKey;
  const second = coat && P[coat] !== P.bodyColor
    ? `<span class="chip" style="background:${P[coat]}"></span>` : '';
  const swatch = `<span class="chip" style="background:${P.bodyColor}"></span>${second}`;
  const F = factors(a.traits);
  // In matrix mode the odd-one-out factor is the whole point of the row, so mark its cell --
  // eight rows of near-identical digits are unreadable otherwise.
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
  // Traits are the CAUSE and the coefficients are the effect, so they belong on every row
  // rather than only in the shared-traits banner. Reading "this one is stiffer" is useless
  // without the trait that made it so -- and with several of ONE species on screen the
  // traits are the only thing that differs between the rows at all.
  // Sorted along the lane axis so row order matches the order they physically stand in --
  // descending, which is nearest-camera first as the scene loads. Unsorted, the table was in
  // build order, which is only the same thing by accident. Orbit far enough and any convention
  // inverts, which is what the colour chip is for: the chip identifies the row, the order just
  // makes it quick to find.
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
  // Worst in the cast, not cast[0]. Skate is decided almost entirely by leg length, so with a
  // mixed-height cast one character can be sliding badly while the first one reads fine.
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

// Which engines each control actually reaches. Measured from the source, not guessed: spring()
// reads opts.stiff and opts.zeta and nothing else; hermite() and smoothstep() both read
// opts.blend and nothing else; every other knob feeds the idle or walk layers, which are
// downstream of the interpolator and identical for all three.
//
// So there are no hermite-only or smoothstep-only controls to colour, and there never will be
// while `blend` is the only thing either of them reads -- that one is shared between the two
// duration engines and belongs to neither. It gets both dots.
const tagged = [];

/**
 * Mark a control as belonging to specific engines: colour its label, and hide it outright when
 * none of its engines are on screen. Untagged controls apply to everything and stay grey.
 */
function forEngines(c, ...engines) {
  const name = c.domElement.querySelector('.name');
  if (name) {
    if (engines.length === 1) name.style.color = COLOUR[engines[0]];
    // A control shared by SOME engines but not all cannot have one honest colour, so it gets a
    // dot per engine instead of a blended one nobody could decode.
    const dots = engines.map((e) =>
      `<span class="dot" style="background:${COLOUR[e]}"></span>`).join('');
    name.insertAdjacentHTML('beforeend', ` ${dots}`);
    name.title = `${name.title}\n\nOnly affects: ${engines.join(', ')}.`;
  }
  tagged.push({ c, engines });
  return c;
}

/** Hide any control whose engines are all switched off. */
function syncEngineControls() {
  const shown = shownEngines();
  for (const { c, engines } of tagged) c.show(engines.some((e) => shown.includes(e)));
}

const fCast = gui.addFolder('cast');
knob(fCast, S, 'species', 'species', 'Which species to fill the lab with.', speciesIds())
  .onChange(buildCast);
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

// The per-species knob: drag a span and the row spreads or converges, live.
// How much ONE member of a species differs from another. Each row is a RANGE, not a value:
// personality decides where in the range a character lands, the species decides how wide the
// range is. Narrow the gap and every member moves alike; widen it and they vary.
// The only coefficients any engine reads directly: spring() takes opts.stiff and opts.zeta,
// hermite() and smoothstep() take opts.blend. Everything else feeds the idle and walk layers,
// which sit downstream of the interpolator.
const SPRING_ONLY = new Set(['stiff', 'zeta']);

const SPAN_HELP = {
  stiff: 'how eagerly they move',
  zeta: 'how much they wobble on arrival',
  idleAmp: 'how much they fidget',
  idleRate: 'how fast they fidget',
  stride: 'step length',
  bounce: 'walking bounce',
  headArc: 'how much they look around',
  // The walking STYLE spans. These arrived with the personality-in-the-walk work and had no
  // label here, so every one of them rendered as "undefined — least" / "undefined — most".
  armGain: 'how much the arms swing',
  sway: 'how far they roll side to side',
  lean: 'how far they lean into a walk',
  headCarry: 'how low they carry their head',
  armTuck: 'how much they hold their arms in',
};

const fRanges = gui.addFolder('how much members of a species differ');
fRanges.domElement.querySelector('.children')?.insertAdjacentHTML('afterbegin',
  '<div class="engine-key">Walking STYLE is deliberately not here: arm swing, sway, lean, head '
  + 'carriage and arms-held-in are the same spans for every species, so a walk reads the same '
  + 'way whatever animal is doing it. Their global knobs are under “walking”.</div>');
for (const k of Object.keys(BASE_MOTION_RANGES)) {
  const [lo, hi] = BASE_MOTION_RANGES[k];
  const pad = (hi - lo) * 1.5;
  const row = { min: S.ranges[k][0], max: S.ranges[k][1] };
  const help = `${SPAN_HELP[k]}. Narrow the gap and every member of the species moves alike; `
    + 'widen it and they vary. Where one character sits inside it is set by their personality.';
  const mn = knob(fRanges, row, 'min', `${SPAN_HELP[k]} \u2014 least`, help, lo - pad, hi + pad)
    .onChange((v) => { S.ranges[k][0] = v; retune(); });
  const mx = knob(fRanges, row, 'max', `${SPAN_HELP[k]} \u2014 most`, help, lo - pad, hi + pad)
    .onChange((v) => { S.ranges[k][1] = v; retune(); });
  // stiff and zeta are read by spring() alone, so their spans are spring-only too -- the same
  // fact as the global knobs of the same name, just applied per species.
  if (SPRING_ONLY.has(k)) { forEngines(mn, 'spring'); forEngines(mx, 'spring'); }
}
knob(fRanges, { copy: exportRanges }, 'copy', 'copy these spans as code',
  'Puts a paste-ready MOTION_RANGES block on the clipboard, for owl.js or llama.js.');
fRanges.close();

const fBake = gui.addFolder('how motion gets from A to B');
// What the colours on the labels mean. Without this the dots are decoration.
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
  'Runs the cut over and over, settling back to rest between each one, so you can watch the '
  + 'same instant as many times as you need instead of pressing the button again.');
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
knob(fWalk, S.opts, 'kneeLift', 'knee lift',
  'How much the swinging leg bends its knee to clear the floor. At 0 the legs are rigid sticks '
  + 'and BOTH feet reach the ground at the same instant twice a step — that is the stomp '
  + 'that reads as a limp, so drag it to 0 to see what this fixed. The knee only lifts the foot '
  + 'while that leg is BEHIND the hip, so very high values buckle it rather than lifting more.',
  0, 1.4).onChange(retune);
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

// The three gait LIMITS. Not style -- these say what the rig is physically willing to do, and
// they are the first things to reach for when a walk looks wrong rather than merely bland.
knob(fWalk, S.opts, 'sinMax', 'biggest believable step',
  'A ceiling on how far the legs will scissor, as a sine: 0.56 is sin(0.6 rad), about 34 '
  + 'degrees. Step length is clamped to this no matter what the stride knob asks for, so past '
  + 'it the body outruns the legs and the skate readout climbs instead of the step growing.',
  0.15, 0.85).onChange(retune);
knob(fWalk, S.opts, 'cadenceMax', 'fastest step rate',
  'Steps per second before the legs stop moving faster and start reaching further instead. Low '
  + 'values give a long striding walk, high values a quick scurry.', 0.5, 8).onChange(retune);
knob(fWalk, S.opts, 'gateSpeed', 'speed to reach a full walk',
  'How fast they must be moving before the walk is at full strength. Below it the cycle fades '
  + 'out, which is what brings the feet together when they stop. Raise it and they creep into '
  + 'and out of walking; lower it and the legs snap on the instant they move.',
  0.05, 1.5).onChange(retune);

// The two posture dials. They apply standing AND walking -- posture is carriage, not gait --
// so they sit here with the rest of the body language rather than under "standing still".
knob(fWalk, S.scale, 'headCarry', 'head carriage',
  'How high or low they hold their head. Open and confident, or down and closed — the single '
  + 'most readable posture signal there is, and completely free of leg length. Scales the whole '
  + 'cast; personality still spreads them.', 0, 2.5).onChange(retune);
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

knob(fWalk, S, 'lookOver', 'look over the shoulder',
  'Turns every head as far as ITS OWN SPECIES can manage. An owl clears about 264 degrees, a '
  + 'llama about 109 \u2014 set once in each kit as headYawMax, next to neckLength.',
  -1, 1).onChange(() => { if (S.speed === 0) showPose(); });

const fIdle = gui.addFolder('standing still');
// NOT the same knob as the "how much they fidget" span in the variation folder, and it used to
// carry the same name -- so moving this one changed the whole cast together and made the
// personality link look broken when it was simply a different control.
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
