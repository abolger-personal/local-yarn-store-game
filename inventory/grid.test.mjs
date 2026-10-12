import assert from 'node:assert/strict';
import { makeDisplay, footprint, fits, place, lift, topAt, dropLayer, columnAt, clearShelf,
         nearestSlot, anySlot, slotRect, EMPTY } from './grid.js';

{
  const g = makeDisplay(3, 2, { shelves: 2, mask: (s, c) => !(s === 1 && c === 0) });
  assert.equal(footprint(g, 0, [2, 0], [2, 1]), null, '2×1 running off the right edge is invalid');
  assert.ok(footprint(g, 0, [1, 0], [2, 1]), '2×1 that fits is valid');
  assert.equal(footprint(g, 1, [0, 0], [1, 1]), null, 'a masked slot is a hole');
  assert.ok(footprint(g, 1, [1, 0], [1, 1]), 'unmasked slot on the same shelf is fine');
}

{
  const g = makeDisplay(2, 1, { shelves: 1, headroom: 3 });
  const at = (c) => footprint(g, 0, [c, 0], [1, 1]);
  assert.equal(place(g, at(0), 10), 0, 'first item lands on the shelf floor');
  assert.equal(place(g, at(0), 11), 1, 'second item stacks on top');
  assert.equal(topAt(g, 0, 0, 0), 11, 'pick grabs the TOP of the pile');
  lift(g, at(0));
  assert.equal(topAt(g, 0, 0, 0), 10, 'lifting the top exposes the one below');

  place(g, at(0), 12);
  assert.equal(dropLayer(g, at(0)), 2, 'next drop would be layer 2');
  assert.ok(fits(g, at(0)), 'layer 2 < headroom 3, still fits');
  place(g, at(0), 13);
  assert.ok(!fits(g, at(0)), 'shelf is full at headroom, no more room');
}

{
  const g = makeDisplay(2, 1, { shelves: 1, headroom: 4 });
  place(g, footprint(g, 0, [0, 0], [1, 1]), 1);
  const wide = footprint(g, 0, [0, 0], [2, 1]);
  assert.equal(place(g, wide, 2), 1, 'the 2×1 rests on top of the taller column');
  assert.equal(topAt(g, 0, 0, 0), 2, 'it is the top of the tall column');
  assert.equal(topAt(g, 0, 1, 0), 2, 'and the top of the bridged column');
  lift(g, wide);
  assert.equal(topAt(g, 0, 0, 0), 1, 'lifting the 2×1 leaves the original item');
  assert.equal(topAt(g, 0, 1, 0), EMPTY, 'and clears the bridged column entirely');
}

{
  const g = makeDisplay(4, 3, { cell: 0.26 });
  const { x, z } = { x: (2 + 0.5) * 0.26 - 4 * 0.26 / 2, z: (1 + 0.5) * 0.26 - 3 * 0.26 / 2 };
  assert.deepEqual(columnAt(g, x, z), { c: 2, r: 1 }, 'a slot centre maps back to its column');
  assert.equal(columnAt(g, 99, 0), null, 'a point outside the lattice is null');
}

{
  const g = makeDisplay(2, 1, { shelves: 2, headroom: 3 });
  place(g, footprint(g, 0, [0, 0], [1, 1]), 1);
  place(g, footprint(g, 1, [0, 0], [1, 1]), 2);
  clearShelf(g, 0);
  assert.equal(topAt(g, 0, 0, 0), EMPTY, 'cleared shelf is empty');
  assert.equal(topAt(g, 1, 0, 0), 2, 'other shelf is untouched');
}

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

{
  const g = makeDisplay(2, 2, { shelves: 1, headroom: 4, cell: 0.2 });
  const keys = footprint(g, 0, [0, 0], [1, 1]);
  place(g, keys, 1, 2);

  assert.ok(fits(g, keys, 2), 'a two-layer item still fits in the remaining two');
  assert.ok(!fits(g, keys, 3), 'a three-layer item does not — height is checked, not just the top');
  assert.ok(fits(g, keys), 'and a plain one-layer item fits, as before');
}

