// Chairs: the third kind of place an NPC walks to.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { seats } from '../core/state.js';
import * as THREE from 'three';
import { SEAT_H } from '../core/config.js';
import { clearGroup, roomGroup, seatMat } from './room.js';

// ---------------------------------------------------------------- seating
//
// A chair is the third kind of place an NPC walks to and occupies, after a display's standing spot
// and the Guestbook counter. Working on a WIP now requires one — an NPC standing in the middle of
// the floor knitting looked like a bug, and parking them in front of a display blocked it.
// TODO: a cube. Wants to be an actual chair, and probably a small table with it.
//
// A pool of positions rather than a fixed pair: the chair COUNT is a live control, so the layout
// has to be authored for the largest case and taken from the front. Same pattern as the displays.
export const CHAIR_W = 0.34;

export const SEAT_SLOTS = [
  { id: 'chair-a', x: -1.75, z: -0.55, facing: Math.PI * 0.62 },
  { id: 'chair-b', x: -1.75, z: 0.35, facing: Math.PI * 0.38 },
  { id: 'chair-c', x: -0.95, z: -0.95, facing: Math.PI * 0.75 },
  { id: 'chair-d', x: -0.95, z: 0.75, facing: Math.PI * 0.25 },
  { id: 'chair-e', x: -2.45, z: -0.10, facing: Math.PI * 0.50 },
  { id: 'chair-f', x: -0.20, z: -0.10, facing: -Math.PI * 0.50 },
];

export const chairGroup = new THREE.Group();

export function buildChairs(n) {
  clearGroup(chairGroup);
  // w/d travel with the seat so the sim can route around a chair without being told a size.
  seats.length = 0;
  seats.push(...SEAT_SLOTS.slice(0, n).map((s) => ({ ...s, w: CHAIR_W, d: CHAIR_W })));
  for (const s of seats) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(CHAIR_W, SEAT_H, CHAIR_W), seatMat);
    chair.position.set(s.x, SEAT_H / 2, s.z);
    chair.rotation.y = s.facing;
    chair.castShadow = true;
    chair.receiveShadow = true;
    // Both directions: the mover raycasts the mesh and needs the seat, and applySeat holds the
    // seat and needs the mesh. Chairs are few and solid, so unlike notions they ARE raycastable.
    chair.userData.seat = s;
    s.mesh = chair;
    chairGroup.add(chair);
  }
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installSeating() {
  roomGroup.add(chairGroup);
}
