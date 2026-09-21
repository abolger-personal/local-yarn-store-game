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
import { makePicker } from './pick-place.js';

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
    const keys = footprint(g, 0, c, r, spec.w, spec.h);
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

console.log('pick-place.js self-check: all assertions passed');
