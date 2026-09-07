// Self-check for the pure display model. Run: node inventory/grid.test.mjs
import assert from 'node:assert/strict';
import { makeDisplay, footprint, fits, place, lift, topAt, dropLayer, columnAt, clearShelf, EMPTY } from './grid.js';

// --- footprint bounds + mask ------------------------------------------------
{
  // shelf 0 full, shelf 1 masks out column 0
  const g = makeDisplay(3, 2, { shelves: 2, mask: (s, c) => !(s === 1 && c === 0) });
  assert.equal(footprint(g, 0, 2, 0, 2, 1), null, '2×1 running off the right edge is invalid');
  assert.ok(footprint(g, 0, 1, 0, 2, 1), '2×1 that fits is valid');
  assert.equal(footprint(g, 1, 0, 0, 1, 1), null, 'a masked slot is a hole');
  assert.ok(footprint(g, 1, 1, 0, 1, 1), 'unmasked slot on the same shelf is fine');
}

// --- stacking + top-only pick ----------------------------------------------
{
  const g = makeDisplay(2, 1, { shelves: 1, headroom: 3 });
  const at = (c) => footprint(g, 0, c, 0, 1, 1);
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
  place(g, footprint(g, 0, 0, 0, 1, 1), 1);  // column 0 now height 1, column 1 empty
  const wide = footprint(g, 0, 0, 0, 2, 1);  // a 2×1 across both
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
  place(g, footprint(g, 0, 0, 0, 1, 1), 1);
  place(g, footprint(g, 1, 0, 0, 1, 1), 2);
  clearShelf(g, 0);
  assert.equal(topAt(g, 0, 0, 0), EMPTY, 'cleared shelf is empty');
  assert.equal(topAt(g, 1, 0, 0), 2, 'other shelf is untouched');
}

console.log('grid.js self-check: all assertions passed');
