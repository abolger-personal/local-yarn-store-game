// The NPC VISIT state machine: VISIT = BROWSE, then CLOSEOUT.
//
// Pure sim per DESIGN-DECISIONS.md §3: ZERO three.js, ZERO DOM, so it is node-testable
// (see visit.test.mjs). The scene reads this state and draws it; it never owns it.
//
// Specs this implements, and it implements them literally rather than approximately:
//   ai_planning_sessions/characters/CHARACTER-VISIT.md       round loop, action set, prescriptions
//   ai_planning_sessions/characters/CHARACTER-ATTRIBUTES.md  the 10 trait assets
//   ai_planning_sessions/inventory/DISPLAYS.md               what happens inside one interaction
//   ai_planning_sessions/characters/WIP-AND-FINISHED-OBJ-FORMATION.md   what they are shopping FOR
//   ai_planning_sessions/characters/WEARABLE-FINISHED-OBJ.md            what happens to what they make
//
// Where a spec section is blank or undefined, the placeholder is marked `TODO(spec)` and listed in
// VISIT-POC-TODO.md rather than being quietly invented and forgotten.

import { EMPTY, footprint, fits, place, clearShelf, usableAt, fullyExposed }
  from '../inventory/grid.js';
import {
  WIP_STATE, WEAR_SLOTS, makeCraftPrefs, makeWip, wantsOf, wantFor, stow, workRound,
  wearOrOffer, finishedOf, everythingMade, photoSubject, lend, slotFor, describeWip, labelWant,
} from './wip.js';
import { labelOf as labelItem, TOOL_NOTIONS } from '../inventory/catalog.js';

// ---------------------------------------------------------------- traits
//
// The 10 assets of the Big 5 (DeYoung). CHARACTER-ATTRIBUTES.md is explicit: these exact names,
// no synonyms, because each maps to a slot on a 10-point scale per NPC. Renaming any of these
// to a "nicer" word is a spec violation, not a style choice.

export const TRAITS = Object.freeze([
  'Volatility', 'Withdrawal',          // Neuroticism
  'Enthusiasm', 'Assertiveness',       // Extraversion
  'Intellect', 'Openness',             // Openness / Intellect
  'Compassion', 'Politeness',          // Agreeableness
  'Industriousness', 'Orderliness',    // Conscientiousness
]);

/** Every trait 1-5, independently. */
export function randomTraits(rng = Math.random) {
  return Object.fromEntries(TRAITS.map((t) => [t, 1 + Math.floor(rng() * 5)]));
}

/** CHARACTER-ATTRIBUTES.md: "the sum of these 3 is the max number of WIPs an NPC can have (15)". */
export const maxWips = (t) => t.Enthusiasm + t.Openness + t.Volatility;

/**
 * CHARACTER-VISIT.md: "(Openness+Industriousness+Enthusiasm) * (Uniform random chance value from
 * 1 to 2)". Rolled ONCE per visit, so two identical characters can still have different patience.
 *
 * NOTE(spec): the doc annotates the range as "worst case 3 to longest visit 45". With traits at
 * 1-5 the formula gives 3 to 30 — 45 would need a x3 multiplier, not x2. The formula is explicit
 * and the range reads like arithmetic done in passing, so the formula is what is implemented. Say
 * the word if the range was the intent and the multiplier should be 1-3.
 */
