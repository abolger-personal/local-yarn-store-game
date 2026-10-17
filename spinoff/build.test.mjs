// The build round in the real sim, on level 2 (REUSE-SPEC.md §Forts): piles, ⬇️, the height limit, take-backs, 👍.
import assert from 'node:assert/strict';
import { BRICK, PILE_DX, ROUND_SECONDS } from './match.js';
import { TUTORIAL, levelOf, piecesEach } from './levels.js';
import { createMatch, snapshot, tick } from './sim.js';
import { HEIGHT_LIMIT, facedCell, fortGrid } from './build.js';

const { stage } = /** @type {import('./levels.js').Level} */ (levelOf('breakfast', 2));
const body = { height: 0.9, width: 0.45, reach: 0.38 };
const A = { id: 'A', team: 'heroes', ...body, look: { dough: '#e8c48a', frosting: '#ff3b7f', stripe: false } };
const B = { id: 'B', team: 'heroes', ...body, look: { dough: '#e8c48a', frosting: '#14c4e0', stripe: false } };
const IDLE = { target: null, punch: false, kick: false };
const who = (snap, id) => snap.fighters.find((f) => f.id === id);

/** Sends `input` as `id` once, then ticks until `done(snap)` (or fails after 10 s). */
function act(m, id, input, done = () => true) {
  tick(m, { [id]: { ...IDLE, ...input } });
  for (let i = 0; i < 600; i++) {
    const snap = snapshot(m);
    if (done(snap)) return snap;
    tick(m, {});
  }
  assert.fail(`${id} never finished ${JSON.stringify(input)}`);
}
const fetch = (m, id) => act(m, id, { target: { thing: 'pile', id } }, (s) => who(s, id).block !== null);

const m = createMatch([A, B], stage, { pieces: piecesEach(2) });
let snap = snapshot(m);
assert.equal(snap.phase, 'build', 'level 2 starts with the build round');
assert.equal(snap.secondsLeft, ROUND_SECONDS, 'with no clock running');
assert.deepEqual(snap.piles.map((p) => [p.owner, p.x - PILE_DX, p.z, p.count]), [['A', -5.2, 1.6, 4], ['B', -5.2, 0.8, 4]],
  'each hero has a pile of 4 beside their start spot');

act(m, 'A', { punch: true });
assert.ok(who(snapshot(m), 'A').move !== 'punch', 'no punching in the build round');

act(m, 'A', { target: { thing: 'pile', id: 'B' } }, (s) => who(s, 'A').move === 'idle');
assert.equal(snapshot(m).piles[1].count, 4, 'a hero can\'t take from a teammate\'s pile');

snap = fetch(m, 'A');
assert.equal(who(snap, 'A').block, A.look.frosting, 'tapping your pile fetches a block in your donut colour');
assert.equal(snap.piles[0].count, 3, 'and the pile is a block smaller');
act(m, 'A', { target: { x: -4, z: 1.4 } }, (s) => who(s, 'A').move === 'idle');
const cell = facedCell(fortGrid(stage, 'heroes', [], snapshot(m).piles), who(snapshot(m), 'A'));
assert.ok(cell?.ok, 'the cell in front of you can be built on');
snap = act(m, 'A', { drop: true });
const [first] = snap.bricks.filter((b) => b.team === 'heroes');
assert.deepEqual([first.x, first.y, first.z, first.icing], [cell.x, 0, cell.z, A.look.frosting], '⬇️ puts it on the faced cell, topped in your colour');
assert.equal(who(snap, 'A').block, null, 'out of your hands');

fetch(m, 'B');
act(m, 'B', { target: { thing: 'brick', id: first.id } }, (s) => who(s, 'B').move === 'idle');
snap = act(m, 'B', { drop: true });
const second = snap.bricks.find((b) => b.team === 'heroes' && b.icing === B.look.frosting);
assert.deepEqual([second.x, second.y, second.z], [first.x, BRICK, first.z], 'carrying, a tap on a block faces it, and ⬇️ stacks on top');

snap = act(m, 'A', { target: { thing: 'brick', id: first.id } }, (s) => who(s, 'A').move === 'idle' && !s.fullBag.length);
assert.ok(snap.bricks.some((b) => b.id === first.id) && who(snap, 'A').block === null, 'your block under a teammate\'s is stuck');
snap = act(m, 'A', { target: { thing: 'brick', id: second.id } }, (s) => who(s, 'A').move === 'idle' && !s.fullBag.length);
assert.ok(snap.bricks.some((b) => b.id === second.id) && who(snap, 'A').block === null, 'and a teammate\'s block on top is theirs to take back, not yours');
snap = act(m, 'B', { target: { thing: 'brick', id: second.id } }, (s) => who(s, 'B').block !== null);
assert.ok(!snap.bricks.some((b) => b.id === second.id), 'your own block on top comes back to your hands');
snap = act(m, 'A', { target: { thing: 'brick', id: first.id } }, (s) => who(s, 'A').block !== null);
assert.ok(!snap.bricks.some((b) => b.id === first.id), 'and then the one that was under it');

act(m, 'A', { drop: true });
for (let k = 1; k < HEIGHT_LIMIT; k++) {
  const top = snapshot(m).bricks.filter((b) => b.team === 'heroes').at(-1);
  fetch(m, 'A');
  act(m, 'A', { target: { thing: 'brick', id: top.id } }, (s) => who(s, 'A').move === 'idle');
  act(m, 'A', { drop: true });
}
const stack = snapshot(m).bricks.filter((b) => b.team === 'heroes');
assert.equal(stack.length, HEIGHT_LIMIT, `stacked ${HEIGHT_LIMIT} high`);
fetch(m, 'A');
act(m, 'A', { target: { thing: 'brick', id: stack.at(-1).id } }, (s) => who(s, 'A').move === 'idle');
snap = act(m, 'A', { drop: true });
assert.ok(snap.fullBag.some((e) => e.fighter === 'A'), 'at the height limit ⬇️ only gets a head-shake');
assert.equal(snap.bricks.filter((b) => b.team === 'heroes').length, HEIGHT_LIMIT, 'and puts nothing down');

