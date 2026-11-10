import assert from 'node:assert/strict';
import { createControls, floorPoint, pickTarget, walkTarget } from './controls.js';
import { createMatch as createSim, snapshot as simSnap, tick as simTick } from './sim.js';
import { TICK_HZ, floorTop } from './match.js';
import { TUTORIAL } from './levels.js';

const { stage: STAGE } = TUTORIAL;

const look = (frosting) => ({ dough: '#e8c48e', frosting, stripe: false });
const fighter = (id, team, x, z) => ({
  id, team, x, y: 0, z, vx: 0, vy: 0, vz: 0, facing: 0, height: 1, onGround: true, move: 'idle', step: 0, percent: 0,
  carrying: null, invincible: false, respawn: 0, target: null, block: null,
});
/** @type {import('./match.js').Snapshot} */
const snap = {
  tick: 0, secondsLeft: 90, over: false, winner: null, hits: [], fullBag: [], donutEvents: [],
  fighters: [fighter('me', 'heroes', -4, 0.5), fighter('pal', 'heroes', -3, -1), fighter('dummy', 'badGuys', 2.5, 0)],
  donuts: [{ id: 'd0', x: -2, y: 0, z: 1, look: look('#ff3b7f') }],
  bricks: STAGE.bricks.map((b, i) => ({ id: `b${i}`, ...b, maxHits: b.hits, icing: '#7b2fbf' })),
  shelves: STAGE.shelves.map((s) => ({ ...s, donuts: [] })),
  phase: 'play', ready: [], piles: [],
};

