// The Greathammer's throw in the sim (REUSE-SPEC.md §Costumes, The Greathammer): node spinoff/hammer.test.mjs
import assert from 'node:assert/strict';
import { TICK_HZ, groundOf } from './match.js';
import { TUTORIAL } from './levels.js';
import { HAMMER, aimOf, hammerPath, handOf } from './hammer.js';
import { MOVES, createMatch, snapshot, tick } from './sim.js';
import { readInput } from './multiplayer.js';

const STAGE = { ...TUTORIAL.stage, bricks: [] };
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const body = { height: 0.9, width: 0.45, reach: 0.38 };
const kid = { id: 'kid', team: 'heroes', ...body, look: LOOK, hands: 'hammer' };
const brute = { id: 'brute', team: 'badGuys', ...body, look: { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true } };
const say = (input = {}) => ({ kid: { target: null, punch: false, kick: false, ...input } });
const fighter = (m, id = 'kid') => m.fighters.find((f) => f.id === id);
const match = (who = [kid]) => {
  const m = createMatch(who, STAGE);
  Object.assign(fighter(m), { x: -4.8, z: 0, facing: 0 });
  return m;
};

assert.equal(MOVES.hammer.damage, MOVES.kick.damage, 'a kick\'s damage');
assert.deepEqual(MOVES.hammer.kb, MOVES.kick.kb, 'and a kick\'s knockback');
assert.deepEqual([0.2, 0.4, 1.45, 2.5, 4].map((t) => aimOf(t) && Math.round(aimOf(t) * 100) / 100), [null, 0, 0.5, 1, 1], 'the path shows at 0.4 s and is biggest at 2.5 s');

// The lap: the path, at a steady speed, out on the camera's side, back in the hand
for (const k of [0, 1]) {
  const m = match(), from = handOf(fighter(m), body.height), { T } = hammerPath(from, k, 0, STAGE);
  const a = (HAMMER.short + (HAMMER.long - HAMMER.short) * k) / 2, b = HAMMER.wide * a;
  const ramanujan = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  assert.ok(Math.abs(T * HAMMER.speed - ramanujan) < 0.01 * ramanujan, `k ${k}: one lap of the oval at ${HAMMER.speed} a second (${T.toFixed(2)} s)`);
  tick(m, say({ throw: k }));
  let was = null, far = 0, near = 0;
  for (let i = 1; snapshot(m).hammers.length; i++) {
    const [h] = snapshot(m).hammers, p = hammerPath(from, k, i / TICK_HZ, STAGE);
    assert.ok(Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) < 1e-9, `k ${k}: on the path at tick ${i}`);
    // the small oval's ends turn tighter than a tick's step, so its chords there are shorter than the arc
    if (was) assert.ok(Math.abs(Math.hypot(h.x - was.x, h.z - was.z) * TICK_HZ - HAMMER.speed) < (k ? 0.1 : HAMMER.speed), `k ${k}: steady speed at tick ${i}`);
    if (i / TICK_HZ < T / 2) near = Math.max(near, h.z - from.z);
    far = Math.max(far, h.x - from.x);
    was = h;
    assert.ok(i / TICK_HZ < T + 1e-9, `k ${k}: back by the end of its lap`);
    tick(m, say());
  }
  assert.ok(Math.abs(far - 2 * a) < 0.05 && Math.abs(near - b) < 0.02, `k ${k}: ${2 * a} long, ${b} out toward the camera on the way out (${far.toFixed(2)}, ${near.toFixed(2)})`);
  assert.ok(Math.hypot(was.x - from.x, was.z - from.z) < HAMMER.speed / TICK_HZ + 1e-9, `k ${k}: its last spot is at the hand`);
}

// It ends in the hand even if you've moved
{
  const m = match(), f = fighter(m);
  tick(m, say({ throw: 0.5 }));
  let last = null;
  for (let i = 0; m.hammers.length; i++) {
    f.z = 0.8 * Math.min(1, i / 30);
    last = { ...m.hammers[0] };
    tick(m, say());
  }
  assert.ok(Math.hypot(last.x - f.x, last.z - f.z) < 2 * HAMMER.speed / TICK_HZ, `its last spot is at the moved hand (${last.z.toFixed(2)} for ${f.z})`);
}

