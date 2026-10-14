
import { activeDisplay, hoverTarget, raycaster, setRayFromEvent } from './pointer.js';
import { FLAT_Q, dropMarker } from './glow.js';
import { cast, seats, props, displays, aim, shop, touchView, touchHud, mover } from '../core/state.js';
import { gridSize, remask, usableAt } from '../../../inventory/grid.js';
import { seatById } from '../../visit.js';
import * as THREE from 'three';
import { CELL, GHOST_ALPHA, GHOST_NO, GHOST_OK, S } from '../core/config.js';

import { HALF_D, HALF_W, UP, clearGroup } from '../scene/room.js';
import { CHAIR_W, chairGroup } from '../scene/seating.js';
import { applyProp, propGroup } from '../scene/props.js';
import { STAND_HALF, STAND_OFF, WALL_INSET, applyTransform, boxIsClear, buildFurniture, cellHalf, cellIsClear, roomObstacles } from '../scene/displays.js';
import { refreshAll } from '../goods/paint.js';

export const YAW_STEP = Math.PI / 4;   // DISPLAYS.md rule 10

const isFree = (m) => !m.g;
const isProp = (m) => m.prop === true;
const isSeat = (m) => isFree(m) && !isProp(m);

const moveSize = (m) => {
  if (isProp(m)) return { w: m.w, d: m.d };
  return isSeat(m) ? { w: CHAIR_W, d: CHAIR_W } : gridSize(m.g);
};

export const movePose = (m) => ({ x: m.x, z: m.z, yaw: isSeat(m) ? m.facing : m.yaw });

export 
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const _floorHit = new THREE.Vector3();

export function floorPoint(event) {
  setRayFromEvent(event);
  if (!raycaster.ray.intersectPlane(_floorPlane, _floorHit)) return null;
  return { x: _floorHit.x, z: _floorHit.z };
}

export function applySeat(s, x, z, yaw) {
  s.x = x; s.z = z; s.facing = yaw;
  s.mesh.position.set(x, 0, z);
  s.mesh.rotation.y = yaw;
  const live = shop.world && seatById(shop.world, s.id);
  if (live) { live.x = x; live.z = z; live.facing = yaw; }
}

const applierOf = (m) => {
  if (isProp(m)) return applyProp;
  return isSeat(m) ? applySeat : applyTransform;
};

export const moveApply = (m, x, z, yaw) => applierOf(m)(m, x, z, yaw);

export function constrainPose(m, x, z, yaw) {
  yaw = Math.round(yaw / YAW_STEP) * YAW_STEP;
  const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));

  if (isFree(m)) {
    const edge = moveSize(m).w * Math.SQRT1_2 + WALL_INSET;
    return { x: clamp(x, HALF_W - edge), z: clamp(z, HALF_D - edge), yaw };
  }
  const half = cellHalf(yaw) + WALL_INSET + 1e-6;
  const lx = ((m.g.cols - 1) / 2) * CELL, lz = ((m.g.rows - 1) / 2) * CELL * Math.cos(m.tilt ?? 0);
  const sin = Math.abs(Math.sin(yaw)), cos = Math.abs(Math.cos(yaw));
  return { x: clamp(x, HALF_W - half - (lx * cos + lz * sin)), z: clamp(z, HALF_D - half - (lx * sin + lz * cos)), yaw };
}

// ponytail: a chair is tested against a display's full rectangle, so it cannot tuck into a carved notch.
export function canPlaceAt(m, pose) {
  if (isFree(m)) {
    return boxIsClear(pose.x, pose.z, moveSize(m).w * Math.SQRT1_2,
      roomObstacles(displays, seats.filter((s) => s !== m), props.filter((p) => p !== m)));
  }
  if (!boxIsClear(pose.x + Math.sin(pose.yaw) * STAND_OFF, pose.z + Math.cos(pose.yaw) * STAND_OFF, STAND_HALF, []))
    return false;
  const probe = { ...pose, cols: m.g.cols, rows: m.g.rows, tilt: m.tilt ?? 0 };
  const others = roomObstacles(displays.filter((o) => o !== m));
  for (let r = 0; r < m.g.rows; r++)
    for (let c = 0; c < m.g.cols; c++)
      if (usableAt(m.g, 0, c, r) && !cellIsClear(probe, c, r, others)) return false;
  return true;
}

function paintMoveGhost(m) {
  const { w, d: depth } = moveSize(m);
  const pose = movePose(m);
  dropMarker.visible = true;
  dropMarker.material.color.set(mover.ok ? GHOST_OK : GHOST_NO);
  dropMarker.material.depthTest = true;
  dropMarker.material.opacity = GHOST_ALPHA;
  dropMarker.renderOrder = 0;
  dropMarker.position.set(pose.x, 0.006, pose.z);
  dropMarker.quaternion.setFromAxisAngle(UP, pose.yaw).multiply(FLAT_Q);
  dropMarker.scale.set(w * 1.06, depth * 1.06, 1);
}

