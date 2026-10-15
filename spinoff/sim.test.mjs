import assert from 'node:assert/strict';
import { BRICK, DONUTS_PER_SHELF, HITSTOP_TICKS, ROUND_SECONDS, TICK_HZ, outside } from './match.js';
import { LEVELS } from './levels.js';
import { CALM_DRAIN, CALM_TICKS, DUMMY, SYRUP_SLOW, WALK_SPEED, createMatch, snapshot, tick } from './sim.js';

const STAGE = LEVELS[1].stage;
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const BAD = { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true };
const body = { height: 0.9, width: 0.45, reach: 0.38 };
const R = body.width / 2;
const hero = { id: 'kid', team: 'heroes', ...body, look: LOOK };
const dummy = { id: 'dummy', team: 'badGuys', ...body, look: BAD, dummy: true };
const dummy2 = { ...dummy, id: 'dummy2' };
const brute = { id: 'brute', team: 'badGuys', ...body, look: BAD };
const HILL = STAGE.floors.find((f) => f.x0 < 0 && f.x1 > 0 && f.y > 0);
const WALL_X = STAGE.bricks[0].x;
const CLOSED = [-2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6].flatMap((z) =>
  [0, BRICK].map((y) => ({ team: 'badGuys', x: WALL_X, z, y, hits: 2 })));

/** A fighter's body is inside the hill's block, below its top. */
const inHill = (f) => f.y < HILL.y - 1e-6
  && outside(HILL, f.x, f.z) < R - 1e-6;
const RIM = [
  ...[-9, -8.6, -8.2, -7.8, -7.4, -7, -6.6, -6.4].map((x) => ({ team: 'heroes', x, z: -1.2, y: 1.1, hits: 2 })),
  ...[-2, -1.6].map((z) => ({ team: 'heroes', x: -6.4, z, y: 1.1, hits: 2 })),
];
const total = (snap) => snap.shelves.reduce((n, s) => n + s.donuts.length, 0)
  + snap.fighters.filter((f) => f.carrying).length + snap.donuts.length;
const me = (snap, id = 'kid') => snap.fighters.find((f) => f.id === id);
const near = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;
const say = (input, id = 'kid') => ({ [id]: { target: null, punch: false, kick: false, ...input } });
const once = (input, id = 'kid') => (_, i) => (i === 0 ? say(input, id) : {});
const tap = (x, z, y = 0) => once({ target: { x, z, y } });

/** Steps the match, checking every tick that no donut was made or lost; `watch` sees every snapshot. */
function run(m, n, inputs = () => ({}), watch = () => {}) {
  let snap = snapshot(m);
  for (let i = 0; i < n; i++) {
    tick(m, inputs(snap, i));
    snap = snapshot(m);
    assert.equal(total(snap), 2 * DONUTS_PER_SHELF, `donut total changed on tick ${snap.tick}`);
    watch(snap, i);
  }
  return snap;
}

/** Counts the jumps a fighter starts, and the ticks it walks without getting anywhere, while the match runs. */
function jumpsDuring(m, n, inputs, id = 'kid') {
  let jumps = 0, inPlace = 0, was = me(snapshot(m), id);
  const snap = run(m, n, inputs, (s) => {
    const f = me(s, id);
    if (was.onGround && !f.onGround && f.vy > 0) jumps++;
    if (f.move === 'walk' && Math.hypot(f.x - was.x, f.z - was.z) < 1e-3) inPlace++;
    was = f;
  });
  return { jumps, inPlace, snap };
}

{
  const m = createMatch([hero], STAGE);
  let snap = run(m, 400, tap(-4, 1.5));
  assert.ok(near(me(snap).x, -4) && near(me(snap).z, 1.5) && me(snap).y === 0, 'a floor tap walks there in x and z');
  assert.equal(me(snap).move, 'idle', 'and stops');
  snap = run(m, 5, tap(-4, -1));
  assert.ok(me(snap).z < 1.5 && me(snap).vz < 0 && near(me(snap).facing, -Math.PI / 2, 0.05), 'a tap away from the camera walks back in z, facing it');
  snap = run(m, 400);
  assert.ok(near(me(snap).z, -1), 'all the way');
  snap = run(m, 400, tap(-4, 1));
  assert.ok(near(me(snap).z, 1) && near(me(snap).facing, Math.PI / 2, 0.05), 'and toward the camera');
}

