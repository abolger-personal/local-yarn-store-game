import assert from 'node:assert/strict';
import { generateLevel } from './generate.js';

// scenery.js loads pictures and paints canvases: enough of a document for node
const stub = () => ({ style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => new Proxy({}, { get: () => () => {} }) });
globalThis.document = /** @type {any} */ ({ createElementNS: stub, createElement: stub });
const { playground } = await import('./scenery.js');

// neighbouring pieces share corners; a post drawn twice there, in two colours, flickered (playtest 2026-11-15)
for (let seed = 1; seed <= 10; seed++) for (const n of [1, 2, 3]) {
  const seen = new Set();
  for (const part of playground(generateLevel(seed, n))) part.traverse((m) => {
    const p = /** @type {any} */ (m).geometry?.parameters;
    if (!p || p.width !== 0.06 || p.depth !== 0.06 || m.position.y - p.height / 2 > 1e-6) return;
    const key = `${m.position.x.toFixed(3)} ${m.position.z.toFixed(3)}`;
    assert.ok(!seen.has(key), `level ${n} seed ${seed}: two posts at ${key}`);
    seen.add(key);
  });
}
console.log('scenery ok');
