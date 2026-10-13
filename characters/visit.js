// CHARACTER-VISIT.md, DISPLAYS.md, WIP-AND-FINISHED-OBJ-FORMATION.md; open spec gaps in VISIT-POC-TODO.md

import { EMPTY, footprint, fits, place, clearShelf, usableAt, fullyExposed, dropLayer }
  from '../inventory/grid.js';
import {
  WIP_STATE, WEAR_SLOTS, makeCraftPrefs, makeWip, wantFor, stow, workRound,
  wearOrOffer, photoSubject, lend, labelWant, runningOut, wantsOf, progressLimit, readyWips, roundsToFinish,
} from './wip.js';
import { labelOf as labelItem, TOOL_NOTIONS } from '../inventory/catalog.js';
import { placeWord, thankYou } from './guestbook.js';

export const labelOf = labelItem;
export { labelWant };

export const TRAITS = Object.freeze([
  'Volatility', 'Withdrawal',
  'Enthusiasm', 'Assertiveness',
  'Intellect', 'Openness',
  'Compassion', 'Politeness',
  'Industriousness', 'Orderliness',
]);

export function randomTraits(rng = Math.random) {
  return Object.fromEntries(TRAITS.map((t) => [t, 1 + Math.floor(rng() * 5)]));
}

export const maxWips = (t) => t.Enthusiasm + t.Openness + t.Volatility;