{
  const m = createMatch([hero], STAGE);
  const deck = STAGE.shelves[0];
  let { jumps, snap } = jumpsDuring(m, 400, tap(deck.x, -1.1, deck.y));
  assert.ok(near(me(snap).x, deck.x) && near(me(snap).z, -1.1) && me(snap).y === deck.y && me(snap).onGround, 'a deck tap gets up there');
  assert.equal(jumps, 1, 'by one jump');
  ({ jumps, snap } = jumpsDuring(m, 400, tap(-4, 0)));
  assert.ok(near(me(snap).x, -4) && me(snap).y === 0 && jumps === 0, 'and walks off the edge back down');
}

{
  const m = createMatch([hero], STAGE);
  let low = Infinity, snap = run(m, 400, tap(-4, 10), (s) => { low = Math.min(low, me(s).y); });
  assert.ok(near(me(snap).z, STAGE.floors[0].z1, 0.06) && me(snap).z < STAGE.floors[0].z1 && me(snap).onGround, 'a tap past the front edge stops at it');
  snap = run(m, 600, tap(-20, 0), (s) => { low = Math.min(low, me(s).y); });
  assert.ok(near(me(snap).x, STAGE.floors[0].x0, 0.06) && me(snap).x > STAGE.floors[0].x0, 'a tap past the end stops at the end');
  assert.equal(low, 0, 'it never stepped off');
}

{
  const m = createMatch([hero], STAGE);
  let crossings = 0, overlaps = 0;
  const watchHill = (s) => {
    if (inHill(me(s))) overlaps++;
    if (me(s).x > HILL.x0 && me(s).x < HILL.x1) crossings++;
  };
  const snap = run(m, 600, tap(3, 0), watchHill);
  assert.ok(near(me(snap).x, 3) && near(me(snap).z, 0), 'a tap past the hill gets there');
  assert.ok(crossings > 0 && overlaps === 0, `around or over the hill, never through it (${overlaps} ticks inside)`);
  run(m, 600, tap(0, 0), watchHill);
  assert.ok(overlaps === 0, `a ground tap inside the hill stops beside it (${overlaps} ticks inside)`);
}

{
  const m = createMatch([hero], STAGE);
  const zs = [];
  const { jumps, snap } = jumpsDuring(m, 900, tap(7, 0));
  run(createMatch([hero], STAGE), 900, tap(7, 0), (s) => { if (Math.abs(me(s).x - WALL_X - BRICK / 2) < BRICK / 2) zs.push(me(s).z); });
  assert.ok(near(me(snap).x, 7) && near(me(snap).z, 0) && me(snap).move === 'idle', 'a tap behind the bad-guy wall gets there');
  assert.ok(zs.length && zs.every((z) => z < -1.2 - R + 1e-6 || z > 1.2 + R - 1e-6), 'through a gap');
  assert.equal(jumps, 0, 'without hopping');
}

{
  const m = createMatch([hero], { ...STAGE, bricks: CLOSED });
  let { snap, inPlace } = jumpsDuring(m, 900, tap(7, 0));
  assert.equal(me(snap).move, 'blocked', 'a closed wall leaves the fighter blocked');
  assert.ok(inPlace <= 5, `without walking in place first (${inPlace} ticks)`);
  assert.ok(me(snap).x < WALL_X - R + 0.05 && me(snap).x > WALL_X - R - 0.3, 'as close as it can get');
  assert.ok(near(me(snap).facing, 0, 0.3), `facing the wall (${me(snap).facing.toFixed(2)})`);
  const at = me(snap);
  const after = jumpsDuring(m, 120, () => ({}));
  ({ snap, inPlace } = after);
  assert.equal(inPlace, 0, 'not walking in place');
  assert.ok(me(snap).x === at.x && me(snap).z === at.z && me(snap).vx === 0 && me(snap).move === 'blocked', 'not walking in place');
  assert.equal(after.jumps, 0, 'nor jumping');
}

{
  const m = createMatch([hero], STAGE);
  let snap = run(m, 20, tap(4, 0));
  const { x } = me(snap);
  snap = run(m, 60, once({ target: { stop: true } }));
  assert.ok(me(snap).x - x < 0.2 && me(snap).move === 'idle' && me(snap).target === null, '{ stop: true } stops where it is');
}

