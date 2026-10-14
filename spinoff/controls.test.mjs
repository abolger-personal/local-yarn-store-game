import assert from 'node:assert/strict';
import { createControls, floorPoint, floorTop, pickTarget } from './controls.js';
import { createMatch, snapshot, tick } from './fake-match.js';
import { ROUND_SECONDS, STAGE, TICK_HZ } from './match.js';

const look = (frosting) => ({ dough: '#e8c48e', frosting, stripe: false });
const fighter = (id, team, x, z) => ({
  id, team, x, y: 0, z, vx: 0, vy: 0, vz: 0, facing: 0, height: 1, onGround: true, move: 'idle', step: 0, percent: 0,
  carrying: null, invincible: false, target: null,
});
/** @type {import('./match.js').Snapshot} */
const snap = {
  tick: 0, secondsLeft: 90, over: false, winner: null, hits: [], fullBag: [], donutEvents: [],
  fighters: [fighter('me', 'heroes', -4, 0.5), fighter('pal', 'heroes', -3, -1), fighter('dummy', 'badGuys', 2.5, 0)],
  donuts: [{ id: 'd0', x: -2, y: 0, z: 1, look: look('#ff3b7f') }],
  bricks: STAGE.bricks.map((b, i) => ({ id: `b${i}`, ...b, maxHits: b.hits, icing: '#7b2fbf' })),
  shelves: STAGE.shelves.map((s) => ({ ...s, donuts: [] })),
};

