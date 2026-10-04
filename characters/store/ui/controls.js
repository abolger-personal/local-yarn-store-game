// The player's controls: frame and lock the camera, move the furniture, and their keys.
//
// Split out of gui.js so the game page (characters/game.html) has them without lil-gui. The
// playground (store.html) installs these AND its debug keys on top; the game installs only these.

import { setMoveMode } from '../interact/input.js';
import { S } from '../core/config.js';
import { camera, controls, renderer } from '../scene/stage.js';
import { YAW_STEP, cancelMove, rotateMovable } from '../interact/move.js';
import { frameRoom, viewSide, viewTop } from './framing.js';

/**
 * Lock the camera. On a tablet the shop is easy to knock askew while reaching for a box — every
 * stray drag on empty floor is an orbit — and a locked view makes arranging safe. It disables
 * OrbitControls outright rather than only rotation, because a pinch that dollies the view mid-drag
 * is the same problem in a different axis.
 *
 * The player's verb is untouched: picking up and placing never went through the camera.
 */
const lockBtn = document.getElementById('lockBtn');

export function setCameraLock(on) {
  S.lockCamera = on;
  controls.enabled = !on;
  lockBtn.setAttribute('aria-pressed', String(on));
  // The playground's button is an emoji that swaps; the game's draws its icon in SVG and lets the
  // aria-pressed latch carry the state, so there is nothing to swap.
  if (!lockBtn.querySelector('svg')) lockBtn.textContent = on ? '🔒' : '🔓';
  lockBtn.title = on ? 'unlock the camera' : 'lock the camera';
}

/**
 * The player's shortcuts, as a table. The playground merges its debug keys over these (gui.js).
 * Keys are lower-cased `e.key`.
 */
const PLAYER_KEYS = {
  f: () => frameRoom(),
  m: () => setMoveMode(!S.moveMode),
  l: () => setCameraLock(!S.lockCamera),
  q: () => S.moveMode && rotateMovable(-YAW_STEP),
  e: () => S.moveMode && rotateMovable(YAW_STEP),
  escape: () => cancelMove(),   // a piece in hand goes back where it was picked up
  // The view buttons' keys, matching their arrows: down looks down on the room, left and right
  // step round the sides a quarter turn at a time, up comes back to the usual framing.
  arrowup: () => frameRoom(),
  arrowdown: () => viewTop(),
  arrowleft: () => viewSide(1),
  arrowright: () => viewSide(-1),
};
// Keys whose browser default would fight the shortcut: Tab moves focus, Space and arrows scroll.
const SWALLOW = new Set(['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/** Typing in a panel field is typing, not a shortcut; and a key pressed in an open dialog is the dialog's. */
const isTyping = (t) => t instanceof HTMLElement
  && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || Boolean(t.closest('dialog')));

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

/**
 * Everything this module does ONCE, at boot. `extraKeys` are merged over the player's; `after`
 * runs after every key and button, so a panel showing the same settings can refresh itself.
 */
export function installControls(extraKeys = {}, after = () => {}) {
  const keys = { ...PLAYER_KEYS, ...extraKeys };
  // The same call as the key and the GUI row, so the three can never drift apart.
  // Wrapped, not passed by reference: frameRoom takes a place to stand in front of, and an
  // event listener would hand it the MouseEvent — which has an `x` but no `z`, so the camera
  // would be positioned at NaN and the shop would vanish.
  document.getElementById('frameBtn').addEventListener('click', () => frameRoom());
  lockBtn.addEventListener('click', () => { setCameraLock(!S.lockCamera); after(); });
  addEventListener('keydown', (e) => {
    // One press, one action. A held key auto-repeats ~30 times a second, so holding Space ran a
    // full round on every repeat — days went by in seconds — and holding R restarted the shop as fast.
    if (e.repeat || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    const action = keys[k];
    if (!action) return;
    if (SWALLOW.has(k)) e.preventDefault();
    action();
    after();
  }, true);
  addEventListener('resize', onResize);
}
