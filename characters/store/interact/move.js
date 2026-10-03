// Move mode: dragging the SHOP around rather than the stock.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

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
import { WALL_INSET, applyTransform, boxIsClear, buildFurniture, cellIsClear, roomObstacles } from '../scene/displays.js';
import { refreshAll } from '../goods/paint.js';

// ---------------------------------------------------------------- moving the shop
//
// DISPLAYS.md rule 10: the player may pick up a whole display and put it somewhere else. Chairs
// move by the same verb — they are shop furniture the player arranges, and having one of the two
// things on the floor be immovable reads as a bug rather than a rule.
//
// This is the SHOP-LAYOUT verb, as opposed to the stock-arranging verb above, and the two share a
// pointer, so they are separated by a mode (M) rather than by a modifier key — holding a chord down
// while dragging furniture around is exactly the hand strain DESIGN-DECISIONS.md §7 already
// rejected.
//
// Inventory needs no special handling at all: see applyTransform.
export const YAW_STEP = Math.PI / 4;   // MVP detent, per rule 10

// At least WALL_INSET, or a shelf snaps flush to a wall and is then refused for being too close to
// it — which leaves the display red everywhere and undroppable. Derived, never a loose number.
const WALL_GAP = WALL_INSET + 0.02;

// The four walls as lines, each with the yaw that turns a display's front (local +Z) into the room.
const WALL_LINES = [
  { yaw: 0,            axis: 'z', at: -HALF_D },
  { yaw: Math.PI,      axis: 'z', at:  HALF_D },
  { yaw: Math.PI / 2,  axis: 'x', at: -HALF_W },
  { yaw: -Math.PI / 2, axis: 'x', at:  HALF_W },
];

// A movable is a display, a chair, or a prop (a pot, side table or lamp). A display owns a slot grid
// and the other two do not, so `!m.g` is the "small free-standing thing" test; a prop says so.
const isFree = (m) => !m.g;
const isProp = (m) => m.prop === true;
const isSeat = (m) => isFree(m) && !isProp(m);

const moveSize = (m) => {
  if (isProp(m)) return { w: m.w, d: m.d };
  return isSeat(m) ? { w: CHAIR_W, d: CHAIR_W } : gridSize(m.g);
};

export const movePose = (m) => ({ x: m.x, z: m.z, yaw: isSeat(m) ? m.facing : m.yaw });

// `m` is what is being dragged RIGHT NOW; `sel` is what stays chosen after the release. Same shape
// as picking up a box — the press previews and the release commits — except that furniture set down
// stays selected, which is what gives the on-screen rotate handles something to point at.
export 
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const _floorHit = new THREE.Vector3();

/** Where on the shop floor the pointer is. Moving furniture is a plan-view act, so this is the one
 *  cast that does not care which display or shelf level is under the cursor. */
export function floorPoint(event) {
  setRayFromEvent(event);
  if (!raycaster.ray.intersectPlane(_floorPlane, _floorHit)) return null;
  return { x: _floorHit.x, z: _floorHit.z };
}

/** Put a chair somewhere. The sim keeps its OWN copy of the seat list (makeWorld clones it, so that
 *  occupancy lives in the sim and not in the scene), so both have to be told. */
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

/**
 * Rule 10's per-type restrictions, as a pose filter:
 *   - a WALL SHELF stays against a wall. It snaps to the nearest one and takes that wall's facing,
 *     so the only freedom it has is sliding along — which is what "stays against the wall" means.
 *   - a FLOOR PILE stays on the floor, which it does by construction: its plinth height is 0 and
 *     nothing in the move path touches Y at all.
 *   - everything else is free in XZ, with yaw on 45° detents.
 * A peg board would clamp to a wall the same way a shelf does, at wall height. Deferred with the
 * rest of DISPLAYS.md type C.
 *
 * One rule for every movable: whatever the player has turned sits on a detent. A chair therefore
 * snaps out of its authored decorative angle the first time it is touched, which is the honest
 * trade for not having two different rotation rules in the same gesture.
 */
export function constrainPose(m, x, z, yaw) {
  yaw = Math.round(yaw / YAW_STEP) * YAW_STEP;
  const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));

  if (isFree(m)) {
    const edge = moveSize(m).w * Math.SQRT1_2 + WALL_INSET;   // a turned one needs its diagonal
    return { x: clamp(x, HALF_W - edge), z: clamp(z, HALF_D - edge), yaw };
  }
  if (m.form !== 'wall-shelf') return { x, z, yaw };

  const gap = (w) => Math.abs((w.axis === 'x' ? x : z) - w.at);
  const wall = WALL_LINES.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  const back = (m.g.rows * CELL) / 2 + WALL_GAP;       // centre stands off by half its own depth
  const inward = wall.at < 0 ? 1 : -1;
  // Slide freely, but not so far that an end pokes through the wall it is running along.
  const halfRun = (m.g.cols * CELL) / 2 + WALL_INSET;
  return wall.axis === 'x'
    ? { x: wall.at + inward * back, z: clamp(z, HALF_D - halfRun), yaw: wall.yaw }
    : { x: clamp(x, HALF_W - halfRun), z: wall.at + inward * back, yaw: wall.yaw };
}

