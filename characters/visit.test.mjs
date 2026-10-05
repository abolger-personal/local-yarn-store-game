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
  findPath, obstacles, closeoutFor, rejoin, regulars, dayProgress, tidyShop,
} from './visit.js';
import { WIP_STATE, wantsOf, canStart, workRound, returnToNpc } from './wip.js';

// A WIP built by hand rather than rolled, so a test asserts behaviour and not luck. Defaults to a
// crochet hat that already has its yarn and is short only a hook — which makes `crochet-hook` the
// NPC's one and only want, and keeps the buy tests below reading the way they did before WIPs.
// A hat costs 3 balls (PATTERNS.md, 2026-10-02), and the WIP below holds three: a ball is one unit
// whatever its weight. It was 5 units and one bulky ball when a 3x3 ball counted 9.
const PATTERN = (over = {}) => ({
  name: 'pattern', patternType: 'hat', craft: 'crochet', yarnUnits: 3, minColors: 1,
  // toolSize and weight are what the strict match compares against — a pattern without them
  // matches nothing, which shows up as an NPC who wants nothing rather than as an error.
  toolSize: 4.5, weight: 'bulky', materials: ['wool'], w: 2, h: 2, ...over,
});
const YARN = (over = {}) => ({
  name: 'yarn', material: 'wool', weight: 'bulky', shape: 'ball', colorIndex: 0, w: 3, h: 3, ...over,
});
const WIP = (over = {}) => ({
  id: 'WIP 1', state: WIP_STATE.UNSTARTED, pattern: PATTERN(), yarn: [YARN(), YARN(), YARN()], tool: null,
  progress: 0, ...over,
});
const PREFS = { skill: 3, crafts: ['crochet'], materials: ['wool'], weights: ['bulky'] };

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

function fixture({ rng = seq(0.5), traits, seats = SEATS, wips } = {}) {
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

  // an item `name` of `size`, placed on `display` at [shelf, column, row]
  const add = (display, [shelfIndex, c, r], name, size) => {
    const index = items.length;
    const keys = footprint(display.g, shelfIndex, [c, r], [1, 1]);
    items.push({ name, size, display: display.id, shelf: shelfIndex, c, r, w: 1, h: 1, keys, layer: 0 });
    items[index].layer = place(display.g, keys, index);
    return index;
  };

  const npc = makeNpc({
    id: 'n1', name: 'Test', species: 'Owl',
    target: { name: 'crochet-hook', size: 4.5 },
    traits: traits ?? Object.fromEntries(TRAITS.map((t) => [t, 3])),
    prefs: { ...PREFS }, rng,
  });
  // Overwrite the rolled WIPs with the fixed one, so every assertion below knows exactly what this
  // NPC is shopping for.
  npc.wips = wips ?? [WIP()];
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
  add(pile, [0, 0, 0], 'crochet-hook', 4.5);                          // makes the pile attractive
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
  const HOOK = { name: 'crochet-hook', size: 4.5 };
  npc.wips = ['a', 'b', 'c', 'd'].map((id) => WIP({ id, state: WIP_STATE.IN_PROGRESS, tool: HOOK }));
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

  // Only a WIP a round of work would move: not unstarted, not finished, not out of yarn
  // (one ball of a three-ball hat, already worked to where that ball ends).
  npc.wips = [WIP({ id: 'stuck' }), WIP({ id: 'done', state: WIP_STATE.FINISHED, tool: HOOK, progress: 100 }),
    WIP({ id: 'dry', state: WIP_STATE.IN_PROGRESS, tool: HOOK, yarn: [YARN()], progress: 100 / 3 })];
  for (const seat of ['chair-a', null]) {
    npc.seat = seat;
    assert.ok(!browseActionSet(npc, world, []).some((a) => a.type === ACTION.WORK_ON_WIP || a.type === ACTION.WALK_TO_SEAT),
      `nobody sits to knit a project they cannot make progress on (seat ${seat})`);
  }
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
  const buried = add(pile, [0, 0, 0], 'crochet-hook', 4.5);
  const onTop = add(pile, [0, 0, 0], 'darning-needle', null);   // stacks over the hook

  assert.ok(!noticeable(pile, items, buried), 'buried in a stack cannot be noticed');
  assert.ok(noticeable(pile, items, onTop), 'the top of the stack can');
  assert.equal(buyableTargets(pile, items, npc.target).length, 0, 'so there is nothing to buy yet');

  // Assertiveness > 3 digs it out: "Interaction Not Complete", then buyable next round.
  npc.traits.Assertiveness = 5;
  npc.traits.Orderliness = 3;
  assert.equal(interact(npc, pile, world), 'incomplete', 'rearranging does not finish the interaction');
  assert.equal(buyableTargets(pile, items, npc.target).length, 1, 'the target is now on top');

  // DISPLAYS.md now puts a CONSIDERATION round between noticing and buying: "An item will be
  // bought if it was considered in the previous round AND the consideration interaction came back
  // true." So digging it out no longer buys it next round — it gets picked up and turned over.
  assert.equal(interact(npc, pile, world), 'incomplete', 'the next interaction considers it');
  assert.equal(npc.considering?.index, buried, 'and records what is being turned over');
  assert.ok(!items[buried].gone, 'considering does not remove it from the display');

  assert.equal(interact(npc, pile, world), 'complete', 'the round after that buys it');
  assert.ok(items[buried].gone, 'the purchase removes the item from the display');
  assert.equal(npc.carrying.name, 'crochet-hook', 'and the NPC carries it out');
  assert.equal(npc.considering, null, 'the consideration is spent');
}

