import assert from 'node:assert/strict';
import { STAGES, TUTORIAL, levelBefore, levelFor } from './levels.js';
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

console.log(`levels ok (the tutorial and ${Object.keys(STAGES).length} stages)`);
