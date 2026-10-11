// The simulation: NPCs, their visits, and the round clock.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

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
import { STAND_TIME, buildBlobs, checkOutfit, disposeRecord, dressedCharacter, measureSeatDrop, outfitOf, rollCheer,
  routeLength } from './cast.js';

// Ids have to be unique across days too — a regular is matched to the roster by id, so a new
// customer reusing "npc0" would be mistaken for one.
let nextNpcId = 0;

// The shop's regulars, surviving a restart. CHARACTER-VISIT.md: an NPC who bought something or got
// some crafting done comes back — and comes back as themselves, with their skill and their
// half-finished projects. That has to outlive `world`, which restart() throws away, so it lives
// here rather than on the world.
let roster = [];

// ---------------------------------------------------------------- the world
export const room = {
  door:      { x: 0, z: HALF_D - 0.35 },
  outside:   { x: 0, z: HALF_D + 1.4 },
  queueAt:   { x: 0, z: HALF_D + 0.8 },
  guestbook: { x: -3.0, z: 1.55 },
  dropOff:   { x: 3.85, z: 1.9 },
  windows:   WINDOW_SPOTS,
  personalSpace: 0.62,
  doorClearance: 0.8,   // nobody may loiter this close to the door — it is the only way through
  // Solid things the sim must route around that are not displays or chairs. Displays and seats it
  // already knows about; the counter and the pots, tables and lamps it does not, so they are handed
  // over here rather than duplicated. A getter, because the player moves the props: the sim reads
  // the live records every time it routes.
  get solids() { return [{ x: COUNTER.x, z: COUNTER.z, w: COUNTER.w, d: COUNTER.d }, ...props]; },
  bounds: { minX: -HALF_W + 0.6, maxX: HALF_W - 0.6, minZ: -HALF_D + 1.4, maxZ: HALF_D - 0.9 },
};

export const castGroup = new THREE.Group();

// Fill whatever displays currently exist. buildDisplays() has already made their grids fresh, so
// this only has to place items — a shelf gets more because it has three levels to fill.
// What a shop actually sells, weighted. Yarn dominates because YARN.md calls it "a centerpiece of
// this game" and because it is what the WIP mechanic consumes most of — a pattern needs one tool
// but up to eight balls of wool.
function randomStock() {
  const roll = Math.random();
  if (roll < 0.55) return makeStockYarn();
  if (roll < 0.75) return makeStockPattern();
  return makeStockNotion();
}

/**
 * Put `n` more boxes out, spread across the displays. Returns how many actually landed — a full or
 * heavily masked shop can refuse some, and the caller reports the shortfall rather than the shop
 * quietly holding less than it was asked to.
 *
 * A pile is meant to be a PILE, so piles get anchor columns and build real towers: addItem takes
 * the first cell that FITS, so left to itself it spreads one item per cell and nothing ever stacks,
 * however much headroom the display has. THAT, not the headroom value, is why piles looked flat —
 * and stacking is what gives DISPLAYS.md's "buried inventory cannot be noticed" rule something to
 * do at all.
 */
/**
 * Where stock goes, as a round-robin of PLACES rather than of displays.
 *
 * The floor is cut into tiles (see displays.js) but it is still one place to put things. Entering
 * every tile in the rota separately would hand the floor forty turns against the furniture's six
 * and quietly relocate the whole shop's stock onto the ground — so the floor takes one turn, and
 * a random tile takes it. Each entry is a group of interchangeable spots; `pick` chooses inside it.
 */
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
  // Round-robin across places so a small shop is not all piled on one table.
  for (let i = 0; placed < n && tries < n * 8; i++, tries++) {
    const d = pick(spots[i % spots.length]);
    if (d.kind === 'shelf') {
      if (addItem(d, rnd(d.g.shelves), randomStock()) >= 0) placed++;
      continue;
    }
    // Two or three onto one anchor column, so a pile reads as a pile even at a small stock count.
    // Each next one is aimed centre-on-centre at the last: anchoring them all on one CELL put
    // everything after a 3x3 ball on its corner, which round yarn refuses (grid.js restsOnCentres).
    const tall = Math.min(n - placed, 1 + rnd(3));
    let top = { c: rnd(d.g.cols), r: rnd(d.g.rows) };
    for (let k = 0; k < tall; k++) {
      const index = addItem(d, 0, randomStock(), k ? { over: top } : top);
      if (index >= 0) { placed++; top = items[index]; }
    }
  }
  return placed;
}

