// The level 2 raider in the real sim, played through the same inputs a tablet sends (REUSE-SPEC.md §Bad guys).
import assert from 'node:assert/strict';
import { BRICK, ROUND_SECONDS, TICK_HZ } from './match.js';
import { levelOf, matchOptions } from './levels.js';
import { AIR_SPEED, GUARD_REACH, WALK_SPEED, createMatch, snapshot, tick } from './sim.js';
import { ATTACK_TICKS, REACT_TICKS, createCpu, modeOf } from './cpu.js';

const level = /** @type {import('./levels.js').Level} */ (levelOf('breakfast', 2));
const body = { height: 0.9, width: 0.45, reach: 0.38 };
const kid = { id: 'kid', team: 'heroes', ...body, look: { dough: '#e8c48a', frosting: '#ff3b7f', stripe: false } };
// the bad guy's real size (play.js's lion in its cape): a narrower one hid a hop it couldn't make
const raider = { id: 'cpu1', team: 'badGuys', ...body, width: 0.75, height: 0.97, look: { dough: '#241a1d', frosting: '#7b2fbf', stripe: true } };

// the raider's choices, at full speed so they come quickly; level 2's slow pace has its own check below
const fullPace = { ...matchOptions(level), match: { ...level.match, badGuyPace: 1 } };

/** Plays `seconds` of level 2 (build round skipped) with the CPU's inputs; `kidInput(snap)` drives the kid; `watch` sees each snapshot. */
function play(stage, seconds, watch, kidInput = () => null, opts = fullPace) {
  const m = createMatch([kid, raider], stage, opts), cpu = createCpu('cpu1');
  tick(m, { kid: { target: null, punch: false, kick: false, go: true } });
  let snap = snapshot(m);
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const k = kidInput(snap);
    tick(m, { cpu1: cpu.input(snap), ...(k && { kid: k }) });
    snap = snapshot(m);
    if (watch(snap) === true) return snap;
  }
  return snap;
}

const steals = (s) => s.donutEvents.some((e) => e.fighter === 'cpu1' && e.kind === 'steal');
const banks = (s) => s.donutEvents.some((e) => e.fighter === 'cpu1' && e.kind === 'bank');
const me = (s) => s.fighters.find((f) => f.id === 'cpu1');

{
  let stole = -1, banked = -1, guarding = 0, kicks = 0, last = -Infinity, closest = Infinity, moved = -1;
  play(level.stage, 30, (s) => {
    if (moved < 0 && me(s).move === 'walk') moved = s.tick;
    if (stole < 0 && steals(s)) stole = s.tick;
    if (banked < 0 && banks(s)) banked = s.tick;
    const f = me(s), shelf = s.shelves.find((x) => x.team === 'badGuys');
    if (banked >= 0 && f.onGround && Math.abs(f.y - shelf.y) < 0.01 && f.z - shelf.z < GUARD_REACH && Math.abs(f.x - shelf.x) < 0.6) guarding++;
    if (f.move === 'kick' && s.tick - last > 1) { kicks++; closest = Math.min(closest, s.tick - last); last = s.tick; }
  });
  assert.ok(stole > 0 && banked > stole, `on an open level the raider grabs a donut and runs home to bank it (stole ${stole}, banked ${banked})`);
  assert.ok(guarding > 10 * TICK_HZ, `then, its shelf holding a hero donut, it stands guard there (${(guarding / TICK_HZ).toFixed(1)} s)`);
  assert.equal(kicks, 0, 'with nothing in its way it kicks nothing');
  assert.ok(moved >= REACT_TICKS, `it gives the kids half a second before it sets off (${moved} ticks)`);
}

