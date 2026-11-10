// The donut game (REUSE-SPEC.md §Mode, §Scoring): capture the flag with donuts. Shelves to steal from and bank on,
// guards, loose donuts and picking them up, targets by thing (shelf, pile, donut, brick, fighter), ring-outs and
// respawning, the power bar, who leads. Uses world.js and walk.js for where things are, and gives combat its loot
// (`drop`, set as `s.drop`) and walking its answers (sim.js MIND).
import { BRICK, DONUTS_PER_SHELF, SHELF_WIDTH, TICK_HZ, outside as toBox } from './match.js';
import { EMPTY, anySlot, footprint, lift, makeDisplay, place, topAt } from '../inventory/grid.js';
import { CELL, DT, GRAVITY, STEP, brickBox, clamp, flat, inXZ, supportAt } from './world.js';
import { FOLLOW_GAP, WP_ARRIVE, besideGoal, brickGoal, facingGoal, pointGoal } from './walk.js';

export const RESPAWN_Y = 3;
const RESPAWN_DZ = 0.6;
export const INVINCIBLE_TICKS = 2 * TICK_HZ;
/** After a ring-out the faller is out of play this long, then drops in (REUSE-SPEC.md §Scoring; 2-5 s to tune). */
export const RESPAWN_WAIT = 3 * TICK_HZ;
/** A ring-out counts for whoever hit the fighter last, if that was this recent. */
const CREDIT_TICKS = 5 * TICK_HZ;
/** The power bar, 0 to 1: a little a second in play, and more for each of these. */
export const POWER = Object.freeze({ perSecond: 1 / 45, hit: 0.06, ringOut: 0.12, pickup: 0.05, steal: 0.15, bank: 0.25 });
const DONUT_REACH = 0.25;
const DONUT_EDGE = 0.1;
const SHELF_REACH = 0.3;
/** How far in front of their shelf a foe stands guard: deep enough for where a ring-out drops them in. */
export const GUARD_REACH = 1;
const SHELF_GAP = 0.05;
const SHELF_H = 2;
const SHELF_COLS = 4;
const SPAWN_GAP = 0.6;
const SPAWN_ROW = 3;
const SPAWN_Z = 0.2;
export const DUMMY = Object.freeze({ x: -3, z: 0.3, gap: 0.8 });
const DEFAULT_LOOKS = Object.freeze({
  heroes: Object.freeze({ dough: '#e8c48a', frosting: '#ff3b7f', stripe: false }),
  badGuys: Object.freeze({ dough: '#2a1a14', frosting: '#7a2bbf', stripe: true }),
});
export const BAD_ICING = '#4a1d6b';

export const shelfBox = (z0) => (sh) => ({ x0: sh.x - sh.half, x1: sh.x + sh.half, z0, z1: sh.z, y0: sh.y, y1: sh.y + SHELF_H, kind: 'shelf' });
export const shelfOf = (s, team) => s.shelves.find((sh) => sh.team === team);
/** In front of the shelf: touching it anywhere along its front, or with `side` 0, your middle in front of it (REUSE-SPEC.md §Mode). */
const standingAt = (f, sh, reach = SHELF_REACH, side = f.r) => f.onGround && Math.abs(f.y - sh.y) <= STEP
  && Math.abs(f.x - sh.x) < sh.half + side && f.z >= sh.z && f.z - sh.z < f.r + reach;
/** REUSE-SPEC.md §Mode: a guard standing in front of its shelf blocks the grab; one knocked to its end doesn't. */
const guarding = (s, f) => standingAt(f, shelfOf(s, f.team), GUARD_REACH, 0);
const guardOf = (s, team) => s.fighters.find((o) => o.team === team && guarding(s, o));

/** The nearest spot touching the shelf's front; empty-handed at your own, right in front of it (to guard) where there's room.
 * Picked once a tap, again when the blocks or your hands change. */
