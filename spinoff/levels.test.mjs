import assert from 'node:assert/strict';
import { LEVELS, badGuys, PROGRESS_KEY, STAGES, TUTORIAL, beatLevel, levelBefore, levelFor, levelNumber, levelOf, levelsBeaten, piecesEach } from './levels.js';
import { checkLevel } from './check-level.mjs';

checkLevel(TUTORIAL.stage, 'tutorial', true);
for (const [name, { stage }] of Object.entries(STAGES)) checkLevel(stage, `${name} stage`);
for (const [name, levels] of Object.entries(LEVELS)) levels.slice(1).forEach((l, i) => checkLevel(l.stage, `${name} level ${i + 2}`, l.breakIn));

assert.equal(levelOf('breakfast', 1), TUTORIAL, 'level 1 is the tutorial');
assert.equal(levelFor('?stage=breakfast&level=2'), levelOf('breakfast', 2), '?level= picks a stage\'s numbered level');
assert.equal(levelFor('?level=2').number, 2, 'on breakfast, the tutorial stage, if no stage is given');
assert.equal(levelFor('?stage=breakfast&level=99'), STAGES.breakfast, 'a level that isn\'t there is the stage\'s hand-made layout');
assert.ok(LEVELS.breakfast.every((l, i) => l.number === i + 1 && l.theme === 'breakfast'), 'the breakfast stage is the tutorial stage, numbered in order');
assert.deepEqual([1, 2, 3, 4, 9, 20].map((n) => badGuys(n)), [1, 1, 3, 4, 8, 8], 'one bad guy on the tutorials, then one more a level, at most 8');
assert.equal(badGuys(3, 2), 4, 'beside two grownups on level 3, two CPU bad guys');
assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(piecesEach), [4, 4, 5, 5, 6, 6, 6], 'piecesEach: 4 each, one more every two levels, at most 6');

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
