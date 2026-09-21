// The simulation: NPCs, their visits, and the round clock.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { abortDrag } from '../interact/pick.js';
import { rnd } from '../core/util.js';
import { clearSelection } from '../interact/move.js';
import { cast, seats, displays, items, touchHud, shop, clocks } from '../core/state.js';
import { makeStockNotion, makeStockPattern, makeStockYarn, yarnWeight } from '../../../inventory/catalog.js';
import {
  NAMES,
  POSES,
  applyPose,
  createCharacter,
  disposeCharacter,
  getSpecies,
  pick,
  setViewMode,
  speciesIds,
  MOTION_DEFAULTS,
  motionOf,
} from '../../npc.js';
import { STATE, advanceRound, makeNpc, makeWorld, rejoin } from '../../visit.js';
import { satisfies, wantsOf } from '../../wip.js';
import * as THREE from 'three';
import { S } from '../core/config.js';
import { scene } from '../scene/stage.js';
import { COUNTER, HALF_D, HALF_W } from '../scene/room.js';
import { buildChairs } from '../scene/seating.js';
import { buildDisplays } from '../scene/displays.js';
import { boxes, edgeTop, fieldTop, shadows, sideEdge, sideField, sizeSide, sizeTop } from '../goods/items.js';
import { refreshAll } from '../goods/paint.js';
import { addItem } from '../goods/stock.js';
import { STAND_TIME, buildBlobs, measureSeatDrop, rollCheer, routeLength } from './cast.js';

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
  guestbook: { x: -2.1, z: 1.15 },
  dropOff:   { x: 2.2, z: 1.7 },
  personalSpace: 0.62,
  doorClearance: 0.8,   // nobody may loiter this close to the door — it is the only way through
  // Solid things the sim must route around that are not displays or chairs. Displays and seats it
  // already knows about; the counter it does not, so it is handed over here rather than duplicated.
  solids: [{ x: COUNTER.x, z: COUNTER.z, w: COUNTER.w, d: COUNTER.d }],
  bounds: { minX: -HALF_W + 0.6, maxX: HALF_W - 0.6, minZ: -HALF_D + 1.4, maxZ: HALF_D - 0.9 },
};

export const castGroup = new THREE.Group();

