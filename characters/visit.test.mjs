// Self-check for the pure visit state machine. Run: node characters/visit.test.mjs
//
// Covers the rules that CHARACTER-VISIT.md and DISPLAYS.md state explicitly, since those are the
// ones a refactor can silently break: prescriptions, the stay-at-the-display rule, the door lock,
// the buy/rearrange branch, and the hardcoded closeout order.

import assert from 'node:assert/strict';
import { makeDisplay, footprint, place, topAt } from '../inventory/grid.js';
import {
  TRAITS, randomTraits, maxWips, maxRounds, ACTION, STATE, CLOSEOUT_SEQUENCE,
  makeNpc, makeWorld, advanceRound, browseActionSet, DetermineNextBrowseAction,
  interact, noticeable, buyableTargets, visibleTo, labelOf, inDoorway, seatById, fullyExposed,
} from './visit.js';

// A deterministic stand-in for Math.random, so a test asserts behaviour and not luck.
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

const ROOM = {
  door:      { x: 0, z: 3 },
  outside:   { x: 0, z: 5 },
  queueAt:   { x: 0, z: 4 },
  guestbook: { x: -2, z: 0 },
  dropOff:   { x: 2, z: 0 },
  personalSpace: 0.6,
  doorClearance: 0.8,
  bounds: { minX: -2.5, maxX: 2.5, minZ: -2.5, maxZ: 2.5 },
};

const SEATS = [{ id: 'chair-a', x: -1.5, z: -0.5, facing: 0 }, { id: 'chair-b', x: -1.5, z: 0.5, facing: 0 }];

function fixture({ rng = seq(0.5), traits, seats = SEATS } = {}) {
  const pile = {
    id: 'pile', kind: 'pile', x: 0, z: 0, w: 1, d: 1, wallRow: -1,
    standAt: { x: 0, z: 0.9 },
    g: makeDisplay(2, 2, { shelves: 1, headroom: 6, cell: 0.2 }),
  };
  const shelf = {
    id: 'shelf', kind: 'shelf', x: -2, z: -2, w: 1, d: 0.4, wallRow: 0,
    standAt: { x: -2, z: -1.4 },
    g: makeDisplay(2, 2, { shelves: 1, headroom: 3, cell: 0.2 }),
  };
  const items = [];
  const world = makeWorld({ displays: [pile, shelf], items, room: ROOM, seats, rng });

  const add = (display, shelfIndex, c, r, name, size) => {
    const index = items.length;
    const keys = footprint(display.g, shelfIndex, c, r, 1, 1);
    items.push({ name, size, display: display.id, shelf: shelfIndex, c, r, w: 1, h: 1, keys, layer: 0 });
    items[index].layer = place(display.g, keys, index);
    return index;
  };

  const npc = makeNpc({
    id: 'n1', name: 'Test', species: 'Owl',
    target: { name: 'crochet-hook', size: 4.5 },
    traits: traits ?? Object.fromEntries(TRAITS.map((t) => [t, 3])),
    rng,
  });
  world.npcs.push(npc);
  return { world, pile, shelf, items, npc, add };
}

// --- traits -----------------------------------------------------------------
{
  const t = randomTraits(seq(0.0, 0.99, 0.5, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.7));
  assert.deepEqual(Object.keys(t), [...TRAITS], 'the 10 assets, in spec order, no synonyms');
  assert.ok(Object.values(t).every((v) => v >= 1 && v <= 5), 'every trait lands on the 1-5 scale');

  const t5 = Object.fromEntries(TRAITS.map((k) => [k, 5]));
  assert.equal(maxWips(t5), 15, 'Enthusiasm + Openness + Volatility caps WIPs at 15');
  assert.ok(maxRounds(t5) >= 3, 'MAX_ROUNDS stays inside its clamp');
}

// --- a prescribed action is taken, and consumed exactly once ----------------
{
  const { world, npc } = fixture();
  npc.prescribed = { type: ACTION.INTERACT, params: { displayId: 'pile' } };
  const first = DetermineNextBrowseAction(npc, world, []);
  assert.equal(first.type, ACTION.INTERACT, 'a prescription overrides the random draw');
  assert.equal(npc.prescribed, null, 'and is cleared, so it fires once and not forever');
}

// --- MAX_ROUNDS ends BROWSE -------------------------------------------------
{
  const { world, npc } = fixture();
  npc.roundsInStore = npc.maxRounds;
  assert.equal(DetermineNextBrowseAction(npc, world, []), null, 'past MAX_ROUNDS there is no action');
}