// --- a multi-cell package is exposed only when ALL its columns are clear ----
{
  const { pile, items, npc, add } = fixture();
  // a 2x1 bridging columns 0 and 1
  const wide = items.length;
  const keys = footprint(pile.g, 0, [0, 0], [2, 1]);
  items.push({ name: 'crochet-hook', size: 4.5, display: 'pile', shelf: 0, c: 0, r: 0, w: 2, h: 1,
               keys, layer: place(pile.g, keys, wide), gone: false, held: false });

  assert.ok(fullyExposed(pile, items, wide), 'nothing on it yet, so it is exposed');
  assert.ok(noticeable(pile, items, wide), 'and noticeable');

  add(pile, [0, 0, 0], 'darning-needle', null);   // lands on column 0 only, half-burying the 2x1
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
  const keys = footprint(shelf.g, 0, [0, 0], [1, 2]);   // rows 0 and 1; row 0 is the wall
  items.push({ name: 'crochet-hook', size: 4.5, display: 'shelf', shelf: 0, c: 0, r: 0, w: 1, h: 2,
               keys, layer: place(shelf.g, keys, deep), gone: false, held: false });
  assert.ok(noticeable(shelf, items, deep),
    'part of it reaches the outside face, so the wall-row rule must not hide the whole package');
}

// --- an item in the player's hand is invisible to NPCs ----------------------
{
  const { pile, items, npc, add } = fixture();
  const idx = add(pile, [0, 0, 0], 'crochet-hook', 4.5);
  assert.equal(buyableTargets(pile, items, npc.target).length, 1, 'on the display it is buyable');
  items[idx].held = true;
  assert.ok(!noticeable(pile, items, idx), 'held by the player, it is not on the display at all');
  assert.equal(buyableTargets(pile, items, npc.target).length, 0,
    'so an NPC cannot buy it out of the hand');
}

// --- a shelf never sells off its wall-facing row ----------------------------
{
  const { shelf, items, npc, add } = fixture();
  const atWall = add(shelf, [0, 0, 0], 'crochet-hook', 4.5);    // row 0 === shelf.wallRow
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

// --- closeout: signing and leaving always, the Drop Off only with something to lend -------
//
// CHARACTER-VISIT.md moved the Drop Off from "ALWAYS 2nd to LAST" to "2nd to LAST IF NPC HAS A
// FINISHED OBJECT", so the sequence is now per-visit rather than hardcoded.
const runCloseout = (world, npc) => {
  const seen = [];
  for (let i = 0; i < 5 && npc.state !== STATE.GONE; i++) {
    advanceRound(world);
    if (npc.action) seen.push(npc.action.type);
  }
  return seen;
};

{
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP()];                       // nothing finished

  assert.deepEqual(closeoutFor(npc), [ACTION.SIGN_GUESTBOOK, ACTION.LEAVE],
    'nothing to lend, so no Drop Off step exists at all');
  const seen = runCloseout(world, npc);
  assert.deepEqual(seen.slice(0, 2), [ACTION.SIGN_GUESTBOOK, ACTION.LEAVE],
    'sign the Guestbook, then leave');
  assert.ok(!seen.includes(ACTION.DROP_OFF), 'an empty-handed NPC must not visit the Drop Off');
  assert.equal(npc.state, STATE.GONE, 'and the visit is over');

  // Signing ALWAYS writes an entry now. No finished object and nothing bought: a disappointed note.
  assert.equal(world.guestbook.length, 1, 'signing always leaves an entry');
  assert.deepEqual(
    { kind: world.guestbook[0].kind, mood: world.guestbook[0].mood },
    { kind: 'note', mood: 'disappointed' },
    'no object and no purchase reads as disappointed');
  assert.equal(world.dropOff.length, 0, 'and nothing was lent');
}

