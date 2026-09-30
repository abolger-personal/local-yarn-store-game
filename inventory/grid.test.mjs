// Self-check for the pure display model. Run: node inventory/grid.test.mjs
import assert from 'node:assert/strict';
import { makeDisplay, footprint, fits, place, lift, topAt, dropLayer, columnAt, clearShelf,
         nearestSlot, anySlot, slotRect, EMPTY } from './grid.js';

// --- footprint bounds + mask ------------------------------------------------
{
  // shelf 0 full, shelf 1 masks out column 0
  const g = makeDisplay(3, 2, { shelves: 2, mask: (s, c) => !(s === 1 && c === 0) });
  assert.equal(footprint(g, 0, [2, 0], [2, 1]), null, '2×1 running off the right edge is invalid');
  assert.ok(footprint(g, 0, [1, 0], [2, 1]), '2×1 that fits is valid');
  assert.equal(footprint(g, 1, [0, 0], [1, 1]), null, 'a masked slot is a hole');
  assert.ok(footprint(g, 1, [1, 0], [1, 1]), 'unmasked slot on the same shelf is fine');
}

// --- stacking + top-only pick ----------------------------------------------
{
  const g = makeDisplay(2, 1, { shelves: 1, headroom: 3 });
  const at = (c) => footprint(g, 0, [c, 0], [1, 1]);
  assert.equal(place(g, at(0), 10), 0, 'first item lands on the shelf floor');
  assert.equal(place(g, at(0), 11), 1, 'second item stacks on top');
  assert.equal(topAt(g, 0, 0, 0), 11, 'pick grabs the TOP of the pile');
  lift(g, at(0));
  assert.equal(topAt(g, 0, 0, 0), 10, 'lifting the top exposes the one below');

  // headroom is a hard ceiling
  place(g, at(0), 12);                       // pile is now height 2 again (10,12)
  assert.equal(dropLayer(g, at(0)), 2, 'next drop would be layer 2');
  assert.ok(fits(g, at(0)), 'layer 2 < headroom 3, still fits');
  place(g, at(0), 13);
  assert.ok(!fits(g, at(0)), 'shelf is full at headroom, no more room');
}

// --- footprint bridges columns of unequal height ---------------------------
{
  const g = makeDisplay(2, 1, { shelves: 1, headroom: 4 });
  place(g, footprint(g, 0, [0, 0], [1, 1]), 1);  // column 0 now height 1, column 1 empty
  const wide = footprint(g, 0, [0, 0], [2, 1]);  // a 2×1 across both
  assert.equal(place(g, wide, 2), 1, 'the 2×1 rests on top of the taller column');
  assert.equal(topAt(g, 0, 0, 0), 2, 'it is the top of the tall column');
  assert.equal(topAt(g, 0, 1, 0), 2, 'and the top of the bridged column');
  lift(g, wide);
  assert.equal(topAt(g, 0, 0, 0), 1, 'lifting the 2×1 leaves the original item');
  assert.equal(topAt(g, 0, 1, 0), EMPTY, 'and clears the bridged column entirely');
}

// --- columnAt round-trips through slot centres -----------------------------
{
  const g = makeDisplay(4, 3, { cell: 0.26 });
  const { x, z } = { x: (2 + 0.5) * 0.26 - 4 * 0.26 / 2, z: (1 + 0.5) * 0.26 - 3 * 0.26 / 2 };
  assert.deepEqual(columnAt(g, x, z), { c: 2, r: 1 }, 'a slot centre maps back to its column');
  assert.equal(columnAt(g, 99, 0), null, 'a point outside the lattice is null');
}

// --- clearShelf wipes only its own shelf --------------------------------
{
  const g = makeDisplay(2, 1, { shelves: 2, headroom: 3 });
  place(g, footprint(g, 0, [0, 0], [1, 1]), 1);
  place(g, footprint(g, 1, [0, 0], [1, 1]), 2);
  clearShelf(g, 0);
  assert.equal(topAt(g, 0, 0, 0), EMPTY, 'cleared shelf is empty');
  assert.equal(topAt(g, 1, 0, 0), 2, 'other shelf is untouched');
}

