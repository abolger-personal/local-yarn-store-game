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
  setTimeout(() => post({ t: 'join', room: roomId }));
  return room;
}`;

const HOOKS = `export async function resolve(spec, ctx, next) {
  return spec === 'trystero' ? { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAKE_TRYSTERO)}), shortCircuit: true } : next(spec, ctx);
}`;

function pageStubs(search) {
  const el = () => ({ hidden: true, innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} });
  const els = new Map();
  globalThis.document = {
    getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); },
    querySelectorAll: () => [], body: { appendChild: (x) => x }, createElement: el,
  };
  // the page going somewhere else: what it would load next
  const next = (to) => parentPort.postMessage({ next: to });
  globalThis.location = { href: '', reload: () => next(search), set search(to) { next(`?${to}`); }, get search() { return search; } };
  return els;
}

// as lobby.js's room: a late friend waits for the host's `go`
async function lobby(code) {
  const { openRoom } = await import('./net.js');
  const { randomFighter } = await import('./fighter.js');
  const room = openRoom(code, randomFighter(), { onFighter() {}, onLeave() {} });
  room.on('playing', () => parentPort.postMessage({ playing: true }));
  room.on('go', () => parentPort.postMessage({ next: `?room=${code.join('')}` }));
}

async function tablet({ search, late }) {
  register('data:text/javascript,' + encodeURIComponent(HOOKS));
  pageStubs(search);
  if (late) return lobby(late);
  const { joinMatch } = await import('./together.js');
  const { randomFighter } = await import('./fighter.js');
  const { TUTORIAL } = await import('./levels.js');
  const match = await joinMatch(search, randomFighter(), TUTORIAL);
  parentPort.postMessage({ me: match.me, roster: match.start.roster.map((s) => s.id) });
  parentPort.on('message', () => match.again());
}

/** A tablet's page; `said(key)` resolves with the first message it posts that has `key`. */
function open(search, late) {
  const worker = new Worker(new URL(import.meta.url), { workerData: { search, late } }), heard = [], waiting = [];
  worker.on('message', (m) => { heard.push(m); for (const w of waiting) if (w.key in m) w.resolve(m); });
  return {
    worker,
    said: (key) => new Promise((resolve, reject) => {
      const m = heard.find((h) => key in h);
      if (m) resolve(m); else waiting.push({ key, resolve });
      worker.once('error', reject);
    }),
  };
}

async function round(searches, what) {
  const pages = searches.map((s) => open(s));
  const [host, ...guests] = await within(15000, Promise.all(pages.map((p) => p.said('roster'))), what);
  assert.equal(host.roster.length, searches.length + 1, `the host's match has itself, every guest and the dummy (${host.roster})`);
  for (const g of guests) {
    assert.ok(host.roster.includes(g.me), 'every guest is in the host\'s roster');
    assert.deepEqual(g.roster, host.roster, 'every guest plays the host\'s roster');
  }
  return pages;
}

const within = (ms, p, what) => Promise.race([p, new Promise((_, no) => { setTimeout(() => no(new Error(`${what} not within ${ms} ms`)), ms); })]);

async function main() {
  for (const p of await round(['?room=1234&host=2', '?room=1234', '?room=1234'], 'three tablets starting a match')) p.worker.terminate();
  console.log('together ok (a host and two guests start one match through net.js)');

  const [host, guest] = await round(['?room=2341&host=1', '?room=2341'], 'two tablets starting a match');

  const late = open('', [2, 3, 4, 1]);
  await within(15000, late.said('playing'), 'the host telling a late friend in the lobby a match is on');
  host.worker.postMessage('again');
  const next = await within(15000, Promise.all([host, guest, late].map((p) => p.said('next'))), 'everyone going to the next round');
  for (const p of [host, guest, late]) p.worker.terminate();
  assert.deepEqual(next.map((n) => n.next), ['?room=2341&host=2', '?room=2341', '?room=2341'], 'the host waits for the guest and the late friend');
  for (const p of await round(next.map((n) => n.next), 'the next round with the late friend')) p.worker.terminate();
  console.log('together ok (a late friend plays the next round)');
  process.exit(0);
}

if (isMainThread) await main();
else await tablet(workerData);