export function maxRounds(t, rng = Math.random) {
  return Math.max(1, Math.round((t.Openness + t.Industriousness + t.Enthusiasm) * (1 + rng())));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Two sociability rolls in CHARACTER-VISIT.md, deliberately NOT the same number.
//
// Approaching is a one-shot: it adds one action to a set that is re-rolled anyway, so /10 (up to
// 1.0) is safe. Staying is a PRESCRIPTION that re-rolls itself, so it compounds — at /10 a pair
// with Enthusiasm and Assertiveness both 5 hits 1.0 and waits at each other forever. /20 caps it
// at a coin flip, which decays geometrically and terminates on its own.
const approachChance = (t) => (t.Enthusiasm + t.Assertiveness) / 10;
const keepChattingChance = (t) => (t.Enthusiasm + t.Assertiveness) / 20;

// ---------------------------------------------------------------- actions

export const ACTION = Object.freeze({
  // BROWSE
  WALK_TO_DISPLAY: 'Walk to a Noticed Display',
  INTERACT:        'Interact with a Noticed Display',
  WALK_TO_NPC:     'Walk to closest NPC',
  WALK_TO_SEAT:    'Walk to an open seat',
  WORK_ON_WIP:     'Work on a project from WIPs',
  WAIT:            'Wait a Round',
  MOVE:            'Move around the store to a spot',
  // CLOSEOUT — fixed order, always the last three rounds of a visit
  SIGN_GUESTBOOK:  'Sign the Guestbook',
  DROP_OFF:        'Lend a finished object',
  LEAVE:           'Leave through the door',
  // door traffic
  ENTER:           'Enter through the door',
  QUEUE:           'Wait outside for the door',
});

/** CHARACTER-VISIT.md CLOSEOUT SEQUENCE, in its hardcoded order. */
export const CLOSEOUT_SEQUENCE = Object.freeze([
  ACTION.SIGN_GUESTBOOK, ACTION.DROP_OFF, ACTION.LEAVE,
]);

export const STATE = Object.freeze({
  QUEUED: 'QUEUED', ENTERING: 'ENTERING', BROWSE: 'BROWSE',
  CLOSEOUT: 'CLOSEOUT', LEAVING: 'LEAVING', GONE: 'GONE',
});

// ---------------------------------------------------------------- npc record

export function makeNpc({ id, name, species, target, traits, prefs, rng = Math.random }) {
  const t = traits ?? randomTraits(rng);
  // "personal craft preferences completely unrelated to personality" — rolled from their own
  // stream, not derived from the traits above, because CHARACTER-ATTRIBUTES.md says so.
  const p = prefs ?? makeCraftPrefs(rng);
  // Every NPC arrives mid-project. WIP-AND-FINISHED-OBJ-FORMATION.md's initialisation rules are
  // what make an NPC arrive needing something specific, which is what gives them a reason to shop.
  const wips = Array.from({ length: 1 + Math.floor(rng() * 3) },
                          (_, i) => makeWip(`WIP ${i + 1}`, t, p, rng));
  const npc = {
    id, name, species,
    traits: t,
    prefs: p,                     // { skill, crafts, materials, weights }
    target,                       // headline want, for the debug panel — see matchesAnyWant
    state: STATE.QUEUED,
    x: 0, z: 0,                   // centroid at the END of the round just resolved
    from: { x: 0, z: 0 },         // where it was at the start of it, so the scene can interpolate
    facing: 0,
    roundsInStore: 0,
    maxRounds: maxRounds(t, rng),
    action: null,                 // { type, params } chosen for the round just resolved
    lastAction: null,             // the round before that — the "Round N-1" the spec keeps citing
    prescribed: null,             // { type, params } forced for the NEXT round, or null
    atDisplay: null,
    wips,
    // WEARABLE-FINISHED-OBJ.md: four clothing slots. An NPC wears what they make by default and
    // only lends the overflow, so this is what decides whether the Drop Off step happens at all.
    worn: Object.fromEntries(WEAR_SLOTS.map((s) => [s, null])),
    // The item currently being turned over. DISPLAYS.md makes buying a two-round beat: consider in
    // one round, buy in the next.
    considering: null,
    bought: [],                   // everything they have picked up this visit
    carrying: null,               // the most recent of those, for the hand and the HUD
    path: [],                     // this round's waypoints, last one is the destination
    seat: null,                   // id of the seat this NPC currently occupies, or null
    restructured: [],             // displays this NPC has already tidied/spread/dug through
    closeoutStep: 0,
    closeout: [],                 // the steps this visit will actually take, fixed when it starts
    toLend: [],                   // finished objects with no free clothing slot — the shop's share
    // Small flags the Guestbook entry is written from. Kept as state rather than derived at
    // signing time because none of them can be reconstructed afterwards.
    chatted: false,
    satAndWorked: false,
    stormedOut: false,
    // Set the moment they buy anything or get some crafting done; read when they walk out.
    willReturn: false,
    visits: 1,                    // how many times this customer has been in
    note: '',                     // one line of "why", for the debug panel
  };
  return npc;
}

// ---------------------------------------------------------------- world

/**
 * @param room   plain numbers the sim needs but does not own: door, guestbook, dropOff, queueAt,
 *               and the walkable bounds. The scene decides where these are; the sim just uses them.
 * @param seats  [{ id, x, z, facing }] — one per chair. Occupancy is tracked here, not in the
 *               scene, because whether a seat is free changes which actions exist.
 */
export function makeWorld({ displays, items, room, seats = [], rng = Math.random }) {
  return {
    round: 0,
    npcs: [],
    displays,          // [{ id, kind:'pile'|'shelf', g, x, z, w, d, standAt, wallRow }]
    items,             // the SAME array the renderer instances from — sim mutates, render reads
    room,
    seats: seats.map((s) => ({ ...s, occupiedBy: null })),
    door: { ...room.door, busy: null },   // busy = npc id currently in the doorway: one at a time
    // The two things a visit leaves behind. LYS.md calls the Guestbook the emotional payoff of the
    // loop, so it is real data from the start rather than a log line — even though nothing draws
    // it as a book yet.
    guestbook: [],
    dropOff: [],
    // WEARABLE-FINISHED-OBJ.md: handing a borrowed object back to its maker displaces whatever they
    // were already wearing, which "[goes] in a pile in the shop behind the guestbook".
    backPile: [],
    // CHARACTER-VISIT.md: customers who bought something or got some crafting done are worth
    // coming back. This is the shop's regulars.
    returning: [],
    rng,
    log: [],
  };
}

// ---------------------------------------------------------------- seats
//
// A seat is the third thing in the shop an NPC can walk to and OCCUPY, alongside a display's
// standing spot and the Guestbook counter. All three are the same shape — a point you go to, that
// only one NPC can use at a time — but only seats need occupancy tracked in the sim today, because
// only seats gate whether an action exists at all. Generalising all three into one "station" type
// can wait until a second one actually needs the occupancy.

const freeSeats = (world, npc) =>
  world.seats.filter((s) => s.occupiedBy === null || s.occupiedBy === npc.id);

export const seatById = (world, id) => world.seats.find((s) => s.id === id);

function claimSeat(world, npc, seat) {
  releaseSeat(world, npc);
  seat.occupiedBy = npc.id;
  npc.seat = seat.id;
}

function releaseSeat(world, npc) {
  if (npc.seat === null) return;
  const seat = seatById(world, npc.seat);
  if (seat && seat.occupiedBy === npc.id) seat.occupiedBy = null;
  npc.seat = null;
}

const say = (world, npc, text) => {
  npc.note = text;
  world.log.push(`r${world.round} ${npc.name}: ${text}`);
  if (world.log.length > 200) world.log.shift();
};

// ---------------------------------------------------------------- geometry helpers
//
// 2D (XZ) only. The room is one flat rectangle, so nothing here needs a third axis.

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * Segment vs axis-aligned box, slab method. Used for the spec's visibility rule, which is
 * deliberately crude: "if there's nothing intersecting the vector between the NPC and the display
 * centroid, it's visible".
 *
 * ponytail: treats a display as its AABB and ignores yaw. Two displays and one room — a rotated
 * OBB test buys nothing yet. Upgrade when a display is placed at a real angle.
 */
function segmentHitsBox(a, b, box) {
  const hw = box.w / 2, hd = box.d / 2;
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, q0, q1] of [[dx, a.x - (box.x - hw), a.x - (box.x + hw)],
                             [dz, a.z - (box.z - hd), a.z - (box.z + hd)]]) {
    if (Math.abs(p) < 1e-9) { if (q0 < 0 || q1 > 0) return false; continue; }
    const lo = Math.min(-q0 / p, -q1 / p), hi = Math.max(-q0 / p, -q1 / p);
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

/** CHARACTER-VISIT.md: visible unless something intersects the line to the display's centroid. */
export function visibleTo(world, from, display) {
  return !world.displays.some((d) => d.id !== display.id && segmentHitsBox(from, display, d));
}

// ---------------------------------------------------------------- getting there
//
// Until now an NPC teleported to the round's destination and the renderer drew a straight line
// between the two, so they walked through tables. They now get a ROUTE — a short list of waypoints
// the renderer follows instead — which keeps the round-based sim exactly as it was: the destination
// is still reached this round, it is just no longer reached through the furniture.
//
// A visibility graph rather than a nav grid: this room holds under a dozen rectangles, the player
// can move them anywhere at any moment (DISPLAYS.md rule 10), and a graph over their corners needs
// no grid to rebuild when they do. DESIGN-DECISIONS.md asks for grid A* with string-pulling, which
// is the right answer once there is real geometry to walk on; against a handful of boxes it would
// be more code for a coarser path.
//
// ponytail: O(n²) edges rebuilt per query, no caching. ~34 nodes and ~1k segment tests per NPC per
// ROUND (not per frame), which is nothing. Cache the graph per layout if the room ever gets busy.

/** How wide a berth to give furniture. A shoulder, not a body: enough that a walker rounds a
 *  corner rather than clipping it, without opening a gap they visibly steer through. */
const PATH_CLEARANCE = 0.22;
/** The fallback berth, used only when the generous one seals the room. A display parked a
 *  shoulder's width from a wall leaves a strip of real floor that a 0.22 berth swallows whole, and
 *  the honest answer to a tight gap is to squeeze through it, not to walk through the display. */
const TIGHT_CLEARANCE = 0.05;
/** Standing INSIDE something is a harder error than brushing it, so the push-out is tighter. It
 *  must stay well under a display's standing clearance (STAND_OFF minus its half depth) or an NPC
 *  who has correctly walked up to a display gets shoved back off it. */
const BODY_RADIUS = 0.12;

const insideBox = (p, b, pad = 0) =>
  Math.abs(p.x - b.x) <= b.w / 2 + pad && Math.abs(p.z - b.z) <= b.d / 2 + pad;

const grow = (b, pad) => ({ x: b.x, z: b.z, w: b.w + pad * 2, d: b.d + pad * 2 });

/**
 * Everything solid an NPC has to walk around. Displays and chairs come from the world; the counter
 * and anything else built into the room arrive as `room.solids`, because the sim does not own the
 * scene's furniture — it is told about it, the same way it is told where the door is.
 */
export function obstacles(world) {
  const out = world.displays.map((d) => ({ x: d.x, z: d.z, w: d.w, d: d.d }));
  for (const s of world.seats) out.push({ x: s.x, z: s.z, w: s.w ?? 0.34, d: s.d ?? 0.34 });
  for (const b of world.room.solids ?? []) out.push({ x: b.x, z: b.z, w: b.w, d: b.d });
  return out;
}

/** Corners of a box grown by the walker's berth — the only places a shortest path can turn. */
const cornersOf = (b, pad) => {
  const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
  return [{ x: b.x - hw, z: b.z - hd }, { x: b.x + hw, z: b.z - hd },
          { x: b.x + hw, z: b.z + hd }, { x: b.x - hw, z: b.z + hd }];
};

/**
 * Slide a point just clear of every obstacle's berth, so the graph has somewhere to start from.
 *
 * An endpoint sitting inside the BERTH but outside the furniture itself — a customer a hand's width
 * from a chair, a destination tucked against a table — makes every ray out of it collide. That
 * disconnects it from the graph entirely, and the straight-line escape hatch then walked them
 * through the very table the routing exists to avoid. Nudging is the fix rather than shrinking the
 * berth, because the berth is what keeps them from clipping corners in the first place.
 */
function nudgeClear(p, boxes, pad) {
  const out = { x: p.x, z: p.z };
  // A push out of one box can push into another, so settle. Four passes is plenty for a shop; it
  // stops early the moment nothing moves.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const b of boxes) {
      if (!insideBox(out, b, pad)) continue;
      const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
      const dx = out.x - b.x, dz = out.z - b.z;
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) out.x = b.x + (dx < 0 ? -hw : hw);
      else out.z = b.z + (dz < 0 ? -hd : hd);
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/**
 * The visibility graph at one berth width. Returns the waypoints, or null when the goal cannot be
 * reached at this width — which is the signal to try again with a narrower one.
 */
function routeAt(world, from, to, solid, pad) {
  // Tested against a slightly SMALLER box than the corners are placed on, or a corner sits exactly
  // on the boundary of its own obstacle and floating point calls that a collision — which would
  // disconnect every turn from the graph and route nothing.
  const hit = solid.map((b) => grow(b, Math.max(0, pad - 0.02)));
  const blocked = (a, c) => hit.some((b) => segmentHitsBox(a, c, b));

  const { minX, maxX, minZ, maxZ } = world.room.bounds;
  const start = nudgeClear(from, solid, pad);
  const goal = nudgeClear(to, solid, pad);
  if (!blocked(start, goal)) {
    const direct = [to];
    if (start.x !== from.x || start.z !== from.z) direct.unshift(start);
    return direct;
  }

  const nodes = [start, goal];
  for (const b of solid)
    for (const c of cornersOf(b, pad))
      if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ &&
          !hit.some((o) => insideBox(c, o))) nodes.push(c);

  // Dijkstra. Small enough that a linear scan for the nearest unvisited node beats a heap.
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < (u < 0 ? Infinity : dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const step = Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (dist[u] + step >= dist[v] || blocked(nodes[u], nodes[v])) continue;
      dist[v] = dist[u] + step;
      prev[v] = u;
    }
  }
  if (prev[1] < 0) return null;

  const path = [];
  for (let i = 1; i !== 0; i = prev[i]) path.unshift(nodes[i]);
  // The graph ran between the nudged copies; the walker has to leave from where it actually is and
  // arrive where it was actually sent. The stitched-on legs are short and point straight out of (or
  // into) the berth they were nudged from, so neither can cut a corner.
  path[path.length - 1] = to;
  if (start.x !== from.x || start.z !== from.z) path.unshift(start);
  return path;
}

