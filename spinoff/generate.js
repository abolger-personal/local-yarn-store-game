// Generated stages (GENERATED-LEVELS.md): a pure function of (seed, difficulty, stage), so the host sends that and
// every tablet rebuilds the same Stage. Terrain is mirrored; the bad guys' pre-placed fort is on their side only.
import { BRICK, MAX_HEROES, outside, overlaps, spotRect } from './match.js';

/** @typedef {import('./match.js').Stage} Stage @typedef {import('./match.js').Floor} Floor @typedef {import('./match.js').Puddle} Puddle */

/** mulberry32: integer maths only, so every tablet draws the same numbers. @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @typedef {'breakfast'|'cake'} StageName */
/** How much higher than breakfast each stage's jumps go (REUSE-SPEC.md §Stages and difficulty are separate): cake is spongy. */
export const BOUNCE = Object.freeze({ breakfast: 1, cake: 1.5 });

/** The difficulty each problem kind is first met at: the hand-made level that teaches it (GENERATED-LEVELS.md §Problem kinds). */
export const UNLOCK = Object.freeze({ hill: 1, tall: 1, syrup: 1, moat: 1, choke: 3, stepUp: 5 });

const r1 = (v) => Math.round(v * 10) / 10;
const pick = (r, lo, hi) => r1(lo + r() * (hi - lo));
/** @param {Floor} f @returns {Floor[]} */
const both = (f) => [f, { ...f, x0: -f.x1, x1: -f.x0 }];

// REUSE-SPEC.md §Forts, Start spots come first: a lattice in the heroes' third between their deck (every layout's deck
// stands there) and the middle, so neighbouring spots just touch; everything picked after keeps clear of the ones taken
const SPOT_XS = [-6, -4.8], SPOT_ZS = [-1.6, -0.8, 0, 0.8, 1.6];
const HERO_DECK = { x0: -9, x1: -6, z0: -2, z1: -0.8 };

/** The heroes' start spots for this seed, in the order heroes take them. @param {number} seed @returns {import('./match.js').StartSpot[]} */
export function startSpots(seed) {
  const r = rng(~seed);
  const all = SPOT_XS.flatMap((x) => SPOT_ZS.map((z) => ({ x, z }))).filter((p) => !overlaps(spotRect(p), HERO_DECK));
  return all.map((p) => /** @type {const} */ ([r(), p])).sort((a, b) => a[0] - b[0]).slice(0, MAX_HEROES).map(([, p]) => p);
}
const clearOf = (starts, p) => starts.every((s) => outside(spotRect(s), p.x, p.z) >= p.r);

/** Which kinds this stage has: the kind new at this difficulty first, then a seeded shuffle of the rest met so far. */
function problems(r, d) {
  const met = Object.keys(UNLOCK).filter((k) => UNLOCK[k] <= d);
  const order = met.map((k) => [UNLOCK[k] === d && d > 1 ? -1 : r(), k]).sort((a, b) => Number(a[0]) - Number(b[0]));
  return new Set(order.slice(0, Math.min(met.length, 1 + Math.ceil(d / 2))).map((p) => p[1]));
}

/** Each team's deck against the back wall; with stepUp it is too high to jump to from the ground, so a step stands beside it. */
function ends(r, stepUp) {
  const y = stepUp ? 1.8 : pick(r, 0.9, 1.2), inner = stepUp ? 7 : 6;
  /** @type {Floor} */
  const deck = { kind: 'deck', x0: -9, x1: -inner, z0: -2, z1: -0.8, y };
  /** @type {Floor} */
  const step = { kind: 'deck', x0: -7, x1: -5.6, z0: -2, z1: -0.8, y: 0.9 }; // wide enough to stand the widest fighter on
  return { floors: [...both(deck), ...(stepUp ? both(step) : [])], x: (9 + inner) / 2, y };
}

/** @returns {Floor} the middle hill, to jump on or walk round */
function hill(r) {
  const w = pick(r, 1.8, 2.4), d = pick(r, 1.4, 1.8);
  return { kind: 'hill', x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, y: pick(r, 0.5, 0.8), round: r1(Math.min(w, d) / 3) };
}

/** Two pillars front and back, leaving one gap at ground level, in each team's third, wide enough for the widest fighter.
 *  A hop high, not more: every top must be reachable (a donut can land there). */
