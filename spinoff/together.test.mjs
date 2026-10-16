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
  globalThis.location = { search, href: '', reload() {} };
  return els;
}

async function tablet({ search }) {
  register('data:text/javascript,' + encodeURIComponent(HOOKS));
  const els = pageStubs(search);
  const { joinMatch } = await import('./together.js');
  const { randomFighter } = await import('./fighter.js');
  const { TUTORIAL } = await import('./levels.js');
  const match = await joinMatch(search, randomFighter(), TUTORIAL);
  parentPort.postMessage({ me: match.me, roster: match.start.roster.map((s) => s.id), gone: !els.get('gone')?.hidden });
}

function start(search) {
  const worker = new Worker(new URL(import.meta.url), { workerData: { search } });
  return new Promise((resolve, reject) => {
    worker.once('message', (m) => { resolve(m); worker.terminate(); });
    worker.once('error', reject);
  });
}

const within = (ms, p, what) => Promise.race([p, new Promise((_, no) => { setTimeout(() => no(new Error(`${what} not within ${ms} ms`)), ms); })]);

async function main() {
  const [host, ...guests] = await within(15000, Promise.all([start('?room=1234&host=2'), start('?room=1234'), start('?room=1234')]),
    'three tablets starting a match');
  assert.equal(host.roster.length, 4, `the host's match has itself, both guests and the dummy (${host.roster})`);
  for (const g of guests) {
    assert.ok(host.roster.includes(g.me), 'every guest is in the host\'s roster');
    assert.deepEqual(g.roster, host.roster, 'every guest plays the host\'s roster');
  }
  console.log('together ok (a host and two guests start one match through net.js)');
  process.exit(0);
}

if (isMainThread) await main();
else await tablet(workerData);