/**
 * Waypoints from `from` to `to` that miss the furniture, `to` last. Returns `[to]` when the way is
 * already clear, which is the common case and costs one test per obstacle.
 *
 * Obstacles genuinely CONTAINING either end are dropped rather than treated as walls. That is what
 * lets an NPC reach a CHAIR — the goal is inside the thing they are walking to — and it also means
 * a display dropped on top of somebody lets them walk out instead of trapping them. The test is
 * against the real box, not the berth: merely standing NEAR a chair must not buy permission to walk
 * straight through it.
 */
export function findPath(world, from, to) {
  const solid = obstacles(world).filter((b) => !insideBox(from, b) && !insideBox(to, b));
  if (!solid.some((b) => segmentHitsBox(from, to, grow(b, PATH_CLEARANCE - 0.02)))) return [to];

  for (const pad of [PATH_CLEARANCE, TIGHT_CLEARANCE]) {
    const path = routeAt(world, from, to, solid, pad);
    if (path) return path;
  }
  // Genuinely walled in. Walk the straight line rather than refuse to move: a customer frozen
  // mid-shop with no explanation is a worse failure than one who clips a table the player has
  // deliberately boxed them into.
  return [to];
}

/** Shove an NPC out of anything they have ended up standing inside, by the shortest way out. */
function pushOutOfFurniture(world, npc) {
  for (const b of obstacles(world)) {
    if (!insideBox(npc, b, BODY_RADIUS)) continue;
    const hw = b.w / 2 + BODY_RADIUS, hd = b.d / 2 + BODY_RADIUS;
    const dx = npc.x - b.x, dz = npc.z - b.z;
    // Whichever face is nearest: overlap along X versus along Z.
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) npc.x = b.x + (dx < 0 ? -hw : hw);
    else npc.z = b.z + (dz < 0 ? -hd : hd);
  }
}

// ---------------------------------------------------------------- display contents

/**
 * An item is in play only if it is still in the shop AND not currently in the player's hand.
 *
 * `held` is the player picking something up. It matters to the SIM, not just the renderer: a held
 * item has been lifted out of its grid column, so an NPC who tidied around it would place things
 * into a slot the player is about to drop into, and an NPC who "bought" it would take it out of a
 * hand. While carried, it is simply not on the display.
 */
const available = (it) => !it.gone && !it.held;

const onPlane = (display, items, shelf) =>
  items.map((it, i) => [it, i])
       .filter(([it]) => available(it) && it.display === display.id && it.shelf === shelf)
       .map(([, i]) => i);

const matchesTarget = (item, target) =>
  item.name === target.name && (target.size == null || item.size === target.size);

/**
 * What this NPC is shopping for is now a PROPERTY OF THEIR PROJECTS, not a single hardcoded notion:
 * WIP-AND-FINISHED-OBJ-FORMATION.md gives every open WIP slot a list of wants, and an NPC with a
 * pattern and no yarn is looking for yarn. `npc.target` survives as the headline want — what the
 * debug panel shows and what attractiveness weighs — but the buy rule asks this.
 */
const matchesAnyWant = (npc, item) => wantFor(npc, item) !== null;

/**
 * DISPLAYS.md "Interaction Buy scoring", per display type.
 *   Pile:  only the TOP of a 2.5D stack can be noticed. Buried is invisible.
 *   Shelf: must be on an OUTSIDE face. The wall-facing row never counts.
 */
/**
 * Is this item the top of EVERY column it covers?
 *
 * A multi-cell package can bridge two columns and then have something stacked on just one half —
 * `place()` drops the newcomer onto that column alone. The item is then still the "top" of its
 * other column, which makes a single anchor-cell test say it is exposed when half of it is buried.
 *
 * Two things depend on getting this right, which is why it lives here rather than in either caller:
 *   - NPCs, per DISPLAYS.md: partly buried inventory cannot be noticed or bought.
 *   - The player's pick: `lift()` pops the top of every column the footprint covers, so lifting a
 *     half-buried package silently evicts whatever was resting on it.
 */
// Moved to inventory/grid.js — it is pure grid occupancy, and the player's pick needs the same
// answer the NPC does. Re-exported so every existing caller keeps its import.
export { fullyExposed };

