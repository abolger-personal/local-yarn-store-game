// Shelves, tables and floor piles: construction, level frames and the slot grids.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { touchView, seats, aim, mover, displays } from '../core/state.js';
import { gridSize, makeDisplay } from '../../../inventory/grid.js';
import { makeGridLines } from '../../../inventory/notions.js';
import * as THREE from 'three';
import { BOX_H, CELL, PILE_HEADROOM, ROOM, SHELF_GAP, SHELF_HEADROOM, SHELF_ROWS, SHELF_TILT } from '../core/config.js';
import { scene } from './stage.js';
import { COUNTER, GLASS_T, HALF_D, HALF_W, UP, clearGroup, glassMat, woodMat } from './room.js';
import { CHAIR_W } from './seating.js';

// ---------------------------------------------------------------- displays
//
// One of each type in DISPLAYS.md: a wall shelf and a floor/table pile. Copied from
// inventory/stash-and-stuff.html rather than imported, because that file is a page, not a module.
// TODO: extract the shared painting code (paintInstance/refresh below) into inventory/ so this and
// stash-and-stuff.html stop being two copies of the same thirty lines.
function makeFrame(position, quaternion) {
  const frame = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return { frame, frameInv: frame.clone().invert(), quat: quaternion.clone() };
}

const SHELF_BASE_Y = 0.34;   // the plinth: puts the top shelf at roughly NPC head height

const TABLE_TOP_Y = 0.44;

const STAND_OFF = 0.65;      // how far in front of a display an NPC stands to reach it

// Authored positions, taken from the front as the count goes up. Shelves carry a yaw so they can
// sit against a side wall; a pile is a free-standing table and always reads the same way round.
// `kind` is what the SIM branches on and stays the two types DISPLAYS.md defines: 'shelf' or
// 'pile'. `form` is the specific piece of furniture — it drives how the thing is built and how high
// it stands, and it is the hook for NPCs treating a floor pile differently from a table later
// without needing a third set of stacking rules today.
//
// (Not to be confused with LYS.md §5b's "floor pile", the unslotted delivery inbox. This is
// DISPLAYS.md type A, "Floor or Table Pile" — a real slotted display that sits on the ground.)
export const DISPLAY_SLOTS = [
  { id: 'shelf-n', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: 0,    z: -HALF_D + 0.5, yaw: 0 },
  { id: 'table-a', kind: 'pile',  form: 'table',      cols: 5, rows: 5, shelves: 1, headroom: PILE_HEADROOM, x: 1.5,  z: -0.2,          yaw: 0 },
  { id: 'shelf-e', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: HALF_W - 0.5, z: -1.1,  yaw: -Math.PI / 2 },
  { id: 'shelf-w', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: -HALF_W + 0.5, z: -1.6, yaw: Math.PI / 2 },
  { id: 'table-b', kind: 'pile',  form: 'table',      cols: 4, rows: 4, shelves: 1, headroom: PILE_HEADROOM, x: 1.45, z: 1.75,          yaw: 0 },
  { id: 'table-c', kind: 'pile',  form: 'table',      cols: 4, rows: 4, shelves: 1, headroom: PILE_HEADROOM, x: -0.35, z: -1.75,        yaw: 0 },
];

/**
 * The shop floor, as a row of PILES.
 *
 * Deliberately NOT in DISPLAY_SLOTS: it is the room, not furniture. It cannot be added, removed,
 * moved or turned, and it is always built LAST so that every other display — and the counter, the
 * chairs and the doorway — masks a hole straight through it. What is left is exactly the floor you
 * can actually stand a box on.
 *
 * `solid: false` is the whole of what makes that safe. Everything else in the room treats a
 * display as an obstacle: the sim routes NPCs around one and blocks line of sight through one, and
 * the placement test refuses to put furniture inside one. A room-sized obstacle would wall the
 * shop off from itself. This is a surface you walk ON, so it is excluded from all three — see
 * roomObstacles here, and `obstacles`/`canSee` in visit.js.
 *
 * CUT INTO TILES, because one room-sized display is one destination. An NPC decides what to walk
 * to per display — attractiveness, visibility, the standing spot — so a single floor grid meant
 * "there is yarn on the floor SOMEWHERE" and sent the whole cast to the same spot in the middle of
 * the room. A tile is a pile: it is judged on the stock that is actually in it, it is seen from
 * where it actually is, and it is stood beside where it actually is.
 *
 * The whole floor stays usable — the tiles tile it, edge tiles take the remainder. What is given
 * up is a footprint straddling a tile boundary, which now has to fit inside one tile.
 */
