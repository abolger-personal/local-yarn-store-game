import assert from 'node:assert/strict';
import { STAGES, TUTORIAL, levelFor } from './levels.js';
import { checkLevel } from './check-level.mjs';

checkLevel(TUTORIAL.stage, 'tutorial', true);
for (const [name, { stage }] of Object.entries(STAGES)) checkLevel(stage, `${name} stage`);

assert.equal(levelFor(''), TUTORIAL, 'play.html with nothing after it is the tutorial');
assert.equal(levelFor('?stage=cake'), STAGES.cake, '?stage= picks a hand-made stage');
assert.equal(levelFor('?stage=cake&difficulty=3'), STAGES.cake, 'whatever the difficulty, until difficulty changes more than terrain');
assert.equal(levelFor('?stage=nope'), TUTORIAL, 'an unknown stage is the tutorial');

console.log(`levels ok (the tutorial and ${Object.keys(STAGES).length} stages)`);
