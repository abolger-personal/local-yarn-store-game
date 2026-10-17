// The game save and what results unlock (spinoff/progress.js), with a stand-in localStorage.
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import {
  PROGRESS_KEY, beatLevel, levelsBeaten, loadProgress, outcomeOf, readProgress, recordOutcome, roomLevels, roomStages, withOutcome,
} from './progress.js';

const store = new Map();
globalThis.localStorage = /** @type {any} */ ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
const numbers = (levels) => levels.map((l) => l.number);

assert.equal(levelsBeaten(), 0, 'a new tablet has beaten nothing');
assert.deepEqual(loadProgress(), { beaten: 0, reached: {} }, 'and reached nothing past the start');
beatLevel(2);
beatLevel(1);
beatLevel(0);
assert.equal(levelsBeaten(), 2, 'beating a level is saved, and never taken back');
store.set(PROGRESS_KEY, '{"beaten":"lots"}');
assert.equal(levelsBeaten(), 0, 'a junk save counts as nothing beaten');
store.set(PROGRESS_KEY, 'not json');
assert.equal(levelsBeaten(), 0, 'a broken save counts as nothing beaten');
assert.deepEqual(readProgress({ beaten: 2.5, reached: { breakfast: 2.5, cake: 3, moon: 4, toString: 5 }, extra: 1 }), { beaten: 0, reached: { cake: 3 } },
  'a save from another tablet keeps only whole levels on known stages');
assert.deepEqual(readProgress({ beaten: 1 }), { beaten: 1, reached: {} }, "the sword's save is the game save already");

assert.deepEqual(outcomeOf('breakfast', 1, 'heroes'), { beaten: 1, reached: 2, next: 2 }, 'a win reaches the next level, and ▶️ plays it');
assert.deepEqual(outcomeOf('breakfast', 2, 'badGuys'), { beaten: 0, reached: 0, next: 2 }, 'a loss replays');
assert.deepEqual(outcomeOf('breakfast', 1, null), { beaten: 0, reached: 0, next: 1 }, 'a tie replays and beats nothing, not even level 1');
assert.equal(outcomeOf('breakfast', LEVELS.breakfast.length, 'heroes').next, LEVELS.breakfast.length, 'past the last level there is nothing new to play');
assert.deepEqual(outcomeOf('cake', 0, 'heroes'), { beaten: 0, reached: 0, next: 0 }, 'a layout picked by address unlocks nothing');

store.clear();
recordOutcome('breakfast', outcomeOf('breakfast', 1, null));
assert.equal(levelsBeaten(), 0, 'a tie on level 1 does not unlock the sword');
recordOutcome('breakfast', outcomeOf('breakfast', 1, 'heroes'));
assert.equal(levelsBeaten(), 1, 'a win on level 1 does, saved straight away');
recordOutcome('breakfast', outcomeOf('breakfast', 1, 'badGuys'));
assert.deepEqual(loadProgress(), { beaten: 1, reached: { breakfast: 2 } }, 'a win reaches level 2, in the one save beside the sword\'s, and a loss takes nothing back');
store.set(PROGRESS_KEY, JSON.stringify({ beaten: 3, reached: { breakfast: 4 } }));
recordOutcome('breakfast', outcomeOf('breakfast', 1, 'heroes'));
assert.deepEqual(loadProgress(), { beaten: 3, reached: { breakfast: 4 } }, 'not even winning an earlier level again');
assert.deepEqual(withOutcome({ beaten: 0, reached: {} }, 'breakfast', outcomeOf('breakfast', 2, 'heroes')), { beaten: 2, reached: { breakfast: 3 } },
  'a win on level 2 beats it and reaches level 3');
store.clear();
recordOutcome('breakfast', outcomeOf('breakfast', 1, 'heroes'));

assert.deepEqual(roomStages(), ['breakfast'], 'everyone has the tutorial stage, the only one');
const fresh = readProgress(null), along = loadProgress();
assert.deepEqual(numbers(roomLevels('breakfast', [fresh])), [1], 'a new player has level 1');
assert.deepEqual(numbers(roomLevels('breakfast', [along])), [1, 2], 'and a winner the next one too');
assert.deepEqual(numbers(roomLevels('breakfast', [along, fresh])), [1], 'a room offers only what everyone in it has reached');
assert.equal(roomLevels('breakfast', [readProgress({ reached: { breakfast: 9 } })]).length, LEVELS.breakfast.length, 'and only levels there are');

globalThis.localStorage = /** @type {any} */ ({ getItem() { throw new Error('private mode'); }, setItem() { throw new Error('private mode'); } });
recordOutcome('breakfast', outcomeOf('breakfast', 1, 'heroes'));
assert.deepEqual(loadProgress(), { beaten: 0, reached: {} }, 'with storage turned off, an empty save and no crash');

console.log('progress ok');
