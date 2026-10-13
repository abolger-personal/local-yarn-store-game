import { abortDrag } from '../interact/pick.js';
import { rnd } from '../core/util.js';
import { clearSelection } from '../interact/move.js';
import { cast, seats, props, displays, items, touchHud, shop, clocks } from '../core/state.js';
import { makeStockNotion, makeStockPattern, makeStockYarn, stockPatternFor, yarnWeight } from '../../../inventory/catalog.js';
import {
  NAMES,
  POSES,
  applyPose,
  getSpecies,
  pick,
  setViewMode,
  speciesIds,
  MOTION_DEFAULTS,
  motionOf,
} from '../../npc.js';
import { ACTION, STATE, advanceRound, dayProgress, makeNpc, makeWorld, rejoin, tidyShop } from '../../visit.js';
import { WEAR_SLOT_FOR, WIP_STATE, satisfies, wantsOf } from '../../wip.js';
import * as THREE from 'three';
import { S, SHOP_GAIT } from '../core/config.js';
import { camera, scene } from '../scene/stage.js';
import { COUNTER, HALF_D, HALF_W, WINDOW_SPOTS } from '../scene/room.js';
import { buildChairs } from '../scene/seating.js';
import { buildDisplays } from '../scene/displays.js';
import { CAPACITY, boxes, edgeTop, fieldTop, shadows, sideEdge, sideField, sizeSide, sizeTop } from '../goods/items.js';
import { refreshAll } from '../goods/paint.js';
import { addItem } from '../goods/stock.js';
import { TUTORIAL_DAYS, buildOrder, carryOver, resolveOrder, tutorialDay1 } from '../../../inventory/supply.js';
import { STAND_TIME, buildBlobs, checkOutfit, colourOf, disposeRecord, dressedCharacter, measureSeatDrop, outfitOf, rollCheer,
  routeLength } from './cast.js';
import { lentPiece } from '../../garments.js';

let nextNpcId = 0;

let roster = [];

export const room = {
  door:      { x: 0, z: HALF_D - 0.35 },
  outside:   { x: 0, z: HALF_D + 1.4 },
  queueAt:   { x: 0, z: HALF_D + 0.8 },
  guestbook: { x: -3.0, z: 1.55 },
  windows:   WINDOW_SPOTS,
  personalSpace: 0.62,
  doorClearance: 0.8,
  get solids() { return [{ x: COUNTER.x, z: COUNTER.z, w: COUNTER.w, d: COUNTER.d }, ...props]; },
  bounds: { minX: -HALF_W + 0.6, maxX: HALF_W - 0.6, minZ: -HALF_D + 1.4, maxZ: HALF_D - 0.9 },
};

export const castGroup = new THREE.Group();
export const lentGroup = new THREE.Group();

// DISPLAYS.md §Stock
function randomStock() {
  const roll = Math.random();
  if (roll < 0.55) return makeStockYarn();
  if (roll < 0.75) return makeStockPattern();
  return makeStockNotion();
}

function stockSpots() {
  const tiles = displays.filter((d) => d.solid === false);
  const spots = displays.filter((d) => d.solid !== false).map((d) => [d]);
  if (tiles.length) spots.push(tiles);
  return spots;
}

function fillStock(n) {
  if (n <= 0 || !displays.length) return 0;
  let placed = 0, tries = 0;
  const spots = stockSpots();
  for (let i = 0; placed < n && tries < n * 8; i++, tries++) {
    const d = pick(spots[i % spots.length]);
    if (d.kind === 'shelf') {
      if (addItem(d, rnd(d.g.shelves), randomStock()) >= 0) placed++;
      continue;
    }
    const tall = Math.min(n - placed, 1 + rnd(3));
    let top = { c: rnd(d.g.cols), r: rnd(d.g.rows) };
    for (let k = 0; k < tall; k++) {
      const index = addItem(d, 0, randomStock(), k ? { over: top } : top);
      if (index >= 0) { placed++; top = items[index]; }
    }
  }
  return placed;
}

