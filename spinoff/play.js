import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { attachControls, createControls } from './controls.js';
import * as match from './sim.js';
import { MOVE_POSES, buildFighter, entrantOf, loadFighter, newFighter, seatDrop, setFur, stepFighter, wobbleAt } from './fighter.js';
import { confettiMats, createFx, makeShadow, placeShadow } from './fx.js';
import { BRICK, TICK_HZ, groundOf } from './match.js';
import { levelFor } from './levels.js';
import { makeStage } from './stage.js';
import { THEMES } from './scenery.js';
import { box, donutMesh, sameLook } from './treats.js';
import { rosterOf } from './multiplayer.js';
import { joinMatch } from './together.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').HitEvent} HitEvent @typedef {import('./match.js').DonutEvent} DonutEvent */

/** @type {import('./match.js').MatchApi} */
const api = match;

setGeometryDetail('med');

const SHELF = { cols: 6, gap: 0.3, row: 0.32, rows: 4, r: 0.13, depth: 0.26 };
const LOOSE_R = 0.2, FACE_CAMERA = -0.5, FLY_ARC = 0.6, GRAB_FROM_Y = 0.4;
const mine = loadFighter();
if (!mine) location.replace('choose.html');
// REUSE-SPEC.md §Multiplayer: in a room the host's level arrives as data, and each tablet is its own player
const net = mine ? await joinMatch(location.search, mine, levelFor(location.search)) : null;
const level = net?.start ?? levelFor(location.search), ground = groundOf(level.stage);
const ME = net?.me ?? 'me';
const CAMERA = { pitch: THREE.MathUtils.degToRad(35), viewW: 7, viewH: 4.8, xMin: ground.x0 + 3, xMax: ground.x1 - 3 };
const BACK = new THREE.Vector3(0, Math.sin(CAMERA.pitch), Math.cos(CAMERA.pitch));
const TIMERS = { squash: 0.22, no: 0.6, joy: 0.9, pop: 0.35, pulse: 0.45, wobble: 0.35, hop: 0.4, land: 0.5, pad: 0.45 };
const FIGHTER_TIMERS = ['squash', 'no', 'joy', 'pop', 'pulse', 'land'];
// REUSE-SPEC.md §Stages and difficulty are separate: on a spongy stage every landing springs
const SPONGY = (level.stage.bounce ?? 1) > 1;
const NONE = Object.freeze([]);
const _v = new THREE.Vector3(), _goal = new THREE.Vector3();

const theme = THEMES[level.theme];
const stage = makeStage(document.getElementById('stage'), { background: theme.background });
const { scene, camera } = stage;
const fx = createFx(scene, camera, level.stage);

function badGuyFighter() {
  const f = setFur(newFighter('lion'), '#8f8f96');
  f.look = { ...f.look, hatColor: '#2a2030', capeColor: '#3b2152', bagColor: '#1d1a20', gloves: '#4b2a6b' };
  return f;
}

function shelfFrame(s) {
  const w = SHELF.cols * SHELF.gap + 0.14, h = SHELF.rows * SHELF.row + 0.1, g = new THREE.Group();
  const back = box(w, h, 0.06, '#9a5b2c');
  back.position.set(0, h / 2, 0.03 - SHELF.depth);
  g.add(back);
  for (let row = 0; row <= SHELF.rows; row++) {
    const plank = box(w, 0.06, SHELF.depth, '#7a4520');
    plank.position.set(0, row * SHELF.row + 0.03, -SHELF.depth / 2);
    g.add(plank);
  }
  g.position.set(s.x, s.y, s.z);
  return g;
}

function fillShelf(s) {
  const g = new THREE.Group();
  s.donuts.forEach((look, i) => {
    const d = donutMesh(look, SHELF.r);
    d.position.set((i % SHELF.cols - (SHELF.cols - 1) / 2) * SHELF.gap, Math.floor(i / SHELF.cols) * SHELF.row + 0.06 + SHELF.r, -SHELF.depth / 2);
    d.rotation.x = FACE_CAMERA;
    g.add(d);
  });
  g.position.set(s.x, s.y, s.z);
  return g;
}