export function noticeable(display, items, index) {
  const item = items[index];
  if (!item || !available(item)) return false;
  if (!fullyExposed(display, items, index)) return false;
  // DISPLAYS.md: on a shelf, only inventory on an OUTSIDE face can be noticed, and the wall-facing
  // row is not one. A multi-row package straddles both — part of it IS on the outside face — so it
  // is hidden only when its ENTIRE footprint sits in the wall row.
  const rowsCovered = item.h ?? 1;
  if (display.kind === 'shelf' && item.r === display.wallRow && rowsCovered === 1) return false;
  return true;
}

/** Every index on this display that satisfies the NPC's target formation AND can be noticed. */
export const buyableTargets = (display, items, target) =>
  items.reduce((acc, it, i) => {
    if (available(it) && it.display === display.id && matchesTarget(it, target) &&
        noticeable(display, items, i)) acc.push(i);
    return acc;
  }, []);

/**
 * Everything on this display that the NPC's open WIP slots want AND that is accessible — the
 * "accessible items (Top Z+ layers) match a want" of DISPLAYS.md's consideration rule.
 */
export const consideredHere = (npc, display, items) =>
  items.reduce((acc, it, i) => {
    if (available(it) && it.display === display.id && noticeable(display, items, i) &&
        wantFor(npc, it)) acc.push(i);
    return acc;
  }, []);

/** Present on the display at all, buried or not. What makes a display worth walking to. */
export const holdsTarget = (display, items, target) =>
  items.some((it) => available(it) && it.display === display.id && matchesTarget(it, target));

// ---------------------------------------------------------------- attractiveness
//
// TODO(spec): CHARACTER-VISIT.md requires each display to carry "a meta 'attractiveness' list of
// weights to use against a particular NPC", and never defines the weights. This is a placeholder
// with the right SHAPE — trait-weighted, per (npc, display), normalised 0..1, thresholded at 0.5 by
// the caller — so swapping in the real table is a data change, not a rewrite.

export function attractiveness(npc, display, items) {
  const t = npc.traits;
  let a = 0.20;
  // "What they came for" is now everything their open WIP slots need, so a display holding the
  // yarn for a half-finished sweater pulls as hard as one holding the hook.
  const wanted = items.some((it) => available(it) && it.display === display.id && matchesAnyWant(npc, it));
  if (wanted) a += 0.45;
  if (consideredHere(npc, display, items).length) a += 0.10;   // and it is right there on top
  a += 0.10 * (t.Openness / 5);                             // browses for the pleasure of it
  a += 0.10 * (t.Intellect / 5);
  // An orderly NPC is drawn to a neat display; a messy one does not care either way.
  a += 0.15 * (t.Orderliness / 5) * (display.kind === 'shelf' ? 1 : 0.4);
  return clamp(a, 0, 1);
}

// ---------------------------------------------------------------- the browse action set
//
// CHARACTER-VISIT.md: "the remaining visit sequence options are recalculated, then another option
// is chosen at random". Each entry is a candidate; duplicates are intentional, because the spec
// uses duplication as the weighting mechanism (one "work on a WIP" entry PER WIP).

export function browseActionSet(npc, world, snapshot) {
  const set = [];
  const rng = world.rng;
  const t = npc.traits;
  const wasAtDisplay = npc.action?.type === ACTION.WALK_TO_DISPLAY ||
                       npc.action?.type === ACTION.INTERACT;

  // --- Walk to a Noticed Display -------------------------------------------------
  // "If the NPC walked to a display or interacted with a display in the last round, no new walking
  // actions will be added to this round's set" — the NPC should stay put at the one they are at.
  if (!wasAtDisplay) {
    for (const display of world.displays) {
      if (!visibleTo(world, npc, display)) continue;
      if (attractiveness(npc, display, world.items) > 0.5) {
        set.push({ type: ACTION.WALK_TO_DISPLAY, params: { displayId: display.id } });
      }
    }
  }

  // --- Walk to closest NPC -------------------------------------------------------
  // "calculated from XY position of NPCs at the LAST round" — hence the snapshot, not live state.
  if (rng() < approachChance(t)) {
    const others = snapshot.filter((o) => o.id !== npc.id && o.state === STATE.BROWSE);
    if (others.length) {
      const closest = others.reduce((m, o) => (dist2(npc, o) < dist2(npc, m) ? o : m));
      set.push({ type: ACTION.WALK_TO_NPC, params: { npcId: closest.id } });
    }
  }

  // --- Work on a project from WIPs -----------------------------------------------
  // "More than 1 can be added: more WIPs deliberately makes it more likely this action gets picked".
  // You cannot work on a project standing in the middle of the shop, so an NPC who is not already
  // sitting has to go and find a chair first — the same walk-then-do shape as a display. The
  // per-WIP duplication stays, it just weights the walk instead of the work.
  // A finished object is not something you sit down and work on, so only live slots weight the
  // draw. Params carry `wip.id`, not the object: an action travels through the debug panel and
  // through a prescription, and a whole WIP in there is a snapshot that can go stale.
  const workable = npc.wips.filter((w) => w.state !== WIP_STATE.FINISHED);
  if (npc.seat !== null) {
    for (const wip of workable) {
      set.push({ type: ACTION.WORK_ON_WIP, params: { wip: wip.id, seatId: npc.seat } });
    }
  } else {
    const open = freeSeats(world, npc);
    if (open.length) {
      const nearest = open.reduce((m, s) => (dist2(npc, s) < dist2(npc, m) ? s : m));
      for (const wip of workable) {
        set.push({ type: ACTION.WALK_TO_SEAT, params: { wip: wip.id, seatId: nearest.id } });
      }
    }
  }

  // --- Always available ----------------------------------------------------------
  // ...except waiting in the doorway. An NPC parked on the mat blocks the one place everybody
  // else has to pass through, and they end up standing inside each other.
  if (!inDoorway(world, npc)) set.push({ type: ACTION.WAIT, params: {} });
  set.push({ type: ACTION.MOVE, params: {} });

  return set;
}

/** The patch of floor around the door that nobody may loiter on. */
export const inDoorway = (world, p) =>
  Math.hypot(p.x - world.room.door.x, p.z - world.room.door.z) < world.room.doorClearance;

/**
 * The spec names this function, so it keeps the spec's casing rather than the file's.
 * Returns the action for this round, or null when the browse set is exhausted (which is the
 * signal to enter CLOSEOUT).
 *
 * A prescription outranks MAX_ROUNDS, exactly as written. That is only safe because every
 * prescription chain is now bounded: interact-again is capped by DISPLAYS.md rule 9 (one
 * restructure per display per visit), and wait-again decays geometrically at a chance capped at
 * 0.5. Re-check that property before adding any new prescription.
 */
export function DetermineNextBrowseAction(npc, world, snapshot) {
  if (npc.prescribed) {                       // "IF THERE IS A PRESCRIBED NEXT ACTION, IT IS TAKEN"
    const forced = npc.prescribed;
    npc.prescribed = null;
    return forced;
  }
  if (npc.roundsInStore >= npc.maxRounds) return null;   // MAX_ROUNDS exceeded
  const set = browseActionSet(npc, world, snapshot);
  if (!set.length) return null;                          // "no more items possible in the set"
  return set[Math.floor(world.rng() * set.length)];
}

// ---------------------------------------------------------------- display interaction
//
// DISPLAYS.md §9, implemented as its pseudocode is written. The return value IS the prescription
// rule: "Interaction Not Complete" is what makes the NPC interact again next round.

