// Self-check for scene/plants.js. Run: node characters/store/plants.test.mjs
//
// The point of growing plants from a seed is that the pots in the shop do NOT all hold the same
// plant — which is exactly what they did before, and nothing failed. So this asserts the variety.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FORMS, growPlant } from './scene/plants.js';

const POT = { top: 0.185, rim: 0.132 };

/** What a plant looks like from across the room: its form, how many parts, and its size. */
function silhouette(plant) {
  const box = new THREE.Box3().setFromObject(plant);
  const size = box.getSize(new THREE.Vector3());
  let parts = 0;
  plant.traverse((n) => { if (n.isMesh) parts++; });
  return { form: plant.userData.form, parts, box, size,
    key: `${plant.userData.form}/${parts}/${size.x.toFixed(2)}/${size.y.toFixed(2)}/${size.z.toFixed(2)}` };
}

const grown = Array.from({ length: 60 }, (_, i) => silhouette(growPlant(i + 1, POT)));

// Every form turns up, and none dominates.
for (const form of Object.keys(FORMS)) {
  const n = grown.filter((g) => g.form === form).length;
  assert.ok(n >= 6, `only ${n}/60 plants are ${form}s`);
}

// No two plants alike — the bug this exists for. The shop's own pots are seeds 1-6.
assert.equal(new Set(grown.map((g) => g.key)).size, grown.length, 'two seeds grew the same plant');

// Same seed, same plant: a pot must not change between reloads.
assert.equal(silhouette(growPlant(3, POT)).key, grown[2].key, 'a seed grew two different plants');

// Every plant stays a pot plant: it grows up out of the soil, not through the floor, and stays
// within a lamp's height and a little past the rim.
for (const g of grown) {
  assert.ok(g.box.min.y > 0, `a ${g.form} reaches below the pot's base (${g.box.min.y.toFixed(3)})`);
  assert.ok(g.box.max.y > POT.top + 0.04, `a ${g.form} barely clears the soil`);
  assert.ok(g.box.max.y < 0.7, `a ${g.form} is ${g.box.max.y.toFixed(2)} tall`);
  assert.ok(Math.max(g.size.x, g.size.z) < POT.rim * 2 + 0.2, `a ${g.form} sprawls ${g.size.x.toFixed(2)} wide`);
}

const tally = Object.keys(FORMS).map((f) => `${f} ${grown.filter((g) => g.form === f).length}`).join(', ');
console.log(`plants.js self-check: all assertions passed (${tally})`);
