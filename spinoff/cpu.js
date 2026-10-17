// A CPU bad guy is a fake player on the host (REUSE-SPEC.md §Bad guys, AI is a fake player): it reads the snapshot a
// tablet draws and answers with the Input a tablet sends, so it can do nothing a player can't.
// ponytail: one state machine for every CPU bad guy; Chase, Scoop and Power wait for the levels that bring them.
import { BRICK, TICK_HZ } from './match.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').Input} Input @typedef {import('./match.js').Target} Target */

/** Fair to 4-year-olds: about half a second before acting on anything new, and at most one attack every 0.8 s. */
export const REACT_TICKS = Math.round(0.5 * TICK_HZ);
export const ATTACK_TICKS = Math.round(0.8 * TICK_HZ);
/** A kick lands on a block whose nearest side is this close to the front of the fighter's body. */
const KICK_NEAR = 0.375;
/** Blocks this close to the nearest one count as "in its way": it kicks the weakest of them. */
const WALL_NEAR = 0.9;
const IDLE = Object.freeze({ target: null, punch: false, kick: false });
const OTHER = /** @type {const} */ ({ heroes: 'badGuys', badGuys: 'heroes' });

/**
 * Raid while its shelf holds no hero donuts, defend (home, standing guard) once it holds one, and run home to bank
 * whatever it carries (REUSE-SPEC.md §Forts, Level 2). Heroes' donuts are the ones without the villains' drizzle.
 * @param {Snapshot} snap @param {FighterState} me @returns {'raid'|'defend'|'home'}
 */
export function modeOf(snap, me) {
  if (me.carrying) return 'home';
  const home = snap.shelves.find((s) => s.team === me.team);
  return home?.donuts.some((d) => !d.stripe) ? 'defend' : 'raid';
}

const gapTo = (me, b) => Math.hypot(Math.max(b.x - me.x, 0, me.x - b.x - BRICK), Math.max(b.z - me.z, 0, me.z - b.z - BRICK));

/** Stood blocked on a raid: the weakest of the other team's blocks nearest it, low before high. @param {Snapshot} snap @param {FighterState} me */
function weakest(snap, me) {
  const theirs = snap.bricks.filter((b) => b.team !== me.team && b.y < me.y + me.height && b.y + BRICK > me.y);
  const near = Math.min(...theirs.map((b) => gapTo(me, b)));
  return theirs.filter((b) => gapTo(me, b) <= near + WALL_NEAR)
    .sort((a, b) => a.hits - b.hits || a.y - b.y || gapTo(me, a) - gapTo(me, b))[0] ?? null;
}

/** Where it heads: a block of theirs it is breaking through, else the shelf its mode says. @returns {Target} */
function aimFor(b, snap, me) {
  const mode = modeOf(snap, me);
  if (mode !== 'raid' || !snap.bricks.some((x) => x.id === b.brick)) b.brick = null;
  if (mode === 'raid' && !b.brick && me.move === 'blocked') b.brick = weakest(snap, me)?.id ?? null;
  return b.brick ? { thing: 'brick', id: b.brick } : { thing: 'shelf', team: mode === 'raid' ? OTHER[me.team] : me.team };
}

/** Kicks the block it came for once it stands at it, no sooner than ATTACK_TICKS after the last kick. */
function kickNow(b, snap, me) {
  const brick = b.brick && snap.bricks.find((x) => x.id === b.brick);
  if (!brick || !me.onGround || me.move === 'walk' || gapTo(me, brick) > me.width / 2 + KICK_NEAR || snap.tick < b.nextKick) return false;
  b.nextKick = snap.tick + ATTACK_TICKS;
  return true;
}

/** One CPU bad guy's brain. @param {string} id */
export function createCpu(id) {
  const b = { want: '', since: 0, sent: '', brick: null, nextKick: 0 };
  return {
    id,
    /** @param {Snapshot} snap @returns {Input} */
    input(snap) {
      const me = snap.fighters.find((f) => f.id === id);
      if (!me || me.respawn || snap.phase === 'build' || snap.over) return IDLE;
      const target = aimFor(b, snap, me), key = JSON.stringify(target);
      if (key !== b.want) Object.assign(b, { want: key, since: snap.tick });
      if (snap.tick - b.since < REACT_TICKS) return IDLE;
      const send = key !== b.sent;
      b.sent = key;
      return { target: send ? target : null, punch: false, kick: kickNow(b, snap, me) };
    },
  };
}
