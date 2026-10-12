import * as THREE from 'three';
import { EMPTY, gridSize, topAt, columnAt, slotRect, footprint, fits, place, nearestSlot }
  from './grid.js';

/**
 * @param {object} opts
 * @param opts.camera
 * @param opts.displays    () => iterable of displays, each { g, ... }
 * @param opts.items       () => the item array
 * @param opts.levelFrame  (disp, shelf) => Matrix4, that level's frame in world space
 * @param opts.itemHeight  (disp, item) => its top, above its level's origin
 * @param [opts.itemTall]  (disp, item) => its own height
 * @param [opts.exposed]   (disp, items, index) => may it be lifted now
 * @param [opts.grabRadius] () => screen-space slack in CSS px
 * @param [opts.snapCells] () => drop reach, in slots
 */
export function makePicker(opts) {
  const k = pickerState(opts);
  return {
    castLocal: (disp, shelf, height) => castLocal(k, disp, shelf, height),
    slotScreenPos: (disp, shelf, item, height) => slotScreenPos(k, disp, shelf, item, height),
    pickCandidate: (event) => pickCandidate(k, event),
    seenAt: (event) => seenAt(k, event),
    hoverTarget: (event) => hoverTarget(k, event),
    displayPoint: (disp, shelf, event) => displayPoint(k, disp, shelf, event),
    snapTo: (disp, shelf, item, x, z) => nearestSlot(disp.g, shelf, item, [x, z], { reach: k.snapCells() * disp.g.cell }),
    setRay: (event) => setRay(k, event),
    raycaster: k.raycaster,
  };
}

function pickerState(opts) {
  const {
    camera, displays, items, levelFrame, itemHeight,
    itemTall = () => 0,
    exposed = () => true,
    grabRadius = () => 44,   // inventory/DESIGN-DECISIONS.md §7, "Picking"
    snapCells = () => 1.6,   // inventory/DESIGN-DECISIONS.md §7, "Dropping"
  } = opts;
  return {
    camera, displays, items, levelFrame, itemHeight, itemTall, exposed, grabRadius, snapCells,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    pickPlane: new THREE.Plane(),
    _hit: new THREE.Vector3(), _n: new THREE.Vector3(), _planePt: new THREE.Vector3(),
    _localPt: new THREE.Vector3(), _ndc: new THREE.Vector3(), _inv: new THREE.Matrix4(),
  };
}

function setRay(k, event) {
  k.pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  k.raycaster.setFromCamera(k.pointer, k.camera);
}

function castLocal(k, disp, shelf, height = 0) {
  const F = k.levelFrame(disp, shelf);
  k._n.set(0, 1, 0).transformDirection(F);
  k._planePt.set(0, height, 0).applyMatrix4(F);
  k.pickPlane.setFromNormalAndCoplanarPoint(k._n, k._planePt);
  const hit = k.raycaster.ray.intersectPlane(k.pickPlane, k._hit);
  if (!hit) return null;
  const distSq = k.raycaster.ray.origin.distanceToSquared(hit);
  k._localPt.copy(hit).applyMatrix4(k._inv.copy(F).invert());
  return { x: k._localPt.x, z: k._localPt.z, distSq };
}

function slotScreenPos(k, disp, shelf, item, height = k.itemHeight(disp, item)) {
  const rect = slotRect(disp.g, item.c, item.r, item.w, item.h);
  k._ndc.set(rect.x, height, rect.z)
    .applyMatrix4(k.levelFrame(disp, shelf))
    .project(k.camera);
  if (k._ndc.z > 1) return null;   // behind the camera
  return { x: (k._ndc.x * 0.5 + 0.5) * innerWidth, y: (-k._ndc.y * 0.5 + 0.5) * innerHeight };
}

function axisDistance(k, { disp, shelf, item }, px, py) {
  const top = slotScreenPos(k, disp, shelf, item);
  if (!top) return null;
  const base = slotScreenPos(k, disp, shelf, item, k.itemHeight(disp, item) - k.itemTall(disp, item));
  if (!base) return Math.hypot(top.x - px, top.y - py);
  const dx = base.x - top.x, dy = base.y - top.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0
    : Math.min(1, Math.max(0, ((px - top.x) * dx + (py - top.y) * dy) / len2));
  return Math.hypot(top.x + dx * t - px, top.y + dy * t - py);
}

function pickCandidate(k, event) {
  setRay(k, event);
  const px = event.clientX, py = event.clientY;
  const radius = k.grabRadius() * (matchMedia('(pointer: coarse)').matches ? 1 : 0.5);
  const all = k.items();
  const best = { exact: null, near: null };

  for (const disp of k.displays()) {
    for (let s = 0; s < disp.g.shelves; s++) {
      for (let r = 0; r < disp.g.rows; r++) {
        for (let c = 0; c < disp.g.cols; c++) weighCell(k, { disp, s, c, r, all, px, py, radius }, best);
      }
    }
  }
  return best.exact ?? best.near;
}

