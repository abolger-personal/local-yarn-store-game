// What is under the pointer: the ray, the display it lands on, and the slot it would drop into.
//
// This sits BELOW both pick.js and move.js because both need it, and having each own half of it
// is what made them import each other. Nothing here mutates the shop — it only answers questions.

import { fullyExposed } from '../../visit.js';
import { anySlot } from '../../../inventory/grid.js';
import { makePicker } from '../../../inventory/pick-place.js';
import { BOX_H, S, layerY } from '../core/config.js';
import { camera } from '../scene/stage.js';
import { byId, levelFrame } from '../scene/displays.js';
import { aim, displays, items } from '../core/state.js';

export const activeDisplay = () => byId(aim.active) ?? displays[0];

// The pick/place geometry now lives in ../inventory/pick-place.js, shared with the yarn demo.
// It was extracted FROM here — this file had grown the good version (forgiving screen-space pick,
// fits-aware snap, multi-layer) while the demo still ran the one-layer original, and the two had
// silently diverged on what a click means. The adapter below is the whole difference between the
// two scenes: how a level is placed, and how tall an item is.
export const picker = makePicker({
  camera,
  displays: () => displays,
  items: () => items,
  levelFrame,
  // A level's frame already carries its height AND its tilt, so an item's height is purely its
  // own stack position — which is why layerY needs no shelf index.
  itemHeight: (_disp, item) => layerY(item.layer) + BOX_H * (item.layers ?? 1),
  itemTall: (_disp, item) => BOX_H * (item.layers ?? 1),
  exposed: (disp, all, index) => fullyExposed(disp, all, index),
  grabRadius: () => S.grabRadius,
  snapCells: () => S.snapCells,
});

// setRayFromEvent and the raycaster are taken from the picker so the whole file aims ONE ray:
// floorPoint() and the chair pick below reuse it after the picker has set it from the event.
export const { pickCandidate, seenAt, hoverTarget, snapTo, raycaster, setRay: setRayFromEvent } = picker;

/** Where on a display's ACTIVE plane the pointer is — used to float a carried item, not to pick. */
export const displayPoint = (disp, event) => picker.displayPoint(disp, disp.plane, event);

/** Where the ray last aimed meets a height on the active level, in level-local x, z — or null. */
export const castAt = (disp, height) => picker.castLocal(disp, disp.plane, height);

/** Anywhere on this display at all, or null — the last resort when an item's own slot filled up. */
export const firstFreeSlot = (disp, item) => anySlot(disp.g, item);