{
  // WEARABLE-FINISHED-OBJ.md: one finished hat and a free head slot means they WEAR it and
  // "will not offer it to the shop to lend" — so there is no Drop Off step at all.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP({ state: WIP_STATE.FINISHED, progress: 100 })];

  const seen = runCloseout(world, npc);
  assert.deepEqual(seen.slice(0, 2), [ACTION.SIGN_GUESTBOOK, ACTION.LEAVE],
    'they wear it home rather than lending it');
  assert.equal(npc.worn.head?.id, 'WIP 1', 'the hat is on their head');
  assert.equal(world.dropOff.length, 0, 'and the shop gets nothing');
  assert.equal(world.guestbook[0].kind, 'photo', 'a finished object still makes it a picture');
}

{
  // A SECOND hat has nowhere to go, so that one is lent. The overflow is the shop's share.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [
    WIP({ id: 'WIP 1', state: WIP_STATE.FINISHED, progress: 100 }),
    WIP({ id: 'WIP 2', state: WIP_STATE.FINISHED, progress: 100 }),
  ];

  const seen = runCloseout(world, npc);
  assert.deepEqual(seen.slice(0, 3), [...CLOSEOUT_SEQUENCE],
    'sign the Guestbook, lend the spare, then leave — in that order');
  assert.equal(npc.worn.head?.id, 'WIP 1', 'the first hat is worn');
  assert.deepEqual(world.dropOff.map((d) => d.wip.id), ['WIP 2'], 'the second is lent');
  assert.deepEqual(npc.toLend, [], 'and nothing is left over');
}

{
  // ORDER MATTERS: signing is 3rd-to-last and the Drop Off 2nd-to-last, so an NPC is photographed
  // with the object still in hand and hands it over afterwards. Asserted round by round, because
  // "it leaves the WIP slots" is easy to implement one step too early — where the photo would be
  // taken of somebody who had already given the thing away.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.worn.head = WIP({ id: 'already worn', state: WIP_STATE.FINISHED, progress: 100 });
  npc.wips = [WIP({ id: 'spare hat', state: WIP_STATE.FINISHED, progress: 100 })];

  advanceRound(world);   // sign
  assert.equal(npc.action.type, ACTION.SIGN_GUESTBOOK, 'signing comes first');
  assert.equal(world.guestbook.length, 1, 'and writes the entry');
  assert.deepEqual(npc.wips.map((w) => w.id), ['spare hat'],
    'the object being lent is STILL theirs while they sign');
  assert.equal(world.dropOff.length, 0, 'nothing has been handed over yet');

  advanceRound(world);   // lend
  assert.equal(npc.action.type, ACTION.DROP_OFF, 'the Drop Off comes second');
  assert.deepEqual(world.dropOff.map((d) => d.wip.id), ['spare hat'], 'now the shop has it');
  assert.deepEqual(npc.wips, [], 'and only now does it leave the WIP slots');

  advanceRound(world);   // leave
  assert.equal(npc.action.type, ACTION.LEAVE, 'and leaving is last');
}

{
  // Happy is "found what they are looking for", which is having bought something.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP()];
  npc.bought.push({ name: 'crochet-hook', size: 4.5 });
  runCloseout(world, npc);
  assert.equal(world.guestbook[0].mood, 'happy', 'leaving with a purchase reads as happy');
}

// --- WIPs: wants, starting, progress, and handing an object back -------------
{
  // The fixture WIP has its pattern and enough yarn, and is short only a hook.
  const { npc } = fixture();
  assert.deepEqual(wantsOf(npc).map((w) => w.kind), ['tool'],
    'a WIP with pattern and yarn wants only the tool');
  assert.ok(!canStart(npc.wips[0], npc.prefs), 'and cannot start without it');

  npc.wips[0].tool = { name: 'crochet-hook', size: 4.5 };
  assert.deepEqual(wantsOf(npc), [], 'with the hook it needs nothing');
  assert.ok(canStart(npc.wips[0], npc.prefs), 'and can be started');

  // A knitting pattern needs knitting needles specifically — a hook will not do.
  const knit = WIP({ pattern: PATTERN({ craft: 'knitting' }), tool: { name: 'crochet-hook', size: 4.5 } });
  assert.deepEqual(wantsOf({ ...npc, wips: [knit] }).map((w) => w.tool), ['knitting-needles'],
    'the pattern names the craft, and the craft names the tool');
}