function placeFrom(spots, start, spec, where) {
  for (let k = 0; k < spots.length; k++) {
    const group = spots[(start + k) % spots.length], from = rnd(group.length);
    for (let j = 0; j < group.length; j++) {
      const display = group[(from + j) % group.length];
      const index = addItem(display, 0, spec, where);
      if (index >= 0) return { index, display };
    }
  }
  return { index: -1, display: null };
}

function seedOne(npc, i, unseeded) {
  const wants = wantsOf(npc);
  const spots = stockSpots();
  let placed = 0;
  wants.forEach((want, k) => {
    const spec = specFor(want);
    console.assert(satisfies(spec, want), 'seeded item does not satisfy its own want', spec, want);
    if (placeFrom(spots, i + k, spec, { avoidWall: true }).index >= 0) placed++;
    else unseeded.push(`${npc.name} wants ${want.kind} (no room anywhere)`);
  });
  return { wants, placed };
}

function buryOne(npc, i, want, unburied) {
  const spec = specFor(want);
  const spots = stockSpots();
  const { index: buried, display: hidden } = placeFrom(spots, i + 1, spec,
    { avoidWall: true, reserve: 1, ...(spec.w ? {} : { shape: [1, 1] }) });
  if (buried < 0) return 0;
  const it = items[buried];
  const lid = addItem(hidden, 0, makeStockNotion(Math.random, 'darning-needle'),
                      { c: it.c, r: it.r, shape: [it.w, it.h] });
  if (lid < 0) unburied.push(`${npc.name}'s ${want.kind} landed on ${hidden.id} with no lid`);
  return 1 + (lid >= 0 ? 1 : 0);
}

function seedWants(npcs) {
  const unseeded = [];
  let placedCount = 0;
  npcs.forEach((npc, i) => {
    const { wants, placed } = seedOne(npc, i, unseeded);
    placedCount += placed;
    const buried = wants.reduce((n, want) => n || buryOne(npc, i, want, unseeded), 0);
    if (wants.length && !buried) console.info(`${npc.name}: nothing they want fits under a lid; none buried`);
    placedCount += buried;
  });
  console.assert(unseeded.length === 0, 'want seeding failed:', unseeded);
  return placedCount;
}

function specFor(want) {
  if (want.kind === 'pattern') {
    return want.forYarn ? stockPatternFor(want.forYarn) : makeStockPattern();
  }
  if (want.kind === 'yarn') {
    const y = makeStockYarn();
    y.weight = want.weight;
    y.w = y.h = yarnWeight(want.weight).size;
    y.material = pick(want.materials);
    return y;
  }
  return { name: want.tool, size: want.size };
}

const usedNames = new Set();

function claimName() {
  const free = NAMES.filter((n) => !usedNames.has(n));
  let name = free.length ? pick(free) : null;
  for (let k = 2; !name; k++) {
    const candidate = `${NAMES[usedNames.size % NAMES.length]} ${k}`;
    if (!usedNames.has(candidate)) name = candidate;
  }
  usedNames.add(name);
  return name;
}

export const bodyParams = (kit, saved, quality) => ({
  ...(saved ?? kit.randomise(structuredClone(kit.defaults))),
  partShadows: quality.partShadows,
  mergeMeshes: quality.mergeMeshes,
});

function buildBody(speciesId, saved, outfit) {
  const kit = getSpecies(speciesId);
  if (!kit) throw new Error(`no species kit for "${speciesId}" — is owl.js/llama.js/lion.js imported?`);
  const P = bodyParams(kit, saved, S);
  return { kit, P, built: dressedCharacter(P, kit, outfit) };
}

function buildMind(returning, kit) {
  const npc = returning ? rejoin(returning) : makeNpc({
    id: `npc-${nextNpcId++}`,
    name: claimName(),
    species: kit.label,
    target: null,
  });
  npc.speciesId = kit.id;
  npc.target = wantsOf(npc)[0] ?? null;
  return npc;
}

