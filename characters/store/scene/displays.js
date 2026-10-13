import { touchView, seats, props, aim, mover, displays, items } from '../core/state.js';
import { gridSize, makeDisplay } from '../../../inventory/grid.js';
import { makeGridLines } from '../../../inventory/notions.js';
import * as THREE from 'three';
import { BOX_H, CELL, FLOOR_HEADROOM, PILE_HEADROOM, ROOM, SHELF_GAP, SHELF_HEADROOM, SHELF_ROWS, SHELF_TILT } from '../core/config.js';
import { scene } from './stage.js';
import { COUNTER, GLASS_T, HALF_D, HALF_W, UP, clearGroup, glassMat, woodMat } from './room.js';
import { CHAIR_W } from './seating.js';
import { board, panel, turned, woodMesh } from './wood.js';

function makeFrame(position, quaternion) {
  const frame = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return { frame, frameInv: frame.clone().invert(), quat: quaternion.clone() };
}

const SHELF_BASE_Y = 0.34;   // DISPLAYS.md §Wall shelves: top shelf at about NPC head height

const TABLE_TOP_Y = 0.44;

export const STAND_OFF = 0.65;

export const DISPLAY_SLOTS = [
  { id: 'shelf-n', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: -1.5, z: -HALF_D + 0.5, yaw: 0 },
  { id: 'table-a', kind: 'pile',  form: 'table',      cols: 5, rows: 5, shelves: 1, headroom: PILE_HEADROOM, x: 0.6,  z: -0.3,          yaw: 0 },
  { id: 'table-d', kind: 'pile',  form: 'table',      cols: 5, rows: 5, shelves: 1, headroom: PILE_HEADROOM, x: 3.85, z: 1.9,           yaw: 0 },
  { id: 'shelf-e', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: HALF_W - 0.5, z: -1.3,  yaw: -Math.PI / 2 },
  { id: 'shelf-w', kind: 'shelf', form: 'wall-shelf', cols: 5, rows: SHELF_ROWS, shelves: 3, headroom: SHELF_HEADROOM, x: -HALF_W + 0.5, z: -2.0, yaw: Math.PI / 2 },
  { id: 'table-b', kind: 'pile',  form: 'table',      cols: 4, rows: 4, shelves: 1, headroom: PILE_HEADROOM, x: 2.4,  z: 1.9,           yaw: 0 },
  { id: 'table-c', kind: 'pile',  form: 'table',      cols: 4, rows: 4, shelves: 1, headroom: PILE_HEADROOM, x: 2.6,  z: -2.2,          yaw: 0 },
];

// Half the 0.08 wall panel plus 0.02 slack; move mode's clamp must stand off at least this much.
export const WALL_INSET = 0.04 + 0.02;

const FLOOR_COLS = Math.floor((ROOM.w - WALL_INSET * 2) / CELL);
const FLOOR_ROWS = Math.floor((ROOM.d - WALL_INSET * 2) / CELL);

export const ROOM_FLOOR = Object.freeze({
  id: 'floor', kind: 'pile', form: 'floor', solid: false,
  cols: FLOOR_COLS, rows: FLOOR_ROWS, shelves: 1, headroom: FLOOR_HEADROOM,
  x: 0, z: 0, yaw: 0,
});

const FLOOR_TILE = 4;   // DISPLAYS.md §Piles and the floor

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

// Matches visit.js's BODY_RADIUS; importing it would make the scene depend on the sim.
export const STAND_HALF = 0.12;

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

function slotCellWorld(slot, c, r) {
  const lx = (c + 0.5) * CELL - (slot.cols * CELL) / 2;
  const squash = Math.cos(slot.tilt ?? 0);
  const lz = ((r + 0.5) * CELL - (slot.rows * CELL) / 2) * squash;
  const sin = Math.sin(slot.yaw), cos = Math.cos(slot.yaw);
  return { x: slot.x + lx * cos + lz * sin, z: slot.z - lx * sin + lz * cos };
}

// ponytail: AABB per-cell test, a turned cell tested by its circumradius (conservative); OBB test if that feels tight.
export function boxIsClear(x, z, half, obstacles) {
  // Negated so a NaN pose is never clear.
  if (!(Math.abs(x) + half <= HALF_W - WALL_INSET)) return false;
  if (!(Math.abs(z) + half <= HALF_D - WALL_INSET)) return false;
  return !obstacles.some((o) =>
    Math.abs(x - o.x) < half + o.w / 2 + o.pad &&
    Math.abs(z - o.z) < half + o.d / 2 + o.pad);
}

export const cellHalf = (yaw) => (Math.abs(Math.sin(2 * yaw)) < 1e-6 ? CELL / 2 : CELL * Math.SQRT1_2);