// CHARACTER-VISIT.md MAX_ROUNDS
export function maxRounds(t, rng = Math.random) {
  return Math.max(1, Math.round((t.Openness + t.Industriousness + t.Enthusiasm) * (1 + rng())));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// CHARACTER-VISIT.md: /10 to approach, /20 to keep chatting
const approachChance = (t) => (t.Enthusiasm + t.Assertiveness) / 10;
const keepChattingChance = (t) => (t.Enthusiasm + t.Assertiveness) / 20;

export const ACTION = Object.freeze({
  WALK_TO_DISPLAY: 'Walk to a Noticed Display',
  INTERACT:        'Interact with a Noticed Display',
  WALK_TO_NPC:     'Walk to closest NPC',
  WALK_TO_SEAT:    'Walk to an open seat',
  WORK_ON_WIP:     'Work on a project from WIPs',
  WAIT:            'Wait a Round',
  MOVE:            'Move around the store to a spot',
  SIGN_GUESTBOOK:  'Sign the Guestbook',
  DROP_OFF:        'Lend a finished object',
  LEAVE:           'Leave through the door',
  ENTER:           'Enter through the door',
  QUEUE:           'Wait outside for the door',
});

export const CLOSEOUT_SEQUENCE = Object.freeze([
  ACTION.SIGN_GUESTBOOK, ACTION.DROP_OFF, ACTION.LEAVE,
]);

export const STATE = Object.freeze({
  QUEUED: 'QUEUED', ENTERING: 'ENTERING', BROWSE: 'BROWSE',
  CLOSEOUT: 'CLOSEOUT', LEAVING: 'LEAVING', GONE: 'GONE',
});

/**
 * @param {{id: string, name: string, species: string, target?: any, traits?: any,
 *          prefs?: any, rng?: () => number}} seed  traits and prefs roll if not given
 */
export function makeNpc({ id, name, species, target, traits, prefs, rng = Math.random }) {
  const t = traits ?? randomTraits(rng);
  const p = prefs ?? makeCraftPrefs(rng);
  const wips = Array.from({ length: 1 + Math.floor(rng() * 3) },
                          (_, i) => makeWip(`WIP ${i + 1}`, t, p, rng));
  return {
    id, name, species,
    traits: t,
    prefs: p,
    target,
    x: 0, z: 0,
    from: { x: 0, z: 0 },
    facing: 0,
    wips,
    worn: Object.fromEntries(WEAR_SLOTS.map((s) => [s, null])),
    visits: 1,
    ...visitState(t, rng),
  };
}

function visitState(traits, rng) {
  return {
    state: STATE.QUEUED,
    roundsInStore: 0,
    maxRounds: maxRounds(traits, rng),
    action: null,
    lastAction: null,
    prescribed: null,
    atDisplay: null,
    considering: null,
    bought: [],
    carrying: null,
    path: [],
    seat: null,
    restructured: [],
    note: '',
    ...leavingState(),
  };
}

function leavingState() {
  return {
    closeoutStep: 0,
    closeout: [],
    toLend: [],
    chatted: false,
    satAndWorked: false,
    stormedOut: false,
    did: [],
    inView: false,
    willReturn: false,
  };
}

/**
 * @param room   door, guestbook, dropOff, queueAt and the walkable bounds
 * @param seats  [{ id, x, z, facing }], one per chair
 */
export function makeWorld({ displays, items, room, seats = [], rng = Math.random }) {
  return {
    round: 0,
    npcs: [],
    displays,
    items,
    room,
    seats: seats.map((s) => ({ ...s, occupiedBy: null })),
    door: { ...room.door, busy: null },
    guestbook: [],
    dropOff: [],
    backPile: [],
    returning: [],
    rng,
    log: [],
  };
}

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

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

// ponytail: treats a display as its AABB and ignores yaw; an OBB test when a display is placed at a real angle.
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

const nearestPoint = ({ x, z, w, d }, p) => ({
  x: clamp(p.x, x - w / 2, x + w / 2), z: clamp(p.z, z - d / 2, z + d / 2) });

export function visibleTo(world, from, display) {
  // CHARACTER-VISIT.md: the floor exception to centroid visibility
  const to = display.solid === false ? nearestPoint(display, from) : display;
  return !world.displays.some((d) =>
    d.id !== display.id && d.solid !== false && segmentHitsBox(from, to, d));
}

// ponytail: O(n²) edges rebuilt per query, no caching. ~34 nodes and ~1k segment tests per NPC per
// ROUND (not per frame), which is nothing. Cache the graph per layout if the room ever gets busy.

// VISIT-POC-TODO.md, "NPCs no longer walk through furniture"
const PATH_CLEARANCE = 0.22;
const TIGHT_CLEARANCE = 0.05;
const BODY_RADIUS = 0.12;

const insideBox = (p, b, pad = 0) =>
  Math.abs(p.x - b.x) <= b.w / 2 + pad && Math.abs(p.z - b.z) <= b.d / 2 + pad;

const grow = (b, pad) => ({ x: b.x, z: b.z, w: b.w + pad * 2, d: b.d + pad * 2 });

export function obstacles(world) {
  const out = world.displays
    .filter((d) => d.solid !== false)
    .map((d) => ({ x: d.x, z: d.z, w: d.w, d: d.d }));
  for (const s of world.seats) out.push({ x: s.x, z: s.z, w: s.w ?? 0.34, d: s.d ?? 0.34 });
  for (const b of world.room.solids ?? []) out.push({ x: b.x, z: b.z, w: b.w, d: b.d });
  return out;
}

const cornersOf = (b, pad) => {
  const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
  return [{ x: b.x - hw, z: b.z - hd }, { x: b.x + hw, z: b.z - hd },
          { x: b.x + hw, z: b.z + hd }, { x: b.x - hw, z: b.z + hd }];
};

function nudgeClear(p, boxes, pad) {
  const out = { x: p.x, z: p.z };
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

function routeAt(world, from, to, solid, pad) {
  const hit = solid.map((b) => grow(b, Math.max(0, pad - 0.02)));
  const blocked = (a, c) => hit.some((b) => segmentHitsBox(a, c, b));

  const start = nudgeClear(from, solid, pad);
  const goal = nudgeClear(to, solid, pad);
  if (!blocked(start, goal)) return fromStart([to], start, from);

  const nodes = graphNodes(world.room.bounds, [start, goal], solid, pad, hit);
  const prev = shortestPath(nodes, blocked);
  if (prev[1] < 0) return null;

  const path = [];
  for (let i = 1; i !== 0; i = prev[i]) path.unshift(nodes[i]);
  path[path.length - 1] = to;
  return fromStart(path, start, from);
}

function fromStart(path, start, from) {
  if (start.x !== from.x || start.z !== from.z) path.unshift(start);
  return path;
}

function graphNodes({ minX, maxX, minZ, maxZ }, ends, solid, pad, hit) {
  const nodes = [...ends];
  for (const b of solid)
    for (const c of cornersOf(b, pad))
      if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ &&
          !hit.some((o) => insideBox(c, o))) nodes.push(c);
  return nodes;
}

function shortestPath(nodes, blocked) {
  const n = nodes.length;
  const dist = Array.from({ length: n }, () => Infinity);
  const prev = Array.from({ length: n }, () => -1);
  const done = Array.from({ length: n }, () => false);
  dist[0] = 0;
  for (;;) {
    const u = nearestOpen(dist, done);
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
  return prev;
}

function nearestOpen(dist, done) {
  let u = -1;
  for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < (u < 0 ? Infinity : dist[u])) u = i;
  return u;
}

export function findPath(world, from, to) {
  const solid = obstacles(world).filter((b) => !insideBox(from, b) && !insideBox(to, b));
  if (!solid.some((b) => segmentHitsBox(from, to, grow(b, PATH_CLEARANCE - 0.02)))) return [to];

  for (const pad of [PATH_CLEARANCE, TIGHT_CLEARANCE]) {
    const path = routeAt(world, from, to, solid, pad);
    if (path) return path;
  }
  return [to];
}

function pushOutOfFurniture(world, npc) {
  for (const b of obstacles(world)) {
    if (!insideBox(npc, b, BODY_RADIUS)) continue;
    const hw = b.w / 2 + BODY_RADIUS, hd = b.d / 2 + BODY_RADIUS;
    const dx = npc.x - b.x, dz = npc.z - b.z;
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) npc.x = b.x + (dx < 0 ? -hw : hw);
    else npc.z = b.z + (dz < 0 ? -hd : hd);
  }
}

