// The play page's side of a shared match (REUSE-SPEC.md §Multiplayer): `play.html?room=CODE&host` hosts it
// for every tablet in the room, `play.html?room=CODE` joins it. multiplayer.js does the talking.
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

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const el = (id) => document.getElementById(id);
const toLobby = () => { location.href = 'lobby.html'; };

function hostGone() {
  el('gone').hidden = false;
  el('gone-bye').addEventListener('click', toLobby);
}

/** The host's page again, waiting for `expected` guests. */


/** ▶️ on the host's end card: everyone to the next round. */
function endRound(h, room) {
  h.again();
  // this round is over: a guest already on the next page must not get this one's `start`
  room.detach();
  location.reload();
}

const noteGuest = (id, n, of) => note(`host: ${id.slice(0, 4)} ready, ${n} of ${of}`);

/**
 * Fills `guests` with the tablets that say `ready` (with their fighter); `everyone` resolves once every tablet
 * in the room has, or time is up. `check` again when one leaves. After `start()` has one, a playing guest
 * that says it again missed `start` and gets it again.
 */
function readyGuests(room, guests, start) {
  let all;
  const done = new Promise((r) => { all = r; });
  const check = () => { if (room.peers().every((id) => guests.has(id))) all(); };
  room.on('ready', (raw, id) => {
    const f = readFighter(raw), now = start();
    if (now) { if (f && now.roster.some((s) => s.id === id)) room.send('start', now, [id]); return; }
    if (f) guests.set(id, f);
    noteGuest(id, guests.size, room.peers().length);
    check();
  });
  check();
  return { check, everyone: Promise.race([done, sleep(WAIT_FOR_GUESTS_MS)]) };
}

/**
 * Every tablet in the room plays: one still in the lobby, or that arrives before `start`, gets `go`, and the
 * host waits for each to say `ready`. One that arrives after is a late joiner (REUSE-SPEC.md §Multiplayer,
 * Late joiners), and gets `go` with the next round's page.
 * @param {number[]} code @param {import('./fighter.js').Fighter} mine @param {import('./levels.js').Level} level
 */
async function host(code, mine, level) {
  const guests = new Map();
  let h = null, late = null, start = null, recheck = () => {};
  const playing = (id) => start?.roster.some((s) => s.id === id);
  const room = openRoom(code, mine, {
    onFighter: (id) => { if (!start) room.send('go', true, [id]); else if (!playing(id)) late?.arrive(id); },
    onLeave: (id) => { guests.delete(id); recheck(); late?.left(id); h?.left(id); },
  });
  const ready = readyGuests(room, guests, () => start);
  recheck = ready.check;
  room.send('go', true);
  await ready.everyone;
  start = { theme: level.theme, stage: level.stage, roster: rosterOf(selfId, mine, guests), settings: { seconds: ROUND_SECONDS } };
  h = createHost(room, start, selfId);
  note(`host: start sent to ${guests.size}`);
  late = lateJoiners(room);
  room.peers().filter((id) => !playing(id)).forEach(late.arrive);
  return { me: selfId, start, host: h, again: () => endRound(h, room) };
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
  const match = q.has('host') ? await host(code, mine, level) : await guest(code, mine);
  el('wait').hidden = true;
  return match;
}
