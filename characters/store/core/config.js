import { BASE_PARAMS } from '../../npc.js';

export const CELL = 0.20;        // DISPLAYS.md rule 2

export const BOX_H = 0.055;      // one 2.5D layer

// UI colours: their materials set toneMapped = false (VISUAL-DESIGN-2D.md §Signal colours)
export const GHOST_OK = '#25e06a', GHOST_NO = '#ff2d16';

export const GHOST_ALPHA = 0.85;

// DISPLAYS.md §Wall shelves
export const SHELF_TILT = Math.PI / 4;

export const SHELF_ROWS = 2;

// DISPLAYS.md §Wall shelves: clearance decides which yarn fits
const SHELF_CLEAR = BOX_H * 2 + 0.06;

export const SHELF_GAP = SHELF_ROWS * CELL * Math.sin(SHELF_TILT) + SHELF_CLEAR;

// the tallest cone in layers; checkStockable asserts it equals yarnFit
export const TALLEST_LAYERS = 12;

export const PILE_HEADROOM = TALLEST_LAYERS;

// DISPLAYS.md §Piles and the floor
export const FLOOR_HEADROOM = TALLEST_LAYERS * 4;

export const SHELF_HEADROOM = Math.floor(SHELF_CLEAR / BOX_H);

export const ROOM = { w: 9.6, d: 7.2, wallH: 2.6, doorW: 1.2, doorH: 2.0 };

export const SHOP_ASPECT = 2000 / 1141;   // STORE-SCENE.md §Camera

/**
 * STORE-SCENE.md §Camera: the establishing shot
 * @param {number} aspect
 */
export function shopView(aspect) {
  const target = [0, 0.6, 0], eye = [5.67, 2.72, 3.01], back = Math.max(1, SHOP_ASPECT / aspect);
  return { target, eye: eye.map((e, i) => target[i] + (e - target[i]) * back), dist: 6.85 * back };
}

export const SEAT_H = 0.22;

export const CHAIR_W = 0.34;

export const CHAIR_BACK_Z = -(CHAIR_W / 2) - 0.065;

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
  floorGrid:   true,
  moveMode:    false,   // DISPLAYS.md rule 10
  lockCamera:  false,
  // CSS px, halved for a mouse; 44 is the Apple/Material minimum touch target
  grabRadius:  44,
  // world units along screen up, clears a fingertip; tune per device
  liftHeight: 0.30,
  // in slots
  snapCells: 1.6,
  // DISPLAYS.md §Stock
  stockCount: 100,
  seedWants: false,
  tutorial: false,
  // CHARACTER-VISIT.md §Rounds and the door; just over the longest staggered walk
  autoSeconds: 4,
  autoRounds:  true,
  autoDay:     true,
  dayGap: 0,            // seconds
  travel:      1.4,     // seconds
  // CHARACTER-VISIT.md §Staggered departures: travelJitter + travel * (1 + paceJitter) fits autoSeconds
  travelJitter: 1.6,
  paceJitter:  0.25,
  // units per second; 0 uses `travel`
  walkSpeed:   0,
  paused:      false,
  seatLift:    0.01,
  glowColor:   GHOST_OK,
  glowSpeed:   0.8,         // pulses per second
  glowPad:     0.055,
  followDay:   true,
  timeOfDay:   0,
  exposure:    0.6,
  toneMapping: BASE_PARAMS.toneMapping,
};

/** PLAYING-AT-YOUR-PACE.md §3: speeds ▶ ▶▶ ▶▶▶ ⏸ */
export function gameSpeed(k) {
  if (!k) return { autoRounds: false, paused: true };
  return { autoRounds: true, paused: false, walkSpeed: 0.24 * k, autoSeconds: 12 / k, travelJitter: 4.8 / k };
}

// gateSpeed and cadenceMin tuned for the game's slow ▶ walk (speed.test.mjs)
export const SHOP_GAIT = Object.freeze({ gateSpeed: 0.1, cadenceMin: 1.5 });

export const QUALITY = {
  low:    { detail: 'low',  renderScale: 0.75, blobShadows: true,  partShadows: false },
  medium: { detail: 'med',  renderScale: 1.00, blobShadows: true,  partShadows: false },
  high:   { detail: 'high', renderScale: 1.00, blobShadows: false, partShadows: true  },
};

export const layerY = (layer) => layer * BOX_H;
