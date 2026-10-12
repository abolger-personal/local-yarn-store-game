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

export function hideBox(index) {
  for (const m of [boxes, fieldTop, sizeTop]) setInstance(m, index, { matrix: _hide });
  for (let k = 0; k < 4; k++)
    for (const m of [sideField, sizeSide]) setInstance(m, index * 4 + k, { matrix: _hide });
}

/** @param p {{cx,cz, base, shadowBase, footW, footD, yaw, shelf?, shX?, shZ?, grow?}} level-local */
export function boxGeometry(display, item, p) {
  const grow = p.grow ?? 1;
  return {
    cx: p.cx, cz: p.cz, yaw: p.yaw, base: p.base, shadowBase: p.shadowBase,
    shX: p.shX ?? p.cx, shZ: p.shZ ?? p.cz,
    w: p.footW * grow,
    d: p.footD * grow,
    h: BOX_H * (item.layers ?? 1),
    F: levelFrame(display, p.shelf ?? item.shelf),
  };
}

function paintBox(index, g) {
  _pos.set(g.cx, g.base + g.h / 2, g.cz);
  setInstance(boxes, index,
    { matrix: placeBoxMatrix(_pos, [g.w, g.d, g.h], g.yaw, _boxMat).premultiply(g.F) });
}

function paintSideLabels(index, g, item, rect, sizeRect) {
  for (let k = 0; k < 4; k++) {
    const a = g.yaw + k * Math.PI / 2;
    const alongDepth = k % 2 === 0;
    const out = (alongDepth ? g.d : g.w) / 2 + 0.003;
    const face = (alongDepth ? g.w : g.d);
    const nx = Math.sin(a), nz = Math.cos(a);
    _pos.set(g.cx + nx * out, g.base + g.h * 0.62, g.cz + nz * out);
    setInstance(sideField, index * 4 + k, {
      matrix: placeLabelMatrix(_pos, face * 0.92, g.h * 0.56, a, _mat).premultiply(g.F),
      rect,
      color: _col.set(item.color),
    });
    _pos.set(g.cx + nx * (out + 0.001), g.base + g.h * 0.22, g.cz + nz * (out + 0.001));
    setInstance(sizeSide, index * 4 + k, {
      matrix: placeLabelMatrix(_pos, face * 0.46, g.h * 0.30, a, _sizeMat).premultiply(g.F),
      rect: sizeRect,
    });
  }
}

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

export function paintShadow(index, g, scale = 1.08) {
  _pos.set(g.shX, g.shadowBase + 0.003, g.shZ);
  shadows.setMatrixAt(index,
    placeMatrix(_pos, g.w * scale, g.d * scale, g.yaw, _shadowMat).premultiply(g.F));
  shadows.instanceMatrix.needsUpdate = true;
}

function paintInstance(display, index, p) {
  const item = items[index];
  if (item.name === 'yarn') {
    hideBox(index);
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

export function hideItem(index) {
  hideBox(index);
  hideYarn(index);
  shadows.setMatrixAt(index, _hide);
  shadows.instanceMatrix.needsUpdate = true;
}

const SETTLE = {
  layerY,
  solid: (item) => restingSolid(item.name === 'yarn' ? item.shape : null, item, YARN_FIT),
};

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

const _lift = new THREE.Vector3();

// STORE-SCENE.md §Held item
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
  _lift.set(0, 1, 0).applyQuaternion(camera.quaternion)
    .transformDirection(disp.levels?.[disp.plane]?.frameInv ?? disp.frameInv)
    .multiplyScalar(S.liftHeight);
  paintInstance(disp, index, {
    cx: x + _lift.x, cz: z + _lift.z, base: _lift.y, shadowBase: 0,
    footW: item.w * CELL * FILL, footD: item.h * CELL * FILL,
    yaw: item.yaw, shelf: disp.plane, shX: x, shZ: z, grow: 1.08,
  });
}

export const refreshAll = () => {
  const memo = new Map();
  items.forEach((_, i) => {
    if (!items[i].held) refresh(i, memo);
  });
  for (let i = items.length; i < CAPACITY; i++) hideItem(i);
};
