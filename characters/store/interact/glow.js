import { familyExtent } from '../../../inventory/yarn-geometry.js';
import { yarnMeshes, YARN } from '../goods/yarn.js';
import { activeDisplay, firstFreeSlot } from './pointer.js';
import { displays, items, aim, drag, mover } from '../core/state.js';
import { esc } from '../core/util.js';
import { labelOf } from '../../visit.js';
import { gridSize, slotRect, EMPTY } from '../../../inventory/grid.js';
import * as THREE from 'three';
import { GHOST_OK, layerY, GHOST_ALPHA, GHOST_NO, S } from '../core/config.js';
import { scene } from '../scene/stage.js';
import { byId, levelFrame } from '../scene/displays.js';
import { boxes } from '../goods/items.js';

export const glow = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({
    color: S.glowColor, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
  }),
);

const _glowM = new THREE.Matrix4();

const _glowP = new THREE.Vector3();

const _glowQ = new THREE.Quaternion();

const _glowS = new THREE.Vector3();

const _glowOff = new THREE.Vector3();

function readHeldBox(item, index) {
  if (item.name !== 'yarn') {
    boxes.getMatrixAt(index, _glowM);
    _glowM.decompose(_glowP, _glowQ, _glowS);
    return;
  }
  yarnMeshes[item.shape].getMatrixAt(index, _glowM);
  _glowM.decompose(_glowP, _glowQ, _glowS);
  const [uw, uh, ud] = familyExtent(item.shape, YARN.tier);
  _glowP.add(_glowOff.set(0, (uh * _glowS.y) / 2, 0).applyQuaternion(_glowQ));
  _glowS.set(_glowS.x * uw, _glowS.y * uh, _glowS.z * ud);
}

export function tickGlow(elapsed) {
  const on = drag.index !== EMPTY;
  glow.visible = on;
  if (!on || !boxes) return;
  readHeldBox(items[drag.index], drag.index);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * S.glowSpeed * Math.PI * 2);
  glow.position.copy(_glowP);
  glow.quaternion.copy(_glowQ);
  // STORE-SCENE.md §Held item
  glow.scale.copy(_glowS).addScalar(S.glowPad * (0.72 + 0.28 * pulse));
  glow.material.opacity = GHOST_ALPHA * (0.82 + 0.18 * pulse);
}

const whereLine = (disp) => (disp ? `${disp.id} · plane ${disp.plane + 1}/${disp.g.shelves}` : '—');

function movingReadout(disp) {
  const m = mover.m ?? disp;
  const verdict = mover.m
    ? `<br /><span class="${mover.ok ? 'ok' : 'no'}">${mover.ok
        ? 'fits here — click to set it down' : 'blocked — clicking here puts it back · Esc too'}</span>`
    : '';
  return `<span class="k">moving the shop</span> <b>${esc(m ? m.id : '—')}</b>`
    + `<br /><span class="k">click a display or a chair to pick it up · ↺ ↻ or Q/E turn 45° · M to arrange stock again</span>${verdict}`;
}

function dropVerdict(disp, item) {
  if (drag.target)
    return `<span class="ok">drops at col ${drag.target.c}, row ${drag.target.r},`
      + ` layer ${drag.target.layer + 1}</span>`;
  if (disp && !firstFreeSlot(disp, item))
    return `<span class="no">${esc(disp.id)} is full — nothing this size fits on it</span>`;
  return '<span class="no">no room here — click puts it back</span>';
}

function holdingReadout(disp) {
  const item = items[drag.index];
  return `<span class="k">holding</span> <b>${esc(labelOf(item))}</b>`
    + `<br /><span class="k">over</span> ${whereLine(disp)}`
    + `<br />${dropVerdict(disp, item)}`;
}

export function updateHeldReadout() {
  const el = document.getElementById('held');
  if (!el) return;
  const disp = activeDisplay();
  if (S.moveMode) el.innerHTML = movingReadout(disp);
  else if (drag.index === EMPTY) {
    el.innerHTML = `<span class="k">arranging</span> ${whereLine(disp)}`
      + '<br /><span class="k">click a box to pick it up</span>';
  } else el.innerHTML = holdingReadout(disp);
}

export function setPlane(p) {
  const disp = activeDisplay();
  if (!disp) return;
  disp.plane = (p + disp.g.shelves) % disp.g.shelves;
  paintActivePlane();
  updateHeldReadout();
}

export function paintActivePlane() {
  const carrying = drag.index !== EMPTY;
  for (const disp of displays) {
    const revealed = disp.form !== 'floor' || (S.floorGrid && (disp.id === aim.hovered ||
                     (carrying && disp.id === aim.active)));
    disp.lines.forEach((lines, s) => {
      const isActive = disp === activeDisplay() && s === disp.plane;
      lines.visible = S.showGrid && revealed;
      // ponytail: WebGL ignores linewidth (always 1px), so emphasis is contrast; fat lines need three's Line2 addon.
      lines.material.color.set(isActive ? '#5e2408' : '#6f6456');
      lines.material.opacity = isActive ? 1 : 0.6;
      lines.material.transparent = !isActive;
    });
  }
}

export const FLAT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export const dropMarker = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    color: GHOST_OK, transparent: true, opacity: GHOST_ALPHA, depthWrite: false, toneMapped: false,
  })
);

function ghostNoRoom(disp) {
  const { w, d } = gridSize(disp.g);
  dropMarker.visible = true;
  dropMarker.material.color.set(GHOST_NO);
  dropMarker.material.depthTest = false;
  dropMarker.renderOrder = 4;
  dropMarker.material.opacity = 0.5;   // STORE-SCENE.md §Drop feedback
  dropMarker.position.set(0, 0.004, 0).applyMatrix4(levelFrame(disp, disp.plane));
  dropMarker.quaternion.copy(disp.levels?.[disp.plane]?.quat ?? disp.quat).multiply(FLAT_Q);
  dropMarker.scale.set(w, d, 1);
}

function ghostSlot(disp, item, t) {
  dropMarker.material.color.set(GHOST_OK);
  dropMarker.material.depthTest = true;
  dropMarker.material.opacity = GHOST_ALPHA;
  dropMarker.renderOrder = 0;
  const rect = slotRect(disp.g, t.c, t.r, t.w ?? item.w, t.h ?? item.h);
  dropMarker.position.set(rect.x, layerY(t.layer) + 0.004, rect.z)
    .applyMatrix4(levelFrame(disp, disp.plane));
  dropMarker.quaternion.copy(disp.levels?.[disp.plane]?.quat ?? disp.quat).multiply(FLAT_Q);
  dropMarker.scale.set(rect.w * 0.96, rect.d * 0.96, 1);
}

export function ghost(item) {
  const full = drag.target ? null : fullUnderPointer();
  dropMarker.visible = Boolean(drag.target || full);
  if (drag.target) ghostSlot(activeDisplay(), item, drag.target);
  else if (full) ghostNoRoom(full);
}

export function fullUnderPointer() {
  const disp = byId(aim.hovered);
  return disp && drag.index !== EMPTY && !firstFreeSlot(disp, items[drag.index]) ? disp : null;
}


export function installFeedback() {
  dropMarker.visible = false;
  scene.add(dropMarker);

  glow.visible = false;
  glow.renderOrder = 3;
  scene.add(glow);
}