act(m, 'B', { ready: true });
act(m, 'B', { ready: false });
act(m, 'A', { ready: true });
assert.deepEqual(snapshot(m).ready, ['A'], 'everyone sees who has 👍');
assert.equal(snapshot(m).phase, 'build', 'a 👍 taken back keeps everyone building');
snap = act(m, 'B', { ready: true });
assert.equal(snap.phase, 'play', 'every hero 👍: the match starts');
assert.ok(snap.piles.length === 0 && snap.fighters.every((f) => f.block === null), 'the piles and carried blocks go');
for (let i = 0; i < 60; i++) tick(m, {});
assert.ok(Math.abs(snapshot(m).secondsLeft - (snap.secondsLeft - 1)) < 1e-9 && snap.secondsLeft > ROUND_SECONDS - 0.1, 'and the clock starts then');

const held = createMatch([A, B], stage, { pieces: 4 });
assert.equal(act(held, 'A', { go: true }).phase, 'play', 'holding 👍 starts the round for everyone');
assert.equal(snapshot(createMatch([A], TUTORIAL.stage)).phase, 'play', 'level 1 has no build round');

// Up against the fence, the deck or the middle third, ⬇️ puts the block at your feet instead of a head-shake
{
  const grid = fortGrid(stage, 'heroes', [], createMatch([A, B], stage, { pieces: 4 }).piles), R = body.width / 2 + 0.01, { width } = body;
  for (const [what, f, at] of [
    ['the fence', { x: -5.6 + R, y: 0, z: -0.6, facing: Math.PI, width }, [-5.6, 0, -0.8]],
    ['the deck', { x: -7, y: 0, z: -0.8 + R, facing: -Math.PI / 2, width }, [-7.2, 0, -0.8]],
    ['the middle third', { x: -3.5, y: 0, z: -1.2, facing: 0, width }, [-3.6, 0, -1.2]],
  ]) {
    const c = facedCell(grid, f);
    assert.ok(c?.ok && [c.x, c.y, c.z].every((v, k) => Math.abs(v - at[k]) < 1e-9), `facing ${what} up close, the block goes at your feet (${JSON.stringify(c)})`);
  }
}

// Up on a stack as tall as they go, yours or a teammate's, a tap on the floor beyond gets you down and there
{
  const m2 = createMatch([A, B], stage, { pieces: 4 });
  const idle = (s, id) => who(s, id).move === 'idle';
  /** `id` puts a stack HEIGHT_LIMIT high in front of where it walks to; its top block. */
  const build = (id, at) => {
    let top = null;
    for (let k = 0; k < HEIGHT_LIMIT; k++) {
      fetch(m2, id);
      act(m2, id, { target: top ? { thing: 'brick', id: top.id } : at }, (s) => idle(s, id));
      top = act(m2, id, { drop: true }).bricks.at(-1);
    }
    assert.equal(top.y, BRICK * (HEIGHT_LIMIT - 1), `${id} stacked ${HEIGHT_LIMIT} high`);
    return top;
  };
  const mine = build('A', { x: -4, z: -0.8 }), theirs = build('B', { x: -4.4, z: 0.4 });
  for (const [top, whose] of [[mine, 'your own'], [theirs, 'a teammate\'s']]) {
    Object.assign(m2.fighters[0], { x: top.x + BRICK / 2, y: top.y + BRICK, z: top.z + BRICK / 2, onGround: true });
    const there = (s) => idle(s, 'A') && Math.hypot(who(s, 'A').x + 3.5, who(s, 'A').z - 1.2) < 0.03;
    assert.equal(who(act(m2, 'A', { target: { x: -3.5, z: 1.2 } }, there), 'A').y, 0, `standing on ${whose} stack, a floor tap walks off it and there`);
  }
}

// Plugging the gap in the yard's fence (playtest): however wide you are, carrying, a tap on your block faces it and ⬇️
// stacks on it, and the block you tapped stays down (it isn't fetched back), with no head-shake. A lion with a sword is this wide.
{
  const wide = { ...A, width: 0.86 }, m3 = createMatch([wide], stage, { pieces: 4 });
  const idle = (s) => who(s, 'A').move === 'idle', mine = () => snapshot(m3).bricks.filter((b) => b.team === 'heroes');
  const settle = () => { const shakes = []; for (let i = 0; i < 30; i++) { tick(m3, {}); shakes.push(...snapshot(m3).fullBag); } return shakes; };
  const place = (target) => { fetch(m3, 'A'); act(m3, 'A', { target }, idle); return [...act(m3, 'A', { drop: true }).fullBag, ...settle()]; };
  assert.deepEqual(place({ x: -5.8, z: 1.6 }), [], 'a wide fighter puts one down in front');
  const [first] = mine();
  assert.deepEqual(place({ thing: 'brick', id: first.id }), [], 'and, tapping it, stacks one on it with no head-shake');
  const [under, top] = mine();
  assert.deepEqual([under.id, top.x, top.y, top.z], [first.id, first.x, BRICK, first.z], 'on top of the tapped one, which stays down');
  assert.equal(who(snapshot(m3), 'A').block, null, 'hands empty');
}

console.log('build ok');
