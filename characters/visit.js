// The NPC VISIT state machine: VISIT = BROWSE, then CLOSEOUT.
//
// Pure sim per DESIGN-DECISIONS.md §3: ZERO three.js, ZERO DOM, so it is node-testable
// (see visit.test.mjs). The scene reads this state and draws it; it never owns it.
//
// Specs this implements, and it implements them literally rather than approximately:
//   ai_planning_sessions/characters/CHARACTER-VISIT.md       round loop, action set, prescriptions
//   ai_planning_sessions/characters/CHARACTER-ATTRIBUTES.md  the 10 trait assets
//   ai_planning_sessions/inventory/DISPLAYS.md               what happens inside one interaction
//
// Where a spec section is blank or undefined, the placeholder is marked `TODO(spec)` and listed in
// VISIT-POC-TODO.md rather than being quietly invented and forgotten.

import { EMPTY, footprint, fits, place, topAt, clearShelf, usableAt } from '../inventory/grid.js';

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
 * TODO(spec): CHARACTER-VISIT.md ends with the heading "Calculation of MAX_ROUNDS from Character
 * attributes:" and no body. This placeholder is shaped like the real thing so the loop runs, and is
 * deliberately trait-driven rather than constant so the debug panel shows two different dwell times:
 * an eager, dogged shopper stays; an anxious one leaves early.
 */
export function maxRounds(t) {
  return clamp(4 + t.Enthusiasm + t.Industriousness - t.Withdrawal, 3, 18);
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

export function makeNpc({ id, name, species, target, traits, rng = Math.random }) {
  const t = traits ?? randomTraits(rng);
  return {
    id, name, species,
    traits: t,
    target,                       // the target formation: one notion. { name, size }
    state: STATE.QUEUED,
    x: 0, z: 0,                   // centroid at the END of the round just resolved
    from: { x: 0, z: 0 },         // where it was at the start of it, so the scene can interpolate
    facing: 0,
    roundsInStore: 0,
    maxRounds: maxRounds(t),
    action: null,                 // { type, params } chosen for the round just resolved
    lastAction: null,             // the round before that — the "Round N-1" the spec keeps citing
    prescribed: null,             // { type, params } forced for the NEXT round, or null
    atDisplay: null,
    // TODO(spec): WIPs are a placeholder count. The real model (P5) carries a pattern, yarn and
    // progress. Only the COUNT matters to the browse set today: more WIPs, more chance of the
    // "work on a WIP" action being drawn.
    wips: Array.from({ length: 1 + Math.floor(rng() * 3) }, (_, i) => `WIP ${i + 1}`),
    carrying: null,               // the notion once bought — CHARACTER-VISIT has them leave with it
    seat: null,                   // id of the seat this NPC currently occupies, or null
    restructured: [],             // displays this NPC has already tidied/spread/dug through
    closeoutStep: 0,
    note: '',                     // one line of "why", for the debug panel
  };
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
export function fullyExposed(display, items, index) {
  const item = items[index];
  for (let dr = 0; dr < (item.h ?? 1); dr++)
    for (let dc = 0; dc < (item.w ?? 1); dc++)
      if (topAt(display.g, item.shelf, item.c + dc, item.r + dr) !== index) return false;
  return true;
}

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
  if (holdsTarget(display, items, npc.target)) a += 0.45;   // it has what they came for
  if (buyableTargets(display, items, npc.target).length) a += 0.10;   // and it is right there
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
  if (npc.seat !== null) {
    for (const wip of npc.wips) set.push({ type: ACTION.WORK_ON_WIP, params: { wip, seatId: npc.seat } });
  } else {
    const open = freeSeats(world, npc);
    if (open.length) {
      const nearest = open.reduce((m, s) => (dist2(npc, s) < dist2(npc, m) ? s : m));
      for (const wip of npc.wips) {
        set.push({ type: ACTION.WALK_TO_SEAT, params: { wip, seatId: nearest.id } });
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
      if (!fits(g, keys)) continue;
      item.c = cell.c; item.r = cell.r; item.keys = keys;
      item.layer = place(g, keys, index);
      if (spread) cursor = (cursor + attempt + 1) % cells.length;   // one per column: flatten
      placed = true;
      break;
    }
    // ponytail: a plane with no room left keeps the item's old slot record, which the renderer
    // still draws. Only reachable if headroom is set absurdly low; revisit if it shows up.
    if (!placed) item.layer = place(g, item.keys, index);
  }
}

/**
 * One round's worth of interaction with a display. Returns 'complete' | 'incomplete', which the
 * caller turns into a prescription. DISPLAYS.md §8: an interaction never spans rounds.
 */
export function interact(npc, display, world) {
  const items = world.items;
  const t = npc.traits;

  // if (can Buy from pile)
  const buyable = buyableTargets(display, items, npc.target);
  if (buyable.length) {
    const index = buyable[0];
    const item = items[index];
    item.gone = true;                      // "Inventory removed from display"
    rebuildPlane(display, items, item.shelf,
                 onPlane(display, items, item.shelf));   // the stack settles into the gap
    npc.carrying = { name: item.name, size: item.size };
    say(world, npc, `picked up ${labelOf(npc.target)} — target formation satisfied`);
    return 'complete';
  }

  // else: does this NPC's personality make them rearrange it?
  const shelf = pickPlane(display, items, npc);
  const present = onPlane(display, items, shelf);
  const mine = present.filter((i) => matchesTarget(items[i], npc.target));

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
    rebuildPlane(display, items, shelf, [...rest, ...mine]);   // target placed last => on top
    say(world, npc, `Assertiveness ${t.Assertiveness} — dug their ${labelOf(npc.target)} out to the top`);
    return 'incomplete';
  }

  say(world, npc, `looked over the ${display.id}, nothing doing`);
  return 'complete';
}

/** Which plane of a multi-level display this NPC is looking at: the one holding their target. */
function pickPlane(display, items, npc) {
  for (let s = 0; s < display.g.shelves; s++) {
    if (onPlane(display, items, s).some((i) => matchesTarget(items[i], npc.target))) return s;
  }
  return 0;
}

export const labelOf = (target) =>
  target.size == null ? target.name : `${target.name} ${target.size.toFixed(1)}mm`;

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
  for (let pass = 0; pass < 64; pass++) {
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
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
    for (const npc of movable) constrain(world, npc);
    if (worstOverlap(movable, gap) <= 0) break;
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

  switch (npc.state) {
    case STATE.QUEUED:
      npc.action = { type: ACTION.QUEUE, params: {} };
      say(world, npc, 'waiting outside — the door is busy');
      return;

    case STATE.ENTERING:
      npc.action = { type: ACTION.ENTER, params: {} };
      moveTo(npc, world.room.door);
      npc.state = STATE.BROWSE;
      world.door.busy = null;
      say(world, npc, `came in looking for ${labelOf(npc.target)}`);
      return;

    case STATE.BROWSE:
      npc.roundsInStore += 1;
      return stepBrowse(npc, world, snapshot);

    case STATE.CLOSEOUT:
      npc.roundsInStore += 1;
      return stepCloseout(npc, world);

    case STATE.LEAVING:
      npc.action = { type: ACTION.LEAVE, params: {} };
      moveTo(npc, world.room.outside);
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
      moveTo(npc, display.standAt);
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
      moveTo(npc, approach(npc, other, world.room.personalSpace));
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
        moveTo(npc, randomSpot(world));
        npc.atDisplay = null;
        npc.prescribed = null;
        say(world, npc, 'went looking for a seat, all taken');
        return;
      }
      claimSeat(world, npc, free);
      moveTo(npc, free);
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
      say(world, npc, `sat and worked on ${action.params.wip}`);
      return;
    }

    case ACTION.WAIT: {
      const near = world.npcs.some((o) => o.id !== npc.id && o.state === STATE.BROWSE &&
                                          dist2(npc, o) < world.room.personalSpace ** 2);
      npc.prescribed = near && world.rng() < keepChattingChance(npc.traits)
        ? { type: ACTION.WAIT, params: {} }
        : null;
      say(world, npc, near ? 'stayed to keep chatting' : 'waited a round');
      return;
    }

    case ACTION.MOVE:
      moveTo(npc, randomSpot(world));
      npc.atDisplay = null;
      npc.prescribed = null;
      say(world, npc, 'wandered across the store');
      return;
  }
}

