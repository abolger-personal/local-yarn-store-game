// Pick and place — the player’s only verb.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { ghost, dropMarker } from './glow.js';
import { pickCandidate, displayPoint, activeDisplay, hoverTarget, snapTo, castAt } from './pointer.js';
import { layerY } from '../core/config.js';
import { items, touchView, aim, drag } from '../core/state.js';
import { EMPTY, anySlot, lift } from '../../../inventory/grid.js';
import { placeItem, settleYaw } from '../../../inventory/pick-place.js';


import { byId } from '../scene/displays.js';
import { refresh, refreshFloating } from '../goods/paint.js';

// ---------------------------------------------------------------- pick and place
//
// The player's ONLY verb (LYS.md): rearranging stock into formations. Ported from
// inventory/stash-and-stuff.html, keeping the decisions recorded in inventory/DESIGN-DECISIONS.md
// §7 rather than re-litigating them:
//
//   - NEVER raycast items. Cast the display's own slot plane, convert the hit to a column in O(1).
//     Items are instanced and are not scene objects, so they are not raycastable in the first place.
//   - Click to pick up, click again to put down. Not press-and-hold, which was hard on the hands
//     for the core moment-to-moment mechanic.
//   - Pick against a plane at the CARD's height, not the floor: an upright card is drawn well above
//     its own footprint, so a floor test asks the player to click empty grid below what they see.
//
// What is new here, and is the reason this needed porting rather than copying: there are now up to
// six displays at arbitrary yaw, and NPCs are mutating the same grids between rounds.

// Distinct from aim.active on purpose: aim.active must PERSIST when the pointer wanders off a display,
// so a carried item keeps its drop target. aim.hovered goes null the moment the pointer leaves, which
// is what lets a floor grid hide again.

export function pickUp(event, found = pickCandidate(event)) {
  if (!found) return;
  const { disp, index } = found;

  aim.active = disp.id;
  disp.plane = found.shelf;      // arranging follows what you just grabbed, so it drops back easily
  touchView();
  drag.index = index;
  drag.displayId = disp.id;
  // Out of the grid AND out of the simulation: see `available()` in visit.js. An NPC must not tidy
  // around it, stack onto its column, or buy it out of the player's hand.
  lift(disp.g, items[index].keys);
  items[index].held = true;
  carryItem(event);   // after the lift, so the aim no longer meets the item's own column
  touchView();
}

export function putDown() {
  const item = items[drag.index];
  const t = drag.target;
  if (t) {
    item.display = aim.active;
    item.shelf = activeDisplay().plane;
  }
  // No valid target under the pointer: it goes back where it actually still belongs — placeItem
  // reads that off the item, whose display/shelf/c/r were never touched if the branch above did
  // not run. It also carries the layer count and applies a turned drop, both of which this
  // function used to do by hand and one of which it would now be silently dropping.
  const home = byId(item.display);
  placeItem(item, drag.index, t, { home, homeShelf: item.shelf, layers: (i) => i.layers ?? 1, anySlot });
  item.held = false;
  settleYaw(item);

  refresh(drag.index);
  dropMarker.visible = false;
  drag.index = EMPTY;
  drag.target = null;
  drag.displayId = null;
  // Setting down can end the "carrying" reason a floor grid was revealed, so re-evaluate now
  // rather than leaving it lit until the pointer next moves.
  touchView();
}

/** Put whatever is held back, without asking where the pointer is. Used before any rebuild. */
export function abortDrag() {
  if (drag.index === EMPTY) return;
  drag.target = null;
  putDown();
}

/**
 * ONE gesture rule for mouse and touch: **the press previews, the release commits.**
 *
 * Touch has no hover, so the preview cannot live between gestures — it has to live *inside* one.
 * Pressing aims (ghost appears, slide to adjust), lifting places. That is the same motion a mouse
 * click already makes, so nothing changes for mouse; and because pointermove fires throughout a
 * touch-drag, a finger gets exactly the continuous preview a cursor gets from hovering.
 *
 * Deliberately NOT a long-press timer: a hold-to-commit delay is invisible, unlearnable, fights the
 * browser's own long-press menu, and punishes the player for being careful — the opposite of what a
 * preview is for.
 *
 * Releasing without moving keeps the item held, which preserves click-to-pick / click-to-place for
 * mouse (rejected press-and-hold as hard on the hands, per inventory/DESIGN-DECISIONS.md §7) and
 * gives touch a tap-tap fallback. So all three gestures work off the same two lines:
 *   press item, drag, lift          -> drag and drop        (natural on touch)
 *   click item, move, click target  -> click-click          (natural on mouse)
 *   tap item, press target, adjust, lift -> aim then commit (touch without a hover)
 */
// Which fingers are currently down on the canvas, and who this GESTURE belongs to.
//
// Ownership is per-gesture, not per-pointer, and that distinction is the whole bug. OrbitControls
// keeps its own `pointers` array, built from the pointerdown events it receives. Withholding only
// the FIRST finger left the second one getting through: OrbitControls then saw that second finger
// as its first pointer, started a rotation from it, and its bookkeeping no longer matched what the
// hand was doing. Every subsequent move measured against a start point for a finger that had
// already lifted — and a stale delta at damping speed is the camera spinning on its own.
//
// So: the first finger down decides who owns the gesture, and while it is the player's, EVERY
// pointerdown is withheld until the last finger lifts. OrbitControls either sees a whole gesture
// or none of it, never half.
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

/** How far over its drop a mouse-held item hovers: clear of the ghost, not so far it detaches. */
const MOUSE_HOVER = 0.03;

/** Float the held item under the pointer and preview where it would land. */
export function carryItem(event) {
  const disp = activeDisplay();
  const point = displayPoint(disp, event);
  if (!point) return;
  const item = items[drag.index];
  drag.target = snapTo(disp, disp.plane, item, point.x, point.z);
  ghost(item);
  // A mouse is precise and hides nothing, so the held item hovers just over its drop with its
  // bottom under the pointer — cast at that height, so it does not slide off the pointer as the
  // stack under it grows. A finger hides what it is on: touch and pen keep the S.liftHeight lift
  // (refreshFloating), which exists for exactly that and is not wanted on a laptop.
  if (event.pointerType === 'mouse') {
    const base = (drag.target ? layerY(drag.target.layer) : 0) + MOUSE_HOVER;
    const at = castAt(disp, base) ?? point;
    refreshFloating(disp, drag.index, at.x, at.z, base);
  } else refreshFloating(disp, drag.index, point.x, point.z);
  touchView();
}

