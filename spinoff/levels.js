// The tutorial and each stage's hand-made layout, with the stage (theme and terrain rules) that dresses it
// (REUSE-SPEC.md §Stages and difficulty are separate). Pure data, checked by levels.test.mjs.
// Bad guys, the fort pile and moves are formulas of the difficulty (§Bad guys, §Forts, §Power moves), not data here.
import { BRICK } from './match.js';
import { MATCH } from './roster.js';
import { BOUNCE, generateStage } from './generate.js';

/** @typedef {import('./match.js').Stage} Stage @typedef {import('./match.js').Floor} Floor @typedef {import('./generate.js').StageName} StageName
 * @typedef {{ theme: StageName, stage: Stage, breakIn?: boolean, number?: number, match?: import('./match.js').MatchOptions['match'] }} Level
 *   breakIn: the bad guys' shelf is walled in, so the only way to it is to punch and kick through; number: its place in
 *   the stage's run of levels (LEVELS), for the ones the level dial picks; match: who can hit whom, if not roster.js's MATCH */

const wall = (team, x, z, y = 0) => ({ team, x, z, y, hits: 2 });

// REUSE-SPEC.md §Mode: the stage in thirds, mirrored, as a depth band. The middle third is never
// built on. The back edge is a wall; the front and the two ends are drops (ring-out).
/** @type {Stage} */
const TABLE = Object.freeze({
  /** @type {readonly Floor[]} */
  floors: Object.freeze([
    { kind: 'ground', x0: -9, x1: 9, z0: -2, z1: 2, y: 0 },
    { kind: 'deck', x0: -9, x1: -6, z0: -2, z1: -0.8, y: 1.1 },
    { kind: 'deck', x0: 6, x1: 9, z0: -2, z1: -0.8, y: 1.1 },
    { kind: 'hill', x0: -1.2, x1: 1.2, z0: -0.9, z1: 0.9, y: 0.6, round: 0.6 },
  ]),
  backWall: -2,
  /** @type {readonly import('./match.js').ShelfSpot[]} the shelves stand against the back wall on each end's raised deck */
  shelves: Object.freeze([{ team: 'heroes', x: -7.5, z: -1.7, y: 1.1 }, { team: 'badGuys', x: 7.5, z: -1.7, y: 1.1 }]),
  /** @type {readonly import('./match.js').BuildZone[]} */
  zones: Object.freeze([{ team: 'heroes', x0: -9, x1: -3 }, { team: 'badGuys', x0: 3, x1: 9 }]),
  /** @type {readonly import('./match.js').Puddle[]} breakfast's syrup: in both gaps round the bad guys' wall (smash through or wade), and one in each half of the field */
  puddles: Object.freeze([{ x: 4.8, z: 1.6, r: 0.45 }, { x: 4.8, z: -1.6, r: 0.45 }, { x: -2.6, z: 1.3, r: 0.6 }, { x: 2.4, z: -1.2, r: 0.55 }]),
  ringOut: Object.freeze({ x0: -11, x1: 11, z1: 3.5, y: -3 }),
  /** @type {readonly import('./match.js').StartSpot[]} REUSE-SPEC.md §Forts, Start spots come first: clear of the deck, the butter and the syrup */
  starts: Object.freeze([{ x: -4.8, z: 0 }, { x: -4.8, z: 0.8 }, { x: -4.8, z: -0.8 }, { x: -4.8, z: 1.6 }, { x: -4.8, z: -1.6 }, { x: -8.4, z: 0 }]),
  /** @type {readonly import('./match.js').BrickSpot[]} milestone 1's pre-placed bad-guy fort: a wall across the band, two high in the middle, with gaps at the back and front */
  bricks: Object.freeze([
    ...[-1.2, -0.8, -0.4, 0, 0.4, 0.8].map((z) => wall('badGuys', 4.6, z)),
    ...[-0.4, 0].map((z) => wall('badGuys', 4.6, z, BRICK)),
  ]),
});

// REUSE-SPEC.md §Forts: the tutorial teaches breaking in. The wall runs right across the band two high, too
// tall to hop, so there is no way round or over; one broken brick drops the one above it to hop height.
const SHUT_IN = Object.freeze([-2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6]
  .flatMap((z) => [wall('badGuys', 4.6, z), wall('badGuys', 4.6, z, BRICK)]));

/** @type {Level} */
export const TUTORIAL = Object.freeze({ theme: 'breakfast', stage: Object.freeze({ ...TABLE, bricks: SHUT_IN }), breakIn: true, number: 1 });

