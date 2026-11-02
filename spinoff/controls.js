// Taps to Inputs (REUSE-SPEC.md §Navigation: tap to move). Classification is pure; the DOM glue is thin.
import * as THREE from 'three';
import { BRICK, outside } from './match.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').Target} Target */
/** @typedef {import('./match.js').Input} Input @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').Stage} Stage @typedef {{ x: number, y: number, z: number }} P3 @typedef {{ origin: P3, direction: P3 }} Ray */

export const TAP_RADIUS = { donut: 0.55, foe: 0.55, me: 0.35, jump: 0.5, shelf: 0.75, brick: 0.4, pile: 0.5 };
export const DONUT_UP = 0.2;
export const SHELF_UP = 0.65;

const inside = (f, x, z) => outside(f, x, z) === 0;

/** The highest floor top at (x, z) no higher than maxY, or null off the stage. @param {Stage} stage */
export function floorTop(stage, x, z, maxY = Infinity) {
  let top = null;
  for (const f of stage.floors) if (f.y <= maxY && inside(f, x, z) && (top === null || f.y > top)) top = f.y;
  return top;
}

/** The nearest floor top a ray crosses. @param {Stage} stage @param {Ray} ray */
function topHit(stage, { origin: o, direction: d }) {
  let best = null;
  for (const f of stage.floors) {
    const t = (f.y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
    if (t > 0 && inside(f, x, z) && !(best && best.t < t)) best = { t, x, z };
  }
  return best;
}

/** Where a ray lands: the nearest floor top it crosses (a raised floor's side counts as its top), else the ground plane. @param {Stage} stage @param {Ray} ray @returns {P3|null} */
export function floorPoint(stage, ray) {
  const { origin: o, direction: d } = ray;
  if (d.y >= 0) return null;
  const t = -o.y / d.y, hit = topHit(stage, ray) ?? { x: o.x + d.x * t, z: o.z + d.z * t };
  return { x: hit.x, z: hit.z, y: floorTop(stage, hit.x, hit.z) ?? 0 };
}

/** Closest approach of a ray to a point. @param {Ray} ray */
export function rayDist({ origin: o, direction: d }, x, y, z) {
  const dx = x - o.x, dy = y - o.y, dz = z - o.z;
  const t = Math.max(0, (dx * d.x + dy * d.y + dz * d.z) / (d.x * d.x + d.y * d.y + d.z * d.z));
  return Math.hypot(dx - d.x * t, dy - d.y * t, dz - d.z * t);
}

/** @param {Ray} ray @param {FighterState} f */
const fighterDist = (ray, f) => Math.min(...[0.3, 0.55, 0.8].map((k) => rayDist(ray, f.x, f.y + f.height * k, f.z)));
/** How near a tap passes the space just above a fighter's head, where a tap is a jump. */
const aboveDist = (ray, f) => Math.min(...[1.3, 1.65, 2].map((k) => rayDist(ray, f.x, f.y + f.height * k, f.z)));
const shelfDist = (ray, s) => Math.min(...[-0.6, 0, 0.6].map((k) => rayDist(ray, s.x + k, s.y + SHELF_UP, s.z - 0.13)));
const brickDist = (ray, b) => rayDist(ray, b.x + BRICK / 2, b.y + BRICK / 2, b.z + BRICK / 2);

/** @template T @param {readonly T[]} list @param {(o: T) => number} dist @returns {T|null} */
function closest(list, dist, r) {
  let best = null, bestD = r;
  for (const o of list) {
    const d = dist(o);
    if (d <= bestD) [best, bestD] = [o, d];
  }
  return best;
}

/** @param {Stage} stage @param {Ray} ray @returns {Target|null} */
function pointTarget(stage, ray) {
  const p = floorPoint(stage, ray);
  if (!p) return null;
  return p.y > 0 ? { x: p.x, z: p.z, y: p.y } : { x: p.x, z: p.z };
}

/** The thing a tap along `ray` means, else the floor point under it. @param {Stage} stage @param {Snapshot} snap @param {Ray} ray @returns {Target|null} */
export function pickTarget(stage, snap, ray, myId) {
  const me = snap.fighters.find((f) => f.id === myId);
  const donut = closest(snap.donuts, (d) => rayDist(ray, d.x, d.y + DONUT_UP, d.z), TAP_RADIUS.donut);
  if (donut) return { thing: 'donut', id: donut.id };
  const foe = closest(snap.fighters.filter((f) => f.team !== me?.team && !f.respawn), (f) => fighterDist(ray, f), TAP_RADIUS.foe);
  if (foe) return { thing: 'fighter', id: foe.id };
  if (me && fighterDist(ray, me) <= TAP_RADIUS.me) return { stop: true };
  if (me && aboveDist(ray, me) <= TAP_RADIUS.jump) return { jump: true };
  const shelf = closest(snap.shelves, (s) => shelfDist(ray, s), TAP_RADIUS.shelf);
  if (shelf) return { thing: 'shelf', team: shelf.team };
  // REUSE-SPEC.md §Forts: only your own pile is yours to take from
  const pile = closest((snap.piles ?? []).filter((p) => p.owner === myId && p.count), (p) => rayDist(ray, p.x, p.y + BRICK / 2, p.z), TAP_RADIUS.pile);
  if (pile) return { thing: 'pile', id: myId };
  const brick = closest(snap.bricks, (b) => brickDist(ray, b), TAP_RADIUS.brick);
  if (brick) return { thing: 'brick', id: brick.id };
  return pointTarget(stage, ray);
}

// A laptop: arrows walk (↑ toward the back wall), Space jumps, Z punches (held, aims the Greathammer), X kicks
export const KEYS = Object.freeze({ punch: 'KeyZ', kick: 'KeyX', jump: 'Space' });
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// a held arrow walks toward a point this far ahead, sent again every WALK_EVERY takes so it never arrives
const WALK_STEP = 1, WALK_EVERY = 6;

/** Where a held arrow walks to: a step ahead, past the edge too, as a tap there is. @param {Stage} stage @returns {Target} */
export function walkTarget(stage, me, dx, dz) {
  const n = Math.hypot(dx, dz), x = me.x + (dx / n) * WALK_STEP, z = me.z + (dz / n) * WALK_STEP;
  const y = floorTop(stage, x, z) ?? 0;
  return y > 0 ? { x, z, y } : { x, z };
}

/**
 * A tap wins; else Space; else a held arrow, sent again now and then; else letting go of the arrows stops you.
 * @param {Stage} stage @param {Snapshot} snap @returns {Target|null}
 */
function targetOf(s, stage, snap, myId) {
  if (s.fresh && s.aim) return pickTarget(stage, snap, s.aim, myId);
  if (s.jump) return { jump: true };
  const [dx, dz] = s.walk;
  if (!dx && !dz) {
    const was = s.walked;
    s.walked = false;
    return was ? { stop: true } : null;
  }
  const me = snap.fighters.find((f) => f.id === myId);
  if (!me || s.since++ % WALK_EVERY) return null;
  s.walked = true;
  return walkTarget(stage, me, dx, dz);
}

/** Pointer state per finger, and held keys, turned into one Input per tick by `take`. @param {Stage} stage */
export function createControls(myId, stage) {
  const s = { finger: null, aim: null, fresh: false, punch: false, kick: false, drop: false, ready: undefined, go: false, throw: undefined,
    jump: false, walk: [0, 0], walked: false, since: 0 };
  return {
    /** Arrows held now, as a direction (0, 0 for none), and Space. */
    walk(dx, dz) { Object.assign(s, { since: dx === s.walk[0] && dz === s.walk[1] ? s.since : 0, walk: [dx, dz] }); },
    jump() { s.jump = true; },
    /** 👍 tapped (on or back off), and 👍 held long enough to start the round. */
    ready(on) { s.ready = on; },
    go() { s.go = true; },
    /** 🥊 let go after the Greathammer's path showed, at size `k` (hammer.js). */
    throw(k) { s.throw = k; },
    /** @param {'stage'|'punch'|'kick'|'drop'} on @param {Ray|null} ray */
    down(pointerId, on, ray) { Object.assign(s, on === 'stage' ? { finger: pointerId, aim: ray, fresh: true } : { [on]: true }); },
    /** @param {Ray} ray */
    move(pointerId, ray) { if (pointerId === s.finger) Object.assign(s, { aim: ray, fresh: true }); },
    up(pointerId) { if (pointerId === s.finger) s.finger = null; },
    /** @param {Snapshot} snap @returns {Input} */
    take(snap) {
      const input = { target: targetOf(s, stage, snap, myId), punch: s.punch, kick: s.kick,
        ...(s.drop && { drop: true }), ...(s.ready !== undefined && { ready: s.ready }), ...(s.go && { go: true }), ...(s.throw !== undefined && { throw: s.throw }) };
      Object.assign(s, { fresh: false, punch: false, kick: false, drop: false, ready: undefined, go: false, throw: undefined, jump: false });
      return input;
    },
  };
}

const caster = new THREE.Raycaster(), ndc = new THREE.Vector2();

/** The camera ray under a pointer. @returns {Ray} */
function pointerRay(camera, canvas, e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  caster.setFromCamera(ndc, camera);
  return caster.ray.clone();
}

/**
 * Pointer Events per finger, as verified in touch-test.html.
 * @param {ReturnType<typeof createControls>} controls
 * @param {{ camera: THREE.Camera, canvas: HTMLElement, buttons: Record<string, HTMLElement>, keyHelp: HTMLElement }} opts
 *   `keyHelp`: the card of keyboard keys
 */
export function attachControls(controls, { camera, canvas, buttons, keyHelp }) {
  const at = (e) => pointerRay(camera, canvas, e);
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); controls.down(e.pointerId, 'stage', at(e)); });
  canvas.addEventListener('pointermove', (e) => controls.move(e.pointerId, at(e)));
  const up = (e) => controls.up(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  for (const [name, b] of Object.entries(buttons)) {
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      controls.down(e.pointerId, /** @type {'punch'|'kick'|'drop'} */ (name), null);
    });
    for (const type of ['pointerup', 'pointercancel']) b.addEventListener(type, () => b.classList.remove('down'));
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  attachKeys(controls, buttons, keyHelp);
}

