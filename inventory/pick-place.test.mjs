import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeDisplay, footprint, place, slotRect } from './grid.js';
import { makePicker, settledBase } from './pick-place.js';
import { buildFamily, restingSolid, yarnFit } from './yarn-geometry.js';
import { SHAPE_UNITS } from './catalog.js';

// a mouse: the half grab radius, the harder case
const W = 1440, H = 900;
globalThis.innerWidth = W;
globalThis.innerHeight = H;
globalThis.matchMedia = () => ({ matches: false });

// from characters/store/core/config.js; TABLE_Y from scene/displays.js
const CELL = 0.20, BOX_H = 0.055, FILL = 0.9, TABLE_Y = 0.44;

// ui/framing.js's camera: one slot ~56px tall
function shopCamera() {
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 200);
  const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const dist = THREE.MathUtils.clamp(
    (CELL * FILL * H) / (2 * Math.tan(halfFov) * 56), 2.8, 16);
  const v = new THREE.Vector3(0.30, 0.62, 0.82).normalize().multiplyScalar(dist);
  camera.position.set(v.x, v.y, v.z);
  camera.lookAt(0, 0.55, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function table() {
  const camera = shopCamera();
  const g = makeDisplay(5, 5, { shelves: 1, headroom: 12, cell: CELL });
  const items = [];
  const frame = new THREE.Matrix4().makeTranslation(0, TABLE_Y, 0);
  const disp = { id: 'table', g, frame };
  const put = (spec, c, r) => {
    const keys = footprint(g, 0, [c, r], [spec.w, spec.h]);
    const i = items.length;
    items.push({ ...spec, c, r, keys, shelf: 0, layer: place(g, keys, i, spec.layers) });
    return i;
  };
  const picker = makePicker({
    camera, displays: () => [disp], items: () => items,
    levelFrame: () => frame,
    itemHeight: (_d, it) => it.layer * BOX_H + BOX_H * it.layers,
    itemTall: (_d, it) => BOX_H * it.layers,
    grabRadius: () => 44,
    snapCells: () => 1.6,
  });
  return { g, disp, items, put, picker, frame, camera };
}

function screenOf(g, frame, camera, it, t) {
  const rect = slotRect(g, it.c, it.r, it.w, it.h);
  const v = new THREE.Vector3(rect.x, it.layer * BOX_H + BOX_H * it.layers * t, rect.z)
    .applyMatrix4(frame).project(camera);
  return { clientX: (v.x * 0.5 + 0.5) * W, clientY: (-v.y * 0.5 + 0.5) * H };
}

{
  const { g, items, put, picker, frame, camera } = table();
  const cases = [
    ['flat notion', put({ name: 'hook', w: 1, h: 1, layers: 1 }, 0, 0)],
    ['bulky cone', put({ name: 'cone', w: 1, h: 1, layers: 4 }, 2, 0)],
    ['super-bulky ball', put({ name: 'ball', w: 3, h: 3, layers: 3 }, 1, 2)],
  ];
  for (const [label, index] of cases) {
    for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const found = picker.pickCandidate(screenOf(g, frame, camera, items[index], t));
      assert.ok(found, `${label}: a click ${t * 100}% up its face hit nothing`);
      assert.equal(found.index, index,
        `${label}: a click ${t * 100}% up its face picked ${items[found.index].name}`);
    }
  }
}

{
  const { g, items, put, picker, frame, camera } = table();
  const left = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 1, 2);
  const right = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 3, 2);
  for (const [label, index] of [['left', left], ['right', right]]) {
    const found = picker.pickCandidate(screenOf(g, frame, camera, items[index], 0.5));
    assert.equal(found?.index, index, `a click on the ${label} cone picked the other one`);
  }
}

{
  const { g, items, put, picker, frame, camera } = table();
  const under = put({ name: 'pattern', w: 2, h: 2, layers: 1 }, 1, 1);
  const over = put({ name: 'ball', w: 2, h: 2, layers: 2 }, 1, 1);
  assert.ok(items[over].layer > items[under].layer, 'the lid landed on top of the pattern');
  for (const t of [0.1, 0.5, 0.9]) {
    const found = picker.pickCandidate(screenOf(g, frame, camera, items[over], t));
    assert.equal(found?.index, over, 'a click on the stack picked the buried item');
  }
}

{
  const { g, items, put, picker, frame, camera } = table();
  const under = put({ name: 'pattern', w: 2, h: 2, layers: 1 }, 1, 1);
  const over = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 1, 1);
  const edge = screenOf(g, frame, camera, { ...items[under], c: 2, r: 2, w: 1, h: 1 }, 0.5);
  assert.equal(picker.seenAt(edge)?.index, under, 'hovering the pattern past the cone read something else');
  assert.equal(picker.seenAt(screenOf(g, frame, camera, items[over], 0.5))?.index, over,
    'hovering the cone read the pattern under it');
}

{
  const { g, items, put, picker, frame, camera, disp } = table();
  const cone = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 2, 2);
  for (const t of [1, 0.5]) {
    const p = picker.displayPoint(disp, 0, screenOf(g, frame, camera, items[cone], t));
    const slot = picker.snapTo(disp, 0, { name: 'hook', w: 1, h: 1, layers: 1 }, p.x, p.z);
    assert.deepEqual([slot?.c, slot?.r, slot?.layer], [2, 2, 4],
      `a drop aimed ${t * 100}% up the cone landed at ${JSON.stringify(slot && [slot.c, slot.r, slot.layer])}`);
  }
}

