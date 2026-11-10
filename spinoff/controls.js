// Taps to Inputs (REUSE-SPEC.md §Navigation: tap to move). Classification is pure; the DOM glue is thin.
import * as THREE from 'three';
import { BRICK, floorTop, outside } from './match.js';
import { POWERS } from './combat.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').Target} Target */
/** @typedef {import('./match.js').Input} Input @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').Stage} Stage @typedef {{ x: number, y: number, z: number }} P3 @typedef {{ origin: P3, direction: P3 }} Ray */

const TAP_RADIUS = { donut: 0.55, foe: 0.55, me: 0.35, jump: 0.5, shelf: 0.75, brick: 0.4, pile: 0.5 };
const DONUT_UP = 0.2;
const SHELF_UP = 0.65;

/** The nearest floor top a ray crosses. @param {Stage} stage @param {Ray} ray */
function topHit(stage, { origin: o, direction: d }) {
  let best = null;
  for (const f of stage.floors) {
    const t = (f.y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
    if (t > 0 && outside(f, x, z) === 0 && !(best && best.t < t)) best = { t, x, z };
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
function rayDist({ origin: o, direction: d }, x, y, z) {
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
export const KEYS = Object.freeze({ punch: 'KeyZ', kick: 'KeyX', jump: 'Space', power: 'KeyC' });
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

/** A finger's path on the screen, CSS pixels and milliseconds. @typedef {{ x: number, y: number, t: number }[]} Stroke */
/** With a full power bar, a finger that has gone this far is drawing a gesture, not steering (REUSE-SPEC.md §Power moves). */
const DRAW_PX = 80;
const pathLength = (pts) => pts.reduce((n, p, i) => (i ? n + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

/** A finger moved: the steering one drags the target, until with a full bar it has gone DRAW_PX: then it's a drawing. */
function fingerMove(s, pointerId, ray, at) {
  const tr = s.tracks.get(pointerId);
  if (tr && at) tr.points.push(at);
  if (pointerId !== s.finger) return;
  if (!s.full || !tr || pathLength(tr.points) < DRAW_PX) { Object.assign(s, { aim: ray, fresh: true }); return; }
  tr.drawing = true;
  Object.assign(s, { finger: null, fresh: false });
}

/** The bad guy nearest `me` in play and not already a toy, or null. @param {Snapshot} snap @param {FighterState} me */
function nearestFoe(snap, me) {
  const foes = snap.fighters.filter((f) => f.team !== me.team && !f.respawn && !f.toy);
  const far = (f) => Math.hypot(f.x - me.x, f.z - me.z);
  return foes.sort((a, b) => far(a) - far(b))[0] ?? null;
}

/** Holds let go this tick: the Greathammer thrown, the sweep, a trick's shot. */
const letGo = (s) => ({ ...(s.throw !== undefined && { throw: s.throw }), ...(s.sweep && { sweep: true }), ...(s.shot !== undefined && { shot: s.shot }),
  ...(s.charge !== undefined && { charge: s.charge }) });

/** This tick's Input, from what the fingers, buttons and keys did since the last; the bar's fullness from `snap`. */
function takeInput(s, stage, snap, myId) {
  const me = snap.fighters.find((f) => f.id === myId), full = (me?.power ?? 0) >= 1, foe = s.power && full ? nearestFoe(snap, me) : null;
  s.full = s.draw && full;
  const input = { target: targetOf(s, stage, snap, myId), punch: s.punch, kick: s.kick, ...(foe && { power: { kind: POWERS[0], on: foe.id } }),
    ...(s.drop && { drop: true }), ...(s.ready !== undefined && { ready: s.ready }), ...(s.go && { go: true }), ...letGo(s) };
  Object.assign(s, { fresh: false, punch: false, kick: false, drop: false, ready: undefined, go: false, throw: undefined, jump: false, power: false, sweep: false, shot: undefined, charge: undefined });
  return input;
}

/** A finger on the stage steers, unless the bar is full and another already does: then it draws. */
function fingerDown(s, pointerId, ray, at) {
  const extra = s.full && s.finger !== null;
  s.tracks.set(pointerId, { points: at ? [at] : [], drawing: extra });
  if (!extra) Object.assign(s, { finger: pointerId, aim: ray, fresh: true });
}

/** A lifted finger stops steering; a drawing is kept for the recogniser. */
function fingerUp(s, pointerId) {
  if (pointerId === s.finger) s.finger = null;
  const tr = s.tracks.get(pointerId);
  if (tr?.drawing) s.strokes.push(tr.points);
  s.tracks.delete(pointerId);
}

/** Pointer state per finger, and held keys, turned into one Input per tick by `take`. Every stage finger's path is kept;
 * a finished drawing (one that stopped steering, or a second finger while the bar is full) waits in `strokes()` for the
 * gesture recogniser. @param {Stage} stage */
export function createControls(myId, stage, { draw = false } = {}) {
  const s = { finger: null, aim: null, fresh: false, punch: false, kick: false, drop: false, ready: undefined, go: false, throw: undefined,
    jump: false, walk: [0, 0], walked: false, since: 0, draw, full: false, tracks: new Map(), strokes: [], power: false, sweep: false, shot: undefined, charge: undefined };
  return {
    /** Arrows held now, as a direction (0, 0 for none), and Space. */
    walk(dx, dz) { Object.assign(s, { since: dx === s.walk[0] && dz === s.walk[1] ? s.since : 0, walk: [dx, dz] }); },
    jump() { s.jump = true; },
    /** C on a keyboard, which can't draw: a full bar's power at the nearest bad guy. */
    power() { s.power = true; },
    /** 👍 tapped (on or back off), and 👍 held long enough to start the round. */
    ready(on) { s.ready = on; },
    go() { s.go = true; },
    /** 🥊 let go after the Greathammer's path showed, at size `k` (hammer.js). */
    throw(k) { s.throw = k; },
    /** 🦶 let go after a hold (play.js times it). */
    sweep() { s.sweep = true; },
    /** 🥊 let go after a hold, `k` of the trick's reach (sim.js shotCharge). */
    shot(k) { s.shot = k; },
    /** 🥊 held for a shot (true: no punch on the press; the swing comes on letting go), or that hold over. */
    charge(on) { Object.assign(s, { charge: on, ...(on && { punch: false }) }); },
    /** @param {'stage'|'punch'|'kick'|'drop'} on @param {Ray|null} ray @param {{ x: number, y: number, t: number }} [at] on the screen */
    down(pointerId, on, ray, at) { if (on === 'stage') fingerDown(s, pointerId, ray, at); else s[on] = true; },
    /** @param {Ray} ray @param {{ x: number, y: number, t: number }} [at] */
    move(pointerId, ray, at) { fingerMove(s, pointerId, ray, at); },
    up(pointerId) { fingerUp(s, pointerId); },
    /** The drawings finished since last asked. @returns {Stroke[]} */
    strokes() { return s.strokes.splice(0); },
    /** @param {Snapshot} snap @returns {Input} */
    take(snap) { return takeInput(s, stage, snap, myId); },
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
  const at = (e) => pointerRay(camera, canvas, e), onScreen = (e) => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); controls.down(e.pointerId, 'stage', at(e), onScreen(e)); });
  canvas.addEventListener('pointermove', (e) => controls.move(e.pointerId, at(e), onScreen(e)));
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
  const press = { [KEYS.punch]: 'punch', [KEYS.kick]: 'kick' }, tap = { [KEYS.jump]: () => controls.jump(), [KEYS.power]: () => controls.power() };
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keyHelp.hidden = e.code in ARROWS || e.code in tap || e.code in press;
    if (e.code in ARROWS) { held.add(e.code); walk(); } else if (e.code in tap) { if (!e.repeat) tap[e.code](); }
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