function weighCell(k, cell, best) {
  const { disp, s, c, r, all } = cell;
  const index = topAt(disp.g, s, c, r);
  if (index === EMPTY) return;
  if (!k.exposed(disp, all, index)) return;
  const item = all[index];
  if (item.c !== c || item.r !== r) return;
  const hit = castLocal(k, disp, s, k.itemHeight(disp, item) - k.itemTall(disp, item) / 2);
  if (hit) weighHit(k, cell, { index, item, hit }, best);
}

function weighHit(k, { disp, s, px, py, radius }, { index, item, hit }, best) {
  const col = columnAt(disp.g, hit.x, hit.z);
  if (col && topAt(disp.g, s, col.c, col.r) === index) {
    if (!best.exact || hit.distSq < best.exact.distSq) best.exact = { disp, shelf: s, index, distSq: hit.distSq };
    return;
  }
  if (best.exact) return;
  const d = axisDistance(k, { disp, shelf: s, item }, px, py);
  if (d === null || d > radius) return;
  const { near } = best;
  if (!near || d < near.d - 1 || (Math.abs(d - near.d) <= 1 && hit.distSq < near.distSq)) best.near = { disp, shelf: s, index, distSq: hit.distSq, d };
}

const _box = new THREE.Box3(), _ray = new THREE.Ray(), _boxHit = new THREE.Vector3();

function seenAt(k, event) {
  setRay(k, event);
  let best = null;
  for (const disp of k.displays()) best = nearestItemBox(k, disp, best);
  return best;
}

function nearestItemBox(k, disp, best) {
  const { g } = disp, all = k.items(), seen = new Set();
  g.piles.forEach((pile, key) => {
    const shelf = Math.floor(key / (g.cols * g.rows));
    for (const index of pile) {
      if (index === EMPTY || seen.has(index)) continue;
      seen.add(index);
      const distSq = itemBoxHit(k, disp, shelf, all[index]);
      if (distSq !== null && (!best || distSq < best.distSq)) best = { disp, shelf, index, distSq };
    }
  });
  return best;
}

function itemBoxHit(k, disp, shelf, item) {
  _ray.copy(k.raycaster.ray).applyMatrix4(k._inv.copy(k.levelFrame(disp, shelf)).invert());
  const { x, z, w, d } = slotRect(disp.g, item.c, item.r, item.w, item.h);
  const top = k.itemHeight(disp, item);
  _box.min.set(x - w / 2, top - k.itemTall(disp, item), z - d / 2);
  _box.max.set(x + w / 2, top, z + d / 2);
  return _ray.intersectBox(_box, _boxHit) ? _ray.origin.distanceToSquared(_boxHit) : null;
}

const nearGrid = (g, x, z, pad) => {
  const { w, d } = gridSize(g);
  return Math.abs(x) <= w / 2 + pad && Math.abs(z) <= d / 2 + pad;
};

function hoverTarget(k, event) {
  setRay(k, event);
  let best = null;
  for (const disp of k.displays()) {
    for (let s = 0; s < disp.g.shelves; s++) {
      const hit = castLocal(k, disp, s);
      // half a slot of slack: inventory/DESIGN-DECISIONS.md §7, "Dropping"
      if (!hit || !nearGrid(disp.g, hit.x, hit.z, disp.g.cell * 0.5)) continue;
      if (!best || hit.distSq < best.distSq) best = { disp, shelf: s, distSq: hit.distSq };
    }
  }
  return best;
}

function displayPoint(k, disp, shelf, event) {
  setRay(k, event);
  const guess = castLocal(k, disp, shelf);
  if (!guess) return null;
  return stackHit(k, disp, shelf) ?? guess;
}

function stackHit(k, disp, shelf) {
  const { g } = disp;
  _ray.copy(k.raycaster.ray).applyMatrix4(k._inv.copy(k.levelFrame(disp, shelf)).invert());
  let best = null;
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const index = topAt(g, shelf, c, r);
      const hit = index === EMPTY ? null : columnHit(g, c, r, k.itemHeight(disp, k.items()[index]));
      if (hit && (!best || hit.distSq < best.distSq)) best = hit;
    }
  return best;
}

