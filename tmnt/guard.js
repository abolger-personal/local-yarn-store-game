// REUSE-SPEC.md §Level 3: the Sock Clan guard the pizza. Each soldier has a post on the ground between two structures;
// a hero who comes near on the ground is chased and punched, and the soldier goes back to its post after. Combat is
// the donut fighters', ring-outs and all; a soldier rung out, or knocked into the back fence, stands behind the back
// fence for a time out, and is allowed back to its post when it ends. Engine-free: the brain reads snapshots, as spinoff/cpu.js.
import { TICK_HZ } from '../spinoff/match.js';

/** @typedef {import('../spinoff/match.js').Snapshot} Snapshot @typedef {{ x: number, z: number }} Post */

/**
 * see: how near its post a hero is chased; low: only heroes this near the ground; pace: its speed, of a hero's;
 * react, every: as the donut fighters' CPU, half a second to notice and a punch every 0.8 s; near: a punch's reach
 * past the two bodies; home: how near its post is back; timeout: how long it stays behind the fence.
 */
export const GUARD = Object.freeze({
  see: 5, low: 1.2, pace: 0.25, react: Math.round(0.5 * TICK_HZ), every: Math.round(0.8 * TICK_HZ), near: 0.35, home: 0.5, timeout: 120 * TICK_HZ,
});
/** A knocked soldier this near the back fence has gone over it. */
const FENCE_NEAR = 0.05;
const IDLE = Object.freeze({ target: null, punch: false, kick: false });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The hero nearest `post` that it guards against: in play, near the ground, within sight of the post. */
function intruder(snap, post) {
  return snap.fighters.filter((f) => f.team === 'heroes' && !f.respawn && f.y <= GUARD.low && flat(f, post) <= GUARD.see)
    .sort((a, b) => flat(a, post) - flat(b, post))[0] ?? null;
}

/** Is `kid` in front of `me`, close enough to punch? */
function inReach(me, kid) {
  const dx = kid.x - me.x, dz = kid.z - me.z, along = dx * Math.cos(me.facing) + dz * Math.sin(me.facing);
  return along > 0 && flat(me, kid) - (me.width + kid.width) / 2 <= GUARD.near && Math.abs(kid.y - me.y) < me.height;
}

/** One soldier's brain. @param {string} id @param {Post} post */
export function createGuard(id, post) {
  const b = { want: '', since: 0, sent: '', next: 0 };
  return {
    id, post, away: false,
    /** @param {Snapshot} snap */
    input(snap) {
      const me = snap.fighters.find((f) => f.id === id);
      if (!me || me.respawn) return IDLE;
      const kid = intruder(snap, post), home = flat(me, post) > GUARD.home ? { x: post.x, z: post.z } : { stop: true };
      const target = kid ? { thing: 'fighter', id: kid.id } : home, key = JSON.stringify(target);
      if (key !== b.want) Object.assign(b, { want: key, since: snap.tick });
      if (snap.tick - b.since < GUARD.react) return IDLE;
      const send = key !== b.sent, punch = Boolean(kid) && me.onGround && snap.tick >= b.next && inReach(me, kid);
      b.sent = key;
      if (punch) b.next = snap.tick + GUARD.every;
      return { target: send ? target : null, punch, kick: false };
    },
  };
}

/**
 * After a tick of sim `s`: a soldier rung out as in the donut fighters (knocked off the front or an end), or knocked
 * into the back fence, is put behind the back fence (at `z`) where it went out, for its time out; one whose time is up
 * is back at its post. The ones sent over this tick, and from where.
 * @param {any} s @param {ReturnType<typeof createGuard>[]} guards @param {number} z
 */
export function guardTick(s, guards, z) {
  const sent = [], { x0, x1, z0 } = s.band;
  for (const g of guards) {
    const f = s.fighters.find((o) => o.id === g.id), rung = s.ringOuts.find((o) => o.fighter === g.id);
    if (g.away && !f.out) {
      g.away = false;
      Object.assign(f, { x: g.post.x, y: 0, z: g.post.z, facing: Math.PI });
    }
    const from = rung ?? (!f.out && f.stun > 0 && f.z <= z0 + f.r + FENCE_NEAR ? { x: f.x, y: f.y, z: f.z } : null);
    if (!from || g.away) continue;
    sent.push({ id: g.id, x: from.x, y: from.y, z: from.z });
    Object.assign(f, { out: GUARD.timeout, x: Math.min(x1, Math.max(x0, from.x)), y: 0, z, vx: 0, vy: 0, vz: 0, onGround: true, stun: 0, freeze: 0, pending: null,
      attack: null, target: null, nav: null, percent: 0 });
    g.away = true;
  }
  return sent;
}
