// REUSE-SPEC.md §Level 1, Pieces as modules: a level is structures strung from the playground's pieces (pieces.js),
// whose ends join, with ground between them, until it takes 90 s to 2 min. A pure function of the seed, so the host
// sends the seed and every tablet builds the same level; it is a donut fighters' Stage (spinoff/match.js) plus the
// pieces' climbs, rides, stairs, swings and bridges, which the level page teaches the fighters to use.
import { rng } from '../spinoff/generate.js';
import { WALK_SPEED } from '../spinoff/walk.js';
import { FT, JUMP_FT, PIECES, joins } from './pieces.js';

/**
 * @typedef {import('../spinoff/match.js').Floor} Floor
 * @typedef {{ x: number, z: number, h: number }} Cursor  where the next piece starts, and its heading (degrees from x toward z)
 * @typedef {Floor & { y0: number, y1: number, h: number, kind: string }} Climb  the climb's face, up from y0 to y1 along heading h
 * @typedef {{ x0: number, z0: number, y0: number, x1: number, z1: number, y1: number, kind: string, h: number, top?: number, box: Box }} Path
 *   a ride or stairs, running along heading h, `box` the ground it stands on
 * @typedef {{ x0: number, x1: number, z0: number, z1: number }} Box
 * @typedef {{ x: number, z: number, y: number, h: number, arm: number, span: number, kind: string }} Pivot
 *   a swing's or a bar's: it swings along heading h, the bar `span` long across that
 * @typedef {{ x: number, z: number }} Spot
 * @typedef {Omit<import('../spinoff/match.js').Stage, 'floors'> & { floors: Floor[], climbs: Climb[], rides: Path[],
 *   stairs: Path[], swings: Pivot[], bridges: (Floor & { h: number })[], bursts: Spot[], covers: Spot[], structures: string[][],
 *   spans: { x0: number, x1: number }[], seconds: number, slices: { x: number, y: number, z: number }[] }} Level
 */

// REUSE-SPEC.md §Level 1: 90 s to 2 min for the designer, fighting included; structures 3 to 5 s' walk apart
export const SECONDS = Object.freeze({ min: 90, max: 120 });
const GAP = Object.freeze({ min: 3, max: 5 });
// ponytail: a guess at each ground stretch's fight, for the time budget; tune it once bad guys fight
const FIGHT_SECONDS = 6;
// how fast a hero climbs, rides and swings, game units a second, and a swing or bar's go round, for the budget
const CLIMB = 1.2, SWING_SECONDS = 2;
// REUSE-SPEC.md §Level 1: long structures, fewer to a level (decided 2026-11-10), pieces to a string
const STRING = Object.freeze({ min: 7, max: 14 });
const GROUND_PIECES = ['bars', 'swings'];
const MAIN = Object.values(PIECES).filter((p) => !GROUND_PIECES.includes(p.id));
// REUSE-SPEC.md §Level 1, Building it: the band, and how broad a structure's pieces are across their run (7 ft)
export const BAND = Object.freeze({ z0: -2, z1: 2 });
const BREADTH = 7 * FT, EDGE = BAND.z1 - BREADTH / 2;
// a structure turns 90° at a join (decided 2026-11-10: 90° only, it's a playground), never back on itself or
// heading backwards; mostly it runs on straight
const TURNS = [0, 90, -90];
// tries at turning a structure so it shuts the ground, before trying another structure
const TRIES = 10;

const r3 = (v) => Math.round(v * 1000) / 1000;