{
  // "1/(number of units of yarn called for by pattern) * characterWeight", characterWeight =
  // (skill/3) * (Industriousness/3). At skill 3 and Industriousness 3 that is exactly 1, so a
  // 3-ball hat is a 3-round job (5 rounds when it cost 5 units).
  const { npc } = fixture();
  const wip = npc.wips[0];
  wip.tool = { name: 'crochet-hook', size: 4.5 };
  wip.state = WIP_STATE.IN_PROGRESS;
  npc.prefs.skill = 3;
  npc.traits.Industriousness = 3;

  for (let i = 1; i <= 2; i++) {
    assert.equal(workRound(npc, wip), false, `round ${i} does not finish a 3-ball hat`);
    assert.equal(Math.round(wip.progress), Math.round(i * 100 / 3), `and it is ${i}/3 done`);
  }
  assert.equal(workRound(npc, wip), true, 'the third round finishes it');
  assert.equal(wip.state, WIP_STATE.FINISHED, 'which makes it a finished object');
  assert.equal(npc.prefs.skill, 4, 'and permanently raises their crafter skill');

  // "up to a max of 5"
  npc.prefs.skill = 5;
  const another = WIP({ id: 'WIP 2', state: WIP_STATE.IN_PROGRESS, progress: 99 });
  workRound(npc, another);
  assert.equal(npc.prefs.skill, 5, 'crafter skill is capped at five');
}

{
  // A faster crafter takes fewer rounds. Same pattern, better hands.
  const { npc } = fixture();
  const wip = WIP({ state: WIP_STATE.IN_PROGRESS });
  npc.prefs.skill = 5;
  npc.traits.Industriousness = 5;
  let rounds = 0;
  while (!workRound(npc, wip) && rounds < 20) rounds++;
  assert.ok(rounds < 2, `skill 5 and Industriousness 5 should beat 3 rounds, took ${rounds + 1}`);
}

{
  // "return borrowed FO to NPC": it goes into the worn slot, and whatever was there lands in the
  // pile behind the guestbook.
  const { world, npc } = fixture();
  const worn = WIP({ id: 'old hat', state: WIP_STATE.FINISHED });
  const lent = WIP({ id: 'new hat', state: WIP_STATE.FINISHED });
  npc.worn.head = worn;
  world.dropOff.push({ npc: npc.name, npcId: npc.id, wip: lent, object: 'hat', round: 1 });

  assert.ok(returnToNpc(world, npc, lent), 'the shop can hand it back');
  assert.equal(npc.worn.head, lent, 'it goes on their head');
  assert.equal(world.dropOff.length, 0, 'and off the Drop Off display');
  assert.deepEqual(world.backPile.map((b) => b.wip.id), ['old hat'],
    'the one they were wearing goes in the pile behind the guestbook');
}

// --- returning visitors -------------------------------------------------------
{
  // "NPC Visitors who manage to either buy any items or work on a WIP should be marked for return"
  const bought = fixture();
  bought.npc.state = STATE.CLOSEOUT;
  bought.npc.closeoutStep = 0;
  bought.npc.wips = [WIP()];
  bought.npc.willReturn = true;               // as the buy branch sets it
  runCloseout(bought.world, bought.npc);
  assert.deepEqual(bought.world.returning.map((n) => n.id), ['n1'], 'a buyer goes on the list');

  // ...and one who did neither does not.
  const idle = fixture();
  idle.npc.state = STATE.CLOSEOUT;
  idle.npc.closeoutStep = 0;
  idle.npc.wips = [WIP()];
  runCloseout(idle.world, idle.npc);
  assert.deepEqual(idle.world.returning, [], 'a browser who bought nothing is not a regular');
}

{
  // Buying marks them, through the real interact() path rather than by setting the flag.
  const { world, pile, npc, add } = fixture();
  add(pile, [0, 0, 0], 'crochet-hook', 4.5);
  assert.equal(npc.willReturn, false, 'not marked on arrival');
  interact(npc, pile, world);                 // consider
  assert.equal(npc.willReturn, false, 'considering alone is not enough');
  interact(npc, pile, world);                 // buy
  assert.ok(npc.willReturn, 'buying marks them for return');
}

{
  // Working on a WIP marks them — but only real work. Sitting down with something that cannot be
  // started yet is explicitly not "working on a WIP".
  const { world, npc } = fixture();
  npc.state = STATE.BROWSE;
  npc.seat = 'chair-a';
  npc.wips = [WIP({ id: 'stuck' })];           // UNSTARTED: no tool
  npc.prescribed = { type: ACTION.WORK_ON_WIP, params: { wip: 'stuck', seatId: 'chair-a' } };
  advanceRound(world);
  assert.equal(npc.willReturn, false, 'sitting with an unstartable project earns nothing');

  npc.wips = [WIP({ id: 'live', state: WIP_STATE.IN_PROGRESS,
                    tool: { name: 'crochet-hook', size: 4.5 } })];
  npc.seat = 'chair-a';
  npc.prescribed = { type: ACTION.WORK_ON_WIP, params: { wip: 'live', seatId: 'chair-a' } };
  advanceRound(world);
  assert.ok(npc.willReturn, 'actually working on it does');
}