export function proposeMove(m, x, z, yaw) {
  const pose = constrainPose(m, x, z, yaw);
  moveApply(m, pose.x, pose.z, pose.yaw);
  mover.ok = canPlaceAt(m, pose);
  refreshAll();
  paintMoveGhost(m);
  touchView();
  return mover.ok;
}

function remaskMoved(d) {
  remaskDisplay(d);
  for (const o of displays) if (o.solid === false && o !== d) remaskDisplay(o);
}

function remaskDisplay(d) {
  const probe = { x: d.x, z: d.z, yaw: d.yaw, cols: d.g.cols, rows: d.g.rows, tilt: d.tilt ?? 0 };
  const others = roomObstacles(displays.filter((o) => o !== d));
  remask(d.g, (s, c, r) => cellIsClear(probe, c, r, others));
  clearGroup(d.group);
  d.lines = []; d.panels = [];
  buildFurniture(d);
  touchView();
}

// ponytail: no re-separation, so customers following one shelf can overlap until the next round relaxes them.
function followDisplay(d) {
  for (const npc of shop.world?.npcs ?? []) {
    if (npc.atDisplay !== d.id) continue;
    npc.facing = Math.atan2(d.x - d.standAt.x, d.z - d.standAt.z);
    npc.x = d.standAt.x;
    npc.z = d.standAt.z;
  }
}

function followSeat(s) {
  for (const rec of cast) {
    if (rec.npc.seat !== s.id) continue;
    rec.npc.x = s.x; rec.npc.z = s.z; rec.npc.facing = s.facing;
    if (rec.moveT < 1) continue;
    rec.fromX = rec.built.root.position.x = s.x;
    rec.fromZ = rec.built.root.position.z = s.z;
    rec.built.root.rotation.y = s.facing;
  }
}

function freeAt(event) {
  setRayFromEvent(event);
  const hit = raycaster.intersectObjects([...chairGroup.children, ...propGroup.children], true)[0];
  for (let n = hit?.object; n; n = n.parent) {
    const found = n.userData.seat ?? n.userData.prop;
    if (found) return found;
  }
  return null;
}

export function grabMovable(event) {
  if (mover.m) dropMovable();
  const p = floorPoint(event);
  const under = hoverTarget(event)?.disp;
  const m = p ? (freeAt(event) ?? (under?.solid === false ? null : under)) : null;
  if (!m) { clearSelection(); return false; }
  mover.m = m;
  mover.from = movePose(m);
  mover.ox = m.x - p.x;
  mover.oz = m.z - p.z;
  if (!isFree(m)) { aim.active = aim.hovered = m.id; touchView(); }
  const pose = movePose(m);
  proposeMove(m, pose.x, pose.z, pose.yaw);
  return true;
}

export function dropMovable() {
  const { m } = mover;
  mover.m = null;
  if (!m) return;
  if (!mover.ok) {
    moveApply(m, mover.from.x, mover.from.z, mover.from.yaw);
    mover.ok = canPlaceAt(m, mover.from);
  } else if (isFree(m)) {
    if (isSeat(m)) followSeat(m);
    for (const d of displays) remaskDisplay(d);
  } else {
    remaskMoved(m);
    followDisplay(m);
  }
  mover.sel = m;
  paintMoveGhost(m);
  refreshAll();
  touchHud();
  touchView();
}

export function cancelMove() {
  if (!mover.m) return;
  mover.ok = false;
  dropMovable();
}

export function clearSelection() {
  cancelMove();
  mover.sel = null;
  dropMarker.visible = false;
  touchView();
}

export function rotateMovable(step) {
  const m = mover.m ?? mover.sel ?? activeDisplay();
  if (!m) return;
  const from = movePose(m);
  if (mover.m) {
    proposeMove(m, from.x, from.z, from.yaw + step);
    return;
  }
  if (proposeMove(m, from.x, from.z, from.yaw + step)) {
    if (isFree(m)) for (const d of displays) remaskDisplay(d);
    else remaskMoved(m);
  } else {
    moveApply(m, from.x, from.z, from.yaw);
    mover.ok = canPlaceAt(m, from);
  }
  mover.sel = m;
  refreshAll();
  paintMoveGhost(m);
}

const turnBtns = /** @type {HTMLButtonElement[]} */
  ([...document.querySelectorAll('#furnBtns .turn')]);

export function syncFurnitureButtons() {
  const selected = S.moveMode ? (mover.m ?? mover.sel) : null;
  for (const b of turnBtns) {
    b.hidden = !S.moveMode;
    b.disabled = !selected;
  }
}

export function installMove() {
  for (const b of turnBtns) {
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      rotateMovable(Number(b.dataset.step) * YAW_STEP);
    });
  }
}
