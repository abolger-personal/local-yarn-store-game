// Chairs: the third kind of place an NPC walks to.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { seats } from '../core/state.js';
import * as THREE from 'three';
import { CHAIR_BACK_Z, CHAIR_W, SEAT_H } from '../core/config.js';
import { clearGroup, roomGroup, seatMat } from './room.js';
import { arc, board, panel, turned, woodMesh } from './wood.js';

// ---------------------------------------------------------------- seating
//
// A chair is the third kind of place an NPC walks to and occupies, after a display's standing spot
// and the Guestbook counter. Working on a WIP now requires one — an NPC standing in the middle of
// the floor knitting looked like a bug, and parking them in front of a display blocked it.
//
// A pool of positions rather than a fixed pair: the chair COUNT is a live control, so the layout
// has to be authored for the largest case and taken from the front. Same pattern as the displays.
export { CHAIR_W };

export const SEAT_SLOTS = [
  { id: 'chair-a', x: -3.025, z: -0.55, facing: Math.PI * 0.62 },
  { id: 'chair-b', x: -3.025, z: 0.35, facing: Math.PI * 0.38 },
  { id: 'chair-c', x: -2.225, z: -0.95, facing: Math.PI * 0.75 },
  { id: 'chair-d', x: -2.225, z: 0.75, facing: Math.PI * 0.25 },
  { id: 'chair-e', x: -3.725, z: -0.10, facing: Math.PI * 0.50 },
  { id: 'chair-f', x: -1.475, z: -0.10, facing: -Math.PI * 0.50 },
];

export const chairGroup = new THREE.Group();

export function buildChairs(n) {
  clearGroup(chairGroup);
  // w/d travel with the seat so the sim can route around a chair without being told a size.
  seats.length = 0;
  seats.push(...SEAT_SLOTS.slice(0, n).map((s) => ({ ...s, w: CHAIR_W, d: CHAIR_W })));
  for (const s of seats) {
    const chair = makeChair();
    chair.position.set(s.x, 0, s.z);
    chair.rotation.y = s.facing;
    // Both directions: the mover raycasts the mesh and needs the seat, and applySeat holds the
    // seat and needs the mesh. Chairs are few and solid, so unlike notions they ARE raycastable.
    chair.userData.seat = s;
    s.mesh = chair;
    chairGroup.add(chair);
  }
}

const BACK_H = 0.36;     // above the seat
const BACK_RAKE = -0.12; // radians, leaning away from the sitter

/** Where a point `up` along the raked back sits, from the back's pivot on the seat frame. */
const alongBack = (pivot, up) =>
  [pivot[0] + up * Math.cos(BACK_RAKE), pivot[1] + up * Math.sin(BACK_RAKE)];

/** The crest rail: an arch, highest in the middle, cut from one board. */
function crestRail(w) {
  const rise = 0.025, h = 0.06;
  const top = arc([0, h - 0.2], 0.2 + rise, [Math.acos(w / 2 / (0.2 + rise)), Math.PI - Math.acos(w / 2 / (0.2 + rise))]);
  return panel([[-w / 2, 0], [w / 2, 0], ...top], 0.022, 0.006);
}

/** The legs, the stretchers between them, and the seat, in the chair's own frame. */
function chairBase(inset) {
  const legH = SEAT_H - 0.035;
  return [
    [board(CHAIR_W, 0.035, CHAIR_W, 0.012), [0, SEAT_H - 0.0175, 0]],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [turned('leg', legH, 0.022), [sx * inset, 0, sz * inset]]),
    ...[-1, 1].map((sx) => [board(0.016, 0.016, inset * 2, 0.007), [sx * inset, legH * 0.3, 0]]),
  ];
}

/** Two turned posts, three spindles and the crest rail, all raked back from the seat's rear. */
function chairBack(inset, backZ) {
  const pivot = [SEAT_H - 0.02, backZ], rot = [BACK_RAKE, 0, 0];
  const [railY, railZ] = alongBack(pivot, BACK_H * 0.8);
  return [
    ...[-1, 1].map((sx) => [turned('post', BACK_H + 0.04, 0.019), [sx * inset, pivot[0], pivot[1]], rot]),
    ...[-0.07, 0, 0.07].map((x) => [turned('spindle', BACK_H * 0.8, 0.01), [x, pivot[0], pivot[1]], rot]),
    [crestRail(inset * 2 + 0.03), [0, railY, railZ], rot],
    // Rails of the seat frame running back to the posts, so the back is jointed, not floating.
    ...[-1, 1].map((sx) => [board(0.02, 0.025, -backZ - CHAIR_W / 2 + 0.03, 0.006),
      [sx * inset, SEAT_H - 0.03, (backZ - CHAIR_W / 2) / 2]]),
  ];
}

/**
 * A farmhouse chair: turned legs with side stretchers, a seat with its edges rounded over, and a
 * raked back of turned posts, three spindles and an arched crest rail, stood off behind the seat —
 * see CHAIR_BACK_Z. The seat's top is exactly SEAT_H (the sit pose is measured onto it). Origin on
 * the floor, front is local +Z, which is the way the sitter faces. One mesh.
 *
 * Deliberately bare. A seat cushion or a blanket over the back is a finished object's job, so the
 * chair says where those go rather than having them: `userData.cozy`.
 */
function makeChair() {
  const chair = new THREE.Group();
  const inset = CHAIR_W / 2 - 0.03, backZ = CHAIR_BACK_Z - 0.01;
  chair.add(woodMesh([...chairBase(inset), ...chairBack(inset, backZ)], seatMat));
  chair.userData.cozy = {
    seat: { w: CHAIR_W, d: CHAIR_W, y: SEAT_H },                  // a cushion, a seat pad
    back: { w: CHAIR_W, h: BACK_H, y: SEAT_H, z: backZ, rake: BACK_RAKE },   // a blanket over it
  };
  return chair;
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installSeating() {
  roomGroup.add(chairGroup);
}