/**
 * May this stand here? For a display, every slot it still HAS must be clear of the walls, the
 * counter, the chairs, the doorway and every other display. Testing the slots rather than a
 * bounding box is what lets an L-shaped display (one already carved by the counter) tuck into a
 * spot its full rectangle would never fit — and it reuses the exact predicate the masking uses, so
 * the two cannot disagree. A chair is just its own box.
 *
 * Level 0 only: the mask ignores the shelf index by construction, so every level has the same holes.
 *
 * ponytail: a chair is tested against a display's full RECTANGLE, not its usable slots, so a chair
 * cannot tuck into the notch a display had carved out of it. Displays get the finer test because
 * they are the ones that come out funny shapes.
 */
export function canPlaceAt(m, pose) {
  if (isFree(m)) {
    return boxIsClear(pose.x, pose.z, moveSize(m).w * Math.SQRT1_2,
      roomObstacles(displays, seats.filter((s) => s !== m), props.filter((p) => p !== m)));
  }
  const probe = { ...pose, cols: m.g.cols, rows: m.g.rows, tilt: m.tilt ?? 0 };
  const others = roomObstacles(displays.filter((o) => o !== m));
  for (let r = 0; r < m.g.rows; r++)
    for (let c = 0; c < m.g.cols; c++)
      if (usableAt(m.g, 0, c, r) && !cellIsClear(probe, c, r, others)) return false;
  return true;
}

/** The footprint preview: green where it may land, red where it may not. */
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

/**
 * Move it there and say whether that was legal. It goes to the pose either way, so a blocked spot
 * is something the player can SEE their shelf sitting in rather than an invisible wall that stops
 * the drag dead; dropMovable() is what refuses it.
 */
export function proposeMove(m, x, z, yaw) {
  const pose = constrainPose(m, x, z, yaw);
  moveApply(m, pose.x, pose.z, pose.yaw);
  mover.ok = canPlaceAt(m, pose);
  refreshAll();
  paintMoveGhost(m);
  touchView();
  return mover.ok;
}

/**
 * Re-cut the holes for a display that has landed somewhere new — otherwise a shelf carved to fit
 * beside the counter keeps that bite out of it for the rest of the game. Safe by the order it runs
 * in: canPlaceAt has already proved every slot the display currently has is clear here, so this can
 * only ever open holes back up, and remask() refuses to revoke an occupied slot regardless.
 */
/**
 * Remask a display that has moved, AND the floor underneath it.
 *
 * The floor is masked against every other display, so anything that moves opens a hole where it
 * has gone and fills the one where it was. Forgetting the second half leaves a display's ghost
 * punched through the floor grid for the rest of the session.
 *
 * Every floor tile, not "the floor": a shelf dragged across the room lands on one tile and leaves
 * another, and remasking only one of them is the ghost this exists to prevent.
 */
function remaskMoved(d) {
  remaskDisplay(d);
  for (const o of displays) if (o.solid === false && o !== d) remaskDisplay(o);
}

function remaskDisplay(d) {
  const probe = { x: d.x, z: d.z, yaw: d.yaw, cols: d.g.cols, rows: d.g.rows, tilt: d.tilt ?? 0 };
  const others = roomObstacles(displays.filter((o) => o !== d));
  remask(d.g, (s, c, r) => cellIsClear(probe, c, r, others));
  // makeGridLines draws only the usable cells, so the lattice has to be rebuilt to match.
  clearGroup(d.group);
  d.lines = []; d.panels = [];
  buildFurniture(d);
  touchView();
}

/**
 * Anyone stood at — or already walking to — a display that just moved goes with it. The cast tween
 * reads the sim position live on every frame, so retargeting here makes them turn and walk after
 * their shelf instead of miming at the empty floor it used to be on.
 *
 * ponytail: no re-separation, so two customers followed to the same shelf can briefly overlap.
 * advanceRound() relaxes them apart on the next round, which is soon enough for furniture the
 * player only moves between rounds anyway.
 */
function followDisplay(d) {
  for (const npc of shop.world?.npcs ?? []) {
    if (npc.atDisplay !== d.id) continue;
    npc.facing = Math.atan2(d.x - d.standAt.x, d.z - d.standAt.z);
    npc.x = d.standAt.x;
    npc.z = d.standAt.z;
  }
}

/** Whoever is IN a moved chair rides it. Somebody still walking to it is left to walk — the tween
 *  reads the sim position live, so they simply re-aim at wherever the chair ended up. */