function queueOutside(npc, i) {
  npc.x = room.queueAt.x;
  npc.z = room.queueAt.z + i * 0.7;
  npc.from = { x: npc.x, z: npc.z };
  npc.facing = Math.atan2(room.door.x - npc.x, room.door.z - npc.z);
}

const finished = (type) => {
  const pattern = makeStockPattern(Math.random, type);
  return { id: type, state: WIP_STATE.FINISHED, progress: 100, pattern, tool: null, notions: [],
    yarn: Array.from({ length: pattern.minColors }, () => makeStockYarn()) };
};

function formerOwner() {
  const speciesId = pick(speciesIds());
  return Object.assign(makeNpc({ id: `npc-${nextNpcId++}`, name: claimName(), species: getSpecies(speciesId).label }), {
    speciesId, wips: [], farewell: "Shop's all yours! Make some fun stuff!",
    worn: Object.fromEntries(Object.entries(WEAR_SLOT_FOR).map(([type, slot]) => [slot, finished(type)])),
    carries: Array.from({ length: 3 + rnd(3) }, () => finished('potholder')),
  });
}

const signingOut = (npc) => Object.assign(npc, { state: STATE.CLOSEOUT, maxRounds: 0, ...room.guestbook,
  from: { ...room.guestbook }, facing: Math.atan2(room.door.x - room.guestbook.x, room.door.z - room.guestbook.z) });

const castRecord = (npc, built, color) => ({
  npc, built, color,
  moveT: 1, travelled: 0, fromX: npc.x, fromZ: npc.z,
  baseX: npc.x, baseZ: npc.z, faceTo: npc.facing ?? 0, heading: npc.facing ?? 0, seatRef: null, seatCal: false,
  wait: 0, dur: S.travel, pace: 1, go: 1,
  carriedName: null, carriedMesh: null,
  outfit: {}, outfitKey: '{}', redress: false, craft: null, craftFor: null, craftWip: null, sparkle: null, boughtN: 0, ready: null,
  celebrate: 0, cheerIn: 0, cheer: rollCheer(), hop: 0, route: [{ x: npc.x, z: npc.z }, { x: npc.x, z: npc.z }],
  opts: { ...MOTION_DEFAULTS, ...motionOf(npc.traits, built.species?.motionRanges), ...SHOP_GAIT },
  phase: Math.random(),
  moved: 0,
  speed: 0,
});

function spawnOne(returning, i, place = queueOutside) {
  const outfit = returning ? outfitOf(returning) : {};
  const { kit, P, built } = buildBody(returning ? returning.speciesId : pick(speciesIds()),
                                      returning?.body, outfit);
  const npc = buildMind(returning, kit);
  npc.body = P;
  place(npc, i);
  built.root.position.set(npc.x, 0, npc.z);
  castGroup.add(built.root);
  built.seatDrop = measureSeatDrop(built);
  applyPose(built, POSES.rest);
  cast.push({ ...castRecord(npc, built, P.bodyColor), outfit, outfitKey: JSON.stringify(outfit) });
  return npc;
}

function spawnCast(count = S.npcCount, handover = false) {
  for (const rec of cast) disposeRecord(rec);
  cast.length = 0;
  const coming = roster.slice(0, count);
  const npcs = Array.from({ length: count }, (_, i) => spawnOne(coming[i] ?? null, i));
  if (handover) npcs.push(spawnOne(formerOwner(), count, signingOut));
  setViewMode(castGroup, S.view);
  return npcs;
}

function stockTheShop(npcs) {
  const seeded = seedWants(npcs);
  const filled = fillStock(S.stockCount - seeded);
  const short = items.length < S.stockCount ? ` (asked for ${S.stockCount}; the shop had no room for more)` : '';
  console.info(`stock: ${items.length} boxes — ${seeded} seeded for customers, ${filled} general${short}`);
}

function deliver(order = buildOrder(shop.day, { occupancy: items.length / CAPACITY }), goods = resolveOrder(order)) {
  const floor = [displays.filter((d) => d.solid === false)];
  let landed = 0;
  for (const spec of goods) if (placeFrom(floor, 0, spec).index >= 0) landed++;
  const short = goods.length - landed;
  const line = `delivery: ${landed} boxes${short ? ` — ${short} did not fit on the floor` : ''}`;
  console.info(`day ${shop.day} ${line}`);
  return line;
}

