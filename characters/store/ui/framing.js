// Fitting the camera to the room.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import * as THREE from 'three';
import { CELL, ROOM } from '../core/config.js';
import { camera, controls } from '../scene/stage.js';
import { FILL } from '../goods/items.js';

export const isUnder = (node, ancestor) => {
  for (let n = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
};

/**
 * Put the camera INSIDE the shop, close enough that a slot is a usable touch target.
 *
 * This used to frame the whole room, and that was the root of the tablet problem: fitting a
 * 6.4-unit room to the screen renders a 0.2-unit slot at 12-20px, well under the 44px minimum
 * touch target, so no amount of grab slack could make a packed shelf comfortable. The distance is
 * now DERIVED from how big a slot should look rather than from how much room should be visible —
 * the shop is a place you stand in, not a diagram you view.
 *
 * Zooming out to see the whole room is still one pinch away; getting back in is this button.
 *
 * `at` is what to stand in front of — anything with an x and a z, so a display can be passed
 * straight in. It defaults to the middle of the shop, which is what the F key and the frame
 * button mean. The bench (characters/puzzle.html) frames the ONE display its customer is
 * shopping, and the shop will want the same call the first time it wants to draw the player's
 * eye to a particular table.
 *
 * @param {{x: number, z: number}} [at]
 */
const TARGET_SLOT_PX = 56;   // on-screen size of one slot; a diorama angle foreshortens it to ~34

export function frameRoom(at = { x: 0, z: 0 }) {
  restoreLimits();
  const center = new THREE.Vector3(at.x, 0, at.z);
  // Solve the perspective projection for distance: a slot of CELL*FILL world units should cover
  // TARGET_SLOT_PX of the viewport's height.
  const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const wanted = (CELL * FILL * innerHeight) / (2 * Math.tan(halfFov) * TARGET_SLOT_PX);
  // Never closer than the controls allow, and never so far that the room is a small object again.
  const dist = THREE.MathUtils.clamp(wanted, controls.minDistance + 0.3, controls.maxDistance);

  controls.target.set(center.x, 0.55, center.z);
  // Shallower than the old framing (0.62 up rather than 0.72): from inside the room a steeper
  // angle looks down at shelf TOPS, and the faces carrying the labels are what needs reading.
  const v = new THREE.Vector3(0.30, 0.62, 0.82).normalize().multiplyScalar(dist);
  camera.position.set(center.x + v.x, v.y, center.z + v.z);
  controls.update();
}

// ---------------------------------------------------------------- plan and elevation views
//
// Two views for arranging, outside the diorama's usual fence: straight DOWN onto the whole room
// (where things are), and level from a SIDE (how high a stack stands, and whether it floats). Both
// step past the controls' limits — the 0.42π polar fence (stage.js) and the 20-unit maxDistance —
// so those are lifted for the view and put back the moment the player orbits again, or reframes.
// The cutaway still works unaided: from outside a wall, cullWalls hides that wall.

const FIT = 1.08;          // margin round the room, so its edges are not flush with the screen
let saved = null;          // the controls' own limits while a view has lifted them
let side = null;           // which side a side view is on, 0-3 round from the door's side (+z)

/** Put the fences back. Called on the next orbit, and by frameRoom. */
export function restoreLimits() {
  if (!saved) return;
  Object.assign(controls, saved);
  saved = null;
  side = null;
}

function liftLimits(maxDistance) {
  if (!saved) {
    saved = { maxPolarAngle: controls.maxPolarAngle, maxDistance: controls.maxDistance };
    controls.addEventListener('start', restoreLimits, { once: true });
  }
  controls.maxPolarAngle = Math.PI / 2;
  controls.maxDistance = Math.max(saved.maxDistance, maxDistance + 1);
}

/** How far back a camera must stand to fit a w x h rectangle, facing it square. */
function fitDistance(w, h) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return Math.max((h / 2) * FIT / t, (w / 2) * FIT / (t * camera.aspect));
}

/**
 * The whole room from straight above, door at the bottom of the screen. Fitted to the TOPS of the
 * walls, which are nearer the camera than the floor and so look bigger.
 */
export function viewTop() {
  const d = fitDistance(ROOM.w, ROOM.d) + ROOM.wallH;
  liftLimits(d);
  side = null;
  controls.target.set(0, 0, 0);
  // Not exactly overhead: looking dead down the up axis leaves lookAt no way to choose which way
  // is up, and the picture spins. A hair toward the door makes the door's side the bottom edge.
  camera.position.set(0, d, 1e-3);
  controls.update();
}

/**
 * The room level from one side, the whole width and the wall height in view. Each call steps a
 * quarter turn round (`step` +1 or -1); the first lands on the side nearest the current view.
 */
export function viewSide(step = 1) {
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  side = side === null ? Math.round(az / (Math.PI / 2)) : side + step;
  const along = side % 2 === 0;                  // looking along z: the room's width faces us
  const d = (along ? ROOM.d : ROOM.w) / 2 + fitDistance(along ? ROOM.w : ROOM.d, ROOM.wallH);
  liftLimits(d);
  const a = side * (Math.PI / 2), y = ROOM.wallH / 2;
  controls.target.set(0, y, 0);
  camera.position.set(Math.sin(a) * d, y, Math.cos(a) * d);
  controls.update();
}

