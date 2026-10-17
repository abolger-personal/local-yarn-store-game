import assert from 'node:assert/strict';
import { generateStage } from './generate.js';
import { NARROW, checkLevel, ticksToShelf } from './check-level.mjs';
import { TICK_HZ } from './match.js';
import { levelFor } from './levels.js';

const SEEDS = Number(process.env.SEEDS ?? 3), DIFFICULTIES = [1, 2, 3, 4, 5], NAMES = ['breakfast', 'cake'];
const mirrored = (f) => JSON.stringify({ ...f, x0: -f.x1, x1: -f.x0 });
const raid = { heroes: [], badGuys: [], ratio: [] };
const started = performance.now();

for (const name of NAMES) for (const d of DIFFICULTIES)
  for (let seed = 1; seed <= SEEDS; seed++) {
    const at = `${name} seed ${seed} difficulty ${d}`, stage = generateStage(seed, d, name);
    assert.deepEqual(generateStage(seed, d, name), stage, `${at}: same seed, same stage`);
    const floors = new Set(stage.floors.map((f) => JSON.stringify(f)));
    assert.ok(stage.floors.every((f) => floors.has(mirrored(f))), `${at}: terrain is mirrored`);
    assert.deepEqual(stage.starts, generateStage(seed, d + 1, name).starts, `${at}: start spots come first, from the seed alone`);
    checkLevel(stage, at);
    // Fairness of the terrain: with the bad guys' pre-placed fort taken away and both teams starting beside their shelf, both raids take the same time.
    const open = { ...stage, bricks: [], starts: undefined }, h = ticksToShelf(open, 'heroes', false, NARROW), b = ticksToShelf(open, 'badGuys', false, NARROW);
    raid.heroes.push(ticksToShelf(stage, 'heroes', false, NARROW) / TICK_HZ);
    raid.badGuys.push(b / TICK_HZ);
    raid.ratio.push(h / b);
  }

assert.deepEqual(levelFor('?seed=123&difficulty=2').stage, generateStage(123, 2), 'play.html?seed= plays a generated breakfast stage');
assert.deepEqual(levelFor('?stage=cake&difficulty=3&seed=8'), { theme: 'cake', stage: generateStage(8, 3, 'cake') }, 'and ?stage= picks the stage');
const count = SEEDS * DIFFICULTIES.length * NAMES.length, ms = (performance.now() - started) / count;
const range = (xs) => `${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}`;
assert.ok(raid.ratio.every((x) => Math.abs(x - 1) <= 0.1), `fairness: open-field raid times within 10% (${range(raid.ratio)})`);
assert.ok(raid.heroes.every((s) => s >= 2 && s <= 12), `hero raid through the fort takes 2–12 s (${range(raid.heroes)})`);
console.log(`generate ok (${count} stages, ${ms.toFixed(0)} ms each; hero raid ${range(raid.heroes)} s,`,
  `bad-guy raid ${range(raid.badGuys)} s, open-field hero/bad-guy ratio ${range(raid.ratio)})`);