// --- having just been at a display suppresses new walk actions --------------
{
  const { world, npc, pile, add } = fixture({ rng: seq(0.99) });   // 0.99 => never sociable
  add(pile, 0, 0, 0, 'crochet-hook', 4.5);                          // makes the pile attractive
  const before = browseActionSet(npc, world, []);
  assert.ok(before.some((a) => a.type === ACTION.WALK_TO_DISPLAY),
    'an attractive, visible display is walkable when the NPC is elsewhere');

  npc.action = { type: ACTION.INTERACT, params: { displayId: 'pile' } };
  const after = browseActionSet(npc, world, []);
  assert.ok(!after.some((a) => a.type === ACTION.WALK_TO_DISPLAY),
    'after interacting, no new walking action — the NPC stays at the display');
}

// --- more WIPs really does weight the draw ----------------------------------
{
  const { world, npc } = fixture({ rng: seq(0.99) });
  npc.wips = ['a', 'b', 'c', 'd'];
  const set = browseActionSet(npc, world, []);
  assert.equal(set.filter((a) => a.type === ACTION.WALK_TO_SEAT).length, 4,
    'one entry per WIP, because duplication IS the weighting — as a walk, since they must sit first');
  assert.ok(!set.some((a) => a.type === ACTION.WORK_ON_WIP),
    'you cannot work on a project while standing in the middle of the shop');

  npc.seat = 'chair-a';
  const seated = browseActionSet(npc, world, []);
  assert.equal(seated.filter((a) => a.type === ACTION.WORK_ON_WIP).length, 4,
    'once seated, the WIP entries become the work itself');
  assert.ok(!seated.some((a) => a.type === ACTION.WALK_TO_SEAT), 'and they do not go find another chair');
}

// --- seats are exclusive, and released when the NPC does something else -----
{
  const { world, npc } = fixture({ rng: seq(0.99) });
  const other = makeNpc({ id: 'n2', name: 'Other', species: 'Owl',
    target: { name: 'stitch-markers', size: null },
    traits: Object.fromEntries(TRAITS.map((t) => [t, 3])), rng: seq(0.99) });
  other.state = STATE.BROWSE;
  world.npcs.push(other);

  npc.state = STATE.BROWSE;
  npc.wips = ['a'];
  npc.prescribed = { type: ACTION.WALK_TO_SEAT, params: { wip: 'a', seatId: 'chair-a' } };
  advanceRound(world);
  assert.equal(npc.seat, 'chair-a', 'the NPC takes the chair');
  assert.equal(seatById(world, 'chair-a').occupiedBy, npc.id, 'and the chair records who is in it');
  assert.equal(npc.prescribed?.type, ACTION.WORK_ON_WIP, 'sitting down prescribes actually working');

  // a second NPC aiming at the same chair must not end up in the same seat
  other.wips = ['b'];
  other.prescribed = { type: ACTION.WALK_TO_SEAT, params: { wip: 'b', seatId: 'chair-a' } };
  advanceRound(world);
  assert.notEqual(other.seat, 'chair-a', 'the taken chair is not handed out twice');

  npc.prescribed = { type: ACTION.MOVE, params: {} };
  advanceRound(world);
  assert.equal(npc.seat, null, 'doing anything else stands them back up');
  assert.equal(seatById(world, 'chair-a').occupiedBy, null, 'which frees the chair');
}

// --- nobody loiters in the doorway ------------------------------------------
{
  const { world, npc } = fixture({ rng: seq(0.99) });
  npc.state = STATE.BROWSE;
  npc.x = ROOM.door.x; npc.z = ROOM.door.z;          // standing on the mat
  assert.ok(inDoorway(world, npc), 'the mat counts as the doorway');
  assert.ok(!browseActionSet(npc, world, []).some((a) => a.type === ACTION.WAIT),
    'waiting is not offered while standing in the doorway');

  npc.x = 0; npc.z = 0;
  assert.ok(browseActionSet(npc, world, []).some((a) => a.type === ACTION.WAIT),
    'but it is offered anywhere else');
}