function shelfGoal(s, f, sh) {
  const why = `${sh.team}/${s.brickKey}/${Boolean(f.carrying)}`;
  if (f.shelfSpot?.why === why) return f.shelfSpot.goal;
  const z = sh.z + f.r + SHELF_GAP, n = Math.ceil((sh.half + f.r) / CELL), at = (p) => ({ ...p, r: f.r, onGround: true });
  const off = (p) => Number(sh.team === f.team && !f.carrying && !standingAt(at(p), sh, SHELF_REACH, 0));
  const spots = Array.from({ length: 2 * n + 1 }, (_, i) => pointGoal(s, f, sh.x + (i - n) * CELL, z, sh.y))
    .filter((p) => standingAt(at(p), sh))
    .sort((a, b) => off(a) - off(b) || flat(f, a) - flat(f, b));
  f.shelfSpot = { why, goal: { ...(spots[0] ?? pointGoal(s, f, sh.x, z, sh.y)), face: sh } };
  return f.shelfSpot.goal;
}

function thingGoal(s, f, t) {
  if (t.thing === 'shelf') {
    // REUSE-SPEC.md §Mode: a guarded shelf walks you up to the guard instead, facing it
    const guard = t.team !== f.team && guardOf(s, t.team);
    if (guard) return besideGoal(s, f, guard);
    return shelfGoal(s, f, shelfOf(s, t.team));
  }
  if (t.thing === 'pile') {
    const pile = s.piles.find((p) => p.owner === t.id);
    return pile ? { ...pointGoal(s, f, pile.x, pile.z, pile.y), face: pile } : null;
  }
  const list = { donut: s.donuts, brick: s.bricks, fighter: s.fighters }[t.thing];
  // a fighter rung out is gone until it drops in: chasing it would walk you to its shelf (playtest)
  const it = list?.find((o) => o.id === t.id && o !== f && !(o.out > 0));
  if (!it) return null;
  if (t.thing === 'brick') return brickGoal(s, f, it);
  if (t.thing === 'donut') return { ...pointGoal(s, f, it.x, it.z, it.y), face: it };
  return facingGoal(s, f, it);
}

export function resolve(s, f) {
  const t = f.target;
  if ('x' in t) return f.placeCell ? brickGoal(s, f, f.placeCell) : pointGoal(s, f, t.x, t.z, t.y);
  const g = thingGoal(s, f, t);
  if (!g) f.target = null;
  return g;
}

export function drop(s, f, d) {
  if (!f.carrying) return false;
  s.donuts.push({ id: `d${s.nextDonut++}`, ...d, look: f.carrying, by: f.id });
  f.carrying = null;
  return true;
}

export function ringOut(s, f) {
  const r = s.stage.ringOut;
  if (f.x >= r.x0 && f.x <= r.x1 && f.z <= r.z1 && f.y >= r.y) return;
  const b = s.band, x = clamp(f.x, b.x0 + DONUT_EDGE, b.x1 - DONUT_EDGE), z = clamp(f.z, b.z0 + DONUT_EDGE, b.z1 - DONUT_EDGE);
  drop(s, f, { x, y: supportAt(s.solids, x, z, Infinity), z, vx: 0, vy: 0, vz: 0 });
  s.ringOuts.push({ fighter: f.id, by: f.lastHit && s.tick - f.lastHit.at <= CREDIT_TICKS ? f.lastHit.by : null, x: f.x, y: f.y, z: f.z });
  const sh = shelfOf(s, f.team);
  Object.assign(f, { x: sh.x, y: sh.y + RESPAWN_Y, z: sh.z + RESPAWN_DZ, vx: 0, vy: 0, vz: 0, onGround: false,
    jumps: 1, airTo: null, attack: null, stun: 0, pending: null, freeze: 0, percent: 0, calm: 0, inv: 0, out: RESPAWN_WAIT,
    nav: null, navJump: null, stuck: 0, chain: 0, lastHit: null, hitBy: [], toy: null, peak: sh.y + RESPAWN_Y });
}