// --- tall items occupy every layer they are tall -----------------------------
//
// YARN.md runs from 1x1x1 to 3x3x3, so an item has a HEIGHT in layers as well as a footprint. The
// failure this guards is silent: a tall item that only registers one layer lets the next item
// clip through it, and a lift that pops one layer leaves ghost layers a column never recovers from.
{
  const g = makeDisplay(3, 3, { shelves: 1, headroom: 10, cell: 0.2 });
  const keys = footprint(g, 0, [0, 0], [1, 1]);

  assert.equal(place(g, keys, 7, 3), 0, 'a three-layer item still lands on layer 0');
  assert.equal(topAt(g, 0, 0, 0), 7, 'and is the top of its column');
  assert.equal(dropLayer(g, keys), 3, 'the next item lands ON it, at layer 3 — not inside it');

  const above = place(g, keys, 8, 1);
  assert.equal(above, 3, 'so a 1-layer item stacks at layer 3');
  assert.equal(topAt(g, 0, 0, 0), 8, 'and is now the top');

  lift(g, keys);
  assert.equal(topAt(g, 0, 0, 0), 7, 'lifting the small one exposes the tall one again');
  lift(g, keys);
  assert.equal(topAt(g, 0, 0, 0), EMPTY,
    'lifting the tall one clears ALL three of its layers, not just the top');
  assert.equal(dropLayer(g, keys), 0, 'so the column is genuinely empty again');
}

// --- headroom counts an item's whole height ----------------------------------
{
  const g = makeDisplay(2, 2, { shelves: 1, headroom: 4, cell: 0.2 });
  const keys = footprint(g, 0, [0, 0], [1, 1]);
  place(g, keys, 1, 2);                       // two layers used, two left

  assert.ok(fits(g, keys, 2), 'a two-layer item still fits in the remaining two');
  assert.ok(!fits(g, keys, 3), 'a three-layer item does not — height is checked, not just the top');
  assert.ok(fits(g, keys), 'and a plain one-layer item fits, as before');
}

// --- a tall item bridging two columns ----------------------------------------
{
  const g = makeDisplay(3, 3, { shelves: 1, headroom: 10, cell: 0.2 });
  const wide = footprint(g, 0, [0, 0], [2, 1]);   // spans columns 0 and 1
  place(g, wide, 5, 3);

  for (const c of [0, 1]) assert.equal(topAt(g, 0, c, 0), 5, `column ${c} is topped by the tall item`);
  assert.equal(dropLayer(g, footprint(g, 0, [0, 0], [1, 1])), 3, 'both its columns are three deep');
  lift(g, wide);
  for (const c of [0, 1]) assert.equal(topAt(g, 0, c, 0), EMPTY, `column ${c} fully cleared`);
}

// --- nearestSlot: a drop snaps to the nearest slot it FITS in --------------------------
// The rule the player actually feels. columnAt answers "which cell is under the pointer", which is
// the wrong question for a finger: it misses by half a slot, and the cell it lands on is often full.
{
  const CELL = 0.2, REACH = 1.6 * CELL;
  const g = makeDisplay(5, 2, { shelves: 1, headroom: 2, cell: CELL });
  const one = { w: 1, h: 1, layers: 1 };
  const at = (c, r) => slotRect(g, c, r, 1, 1);
  const pick = (slot) => [slot.c, slot.r];

  // Dead centre of a free slot picks that slot.
  const mid = at(2, 1);
  assert.deepEqual(pick(nearestSlot(g, 0, one, [mid.x, mid.z], { reach: REACH })), [2, 1], 'an accurate aim is unchanged');

  // Fill column 2 to the roof: the same aim now snaps to a neighbour instead of failing.
  for (let l = 0; l < 2; l++) place(g, footprint(g, 0, [2, 1], [1, 1]), 90 + l);
  assert.equal(columnAt(g, mid.x, mid.z).c, 2, 'the pointer is still over the full column');
  const spill = nearestSlot(g, 0, one, [mid.x, mid.z], { reach: REACH });
  assert.ok(spill && fits(g, spill.keys, 1), 'a full column spills onto a neighbour rather than refusing');
  assert.ok(Math.hypot(at(spill.c, spill.r).x - mid.x, at(spill.c, spill.r).z - mid.z) <= REACH,
            'and stays inside the reach');

  // Missing the lattice by less than the reach still lands; missing it by a mile does not.
  const edge = at(0, 0);
  assert.ok(nearestSlot(g, 0, one, [edge.x - CELL * 0.9, edge.z], { reach: REACH }), 'just off the edge still snaps');
  assert.equal(nearestSlot(g, 0, one, [0, 5], { reach: REACH }), null, 'a wild aim snaps to nothing');

  // It never invents a target: fill the level and there is none, at any reach.
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      for (let l = 0; l < 2; l++) place(g, footprint(g, 0, [c, r], [1, 1]), 90);
  assert.equal(nearestSlot(g, 0, one, [mid.x, mid.z], { reach: 99 }), null, 'a full level offers no target');
}

