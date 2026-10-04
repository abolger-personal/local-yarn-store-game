// Drawing one item into its slot: the box-and-label path, and the dispatch to yarn.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { items } from '../core/state.js';
import { slotRect } from '../../../inventory/grid.js';
import { cellRect, placeBoxMatrix, placeLabelMatrix, placeMatrix, setInstance } from '../../../inventory/notions.js';
import * as THREE from 'three';
import { layerY, BOX_H, CELL, S } from '../core/config.js';
import { camera } from '../scene/stage.js';
import { byId, levelFrame } from '../scene/displays.js';
import {
  CAPACITY,
  FILL,
  _boxMat,
  _col,
  _hide,
  _mat,
  _pos,
  _shadowMat,
  _sizeMat,
  _sizeTopMat,
  _topMat,
  atlas,
  boxes,
  fieldTop,
  shadows,
  sideField,
  sizeAtlas,
  sizeSide,
  sizeTop,
} from './items.js';
import { YARN_FIT, hideYarn, paintYarn } from './yarn.js';
import { settledBase } from '../../../inventory/pick-place.js';
import { restingSolid } from '../../../inventory/yarn-geometry.js';
import { cellNameFor } from './stock.js';

/** Blank an item's notion box, its four side labels and both size stickers. */
export function hideBox(index) {
  for (const m of [boxes, fieldTop, sizeTop]) setInstance(m, index, { matrix: _hide });
  for (let k = 0; k < 4; k++)
    for (const m of [sideField, sizeSide]) setInstance(m, index * 4 + k, { matrix: _hide });
}

/**
 * Where one item is drawn, resolved from a placement request.
 *
 * `paintInstance` used to take thirteen positional arguments, six of which were derived from the
 * other seven at every call site. This is that derivation, done once: a caller says WHERE, and
 * this says how big the box is and which level frame projects it into the world.
 *
 * Pure — it reads the item and the display and returns numbers, touching no mesh. That is what
 * makes the placement testable without a GL context.
 *
 * @param p {{cx,cz, base, shadowBase, footW, footD, yaw, shelf?, shX?, shZ?, grow?}} level-local
 */
export function boxGeometry(display, item, p) {
  const grow = p.grow ?? 1;
  return {
    cx: p.cx, cz: p.cz, yaw: p.yaw, base: p.base, shadowBase: p.shadowBase,
    shX: p.shX ?? p.cx, shZ: p.shZ ?? p.cz,
    w: p.footW * grow,
    d: p.footD * grow,
    // Height follows the item's own depth in 2.5D layers. A super-bulky ball is 3x3x3 per
    // YARN.md, and drawing it one layer tall made it a slab covering most of a table.
    h: BOX_H * (item.layers ?? 1),
    F: levelFrame(display, p.shelf ?? item.shelf),
  };
}

/** The box itself: real volume, so a stack reads as a stack. */
function paintBox(index, g) {
  _pos.set(g.cx, g.base + g.h / 2, g.cz);
  setInstance(boxes, index,
    { matrix: placeBoxMatrix(_pos, [g.w, g.d, g.h], g.yaw, _boxMat).premultiply(g.F) });
}

/**
 * A label on EVERY side, not just the front.
 *
 * On an orbiting diorama any face can end up toward the camera, and an unlabelled back reads as a
 * blank crate. Four faces share ONE instanced mesh at 4x capacity (instance index*4 + k), so this
 * costs no extra draw call over the single-sided version it replaced.
 */
