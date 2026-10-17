// The contract between the match sim (sim.js) and everything that draws or drives it
// (play.js, controls.js, and in milestone 2 the network). REUSE-SPEC.md §Milestones 1.
// A depth band (REUSE-SPEC.md §Navigation): x runs left (heroes) to right (bad guys), z runs from
// the back wall (negative) toward the camera (positive), y is up. A fighter is about 0.75-1.2 tall.

export const TICK_HZ = 60;
export const ROUND_SECONDS = 90;
export const DONUTS_PER_SHELF = 12;
/** How a shelf is drawn (play.js): columns of donuts `gap` apart, `rows` planks `row` apart. */
export const SHELF = Object.freeze({ cols: 6, gap: 0.3, row: 0.32, rows: 4, r: 0.13, depth: 0.26 });
/** A shelf's width with its trim: the sim's shelf is as wide as the drawn one, so the whole front you see banks. */
export const SHELF_WIDTH = SHELF.cols * SHELF.gap + 0.14;
export const BRICK = 0.4;
export const HIT_DEPTH = 0.35;
export const HITSTOP_TICKS = 5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The nearest point of a box's rounded core to (x, z): the box is everything within `round` of it, seen from above. */
export function coreOf(b, x, z) {
  const r = b.round ?? 0;
  return { x: clamp(x, b.x0 + r, b.x1 - r), z: clamp(z, b.z0 + r, b.z1 - r), r };
}
/** How far (x, z) is outside a box seen from above, corners rounded by `round`; 0 inside or on the edge. */
export function outside(b, x, z) {
  const c = coreOf(b, x, z);
  return Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
}

/** Rectangles seen from above overlap by more than a rounding error. @param {{x0: number, x1: number, z0: number, z1: number}} a @param {{x0: number, x1: number, z0: number, z1: number}} b */
export const overlaps = (a, b, e = 1e-9) => a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.z0 < b.z1 - e && b.z0 < a.z1 - e;

/** The widest a fighter's body gets (a big lion or llama is about 0.94 across): every stage lets one this wide
 * reach both shelves, through a gap or a wall it can break (check-level.mjs); fighter.test.mjs keeps every outfit under it. */
export const WIDEST_FIGHTER = 1;

// REUSE-SPEC.md §Forts, Start spots come first
export const MAX_HEROES = 6;
/** A hero's block pile sits this far toward the middle from where the hero starts. */
export const PILE_DX = 0.6;
/** The floor a start spot keeps clear: the hero, and its pile beside them. @param {{x: number, z: number}} p */
export const spotRect = (p) => ({ x0: p.x - 0.4, x1: p.x + 0.8, z0: p.z - 0.4, z1: p.z + 0.4 });

/** The stage's one 'ground' floor. @param {Stage} stage */
export const groundOf = (stage) => stage.floors.find((f) => f.kind === 'ground');

/**
 * @typedef {'heroes'|'badGuys'} Team
 * @typedef {'ground'|'deck'|'hill'} FloorKind  what a floor is for; a theme dresses each kind its own way
 * @typedef {{ kind: FloorKind, x0: number, x1: number, z0: number, z1: number, y: number, round?: number }} Floor
 *   a walkable top: the rectangle x0..x1 by z0..z1 at height y, its corners rounded by `round`
 * @typedef {{ team: Team, x: number, z: number, y: number }} ShelfSpot  centre of the shelf's front
 * @typedef {{ team: Team, x0: number, x1: number }} BuildZone
 * @typedef {{ x: number, z: number, r: number, y?: number }} Patch
 *   a round patch lying on the floor top at height y (the ground if left out): syrup, butter or a trampoline
 * @typedef {Patch} Puddle a round patch of sticky syrup
 * @typedef {{ team: Team, x: number, z: number, y: number, hits: number }} BrickSpot
 *   a BRICK cube with its bottom-left-back corner at (x, y, z)
 * @typedef {{ x0: number, x1: number, z1: number, y: number }} RingOut  leave this box and you are out
 * @typedef {{ x: number, z: number }} StartSpot  where a hero starts, on the ground, its pile PILE_DX toward the middle
 * @typedef {{ floors: readonly Floor[], backWall: number, shelves: readonly ShelfSpot[], zones: readonly BuildZone[],
 *             puddles: readonly Puddle[], ringOut: RingOut, bricks: readonly BrickSpot[],
 *             butter?: readonly Patch[], springs?: readonly Patch[], bounce?: number, starts?: readonly StartSpot[] }} Stage
 *   one layout (spinoff/levels.js): exactly one 'ground' floor, the lowest; the back edge is a wall at z = backWall.
 *   Terrain rules (REUSE-SPEC.md §Stages and difficulty are separate): `butter` is slippery, `springs` are trampolines,
 *   and `bounce` multiplies how high every jump goes (cake's sponge; 1 if left out). `starts`: the heroes' start spots, in order
 */