// A camera up and in front, looking down about 35 degrees, as play.js frames it.
const tap = (x, y, z) => ({ origin: { x, y: y + 4.7, z: z + 6.7 }, direction: { x: 0, y: -4.7, z: -6.7 } });
const close = (got, want, what) => {
  for (const k of Object.keys(want)) assert.ok(Math.abs(got[k] - want[k]) < 1e-9, `${what}: ${k} ${got[k]} != ${want[k]}`);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${what}: keys`);
};

close(pickTarget(snap, tap(-1.5, 0, 1.6), 'me'), { x: -1.5, z: 1.6 }, 'a tap on the floor is an x/z point');
close(pickTarget(snap, tap(-7, 1.1, -1.1), 'me'), { x: -7, z: -1.1, y: 1.1 }, 'a tap on the raised deck carries its y');
assert.equal(pickTarget(snap, tap(-7, 0.5, -0.8), 'me').y, 1.1, "a tap on the deck's side means its top");
close(pickTarget(snap, tap(0, 0.6, 0.2), 'me'), { x: 0, z: 0.2, y: 0.6 }, 'a tap on the gumdrop hill');
close(floorPoint(tap(12, 0, 1)), { x: 12, z: 1, y: 0 }, 'a tap past the end still gives a point, for the sim to clamp');
assert.equal(pickTarget(snap, { origin: { x: 0, y: 5, z: 7 }, direction: { x: 0, y: 0.2, z: -1 } }, 'me'), null, 'a tap in the sky is nothing');
assert.equal(floorTop(-7.5, -1.5), 1.1, 'the deck is the top under the shelf');
assert.equal(floorTop(-7.5, -1.5, 0.5), 0, 'below it, the ground');

assert.deepEqual(pickTarget(snap, tap(-2, 0.2, 1), 'me'), { thing: 'donut', id: 'd0' }, 'a tap on a loose donut');
assert.deepEqual(pickTarget(snap, tap(-1.7, 0.4, 1.1), 'me'), { thing: 'donut', id: 'd0' }, 'a tap near a loose donut');
assert.deepEqual(pickTarget(snap, tap(2.5, 0.6, 0), 'me'), { thing: 'fighter', id: 'dummy' }, 'a tap on the dummy chases it');
assert.deepEqual(pickTarget(snap, tap(2.5, 1, 0), 'me'), { thing: 'fighter', id: 'dummy' }, "a tap on the dummy's head");
assert.deepEqual(pickTarget(snap, tap(-4, 0.6, 0.5), 'me'), { stop: true }, 'a tap on myself stops');
assert.ok('x' in pickTarget(snap, tap(-3, 0.6, -1), 'me'), 'a teammate is not a foe');
for (const s of snap.shelves) {
  assert.deepEqual(pickTarget(snap, tap(s.x + 0.4, s.y + 0.9, s.z - 0.1), 'me'), { thing: 'shelf', team: s.team }, `the ${s.team} shelf`);
}
const front = snap.bricks.find((b) => b.z === 0.8 && b.y === 0);
assert.deepEqual(pickTarget(snap, tap(front.x + 0.2, 0.2, front.z + 0.2), 'me'), { thing: 'brick', id: front.id }, 'a tap on a brick');

{
  const c = createControls('me');
  c.down(7, 'punch', null);
  c.move(7, tap(0, 0, 0));
  c.up(7);
  assert.deepEqual(c.take(snap), { target: null, punch: true, kick: false }, 'a button touch is a press, never a move');
  assert.deepEqual(c.take(snap), { target: null, punch: false, kick: false }, 'a press lasts one tick');
}

{
  const c = createControls('me');
  c.down(1, 'stage', tap(-1.5, 0, 1.6));
  c.down(2, 'kick', null);
  const first = c.take(snap);
  assert.ok(first.kick && 'x' in first.target, 'tap and kick with two thumbs');
  assert.equal(c.take(snap).target, null, 'an unchanged target is not resent');
  c.move(1, tap(-1, 0, 1.6));
  assert.ok(Math.abs(/** @type {any} */ (c.take(snap).target).x + 1) < 1e-9, 'a held finger drags the target');
  c.up(1);
  c.move(1, tap(3, 0, 0));
  assert.equal(c.take(snap).target, null, 'a lifted finger stops steering');
}

{
  const entrants = [
    { id: 'me', team: 'heroes', height: 1, width: 0.6, reach: 0.4, look: look('#ff3b7f') },
    { id: 'dummy', team: 'badGuys', height: 1, width: 0.6, reach: 0.4, look: look('#7b2fbf'), dummy: true },
  ];
  const state = createMatch(entrants);
  const count = (s) => s.donuts.length + s.shelves.reduce((n, sh) => n + sh.donuts.length, 0) + s.fighters.filter((f) => f.carrying).length;
  assert.equal(count(snapshot(state)), 24, 'the stand-in match holds all 24 donuts');
  const me = () => snapshot(state).fighters.find((f) => f.id === 'me');
  const x0 = me().x;
  tick(state, { me: { target: { x: x0 + 1, z: 0.6 }, punch: false, kick: false } });
  for (let i = 0; i < 10; i++) tick(state, {});
  assert.ok(me().x > x0 && Math.abs(me().facing) < 1e-9, 'the stand-in walks toward a tapped x/z point, facing it');
  tick(state, { me: { target: { stop: true }, punch: false, kick: false } });
  assert.ok(me().target === null && me().vx === 0, 'stop stops');
  tick(state, { me: { target: { thing: 'fighter', id: 'dummy' }, punch: false, kick: false } });
  let hits = [];
  for (let i = 0; i < 400 && !hits.length; i++) {
    tick(state, { me: { target: null, punch: i % 30 === 0, kick: false } });
    hits = snapshot(state).hits;
  }
  assert.equal(hits[0]?.on, 'fighter', 'a punch next to the dummy lands, once, as a HitEvent');
  assert.equal(count(snapshot(state)), 24, 'still 24 donuts after the hit');
  for (let i = 0; i < ROUND_SECONDS * TICK_HZ; i++) tick(state, {});
  assert.ok(snapshot(state).over && snapshot(state).winner === 'badGuys', 'the clock runs out and the fuller shelf wins');
}

{
  const hill = STAGE.floors.find((f) => f.round);
  assert.equal(floorTop((hill.x0 + hill.x1) / 2, (hill.z0 + hill.z1) / 2), hill.y, 'the middle of the rounded hill is its top');
  assert.equal(floorTop(hill.x1 - 0.05, hill.z1 - 0.05), 0, 'its rounded-off corner is ground, not thin air');
  assert.equal(floorTop(hill.x1 - 0.05, (hill.z0 + hill.z1) / 2), hill.y, 'its straight side still reaches the edge');
}

console.log('controls ok');
