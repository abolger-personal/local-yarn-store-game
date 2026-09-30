// The lil-gui control panel.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { setMoveMode } from '../interact/input.js';
import { activeDisplay } from '../interact/pointer.js';
import { displays, aim } from '../core/state.js';
import { GEO_DETAIL, TONE_MAPPING, setGeometryDetail, setViewMode } from '../../npc.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { QUALITY, S } from '../core/config.js';
import { applyRenderScale, camera, controls, renderer } from '../scene/stage.js';
import { SEAT_SLOTS } from '../scene/seating.js';
import { DISPLAY_SLOTS } from '../scene/displays.js';
import { YAW_STEP, rotateMovable } from '../interact/move.js';
import { paintActivePlane, glow, setPlane, updateHeldReadout } from '../interact/glow.js';
import { castGroup, doAdvanceRound, restart } from '../sim/world.js';
import { buildBlobs } from '../sim/cast.js';
import { frameRoom } from './framing.js';

// ---------------------------------------------------------------- gui

// Into the rail, not auto-placed. lil-gui's default is fixed to the top-right corner, which is
// exactly where the timer is — it was sitting on top of the controls it shares a corner with.
const gui = new GUI({ title: 'store', container: document.getElementById('guiSlot') });

function applyQuality(name) {
  const q = QUALITY[name] ?? QUALITY.high;
  S.quality = name;
  Object.assign(S, q);
  setGeometryDetail(q.detail);
  applyRenderScale();
  restart();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// Counts are dropdowns, not sliders: each value is an authored layout from a fixed pool, so the
// legal values are discrete and the list makes that obvious.
const counts = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), i + 1]));

// Capped on what the scene can carry, not on how many names exist — the name list is now deep
// enough to serve a roster across many days and would otherwise offer a 110-entry dropdown.
const MAX_NPCS = 8;

const gPerf = gui.addFolder('performance');

const gLook = gui.addFolder('look');

/**
 * Lock the camera. On a tablet the shop is easy to knock askew while reaching for a box — every
 * stray drag on empty floor is an orbit — and a locked view makes arranging safe. It disables
 * OrbitControls outright rather than only rotation, because a pinch that dollies the view mid-drag
 * is the same problem in a different axis.
 *
 * The player's verb is untouched: picking up and placing never went through the camera.
 */
const lockBtn = document.getElementById('lockBtn');

