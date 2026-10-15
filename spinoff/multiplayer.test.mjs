import assert from 'node:assert/strict';
import { newFighter } from './fighter.js';
import { LEVELS } from './levels.js';
import { ROUND_SECONDS, TICK_HZ } from './match.js';
import { EVENT_TICKS, HOST_GONE_SECONDS, SNAP_HZ, createGuest, createHost, readInput, readSnap, readStart, rosterOf } from './multiplayer.js';
import { createMatch, snapshot, tick } from './sim.js';

const THEMES = ['breakfast', 'cake'];
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const BODY = { height: 0.9, width: 0.45, reach: 0.38, look: LOOK };
const IDLE = { target: null, punch: false, kick: false };

/** Everything sent waits in a queue until `flush`; `drop` loses snapshots, `shuffle` delivers them out of order. */
function network() {
  const handlers = new Map(), queue = [];
  const net = { drop: () => false, shuffle: false, queue, snaps: [] };
  net.link = (me) => ({
    send(type, data, to) {
      if (type === 'snap') net.snaps.push(data);
      for (const id of to) {
        if (type === 'snap' && net.drop()) continue;
        const json = JSON.stringify(data);
        queue.push({ bytes: json.length, run: () => handlers.get(`${id}:${type}`)?.(JSON.parse(json), me) });
      }
    },
    on(type, fn) { handlers.set(`${me}:${type}`, fn); },
  });
  net.flush = () => {
    if (net.shuffle) queue.reverse();
    for (const m of queue.splice(0)) m.run();
  };
  return net;
}

function guestOf(net, id) {
  const seen = { gone: 0, again: 0 };
  const g = createGuest(net.link(id), id, THEMES, { gone: () => seen.gone++, again: () => seen.again++ });
  return Object.assign(g, { seen });
}

// --- trust boundaries ---------------------------------------------------------------------------
{
  assert.deepEqual(readInput({ target: { x: 1, z: 2 }, punch: true, kick: false }), { target: { x: 1, z: 2 }, punch: true, kick: false });
  assert.deepEqual(readInput({ ...IDLE, away: true }), { ...IDLE, away: true });
  for (const bad of [null, 'go', { target: null }, { ...IDLE, target: { x: 1e9, z: 0 } }, { ...IDLE, target: { x: Number.NaN, z: 0 } },
    { ...IDLE, target: { thing: 'shelf', team: 'everyone' } }, { ...IDLE, target: { thing: 'fighter', id: 'x'.repeat(500) } }, { ...IDLE, away: 'yes' }])
    assert.equal(readInput(bad), null, `a malformed input is ignored: ${JSON.stringify(bad)}`);

  const start = { theme: 'breakfast', stage: LEVELS[1].stage, roster: rosterOf('H', newFighter('owl'), new Map([['G1', newFighter('lion')]])), settings: { seconds: 90 } };
  const sent = JSON.parse(JSON.stringify(start));
  assert.ok(readStart(sent, 'G1', THEMES), 'a good start is taken');
  assert.equal(readStart(sent, 'G9', THEMES), null, 'a start without me in it is not mine');
  assert.equal(readStart({ ...sent, theme: 'lava' }, 'G1', THEMES), null, 'an unknown theme is refused');
  const twoGrounds = { ...sent.stage, floors: [...sent.stage.floors, sent.stage.floors[0]] };
  assert.equal(readStart({ ...sent, stage: twoGrounds }, 'G1', THEMES), null, 'a stage needs exactly one ground');
  assert.equal(readStart({ ...sent, stage: { ...sent.stage, floors: sent.stage.floors.slice(1) } }, 'G1', THEMES), null, 'a stage without a ground is refused');
  assert.equal(readStart({ ...sent, roster: [...sent.roster, { id: 'G2', team: 'heroes', fighter: { species: 'dragon' } }] }, 'G1', THEMES), null, 'a bad fighter is refused');
  assert.equal(readSnap({ seq: 1, tick: 1, paused: false, fighters: [{ id: 'X' }], donuts: [], bricks: [], shelves: [], events: [] }, new Set(['H'])), null,
    'a snapshot with a fighter outside the roster is refused');
}

