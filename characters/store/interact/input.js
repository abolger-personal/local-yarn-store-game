import { EMPTY } from '../../../inventory/grid.js';
import { S } from '../core/config.js';
import { renderer } from '../scene/stage.js';
import { mover, drag, shop, touchHud, touchView } from '../core/state.js';
import { pickCandidate, raycaster, setRayFromEvent } from './pointer.js';
import { boardFace, bulletin, guestbook } from '../scene/room.js';
import { abortDrag, carryItem, pickUp, putDown, trackHover } from './pick.js';
import { clearSelection, dropMovable, floorPoint, grabMovable, movePose, proposeMove } from './move.js';

const TAP_SLOP = 8;   // px; STORE-SCENE.md §Input

const livePointers = new Set();

let gestureOwner = null;

function endPointer(event) {
  livePointers.delete(event.pointerId);
  if (livePointers.size === 0) gestureOwner = null;
}

function stockPress(event) {
  drag.pickedThisPress = drag.index === EMPTY;
  const found = drag.pickedThisPress ? pickCandidate(event) : null;
  return { found, mine: Boolean(found) || !drag.pickedThisPress };
}

function pressesBook(event) {
  setRayFromEvent(event);
  const hit = raycaster.intersectObjects([guestbook, bulletin], true).find((h) => h.object.visible && h.object.parent.visible);
  if (!hit) return false;
  shop.press = hit.object === boardFace ? { on: 'board', uv: hit.uv } : { on: 'book' };
  touchHud();
  return true;
}

function beginStockGesture(event, found) {
  if (!drag.pickedThisPress) onPointerMove(event);
  else if (found) pickUp(event, found);
}

function claimGesture(event) {
  gestureOwner = 'player';
  event.stopPropagation();
}

function movePress(event) {
  mover.fresh = !mover.m;
  if (mover.m) dragDisplay(event);
  if (mover.m || grabMovable(event)) claimGesture(event);
}

export function onPointerDown(event) {
  if (event.target !== renderer.domElement) return;
  if (event.button !== 0) return;
  livePointers.add(event.pointerId);

  if (livePointers.size > 1) {
    if (gestureOwner === 'player') event.stopPropagation();
    return;
  }

  drag.downX = event.clientX;
  drag.downY = event.clientY;
  drag.moved = false;

  gestureOwner = 'camera';

  if (S.moveMode) {
    movePress(event);
    return;
  }
  const { found, mine } = stockPress(event);
  if (mine || pressesBook(event)) claimGesture(event);
  beginStockGesture(event, found);
}

export function onPointerUp(event) {
  const wasFirst = livePointers.size === 1 && livePointers.has(event.pointerId);
  endPointer(event);
  if (mover.m && wasFirst) {
    const tap = Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) <= TAP_SLOP;
    if (!(mover.fresh && tap && event.type === 'pointerup')) dropMovable();
    return;
  }
  if (event.button !== 0 || !wasFirst) return;
  if (drag.index === EMPTY) return;
  if (drag.moved || !drag.pickedThisPress) putDown();
}

export function onPointerMove(event) {
  if (mover.m) {
    if (event.target === renderer.domElement) dragDisplay(event);
    return;
  }
  if (pastSlop(event)) drag.moved = true;
  if (trackHover(event)) touchView();
  if (drag.index !== EMPTY) carryItem(event);
}

function dragDisplay(event) {
  const p = floorPoint(event);
  if (p) proposeMove(mover.m, p.x + mover.ox, p.z + mover.oz, movePose(mover.m).yaw);
}

function pastSlop(event) {
  return drag.index !== EMPTY && !drag.moved
    && Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) > TAP_SLOP;
}

const moveBtn = document.getElementById('moveBtn');

export function setMoveMode(on) {
  S.moveMode = on;
  moveBtn.setAttribute('aria-pressed', String(on));
  if (on) abortDrag();
  clearSelection();
  touchView();
}

export function installInput() {
  moveBtn.addEventListener('click', () => setMoveMode(!S.moveMode));
  addEventListener('pointerdown', onPointerDown, true);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);
  addEventListener('pointermove', onPointerMove);
}