{
  const awkward = [
    ['the deck over the fort', [hero], { x: 7.5, z: -1.2, y: 1.1 }],
    ['behind the closed wall', [hero], { x: 7, z: 0, y: 0 }, CLOSED],
    ['under a deck edge', [hero], { x: -5.9, z: -1.4, y: 0 }],
    ['on top of a brick', [hero], { x: 4.8, z: -1, y: BRICK }],
    ['on top of the closed wall', [hero], { x: 4.8, z: 0, y: 2 * BRICK }, CLOSED],
    ['the enemy shelf', [hero], { thing: 'shelf', team: 'badGuys' }],
    ['a deck walled in by a brick rim', [hero], { thing: 'shelf', team: 'heroes' }, RIM, 'blocked'],
  ];
  for (const [what, who, target, bricks, ends] of awkward) {
    const m = createMatch(who, bricks ? { ...STAGE, bricks } : STAGE);
    const { jumps, inPlace, snap } = jumpsDuring(m, 10 * TICK_HZ, once({ target }));
    assert.ok(jumps <= 3, `${what}: ${jumps} jumps`);
    assert.ok(inPlace <= 5, `${what}: never walks in place (${inPlace} ticks)`);
    assert.ok((ends ? [ends] : ['idle', 'blocked']).includes(me(snap).move) && me(snap).onGround, `${what}: ends standing (${me(snap).move})`);
  }
}

{
  const m = createMatch([hero], STAGE);
  let low = Infinity, high = -Infinity;
  const snap = run(m, 900, (s, i) => say({ target: i === 0 ? { x: 4.2, z: 1, y: 0 } : null, kick: i % 60 === 5 }),
    (s) => { low = Math.min(low, me(s).y); high = Math.max(high, me(s).y); });
  assert.ok(low === 0 && high === 0, `kicking on the walk never leaves the ground (${high})`);
  assert.ok(near(me(snap).x, 4.2) && near(me(snap).z, 1), 'and still gets there');
}

/** Puts the kid `gap` from the dummy's body (and `dz` deeper), facing it, and swings until the first hit lands. */
function swing(button, gap, dz = 0) {
  const m = createMatch([hero, dummy], STAGE);
  run(m, 600, tap(DUMMY.x - 2 * R - gap, DUMMY.z + dz));
  run(m, 5, tap(DUMMY.x - 2 * R - gap + 0.01, DUMMY.z + dz));
  let at = run(m, 1, once({ [button]: true }));
  for (let i = 0; i < 40 && !at.hits.length; i++) at = run(m, 1);
  return { m, at, events: at.hits };
}

{
  for (const [button, gap] of [['punch', 0.3], ['kick', 0.45], ['punch', 0.6], ['kick', 0.75]]) {
    const { events } = swing(button, gap);
    assert.equal(events.length, 1, `a ${button} lands across a ${gap} gap`);
    assert.ok(events[0].move === button && events[0].on === 'fighter' && events[0].target === 'dummy', 'as one hit event on the dummy');
    assert.ok(events[0].x > DUMMY.x - R - 0.01 && events[0].x < DUMMY.x, 'at the dummy\'s body');
  }
  assert.equal(swing('punch', 1.3).events.length, 0, 'a punch from too far whiffs');
  assert.equal(swing('kick', 0.2, 1.2).events.length, 0, 'nothing lands a lane away in depth');
}

for (const [button, gap] of [['punch', 0.3], ['kick', 0.45]]) {
  const { m, at } = swing(button, gap);
  const still = (s) => [me(s), me(s, 'dummy')].map((f) => [f.x, f.y, f.z, f.step]);
  const frozen = still(at);
  let snap;
  for (let i = 0; i < HITSTOP_TICKS; i++) {
    snap = run(m, 1);
    assert.deepEqual(still(snap), frozen, `a ${button}'s hit-stop holds both fighters (tick ${i + 1})`);
  }
  snap = run(m, 2);
  assert.notDeepEqual(still(snap), frozen, 'then the hit carries on');
}

/** The dummy's flight from one hit: its launch velocity and how far it went. */
function launch(button) {
  const { m, at } = swing(button, 0.3);
  const x0 = me(at, 'dummy').x;
  let v = null;
  const snap = run(m, 120, () => ({}), (s) => {
    const d = me(s, 'dummy');
    if (!v && Math.hypot(d.vx, d.vz) > 0) v = { along: d.vx, up: d.vy, move: d.move };
  });
  return { v, dist: me(snap, 'dummy').x - x0 };
}

