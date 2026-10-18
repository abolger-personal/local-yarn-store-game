// One match across tablets (REUSE-SPEC.md §Multiplayer): the host runs the only sim, guests send Inputs up
// and draw the Snapshots that come down. It talks over any Link, so multiplayer.test.mjs runs it in memory;
// together.js gives it the Trystero one from net.js.
import { readFighter } from './fighter.js';
import { ROUND_SECONDS, TICK_HZ } from './match.js';
import { MAX_FIGHTERS } from './roster.js';
import { badGuys } from './levels.js';

/** @typedef {import('./match.js').Input} Input @typedef {import('./match.js').Snapshot} Snapshot */
/**
 * @typedef {{ send: (type: string, data: any, to?: string[]) => void, on: (type: string, fn: (data: any, from: string) => void) => void }} Link
 * @typedef {{ id: string, team: import('./match.js').Team, fighter?: import('./fighter.js').Fighter, dummy?: boolean, cpu?: boolean }} Seat
 *   a player, the training dummy, or a CPU bad guy, whose inputs the host makes (cpu.js)
 * @typedef {{ theme: string, stage: import('./match.js').Stage, number: number, roster: Seat[], settings: { seconds: number } }} Start
 *   `theme` is the stage's name and `number` the level's (0 for a layout picked by address, not off the level dial)
 * @typedef {{ tick: number, hits: Snapshot['hits'], fullBag: Snapshot['fullBag'], donutEvents: Snapshot['donutEvents'] }} Events
 * @typedef {Snapshot & { seq: number, paused: boolean }} Drawn
 */

export const SNAP_HZ = 30;
export const HOST_GONE_SECONDS = 60;
// Every snapshot repeats the last half second's events, tagged with their tick, so a lost one loses none.
// Bricks and shelves (over half the bytes) ride along only for half a second after they change, and every REFRESH-th snapshot.
export const EVENT_TICKS = TICK_HZ / 2;
const REFRESH = 15;
// Guests draw other fighters one to two snapshots back (BEHIND ticks at most), between the two either side.
const BEHIND = 2 * (TICK_HZ / SNAP_HZ), KEEP = 8;
const TEAMS = new Set(['heroes', 'badGuys']), THINGS = new Set(['donut', 'brick', 'fighter', 'pile']), FAR = 1e6;
const FLAGS = ['away', 'drop', 'ready', 'go'];
/** @type {import('./match.js').Team} */
const HEROES = 'heroes';
const IDLE = Object.freeze({ target: null, punch: false, kick: false });
const DUMMY_ID = 'dummy';

/** Plain JSON, every number finite and not absurd, at most `depth` deep. */
function sane(v, depth = 8) {
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) < FAR;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  return typeof v === 'object' && depth > 0 && Object.values(v).every((x) => sane(x, depth - 1));
}
const isNum = (v) => typeof v === 'number' && sane(v);
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isArrays = (o, keys) => keys.every((k) => Array.isArray(o[k]));

/** @returns {import('./match.js').Target|null|undefined} undefined when malformed */
function readTarget(t) {
  if (t == null) return null;
  const flag = /** @type {('stop'|'jump')[]} */ (['stop', 'jump']).find((k) => t[k] === true);
  if (flag) return /** @type {import('./match.js').Target} */ ({ [flag]: true });
  if (t.thing === 'shelf') return TEAMS.has(t.team) ? { thing: 'shelf', team: t.team } : undefined;
  if (THINGS.has(t.thing)) return isId(t.id) ? { thing: t.thing, id: t.id } : undefined;
  if (!isNum(t.x) || !isNum(t.z) || (t.y !== undefined && !isNum(t.y))) return undefined;
  return t.y === undefined ? { x: t.x, z: t.z } : { x: t.x, y: t.y, z: t.z };
}