export function planTomorrow() {
  const kept = items.filter((it) => !it.gone).length;
  return buildOrder(shop.day + 1, { occupancy: kept / CAPACITY });
}

export function sizeInstanceBuffers() {
  for (const m of [fieldTop, edgeTop, shadows, boxes, sizeTop]) m.count = items.length;
  for (const m of [sideField, sideEdge, sizeSide]) m.count = items.length * 4;
}

function fileGuestbook(keepRegulars) {
  if (!keepRegulars) { shop.pastBooks.length = 0; return; }
  if (!shop.world?.guestbook.length) return;
  for (const g of shop.world.guestbook) {
    const npc = shop.world.npcs.find((n) => n.id === g.npcId);
    if (g.kind === 'photo' && npc) g.who = { body: npc.body, speciesId: npc.speciesId, worn: { ...npc.worn }, carries: npc.carries };
  }
  shop.pastBooks.push({ day: shop.day, entries: shop.world.guestbook });
}

function setUpShop(fresh) {
  clearSelection();
  abortDrag();
  if (!fresh) { carryOver(items, displays); return; }
  buildChairs(S.chairCount);
  buildDisplays(S.displayCount);
  items.length = 0;
}

const TUTORIAL_HOLD = 90;   // TUTORIAL.md day 3: one beginner round (>= 100/9 %) from done
function liftHolds(npcs) {
  for (const w of npcs.flatMap((n) => n.wips).filter((x) => x.holdAt != null)) {
    w.progress = Math.max(w.progress, w.holdAt);
    delete w.holdAt;
  }
}

function openTutorial(npc, pattern) {
  npc.prefs.skill = 1;
  npc.patience = 'friend';   // SCRIPTED-EVENTS.md: the friend role
  // TUTORIAL.md §4, the tutorial friend
  Object.assign(npc.traits, { Assertiveness: 5, Orderliness: 3, Volatility: 1 });
  npc.wips = [{ ...npc.wips[0], pattern: null, yarn: [], tool: null, notions: [], holdAt: TUTORIAL_HOLD }];
  npc.target = wantsOf(npc)[0] ?? null;
  const near = (d) => Math.hypot(d.x - room.door.x, d.z - room.door.z);
  const tables = displays.filter((d) => d.form === 'table').sort((a, b) => near(a) - near(b));
  const { index } = placeFrom([...tables.map((d) => [d]), ...stockSpots()], 0, pattern, { avoidWall: true });
  console.assert(index >= 0, 'tutorial: the pot holder pattern found no room');
}

function castAndStock(fresh, order) {
  const tutorial = S.tutorial && fresh && shop.day === 1 ? tutorialDay1() : null;
  const npcs = spawnCast(tutorial ? 1 : S.npcCount, Boolean(tutorial));
  if (tutorial) openTutorial(npcs[0], tutorial.table);
  else if (fresh) stockTheShop(npcs);
  else if (S.seedWants) seedWants(npcs);
  if (shop.day >= TUTORIAL_DAYS) liftHolds(npcs);
  return { npcs, delivered: deliver(order, tutorial?.floor) };
}

/**
 * @param {{ keepRegulars?: boolean, rebuild?: boolean, order?: ReturnType<typeof buildOrder> }} [opts]
 */
export function restart({ keepRegulars = true, rebuild = false, order } = {}) {
  fileGuestbook(keepRegulars);
  shop.day = keepRegulars ? shop.day + 1 : 1;
  Object.assign(clocks, { day: 0, auto: S.autoSeconds });
  const fresh = rebuild || !keepRegulars || !displays.length;
  setUpShop(fresh);
  if (!keepRegulars) roster = [];
  const { npcs, delivered } = castAndStock(fresh, order);
  const { lent = [], backPile = [] } = keepRegulars ? shop.world ?? {} : {};
  shop.world = makeWorld({ displays, items, room, seats });
  Object.assign(shop.world, { npcs, lent, backPile });
  showLent();
  shop.world.log.push(`r0 ${delivered}`);
  shop.dayT = 0;
  sizeInstanceBuffers();
  refreshAll();
  buildBlobs();
  touchHud();
}