{
  const punch = launch('punch'), kick = launch('kick');
  assert.equal(punch.v.move, 'launched', 'a punch launches the dummy');
  assert.ok(punch.v.along > 0 && punch.v.up > 0, 'away from the puncher and up');
  assert.ok(kick.dist > punch.dist, `a kick sends it further (${kick.dist.toFixed(2)} > ${punch.dist.toFixed(2)})`);
  assert.ok(kick.v.up / kick.v.along < 0.8 * (punch.v.up / punch.v.along), 'and flatter');
}

{
  const m = createMatch([hero, dummy], STAGE);
  const speeds = [];
  let last = 0, inside = 0, nearHill = 0;
  run(m, 900, (s, i) => say({ target: i === 0 ? { thing: 'fighter', id: 'dummy' } : null, punch: i % 40 === 39 }), (s) => {
    const d = me(s, 'dummy');
    if (inHill(d)) inside++;
    if (d.x > HILL.x0 - 2 * R && d.y < HILL.y) nearHill++;
    if (d.percent > last && d.percent > 0) speeds.push(null);
    if (speeds.at(-1) === null && Math.hypot(d.vx, d.vy) > 0) speeds[speeds.length - 1] = Math.hypot(d.vx, d.vy);
    last = d.percent;
  });
  assert.ok(speeds.length >= 4, `the dummy was hit again and again (${speeds.length})`);
  for (let k = 1; k < 4; k++) assert.ok(speeds[k] > speeds[k - 1], `knockback grows with percent (${speeds.map((v) => v?.toFixed(2))})`);
  assert.ok(nearHill > 0 && inside === 0, `knocked against the hill, it stops at its side (${inside} ticks inside)`);
}

{
  const { m, events } = swing('punch', 0.3);
  assert.ok(events[0].broke, 'a hit on a carrier pops the bag');
  let snap = run(m, 120);
  assert.ok(!me(snap, 'dummy').carrying && snap.donuts.length === 1, 'the donut is loose on the stage');
  const [d] = snap.donuts;
  snap = run(m, 120);
  assert.deepEqual(snap.donuts[0], d, 'and stays where it landed');
  const kinds = [];
  snap = run(m, 400, once({ target: { thing: 'donut', id: d.id } }), (s) => kinds.push(...s.donutEvents.map((e) => e.kind)));
  assert.equal(snap.donuts.length, 0, 'tapping it picks it up');
  assert.deepEqual(me(snap).carrying, d.look, 'into the bag, looking the same');
  assert.deepEqual(kinds, ['pickup'], 'one pickup event');
}

{
  const m = createMatch([hero, dummy, dummy2], STAGE);
  run(m, 400, once({ target: { thing: 'fighter', id: 'dummy' } }));
  run(m, 60, once({ punch: true }));
  run(m, 400, once({ target: { thing: 'donut', id: snapshot(m).donuts[0].id } }));
  run(m, 400, once({ target: { thing: 'fighter', id: 'dummy2' } }));
  let snap = run(m, 60, once({ punch: true }));
  assert.ok(me(snap).carrying && snap.donuts.length === 1, 'carrying, with a second donut loose');
  const full = [];
  snap = run(m, 400, once({ target: { thing: 'donut', id: snap.donuts[0].id } }), (s) => full.push(...s.fullBag));
  assert.equal(full.length, 1, `touching it with a full bag says so once (${full.length})`);
  assert.equal(snap.donuts.length, 1, 'and it stays loose');
}

const shelfCount = (snap, team) => snap.shelves.find((s) => s.team === team).donuts.length;

{
  const m = createMatch([hero], STAGE);
  const before = [shelfCount(snapshot(m), 'heroes'), shelfCount(snapshot(m), 'badGuys')];
  const events = [];
  const log = (s) => events.push(...s.donutEvents.map((e) => e.kind), ...s.fullBag.map(() => 'full'));
  let snap = run(m, 900, once({ target: { thing: 'shelf', team: 'badGuys' } }), log);
  assert.ok(me(snap).carrying && shelfCount(snap, 'badGuys') === before[1] - 1, 'the grab takes one off the enemy shelf');
  snap = run(m, 120, once({ target: { thing: 'shelf', team: 'badGuys' } }), log);
  assert.equal(shelfCount(snap, 'badGuys'), before[1] - 1, 'a full bag grabs nothing more');
  snap = run(m, 1200, once({ target: { thing: 'shelf', team: 'heroes' } }), log);
  assert.ok(!me(snap).carrying && shelfCount(snap, 'heroes') === before[0] + 1, 'home again, banked on our shelf');
  assert.deepEqual(events, ['steal', 'full', 'bank'], 'one event each');
}

