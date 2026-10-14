// The contract between the match sim (sim.js) and everything that draws or drives it
// (play.js, controls.js, and in milestone 2 the network). REUSE-SPEC.md §Milestones 1.
// A depth band (REUSE-SPEC.md §Navigation): x runs left (heroes) to right (bad guys), z runs from
// the back wall (negative) toward the camera (positive), y is up. A fighter is about 0.75-1.2 tall.

export const TICK_HZ = 60;
export const ROUND_SECONDS = 90;
export const DONUTS_PER_SHELF = 12;
export const BRICK = 0.4;
export const HIT_DEPTH = 0.35;

/**
 * @typedef {'heroes'|'badGuys'} Team
 * @typedef {{ x0: number, x1: number, z0: number, z1: number, y: number }} Floor
 *   a walkable top: the rectangle x0..x1 by z0..z1 at height y
 * @typedef {{ team: Team, x: number, z: number, y: number }} ShelfSpot  centre of the shelf's front
 * @typedef {{ team: Team, x0: number, x1: number }} BuildZone
 * @typedef {{ team: Team, x: number, z: number, y: number, hits: number }} BrickSpot
 *   a BRICK cube with its bottom-left-back corner at (x, y, z)
 */

const wall = (team, x, z, y = 0) => ({ team, x, z, y, hits: 2 });

// REUSE-SPEC.md §Mode: the stage in thirds, mirrored, as a depth band. The middle third is never
// built on. The back edge is a wall; the front and the two ends are drops (ring-out).
export const STAGE = Object.freeze({
  /** @type {readonly Floor[]} */
  floors: Object.freeze([
    { x0: -9, x1: 9, z0: -2, z1: 2, y: 0 },
    { x0: -9, x1: -6, z0: -2, z1: -0.8, y: 1.1 },
    { x0: 6, x1: 9, z0: -2, z1: -0.8, y: 1.1 },
    { x0: -1.2, x1: 1.2, z0: -0.9, z1: 0.9, y: 0.6 },
  ]),
  backWall: -2,
  /** @type {readonly ShelfSpot[]} the shelves stand against the back wall on each end's raised deck */
  shelves: Object.freeze([{ team: 'heroes', x: -7.5, z: -1.7, y: 1.1 }, { team: 'badGuys', x: 7.5, z: -1.7, y: 1.1 }]),
  /** @type {readonly BuildZone[]} */
  zones: Object.freeze([{ team: 'heroes', x0: -9, x1: -3 }, { team: 'badGuys', x0: 3, x1: 9 }]),
  ringOut: Object.freeze({ x0: -11, x1: 11, z1: 3.5, y: -3 }),
  /** @type {readonly BrickSpot[]} milestone 1's pre-placed bad-guy fort: a wall across the band, two high in the middle, with gaps at the back and front */
  bricks: Object.freeze([
    ...[-1.2, -0.8, -0.4, 0, 0.4, 0.8].map((z) => wall('badGuys', 4.6, z)),
    ...[-0.4, 0].map((z) => wall('badGuys', 4.6, z, BRICK)),
  ]),
});

/**
 * @typedef {{ dough: string, frosting: string, stripe: boolean }} DonutLook
 * @typedef {{ x: number, z: number, y?: number } | { thing: 'donut'|'brick'|'fighter', id: string }
 *           | { thing: 'shelf', team: Team } | { stop: true }} Target
 *   a point on the stage (y given when the tap landed on a raised top), a thing, or stop where you are
 * @typedef {'idle'|'walk'|'jump'|'fall'|'punch'|'kick'|'hurt'|'launched'|'blocked'} MoveId
 *   'blocked': standing at a wall it can't hop, facing it
 *
 * One player's input for one tick. `target` is sent only when it changes (null keeps the last
 * one); `punch` / `kick` are true on the tick the button went down.
 * @typedef {{ target: Target|null, punch: boolean, kick: boolean }} Input
 *
 * @typedef {{ id: string, team: Team, x: number, y: number, z: number, vx: number, vy: number, vz: number,
 *             facing: number, height: number, onGround: boolean, move: MoveId, step: number,
 *             percent: number, carrying: DonutLook|null, invincible: boolean,
 *             target: { x: number, y: number, z: number }|null }} FighterState
 *   `facing` is the yaw in radians (0 faces +x, PI/2 faces +z, toward the camera). `step` is the
 *   move's progress, 0 to 1. `target` is where it is heading, for teammates' footprints.
 * @typedef {{ id: string, x: number, y: number, z: number, look: DonutLook }} LooseDonut
 * @typedef {{ id: string, team: Team, x: number, y: number, z: number, hits: number, maxHits: number,
 *             icing: string }} BrickState
 * @typedef {{ team: Team, x: number, y: number, z: number, donuts: DonutLook[] }} ShelfState
 *
 * Everything the page draws, every tick. No three.js objects, only numbers and strings, so it
 * can cross the network unchanged in milestone 2. `over` is true once the clock runs out;
 * `winner` is the team with more donuts on its shelf then, or null for a tie.
 * @typedef {{ tick: number, secondsLeft: number, over: boolean, winner: Team|null,
 *             fighters: FighterState[], donuts: LooseDonut[], bricks: BrickState[],
 *             shelves: ShelfState[] }} Snapshot
 *
 * Who is in the match. height / width / reach come from the fighter's params (fighter.js) as plain
 * numbers; look is the donut frosting this entrant brings to its team's shelf, and the icing
 * colour of its bricks.
 * @typedef {{ id: string, team: Team, height: number, width: number, reach: number,
 *             look: DonutLook, dummy?: boolean }} Entrant
 *
 * The sim's whole API, which sim.js implements:
 * @typedef {{ createMatch: (entrants: Entrant[]) => any,
 *             tick: (state: any, inputs: Record<string, Input>) => void,
 *             snapshot: (state: any) => Snapshot }} MatchApi
 */
