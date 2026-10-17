import assert from 'node:assert/strict';
import { PROGRESS_KEY, STAGES, TUTORIAL, beatLevel, levelBefore, levelFor, levelNumber, levelsBeaten } from './levels.js';
import { checkLevel } from './check-level.mjs';

checkLevel(TUTORIAL.stage, 'tutorial', true);
for (const [name, { stage }] of Object.entries(STAGES)) checkLevel(stage, `${name} stage`);

assert.equal(levelFor(''), TUTORIAL, 'play.html with nothing after it is the tutorial');
assert.equal(levelFor('?stage=cake'), STAGES.cake, '?stage= picks a hand-made stage');
assert.equal(levelFor('?stage=cake&difficulty=3'), STAGES.cake, 'whatever the difficulty, until difficulty changes more than terrain');
assert.equal(levelFor('?stage=nope'), TUTORIAL, 'an unknown stage is the tutorial');
assert.equal(levelBefore('?stage=cake'), STAGES.cake, 'by yourself, the level is known before the network');
assert.equal(levelBefore('?room=1234&host&stage=cake'), STAGES.cake, 'a host knows its level while it waits');
assert.equal(levelBefore('?room=1234&stage=cake'), null, 'a guest learns its level from the host');

assert.equal(levelNumber(JSON.parse(JSON.stringify(TUTORIAL))), 1, 'a guest knows the tutorial from the stage the host sends');
assert.equal(levelNumber(STAGES.breakfast), 0, 'breakfast without the shut-in fort is not level 1');
const store = new Map();
globalThis.localStorage = /** @type {any} */ ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
assert.equal(levelsBeaten(), 0, 'a new tablet has beaten nothing');
beatLevel(1);
beatLevel(0);
assert.equal(levelsBeaten(), 1, 'beating level 1 is kept, and never taken back');
store.set(PROGRESS_KEY, '{"beaten":"lots"}');
assert.equal(levelsBeaten(), 0, 'a junk save counts as nothing beaten');
store.set(PROGRESS_KEY, 'not json');
assert.equal(levelsBeaten(), 0, 'a broken save counts as nothing beaten');

console.log(`levels ok (the tutorial and ${Object.keys(STAGES).length} stages)`);