{
  // A returning NPC comes back as THEMSELVES. This is the assertion that matters: the whole point
  // of the roster is that a twenty-round sweater can span visits.
  const { npc } = fixture();
  npc.prefs.skill = 5;                                    // earned by finishing something
  npc.traits.Openness = 1;
  const sweater = WIP({ id: 'sweater', state: WIP_STATE.IN_PROGRESS, progress: 64,
                        tool: { name: 'crochet-hook', size: 4.5 } });
  npc.wips = [sweater];
  npc.worn.head = WIP({ id: 'their hat', state: WIP_STATE.FINISHED, progress: 100 });
  npc.restructured = ['pile'];
  npc.bought = [{ name: 'yarn' }];
  npc.roundsInStore = 9;
  npc.chatted = true;
  npc.willReturn = true;
  npc.seat = 'chair-a';

  rejoin(npc, { at: { x: 0, z: 3 }, rng: seq(0.5) });

  // Kept
  assert.equal(npc.prefs.skill, 5, 'crafter skill is permanent, including the +1 they earned');
  assert.equal(npc.traits.Openness, 1, 'temperament does not change between visits');
  assert.equal(npc.wips[0], sweater, 'the same WIP slot comes back');
  assert.equal(npc.wips[0].progress, 64, 'at the progress they left it at — this is the point');
  assert.equal(npc.worn.head?.id, 'their hat', 'and they are still wearing their hat');
  assert.equal(npc.visits, 2, 'their visit count goes up');

  // Reset
  assert.equal(npc.state, STATE.QUEUED, 'they queue outside like anyone else');
  assert.equal(npc.roundsInStore, 0, 'with a fresh clock');
  assert.deepEqual(npc.bought, [], 'and an empty basket');
  assert.equal(npc.seat, null, 'not still holding last visit\'s chair');
  assert.equal(npc.chatted, false, 'the guestbook tags start clean');
  assert.equal(npc.willReturn, false, 'they have to earn the next return');
  // DISPLAYS.md rule 9: "an NPC who leaves and comes back on a later visit starts fresh".
  assert.deepEqual(npc.restructured, [], 'so they may tidy the same display again');
  assert.deepEqual([npc.x, npc.z], [0, 3], 'and they start where they were put');
}

{
  // A rejoined regular can finish the project they came back for.
  const { world, npc } = fixture();
  npc.prefs.skill = 3;
  npc.traits.Industriousness = 3;
  const wip = WIP({ id: 'cowl', state: WIP_STATE.IN_PROGRESS, progress: 0,
                    pattern: PATTERN({ patternType: 'scarf', yarnUnits: 5 }),
                    yarn: Array.from({ length: 5 }, () => YARN()),   // all of it: short, the work would stop
                    tool: { name: 'crochet-hook', size: 4.5 } });
  npc.wips = [wip];
  npc.state = STATE.BROWSE;

  // Three rounds of work this visit, then home.
  for (let i = 0; i < 3; i++) {
    npc.seat = 'chair-a';
    npc.prescribed = { type: ACTION.WORK_ON_WIP, params: { wip: 'cowl', seatId: 'chair-a' } };
    advanceRound(world);
  }
  assert.equal(Math.round(wip.progress), 60, 'three of the five rounds are done');
  assert.equal(wip.state, WIP_STATE.IN_PROGRESS, 'not finished yet');

  rejoin(npc, { rng: seq(0.5) });
  npc.state = STATE.BROWSE;
  for (let i = 0; i < 2; i++) {
    npc.seat = 'chair-a';
    npc.prescribed = { type: ACTION.WORK_ON_WIP, params: { wip: 'cowl', seatId: 'chair-a' } };
    advanceRound(world);
  }
  assert.equal(wip.state, WIP_STATE.FINISHED, 'and the next visit finishes it');
  assert.equal(npc.prefs.skill, 4, 'earning the skill point on the second visit');
}

{
  // The roster does not double-count somebody who leaves twice.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP()];
  npc.willReturn = true;
  runCloseout(world, npc);
  rejoin(npc);
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.willReturn = true;
  runCloseout(world, npc);
  assert.equal(world.returning.length, 1, 'one entry per customer, however often they visit');
  assert.equal(regulars(world)[0].id, 'n1', 'and regulars() lists them');
}

