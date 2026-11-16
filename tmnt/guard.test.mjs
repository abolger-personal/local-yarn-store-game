import assert from 'node:assert/strict';
import { MATCH } from '../spinoff/combat.js';
import { TICK_HZ } from '../spinoff/match.js';
import { SIM } from '../spinoff/sim.js';
import { BAND, forSim, generateLevel } from './generate.js';
import { GUARD, createGuard, guardTick } from './guard.js';

// REUSE-SPEC.md §Level 3: a post on the ground after every structure, none in levels 1 and 2
const level = generateLevel(7, 3), ground = level.floors[0];
assert.equal(generateLevel(7, 2).guards.length, 0);
assert.equal(level.guards.length, level.spans.length);
level.guards.forEach((p, i) => assert.ok(p.x > level.spans[i].x1 && p.x < (level.spans[i + 1]?.x0 ?? ground.x1), `post ${i} stands between structures`));

const body = (id, team) => ({ id, team, height: 0.86, width: 0.3, reach: 0.3, look: { dough: '#e8c38e', frosting: '#1fd18b', stripe: false }, hands: 'gloves' });
const post = level.guards[0], guard = createGuard('sock0', post);
const s = SIM.createMatch([body('me', 'heroes'), body('sock0', 'badGuys')], /** @type {any} */ (forSim(level)), { match: { ...MATCH, badGuyPace: GUARD.pace } });
const me = s.fighters[0], sock = s.fighters[1], SAD_Z = BAND.z0 - 1.3;
Object.assign(sock, { x: post.x, z: post.z });
let knocked = 0;
const run = (ticks, mine = () => null) => {
  for (let i = 0; i < ticks; i++) {
    s.t0 = s.tick;
    SIM.tick(s, { me: mine(i), sock0: guard.input(SIM.snapshot(s)) });
    knocked = Math.max(knocked, me.percent);
    if (guardTick(s, [guard], SAD_Z).length) return i;
  }
  return -1;
};

// far away, the soldier keeps its post
Object.assign(me, { x: post.x - 12, z: 0 });
run(3 * TICK_HZ);
assert.ok(Math.hypot(sock.x - post.x, sock.z - post.z) < 0.1, 'with nobody near, it stays at its post');

// a hero who comes near is walked up to and punched; the hero is knocked, never out
Object.assign(me, { x: post.x - 2, z: post.z });
run(12 * TICK_HZ);
assert.ok(knocked > 0, 'it punches a hero who stands near its post');
assert.equal(me.out, 0);

// the hero gone, it goes home
Object.assign(me, { x: post.x - 12, z: 0, percent: 0 });
run(20 * TICK_HZ);
assert.ok(Math.hypot(sock.x - post.x, sock.z - post.z) <= GUARD.home + 0.1, `it goes back to its post (${Math.hypot(sock.x - post.x, sock.z - post.z).toFixed(2)} off)`);

// combat is the donut fighters': kicked toward the back fence until a knock carries it there, it is over the fence where
// it went out, for its time out, then back at its post
Object.assign(sock, { x: post.x, z: -1.2, percent: 0 });
Object.assign(me, { x: post.x, z: -0.8, facing: -Math.PI / 2, percent: 0 });
assert.equal(run(10), -1, 'standing near the fence, unhit, it stays in play');
const at = run(5 * TICK_HZ, (i) => ({ target: null, punch: false, kick: i === 0 }));
assert.ok(at >= 0, 'a kick that knocks it into the back fence sends it over');
assert.ok(sock.out > 2 * TICK_HZ * 60 - 5 && sock.z === SAD_Z && guard.away, 'it stands behind the back fence, out of play for two minutes');
assert.ok(Math.abs(sock.x - post.x) < 1, `behind the fence where it went out, not at the level's end (${(sock.x - post.x).toFixed(1)} along)`);
sock.out = 2;
run(3);
assert.ok(!guard.away && Math.hypot(sock.x - post.x, sock.z - post.z) < 0.05, `its time out over, it is back at its post (away ${guard.away}, out ${sock.out}, at ${sock.x.toFixed(2)}, ${sock.z.toFixed(2)})`);

// knocked off the front, the donut fighters' ring-out: still behind the back fence there, not at its shelf past the gate
Object.assign(me, { x: post.x - 12, z: 0 });
Object.assign(sock, { z: 3.6, onGround: false });
assert.ok(run(5) >= 0 && sock.z === SAD_Z && Math.abs(sock.x - post.x) < 0.5 && sock.out > 100 * TICK_HZ, 'rung out off the front, it stands behind the back fence where it left');

// a hero knocked off the front is back at the start, as in the donut fighters
Object.assign(me, { x: post.x, z: 3.6, onGround: false });
run(3);
assert.ok(me.out > 0 && me.x < 2, 'a hero rung out is back at the start');

// a hero pinned at the back fence gets a punch's interval on their feet after every knock, to run (seen 2026-11-15:
// launched out of the soldier's sight and back, they were punched again a sixth of a second after getting up)
{
  const g = createGuard('sock0', post), p = SIM.createMatch([body('me', 'heroes'), body('sock0', 'badGuys')], /** @type {any} */ (forSim(level)), { match: { ...MATCH, badGuyPace: GUARD.pace } });
  const [kid, soldier] = p.fighters;
  Object.assign(kid, { x: post.x, z: BAND.z0 + 0.2 });
  Object.assign(soldier, { x: post.x, z: BAND.z0 + 0.8 });
  let up = 0, knocks = 0;
  for (let i = 0; i < 30 * TICK_HZ; i++) {
    p.t0 = p.tick;
    SIM.tick(p, { me: null, sock0: g.input(SIM.snapshot(p)) });
    const down = kid.stun > 0 || !kid.onGround || Boolean(kid.pending);
    if (down && up > 0 && knocks++) assert.ok(up >= GUARD.every, `knock ${knocks}: only ${up} ticks up before the next punch`);
    up = down ? 0 : up + 1;
  }
  assert.ok(knocks > 10, `it kept punching the hero who stayed (${knocks})`);
}
console.log('guard ok');