// How close to a wall anything may stand: the panel is 0.08 thick and centred on the boundary, so
// 0.04 of it is inside the room, plus 0.02 of slack. Named because the wall-shelf snap has to stand
// a display off by AT LEAST this much — a snap that lands inside its own clearance makes the
// display red against every wall in the shop, which is exactly the bug this constant prevents.
export const WALL_INSET = 0.04 + 0.02;

const FLOOR_COLS = Math.floor((ROOM.w - WALL_INSET * 2) / CELL);
const FLOOR_ROWS = Math.floor((ROOM.d - WALL_INSET * 2) / CELL);

export const ROOM_FLOOR = Object.freeze({
  id: 'floor', kind: 'pile', form: 'floor', solid: false,
  cols: FLOOR_COLS, rows: FLOOR_ROWS, shelves: 1, headroom: PILE_HEADROOM,
  x: 0, z: 0, yaw: 0,
});

/**
 * Cells per side of one floor pile. 4 is 0.8 units — about the size of a real heap of yarn, and
 * far enough apart that two customers browsing neighbouring piles are not standing in each other.
 * The ONE number to change: 3 makes more, smaller piles; 8 makes a handful of big zones.
 */
const FLOOR_TILE = 4;

/** The floor, as slot specs. The remainder goes to the edge tiles rather than off the grid. */
function floorTiles() {
  const out = [];
  const x0 = -(FLOOR_COLS * CELL) / 2, z0 = -(FLOOR_ROWS * CELL) / 2;
  for (let r = 0; r < FLOOR_ROWS; r += FLOOR_TILE)
    for (let c = 0; c < FLOOR_COLS; c += FLOOR_TILE) {
      const cols = Math.min(FLOOR_TILE, FLOOR_COLS - c);
      const rows = Math.min(FLOOR_TILE, FLOOR_ROWS - r);
      out.push({ ...ROOM_FLOOR, id: `floor-${c}-${r}`, cols, rows,
                 x: x0 + (c + cols / 2) * CELL, z: z0 + (r + rows / 2) * CELL });
    }
  return out;
}

// A shoulder. Matches visit.js's BODY_RADIUS, which is the sim's and cannot be imported here
// without the scene depending on the simulation.
const STAND_HALF = 0.12;

/**
 * Where an NPC stands to browse a floor pile.
 *
 * Furniture has a front, and STAND_OFF puts them in front of it. A heap on the ground has no
 * front, so take the first side that is clear of the walls and of everything else in the room.
 * null means it is hemmed in on all four sides, which is not a pile — it is the patch of floor
 * under a table, and buildDisplays drops it.
 */