function stepCloseout(npc, world) {
  releaseSeat(world, npc);            // you do not stay in the chair on your way out
  const type = CLOSEOUT_SEQUENCE[npc.closeoutStep];
  npc.action = { type, params: {} };

  if (type === ACTION.SIGN_GUESTBOOK) {
    moveTo(npc, world.room.guestbook);
    npc.closeoutStep += 1;
    say(world, npc, npc.carrying ? 'signed the Guestbook with their haul' : 'signed the Guestbook');
    return;
  }
  if (type === ACTION.DROP_OFF) {
    moveTo(npc, world.room.dropOff);
    npc.closeoutStep += 1;
    say(world, npc, 'lent a finished object to the Drop Off');
    return;
  }
  // LEAVE — needs the door, and may have to queue for it behind an arrival.
  if (world.door.busy !== null && world.door.busy !== npc.id) {
    say(world, npc, 'waiting for the doorway to clear');
    return;
  }
  world.door.busy = npc.id;
  moveTo(npc, world.room.door);
  npc.state = STATE.LEAVING;
  say(world, npc, 'heading for the door');
}

// ---------------------------------------------------------------- movement
//
// TODO: this is teleport-per-round with the scene interpolating a straight line between rounds.
// DESIGN-DECISIONS.md calls for grid A* with string-pulling plus separation steering, and there is
// no walk animation yet either. Both are on the list in VISIT-POC-TODO.md.

function moveTo(npc, to) {
  npc.facing = Math.atan2(to.x - npc.x, to.z - npc.z);
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