{
  const g = makeDisplay(3, 3, { shelves: 1, headroom: 10, cell: 0.2 });
  const wide = footprint(g, 0, [0, 0], [2, 1]);
  place(g, wide, 5, 3);

  for (const c of [0, 1]) assert.equal(topAt(g, 0, c, 0), 5, `column ${c} is topped by the tall item`);
  assert.equal(dropLayer(g, footprint(g, 0, [0, 0], [1, 1])), 3, 'both its columns are three deep');
  lift(g, wide);
  for (const c of [0, 1]) assert.equal(topAt(g, 0, c, 0), EMPTY, `column ${c} fully cleared`);
}

{
  const CELL = 0.2, REACH = 1.6 * CELL;
  const g = makeDisplay(5, 2, { shelves: 1, headroom: 2, cell: CELL });
  const one = { w: 1, h: 1, layers: 1 };
  const at = (c, r) => slotRect(g, c, r, 1, 1);
  const pick = (slot) => [slot.c, slot.r];

  const mid = at(2, 1);
  assert.deepEqual(pick(nearestSlot(g, 0, one, [mid.x, mid.z], { reach: REACH })), [2, 1], 'an accurate aim is unchanged');

  for (let l = 0; l < 2; l++) place(g, footprint(g, 0, [2, 1], [1, 1]), 90 + l);
  assert.equal(columnAt(g, mid.x, mid.z).c, 2, 'the pointer is still over the full column');
  const spill = nearestSlot(g, 0, one, [mid.x, mid.z], { reach: REACH });
  assert.ok(spill && fits(g, spill.keys, 1), 'a full column spills onto a neighbour rather than refusing');
  assert.ok(Math.hypot(at(spill.c, spill.r).x - mid.x, at(spill.c, spill.r).z - mid.z) <= REACH,
            'and stays inside the reach');

  const edge = at(0, 0);
  assert.ok(nearestSlot(g, 0, one, [edge.x - CELL * 0.9, edge.z], { reach: REACH }), 'just off the edge still snaps');
  assert.equal(nearestSlot(g, 0, one, [0, 5], { reach: REACH }), null, 'a wild aim snaps to nothing');

  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      for (let l = 0; l < 2; l++) place(g, footprint(g, 0, [c, r], [1, 1]), 90);
  assert.equal(nearestSlot(g, 0, one, [mid.x, mid.z], { reach: 99 }), null, 'a full level offers no target');
}

{
  const CELL = 0.2, REACH = 1.6 * CELL;
  const peg = makeDisplay(1, 5, { shelves: 1, headroom: 3, cell: CELL });
  const log = { w: 2, h: 1, layers: 1 };

  assert.equal(footprint(peg, 0, [0, 0], [2, 1]), null, 'a 2x1 genuinely does not fit a 1-wide board');
  const got = nearestSlot(peg, 0, log, [0, 0], { reach: REACH });
  assert.ok(got, 'but the snap finds a placement anyway');
  assert.ok(got.turned, 'by turning it');
  assert.deepEqual([got.w, got.h], [1, 2], 'so the footprint comes back swapped');
  assert.ok(fits(peg, got.keys, 1), 'and the turned footprint is legal');
  assert.ok(anySlot(peg, log)?.turned, 'anySlot agrees, so the display is not reported as full');

  const open = makeDisplay(5, 5, { shelves: 1, headroom: 3, cell: CELL });
  const easy = nearestSlot(open, 0, log, [0, 0], { reach: REACH });
  assert.ok(easy && !easy.turned, 'an unturned fit is preferred when one is in reach');

  const square = nearestSlot(open, 0, { w: 2, h: 2, layers: 1 }, [0, 0], { reach: REACH });
  assert.ok(square && !square.turned, 'a square footprint is never reported as turned');

  assert.equal(nearestSlot(peg, 0, log, [0, 0], { reach: REACH, turn: false }), null, 'turning is optional');
  assert.equal(anySlot(peg, log, { turn: false }), null, 'for anySlot too');

  const shallow = makeDisplay(1, 5, { shelves: 1, headroom: 1, cell: CELL });
  assert.equal(nearestSlot(shallow, 0, { w: 2, h: 1, layers: 2 }, [0, 0], { reach: REACH }), null,
               'a turned drop is still refused when it does not fit vertically');
}