function standBeside(d, obstacles) {
  const reach = Math.max(d.w, d.d) / 2 + STAND_OFF;
  for (const [sx, sz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const x = d.x + sx * reach, z = d.z + sz * reach;
    if (boxIsClear(x, z, STAND_HALF, obstacles)) return { x, z };
  }
  return null;
}

const displayGroup = new THREE.Group();

export const byId = (id) => displays.find((d) => d.id === id);

/**
 * One display from a slot spec. The sim treats a display as an axis-aligned box, so a shelf turned
 * 90° has to report its footprint swapped — otherwise the visibility test thinks a side-wall shelf
 * is wide when it is actually deep, and NPCs "see" through it.
 */
/** World XZ centre of one slot, accounting for the display's yaw. */
function slotCellWorld(slot, c, r) {
  const lx = (c + 0.5) * CELL - (slot.cols * CELL) / 2;
  // Plan view, so a tilted level's rows are foreshortened onto the floor — the masking and the
  // placement tests both work in XZ and would otherwise reserve depth the shelf does not occupy.
  const squash = Math.cos(slot.tilt ?? 0);
  const lz = ((r + 0.5) * CELL - (slot.rows * CELL) / 2) * squash;
  const sin = Math.sin(slot.yaw), cos = Math.cos(slot.yaw);
  return { x: slot.x + lx * cos + lz * sin, z: slot.z - lx * sin + lz * cos };
}

/**
 * Slots that would sit inside a wall, the counter, a chair or an already-placed display are masked
 * out at GENERATION time, so a display simply comes out a funny shape — a 4x4 floor pile against
 * the counter becomes a 3x2. grid.js already models a masked slot as a hole (`usable`), footprint()
 * refuses to span one, and makeGridLines draws only usable cells, so the shape is honest all the
 * way through to what the player sees. Nothing downstream needed changing.
 *
 * ponytail: axis-aligned boxes and a per-cell test. Exact at the axis-aligned yaws; at the 45°
 * detents rule 10 allows, a turned cell is tested by its CIRCUMRADIUS instead — conservative, so a
 * display may refuse a spot it would just barely have fitted, but never clips the counter. A real
 * OBB test is the upgrade if that ever feels tight.
 */

/** An axis-aligned box on the floor, clear of the room shell and of everything else solid in it. */
export function boxIsClear(x, z, half, obstacles) {
  if (Math.abs(x) + half > HALF_W - WALL_INSET) return false;
  if (Math.abs(z) + half > HALF_D - WALL_INSET) return false;
  return !obstacles.some((o) =>
    Math.abs(x - o.x) < half + o.w / 2 + o.pad &&
    Math.abs(z - o.z) < half + o.d / 2 + o.pad);
}

export function cellIsClear(slot, c, r, obstacles) {
  const p = slotCellWorld(slot, c, r);
  return boxIsClear(p.x, p.z,
    Math.abs(Math.sin(2 * slot.yaw)) < 1e-6 ? CELL / 2 : CELL * Math.SQRT1_2, obstacles);
}

/**
 * Solid things already in the room. `dispList` gives earlier slots priority over later ones during
 * the build; both lists are parameters because a thing being MOVED must not be an obstacle to
 * itself — it would then be blocked by the very spot it is standing in.
 */
export function roomObstacles(dispList, seatList = seats) {
  // The doorway is the only way in, so nothing may be parked across it — the same thing
  // room.doorClearance says for NPCs, in the form the grids are masked against. Every authored
  // slot already sits well clear of this, so it only ever bites on something the player moved.
  const out = [{ ...COUNTER, pad: 0.05 }, { x: 0, z: HALF_D - 0.45, w: ROOM.doorW + 0.4, d: 0.9, pad: 0 }];
  for (const s of seatList) out.push({ x: s.x, z: s.z, w: CHAIR_W, d: CHAIR_W, pad: 0.10 });
  // A display you walk ON is not something to walk around — see ROOM_FLOOR. Without this the
  // floor masks every other display out of existence, itself included.
  for (const d of dispList) {
    if (d.solid === false) continue;
    out.push({ x: d.x, z: d.z, w: d.w, d: d.d, pad: 0.02 });
  }
  return out;
}

/**
 * Everything derived from a display's pose, in one place — because the player can now change that
 * pose at runtime (DISPLAYS.md rule 10) and every one of these caches would otherwise go stale.
 *
 * This is also the whole of "all Inventory will stay with the move": an item's world matrix is
 * composed against `frame` every time it is painted, so moving the frame carries the stock with it
 * and not one line of the item code has to know a display can move.
 */
export function applyTransform(d, x, z, yaw) {
  d.x = x; d.z = z; d.yaw = yaw;
  d.tilt = d.kind === 'shelf' ? SHELF_TILT : 0;
  const quat = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  Object.assign(d, makeFrame(new THREE.Vector3(x, d.plinthY, z), quat));

  // The SIM treats a display as an axis-aligned box (line of sight, standing room), so report the
  // AABB of the turned rectangle. At 0/90 that is the old width/depth swap; at a 45° detent it is
  // the diagonal, which is the honest answer rather than a shelf NPCs can see straight through.
  const { w: gw, d: gd0 } = gridSize(d.g);
  // A tilted level leans back, so it takes up LESS floor than its grid is deep. The sim routes
  // NPCs around this box and rule 10 places furniture against it, so reporting the flat depth
  // would fence off floor the shelf does not actually stand on.
  const gd = gd0 * Math.cos(d.tilt);
  const sin = Math.abs(Math.sin(yaw)), cos = Math.abs(Math.cos(yaw));
  d.w = gw * cos + gd * sin;
  d.d = gw * sin + gd * cos;
  // Local +Z is the display's front (local -Z, row 0, is the wall side), rotated into world space.
  d.standAt = { x: x + Math.sin(yaw) * STAND_OFF, z: z + Math.cos(yaw) * STAND_OFF };
  buildLevelFrames(d);
  if (d.group) d.group.matrix.copy(d.frame);
}

/**
 * One frame per shelf LEVEL, so a level is a plane in its own right rather than a height above the
 * display. Everything that used to be "the display frame, at y = shelf * gap" now goes through
 * these: painting, picking, the drop ghost and the grid lines. That is what lets a level be
 * tilted at all — a tilt cannot be expressed as a height.
 *
 * A pile's levels are simply untilted, so piles keep behaving exactly as before and no caller has
 * to know which kind it is holding.
 */
function buildLevelFrames(d) {
  const tilt = d.kind === 'shelf' ? SHELF_TILT : 0;
  d.tilt = tilt;
  d.levels = [];
  for (let s = 0; s < d.g.shelves; s++) {
    const m = new THREE.Matrix4()
      .makeTranslation(0, s * d.gap, 0)
      // +X is the shelf's width, so tilting about it lifts the wall edge (local -Z) and drops the
      // front edge (local +Z) — items lean back into the shelf, exactly like the real furniture.
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    const frame = d.frame.clone().multiply(m);
    d.levels.push({
      frame,
      frameInv: frame.clone().invert(),
      quat: new THREE.Quaternion().setFromRotationMatrix(frame),
      local: m,
    });
  }
}

/** The world frame of one shelf level. Falls back to the display's own for anything unbuilt. */
export const levelFrame = (d, shelf) => (d.levels?.[shelf]?.frame ?? d.frame);

function makeDisplayFromSlot(slot, builtSoFar = []) {
  const d = {
    id: slot.id, kind: slot.kind, form: slot.form, solid: slot.solid !== false,
    wallRow: slot.kind === 'shelf' ? 0 : -1,   // a table has no wall side
    g: makeDisplay(slot.cols, slot.rows, {
      shelves: slot.shelves, headroom: slot.headroom, cell: CELL,
      // Same holes on every level: what is blocked is blocked in plan, whatever the height.
      mask: (s, c, r) => cellIsClear({ ...slot, tilt: slot.kind === 'shelf' ? SHELF_TILT : 0 },
                                      c, r, roomObstacles(builtSoFar)),
    }),
    // Named plinthY, not baseY: baseY() is the function for an item's height WITHIN a display, and
    // two different heights called the same thing is a bug waiting to happen.
    gap: SHELF_GAP, plinthY: { 'wall-shelf': SHELF_BASE_Y, table: TABLE_TOP_Y, floor: 0 }[slot.form],
    plane: 0,                                  // which shelf level the player is arranging
    lines: [], panels: [],
  };
  applyTransform(d, slot.x, slot.z, slot.yaw);
  return d;
}

/**
 * Rebuild the displays.
 *
 * The caller must drop anything in hand first (restart does): every display object here is
 * replaced, so a drag holding an index into the old ones cannot survive. Doing it in here meant
 * this module importing the interaction layer, which is the edge that kept the graph circular.
 */
/**
 * The floor, last, so its tiles are masked against everything: the furniture keeps its cells and
 * the floor loses the ones underneath. `displayCount` does not include these — the floor is always
 * there. Tiles do not mask each other, because roomObstacles skips anything `solid: false`.
 */
function buildFloor() {
  for (const slot of floorTiles()) {
    const d = makeDisplayFromSlot(slot, displays);
    d.standAt = standBeside(d, roomObstacles(displays));
    // A tile with no cell left, or with nowhere to stand beside it, is not a pile — it is the
    // floor under a table. Dropping it keeps the display list a list of PLACES, which is what
    // every NPC decision iterates over.
    if (d.standAt && d.g.usable.includes(1)) displays.push(d);
  }
}

export function buildDisplays(n) {
  mover.m = null;
  mover.sel = null;
  clearGroup(displayGroup);
  // Built one at a time, each masked against the ones already placed — so where two slots overlap
  // the earlier one keeps its cells and the later one loses them, rather than both interpenetrating.
  // In place: every module holds this same array, so replacing it would leave them
  // pointing at the old one. This is the price of shared state and it is a small one.
  displays.length = 0;
  for (const slot of DISPLAY_SLOTS.slice(0, n)) displays.push(makeDisplayFromSlot(slot, displays));
  buildFloor();
  if (!byId(aim.active)) aim.active = displays[0]?.id ?? null;
  for (const d of displays) {
    d.group = new THREE.Group();
    d.group.matrixAutoUpdate = false;
    d.group.matrix.copy(d.frame);
    displayGroup.add(d.group);
    buildFurniture(d);
  }
  touchView();     // the lattices are new; the frame loop repaints them
}

/**
 * The slab the whole display rests on.
 *
 * A floor pile gets none — it sits directly on the shop floor, and a full-rectangle slab would
 * poke through the very counter and chairs its slots were just masked away from.
 *
 * A TILTED shelf gets none either, for a sharper reason: the slab is horizontal at y≈0 and the
 * bottom level's front edge now dips BELOW that, so the slab cut straight through the level it
 * was supposed to be supporting. Each tilted level carries its own board instead.
 */
export const hasSurface = (d) => d.form !== 'floor' && !d.tilt;

function addSurface(d, w, depth) {
  if (!hasSurface(d)) return;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, GLASS_T * 2, depth * 1.06), woodMat);
  surface.position.y = -GLASS_T;
  surface.receiveShadow = true;
  d.group.add(surface);
}