// --- two NPCs never end a round standing inside each other ------------------
{
  const { world, npc } = fixture({ rng: seq(0.99) });
  const other = makeNpc({ id: 'n2', name: 'Other', species: 'Owl',
    target: { name: 'stitch-markers', size: null },
    traits: Object.fromEntries(TRAITS.map((t) => [t, 3])), rng: seq(0.99) });
  world.npcs.push(other);
  for (const n of [npc, other]) { n.state = STATE.BROWSE; n.x = 0.5; n.z = 0.5; n.prescribed = { type: ACTION.WAIT, params: {} }; }

  advanceRound(world);
  const apart = Math.hypot(npc.x - other.x, npc.z - other.z);
  assert.ok(apart >= ROOM.personalSpace - 1e-6,
    `separation pushed them apart (${apart.toFixed(2)} >= ${ROOM.personalSpace})`);
}

// --- the two sociability rolls are NOT the same number ----------------------
// The wait-again roll is /20 and the approach roll is /10. This is load-bearing: at /10 a pair of
// maximally sociable NPCs prescribe Wait at each other with chance 1.0 and the visit never ends.
{
  const maxSocial = { ...Object.fromEntries(TRAITS.map((t) => [t, 3])), Enthusiasm: 5, Assertiveness: 5 };

  // rng 0.6 is above the /20 cap (0.5) but below what /10 would give (1.0).
  const { world, npc } = fixture({ rng: seq(0.6), traits: maxSocial });
  const other = makeNpc({ id: 'n2', name: 'Near', species: 'Owl', target: { name: 'stitch-markers', size: null }, traits: maxSocial, rng: seq(0.6) });
  other.state = STATE.BROWSE;
  other.x = npc.x + 0.1; other.z = npc.z;
  world.npcs.push(other);

  npc.state = STATE.BROWSE;
  npc.prescribed = { type: ACTION.WAIT, params: {} };
  advanceRound(world);
  assert.equal(npc.action.type, ACTION.WAIT, 'the prescribed wait is taken');
  assert.equal(npc.prescribed, null,
    'and does NOT prescribe itself again at rng 0.6 — proving the roll is /20, not /10');

  // below the cap it does chain, so the mechanic still exists
  const b = fixture({ rng: seq(0.4), traits: maxSocial });
  const near = makeNpc({ id: 'n2', name: 'Near', species: 'Owl', target: { name: 'stitch-markers', size: null }, traits: maxSocial, rng: seq(0.4) });
  near.state = STATE.BROWSE;
  near.x = b.npc.x + 0.1; near.z = b.npc.z;
  b.world.npcs.push(near);
  b.npc.state = STATE.BROWSE;
  b.npc.prescribed = { type: ACTION.WAIT, params: {} };
  advanceRound(b.world);
  assert.equal(b.npc.prescribed?.type, ACTION.WAIT, 'under the cap, the chat carries on');
}

// --- visibility: a display behind another one is not noticed ----------------
{
  const { world, pile, shelf } = fixture();
  pile.x = 0; pile.z = 0; pile.w = 2; pile.d = 2;
  shelf.x = 0; shelf.z = -2;
  assert.ok(!visibleTo(world, { x: 0, z: 2 }, shelf), 'the pile blocks the line to the shelf');
  assert.ok(visibleTo(world, { x: 3, z: -2 }, shelf), 'from the side the shelf is in the clear');
}

// --- buy: the top of a pile is noticeable, a buried item is not -------------
{
  const { world, pile, items, npc, add } = fixture();
  const buried = add(pile, 0, 0, 0, 'crochet-hook', 4.5);
  const onTop = add(pile, 0, 0, 0, 'darning-needle', null);   // stacks over the hook

  assert.ok(!noticeable(pile, items, buried), 'buried in a stack cannot be noticed');
  assert.ok(noticeable(pile, items, onTop), 'the top of the stack can');
  assert.equal(buyableTargets(pile, items, npc.target).length, 0, 'so there is nothing to buy yet');

  // Assertiveness > 3 digs it out: "Interaction Not Complete", then buyable next round.
  npc.traits.Assertiveness = 5;
  npc.traits.Orderliness = 3;
  assert.equal(interact(npc, pile, world), 'incomplete', 'rearranging does not finish the interaction');
  assert.equal(buyableTargets(pile, items, npc.target).length, 1, 'the target is now on top');

  assert.equal(interact(npc, pile, world), 'complete', 'the next interaction buys it');
  assert.ok(items[buried].gone, 'the purchase removes the item from the display');
  assert.deepEqual(npc.carrying, { name: 'crochet-hook', size: 4.5 }, 'and the NPC carries it out');
}