const available = (it) => !it.gone && !it.held;

const onPlane = (display, items, shelf) =>
  items.map((it, i) => [it, i])
       .filter(([it]) => available(it) && it.display === display.id && it.shelf === shelf)
       .map(([, i]) => i);

const matchesTarget = (item, target) =>
  item.name === target.name && (target.size == null || item.size === target.size);

const matchesAnyWant = (npc, item) => wantFor(npc, item) !== null;

export { fullyExposed };

export function noticeable(display, items, index) {
  const item = items[index];
  if (!item || !available(item)) return false;
  if (!fullyExposed(display, items, index)) return false;
  const rowsCovered = item.h ?? 1;
  if (display.kind === 'shelf' && item.r === display.wallRow && rowsCovered === 1) return false;
  return true;
}

export const buyableTargets = (display, items, target) =>
  items.reduce((acc, it, i) => {
    if (available(it) && it.display === display.id && matchesTarget(it, target) &&
        noticeable(display, items, i)) acc.push(i);
    return acc;
  }, []);

export const consideredHere = (npc, display, items) =>
  items.reduce((acc, it, i) => {
    if (available(it) && it.display === display.id && noticeable(display, items, i) &&
        wantFor(npc, it)) acc.push(i);
    return acc;
  }, []);

export const holdsTarget = (display, items, target) =>
  items.some((it) => available(it) && it.display === display.id && matchesTarget(it, target));

// TODO(spec): placeholder weights, VISIT-POC-TODO.md spec gap 2

export function attractiveness(npc, display, items) {
  const t = npc.traits;
  let a = 0.20;
  const wanted = items.some((it) => available(it) && it.display === display.id && matchesAnyWant(npc, it));
  if (wanted) a += 0.45;
  if (consideredHere(npc, display, items).length) a += 0.10;
  a += 0.10 * (t.Openness / 5);
  a += 0.10 * (t.Intellect / 5);
  a += 0.15 * (t.Orderliness / 5) * (display.kind === 'shelf' ? 1 : 0.4);
  return clamp(a, 0, 1);
}

export const inDoorway = (world, p) =>
  Math.hypot(p.x - world.room.door.x, p.z - world.room.door.z) < world.room.doorClearance;

export function browseActionSet(npc, world, snapshot) {
  const set = [];
  const wasAtDisplay = npc.action?.type === ACTION.WALK_TO_DISPLAY ||
                       npc.action?.type === ACTION.INTERACT;

  if (!wasAtDisplay) set.push(...displayWalks(npc, world));
  set.push(...npcWalks(npc, world, snapshot), ...wipActions(npc, world));

  if (!inDoorway(world, npc)) set.push({ type: ACTION.WAIT, params: {} });
  set.push({ type: ACTION.MOVE, params: {} });

  return set;
}

function displayWalks(npc, world) {
  return world.displays
    .filter((display) => visibleTo(world, npc, display) && attractiveness(npc, display, world.items) > 0.5)
    .map((display) => ({ type: ACTION.WALK_TO_DISPLAY, params: { displayId: display.id } }));
}

function npcWalks(npc, world, snapshot) {
  if (!(world.rng() < approachChance(npc.traits))) return [];
  const others = snapshot.filter((o) => o.id !== npc.id && o.state === STATE.BROWSE);
  if (!others.length) return [];
  const closest = others.reduce((m, o) => (dist2(npc, o) < dist2(npc, m) ? o : m));
  return [{ type: ACTION.WALK_TO_NPC, params: { npcId: closest.id } }];
}

const canProgress = (w) => w.state === WIP_STATE.IN_PROGRESS && w.progress < progressLimit(w);

function wipActions(npc, world) {
  const workable = npc.wips.filter(canProgress);
  if (npc.seat !== null) {
    return workable.map((wip) => ({ type: ACTION.WORK_ON_WIP, params: { wip: wip.id, seatId: npc.seat } }));
  }
  const open = freeSeats(world, npc);
  if (!open.length) return [];
  const nearest = open.reduce((m, s) => (dist2(npc, s) < dist2(npc, m) ? s : m));
  return workable.map((wip) => ({ type: ACTION.WALK_TO_SEAT, params: { wip: wip.id, seatId: nearest.id } }));
}