function retarget(rec, slot = 0, total = 1) {
  const n = rec.npc;
  rec.moveT = n.action?.type === ACTION.WORK_ON_WIP ? 1 : 0;
  rec.fromX = rec.baseX;
  rec.fromZ = rec.baseZ;
  rec.route = [{ x: rec.fromX, z: rec.fromZ },
               ...(n.path ?? []).slice(0, -1).map((p) => ({ x: p.x, z: p.z })),
               { x: n.x, z: n.z }];
  rec.travelled = routeLength(rec.route);
  rec.wait = n.action?.type === ACTION.ENTER ? 0 : ((slot + Math.random()) / Math.max(1, total)) * S.travelJitter
    + (rec.seatRef ? STAND_TIME : 0);
  rec.pace = 1 + (Math.random() * 2 - 1) * S.paceJitter;
  rec.dur = Math.max(S.travel * rec.pace, 0.05);
}

function collectRegulars() {
  for (const npc of shop.world.returning) {
    if (!roster.some((r) => r.id === npc.id)) roster.push(npc);
  }
}

export function doAdvanceRound() {
  if (!shop.world?.npcs.some((n) => n.state !== STATE.GONE)) return;
  markInView(shop.world.npcs);
  advanceRound(shop.world);
  shop.dayT = Math.max(shop.dayT, dayProgress(shop.world));
  collectRegulars();
  showLent();
  for (const rec of cast) checkOutfit(rec);
  clocks.auto = 0;
  const order = cast.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  order.forEach((castIndex, slot) => retarget(cast[castIndex], slot, cast.length));
  refreshAll();
  touchHud();
}

// TUTORIAL.md §7.3 "witnessed"
// ponytail: sampled once a round, at the round's start, and WITNESS_DIST is the knob for "close".
const WITNESS_DIST = 12;
const _eye = new THREE.Vector3();
function markInView(npcs) {
  for (const n of npcs) {
    _eye.set(n.x, 0.6, n.z);
    const d = _eye.distanceTo(camera.position);
    _eye.project(camera);
    n.inView = shop.watched.has(n.id) || (d < WITNESS_DIST && Math.abs(_eye.x) <= 1 && Math.abs(_eye.y) <= 1 && _eye.z < 1);
  }
  shop.watched.clear();
}

// WEARABLE-FINISHED-OBJ.md §Lending: lent objects wait on the counter beside the Guestbook, stacked.
const LENT_AT = { x: COUNTER.x + 0.31, z: COUNTER.z - 0.12, width: 0.22 };
let shownLent = [];
function showLent() {
  const lent = shop.world.lent.map((d) => d.wip);
  if (lent.length === shownLent.length && lent.every((w, i) => w === shownLent[i])) return;
  shownLent = lent;
  for (const piece of lentGroup.children) piece.traverse((m) => m.geometry?.dispose());
  lentGroup.clear();
  let y = COUNTER.h;
  for (const wip of lent) {
    const piece = lentPiece(wip, colourOf, LENT_AT.width);
    if (!piece) continue;
    piece.rotation.x = -Math.PI / 2;
    piece.position.set(LENT_AT.x, y, LENT_AT.z);
    lentGroup.add(piece);
    piece.updateMatrixWorld(true);
    ({ y } = new THREE.Box3().setFromObject(piece).max);
  }
}

export function doTidy() {
  if (!shop.world) return;
  const stacked = tidyShop(shop.world);
  shop.world.log.push(`r${shop.world.round} you: tidied the shop${
    stacked ? ` — no flat room for ${stacked}, stacked on the floor` : ''}`);
  refreshAll();
  touchHud();
}

export function installWorld() {
  scene.add(castGroup, lentGroup);
}