/** How many pieces it takes, at least, to get from `h` ft up down to the ground. */
const DOWN = (() => {
  const heights = [...new Set(MAIN.flatMap((p) => [p.in, p.out]))], dist = new Map([[0, 0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const h of heights) for (const p of MAIN) {
      const d = dist.get(p.out);
      if (h !== 0 && joins(h, p.in) && d !== undefined && (dist.get(h) ?? Infinity) > d + 1) { dist.set(h, d + 1); changed = true; }
    }
  }
  return dist;
})();

/** How long a hero takes through piece `p`: across it, up its climbs, round its swings. */
export function secondsOf(p) {
  const climb = (p.climbs ?? []).reduce((t, c) => t + (c.y1 - c.y0) * FT / CLIMB, 0);
  return (p.w * FT) / WALK_SPEED + climb + (p.swings ?? []).length * SWING_SECONDS;
}

/** From the ground a structure starts with a way up, or a jump onto a deck or the bridge, not onto a climb or stairs. */
const landsOn = (p) => p.in <= JUMP_FT && (Boolean(p.bridge) || (p.decks ?? []).some((d) => d.y === p.in));

/** The pieces that can come next after `ids`, leaving `out` ft up, with room left to get back down. */
function nextPieces(ids, out) {
  const n = ids.length + 1;
  // REUSE-SPEC.md §Level 1: the same piece twice in a row is fine, and so is jumping straight on (you tap where you go)
  return MAIN.filter((p) => joins(out, p.in) && (out > 0 || p.in === 0 || landsOn(p))
    && (p.out > 0 ? n + (DOWN.get(p.out) ?? Infinity) <= STRING.max : n >= STRING.min));
}

/** One structure: pieces from the ground up and back down, ends joining, `STRING.min` to `max` long. */
export function structure(r) {
  /** @type {string[]} */
  const ids = [];
  let out = 0;
  do {
    const can = nextPieces(ids, out);
    if (!can.length) throw new Error(`no piece follows ${ids.join(' ')}`);
    const p = can[Math.floor(r() * can.length)];
    ids.push(p.id);
    ({ out } = p);
  } while (out > 0);
  return ids;
}

const stringSeconds = (ids) => ids.reduce((t, id) => t + secondsOf(PIECES[id]), 0);

/** A structure taking no more than `seconds` that is `ok`, trying the seed's next draws till one is. */
function shortStructure(r, seconds, ok = (_ids) => true) {
  for (;;) {
    const ids = structure(r);
    if (stringSeconds(ids) <= seconds && ok(ids)) return ids;
  }
}

const dirOf = (h) => ({ x: r3(Math.cos((h * Math.PI) / 180)), z: r3(Math.sin((h * Math.PI) / 180)) });
/** The point `a` (game units) along the cursor's heading. */
const along = (c, a) => ({ x: r3(c.x + dirOf(c.h).x * a), z: r3(c.z + dirOf(c.h).z * a) });

/** The box over `a0..a1` along the cursor's heading, `breadth` across, trimmed to the band where it meets an edge. */
function strip(c, a0, a1, breadth = BREADTH) {
  const m = along(c, (a0 + a1) / 2), l = (a1 - a0) / 2, b = breadth / 2, [hx, hz] = c.h === 0 ? [l, b] : [b, l];
  return { x0: r3(m.x - hx), x1: r3(m.x + hx), z0: r3(Math.max(BAND.z0, m.z - hz)), z1: r3(Math.min(BAND.z1, m.z + hz)) };
}

// a hero needs this much room each side to get through on the ground; the grid the way through is looked for on
const CLEAR = 0.15, CELL = 0.05;

/** Do floors shut the ground from x0 to x1: no way through on foot, round them in depth or between them? */
export function blocks(floors, x0, x1) {
  const nx = Math.ceil((x1 - x0 + 2) / CELL), nz = Math.floor((BAND.z1 - BAND.z0 - 2 * CLEAR) / CELL) + 1;
  const near = floors.filter((f) => f.x1 > x0 - 1 && f.x0 < x1 + 1);
  const open = (i, k) => {
    const x = x0 - 1 + i * CELL, z = BAND.z0 + CLEAR + k * CELL;
    return !near.some((f) => x > f.x0 - CLEAR && x < f.x1 + CLEAR && z > f.z0 - CLEAR && z < f.z1 + CLEAR);
  };
  const seen = new Set(), todo = [];
  for (let k = 0; k < nz; k++) if (open(0, k)) todo.push([0, k]);
  while (todo.length) {
    const [i, k] = todo.pop(), key = i * nz + k;
    if (seen.has(key) || i < 0 || i >= nx || k < 0 || k >= nz || !open(i, k)) continue;
    if (i === nx - 1) return false;
    seen.add(key);
    todo.push([i + 1, k], [i - 1, k], [i, k + 1], [i, k - 1]);
  }
  return true;
}

/** Does a piece `len` long from cursor `c` keep its run inside the band? */
const fits = (c, len) => Math.abs(along(c, len).z) <= BAND.z1 + 1e-6;

/** The cursor turned to heading `h`: round a corner, the next piece starts off the last one's side, back from its end,
 *  so they share an edge and neither lies over the other (playtest 2026-11-12: slides and bridges half inside decks). */
function corner(c, h) {
  if (h === c.h) return c;
  const from = dirOf(c.h), to = dirOf(h), half = BREADTH / 2;
  return { x: r3(c.x + (to.x - from.x) * half), z: r3(c.z + (to.z - from.z) * half), h };
}

/** The cursor turned for the next piece, `len` long: a seeded turn of TURNS that keeps it in the band. Heading for the
 *  far side is likelier, since crossing it is what shuts the ground, and so is keeping on as it was, for long runs
 *  (straight on always fits). */
function turn(r, c, len) {
  const can = TURNS.map((d) => c.h + d).filter((h) => Math.abs(h) <= 90 && fits(corner(c, h), len));
  const weight = (h) => (h !== 0 && Math.sign(h) === -Math.sign(c.z) ? 3 : 1) * (h === c.h ? 3 : 1), total = can.reduce((t, h) => t + weight(h), 0);
  let pick = r() * total;
  return corner(c, can.find((h) => (pick -= weight(h)) < 0) ?? 0);
}

/** Piece `p` laid from cursor `c` into level parts `L`; returns the cursor at its far end. */
function place(L, p, c) {
  const at = (v) => v * FT, top = (d) => ({ kind: /** @type {const} */ ('deck'), ...strip(c, at(d.x0), at(d.x1)), y: r3(at(d.y)) });
  L.floors.push(...(p.decks ?? []).map(top));
  if (p.bridge) {
    const b = { ...top(p.bridge), h: c.h };
    L.floors.push(b);
    L.bridges.push(b);
  }
  for (const k of p.climbs ?? []) L.climbs.push({ ...strip(c, at(k.x0), at(k.x1)), y0: r3(at(k.y0)), y1: r3(at(k.y1)), h: c.h, kind: k.kind });
  const path = (q, kind) => {
    const a = along(c, at(q.x0)), b = along(c, at(q.x1));
    return { x0: a.x, z0: a.z, y0: r3(at(q.y0)), x1: b.x, z1: b.z, y1: r3(at(q.y1)), kind, h: c.h, ...(q.top === undefined ? {} : { top: r3(at(q.top)) }), box: strip(c, at(q.x0), at(q.x1)) };
  };
  L.rides.push(...(p.rides ?? []).map((q) => path(q, q.kind)));
  L.stairs.push(...(p.stairs ?? []).map((q) => path(q, 'stairs')));
  L.swings.push(...(p.swings ?? []).map((w) => ({ ...along(c, at(w.x)), y: r3(at(w.y)), h: c.h, arm: r3(at(w.arm)), span: r3(at(w.span)), kind: w.kind })));
  if (p.burst !== undefined) L.bursts.push(along(c, at(p.burst)));
  L.covers.push(...(p.cover ?? []).map((v) => along(c, at(v))));
  return { ...along(c, at(p.w)), h: c.h };
}

/** What of a structure stands on the ground, in a hero's way: its decks, climbs and stairs (under a slide is open). */
export const standing = (T) => [...T.floors.filter((f) => f.kind !== 'ground'), ...T.climbs, ...T.stairs.map((q) => q.box)];

/** Empty lists for a structure's parts, to lay it out and keep it only if it shuts the ground. */
const parts = () => ({ floors: [], climbs: [], rides: [], stairs: [], swings: [], bridges: [], bursts: [], covers: [] });

/** Everything of a structure seen from above: what stands, and its slides. */
const footprint = (T) => [...standing(T), ...T.rides.filter((q) => q.kind === 'slide').map((q) => q.box)];
/** How much ground two boxes share. */
const shared = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

/** Structure `ids` from x, turning as the seed says; `tidy` if no piece lies over another (doubling back can); its parts and how far along x it reaches. */
function lay(r, ids, x) {
  const T = parts();
  // from near one edge, so a turn can carry it across the band
  let c = { x, z: r3((r() < 0.5 ? -1 : 1) * (EDGE + r() * (BAND.z1 - EDGE))), h: 0 };
  let tidy = true;
  for (const id of ids) {
    const before = footprint(T);
    c = place(T, PIECES[id], turn(r, c, PIECES[id].w * FT));
    tidy &&= !footprint(T).some((a) => !before.includes(a) && before.some((b) => shared(a, b) > 0.01));
  }
  const all = standing(T);
  return { T, tidy, x0: Math.min(x, ...all.map((f) => f.x0)), x1: Math.max(c.x, ...all.map((f) => f.x1)) };
}

/** A structure from x, turned till it shuts the ground: a few seeded turnings of each of the seed's structures, the
 *  next structure when none of them does; never stretched across the band (a deck stays 7 ft deep, as a real one). */
function build(L, r, x, ok) {
  // room for it in the time budget, with a ground stretch after it
  const room = SECONDS.max - L.seconds - GAP.max - FIGHT_SECONDS;
  for (;;) {
    const ids = shortStructure(r, room, ok);
    for (let i = 0; i < TRIES; i++) {
      const { T, tidy, x0, x1 } = lay(r, ids, x);
      if (tidy && blocks(standing(T), x0, x1)) return keep(L, T, ids, x0, x1);
    }
  }
}

function keep(L, T, ids, x0, x1) {
  for (const k of Object.keys(T)) L[k].push(...T[k]);
  L.structures.push(ids);
  L.spans.push({ x0: r3(x0), x1: r3(x1) });
  L.seconds += stringSeconds(ids);
  return x1;
}

/** A ground stretch, 3 to 5 s' walk, sometimes with the bars or the swings in the middle (`always`: with that one);
 *  returns where it ends. */
function gap(L, r, x, always = null) {
  const seconds = GAP.min + r() * (GAP.max - GAP.min), len = seconds * WALK_SPEED, drawn = PIECES[GROUND_PIECES[Math.floor(r() * 2)]];
  const extra = always ? PIECES[always] : drawn, some = r() < 0.5;
  L.seconds += seconds + FIGHT_SECONDS;
  if (always || some) {
    place(L, extra, { x: x + (len - extra.w * FT) / 2, z: 0, h: 0 });
    L.seconds += (extra.swings ?? []).length * SWING_SECONDS;
  }
  return x + len;
}

/** @returns {Level} an empty level, its one hero start and shelf at the left end (spinoff/sim.js needs a shelf) */
const emptyLevel = () => ({
  ...parts(), backWall: BAND.z0, shelves: [{ team: 'heroes', x: 0.5, z: -1.7, y: 0 }], zones: [], puddles: [], bricks: [],
  ringOut: { x0: -2, x1: 0, z1: 3.5, y: -3 }, starts: [{ x: 1, z: 0 }], structures: [], spans: [], seconds: 0, slices: [],
});

// a climb is solid to its top, and so is a flight of stairs, to its high end: equipment.js takes a hero up either
// (playtest 2026-11-12: as steps, each was narrower than a hero, who bounced at the foot of a flight for ever)
const solidTo = (b, y) => ({ kind: /** @type {const} */ ('deck'), x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y });

/** A flight of stairs as something to climb: up its slope from its low end. @param {Path} q @returns {Climb} */
const stairClimb = (q) => /** @type {any} */ ({ ...q.box, y0: Math.min(q.y0, q.y1), y1: Math.max(q.y0, q.y1), h: q.y1 >= q.y0 ? q.h : q.h + 180, kind: 'stairs' });
/** Everything in level `L` a hero climbs: its climbs, and its stairs. @param {Level} L @returns {Climb[]} */
export const climbsOf = (L) => [...L.climbs, ...L.stairs.map(stairClimb)];

/**
 * Level `L` as the donut fighters' sim (spinoff/sim.js) should have it: its climbs and stairs solid to their tops, and a deck
 * that reaches the band's edge carried on past it, so pushing a hero out of it goes back the way it came, not round
 * the end along the edge.
 * @param {Level} L @returns {Level}
 */
export function forSim(L) {
  const past = (f) => ({ ...f, z0: f.z0 <= BAND.z0 + 1e-6 ? BAND.z0 - 2 : f.z0, z1: f.z1 >= BAND.z1 - 1e-6 ? BAND.z1 + 2 : f.z1 });
  const [ground, ...rest] = L.floors, solids = climbsOf(L).map((c) => solidTo(c, c.y1));
  return { ...L, floors: [ground, ...[...rest, ...solids].map(past)] };
}

// REUSE-SPEC.md §Pizza: slices where they're a bother to get: halfway down every slide (ride it, don't skip it), in
// the middle of every rocking bridge, at the top of every fire pole (jump for it), and up where a launch off each
// pair of bars or swings flies. Worked out from the level, so every tablet has the same.
const SLICE = Object.freeze({ up: 0.5, pole: 0.25, flight: { on: 2.5, y: 3.1 } });
function slicesOf(L) {
  const at = (x, y, z) => ({ x: r3(x), y: r3(y), z: r3(z) }), slides = L.rides.filter((q) => q.kind === 'slide'), poles = L.rides.filter((q) => q.kind === 'pole');
  return [
    ...slides.map((q) => at((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2 + SLICE.up, (q.z0 + q.z1) / 2)),
    ...L.bridges.map((b) => at((b.x0 + b.x1) / 2, b.y + SLICE.up, (b.z0 + b.z1) / 2)),
    ...poles.map((q) => at(q.x0, q.top - SLICE.pole, q.z0)),
    ...L.swings.filter((_, i) => i % 2).map((p) => at(p.x + SLICE.flight.on, SLICE.flight.y, p.z)),
  ].sort((a, b) => a.x - b.x);
}

// REUSE-SPEC.md §Level 1: a fire pole and a climbing grid in every level (decided 2026-11-12): the way down off its
// first structure, the way up onto its second
const MUST = [(ids) => ids.at(-1) === 'pole', (ids) => ids[0] === 'grid'];

/**
 * A level for this seed: ground, then structures turning through the band with ground between, until it takes
 * `SECONDS.min` to `max`. Level `n` 2 and on (REUSE-SPEC.md §Level 2) has swings or bars on every ground stretch, the
 * swings first, so they can be played with; its ground time can run it a little over.
 * @param {number} seed @param {number} [n] @returns {Level}
 */
export function generateLevel(seed, n = 1) {
  const r = rng(seed), L = emptyLevel(), ground = () => (n >= 2 ? ['swings', 'bars'][L.structures.length % 2] : null);
  let x = gap(L, r, 0, ground());
  while (L.seconds < SECONDS.min) x = gap(L, r, build(L, r, x, MUST[L.structures.length]), ground());
  L.floors.unshift({ kind: 'ground', x0: 0, x1: r3(x), z0: BAND.z0, z1: BAND.z1, y: 0 });
  Object.assign(L.ringOut, { x1: r3(x + 2) });
  L.seconds = r3(L.seconds);
  L.slices = slicesOf(L);
  return L;
}