function followSeat(s) {
  for (const rec of cast) {
    if (rec.npc.seat !== s.id) continue;
    rec.npc.x = s.x; rec.npc.z = s.z; rec.npc.facing = s.facing;
    if (rec.moveT < 1) continue;
    // Seated, so they move WITH the chair rather than walking to it. fromX/fromZ too, or the
    // in-flight tween drags them straight back to where the chair used to be.
    rec.fromX = rec.built.root.position.x = s.x;
    rec.fromZ = rec.built.root.position.z = s.z;
    rec.built.root.rotation.y = s.facing;
  }
}

/** The chair or prop under the pointer, if any. Tried before displays: they are small, exact to
 *  raycast, and usually standing on top of some display's slot plane (the floor's). */
function freeAt(event) {
  setRayFromEvent(event);
  // Recursive: each is a group of parts, and the record is on the group.
  const hit = raycaster.intersectObjects([...chairGroup.children, ...propGroup.children], true)[0];
  for (let n = hit?.object; n; n = n.parent) {
    const found = n.userData.seat ?? n.userData.prop;
    if (found) return found;
  }
  return null;
}

export function grabMovable(event) {
  const p = floorPoint(event);
  // You cannot pick up the floor. Everything else in the room is fair game (DISPLAYS.md rule 10).
  const under = hoverTarget(event)?.disp;
  const m = p ? (freeAt(event) ?? (under?.solid === false ? null : under)) : null;
  if (!m) { clearSelection(); return false; }   // a press on bare floor deselects and orbits
  mover.m = m;
  mover.from = movePose(m);
  mover.ox = m.x - p.x;   // grab offset, so the thing does not snap its centre to the cursor
  mover.oz = m.z - p.z;
  if (!isFree(m)) { aim.active = aim.hovered = m.id; touchView(); }
  const pose = movePose(m);
  proposeMove(m, pose.x, pose.z, pose.yaw);
  return true;
}

/** Release: a legal pose sticks, an illegal one goes back where it came from. Either way the piece
 *  stays selected, so the rotate handles are still on it. */
export function dropMovable() {
  const { m } = mover;
  mover.m = null;
  if (!m) return;
  if (!mover.ok) {
    moveApply(m, mover.from.x, mover.from.z, mover.from.yaw);
    mover.ok = canPlaceAt(m, mover.from);
  } else if (isFree(m)) {
    if (isSeat(m)) followSeat(m);
    // A chair or prop that has moved away frees the slots it was masking out of every display near
    // it. Safe in this direction only: canPlaceAt refused to let it land on a display at all, so
    // this can add slots back but never revoke one.
    for (const d of displays) remaskDisplay(d);
  } else {
    remaskMoved(m);
    followDisplay(m);
  }
  mover.sel = m;
  paintMoveGhost(m);            // the footprint stays under the selection rather than blinking out
  refreshAll();
  touchHud();
  touchView();
}

export function clearSelection() {
  mover.sel = null;
  dropMarker.visible = false;
  touchView();
}

/**
 * Turn by one detent. Mid-drag it just turns the thing in hand; otherwise it is its own little
 * move, committed or reverted on the spot. Driven by Q/E and by the on-screen handles, which are
 * the same call — so the touch path cannot drift from the keyboard one.
 *
 * A wall shelf will not budge: its yaw belongs to the wall it is on, which is rule 10 working
 * rather than the button failing.
 */
export function rotateMovable(step) {
  const m = mover.m ?? mover.sel ?? activeDisplay();
  if (!m) return;
  const from = movePose(m);
  // Proposed before the early exit on purpose: a drag in progress still turns, it just is not
  // settled here.
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

// ---- the on-screen rotate handles
const turnBtns = /** @type {HTMLButtonElement[]} */
  ([...document.querySelectorAll('#furnBtns .turn')]);

/** Park the handles over the selection. Projected every frame because the camera orbits freely and
 *  a handle left behind on screen points at the wrong thing. */
/**
 * Enable the turn handles only when there is something to turn.
 *
 * They used to float above the selected piece, projected from world space every frame. Two
 * problems with that: they sat under the finger doing the dragging, and a selection behind the
 * camera projects to a mirrored on-screen point, so they had to be hidden exactly when you most
 * wanted them. A fixed cluster is always in the same place and always reachable.
 *
 * Hidden OUT of furniture mode (they mean nothing there) but merely dimmed inside it with nothing
 * selected — so the cluster does not change width as you select and deselect, which would move
 * the buttons out from under the finger reaching for them.
 */
export function syncFurnitureButtons() {
  const selected = S.moveMode ? (mover.m ?? mover.sel) : null;
  for (const b of turnBtns) {
    b.hidden = !S.moveMode;
    b.disabled = !selected;
  }
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installMove() {
  for (const b of turnBtns) {
    // pointerdown, not click: onPointerDown is a window CAPTURE listener, so a click here would
    // otherwise be preceded by the canvas handler clearing the very selection being rotated. It
    // bails on `event.target !== renderer.domElement`, but stopping here is what makes that certain.
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      rotateMovable(Number(b.dataset.step) * YAW_STEP);
    });
  }
}
