import { joinRoom, selfId } from 'trystero';
import { readFighter } from './fighter.js';
import { roomName } from './roster.js';

export const APP_ID = 'lys-donut-fighters';
export { selfId };

/**
 * Joins a room and swaps fighters with everyone in it (REUSE-SPEC.md §Multiplayer).
 * ponytail: every tablet tells every other; the host-authoritative star arrives with the match sim.
 * @param {number[]} code
 * @param {import('./fighter.js').Fighter} mine
 * @param {{ onFighter: (id: string, f: import('./fighter.js').Fighter) => void, onLeave: (id: string) => void }} on
 */
export function openRoom(code, mine, { onFighter, onLeave }) {
  const room = joinRoom({ appId: APP_ID, maxReceiveBytes: 64 * 1024 }, roomName(code));
  const fighter = room.makeAction('fighter');
  fighter.onMessage = (data, { peerId }) => {
    const f = readFighter(data);
    if (f) onFighter(peerId, f);
  };
  room.onPeerJoin = (peerId) => { fighter.send(mine, { target: peerId }); };
  room.onPeerLeave = onLeave;
  return { leave: () => room.leave() };
}
