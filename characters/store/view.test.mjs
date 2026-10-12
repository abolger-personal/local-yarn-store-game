// Self-check for the game's opening camera (shopView, core/config.js). Run: node characters/store/view.test.mjs
//
// The game opens on the view in the user's screenshot, so day 1's Former Owner, who signs the
// Guestbook and walks out, cannot be missed. At that screenshot's own size, the room's landmarks
// land where the screenshot shows them; on other screens, the Guestbook and the walls round it are
// still in frame. Coordinates are copied from scene/room.js (walls, windows, bulletin, guestbook,
// lamp-a in props.js): those modules build meshes on a WebGL stage and cannot load in node.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SHOP_ASPECT, shopView } from './core/config.js';

const W = 2000, H = 1141;
const SHOT = {                                     // world point: where the screenshot shows it, px
  'back-left corner, chair rail': [[-4.8, 0.9, -3.6], [1130, 268]],
  'back-left corner, floor': [[-4.8, 0, -3.6], [1130, 398]],
  'left window sill': [[-4.8, 0.9, -0.5], [690, 300]],
  'left window head': [[-4.8, 2.1, -0.5], [690, 88]],
  'board top, front end': [[-4.74, 2.36, 2.28], [152, 42]],
  'board top, back end': [[-4.74, 2.36, 0.52], [522, 40]],
  'board foot, front end': [[-4.74, 1.24, 2.28], [185, 285]],
  'board foot, back end': [[-4.74, 1.24, 0.52], [540, 265]],
  'back window x=-3, sill': [[-3, 0.9, -3.6], [1295, 300]],
  'back window x=-3, head': [[-3, 2.1, -3.6], [1300, 88]],
  'back window x=0, sill': [[0, 0.9, -3.6], [1700, 410]],
  'back window x=0, head': [[0, 2.1, -3.6], [1715, 140]],
  'floor lamp foot': [[-4.55, 0, 0.8], [505, 475]],
  guestbook: [[-3, 0.62, 2], [318, 445]],
};

const lens = (aspect) => {
  const cam = new THREE.PerspectiveCamera(35, aspect, 0.01, 200);
  const { target, eye } = shopView(aspect);
  cam.position.set(...eye);
  cam.lookAt(...target);
  cam.updateMatrixWorld();
  return cam;
};

const shot = lens(SHOP_ASPECT);
for (const [name, [p, [x, y]]] of Object.entries(SHOT)) {
  const v = new THREE.Vector3(...p).project(shot), px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H;
  const off = Math.hypot(px - x, py - y);
  assert.ok(off < 30, `${name} is ${off.toFixed(0)}px from where the screenshot has it`);
}
// a portrait phone crops the board's near corner by a hair; the Guestbook is what must show
for (const [aspect, names] of [[16 / 9, ['board top, front end', 'back window x=0, sill']], [4 / 3, ['board top, front end']], [9 / 16, []]]) {
  const cam = lens(aspect);
  for (const name of ['guestbook', 'back-left corner, floor', ...names]) {
    const v = new THREE.Vector3(...SHOT[name][0]).project(cam);
    assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1, `${name} is off screen at ${aspect.toFixed(2)}`);
  }
}
// Between days the Guestbook is what says what to order: the night screen opens it, and the book
// moves into that modal dialog, or it would sit inert behind it.
const night = /<dialog id="night"[\s\S]*?<\/dialog>/.exec(readFileSync(new URL('../game.html', import.meta.url), 'utf8'));
assert.match(night?.[0] ?? '', /<button class="open-book\b/, 'the night screen has no button to open the Guestbook');
assert.match(readFileSync(new URL('ui/book.js', import.meta.url), 'utf8'), /dialog:modal/, 'the Guestbook no longer lifts into an open modal');
// It opens by itself, top right, twice: as day 1 opens on the shop (the Former Owner signs it), and
// every night once the screen is up, so lift() takes it in.
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
assert.match(src('game.js'), /frame: \(\) => \{[^}]*\bopenBook\(\)/, 'day 1 no longer opens on the Guestbook');
assert.match(/function closeForTheNight\(\) \{[\s\S]*?\n\}/.exec(src('ui/night.js'))?.[0] ?? '', /showModal\(\);[\s\S]*\bopenBook\(\)/,
  'the night screen no longer opens the Guestbook (after showModal, so it lifts into the dialog)');
assert.match(/#book \{[^}]*\}/.exec(src('../game.html'))?.[0] ?? '', /var\(--brass\) border-box/, 'the Guestbook lost its brass rim');
console.log('view: the game opens on the screenshot\'s shot of the shop');