/**
 * The board a tilted level's stock rests ON, and the lip along its low edge.
 *
 * A flat display gets its support from the surface slab below; a tilted one needs its own or the
 * boxes float on nothing. The lip is what makes the tilt look deliberate rather than like a bug —
 * stock reads as resting against something rather than sliding off.
 */
function addTiltedBoard(node, w, depth) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, GLASS_T * 2, depth * 1.04), woodMat);
  board.position.y = -GLASS_T;
  board.receiveShadow = true;
  node.add(board);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, BOX_H * 0.7, GLASS_T * 2), woodMat);
  lip.position.set(0, BOX_H * 0.3, depth / 2);
  lip.castShadow = true;
  node.add(lip);
}

/**
 * One level's furniture, parented to a node carrying that level's own transform — so a tilted
 * shelf brings its board, its glass and its lattice round with it. `d.group` already holds the
 * display frame, so this is the LOCAL part only.
 */
function addLevel(d, s, w, depth) {
  const node = new THREE.Group();
  node.matrixAutoUpdate = false;
  node.matrix.copy(d.levels[s].local);
  d.group.add(node);

  const lines = makeGridLines(d.g, s);
  lines.position.y = 0.002;
  d.lines.push(lines);
  node.add(lines);

  if (d.tilt) {
    addTiltedBoard(node, w, depth);
    return;
  }
  if (s === 0) return;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, GLASS_T, depth * 1.06), glassMat);
  panel.position.y = -GLASS_T / 2;
  d.panels.push(panel);
  node.add(panel);
}