{
  // the kids' wall plugs their gap, two high: the raider kicks through it, a kick at a time
  const plug = [0.8, 1.2, 1.6].flatMap((z) => [0, BRICK].map((y) => ({ team: /** @type {const} */ ('heroes'), x: -6, z, y, hits: 2 })));
  let kicked = 0, hitKid = 0, gap = Infinity, last = -Infinity;
  const end = play({ ...level.stage, bricks: [...level.stage.bricks, ...plug] }, 40, (s) => {
    if (s.hits.some((h) => h.on === 'fighter' && h.target === 'kid')) hitKid++;
    const k = s.hits.find((h) => h.on === 'brick' && s.fighters.find((f) => f.id === 'cpu1')?.move === 'kick');
    if (k) { kicked++; gap = Math.min(gap, s.tick - last); last = s.tick; }
    return steals(s);
  }, (s) => (s.tick === 2 ? { target: { x: -6.6, z: 1.6 }, punch: false, kick: false } : null));
  assert.ok(steals(end), 'the raider breaks through the kids\' wall and steals');
  assert.ok(kicked >= 1 && end.bricks.filter((b) => b.team === 'heroes').length < plug.length, `kicking their blocks (${kicked} kicks)`);
  assert.ok(gap >= ATTACK_TICKS, `no more than one kick every 0.8 s (closest ${gap} ticks)`);
  assert.equal(hitKid, 0, 'and on level 2 it never hits the kid standing at the wall');
}

{
  const shelf = (donuts) => ({ team: 'badGuys', x: 7.5, y: 1.1, z: -1.7, donuts });
  const f = /** @type {any} */ ({ id: 'cpu1', team: 'badGuys', carrying: null });
  const bad = { dough: '#241a1d', frosting: '#7b2fbf', stripe: true }, hero = { dough: '#e8c48a', frosting: '#ff3b7f', stripe: false };
  const snapWith = (donuts) => /** @type {any} */ ({ shelves: [shelf(donuts)] });
  assert.equal(modeOf(snapWith([bad, bad]), f), 'raid', 'it raids while its shelf holds no hero donuts');
  assert.equal(modeOf(snapWith([bad, hero]), f), 'defend', 'and defends once it holds one');
  assert.equal(modeOf(snapWith([bad]), { ...f, carrying: hero }), 'home', 'carrying, it runs home');

  // REUSE-SPEC.md §Scoring: rung out, it waits with everyone else, then sets off again (the sim ignores taps while out)
  const cpu = createCpu('cpu1'), sent = [];
  for (let t = 0; t < 4 * REACT_TICKS; t++) {
    const respawn = t < 2 * REACT_TICKS ? 1 : 0;
    const input = cpu.input(/** @type {any} */ ({ tick: t, phase: 'play', over: false, bricks: [], shelves: [shelf([bad])], fighters: [{ ...f, move: 'idle', respawn }] }));
    if (input.target) sent.push([t, respawn]);
  }
  assert.deepEqual(sent.map(([, r]) => r), [0], `it aims once, after the wait (${JSON.stringify(sent)})`);
}

{
  // level 2 is a tutorial: the raider walks at a fifth of a kid's speed, slow enough to catch, and still gets home in a round
  let fastest = 0, flew = 0, stole = -1, banked = -1;
  play(level.stage, ROUND_SECONDS, (s) => {
    const f = me(s);
    if (f.onGround) fastest = Math.max(fastest, Math.hypot(f.vx, f.vz));
    else if (f.move !== 'hurt' && f.move !== 'launched') flew = Math.max(flew, Math.hypot(f.vx, f.vz));
    if (stole < 0 && steals(s)) stole = s.tick;
    if (banked < 0 && banks(s)) banked = s.tick;
  }, () => null, matchOptions(level));
  assert.ok(fastest <= 0.2 * WALK_SPEED + 1e-9, `the raider never walks faster than a fifth of a kid (${fastest.toFixed(2)})`);
  assert.ok(flew > 0 && flew <= 0.4 * AIR_SPEED + 1e-9, `and its hops are slow too, not a dodge (${flew.toFixed(2)} in the air)`);
  assert.ok(stole > 0 && banked > stole, `and still steals and banks within the round (stole ${stole}, banked ${banked})`);
}

console.log('cpu ok');
