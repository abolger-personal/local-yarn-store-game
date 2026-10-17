// The play page's side of a shared match (REUSE-SPEC.md §Multiplayer): `play.html?room=CODE&host=N` hosts it
// for the N tablets the lobby sent along, `play.html?room=CODE` joins it. multiplayer.js does the talking.
import { readFighter } from './fighter.js';
import { ROUND_SECONDS } from './match.js';
import { HOST_GONE_SECONDS, createGuest, createHost, lateJoiners, rosterOf } from './multiplayer.js';
import { debugging, note, openRoom, selfId, showDebug } from './net.js';
import { codeHtml, isCode } from './roster.js';
import { THEMES } from './scenery.js';

// ponytail: the host waits this long for a tablet that doesn't arrive, then starts without it; a tablet that
// arrives later can't join, so this matches how long a guest waits for the host (HOST_GONE_SECONDS)
const WAIT_FOR_GUESTS_MS = HOST_GONE_SECONDS * 1000;
// A guest says `ready` (with its fighter) this often until `start` comes: the host's page may still be loading,
// and a message to a page that isn't there yet is dropped
const READY_MS = 1000;
// a page about to go somewhere else gives its last message this long to leave
const SEND_MS = 300;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const el = (id) => document.getElementById(id);
const toLobby = () => { location.href = 'lobby.html'; };

function hostGone() {
  el('gone').hidden = false;
  el('gone-bye').addEventListener('click', toLobby);
}

/** The host's page again, waiting for `expected` guests. */
function nextRound(expected) {
  const q = new URLSearchParams(location.search);
  q.set('host', String(expected));
  setTimeout(() => { location.search = q.toString(); }, SEND_MS);
}

/** ▶️ on the host's end card: everyone to the next round, the host's page waiting for `expected` guests. */
function endRound(h, room, expected) {
  h.again();
  nextRound(expected);
  // this round is over: a guest already on the next page must not get this one's `start`
  room.detach();
}

const noteGuest = (id, n, expected) => note(`host: ${id.slice(0, 4)} ready, ${n} of ${expected}`);

/**
 * Fills `guests` with the tablets that say `ready` (with their fighter) until `expected` have, or time is up;
 * after `start()` has one, a playing guest that says it again missed `start` and gets it again.
 */
function readyGuests(room, expected, guests, start) {
  let full;
  const all = new Promise((r) => { full = r; });
  room.on('ready', (raw, id) => {
    const f = readFighter(raw), now = start();
    if (now) { if (f && now.roster.some((s) => s.id === id)) room.send('start', now, [id]); return; }
    if (f) guests.set(id, f);
    noteGuest(id, guests.size, expected);
    if (guests.size >= expected) full();
  });
  return Promise.race([expected > 0 ? all : null, sleep(WAIT_FOR_GUESTS_MS)]);
}

/**
 * The match's guests are the tablets that say `ready`; one in the room at `start` but not playing (still in the
 * lobby), or that turns up after, is a late joiner (REUSE-SPEC.md §Multiplayer, Late joiners).
 * @param {number[]} code @param {import('./fighter.js').Fighter} mine @param {import('./levels.js').Level} level
 */
async function host(code, mine, level, expected) {
  const guests = new Map();
  let h = null, late = null, start = null;
  const playing = (id) => start?.roster.some((s) => s.id === id);
  const room = openRoom(code, mine, {
    onFighter: (id) => { if (late && !playing(id)) late.arrive(id); },
    onLeave: (id) => { guests.delete(id); late?.left(id); h?.left(id); },
  });
  await readyGuests(room, expected, guests, () => start);
  start = { theme: level.theme, stage: level.stage, roster: rosterOf(selfId, mine, guests), settings: { seconds: ROUND_SECONDS } };
  h = createHost(room, start, selfId);
  note(`host: start sent to ${guests.size}`);
  late = lateJoiners(room);
  room.peers().filter((id) => !playing(id)).forEach(late.arrive);
  return { me: selfId, start, host: h, again: () => endRound(h, room, guests.size + late.go()) };
}

/** `room` noting the first message of each type, for `?debug=1`. */
function noted(room) {
  const heard = new Set();
  return { ...room, on: (type, fn) => room.on(type, (data, from) => {
    if (!heard.has(type)) note(`guest: first ${type} from ${from.slice(0, 4)}`);
    heard.add(type);
    fn(data, from);
  }) };
}

/** Says `ready` until the host's `start` comes. @param {number[]} code @param {import('./fighter.js').Fighter} mine */
async function guest(code, mine) {
  let g = null;
  const room = openRoom(code, mine, { onFighter: () => {}, onLeave: (id) => g?.left(id) });
  g = createGuest(noted(room), selfId, Object.keys(THEMES), { gone: hostGone, again: () => location.reload() });
  room.send('ready', mine);
  const saying = setInterval(() => room.send('ready', mine), READY_MS);
  g.started.then(() => note('guest: start accepted'));
  const start = await Promise.race([g.started, sleep(HOST_GONE_SECONDS * 1000)]);
  clearInterval(saying);
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
  for (const c of document.querySelectorAll('.end .code')) c.innerHTML = codeHtml(code);
  el('wait').hidden = false;
  el('wait-bye').addEventListener('click', toLobby);
  const match = q.has('host') ? await host(code, mine, level, Number(q.get('host')) || 0) : await guest(code, mine);
  el('wait').hidden = true;
  return match;
}
