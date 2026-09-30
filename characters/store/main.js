// Boot: build the room, then wait for the atlas, then run the frame loop.
//
// This file is the WIRING and nothing else. It used to be all 3,200 lines of the shop, inline in
// store.html, which meant no breakpoints, no jump-to-definition, and eslint could not see it at
// all. Everything below is a call into a module that owns its own state.
//
// The order of the install() calls is the order those statements ran in when this was one script.
// It is load-bearing in places (the room group must exist before displays are added to it), so
// treat it as a sequence, not a list.

import { shop, clocks, takeHudDirty, takeViewDirty } from './core/state.js';
import { installInput } from './interact/input.js';
import * as THREE from 'three';
import { BUILD, setGeometryDetail } from '../npc.js';
import { loadAtlas } from '../../inventory/notions.js';
// Side-effect imports: these REGISTER their species with npc.js. Nothing here references them by
// name, which is exactly why they are easy to lose — and losing them is silent until the first
// spawn, where getSpecies() returns undefined and the shop fails to open.
import '../owl.js';
import '../llama.js';
import { STATE } from '../visit.js';

import { S } from './core/config.js';
import { installStage, renderer, scene, camera, controls } from './scene/stage.js';
import { buildRoomShell, cullWalls } from './scene/room.js';
import { installSeating } from './scene/seating.js';
import { installDisplays } from './scene/displays.js';
import { buildItemMeshes } from './goods/items.js';
import { buildYarnMeshes } from './goods/yarn.js';
import { installPlaceholderArt } from './goods/art.js';
import { installMove, syncFurnitureButtons } from './interact/move.js';
import { installFeedback, paintActivePlane, tickGlow, updateHeldReadout } from './interact/glow.js';
import { installWorld, restart, doAdvanceRound } from './sim/world.js';
import { tickCast } from './sim/cast.js';
import { drawDebug, drawTimer, installHud, autoBar, autoBox, autoDayBox, updatePerf } from './ui/hud.js';
import { frameRoom } from './ui/framing.js';
import { buildGui } from './ui/gui.js';
import { checkWallCulling, checkItemSizes, checkSlotMasking, checkFloorTiling, checkDisplayMoves, checkHeldItem } from './checks.js';

const ATLAS_URL = '../../ai_planning_sessions/inventory/illustrations/build';

console.info('LYS build', BUILD);

/**
 * Remember which windows are folded. The collapse itself is native <details>; this only persists
 * the choice, because a POC is reloaded constantly and re-folding four panels every time is
 * exactly the tedium the folding was meant to remove.
 *
 * Every read and write is guarded: localStorage throws outright in some contexts (a browser set
 * to block site data, a screenshot/preview harness), and a dev overlay must not be able to take
 * the whole shop down with it.
 */
function restoreFolds() {
  const folds = /** @type {NodeListOf<HTMLDetailsElement>} */
    (document.querySelectorAll('.fold'));
  for (const el of folds) {
    try {
      const saved = localStorage.getItem(`lys.fold.${el.id}`);
      if (saved !== null) el.open = saved === '1';
    } catch { /* no stored state: the markup's own default stands */ }
    el.addEventListener('toggle', () => {
      try { localStorage.setItem(`lys.fold.${el.id}`, el.open ? '1' : '0'); } catch { /* ignore */ }
    });
  }
}

/**
 * Build everything that does not need the atlas. Order is the original statement order, and it
 * is load-bearing in places (the room group must exist before displays are added to it).
 *
 * Each step is isolated. A throw in one used to take out every step AFTER it silently: when
 * installMove() hit a `#rotator` element that had been renamed, installInput() never ran, so no
 * pointer listener was ever registered and the symptom was "items don't follow the mouse" — with
 * one stack trace, at the top, blaming something else entirely. A broken step should cost its own
 * feature and say so, not the rest of the shop.
 */
function buildShop() {
  /** @type {[string, () => void][]} */
  const steps = [
    ['stage', installStage], ['room', buildRoomShell], ['seating', installSeating],
    ['displays', installDisplays], ['placeholder art', installPlaceholderArt],
    ['feedback', installFeedback], ['move mode', installMove], ['input', installInput],
    ['world', installWorld], ['hud', installHud], ['gui', buildGui],
  ];
  const broken = [];
  for (const [name, step] of steps) {
    try { step(); } catch (err) { broken.push(name); console.error(`install ${name} failed:`, err); }
  }
  console.assert(broken.length === 0, 'shop built with broken subsystems:', broken);
  return broken;
}

