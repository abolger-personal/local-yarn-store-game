import assert from 'node:assert/strict';
import { BRICK, DONUTS_PER_SHELF, STAGE } from './match.js';
import { createMatch, snapshot, tick } from './sim.js';

const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const BAD = { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true };
const body = { height: 0.75, width: 0.45, reach: 1 };
const hero = { id: 'kid', team: 'heroes', ...body, look: LOOK };
const dummy = { id: 'dummy', team: 'badGuys', ...body, look: BAD, dummy: true };
const brute = { id: 'brute', team: 'badGuys', ...body, look: BAD };

const total = (snap) => snap.shelves.reduce((n, s) => n + s.donuts.length, 0)
  + snap.fighters.filter((f) => f.carrying).length + snap.donuts.length;

/** Steps the match, checking every tick that no donut was made or lost. */
function run(m, n, inputs = () => ({})) {
  let snap = snapshot(m);
  for (let i = 0; i < n; i++) {
    tick(m, inputs(snap, i));
    snap = snapshot(m);
    assert.equal(total(snap), 2 * DONUTS_PER_SHELF, `donut total changed on tick ${snap.tick}`);
  }
  return snap;
}

const once = (input, id = 'kid') => (_, i) => (i === 0 ? { [id]: { target: null, punch: false, kick: false, ...input } } : {});
const me = (snap, id = 'kid') => snap.fighters.find((f) => f.id === id);
const near = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;

{
  const m = createMatch([hero]);
  const start = me(snapshot(m)).x;
  let snap = run(m, 5, once({ target: { x: -2, y: 0 } }));
  assert.equal(me(snap).facing, 1, 'walking right faces right');
  assert.ok(me(snap).x > start, 'it is on its way');
  snap = run(m, 240);
  assert.ok(near(me(snap).x, -2) && me(snap).y === 0 && me(snap).onGround, 'a ground tap walks there');
  assert.equal(me(snap).move, 'idle', 'and stops');
  snap = run(m, 5, once({ target: { x: -6, y: 0 } }));
  assert.equal(me(snap).facing, -1, 'walking left faces left');
}

{
  const m = createMatch([hero]);
  run(m, 300, once({ target: { x: -1.9, y: 0 } }));
  let peak = 0;
  run(m, 120, (s, i) => { peak = Math.max(peak, me(s).y); return once({ target: { x: -1.9, y: 0.9 } })(s, i); });
  const snap = snapshot(m);
  assert.ok(peak > 1, `a tap just above the head jumps (peak ${peak.toFixed(2)})`);
  assert.ok(near(me(snap).x, -1.9) && me(snap).y === 0, 'and lands back where it was');
  let peak2 = 0;
  run(m, 120, (s, i) => {
    peak2 = Math.max(peak2, me(s).y);
    if (i === 0) return { kid: { target: { x: -1.9, y: 0.9 }, punch: false, kick: false } };
    return i === 15 ? { kid: { target: { x: -1.9, y: me(s).y + 1 }, punch: false, kick: false } } : {};
  });
  assert.ok(peak2 > peak + 0.5, `a tap higher in the air is the mid-air jump (${peak2.toFixed(2)} > ${peak.toFixed(2)})`);
}

{
  const m = createMatch([hero]);
  const p4 = STAGE.platforms[4], p1 = STAGE.platforms[1];
  let snap = run(m, 300, once({ target: { x: -3.4, y: p4.y + 0.2 } }));
  assert.ok(near(me(snap).x, -3.4) && me(snap).y === p4.y && me(snap).onGround, 'an upper ledge tap gets there by jumping');
  snap = run(m, 300, once({ target: { x: -7, y: p1.y + 0.2 } }));
  assert.ok(near(me(snap).x, -7) && me(snap).y === p1.y, 'and on to the next ledge, jump to jump');
  snap = run(m, 300, once({ target: { x: -2, y: 0 } }));
  assert.ok(near(me(snap).x, -2) && me(snap).y === 0, 'and back down to the ground by a drop route');
}

{
  const m = createMatch([hero]);
  const g = STAGE.platforms[0];
  let low = Infinity;
  const snap = run(m, 300, (s, i) => { low = Math.min(low, me(s).y); return once({ target: { x: -14, y: 0 } })(s, i); });
  assert.ok(near(me(snap).x, g.x0, 0.06) && me(snap).x > g.x0 && me(snap).onGround, 'a tap past the end stops at the ledge');
  assert.equal(low, 0, 'it never stepped off');
}

const reachDummy = (m) => run(m, 300, once({ target: { thing: 'fighter', id: 'dummy' } }));
function hitOnce(button) {
  const m = createMatch([hero, dummy]);
  let snap = reachDummy(m);
  assert.equal(me(snap).facing, 1, 'arriving at a tapped fighter ends facing it');
  const x0 = me(snap, 'dummy').x;
  let launch = null;
  snap = run(m, 120, (s, i) => {
    const d = me(s, 'dummy');
    if (!launch && d.percent > 0) launch = { vx: d.vx, vy: d.vy, move: d.move };
    return once({ [button]: true })(s, i);
  });
  return { launch, dist: me(snap, 'dummy').x - x0, snap };
}

{
  const punch = hitOnce('punch'), kick = hitOnce('kick');
  assert.ok(punch.launch, 'a punch in range hits the dummy');
  assert.equal(punch.launch.move, 'launched', 'and launches it');
  assert.ok(punch.launch.vx > 0 && punch.launch.vy > 0, 'away from the puncher and up');
  assert.ok(kick.launch, 'a kick in range hits the dummy');
  assert.ok(kick.dist > punch.dist, `a kick sends it further (${kick.dist.toFixed(2)} > ${punch.dist.toFixed(2)})`);
  const angle = (l) => Math.atan2(l.vy, l.vx);
  assert.ok(angle(kick.launch) < angle(punch.launch), 'and flatter');
}

