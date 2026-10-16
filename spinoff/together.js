// The play page's side of a shared match (REUSE-SPEC.md §Multiplayer): `play.html?room=CODE&host=N` hosts it
// for the N tablets the lobby sent along, `play.html?room=CODE` joins it. multiplayer.js does the talking.
import { ROUND_SECONDS } from './match.js';
import { HOST_GONE_SECONDS, createGuest, createHost, rosterOf } from './multiplayer.js';
import { debugging, note, openRoom, selfId, showDebug } from './net.js';
import { isCode } from './roster.js';
import { THEMES } from './scenery.js';

// ponytail: the host waits this long for a tablet that doesn't arrive, then starts without it; a tablet that
// arrives later can't join, so this matches how long a guest waits for the host (HOST_GONE_SECONDS)
const WAIT_FOR_GUESTS_MS = HOST_GONE_SECONDS * 1000;
// Every tablet in a home shares one internet address; guests join a match's room up to this much apart so their
// relay hellos don't all land at once and trip the relays' rate limits
const STAGGER_MS = 2000;
// a page about to go somewhere else gives its last message this long to leave
const SEND_MS = 300;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const el = (id) => document.getElementById(id);
const toLobby = () => { location.href = 'lobby.html'; };

function hostGone() {
  el('gone').hidden = false;
  el('gone-bye').addEventListener('click', toLobby);
}

const noteGuest = (id, n, expected, late) => note(`host: fighter ${id.slice(0, 4)}, ${n} of ${expected}${late ? ' (late)' : ''}`);

/** @param {number[]} code @param {import('./fighter.js').Fighter} mine @param {import('./levels.js').Level} level */
async function host(code, mine, level, expected) {
  const guests = new Map();
  let h = null, ready;
  const full = new Promise((r) => { ready = r; });
  const room = openRoom(code, mine, {
    onFighter: (id, f) => { if (!h) guests.set(id, f); noteGuest(id, guests.size, expected, h); if (guests.size >= expected) ready(); },
    onLeave: (id) => { guests.delete(id); h?.left(id); },
  }, '-play');
  await Promise.race([expected > 0 ? full : null, sleep(WAIT_FOR_GUESTS_MS)]);
  const start = { theme: level.theme, stage: level.stage, roster: rosterOf(selfId, mine, guests), settings: { seconds: ROUND_SECONDS } };
  h = createHost(room, start, selfId);
  note(`host: start sent to ${guests.size}`);
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
  const heard = new Set(), link = { ...room, on: (type, fn) => room.on(type, (data, from) => {
    if (!heard.has(type)) note(`guest: first ${type} from ${from.slice(0, 4)}`);
    heard.add(type);
    fn(data, from);
  }) };
  g = createGuest(link, selfId, Object.keys(THEMES), { gone: hostGone, again: () => location.reload() });
  g.started.then(() => note('guest: start accepted'));
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
  if (debugging()) showDebug();
  el('wait').hidden = false;
  el('wait-bye').addEventListener('click', toLobby);
  const match = q.has('host') ? await host(code, mine, level, Number(q.get('host')) || 0) : await sleep(STAGGER_MS * Math.random()).then(() => guest(code, mine));
  el('wait').hidden = true;
  return match;
}
