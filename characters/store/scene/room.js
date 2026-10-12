import * as THREE from 'three';
import { ROOM } from '../core/config.js';
import { camera, key, scene } from './stage.js';
import { board, mergeMeshes, woodMesh } from './wood.js';
import { paintWornWood } from './worn-wood.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const roomGroup = new THREE.Group();

const LOOK = {
  plaster: '#b7c09c',
  wainscot: '#eee2c8',
  groove: '#d3c3a3',
  planks: ['#c99a63', '#c2915a', '#cfa46e', '#bb8b56', '#d2a771'],
  seam: '#8a6440',
};

export const WAINSCOT_H = 0.9;

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const PLANK_TILE = 1.6;   // ten 16cm boards per repeat

function paintBoard(ctx, rnd, [x, y, bw, len]) {
  ctx.fillStyle = LOOK.planks[Math.floor(rnd() * LOOK.planks.length)];
  ctx.fillRect(x, y, bw, len);
  ctx.fillStyle = LOOK.seam;
  ctx.globalAlpha = 0.08;
  for (let g = 0; g < 5; g++) ctx.fillRect(x + rnd() * bw, y, 1.5, len);
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x, y, bw, 2);
  ctx.globalAlpha = 1;
}

function paintPlanks(ctx, w, h) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const boards = 10, bw = w / boards;
  for (let b = 0; b < boards; b++) {
    for (let y = -rnd() * h; y < h;) {
      const len = h * (0.35 + rnd() * 0.45);
      paintBoard(ctx, rnd, [b * bw, y, bw, len]);
      y += len;
    }
    ctx.fillStyle = LOOK.seam;
    ctx.fillRect(b * bw, 0, 2, h);
  }
}

const floorTex = canvasTexture(1024, 1024, paintPlanks);
floorTex.repeat.set(ROOM.w / PLANK_TILE, ROOM.d / PLANK_TILE);

export const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 })
);

const WALL_TILE = 0.6;   // six beadboards per repeat

function paintWall(ctx, w, h) {
  const rail = h * (1 - WAINSCOT_H / ROOM.wallH);
  ctx.fillStyle = LOOK.plaster;
  ctx.fillRect(0, 0, w, rail);
  ctx.fillStyle = LOOK.wainscot;
  ctx.fillRect(0, rail, w, h - rail);
  ctx.fillStyle = LOOK.groove;
  for (let b = 0; b < 6; b++) ctx.fillRect((b * w) / 6, rail, 3, h - rail);
}

const wallTex = canvasTexture(256, 1024, paintWall);
wallTex.wrapT = THREE.ClampToEdgeWrapping;

export const UP = new THREE.Vector3(0, 1, 0);

export const walls = [];

const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, side: THREE.DoubleSide });

function worldUVs(geo, along, up) {
  const { position: pos, uv } = geo.attributes;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (along + pos.getX(i)) / WALL_TILE, (up + pos.getY(i)) / ROOM.wallH);
  uv.needsUpdate = true;
}

export function wall([w, h], [x, y, z], ry, along = 0) {
  const geo = new THREE.BoxGeometry(w, h, 0.08);
  worldUVs(geo, along, y);
  const m = new THREE.Mesh(geo, wallMat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  m.castShadow = true;
  const inward = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, ry);
  if (inward.dot(new THREE.Vector3(-x, 0, -z)) < 0) inward.negate();
  m.userData.inward = inward;
  roomGroup.add(m);
  walls.push(m);
  return m;
}

const _toCamera = new THREE.Vector3();

// A hidden mesh casts no shadow, so bakeShadowCasters' stand-in casts for the walls.
export function cullWalls() {
  for (const w of walls) {
    w.visible = _toCamera.subVectors(camera.position, w.position).dot(w.userData.inward) > 0;
  }
}

const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

export const shadowCasters = [];

export const SHADOW_LAYER = 1;

function bakeShadowCasters() {
  roomGroup.updateMatrixWorld(true);
  const parts = [];
  for (const w of walls) {
    w.traverse((n) => {
      if (!(n instanceof THREE.Mesh) || !n.castShadow) return;
      const g = (n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone()).applyMatrix4(n.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      parts.push(g);
      n.castShadow = false;
    });
  }
  const proxy = new THREE.Mesh(mergeGeometries(parts), SHADOW_ONLY);
  proxy.castShadow = true;
  proxy.layers.set(SHADOW_LAYER);
  key.shadow.camera.layers.enable(SHADOW_LAYER);
  roomGroup.add(proxy);
  shadowCasters.push(proxy);
  // The self-checks raycast this before any frame is drawn.
  roomGroup.updateMatrixWorld(true);
}

export const HALF_W = ROOM.w / 2, HALF_D = ROOM.d / 2;


const mat = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.doorW * 0.85, 0.34),
  new THREE.MeshStandardMaterial({ color: '#9a8b74', roughness: 1 })
);