/** A guest's Input as the host trusts it, or null. */
export function readInput(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.punch !== 'boolean' || typeof raw.kick !== 'boolean') return null;
  const target = readTarget(raw.target);
  if (target === undefined || FLAGS.some((k) => raw[k] !== undefined && typeof raw[k] !== 'boolean')) return null;
  if (raw.throw !== undefined && !isNum(raw.throw)) return null;
  return { target, punch: raw.punch, kick: raw.kick, ...Object.fromEntries(FLAGS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]])),
    ...(raw.throw !== undefined && { throw: raw.throw }) };
}

/** @returns {Seat|null} */
function readSeat(s) {
  if (!isId(s?.id) || !TEAMS.has(s.team)) return null;
  if (s.dummy === true) return { id: s.id, team: s.team, dummy: true };
  if (s.cpu === true) return { id: s.id, team: s.team, cpu: true };
  const fighter = readFighter(s.fighter);
  return fighter && { id: s.id, team: s.team, fighter };
}

// The stage is opaque terrain data; only what every page relies on is checked: one ground, shelves to draw.
const isStage = (s) => isArrays(s ?? {}, ['floors', 'shelves', 'bricks']) && s.floors.filter((f) => f?.kind === 'ground').length === 1
  && s.floors.every((f) => ['x0', 'x1', 'z0', 'z1', 'y'].every((k) => isNum(f[k]))) && s.shelves.every((h) => TEAMS.has(h?.team));

const levelNumber = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/** The host's start message as a guest trusts it, or null. @param {string} me @param {string[]} themes @returns {Start|null} */
export function readStart(raw, me, themes) {
  if (!sane(raw) || !themes.includes(raw?.theme) || !isStage(raw.stage) || !Array.isArray(raw.roster) || raw.roster.length > MAX_FIGHTERS) return null;
  const roster = raw.roster.map(readSeat);
  if (!roster.every(Boolean) || new Set(roster.map((s) => s.id)).size !== roster.length || !roster.some((s) => s.id === me)) return null;
  return { theme: raw.theme, stage: raw.stage, number: levelNumber(raw.number), roster, settings: { seconds: isNum(raw.settings?.seconds) ? raw.settings.seconds : ROUND_SECONDS } };
}

/** A snapshot from the host as a guest trusts it, or null. @param {Set<string>} ids the roster's */
export function readSnap(raw, ids) {
  if (!sane(raw) || !Number.isInteger(raw?.seq) || !Number.isInteger(raw.tick) || typeof raw.paused !== 'boolean') return null;
  if (!isArrays(raw, ['fighters', 'donuts', 'events']) || !raw.fighters.every((f) => ids.has(f?.id))) return null;
  if (['bricks', 'shelves'].some((k) => k in raw && !Array.isArray(raw[k]))) return null;
  return raw.events.every((e) => Number.isInteger(e?.tick) && isArrays(e, ['hits', 'fullBag', 'donutEvents'])) ? raw : null;
}

/**
 * Everyone in a match: the players as heroes, then the training dummy, or from level 2 the CPU bad guys.
 * @param {Map<string, import('./fighter.js').Fighter>} guests @param {number} [level] the level's number, if it has one @returns {Seat[]}
 */
export const rosterOf = (me, mine, guests = new Map(), level = 0) => [
  { id: me, team: HEROES, fighter: mine }, ...[...guests].map(([id, fighter]) => ({ id, team: HEROES, fighter })),
  ...(level >= 2 ? Array.from({ length: badGuys(level) }, (_, i) => ({ id: `cpu${i + 1}`, team: /** @type {const} */ ('badGuys'), cpu: true }))
    : [{ id: DUMMY_ID, team: /** @type {const} */ ('badGuys'), dummy: true }]),
];

/** @param {Input} input @param {Input} [was] */
const merge = (input, was = IDLE) => ({ ...was, ...input, target: input.target ?? was.target, punch: was.punch || input.punch, kick: was.kick || input.kick,
  ...((was.drop || input.drop) && { drop: true }), ...((was.go || input.go) && { go: true }) });
const eventsOf = (s) => (s.hits.length + s.fullBag.length + s.donutEvents.length
  ? [{ tick: s.tick, hits: s.hits, fullBag: s.fullBag, donutEvents: s.donutEvents }] : []);