// --- a host and two guests through a match ------------------------------------------------------
const net = network();
// G3 is only there to drop out
const guests = new Map([['G1', newFighter('lion')], ['G2', newFighter('llama')], ['G3', newFighter('owl')]]);
const start = { theme: 'cake', stage: LEVELS[1].stage, roster: rosterOf('H', newFighter('owl'), guests), settings: { seconds: ROUND_SECONDS } };
const [g1, g2] = ['G1', 'G2'].map((id) => guestOf(net, id));
guestOf(net, 'G3');
const host = createHost(net.link('H'), start, 'H');
net.flush();
const [s1, s2] = await Promise.all([g1.started, g2.started]);
assert.deepEqual(s1.stage, LEVELS[1].stage, 'the level travels as data, unchanged');
assert.equal(s1.theme, 'cake');
assert.deepEqual(s2.roster.map((s) => s.id), ['H', 'G1', 'G2', 'G3', 'dummy'], 'every player is a hero, the dummy the bad guys');

const state = createMatch(s1.roster.map((s) => ({ id: s.id, team: s.team, ...BODY, ...(s.dummy && { dummy: true }) })), start.stage);
const at = (snap, id) => snap.fighters.find((f) => f.id === id);
const drawn = { G1: null, G2: null };
/** Runs host ticks at 60 Hz, a frame per tick, delivering everything each frame. */
function play(n, hostInput = IDLE) {
  for (let i = 0; i < n; i++) {
    tick(state, { ...host.inputs(), H: hostInput });
    host.seen(snapshot(state));
    host.post(false, 1 / TICK_HZ);
    net.flush();
    drawn.G1 = g1.frame(1 / TICK_HZ) ?? drawn.G1;
    drawn.G2 = g2.frame(1 / TICK_HZ) ?? drawn.G2;
  }
  return snapshot(state);
}

