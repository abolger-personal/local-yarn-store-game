// The bulletin board's face: "Customer of the Week", with the newest selfies pinned up (LYS.md 5c).
//
// The board itself is scene geometry (room.js). This paints a canvas onto it, because a photo is a
// picture and the board is the one place in the shop it is shown without opening anything.

import * as THREE from 'three';
import { shop } from '../core/state.js';
import { boardFace } from '../scene/room.js';
import { photoFor } from './photo.js';
import { openBook, showPhoto } from './book.js';

const W = 880, H = 560;          // 800px a metre, the board's 1.1 x 0.7
const PINNED = 4;
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;

// Where the polaroids go, in canvas pixels: shared by the painting and by a press on the board.
const CARD_W = 190, CARD_H = 270, CARD_TOP = 90;
const cardX = (i) => 18 + i * 214;

let pinned = [];                  // the entries on the board now, newest first

/** The newest photo entries from every day, newest first. */
function newestPhotos() {
  const all = [...shop.pastBooks.flatMap((b) => b.entries), ...(shop.world?.guestbook ?? [])];
  return all.filter((g) => g.kind === 'photo').slice(-PINNED).reverse();
}

function load(url) {
  const img = new Image();
  img.src = url ?? '';
  return img.decode().then(() => img, () => null);   // no photo: an empty card, not a broken board
}

function cork() {
  ctx.fillStyle = '#c49a6c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(90, 55, 25, .18)';
  for (let i = 0; i < 900; i++) ctx.fillRect(((i * 7919) % W), ((i * 104729) % H), 3, 3);   // flecks
  ctx.fillStyle = '#3b2a1c';
  ctx.font = 'italic 700 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Customer of the Week', W / 2, 54);
}

/** One polaroid, pinned, tilted a little: the photo above, who and what below. */
function polaroid(img, g, x, tilt) {
  const cw = CARD_W, ch = CARD_H, pw = 170, ph = 212;
  ctx.save();
  ctx.translate(x + cw / 2, CARD_TOP + ch / 2);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(-cw / 2 + 5, -ch / 2 + 6, cw, ch);
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  if (img) ctx.drawImage(img, -pw / 2, -ch / 2 + 10, pw, ph);
  caption(g, cw, ch);
  ctx.restore();
}

/** Who and what under the photo, and the pin through the top. */
function caption(g, cw, ch) {
  ctx.fillStyle = '#3b2a1c';
  ctx.font = '20px Georgia, serif';
  ctx.fillText(g.npc, 0, ch / 2 - 30, cw - 16);
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText(g.object, 0, ch / 2 - 10, cw - 16);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(0, -ch / 2 + 4, 8, 0, Math.PI * 2);
  ctx.fill();
}

function paint(entries, imgs) {
  cork();
  if (!entries.length) {
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillText('no photos yet', W / 2, H / 2 + 20);
  }
  entries.forEach((g, i) => polaroid(imgs[i], g, cardX(i), ((i % 2) * 2 - 1) * 0.045));
  texture.needsUpdate = true;
}

/**
 * Repin if the newest photos changed. Called with every HUD repaint, so it is cheap when they have
 * not; a new selfie is rendered the moment it lands on the board, about 20ms once each.
 */
export function drawBoard() {
  if (shop.press?.on === 'board') pressBoard();
  const now = newestPhotos();
  if (now.length === pinned.length && now.every((g, i) => g === pinned[i])) return;
  pinned = now;
  Promise.all(now.map((g) => load(photoFor(g)))).then((imgs) => {
    if (pinned === now) paint(now, imgs);   // a newer repin got there first: let it paint
  });
}

/**
 * A press on the board: the polaroid under it opens its photo, anywhere else opens the book. `uv`
 * is where the ray hit the face; the canvas runs top-down, so v flips. The cards' few degrees of
 * tilt are ignored: their upright rectangles cover them to within a few pixels.
 */
function pressBoard() {
  const { uv } = shop.press;
  shop.press = null;
  const x = uv.x * W, y = (1 - uv.y) * H;
  const g = pinned.find((_, i) => x >= cardX(i) && x <= cardX(i) + CARD_W && y >= CARD_TOP && y <= CARD_TOP + CARD_H);
  if (g) showPhoto(g);
  else openBook();
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installBoard() {
  boardFace.material.map = texture;
  boardFace.material.color.set('#ffffff');
  boardFace.material.needsUpdate = true;
  paint([], []);
}
