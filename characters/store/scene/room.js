// The room shell — floor, walls, counter, guestbook — and the shared furniture materials.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import * as THREE from 'three';
import { ROOM } from '../core/config.js';
import { camera, key, scene } from './stage.js';
import { board, mergeMeshes, woodMesh } from './wood.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- the room shell
//
// TODO: this is a blockout, not the shop. DESIGN-DECISIONS.md wants a static room shell with baked
// AO and no real-time shadow map at all. Walls are boxes and the door is a gap between two of them.
export const roomGroup = new THREE.Group();

// ---------------------------------------------------------------- surfaces
//
// The shop is cosy by its BUILDING, not its decor: decor is what finished objects become, so the
// base room gets warm materials and good light and nothing on the walls or floor that a knitted
// thing should be standing in for later. Painted canvases rather than image files, so there is no
// asset to load and the colours below are the whole of the look — and the first thing a player
// personalising their shop would want to change.
const LOOK = {
  plaster: '#b7c09c',     // upper wall: soft sage
  wainscot: '#eee2c8',    // lower wall: painted tongue-and-groove, cream
  groove: '#d3c3a3',
  planks: ['#c99a63', '#c2915a', '#cfa46e', '#bb8b56', '#d2a771'],   // honey oak
  seam: '#8a6440',
};

export const WAINSCOT_H = 0.9;   // the chair rail; window sills sit on it

/** A canvas, painted by `paint`, as a repeating colour texture. */
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

const PLANK_TILE = 1.6;   // metres of floor one texture repeat covers: ten 16cm boards

/** One board from `y` down the canvas, `len` long, with a little grain and a dark end joint. */
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

/** Boards running front to back, staggered end joints. Seeded, so it is the same floor every load. */
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
    ctx.fillRect(b * bw, 0, 2, h);               // long seam
  }
}

const floorTex = canvasTexture(1024, 1024, paintPlanks);
floorTex.repeat.set(ROOM.w / PLANK_TILE, ROOM.d / PLANK_TILE);

export const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 })
);

const WALL_TILE = 0.6;   // metres along the wall per texture repeat: six beadboards

/**
 * The wall from floor to ceiling in V, and one repeat along it in U: tongue-and-groove up to the
 * chair rail, plaster above. V is absolute height (see worldUVs), so a short wall segment under a
 * window shows the boards and a lintel shows plaster, with no per-segment texture.
 */
function paintWall(ctx, w, h) {
  const rail = h * (1 - WAINSCOT_H / ROOM.wallH);   // canvas y runs down
  ctx.fillStyle = LOOK.plaster;
  ctx.fillRect(0, 0, w, rail);
  ctx.fillStyle = LOOK.wainscot;
  ctx.fillRect(0, rail, w, h - rail);
  ctx.fillStyle = LOOK.groove;
  for (let b = 0; b < 6; b++) ctx.fillRect((b * w) / 6, rail, 3, h - rail);
}

const wallTex = canvasTexture(256, 1024, paintWall);
wallTex.wrapT = THREE.ClampToEdgeWrapping;

// You must never see the OUTSIDE of a wall. The room is an interior, and a diorama you can orbit
// around the back of stops reading as one. Two halves to that, and both are needed:
//
//   1. Any wall between the camera and the room is hidden (this function plus cullWalls). Standard
//      Sims / Two Point cutaway: the near walls vanish, the far walls stay, so you are always
//      looking INTO a room rather than at a box.
//   2. The camera is fenced in (see controls below) so it can never drop under the floor, where
//      hidden near walls would leave you staring at the underside of everything.
//
// A wall knows which way is "in". That is the whole trick — visible when the camera is on its
// inward side, hidden when it is not.
export const UP = new THREE.Vector3(0, 1, 0);

export const walls = [];

const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, side: THREE.DoubleSide });