{
  const m = createMatch([hero, brute], STAGE);
  run(m, 400, tap(-4, 10));
  run(m, 400, once({ target: { x: -4, z: -1, y: 0 } }, 'brute'));
  run(m, 400, once({ target: { x: -4, z: 1.2, y: 0 } }, 'brute'));
  const goal = me(snapshot(m)).target;
  let out = null;
  run(m, 300, (s, i) => say({ punch: i % 30 === 0 }, 'brute'), (s) => { if (!out && me(s).invincible) out = me(s); });
  const r = STAGE.ringOut;
  assert.ok(out, 'the kid was knocked off the front edge');
  assert.ok(out.x >= r.x0 && out.x <= r.x1 && out.z <= r.z1 && out.y >= r.y, 'and is back in play on the same tick');
  assert.equal(out.percent, 0, 'percent reset');
  assert.deepEqual(out.target, goal, 'still heading where it was going');
  const snap = run(m, 600);
  assert.ok(near(me(snap).x, goal.x) && near(me(snap).z, goal.z) && me(snap).y === 0, 'and gets back there');
}

{
  const m = createMatch([hero], STAGE);
  run(m, 600, tap(4, -1));
  run(m, 300, once({ target: { thing: 'brick', id: 'b0' } }));
  const hits = [];
  let snap = run(m, 40, once({ punch: true }), (s) => hits.push(...s.hits));
  assert.ok(near(me(snap).facing, 0, 0.01), 'arriving at a brick ends facing it');
  assert.equal(snap.bricks.find((b) => b.id === 'b0')?.hits, 1, 'a punch takes one hit off a brick');
  snap = run(m, 40, once({ punch: true }), (s) => hits.push(...s.hits));
  assert.ok(!snap.bricks.some((b) => b.id === 'b0'), 'two punches break it');
  assert.deepEqual(hits.map((h) => [h.on, h.target, h.move, h.broke]), [['brick', 'b0', 'punch', false], ['brick', 'b0', 'punch', true]], 'one event per punch');
  run(m, 300, tap(4, -0.2));
  run(m, 300, once({ target: { thing: 'brick', id: 'b2' } }));
  hits.length = 0;
  snap = run(m, 60, once({ kick: true }), (s) => hits.push(...s.hits));
  assert.ok(!snap.bricks.some((b) => b.id === 'b2'), 'a kick breaks one at once');
  assert.deepEqual(hits.map((h) => [h.target, h.move, h.broke]), [['b2', 'kick', true]], 'and says so');
  const fell = snap.bricks.find((b) => b.id === 'b6');
  assert.deepEqual([fell.y, fell.hits, fell.x, fell.z], [0, 2, STAGE.bricks[6].x, STAGE.bricks[6].z], 'the brick above fell straight down and stayed whole');
  assert.equal(fell.icing, snapshot(createMatch([hero], STAGE)).bricks[0].icing, 'bad-guy bricks keep the bad-guy icing');
}

{
  const m = createMatch([hero, dummy], STAGE);
  let snap = run(m, ROUND_SECONDS * TICK_HZ, (s, i) => (i === 0 ? say({ target: { x: -4, z: 0, y: 0 } }) : {}));
  assert.ok(snap.over && snap.secondsLeft === 0, 'the clock runs out');
  assert.equal(snap.winner, 'heroes', 'the team with more donuts home wins');
  const end = snap;
  snap = run(m, 60, (s, i) => say({ target: { x: 0, z: 0, y: 0 }, punch: i % 2 === 0 }));
  assert.deepEqual(snap, end, 'and nothing moves after');
  const tie = createMatch([hero], STAGE);
  assert.equal(run(tie, ROUND_SECONDS * TICK_HZ).winner, null, 'equal shelves are a tie');
}

{
  const play = () => {
    const m = createMatch([hero, dummy], STAGE);
    run(m, 300, once({ target: { thing: 'fighter', id: 'dummy' } }));
    return run(m, 300, (_, i) => say({ punch: i % 25 === 0, kick: i % 60 === 7 }));
  };
  assert.deepEqual(play(), play(), 'the same inputs give the same match');
}