/** A kid standing still beside its team's block: there's a wall for a bad guy to kick, so the kid in its gap holds (playtest). */
const walled = (s, f) => s.bricks.some((b) => b.team === f.team && b.y < f.y + f.h && b.y + BRICK > f.y && toBox(brickBox(b), f.x, f.z) < f.r + BRICK);
/** A guard at its shelf, or a kid standing still in a wall, isn't shoved by a fighter walking into it. */
export function holds(s, f) {
  return guarding(s, f) || (f.team === 'heroes' && f.onGround && !f.walkTo && walled(s, f));
}

// --- bricks and donuts ----------------------------------------------------------------------

export function stepDonut(s, d) {
  const prev = { x: d.x, y: d.y, z: d.z }, { band } = s;
  d.vy -= GRAVITY * DT;
  d.x = clamp(d.x + d.vx * DT, band.x0 + DONUT_EDGE, band.x1 - DONUT_EDGE);
  d.z = clamp(d.z + d.vz * DT, band.z0 + DONUT_EDGE, band.z1 - DONUT_EDGE);
  d.y += d.vy * DT;
  if (s.solids.some((b) => inXZ(b, d.x, d.z) && prev.y < b.y1 - STEP && d.y < b.y1 && !inXZ(b, prev.x, prev.z)))
    Object.assign(d, { x: prev.x, z: prev.z, vx: 0, vz: 0 });
  const top = supportAt(s.solids, d.x, d.z, prev.y);
  if (d.y <= top) Object.assign(d, { y: top, vx: 0, vy: 0, vz: 0 });
}

// --- shelves --------------------------------------------------------------------------------

export function grab(shelf) {
  const { g } = shelf;
  for (let lv = g.shelves - 1; lv >= 0; lv--)
    for (let c = g.cols - 1; c >= 0; c--) {
      const index = topAt(g, lv, c, 0);
      if (index === EMPTY) continue;
      lift(g, footprint(g, lv, [c, 0], [1, 1]));
      return shelf.items[index];
    }
  return null;
}

function bank(shelf, look) {
  const spot = anySlot(shelf.g, { w: 1, h: 1 }, { turn: false });
  if (!spot) return false;
  shelf.items.push(look);
  place(shelf.g, spot.keys, shelf.items.length - 1);
  return true;
}

const touching = (f, d) => flat(f, d) < f.r + DONUT_REACH && d.y >= f.y - 0.1 && d.y <= f.y + f.h;
export const event = (f, p) => ({ fighter: f.id, x: p.x, y: p.y, z: p.z });

export function touchDonuts(s, f) {
  const now = s.donuts.filter((d) => touching(f, d));
  for (const d of now) {
    // A full bag says so once per touch; a tapped donut is picked up even if it landed on you first
    if (f.carrying) { if (!f.touching.includes(d.id)) s.fullBag.push({ ...event(f, d), donut: d.id }); }
    else if (f.target?.thing === 'donut' && f.target.id === d.id) {
      f.carrying = d.look;
      s.donuts = s.donuts.filter((o) => o !== d);
      f.target = null;
      s.donutEvents.push({ ...event(f, d), kind: 'pickup' });
    }
  }
  f.touching = now.map((d) => d.id);
}

/** Walking up to a guarded shelf: the guard shakes "no" (the full-bag event) once each time. True while guarded. */
function guardStep(s, f) {
  const t = f.target, guard = t?.thing === 'shelf' && t.team !== f.team && guardOf(s, t.team);
  const by = Boolean(guard) && f.onGround && flat(f, guard) < f.r + guard.r + FOLLOW_GAP + WP_ARRIVE;
  if (by && !f.blocked) s.fullBag.push(event(guard, guard));
  f.blocked = by;
  return Boolean(guard);
}