/** The self-checks, together, so a failing one names the shop state that produced it. */
function runChecks() {
  checkWallCulling();
  checkItemSizes();
  checkSlotMasking();
  checkFloorTiling();
  checkDisplayMoves();
  checkHeldItem();
}

/**
 * Two independent clocks: one paces the ROUNDS, one closes the shop and opens tomorrow. They are
 * separate because rolling the day is useful whether the rounds are being advanced by the timer
 * or by hand — the point is not having to click through the changeover either way.
 */
function tickClocks(dt) {
  const openForBusiness = shop.world && shop.world.npcs.some((n) => n.state !== STATE.GONE);
  if (autoBox.checked && openForBusiness) {
    clocks.auto += dt;
    autoBar.style.width = `${Math.min(100, (clocks.auto / S.autoSeconds) * 100)}%`;
    if (clocks.auto >= S.autoSeconds) doAdvanceRound();
  } else if (autoDayBox.checked && shop.world && !openForBusiness) {
    // A deliberate beat with the shop empty before the next day's queue walks in — without it the
    // changeover is a single-frame pop and it is impossible to see who left with what.
    clocks.day += dt;
    autoBar.style.width = `${Math.min(100, (clocks.day / S.dayGap) * 100)}%`;
    if (clocks.day >= S.dayGap) restart();     // regulars come back; see the roster
  } else {
    autoBar.style.width = '0%';
  }
}

/**
 * Repaint whatever has been marked stale.
 *
 * The mechanics and the simulation no longer call the view directly — they set a flag (see
 * state.js). That is what stops `world` importing `hud`, and `pick` importing the halo it is
 * drawing. Two flags because they cost differently: the grid and the held-item line change on
 * every hover, the NPC panel changes once a round.
 */
function repaintIfDirty() {
  if (takeViewDirty()) { paintActivePlane(); updateHeldReadout(); }
  if (takeHudDirty()) { drawDebug(); drawTimer(); }
}

const clock = new THREE.Clock();

function startLoop() {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    // Accumulated here rather than via clock.getElapsedTime(), which would call getDelta() a
    // second time and halve every dt the rest of the loop sees.
    clocks.elapsed += dt;
    tickCast(dt);
    tickGlow(clocks.elapsed);
    syncFurnitureButtons();
    tickClocks(dt);
    repaintIfDirty();
    controls.update();
    cullWalls();        // after controls.update(), so it sees where the camera actually ended up
    renderer.render(scene, camera);
    updatePerf(dt);
  });
}

restoreFolds();
// On the HUD as well as in the console: when a fix "does not work", the first thing worth ruling
// out is that the page is running an older module than the one on disk.
document.getElementById('build').textContent = BUILD;
buildShop();   // it reports its own broken subsystems

/**
 * Report a boot failure honestly.
 *
 * This used to blame the atlas for ANY error in the boot chain, because one `.catch()` covered
 * the fetch and everything after it. A dropped side-effect import made the first spawn throw
 * "Cannot read properties of undefined (reading 'randomise')" and the page said "atlas failed to
 * load" — a wrong answer is worse than no answer, so the two cases are separated now.
 */
function bootFailed(stage, err) {
  console.error(`LYS boot failed during ${stage}:`, err);
  const hint = stage === 'atlas'
    ? 'run illustrations/notion_processing.py first, and serve over http'
    : 'see the console for the stack — the atlas itself loaded fine';
  document.getElementById('hud').innerHTML =
    `<b>${stage} failed</b><br>${err.message}<br><span style="opacity:.7">${hint}</span>`;
}

/** Everything that needs the atlas, once it has arrived. */
function openTheShop(loaded) {
  buildItemMeshes(loaded);
  buildYarnMeshes();
  setGeometryDetail(S.detail);
  restart();
  frameRoom();
  runChecks();
  startLoop();
}

loadAtlas(ATLAS_URL)
  .catch((err) => { bootFailed('atlas', err); throw err; })
  .then((loaded) => {
    try { openTheShop(loaded); } catch (err) { bootFailed('opening the shop', err); }
  })
  .catch(() => { /* the atlas failure is already reported */ });
