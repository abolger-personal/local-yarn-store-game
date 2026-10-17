// Tablets starting a match together through the real together.js and net.js: each tablet is a worker thread
// with its own Trystero id, and a stand-in Trystero joins them over a BroadcastChannel (no relays, no WebRTC).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const FAKE_TRYSTERO = `
const bus = new BroadcastChannel('fake-trystero');
export const selfId = Math.random().toString(36).slice(2, 10);
export const getRelaySockets = () => ({});
const rooms = new Map();
const post = (m) => bus.postMessage({ ...m, from: selfId });
bus.onmessage = ({ data: m }) => {
  const room = rooms.get(m.room);
  if (!room || m.from === selfId || (m.to && m.to !== selfId)) return;
  if (m.t === 'join') { room.meet(m.from); post({ t: 'here', room: m.room, to: m.from }); }
  if (m.t === 'here') room.meet(m.from);
  if (m.t === 'msg') room.actions.get(m.type)?.onMessage?.(m.data, { peerId: m.from });
  if (m.t === 'leave') room.part(m.from);
};
const STATS = new Map([['t', { type: 'transport', selectedCandidatePairId: 'p' }],
  ['p', { type: 'candidate-pair', remoteCandidateId: 'r' }], ['r', { type: 'remote-candidate', candidateType: 'host', address: 'tablet.local' }]]);
export function joinRoom(config, roomId) {
  const peers = {}, actions = new Map();
  const room = {
    actions, getPeers: () => peers,
    meet(id) { if (peers[id]) return; peers[id] = { getStats: async () => STATS, close() {} }; setTimeout(() => room.onPeerJoin?.(id)); },
    part(id) { if (!peers[id]) return; delete peers[id]; room.onPeerLeave?.(id); },
    makeAction(type) {
      const action = { onMessage: null, send: async (data, { target }) => { for (const to of [target].flat()) post({ t: 'msg', room: roomId, to, type, data }); } };
      actions.set(type, action);
      return action;
    },
    leave() { post({ t: 'leave', room: roomId }); rooms.delete(roomId); },
  };
  rooms.set(roomId, room);
  (globalThis.joined ??= []).push(roomId);
  setTimeout(() => post({ t: 'join', room: roomId }));
  return room;
}`;

const HOOKS = `export async function resolve(spec, ctx, next) {
  return spec === 'trystero' ? { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAKE_TRYSTERO)}), shortCircuit: true } : next(spec, ctx);
}`;

/** A page's document and address; `to(next)` is where the page goes when it leaves. */
function pageStubs(search, to) {
  const el = () => ({ hidden: true, innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} });
  const els = new Map();
  globalThis.document = {
    getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); },
    querySelectorAll: () => [], body: { appendChild: (x) => x }, createElement: el,
  };
  globalThis.location = { href: '', reload: () => to(search), set search(next) { to(`?${next}`); }, get search() { return search; } };
}

// as lobby.js's room: the host's waits to meet `hosting` others and sends `go`; everyone else waits for `go`
async function lobby(code, mine, hosting, quit) {
  const { openRoom } = await import('./net.js');
  const met = new Set();
  let meet = () => {};
  const room = openRoom(code, mine, { onFighter: (id) => { met.add(id); meet(); }, onLeave: (id) => met.delete(id) });
  room.on('playing', () => parentPort.postMessage({ playing: true }));
  if (quit) return new Promise(() => { room.on('go', () => setTimeout(() => room.leave(), 1500)); });
  if (!hosting) return new Promise((go) => { room.on('go', () => go(`?room=${code.join('')}`)); });
  await new Promise((r) => { meet = () => { if (met.size >= hosting) r(); }; meet(); });
  room.send('go', true);
  return `?room=${code.join('')}&host`;
}

// One worker is one tablet's whole visit, as the tap page is: its pages come and go, its rooms stay.
async function visit({ code, hosting, slow = 0, quit = false }) {
  register('data:text/javascript,' + encodeURIComponent(HOOKS));
  const { joinMatch } = await import('./together.js');
  const { randomFighter } = await import('./fighter.js');
  const { TUTORIAL } = await import('./levels.js');
  const mine = randomFighter();
  pageStubs('', () => {});
  let page = await lobby(code, mine, hosting, quit);
  parentPort.postMessage({ left: page });
  await new Promise((r) => { setTimeout(r, slow); });
  for (;;) {
    let leave;
    const left = new Promise((r) => { leave = r; });
    pageStubs(page, leave);
    const match = await joinMatch(page, mine, TUTORIAL);
    parentPort.postMessage({ me: match.me, roster: match.start.roster.map((s) => s.id), joined: [...globalThis.joined] });
    parentPort.removeAllListeners('message');
    parentPort.on('message', () => match.again());
    page = await left;
    parentPort.postMessage({ next: page });
  }
}

/** A tablet; `said(key, n)` resolves with the `n`th message it posts that has `key`. */
function open(code, hosting = 0, slow = 0, quit = false) {
  const worker = new Worker(new URL(import.meta.url), { workerData: { code, hosting, slow, quit } }), heard = [], waiting = [];
  const check = () => {
    for (const w of [...waiting]) {
      const m = heard.filter((h) => w.key in h)[w.n - 1];
      if (m) { waiting.splice(waiting.indexOf(w), 1); w.resolve(m); }
    }
  };
  worker.on('message', (m) => { heard.push(m); check(); });
  return {
    worker,
    said: (key, n = 1) => new Promise((resolve, reject) => {
      waiting.push({ key, n, resolve });
      check();
      worker.once('error', reject);
    }),
  };
}

const within = (ms, p, what) => Promise.race([p, new Promise((_, no) => { setTimeout(() => no(new Error(`${what} not within ${ms} ms`)), ms); })]);

/** Each tablet's `n[i]`th match, the host's first: all in one match. */
async function played(tablets, n, what) {
  const [host, ...guests] = await within(15000, Promise.all(tablets.map((t, i) => t.said('roster', n[i]))), what);
  assert.equal(host.roster.length, tablets.length + 1, `the host's match has itself, every guest and the dummy (${host.roster})`);
  for (const g of guests) {
    assert.ok(host.roster.includes(g.me), 'every guest is in the host\'s roster');
    assert.deepEqual(g.roster, host.roster, 'every guest plays the host\'s roster');
  }
  return [host, ...guests];
}