{
  const before = snapshot(state);
  g1.input({ target: { x: at(before, 'G1').x + 2, z: 1 }, punch: false, kick: false });
  net.flush();
  const walking = play(20), seen = at(drawn.G2, 'G1').x;
  assert.ok(seen < at(walking, 'G1').x - 0.07 && seen > at(walking, 'G1').x - 0.3, 'other guests draw a walking fighter a snapshot or two behind');
  assert.ok(Math.abs(at(drawn.G1, 'G1').x - at(walking, 'G1').x) < 0.07, 'its own guest draws it from the latest snapshot, no further behind');
  const after = play(70);
  assert.ok(at(after, 'G1').x > at(before, 'G1').x + 1.5, 'a guest\'s input moves its fighter on the host');
  assert.ok(Math.abs(at(after, 'G2').x - at(before, 'G2').x) < 0.05, 'and only its own fighter');
  const sent = JSON.parse(JSON.stringify(at(after, 'G1'), (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  assert.deepEqual(at(drawn.G1, 'G1'), sent, 'a guest draws its own fighter from the latest snapshot');
  assert.ok(net.snaps.some((d) => !('bricks' in d)), 'snapshots leave out bricks and shelves that stood still');
  assert.deepEqual([drawn.G2.bricks.length, drawn.G2.shelves.length], [after.bricks.length, 2], 'and guests keep drawing them');
  assert.ok(after.tick - drawn.G2.tick < TICK_HZ / SNAP_HZ, 'everything else on a guest is the host\'s latest snapshot');
}

{
  const x = at(snapshot(state), 'G2').x;
  net.link('G1').send('input', { target: { x: x + 3, z: 0 }, punch: false, kick: false }, ['H']);
  net.link('X').send('input', { target: { x: x + 3, z: 0 }, punch: false, kick: false }, ['H']);
  net.flush();
  play(30);
  assert.ok(Math.abs(at(snapshot(state), 'G2').x - x) < 0.05, 'nobody moves someone else\'s fighter');
}

{
  const posted = net.queue.length;
  host.post(false, 1 / (4 * TICK_HZ));
  assert.equal(net.queue.length, posted, 'snapshots go at 30 Hz, not every frame');
}

// A hit lands on one tick; the snapshot that carries it first is lost, and the next ones still bring it, once.
{
  const fake = snapshot(state);
  const t0 = fake.tick + 1;
  const cracked = fake.bricks.map((b, i) => (i ? b : { ...b, hits: b.hits - 1 }));
  const feed = (t, hits = []) => host.seen({ ...fake, bricks: cracked, tick: t, hits, fullBag: [], donutEvents: t === t0 ? [{ fighter: 'G1', kind: 'steal', x: 0, y: 0, z: 0 }] : [] });
  const hit = { x: 1, y: 1, z: 0, move: 'punch', on: 'fighter', target: 'dummy', broke: false };
  // the first two snapshots after the hit never reach G1 (the first copy goes to G1 first)
  let lose = true;
  net.drop = () => { const d = lose; lose = false; return d; };
  const got = { G1: { hits: 0, steals: 0 }, G2: { hits: 0, steals: 0 } };
  for (let t = t0; t < t0 + EVENT_TICKS; t++) {
    feed(t, t === t0 ? [hit] : []);
    host.post(false);
    if (t === t0) lose = true;
    net.flush();
    for (const [id, g] of [['G1', g1], ['G2', g2]]) {
      const s = g.frame(1 / TICK_HZ);
      got[id].hits += s?.hits.length ?? 0;
      got[id].steals += s?.donutEvents.length ?? 0;
    }
  }
  assert.deepEqual(got.G1, { hits: 1, steals: 1 }, 'a lost snapshot loses no hit or steal, and none plays twice');
  assert.deepEqual(got.G2, { hits: 1, steals: 1 }, 'on every guest');
  assert.equal(g1.frame(0).bricks[0].hits, fake.bricks[0].hits - 1, 'and the cracked brick reaches the guest that lost it');
  net.drop = () => false;
}

{
  net.shuffle = true;
  const fake = snapshot(state);
  for (let t = 1; t <= 4; t++) {
    host.seen({ ...fake, tick: fake.tick + EVENT_TICKS + t * 2 });
    host.post(false);
  }
  net.flush();
  net.shuffle = false;
  assert.equal(g1.frame(0).tick, fake.tick + EVENT_TICKS + 8, 'a late snapshot never replaces a newer one');
}

{
  host.post(true);
  net.flush();
  assert.equal(g1.frame(0).paused, true, 'the host\'s pause reaches every guest');
  assert.equal(g2.frame(0).paused, true);
  host.post(false);
  net.flush();
  assert.equal(g2.frame(0).paused, false);
}

{
  g1.input({ ...IDLE, away: true });
  net.flush();
  const snap = play(5);
  assert.equal(at(snap, 'G1').move, 'sit', 'a guest who leaves the screen sits down');
  g1.input({ ...IDLE, away: false });
  net.flush();
  assert.notEqual(at(play(5), 'G1').move, 'sit', 'and gets up when back');
  host.left('G3');
  assert.equal(at(play(5), 'G3').move, 'sit', 'a guest who drops sits where it stopped');
}

{
  while (!snapshot(state).over) tick(state, {});
  host.seen(snapshot(state));
  host.post(false);
  net.flush();
  assert.equal(g1.frame(0).over, true, 'the end of the match reaches every guest');
  assert.equal(g2.frame(0).over, true);
  host.again();
  net.flush();
  assert.equal(g1.seen.again, 1, '▶️ again on the host restarts every guest');
}

{
  g1.frame(HOST_GONE_SECONDS / 2);
  assert.equal(g1.seen.gone, 0, 'a quiet host is not gone yet');
  g1.frame(HOST_GONE_SECONDS / 2 + 1);
  g1.frame(1);
  assert.equal(g1.seen.gone, 1, 'a host silent for a minute has left, said once');
  g2.left('G1');
  assert.equal(g2.seen.gone, 0, 'another guest leaving is not the host leaving');
  g2.left('H');
  assert.equal(g2.seen.gone, 1, 'the host\'s connection dropping is the host leaving');
}

console.log('multiplayer: ok');
