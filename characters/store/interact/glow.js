// The held-item halo, the drop ghost, and the pointer handlers that drive them.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

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
import { levelFrame } from '../scene/displays.js';
import { boxes } from '../goods/items.js';

// ---------------------------------------------------------------- held-item glow
//
// "Something is in your hand" needs to be visible on the ITEM, not only in the HUD — especially on
// touch, where a finger covers the thing it just picked up.
//
// A slightly larger box rendered BackSide: only its rear faces draw, so it reads as a halo around
// the item's silhouette and nowhere else. One mesh, one draw call, no shader and no post pass —
// which matters because DESIGN-DECISIONS.md rules out an extra render target on tile-based mobile
// GPUs, and this is exactly the effect that would otherwise want one.
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

/**
 * Read the held item's live matrix out of whichever mesh actually draws it, and turn it into a
 * centre and a size for the halo.
 *
 * Two meshes, because an item is drawn one of two ways. Reading `boxes` unconditionally is why
 * yarn never glowed: a held ball has its box blanked to a zero-scale matrix on purpose, so the
 * halo was being scaled to nothing.
 *
 * They also need different arithmetic. A notion box is a UNIT cube scaled to size, so its matrix
 * scale IS its size and its origin is its centre. A yarn family is neither: the geometry has its
 * own extent (a skein is 1.00 x 0.44 x 0.40, not a cube) and it sits ON y=0 rather than centred,
 * so the scale has to be multiplied by that extent and the centre lifted half a height.
 */
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

/**
 * Pulse the halo around whatever is held. Reads the item's live matrix straight out of the mesh
 * drawing it, so it follows the drag exactly without duplicating any placement maths — including
 * the display frame, which is already baked into that matrix.
 */
export function tickGlow(elapsed) {
  const on = drag.index !== EMPTY;
  glow.visible = on;
  if (!on || !boxes) return;
  readHeldBox(items[drag.index], drag.index);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * S.glowSpeed * Math.PI * 2);
  glow.position.copy(_glowP);
  glow.quaternion.copy(_glowQ);
  // Padded in world units rather than scaled by a factor: a 2x2 package would otherwise wear a
  // halo twice as thick as a 1x1, and the glow would read as "bigger item" instead of "held".
  glow.scale.copy(_glowS).addScalar(S.glowPad * (0.72 + 0.28 * pulse));
  // Peaks fully opaque. The pulse is carried mostly by the fade rather than the size, so the halo
  // never shrinks back far enough to stop reading as a deliberate highlight.
  glow.material.opacity = GHOST_ALPHA * (0.82 + 0.18 * pulse);
}

/** Which display and level the player is aimed at, as one line. */
const whereLine = (disp) => (disp ? `${disp.id} · plane ${disp.plane + 1}/${disp.g.shelves}` : '—');

/** Move mode has its own readout: the verb is different, so the instructions must be too. */
function movingReadout(disp) {
  const m = mover.m ?? disp;
  const verdict = mover.m
    ? `<br /><span class="${mover.ok ? 'ok' : 'no'}">${mover.ok
        ? 'fits here — click to set it down' : 'blocked — clicking here puts it back · Esc too'}</span>`
    : '';
  return `<span class="k">moving the shop</span> <b>${esc(m ? m.id : '—')}</b>`
    + `<br /><span class="k">click a display or a chair to pick it up · ↺ ↻ or Q/E turn 45° · M to arrange stock again</span>${verdict}`;
}

/**
 * Where the held item lands, or why it does not.
 *
 * Three outcomes, not two: a slot it fits, a display with no room for it ANYWHERE (which is the
 * red-wash case, and needs saying in words too), and simply not over a slot.
 */
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

/** What the player is holding and where it would land — the arranging half of the NPC panel. */
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

/** Step the active display's plane, for reaching a shelf level the pointer cannot single out. */
export function setPlane(p) {
  const disp = activeDisplay();
  if (!disp) return;
  disp.plane = (p + disp.g.shelves) % disp.g.shelves;
  paintActivePlane();
  updateHeldReadout();
}

/** The plane the player is arranging is lit; every other grid is muted. */
/**
 * Show/hide the grids and highlight the one the player is arranging.
 *
 * "show grid" routes through here rather than having its own pass — one function decides what a
 * lattice looks like, so the toggle and the hover highlight cannot disagree.
 */