function setCameraLock(on) {
  S.lockCamera = on;
  controls.enabled = !on;
  lockBtn.setAttribute('aria-pressed', String(on));
  lockBtn.textContent = on ? '🔒' : '🔓';
  lockBtn.title = on ? 'unlock the camera' : 'lock the camera';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

/** The shop itself: how much of everything, and how fast a round runs. */
function shopRows() {
  gui.add(S, 'npcCount', counts(MAX_NPCS)).name('NPCs').onChange(restart);
  gui.add(S, 'displayCount', counts(DISPLAY_SLOTS.length)).name('displays').onChange(restart);
  // 0 chairs is a legitimate case to test, not a mistake: it exercises the "went looking for a
  // seat, all taken" fallback, which is otherwise hard to reach.
  gui.add(S, 'chairCount', { 0: 0, ...counts(SEAT_SLOTS.length) }).name('chairs').onChange(restart);
  gui.add({ f: doAdvanceRound }, 'f').name('advance round  (Space)');
  gui.add({ f: () => restart() }, 'f').name('next shop.day — regulars return  (R)');
  gui.add({ f: () => restart({ keepRegulars: false }) }, 'f').name('all new customers');
  gui.add(S, 'stockCount', 2, 120, 1).name('total inventory').onChange(restart);
  gui.add(S, 'autoSeconds', 1, 60, 0.5).name('round interval (s)');
  gui.add(S, 'dayGap', 0, 20, 0.5).name('pause between days (s)');
}

/** How the cast moves. */
function pacingRows() {
  gui.add(S, 'travel', 0.2, 4, 0.1).name('travel anim (s)');
  gui.add(S, 'travelJitter', 0, 2, 0.05).name('start stagger (s)');
  gui.add(S, 'paceJitter', 0, 0.6, 0.05).name('pace variation (±)');
  // No onChange: the seat height is read live every frame by groundOffsetFor, so the slider
  // moves everyone already seated without a re-seat pass.
  gui.add(S, 'seatLift', 0, 0.06, 0.002).name('sink into cushion');
}

function perfRows() {
  gPerf.add(S, 'quality', Object.keys(QUALITY)).name('graphics quality').onChange(applyQuality);
  gPerf.add(S, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail')
    .onChange((v) => { setGeometryDetail(v); restart(); });
  gPerf.add(S, 'renderScale', 0.5, 3, 0.25).name('render scale (GPU load)')
    .onFinishChange(applyRenderScale);
  gPerf.add(S, 'partShadows').name('characters cast shadow').onChange(restart);
  gPerf.add(S, 'mergeMeshes').name('merge static meshes').onChange(restart);
  gPerf.add(S, 'blobShadows').name('blob shadows (1 draw)').onChange(buildBlobs);
  gPerf.add(S, 'shadows').name('shadow map').onChange((v) => { renderer.shadowMap.enabled = v; });
}

function lookRows() {
  gLook.add(S, 'view', ['felted', 'grey', 'silhouette']).onChange((v) => setViewMode(castGroup, v));
  gLook.add(S, 'showGrid').name('grid lines  (G)').onChange(paintActivePlane);
  gLook.add(S, 'grabRadius', 0, 90, 2).name('grab slack (px, touch)');
  gLook.add(S, 'liftHeight', 0, 0.8, 0.02).name('held item lift');
  gLook.add(S, 'snapCells', 0, 4, 0.1).name('drop snap (slots)');
  gui.add(S, 'moveMode').name('move displays  (M)').onChange(setMoveMode);
  gLook.addColor(S, 'glowColor').name('held glow').onChange((v) => glow.material.color.set(v));
  gLook.add(S, 'glowSpeed', 0.2, 2.5, 0.1).name('glow pulse (Hz)');
  gLook.add(S, 'glowPad', 0.005, 0.15, 0.005).name('glow thickness');
  gLook.add(S, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  gLook.add(S, 'toneMapping', ['AgX', 'ACES', 'None'])
    .onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));
}

function cameraRows() {
  gui.add({ f: () => frameRoom() }, 'f').name('frame room  (F)');
  gui.add(S, 'lockCamera').name('lock camera  (L)').onChange(setCameraLock);
  // The same call as the key and the GUI row, so the three can never drift apart.
  // Wrapped, not passed by reference: frameRoom takes a place to stand in front of, and an
  // event listener would hand it the MouseEvent — which has an `x` but no `z`, so the camera
  // would be positioned at NaN and the shop would vanish.
  document.getElementById('frameBtn').addEventListener('click', () => frameRoom());
  lockBtn.addEventListener('click', () => setCameraLock(!S.lockCamera));
}

/** Cycle which display the player is arranging — for the ones the pointer struggles to hit.
 *  Floor tiles are skipped: they are the easiest thing in the room to point AT, and there are
 *  dozens of them, so including them would turn one keypress into forty. */
function cycleDisplay() {
  const arrangeable = displays.filter((d) => d.solid !== false);
  if (!arrangeable.length) return;
  const i = arrangeable.findIndex((d) => d.id === aim.active);
  aim.active = arrangeable[(i + 1) % arrangeable.length].id;
  paintActivePlane();
  updateHeldReadout();
}

/**
 * Every shortcut, as a table.
 *
 * A table rather than a run of ifs because the set is the thing worth reading: this is the only
 * place that answers "what does B do", and a reader should not have to trace a branch to find out.
 * Keys are lower-cased `e.key`, so `[` and `]` sit here alongside the letters.
 */
const KEYS = {
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  r: () => restart(),
  f: () => frameRoom(),
  g: () => { S.showGrid = !S.showGrid; paintActivePlane(); },
  m: () => setMoveMode(!S.moveMode),
  l: () => setCameraLock(!S.lockCamera),
  q: () => S.moveMode && rotateMovable(-YAW_STEP),
  e: () => S.moveMode && rotateMovable(YAW_STEP),
  '[': () => setPlane(activeDisplay().plane - 1),
  ']': () => setPlane(activeDisplay().plane + 1),
  tab: cycleDisplay,
  b: () => renderer.domElement.classList.toggle('squint'),
  ' ': doAdvanceRound,
};
// Keys whose browser default would fight the shortcut: Tab moves focus, Space scrolls.
const SWALLOW = new Set(['tab', ' ']);

function setView(v) { S.view = v; setViewMode(castGroup, v); }

/** Typing in a panel field is typing, not a shortcut. */
const isTyping = (t) => t instanceof HTMLElement
  && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName));

function onKeyDown(e) {
  if (isTyping(e.target)) return;
  const k = e.key.toLowerCase();
  const action = KEYS[k];
  if (!action) return;
  if (SWALLOW.has(k)) e.preventDefault();
  action();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function buildGui() {
  shopRows();
  pacingRows();
  perfRows();
  lookRows();
  cameraRows();
  addEventListener('keydown', onKeyDown, true);
  addEventListener('resize', onResize);
}