// --- a multi-cell package is exposed only when ALL its columns are clear ----
{
  const { world, pile, items, npc, add } = fixture();
  // a 2x1 bridging columns 0 and 1
  const wide = items.length;
  const keys = footprint(pile.g, 0, 0, 0, 2, 1);
  items.push({ name: 'crochet-hook', size: 4.5, display: 'pile', shelf: 0, c: 0, r: 0, w: 2, h: 1,
               keys, layer: place(pile.g, keys, wide), gone: false, held: false });

  assert.ok(fullyExposed(pile, items, wide), 'nothing on it yet, so it is exposed');
  assert.ok(noticeable(pile, items, wide), 'and noticeable');

  add(pile, 0, 0, 0, 'darning-needle', null);   // lands on column 0 only, half-burying the 2x1
  assert.equal(topAt(pile.g, 0, 1, 0), wide, 'it is still the top of its OTHER column');
  assert.ok(!fullyExposed(pile, items, wide), 'but half of it is buried, so it is not exposed');
  assert.ok(!noticeable(pile, items, wide),
    'a partly buried package cannot be noticed — an anchor-cell-only test would wrongly say it can');
  assert.equal(buyableTargets(pile, items, npc.target).length, 0, 'and cannot be bought');
}

// --- a deep package straddles the wall row and stays sellable ---------------
{
  const { shelf, items } = fixture();
  const deep = items.length;
  const keys = footprint(shelf.g, 0, 0, 0, 1, 2);   // rows 0 and 1; row 0 is the wall
  items.push({ name: 'crochet-hook', size: 4.5, display: 'shelf', shelf: 0, c: 0, r: 0, w: 1, h: 2,
               keys, layer: place(shelf.g, keys, deep), gone: false, held: false });
  assert.ok(noticeable(shelf, items, deep),
    'part of it reaches the outside face, so the wall-row rule must not hide the whole package');
}

// --- an item in the player's hand is invisible to NPCs ----------------------
{
  const { pile, items, npc, add } = fixture();
  const idx = add(pile, 0, 0, 0, 'crochet-hook', 4.5);
  assert.equal(buyableTargets(pile, items, npc.target).length, 1, 'on the display it is buyable');
  items[idx].held = true;
  assert.ok(!noticeable(pile, items, idx), 'held by the player, it is not on the display at all');
  assert.equal(buyableTargets(pile, items, npc.target).length, 0,
    'so an NPC cannot buy it out of the hand');
}

// --- a shelf never sells off its wall-facing row ----------------------------
{
  const { shelf, items, npc, add } = fixture();
  const atWall = add(shelf, 0, 0, 0, 'crochet-hook', 4.5);    // row 0 === shelf.wallRow
  assert.ok(!noticeable(shelf, items, atWall), 'the wall-facing row is not an outside face');
  assert.equal(buyableTargets(shelf, items, npc.target).length, 0, 'so it cannot be bought');
}

// --- the door admits exactly one NPC at a time ------------------------------
{
  const { world, npc } = fixture();
  const second = makeNpc({
    id: 'n2', name: 'Second', species: 'Llama',
    target: { name: 'stitch-markers', size: null },
    traits: Object.fromEntries(TRAITS.map((t) => [t, 3])),
    rng: seq(0.5),
  });
  world.npcs.push(second);

  advanceRound(world);
  assert.equal(npc.state, STATE.BROWSE, 'the first NPC walks in');
  assert.equal(second.state, STATE.QUEUED, 'the second is still outside — one at a time');
  assert.equal(world.door.busy, null, 'and the doorway is clear again for next round');

  advanceRound(world);
  assert.equal(second.state, STATE.BROWSE, 'who then gets their turn');
}

// --- closeout is the hardcoded three, in order, ending at the door ----------
{
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;

  const seen = [];
  for (let i = 0; i < 4 && npc.state !== STATE.GONE; i++) {
    advanceRound(world);
    if (npc.action) seen.push(npc.action.type);
  }
  assert.deepEqual(seen.slice(0, 3), [...CLOSEOUT_SEQUENCE],
    'sign the Guestbook, lend a finished object, then leave — always in that order');
  assert.equal(npc.state, STATE.GONE, 'and the visit is over');
}

// --- labels ------------------------------------------------------------------
{
  assert.equal(labelOf({ name: 'crochet-hook', size: 4.5 }), 'crochet-hook 4.5mm');
  assert.equal(labelOf({ name: 'stitch-markers', size: null }), 'stitch-markers',
    'a stitch marker has no size attribute to show');
}

console.log('visit.js self-check: all assertions passed');