// --- guestbook tags ----------------------------------------------------------
{
  // Every tag has to be readable off state the visit already kept — a tag that needs its own
  // bookkeeping can disagree with what actually happened.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP()];
  npc.bought.push({ name: 'yarn', weight: 'bulky', material: 'wool' },
                  { name: 'crochet-hook', size: 4.5 });
  npc.chatted = true;
  npc.satAndWorked = true;

  runCloseout(world, npc);
  const entry = world.guestbook[0];
  assert.equal(entry.mood, 'happy', 'they bought something, so the mood icon is happy');
  assert.deepEqual(entry.tags.sort(), ['chatted', 'sat', 'tool', 'yarn'].sort(),
    'and the tags name what they actually did — no pattern tag, because they bought none');
}

{
  // An empty-handed visit that ran out of rounds, with nothing else to report.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.wips = [WIP()];
  npc.roundsInStore = npc.maxRounds;

  runCloseout(world, npc);
  assert.deepEqual(world.guestbook[0].tags, ['ranOut'], 'only the one thing worth recording');
  assert.equal(world.guestbook[0].mood, 'disappointed');
}

{
  // Disappointed means they needed something and left without it. A regular who came back with
  // everything for their project and sat knitting bought nothing -- and is not disappointed.
  for (const [what, set] of [['sat and worked', (n) => { n.satAndWorked = true; }],
                             ['needed nothing', (n) => { n.wips = []; }]]) {
    const { world, npc } = fixture();
    npc.state = STATE.CLOSEOUT;
    npc.closeoutStep = 0;
    npc.wips = [WIP()];
    set(npc);
    runCloseout(world, npc);
    assert.equal(world.guestbook[0].mood, 'happy', `bought nothing but ${what}: happy`);
  }
}

{
  // A finished object gives the photo AND the lend tag, since the spare goes to the shop.
  const { world, npc } = fixture();
  npc.state = STATE.CLOSEOUT;
  npc.closeoutStep = 0;
  npc.worn.head = WIP({ id: 'worn hat', state: WIP_STATE.FINISHED, progress: 100 });
  npc.wips = [WIP({ id: 'spare hat', state: WIP_STATE.FINISHED, progress: 100 })];

  runCloseout(world, npc);
  assert.equal(world.guestbook[0].kind, 'photo', 'making something outranks happy/disappointed');
  assert.ok(world.guestbook[0].tags.includes('lent'), 'and the spare being lent is tagged');
}

// --- MAX_ROUNDS -------------------------------------------------------------
{
  // (Openness + Industriousness + Enthusiasm) * uniform(1, 2), rolled once per visit.
  const traits = (o, i, e) => ({ Openness: o, Industriousness: i, Enthusiasm: e });
  assert.equal(maxRounds(traits(1, 1, 1), () => 0), 3, 'the floor is three rounds');
  assert.equal(maxRounds(traits(5, 5, 5), () => 1), 30, 'and the ceiling is thirty');
  assert.equal(maxRounds(traits(4, 2, 3), () => 0.5), 14, '(4+2+3) * 1.5');

  // The roll is per visit, so two identical characters can have different patience.
  const same = { Openness: 3, Industriousness: 3, Enthusiasm: 3 };
  const rolls = new Set([0, 0.25, 0.5, 0.75, 1].map((r) => maxRounds(same, () => r)));
  assert.ok(rolls.size > 1, 'identical traits must still give a spread of dwell times');
}

// --- Volatility 5 walks out after a fruitless interaction --------------------
{
  const impatient = { ...Object.fromEntries(TRAITS.map((x) => [x, 3])), Volatility: 5 };
  const { world, pile, npc, add } = fixture({ traits: impatient });
  npc.maxRounds = 12;
  add(pile, [0, 0, 0], 'darning-needle', null);   // present, but not what they came for

  assert.equal(interact(npc, pile, world), 'complete', 'nothing to buy and nothing to restructure');
  assert.equal(npc.maxRounds, 1, 'Volatility 5 cuts MAX_ROUNDS to 1 after a fruitless interaction');
}

{
  // ...and does NOT cut it when the interaction actually found the thing.
  const impatient = { ...Object.fromEntries(TRAITS.map((x) => [x, 3])), Volatility: 5 };
  const { world, pile, npc, add } = fixture({ traits: impatient });
  npc.maxRounds = 12;
  add(pile, [0, 0, 0], 'crochet-hook', 4.5);

  // Considering is not a fruitless interaction — they have found the thing, they are deciding.
  assert.equal(interact(npc, pile, world), 'incomplete', 'the hook is there, so they consider it');
  assert.equal(npc.maxRounds, 12, 'and MAX_ROUNDS is left alone');
  assert.equal(interact(npc, pile, world), 'complete', 'then buy it next round');
  assert.ok(npc.carrying, 'so they picked it up');
  assert.equal(npc.maxRounds, 12, 'a successful interaction still leaves MAX_ROUNDS alone');
}