function choke(r) {
  const gap = pick(r, 1.6, 2), z = pick(r, -0.6, 0.6);
  /** @type {Floor} */
  const back = { kind: 'deck', x0: -3.8, x1: -3.2, z0: -2, z1: r1(z - gap / 2), y: 1.2 };
  return [...both(back), ...both({ ...back, z0: r1(z + gap / 2), z1: 2 })];
}

/** @returns {Puddle[]} a syrup puddle (on cake, a trampoline) in each half of the field */
function syrup(r) {
  const p = { x: pick(r, 2, 2.6), z: pick(r, -1.4, 1.4), r: pick(r, 0.4, 0.55) };
  return [p, { ...p, x: -p.x }];
}

/** The bad guys' wall across the band with a gap at the back and front, narrower as difficulty rises; tall and moat build on it. */
function fort(r, d, has) {
  const wide = Math.max(0.8, 1.6 - 0.2 * d), back = pick(r, 0.8, wide), n = Math.floor((4 - back - pick(r, 0.8, wide)) / BRICK);
  const front = r1(4 - back - n * BRICK), mid = Math.floor(n / 2);
  const zs = Array.from({ length: n }, (_, i) => r1(-2 + back + i * BRICK));
  const tall = has.has('tall') ? zs.slice(mid - 1, mid + 1).map((z) => ({ team: 'badGuys', x: 4.6, z, y: BRICK, hits: 2 })) : [];
  const moat = has.has('moat') ? [{ x: 4.8, z: r1(-2 + back / 2), r: 0.45 }, { x: 4.8, z: r1(2 - front / 2), r: 0.45 }] : [];
  return { bricks: [...zs.map((z) => ({ team: 'badGuys', x: 4.6, z, y: 0, hits: 2 })), ...tall], moat };
}

/** @returns {Puddle[]} a butter slick in front of each deck, drawn again while it covers a start spot (left out if it always does), and one on the hill top if there is a hill */
function butter(r, top, starts) {
  let p = null;
  for (let i = 0; i < 20 && !p; i++) {
    const q = { x: pick(r, 6.2, 8.4), z: pick(r, -0.3, 1.5), r: pick(r, 0.4, 0.5) };
    if (clearOf(starts, { ...q, x: -q.x })) p = q;
  }
  const onTop = top ? [{ x: 0, z: r1((top.z0 + top.z1) / 2), r: r1(Math.min(top.x1 - top.x0, top.z1 - top.z0) / 4), y: top.y }] : [];
  return [...(p ? [p, { ...p, x: -p.x }] : []), ...onTop];
}

/** Breakfast's syrup and butter, or cake's trampolines and taller everything: heights scale with the jump, so every top stays reachable. */
function dress(stage, r, name) {
  if (name === 'breakfast') return { ...stage, butter: butter(r, stage.floors.find((f) => f.kind === 'hill'), stage.starts) };
  const lift = (o) => ({ ...o, y: r1(o.y * BOUNCE.cake) });
  return { ...stage, floors: stage.floors.map((f) => (f.kind === 'ground' ? f : lift(f))), shelves: stage.shelves.map(lift),
    puddles: [], springs: stage.puddles.filter((p) => Math.abs(p.x) < 3), bounce: BOUNCE.cake };
}

/**
 * A playable stage for this seed at this difficulty (1 and up), on breakfast or cake.
 * @param {number} seed @param {number} difficulty @param {StageName} [name] @returns {Stage}
 */
export function generateStage(seed, difficulty, name = 'breakfast') {
  const starts = startSpots(seed), r = rng(seed), d = Math.max(1, Math.floor(difficulty)), has = problems(r, d), end = ends(r, has.has('stepUp'));
  const wall = fort(r, d, has);
  return dress({
    starts,
    floors: [{ kind: 'ground', x0: -9, x1: 9, z0: -2, z1: 2, y: 0 }, ...end.floors, ...(has.has('hill') ? [hill(r)] : []),
      ...(has.has('choke') ? choke(r) : [])],
    backWall: -2,
    shelves: [{ team: 'heroes', x: -end.x, z: -1.7, y: end.y }, { team: 'badGuys', x: end.x, z: -1.7, y: end.y }],
    zones: [{ team: 'heroes', x0: -9, x1: -3 }, { team: 'badGuys', x0: 3, x1: 9 }],
    puddles: [...(has.has('syrup') ? syrup(r) : []), ...wall.moat],
    ringOut: { x0: -11, x1: 11, z1: 3.5, y: -3 },
    bricks: /** @type {import('./match.js').BrickSpot[]} */ (wall.bricks),
  }, r, name);
}
