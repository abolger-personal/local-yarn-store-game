import assert from 'node:assert/strict';
import { MATCH, MAX_FIGHTERS, ROOM_TREATS, canHit, floorGrid, isCode, randomCode, roomName, standingSpots } from './roster.js';

{
  const ids = ['peer-c', 'peer-a', 'self', 'peer-b'];
  const a = standingSpots(ids), b = standingSpots([...ids].reverse());
  assert.deepEqual([...a].sort(), [...b].sort(), 'every tablet must place everyone the same, whatever order they joined');
  const xs = [...a.values()].map((s) => s.x);
  assert.ok(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length) < floorGrid().cell, 'a small group stands near the middle, not off to one side');
}

{
  const ids = Array.from({ length: MAX_FIGHTERS }, (_, i) => `p${i}`);
  const spots = [...standingSpots(ids).values()];
  assert.equal(spots.length, MAX_FIGHTERS, 'the floor holds a full match: 6 kids and 8 bad guys');
  const keys = new Set(spots.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`));
  assert.equal(keys.size, spots.length, 'no two fighters share a cell');
  const front = Math.max(...spots.map((s) => s.z));
  assert.ok(spots.slice(0, 7).every((s) => s.z === front), 'the front row fills first');
}

{
  assert.equal(standingSpots(['x', 'x', 'y']).size, 2, 'a repeated id is one fighter');
}

{
  for (let k = 0; k < 50; k++) assert.ok(isCode(randomCode()), 'a random code is a valid code');
  assert.ok(!isCode([0, 1, 2]) && !isCode([0, 1, 2, ROOM_TREATS.length]) && !isCode('0123'), 'junk is not a code');
  assert.equal(roomName([0, 5, 2, 1]), 'donut-0521');
}

{
  const kid = (id) => ({ id, team: 'kids' }), bad = { id: 'b', team: 'bad guys' };
  assert.ok(!canHit(kid('a'), kid('c')), 'kids cannot hit each other by default');
  assert.ok(canHit(kid('a'), bad) && canHit(bad, kid('a')), 'kids and bad guys can hit each other');
  assert.ok(canHit(kid('a'), kid('c'), { ...MATCH, friendlyFire: true }), 'a kid-vs-kid mode is one setting away');
  assert.ok(!canHit(kid('a'), kid('a'), { friendlyFire: true }), 'nobody hits themselves');
}

console.log('roster ok');