const cellsOf = (display, shelf) => {
  const out = [];
  for (let r = 0; r < display.g.rows; r++)
    for (let c = 0; c < display.g.cols; c++)
      if (usableAt(display.g, shelf, c, r)) out.push({ c, r });
  return out;
};

/**
 * Rebuild one plane from scratch in a given order. All three of DISPLAYS.md's interaction outcomes
 * — spread, tidy, rearrange — are this function with a different order, which is why there is one
 * of it and not three. Whatever is placed LAST ends up on top of its column, i.e. noticeable.
 */
function rebuildPlane(display, items, shelf, order, { spread = false } = {}) {
  const g = display.g;
  clearShelf(g, shelf);
  const cells = cellsOf(display, shelf)
    .filter((cell) => !(display.kind === 'shelf' && cell.r === display.wallRow) || !spread);
  let cursor = 0;
  for (const index of order) {
    const item = items[index];
    let placed = false;
    for (let attempt = 0; attempt < cells.length; attempt++) {
      const cell = cells[(cursor + attempt) % cells.length];
      const keys = footprint(g, shelf, cell.c, cell.r, item.w, item.h);
      if (!fits(g, keys, item.layers ?? 1)) continue;
      item.c = cell.c; item.r = cell.r; item.keys = keys;
      item.layer = place(g, keys, index, item.layers ?? 1);
      if (spread) cursor = (cursor + attempt + 1) % cells.length;   // one per column: flatten
      placed = true;
      break;
    }
    // ponytail: a plane with no room left keeps the item's old slot record, which the renderer
    // still draws. Only reachable if headroom is set absurdly low; revisit if it shows up.
    if (!placed) item.layer = place(g, item.keys, index, item.layers ?? 1);
  }
}

/**
 * One round's worth of interaction with a display. Returns 'complete' | 'incomplete', which the
 * caller turns into a prescription. DISPLAYS.md §8: an interaction never spans rounds.
 */
export function interact(npc, display, world) {
  const items = world.items;
  const t = npc.traits;

  // --- "if (can Buy from pile)" -------------------------------------------------------------
  //
  // DISPLAYS.md now gates the buy on the PREVIOUS round: "An item will be *bought* if it was
  // *considered* in the previous round AND the consideration interaction came back 'true'."
  // So buying is no longer something that can happen the instant an NPC walks up — they pick a
  // thing up, turn it over, and decide next round. That deliberate beat is the whole point of the
  // new mechanic, and it is why `npc.considering` is state rather than a local.
  //
  // MVP: "100% of considered items will be purchased. Later this wont be true."
  const pending = npc.considering;
  if (pending && pending.displayId === display.id && available(items[pending.index]) &&
      noticeable(display, items, pending.index)) {
    const index = pending.index;
    const item = items[index];
    const want = wantFor(npc, item);
    npc.considering = null;
    if (want) {
      item.gone = true;                      // "Inventory removed from display"
      rebuildPlane(display, items, item.shelf, onPlane(display, items, item.shelf));
      const bought = { ...item };
      npc.bought.push(bought);
      npc.carrying = bought;
      const wip = stow(npc, bought, want);
      npc.willReturn = true;      // "NPC Visitors who manage to either buy any items or..."
      say(world, npc, `bought ${labelOf(bought)} for ${want.wip}` +
        (wip?.state === WIP_STATE.IN_PROGRESS ? ' — that WIP can be started now' : ''));
      return 'complete';
    }
  }
  // Whatever they were holding is no longer wanted, or has gone. Put it down.
  npc.considering = null;

  // --- "If (Rules for display result in Consideration)" -------------------------------------
  //
  // "An NPC with OPEN WIP SLOTS has a list of wants that can be satisfied by the items in the
  // display inventory. If any accessible items match a want (this is determined by Formation and
  // is independent of NPC personality or preference), the NPC will consider the item."
  //
  // Note what is NOT consulted here: personality, craft preference, taste. The spec is explicit
  // that consideration is a formation question — does this complete a project — so an NPC picks up
  // a ball of a colour they dislike if it is the yarn their pattern needs.
  const candidates = consideredHere(npc, display, items);
  if (candidates.length) {
    const index = candidates[0];
    npc.considering = { displayId: display.id, index, round: world.round };
    say(world, npc, `considered ${labelOf(items[index])}`);
    return 'incomplete';
  }

  // --- "else If (Rules for display result in Rearrange or Tidy)" ----------------------------
  const shelf = pickPlane(display, items, npc);
  const present = onPlane(display, items, shelf);
  const mine = present.filter((i) => matchesAnyWant(npc, items[i]));

  // Order matters: DISPLAYS.md lists these "in order of satisfying".
  // DISPLAYS.md rule 9: an NPC may restructure a given display at most ONCE per visit, after which
  // further interactions can only Buy or Look. That rule is what makes "Interaction Not Complete"
  // terminate instead of prescribing the same tidy every round forever.
  const canRestructure = !npc.restructured.includes(display.id);

  if (canRestructure && display.kind === 'pile' && t.Orderliness === 1 && present.length) {
    npc.restructured.push(display.id);
    rebuildPlane(display, items, shelf, present, { spread: true });
    say(world, npc, 'Orderliness 1 — spread the pile out into a mess');
    return 'incomplete';
  }
  if (canRestructure && display.kind === 'pile' && t.Orderliness === 5 && present.length) {
    npc.restructured.push(display.id);
    const sorted = [...present].sort((a, b) => items[a].name.localeCompare(items[b].name));
    rebuildPlane(display, items, shelf, sorted);
    say(world, npc, 'Orderliness 5 — tidied the pile by category');
    return 'incomplete';
  }
  const rearrangeGate = display.kind === 'pile' ? 3 : 4;   // pile > 3, shelf > 4
  if (canRestructure && mine.length && t.Assertiveness > rearrangeGate) {
    npc.restructured.push(display.id);
    const rest = present.filter((i) => !mine.includes(i));
    rebuildPlane(display, items, shelf, [...rest, ...mine]);   // wanted items placed last => on top
    say(world, npc, `Assertiveness ${t.Assertiveness} — dug out what they needed to the top`);
    return 'incomplete';
  }

  // --- "else" — they look, and that is the end of it ----------------------------------------
  //
  // CHARACTER-VISIT.md: "Volatility=5: an interaction with a Noticed Display that does not result
  // in finding what they need will reduce original calculation of MAX_ROUNDS to 1". This is the
  // one branch that genuinely finds nothing — a consideration or a restructure returns above, and
  // both are on their way to finding something.
  if (t.Volatility === 5 && npc.maxRounds > 1) {
    npc.maxRounds = 1;
    npc.stormedOut = true;
    say(world, npc, `Volatility 5 — nothing at the ${display.id}, MAX_ROUNDS cut to 1`);
    return 'complete';
  }
  say(world, npc, `looked over the ${display.id}, nothing doing`);
  return 'complete';
}

/**
 * Which plane of a multi-level display this NPC is looking at: the one holding something they want.
 *
 * Asks `matchesAnyWant`, not `matchesTarget`. `matchesTarget` compares `item.name` against
 * `target.name`, and a want has no `name` — so once `npc.target` became a want this silently
 * matched nothing and every NPC restructured shelf 0 regardless of where their yarn was. It is
 * also the right question on its own terms: an NPC has a whole shopping list, not one headline.
 */