// DANCES.md finishing push. ponytail: "a few" is PUSH_ROUNDS; tea and armchairs keeping them longer (HOW-THEY-SHOP §2d) would widen it.
const PUSH_ROUNDS = 2;
function finishingPush(npc, world) {
  const left = Math.min(PUSH_ROUNDS, npc.maxRounds - npc.roundsInStore + 1);
  const ready = readyWips(npc);
  const wip = npc.wips.find((w) => ready.includes(w.id) && canProgress(w) && roundsToFinish(npc, w) <= left);
  return wip ? wipActions(npc, world).find((a) => a.params.wip === wip.id) ?? null : null;
}

// PLAYING-AT-YOUR-PACE.md, a friend's patience
const waitsForPlayer = (npc, { displays, items }) => npc.patience === 'friend' &&
  displays.some((d) => consideredHere(npc, d, items).length ||
    (!npc.restructured.includes(d.id) && items.some((it) => available(it) && it.display === d.id && matchesAnyWant(npc, it))));

export function DetermineNextBrowseAction(npc, world, snapshot) {
  if (npc.prescribed) {
    const forced = npc.prescribed;
    npc.prescribed = null;
    return forced;
  }
  if (npc.roundsInStore >= npc.maxRounds && !waitsForPlayer(npc, world)) return null;
  const push = finishingPush(npc, world);
  if (push) return push;
  const set = browseActionSet(npc, world, snapshot);
  if (!set.length) return null;
  return set[Math.floor(world.rng() * set.length)];
}

const cellsOf = (display, shelf) => {
  const out = [];
  for (let r = 0; r < display.g.rows; r++)
    for (let c = 0; c < display.g.cols; c++)
      if (usableAt(display.g, shelf, c, r)) out.push({ c, r });
  return out;
};

function rebuildPlane(display, items, shelf, order, { spread = false, flat = false } = {}) {
  const { g } = display;
  clearShelf(g, shelf);
  const cells = cellsOf(display, shelf)
    .filter((cell) => !(display.kind === 'shelf' && cell.r === display.wallRow) || !spread);
  const left = [];
  let cursor = 0;
  for (const index of order) {
    const item = items[index];
    const attempt = firstFit({ display, shelf, cells, flat }, cursor, item, index);
    if (attempt >= 0 && spread) cursor = (cursor + attempt + 1) % cells.length;
    if (attempt < 0 && flat) left.push(index);
    // ponytail: a plane with no room left keeps the item's old slot record, which the renderer
    // still draws. Only reachable if headroom is set absurdly low; revisit if it shows up.
    else if (attempt < 0) item.layer = place(g, item.keys, index, item.layers ?? 1);
  }
  return left;
}

function firstFit({ display, shelf, cells, flat = false }, cursor, item, index) {
  const { g } = display;
  for (let attempt = 0; attempt < cells.length; attempt++) {
    const cell = cells[(cursor + attempt) % cells.length];
    const keys = footprint(g, shelf, [cell.c, cell.r], [item.w, item.h]);
    if (!fits(g, keys, item.layers ?? 1)) continue;
    if (flat && (dropLayer(g, keys) > 0 ||
        (display.kind === 'shelf' && cell.r === display.wallRow && (item.h ?? 1) === 1))) continue;
    item.display = display.id; item.shelf = shelf;
    item.c = cell.c; item.r = cell.r; item.keys = keys;
    item.layer = place(g, keys, index, item.layers ?? 1);
    return attempt;
  }
  return -1;
}

const byCategory = (items) => (a, b) => items[a].name.localeCompare(items[b].name);

export function tidyShop(world) {
  const { items, displays } = world;
  const floor = (d) => d.solid === false;
  const busy = new Set(world.npcs.filter((n) => n.considering)
    .map((n) => `${n.considering.displayId}/${items[n.considering.index]?.shelf}`));
  const planes = [...displays.filter((d) => !floor(d)), ...displays.filter(floor)]
    .flatMap((d) => Array.from({ length: d.g.shelves }, (_, s) => [d, s]))
    .filter(([d, s]) => !busy.has(`${d.id}/${s}`));
  let waiting = planes.filter(([d]) => floor(d)).flatMap(([d, s]) => onPlane(d, items, s));
  for (const [d, s] of planes) {
    const own = floor(d) ? [] : onPlane(d, items, s);
    waiting = rebuildPlane(d, items, s, [...own, ...waiting].sort(byCategory(items)), { flat: true });
  }
  stackOnFloor(world, planes.filter(([d]) => floor(d)), waiting);
  return waiting.length;
}

