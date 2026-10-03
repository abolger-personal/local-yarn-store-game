// The pointer, and which subsystem gets it.
//
// This sits ABOVE pick.js and move.js and is the only place that knows about both. Putting the
// handlers inside pick.js meant pick had to import move (to hand the gesture over) while move
// imported pick (for the ray and the ghost) — a mutual import, and the reason this layer was
// circular. One finger, two possible owners, one module that decides.

import { EMPTY } from '../../../inventory/grid.js';
import { S } from '../core/config.js';
import { renderer } from '../scene/stage.js';
import { mover, drag, shop, touchHud, touchView } from '../core/state.js';
import { pickCandidate, raycaster, setRayFromEvent } from './pointer.js';
import { boardFace, bulletin, guestbook } from '../scene/room.js';
import { abortDrag, carryItem, pickUp, putDown, trackHover } from './pick.js';
import { clearSelection, dropMovable, floorPoint, grabMovable, movePose, proposeMove } from './move.js';

const TAP_SLOP = 8;   // px of finger jitter still counted as a tap rather than a drag

const livePointers = new Set();

let gestureOwner = null;             // 'player' | 'camera' | null

function endPointer(event) {
  livePointers.delete(event.pointerId);
  if (livePointers.size === 0) gestureOwner = null;
}

/**
 * One finger, two jobs.
 *
 * It belongs to the player's verb when there is something under it (or something already in
 * hand), and to the CAMERA otherwise — so dragging bare floor orbits, which is what a touch user
 * expects and what `TWO: DOLLY_ROTATE` alone does not deliver: two-finger rotation tracks the
 * midpoint while dolly tracks the finger SEPARATION, and separation is so much the more sensitive
 * of the two that any two-finger drag reads as pure zoom.
 *
 * Only meaningful on touch; the mouse takes its orbit from `controls.mouseButtons` (right-drag).
 */
function stockPress(event) {
  drag.pickedThisPress = drag.index === EMPTY;
  const found = drag.pickedThisPress ? pickCandidate(event) : null;
  return { found, mine: Boolean(found) || !drag.pickedThisPress };
}

/**
 * A press on the Guestbook on the counter opens the book; on the bulletin board, the photo pressed. Only asked of a press nothing else claimed:
 * empty-handed, with no stock under it.
 */
function pressesBook(event) {
  setRayFromEvent(event);
  // the bulletin board hangs on a wall that is hidden when the camera is outside it
  const hit = raycaster.intersectObjects([guestbook, bulletin], true).find((h) => h.object.visible && h.object.parent.visible);
  if (!hit) return false;
  shop.press = hit.object === boardFace ? { on: 'board', uv: hit.uv } : { on: 'book' };
  touchHud();
  return true;
}

/** After the claim: an aiming press refreshes the ghost, a press on stock picks it up. */
function beginStockGesture(event, found) {
  if (!drag.pickedThisPress) onPointerMove(event);   // aiming press: refresh the ghost NOW
  else if (found) pickUp(event, found);
}

/**
 * Claim this gesture for the player: stop it reaching OrbitControls, which has not seen it yet
 * because this listener captures at the window. In the handler itself, never deferred.
 */
function claimGesture(event) {
  gestureOwner = 'player';
  event.stopPropagation();
}

export function onPointerDown(event) {
  if (event.target !== renderer.domElement) return;   // a press on the HUD or GUI is not a shop press
  if (event.button !== 0) return;                     // right/middle belong to the camera
  livePointers.add(event.pointerId);

  // An extra finger joining a gesture the player owns is withheld too, so OrbitControls cannot
  // start half a rotation underneath a drag.
  if (livePointers.size > 1) {
    if (gestureOwner === 'player') event.stopPropagation();
    return;
  }

  drag.downX = event.clientX;
  drag.downY = event.clientY;
  drag.moved = false;

  gestureOwner = 'camera';

  // Move mode takes the whole gesture: one finger moves a display if there is one under it, and
  // orbits the camera if there is not — the same "verb or camera" split the stock drag uses.
  if (S.moveMode) {
    if (grabMovable(event)) claimGesture(event);
    return;
  }
  const { found, mine } = stockPress(event);
  if (mine || pressesBook(event)) claimGesture(event);   // not mine: empty-handed, no stock under it
  beginStockGesture(event, found);
}

export function onPointerUp(event) {
  const wasFirst = livePointers.size === 1 && livePointers.has(event.pointerId);
  endPointer(event);
  if (event.button !== 0 || !wasFirst) return;   // only the finger that started the verb commits it
  if (mover.m) { dropMovable(); return; }
  if (drag.index === EMPTY) return;
  // A press that went somewhere is a completed drag; a press that stayed put while already
  // carrying is a tap on the target. Either way the release is the commit. Only a stationary
  // release on the pickup itself keeps the item in hand.
  if (drag.moved || !drag.pickedThisPress) putDown();
}

/**
 * The pointer chooses BOTH the display and the shelf level, whether or not something is being
 * carried. Previously the level could only be changed from the GUI slider, which meant a
 * multi-level shelf could not really be arranged with the mouse at all.
 *
 * "Nearest in-bounds" is what makes per-level pointing work: looking down, an upper shelf's plane
 * is always hit closer to the camera, but only where it is actually over the lattice — so pointing
 * at the exposed front strip of a lower shelf misses the upper plane and correctly selects the
 * lower one.
 */
export function onPointerMove(event) {
  if (mover.m) {
    dragDisplay(event);
    return;
  }
  if (pastSlop(event)) drag.moved = true;
  if (trackHover(event)) touchView();
  if (drag.index !== EMPTY) carryItem(event);
}

/** In move mode the pointer drags the FURNITURE, and nothing else happens. */
function dragDisplay(event) {
  const p = floorPoint(event);
  if (p) proposeMove(mover.m, p.x + mover.ox, p.z + mover.oz, movePose(mover.m).yaw);
}

/** Has this press travelled far enough to be a drag rather than a tap? */
function pastSlop(event) {
  return drag.index !== EMPTY && !drag.moved
    && Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) > TAP_SLOP;
}

/**
 * Follow the pointer onto whichever display and level it is over. Returns whether anything the
 * grid paint depends on actually changed, so a still pointer repaints nothing.
 *
 * No camera jump on a switch: yanking the view while carrying something is disorienting. And
 * `aim.active` is deliberately NOT cleared when hover is null — see its declaration.
 */

const moveBtn = document.getElementById('moveBtn');

export function setMoveMode(on) {
  S.moveMode = on;
  // Latched, like the camera lock: furniture mode is a MODE, and a button that only changes what
  // it does without changing how it looks is how you end up dragging a shelf by accident.
  moveBtn.setAttribute('aria-pressed', String(on));
  if (mover.m) dropMovable();
  if (on) abortDrag();          // you cannot carry a notion and the shelf it came off at once
  clearSelection();
  touchView();
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installInput() {
  moveBtn.addEventListener('click', () => setMoveMode(!S.moveMode));
  addEventListener('pointerdown', onPointerDown, true);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);   // touch interrupted (call, gesture steal)
  addEventListener('pointermove', onPointerMove);
}