function pickPlane(display, items, npc) {
  for (let s = 0; s < display.g.shelves; s++) {
    if (onPlane(display, items, s).some((i) => matchesAnyWant(npc, items[i]))) return s;
  }
  return 0;
}

// One label function for the whole game, in catalog.js — it is the only place that knows a yarn
// is named by its weight and material rather than by the word "yarn". Re-exported here because
// every consumer of the sim already imports from this module.
export const labelOf = labelItem;
// Wants are named by wip.js, which owns their shape. Re-exported for the same reason labelOf is:
// every consumer of the sim already imports from this module.
export { labelWant };

// ---------------------------------------------------------------- the round

/**
 * Advance the whole world exactly one round. Every NPC decides from `snapshot` — the state as it
 * was at the END of the previous round — because CHARACTER-VISIT.md is explicit that approach
 * targets use last-round positions ("it's possible to walk to a spot where a target NPC is moving
 * away from. C'est la vie").
 */
export function advanceRound(world) {
  world.round += 1;
  const snapshot = world.npcs.map((n) => ({ id: n.id, x: n.x, z: n.z, state: n.state }));

  admitOne(world);                                   // the door, one NPC at a time
  for (const npc of world.npcs) stepNpc(npc, world, snapshot);
  separate(world);                                   // nobody ends the round inside anybody else

  return world.round;
}

/**
 * Push apart any two NPCs who chose end positions on top of each other.
 *
 * Rounds are resolved as teleports and the scene interpolates, so an NPC spends nearly all of its
 * visible life standing at a round's END position — which makes overlap at rest the overwhelming
 * share of the problem, and it is fixable here without any steering.
 *
 * ponytail: O(n²) relaxation over ~10 NPCs, three passes. Real separation steering during transit
 * (DESIGN-DECISIONS.md calls for grid A* plus steering) is still missing — two NPCs crossing the
 * room can still walk through each other on the way.
 */
function separate(world) {
  // Seated NPCs are pinned to their chair, and the one who just walked through the door has to be
  // left standing on the mat — shoving them off it would undo the whole point of the doorway.
  const movable = world.npcs.filter((n) =>
    (n.state === STATE.BROWSE || n.state === STATE.CLOSEOUT) &&
    n.seat === null && n.action?.type !== ACTION.ENTER);
  const gap = world.room.personalSpace;

  // The constraints (stay in the room, stay off the doormat) are applied INSIDE the loop, not
  // after it. Applied afterwards they shove people back into each other and undo the separation.
  // Convergence is likewise measured AFTER the constraints, for the same reason: a pass can look
  // solved right up until the doorway projection pushes two people back together.
  // Generous pass budget: this is pairwise (Gauss-Seidel) relaxation, which converges slowly when
  // several NPCs form a CHAIN pinned against a boundary — the dropOff row is exactly that. It runs
  // once per round, not per frame, so ~64 passes over ~10 NPCs costs nothing worth measuring.
  //
  // `slide` is a TANGENTIAL term, switched on only once the straight push has stopped making
  // progress. Two NPCs in a slot between two chairs are pushed apart along a line the furniture
  // blocks: the straight term cancels exactly against the push-out and the pair never separates,
  // however many passes it gets. Rotating the pair is the only way out of a collinear pin, and
  // nothing in a purely radial push can find it. The sign comes from the pair's own indices, so a
  // seed still replays identically.
  let stalled = 0, previous = Infinity;
  for (let pass = 0; pass < 64; pass++) {
    const slide = stalled > 2 ? 0.5 : 0;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i], b = movable[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len >= gap) continue;
        // Direction and distance are separate: exactly coincident NPCs have no direction, but the
        // overlap is still the full gap. Faking the distance to 1 here makes the push NEGATIVE and
        // pulls them together instead.
        const [ux, uz] = len < 1e-6 ? [1, 0] : [dx / len, dz / len];
        const push = (gap - len) / 2 + 1e-4;   // overshoot a hair, so it converges instead of grazing
        const turn = slide * ((i + j) % 2 ? 1 : -1);
        const vx = ux - uz * turn, vz = uz + ux * turn;
        a.x -= vx * push; a.z -= vz * push;
        b.x += vx * push; b.z += vz * push;
      }
    }
    for (const npc of movable) constrain(world, npc);
    const worst = worstOverlap(movable, gap);
    if (worst <= 0) break;
    stalled = worst >= previous - 1e-6 ? stalled + 1 : 0;
    previous = worst;
  }
}

function worstOverlap(movable, gap) {
  let worst = 0;
  for (let i = 0; i < movable.length; i++)
    for (let j = i + 1; j < movable.length; j++)
      worst = Math.max(worst, gap - Math.hypot(movable[i].x - movable[j].x, movable[i].z - movable[j].z));
  return worst;
}

/** Keep one NPC inside the room and off the doormat. */
function constrain(world, npc) {
  const { minX, maxX, minZ, maxZ } = world.room.bounds;
  npc.x = clamp(npc.x, minX, maxX);
  npc.z = clamp(npc.z, minZ, maxZ);
  // Routing keeps them out of the furniture in TRANSIT; this keeps them out of it at REST, where
  // separation nudges and random wander spots can both drop somebody inside a table.
  pushOutOfFurniture(world, npc);
  npc.x = clamp(npc.x, minX, maxX);
  npc.z = clamp(npc.z, minZ, maxZ);
  if (!inDoorway(world, npc)) return;
  const dx = npc.x - world.room.door.x, dz = npc.z - world.room.door.z;
  const len = Math.hypot(dx, dz);
  // Dead centre on the mat has no direction to push along — step straight into the shop.
  const ux = len < 1e-6 ? 0 : dx / len;
  const uz = len < 1e-6 ? -1 : dz / len;
  npc.x = clamp(world.room.door.x + ux * world.room.doorClearance, minX, maxX);
  npc.z = clamp(world.room.door.z + uz * world.room.doorClearance, minZ, maxZ);
}

/**
 * The door is a single-occupancy lock, which is what makes NPCs enter one at a time physically
 * rather than just logically. Leaving takes the same lock, so an arrival can be held up behind a
 * departure — that congestion is the point of modelling it as a lock at all.
 */
function admitOne(world) {
  if (world.door.busy !== null) return;
  const next = world.npcs.find((n) => n.state === STATE.QUEUED);
  if (!next) return;
  world.door.busy = next.id;
  next.state = STATE.ENTERING;
}

function stepNpc(npc, world, snapshot) {
  npc.from = { x: npc.x, z: npc.z };
  npc.lastAction = npc.action;
  // A round that resolves WITHOUT a move must not inherit last round's waypoints: the renderer
  // would walk that stale detour and loop back to where it started, since the destination is now
  // where the NPC already is. Cleared here, at the one point every round passes through.
  npc.path = [];

  switch (npc.state) {
    case STATE.QUEUED:
      npc.action = { type: ACTION.QUEUE, params: {} };
      say(world, npc, 'waiting outside — the door is busy');
      return;

    case STATE.ENTERING:
      npc.action = { type: ACTION.ENTER, params: {} };
      moveTo(world, npc, world.room.door);
      npc.state = STATE.BROWSE;
      world.door.busy = null;
      say(world, npc, `came in looking for ${labelWant(npc.target)}`);
      return;

    case STATE.BROWSE:
      npc.roundsInStore += 1;
      return stepBrowse(npc, world, snapshot);

    case STATE.CLOSEOUT:
      npc.roundsInStore += 1;
      return stepCloseout(npc, world);

    case STATE.LEAVING:
      npc.action = { type: ACTION.LEAVE, params: {} };
      moveTo(world, npc, world.room.outside);
      npc.state = STATE.GONE;
      world.door.busy = null;
      say(world, npc, 'left');
      return;

    default:                                          // GONE
      npc.action = null;
  }
}