// A camera up and in front, looking down about 35 degrees, as play.js frames it.
const tap = (x, y, z) => ({ origin: { x, y: y + 4.7, z: z + 6.7 }, direction: { x: 0, y: -4.7, z: -6.7 } });
const close = (got, want, what) => {
  for (const k of Object.keys(want)) assert.ok(Math.abs(got[k] - want[k]) < 1e-9, `${what}: ${k} ${got[k]} != ${want[k]}`);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${what}: keys`);
};

close(pickTarget(STAGE, snap, tap(-1.5, 0, 1.6), 'me'), { x: -1.5, z: 1.6 }, 'a tap on the floor is an x/z point');
close(pickTarget(STAGE, snap, tap(-7, 1.1, -1.1), 'me'), { x: -7, z: -1.1, y: 1.1 }, 'a tap on the raised deck carries its y');
assert.equal(pickTarget(STAGE, snap, tap(-7, 0.5, -0.8), 'me').y, 1.1, "a tap on the deck's side means its top");
close(pickTarget(STAGE, snap, tap(0, 0.6, 0.2), 'me'), { x: 0, z: 0.2, y: 0.6 }, 'a tap on the gumdrop hill');
close(floorPoint(STAGE, tap(12, 0, 1)), { x: 12, z: 1, y: 0 }, 'a tap past the end still gives a point, for the sim to clamp');
assert.equal(pickTarget(STAGE, snap, { origin: { x: 0, y: 5, z: 7 }, direction: { x: 0, y: 0.2, z: -1 } }, 'me'), null, 'a tap in the sky is nothing');
assert.equal(floorTop(STAGE, -7.5, -1.5), 1.1, 'the deck is the top under the shelf');
assert.equal(floorTop(STAGE, -7.5, -1.5, 0.5), 0, 'below it, the ground');

assert.deepEqual(pickTarget(STAGE, snap, tap(-2, 0.2, 1), 'me'), { thing: 'donut', id: 'd0' }, 'a tap on a loose donut');
assert.deepEqual(pickTarget(STAGE, snap, tap(-1.7, 0.4, 1.1), 'me'), { thing: 'donut', id: 'd0' }, 'a tap near a loose donut');
assert.deepEqual(pickTarget(STAGE, snap, tap(2.5, 0.6, 0), 'me'), { thing: 'fighter', id: 'dummy' }, 'a tap on the dummy chases it');
assert.deepEqual(pickTarget(STAGE, snap, tap(2.5, 1, 0), 'me'), { thing: 'fighter', id: 'dummy' }, "a tap on the dummy's head");
const away = { ...snap, fighters: snap.fighters.map((f) => (f.id === 'dummy' ? { ...f, respawn: 2 } : f)) };
assert.ok('x' in pickTarget(STAGE, away, tap(2.5, 0.6, 0), 'me'), 'a fighter waiting to drop back in is not there to tap');
assert.deepEqual(pickTarget(STAGE, snap, tap(-4, 0.6, 0.5), 'me'), { stop: true }, 'a tap on myself stops');
assert.deepEqual(pickTarget(STAGE, snap, tap(-4, 1.6, 0.5), 'me'), { jump: true }, 'a tap just above my head jumps');
const jumping = { ...snap, fighters: snap.fighters.map((f) => (f.id === 'me' ? { ...f, y: 2, onGround: false } : f)) };
assert.deepEqual(pickTarget(STAGE, jumping, tap(-4, 3.6, 0.5), 'me'), { jump: true }, 'and above it in the air too, where I am then');
assert.ok('x' in pickTarget(STAGE, snap, tap(-3, 0.6, -1), 'me'), 'a teammate is not a foe');
for (const s of snap.shelves) {
  assert.deepEqual(pickTarget(STAGE, snap, tap(s.x + 0.4, s.y + 0.9, s.z - 0.1), 'me'), { thing: 'shelf', team: s.team }, `the ${s.team} shelf`);
}
const front = snap.bricks.find((b) => b.z === 0.8 && b.y === 0);
assert.deepEqual(pickTarget(STAGE, snap, tap(front.x + 0.2, 0.2, front.z + 0.2), 'me'), { thing: 'brick', id: front.id }, 'a tap on a brick');

{
  const c = createControls('me', STAGE);
  c.down(7, 'punch', null);
  c.move(7, tap(0, 0, 0));
  c.up(7);
  assert.deepEqual(c.take(snap), { target: null, punch: true, kick: false }, 'a button touch is a press, never a move');
  assert.deepEqual(c.take(snap), { target: null, punch: false, kick: false }, 'a press lasts one tick');
}

// REUSE-SPEC.md §Discoverable moves: 🦶 let go after a hold (play.js times it) goes out once, as `sweep`
{
  const c = createControls('me', STAGE);
  c.sweep();
  assert.equal(c.take(snap).sweep, true, 'a held 🦶 let go sends sweep');
  assert.equal(c.take(snap).sweep, undefined, '...once');
}

{
  const c = createControls('me', STAGE);
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
  const hill = STAGE.floors.find((f) => f.round);
  assert.equal(floorTop(STAGE, (hill.x0 + hill.x1) / 2, (hill.z0 + hill.z1) / 2), hill.y, 'the middle of the rounded hill is its top');
  assert.equal(floorTop(STAGE, hill.x1 - 0.05, hill.z1 - 0.05), 0, 'its rounded-off corner is ground, not thin air');
  assert.equal(floorTop(STAGE, hill.x1 - 0.05, (hill.z0 + hill.z1) / 2), hill.y, 'its straight side still reaches the edge');
}

{
  const piles = [{ owner: 'me', x: -5, y: 0, z: 1.4, count: 4, icing: '#ff3b7f' }, { owner: 'pal', x: -5, y: 0, z: -0.6, count: 4, icing: '#14c4e0' }];
  const building = { ...snap, phase: /** @type {const} */ ('build'), piles };
  assert.deepEqual(pickTarget(STAGE, building, tap(-5, 0.2, 1.4), 'me'), { thing: 'pile', id: 'me' }, 'a tap on your pile fetches from it');
  assert.ok(!('thing' in pickTarget(STAGE, building, tap(-5, 0.2, -0.6), 'me')), "a teammate's pile is only floor to you");
  const c = createControls('me', STAGE);
  c.down(1, 'drop', null);
  c.ready(true);
  c.go();
  assert.deepEqual(c.take(snap), { target: null, punch: false, kick: false, drop: true, ready: true, go: true }, '⬇️, 👍 and the hold go out once');
  assert.deepEqual(c.take(snap), { target: null, punch: false, kick: false }, 'and only once');
}

{
  const c = createControls('me', STAGE), me = snap.fighters[0];
  c.walk(1, 0);
  assert.deepEqual(c.take(snap).target, { x: me.x + 1, z: me.z }, '→ walks toward a step to the right');
  for (let i = 1; i < 6; i++) assert.equal(c.take(snap).target, null, 'held, it isn\'t sent again every tick');
  assert.ok(c.take(snap).target, 'but now and then, so the fighter never gets there and stops');
  c.jump();
  assert.deepEqual(c.take(snap).target, { jump: true }, 'Space jumps while walking');
  c.walk(0, 0);
  assert.deepEqual(c.take(snap).target, { stop: true }, 'letting go of the arrows stops you');
  assert.equal(c.take(snap).target, null, 'once');
  const front = STAGE.floors.reduce((z, f) => Math.max(z, f.z1), -Infinity);
  assert.ok(walkTarget(STAGE, { x: 0, z: front - 0.1 }, 0, 1).z > front, '↓ at the front edge aims past it, as a tap there does');
  const deck = STAGE.floors.find((f) => f.kind === 'deck');
  assert.equal(walkTarget(STAGE, { x: deck.x1 + 0.5, z: deck.z0 + 0.3 }, -1, 0).y, deck.y, '← into a deck aims up onto it, as a tap there does');
}

{
  const m = createSim([{ id: 'kid', team: 'heroes', height: 0.9, width: 0.45, reach: 0.38, look: look('#14c4e0') }], STAGE);
  const c = createControls('kid', STAGE), x0 = simSnap(m).fighters[0].x;
  c.walk(1, 0);
  for (let i = 0; i < TICK_HZ; i++) simTick(m, { kid: c.take(simSnap(m)) });
  const walked = simSnap(m).fighters[0].x;
  assert.ok(walked > x0 + 1, `held → for a second walks right (${x0.toFixed(2)} → ${walked.toFixed(2)})`);
  c.walk(0, 0);
  for (let i = 0; i < TICK_HZ / 2; i++) simTick(m, { kid: c.take(simSnap(m)) });
  const stopped = simSnap(m).fighters[0].x;
  for (let i = 0; i < TICK_HZ; i++) simTick(m, { kid: c.take(simSnap(m)) });
  assert.ok(Math.abs(simSnap(m).fighters[0].x - stopped) < 1e-6, 'and letting go stops it where it is');
  c.walk(0, 1);
  for (let i = 0; i < TICK_HZ * 4; i++) simTick(m, { kid: c.take(simSnap(m)) });
  const kid = simSnap(m).fighters[0], front = STAGE.floors.reduce((z, f) => Math.max(z, f.z1), -Infinity);
  assert.ok(!kid.respawn && kid.y >= 0 && kid.z < front, 'holding ↓ stops at the front edge, as a tap past it does: walking never rings you out');
}

console.log('controls ok');

// A full power bar: a long drag turns from steering into a drawing for the gesture recogniser, and a second finger
// only draws; with the bar not full the same drag steers all the way and draws nothing (REUSE-SPEC.md §Power moves)
{
  const withBar = (power) => ({ ...snap, fighters: snap.fighters.map((f) => (f.id === 'me' ? { ...f, power } : f)) });
  const drag = (c, full) => {
    c.take(withBar(full ? 1 : 0.5));
    c.down(1, 'stage', tap(-1.5, 0, 1.6), { x: 0, y: 0, t: 0 });
    c.take(withBar(full ? 1 : 0.5));
    let steered = 0;
    for (let i = 1; i <= 10; i++) {
      c.move(1, tap(-1.5 + i * 0.1, 0, 1.6), { x: i * 20, y: 0, t: i * 16 });
      if (c.take(withBar(full ? 1 : 0.5)).target) steered++;
    }
    c.up(1);
    return steered;
  };
  const full = createControls('me', STAGE, { draw: true }), half = createControls('me', STAGE, { draw: true });
  assert.ok(drag(full, true) < 5, 'with a full bar a long drag stops steering');
  const [stroke] = full.strokes();
  assert.equal(stroke?.length, 11, 'and comes out as one stroke, every point of it');
  assert.equal(full.strokes().length, 0, 'once');
  assert.equal(drag(half, false), 10, 'without one it steers all the way');
  assert.equal(half.strokes().length, 0, 'and draws nothing');
  full.down(1, 'stage', tap(-1.5, 0, 1.6), { x: 0, y: 0, t: 0 });
  full.down(2, 'stage', tap(2, 0, 0), { x: 300, y: 0, t: 0 });
  assert.ok(Math.abs(/** @type {any} */ (full.take(withBar(1)).target).x + 1.5) < 1e-9, 'a second finger with a full bar doesn\'t steer');
  full.up(2);
  assert.equal(full.strokes().length, 1, 'it draws');
}

// Until the shape recogniser is in, drawing is off: a full bar never stops a drag from steering (playtest risk: the bar
// fills in a minute and nothing could empty it). A keyboard's C fires the power at the nearest bad guy instead.
{
  const withBar = (power) => ({ ...snap, fighters: snap.fighters.map((f) => (f.id === 'me' ? { ...f, power } : f)) });
  const c = createControls('me', STAGE);
  c.take(withBar(1));
  c.down(1, 'stage', tap(-1.5, 0, 1.6), { x: 0, y: 0, t: 0 });
  c.take(withBar(1));
  c.move(1, tap(0, 0, 1.6), { x: 400, y: 0, t: 100 });
  assert.ok(c.take(withBar(1)).target, 'a long drag with a full bar still steers');
  c.up(1);
  assert.equal(c.strokes().length, 0, 'and draws nothing');
  c.power();
  assert.equal(c.take(withBar(0.5)).power, undefined, 'C with the bar not full does nothing');
  c.power();
  assert.deepEqual(c.take(withBar(1)).power, { kind: 'toy', on: 'dummy' }, 'C with a full bar fires at the nearest bad guy');
  assert.equal(c.take(withBar(1)).power, undefined, 'once');
}