/**
 * UVs from where the vertex actually is: U is metres along the wall over WALL_TILE, V is height
 * over the wall height. `along`/`up` are the segment centre's own position along and up the wall.
 */
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
  // local +Z turned by the wall's yaw, then flipped if it points away from the room's centre
  const inward = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, ry);
  if (inward.dot(new THREE.Vector3(-x, 0, -z)) < 0) inward.negate();
  m.userData.inward = inward;
  roomGroup.add(m);
  walls.push(m);
  return m;
}

const _toCamera = new THREE.Vector3();

/**
 * Hide the walls the camera is outside of. Their SHADOWS stay: the sun comes in through the
 * windows, so the walls' shade is most of the afternoon's look, and it must not change as the
 * camera orbits. A hidden mesh casts nothing in three.js, so the casting is done by stand-ins that
 * are never hidden — see bakeShadowCasters.
 */
export function cullWalls() {
  for (const w of walls) {
    w.visible = _toCamera.subVectors(camera.position, w.position).dot(w.userData.inward) > 0;
  }
}

// Draws no colour and no depth, so only the shadow pass sees it.
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/**
 * Hand every wall's shadow-casting over to an invisible stand-in that the cutaway never hides. The
 * shell is static, so each stand-in is pinned at its wall's world matrix once and never updated.
 * Run after everything that hangs on a wall has been hung.
 */
export const shadowCasters = [];

/**
 * The layer only the sun's shadow camera renders. The stand-in draws no colour, but on the main
 * camera's layer it would still be a draw call in the colour pass every frame, for nothing.
 */
export const SHADOW_LAYER = 1;

/**
 * ONE stand-in for the whole shell: every wall piece and its trim, merged in world space. The shell
 * never moves, so this is built once, and the walls' shadow costs one draw in the shadow pass —
 * not one per wall piece, rail and glazing bar.
 */
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
  // Now, not at the first render: the self-checks raycast this before any frame is drawn.
  roomGroup.updateMatrixWorld(true);
}

export const HALF_W = ROOM.w / 2, HALF_D = ROOM.d / 2;


// A doormat, purely so "the door" is a place you can see rather than a coordinate in a debug panel.
const mat = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.doorW * 0.85, 0.34),
  new THREE.MeshStandardMaterial({ color: '#9a8b74', roughness: 1 })
);

// The counter (Guestbook lives on it) and the Drop Off floor area. Both are markers, not mechanics.
// TODO: the Guestbook and the Drop Off floor display are real diegetic objects per LYS.md 5c —
// signing and lending are logged to the console today and drawn as coloured rectangles.
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

// One source of truth for the counter's footprint: the mesh below and the slot mask both read it,
// so moving the counter cannot leave displays generating slots inside it.
export const COUNTER = { x: -3.0, z: 2.1, w: 1.4, d: 0.45, h: 0.62 };


// The Guestbook itself — an open book lying on the counter. Still a blockout (LYS.md 5c wants a
// real object NPCs animate against) but the counter should not be bare, because the signing is
// the emotional payoff of the whole loop and it needs somewhere to happen.
export const guestbook = new THREE.Group();

// ---------------------------------------------------------------- shared furniture materials
//
// Worn wood. The shop is not new: the furniture has been sat on, knitted at and had needles
// dropped on it, so the one wood texture every piece shares carries the grain, a couple of knots,
// rubbed-pale patches, dents, and the scratches crafting leaves. Painted near-white and TINTED by
// each material's colour, so the honey tables, the darker chairs and the walnut counter are all
// the same battered wood in different stains.

/** A random number source seeded once, so the scratches are the same scratches every load. */
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Long wavy grain lines down the canvas — V is along the grain (see woodUVs). */
function paintGrain(ctx, rnd, w, h) {
  ctx.strokeStyle = '#7a5a3c';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    ctx.lineWidth = 0.6 + rnd() * 1.8;
    const x0 = rnd() * w, wave = 2 + rnd() * 6, period = 60 + rnd() * 140;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 8) ctx.lineTo(x0 + Math.sin(y / period + i) * wave, y);
    ctx.stroke();
  }
}