{
  // a hole, not a box: a box would hide the cells behind it from the camera
  const camera = shopCamera();
  const g = makeDisplay(7, 7, { shelves: 1, headroom: 12, cell: CELL, mask: (_s, c, r) => !(c === 3 && r === 3) });
  const frame = new THREE.Matrix4().makeTranslation(0, TABLE_Y, 0);
  const disp = { g };
  const picker = makePicker({ camera, displays: () => [disp], items: () => [], levelFrame: () => frame,
                              itemHeight: () => 0 });
  const screen = (x, z) => {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(frame).project(camera);
    return { clientX: (v.x * 0.5 + 0.5) * W, clientY: (-v.y * 0.5 + 0.5) * H };
  };
  for (const n of [1, 2, 3])
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        if (c === 3 && r === 3) continue;
        for (const [fx, fz] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.85], [0.15, 0.85], [0.85, 0.15]]) {
          const ev = screen((c + fx) * CELL - g.cols * CELL / 2, (r + fz) * CELL - g.rows * CELL / 2);
          const p = picker.displayPoint(disp, 0, ev);
          const t = picker.snapTo(disp, 0, { w: n, h: n, layers: 1 }, p.x, p.z);
          const legal = [...Array(n * n).keys()].some((k) => {
            const keys = footprint(g, 0, [c - (k % n), r - Math.floor(k / n)], [n, n]);
            return keys !== null;
          });
          if (!legal) continue;
          assert.ok(t && c >= t.c && c < t.c + t.w && r >= t.r && r < t.r + t.h,
            `${n}x${n} aimed at cell (${c},${r}) +(${fx},${fz}) dropped at ${t ? `(${t.c},${t.r})` : 'nowhere'}`);
        }
      }
}

{
  const G = { cell: CELL, boxHeight: BOX_H, fill: FILL, tier: 'low' };
  const solid = (it) => restingSolid(it.family, it, G);
  const opts = { layerY: (l) => l * BOX_H, solid };
  const stack = (spec) => {
    const g = makeDisplay(5, 5, { headroom: 99, cell: CELL });
    const items = spec.map(([family, n, c, r]) => ({ family, w: n, h: n, c, r, yaw: 0.3 }));
    items.forEach((it, i) => {
      it.layers = it.family ? yarnFit(it.family, it.w, it.h, G).layers : 1;
      it.keys = footprint(g, 0, [it.c, it.r], [it.w, it.h]);
      it.layer = place(g, it.keys, i, it.layers);
    });
    const memo = new Map();
    return { g, items, base: (i) => settledBase(g, items, i, opts, memo) };
  };
  // 0 touching, < 0 inside
  const clearance = ({ g, items, base }, i, j) => {
    const [a, b] = [items[i], items[j]], [sa, sb] = [solid(a), solid(b)];
    const ra = slotRect(g, a.c, a.r, a.w, a.h), rb = slotRect(g, b.c, b.r, b.w, b.h);
    let min = Infinity;
    for (let u = 0; u <= 80; u++)
      for (let v = 0; v <= 80; v++) {
        const x = ra.x + sa.r * (u / 40 - 1), z = ra.z + sa.r * (v / 40 - 1);
        const d = base(i) + sa.bottom(x - ra.x, z - ra.z) - base(j) - sb.top(x - rb.x, z - rb.z);
        if (d < min) min = d;
      }
    return min;
  };
  const cases = [
    ['a 2x2 ball one cell diagonally along a 2x2 ball', [['ball', 2, 1, 1], ['ball', 2, 2, 2]]],
    ['a 1x1 box on the shoulder of a 2x2 ball', [['ball', 2, 1, 1], [null, 1, 1, 1]]],
    ['a 1x1 ball on a cone', [['cone', 1, 2, 2], ['ball', 1, 2, 2]]],
    ['a 3x3 ball on a 2x2 ball', [['ball', 2, 2, 2], ['ball', 3, 1, 1]]],
  ];
  for (const [label, spec] of cases) {
    const gap = clearance(stack(spec), 1, 0);
    assert.ok(Math.abs(gap) < 0.003, `${label}: drawn ${gap.toFixed(4)} from touching`);
  }
  const tower = stack([['ball', 2, 1, 1], ['ball', 2, 2, 2], [null, 1, 3, 3]]);
  assert.ok(tower.base(2) < tower.items[2].layer * BOX_H - 0.1, 'the box came down with the ball under it');
  assert.ok(Math.abs(clearance(tower, 2, 1)) < 0.003, 'and still sits on it');
}

{
  const volume = (g) => {
    const p = g.attributes.position, at = (i) => new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i));
    let v = 0;
    for (let i = 0; i < g.index.count; i += 3) v += at(i).dot(at(i + 1).cross(at(i + 2)));
    return Math.abs(v) / 6;
  };
  const grid = { cell: 0.2, boxHeight: 0.055, fill: 0.9, tier: 'low' };
  for (const size of [1, 2, 3]) {
    const drawn = (shape) => { const f = yarnFit(shape, size, size, grid); return volume(buildFamily(shape, 'low')) * f.k * f.k * f.ky; };
    for (const shape of Object.keys(SHAPE_UNITS)) {
      const ratio = drawn(shape) / drawn('skein') / SHAPE_UNITS[shape];
      assert.ok(ratio > 0.75 && ratio < 1.25, `${size}x${size} ${shape}: drawn volume follows its units (${ratio.toFixed(2)})`);
    }
  }
}

console.log('pick-place.js self-check: all assertions passed');
