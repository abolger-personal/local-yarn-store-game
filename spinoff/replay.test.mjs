// The refactor's safety net (0.0.9, splitting sim.js into world, walk, combat, build and the donut game): seeded matches with
// CPU players on both teams and a kid mashing every input, every snapshot hashed. Moving code must not change a tick.
// A change meant to change play updates HASHES (run with REPLAY=print to see the new ones).
import assert from 'node:assert/strict';
import { createMatch, snapshot, tick } from './sim.js';
import { createCpu } from './cpu.js';
import { rng } from './generate.js';
import { STAGES, TUTORIAL, levelOf, matchOptions } from './levels.js';

const body = { height: 0.9, width: 0.45, reach: 0.38 };
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const BAD = { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true };
const hero = (id, extra = {}) => ({ id, team: 'heroes', ...body, look: LOOK, ...extra });
const bad = (id) => ({ id, team: 'badGuys', ...body, look: BAD });

/** A kid pressing everything, seeded: taps on the floor and at things, every button, the build round's buttons. */
function masher(id, seed) {
  const r = rng(seed), pick = (list) => list[Math.floor(r() * list.length)];
  let charging = false;
  return (snap) => {
    const me = snap.fighters.find((f) => f.id === id), foes = snap.fighters.filter((f) => f.team !== me?.team);
    const input = { target: null, punch: false, kick: false };
    if (snap.phase === 'build') return Object.assign(input, { drop: r() < 0.05, ready: snap.tick > 300, go: snap.tick > 420 }, r() < 0.04 && { target: { x: r() * 8 - 9, z: r() * 4 - 2, y: 0 } });
    const roll = r();
    if (roll < 0.03) input.target = { x: r() * 18 - 9, z: r() * 4 - 2, y: 0 };
    else if (roll < 0.05) input.target = pick([{ thing: 'shelf', team: 'badGuys' }, { thing: 'shelf', team: 'heroes' }, ...foes.map((f) => ({ thing: 'fighter', id: f.id })), ...snap.donuts.map((d) => ({ thing: 'donut', id: d.id }))]);
    else if (roll < 0.09) input.punch = true;
    else if (roll < 0.12) input.kick = true;
    else if (roll < 0.13) input.sweep = true;
    else if (roll < 0.14) { charging = !charging; input.charge = charging; if (!charging) input.shot = r(); }
    else if (roll < 0.145) input.throw = r();
    if (me?.power >= 1 && foes.length && r() < 0.1) input.power = { kind: 'toy', on: pick(foes).id };
    return input;
  };
}

/** A hero sent at the bad guys' shelf, kicking whatever is in the way, and home again with what it grabs. */
const raider = (id) => (snap) => {
  const me = snap.fighters.find((f) => f.id === id);
  if (snap.phase === 'build') return { target: null, punch: false, kick: false, ready: true, go: snap.tick > 200 };
  return { target: snap.tick % 120 === 0 ? { thing: 'shelf', team: me?.carrying ? 'heroes' : 'badGuys' } : null, punch: false, kick: snap.tick % 25 === 0 };
};

/** Walks up to `foe` and alternates punches and kicks: the knockback grows till it rings out. */
const batterer = (id, foe) => (snap) => ({ target: snap.tick % 60 === 0 ? { thing: 'fighter', id: foe } : null, punch: snap.tick % 30 === 0, kick: snap.tick % 30 === 15 });

/** `ticks` of a match; returns an FNV-1a hash of every snapshot. */
function replay(entrants, stage, opts, players, ticks) {
  const m = createMatch(entrants, stage, opts);
  let h = 0x811c9dc5;
  for (let i = 0; i < ticks; i++) {
    const snap = snapshot(m), json = JSON.stringify(snap);
    for (let k = 0; k < json.length; k++) h = Math.imul(h ^ json.charCodeAt(k), 0x01000193) >>> 0;
    tick(m, Object.fromEntries(players.map(([id, input]) => [id, input(snap)])));
  }
  return h.toString(16);
}

const cpu = (id, level) => { const c = createCpu(id, level); return [id, (snap) => c.input(snap)]; };
const level = (n) => levelOf('breakfast', n);

const RUNS = {
  // the build round, then raids through the bad guys' wall: piles, drops, ready and go, bricks broken, steals
  build: () => replay([hero('kid'), hero('h2'), bad('b1')], level(2).stage, matchOptions(level(2)),
    [['kid', masher('kid', 1)], ['h2', raider('h2')], cpu('b1', 2)], 4800),
  // the training dummy battered till it's knocked off the stage, again and again: ring-outs and respawns
  dummy: () => replay([hero('kid'), { ...bad('dummy'), dummy: true }], TUTORIAL.stage, {}, [['kid', batterer('kid', 'dummy')]], 3600),
  // the chase on the generated level: five bad guys, a sword's shots, the Greathammer, toys
  chase: () => replay([hero('kid', { hands: 'sword', trick: 'fireball' }), hero('h2', { hands: 'hammer' }), ...[1, 2, 3, 4, 5].map((i) => bad(`b${i}`))],
    level(5).stage, matchOptions(level(5)), [['kid', masher('kid', 2)], ['h2', masher('h2', 3)], ...[1, 2, 3, 4, 5].map((i) => cpu(`b${i}`, 5))], 3600),
  // cake: trampolines and taller everything
  cake: () => replay([hero('kid'), bad('b1'), bad('b2')], STAGES.cake.stage, {},
    [['kid', masher('kid', 4)], cpu('b1', 4), cpu('b2', 4)], 2400),
};

const HASHES = { build: '75f74082', dummy: '5c77020e', chase: '490489b8', cake: '4ce62f19' };

for (const [name, run] of Object.entries(RUNS)) {
  const got = run();
  if (process.env.REPLAY === 'print') console.log(`${name}: '${got}'`);
  else assert.equal(got, HASHES[name], `the ${name} replay played differently`);
}
console.log('replay ok');