const scenery = theme.scenery(level.stage), pads = scenery.filter((o) => o.userData.spring != null);
scene.add(...scenery, ...level.stage.shelves.map(shelfFrame));

let frame = 0, now = 0;

/** Keeps one drawn thing per id in `list`, removing the ones that left. */
function sync(drawn, list, make, update, dt) {
  for (const item of list) {
    let m = drawn.get(item.id);
    if (!m) drawn.set(item.id, (m = make(item)));
    m.seen = frame;
    update(m, item, dt);
  }
  for (const [id, m] of drawn) {
    if (m.seen === frame) continue;
    scene.remove(m.g, m.shadow);
    drawn.delete(id);
  }
}

const fighters = new Map(), donuts = new Map(), bricks = new Map(), shelves = new Map();

function tickDown(t, keys, dt) {
  for (const k of keys) t[k] = Math.max(0, t[k] - dt / TIMERS[k]);
}

const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function poseOf(m, f) {
  if (f.move === 'sit') return MOVE_POSES.sit;
  if (m.t.joy > 0) return POSES.delighted;
  if (f.move === 'punch' || f.move === 'kick') return f.step < 0.7 ? MOVE_POSES[f.move][Math.cos(f.facing) >= 0 ? 1 : -1] : POSES.rest;
  if (f.move === 'hurt' || f.move === 'launched') return MOVE_POSES.hurt;
  const base = f.onGround ? POSES.rest : MOVE_POSES.air;
  if (!m.t.no) return base;
  Object.assign(m.pose, base).headYaw = Math.sin(m.t.no * 28) * 0.8;
  return m.pose;
}

/** @param {FighterState} f */
function placeFighter(m, f, dt) {
  const { squash: s, no } = m.t;
  m.yaw += turn(Math.PI / 2 - f.facing - m.yaw) * Math.min(1, dt * 14);
  const tilt = wobbleAt(f.percent, now, m.seed);
  m.g.rotation.set(tilt.x, m.yaw + Math.sin(no * 26) * 0.3 * no, tilt.z, 'ZXY');
  m.down += ((f.move === 'sit' ? 1 : 0) - m.down) * Math.min(1, dt * 6);
  m.g.position.set(f.x + m.recoil.x * s, f.y - m.seat * m.down, f.z + m.recoil.z * s);
  const spring = 0.3 * m.t.land * Math.sin(m.t.land * Math.PI * 3);
  m.g.scale.set(1 + 0.2 * s + 0.6 * spring, 1 - 0.28 * s - spring, 1 + 0.2 * s + 0.6 * spring);
}

/** A trampoline you take off from squashes and springs back; on a spongy stage you squish on landing. @param {FighterState} f */
function bounces(m, f) {
  if (f.vy > Math.max(0, m.vy) + 1) {
    const pad = pads.find((p) => Math.hypot(f.x - p.position.x, f.z - p.position.z) < p.userData.r && Math.abs(f.y - p.position.y) < 0.2);
    if (pad) pad.userData.t = 1;
  }
  if (SPONGY && f.onGround && !m.ground) m.t.land = 1;
  Object.assign(m, { vy: f.vy, ground: f.onGround });
}

function drawPads(dt) {
  for (const p of pads) {
    const t = (p.userData.t = Math.max(0, (p.userData.t ?? 0) - dt / TIMERS.pad)), k = t * Math.sin(t * Math.PI * 2.5);
    p.scale.set(1 + 0.12 * k, 1 - 0.7 * k, 1 + 0.12 * k);
  }
}

function carry(m, look) {
  if (sameLook(m.carryLook, look)) return;
  if (m.carried) scene.remove(m.carried);
  m.carryLook = look;
  m.carried = look ? donutMesh(look) : null;
  if (m.carried) scene.add(m.carried);
}