function marker([w, d], [x, z], color, y = 0.005) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.75 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  roomGroup.add(m);
  return m;
}

export const COUNTER = { x: -3.0, z: 2.1, w: 1.4, d: 0.45, h: 0.62 };


export const guestbook = new THREE.Group();

const wornWood = canvasTexture(512, 512, paintWornWood);

const stained = (color, roughness) =>
  new THREE.MeshStandardMaterial({ color, map: wornWood, roughness });

export const woodMat = stained('#d4a575', 0.78);

export const seatMat = stained('#b27c51', 0.72);

const counterMat = stained('#97653f', 0.75);

export const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#eef4f2', transmission: 0.9, roughness: 0.45, thickness: 0.05,
  ior: 1.3, clearcoat: 0.3, side: THREE.DoubleSide, transparent: true,
});

export const GLASS_T = 0.012;

export function clearGroup(group) {
  for (const child of group.children.slice()) {
    child.traverse?.((n) => {
      n.geometry?.dispose();
      // Shared materials are reused every rebuild; per-build ones (makeGridLines) are not.
      if (n.material && ![woodMat, seatMat, glassMat].includes(n.material)) {
        n.material.dispose();
      }
    });
    group.remove(child);
  }
}

function layFloor() {
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);
}

// STORE-SCENE.md §Daylight: window placement and the sun pools.
const SILL = WAINSCOT_H, HEAD = 2.1;
const BULLETIN_AT = -1.4;   // world z = +1.4
const window_ = (at, w = 1.0, bottom = SILL) => ({ at, w, bottom, top: HEAD, window: true });
const RUNS = {
  back:  { len: ROOM.w, at: [0, -HALF_D], ry: 0, openings: [window_(-3.0), window_(0), window_(3.0)] },
  // Run-local X on a side wall is world -Z.
  left:  { len: ROOM.d, at: [-HALF_W, 0], ry: Math.PI / 2, openings: [window_(0.5, 0.8)] },
  right: { len: ROOM.d, at: [HALF_W, 0], ry: Math.PI / 2, openings: [window_(-1.2)] },
  front: { len: ROOM.w, at: [0, HALF_D], ry: 0, openings: [
    window_(-2.8, 1.2, 0.55),
    { at: 0, w: ROOM.doorW, bottom: 0, top: ROOM.doorH, window: false },
    window_(2.8, 1.2, 0.55),
  ] },
};

export const WINDOW_SPOTS = Object.values(RUNS).flatMap((r) => r.openings.filter((o) => o.window)
  .map((o) => (r.ry ? { x: r.at[0], z: -o.at } : { x: o.at, z: r.at[1] })));

const trimMat = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.7 });

function piecesOf(run) {
  const out = [];
  let x = -run.len / 2;
  for (const o of [...run.openings].sort((a, b) => a.at - b.at)) {
    const l = o.at - o.w / 2, r = o.at + o.w / 2;
    if (l > x) out.push([x, l, 0, ROOM.wallH]);
    if (o.bottom > 0) out.push([l, r, 0, o.bottom]);
    if (o.top < ROOM.wallH) out.push([l, r, o.top, ROOM.wallH]);
    x = r;
  }
  if (x < run.len / 2) out.push([x, run.len / 2, 0, ROOM.wallH]);
  return out;
}

function trim(piece, [w, h, depth], [x, y]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), trimMat);
  const side = Math.sign(new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, piece.rotation.y)
    .dot(piece.userData.inward));
  m.position.set(x, y, side * (0.04 + depth / 2));
  m.castShadow = true;
  m.receiveShadow = true;
  piece.add(m);
  return m;
}

function trimPiece(piece, [from, to, bottom, top]) {
  const w = to - from, cy = (bottom + top) / 2;
  if (bottom === 0) trim(piece, [w, 0.1, 0.025], [0, 0.05 - cy]);
  if (bottom < WAINSCOT_H && top > WAINSCOT_H) trim(piece, [w, 0.045, 0.035], [0, WAINSCOT_H - cy]);
}

function frameOpening(host, hostCentre, o) {
  const x = o.at - hostCentre[0], cy = (hostCentre[1] + hostCentre[2]) / 2;
  const b = o.bottom - cy, t = o.top - cy, half = o.w / 2, c = 0.07;
  trim(host, [c, o.top - o.bottom + c, 0.02], [x - half - c / 2, (b + t) / 2 + c / 2]);
  trim(host, [c, o.top - o.bottom + c, 0.02], [x + half + c / 2, (b + t) / 2 + c / 2]);
  trim(host, [o.w + c * 2, c, 0.02], [x, t + c / 2]);
  if (!o.window) return;
  trim(host, [o.w + c * 2.6, 0.035, 0.11], [x, b - 0.0175]);
  const bar = (w, h, y) => {
    const m = trim(host, [w, h, 0.03], [x, y]);
    m.position.z = 0;
  };
  bar(0.03, o.top - o.bottom, (b + t) / 2);
  bar(o.w, 0.03, b + (t - b) * 0.62);
}

