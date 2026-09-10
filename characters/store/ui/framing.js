// Fitting the camera to the room.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import * as THREE from 'three';
import { CELL } from '../core/config.js';
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
 */
const TARGET_SLOT_PX = 56;   // on-screen size of one slot; a diorama angle foreshortens it to ~34

export function frameRoom() {
  const center = new THREE.Vector3(0, 0, 0);
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
