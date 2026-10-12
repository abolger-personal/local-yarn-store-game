import * as THREE from 'three';
import { shop } from '../core/state.js';
import { boardFace } from '../scene/room.js';
import { photoFor } from './photo.js';
import { openBook, showPhoto } from './book.js';
import { drawLettering } from './lettering.js';

const W = 880, H = 560;          // 800px a metre, the board's 1.1 x 0.7
const PINNED = 4;
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;

const CARD_W = 190, CARD_H = 270, CARD_TOP = 90;
const cardX = (i) => 18 + i * 214;

let pinned = [];

function newestPhotos() {
  const all = [...shop.pastBooks.flatMap((b) => b.entries), ...(shop.world?.guestbook ?? [])];
  // TUTORIAL.md day 3
  return all.filter((g) => g.kind === 'photo' && !g.farewell).slice(-PINNED).reverse();
}

function load(url) {
  const img = new Image();
  img.src = url ?? '';
  return img.decode().then(() => img, () => null);
}

function cork() {
  ctx.fillStyle = '#c49a6c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(90, 55, 25, .18)';
  for (let i = 0; i < 900; i++) ctx.fillRect(((i * 7919) % W), ((i * 104729) % H), 3, 3);
  drawLettering(ctx, 'CUSTOMER OF THE WEEK', W / 2, 62, { cap: 34, gold: true, maxWidth: W - 60 });
}

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

function caption(g, cw, ch) {
  drawLettering(ctx, g.npc.toUpperCase(), 0, ch / 2 - 28, { cap: 15, maxWidth: cw - 16 });
  drawLettering(ctx, (g.object ?? '').split(' — ')[0].toUpperCase(), 0, ch / 2 - 9, { cap: 10, maxWidth: cw - 16 });
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(0, -ch / 2 + 4, 8, 0, Math.PI * 2);
  ctx.fill();
}

function paint(entries, imgs) {
  cork();
  if (!entries.length) {
    drawLettering(ctx, 'NO PHOTOS YET', W / 2, H / 2 + 20, { cap: 20 });
  }
  entries.forEach((g, i) => polaroid(imgs[i], g, cardX(i), ((i % 2) * 2 - 1) * 0.045));
  texture.needsUpdate = true;
}

export function drawBoard() {
  if (shop.press?.on === 'board') pressBoard();
  const now = newestPhotos();
  if (now.length === pinned.length && now.every((g, i) => g === pinned[i])) return;
  pinned = now;
  Promise.all(now.map((g) => load(photoFor(g)))).then((imgs) => {
    if (pinned === now) paint(now, imgs);
  });
}

function pressBoard() {
  const { uv } = shop.press;
  shop.press = null;
  const x = uv.x * W, y = (1 - uv.y) * H;
  const g = pinned.find((_, i) => x >= cardX(i) && x <= cardX(i) + CARD_W && y >= CARD_TOP && y <= CARD_TOP + CARD_H);
  if (g) showPhoto(g);
  else openBook();
}

export function installBoard() {
  boardFace.material.map = texture;
  boardFace.material.color.set('#ffffff');
  boardFace.material.needsUpdate = true;
  paint([], []);
}