// --- a drop turns itself a quarter turn when that is what fits -------------------------
// The reported case: a 2x1 skein against a one-column peg board. There is no legal placement
// as-given and an obvious one turned, so refusing it makes the display look broken.
{
  const CELL = 0.2, REACH = 1.6 * CELL;
  const peg = makeDisplay(1, 5, { shelves: 1, headroom: 3, cell: CELL });   // one column, five rows
  const log = { w: 2, h: 1, layers: 1 };

  assert.equal(footprint(peg, 0, [0, 0], [2, 1]), null, 'a 2x1 genuinely does not fit a 1-wide board');
  const got = nearestSlot(peg, 0, log, [0, 0], { reach: REACH });
  assert.ok(got, 'but the snap finds a placement anyway');
  assert.ok(got.turned, 'by turning it');
  assert.deepEqual([got.w, got.h], [1, 2], 'so the footprint comes back swapped');
  assert.ok(fits(peg, got.keys, 1), 'and the turned footprint is legal');
  assert.ok(anySlot(peg, log)?.turned, 'anySlot agrees, so the display is not reported as full');

  // A turn must be a LAST resort, not a preference: where the natural orientation fits, it wins.
  const open = makeDisplay(5, 5, { shelves: 1, headroom: 3, cell: CELL });
  const easy = nearestSlot(open, 0, log, [0, 0], { reach: REACH });
  assert.ok(easy && !easy.turned, 'an unturned fit is preferred when one is in reach');

  // ...and a square is never turned, since there would be nothing to see.
  const square = nearestSlot(open, 0, { w: 2, h: 2, layers: 1 }, [0, 0], { reach: REACH });
  assert.ok(square && !square.turned, 'a square footprint is never reported as turned');

  // The turn can be refused, for a caller that wants the literal answer.
  assert.equal(nearestSlot(peg, 0, log, [0, 0], { reach: REACH, turn: false }), null, 'turning is optional');
  assert.equal(anySlot(peg, log, { turn: false }), null, 'for anySlot too');

  // Layers still count when turned — the turn must not smuggle a tall item into a shallow stack.
  const shallow = makeDisplay(1, 5, { shelves: 1, headroom: 1, cell: CELL });
  assert.equal(nearestSlot(shallow, 0, { w: 2, h: 1, layers: 2 }, [0, 0], { reach: REACH }), null,
               'a turned drop is still refused when it does not fit vertically');
}

// --- anySlot: is there room ANYWHERE, for THIS item ------------------------------------
// What the red "this display cannot take it" warning is built on. The answer depends on the item:
// a 3x3x3 super-bulky ball and a 1x1 hook get different answers about the same shelf.
{
  const g = makeDisplay(5, 2, { shelves: 2, headroom: 3, cell: 0.2 });
  assert.ok(anySlot(g, { w: 1, h: 1, layers: 1 }), 'an empty shelf has room');
  assert.equal(anySlot(g, { w: 3, h: 3, layers: 3 }), null, 'a 3x3 never fits a 5x2, however empty');
  for (let s = 0; s < g.shelves; s++)
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++)
        for (let l = 0; l < 3; l++) place(g, footprint(g, s, [c, r], [1, 1]), 90);
  assert.equal(anySlot(g, { w: 1, h: 1, layers: 1 }), null, 'a full display has room for nothing');

  // Height counts, not just floor area: a super-bulky ball is three layers tall (YARN.md).
  const t = makeDisplay(2, 2, { shelves: 1, headroom: 3, cell: 0.2 });
  place(t, footprint(t, 0, [0, 0], [2, 2]), 7, 1);          // one layer used everywhere, two left
  assert.ok(anySlot(t, { w: 1, h: 1, layers: 2 }), 'a two-layer ball fits the two layers left');
  assert.equal(anySlot(t, { w: 1, h: 1, layers: 3 }), null, 'a three-layer one does not');
}

console.log('grid.js self-check: all assertions passed');