{
  // A calmer shopper is unaffected by the same fruitless interaction.
  const { world, pile, npc, add } = fixture();
  npc.maxRounds = 12;
  add(pile, [0, 0, 0], 'darning-needle', null);
  interact(npc, pile, world);
  assert.equal(npc.maxRounds, 12, 'Volatility 3 shrugs it off');
}

// --- routing around the furniture -------------------------------------------
//
// The invariant is checked by SAMPLING the returned polyline against the raw boxes, deliberately
// not by reusing segmentHitsBox — a bug in that primitive must not be able to hide behind itself.
{
  const room = {
    ...ROOM,
    bounds: { minX: -2.6, maxX: 2.6, minZ: -2.6, maxZ: 2.6 },
    solids: [{ x: -2.1, z: 1.7, w: 1.4, d: 0.45 }],            // the counter
  };
  const displays = [
    { id: 'table-a', x: 1.5, z: -0.2, w: 1.0, d: 1.0 },
    { id: 'floor-a', x: 0.55, z: 0.85, w: 0.8, d: 0.8 },
    { id: 'table-c', x: -0.35, z: -1.75, w: 0.8, d: 0.8 },
  ];
  const seats = [{ id: 'chair-a', x: -1.75, z: -0.55, facing: 0, w: 0.34, d: 0.34 }];
  const world = makeWorld({ displays, items: [], room, seats });
  const boxes = obstacles(world);

  const inside = (p, b, slack = 0) =>
    Math.abs(p.x - b.x) <= b.w / 2 - slack && Math.abs(p.z - b.z) <= b.d / 2 - slack;

  // Number of samples along the route that land well inside furniture neither end is already in.
  const clips = (from, path) => {
    const to = path[path.length - 1];
    let bad = 0, a = from;
    for (const b of path) {
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01));
      for (let i = 0; i <= steps; i++) {
        const p = { x: a.x + (b.x - a.x) * (i / steps), z: a.z + (b.z - a.z) * (i / steps) };
        for (const box of boxes) {
          // An endpoint genuinely INSIDE furniture — the chair you are walking to — has that
          // obstacle dropped on purpose, so the route is allowed into it.
          if (inside(p, box, 0.04) && !inside(from, box) && !inside(to, box)) bad++;
        }
      }
      a = b;
    }
    return bad;
  };

  // Along the top of the room, clear of the counter's berth and of everything else.
  assert.deepEqual(findPath(world, { x: -2, z: 2.4 }, { x: 2, z: 2.4 }), [{ x: 2, z: 2.4 }],
    'a clear line is left alone — no waypoints, no detour');

  // Straight through table-a: must go round, and must still arrive.
  const around = findPath(world, { x: 1.5, z: -1.6 }, { x: 1.5, z: 1.2 });
  assert.ok(around.length > 1, 'a route through a table should have been diverted');
  assert.deepEqual(around[around.length - 1], { x: 1.5, z: 1.2 }, 'and must still end at the goal');
  assert.equal(clips({ x: 1.5, z: -1.6 }, around), 0, 'the diverted route still crosses the table');

  // Walking to a chair: the goal is inside an obstacle and must stay reachable.
  const toChair = findPath(world, { x: 2.2, z: 1.8 }, { x: -1.75, z: -0.55 });
  assert.deepEqual(toChair[toChair.length - 1], { x: -1.75, z: -0.55 }, 'must reach the seat itself');
  assert.equal(clips({ x: 2.2, z: 1.8 }, toChair), 0, 'the route to a chair crosses other furniture');

  // The case that made routing worth having: a berth wide enough to SEAL a walkable gap. The
  // fallback tries a narrower berth before giving up, because squeezing past is right and walking
  // through is not.
  const pinched = makeWorld({
    displays: [{ id: 'wide', x: 0, z: 0, w: 1.0, d: 4.4 }], items: [], room, seats: [],
  });
  const squeeze = findPath(pinched, { x: -2, z: 0 }, { x: 2, z: 0 });
  assert.ok(squeeze.length > 1, 'should have routed around the divider rather than through it');

  // A deterministic sweep of the whole floor, which is what actually catches the corner cases.
  let checked = 0, routed = 0, crossings = 0;
  // every point of a grid over the floor, x outer, in tenths of a unit from -2.5 to 2.5
  const floor = (step) => {
    const at = [];
    for (let x = -25; x <= 25; x += step) for (let z = -25; z <= 25; z += step) at.push({ x: x / 10, z: z / 10 });
    return at;
  };
  for (const from of floor(5)) {
    for (const to of floor(10)) {
      const path = findPath(world, from, to);
      checked++;
      if (path.length > 1) routed++;
      crossings += clips(from, path);
    }
  }
  assert.equal(crossings, 0, `${crossings} route samples cut through furniture across ${checked} routes`);
  assert.ok(routed > checked * 0.1, 'suspiciously few routes were diverted — is the pathing running?');
}