// Fill whatever displays currently exist. buildDisplays() has already made their grids fresh, so
// this only has to place items — a shelf gets more because it has three levels to fill.
// What a shop actually sells, weighted. Yarn dominates because YARN.md calls it "a centerpiece of
// this game" and because it is what the WIP mechanic consumes most of — a pattern needs one tool
// but up to twenty units of wool.
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
function fillStock(n) {
  if (n <= 0 || !displays.length) return 0;
  let placed = 0, tries = 0;
  // Round-robin across displays so a small shop is not all piled on one table.
  for (let i = 0; placed < n && tries < n * 8; i++, tries++) {
    const d = displays[i % displays.length];
    if (d.kind === 'shelf') {
      if (addItem(d, rnd(d.g.shelves), randomStock()) >= 0) placed++;
      continue;
    }
    // Two or three onto one anchor column, so a pile reads as a pile even at a small stock count.
    const c = rnd(d.g.cols), r = rnd(d.g.rows);
    const tall = Math.min(n - placed, 1 + rnd(3));
    for (let k = 0; k < tall; k++) if (addItem(d, 0, randomStock(), { c, r }) >= 0) placed++;
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
function seedOne(npc, i, unseeded) {
  const wants = wantsOf(npc);
  let placed = 0;
  wants.forEach((want, k) => {
    const open = displays[(i + k) % displays.length];
    const spec = specFor(want, npc);
    console.assert(satisfies(spec, want), 'seeded item does not satisfy its own want', spec, want);
    if (addItem(open, 0, spec, { avoidWall: true }) >= 0) placed++;
    else unseeded.push(`${npc.name} wants ${want.kind} (no room on ${open.id})`);
  });
  return { wants, placed };
}

/**
 * Bury one copy of the first want under something, so the Assertiveness "dig it out" branch of
 * DISPLAYS.md still gets exercised. The lid takes the SAME footprint as the item below, or it
 * would bridge onto neighbouring columns instead of sitting squarely on top and burying it.
 */
function buryOne(npc, i, want, unburied) {
  const spec = specFor(want, npc);
  // Every display in turn, not just the next one. A 1x1 cone still reserves four layers and a
  // wall shelf only clears three, so the one display this used to try can legitimately refuse —
  // and a burial that silently does not happen is the dig-out branch quietly going untested.
  for (let k = 0; k < displays.length; k++) {
    const hidden = displays[(i + 1 + k) % displays.length];
    const buried = addItem(hidden, 0, spec, { avoidWall: true, shape: [1, 1] });
    if (buried < 0) continue;
    const it = items[buried];
    const lid = addItem(hidden, 0, makeStockNotion(Math.random, 'darning-needle'),
                        { c: it.c, r: it.r, shape: [it.w, it.h] });
    if (lid < 0) unburied.push(`${npc.name}'s ${want.kind} landed on ${hidden.id} with no lid`);
    return 1 + (lid >= 0 ? 1 : 0);
  }
  unburied.push(`${npc.name}'s ${want.kind} fits under nothing in the room`);
  return 0;
}

function seedWants(npcs) {
  const unseeded = [];
  let placedCount = 0;
  npcs.forEach((npc, i) => {
    const { wants, placed } = seedOne(npc, i, unseeded);
    placedCount += placed;
    if (wants.length) placedCount += buryOne(npc, i, wants[0], unseeded);
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
function specFor(want, npc) {
  if (want.kind === 'pattern') {
    const p = makeStockPattern();
    // A WIP already holding yarn only matches patterns that suit THAT yarn.
    if (want.forYarn) { p.weight = want.forYarn.weight; p.materials = [want.forYarn.material]; }
    return p;
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

/** A body for one customer: the one they had yesterday if they are a regular, or a new roll. */
function buildBody(speciesId, saved) {
  const kit = getSpecies(speciesId);
  // Named plainly, because the symptom is not: with no species registered this used to surface
  // as "Cannot read properties of undefined (reading 'randomise')" from inside the boot chain.
  // Species register themselves via the bare `import '../../owl.js'` in main.js, which is exactly
  // the kind of import that gets dropped when files move — nothing references it by name.
  if (!kit) throw new Error(`no species kit for "${speciesId}" — is owl.js/llama.js imported?`);
  const P = bodyParams(kit, saved, S);
  return { kit, P, built: createCharacter(P, kit) };
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
}

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
  baseX: npc.x, baseZ: npc.z, faceTo: npc.facing ?? 0, seatRef: null, seatCal: false,
  wait: 0, dur: S.travel,
  carriedName: null, carriedMesh: null,
  // Their own reaction to good news: a pause, then a duration, hop count and height of their
  // own. The BUY is lockstep -- advanceRound resolves every customer in one call -- so
  // without this the whole shop cheers on the same frame with the same three hops.
  celebrate: 0, cheerIn: 0, cheer: rollCheer(), hop: 0, route: [{ x: npc.x, z: npc.z }, { x: npc.x, z: npc.z }],

  // How this character moves, from who they are. Computed once: traits survive rejoin(), so a
  // regular walks like themselves tomorrow with nothing persisted. The species owns how WIDE
  // each span is, the traits pick where in it this individual lands.
  opts: { ...MOTION_DEFAULTS, ...motionOf(npc.traits, built.species?.motionRanges) },

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
function spawnOne(returning, i) {
  const { kit, P, built } = buildBody(returning ? returning.speciesId : pick(speciesIds()),
                                      returning?.body);
  const npc = buildMind(returning, kit);
  npc.body = P;
  queueOutside(npc, i);
  built.root.position.set(npc.x, 0, npc.z);
  castGroup.add(built.root);
  // Where this body's backside is in the sit pose, measured once: it is not a fixed distance
  // below the hips on any two characters. See measureSeatDrop.
  built.seatDrop = measureSeatDrop(built);
  applyPose(built, POSES.rest);
  cast.push(castRecord(npc, built, P.bodyColor));
  return npc;
}

function spawnCast() {
  for (const rec of cast) { castGroup.remove(rec.built.root); disposeCharacter(rec.built); }
  cast.length = 0;
  // Regulars fill the queue first, then new faces make up the numbers.
  const coming = roster.slice(0, S.npcCount);
  const npcs = Array.from({ length: S.npcCount }, (_, i) => spawnOne(coming[i] ?? null, i));
  setViewMode(castGroup, S.view);
  return npcs;
}



// The day cycle. `day` starts at 0 because the first restart() call is itself day one opening.

/** Start a new day. Regulars from the last one come back first, with everything they had. */
/** Put out the stock: customer seeds first, then general inventory with whatever budget is left. */
function stockTheShop(npcs) {
  // Seeds go down FIRST and count against the budget. What the customers in the shop actually
  // need is the inventory that matters — filling up with random stock and then discovering there
  // is no room left for anybody's yarn is the wrong way round, and at a stock count of 10 it
  // would happen constantly.
  const seeded = seedWants(npcs);
  const filled = fillStock(S.stockCount - seeded);
  console.info(`stock: ${items.length} boxes — ${seeded} seeded for customers, ${filled} general`
    + (items.length < S.stockCount
      ? ` (asked for ${S.stockCount}; the shop had no room for more)` : ''));
}

/** Point every instanced mesh at the stock that now exists. */
export function sizeInstanceBuffers() {
  for (const m of [fieldTop, edgeTop, shadows, boxes, sizeTop]) m.count = items.length;
  for (const m of [sideField, sideEdge, sizeSide]) m.count = items.length * 4;
}

/** Start a new day. Regulars from the last one come back first, with everything they had. */
export function restart({ keepRegulars = true } = {}) {
  // Keeping the regulars IS what makes it the next day rather than a fresh game; wiping them
  // resets the calendar too, so the day counter never claims a history the customers do not have.
  shop.day = keepRegulars ? shop.day + 1 : 1;
  clocks.day = 0;
  clocks.auto = 0;
  // Any move-mode selection refers to furniture that is about to be replaced. seating.js used to
  // clear it itself, which meant a leaf module importing the interaction layer — one of the
  // twenty-four cycles. The caller that knows the furniture is going does it instead.
  clearSelection();
  abortDrag();                    // the displays it indexes into are about to be replaced
  buildChairs(S.chairCount);      // before the displays: their slots get masked against the chairs
  buildDisplays(S.displayCount);
  items.length = 0;
  if (!keepRegulars) roster = [];
  const npcs = spawnCast();
  stockTheShop(npcs);
  shop.world = makeWorld({ displays, items, room, seats });
  shop.world.npcs = npcs;
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
  rec.moveT = 0;
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
  rec.wait = ((slot + Math.random()) / Math.max(1, total)) * S.travelJitter
    // Getting out of a chair takes a moment, and the walk must not start underneath it --
    // the route would drag them off the seat while they were still folded into it.
    + (rec.seatRef ? STAND_TIME : 0);
  rec.dur = Math.max(S.travel * (1 + (Math.random() * 2 - 1) * S.paceJitter), 0.05);
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
  advanceRound(shop.world);
  collectRegulars();
  clocks.auto = 0;
  // Shuffled, so the same NPC is not first out of the door every single round -- the slot
  // index is what spaces them, and a fixed order would turn spacing into a pecking order.
  const order = cast.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((castIndex, slot) => retarget(cast[castIndex], slot, cast.length));
  refreshAll();       // an interaction may have bought, tidied or restacked a display
  touchHud();
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installWorld() {
  scene.add(castGroup);
}