function stackOnFloor({ items, displays }, floorPlanes, waiting) {
  for (const index of waiting) {
    const item = items[index];
    const placed = floorPlanes.some(([d, s]) =>
      firstFit({ display: d, shelf: s, cells: cellsOf(d, s) }, 0, item, index) >= 0);
    // ponytail: same ceiling as rebuildPlane — a shop with no room at all keeps the old slot record.
    if (!placed) item.layer = place(displays.find((d) => d.id === item.display).g, item.keys, index, item.layers ?? 1);
  }
}

export function interact(npc, display, world) {
  const { items } = world;
  if (buyConsidered(npc, display, world)) return 'complete';
  const held = npc.considering && items[npc.considering.index];
  if (held && available(held)) remember(npc, `put ${npc.considering.index}`, { what: 'putBack', item: { ...held } });
  npc.considering = null;

  const candidates = consideredHere(npc, display, items);
  if (candidates.length) {
    const index = candidates[0];
    npc.considering = { displayId: display.id, index, round: world.round };
    say(world, npc, `considered ${labelOf(items[index])}`);
    return 'incomplete';
  }
  if (restructure(npc, display, world)) return 'incomplete';
  return lookOver(npc, display, world);
}

const stillThere = (pending, display, items) => pending && pending.displayId === display.id &&
  available(items[pending.index]) && noticeable(display, items, pending.index);

function provenance(npc, display, world, shelf) {
  const beside = onPlane(display, world.items, shelf).map((i) => world.items[i]).find((it) => it.name === 'pattern');
  return { place: placeWord(display, world.room, world.seats), beside: beside?.patternType ?? null,
           alsoIn: world.npcs.find((o) => o !== npc && o.state === STATE.BROWSE)?.name ?? null };
}

function buyConsidered(npc, display, world) {
  const { items } = world;
  const pending = npc.considering;
  if (!stillThere(pending, display, items)) return false;
  const { index } = pending;
  const item = items[index];
  const want = wantFor(npc, item);
  npc.considering = null;
  if (!want) { remember(npc, `put ${index}`, { what: 'putBack', item: { ...item } }); return false; }
  item.gone = true;
  rebuildPlane(display, items, item.shelf, onPlane(display, items, item.shelf));
  npc.restructured = npc.restructured.filter((id) => id !== display.id);
  const bought = { ...item, ...provenance(npc, display, world, item.shelf) };
  npc.bought.push(npc.carrying = bought);
  const wip = stow(npc, bought, want);
  npc.willReturn = true;
  say(world, npc, `bought ${labelOf(bought)} for ${want.wip}${
    wip?.state === WIP_STATE.IN_PROGRESS ? ' — that WIP can be started now' : ''}`);
  return true;
}

function restructure(npc, display, world) {
  const { items } = world;
  const shelf = pickPlane(display, items, npc);
  const present = onPlane(display, items, shelf);
  if (npc.restructured.includes(display.id)) return false;
  const plan = restructurePlan(npc, display, items, present);
  if (!plan) return false;
  npc.restructured.push(display.id);
  rebuildPlane(display, items, shelf, plan.order, { spread: plan.spread });
  say(world, npc, plan.note);
  return true;
}

function restructurePlan(npc, display, items, present) {
  const t = npc.traits;
  const pile = display.kind === 'pile' && present.length;
  if (pile && t.Orderliness === 1) {
    return { order: present, spread: true, note: 'Orderliness 1 — spread the pile out into a mess' };
  }
  if (pile && t.Orderliness === 5) {
    const sorted = [...present].sort(byCategory(items));
    return { order: sorted, spread: false, note: 'Orderliness 5 — tidied the pile by category' };
  }
  const mine = present.filter((i) => matchesAnyWant(npc, items[i]));
  const rearrangeGate = display.kind === 'pile' ? 3 : 4;   // DISPLAYS.md: pile > 3, shelf > 4
  if (!(mine.length && t.Assertiveness > rearrangeGate)) return null;
  const rest = present.filter((i) => !mine.includes(i));
  return { order: [...rest, ...mine], spread: false, note: `Assertiveness ${t.Assertiveness} — dug out what they needed to the top` };
}

function lookOver(npc, display, world) {
  if (npc.traits.Volatility === 5 && npc.maxRounds > 1) {
    npc.maxRounds = 1;
    npc.stormedOut = true;
    say(world, npc, `Volatility 5 — nothing at the ${display.id}, MAX_ROUNDS cut to 1`);
    return 'complete';
  }
  say(world, npc, `looked over the ${display.id}, nothing doing`);
  return 'complete';
}

function pickPlane(display, items, npc) {
  for (let s = 0; s < display.g.shelves; s++) {
    if (onPlane(display, items, s).some((i) => matchesAnyWant(npc, items[i]))) return s;
  }
  return 0;
}