async function main() {
  const three = [open([1, 2, 3, 4], 2), open([1, 2, 3, 4]), open([1, 2, 3, 4])];
  await played(three, [1, 1, 1], 'three tablets starting a match');
  for (const t of three) t.worker.terminate();
  console.log('together ok (a host and two guests start one match through net.js)');

  const [host, guest] = [open([2, 3, 4, 1], 1), open([2, 3, 4, 1])];
  await played([host, guest], [1, 1], 'two tablets starting a match');
  const late = open([2, 3, 4, 1]);
  await within(15000, late.said('playing'), 'the host telling a late friend in the lobby a match is on');
  host.worker.postMessage('again');
  const next = await within(15000, Promise.all([host, guest].map((t) => t.said('next'))), 'everyone going to the next round');
  assert.deepEqual(next.map((m) => m.next), ['?room=2341&host', '?room=2341'], 'everyone reloads the same page for the next round');
  const second = await played([host, guest, late], [2, 2, 1], 'the next round with the late friend');
  for (const m of second) assert.deepEqual(m.joined, m.joined.filter((r, i) => m.joined.indexOf(r) === i), 'no tablet joins a room twice');
  assert.equal(second[0].joined.length, 1, 'the host plays every round, and hears the late friend, in the room it opened once');
  for (const t of [host, guest, late]) t.worker.terminate();
  console.log('together ok (a late friend plays the next round, nobody reconnects)');

  // the host's page is waiting (⏳) for a slow guest when a tablet comes in through the lobby: it's sent along
  const first = open([3, 4, 1, 2], 1), slow = open([3, 4, 1, 2], 0, 3000);
  await within(15000, first.said('left'), 'the host starting the match');
  const retyped = open([3, 4, 1, 2]);
  await played([first, slow, retyped], [1, 1, 1], 'a tablet that typed the code while the host waited joining the match');
  for (const t of [first, slow, retyped]) t.worker.terminate();
  console.log('together ok (a tablet that comes in through the lobby while the host waits plays this round)');

  // the only other tablet leaves the room (👋) instead of coming along: the host stops waiting for it
  const alone = open([4, 1, 2, 3], 1), gone = open([4, 1, 2, 3], 0, 0, true);
  await played([alone], [1], 'a match starting without the tablet that left');
  for (const t of [alone, gone]) t.worker.terminate();
  console.log('together ok (the host doesn\'t wait for a tablet that left)');
  process.exit(0);
}

if (isMainThread) await main();
else await visit(workerData);