export function shelfStep(s, f) {
  if (guardStep(s, f)) return;
  const sh = s.shelves.find((o) => standingAt(f, o));
  if (!sh) { f.shelfDone = false; return; }
  if (sh.team === f.team) {
    if (f.carrying && bank(sh, f.carrying)) {
      f.carrying = null;
      s.donutEvents.push({ ...event(f, sh), kind: 'bank' });
    }
    return;
  }
  if (f.shelfDone || f.target?.thing !== 'shelf' || f.target.team !== sh.team) return;
  f.shelfDone = true;
  grabAt(s, f, sh);
}

/** REUSE-SPEC.md §Scoring: one donut at a time for a bad guy; while one it dropped is loose, a shelf gives it nothing. Kids are free. */
function grabAt(s, f, sh) {
  if (f.carrying || (f.team === 'badGuys' && s.donuts.some((d) => d.by === f.id))) { s.fullBag.push(event(f, sh)); return; }
  if ((f.carrying = grab(sh))) s.donutEvents.push({ ...event(f, sh), kind: 'steal' });
}

export const teamLooks = (entrants, team) => {
  const looks = entrants.filter((e) => e.team === team).map((e) => e.look);
  return looks.length ? looks : [DEFAULT_LOOKS[team]];
};
export const icingOf = (entrants, team) => (team === 'badGuys' ? BAD_ICING : teamLooks(entrants, team)[0].frosting);

export function makeShelf(spot, looks) {
  const levels = Math.ceil((2 * DONUTS_PER_SHELF) / SHELF_COLS);
  const g = makeDisplay(SHELF_COLS, 1, { shelves: levels, headroom: 1 });
  const shelf = { team: spot.team, x: spot.x, y: spot.y, z: spot.z, half: SHELF_WIDTH / 2, g, items: [] };
  for (let i = 0; i < DONUTS_PER_SHELF; i++) bank(shelf, looks[i % looks.length]);
  return shelf;
}

export function spawnSpot(s, e, cursor) {
  if (e.dummy) return { x: DUMMY.x + DUMMY.gap * cursor.dummies++, z: DUMMY.z };
  // REUSE-SPEC.md §Forts, Start spots come first
  const spot = e.team === 'heroes' && s.stage.starts?.[cursor.starts++];
  if (spot) return spot;
  const sh = shelfOf(s, e.team), dir = sh.x < 0 ? 1 : -1, k = (cursor[e.team] = (cursor[e.team] ?? -1) + 1);
  return { x: sh.x + dir * SPAWN_GAP * (1 + (k % SPAWN_ROW)), z: SPAWN_Z + SPAWN_GAP * Math.floor(k / SPAWN_ROW) };
}

/** The bar fills a little a second in play, and more for what this tick's events say each fighter did. */
export function powerUp(s) {
  if (s.phase !== 'play') return;
  const byId = new Map(s.fighters.map((f) => [f.id, f])), gain = (f, k) => { if (f) f.power = Math.min(1, f.power + k); };
  for (const f of s.fighters) if (!f.out) gain(f, POWER.perSecond / TICK_HZ);
  for (const h of s.hits) if (h.on === 'fighter') gain(byId.get(h.by), POWER.hit);
  for (const e of s.ringOuts) if (e.by) gain(byId.get(e.by), POWER.ringOut);
  for (const e of s.donutEvents) if (e.kind in POWER) gain(byId.get(e.fighter), POWER[e.kind]);
}

export function shelfLooks(sh) {
  const out = [];
  for (let lv = 0; lv < sh.g.shelves; lv++)
    for (let c = 0; c < sh.g.cols; c++) {
      const index = topAt(sh.g, lv, c, 0);
      if (index !== EMPTY) out.push({ ...sh.items[index] });
    }
  return out;
}

/** The team with more donuts on its shelf, or null for a tie. */
export function leader(s) {
  const [heroes, badGuys] = ['heroes', 'badGuys'].map((t) => shelfLooks(shelfOf(s, t)).length);
  if (heroes === badGuys) return null;
  return heroes > badGuys ? 'heroes' : 'badGuys';
}
