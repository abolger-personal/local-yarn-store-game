import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { playSparkle, stepSparkle } from '../characters/sparkle.js';
import { attachControls, createControls } from './controls.js';
import * as match from './sim.js';
import { MOVE_POSES, buildFighter, entrantOf, loadFighter, newFighter, setFur, stepFighter } from './fighter.js';
import { RIOT, confettiMats, createFx, makeShadow, placeShadow, riotSparkleOn } from './fx.js';
import { BRICK, STAGE, TICK_HZ } from './match.js';
import { makeStage } from './stage.js';
import { GINGER, PIPING, brickMesh, damageBrick, donutMesh, mat, sameLook, slabGeometry } from './treats.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').HitEvent} HitEvent @typedef {import('./match.js').DonutEvent} DonutEvent */

/** @type {import('./match.js').MatchApi} */
const api = match;

setGeometryDetail('med');

const ME = 'me', DUMMY = 'dummy';
const SHELF = { cols: 6, gap: 0.3, row: 0.32, rows: 4, r: 0.13, depth: 0.26 };
const LOOSE_R = 0.2, ICING = '#fff3f8', FACE_CAMERA = -0.5;
const CAMERA = { pitch: THREE.MathUtils.degToRad(35), viewW: 7, viewH: 4.8, xMax: 6 };
const BACK = new THREE.Vector3(0, Math.sin(CAMERA.pitch), Math.cos(CAMERA.pitch));
const TIMERS = { squash: 0.22, no: 0.6, joy: 0.9, pop: 0.35, pulse: 0.45, wobble: 0.35, hop: 0.4 };
const FIGHTER_TIMERS = ['squash', 'no', 'joy', 'pop', 'pulse'];
const NONE = Object.freeze([]);
const _v = new THREE.Vector3(), _goal = new THREE.Vector3();

const mine = loadFighter();
if (!mine) location.replace('choose.html');

const stage = makeStage(document.getElementById('stage'), { background: '#ffe3f0' });
const { scene, camera } = stage;
const fx = createFx(scene, camera);

const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.8));

function badGuyFighter() {
  const f = setFur(newFighter('lion'), '#8f8f96');
  f.look = { ...f.look, hatColor: '#2a2030', capeColor: '#3b2152', bagColor: '#1d1a20', gloves: '#4b2a6b' };
  return f;
}

/** Gingerbread with an icing top, or the gumdrop hill; raised floors are solid to the ground. */
function floorMesh(f, i) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, g = new THREE.Group();
  g.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
  if (f.y > 0 && f.z0 > STAGE.backWall) {
    g.add(new THREE.Mesh(slabGeometry(w, d, f.y, 0.7, 0.22), mat('#2fd17a', 0.3)));
    return g;
  }
  const base = i === 0 ? 0.7 : f.y;
  const body = new THREE.Mesh(slabGeometry(w, d, base, 0.12), mat(GINGER.heroes, 0.8));
  const top = new THREE.Mesh(slabGeometry(w + 0.08, d + 0.08, 0.08, 0.16, 0.03), mat(ICING, 0.45));
  body.position.y = f.y - base;
  top.position.y = f.y - 0.07;
  g.add(body, top);
  return g;
}

/** Instanced bits laid out with the R2 sequence, so they spread evenly without a random seed. */
function scatter(geometry, material, n, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, n), m = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    place(m, i, (i * 0.618034) % 1, (i * 0.7548776) % 1);
    m.updateMatrix();
    mesh.setMatrixAt(i, m.matrix);
    mesh.setColorAt(i, c.set(RIOT[i % RIOT.length]));
  }
  return mesh;
}

function groundTreats() {
  const [ground] = STAGE.floors, w = ground.x1 - ground.x0;
  const sprinkles = scatter(new THREE.CapsuleGeometry(0.03, 0.1, 2, 6), mat('#ffffff', 0.5), 110, (m, i, u, v) => {
    m.position.set(ground.x0 + 0.2 + u * (w - 0.4), 0.025, ground.z0 + 0.2 + v * (ground.z1 - ground.z0 - 0.4));
    m.rotation.set(Math.PI / 2, 0, i * 2.4);
  });
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), mat(ICING, 0.45), Math.floor(w / 0.3));
  for (let i = 0; i < drips.count; i++) {
    _goal.set(ground.x0 + 0.15 + i * 0.3, -0.06, ground.z1 + 0.02);
    drips.setMatrixAt(i, new THREE.Matrix4().compose(_goal, new THREE.Quaternion(), _v.set(1, i % 3 ? 1.3 : 2, 0.7)));
  }
  return [sprinkles, drips];
}