/** REUSE-SPEC.md §Mode: oversized, out of the bag over the shoulder, facing the camera; a grabbed one flies there in an arc, growing. */
function placeCarried(m) {
  const P = m.built.params, { pop, pulse } = m.t, k = 1 - pop * pop;
  m.g.updateMatrixWorld(true);
  m.built.chest.localToWorld(_v.set(0, P.torsoH * 1.1, -(P.torsoD + m.carryR)));
  m.carried.position.copy(pop > 0 ? _goal.copy(m.from).lerp(_v, k) : _v);
  m.carried.position.y += FLY_ARC * Math.sin(Math.PI * k);
  m.carried.quaternion.copy(camera.quaternion);
  m.carried.scale.setScalar(THREE.MathUtils.lerp(LOOSE_R, m.carryR, k) * (1 + 0.8 * Math.sin(Math.PI * pulse)));
}

/** @param {FighterState} f */
function drawFighter(m, f, dt) {
  tickDown(m.t, FIGHTER_TIMERS, dt);
  bounces(m, f);
  placeFighter(m, f, dt);
  stepFighter(m.built, dt, poseOf(m, f), f.onGround && f.move !== 'blocked' ? Math.hypot(f.vx, f.vz) : 0);
  carry(m, f.carrying);
  if (m.carried) placeCarried(m);
  placeShadow(level.stage, m.shadow, f, 0.42);
}

function newLoose(d) {
  const m = { g: donutMesh(d.look, LOOSE_R), shadow: makeShadow(scene), hop: 0 };
  scene.add(m.g);
  return m;
}

function drawLoose(m, d, dt) {
  m.hop = Math.max(0, m.hop - dt / TIMERS.hop);
  const hop = Math.sin(Math.PI * m.hop) * 0.35;
  m.g.position.set(d.x, d.y + LOOSE_R * 1.1 + hop, d.z);
  m.g.rotation.set(FACE_CAMERA, Math.sin(now * 2 + d.x) * 0.5, 0);
  placeShadow(level.stage, m.shadow, { x: d.x, y: d.y + hop, z: d.z }, LOOSE_R * 1.2);
}

function newBrick(b) {
  const m = { ...theme.brick(b), shadow: makeShadow(scene) };
  scene.add(m.g);
  return m;
}

function drawBrick(m, b, dt) {
  theme.damage(m, b);
  m.wobble = Math.max(0, m.wobble - dt / TIMERS.wobble);
  m.g.position.set(b.x + BRICK / 2, b.y + BRICK / 2, b.z + BRICK / 2);
  m.g.rotation.z = Math.sin(m.wobble * 40) * 0.15 * m.wobble;
  placeShadow(level.stage, m.shadow, { x: m.g.position.x, y: b.y, z: m.g.position.z }, BRICK * 0.6);
}

function drawShelf(m, s) {
  if (m.donuts?.length === s.donuts.length && s.donuts.every((d, i) => sameLook(d, m.donuts[i]))) return;
  if (m.g) scene.remove(m.g);
  Object.assign(m, { donuts: s.donuts, g: fillShelf(s) });
  scene.add(m.g);
}

const hudEls = { clock: document.getElementById('clock'), heroes: document.getElementById('count-heroes'), badGuys: document.getElementById('count-badGuys') };
const shown = { clock: -1, heroes: -1, badGuys: -1 };
function hud(key, n) {
  if (shown[key] === n) return;
  shown[key] = n;
  hudEls[key].textContent = String(n);
}

/** @param {Snapshot} snap */
function draw(snap, dt) {
  frame++;
  now += dt;
  for (const f of snap.fighters) drawFighter(fighters.get(f.id), f, dt);
  sync(donuts, snap.donuts, newLoose, drawLoose, dt);
  sync(bricks, snap.bricks, newBrick, drawBrick, dt);
  for (const s of snap.shelves) {
    if (!shelves.has(s.team)) shelves.set(s.team, {});
    drawShelf(shelves.get(s.team), s);
    hud(s.team, s.donuts.length);
  }
  hud('clock', Math.ceil(snap.secondsLeft));
  drawPads(dt);
  follow(snap.fighters.find((f) => f.id === ME), dt);
  fx.step(dt);
}