export function advanceRound(world) {
  world.round += 1;
  const snapshot = world.npcs.map((n) => ({ id: n.id, x: n.x, z: n.z, state: n.state }));

  admitOne(world);
  for (const npc of world.npcs) stepNpc(npc, world, snapshot);
  separate(world);

  return world.round;
}

// ponytail: closeout is guessed at 2 rounds and a volatile NPC can cut a visit short, so the estimate can jump forward; never backward, it clamps.
export function dayProgress(world) {
  let queued = 0, left = 0;
  for (const n of world.npcs) {
    const visit = Math.max(0, n.maxRounds - n.roundsInStore) + 2;
    if (n.state === STATE.QUEUED) left = Math.max(left, ++queued + visit);
    else if (n.state === STATE.ENTERING) left = Math.max(left, 1 + visit);
    else if (n.state === STATE.LEAVING) left = Math.max(left, 1);
    else if (n.state !== STATE.GONE) left = Math.max(left, visit);
  }
  return left === 0 ? 1 : world.round / (world.round + left);
}

// ponytail: O(n²) relaxation over ~10 NPCs, at rest only; no separation steering in transit, so walkers can pass through each other.
function separate(world) {
  const movable = world.npcs.filter((n) =>
    (n.state === STATE.BROWSE || n.state === STATE.CLOSEOUT) &&
    n.seat === null && n.action?.type !== ACTION.ENTER);
  const gap = world.room.personalSpace;

  let stalled = 0, previous = Infinity;
  for (let pass = 0; pass < 64; pass++) {
    const slide = stalled > 2 ? 0.5 : 0;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) pushApart(movable[i], movable[j], gap, slide * ((i + j) % 2 ? 1 : -1));
    }
    for (const npc of movable) constrain(world, npc);
    const worst = worstOverlap(movable, gap);
    if (worst <= 0) break;
    stalled = worst >= previous - 1e-6 ? stalled + 1 : 0;
    previous = worst;
  }
}

function pushApart(a, b, gap, turn) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len >= gap) return;
  const [ux, uz] = len < 1e-6 ? [1, 0] : [dx / len, dz / len];
  const push = (gap - len) / 2 + 1e-4;
  const vx = ux - uz * turn, vz = uz + ux * turn;
  a.x -= vx * push; a.z -= vz * push;
  b.x += vx * push; b.z += vz * push;
}

function worstOverlap(movable, gap) {
  let worst = 0;
  for (let i = 0; i < movable.length; i++)
    for (let j = i + 1; j < movable.length; j++)
      worst = Math.max(worst, gap - Math.hypot(movable[i].x - movable[j].x, movable[i].z - movable[j].z));
  return worst;
}

function constrain(world, npc) {
  const { minX, maxX, minZ, maxZ } = world.room.bounds;
  npc.x = clamp(npc.x, minX, maxX);
  npc.z = clamp(npc.z, minZ, maxZ);
  pushOutOfFurniture(world, npc);
  npc.x = clamp(npc.x, minX, maxX);
  npc.z = clamp(npc.z, minZ, maxZ);
  if (!inDoorway(world, npc)) return;
  const dx = npc.x - world.room.door.x, dz = npc.z - world.room.door.z;
  const len = Math.hypot(dx, dz);
  const ux = len < 1e-6 ? 0 : dx / len;
  const uz = len < 1e-6 ? -1 : dz / len;
  npc.x = clamp(world.room.door.x + ux * world.room.doorClearance, minX, maxX);
  npc.z = clamp(world.room.door.z + uz * world.room.doorClearance, minZ, maxZ);
}

function admitOne(world) {
  if (world.door.busy !== null) return;
  const next = world.npcs.find((n) => n.state === STATE.QUEUED);
  if (!next) return;
  world.door.busy = next.id;
  next.state = STATE.ENTERING;
}

const ROUND = {
  [STATE.QUEUED](npc, world) {
    npc.action = { type: ACTION.QUEUE, params: {} };
    say(world, npc, 'waiting outside — the door is busy');
  },
  [STATE.ENTERING](npc, world) {
    npc.action = { type: ACTION.ENTER, params: {} };
    moveTo(world, npc, world.room.door);
    npc.state = STATE.BROWSE;
    world.door.busy = null;
    say(world, npc, `came in looking for ${labelWant(npc.target)}`);
  },
  [STATE.BROWSE](npc, world, snapshot) {
    npc.roundsInStore += 1;
    stepBrowse(npc, world, snapshot);
  },
  [STATE.CLOSEOUT](npc, world) {
    npc.roundsInStore += 1;
    stepCloseout(npc, world);
  },
  [STATE.LEAVING](npc, world) {
    npc.action = { type: ACTION.LEAVE, params: {} };
    moveTo(world, npc, world.room.outside);
    npc.state = STATE.GONE;
    world.door.busy = null;
    say(world, npc, 'left');
  },
};

