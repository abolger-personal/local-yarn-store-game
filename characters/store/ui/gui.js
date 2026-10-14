import { setMoveMode } from '../interact/input.js';
import { activeDisplay } from '../interact/pointer.js';
import { displays, aim } from '../core/state.js';
import { GEO_DETAIL, TONE_MAPPING, setGeometryDetail, setViewMode } from '../../npc.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { QUALITY, S } from '../core/config.js';
import { applyRenderScale, renderer } from '../scene/stage.js';
import { SEAT_SLOTS } from '../scene/seating.js';
import { DISPLAY_SLOTS } from '../scene/displays.js';
import { paintActivePlane, glow, setPlane, updateHeldReadout } from '../interact/glow.js';
import { castGroup, doAdvanceRound, restart } from '../sim/world.js';
import { buildBlobs } from '../sim/cast.js';
import { frameRoom } from './framing.js';
import { installControls, setCameraLock } from './controls.js';

const gui = new GUI({ title: 'store', container: document.getElementById('guiSlot') });

function applyQuality(name) {
  const q = QUALITY[name] ?? QUALITY.high;
  S.quality = name;
  Object.assign(S, q);
  setGeometryDetail(q.detail);
  applyRenderScale();
  restart({ rebuild: true });
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

const counts = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), i + 1]));

const MAX_NPCS = 8;

const gPerf = gui.addFolder('performance');

const gLook = gui.addFolder('look');

function shopRows() {
  gui.add(S, 'npcCount', counts(MAX_NPCS)).name('NPCs').onChange(restart);
  gui.add(S, 'displayCount', counts(DISPLAY_SLOTS.length)).name('displays').onChange(() => restart({ rebuild: true }));
  gui.add(S, 'chairCount', { 0: 0, ...counts(SEAT_SLOTS.length) }).name('chairs').onChange(() => restart({ rebuild: true }));
  gui.add({ f: doAdvanceRound }, 'f').name('advance round  (Space)');
  gui.add({ f: () => restart() }, 'f').name('next shop.day — regulars return  (R)');
  gui.add({ f: () => restart({ keepRegulars: false }) }, 'f').name('all new customers');
  gui.add(S, 'stockCount', 2, 200, 1).name('total inventory').onChange(() => restart({ rebuild: true }));
  gui.add(S, 'seedWants').name('seed customer wants daily (test)');
  gui.add(S, 'autoSeconds', 1, 60, 0.5).name('round interval (s)');
  gui.add(S, 'dayGap', 0, 20, 0.5).name('pause between days (s)');
}

function pacingRows() {
  gui.add(S, 'travel', 0.2, 4, 0.1).name('travel anim (s)');
  gui.add(S, 'travelJitter', 0, 2, 0.05).name('start stagger (s)');
  gui.add(S, 'paceJitter', 0, 0.6, 0.05).name('pace variation (±)');
  gui.add(S, 'seatLift', 0, 0.06, 0.002).name('sink into cushion');
}

function perfRows() {
  gPerf.add(S, 'quality', Object.keys(QUALITY)).name('graphics quality').onChange(applyQuality);
  gPerf.add(S, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail')
    .onChange((v) => { setGeometryDetail(v); restart({ rebuild: true }); });
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
  gLook.add(S, 'followDay').name('light follows the day');
  gLook.add(S, 'timeOfDay', 0, 1, 0.01).name('time of day (morning → afternoon)')
    .onChange(() => { S.followDay = false; gui.controllersRecursive().forEach((c) => c.updateDisplay()); });
  gLook.add(S, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  gLook.add(S, 'toneMapping', ['AgX', 'ACES', 'None'])
    .onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));
}

function cameraRows() {
  gui.add({ f: () => frameRoom() }, 'f').name('frame room  (F)');
  gui.add(S, 'lockCamera').name('lock camera  (L)').onChange(setCameraLock);
}

function cycleDisplay() {
  const arrangeable = displays.filter((d) => d.solid !== false);
  if (!arrangeable.length) return;
  const i = arrangeable.findIndex((d) => d.id === aim.active);
  aim.active = arrangeable[(i + 1) % arrangeable.length].id;
  paintActivePlane();
  updateHeldReadout();
}

const KEYS = {
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  r: () => restart(),
  g: () => { S.showGrid = !S.showGrid; paintActivePlane(); },
  '[': () => setPlane(activeDisplay().plane - 1),
  ']': () => setPlane(activeDisplay().plane + 1),
  tab: cycleDisplay,
  b: () => renderer.domElement.classList.toggle('squint'),
  ' ': doAdvanceRound,
};

function setView(v) { S.view = v; setViewMode(castGroup, v); }

export function buildGui() {
  shopRows();
  pacingRows();
  perfRows();
  lookRows();
  cameraRows();
  installControls(KEYS, () => gui.controllersRecursive().forEach((c) => c.updateDisplay()));
}