const round = (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

/** @param {Snapshot} snap @param {{ paused: boolean, seq: number, events: Events[], still: boolean }} o */
function wire(snap, { paused, seq, events, still }) {
  const { hits: _h, fullBag: _f, donutEvents: _d, bricks, shelves, ...rest } = snap;
  return JSON.parse(JSON.stringify({ ...rest, ...(!still && { bricks, shelves }), seq, paused, events }, round));
}

/** Keeps the latest snapshot, the recent events, and when the bricks and shelves last changed. @param {Snapshot} snap */
function seen(h, snap) {
  h.latest = snap;
  h.events = [...h.events.filter((e) => e.tick > snap.tick - EVENT_TICKS), ...eventsOf(snap)];
  const scenery = JSON.stringify([snap.bricks, snap.shelves]);
  if (scenery !== h.scenery) Object.assign(h, { scenery, changed: snap.tick });
}

/** Counts down to the next snapshot; when it's due, `send` it (`h.out` holds its sequence, events and stillness). */
function post(h, send, dt) {
  h.wait -= dt;
  if (!h.latest || h.wait > 1e-6) return;
  h.wait = Math.max(h.wait, 0) + 1 / SNAP_HZ;
  const still = ++h.seq % REFRESH !== 1 && h.latest.tick - h.changed >= EVENT_TICKS;
  h.out = { seq: h.seq, events: h.events, still };
  send();
}

/**
 * The host's side: sends `start` to the guests, collects their inputs, posts snapshots at SNAP_HZ.
 * @param {Link} link @param {Start} start @param {string} me the host's own id
 */
export function createHost(link, start, me) {
  const players = start.roster.filter((s) => !s.dummy && s.id !== me).map((s) => s.id), guests = new Set(players);
  const pending = new Map();
  const h = { latest: null, events: [], seq: 0, wait: 0, scenery: '', changed: 0, out: null };
  link.on('input', (raw, from) => { if (guests.has(from) && readInput(raw)) pending.set(from, merge(readInput(raw), pending.get(from))); });
  link.send('start', start, [...guests]);
  return {
    /** @returns {Record<string, Input>} the guests' inputs since the last call, each once */
    inputs() { const out = Object.fromEntries(pending); pending.clear(); return out; },
    /** Every tick's snapshot, for its events. @param {Snapshot} snap */
    seen(snap) { seen(h, snap); },
    /** Sends the latest snapshot at SNAP_HZ as frames pass; with no `dt`, now. */
    post(paused, dt = 1) { post(h, () => link.send('snap', wire(h.latest, { paused, ...h.out }), [...guests]), dt); },
    /** A guest dropped: its fighter sits where it stopped (the sim has no way to take one out). */
    left(id) { if (guests.delete(id)) pending.set(id, { ...IDLE, away: true }); },
    /** A guest that left came back into the room: it plays on, and its fighter stands up. */
    back(id) { if (players.includes(id) && !guests.has(id)) { guests.add(id); pending.set(id, { ...IDLE, away: false }); } },
    again() { link.send('again', true, [...guests]); },
  };
}

/**
 * The host's ear for tablets in the room that aren't playing: each hears `playing`, once, and waits in the
 * lobby; the next round's page sends it `go`, so it plays the next round.
 * ponytail: no cap, as in the lobby; past MAX_FIGHTERS every guest refuses `start`. Cap here if rooms get that full.
 * @param {Link} link the lobby room's
 */
export function lateJoiners(link) {
  const late = new Set();
  return {
    arrive(id) { if (!late.has(id)) link.send('playing', true, [id]); late.add(id); },
    left(id) { late.delete(id); },
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// a move's step too, while it's the same move, so a strike moves between snapshots rather than jumping 30 times a second
const stepBetween = (a, b, k) => (a.move === b.move && b.step >= a.step ? lerp(a.step, b.step, k) : b.step);
const between = (a, b, k) => (a && b ? { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k), facing: a.facing + turn(b.facing - a.facing) * k, step: stepBetween(a, b, k) } : b);

// A guest's own fighter too: drawn straight from the newest snapshot it moved only every other frame, and in
// jumps when snapshots came in clumps; a tap-to-walk fighter a snapshot or two behind is hard to notice.
/** The latest snapshot, with every fighter drawn `t` ticks in, between the snapshots either side. @param {Drawn[]} buf */
function blend(buf, t) {
  const last = buf.at(-1), b = buf.find((s) => s.tick >= t) ?? last, a = [...buf].reverse().find((s) => s.tick <= t) ?? b;
  const k = b.tick > a.tick ? (t - a.tick) / (b.tick - a.tick) : 1;
  const from = new Map(a.fighters.map((f) => [f.id, f])), to = new Map(b.fighters.map((f) => [f.id, f]));
  return { ...last, fighters: last.fighters.map((f) => between(from.get(f.id), to.get(f.id), k) ?? f) };
}

const noEvents = () => ({ hits: [], fullBag: [], donutEvents: [] });

/** The first good start message; its sender is the host from then on. @returns {Promise<Start>} */
function whenStarted(link, g, me, themes) {
  return new Promise((begin) => {
    link.on('start', (raw, from) => {
      const start = g.host ? null : readStart(raw, me, themes);
      if (!start) return;
      Object.assign(g, { host: from, ids: new Set(start.roster.map((s) => s.id)) });
      begin(start);
    });
  });
}

/**
 * A guest's side: waits for `start`, then keeps the host's snapshots and sends inputs.
 * @param {Link} link @param {string} me @param {string[]} themes @param {{ gone: () => void, again: () => void }} on
 */
export function createGuest(link, me, themes, on) {
  const g = { host: null, ids: new Set(), buf: [], seq: 0, seen: -1, t: 0, quiet: 0, gone: false, fresh: noEvents() };
  const started = whenStarted(link, g, me, themes);
  link.on('snap', (raw, from) => { if (from === g.host) keep(g, readSnap(raw, g.ids)); });
  link.on('again', (_, from) => { if (from === g.host) on.again(); });
  const goneNow = () => { if (!g.gone) on.gone(); g.gone = true; };
  return {
    started,
    /** What to draw this frame, with the events not seen before; null until the first snapshot. @returns {Drawn|null} */
    frame(dt) {
      // on the end card the host may be dressing up (REUSE-SPEC.md §Lobby): only leaving the room is gone
      if (!g.buf.at(-1)?.over && (g.quiet += dt) > HOST_GONE_SECONDS) goneNow();
      return g.buf.length ? drawn(g, dt) : null;
    },
    /** @param {Input} input */
    input(input) { if (g.host && (input.target || input.punch || input.kick || input.throw !== undefined || FLAGS.some((k) => input[k] !== undefined))) link.send('input', input, [g.host]); },
    left(id) { if (id === g.host) goneNow(); },
  };
}

/** Keeps a newer snapshot, taking the events it carries that weren't seen before. */
function keep(g, raw) {
  const last = g.buf.at(-1), snap = raw && { bricks: last?.bricks, shelves: last?.shelves, ...raw };
  if (!snap?.bricks || !snap.shelves || snap.seq <= g.seq) return;
  for (const e of snap.events) if (e.tick > g.seen) for (const k of ['hits', 'fullBag', 'donutEvents']) g.fresh[k].push(...e[k]);
  Object.assign(g, { seq: snap.seq, seen: Math.max(g.seen, snap.tick), quiet: 0, buf: [...g.buf.filter((s) => s.tick < snap.tick), snap].slice(-KEEP) });
}

function drawn(g, dt) {
  const { tick } = g.buf.at(-1);
  g.t = Math.min(tick - BEHIND / 2, Math.max(tick - BEHIND, g.t + dt * TICK_HZ));
  const out = { ...blend(g.buf, g.t), ...g.fresh };
  g.fresh = noEvents();
  return out;
}
