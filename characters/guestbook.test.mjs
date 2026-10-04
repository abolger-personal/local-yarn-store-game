// The Guestbook's words: every thank-you line names a recorded fact, and the short form fits a
// polaroid. Run: node characters/guestbook.test.mjs
import assert from 'node:assert/strict';
import { TRAITS } from './visit.js';
import { entryRows, placeWord, thankYou } from './guestbook.js';

const yarn = (extra) => ({ name: 'yarn', weight: 'worsted', material: 'wool', shape: 'ball', colorIndex: 32, ...extra });
const pattern = { name: 'pattern', patternType: 'hat', craft: 'knitting', toolSize: 4.5, weight: 'worsted', materials: ['wool'], yarnUnits: 3 };
const made = (yarns, opts) => ({ id: 'WIP 1', pattern, yarn: yarns, ...opts });

// Every shape of provenance the buy can record, and none at all.
const cases = [
  made([yarn({ place: 'by the window' })]),
  made([yarn({ place: 'in the back corner', beside: 'socks', alsoIn: 'Bramblewick' })]),
  made([yarn({ place: 'on the floor' })]),
  made([yarn()]),
];
for (const m of cases) {
  for (const lead of TRAITS) {
    for (const enthusiasm of [1, 5]) {
      const traits = { ...Object.fromEntries(TRAITS.map((t) => [t, 2])), [lead]: 5, Enthusiasm: enthusiasm };
      for (const workedHere of [false, true]) {
        const line = thankYou(m, traits, { workedHere });
        assert.ok(line.facts.length >= 1, 'every line names at least one fact');
        for (const word of line.facts) assert.ok(line.full.includes(word), `"${line.full}" names "${word}"`);
        assert.ok(line.short.includes(line.facts[0]) || line.short.includes(line.facts[0].split(' ').at(-1)),
          `short "${line.short}" keeps the fact "${line.facts[0]}"`);
        assert.ok(line.short.length <= 24, `"${line.short}" fits a polaroid`);
      }
    }
  }
}

// Place words come from where the display stood.
const room = { door: { x: 0, z: 3.25 }, guestbook: { x: -3, z: 1.55 }, windows: [{ x: 0, z: -3.6 }],
               bounds: { minX: -4.2, maxX: 4.2, minZ: -2.2, maxZ: 2.7 } };
assert.equal(placeWord({ form: 'floor', solid: false, x: 0, z: 0 }, room), 'on the floor');
assert.equal(placeWord({ form: 'table', x: 0.5, z: 2.5 }, room), 'by the door');
assert.equal(placeWord({ form: 'wall-shelf', x: 0, z: -3.1 }, room), 'by the window');
assert.equal(placeWord({ form: 'wall-shelf', x: -4.3, z: -2.0 }, room), 'in the back corner');

// Rows: purchases always in full; behaviour in detail only when witnessed.
const rows = (did) => entryRows({ bought: [yarn()], did }).map((r) => r.text);
assert.ok(rows([])[0].startsWith('bought a worsted wool ball, '), 'a purchase reads as its ball band');
assert.deepEqual(rows([{ what: 'putBack', item: yarn({ weight: 'dk' }), witnessed: true }])[1].split(', ')[0],
  'turned over a dk wool ball', 'a witnessed put-back says what it was');
assert.equal(rows([{ what: 'putBack', item: yarn(), witnessed: false }])[1], 'turned something over and put it back');
assert.ok(rows([{ what: 'sat', pattern, witnessed: true }])[1].startsWith('sat and knitted on the hat pattern'));
assert.equal(rows([{ what: 'sat', pattern, witnessed: false }])[1], 'sat and worked on a project');
console.log('guestbook: ok');