/**
 * Guarantee each NPC can actually finish their visit: one copy of the target sitting where it can
 * be noticed, and one buried under something so the Assertiveness "dig it out" branch of
 * DISPLAYS.md gets exercised too.
 */
/**
 * Guarantee each NPC can actually finish what they came in with. Their WIPs now generate a whole
 * shopping list rather than one notion, so this seeds ONE thing per want — enough that no visit is
 * doomed by random stock, without simply handing them the lot.
 *
 * One copy of the first want is buried under something, so the Assertiveness "dig it out" branch of
 * DISPLAYS.md still gets exercised.
 */
/**
 * One copy of everything this NPC still needs, spread across displays so they have to walk.
 *
 * A full or heavily masked display can refuse a seed, and the only symptom is an NPC wandering
 * for MAX_ROUNDS and leaving empty-handed — which reads as the browse logic being broken rather
 * than the shop having nowhere to put their hook. So refusals are collected, not ignored.
 */
/**
 * The first place, from `start` round, that takes `spec`. A wall shelf is two rows deep and a seed
 * keeps off its wall row to stay noticeable, so it has ONE row for anything — and refuses every 2x2
 * pattern and 2- or 3-deep ball in an empty shop. Trying only that place lost the seed; trying the
 * next is the honest answer, and spreads seeds over the shop all the same.
 */
function placeFrom(spots, start, spec, where) {
  for (let k = 0; k < spots.length; k++) {
    // Every member of a group, from a random one: the floor is ONE place in the rota but a hundred
    // tiles, and a single random tile — a thin edge one, or one half under a table — turned away a
    // bulky ball and its lid while the rest of the floor sat empty.
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

/**
 * Bury one copy of the first want under something, so the Assertiveness "dig it out" branch of
 * DISPLAYS.md still gets exercised. The lid takes the SAME footprint as the item below, or it
 * would bridge onto neighbouring columns instead of sitting squarely on top and burying it.
 */
function buryOne(npc, i, want, unburied) {
  const spec = specFor(want);
  const spots = stockSpots();
  // Every PLACE in turn, not just the next one. A 1x1 cone still reserves four layers and a wall
  // shelf only clears three, so the one display this used to try can legitimately refuse — and a
  // burial that silently does not happen is the dig-out branch quietly going untested. One random
  // tile stands in for the floor rather than all of them: a tile is sixteen cells forty-eight
  // layers deep, so unlike a shelf it has no realistic way to say no.
  // A notion is boxed 1x1 so it fits under any lid; yarn and patterns keep their OWN footprint.
  // Forcing 1x1 on everything squeezed a worsted or bulky ball into one cell — a ball the wrong
  // size for its weight, which checkItemSizes caught on about two boots in three.
  // `reserve: 1` keeps a layer free for the lid, or a full-size ball lands on a stack already near
  // the display's headroom and nothing fits on top to hide it.
  const { index: buried, display: hidden } = placeFrom(spots, i + 1, spec,
    { avoidWall: true, reserve: 1, ...(spec.w ? {} : { shape: [1, 1] }) });
  if (buried < 0) return 0;   // seedWants tries their next want
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
    // The first want that CAN be buried. A bulky cone is twelve layers, a table's whole headroom,
    // so only the floor (twice that) can lid it; skipping it costs nothing (its noticeable copy is
    // already out — seedOne) but the dig-out branch still wants one buried thing per customer where there is one.
    const buried = wants.reduce((n, want) => n || buryOne(npc, i, want, unseeded), 0);
    if (wants.length && !buried) console.info(`${npc.name}: nothing they want fits under a lid; none buried`);
    placedCount += buried;
  });
  console.assert(unseeded.length === 0, 'want seeding failed:', unseeded);
  return placedCount;
}

