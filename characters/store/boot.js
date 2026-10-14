import { shop, cast, clocks, takeHudDirty, takeViewDirty } from './core/state.js';
import { installInput } from './interact/input.js';
import * as THREE from 'three';
import { BUILD, setGeometryDetail } from '../npc.js';
import { loadAtlas } from '../../inventory/notions.js';
import '../owl.js';
import '../llama.js';
import '../lion.js';
import { STATE } from '../visit.js';

import { S } from './core/config.js';
import { installStage, renderer, scene, camera, controls, tickDaylight } from './scene/stage.js';
import { buildRoomShell, cullWalls } from './scene/room.js';
import { installSeating } from './scene/seating.js';
import { installProps } from './scene/props.js';
import { installDisplays } from './scene/displays.js';
import { buildItemMeshes } from './goods/items.js';
import { buildYarnMeshes } from './goods/yarn.js';
import { installPlaceholderArt } from './goods/art.js';
import { installMove, syncFurnitureButtons } from './interact/move.js';
import { installFeedback, paintActivePlane, tickGlow, updateHeldReadout } from './interact/glow.js';
import { installWorld, restart, doAdvanceRound } from './sim/world.js';
import { tickCast } from './sim/cast.js';
import { installBook, redrawBook } from './ui/book.js';
import { installBoard, drawBoard } from './ui/board.js';
import { installLabel, redrawLabel } from './ui/label.js';
import { frameRoom } from './ui/framing.js';
import { checkWallCulling, checkItemSizes, checkSlotMasking, checkFloorTiling, checkDisplayMoves, checkHeldItem, checkSunPools } from './checks.js';

// Relative to this module, not the page, so a site served below its root (GitHub Pages) still finds it.
const ATLAS_URL = new URL('../../ai_planning_sessions/inventory/illustrations/build', import.meta.url).href;

console.info('LYS build', BUILD);

function buildShop(pageSteps) {
  /** @type {[string, () => void][]} */
  const steps = [
    ['stage', installStage], ['room', buildRoomShell], ['props', installProps], ['seating', installSeating],
    ['displays', installDisplays], ['placeholder art', installPlaceholderArt],
    ['feedback', installFeedback], ['move mode', installMove], ['input', installInput],
    ['world', installWorld], ['book', installBook], ['board', installBoard], ['label', installLabel],
    ...pageSteps,
  ];
  const broken = [];
  for (const [name, step] of steps) {
    try { step(); } catch (err) { broken.push(name); console.error(`install ${name} failed:`, err); }
  }
  console.assert(broken.length === 0, 'shop built with broken subsystems:', broken);
  return broken;
}

function runChecks() {
  checkWallCulling();
  checkItemSizes();
  checkSlotMasking();
  checkFloorTiling();
  checkDisplayMoves();
  checkHeldItem();
  checkSunPools();
}

let closed = false;
function endDay(page) {
  if (!page.onDayEnd) restart();
  else if (!closed) { closed = true; page.onDayEnd(); }
}
function tickClocks(dt, page) {
  const openForBusiness = shop.world && shop.world.npcs.some((n) => n.state !== STATE.GONE);
  if (openForBusiness) closed = false;
  if (S.autoRounds && openForBusiness) {
    clocks.auto += dt;
    const walking = S.walkSpeed > 0 && cast.some((rec) => rec.moveT < 1);
    if (clocks.auto >= S.autoSeconds && !walking) doAdvanceRound();
    return Math.min(1, clocks.auto / S.autoSeconds);
  }
  if (S.autoDay && shop.world && !openForBusiness) {
    clocks.day += dt;
    if (clocks.day >= S.dayGap) endDay(page);
    return Math.min(1, clocks.day / S.dayGap);
  }
  return 0;
}

function repaintIfDirty(page) {
  if (takeViewDirty()) { paintActivePlane(); updateHeldReadout(); }
  if (takeHudDirty()) { redrawBook(); drawBoard(); redrawLabel(); page.onHud?.(); }
}

const clock = new THREE.Timer();

function startLoop(page) {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.update().getDelta(), 0.1);
    clocks.elapsed += dt;
    tickCast(dt);
    tickGlow(clocks.elapsed);
    syncFurnitureButtons();
    const progress = tickClocks(dt, page);
    tickDaylight(dt);
    repaintIfDirty(page);
    controls.update();
    cullWalls();
    renderer.render(scene, camera);
    page.onFrame?.(dt, progress);
  });
}

function bootFailed(stage, err, page) {
  console.error(`LYS boot failed during ${stage}:`, err);
  const hint = stage === 'atlas'
    ? 'run illustrations/notion_processing.py first, and serve over http'
    : 'see the console for the stack — the atlas itself loaded fine';
  page.onFail?.(`<b>${stage} failed</b><br>${err.message}<br><span style="opacity:.7">${hint}</span>`);
}

function openTheShop(loaded, page) {
  buildItemMeshes(loaded);
  buildYarnMeshes();
  setGeometryDetail(S.detail);
  restart();
  (page.frame ?? frameRoom)();
  runChecks();
  startLoop(page);
}

/**
 * @typedef {object} Page
 * @property {[string, () => void][]} steps  page UI steps, installed after the shop's own
 * @property {() => void} [onHud]
 * @property {(dt: number, progress: number) => void} [onFrame]  progress is the running clock, 0..1
 * @property {(html: string) => void} [onFail]
 * @property {() => void} [frame]  opening camera; default frameRoom
 * @property {() => void} [onDayEnd]  page opens tomorrow itself (restart)
 */

export function bootShop(/** @type {Page} */ page) {
  buildShop(page.steps);
  loadAtlas(ATLAS_URL)
    .catch((err) => { bootFailed('atlas', err, page); throw err; })
    .then((loaded) => {
      try { openTheShop(loaded, page); } catch (err) { bootFailed('opening the shop', err, page); }
    })
    .catch(() => {});
}
