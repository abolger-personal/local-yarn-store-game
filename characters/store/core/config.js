// Every dimension and tunable the shop is built from. Pure data: no three.js, no DOM.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { BASE_PARAMS } from '../../npc.js';

// ---------------------------------------------------------------- scale
//
// The one thing this POC exists to check: a character and a display in the SAME room. An NPC
// normalises to ~1.0 units tall (npc.js), so every dimension below is a fraction of a customer.
// Notions stay deliberately oversized per LYS.md — a 0.2 slot is a fifth of a person, which is
// absurd in real life and correct here, because the player has to see and grab them.
export const CELL = 0.20;        // uniform across ALL displays — DISPLAYS.md rule 2, so items can move

export const BOX_H = 0.055;      // one 2.5D layer

// Yes and no, as colours. Declared up here because the drop ghost, the move ghost, the held-item
// halo and the grid lattice all speak them, and paintActivePlane runs while the shop is built.
//
// These are UI, not paint, so every material that uses them sets `toneMapped = false`. The shop
// renders through ACES at exposure 0.40, which is a look chosen for felted wool and is ruinous for
// a signal colour: it crushed the old warning red #a2382f to #640b0e on the way to the screen —
// 41% lightness down to 22% — which is why it arrived as maroon rather than as "no". Measured in
// scratchpad/uicolor.mjs. No hex survives that; the flag is the fix, and then the hex can be a
// plain bright green and a plain alarm red that mean what they look like.
export const GHOST_OK = '#25e06a', GHOST_NO = '#ff2d16';

// Nearly solid. A hint is the wrong register for "this is what is about to happen": the ghost and
// the halo are the answer to "where does this land", and a 35% wash made that a guess.
export const GHOST_ALPHA = 0.85;

/**
 * Wall shelves are TILTED, like a Montessori forward-facing bookshelf: each level is a ramp with
 * its wall edge high and its front edge low, so the stock faces up and out toward the camera.
 *
 * A stack of flat shelves is nearly unusable on a tablet — from the shop's own viewing angle each
 * level hides under the one above it, and only the front strip is visible or reachable. Tilting
 * presents the whole level at once, which widens the grabbable area without standing the shelf
 * vertical (where boxes would have nothing to rest on and the 2.5D stacking would read as wrong).
 */
export const SHELF_TILT = Math.PI / 4;

// Derived, not chosen: a tilted level's own depth eats vertical space (rows * CELL * sin(tilt)),
// and picking a constant here is how levels end up intersecting each other the first time anyone
// changes the row count. The margin is the stack that sits ON the level, plus air.
export const SHELF_ROWS = 2;

// The air ABOVE a tilted level, which is the only part of the gap anything can be stood in — the
// rest of it is eaten by the ramp. Split out from SHELF_GAP because it is the one number that
// decides what yarn a wall shelf can hold: at 0.17 that is fingering balls and skeins, and
// anything rounder or bulkier falls through to a table or the floor. Raise it to put worsted on
// the wall; every 0.055 buys one more layer, and the top shelf rises by three times as much.
const SHELF_CLEAR = BOX_H * 2 + 0.06;

export const SHELF_GAP = SHELF_ROWS * CELL * Math.sin(SHELF_TILT) + SHELF_CLEAR;

// DISPLAYS.md type A: a pile stacks with "close-to-infinite headroom", Jenga towers allowed. 10 is
// the standard option; at BOX_H that is 0.55 units, so a full tower on a table reaches an NPC's
// head. A SHELF cannot have this — its stack is physically stopped by the glass above it, so its
// headroom is bounded by the air above its ramp. That difference is real furniture, not an
// oversight. DERIVED rather than written down: a hand-typed 3 beside a computed clearance is two
// numbers describing one physical thing, and they drift the first time anyone retilts a shelf.
// 12, not 10: a super-bulky CONE is the tallest thing the shop can roll, at 0.66 units, and a
// pile is the fallback for everything a shelf cannot take. At 10 the shop could generate a cone
// nothing in the room could hold — fillStock would keep re-rolling it and the stock would come up
// quietly short. checkItemSizes asserts this rather than trusting the number.
export const PILE_HEADROOM = 12;

