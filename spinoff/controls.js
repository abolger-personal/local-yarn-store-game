// Taps to Inputs (REUSE-SPEC.md §Navigation: tap to move). Classification is pure; the DOM glue is thin.
import * as THREE from 'three';
import { BRICK } from './match.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').Target} Target */
/** @typedef {import('./match.js').Input} Input @typedef {{ x: number, y: number }} Point */

export const TAP_RADIUS = { donut: 0.55, fighter: 0.6, shelf: 0.9 };
export const FIGHTER_MID = 0.45;
export const SHELF_MID = 0.5;

const near = (p, x, y, r) => Math.hypot(p.x - x, p.y - y) <= r;

const closest = (list, p, at) => list
  .map((o) => ({ o, d: Math.hypot(p.x - at(o).x, p.y - at(o).y) }))
  .sort((a, b) => a.d - b.d)[0]?.o;

/** The thing a tap at `p` (world, z = 0) means, else the point itself. @param {Snapshot} snap @param {Point} p @returns {Target} */
export function pickTarget(snap, p, myId) {
  const donuts = snap.donuts.filter((d) => near(p, d.x, d.y + 0.1, TAP_RADIUS.donut));
  if (donuts.length) return { thing: 'donut', id: closest(donuts, p, (d) => d).id };
  const me = snap.fighters.find((f) => f.id === myId);
  const foes = snap.fighters.filter((f) => f.id !== myId && f.team !== me?.team && near(p, f.x, f.y + FIGHTER_MID, TAP_RADIUS.fighter));
  if (foes.length) return { thing: 'fighter', id: closest(foes, p, (f) => f).id };
  const shelf = snap.shelves.find((s) => near(p, s.x, s.y + SHELF_MID, TAP_RADIUS.shelf));
  if (shelf) return { thing: 'shelf', team: shelf.team };
  const pad = BRICK / 4;
  const brick = snap.bricks.find((b) => p.x > b.x - pad && p.x < b.x + BRICK + pad && p.y > b.y - pad && p.y < b.y + BRICK + pad);
  if (brick) return { thing: 'brick', id: brick.id };
  return { x: p.x, y: p.y };
}

/** Pointer state per finger, turned into one Input per tick by `take`. */
export function createControls(myId) {
  const s = { finger: null, aim: null, fresh: false, punch: false, kick: false };
  return {
    /** @param {'stage'|'punch'|'kick'} on @param {Point|null} point */
    down(pointerId, on, point) {
      if (on !== 'stage') { s[on] = true; return; }
      Object.assign(s, { finger: pointerId, aim: point, fresh: true });
    },
    /** @param {Point} point */
    move(pointerId, point) { if (pointerId === s.finger) Object.assign(s, { aim: point, fresh: true }); },
    up(pointerId) { if (pointerId === s.finger) s.finger = null; },
    /** @param {Snapshot} snap @returns {Input} */
    take(snap) {
      const input = { target: s.fresh && s.aim ? pickTarget(snap, s.aim, myId) : null, punch: s.punch, kick: s.kick };
      Object.assign(s, { fresh: false, punch: false, kick: false });
      return input;
    },
  };
}

/** World point on the z = 0 plane under a pointer, or null. */
function worldPoint(camera, canvas, e) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
  return hit && { x: hit.x, y: hit.y };
}

/**
 * Pointer Events per finger, as verified in touch-test.html.
 * @param {ReturnType<typeof createControls>} controls
 * @param {{ camera: THREE.Camera, canvas: HTMLElement, buttons: Record<string, HTMLElement> }} opts
 */
export function attachControls(controls, { camera, canvas, buttons }) {
  const at = (e) => worldPoint(camera, canvas, e);
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); controls.down(e.pointerId, 'stage', at(e)); });
  canvas.addEventListener('pointermove', (e) => { const p = at(e); if (p) controls.move(e.pointerId, p); });
  const up = (e) => controls.up(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  for (const [name, b] of Object.entries(buttons)) {
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      controls.down(e.pointerId, /** @type {'punch'|'kick'} */ (name), null);
    });
    for (const type of ['pointerup', 'pointercancel']) b.addEventListener(type, () => b.classList.remove('down'));
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