export function cellIsClear(slot, c, r, obstacles) {
  const p = slotCellWorld(slot, c, r);
  return boxIsClear(p.x, p.z, cellHalf(slot.yaw), obstacles);
}

export function roomObstacles(dispList, seatList = seats, propList = props) {
  const out = [{ ...COUNTER, pad: 0.05 }, { x: 0, z: HALF_D - 0.45, w: ROOM.doorW + 0.4, d: 0.9, pad: 0 }];
  for (const s of seatList) out.push({ x: s.x, z: s.z, w: CHAIR_W, d: CHAIR_W, pad: 0.10 });
  for (const p of propList) out.push({ x: p.x, z: p.z, w: p.w, d: p.d, pad: 0.05 });
  for (const d of dispList) {
    if (d.solid === false) continue;
    // 0.035 clears the back panel, so back-to-back shelves meet panel to panel.
    out.push({ x: d.x, z: d.z, w: d.w, d: d.d, pad: d.kind === 'shelf' ? 0.035 : 0.02 });
  }
  return out;
}

export function applyTransform(d, x, z, yaw) {
  d.x = x; d.z = z; d.yaw = yaw;
  d.tilt = d.kind === 'shelf' ? SHELF_TILT : 0;
  const quat = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  Object.assign(d, makeFrame(new THREE.Vector3(x, d.plinthY, z), quat));

  const { w: gw, d: gd0 } = gridSize(d.g);
  const gd = gd0 * Math.cos(d.tilt);
  const sin = Math.abs(Math.sin(yaw)), cos = Math.abs(Math.cos(yaw));
  d.w = gw * cos + gd * sin;
  d.d = gw * sin + gd * cos;
  d.standAt = { x: x + Math.sin(yaw) * STAND_OFF, z: z + Math.cos(yaw) * STAND_OFF };
  buildLevelFrames(d);
  if (d.group) { d.group.matrix.copy(d.frame); d.group.matrixWorldNeedsUpdate = true; }
}

function buildLevelFrames(d) {
  const tilt = d.kind === 'shelf' ? SHELF_TILT : 0;
  d.tilt = tilt;
  d.levels = [];
  for (let s = 0; s < d.g.shelves; s++) {
    const m = new THREE.Matrix4()
      .makeTranslation(0, s * d.gap, 0)
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

export const levelFrame = (d, shelf) => (d.levels?.[shelf]?.frame ?? d.frame);

function makeDisplayFromSlot(slot, builtSoFar = []) {
  const d = {
    id: slot.id, kind: slot.kind, form: slot.form, solid: slot.solid !== false,
    wallRow: slot.kind === 'shelf' ? 0 : -1,
    g: makeDisplay(slot.cols, slot.rows, {
      shelves: slot.shelves, headroom: slot.headroom, cell: CELL,
      mask: (s, c, r) => cellIsClear({ ...slot, tilt: slot.kind === 'shelf' ? SHELF_TILT : 0 },
                                      c, r, roomObstacles(builtSoFar)),
      round: (i) => items[i]?.name === 'yarn' && items[i].shape !== 'skein',
    }),
    gap: SHELF_GAP, plinthY: { 'wall-shelf': SHELF_BASE_Y, table: TABLE_TOP_Y, floor: 0 }[slot.form],
    plane: 0,
    lines: [], panels: [],
  };
  applyTransform(d, slot.x, slot.z, slot.yaw);
  return d;
}

function buildFloor() {
  for (const slot of floorTiles()) {
    const d = makeDisplayFromSlot(slot, displays);
    d.standAt = standBeside(d, roomObstacles(displays));
    if (d.standAt && d.g.usable.includes(1)) displays.push(d);
  }
}

// The caller must drop anything in hand first: every display object is replaced.
export function buildDisplays(n) {
  mover.m = null;
  mover.sel = null;
  clearGroup(displayGroup);
  // In place: every module holds this same array.
  displays.length = 0;
  for (const slot of DISPLAY_SLOTS.slice(0, n)) displays.push(makeDisplayFromSlot(slot, displays));
  buildFloor();
  if (!byId(aim.active)) aim.active = displays[0]?.id ?? null;
  for (const d of displays) {
    d.group = new THREE.Group();
    d.group.matrixAutoUpdate = false;
    d.group.matrix.copy(d.frame);
    d.group.matrixWorldNeedsUpdate = true;
    displayGroup.add(d.group);
    buildFurniture(d);
  }
  touchView();
}

export const hasSurface = (d) => d.form !== 'floor' && !d.tilt;

function addSurface(d, w, depth) {
  if (!hasSurface(d)) return;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, GLASS_T * 2, depth * 1.06), woodMat);
  surface.position.y = -GLASS_T;
  surface.receiveShadow = true;
  d.group.add(surface);
}

