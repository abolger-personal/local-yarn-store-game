import assert from 'node:assert/strict';
import { createControls, pickTarget } from './controls.js';
import { createMatch, snapshot, tick } from './fake-match.js';

const look = (frosting) => ({ dough: '#e8c48e', frosting, stripe: false });
const entrants = [
  { id: 'me', team: 'heroes', height: 1, width: 0.6, reach: 0.4, look: look('#ff3b7f') },
  { id: 'dummy', team: 'badGuys', height: 1, width: 0.6, reach: 0.4, look: look('#7b2fbf'), dummy: true },
];
const snap = snapshot(createMatch(entrants));
const me = snap.fighters.find((f) => f.id === 'me'), dummy = snap.fighters.find((f) => f.id === 'dummy');
const [donut] = snap.donuts;

assert.deepEqual(pickTarget(snap, { x: donut.x, y: donut.y }, 'me'), { thing: 'donut', id: donut.id }, 'a tap on a loose donut');
assert.deepEqual(pickTarget(snap, { x: donut.x + 0.3, y: donut.y + 0.3 }, 'me'), { thing: 'donut', id: donut.id }, 'a tap near a loose donut');
for (const s of snap.shelves) {
  assert.deepEqual(pickTarget(snap, { x: s.x + 0.2, y: s.y + 0.6 }, 'me'), { thing: 'shelf', team: s.team }, `the ${s.team} shelf`);
}
assert.deepEqual(pickTarget(snap, { x: 0.5, y: 0.1 }, 'me'), { x: 0.5, y: 0.1 }, 'empty floor is a point');
assert.deepEqual(pickTarget(snap, { x: me.x, y: me.y + 0.5 }, 'me'), { x: me.x, y: me.y + 0.5 }, 'my own fighter is not a foe');
assert.deepEqual(pickTarget(snap, { x: dummy.x, y: dummy.y + 0.5 }, 'me'), { thing: 'fighter', id: 'dummy' }, 'a tap on the dummy chases it');
const [brick] = snap.bricks;
assert.deepEqual(pickTarget(snap, { x: brick.x + 0.2, y: brick.y + 0.2 }, 'me'), { thing: 'brick', id: brick.id }, 'a tap on a brick');

{
  const c = createControls('me');
  c.down(7, 'punch', null);
  c.move(7, { x: 0, y: 0 });
  c.up(7);
  assert.deepEqual(c.take(snap), { target: null, punch: true, kick: false }, 'a button touch is a press, never a move');
  assert.deepEqual(c.take(snap), { target: null, punch: false, kick: false }, 'a press lasts one tick');
}

{
  const c = createControls('me');
  c.down(1, 'stage', { x: 0.5, y: 0 });
  c.down(2, 'kick', null);
  assert.deepEqual(c.take(snap), { target: { x: 0.5, y: 0 }, punch: false, kick: true }, 'tap and kick with two thumbs');
  assert.equal(c.take(snap).target, null, 'an unchanged target is not resent');
  c.move(1, { x: 1.5, y: 0 });
  assert.deepEqual(c.take(snap).target, { x: 1.5, y: 0 }, 'a held finger drags the target');
  c.up(1);
  c.move(1, { x: 3, y: 0 });
  assert.equal(c.take(snap).target, null, 'a lifted finger stops steering');
}

{
  const state = createMatch(entrants);
  const count = (s) => s.donuts.length + s.shelves.reduce((n, sh) => n + sh.donuts.length, 0) + s.fighters.filter((f) => f.carrying).length;
  assert.equal(count(snapshot(state)), 24, 'the stand-in match holds all 24 donuts');
  tick(state, { me: { target: { x: 0, y: 0 }, punch: true, kick: false } });
  for (let i = 0; i < 120; i++) tick(state, {});
  const after = snapshot(state).fighters.find((f) => f.id === 'me');
  assert.ok(after.x > me.x && after.facing === 1, 'the stand-in walks toward a tapped point');
}

console.log('controls ok');