function columnHit(g, c, r, top) {
  const { x, z } = slotRect(g, c, r, 1, 1);
  const half = g.cell / 2, pad = g.cell / 4;
  _box.min.set(x - half, 0, z - half);
  _box.max.set(x + half, top, z + half);
  if (!_ray.intersectBox(_box, _boxHit)) return null;
  return {
    x: THREE.MathUtils.clamp(_boxHit.x, x - pad, x + pad),
    z: THREE.MathUtils.clamp(_boxHit.z, z - pad, z + pad),
      distSq: _ray.origin.distanceToSquared(_boxHit),
  };
}

// ponytail: yaw is stored per item, not derived from hash(itemId, slotIndex) as
// DESIGN-DECISIONS.md §5 specifies; derive it once items have stable ids.
export const YAW_SCATTER = 0.22 * Math.PI;
export const YAW_SETTLE = 0.12 * Math.PI;

export const scatterYaw = (rng = Math.random) => (rng() - 0.5) * YAW_SCATTER;

export function settleYaw(item, rng = Math.random) {
  item.yaw = (item.yaw ?? 0) + (rng() - 0.5) * YAW_SETTLE;
  return item.yaw;
}

/**
 * @param {any} item
 * @param {number} index
 * @param {any} target  a slot from snapTo, or null to go home
 * @param {{home: any, homeShelf: number, layers?: (item: any) => number, anySlot?: Function}} opts
 */
export function placeItem(item, index, target, { home, homeShelf, layers = () => 1, anySlot }) {
  const tall = layers(item);
  if (target) {
    item.c = target.c; item.r = target.r; item.keys = target.keys;
    if (target.turned) { item.w = target.w; item.h = target.h; }
  } else {
    item.keys = footprint(home.g, homeShelf, [item.c, item.r], [item.w, item.h]);
  }

  if (!fits(home.g, item.keys, tall) && anySlot) {
    const spot = anySlot(home.g, item);
    if (spot) {
      item.shelf = spot.shelf; item.c = spot.c; item.r = spot.r; item.keys = spot.keys;
      if (spot.turned) { item.w = spot.w; item.h = spot.h; }
    }
  }
  item.layer = place(home.g, item.keys, index, tall);
  return item.layer;
}

// odd, so two aligned centres are sampled exactly
const REST_SAMPLES = 21;

/**
 * @param {any} g
 * @param {any[]} items
 * @param {number} index
 * @param {{layerY: (layer: number) => number, solid: (item: any) => {top: Function, bottom: Function, r: number}}} opts
 * @param {Map<number, number>} [memo]
 */
export function settledBase(g, items, index, opts, memo = new Map()) {
  if (memo.has(index)) return memo.get(index);
  const item = items[index];
  const grid = opts.layerY(item.layer);
  let base = grid;
  if (item.layer > 0) {
    const ctx = { g, items, opts, memo };
    const touches = supportsOf(g, item, index).map((j) => contactBase(ctx, index, j));
    base = Math.max(-Infinity, ...touches);
    if (base === -Infinity) base = grid;
  }
  base = Math.max(0, Math.min(grid, base));
  memo.set(index, base);
  return base;
}

function supportsOf(g, item, index) {
  const out = new Set();
  for (const k of item.keys ?? []) {
    const pile = g.piles[k];
    for (let l = Math.min(item.layer, pile.length) - 1; l >= 0; l--)
      if (pile[l] !== EMPTY && pile[l] !== index) { out.add(pile[l]); break; }
  }
  return [...out];
}

function contactBase({ g, items, opts, memo }, index, j) {
  const [a, b] = [items[index], items[j]];
  const [sa, sb] = [opts.solid(a), opts.solid(b)];
  const ra = slotRect(g, a.c, a.r, a.w, a.h), rb = slotRect(g, b.c, b.r, b.w, b.h);
  const x0 = Math.max(ra.x - sa.r, rb.x - sb.r), x1 = Math.min(ra.x + sa.r, rb.x + sb.r);
  const z0 = Math.max(ra.z - sa.r, rb.z - sb.r), z1 = Math.min(ra.z + sa.r, rb.z + sb.r);
  if (x0 > x1 || z0 > z1) return -Infinity;
  const below = settledBase(g, items, j, opts, memo);
  let best = -Infinity;
  for (let u = 0; u < REST_SAMPLES; u++)
    for (let v = 0; v < REST_SAMPLES; v++) {
      const x = x0 + ((x1 - x0) * u) / (REST_SAMPLES - 1), z = z0 + ((z1 - z0) * v) / (REST_SAMPLES - 1);
      const lift = below + sb.top(x - rb.x, z - rb.z) - sa.bottom(x - ra.x, z - ra.z);
      if (lift > best) best = lift;
    }
  return best;
}

export { EMPTY, footprint, fits, dropLayer, place, slotRect, columnAt, topAt } from './grid.js';