function stepBrowse(npc, world, snapshot) {
  const action = DetermineNextBrowseAction(npc, world, snapshot);
  if (!action) {                                      // browse set exhausted, or MAX_ROUNDS hit
    npc.state = STATE.CLOSEOUT;
    npc.closeoutStep = 0;
    say(world, npc, npc.roundsInStore >= npc.maxRounds
      ? `MAX_ROUNDS ${npc.maxRounds} reached — closing out`
      : 'nothing left to do — closing out');
    return stepCloseout(npc, world);
  }

  npc.action = action;
  const display = world.displays.find((d) => d.id === action.params.displayId);

  // Getting up is implicit: anything that is not sitting and working frees the chair for whoever
  // is waiting on one.
  if (action.type !== ACTION.WORK_ON_WIP && action.type !== ACTION.WALK_TO_SEAT) {
    releaseSeat(world, npc);
  }

  switch (action.type) {
    case ACTION.WALK_TO_DISPLAY:
      moveTo(world, npc, display.standAt);
      npc.atDisplay = display.id;
      // "PRESCRIBED NEXT ACTION: Interact with noticed display."
      npc.prescribed = { type: ACTION.INTERACT, params: { displayId: display.id } };
      say(world, npc, `walked to the ${display.id} (attractiveness ` +
                      `${attractiveness(npc, display, world.items).toFixed(2)})`);
      return;

    case ACTION.INTERACT: {
      const outcome = interact(npc, display, world);
      // "If NPC finds something to interact with inside the noticed display then PRESCRIBED NEXT
      //  ACTION is once again Interact with noticed display. Otherwise it's None"
      npc.prescribed = outcome === 'incomplete'
        ? { type: ACTION.INTERACT, params: { displayId: display.id } }
        : null;
      return;
    }

    case ACTION.WALK_TO_NPC: {
      const other = snapshot.find((o) => o.id === action.params.npcId);
      moveTo(world, npc, approach(npc, other, world.room.personalSpace));
      npc.atDisplay = null;
      npc.prescribed = { type: ACTION.WAIT, params: {} };   // "NPC wait 1 round"
      say(world, npc, `went over to ${world.npcs.find((n) => n.id === other.id).name}`);
      return;
    }

    case ACTION.WALK_TO_SEAT: {
      const seat = seatById(world, action.params.seatId);
      // Somebody else may have taken it since the set was built — fall back to any other free one.
      const free = seat && seat.occupiedBy === null ? seat : freeSeats(world, npc)[0];
      if (!free) {                       // every chair is taken; wander instead of standing still
        npc.action = { type: ACTION.MOVE, params: {} };
        moveTo(world, npc, randomSpot(world));
        npc.atDisplay = null;
        npc.prescribed = null;
        say(world, npc, 'went looking for a seat, all taken');
        return;
      }
      claimSeat(world, npc, free);
      moveTo(world, npc, free);
      npc.facing = free.facing ?? npc.facing;
      npc.atDisplay = null;
      npc.prescribed = { type: ACTION.WORK_ON_WIP, params: { ...action.params, seatId: free.id } };
      say(world, npc, `took a seat to work on ${action.params.wip}`);
      return;
    }

    case ACTION.WORK_ON_WIP: {
      const seat = npc.seat !== null ? seatById(world, npc.seat) : null;
      if (seat) npc.facing = seat.facing ?? npc.facing;
      npc.prescribed = null;
      const wip = npc.wips.find((w) => w.id === action.params.wip);
      if (!wip) return;                     // it finished, or the slot went away
      if (wip.state !== WIP_STATE.IN_PROGRESS) {
        // Sitting down with a project you cannot start yet is still what the round was spent on.
        say(world, npc, `sat with ${wip.id}, but it is ${wip.state.toLowerCase()}`);
        return;
      }
      // Deterministic progress, per the spec's formula — no dice. How long a thing takes is a
      // property of the pattern and the crafter, which is what lets the player reason about it.
      // "work on a WIP" means actually working on it — sitting down with something you cannot
      // start yet, handled above, is not the same thing and does not earn a return.
      npc.satAndWorked = true;
      npc.willReturn = true;
      const done = workRound(npc, wip, world.round);
      say(world, npc, done
        ? `finished ${labelOf(wip.pattern)}! (crafter skill now ${npc.prefs.skill})`
        : `worked on ${labelOf(wip.pattern)} — ${Math.round(wip.progress)}%`);
      return;
    }

    case ACTION.WAIT: {
      const near = world.npcs.some((o) => o.id !== npc.id && o.state === STATE.BROWSE &&
                                          dist2(npc, o) < world.room.personalSpace ** 2);
      if (near) npc.chatted = true;
      npc.prescribed = near && world.rng() < keepChattingChance(npc.traits)
        ? { type: ACTION.WAIT, params: {} }
        : null;
      say(world, npc, near ? 'stayed to keep chatting' : 'waited a round');
      return;
    }

    case ACTION.MOVE:
      moveTo(world, npc, randomSpot(world));
      npc.atDisplay = null;
      npc.prescribed = null;
      say(world, npc, 'wandered across the store');
      return;
  }
}

/**
 * CHARACTER-VISIT.md: signing ALWAYS produces an entry. What goes in it depends on whether they
 * have a finished object — one they brought in or one they completed here.
 *
 * TODO(spec): CHARACTER-ATTRIBUTES.md wants these written by a generator that makes an NPC sound
 * like themselves. This records WHAT the entry is; the prose is P5's job.
 */
/**
 * The tags on one entry, per CHARACTER-VISIT.md's icon list. Everything here is read off state the
 * visit already tracked, which is the point: a guestbook page should be a legible summary of what
 * actually happened, not a second set of bookkeeping that can disagree with the first.
 */
function guestbookTags(npc) {
  const tags = [];
  if (npc.bought.some((it) => it.name === 'yarn')) tags.push('yarn');
  if (npc.bought.some((it) => it.name === 'pattern')) tags.push('pattern');
  if (npc.bought.some((it) => TOOL_NOTIONS.includes(it.name))) tags.push('tool');
  if (npc.toLend.length) tags.push('lent');
  if (npc.chatted) tags.push('chatted');
  if (npc.satAndWorked) tags.push('sat');
  if (npc.roundsInStore >= npc.maxRounds && !npc.bought.length) tags.push('ranOut');
  if (npc.stormedOut) tags.push('huff');
  return tags;
}

function signGuestbook(world, npc) {
  // "The item in the PHOTO should be the most recently finished object, and the NPC should be
  // pictured in/with it even if they are not currently wearing it." Signing is 3rd-to-last and the
  // Drop Off 2nd-to-last, so anything being lent is still in their hands here — they are
  // photographed wearing it, and hand it over on the next step.
  const made = photoSubject(npc);
  const object = made ? labelOf(made.pattern) : null;
  const entry = object
    // `wornInPhoto` is what tells the renderer to put the object ON them for the picture even
    // though it is about to leave: the photo is the payoff, and the shop's copy is the leftover.
    ? { npc: npc.name, kind: 'photo', object, mood: null, round: world.round,
        wip: made, wornInPhoto: !Object.values(npc.worn).includes(made), tags: guestbookTags(npc) }
    // "happy (found what they are looking for) or disappointed (did not find what they needed)" —
    // buying something IS having found it, which is what the buy branch of interact() records.
    : { npc: npc.name, kind: 'note', object: null,
        mood: npc.bought.length ? 'happy' : 'disappointed', round: world.round,
        tags: guestbookTags(npc) };
  world.guestbook.push(entry);
  return entry;
}

