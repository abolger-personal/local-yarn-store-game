import assert from 'node:assert/strict';
import {
  BASE_GUI, BASE_MOTION_RANGES, BASE_PARAMS, BASE_RANDOM_RANGES, GEO, GUI_SECTIONS,
  addEyes, addHead, addTail, createCharacter, getSpecies, part, registerSpecies, speciesIds,
} from './npc.js';
import { SPECIES_IDS } from './species.js';

// ADDING-A-SPECIES.md: the least a kit can declare, run through the generic suites below as a new species would be
registerSpecies({
  id: 'stub',
  label: 'Stub',
  emoji: '🐢',
  firstFur: '#1fd18b',
  defaults: { ...BASE_PARAMS, name: 'Stub', tailLength: 0.08 },
  randomRanges: BASE_RANDOM_RANGES,
  motionRanges: BASE_MOTION_RANGES,
  headShape: [1, 0.9, 1.1],
  buildKit(ctx, P) {
    addHead(ctx, P);
    addEyes(ctx, P, { head: ctx.headScale });
    addTail(ctx, P, {
      dress: (node, i, len) => node.add(part(GEO.sphere, ctx.mat.body, { pos: [0, 0, -len / 2], scale: [P.tailThick, P.tailThick, len / 2] })),
    });
  },
});

assert.deepEqual(SPECIES_IDS, ['owl', 'llama', 'lion', 'turtle'], 'species.js registers every species, in its import order');
for (const id of speciesIds()) {
  const kit = getSpecies(id);
  assert.ok(kit.emoji && /^#[0-9a-f]{6}$/i.test(kit.firstFur), `${id}: the chooser needs an emoji and a first fur`);
  assert.equal(kit.headShape.length, 3, `${id}: headShape is the head's three radii, in headRadius`);
  const P = kit.randomise(structuredClone({ ...BASE_PARAMS, ...kit.defaults }));
  if (kit.coatColorKey) assert.match(P[kit.coatColorKey], /^#[0-9a-f]{6}$/i, `${id}: randomise derives the coat colour`);
  for (const [section, rows] of Object.entries({ ...kit.gui })) {
    assert.ok(GUI_SECTIONS.includes(section), `${id}: gui section "${section}" is not one of ${GUI_SECTIONS.join(', ')}`);
    for (const [key] of rows) assert.ok(key in P, `${id}: the ${section} row ${key} is not a param`);
  }
  for (const merged of [false, true]) createCharacter({ ...P, mergeMeshes: merged, painterly: true }, id);
}
assert.ok(Object.keys(BASE_GUI).every((s) => GUI_SECTIONS.includes(s)), 'BASE_GUI fills only the known sections');

// the generic suites, with the stub among the species; a per-species table must skip it, not crash
await import('./faces.test.mjs');
await import('./paint.test.mjs');
await import('./face.test.mjs');
await import('./craft-anim.test.mjs');
await import('./rig.test.mjs');
console.info('species ok');