/**
 * @typedef {{ dough: string, frosting: string, stripe: boolean }} DonutLook
 * @typedef {{ x: number, z: number, y?: number } | { thing: 'donut'|'brick'|'fighter'|'pile', id: string }
 *           | { thing: 'shelf', team: Team } | { stop: true }} Target
 *   a point on the stage (y given when the tap landed on a raised top), a thing (a pile by its owner's id), or stop where you are
 * @typedef {'idle'|'walk'|'jump'|'fall'|'punch'|'kick'|'hurt'|'launched'|'blocked'|'sit'} MoveId
 *   'blocked': standing at a wall it can't hop, facing it; 'sit': away from the screen, sitting where it stopped
 *
 * One player's input for one tick. `target` is sent only when it changes (null keeps the last
 * one); `punch` / `kick` are true on the tick the button went down. `away` is sent when a guest's
 * screen is hidden (true) or back (false), and kept between: the fighter stops and sits.
 * In the build round, `drop` (⬇️) is true on the tick it went down, `ready` (👍) is sent when it changes and
 * `go` once, when 👍 has been held long enough to start the round for everyone.
 * @typedef {{ target: Target|null, punch: boolean, kick: boolean, away?: boolean, drop?: boolean, ready?: boolean, go?: boolean }} Input
 *
 * @typedef {{ id: string, team: Team, x: number, y: number, z: number, vx: number, vy: number, vz: number,
 *             facing: number, height: number, width: number, onGround: boolean, move: MoveId, step: number,
 *             percent: number, carrying: DonutLook|null, invincible: boolean, respawn: number,
 *             target: { x: number, y: number, z: number }|null, block: string|null }} FighterState
 *   `facing` is the yaw in radians (0 faces +x, PI/2 faces +z, toward the camera). `step` is the
 *   move's progress, 0 to 1. `target` is where it is heading, for teammates' footprints. `block`: the icing
 *   of the block it carries in the build round. `respawn`: seconds left out of play after a ring-out (0 in play): not
 *   drawn then, and x/y/z is where it will drop in.
 * @typedef {{ id: string, x: number, y: number, z: number, look: DonutLook }} LooseDonut
 * @typedef {{ id: string, team: Team, x: number, y: number, z: number, hits: number, maxHits: number,
 *             icing: string }} BrickState
 * @typedef {{ team: Team, x: number, y: number, z: number, donuts: DonutLook[] }} ShelfState
 * @typedef {{ x: number, y: number, z: number, move: 'punch'|'kick'|'stomp', on: 'fighter'|'brick',
 *             target: string, broke: boolean }} HitEvent
 *   a hit that landed this tick, at its point of contact, on the fighter or brick `target` (its id),
 *   for the page's BAM burst and shake;
 *   both fighters freeze for HITSTOP_TICKS on contact. `broke`: the brick (or bag) gave way.
 * @typedef {{ fighter: string, kind: 'steal'|'bank'|'pickup'|'fetch'|'place', x: number, y: number, z: number }} DonutEvent
 *   a donut changed hands this tick: taken from the enemy shelf (`steal`), put on your own shelf
 *   (`bank`), or picked up off the floor (`pickup`), at that spot, for the page's celebrations; or in the
 *   build round a block was taken from a pile or a stack (`fetch`) or put down (`place`).
 * @typedef {{ fighter: string, x: number, y: number, z: number }} FullBagEvent
 *   a fighter already carrying a donut touched a loose donut or reached the enemy shelf this tick,
 *   at that donut or shelf, so the page can show "your bag holds one"; or a guard (the fighter, where
 *   they stand) kept someone from grabbing off their shelf.
 *
 * Everything the page draws, every tick. No three.js objects, only numbers and strings, so it
 * can cross the network unchanged in milestone 2. `over` is true once the clock runs out;
 * `winner` is the team with more donuts on its shelf then, or null for a tie. `phase` is the build round
 * (no clock: `ready` has who tapped 👍, `piles` the blocks left) until it gives way to `play`.
 * @typedef {{ owner: string, x: number, y: number, z: number, count: number, icing: string }} PileState
 *   a hero's blocks left to place, in a heap at (x, y, z)
 * @typedef {{ tick: number, secondsLeft: number, over: boolean, winner: Team|null,
 *             fighters: FighterState[], donuts: LooseDonut[], bricks: BrickState[],
 *             shelves: ShelfState[], hits: HitEvent[], fullBag: FullBagEvent[],
 *             donutEvents: DonutEvent[], phase: 'build'|'play', ready: string[], piles: PileState[] }} Snapshot
 *
 * Who is in the match. height / width / reach come from the fighter's params (fighter.js) as plain
 * numbers; look is the donut frosting this entrant brings to its team's shelf, and the icing
 * colour of its bricks.
 * @typedef {{ id: string, team: Team, height: number, width: number, reach: number,
 *             look: DonutLook, dummy?: boolean }} Entrant
 *
 * What the level sets for a match: each hero's pile (`pieces`, with a build round first when there are any) and who can
 * hit whom (`match`, roster.js's MATCH).
 * @typedef {{ pieces?: number, match?: { friendlyFire: boolean, badGuysHit?: boolean, badGuyPace?: number } }} MatchOptions
 *
 * The sim's whole API, which sim.js implements:
 * @typedef {{ createMatch: (entrants: Entrant[], stage: Stage, opts?: MatchOptions) => any,
 *             tick: (state: any, inputs: Record<string, Input>) => void,
 *             snapshot: (state: any) => Snapshot }} MatchApi
 */