function raiseRun(run) {
  const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, run.ry);
  const pieces = piecesOf(run).map((p) => {
    const [from, to, bottom, top] = p;
    const mid = (from + to) / 2;
    const piece = wall([to - from, top - bottom],
      [run.at[0] + along.x * mid, (bottom + top) / 2, run.at[1] + along.z * mid], run.ry, mid);
    piece.userData.span = p;
    trimPiece(piece, p);
    return piece;
  });
  for (const o of run.openings) {
    const host = pieces.find(({ userData: { span: [f, t, bt] } }) =>
      f <= o.at && o.at <= t && (o.bottom > 0 ? bt === 0 : bt > 0));
    const [f, t, bt, tp] = host.userData.span;
    frameOpening(host, [(f + t) / 2, bt, tp], o);
  }
  for (const piece of pieces) mergeMeshes(piece, (n) => n.material === trimMat && n.parent === piece);
  return pieces;
}

const fullPieceAt = (pieces, x) => pieces.find(({ userData: { span: [f, t, b, tp] } }) =>
  f <= x && x <= t && b === 0 && tp === ROOM.wallH);

function raiseWalls() {
  raiseRun(RUNS.back);
  raiseRun(RUNS.right);
  raiseRun(RUNS.front);
  hangBulletin(fullPieceAt(raiseRun(RUNS.left), BULLETIN_AT));
}

function buildCounter() {
  const { w, d, h } = COUNTER, bodyH = h - 0.05 - 0.06;
  const front = -d / 2 - 0.006;
  const pw = (w - 0.12) / 3 - 0.04, ph = bodyH - 0.12, py = 0.06 + bodyH / 2;
  const body = woodMesh([
    [board(w - 0.06, 0.06, d - 0.06, 0.006), [0, 0.03, 0]],
    [board(w, bodyH, d, 0.012), [0, 0.06 + bodyH / 2, 0]],
    ...[-1, 0, 1].map((i) => [board(pw, ph, 0.016, 0.006), [i * (pw + 0.04), py, front]]),
    ...[-1, 1].map((s) => [board(0.016, ph, d - 0.12, 0.006), [s * (w / 2 + 0.006), py, 0]]),
  ], counterMat);
  const top = woodMesh([
    [board(w + 0.08, 0.035, d + 0.08, 0.014), [0, h - 0.0175, 0]],
    [board(w + 0.04, 0.016, d + 0.04, 0.006), [0, h - 0.043, 0]],
  ], woodMat);
  body.position.set(COUNTER.x, 0, COUNTER.z);
  top.position.set(COUNTER.x, 0, COUNTER.z);
  roomGroup.add(body, top);
}

function placeFixtures() {
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.004, HALF_D - 0.22);
  roomGroup.add(mat);
  buildCounter();
  marker([0.9, 0.7], [-3.0, 1.55], '#c9a24a');      // signing spot
  marker([1.0, 1.0], [3.85, 1.9], '#7f9ec2');        // Drop Off
}

function guestbookPages() {
  const paper = new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.95 });
  for (const side of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.24), paper);
    page.position.set(side * 0.085, 0.025, 0);
    page.rotation.z = side * -0.06;
    guestbook.add(page);
  }
  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.004, 0.2),
    new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.6 }));
  ribbon.position.set(0.03, 0.034, 0.03);
  guestbook.add(ribbon);
}

function buildGuestbook() {
  guestbook.position.set(-3.0, 0.62, 2.0);
  guestbook.rotation.y = 0.12;
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.035, 0.26),
    new THREE.MeshStandardMaterial({ color: '#7a3b3b', roughness: 0.7 }));
  cover.castShadow = true;
  guestbook.add(cover);
  guestbookPages();
  roomGroup.add(guestbook);
}

export const bulletin = new THREE.Group();
export const boardFace = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.7),
  new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.95 }));

function hangBulletin(piece) {
  // Wall-local: x along the wall (world -z), z into the room, relative to this piece's centre.
  const [from, to] = piece.userData.span;
  bulletin.scale.setScalar(1.6);   // STORE-SCENE.md §Room
  bulletin.position.set(BULLETIN_AT - (from + to) / 2, 1.8 - ROOM.wallH / 2, 0.06);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.78, 0.03), woodMat);
  boardFace.position.z = 0.016;
  bulletin.add(frame, boardFace);
  piece.add(bulletin);
}

export function buildRoomShell() {
  scene.add(roomGroup);
  layFloor();
  raiseWalls();
  placeFixtures();
  buildGuestbook();
  bakeShadowCasters();
}