function paintSideLabels(index, g, item, rect, sizeRect) {
  for (let k = 0; k < 4; k++) {
    const a = g.yaw + k * Math.PI / 2;         // k=0 front, 1 right, 2 back, 3 left
    const alongDepth = k % 2 === 0;            // front/back look across depth, sides across width
    const out = (alongDepth ? g.d : g.w) / 2 + 0.003;
    const face = (alongDepth ? g.w : g.d);
    const nx = Math.sin(a), nz = Math.cos(a);
    // Illustration in the upper part of the face, size number in the strip below it — stacked
    // rather than overlaid, so neither obscures the other on a box only BOX_H tall.
    _pos.set(g.cx + nx * out, g.base + g.h * 0.62, g.cz + nz * out);
    setInstance(sideField, index * 4 + k, {
      matrix: placeLabelMatrix(_pos, face * 0.92, g.h * 0.56, a, _mat).premultiply(g.F),
      rect,
      color: _col.set(item.color),
    });
    // The size rides along on every face too, so a hook's millimetres are readable from any
    // angle — it is meant to be something the player arranges by.
    _pos.set(g.cx + nx * (out + 0.001), g.base + g.h * 0.22, g.cz + nz * (out + 0.001));
    setInstance(sizeSide, index * 4 + k, {
      matrix: placeLabelMatrix(_pos, face * 0.46, g.h * 0.30, a, _sizeMat).premultiply(g.F),
      rect: sizeRect,
    });
  }
}

/**
 * The top face: icon inset to leave a corner free, and the size number in that corner.
 *
 * The top one is the one that matters. The game is an orbiting diorama looking DOWN, so a number
 * only on the side is invisible in normal play — and hook size has to be readable at a glance for
 * it to work as something the player arranges by.
 */
function paintTopLabels(index, g, item, rect, sizeRect) {
  _pos.set(g.cx, g.base + g.h + 0.002, g.cz);
  setInstance(fieldTop, index, {
    matrix: placeMatrix(_pos, g.w * 0.70, g.d * 0.70, g.yaw, _topMat).premultiply(g.F),
    rect,
    color: _col.set(item.color),
  });

  const sx = Math.cos(g.yaw), sz = -Math.sin(g.yaw);
  const fwd = Math.sin(g.yaw), fwdZ = Math.cos(g.yaw);
  _pos.set(
    g.cx + fwd * g.d * 0.30 + sx * g.w * 0.28,
    g.base + g.h + 0.004,
    g.cz + fwdZ * g.d * 0.30 + sz * g.w * 0.28,
  );
  setInstance(sizeTop, index, {
    matrix: placeMatrix(_pos, g.w * 0.40, g.d * 0.40, g.yaw, _sizeTopMat).premultiply(g.F),
    rect: sizeRect,
  });
}

/**
 * The contact shadow, which can be told to stay put while the box floats away from it — that
 * offset IS the read that the thing is in hand, and it is the only cue left once the box is off
 * the plane.
 */
export function paintShadow(index, g, scale = 1.08) {
  _pos.set(g.shX, g.shadowBase + 0.003, g.shZ);
  shadows.setMatrixAt(index,
    placeMatrix(_pos, g.w * scale, g.d * scale, g.yaw, _shadowMat).premultiply(g.F));
  shadows.instanceMatrix.needsUpdate = true;
}

/** One item, box-and-label style — or handed to the yarn meshes if that is what it is. */
function paintInstance(display, index, p) {
  const item = items[index];
  // Yarn is a real mesh rather than a box with a sticker on it. It takes the same placement and
  // honours the same level frame, so every caller — rest, float, NPC shuffle — is unchanged.
  if (item.name === 'yarn') {
    hideBox(index);                 // the two representations are exclusive; blank the other one
    paintYarn(display, index, p);
    return;
  }
  hideYarn(index);
  const g = boxGeometry(display, item, p);
  const rect = cellRect(atlas.manifest, cellNameFor(item));
  const sizeRect = cellRect(sizeAtlas.manifest, item.size != null ? item.size.toFixed(1) : 'blank');
  paintBox(index, g);
  paintSideLabels(index, g, item, rect, sizeRect);
  paintTopLabels(index, g, item, rect, sizeRect);
  paintShadow(index, g);
}

/**
 * Blank EVERY representation of one instance slot: the notion box and its labels, the yarn meshes,
 * and the contact shadow.
 *
 * All three, always, because an index does not remember what it was last drawn as — slot 7 can be
 * a ball today and a hook tomorrow — and blanking only the half you expect is how a ghost gets
 * left behind.
 */
export function hideItem(index) {
  hideBox(index);
  hideYarn(index);
  shadows.setMatrixAt(index, _hide);
  shadows.instanceMatrix.needsUpdate = true;
}

