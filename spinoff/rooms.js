// The tap page's side of the network (REUSE-SPEC.md §Multiplayer, Kept rooms): the tap page (index.html) stays
// loaded for the whole visit while the game's pages come and go in its frame, so a room joined here keeps its
// connections from the lobby through every round. Pages attach to it through net.js.
import { getRelaySockets, joinRoom, selfId } from 'trystero';
import { clockSlack, isHomeRoute, netProblem, remoteOf, roomName, routeNote } from './roster.js';

export const APP_ID = 'lys-donut-fighters';
export { selfId };

// REUSE-SPEC.md §Multiplayer: no STUN servers, so a tablet only knows its home-network addresses and
// can't connect across the internet; the room code scrambles the introductions on the public relays
// Every tablet in a home shares one internet address, and a relay that rate-limits it is skipped for a minute or
// more; a hello only needs one relay to get through, so more relays ride out a few that refuse.
// ponytail: still public relays; a signalling relay in serve.py would keep even the hellos at home
const RELAYS = 10;
const roomConfig = (code) => ({
  appId: APP_ID, password: roomName(code), rtcConfig: { iceServers: [] }, maxReceiveBytes: 64 * 1024,
  relayConfig: { redundancy: RELAYS },
});

/**
 * @typedef {{ onFighter: (id: string, raw: unknown) => void, onLeave: (id: string) => void }} Page
 * @typedef {{ room: any, home: Set<string>, actions: Map<string, any>, handlers: Map<string, Function>, page: Page|null }} Kept
 */
/** Every room joined this visit, by name. @type {Map<string, Kept>} */
const kept = new Map();

/** What `?debug=1` shows about why tablets do or don't meet; `heard`, the tablets whose relay messages arrived. */
const seen = { peers: 0, homes: 0, notes: [], heard: new Set() };

/** A line for `?debug=1`'s notes. */
export const note = (text) => { seen.notes.push(String(text)); };
const short = (id) => String(id ?? '?').slice(0, 4);

const senderOf = (frame) => {
  try { return JSON.parse(JSON.parse(frame)[2]?.content ?? 'null')?.peerId; } catch { return undefined; }
};
const listening = new WeakSet();
function listen(socket) {
  if (listening.has(socket)) return;
  listening.add(socket);
  socket.addEventListener('message', (e) => {
    const id = senderOf(String(e.data));
    if (typeof id === 'string' && id !== selfId) seen.heard.add(id);
  });
}

// Trystero's relays are the page's only sockets: every subscription asks from earlier (clockSlack), and ?debug=1
// counts the tablets heard on them.
if (globalThis.WebSocket) {
  const { send } = WebSocket.prototype;
  WebSocket.prototype.send = function sendSlack(data) {
    listen(this);
    send.call(this, clockSlack(data));
  };
}
if (globalThis.console) {
  const { warn } = console;
  console.warn = (...args) => {
    if (String(args[0]).startsWith('Trystero')) note(String(args[0]).slice(10, 100));
    warn(...args);
  };
}

/** `?debug=1`'s status lines. */
export function status() {
  const relays = Object.values(getRelaySockets()).filter((s) => s.readyState === WebSocket.OPEN).length;
  const s = { ...seen, subtle: Boolean(globalThis.crypto?.subtle), relays, heard: seen.heard.size };
  // the clock (UTC) is there to compare tablets side by side: see clockSlack
  return [`me ${short(selfId)} ${new Date().toISOString().slice(11, 19)} secure ${globalThis.isSecureContext} subtle ${s.subtle}`,
    `relays ${relays} heard ${s.heard} (${[...seen.heard].map(short).join(' ')}) peers ${s.peers} home ${s.homes} rooms ${kept.size}`,
    ...seen.notes.slice(-10), netProblem(s)].join('\n');
}

/** @param {RTCPeerConnection|undefined} pc */
async function onHomeNetwork(pc, peerId) {
  const remote = pc && remoteOf(await pc.getStats());
  seen.peers++;
  note(`${short(peerId)} ${routeNote(remote)}`);
  if (isHomeRoute(remote)) seen.homes++;
  return isHomeRoute(remote);
}

// Nothing is sent to a tablet, or accepted from it, until its route is checked; a fighter that
// arrives first is held until then.
export function homeOnly(fighter, mine, onFighter) {
  const home = new Set(), early = new Map();
  fighter.onMessage = (data, { peerId }) => {
    if (home.has(peerId)) onFighter(peerId, data);
    else early.set(peerId, data);
  };
  const welcome = (peerId) => {
    home.add(peerId);
    fighter.send(mine, { target: peerId });
    if (early.has(peerId)) onFighter(peerId, early.get(peerId));
    early.delete(peerId);
  };
  const forget = (peerId) => { home.delete(peerId); early.delete(peerId); };
  return { welcome, forget, home };
}

/** Joins `code`'s room once: a tablet whose connection doesn't run over the home network is hung up on first. */
function keep(code, mine) {
  const room = joinRoom(roomConfig(code), roomName(code), { onJoinError: (e) => { note(`${short(e.peerId)} ${e.error}`); } });
  /** @type {Kept} */
  const k = { room, home: new Set(), actions: new Map(), handlers: new Map(), page: null };
  const peers = homeOnly(room.makeAction('fighter'), mine, (id, raw) => k.page?.onFighter(id, raw));
  k.home = peers.home;
  room.onPeerJoin = async (peerId) => {
    const pc = room.getPeers()[peerId];
    if (await onHomeNetwork(pc, peerId)) {
      peers.welcome(peerId);
      return;
    }
    peers.forget(peerId);
    pc?.close();
  };
  room.onPeerLeave = (peerId) => { note(`${short(peerId)} left`); peers.forget(peerId); k.page?.onLeave(peerId); };
  return k;
}

function action(k, type) {
  if (!k.actions.has(type)) {
    const a = k.room.makeAction(type);
    a.onMessage = (data, { peerId }) => { if (k.home.has(peerId)) k.handlers.get(type)?.(data, peerId); };
    k.actions.set(type, a);
  }
  return k.actions.get(type);
}

/**
 * `code`'s room, joined the first time and kept after: `page` gets its fighters, leavers and messages until
 * another page attaches or this one detaches. Typed messages to and from home-checked tablets only:
 * multiplayer.js's Link, plus `peers` (the home-checked tablets now) and `leave` (out of the room for good).
 * ponytail: Trystero 0.26 has no per-action channel options; every action, snapshots too, rides its one
 * reliable, ordered data channel, so one lost packet holds the stream up for a resend. If that stutters,
 * open a negotiated `{ ordered: false, maxRetransmits: 0 }` channel on `room.getPeers()[id]` for snapshots.
 * @param {number[]} code @param {unknown} mine @param {Page} page
 */
export function attach(code, mine, page) {
  const name = roomName(code);
  if (!kept.has(name)) kept.set(name, keep(code, mine));
  const k = /** @type {Kept} */ (kept.get(name));
  Object.assign(k, { page, handlers: new Map() });
  return {
    send(type, data, to = [...k.home]) {
      const target = to.filter((id) => k.home.has(id));
      if (target.length) action(k, type).send(data, { target }).catch(() => {});
    },
    on(type, fn) { action(k, type); k.handlers.set(type, fn); },
    peers: () => [...k.home],
    detach() { if (k.page === page) Object.assign(k, { page: null, handlers: new Map() }); },
    leave() {
      if (kept.get(name) === k) kept.delete(name);
      k.room.leave();
    },
  };
}

/** Out of every room, as the lobby's first screen is. */
export function leaveAll() {
  for (const k of kept.values()) k.room.leave();
  kept.clear();
}
