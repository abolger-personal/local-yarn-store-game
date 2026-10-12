import { ghost, dropMarker } from './glow.js';
import { pickCandidate, displayPoint, activeDisplay, hoverTarget, snapTo, castAt } from './pointer.js';
import { layerY } from '../core/config.js';
import { items, touchView, aim, drag } from '../core/state.js';
import { EMPTY, anySlot, lift } from '../../../inventory/grid.js';
import { placeItem, settleYaw } from '../../../inventory/pick-place.js';

import { byId } from '../scene/displays.js';
import { refresh, refreshFloating } from '../goods/paint.js';

export function pickUp(event, found = pickCandidate(event)) {
  if (!found) return;
  const { disp, index } = found;

  aim.active = disp.id;
  disp.plane = found.shelf;
  touchView();
  drag.index = index;
  drag.displayId = disp.id;
  lift(disp.g, items[index].keys);
  items[index].held = true;
  carryItem(event);
  touchView();
}

export function putDown() {
  const item = items[drag.index];
  const t = drag.target;
  if (t) {
    item.display = aim.active;
    item.shelf = activeDisplay().plane;
  }
  const home = byId(item.display);
  placeItem(item, drag.index, t, { home, homeShelf: item.shelf, layers: (i) => i.layers ?? 1, anySlot });
  item.held = false;
  settleYaw(item);

  refresh(drag.index);
  dropMarker.visible = false;
  drag.index = EMPTY;
  drag.target = null;
  drag.displayId = null;
  touchView();
}

export function abortDrag() {
  if (drag.index === EMPTY) return;
  drag.target = null;
  putDown();
}

export function trackHover(event) {
  const hover = hoverTarget(event);
  const nowHovered = hover ? hover.disp.id : null;
  const changed = nowHovered !== aim.hovered
    || (hover && (hover.disp.id !== aim.active || hover.disp.plane !== hover.shelf));
  aim.hovered = nowHovered;
  if (hover) {
    aim.active = hover.disp.id;
    hover.disp.plane = hover.shelf;
  }
  return changed;
}

// STORE-SCENE.md §Pick and place: mouse hover height
const MOUSE_HOVER = 0.03;

export function carryItem(event) {
  const disp = activeDisplay();
  const point = displayPoint(disp, event);
  if (!point) return;
  const item = items[drag.index];
  drag.target = snapTo(disp, disp.plane, item, point.x, point.z);
  ghost(item);
  if (event.pointerType === 'mouse') {
    const base = (drag.target ? layerY(drag.target.layer) : 0) + MOUSE_HOVER;
    const at = castAt(disp, base) ?? point;
    refreshFloating(disp, drag.index, at.x, at.z, base);
  } else refreshFloating(disp, drag.index, point.x, point.z);
  touchView();
}