/** Arrows, Space, Z and X; any other key shows `keyHelp`, the keys that play, and playing hides it: a tablet never sees it.
 * @param {ReturnType<typeof createControls>} controls @param {Record<string, HTMLElement>} buttons @param {HTMLElement} keyHelp */
function attachKeys(controls, buttons, keyHelp) {
  const held = new Set();
  const walk = () => controls.walk(...[...held].reduce(([x, z], k) => [x + ARROWS[k][0], z + ARROWS[k][1]], [0, 0]));
  const press = { [KEYS.punch]: 'punch', [KEYS.kick]: 'kick' };
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keyHelp.hidden = e.code in ARROWS || e.code === KEYS.jump || e.code in press;
    if (e.code in ARROWS) { held.add(e.code); walk(); } else if (e.code === KEYS.jump) { if (!e.repeat) controls.jump(); }
    else if (e.code in press) { if (!e.repeat) { buttons[press[e.code]].classList.add('down'); controls.down('key', press[e.code], null); } }
    else return;
    // arrows and Space would scroll the page, and Space would press whichever button was clicked last
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (e.code in ARROWS) { held.delete(e.code); walk(); }
    if (e.code in press) buttons[press[e.code]].classList.remove('down');
  });
  // a key let go in another window never comes back up here
  addEventListener('blur', () => { held.clear(); walk(); });
}
