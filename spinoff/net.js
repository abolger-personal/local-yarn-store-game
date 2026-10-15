import { joinRoom, selfId } from 'trystero';
import { readFighter } from './fighter.js';
import { isHomeRoute, remoteOf, roomName } from './roster.js';

export const APP_ID = 'lys-donut-fighters';
export { selfId };

// REUSE-SPEC.md §Multiplayer: no STUN servers, so a tablet only knows its home-network addresses and
// can't connect across the internet; the room code scrambles the introductions on the public relays
const roomConfig = (code) => ({
  appId: APP_ID, password: roomName(code), rtcConfig: { iceServers: [] }, maxReceiveBytes: 64 * 1024,
});

/** @param {RTCPeerConnection|undefined} pc */
const onHomeNetwork = async (pc) => Boolean(pc) && isHomeRoute(remoteOf(await pc.getStats()));

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
  return { welcome, forget };
}

/**
 * Joins a room and swaps fighters with everyone in it (REUSE-SPEC.md §Multiplayer). A tablet whose
 * connection doesn't run over the home network is hung up on before anything is sent or accepted.
 * ponytail: every tablet tells every other; the host-authoritative star arrives with the match sim.
 * @param {number[]} code
 * @param {import('./fighter.js').Fighter} mine
 * @param {{ onFighter: (id: string, f: import('./fighter.js').Fighter) => void, onLeave: (id: string) => void }} on
 */
export function openRoom(code, mine, { onFighter, onLeave }) {
  const room = joinRoom(roomConfig(code), roomName(code));
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
  return { leave: () => room.leave() };
}