function stepNpc(npc, world, snapshot) {
  npc.from = { x: npc.x, z: npc.z };
  npc.lastAction = npc.action;
  npc.path = [];
  const round = ROUND[npc.state];
  if (round) round(npc, world, snapshot);
  else npc.action = null;
}

const displayOf = (world, action) => world.displays.find((d) => d.id === action.params.displayId);

const BROWSE = {
  [ACTION.WALK_TO_DISPLAY](npc, world, action) {
    const display = displayOf(world, action);
    moveTo(world, npc, display.standAt);
    npc.atDisplay = display.id;
    npc.prescribed = { type: ACTION.INTERACT, params: { displayId: display.id } };
    say(world, npc, `walked to the ${display.id} (attractiveness ` +
                    `${attractiveness(npc, display, world.items).toFixed(2)})`);
  },

  [ACTION.INTERACT](npc, world, action) {
    const display = displayOf(world, action);
    const outcome = interact(npc, display, world);
    npc.prescribed = outcome === 'incomplete'
      ? { type: ACTION.INTERACT, params: { displayId: display.id } }
      : null;
  },

  [ACTION.WALK_TO_NPC](npc, world, action, snapshot) {
    const other = snapshot.find((o) => o.id === action.params.npcId);
    moveTo(world, npc, approach(npc, other, world.room.personalSpace));
    npc.atDisplay = null;
    npc.prescribed = { type: ACTION.WAIT, params: {} };
    say(world, npc, `went over to ${world.npcs.find((n) => n.id === other.id).name}`);
  },

  [ACTION.WALK_TO_SEAT](npc, world, action) {
    const seat = seatById(world, action.params.seatId);
    const free = seat && seat.occupiedBy === null ? seat : freeSeats(world, npc)[0];
    if (!free) {
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
  },

  [ACTION.WORK_ON_WIP](npc, world, action) {
    const seat = npc.seat !== null ? seatById(world, npc.seat) : null;
    if (seat) npc.facing = seat.facing ?? npc.facing;
    npc.prescribed = null;
    const wip = npc.wips.find((w) => w.id === action.params.wip);
    if (!wip) return;
    if (wip.state !== WIP_STATE.IN_PROGRESS) {
      say(world, npc, `sat with ${wip.id}, but it is ${wip.state.toLowerCase()}`);
      return;
    }
    npc.satAndWorked = true;
    remember(npc, `sat ${wip.id}`, { what: 'sat', wip: wip.id, pattern: wip.pattern });
    npc.willReturn = true;
    const done = workRound(npc, wip, world.round);
    if (runningOut(wip)) { say(world, npc, `ran out of yarn on ${labelOf(wip.pattern)}`); return; }
    say(world, npc, done
      ? `finished ${labelOf(wip.pattern)}! (crafter skill now ${npc.prefs.skill})`
      : `worked on ${labelOf(wip.pattern)} — ${Math.round(wip.progress)}%`);
  },

  [ACTION.WAIT](npc, world) {
    const near = world.npcs.find((o) => o.id !== npc.id && o.state === STATE.BROWSE &&
                                        dist2(npc, o) < world.room.personalSpace ** 2);
    if (near) {
      npc.chatted = true;
      remember(npc, `chat ${near.id}`, { what: 'chat', with: near.name });
    }
    npc.prescribed = near && world.rng() < keepChattingChance(npc.traits)
      ? { type: ACTION.WAIT, params: {} }
      : null;
    say(world, npc, near ? 'stayed to keep chatting' : 'waited a round');
  },

  [ACTION.MOVE](npc, world) {
    moveTo(world, npc, randomSpot(world));
    npc.atDisplay = null;
    npc.prescribed = null;
    say(world, npc, 'wandered across the store');
  },
};

function stepBrowse(npc, world, snapshot) {
  const action = DetermineNextBrowseAction(npc, world, snapshot);
  if (!action) {
    npc.state = STATE.CLOSEOUT;
    npc.closeoutStep = 0;
    say(world, npc, npc.roundsInStore >= npc.maxRounds
      ? `MAX_ROUNDS ${npc.maxRounds} reached — closing out`
      : 'nothing left to do — closing out');
    stepCloseout(npc, world);
    return;
  }

  npc.action = action;
  if (action.type !== ACTION.WORK_ON_WIP && action.type !== ACTION.WALK_TO_SEAT) {
    releaseSeat(world, npc);
  }
  BROWSE[action.type]?.(npc, world, action, snapshot);
}

function remember(npc, key, fact) {
  const had = npc.did.find((d) => d.key === key);
  if (had) had.witnessed ||= npc.inView;
  else npc.did.push({ key, ...fact, witnessed: npc.inView });
}

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

function signFarewell(world, npc) {
  const entry = { npc: `${npc.name} (former owner)`, npcId: npc.id, kind: 'photo', object: 'a lifetime of knits',
    farewell: true, mood: null, round: world.round, tags: [], bought: [], did: [], lent: [],
    note: { short: npc.farewell, full: npc.farewell } };
  world.guestbook.push(entry);
  return entry;
}

export function signGuestbook(world, npc) {
  if (npc.farewell) return signFarewell(world, npc);
  const made = photoSubject(npc);
  if (made) made.photographed = true;
  const object = made ? labelOf(made.pattern) : null;
  const record = { bought: [...npc.bought], did: [...npc.did], lent: npc.toLend.map((w) => w.pattern.title ?? w.pattern.patternType) };
  const entry = object
    ? { npc: npc.name, npcId: npc.id, kind: 'photo', object, mood: null, round: world.round,
        wip: made, wornInPhoto: !Object.values(npc.worn).includes(made), tags: guestbookTags(npc), ...record,
        note: thankYou(made, npc.traits, { workedHere: npc.did.some((d) => d.what === 'sat' && d.wip === made.id) }) }
    : { npc: npc.name, kind: 'note', object: null,
        mood: npc.bought.length || npc.satAndWorked || !wantsOf(npc).length ? 'happy' : 'disappointed',
        round: world.round,
        tags: guestbookTags(npc), ...record };
  world.guestbook.push(entry);
  return entry;
}

export const closeoutFor = (npc) =>
  CLOSEOUT_SEQUENCE.filter((step) => step !== ACTION.DROP_OFF || npc.toLend.length > 0);

function stepCloseout(npc, world) {
  releaseSeat(world, npc);
  if (npc.closeoutStep === 0) {
    npc.toLend = wearOrOffer(npc);
    npc.closeout = closeoutFor(npc);
  }
  const type = npc.closeout[npc.closeoutStep];
  npc.action = { type, params: {} };
  if (type === ACTION.SIGN_GUESTBOOK) signAtGuestbook(npc, world);
  else if (type === ACTION.DROP_OFF) lendAtDropOff(npc, world);
  else headForDoor(npc, world);
}

function signAtGuestbook(npc, world) {
  moveTo(world, npc, world.room.guestbook);
  npc.closeoutStep += 1;
  const entry = signGuestbook(world, npc);
  say(world, npc, entry.kind === 'photo'
    ? `signed the Guestbook — a picture of them holding ${entry.object}`
    : `signed the Guestbook — a ${entry.mood} note`);
}

function lendAtDropOff(npc, world) {
  moveTo(world, npc, world.room.dropOff);
  npc.closeoutStep += 1;
  const wip = lend(npc, npc.toLend.shift());
  world.dropOff.push({ npc: npc.name, npcId: npc.id, wip, object: labelOf(wip.pattern),
                       round: world.round });
  say(world, npc, `lent ${labelOf(wip.pattern)} to the Drop Off`);
}

function headForDoor(npc, world) {
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

/**
 * @param {any} npc
 * @param {{at?: {x: number, z: number}, rng?: () => number}} [opts]
 */
export function rejoin(npc, { at, rng = Math.random } = {}) {
  Object.assign(npc, visitState(npc.traits, rng));
  npc.visits += 1;
  if (at) { npc.x = at.x; npc.z = at.z; npc.from = { ...at }; }
  return npc;
}

export const regulars = (world) => [...world.returning].reverse();

function moveTo(world, npc, to) {
  npc.path = findPath(world, npc, to);
  const first = npc.path[0] ?? to;
  npc.facing = Math.atan2(first.x - npc.x, first.z - npc.z);
  npc.x = to.x;
  npc.z = to.z;
}

function approach(npc, to, gap) {
  const dx = to.x - npc.x, dz = to.z - npc.z;
  const len = Math.hypot(dx, dz) || 1;
  if (len <= gap) return { x: npc.x, z: npc.z };
  return { x: to.x - (dx / len) * gap, z: to.z - (dz / len) * gap };
}

function randomSpot(world) {
  const { minX, maxX, minZ, maxZ } = world.room.bounds;
  for (let attempt = 0; attempt < 30; attempt++) {
    const p = {
      x: minX + world.rng() * (maxX - minX),
      z: minZ + world.rng() * (maxZ - minZ),
    };
    if (inDoorway(world, p)) continue;
    const clearOfDisplays = world.displays.every((d) => d.solid === false ||
      Math.abs(p.x - d.x) > d.w / 2 + 0.25 || Math.abs(p.z - d.z) > d.d / 2 + 0.25);
    const clearOfSeats = world.seats.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > 0.4);
    if (clearOfDisplays && clearOfSeats) return p;
  }
  return { x: 0, z: 0 };
}

export { EMPTY };