// REUSE-SPEC.md §Forts, Level 2: the building tutorial. A tall waffle fence (too high to jump onto from the ground, a step
// up from the deck) closes off the yard in front of each shelf but for one obvious gap at the front, two blocks wide;
// the kids start outside theirs with their piles. The bad guys' fort comes with the level: a two-high wall in front of
// their deck, leaving its corner by the fence open, so the raider's way out is that corner and their gap.
const FENCE = /** @type {const} */ ({ kind: 'deck', x0: -6, x1: -5.6, z0: -2, z1: 1.2, y: 1.8 });
/** @type {Level} */
const BUILDING = Object.freeze({ theme: 'breakfast', number: 2, match: Object.freeze({ ...MATCH, badGuysHit: false }), stage: Object.freeze({
  ...TABLE,
  floors: Object.freeze([...TABLE.floors, FENCE, { ...FENCE, x0: -FENCE.x1, x1: -FENCE.x0 }]),
  puddles: Object.freeze([]),
  starts: Object.freeze([{ x: -5.2, z: 1.6 }, { x: -5.2, z: 0.8 }, { x: -4, z: 1.6 }, { x: -4, z: 0.8 }, { x: -5.2, z: 0 }, { x: -4, z: 0 }]),
  bricks: Object.freeze([
    ...[6.8, 7.2, 7.6, 8, 8.4].flatMap((x) => [wall('badGuys', x, -0.8), wall('badGuys', x, -0.8, BRICK)]),
  ]),
}) });

/** Each stage's levels in order, the dial's numbers (REUSE-SPEC.md §After the lobby). @type {Readonly<Partial<Record<StageName, readonly Level[]>>>} */
export const LEVELS = Object.freeze({ breakfast: Object.freeze([TUTORIAL, BUILDING]) });

/** Level `n` of a stage, or null if there isn't one. @param {string} name @returns {Level|null} */
export const levelOf = (name, n) => (Object.hasOwn(LEVELS, name) && LEVELS[name][n - 1]) || null;

/** REUSE-SPEC.md §Forts, Pieces are fixed by level: each player's pile; CPU bad guys aren't limited. */
export const piecesEach = (level) => Math.min(6, 4 + Math.floor((level - 1) / 2));

/** What a level sets for its match (sim.js `createMatch`): from level 2 a build round, with each hero's pile. @param {Level} level @returns {import('./match.js').MatchOptions} */
export const matchOptions = (level) => ({ pieces: (level.number ?? 0) >= 2 ? piecesEach(level.number) : 0, match: level.match ?? MATCH });

/**
 * REUSE-SPEC.md §Bad guys, the bad-guy team grows level by level: CPU bad guys beside the grownups playing them. Level 1's
 * is the training dummy and level 2 has one raider, the tutorials' single opponent.
 */
export const badGuys = (level, grownups = 0) => (level <= 2 ? 1 : Math.min(8, Math.max(grownups, 1) + level - 1));

// Cake is spongy, so it goes crazy tall: decks a sponge jump high (too high on breakfast), and a tower in the
// middle only a trampoline gets you up, from the icing pad at its foot. Each pad is a way up only where it touches the top's edge.
const CAKE_TOWER = { kind: /** @type {const} */ ('hill'), x0: -1, x1: 1, z0: -1.4, z1: 0.2, y: 3.6, round: 0.5 };
/** @type {Stage} */
const CAKE = Object.freeze({
  ...TABLE,
  floors: Object.freeze(TABLE.floors.map((f) => ({ ground: f, deck: { ...f, y: 1.8 }, hill: CAKE_TOWER }[f.kind]))),
  shelves: Object.freeze(TABLE.shelves.map((sh) => ({ ...sh, y: 1.8 }))),
  puddles: Object.freeze([]),
  springs: Object.freeze([{ x: 0, z: 0.7, r: 0.5 }, { x: -2.6, z: 1.2, r: 0.45 }, { x: 2.6, z: 1.2, r: 0.45 }]),
  bounce: BOUNCE.cake,
});

/** Each stage's hand-made layout. @type {Readonly<Record<StageName, Level>>} */
export const STAGES = Object.freeze({
  // butter in front of each deck (you jump up off a slide) and on the hill top
  breakfast: { theme: 'breakfast', stage: Object.freeze({ ...TABLE,
    butter: Object.freeze([{ x: -6.6, z: 1, r: 0.5 }, { x: 6.6, z: 1, r: 0.5 }, { x: 0, z: 0, r: 0.4, y: 0.6 }]) }) },
  cake: { theme: 'cake', stage: CAKE },
});

/**
 * `?stage=breakfast&level=N`: that stage's level N (LEVELS), as the level dial picks. Else `?stage=breakfast|cake&difficulty=D&seed=S`:
 * with a seed, a generated stage (GENERATED-LEVELS.md) at that difficulty on that stage (breakfast if none); without, the
 * stage's hand-made layout (difficulty changes nothing there yet); no stage, the tutorial.
 * @returns {Level}
 */
export function levelFor(search) {
  const q = new URLSearchParams(search), name = Object.hasOwn(STAGES, q.get('stage')) ? /** @type {StageName} */ (q.get('stage')) : null;
  const numbered = q.has('level') && levelOf(name ?? 'breakfast', Number(q.get('level')));
  if (numbered) return numbered;
  if (q.has('seed')) return { theme: name ?? 'breakfast', stage: generateStage(Number(q.get('seed')), Number(q.get('difficulty')) || 1, name ?? 'breakfast') };
  return name ? STAGES[name] : TUTORIAL;
}

/** The level a play page knows before the network: null for a guest (`?room` without `&host`), whose comes in the host's `start`. */
export function levelBefore(search) {
  const q = new URLSearchParams(search);
  return q.has('room') && !q.has('host') ? null : levelFor(search);
}
