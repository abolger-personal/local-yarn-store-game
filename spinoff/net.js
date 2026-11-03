// A page's side of the network: the rooms live on the tap page (rooms.js), so they outlast this page.
import { readFighter } from './fighter.js';
import { loadProgress, readProgress } from './progress.js';

/** The tap page's rooms, or this page's own when there is no tap page (a test, or a page opened by itself). */
async function roomsOf() {
  try {
    /** @type {any} */
    const w = globalThis;
    const tap = w.parent !== w ? w.parent?.donutRooms : null;
    if (tap) return await tap;
  } catch { /* another origin's frame */ }
  return import('./rooms.js');
}
const rooms = await roomsOf();

export const { selfId, note, homeOnly, inRoom, setRoom } = rooms;

/** A `?name=1` switch that sticks through every page after it, until the tap page opens again without it. */
function flagged(name) {
  const flag = new URLSearchParams(location.search).get(name);
  try {
    if (flag !== null) sessionStorage.setItem(`donut.${name}`, flag);
    return sessionStorage.getItem(`donut.${name}`) === '1';
  } catch {
    return flag === '1';
  }
}
/** `?debug=1` (or `=0`): the 🐞 panel, and 🧪 on the dress-up page. */
export const debugging = () => flagged('debug');
/** `?debug_menu=1`: the dress-up page with the effects menu (effects-menu.js). */
export const debugMenu = () => flagged('debug_menu');

/** Puts the status lines on the page, collapsed under 🐞, refreshed every second (see `debugging`). */
export function showDebug() {
  const box = document.body.appendChild(document.createElement('details'));
  box.className = 'debug';
  box.innerHTML = '<summary>🐞</summary>';
  const line = box.appendChild(document.createElement('pre'));
  addEventListener('unhandledrejection', (e) => { note(e.reason); });
  setInterval(() => { line.textContent = rooms.status(); }, 1000);
}

/**
 * This page in `code`'s room (REUSE-SPEC.md §Multiplayer, Kept rooms): joined the first time, and every page
 * after uses the same connections. Fighters that arrive are checked here, in the page that uses them.
 * Each tablet's fighter carries its game progress (progress.js) along, for the host to work out the room's minimum.
 * ponytail: every tablet tells every other its fighter when they meet, in a match too; only the host uses them.
 * @param {number[]} code
 * @param {import('./fighter.js').Fighter} mine
 * @param {{ onFighter: (id: string, f: import('./fighter.js').Fighter, p: import('./progress.js').Progress) => void, onLeave: (id: string) => void }} on
 */
export function openRoom(code, mine, { onFighter, onLeave }) {
  const link = rooms.attach(code, { ...mine, progress: loadProgress() }, {
    onFighter: (id, raw) => { const f = readFighter(raw); if (f) onFighter(id, f, readProgress(/** @type {any} */ (raw)?.progress)); },
    onLeave,
  });
  globalThis.addEventListener?.('pagehide', () => link.detach());
  return link;
}

/** Out of every room, as 👋 is: the lobby's first screen. */
export const leaveRooms = () => rooms.leaveAll();
/** 👋 back to the lobby's first screen. */
export const bye = () => { leaveRooms(); location.href = 'lobby.html'; };