const aim = new THREE.Vector3(-4.5, 0.8, 0.1);

/** Down at the floor at CAMERA.pitch, following your fighter in x and z, about a third of the stage wide. */
function follow(me, dt) {
  if (me) aim.lerp(_goal.set(THREE.MathUtils.clamp(me.x, CAMERA.xMin, CAMERA.xMax), 0.8 + me.y * 0.4, -0.1 + me.z * 0.4), Math.min(1, dt * 4));
  const vFov = THREE.MathUtils.degToRad(camera.fov) / 2, hFov = Math.atan(Math.tan(vFov) * camera.aspect);
  const dist = Math.max(CAMERA.viewW / 2 / Math.tan(hFov), CAMERA.viewH / 2 / Math.tan(vFov));
  camera.position.copy(aim).addScaledVector(BACK, dist);
  camera.lookAt(aim);
}

/** @template T @param {Iterable<T>} items @param {(o: T) => { x: number, z: number }} at @returns {T|null} */
function closestTo(items, p, at, r = Infinity) {
  let best = null, bestD = r;
  for (const o of items) {
    const q = at(o), d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) [best, bestD] = [o, d];
  }
  return best;
}

const posOf = (m) => m.g.position;

/** @param {HitEvent} h @param {Snapshot} snap */
function onHit(h, snap) {
  fx.bam(h);
  if (h.on === 'brick') { brickHit(h); return; }
  const hurt = snap.fighters.filter((f) => f.move === 'hurt' || f.move === 'launched');
  const f = closestTo(hurt.length ? hurt : snap.fighters, h, (o) => o);
  const m = f && fighters.get(f.id);
  if (!m) return;
  m.t.squash = 1;
  m.recoil.set(f.x - h.x, 0, f.z - h.z).normalize().multiplyScalar(0.18);
}

/** @param {HitEvent} h */
function brickHit(h) {
  const m = closestTo(bricks.values(), h, posOf, 1);
  if (!m) return;
  m.wobble = 1;
  fx.burst(h, confettiMats, 4, 1.4);
  if (h.broke) fx.burst(h, confettiMats, 14, 2.2);
}

function onFullBag(e) {
  const m = fighters.get(e.fighter);
  if (m) Object.assign(m.t, { no: 1, pulse: 1 });
  const d = closestTo(donuts.values(), e, posOf, 1);
  if (d) d.hop = 1;
}

function bounce(team) {
  hudEls[team]?.parentElement.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' });
}

/** @param {DonutEvent} e */
function onDonut(e) {
  const m = fighters.get(e.fighter);
  if (e.kind === 'bank') fx.burst({ x: e.x, y: e.y + 1.6, z: e.z }, confettiMats, 30, 2.4);
  if (e.kind === 'bank') bounce(m?.team);
  if (!m) return;
  if (e.kind !== 'bank') m.from = new THREE.Vector3(e.x, e.y + GRAB_FROM_Y, e.z);
  Object.assign(m.t, { pop: e.kind === 'bank' ? 0 : 1, joy: e.kind === 'pickup' ? m.t.joy : 1 });
}

/** Every event once, on the tick it appears. @param {Snapshot} snap */
function react(snap) {
  for (const h of snap.hits ?? NONE) onHit(h, snap);
  for (const e of snap.fullBag ?? NONE) onFullBag(e);
  for (const e of snap.donutEvents ?? NONE) onDonut(e);
}

/** @param {import('./match.js').Entrant} e */
function endPicture(e) {
  const dot = document.createElement('span');
  dot.className = 'donut';
  dot.style.setProperty('--frost', e.look.frosting);
  dot.style.setProperty('--dough', e.look.dough);
  document.getElementById(`end-pics-${e.team}`).append(dot);
}

