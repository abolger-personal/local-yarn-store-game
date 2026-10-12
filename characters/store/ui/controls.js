import { setMoveMode } from '../interact/input.js';
import { S } from '../core/config.js';
import { camera, controls, renderer } from '../scene/stage.js';
import { YAW_STEP, cancelMove, rotateMovable } from '../interact/move.js';
import { frameRoom, viewSide, viewTop } from './framing.js';

const lockBtn = document.getElementById('lockBtn');

export function setCameraLock(on) {
  S.lockCamera = on;
  controls.enabled = !on;
  lockBtn.setAttribute('aria-pressed', String(on));
  if (!lockBtn.querySelector('svg')) lockBtn.textContent = on ? '🔒' : '🔓';
  lockBtn.title = on ? 'unlock the camera' : 'lock the camera';
}

const PLAYER_KEYS = {
  f: () => frameRoom(),
  m: () => setMoveMode(!S.moveMode),
  l: () => setCameraLock(!S.lockCamera),
  q: () => S.moveMode && rotateMovable(-YAW_STEP),
  e: () => S.moveMode && rotateMovable(YAW_STEP),
  escape: () => cancelMove(),
  arrowup: () => frameRoom(),
  arrowdown: () => viewTop(),
  arrowleft: () => viewSide(1),
  arrowright: () => viewSide(-1),
};
const SWALLOW = new Set(['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

const isTyping = (t) => t instanceof HTMLElement
  && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || Boolean(t.closest('dialog')));

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

export function installControls(extraKeys = {}, after = () => {}) {
  const keys = { ...PLAYER_KEYS, ...extraKeys };
  document.getElementById('frameBtn').addEventListener('click', () => frameRoom());
  lockBtn.addEventListener('click', () => { setCameraLock(!S.lockCamera); after(); });
  addEventListener('keydown', (e) => {
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