/**
 * The plinth, in the display's LOCAL space so a rotated display brings it round rather than
 * leaving it behind axis-aligned.
 *
 * A floor pile has none — it IS on the floor. Nor does a tilted shelf: the plinth is a solid box
 * from the floor up to y = 0, and the bottom level's front edge hangs below that, so the box
 * swallowed the corner of the shelf. It is also simply not what the furniture is — this is a WALL
 * shelf, carried by the back panel against the wall, and a real one has nothing underneath it.
 */
export const hasPlinth = (d) => d.plinthY > 0 && !d.tilt;

function addPlinth(d, w, depth) {
  if (!hasPlinth(d)) return;
  const leg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, d.plinthY, depth * 0.92), woodMat);
  leg.position.y = -d.plinthY / 2;
  leg.castShadow = true;
  leg.receiveShadow = true;
  d.group.add(leg);
}

/**
 * The back panel, so "wall-facing row" is visible as well as modelled. It has to clear the tilted
 * levels, whose wall edges rise above the level's own origin.
 */
function addBackPanel(d, w, depth) {
  if (d.kind !== 'shelf') return;
  const rise = (depth / 2) * Math.sin(d.tilt);
  // With no plinth this panel is the whole support, so it runs from the floor to the top level.
  const tall = d.g.shelves * d.gap + rise + (d.tilt ? d.plinthY : 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, tall, 0.03), woodMat);
  back.position.set(0, tall / 2 - (d.tilt ? d.plinthY : 0),
                    -(depth / 2) * Math.cos(d.tilt) - 0.02);
  back.castShadow = true;
  back.receiveShadow = true;
  d.group.add(back);
}

/** Physical furniture under the grids, so displays read as shop fittings and not floating slots. */
export function buildFurniture(d) {
  const { w, d: depth } = gridSize(d.g);
  addSurface(d, w, depth);
  for (let s = 0; s < d.g.shelves; s++) addLevel(d, s, w, depth);
  addPlinth(d, w, depth);
  addBackPanel(d, w, depth);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installDisplays() {
  scene.add(displayGroup);
}