// How settledBase sees an item: yarn by its real mesh, everything else as the box it is drawn as.
const SETTLE = {
  layerY,
  solid: (item) => restingSolid(item.name === 'yarn' ? item.shape : null, item, YARN_FIT),
};

/**
 * Draw an item at rest in its slot — or nowhere at all, once an NPC has bought it.
 *
 * Its height is where it actually touches down on what is under it (settledBase), not its grid
 * layer: drawn at the layer, anything perched off-centre on a ball hovered over the ball's curve.
 * `memo` is shared across one repaint so each support is settled once.
 */
export function refresh(index, memo = new Map()) {
  const item = items[index];
  if (item.gone) {
    hideItem(index);
    return;
  }
  const disp = byId(item.display);
  const rect = slotRect(disp.g, item.c, item.r, item.w, item.h);
  const base = settledBase(disp.g, items, index, SETTLE, memo);
  paintInstance(disp, index, {
    cx: rect.x, cz: rect.z, base, shadowBase: base,
    footW: rect.w * FILL, footD: rect.d * FILL, yaw: item.yaw, shelf: item.shelf,
  });
}

/**
 * Draw an item floating under the pointer, lifted off whichever display is currently targeted —
 * which may not be the one it was picked up from, if the player has moved the pointer across.
 * Slightly enlarged, so a held item reads as picked-up rather than just badly placed.
 *
 * `base`, when given, is the level-local height to draw it at, right where (x, z) says, with no
 * lift: a mouse hides nothing, so the held item hovers just over its drop, under the pointer.
 */
const _lift = new THREE.Vector3();

export function refreshFloating(disp, index, x, z, base = null) {
  const item = items[index];
  if (base !== null) {
    paintInstance(disp, index, {
      cx: x, cz: z, base, shadowBase: base,
      footW: item.w * CELL * FILL, footD: item.h * CELL * FILL,
      yaw: item.yaw, shelf: disp.plane, grow: 1.08,
    });
    return;
  }
  // Lifted along SCREEN up, not the level's own up, because the job is to get the box out from
  // under a finger and a finger covers PIXELS. The level's up buys almost none of them on the one
  // display that needs it most: a 45° shelf tilts its up axis toward the camera, so at a 35°
  // elevation the same world lift is worth about a fifth of the screen rise a flat table gives.
  // Screen up is worth all of it, on every display, at every camera angle.
  _lift.set(0, 1, 0).applyQuaternion(camera.quaternion)
    .transformDirection(disp.levels?.[disp.plane]?.frameInv ?? disp.frameInv)
    .multiplyScalar(S.liftHeight);
  // The shadow stays under the pointer, on the plane, so the box reads as lifted OFF somewhere
  // rather than as badly placed somewhere else.
  paintInstance(disp, index, {
    cx: x + _lift.x, cz: z + _lift.z, base: _lift.y, shadowBase: 0,
    footW: item.w * CELL * FILL, footD: item.h * CELL * FILL,
    yaw: item.yaw, shelf: disp.plane, shX: x, shZ: z, grow: 1.08,
  });
}

export const refreshAll = () => {
  const memo = new Map();
  items.forEach((_, i) => {
    // A held item follows the pointer; it has no resting slot to be drawn in until it is dropped.
    if (!items[i].held) refresh(i, memo);
  });
  // Then blank every slot ABOVE the stock that exists.
  //
  // An InstancedMesh keeps whatever matrix was last written to a slot, and `count` is not a
  // reliable eraser here: sizeInstanceBuffers can shrink the notion meshes, but the YARN meshes
  // are allocated and drawn at full CAPACITY (they have no per-frame count to lower — see
  // yarnInstances), so a ball whose item no longer exists carries on being drawn exactly where
  // it was. The symptom is stale yarn: the bench's "clear the shop" left every ball standing,
  // and in the shop a day that puts out LESS stock than yesterday leaves yesterday's balls
  // floating over the new arrangement.
  //
  // Unconditional rather than tracking a high-water mark: it is one matrix write per empty slot
  // on a function that already redraws the whole shop, and a high-water mark is a second piece
  // of state that can disagree with this one.
  for (let i = items.length; i < CAPACITY; i++) hideItem(i);
};
