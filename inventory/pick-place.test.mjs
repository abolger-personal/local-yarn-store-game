// Self-check for the PICK geometry. Run: node inventory/pick-place.test.mjs
//
// The one thing worth asserting here is the one that broke: a click lands on the thing the player
// can see, however TALL that thing is. Everything else about picking is plane maths that grid.js
// already covers — this file exists because "hard to pick up" is a property of the projection,
// and the projection needs a camera, so it cannot be tested by hand on a grid.
//
// The shop's own framing and dimensions are used deliberately: the bug was a fraction of a slot at
// one particular viewing angle, so a convenient camera would have hidden it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeDisplay, footprint, place, slotRect } from './grid.js';
import { makePicker, settledBase } from './pick-place.js';
import { restingSolid, yarnFit } from './yarn-geometry.js';

// A browser-ish enough global for the projection: CSS pixels, and a mouse (the HALF radius, which
// is the harder case).
const W = 1440, H = 900;
globalThis.innerWidth = W;
globalThis.innerHeight = H;
globalThis.matchMedia = () => ({ matches: false });

// characters/store/core/config.js, and the table height from scene/displays.js.
const CELL = 0.20, BOX_H = 0.055, FILL = 0.9, TABLE_Y = 0.44;

/** The camera ui/framing.js puts you at: inside the room, one slot ~56px tall. */
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

/**
 * Where a point up the item's drawn front face lands on screen: `t` runs 0 (its base) to 1 (its
 * top). This is the picture the player is clicking at.
 */
function screenOf(g, frame, camera, it, t) {
  const rect = slotRect(g, it.c, it.r, it.w, it.h);
  const v = new THREE.Vector3(rect.x, it.layer * BOX_H + BOX_H * it.layers * t, rect.z)
    .applyMatrix4(frame).project(camera);
  return { clientX: (v.x * 0.5 + 0.5) * W, clientY: (-v.y * 0.5 + 0.5) * H };
}

// --- a click anywhere on a tall item picks THAT item ------------------------
//
// YARN.md runs to 3x3x3, and a 1x1 cone reserves four layers — 60px of screen against a 15px
// notion box. Measuring a pick from the top face alone made every one of those a thin sliver at
// the very top of the object: the taller a thing was, the harder it got to pick up.
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

// --- the near-miss slack still belongs to the NEAREST item ------------------
//
// Forgiveness must not become greed: two items side by side, a click on one picks that one.
{
  const { g, items, put, picker, frame, camera } = table();
  const left = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 1, 2);
  const right = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 3, 2);
  for (const [label, index] of [['left', left], ['right', right]]) {
    const found = picker.pickCandidate(screenOf(g, frame, camera, items[index], 0.5));
    assert.equal(found?.index, index, `a click on the ${label} cone picked the other one`);
  }
}

// --- a stack resolves to its TOP item ---------------------------------------
//
// lift() only ever pops a top, so a pick that returned the buried one would evict something the
// player never touched.
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

// --- hovering the visible edge of a buried item reads THAT item ---------------
//
// The band used pickCandidate, which weighs column tops only (right for a lift), so the edge of a
// pattern showing past the cone on it read as the cone, or nothing. Fully covered stays the top's.
{
  const { g, items, put, picker, frame, camera } = table();
  const under = put({ name: 'pattern', w: 2, h: 2, layers: 1 }, 1, 1);
  const over = put({ name: 'cone', w: 1, h: 1, layers: 4 }, 1, 1);
  const edge = screenOf(g, frame, camera, { ...items[under], c: 2, r: 2, w: 1, h: 1 }, 0.5);
  assert.equal(picker.seenAt(edge)?.index, under, 'hovering the pattern past the cone read something else');
  assert.equal(picker.seenAt(screenOf(g, frame, camera, items[over], 0.5))?.index, over,
    'hovering the cone read the pattern under it');
}

// --- a drop aimed at a tall item stacks ONTO it ------------------------------
//
// The drop used to cast the bare table first and only then ask what stood on the column it hit.
// At a diorama angle the table under a cone's top is a slot or more BEHIND the cone, so every
// drop aimed at yarn snapped to the empty cell behind it: notions and patterns stacked, yarn
// could never be stacked onto. Its front face counts too — that is most of what is on screen.
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

// --- with a mouse, the drop lands UNDER the pointer -----------------------------------
//
// The green ghost has to cover the slot the pointer is on, or where a click puts things is a guess.
// It used to rank slots by how near their CENTRE was, within 1.6 slots: a 3x3 aimed at a corner
// cell, or at a cell whose centred spot was taken, snapped somewhere not under the pointer at all,
// or nowhere, though a 3x3 covering that cell was free. Every legal footprint over the pointer's
// cell must be found, and the most centred of them taken.
{
  // A hole rather than a box in the way of the centred spots: a box would also hide the cells
  // behind it from the camera, and aiming at a box's face rightly means stacking on it.
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
        if (c === 3 && r === 3) continue;                // the hole itself
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

// --- a stacked item is DRAWN touching what it rests on ------------------------------
//
// The grid stacks in whole layers on the tallest column, and drawn at that height anything
// perched off-centre on a ball hovered over the ball's curve: a 2x2 ball shifted one cell along
// another floated 0.124 — over two layers — clear of it. settledBase lowers it onto the real mesh
// surfaces; the clearance below is measured far finer than settledBase samples, over the meshes
// the shop draws, so a hover OR a sink shows up.
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
  /** Smallest vertical clearance from item i's bottom to item j's top: 0 touching, < 0 inside. */
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
  // A stack settles together: a box on the perched ball follows it down and still touches it.
  const tower = stack([['ball', 2, 1, 1], ['ball', 2, 2, 2], [null, 1, 3, 3]]);
  assert.ok(tower.base(2) < tower.items[2].layer * BOX_H - 0.1, 'the box came down with the ball under it');
  assert.ok(Math.abs(clearance(tower, 2, 1)) < 0.003, 'and still sits on it');
}

console.log('pick-place.js self-check: all assertions passed');