/**
 * One catalog item that would actually satisfy this want.
 *
 * Matching is strict now — MatchObservedInventory wants the yarn's material AND weight to match
 * the pattern, and the tool's millimetres to match exactly — so a seed cannot be a random item of
 * the right KIND. It has to be built from the want. Asserted below, because a seed that silently
 * fails to match is indistinguishable from browse logic that does not work.
 */
function specFor(want) {
  if (want.kind === 'pattern') {
    // A WIP already holding yarn only matches patterns that suit THAT yarn — and it is still one of
    // the shop's named designs, not a stock pattern with its yarn edited (which would leave its
    // title naming a different spec).
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

// Names are CLAIMED, never cycled. `NAMES[i % NAMES.length]` was fine when every customer was new
// each restart, but regulars persist across days and keep their names, so an index stopped
// tracking identity — a new arrival could walk in wearing the name of somebody already in the
// room. Two different characters sharing a name is worse than a dull name, because the whole
// point of the roster is recognising who came back.
const usedNames = new Set();

function claimName() {
  const free = NAMES.filter((n) => !usedNames.has(n));
  // Deliberately never freed, even for customers who will not return: within one session a name
  // belongs to one character, full stop. The numbered fallback is visible on purpose — if the shop
  // ever gets through 110 regulars, "Hazel 2" says so rather than quietly pretending.
  let name = free.length ? pick(free) : null;
  for (let k = 2; !name; k++) {
    const candidate = `${NAMES[usedNames.size % NAMES.length]} ${k}`;
    if (!usedNames.has(candidate)) name = candidate;
  }
  usedNames.add(name);
  return name;
}

/**
 * The body parameters to build one customer from.
 *
 * A regular must LOOK the same tomorrow. `rejoin` already keeps their traits, their earned skill
 * and their half-finished projects — but the BODY was randomised fresh every morning, so the owl
 * called Yolanda came back as herself in a different colour. That reads as two customers sharing
 * a name rather than one customer returning, which defeats the entire point of the roster:
 * appearance is the only thing the player can recognise across a day.
 *
 * The quality knobs are the exception. They are a SETTING, not part of who this character is, so
 * they always take the current value rather than the one saved with the body — otherwise a
 * regular would also carry yesterday's shadow settings back in with them.
 *
 * Pure, so the rule can be checked without a renderer: same kit and same saved body in, same
 * parameters out.
 */
export const bodyParams = (kit, saved, quality) => ({
  ...(saved ?? kit.randomise(structuredClone(kit.defaults))),
  partShadows: quality.partShadows,
  mergeMeshes: quality.mergeMeshes,
});

/**
 * A body for one customer: the one they had yesterday if they are a regular, or a new roll --
 * wearing what they made (`outfit`, cast.js outfitOf).
 */
function buildBody(speciesId, saved, outfit) {
  const kit = getSpecies(speciesId);
  // Named plainly, because the symptom is not: with no species registered this used to surface
  // as "Cannot read properties of undefined (reading 'randomise')" from inside the boot chain.
  // Species register themselves via the bare `import '../../owl.js'` in main.js, which is exactly
  // the kind of import that gets dropped when files move — nothing references it by name.
  if (!kit) throw new Error(`no species kit for "${speciesId}" — is owl.js/llama.js/lion.js imported?`);
  const P = bodyParams(kit, saved, S);
  return { kit, P, built: dressedCharacter(P, kit, outfit) };
}

/**
 * The MIND behind a body.
 *
 * A returning customer is rebuilt as a body but rejoined as a mind: rejoin() keeps their traits,
 * preferences, earned skill and part-finished projects, and clears only what belongs to one visit.
 */
function buildMind(returning, kit) {
  const npc = returning ? rejoin(returning) : makeNpc({
    id: `npc-${nextNpcId++}`,
    name: claimName(),
    species: kit.label,
    // target is no longer authored: makeNpc rolls WIPs, and what those WIPs still need IS the
    // shopping list. This is just the headline one, for the debug panel.
    target: null,
  });
  npc.speciesId = kit.id;
  npc.target = wantsOf(npc)[0] ?? null;
  return npc;
}

/** Queue up outside, single file, so entering one at a time is visible as well as modelled. */
function queueOutside(npc, i) {
  npc.x = room.queueAt.x;
  npc.z = room.queueAt.z + i * 0.7;
  npc.from = { x: npc.x, z: npc.z };
  npc.facing = Math.atan2(room.door.x - npc.x, room.door.z - npc.z);   // waiting to come in, not out
}

/** A finished piece of `type`: a design from the catalog, in as many random balls as it suggests colours. */
const finished = (type) => {
  const pattern = makeStockPattern(Math.random, type);
  return { id: type, state: WIP_STATE.FINISHED, progress: 100, pattern, tool: null, notions: [],
    yarn: Array.from({ length: pattern.minColors }, () => makeStockYarn()) };
};

/**
 * The tutorial's opening: the Former Owner, in one of everything (all six wear slots) and an armful
 * of pot holders, signs the book (visit.js signFarewell) on the way out. Spawned as a returning
 * customer would be, so spawnOne builds them; a random species and look, as for any new face.
 */
function formerOwner() {
  const speciesId = pick(speciesIds());
  return Object.assign(makeNpc({ id: `npc-${nextNpcId++}`, name: claimName(), species: getSpecies(speciesId).label }), {
    speciesId, wips: [], farewell: "Shop's all yours! Make some fun stuff!",
    worn: Object.fromEntries(Object.entries(WEAR_SLOT_FOR).map(([type, slot]) => [slot, finished(type)])),
    carries: Array.from({ length: 3 + rnd(3) }, () => finished('potholder')),
  });
}

/** Already in, at the Guestbook, mid-closeout: their whole visit is sign, door, out (never `willReturn`). */
const signingOut = (npc) => Object.assign(npc, { state: STATE.CLOSEOUT, maxRounds: 0, ...room.guestbook,
  from: { ...room.guestbook }, facing: Math.atan2(room.door.x - room.guestbook.x, room.door.z - room.guestbook.z) });

/** The render-side record: everything tickCast needs that the sim does not know about. */
const castRecord = (npc, built, color) => ({
  npc, built, color,
  // poseFrom/poseTo/pt are gone: the interpolator carries its own position AND velocity in
  // built.motion, which is what makes an interrupted move continue smoothly instead of
  // relaunching from a standstill. The pose target is held inside it, by identity.
  // fromY/toY are gone with the seat tween: height now rides the sit pose itself, so there
  // is nothing to interpolate. See groundOffsetFor in cast.js.
  // baseX/baseZ are the ROUTE position; the root is this plus the seat shift (cast.js), so
  // settling onto a cushion is not mistaken for ground covered.
  moveT: 1, travelled: 0, fromX: npc.x, fromZ: npc.z,
  baseX: npc.x, baseZ: npc.z, faceTo: npc.facing ?? 0, heading: npc.facing ?? 0, seatRef: null, seatCal: false,
  wait: 0, dur: S.travel, pace: 1, go: 1,
  carriedName: null, carriedMesh: null,
  // What they wear (cast.js checkOutfit), the craft in their hands while seated (stepKnitting), and
  // the READY sparkle with the buy count it watches (checkReady).
  outfit: {}, outfitKey: '{}', redress: false, craft: null, craftFor: null, craftWip: null, sparkle: null, boughtN: 0, ready: null,
  // Their own reaction to good news: a pause, then a duration, hop count and height of their
  // own. The BUY is lockstep -- advanceRound resolves every customer in one call -- so
  // without this the whole shop cheers on the same frame with the same three hops.
  celebrate: 0, cheerIn: 0, cheer: rollCheer(), hop: 0, route: [{ x: npc.x, z: npc.z }, { x: npc.x, z: npc.z }],

  // How this character moves, from who they are. Computed once: traits survive rejoin(), so a
  // regular walks like themselves tomorrow with nothing persisted. The species owns how WIDE
  // each span is, the traits pick where in it this individual lands.
  //
  // The gate and the slowest cadence are the shop's own (SHOP_GAIT, config.js).
  opts: { ...MOTION_DEFAULTS, ...motionOf(npc.traits, built.species?.motionRanges), ...SHOP_GAIT },

  // Where in the stride they are, 0..1. ACCUMULATED per frame from distance covered — never
  // derived from a running distance total, which is what made legs spin on deceleration (see
  // phaseStep in motion.js).
  //
  // SEEDED RANDOM, and that one word is the difference between a cast and a chorus line. Every
  // NPC starting at zero means every NPC plants the same foot on the same frame — the queue
  // walks in in lockstep, which is exactly the tell crowd.html records about pose cycling. A
  // random start is a random point in the gait, and it costs nothing.
  phase: Math.random(),
  moved: 0,
  speed: 0,
});

/**
 * One customer: a body, a mind, a place in the queue, and the render record that ties them.
 *
 * `npc.body` is carried on the NPC so it survives into the roster — that is what makes a regular
 * recognisable tomorrow. rejoin() clears only per-visit fields, so it lives across days untouched.
 */
function spawnOne(returning, i, place = queueOutside) {
  const outfit = returning ? outfitOf(returning) : {};
  const { kit, P, built } = buildBody(returning ? returning.speciesId : pick(speciesIds()),
                                      returning?.body, outfit);
  const npc = buildMind(returning, kit);
  npc.body = P;
  place(npc, i);
  built.root.position.set(npc.x, 0, npc.z);
  castGroup.add(built.root);
  // Where this body's backside is in the sit pose, measured once: it is not a fixed distance
  // below the hips on any two characters. See measureSeatDrop.
  built.seatDrop = measureSeatDrop(built);
  applyPose(built, POSES.rest);
  cast.push({ ...castRecord(npc, built, P.bodyColor), outfit, outfitKey: JSON.stringify(outfit) });
  return npc;
}

function spawnCast(count = S.npcCount, handover = false) {
  for (const rec of cast) disposeRecord(rec);
  cast.length = 0;
  // Regulars fill the queue first, then new faces make up the numbers.
  const coming = roster.slice(0, count);
  const npcs = Array.from({ length: count }, (_, i) => spawnOne(coming[i] ?? null, i));
  // Last, so the tutorial friend is still npcs[0].
  if (handover) npcs.push(spawnOne(formerOwner(), count, signingOut));
  setViewMode(castGroup, S.view);
  return npcs;
}



// The day cycle. `day` starts at 0 because the first restart() call is itself day one opening.

/** Start a new day. Regulars from the last one come back first, with everything they had. */
/** Put out the stock: customer seeds first, then general inventory with whatever budget is left. */
function stockTheShop(npcs) {
  // Seeds go down FIRST and count against the budget. What the customers in the shop actually
  // need is the inventory that matters — filling up with random stock and then discovering there
  // is no room left for anybody's yarn is the wrong way round, and in a cluttered shop it would
  // happen constantly.
  const seeded = seedWants(npcs);
  const filled = fillStock(S.stockCount - seeded);
  const short = items.length < S.stockCount ? ` (asked for ${S.stockCount}; the shop had no room for more)` : '';
  console.info(`stock: ${items.length} boxes — ${seeded} seeded for customers, ${filled} general${short}`);
}

/**
 * The morning delivery: today's order, resolved against the catalog and put on the FLOOR, which
 * DESIGN-DECISIONS.md §6 makes the shop's one inbox. Floor tiles only — sorting it onto the
 * furniture is the player's job. Returns the morning log line; whatever had no room is counted in
 * it rather than dropped quietly, or a full floor would read as a delivery that never came.
 *
 * `order` is one planTomorrow() made at closing and showed the player (game.html's between-days
 * screen), so what was on the clipboard is what lands; without one it is built here, as before.
 */
function deliver(order = buildOrder(shop.day, { occupancy: items.length / CAPACITY }), goods = resolveOrder(order)) {
  const floor = [displays.filter((d) => d.solid === false)];   // one place: placeFrom tries every tile
  let landed = 0;
  for (const spec of goods) if (placeFrom(floor, 0, spec).index >= 0) landed++;
  const short = goods.length - landed;
  const line = `delivery: ${landed} boxes${short ? ` — ${short} did not fit on the floor` : ''}`;
  console.info(`day ${shop.day} ${line}`);
  return line;
}

/**
 * Tomorrow's order, built at closing: what deliver() will put on the floor if it is handed back to
 * restart({ order }). The occupancy is what tomorrow opens with — today's stock minus what sold,
 * which is what carryOver will leave — so the supplier's throttle reads the same either way.
 */
export function planTomorrow() {
  const kept = items.filter((it) => !it.gone).length;
  return buildOrder(shop.day + 1, { occupancy: kept / CAPACITY });
}

/** Point every instanced mesh at the stock that now exists. */
export function sizeInstanceBuffers() {
  for (const m of [fieldTop, edgeTop, shadows, boxes, sizeTop]) m.count = items.length;
  for (const m of [sideField, sideEdge, sizeSide]) m.count = items.length * 4;
}

/**
 * Put the day's Guestbook page on the shelf before the world that holds it is replaced. A photo
 * entry keeps who signed it, as they were that day: the visitor may never come back, and a regular
 * who does may be wearing something else by then. Wiping the regulars wipes the history too.
 */
function fileGuestbook(keepRegulars) {
  if (!keepRegulars) { shop.pastBooks.length = 0; return; }
  if (!shop.world?.guestbook.length) return;
  for (const g of shop.world.guestbook) {
    const npc = shop.world.npcs.find((n) => n.id === g.npcId);
    if (g.kind === 'photo' && npc) g.who = { body: npc.body, speciesId: npc.speciesId, worn: { ...npc.worn }, carries: npc.carries };
  }
  shop.pastBooks.push({ day: shop.day, entries: shop.world.guestbook });
}

/** The furniture and stock a new day opens with: built fresh, or yesterday's carried over. */
function setUpShop(fresh) {
  // Any move-mode selection refers to furniture that may be about to be replaced. seating.js used
  // to clear it itself, which meant a leaf module importing the interaction layer — one of the
  // twenty-four cycles. The caller that knows the furniture is going does it instead.
  clearSelection();
  abortDrag();                    // back in a slot, so the carry-over keeps it and re-indexes it
  // Moved furniture needs nothing to persist: move mode edits these same records in place.
  if (!fresh) { carryOver(items, displays); return; }
  buildChairs(S.chairCount);      // before the displays: their slots get masked against the chairs
  buildDisplays(S.displayCount);
  items.length = 0;
}

/**
 * Day 3 lifts the hold: knitted at home up to the hold, the pot holder is one round of work from
 * done, and the finishing push (visit.js) sits the friend down to finish it here.
 * TODO(SCRIPTED-EVENTS.md): the friend role and the day-3 script; B2 (knit at home) generally.
 */
const TUTORIAL_HOLD = 90;   // one beginner round is 100/9 % at the least, so 90 finishes in one
function liftHolds(npcs) {
  for (const w of npcs.flatMap((n) => n.wips).filter((x) => x.holdAt != null)) {
    // Even when the kit is still short (a hook left on the floor): bought on day 3, it is one round.
    w.progress = Math.max(w.progress, w.holdAt);
    delete w.holdAt;
  }
}

/**
 * Tutorial day 1: the customer's one project is blank, so the first thing they want is a pattern,
 * and the pattern lies on the table nearest the door, the first one they pass.
 * TODO(spec): SCRIPTED-EVENTS.md `seed ... facing: 'friend'` -- the table the tutorial friend
 * faces, once the friend role (a `keep` NPC, first in the queue) exists.
 */
function openTutorial(npc, pattern) {
  // TUTORIAL.md: the friend is a beginner, and the pot holder is finished in the shop on day 3.
  // Held short of done until then (wip.js progressLimit); day 3 lifts the hold (castAndStock).
  npc.prefs.skill = 1;
  npc.wips = [{ ...npc.wips[0], pattern: null, yarn: [], tool: null, notions: [], holdAt: TUTORIAL_HOLD }];
  npc.target = wantsOf(npc)[0] ?? null;
  const near = (d) => Math.hypot(d.x - room.door.x, d.z - room.door.z);
  const tables = displays.filter((d) => d.form === 'table').sort((a, b) => near(a) - near(b));
  const { index } = placeFrom([...tables.map((d) => [d]), ...stockSpots()], 0, pattern, { avoidWall: true });
  console.assert(index >= 0, 'tutorial: the pot holder pattern found no room');
}

/** Today's customers and stock: the tutorial's day 1, a fresh shop, or yesterday's carried over. */
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
 * Start a new day. Regulars from the last one come back first, with everything they had — and so
 * does the shop: the stock, its slots, the displays and the chairs stay as the player left them,
 * minus what sold, plus the morning delivery.
 *
 * It is built from scratch only when there is nothing to keep (first boot), when the game starts
 * over (`keepRegulars: false`), or when `rebuild` says the furniture itself has changed — the
 * display and chair counts, total inventory and geometry detail pass it. A fresh shop is stocked
 * the old way, seeded for today's customers and filled to S.stockCount; a carried-over one is only
 * seeded when S.seedWants is on, because seeding hands the customers what they need and takes the
 * planning out of stocking.
 *
 * `order` is tomorrow's order from planTomorrow(), when the page showed it before opening.
 *
 * With S.tutorial (game.html), a fresh day 1 is TUTORIAL.md's instead: one customer, who comes in
 * with nothing and wants a pattern, and a shop holding only tutorialDay1()'s three things,
 * opened by the Former Owner signing the Guestbook on their way out (formerOwner).
 *
 * @param {{ keepRegulars?: boolean, rebuild?: boolean, order?: ReturnType<typeof buildOrder> }} [opts]
 */
export function restart({ keepRegulars = true, rebuild = false, order } = {}) {
  // Keeping the regulars IS what makes it the next day rather than a fresh game; wiping them
  // resets the calendar too, so the day counter never claims a history the customers do not have.
  fileGuestbook(keepRegulars);
  shop.day = keepRegulars ? shop.day + 1 : 1;
  // The round clock starts full: the door opens with the day, so the first customer comes straight
  // in instead of standing outside for a whole round (12s at ▶).
  Object.assign(clocks, { day: 0, auto: S.autoSeconds });
  const fresh = rebuild || !keepRegulars || !displays.length;
  setUpShop(fresh);
  if (!keepRegulars) roster = [];
  const { npcs, delivered } = castAndStock(fresh, order);
  shop.world = makeWorld({ displays, items, room, seats });
  shop.world.npcs = npcs;
  shop.world.log.push(`r0 ${delivered}`);
  shop.dayT = 0;
  sizeInstanceBuffers();
  refreshAll();
  buildBlobs();
  touchHud();
}

// ---------------------------------------------------------------- rounds

/**
 * Re-aim one NPC at their new destination for the round that just started.
 *
 * Interpolates from where the NPC is actually DRAWN, not from where the sim says it was: with a
 * stagger an NPC may not have set off at all when the next round lands, and n.from is already
 * last round's destination — using it would teleport them. Reading the live transform makes an
 * interrupted move continue from wherever it got to.
 */
function retarget(rec, slot = 0, total = 1) {
  const n = rec.npc;
  // Working on a WIP is staying in the chair they walked to last round: no walk at all. A route
  // from where they sit to the chair's centre either slid them through the seat or, under the
  // chair's 0.15 threshold (placeSeated), read as ground covered and scissored the seated legs.
  rec.moveT = n.action?.type === ACTION.WORK_ON_WIP ? 1 : 0;
  // The BASE, not the drawn root: a character still rising off a chair is drawn behind their
  // base, and starting the route there would walk them out of the seat shift as well.
  rec.fromX = rec.baseX;
  rec.fromZ = rec.baseZ;
  // The sim's route, rooted where the NPC is drawn and ending at the LIVE destination. The last
  // point is rewritten every frame (see walkRoute) so a display moved out from under someone
  // still drags them along, as it did when this was a straight line.
  rec.route = [{ x: rec.fromX, z: rec.fromZ },
               ...(n.path ?? []).slice(0, -1).map((p) => ({ x: p.x, z: p.z })),
               { x: n.x, z: n.z }];
  rec.travelled = routeLength(rec.route);
  // The SIM is lockstep, but the animation must not be: a cast that sets off and arrives in
  // unison reads as a chorus line, which is the same note crowd.html records about pose cycling.
  // Two independent knobs, because they fix different tells — a stagger breaks up the departure,
  // a pace difference breaks up the arrival.
  // STRATIFIED, not uniform, and that is the whole difference between a cast and a bell.
  //
  // Uniform draws on [0, jitter) CLUSTER: the expected gap between neighbouring departures is
  // jitter/(n+1), not jitter/n, and the order statistics bunch. Measured over 4000 rounds with
  // eight customers, even at a generous 1.7s window, 66% of consecutive departures land within
  // 200ms of each other and the whole cast leaves inside 1.2s. Widening the window barely helps
  // -- at 0.5s it is 98% and at 1.6s still 66% -- because the clustering is in the DISTRIBUTION,
  // not the width. That is the invisible bell: most of them react together whatever the knob says.
  //
  // One slot per NPC, shuffled, with a jittered position inside it. Gaps are then jitter/n by
  // construction and nobody can land on top of anyone.
  // Not for the one coming in: the door admits one a round, so there is nobody to stagger them
  // against, and at ▶ the stagger alone kept them outside for up to 4.8s more.
  rec.wait = n.action?.type === ACTION.ENTER ? 0 : ((slot + Math.random()) / Math.max(1, total)) * S.travelJitter
    // Getting out of a chair takes a moment, and the walk must not start underneath it --
    // the route would drag them off the seat while they were still folded into it.
    + (rec.seatRef ? STAND_TIME : 0);
  // Their own pace, kept: with S.walkSpeed set the duration is worked out per frame from the route
  // (stepWalk), so a press of the speed button reaches a walk already under way.
  rec.pace = 1 + (Math.random() * 2 - 1) * S.paceJitter;
  rec.dur = Math.max(S.travel * rec.pace, 0.05);
}

/**
 * Regulars are collected as they LEAVE rather than at restart, because restart() replaces the
 * world and the list would go with it.
 */
function collectRegulars() {
  for (const npc of shop.world.returning) {
    if (!roster.some((r) => r.id === npc.id)) roster.push(npc);
  }
}

export function doAdvanceRound() {
  if (!shop.world) return;
  if (!shop.world.npcs.some((n) => n.state !== STATE.GONE)) return;   // shop is empty, stop the clock
  markInView(shop.world.npcs);
  advanceRound(shop.world);
  // Clamped so the light and the clock never wind back when a customer's visit runs longer than
  // estimated — see dayProgress.
  shop.dayT = Math.max(shop.dayT, dayProgress(shop.world));
  collectRegulars();
  for (const rec of cast) checkOutfit(rec);   // a finish this round goes on now
  clocks.auto = 0;
  // Shuffled, so the same NPC is not first out of the door every single round -- the slot
  // index is what spaces them, and a fixed order would turn spacing into a pecking order.
  const order = cast.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  order.forEach((castIndex, slot) => retarget(cast[castIndex], slot, cast.length));
  refreshAll();       // an interaction may have bought, tidied or restacked a display
  touchHud();
}

// TUTORIAL.md §7.3 "witnessed": on screen and reasonably close to the camera. Read by the sim as it
// records what a customer does, so the Guestbook keeps detail only for what the player could see.
// ponytail: sampled once a round, at the round's start, and WITNESS_DIST is the knob for "close".
// Pointing at a customer counts too: ui/label.js collects them in shop.watched between rounds.
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

/**
 * The tidy button. A shortcut for now, there to find out whether tidying should be a mechanic —
 * see tidyShop in visit.js for what it moves and what it leaves alone. Logged like an NPC's tidy,
 * so the log shows the player did it.
 */
export function doTidy() {
  if (!shop.world) return;
  const stacked = tidyShop(shop.world);
  shop.world.log.push(`r${shop.world.round} you: tidied the shop${
    stacked ? ` — no flat room for ${stacked}, stacked on the floor` : ''}`);
  refreshAll();
  touchHud();
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installWorld() {
  scene.add(castGroup);
}
