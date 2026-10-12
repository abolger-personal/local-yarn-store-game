// Boot: build the room, then wait for the atlas, then run the frame loop.
//
// Shared by both shop pages: store.html (main.js, the playground with every debug panel) and
// game.html (game.js, the real game view). Each page hands bootShop() its own UI steps and
// repaint hooks; everything that is the SHOP rather than a panel about it lives here.
//
// This file is the WIRING and nothing else. It used to be all 3,200 lines of the shop, inline in
// store.html, which meant no breakpoints, no jump-to-definition, and eslint could not see it at
// all. Everything below is a call into a module that owns its own state.
//
// The order of the install() calls is the order those statements ran in when this was one script.
// It is load-bearing in places (the room group must exist before displays are added to it), so
// treat it as a sequence, not a list.

import { shop, cast, clocks, takeHudDirty, takeViewDirty } from './core/state.js';
import { installInput } from './interact/input.js';
import * as THREE from 'three';
import { BUILD, setGeometryDetail } from '../npc.js';
import { loadAtlas } from '../../inventory/notions.js';
// Side-effect imports: these REGISTER their species with npc.js. Nothing here references them by
// name, which is exactly why they are easy to lose — and losing them is silent until the first
// spawn, where getSpecies() returns undefined and the shop fails to open.
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

// From this module, not the page: fetch resolves against the page, and a page served below a site's
// root (GitHub Pages' /local-yarn-store-game/) walked out of the repo.
const ATLAS_URL = new URL('../../ai_planning_sessions/inventory/illustrations/build', import.meta.url).href;

console.info('LYS build', BUILD);

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

/** The self-checks, together, so a failing one names the shop state that produced it. */
function runChecks() {
  checkWallCulling();
  checkItemSizes();
  checkSlotMasking();
  checkFloorTiling();
  checkDisplayMoves();
  checkHeldItem();
  checkSunPools();
}

/**
 * Two independent clocks: one paces the ROUNDS, one closes the shop and opens tomorrow. They are
 * separate because rolling the day is useful whether the rounds are being advanced by the timer
 * or by hand — the point is not having to click through the changeover either way.
 *
 * Switched by S.autoRounds / S.autoDay, not by reading checkboxes: the game page has none, and
 * runs on the defaults (both on). Returns how far the running clock is, 0..1, for a page that
 * draws it (the playground's timer bar).
 *
 * A page with `onDayEnd` (the game) takes the changeover itself: it is called ONCE when the day
 * clock runs out, and the page opens tomorrow (restart) when it is ready — the game waits for the
 * player at the door. Without one (the playground) the clock opens tomorrow on its own.
 *
 * The rounds and the day are gated separately on purpose: the game's pause (⏸ on its speed button,
 * game.js) IS autoRounds off, which stops the rounds and leaves the day hand-over and every
 * animation alone. While paused nobody decides, buys or leaves, so the shop cannot empty and the
 * day clock cannot start either.
 *
 * With a walking speed (S.walkSpeed, the game) a round also waits for its last walker, so a long
 * walk is never cut off by the next round's retarget. The playground has none, so its round
 * interval stays exact, which is what a debugging slider has to be.
 */
let closed = false;   // onDayEnd has been called for this empty shop
function endDay(page) {
  if (!page.onDayEnd) restart();     // regulars come back; see the roster
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
    // A deliberate beat with the shop empty before the next day's queue walks in — without it the
    // changeover is a single-frame pop and it is impossible to see who left with what.
    clocks.day += dt;
    if (clocks.day >= S.dayGap) endDay(page);
    return Math.min(1, clocks.day / S.dayGap);
  }
  return 0;
}

/**
 * Repaint whatever has been marked stale.
 *
 * The mechanics and the simulation no longer call the view directly — they set a flag (see
 * state.js). That is what stops `world` importing `hud`, and `pick` importing the halo it is
 * drawing. Two flags because they cost differently: the grid and the held-item line change on
 * every hover, the NPC panel changes once a round.
 */
function repaintIfDirty(page) {
  if (takeViewDirty()) { paintActivePlane(); updateHeldReadout(); }
  // The book and the board are the in-world menus, on every page: a press on either is answered
  // here (shop.press), so they cannot live in a page's own hook.
  if (takeHudDirty()) { redrawBook(); drawBoard(); redrawLabel(); page.onHud?.(); }
}

const clock = new THREE.Timer();

function startLoop(page) {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.update().getDelta(), 0.1);
    // Accumulated here from the capped dt rather than read off the timer, so a long stall (a
    // hidden tab) cannot jump the shop forward.
    clocks.elapsed += dt;
    tickCast(dt);
    tickGlow(clocks.elapsed);
    syncFurnitureButtons();
    const progress = tickClocks(dt, page);
    tickDaylight(dt);
    repaintIfDirty(page);
    controls.update();
    cullWalls();        // after controls.update(), so it sees where the camera actually ended up
    renderer.render(scene, camera);
    page.onFrame?.(dt, progress);
  });
}

/**
 * Report a boot failure honestly.
 *
 * This used to blame the atlas for ANY error in the boot chain, because one `.catch()` covered
 * the fetch and everything after it. A dropped side-effect import made the first spawn throw
 * "Cannot read properties of undefined (reading 'randomise')" and the page said "atlas failed to
 * load" — a wrong answer is worse than no answer, so the two cases are separated now.
 */
function bootFailed(stage, err, page) {
  console.error(`LYS boot failed during ${stage}:`, err);
  const hint = stage === 'atlas'
    ? 'run illustrations/notion_processing.py first, and serve over http'
    : 'see the console for the stack — the atlas itself loaded fine';
  page.onFail?.(`<b>${stage} failed</b><br>${err.message}<br><span style="opacity:.7">${hint}</span>`);
}

/** Everything that needs the atlas, once it has arrived. */
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
 * @typedef {object} Page  what a shop page adds to the shared boot
 * @property {[string, () => void][]} steps  its UI, installed after the shop's own steps, in order
 * @property {() => void} [onHud]   repaint its panels when the sim says something happened
 * @property {(dt: number, progress: number) => void} [onFrame]  after each render; progress is the running clock, 0..1
 * @property {(html: string) => void} [onFail]  show a boot failure (the console always gets it)
 * @property {() => void} [frame]  where the camera opens (default frameRoom, close in on the middle)
 * @property {() => void} [onDayEnd]  the shop has emptied: the page opens tomorrow itself (restart)
 */

/** Build the shop with the page's UI, then open it once the atlas arrives. */
export function bootShop(/** @type {Page} */ page) {
  buildShop(page.steps);   // it reports its own broken subsystems
  loadAtlas(ATLAS_URL)
    .catch((err) => { bootFailed('atlas', err, page); throw err; })
    .then((loaded) => {
      try { openTheShop(loaded, page); } catch (err) { bootFailed('opening the shop', err, page); }
    })
    .catch(() => { /* the atlas failure is already reported */ });
}
