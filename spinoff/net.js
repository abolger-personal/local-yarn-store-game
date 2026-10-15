import { getRelaySockets, joinRoom, selfId } from 'trystero';
import { readFighter } from './fighter.js';
import { isHomeRoute, netProblem, remoteOf, roomName, routeNote } from './roster.js';

export const APP_ID = 'lys-donut-fighters';
export { selfId };

// REUSE-SPEC.md §Multiplayer: no STUN servers, so a tablet only knows its home-network addresses and
// can't connect across the internet; the room code scrambles the introductions on the public relays
const roomConfig = (code) => ({
  appId: APP_ID, password: roomName(code), rtcConfig: { iceServers: [] }, maxReceiveBytes: 64 * 1024,
});

/** What `?debug=1` shows about why tablets do or don't meet. */
const seen = { peers: 0, homes: 0, notes: [] };

/** Puts a status line on the page that refreshes every second (lobby.html?debug=1). */
export function showDebug() {
  const line = document.body.appendChild(document.createElement('pre'));
  line.className = 'debug';
  addEventListener('unhandledrejection', (e) => { seen.notes.push(String(e.reason)); });
  setInterval(() => {
    const relays = Object.values(getRelaySockets()).filter((s) => s.readyState === WebSocket.OPEN).length;
    const s = { ...seen, subtle: Boolean(globalThis.crypto?.subtle), relays };
    line.textContent = [`secure ${isSecureContext} subtle ${s.subtle} relays ${relays} peers ${s.peers} home ${s.homes}`,
      ...seen.notes.slice(-8), netProblem(s)].join('\n');
  }, 1000);
}

/** @param {RTCPeerConnection|undefined} pc */
async function onHomeNetwork(pc) {
  const remote = pc && remoteOf(await pc.getStats());
  seen.peers++;
  seen.notes.push(routeNote(remote));
  if (isHomeRoute(remote)) seen.homes++;
  return isHomeRoute(remote);
}

// Nothing is sent to a tablet, or accepted from it, until its route is checked; a fighter that
// arrives first is held until then.
function homeOnly(fighter, mine, onFighter) {
  const home = new Set(), early = new Map();
  const accept = (peerId, data) => {
    const f = readFighter(data);
    if (f) onFighter(peerId, f);
  };
  fighter.onMessage = (data, { peerId }) => {
    if (home.has(peerId)) accept(peerId, data);
    else early.set(peerId, data);
  };
  const welcome = (peerId) => {
    home.add(peerId);
    fighter.send(mine, { target: peerId });
    if (early.has(peerId)) accept(peerId, early.get(peerId));
    early.delete(peerId);
  };
  const forget = (peerId) => { home.delete(peerId); early.delete(peerId); };
  return { welcome, forget, home };
}

/** Typed messages to and from home-checked tablets only: multiplayer.js's Link. @param {Set<string>} home */
function linkOf(room, home) {
  const actions = new Map();
  const action = (type) => {
    if (!actions.has(type)) actions.set(type, room.makeAction(type));
    return actions.get(type);
  };
  return {
    send(type, data, to = [...home]) {
      const target = to.filter((id) => home.has(id));
      if (target.length) action(type).send(data, { target }).catch(() => {});
    },
    on(type, fn) { action(type).onMessage = (data, { peerId }) => { if (home.has(peerId)) fn(data, peerId); }; },
  };
}

/**
 * Joins a room and swaps fighters with everyone in it (REUSE-SPEC.md §Multiplayer). A tablet whose
 * connection doesn't run over the home network is hung up on before anything is sent or accepted.
 * ponytail: every tablet tells every other its fighter, in a match too; only the host uses them.
 * ponytail: Trystero 0.26 has no per-action channel options; every action, snapshots too, rides its one
 * reliable, ordered data channel, so one lost packet holds the stream up for a resend. If that stutters,
 * open a negotiated `{ ordered: false, maxRetransmits: 0 }` channel on `room.getPeers()[id]` for snapshots.
 * @param {number[]} code
 * @param {import('./fighter.js').Fighter} mine
 * @param {{ onFighter: (id: string, f: import('./fighter.js').Fighter) => void, onLeave: (id: string) => void }} on
 * @param {string} [place] '-play' for a match's room, apart from the lobby's
 */
export function openRoom(code, mine, { onFighter, onLeave }, place = '') {
  const room = joinRoom(roomConfig(code), roomName(code) + place, { onJoinError: (e) => { seen.notes.push(e.error); } });
  const peers = homeOnly(room.makeAction('fighter'), mine, onFighter);
  room.onPeerJoin = async (peerId) => {
    const pc = room.getPeers()[peerId];
    if (await onHomeNetwork(pc)) {
      peers.welcome(peerId);
      return;
    }
    peers.forget(peerId);
    pc?.close();
  };
  room.onPeerLeave = (peerId) => { peers.forget(peerId); onLeave(peerId); };
  return { leave: () => room.leave(), ...linkOf(room, peers.home) };
}
