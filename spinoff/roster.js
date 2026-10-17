import { makeDisplay, slotRect } from '../inventory/grid.js';

export const ROOM_TREATS = Object.freeze(['🍩', '🧁', '🍪', '🍒', '🍓', '🍰']);
export const CODE_LENGTH = 4;
export const MAX_FIGHTERS = 14;

/** @returns {number[]} indexes into ROOM_TREATS */
export const randomCode = (rng = Math.random) =>
  Array.from({ length: CODE_LENGTH }, () => Math.floor(rng() * ROOM_TREATS.length));

export const isCode = (code) => Array.isArray(code) && code.length === CODE_LENGTH
  && code.every((i) => Number.isInteger(i) && i >= 0 && i < ROOM_TREATS.length);

export const codeHtml = (code) => code.map((i) => `<span>${ROOM_TREATS[i]}</span>`).join('');

export const roomName =(code) => `donut-${code.join('')}`;

// REUSE-SPEC.md §Multiplayer: tablets only ever talk across the home network
const HOME = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^f[cd][0-9a-f]{2}:/i, /^fe[89ab][0-9a-f]:/i];

/** @param {unknown} address */
export const isHomeAddress = (address) => typeof address === 'string'
  && (address.endsWith('.local') || HOME.some((re) => re.test(address)));

/** The far end of a connection's chosen route, from `RTCPeerConnection.getStats()`. */
export function remoteOf(stats) {
  const all = [...stats.values()];
  const transport = all.find((s) => s.type === 'transport' && s.selectedCandidatePairId);
  const pair = transport ? stats.get(transport.selectedCandidatePairId)
    : all.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
  return pair ? stats.get(pair.remoteCandidateId) : undefined;
}

// With no STUN a hidden far end is a host candidate, or a peer-reflexive one: a tablet that reached this one
// by resolving its `.local` name, which only works on the same network.
// ponytail: trusts the browser to keep hiding host addresses behind `.local`; a browser with that turned off
// shows its real address instead, which the address check still covers.
const HIDDEN_OK = new Set(['host', 'prflx']);

/** A route counts only if its far end is a home-network address, or a hidden one reached directly. */
export function isHomeRoute(remote) {
  if (!remote) return false;
  const address = remote.address ?? remote.ip;
  return isHomeAddress(address) || (!address && HIDDEN_OK.has(remote.candidateType));
}

// A relay only passes a subscriber the messages stamped after the subscriber's own "now", so a tablet whose clock
// runs behind another's goes unheard by it until its clock catches up; Trystero's messages are ephemeral (never
// stored), so asking from earlier costs nothing.
// ponytail: tablets whose clocks are more than CLOCK_SLACK_S apart still miss each other's first minute
export const CLOCK_SLACK_S = 600;

/** A relay subscription (`["REQ", id, filter]`) asking from CLOCK_SLACK_S earlier; any other frame unchanged. */
export const clockSlack = (frame) => (typeof frame === 'string' && frame.startsWith('["REQ"')
  ? frame.replace(/"since":(\d+)/, (_, s) => `"since":${Number(s) - CLOCK_SLACK_S}`) : frame);

/** A next round's number, from a message or the address: a whole number from 1, or 0 for the first round. */
export const roundOf = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

/** One `?debug=1` line per tablet met: the route and what the home check made of it. */
export const routeNote = (remote) =>
  `${remote?.candidateType ?? 'no route'} ${remote?.address || remote?.ip || 'hidden'} ${isHomeRoute(remote) ? 'home' : 'hung up'}`;

/** The first thing keeping tablets apart, for `?debug=1`. */
export function netProblem({ subtle, relays, heard, peers, homes }) {
  if (!subtle) return 'no crypto.subtle: tablets only meet on https (or localhost)';
  if (!relays) return 'no relay reached';
  if (!peers) return heard ? 'heard other tablets but none connected' : 'no other tablet heard yet';
  return homes ? 'ok' : 'every tablet hung up on by the home check';
}

// REUSE-SPEC.md §Mode: kids can't hit each other for now, but it is a match setting, not a rule baked in
export const MATCH = Object.freeze({ friendlyFire: false });
export const canHit = (a, b, match = MATCH) => a.id !== b.id && (a.team !== b.team || match.friendlyFire);

// a cell holds the widest fighter, gloves and cape included (fighter.test.mjs)
export const floorGrid = () => makeDisplay(7, 2, { cell: 1.4 });

function centreOut(g) {
  const cells = [];
  for (let r = g.rows - 1; r >= 0; r--) for (let c = 0; c < g.cols; c++) cells.push({ c, r });
  const mid = (g.cols - 1) / 2;
  return cells.sort((a, b) => (b.r - a.r) || (Math.abs(a.c - mid) - Math.abs(b.c - mid)) || (a.c - b.c));
}

/**
 * Where everyone stands: the same answer on every tablet, whatever order they joined in.
 * @param {string[]} ids @returns {Map<string, {x: number, z: number}>}
 */
export function standingSpots(ids, g = floorGrid()) {
  const cells = centreOut(g), spots = new Map();
  [...new Set(ids)].sort().slice(0, cells.length).forEach((id, i) => {
    const { x, z } = slotRect(g, cells[i].c, cells[i].r, 1, 1);
    spots.set(id, { x, z });
  });
  return spots;
}
