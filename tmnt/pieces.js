// REUSE-SPEC.md §Level 1, The pieces: the Capuano playground's pieces as modules, in feet as tmnt/level1-pieces.svg
// draws them, x from the piece's left end. `in` and `out` are how high you are coming in and leaving (0, the ground);
// the generator (generate.js) strings pieces whose ends join.

/** Game units to the foot: a kid-sized hero, 3 ft 10, is about 0.86 tall, so the fighters' 0.9 deck is 4 ft. */
export const FT = 0.225;
/** How much higher a jump takes you from where you stand (`reachUp` in spinoff/walk.js is 1.3, about 5.8 ft). */
export const JUMP_FT = 4;
/** How far down a piece can start below where the last left off, stepping off the end. */
export const DROP_FT = 1.5;

/**
 * @typedef {{ x0: number, x1: number, y: number }} Deck  a top to stand on
 * @typedef {{ x0: number, x1: number, y0: number, y1: number, kind: 'dome'|'grid'|'squiggle' }} Climb  up from y0 to y1
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, kind: 'slide'|'pole' }} Ride  down, from (x0, y0) to (x1, y1)
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Stairs  walked up or down
 * @typedef {{ x: number, y: number, arm: number, span: number, kind: 'swing'|'bar' }} Swing
 *   round a pivot at (x, y), `arm` out; the bar or the swing's top beam `span` long, across the way it swings
 * @typedef {{ id: string, w: number, in: number, out: number, decks?: Deck[], climbs?: Climb[], rides?: Ride[],
 *   stairs?: Stairs[], swings?: Swing[], bridge?: Deck, burst?: number, cover?: number[] }} Piece
 *   `bridge` wobbles; `burst` is where bad guys come out (the bear cave); `cover`, where they can hide behind
 */

/** @type {Readonly<Record<string, Piece>>} */
export const PIECES = Object.freeze({
  // the climbing dome up to the tall tower's deck, the bear cave under it
  dome: { id: 'dome', w: 8, in: 0, out: 7, decks: [{ x0: 2.5, x1: 8, y: 7 }],
    climbs: [{ x0: 0, x1: 2.5, y0: 0, y1: 7, kind: 'dome' }], burst: 3, cover: [5] },
  wavySlide: { id: 'wavySlide', w: 9, in: 7, out: 0, rides: [{ x0: 0, y0: 7, x1: 9, y1: 0, kind: 'slide' }] },
  lowDeck: { id: 'lowDeck', w: 6, in: 6, out: 6, decks: [{ x0: 0, x1: 6, y: 6 }] },
  // the structures fill the band, so the low deck's ways up and down from the ground are pieces of their own (unwrapped):
  // the squiggle climber starts a structure, the fire pole ends one
  squiggle: { id: 'squiggle', w: 3, in: 0, out: 6, climbs: [{ x0: 0, x1: 1, y0: 0, y1: 6, kind: 'squiggle' }], decks: [{ x0: 1, x1: 3, y: 6 }] },
  // the pole a foot out from the deck, so you land clear of it (playtest 2026-11-10: down, back up, down again)
  pole: { id: 'pole', w: 4, in: 6, out: 0, decks: [{ x0: 0, x1: 2, y: 6 }], rides: [{ x0: 3, y0: 6, x1: 3, y1: 0, kind: 'pole' }] },
  steps: { id: 'steps', w: 6, in: 6, out: 4, stairs: [{ x0: 0, y0: 6, x1: 6, y1: 4 }] },
  bridge: { id: 'bridge', w: 11, in: 4, out: 4, bridge: { x0: 0, x1: 11, y: 4 } },
  ticTacToe: { id: 'ticTacToe', w: 6, in: 4, out: 4, decks: [{ x0: 0, x1: 6, y: 4 }], cover: [3] },
  grid: { id: 'grid', w: 3.5, in: 4, out: 7.5, climbs: [{ x0: 0, x1: 3.5, y0: 4, y1: 7.5, kind: 'grid' }] },
  stairsUp: { id: 'stairsUp', w: 3.5, in: 4, out: 7.5, stairs: [{ x0: 0, y0: 4, x1: 3.5, y1: 7.5 }] },
  topDeck: { id: 'topDeck', w: 3.5, in: 7.5, out: 7.5, decks: [{ x0: 0, x1: 3.5, y: 7.5 }], cover: [1.75] },
  tealSlide: { id: 'tealSlide', w: 8, in: 7.5, out: 0, rides: [{ x0: 0, y0: 7.5, x1: 8, y1: 0, kind: 'slide' }] },
  stepDowns: { id: 'stepDowns', w: 7.5, in: 4, out: 0, decks: [{ x0: 0, x1: 2, y: 3 }, { x0: 2.5, x1: 4.5, y: 2 }, { x0: 5, x1: 7, y: 1 }] },
  stepUps: { id: 'stepUps', w: 7.5, in: 0, out: 4, decks: [{ x0: 0.5, x1: 2.5, y: 1 }, { x0: 3, x1: 5, y: 2 }, { x0: 5.5, x1: 7.5, y: 3 }] },
  // on the ground between structures: the two uneven bars and a pair of arch swings
  bars: { id: 'bars', w: 6, in: 0, out: 0, swings: [{ x: 2, y: 3, arm: 1.4, span: 5, kind: 'bar' }, { x: 4, y: 3.5, arm: 1.4, span: 5, kind: 'bar' }] },
  swings: { id: 'swings', w: 14, in: 0, out: 0, swings: [{ x: 3.5, y: 9.5, arm: 7.5, span: 6, kind: 'swing' }, { x: 10.5, y: 9.5, arm: 7.5, span: 6, kind: 'swing' }] },
});

/** Structure A as the real playground has it, unwrapped (REUSE-SPEC.md §The pieces): one string the generator can make. */
export const REAL_A = Object.freeze(['dome', 'lowDeck', 'steps', 'bridge', 'ticTacToe', 'grid', 'topDeck', 'tealSlide']);

/** Does a piece starting `inn` ft up follow one leaving `out` ft up: level, a jump up, or a step down off the end. */
export const joins = (out, inn) => inn === out || (inn > out ? inn - out <= JUMP_FT : out - inn <= DROP_FT);