function addTiltedBoard(node, w, depth) {
  node.add(woodMesh([
    [board(w * 1.04, GLASS_T * 2, depth * 1.04, 0.008), [0, -GLASS_T, 0]],
    [board(w * 1.04, BOX_H * 0.7, GLASS_T * 2, 0.008), [0, BOX_H * 0.3, depth / 2]],
  ], woodMat));
}

function addLevel(d, s, w, depth) {
  const node = new THREE.Group();
  node.matrixAutoUpdate = false;
  node.matrix.copy(d.levels[s].local);
  node.matrixWorldNeedsUpdate = true;
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
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, GLASS_T, depth * 1.06), glassMat);
  glass.position.y = -GLASS_T / 2;
  d.panels.push(glass);
  node.add(glass);
}

export const hasPlinth = (d) => d.plinthY > 0 && !d.tilt;

function addPlinth(d, w, depth) {
  if (!hasPlinth(d)) return;
  const leg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, d.plinthY, depth * 0.92), woodMat);
  leg.position.y = -d.plinthY / 2;
  leg.castShadow = true;
  leg.receiveShadow = true;
  d.group.add(leg);
}

function addBackPanel(d, w, depth) {
  if (d.kind !== 'shelf') return;
  const rise = (depth / 2) * Math.sin(d.tilt);
  const tall = d.g.shelves * d.gap + rise + (d.tilt ? d.plinthY : 0);
  const floorY = d.tilt ? -d.plinthY : 0, backZ = -(depth / 2) * Math.cos(d.tilt) - 0.02;
  const span = w * 1.06, planks = Math.max(3, Math.round(span / 0.16)), pw = span / planks;
  d.group.add(woodMesh([
    ...Array.from({ length: planks }, (_, i) =>
      [board(pw - 0.006, tall, 0.022, 0.004), [-span / 2 + pw * (i + 0.5), floorY + tall / 2, backZ]]),
    [board(span + 0.1, 0.03, 0.09, 0.01), [0, floorY + tall + 0.015, backZ + 0.02]],
    [board(span + 0.06, 0.018, 0.06, 0.006), [0, floorY + tall - 0.01, backZ + 0.02]],
    ...[-1, 1].map((sx) => [gable(d, depth, { floorY, tall, backZ }), [sx * (span / 2 + 0.014), 0, 0], [0, Math.PI / 2, 0]]),
  ], woodMat));
}

function gable(d, depth, { floorY, tall, backZ }) {
  const frontZ = (depth / 2) * Math.cos(d.tilt) + 0.03;
  const topFront = (d.g.shelves - 1) * d.gap - (depth / 2) * Math.sin(d.tilt) + 0.12;
  const top = floorY + tall;
  const curve = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return [-(backZ + (frontZ - backZ) * t), topFront + (top - topFront) * Math.cos(t * Math.PI / 2)];
  });
  // Foot raised by the bevel radius, which grows the outline.
  return panel([[-frontZ, floorY + 0.007], [-backZ, floorY + 0.007], ...curve], 0.026, 0.007);
}

function addTable(d, w, depth) {
  if (d.form !== 'table') return;
  const W = w * 1.06 + 0.04, D = depth * 1.06 + 0.04, inset = 0.06, legH = d.plinthY - 0.035;
  const ax = W / 2 - inset, az = D / 2 - inset;
  const apron = (len, at, turn) => [
    [board(len, 0.075, 0.022, 0.005), [at[0], -0.075, at[1]], [0, turn, 0]],
    [board(len + 0.01, 0.014, 0.03, 0.006), [at[0], -0.118, at[1]], [0, turn, 0]],
  ];
  d.group.add(woodMesh([
    [board(W, 0.035, D, 0.014), [0, -0.0175, 0]],
    [board(W - 0.03, 0.014, D - 0.03, 0.006), [0, -0.042, 0]],
    ...apron(ax * 2, [0, az], 0), ...apron(ax * 2, [0, -az], 0),
    ...apron(az * 2, [ax, 0], Math.PI / 2), ...apron(az * 2, [-ax, 0], Math.PI / 2),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      [turned('leg', legH, 0.032), [sx * ax, -d.plinthY, sz * az]]),
  ], woodMat));
}

export function buildFurniture(d) {
  const { w, d: depth } = gridSize(d.g);
  if (d.form !== 'table') addSurface(d, w, depth);
  for (let s = 0; s < d.g.shelves; s++) addLevel(d, s, w, depth);
  if (d.form !== 'table') addPlinth(d, w, depth);
  addTable(d, w, depth);
  addBackPanel(d, w, depth);
}

export function installDisplays() {
  scene.add(displayGroup);
}