/** @param {Snapshot} snap */
function showEnd(snap) {
  const card = document.getElementById('end');
  if (!card.hidden) return;
  for (const s of snap.shelves) {
    document.getElementById(`end-count-${s.team}`).textContent = String(s.donuts.length);
    card.querySelector(`.side.${s.team}`).classList.toggle('won', !snap.winner || snap.winner === s.team);
  }
  card.hidden = false;
}

/** @param {import('./multiplayer.js').Seat[]} roster */
function cast(roster) {
  return roster.map(({ id, team, fighter, dummy = false }) => {
    const f = dummy ? badGuyFighter() : fighter, built = buildFighter(f), g = new THREE.Group();
    const entrant = entrantOf(f, built, { id, team, dummy });
    g.add(built.root);
    scene.add(g);
    const t = Object.fromEntries(FIGHTER_TIMERS.map((k) => [k, 0]));
    fighters.set(id, { g, built, team, t, vy: 0, ground: true, yaw: 0, recoil: new THREE.Vector3(), pose: {}, seat: seatDrop(built), down: 0, seed: fighters.size * 2.1, shadow: makeShadow(scene), carryR: built.params.headRadius * 0.7 });
    endPicture(entrant);
    return entrant;
  });
}

// REUSE-SPEC.md §Network gotchas: the host pauses everyone, clock and all; leaving the screen pauses too.
let paused = false;
// The browser drops the lock whenever the page is hidden, so it's asked for again on every resume.
const keepAwake = () => navigator.wakeLock?.request('screen').catch(() => {});
function setPaused(on) {
  paused = on;
  net?.host?.post(on);
  document.getElementById('paused').hidden = !on;
  if (!on) keepAwake();
}
document.getElementById('pause').addEventListener('click', () => setPaused(true));
document.getElementById('resume').addEventListener('click', () => setPaused(false));
// A guest leaving the screen sits down instead, and asks for the lock again when back.
document.addEventListener('visibilitychange', () => {
  if (!net?.guest) { if (document.hidden) setPaused(true); return; }
  net.guest.input({ target: null, punch: false, kick: false, away: document.hidden });
  if (!document.hidden) keepAwake();
});

function host(state, controls) {
  let snap = api.snapshot(state), acc = 0;
  stage.run((dt) => {
    net?.host.post(paused, dt);
    if (snap.over) { showEnd(snap); return; }
    if (paused) { acc = 0; return; }
    for (acc += dt; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
      api.tick(state, { ...net?.host.inputs(), [ME]: controls.take(snap) });
      snap = api.snapshot(state);
      net?.host.seen(snap);
      react(snap);
    }
    draw(snap, dt);
  });
}

/** REUSE-SPEC.md §Multiplayer: a guest runs no sim; it draws the host's snapshots and sends its taps. */
function guest(controls) {
  stage.run((dt) => {
    const snap = net.guest.frame(dt);
    if (!snap) return;
    if (snap.paused !== paused) setPaused(snap.paused);
    if (snap.over) { showEnd(snap); return; }
    react(snap);
    draw(snap, dt);
    net.guest.input(controls.take(snap));
  });
}

function play() {
  const entrants = cast(net?.start.roster ?? rosterOf(ME, mine));
  const controls = createControls(ME, level.stage);
  const button = (id) => document.getElementById(id);
  attachControls(controls, { camera, canvas: stage.renderer.domElement, buttons: { punch: button('punch'), kick: button('kick') } });
  keepAwake();
  if (net?.guest) guest(controls);
  else host(api.createMatch(entrants, level.stage), controls);
}

const goTo = (href) => () => { location.href = href; };
document.getElementById('leave').addEventListener('click', goTo('lobby.html'));
document.getElementById('bye').addEventListener('click', goTo('lobby.html'));
document.getElementById('quit').addEventListener('click', goTo('lobby.html'));
document.getElementById('again').addEventListener('click', net?.again ?? goTo(`play.html${location.search}`));
if (mine) play();