export const SHELF_HEADROOM = Math.floor(SHELF_CLEAR / BOX_H);

// doorH is generous on purpose: a 1.0-tall NPC needs the opening to read as a shop door, not a
// hatch, and the tallest species (llama, per P1-SPIKE-PLAN) is ~1.33 before any hat.
export const ROOM = { w: 6.4, d: 6.4, wallH: 2.6, doorW: 1.2, doorH: 2.0 };

export const SEAT_H = 0.22;   // chair seat height — roughly one chibi leg

export const S = {
  quality:     'high',
  detail:      'high',
  renderScale: 1.0,
  partShadows: true,
  mergeMeshes: true,
  blobShadows: false,
  shadows:     true,
  view:        'felted',
  npcCount:     2,
  displayCount: 2,
  chairCount:   2,
  showGrid:    true,
  moveMode:    false,   // DISPLAYS.md rule 10: dragging rearranges the SHOP, not the stock
  lockCamera:  false,   // freeze the view so arranging cannot knock it askew
  // Screen-space slack on a grab, in CSS pixels, for a coarse pointer. Halved for a mouse. 44 is
  // the Apple/Material minimum touch target, and a notion box measures 12-20px on a tablet.
  grabRadius:  44,
  // How far a carried item floats above the pointer, in world units, measured along SCREEN up
  // (see refreshFloating). A fingertip hides roughly its own width of the picture, so this is
  // the knob that decides whether the player can see what they are holding. ~0.30 clears a
  // finger at the framing camera; it is exposed because that depends on the real device.
  liftHeight: 0.30,
  // How far a drop reaches for a slot it actually fits in, in SLOTS. See nearestSlot.
  snapCells: 1.6,
  // How many boxes the shop puts out in total, customer seeds included. Small on purpose: a
  // sparse shop is the readable one, and it is the arrangement the player is meant to be fixing.
  stockCount: 10,
  // Round pacing defaults to CONTINUOUS. A round is 15 in-game minutes (CHARACTER-VISIT.md), but
  // that says nothing about real seconds — and at the old 30s the cast walked for ~1.5s and then
  // stood frozen for 28. This is just over the longest a staggered walk can take
  // (travelJitter + travel * (1 + paceJitter)), so a round ends about when the motion does.
  autoSeconds: 3,
  dayGap: 0,            // seconds the shop sits empty between closing and the next day's queue
  travel:      1.4,     // seconds of animation per round of movement
  travelJitter: 0.5,    // max random delay before an NPC sets off, so departures stagger
  paceJitter:  0.25,    // +/- fraction on each NPC's own travel time, so arrivals stagger too
  // How far a seated NPC rises so they rest ON the chair rather than through it. The rig grounds
  // every pose to feet-at-zero, so this cannot be derived — it needs eyeballing per seat height.
  seatLift:    0.16,
  // The halo and the drop ghost are deliberately ONE colour: the thing in your hand and the
  // slot it is going into are two halves of the same statement, and colouring them separately
  // made the player match them up themselves. Same green, so the eye pairs them for free.
  glowColor:   GHOST_OK,
  glowSpeed:   0.8,         // pulses per second
  glowPad:     0.055,       // world units the halo extends past the box at its widest
  exposure:    BASE_PARAMS.exposure,
  toneMapping: BASE_PARAMS.toneMapping,
};

export const QUALITY = {
  low:    { detail: 'low',  renderScale: 0.75, blobShadows: true,  partShadows: false },
  medium: { detail: 'med',  renderScale: 1.00, blobShadows: true,  partShadows: false },
  high:   { detail: 'high', renderScale: 1.00, blobShadows: false, partShadows: true  },
};

/**
 * Height of a stack layer ABOVE ITS OWN LEVEL. The level's height (and tilt) live in its frame,
 * so this needs no shelf index — and a caller that forgets to use the matching level frame gets
 * an obviously wrong position rather than a subtly wrong one.
 *
 * Lives here rather than with the paint path because it is arithmetic on BOX_H and nothing else,
 * and the pointer→slot query needs it without wanting to depend on the renderer.
 */
export const layerY = (layer) => layer * BOX_H;