// --- labels ------------------------------------------------------------------
{
  assert.equal(labelOf({ name: 'crochet-hook', size: 4.5 }), 'crochet-hook 4.5mm');
  assert.equal(labelOf({ name: 'stitch-markers', size: null }), 'stitch-markers',
    'a stitch marker has no size attribute to show');
}

// --- the day's light ------------------------------------------------------------
// dayProgress runs the light and the clock, so whatever the cast does it must start dark-to-light
// at 0, only ever climb while the rounds play out, and land on exactly 1 when the shop empties.
{
  const world = makeWorld({ displays: [], items: [], room: ROOM, seats: [] });
  world.npcs = [0, 1, 2].map((i) => makeNpc({ id: `d${i}`, name: `D${i}`, species: 'Owl' }));
  assert.equal(dayProgress(world), 0, 'a day starts at opening');
  let last = 0;
  for (let r = 0; r < 200 && world.npcs.some((n) => n.state !== STATE.GONE); r++) {
    advanceRound(world);
    const t = dayProgress(world);
    assert.ok(t > 0 && t <= 1, `day progress ${t} out of range`);
    // Not monotone by construction (see dayProgress), but never backward by more than a round.
    assert.ok(t >= last - 1 / world.round, `day progress fell from ${last} to ${t}`);
    last = Math.max(last, t);
  }
  assert.equal(dayProgress(world), 1, 'an empty shop has finished its day');
}

// --- tidy the shop ------------------------------------------------------------------
// The player's tidy button: the floor emptied onto displays with room, every item noticeable,
// each plane in category order, and nothing created or lost on the way.
{
  const { world, pile, shelf, items, add, npc } = fixture();
  const floor = { id: 'floor-0-0', kind: 'pile', solid: false, x: 1, z: 1, w: 0.6, d: 0.6, wallRow: -1,
    standAt: { x: 1, z: 1.5 }, g: makeDisplay(3, 3, { shelves: 1, headroom: 6, cell: 0.2 }) };
  world.displays.push(floor);
  // Six items for six flat noticeable slots (four on the pile, the front row of the shelf): a tower
  // of three, one beside it, one in the shelf's wall row, one on the floor.
  for (const name of ['yarn', 'crochet-hook', 'pattern']) add(pile, [0, 0, 0], name);
  add(pile, [0, 1, 1], 'stitch-markers');
  add(shelf, [0, 0, 0], 'darning-needle');
  add(floor, [0, 1, 1], 'button');
  const live = () => items.filter((it) => !it.gone && !it.held).length;
  const before = live();
  const byName = (d) => items.filter((it) => it.display === d.id).sort((a, b) => a.r - b.r || a.c - b.c)
    .map((it) => it.name);

  assert.equal(tidyShop(world), 0, 'everything fitted flat');
  assert.equal(live(), before, 'a tidy neither makes nor loses stock');
  assert.equal(items.filter((it) => it.display === floor.id).length, 0, 'the displays had room, so the floor is clear');
  items.forEach((it, i) => assert.ok(noticeable(world.displays.find((d) => d.id === it.display), items, i),
    `${it.name} is buried or against the wall after a tidy`));
  for (const d of [pile, shelf]) {
    const names = byName(d);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), `${d.id} is not in category order`);
  }

  // Full shop: two more on the floor have nowhere flat to go on furniture, so they stay down —
  // flat, so still findable.
  add(floor, [0, 0, 0], 'yarn');
  add(floor, [0, 0, 0], 'pattern');
  assert.equal(tidyShop(world), 0);
  assert.equal(items.filter((it) => it.display === floor.id).length, 2, 'overflow stays on the floor');
  items.forEach((it, i) => assert.ok(fullyExposed(world.displays.find((d) => d.id === it.display), items, i)));

  // An item someone is turning over pins its plane, and a held one is not touched at all.
  const onPile = items.findIndex((it) => it.display === pile.id);
  npc.considering = { displayId: pile.id, index: onPile, round: world.round };
  const pileWas = items.map((it) => it.display === pile.id && `${it.c},${it.r},${it.layer}`);
  const held = items.findIndex((it) => it.display === floor.id);
  items[held].held = true;
  const heldWas = { ...items[held] };
  tidyShop(world);
  assert.deepEqual(items.map((it) => it.display === pile.id && `${it.c},${it.r},${it.layer}`), pileWas,
    'the considered item\'s plane moved under the NPC');
  assert.deepEqual(items[held], heldWas, 'the item in the player\'s hand was moved');
}

console.log('visit.js self-check: all assertions passed');