{
  const g = makeDisplay(5, 2, { shelves: 2, headroom: 3, cell: 0.2 });
  assert.ok(anySlot(g, { w: 1, h: 1, layers: 1 }), 'an empty shelf has room');
  assert.equal(anySlot(g, { w: 3, h: 3, layers: 3 }), null, 'a 3x3 never fits a 5x2, however empty');
  for (let s = 0; s < g.shelves; s++)
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++)
        for (let l = 0; l < 3; l++) place(g, footprint(g, s, [c, r], [1, 1]), 90);
  assert.equal(anySlot(g, { w: 1, h: 1, layers: 1 }), null, 'a full display has room for nothing');

  const t = makeDisplay(2, 2, { shelves: 1, headroom: 3, cell: 0.2 });
  place(t, footprint(t, 0, [0, 0], [2, 2]), 7, 1);
  assert.ok(anySlot(t, { w: 1, h: 1, layers: 2 }), 'a two-layer ball fits the two layers left');
  assert.equal(anySlot(t, { w: 1, h: 1, layers: 3 }), null, 'a three-layer one does not');
}

{
  const ROUND = 5;
  const g = makeDisplay(5, 5, { headroom: 10, cell: 0.2, round: (i) => i === ROUND });
  const at = (c, r, w = 1, h = 1) => footprint(g, 0, [c, r], [w, h]);
  place(g, at(1, 1, 3, 3), ROUND, 3);
  assert.ok(!fits(g, at(1, 1)), 'a 1x1 on the rim of a 3x3 ball does not fit');
  assert.ok(fits(g, at(2, 2)), 'a 1x1 on its centre does');
  assert.ok(fits(g, at(2, 1, 1, 2)), 'a 1x2 reaching its centre does');
  assert.ok(!fits(g, at(3, 3, 2, 2)), 'a 2x2 overhanging one corner does not');
  assert.equal(nearestSlot(g, 0, { w: 1, h: 1, layers: 1 }, [-0.2, -0.2], { reach: 0.3 })?.layer, 0,
               'a drop aimed at the rim snaps off the ball, not onto its edge');

  const h = makeDisplay(4, 4, { headroom: 10, cell: 0.2, round: () => true });
  place(h, footprint(h, 0, [0, 0], [2, 2]), 1, 2);
  assert.ok(fits(h, footprint(h, 0, [1, 1], [1, 1])), 'any cell of a 2x2 ball is its centre');
  assert.ok(fits(h, footprint(h, 0, [1, 1], [2, 2])), 'so a 2x2 shifted one cell along it perches');

  const m = makeDisplay(6, 3, { headroom: 10, cell: 0.2, round: (i) => i === ROUND });
  place(m, footprint(m, 0, [0, 0], [3, 3]), ROUND, 3);
  place(m, footprint(m, 0, [3, 0], [1, 3]), 9, 3);
  assert.ok(fits(m, footprint(m, 0, [3, 0], [1, 1])), 'flat supports are unrestricted');
  assert.ok(!fits(m, footprint(m, 0, [2, 0], [2, 1])), 'one foot on a rim is one foot in the air');
  assert.ok(fits(m, footprint(m, 0, [1, 1], [3, 1])), 'centre plus a flat neighbour is fine');
}

console.log('grid.js self-check: all assertions passed');
