import { makeDisplay, slotRect } from '../inventory/grid.js';

export const ROOM_TREATS = Object.freeze(['🍩', '🧁', '🍪', '🍒', '🍓', '🍰']);
export const CODE_LENGTH = 4;
export const MAX_FIGHTERS = 14;

/** @returns {number[]} indexes into ROOM_TREATS */
export const randomCode = (rng = Math.random) =>
  Array.from({ length: CODE_LENGTH }, () => Math.floor(rng() * ROOM_TREATS.length));

export const isCode = (code) => Array.isArray(code) && code.length === CODE_LENGTH
  && code.every((i) => Number.isInteger(i) && i >= 0 && i < ROOM_TREATS.length);

export const roomName = (code) => `donut-${code.join('')}`;

// REUSE-SPEC.md §Mode: kids can't hit each other for now, but it is a match setting, not a rule baked in
export const MATCH = Object.freeze({ friendlyFire: false });
export const canHit = (a, b, match = MATCH) => a.id !== b.id && (a.team !== b.team || match.friendlyFire);

export const floorGrid = () => makeDisplay(7, 2, { cell: 0.62 });

function centreOut(g) {
  const cells = [];
  for (let r = g.rows - 1; r >= 0; r--) for (let c = 0; c < g.cols; c++) cells.push({ c, r });
  const mid = (g.cols - 1) / 2;
  return cells.sort((a, b) => (b.r - a.r) || (Math.abs(a.c - mid) - Math.abs(b.c - mid)) || (a.c - b.c));
}

/**
 * Where everyone stands: the same answer on every tablet, whatever order they joined in.
 * @param {string[]} ids @returns {Map<string, {x: number, z: number}>}
 */
export function standingSpots(ids, g = floorGrid()) {
  const cells = centreOut(g), spots = new Map();
  [...new Set(ids)].sort().slice(0, cells.length).forEach((id, i) => {
    const { x, z } = slotRect(g, cells[i].c, cells[i].r, 1, 1);
    spots.set(id, { x, z });
  });
  return spots;
}
