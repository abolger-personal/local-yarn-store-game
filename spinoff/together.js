// The play page's side of a shared match (REUSE-SPEC.md §Multiplayer): `play.html?room=CODE&host=N` hosts it
// for the N tablets the lobby sent along, `play.html?room=CODE` joins it. multiplayer.js does the talking.
import { ROUND_SECONDS } from './match.js';
import { HOST_GONE_SECONDS, createGuest, createHost, rosterOf } from './multiplayer.js';
import { openRoom, selfId } from './net.js';
import { isCode } from './roster.js';
import { THEMES } from './scenery.js';

// ponytail: the host waits this long for a tablet that doesn't arrive, then starts without it
const WAIT_FOR_GUESTS_MS = 15000;
// a page about to go somewhere else gives its last message this long to leave
const SEND_MS = 300;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const el = (id) => document.getElementById(id);
const toLobby = () => { location.href = 'lobby.html'; };

function hostGone() {
  el('gone').hidden = false;
  el('gone-bye').addEventListener('click', toLobby);
}

/** @param {number[]} code @param {import('./fighter.js').Fighter} mine @param {import('./levels.js').Level} level */
async function host(code, mine, level, expected) {
  const guests = new Map();
  let h = null, ready;
  const full = new Promise((r) => { ready = r; });
  const room = openRoom(code, mine, {
    onFighter: (id, f) => { if (!h) guests.set(id, f); if (guests.size >= expected) ready(); },
    onLeave: (id) => { guests.delete(id); h?.left(id); },
  }, '-play');
  await Promise.race([expected > 0 ? full : null, sleep(WAIT_FOR_GUESTS_MS)]);
  const start = { theme: level.theme, stage: level.stage, roster: rosterOf(selfId, mine, guests), settings: { seconds: ROUND_SECONDS } };
  h = createHost(room, start, selfId);
  const again = () => {
    h.again();
    const q = new URLSearchParams(location.search);
    q.set('host', String(guests.size));
    setTimeout(() => { location.search = q.toString(); }, SEND_MS);
  };
  return { me: selfId, start, host: h, again };
}

/** @param {number[]} code @param {import('./fighter.js').Fighter} mine */
async function guest(code, mine) {
  let g = null;
  const room = openRoom(code, mine, { onFighter: () => {}, onLeave: (id) => g?.left(id) }, '-play');
  g = createGuest(room, selfId, Object.keys(THEMES), { gone: hostGone, again: () => location.reload() });
  const start = await Promise.race([g.started, sleep(HOST_GONE_SECONDS * 1000)]);
  if (!start) {
    hostGone();
    return new Promise(() => {});
  }
  for (const id of ['pause', 'resume', 'again']) el(id).classList.add('hidden');
  return { me: selfId, start, guest: g };
}

/**
 * A match in a room, once it has started; null for a match by yourself. A guest whose host never
 * comes sees "host left" and never gets one.
 * @param {string} search @param {import('./fighter.js').Fighter} mine @param {import('./levels.js').Level} level the host's
 */
export async function joinMatch(search, mine, level) {
  const q = new URLSearchParams(search), code = [...(q.get('room') ?? '')].map(Number);
  if (!isCode(code)) return null;
  el('wait').hidden = false;
  const match = q.has('host') ? await host(code, mine, level, Number(q.get('host')) || 0) : await guest(code, mine);
  el('wait').hidden = true;
  return match;
}