{
  const m = createMatch([hero, dummy]);
  reachDummy(m);
  const speeds = [];
  let last = 0;
  run(m, 900, (s, i) => {
    const d = me(s, 'dummy');
    if (d.percent > last) speeds.push(Math.hypot(d.vx, d.vy));
    last = d.percent;
    return { kid: { target: i === 0 ? { thing: 'fighter', id: 'dummy' } : null, punch: i % 40 === 0, kick: false } };
  });
  assert.ok(speeds.length >= 4, `the dummy was hit again and again (${speeds.length})`);
  for (let k = 1; k < 4; k++) assert.ok(speeds[k] > speeds[k - 1], `knockback grows with percent (${speeds.map((v) => v.toFixed(2))})`);
}

{
  const { snap: hit, launch } = hitOnce('punch');
  assert.ok(launch && !me(hit, 'dummy').carrying, 'a hit knocks the carried donut loose');
  assert.equal(hit.donuts.length, 1, 'it is a loose donut on the stage');
  const m = createMatch([hero, dummy]);
  reachDummy(m);
  let snap = run(m, 120, once({ punch: true }));
  const [d] = snap.donuts;
  snap = run(m, 120);
  assert.deepEqual(snap.donuts[0], d, 'a dropped donut stays where it landed');
  snap = run(m, 400, once({ target: { thing: 'donut', id: d.id } }));
  assert.equal(snap.donuts.length, 0, 'tapping it picks it up');
  assert.deepEqual(me(snap).carrying, d.look, 'into the bag, looking the same');
}

const shelfCount = (snap, team) => snap.shelves.find((s) => s.team === team).donuts.length;

{
  const m = createMatch([hero]);
  let snap = run(m, 400, once({ target: { thing: 'shelf', team: 'badGuys' } }));
  const wall = STAGE.bricks[0];
  assert.ok(near(me(snap).x, wall.x - hero.width / 2, 0.01) && me(snap).onGround, 'a three-high wall stops a fighter heading through it');
  assert.ok(me(snap).x > STAGE.bricks[3].x + BRICK, 'after hopping the one-high wall on the way');
  snap = run(m, 60);
  assert.ok(near(me(snap).x, wall.x - hero.width / 2, 0.01), 'and it stays stopped');
  const before = [shelfCount(snap, 'heroes'), shelfCount(snap, 'badGuys')];
  run(m, 300, once({ target: { x: 7, y: 1.5 } }));
  snap = run(m, 300, once({ target: { thing: 'shelf', team: 'badGuys' } }));
  assert.ok(me(snap).carrying, 'over the ledge and down: the grab fills the bag');
  assert.equal(shelfCount(snap, 'badGuys'), before[1] - 1, 'from the enemy shelf');
  run(m, 300, once({ target: { x: 7, y: 1.5 } }));
  snap = run(m, 900, once({ target: { thing: 'shelf', team: 'heroes' } }));
  assert.ok(!me(snap).carrying, 'home again, the bag is empty');
  assert.equal(shelfCount(snap, 'heroes'), before[0] + 1, 'banked on our shelf');
}

{
  const m = createMatch([hero, brute]);
  run(m, 300, once({ target: { x: -14, y: 0 } }));
  run(m, 300, once({ target: { x: 7, y: 1.5 } }, 'brute'));
  const goal = me(snapshot(m)).target;
  let out = null;
  run(m, 1200, (s, i) => {
    const k = me(s);
    if (!out && k.invincible) out = k;
    return { brute: { target: i === 0 ? { thing: 'fighter', id: 'kid' } : null, punch: i % 30 === 0, kick: false } };
  });
  const r = STAGE.ringOut;
  assert.ok(out, 'the kid was rung out');
  assert.ok(out.x >= r.x0 && out.x <= r.x1 && out.y >= r.y, 'back in play on the same tick');
  assert.equal(out.percent, 0, 'percent reset');
  assert.deepEqual(out.target, goal, 'still heading where it was going');
}

{
  const m = createMatch([hero]);
  run(m, 600, once({ target: { thing: 'brick', id: 'b0' } }));
  let snap = run(m, 40, once({ punch: true }));
  assert.equal(me(snap).facing, 1, 'arriving at a brick ends facing it');
  const b1 = snap.bricks.find((b) => b.id === 'b1');
  assert.equal(b1.hits, b1.maxHits - 1, 'a punch takes a hit off a brick');
  snap = run(m, 40, once({ kick: true }));
  assert.ok(!snap.bricks.some((b) => b.id === 'b0'), 'a kick breaks the bottom brick');
  snap = run(m, 60);
  const col = snap.bricks.filter((b) => b.x === STAGE.bricks[0].x).sort((a, b) => a.y - b.y);
  assert.deepEqual(col.map((b) => [b.id, b.y, b.hits]), [['b1', 0, 1], ['b2', BRICK, 2]], 'the bricks above fell straight down and stayed whole');
}

{
  const play = () => {
    const m = createMatch([hero, dummy]);
    reachDummy(m);
    return run(m, 200, (_, i) => ({ kid: { target: null, punch: i % 25 === 0, kick: i % 60 === 7 } }));
  };
  assert.deepEqual(play(), play(), 'the same inputs give the same match');
}

console.log('sim ok');
