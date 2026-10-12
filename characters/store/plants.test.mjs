import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FORMS, growPlant } from './scene/plants.js';

const POT = { top: 0.185, rim: 0.132 };

function silhouette(plant) {
  const box = new THREE.Box3().setFromObject(plant);
  const size = box.getSize(new THREE.Vector3());
  let parts = 0;
  plant.traverse((n) => { if (n.isMesh) parts++; });
  return { form: plant.userData.form, parts, box, size,
    key: `${plant.userData.form}/${parts}/${size.x.toFixed(2)}/${size.y.toFixed(2)}/${size.z.toFixed(2)}` };
}

const grown = Array.from({ length: 60 }, (_, i) => silhouette(growPlant(i + 1, POT)));

for (const form of Object.keys(FORMS)) {
  const n = grown.filter((g) => g.form === form).length;
  assert.ok(n >= 6, `only ${n}/60 plants are ${form}s`);
}

assert.equal(new Set(grown.map((g) => g.key)).size, grown.length, 'two seeds grew the same plant');

assert.equal(silhouette(growPlant(3, POT)).key, grown[2].key, 'a seed grew two different plants');

for (const g of grown) {
  assert.ok(g.box.min.y > 0, `a ${g.form} reaches below the pot's base (${g.box.min.y.toFixed(3)})`);
  assert.ok(g.box.max.y > POT.top + 0.04, `a ${g.form} barely clears the soil`);
  assert.ok(g.box.max.y < 0.7, `a ${g.form} is ${g.box.max.y.toFixed(2)} tall`);
  assert.ok(Math.max(g.size.x, g.size.z) < POT.rim * 2 + 0.2, `a ${g.form} sprawls ${g.size.x.toFixed(2)} wide`);
}

const tally = Object.keys(FORMS).map((f) => `${f} ${grown.filter((g) => g.form === f).length}`).join(', ');
console.log(`plants.js self-check: all assertions passed (${tally})`);