/** Two knots, each a dark heart and a few rings the grain bends round. */
function paintKnots(ctx, rnd, w, h) {
  for (let k = 0; k < 2; k++) {
    const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * 6;
    ctx.fillStyle = '#5e4128';
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.6, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a5a3c';
    for (let ring = 1; ring < 4; ring++) {
      ctx.globalAlpha = 0.25 / ring;
      ctx.beginPath(); ctx.ellipse(x, y, r * (0.6 + ring * 0.7), r * (1 + ring * 1.4), 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

/** Use: pale rubbed patches and dents. */
function paintWear(ctx, rnd, w, h) {
  for (let i = 0; i < 6; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,248,236,0.22)');
    g.addColorStop(1, 'rgba(255,248,236,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = '#4e3622';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.15 + rnd() * 0.2;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Needle and scissor scratches: short, mostly across the grain, most of them pale fresh wood. */
function paintScratches(ctx, rnd, w, h) {
  for (let i = 0; i < 90; i++) {
    const pale = rnd() < 0.65, x = rnd() * w, y = rnd() * h;
    const a = Math.PI / 2 + (rnd() - 0.5) * 1.6, len = 6 + rnd() * 28;
    ctx.strokeStyle = pale ? '#fff7ea' : '#4e3622';
    ctx.globalAlpha = pale ? 0.35 + rnd() * 0.35 : 0.12 + rnd() * 0.15;
    ctx.lineWidth = 0.5 + rnd();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
}

function paintWornWood(ctx, w, h) {
  const rnd = seeded(29);
  ctx.fillStyle = '#ebe3d6';
  ctx.fillRect(0, 0, w, h);
  paintGrain(ctx, rnd, w, h);
  paintKnots(ctx, rnd, w, h);
  paintWear(ctx, rnd, w, h);
  paintScratches(ctx, rnd, w, h);
  ctx.globalAlpha = 1;
}

const wornWood = canvasTexture(512, 512, paintWornWood);

const stained = (color, roughness) =>
  new THREE.MeshStandardMaterial({ color, map: wornWood, roughness });

export const woodMat = stained('#d4a575', 0.78);   // honey: tables, shelves, counter top

export const seatMat = stained('#b27c51', 0.72);   // a darker stain: the chairs

const counterMat = stained('#97653f', 0.75);      // walnut: the counter's body

export const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#eef4f2', transmission: 0.9, roughness: 0.45, thickness: 0.05,
  ior: 1.3, clearcoat: 0.3, side: THREE.DoubleSide, transparent: true,
});

export const GLASS_T = 0.012;

/** Empty a group and free what it owns. Shared materials are left alone; per-build ones are not. */
export function clearGroup(group) {
  for (const child of group.children.slice()) {   // a copy: removing while iterating skips
    child.traverse?.((n) => {
      n.geometry?.dispose();
      // makeGridLines mints a material per call, so it has to go too. The shared furniture
      // materials above are reused every rebuild and must NOT be disposed.
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

// ---------------------------------------------------------------- walls, windows, trim
//
// Each wall is a run along its own local X with OPENINGS cut in it: `at` is the opening's centre
// along the run, from the run's middle. A wall with holes is built as the solid pieces between
// them — full-height pieces between openings, and a piece below and above each one — and every
// piece is an ordinary wall() so the cutaway treats it like any other.
//
// The windows are where the sun comes in (see applyDaylight in stage.js): the back and right ones
// catch the afternoon, the left one the morning. They are kept clear of the authored furniture and
// of the bulletin board. Furniture can still be pushed in front of one; that is the player's call.
//
// Three back windows on the long back wall, with shelf-n and a pot in the two piers between them.
// The afternoon sun is low, so each window's pool lands 1-2.5 further toward the door and about a
// metre to its left: the three pools fall on the open floor between the reading corner, table-a
// and the front tables. Moving a window moves its pool — scratchpad/layout-probe.mjs measures how
// much of the afternoon sun lands under furniture (2% for this layout, 16% for the old 6.4 room).
const SILL = WAINSCOT_H, HEAD = 2.1;
const BULLETIN_AT = -1.4;   // along the left wall's run, i.e. world z = +1.4 (see hangBulletin)
const window_ = (at, w = 1.0, bottom = SILL) => ({ at, w, bottom, top: HEAD, window: true });
const RUNS = {
  back:  { len: ROOM.w, at: [0, -HALF_D], ry: 0, openings: [window_(-3.0), window_(0), window_(3.0)] },
  // Run-local X on a side wall is world -Z (rotation.y = π/2), so `at` is minus the world z.
  left:  { len: ROOM.d, at: [-HALF_W, 0], ry: Math.PI / 2, openings: [window_(0.5, 0.8)] },
  right: { len: ROOM.d, at: [HALF_W, 0], ry: Math.PI / 2, openings: [window_(-1.2)] },
  // The shop front: the door, and a low display window either side of it.
  front: { len: ROOM.w, at: [0, HALF_D], ry: 0, openings: [
    window_(-2.8, 1.2, 0.55),
    { at: 0, w: ROOM.doorW, bottom: 0, top: ROOM.doorH, window: false },
    window_(2.8, 1.2, 0.55),
  ] },
};

const trimMat = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.7 });

/** One run's solid pieces, as [from, to, bottom, top] in run-local X and height. */
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

/** A trim board on a wall piece's room face, in the piece's own frame. */
function trim(piece, [w, h, depth], [x, y]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), trimMat);
  // Local +Z of the piece may point out of the room; the inward normal says which side is in.
  const side = Math.sign(new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, piece.rotation.y)
    .dot(piece.userData.inward));
  m.position.set(x, y, side * (0.04 + depth / 2));
  m.castShadow = true;
  m.receiveShadow = true;
  piece.add(m);
  return m;
}

/** Baseboard and chair rail along one solid piece, where its height range reaches them. */
function trimPiece(piece, [from, to, bottom, top]) {
  const w = to - from, cy = (bottom + top) / 2;
  if (bottom === 0) trim(piece, [w, 0.1, 0.025], [0, 0.05 - cy]);
  if (bottom < WAINSCOT_H && top > WAINSCOT_H) trim(piece, [w, 0.045, 0.035], [0, WAINSCOT_H - cy]);
}

/**
 * Casing round an opening, a sill under a window, and a cross of glazing bars in it — the bars are
 * thin enough to read as a window and to throw a cross into the sun pool on the floor. Hung on the
 * piece below the opening (above, for the door), so the cutaway takes the frame with its wall.
 */
function frameOpening(host, hostCentre, o) {
  const x = o.at - hostCentre[0], cy = (hostCentre[1] + hostCentre[2]) / 2;
  const b = o.bottom - cy, t = o.top - cy, half = o.w / 2, c = 0.07;
  trim(host, [c, o.top - o.bottom + c, 0.02], [x - half - c / 2, (b + t) / 2 + c / 2]);
  trim(host, [c, o.top - o.bottom + c, 0.02], [x + half + c / 2, (b + t) / 2 + c / 2]);
  trim(host, [o.w + c * 2, c, 0.02], [x, t + c / 2]);
  if (!o.window) return;
  trim(host, [o.w + c * 2.6, 0.035, 0.11], [x, b - 0.0175]);                       // sill
  const bar = (w, h, y) => {
    const m = trim(host, [w, h, 0.03], [x, y]);
    m.position.z = 0;                                                               // in the opening
  };
  bar(0.03, o.top - o.bottom, (b + t) / 2);
  bar(o.w, 0.03, b + (t - b) * 0.62);
}

/** One wall run: its pieces, their trim, and the frames round its openings. Returns the pieces. */
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
  // A piece's rails, casing, sill and glazing bars as one mesh: still its child, so the cutaway
  // hides them with it, but one draw call rather than up to eight.
  for (const piece of pieces) mergeMeshes(piece, (n) => n.material === trimMat && n.parent === piece);
  return pieces;
}

/** The wall piece of `pieces` that runs over run-local `x` at full height. */
const fullPieceAt = (pieces, x) => pieces.find(({ userData: { span: [f, t, b, tp] } }) =>
  f <= x && x <= t && b === 0 && tp === ROOM.wallH);

/** Four walls, with their windows, the doorway, and the trim. */
function raiseWalls() {
  raiseRun(RUNS.back);
  raiseRun(RUNS.right);
  raiseRun(RUNS.front);
  hangBulletin(fullPieceAt(raiseRun(RUNS.left), BULLETIN_AT));
}

/**
 * A shop counter in the farmhouse way: a recessed kick at the floor, a walnut body with three
 * raised panels on the customer's side and one on each end, and a honey top with a rounded,
 * stepped edge and a little overhang. Two meshes — one per stain.
 */
function buildCounter() {
  const { w, d, h } = COUNTER, bodyH = h - 0.05 - 0.06;
  const front = -d / 2 - 0.006;                           // the face toward the shop floor
  const pw = (w - 0.12) / 3 - 0.04, ph = bodyH - 0.12, py = 0.06 + bodyH / 2;
  const body = woodMesh([
    [board(w - 0.06, 0.06, d - 0.06, 0.006), [0, 0.03, 0]],                   // kick
    [board(w, bodyH, d, 0.012), [0, 0.06 + bodyH / 2, 0]],
    ...[-1, 0, 1].map((i) => [board(pw, ph, 0.016, 0.006), [i * (pw + 0.04), py, front]]),
    ...[-1, 1].map((s) => [board(0.016, ph, d - 0.12, 0.006), [s * (w / 2 + 0.006), py, 0]]),
  ], counterMat);
  const top = woodMesh([
    [board(w + 0.08, 0.035, d + 0.08, 0.014), [0, h - 0.0175, 0]],
    [board(w + 0.04, 0.016, d + 0.04, 0.006), [0, h - 0.043, 0]],           // the step under it
  ], woodMat);
  body.position.set(COUNTER.x, 0, COUNTER.z);
  top.position.set(COUNTER.x, 0, COUNTER.z);
  roomGroup.add(body, top);
}

/** The doormat, the counter, and the two floor markers. Places you can see, not mechanics. */
function placeFixtures() {
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.004, HALF_D - 0.22);
  roomGroup.add(mat);
  buildCounter();
  marker([0.9, 0.7], [-3.0, 1.55], '#c9a24a');      // where an NPC stands to sign
  marker([1.0, 1.0], [3.85, 1.9], '#7f9ec2');        // the Drop Off floor display
}

/**
 * An open book lying on the counter.
 *
 * Still a blockout (LYS.md 5c wants a real object NPCs animate against) but the counter should
 * not be bare: the signing is the emotional payoff of the whole loop and it needs somewhere to
 * happen.
 */
/** Two pages, tented slightly open down the spine, plus a ribbon marker. */
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

/**
 * The bulletin board (LYS.md 5c): "Customer of the Week", with their photos pinned up. Hung ON the
 * left wall, as its child, so the cutaway that hides the wall hides the board with it. It sits over
 * the spot where NPCs stand to sign, high enough to clear a peg board below it. Blank cork here;
 * ui/board.js paints the photos onto `boardFace`.
 */
export const bulletin = new THREE.Group();
export const boardFace = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.7),
  new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.95 }));

function hangBulletin(piece) {
  // Wall-local: x runs along the wall (world -z), z points into the room. The piece is one segment
  // of the left wall, so the board is placed relative to that segment's own centre.
  // Scaled up whole (face, frame and depth) so the photos read from the default camera: the board
  // is 1.76 x 1.12m, spanning 1.24-2.36m up a 2.6m wall.
  const [from, to] = piece.userData.span;
  bulletin.scale.setScalar(1.6);
  bulletin.position.set(BULLETIN_AT - (from + to) / 2, 1.8 - ROOM.wallH / 2, 0.06);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.78, 0.03), woodMat);
  boardFace.position.z = 0.016;
  bulletin.add(frame, boardFace);
  piece.add(bulletin);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function buildRoomShell() {
  scene.add(roomGroup);
  layFloor();
  raiseWalls();
  placeFixtures();
  buildGuestbook();
  bakeShadowCasters();
}
