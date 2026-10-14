import { seats } from '../core/state.js';
import * as THREE from 'three';
import { CHAIR_BACK_Z, CHAIR_W, SEAT_H } from '../core/config.js';
import { clearGroup, roomGroup, seatMat } from './room.js';
import { arc, board, panel, turned, woodMesh } from './wood.js';

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
  seats.length = 0;
  seats.push(...SEAT_SLOTS.slice(0, n).map((s) => ({ ...s, w: CHAIR_W, d: CHAIR_W })));
  for (const s of seats) {
    const chair = makeChair();
    chair.position.set(s.x, 0, s.z);
    chair.rotation.y = s.facing;
    chair.userData.seat = s;
    s.mesh = chair;
    chairGroup.add(chair);
  }
}

const BACK_H = 0.36;
const BACK_RAKE = -0.12;

const alongBack = (pivot, up) =>
  [pivot[0] + up * Math.cos(BACK_RAKE), pivot[1] + up * Math.sin(BACK_RAKE)];

function crestRail(w) {
  const rise = 0.025, h = 0.06;
  const top = arc([0, h - 0.2], 0.2 + rise, [Math.acos(w / 2 / (0.2 + rise)), Math.PI - Math.acos(w / 2 / (0.2 + rise))]);
  return panel([[-w / 2, 0], [w / 2, 0], ...top], 0.022, 0.006);
}

function chairBase(inset) {
  const legH = SEAT_H - 0.035;
  return [
    [board(CHAIR_W, 0.035, CHAIR_W, 0.012), [0, SEAT_H - 0.0175, 0]],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [turned('leg', legH, 0.022), [sx * inset, 0, sz * inset]]),
    ...[-1, 1].map((sx) => [board(0.016, 0.016, inset * 2, 0.007), [sx * inset, legH * 0.3, 0]]),
  ];
}

function chairBack(inset, backZ) {
  const pivot = [SEAT_H - 0.02, backZ], rot = [BACK_RAKE, 0, 0];
  const [railY, railZ] = alongBack(pivot, BACK_H * 0.8);
  return [
    ...[-1, 1].map((sx) => [turned('post', BACK_H + 0.04, 0.019), [sx * inset, pivot[0], pivot[1]], rot]),
    ...[-0.07, 0, 0.07].map((x) => [turned('spindle', BACK_H * 0.8, 0.01), [x, pivot[0], pivot[1]], rot]),
    [crestRail(inset * 2 + 0.03), [0, railY, railZ], rot],
    ...[-1, 1].map((sx) => [board(0.02, 0.025, -backZ - CHAIR_W / 2 + 0.03, 0.006),
      [sx * inset, SEAT_H - 0.03, (backZ - CHAIR_W / 2) / 2]]),
  ];
}

function makeChair() {
  const chair = new THREE.Group();
  const inset = CHAIR_W / 2 - 0.03, backZ = CHAIR_BACK_Z - 0.01;
  chair.add(woodMesh([...chairBase(inset), ...chairBack(inset, backZ)], seatMat));
  chair.userData.cozy = {
    seat: { w: CHAIR_W, d: CHAIR_W, y: SEAT_H },
    back: { w: CHAIR_W, h: BACK_H, y: SEAT_H, z: backZ, rake: BACK_RAKE },
  };
  return chair;
}

export function installSeating() {
  roomGroup.add(chairGroup);
}