export function paintActivePlane() {
  const carrying = drag.index !== EMPTY;
  const held = carrying ? items[drag.index] : null;
  for (const disp of displays) {
    // Full FOR WHAT IS IN HAND — a 3x3 bulky ball and a 1x1 hook get different answers about the
    // same shelf. Whole-display, so the warning is there before the pointer arrives, which is the
    // point: the display the player is about to drag across the room to is the one that has to
    // say no. Recomputed rather than cached because an NPC restructures displays between rounds.
    const noRoom = held && !firstFreeSlot(disp, held);
    // A floor grid lies flat across open floor, so leaving it on litters the whole room with
    // lines. It shows only while the pointer is over it — or while it is the drop target of
    // something being carried, which is exactly when the player needs to see the slots.
    // Shelves and tables keep their grids on: they are small and read as furniture detail.
    const revealed = disp.form !== 'floor' || disp.id === aim.hovered ||
                     (carrying && disp.id === aim.active) || noRoom;
    disp.lines.forEach((lines, s) => {
      const isActive = disp === activeDisplay() && s === disp.plane;
      lines.visible = S.showGrid && revealed;
      // ponytail: LineBasicMaterial.linewidth is ignored by WebGL — every line is 1px however
      // thick you ask for. "Stronger" therefore has to come from contrast, not width: a much
      // darker ink at full opacity against the pale floor. If genuinely fat lines are wanted,
      // that needs three's Line2/LineMaterial addon, which is a real dependency on a fat-line
      // shader rather than a settings change.
      lines.material.color.set(latticeInk(noRoom, isActive));
      lines.material.opacity = noRoom || isActive ? 1 : 0.6;
      lines.material.transparent = !(noRoom || isActive);
      // A full lattice is drawn through its own stock, for the same reason the wash is: the boxes
      // that make it full are sitting on top of the lines saying so — and it opts out of the tone
      // mapper, without which the alarm red arrives as maroon. The ordinary lattice keeps its tone
      // mapping: it is furniture detail and belongs in the shop's own light.
      lines.material.depthTest = !noRoom;
      lines.material.toneMapped = !noRoom;
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

/**
 * The negative answer, which said nothing at all before.
 *
 * In a 3D room a far display reads as having room it does not have: perspective hides how full a
 * level is, and the absence of a green ghost is indistinguishable from "you aimed badly". So a
 * display that cannot take this item ANYWHERE washes its whole level red — an answer about the
 * display, not about the aim.
 */
function ghostNoRoom(disp) {
  const { w, d } = gridSize(disp.g);
  dropMarker.visible = true;
  dropMarker.material.color.set(GHOST_NO);
  // Drawn THROUGH the stock. A level with no room is by definition covered in boxes, so a wash
  // that respects depth would be hidden behind exactly the thing it is warning about.
  dropMarker.material.depthTest = false;
  dropMarker.renderOrder = 4;
  // Deliberately thinner than the green. The green answers "this exact slot" and covers one cell,
  // so solid is right; the red covers a whole display, and at full strength it would hide the
  // stock instead of ruling it out — a red rectangle reads as broken, a red wash reads as no.
  dropMarker.material.opacity = 0.5;
  dropMarker.position.set(0, 0.004, 0).applyMatrix4(levelFrame(disp, disp.plane));
  dropMarker.quaternion.copy(disp.levels?.[disp.plane]?.quat ?? disp.quat).multiply(FLAT_Q);
  dropMarker.scale.set(w, d, 1);
}

/** The green drop shadow, in the slot the item will actually land in. */
function ghostSlot(disp, item, t) {
  dropMarker.material.color.set(GHOST_OK);
  dropMarker.material.depthTest = true;
  dropMarker.material.opacity = GHOST_ALPHA;
  dropMarker.renderOrder = 0;
  // The TARGET's footprint, not the item's: a turned drop swaps them, and the preview has to show
  // where it will ACTUALLY land or the turn is a surprise at release.
  const rect = slotRect(disp.g, t.c, t.r, t.w ?? item.w, t.h ?? item.h);
  dropMarker.position.set(rect.x, layerY(t.layer) + 0.004, rect.z)
    .applyMatrix4(levelFrame(disp, disp.plane));
  dropMarker.quaternion.copy(disp.levels?.[disp.plane]?.quat ?? disp.quat).multiply(FLAT_Q);
  dropMarker.scale.set(rect.w * 0.96, rect.d * 0.96, 1);
}

/** Where this item would land — the green slot, or the red "nowhere on this display". */
export function ghost(item) {
  const disp = activeDisplay();
  const t = drag.target;
  dropMarker.visible = Boolean(t);
  if (t) {
    ghostSlot(disp, item, t);
    return;
  }
  if (!firstFreeSlot(disp, item)) ghostNoRoom(disp);
}

/** A lattice's ink: alarm red when full, dark on the level being aimed at, pale otherwise. */
function latticeInk(noRoom, isActive) {
  if (noRoom) return GHOST_NO;
  return isActive ? '#5e2408' : '#6f6456';
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installFeedback() {
  dropMarker.visible = false;
  scene.add(dropMarker);

  glow.visible = false;
  glow.renderOrder = 3;
  scene.add(glow);
}