/**
 * The steps THIS visit will take. Signing and leaving always happen; the Drop Off happens only if
 * there is something LEFT OVER to lend.
 *
 * WEARABLE-FINISHED-OBJ.md puts wearing first: an NPC keeps a finished object if its clothing slot
 * is free and "will not offer it to the shop to lend". So somebody who knits one hat walks out
 * wearing it and never visits the Drop Off at all — the shop only gets the second hat.
 */
export const closeoutFor = (npc) =>
  CLOSEOUT_SEQUENCE.filter((step) => step !== ACTION.DROP_OFF || npc.toLend.length > 0);

function stepCloseout(npc, world) {
  releaseSeat(world, npc);            // you do not stay in the chair on your way out
  // Decided once, when the closeout begins, and then followed. Recomputing it every round would
  // drop the Drop Off step out from under the sequence the moment lending empties npc.toLend —
  // leaving the NPC mid-walk with no step to take.
  if (npc.closeoutStep === 0) {
    // Decide what is worn and what is spare BEFORE the plan is built, since that is what the
    // Drop Off step is conditional on.
    npc.toLend = wearOrOffer(npc);
    npc.closeout = closeoutFor(npc);
  }
  const type = npc.closeout[npc.closeoutStep];
  npc.action = { type, params: {} };

  if (type === ACTION.SIGN_GUESTBOOK) {
    moveTo(world, npc, world.room.guestbook);
    npc.closeoutStep += 1;
    const entry = signGuestbook(world, npc);
    say(world, npc, entry.kind === 'photo'
      ? `signed the Guestbook — a picture of them holding ${entry.object}`
      : `signed the Guestbook — a ${entry.mood} note`);
    return;
  }
  if (type === ACTION.DROP_OFF) {
    moveTo(world, npc, world.room.dropOff);
    npc.closeoutStep += 1;
    // Lent, not given: it goes on display in the shop and the NPC can be handed it back later
    // (returnToNpc in wip.js), which is why the WIP itself is recorded rather than a label.
    // THIS is where it leaves the WIP slots, per the spec — not earlier, and so not before the
    // Guestbook photo two steps back.
    const wip = lend(npc, npc.toLend.shift());
    world.dropOff.push({ npc: npc.name, npcId: npc.id, wip, object: labelOf(wip.pattern),
                         round: world.round });
    say(world, npc, `lent ${labelOf(wip.pattern)} to the Drop Off`);
    return;
  }
  // LEAVE — needs the door, and may have to queue for it behind an arrival.
  if (world.door.busy !== null && world.door.busy !== npc.id) {
    say(world, npc, 'waiting for the doorway to clear');
    return;
  }
  world.door.busy = npc.id;
  moveTo(world, npc, world.room.door);
  npc.state = STATE.LEAVING;
  if (npc.willReturn && !world.returning.some((r) => r.id === npc.id)) {
    world.returning.push(npc);
    say(world, npc, 'heading for the door — and will be back');
    return;
  }
  say(world, npc, 'heading for the door');
}

// ---------------------------------------------------------------- coming back
//
// CHARACTER-VISIT.md: "A returning NPC comes back as themselves: same traits and craft
// preferences, same crafter skill level (including any +1 earned by finishing something), same WIP
// slots at the progress they left them at, and still wearing whatever they were wearing."
//
// This is the mechanic that makes long projects possible at all. A sweater is twenty units, which
// at an average crafter is twenty rounds of SITTING — more than one visit's worth of rounds even
// before browsing. Without carrying progress across visits, nothing but a cowl would ever be
// finished, and CHARACTER-ATTRIBUTES.md's promise that knowing your customers yields more Finished
// Objects would have no way to come true.

/**
 * Everything a fresh visit resets. Listed explicitly rather than as "rebuild the NPC and copy a
 * few fields over", because the interesting failure is the opposite of a crash: a customer who
 * quietly comes back a stranger, with their skill or their half-knitted sweater silently gone.
 * Anything NOT named here persists on purpose.
 */
export function rejoin(npc, { at, rng = Math.random } = {}) {
  npc.state = STATE.QUEUED;
  npc.roundsInStore = 0;
  npc.maxRounds = maxRounds(npc.traits, rng);   // fresh patience, same temperament
  npc.action = null;
  npc.lastAction = null;
  npc.prescribed = null;
  npc.atDisplay = null;
  npc.considering = null;
  npc.bought = [];
  npc.carrying = null;
  npc.seat = null;
  npc.path = [];
  // DISPLAYS.md rule 9 is explicitly per-visit: "an NPC who leaves and comes back on a later visit
  // starts fresh", so they may restructure the same display again.
  npc.restructured = [];
  npc.closeoutStep = 0;
  npc.closeout = [];
  npc.toLend = [];
  npc.chatted = false;
  npc.satAndWorked = false;
  npc.stormedOut = false;
  npc.willReturn = false;
  npc.note = '';
  npc.visits += 1;
  // Kept, deliberately: traits, prefs (including earned skill), wips and their progress, worn.
  if (at) { npc.x = at.x; npc.z = at.z; npc.from = { ...at }; }
  return npc;
}

/** The shop's regulars, most recently seen first. */
export const regulars = (world) => [...world.returning].reverse();

// ---------------------------------------------------------------- movement
//
// TODO: this is teleport-per-round with the scene interpolating a straight line between rounds.
// DESIGN-DECISIONS.md calls for grid A* with string-pulling plus separation steering, and there is
// no walk animation yet either. Both are on the list in VISIT-POC-TODO.md.

function moveTo(world, npc, to) {
  // The route is from where they ARE to where they are going. The renderer walks it; the sim still
  // arrives this round, which is what keeps rounds lockstep.
  npc.path = findPath(world, npc, to);
  const first = npc.path[0] ?? to;
  npc.facing = Math.atan2(first.x - npc.x, first.z - npc.z);
  npc.x = to.x;
  npc.z = to.z;
}

/** Stop a personal-space distance short of the target rather than standing inside them. */
function approach(npc, to, gap) {
  const dx = to.x - npc.x, dz = to.z - npc.z;
  const len = Math.hypot(dx, dz) || 1;
  if (len <= gap) return { x: npc.x, z: npc.z };
  return { x: to.x - (dx / len) * gap, z: to.z - (dz / len) * gap };
}

/** "Generate a random XY target not inside a display" — nor inside a chair, nor on the doormat. */
function randomSpot(world) {
  const { minX, maxX, minZ, maxZ } = world.room.bounds;
  for (let attempt = 0; attempt < 30; attempt++) {
    const p = {
      x: minX + world.rng() * (maxX - minX),
      z: minZ + world.rng() * (maxZ - minZ),
    };
    if (inDoorway(world, p)) continue;
    const clearOfDisplays = world.displays.every((d) =>
      Math.abs(p.x - d.x) > d.w / 2 + 0.25 || Math.abs(p.z - d.z) > d.d / 2 + 0.25);
    const clearOfSeats = world.seats.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > 0.4);
    if (clearOfDisplays && clearOfSeats) return p;
  }
  return { x: 0, z: 0 };
}

export { EMPTY };
