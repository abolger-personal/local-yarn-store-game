// The contract between the match sim (sim.js) and everything that draws or drives it
// (play.js, controls.js, and in milestone 2 the network). REUSE-SPEC.md §Milestones 1.
// Units: a fighter is about 0.75 tall. x runs left (heroes) to right (bad guys), y is up.

export const TICK_HZ = 60;
export const ROUND_SECONDS = 90;
export const DONUTS_PER_SHELF = 12;
export const BRICK = 0.4;

/**
 * @typedef {{ x0: number, x1: number, y: number }} Platform  a walkable top surface from x0 to x1 at height y
 * @typedef {'heroes'|'badGuys'} Team
 * @typedef {{ team: Team, x: number, y: number }} ShelfSpot
 * @typedef {{ team: Team, x0: number, x1: number }} BuildZone
 * @typedef {{ team: Team, x: number, y: number, hits: number }} BrickSpot  bottom-left corner, one BRICK square
 */

// REUSE-SPEC.md §Mode: the stage in thirds, mirrored. The middle third is never built on.
export const STAGE = Object.freeze({
  /** @type {readonly Platform[]} */
  platforms: Object.freeze([
    { x0: -9, x1: 9, y: 0 },
    { x0: -8.6, x1: -5.4, y: 1.3 },
    { x0: 5.4, x1: 8.6, y: 1.3 },
    { x0: -1.4, x1: 1.4, y: 0.6 },
    { x0: -4.4, x1: -2.4, y: 1.2 },
    { x0: 2.4, x1: 4.4, y: 1.2 },
  ]),
  /** @type {readonly ShelfSpot[]} */
  shelves: Object.freeze([{ team: 'heroes', x: -8, y: 0 }, { team: 'badGuys', x: 8, y: 0 }]),
  /** @type {readonly BuildZone[]} */
  zones: Object.freeze([{ team: 'heroes', x0: -9, x1: -3 }, { team: 'badGuys', x0: 3, x1: 9 }]),
  ringOut: Object.freeze({ x0: -11.5, x1: 11.5, y: -3 }),
  /** @type {readonly BrickSpot[]} milestone 1's pre-placed bad-guy wall in front of their shelf */
  bricks: Object.freeze([
    { team: 'badGuys', x: 6, y: 0, hits: 2 },
    { team: 'badGuys', x: 6, y: BRICK, hits: 2 },
    { team: 'badGuys', x: 6, y: 2 * BRICK, hits: 2 },
    { team: 'badGuys', x: 4, y: 0, hits: 2 },
  ]),
});

/**
 * @typedef {{ dough: string, frosting: string, stripe: boolean }} DonutLook
 * @typedef {{ x: number, y: number } | { thing: 'donut'|'brick'|'fighter', id: string } | { thing: 'shelf', team: Team }} Target
 * @typedef {'idle'|'walk'|'jump'|'fall'|'punch'|'kick'|'hurt'|'launched'} MoveId
 *
 * One player's input for one tick. `target` is sent only when it changes (null keeps the last
 * one); `punch` / `kick` are true on the tick the button went down.
 * @typedef {{ target: Target|null, punch: boolean, kick: boolean }} Input
 *
 * @typedef {{ id: string, team: Team, x: number, y: number, vx: number, vy: number,
 *             facing: -1|1, onGround: boolean, move: MoveId, step: number,
 *             percent: number, carrying: DonutLook|null, invincible: boolean,
 *             target: { x: number, y: number }|null }} FighterState
 *   `step` is the move's progress, 0 to 1. `target` is where it is heading, for teammates' footprints.
 * @typedef {{ id: string, x: number, y: number, look: DonutLook }} LooseDonut
 * @typedef {{ id: string, team: Team, x: number, y: number, hits: number, maxHits: number }} BrickState
 * @typedef {{ team: Team, x: number, y: number, donuts: DonutLook[] }} ShelfState
 *
 * Everything the page draws, every tick. No three.js objects, only numbers and strings, so it
 * can cross the network unchanged in milestone 2.
 * @typedef {{ tick: number, secondsLeft: number, fighters: FighterState[], donuts: LooseDonut[],
 *             bricks: BrickState[], shelves: ShelfState[] }} Snapshot
 *
 * Who is in the match. height / width / reach come from the fighter's params (fighter.js) as plain
 * numbers; look is the donut frosting this entrant brings to its team's shelf.
 * @typedef {{ id: string, team: Team, height: number, width: number, reach: number,
 *             look: DonutLook, dummy?: boolean }} Entrant
 *
 * The sim's whole API, which sim.js (and play.js's stand-in until it lands) implement:
 * @typedef {{ createMatch: (entrants: Entrant[]) => any,
 *             tick: (state: any, inputs: Record<string, Input>) => void,
 *             snapshot: (state: any) => Snapshot }} MatchApi
 */