function backdrop() {
  const wall = box(26, 7, 0.4, '#f7bcd6');
  wall.position.set(0, 2.8, STAGE.backWall - 0.2);
  const skirting = box(26, 0.5, 0.2, GINGER.heroes);
  skirting.position.set(0, 0.25, STAGE.backWall - 0.05);
  return [wall, skirting];
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

scene.add(...STAGE.floors.map(floorMesh), ...groundTreats(), ...backdrop(), ...STAGE.shelves.map(shelfFrame));

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
const backOut = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

function poseOf(m, f) {
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
  m.g.rotation.y = m.yaw + Math.sin(no * 26) * 0.3 * no;
  m.g.position.set(f.x + m.recoil.x * s, f.y, f.z + m.recoil.z * s);
  m.g.scale.set(1 + 0.2 * s, 1 - 0.28 * s, 1 + 0.2 * s);
}

function carry(m, look) {
  if (sameLook(m.carryLook, look)) return;
  if (m.carried) scene.remove(m.carried);
  m.carryLook = look;
  m.carried = look ? donutMesh(look) : null;
  if (m.carried) scene.add(m.carried);
}

/** REUSE-SPEC.md §Mode: oversized, out of the bag over the shoulder, facing the camera. */
function placeCarried(m) {
  const P = m.built.params, { pop, pulse } = m.t;
  m.g.updateMatrixWorld(true);
  m.built.chest.localToWorld(_v.set(0, P.torsoH * 1.1, -(P.torsoD + m.carryR)));
  m.carried.position.set(_v.x, _v.y + 0.4 * pop, _v.z);
  m.carried.quaternion.copy(camera.quaternion);
  m.carried.scale.setScalar(m.carryR * (1 + 0.8 * Math.sin(Math.PI * pulse)) * backOut(1 - pop));
}

/** @param {FighterState} f */
function drawFighter(m, f, dt) {
  tickDown(m.t, FIGHTER_TIMERS, dt);
  placeFighter(m, f, dt);
  stepFighter(m.built, dt, poseOf(m, f), f.onGround && f.move !== 'blocked' ? Math.hypot(f.vx, f.vz) : 0);
  carry(m, f.carrying);
  if (m.carried) placeCarried(m);
  placeShadow(m.shadow, f.x, f.y, f.z, 0.42);
  if (m.sparkle) stepSparkle(m.sparkle, dt);
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
  placeShadow(m.shadow, d.x, d.y + hop, d.z, LOOSE_R * 1.2);
}

function newBrick(b) {
  const m = { ...brickMesh(b), team: b.team, shadow: makeShadow(scene) };
  scene.add(m.g);
  return m;
}

function drawBrick(m, b, dt) {
  damageBrick(m, b);
  m.wobble = Math.max(0, m.wobble - dt / TIMERS.wobble);
  m.g.position.set(b.x + BRICK / 2, b.y + BRICK / 2, b.z + BRICK / 2);
  m.g.rotation.z = Math.sin(m.wobble * 40) * 0.15 * m.wobble;
  placeShadow(m.shadow, m.g.position.x, b.y, m.g.position.z, BRICK * 0.6);
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
  follow(snap.fighters.find((f) => f.id === ME), dt);
  fx.step(dt);
}

const aim = new THREE.Vector3(-4.5, 0.8, 0.1);

/** Down at the floor at CAMERA.pitch, following your fighter in x and z, about a third of the stage wide. */
function follow(me, dt) {
  if (me) aim.lerp(_goal.set(THREE.MathUtils.clamp(me.x, -CAMERA.xMax, CAMERA.xMax), 0.8 + me.y * 0.4, -0.1 + me.z * 0.4), Math.min(1, dt * 4));
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
  const icing = [mat(PIPING, 0.5), m.flood.material];
  fx.burst(h, icing, 4, 1.4);
  if (h.broke) fx.burst(h, [mat(GINGER[m.team], 0.8), ...icing], 14, 2.2);
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
  if (e.kind === 'steal') fx.sparkle(e.x, e.y + 0.7, e.z, 4);
  if (e.kind === 'bank') fx.burst({ x: e.x, y: e.y + 1.6, z: e.z }, confettiMats, 30, 2.4);
  if (e.kind === 'bank') bounce(m?.team);
  if (!m) return;
  if (e.kind === 'pickup') playSparkle((m.sparkle ??= riotSparkleOn(m.built)));
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

function cast() {
  /** @type {{ id: string, team: import('./match.js').Team, f: import('./fighter.js').Fighter, dummy: boolean }[]} */
  const roster = [{ id: ME, team: 'heroes', f: mine, dummy: false }, { id: DUMMY, team: 'badGuys', f: badGuyFighter(), dummy: true }];
  return roster.map(({ id, team, f, dummy }) => {
    const built = buildFighter(f), g = new THREE.Group();
    const entrant = entrantOf(f, built, { id, team, dummy });
    g.add(built.root);
    scene.add(g);
    const t = Object.fromEntries(FIGHTER_TIMERS.map((k) => [k, 0]));
    fighters.set(id, { g, built, team, t, yaw: 0, recoil: new THREE.Vector3(), pose: {}, shadow: makeShadow(scene), carryR: built.params.headRadius * 0.7 });
    endPicture(entrant);
    return entrant;
  });
}

function play() {
  const state = api.createMatch(cast());
  const controls = createControls(ME);
  const button = (id) => document.getElementById(id);
  attachControls(controls, { camera, canvas: stage.renderer.domElement, buttons: { punch: button('punch'), kick: button('kick') } });
  let snap = api.snapshot(state), acc = 0;
  stage.run((dt) => {
    if (snap.over) { showEnd(snap); return; }
    for (acc += dt; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
      api.tick(state, { [ME]: controls.take(snap) });
      snap = api.snapshot(state);
      react(snap);
    }
    draw(snap, dt);
  });
}

const goTo = (href) => () => { location.href = href; };
document.getElementById('leave').addEventListener('click', goTo('lobby.html'));
document.getElementById('bye').addEventListener('click', goTo('lobby.html'));
document.getElementById('again').addEventListener('click', goTo('play.html'));
if (mine) play();
