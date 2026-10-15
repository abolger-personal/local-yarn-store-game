import assert from 'node:assert/strict';
import { BRICK, TICK_HZ, groundOf, outside } from './match.js';
import { LEVELS } from './levels.js';
import { createMatch, snapshot, tick } from './sim.js';

const KINDS = ['ground', 'deck', 'hill'];
const hero = { id: 'kid', team: 'heroes', height: 0.9, width: 0.45, reach: 0.38, look: { dough: '#e8c48a', frosting: '#14c4e0', stripe: false } };
const TO_SHELF = { kid: { target: { thing: 'shelf', team: 'badGuys' }, punch: false, kick: false } };

/** Whether a hero tapped from its spawn to the bad guys' shelf stands at it (and so steals) within 30 seconds. */
function reachesShelf(stage) {
  const m = createMatch([hero], stage);
  for (let i = 0; i < 30 * TICK_HZ; i++) {
    tick(m, i === 0 ? TO_SHELF : {});
    if (snapshot(m).donutEvents.some((e) => e.kind === 'steal')) return true;
  }
  return false;
}

const overlaps = (b, f) => b.x < f.x1 && b.x + BRICK > f.x0 && b.z < f.z1 && b.z + BRICK > f.z0;

for (const [n, { stage }] of Object.entries(LEVELS)) {
  const at = `level ${n}`;
  assert.ok(stage.floors.every((f) => KINDS.includes(f.kind)), `${at}: every floor is a ${KINDS.join('/')}`);
  assert.equal(stage.floors.filter((f) => f.kind === 'ground').length, 1, `${at}: exactly one ground`);
  const ground = groundOf(stage), raised = stage.floors.filter((f) => f.y > ground.y);
  assert.equal(raised.length, stage.floors.length - 1, `${at}: the ground is the lowest floor`);
  for (const sh of stage.shelves)
    assert.ok(stage.floors.some((f) => f.y === sh.y && outside(f, sh.x, sh.z) === 0), `${at}: the ${sh.team} shelf stands on a floor`);
  for (const p of stage.puddles) {
    assert.ok(outside(ground, p.x, p.z) === 0, `${at}: puddle at ${p.x},${p.z} is on the ground`);
    assert.ok(raised.every((f) => outside(f, p.x, p.z) >= p.r), `${at}: puddle at ${p.x},${p.z} is clear of raised floors`);
  }
  for (const b of stage.bricks)
    assert.ok(raised.every((f) => b.y >= f.y || !overlaps(b, f)), `${at}: brick at ${b.x},${b.y},${b.z} is not inside a raised floor`);
  assert.ok(reachesShelf(stage), `${at}: a hero tapped from its spawn to the bad guys' shelf gets there`);
}

console.log(`levels ok (${Object.keys(LEVELS).length} levels)`);