{
  const [p] = STAGE.puddles, cross = (puddles) => {
    const m = createMatch([hero], { ...STAGE, puddles });
    run(m, 400, tap(p.x - 1.2, p.z));
    let ticks = 0;
    run(m, 600, tap(p.x + 1.2, p.z), (s) => { if (me(s).move === 'walk') ticks++; });
    return ticks;
  };
  const dry = cross([]), sticky = cross(STAGE.puddles), wade = (2 * p.r) / (WALK_SPEED * SYRUP_SLOW) - (2 * p.r) / WALK_SPEED;
  assert.ok(near(sticky - dry, wade * TICK_HZ, 3), `syrup slows the walk across it (${dry} dry, ${sticky} sticky ticks)`);
}

{
  const closest = (team) => {
    const m = createMatch([hero, { ...dummy, team }], STAGE);
    let d = Infinity;
    const snap = run(m, 300, tap(-1.6, 0.3), (x) => { d = Math.min(d, Math.hypot(me(x).x - me(x, 'dummy').x, me(x).z - me(x, 'dummy').z)); });
    return { d, past: me(snap).x > me(snap, 'dummy').x };
  };
  const foe = closest('badGuys'), mate = closest('heroes');
  assert.ok(foe.d >= 2 * R - 1e-9, `a foe is solid: never closer than two radii (${foe.d})`);
  assert.ok(foe.past, 'but you shoulder past them to where you tapped');
  assert.ok(mate.d < R, 'a teammate you can walk straight through');
}

{
  const turnedInAir = (to) => {
    const m = createMatch([hero], STAGE), deck = STAGE.shelves[0];
    run(m, 300, tap(deck.x, -1.1, deck.y));
    let first = null, worst = 0;
    run(m, 200, tap(to.x, to.z), (s) => {
      const f = me(s);
      if (f.onGround) return;
      first ??= f.facing;
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(f.facing - first), Math.cos(f.facing - first))));
    });
    return worst;
  };
  for (const to of [{ x: -5.8, z: -0.6 }, { x: -7.6, z: -0.6 }, { x: -5.8, z: -1.2 }, { x: -4, z: 1.5 }])
    assert.ok(turnedInAir(to) < 0.01, `walking off the deck toward ${to.x}, ${to.z} holds its facing all the way down`);
}

{
  const m = createMatch([hero], STAGE);
  run(m, 20, tap(-3, 1));
  let snap = run(m, 5, once({ away: true }));
  const sat = me(snap);
  assert.equal(sat.move, 'sit', 'a guest who leaves the screen sits down');
  snap = run(m, 120, (_, i) => say({ target: { x: 3, z: 0, y: 0 }, punch: i % 10 === 0 }));
  assert.ok(me(snap).move === 'sit' && me(snap).x === sat.x && me(snap).z === sat.z, 'and stays put, whatever arrives, until back');
  snap = run(m, 5, once({ away: false }));
  assert.notEqual(me(snap).move, 'sit', 'coming back stands up');
  snap = run(m, 200, tap(-3, 1));
  assert.ok(near(me(snap).x, -3) && near(me(snap).z, 1), 'and plays on');
}

{
  const m = createMatch([hero, dummy], STAGE);
  run(m, 300, once({ target: { thing: 'fighter', id: 'dummy' } }));
  let snap = run(m, 200, (_, i) => say({ punch: i % 30 === 0 }));
  const hit = me(snap, 'dummy').percent;
  assert.ok(hit > 20, `the dummy has taken hits (${hit}%)`);
  snap = run(m, CALM_TICKS - 30);
  assert.equal(me(snap, 'dummy').percent, hit, 'a short pause keeps the damage');
  snap = run(m, Math.ceil((hit / CALM_DRAIN) * TICK_HZ) + 40);
  assert.equal(me(snap, 'dummy').percent, 0, 'left alone for a few seconds, it steadies right down');
}

{
  const m = createMatch([hero, dummy], STAGE);
  let snap = run(m, 300, tap(-4, 0.5));
  const held = m.fighters.find((f) => f.id === 'dummy');
  m.donuts.push({ id: 'dropped', x: me(snap).x, y: 0, z: me(snap).z, vx: 0, vy: 0, vz: 0, look: held.carrying });
  held.carrying = null;
  snap = run(m, 30);
  assert.ok(!me(snap).carrying && snap.donuts.length === 1, 'a donut landing on you stays put until you tap it');
  snap = run(m, 30, once({ target: { thing: 'donut', id: 'dropped' } }));
  assert.ok(me(snap).carrying && snap.donuts.length === 0, 'tapping a donut you are standing on picks it up');
}

console.log('sim ok');
