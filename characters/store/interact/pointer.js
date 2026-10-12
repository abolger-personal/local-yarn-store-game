import { fullyExposed } from '../../visit.js';
import { anySlot } from '../../../inventory/grid.js';
import { makePicker } from '../../../inventory/pick-place.js';
import { BOX_H, S, layerY } from '../core/config.js';
import { camera } from '../scene/stage.js';
import { byId, levelFrame } from '../scene/displays.js';
import { aim, displays, items } from '../core/state.js';

export const activeDisplay = () => byId(aim.active) ?? displays[0];

export const picker = makePicker({
  camera,
  displays: () => displays,
  items: () => items,
  levelFrame,
  itemHeight: (_disp, item) => layerY(item.layer) + BOX_H * (item.layers ?? 1),
  itemTall: (_disp, item) => BOX_H * (item.layers ?? 1),
  exposed: (disp, all, index) => fullyExposed(disp, all, index),
  grabRadius: () => S.grabRadius,
  snapCells: () => S.snapCells,
});

export const { pickCandidate, seenAt, hoverTarget, snapTo, raycaster, setRay: setRayFromEvent } = picker;

export const displayPoint = (disp, event) => picker.displayPoint(disp, disp.plane, event);

export const castAt = (disp, height) => picker.castLocal(disp, disp.plane, height);

export const firstFreeSlot = (disp, item) => anySlot(disp.g, item);

