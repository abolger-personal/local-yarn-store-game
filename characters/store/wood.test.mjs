// Self-check for scene/wood.js. Run: node characters/store/wood.test.mjs
//
// Furniture is now glued from rounded boards and turned parts. What could silently go wrong: a
// glued piece with no UVs (renders without its worn-wood texture), UVs stretched (texture smeared
// on long parts), or a turned leg that is not the height it was asked for (a table floating or
// sunk into the floor).

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { board, glue, panel, turned, woodUVs } from './scene/wood.js';

// A turned leg stands on y = 0 and reaches exactly its height, at its widest exactly its radius.
{
  const leg = turned('leg', 0.4, 0.03);
  leg.computeBoundingBox();
  const { min, max } = leg.boundingBox;
  assert.ok(Math.abs(min.y) < 1e-6 && Math.abs(max.y - 0.4) < 1e-6, 'a turned leg is not its own height');
  assert.ok(Math.abs(max.x - 0.03) < 1e-3, 'a turned leg is not its own width');
}

// UVs are in metres along the grain: the same length of wood covers the same span of texture on
// a short part and a long one, so the texture is never smeared along a long board.
{
  const span = (geo) => {
    const uv = geo.attributes.uv;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getY(i)); hi = Math.max(hi, uv.getY(i)); }
    return hi - lo;
  };
  // Square boxes: a rounded board's corners shave a few mm off each end, which skews a ratio.
  const short = span(woodUVs(new THREE.BoxGeometry(0.02, 0.2, 0.02)));
  const long = span(woodUVs(new THREE.BoxGeometry(0.02, 1.0, 0.02)));
  assert.ok(Math.abs(long / short - 5) < 0.05, `grain UVs scale ${long / short}x for a 5x longer board`);
  const across = woodUVs(new THREE.BoxGeometry(1, 0.02, 0.1));
  assert.ok(span(across) > 1.5, 'a board lying along X does not get its grain along X');
}

// Glue keeps every part and leaves one geometry with position, normal and uv — nothing else, so
// any two glued pieces share one material and one draw call.
{
  const parts = [[board(0.3, 0.03, 0.3), [0, 0.2, 0]], [turned('leg', 0.2, 0.02), [0.1, 0, 0.1]],
    [panel([[0, 0], [0.2, 0], [0.2, 0.1], [0, 0.1]], 0.02), [0, 0.3, 0], [0.1, 0, 0]]];
  const counts = parts.map(([g]) => (g.index ? g.index.count : g.attributes.position.count));
  const piece = glue(parts);
  assert.deepEqual(Object.keys(piece.attributes).sort(), ['normal', 'position', 'uv']);
  assert.equal(piece.attributes.position.count, counts.reduce((a, b) => a + b), 'glue lost vertices');
}

console.log('wood.js self-check: all assertions passed');
