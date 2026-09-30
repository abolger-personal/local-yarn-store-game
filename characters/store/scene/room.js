// The room shell — floor, walls, counter, guestbook — and the shared furniture materials.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import * as THREE from 'three';
import { ROOM } from '../core/config.js';
import { camera, scene } from './stage.js';

// ---------------------------------------------------------------- the room shell
//
// TODO: this is a blockout, not the shop. DESIGN-DECISIONS.md wants a static room shell with baked
// AO and no real-time shadow map at all. Walls are boxes and the door is a gap between two of them.
export const roomGroup = new THREE.Group();

export const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshStandardMaterial({ color: '#cbbfa9', roughness: 0.96 })
);

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

const wallMat = new THREE.MeshStandardMaterial({ color: '#ded4c2', roughness: 0.95, side: THREE.DoubleSide });

export function wall([w, h], [x, y, z], ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), wallMat);
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
 * Hide the walls the camera is outside of. `castShadow` follows `visible`, or a wall you cannot
 * see still throws a hard shadow across the shop and the cutaway reads as a lighting bug.
 */
export function cullWalls() {
  for (const w of walls) {
    const inside = _toCamera.subVectors(camera.position, w.position).dot(w.userData.inward) > 0;
    w.visible = inside;
    w.castShadow = inside;
  }
}

export const HALF_W = ROOM.w / 2, HALF_D = ROOM.d / 2;

// front wall, split around the doorway
const sideW = (ROOM.w - ROOM.doorW) / 2;

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
export const COUNTER = { x: -2.1, z: 1.7, w: 1.4, d: 0.45, h: 0.62 };

const counter = new THREE.Mesh(
  new THREE.BoxGeometry(COUNTER.w, COUNTER.h, COUNTER.d),
  new THREE.MeshStandardMaterial({ color: '#a98f6d', roughness: 0.9 })
);

// The Guestbook itself — an open book lying on the counter. Still a blockout (LYS.md 5c wants a
// real object NPCs animate against) but the counter should not be bare, because the signing is
// the emotional payoff of the whole loop and it needs somewhere to happen.
export const guestbook = new THREE.Group();

// ---------------------------------------------------------------- shared furniture materials
export const woodMat = new THREE.MeshStandardMaterial({ color: '#b59a76', roughness: 0.9 });

export const seatMat = new THREE.MeshStandardMaterial({ color: '#8f7f66', roughness: 0.85 });

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
      if (n.material && n.material !== woodMat && n.material !== seatMat && n.material !== glassMat) {
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

/** Four walls, with the front one split around the doorway and a lintel over it. */
function raiseWalls() {
  wall([ROOM.w, ROOM.wallH], [0, ROOM.wallH / 2, -HALF_D], 0);                    // back
  wall([ROOM.d, ROOM.wallH], [-HALF_W, ROOM.wallH / 2, 0], Math.PI / 2);          // left
  wall([ROOM.d, ROOM.wallH], [HALF_W, ROOM.wallH / 2, 0], Math.PI / 2);           // right
  wall([sideW, ROOM.wallH], [-(ROOM.doorW / 2 + sideW / 2), ROOM.wallH / 2, HALF_D], 0);
  wall([sideW, ROOM.wallH], [(ROOM.doorW / 2 + sideW / 2), ROOM.wallH / 2, HALF_D], 0);
  wall([ROOM.doorW, ROOM.wallH - ROOM.doorH],
       [0, ROOM.wallH - (ROOM.wallH - ROOM.doorH) / 2, HALF_D], 0);           // lintel
}

/** The doormat, the counter, and the two floor markers. Places you can see, not mechanics. */
function placeFixtures() {
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.004, HALF_D - 0.22);
  roomGroup.add(mat);
  counter.position.set(COUNTER.x, COUNTER.h / 2, COUNTER.z);
  counter.castShadow = true;
  counter.receiveShadow = true;
  roomGroup.add(counter);
  marker([0.9, 0.7], [-2.1, 1.15], '#c9a24a');      // where an NPC stands to sign
  marker([1.0, 1.0], [2.2, 1.7], '#7f9ec2');        // the Drop Off floor display
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
  guestbook.position.set(-2.1, 0.62, 1.6);
  guestbook.rotation.y = 0.12;
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.035, 0.26),
    new THREE.MeshStandardMaterial({ color: '#7a3b3b', roughness: 0.7 }));
  cover.castShadow = true;
  guestbook.add(cover);
  guestbookPages();
  roomGroup.add(guestbook);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function buildRoomShell() {
  scene.add(roomGroup);
  layFloor();
  raiseWalls();
  placeFixtures();
  buildGuestbook();
}