// A hit sends it home: the bad guy it meets on the way back is knocked the way it flew, not the way the thrower faces
{
  const m = match([kid, brute]), o = fighter(m, 'brute');
  Object.assign(o, { x: -4.8 + 1, z: -0.35 });
  tick(m, say({ throw: 0 }));
  let hit = null, was = null;
  for (let i = 0; i < 2 * TICK_HZ && !hit; i++) {
    was = { ...m.hammers[0] };
    tick(m, say());
    hit = snapshot(m).hits.find((h) => h.move === 'hammer');
  }
  assert.ok(hit && hit.on === 'fighter' && hit.target === 'brute', 'the hammer hits the bad guy in its path');
  assert.equal(snapshot(m).hammers.length, 0, 'and is back in the hand at once');
  assert.ok(o.percent === MOVES.kick.damage && o.pending.vx < 0, `knocked back along its flight, -x on the way home, though the thrower faces +x (${o.pending.vx.toFixed(2)})`);
  const along = Math.atan2(o.pending.vz, o.pending.vx) - Math.atan2(-was.z + hit.z, -was.x + hit.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(along), Math.cos(along))) < 0.3, 'pushed the way the hammer was flying');
}

// Bad-guy blocks take a hit too; the thrower's own team's don't
for (const team of ['badGuys', 'heroes']) {
  const m = createMatch([kid], { ...STAGE, bricks: [{ team, x: -4.8 + 0.8, z: 0.15, y: 0, hits: 3 }] });
  Object.assign(fighter(m), { x: -4.8, z: 0, facing: 0 });
  tick(m, say({ throw: 0 }));
  let hits = 0;
  for (let i = 0; i < 2 * TICK_HZ && m.hammers.length; i++) {
    tick(m, say());
    hits += snapshot(m).hits.length;
  }
  assert.equal(hits, team === 'badGuys' ? 1 : 0, `a ${team} block in its path is ${team === 'badGuys' ? '' : 'not '}hit`);
  if (team === 'badGuys') assert.equal(m.bricks[0].hits, 3 - MOVES.kick.brick, 'a kick\'s worth');
}

// Ignored: no hammer, the hammer already out, nothing to throw; the size is clamped
{
  const gloved = createMatch([{ ...kid, hands: 'gloves' }], STAGE), plain = createMatch([{ ...kid, hands: undefined }], STAGE);
  for (const m of [gloved, plain]) tick(m, say({ throw: 0.5 }));
  assert.equal(gloved.hammers.length + plain.hammers.length, 0, 'gloves can\'t throw');
  for (const [k, want] of [[7, 1], [-3, 0], [0.4, 0.4], [NaN, null], [Infinity, null], ['1', null], [undefined, null]]) {
    const m = match();
    tick(m, say({ throw: /** @type {any} */ (k) }));
    assert.equal(m.hammers[0]?.k ?? null, want, `throw ${k} is ${want ?? 'ignored'}`);
  }
  const m = match();
  tick(m, say({ throw: 1 }));
  for (let i = 0; i < 10; i++) tick(m, say({ throw: 0 }));
  assert.ok(m.hammers.length === 1 && m.hammers[0].k === 1 && m.hammers[0].t > 10 / TICK_HZ, 'a throw while it\'s away is ignored');
  tick(m, say({ punch: true }));
  assert.equal(fighter(m).attack?.id, 'punch', 'while it\'s away the punch still works');
}

// Rung out mid-flight, it's back at once
{
  const m = match();
  tick(m, say({ throw: 1 }));
  tick(m, say());
  fighter(m).y = -5;
  tick(m, say());
  assert.ok(fighter(m).out > 0 && m.hammers.length === 0, 'a ring-out takes the hammer home');
}

// The oval stays inside the stage band, every way you face, every size, anywhere you stand
{
  const g = groundOf(STAGE);
  let worst = Infinity;
  for (let a = 0; a < 2 * Math.PI; a += Math.PI / 12) for (const k of [0, 0.5, 1]) for (const x of [g.x0, -4, 0, g.x1]) for (const z of [STAGE.backWall, 0, g.z1]) {
    const from = { x, y: 0.5, z, facing: a }, { T } = hammerPath(from, k, 0, STAGE);
    for (let t = 0; t <= T; t += T / 50) {
      const p = hammerPath(from, k, t, STAGE);
      worst = Math.min(worst, p.x - g.x0, g.x1 - p.x, p.z - STAGE.backWall, g.z1 - p.z);
    }
  }
  assert.ok(worst >= HAMMER.r - 1e-9, `inside the band by its head's radius (${worst.toFixed(3)})`);
}

assert.equal(readInput({ target: null, punch: false, kick: false, throw: 0.5 })?.throw, 0.5, 'a guest\'s throw reaches the host');
assert.equal(readInput({ target: null, punch: false, kick: false, throw: 'far' }), null, 'a junk throw is refused');
console.log('hammer ok');
