import assert from 'node:assert/strict';
import * as THREE from 'three';
import { board, glue, panel, turned, woodUVs } from './scene/wood.js';

{
  const leg = turned('leg', 0.4, 0.03);
  leg.computeBoundingBox();
  const { min, max } = leg.boundingBox;
  assert.ok(Math.abs(min.y) < 1e-6 && Math.abs(max.y - 0.4) < 1e-6, 'a turned leg is not its own height');
  assert.ok(Math.abs(max.x - 0.03) < 1e-3, 'a turned leg is not its own width');
}

{
  const span = (geo) => {
    const uv = geo.attributes.uv;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getY(i)); hi = Math.max(hi, uv.getY(i)); }
    return hi - lo;
  };
  const short = span(woodUVs(new THREE.BoxGeometry(0.02, 0.2, 0.02)));
  const long = span(woodUVs(new THREE.BoxGeometry(0.02, 1.0, 0.02)));
  assert.ok(Math.abs(long / short - 5) < 0.05, `grain UVs scale ${long / short}x for a 5x longer board`);
  const across = woodUVs(new THREE.BoxGeometry(1, 0.02, 0.1));
  assert.ok(span(across) > 1.5, 'a board lying along X does not get its grain along X');
}

{
  const parts = [[board(0.3, 0.03, 0.3), [0, 0.2, 0]], [turned('leg', 0.2, 0.02), [0.1, 0, 0.1]],
    [panel([[0, 0], [0.2, 0], [0.2, 0.1], [0, 0.1]], 0.02), [0, 0.3, 0], [0.1, 0, 0]]];
  const counts = parts.map(([g]) => (g.index ? g.index.count : g.attributes.position.count));
  const piece = glue(parts);
  assert.deepEqual(Object.keys(piece.attributes).sort(), ['normal', 'position', 'uv']);
  assert.equal(piece.attributes.position.count, counts.reduce((a, b) => a + b), 'glue lost vertices');
}

console.log('wood.js self-check: all assertions passed');
