import assert from 'node:assert/strict';
import { LEVELS, STAGES, TUTORIAL, badGuys, levelBefore, levelFor, levelOf, piecesEach } from './levels.js';
import { checkLevel } from './check-level.mjs';

checkLevel(TUTORIAL.stage, 'tutorial', true);
for (const [name, { stage }] of Object.entries(STAGES)) checkLevel(stage, `${name} stage`);
for (const [name, levels] of Object.entries(LEVELS)) levels.slice(1).forEach((l, i) => checkLevel(l.stage, `${name} level ${i + 2}`, l.breakIn));

assert.equal(levelOf('breakfast', 1), TUTORIAL, 'level 1 is the tutorial');
assert.equal(levelFor('?stage=breakfast&level=2'), levelOf('breakfast', 2), '?level= picks a stage\'s numbered level');
assert.equal(levelFor('?level=2').number, 2, 'on breakfast, the tutorial stage, if no stage is given');
assert.equal(levelFor('?stage=breakfast&level=99'), STAGES.breakfast, 'a level that isn\'t there is the stage\'s hand-made layout');
assert.ok(LEVELS.breakfast.every((l, i) => l.number === i + 1 && l.theme === 'breakfast'), 'the breakfast stage is the tutorial stage, numbered in order');
assert.deepEqual([1, 2, 3, 4, 9, 20].map((n) => badGuys(n)), [1, 1, 1, 4, 8, 8], 'one bad guy up to level 3, then one more a level, at most 8');
assert.equal(badGuys(4, 2), 5, 'beside two grownups on level 4, three CPU bad guys');
assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(piecesEach), [4, 4, 5, 5, 6, 6, 6], 'piecesEach: 4 each, one more every two levels, at most 6');

assert.equal(levelFor(''), TUTORIAL, 'play.html with nothing after it is the tutorial');
assert.equal(levelFor('?stage=cake'), STAGES.cake, '?stage= picks a hand-made stage');
assert.equal(levelFor('?stage=cake&difficulty=3'), STAGES.cake, 'whatever the difficulty, until difficulty changes more than terrain');
assert.equal(levelFor('?stage=nope'), TUTORIAL, 'an unknown stage is the tutorial');
assert.equal(levelBefore('?stage=cake'), STAGES.cake, 'by yourself, the level is known before the network');
assert.equal(levelBefore('?room=1234&host&stage=cake'), STAGES.cake, 'a host knows its level while it waits');
assert.equal(levelBefore('?room=1234&stage=cake'), null, 'a guest learns its level from the host');

console.log(`levels ok (the tutorial and ${Object.keys(STAGES).length} stages)`);
