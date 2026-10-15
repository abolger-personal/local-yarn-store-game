// Every level: a stage layout and the treat theme that dresses it (REUSE-SPEC.md §Forts). Pure data, checked by levels.test.mjs.
// Bad guys, the fort pile and moves per level are formulas of the level number (§Bad guys, §Forts, §Power moves), not data here.
import { BRICK } from './match.js';
import { generateStage } from './generate.js';

/** @typedef {import('./match.js').Stage} Stage @typedef {import('./match.js').Floor} Floor @typedef {{ theme: 'breakfast'|'cake', stage: Stage, breakIn?: boolean }} Level
 *   breakIn: the bad guys' shelf is walled in, so the only way to it is to punch and kick through */

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
  /** @type {readonly import('./match.js').Puddle[]} Level 1's syrup: in both gaps round the bad guys' wall (smash through or wade), and one in each half of the field */
  puddles: Object.freeze([{ x: 4.8, z: 1.6, r: 0.45 }, { x: 4.8, z: -1.6, r: 0.45 }, { x: -2.6, z: 1.3, r: 0.6 }, { x: 2.4, z: -1.2, r: 0.55 }]),
  ringOut: Object.freeze({ x0: -11, x1: 11, z1: 3.5, y: -3 }),
  /** @type {readonly import('./match.js').BrickSpot[]} milestone 1's pre-placed bad-guy fort: a wall across the band, two high in the middle, with gaps at the back and front */
  bricks: Object.freeze([
    ...[-1.2, -0.8, -0.4, 0, 0.4, 0.8].map((z) => wall('badGuys', 4.6, z)),
    ...[-0.4, 0].map((z) => wall('badGuys', 4.6, z, BRICK)),
  ]),
});

// REUSE-SPEC.md §Forts: Level 1 teaches breaking in. The wall runs right across the band two high, too
// tall to hop, so there is no way round or over; one broken brick drops the one above it to hop height.
const SHUT_IN = Object.freeze([-2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6]
  .flatMap((z) => [wall('badGuys', 4.6, z), wall('badGuys', 4.6, z, BRICK)]));

/** @type {Readonly<Record<number, Level>>} */
export const LEVELS = Object.freeze({
  1: { theme: 'breakfast', stage: Object.freeze({ ...TABLE, bricks: SHUT_IN }), breakIn: true },
  2: { theme: 'cake', stage: Object.freeze({ ...TABLE, puddles: Object.freeze([]) }) },
});

/** `?seed=S&difficulty=D` for a generated stage (GENERATED-LEVELS.md), else `?level=N` for a level that exists, else Level 1. @returns {Level} */
export function levelFor(search) {
  const q = new URLSearchParams(search);
  if (q.has('seed')) return { theme: 'breakfast', stage: generateStage(Number(q.get('seed')), Number(q.get('difficulty')) || 1) };
  return LEVELS[Number(q.get('level'))] ?? LEVELS[1];
}
