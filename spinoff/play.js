import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { attachControls, createControls } from './controls.js';
import * as match from './fake-match.js';
import { MOVE_POSES, buildFighter, entrantOf, loadFighter, newFighter, setFur, stepFighter } from './fighter.js';
import { BRICK, STAGE, TICK_HZ } from './match.js';
import { makeStage } from './stage.js';

/** @typedef {import('./match.js').Snapshot} Snapshot @typedef {import('./match.js').FighterState} FighterState */
/** @typedef {import('./match.js').DonutLook} DonutLook */

/** @type {import('./match.js').MatchApi} */
const api = match;

setGeometryDetail('med');

const ME = 'me', DUMMY = 'dummy';
const GINGER = { heroes: '#b8733a', badGuys: '#4a2a1a' };
const DONUT_R = 0.11;
const SHELF = { cols: 6, gap: 0.26, row: 0.3, rows: 4 };
const VIEW_W = 7.2, VIEW_H = 3.4, VIEW = new THREE.Vector3(0, 0.3, 1).normalize();
const TURN = Math.PI / 2 - 0.45;

const mine = loadFighter();
if (!mine) location.replace('choose.html');

const materials = new Map();
const mat = (color) => materials.get(color) ?? materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.7 })).get(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

function badGuyFighter() {
  const f = setFur(newFighter('lion'), '#8f8f96');
  f.look = { ...f.look, hatColor: '#2a2030', capeColor: '#3b2152', bagColor: '#1d1a20', gloves: '#4b2a6b' };
  return f;
}

const TUBE = 0.42;
const DONUT_GEO = {
  dough: new THREE.TorusGeometry(1 - TUBE, TUBE, 12, 24),
  icing: new THREE.TorusGeometry(1 - TUBE, TUBE * 0.9, 10, 24).scale(1, 1, 0.55).translate(0, 0, TUBE * 0.6),
  stripe: new THREE.BoxGeometry(2.1, TUBE * 0.7, TUBE * 0.5).rotateZ(0.45).translate(0, 0, TUBE * 1.05),
};

/** Upright, frosting toward the camera. @param {DonutLook} look */
function donutMesh(look, r = DONUT_R) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(DONUT_GEO.dough, mat(look.dough)), new THREE.Mesh(DONUT_GEO.icing, mat(look.frosting)));
  if (look.stripe) g.add(new THREE.Mesh(DONUT_GEO.stripe, mat('#f1e4ff')));
  g.scale.setScalar(r);
  return g;
}

function platformMesh({ x0, x1, y }, i) {
  const thick = i === 0 ? 0.7 : 0.24, depth = i === 0 ? 2.2 : 1.4, g = new THREE.Group();
  const slab = box(x1 - x0, thick, depth, GINGER.heroes);
  slab.position.y = -thick / 2;
  const icing = box(x1 - x0 + 0.04, 0.08, depth + 0.04, '#fff4e6');
  icing.position.y = -0.03;
  g.add(slab, icing);
  g.position.set((x0 + x1) / 2, y, 0);
  return g;
}

function shelfFrame({ x, y }) {
  const w = SHELF.cols * SHELF.gap + 0.12, h = SHELF.rows * SHELF.row + 0.1, g = new THREE.Group();
  const back = box(w, h, 0.08, '#9a5b2c');
  back.position.set(0, h / 2, -0.2);
  g.add(back);
  for (let row = 0; row <= SHELF.rows; row++) {
    const plank = box(w, 0.07, 0.42, '#7a4520');
    plank.position.y = row * SHELF.row + 0.035;
    g.add(plank);
  }
  g.position.set(x, y, 0);
  return g;
}

function fillShelf(shelf, donuts) {
  const g = new THREE.Group();
  donuts.forEach((look, i) => {
    const d = donutMesh(look);
    d.position.set((i % SHELF.cols - (SHELF.cols - 1) / 2) * SHELF.gap, Math.floor(i / SHELF.cols) * SHELF.row + 0.07 + DONUT_R, 0);
    g.add(d);
  });
  g.position.set(shelf.x, shelf.y, 0);
  return g;
}

const stage = makeStage(document.getElementById('stage'), { background: '#ffe3f0' });
const { scene, camera } = stage;
STAGE.platforms.forEach((p, i) => scene.add(platformMesh(p, i)));
STAGE.shelves.forEach((s) => scene.add(shelfFrame(s)));

const iced = { heroes: mine?.params.bodyColor ?? '#ff3b7f', badGuys: '#5b2a86' };

function brickMesh(b) {
  const g = new THREE.Group();
  g.add(box(BRICK, BRICK, 0.5, GINGER[b.team]));
  const icing = new THREE.Mesh(new THREE.BoxGeometry(BRICK * 0.84, BRICK * 0.84, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  icing.position.z = 0.27;
  const cracks = [[-0.05, 0.06, 0.7], [0.07, -0.06, -0.6]].map(([x, y, a]) => {
    const c = box(BRICK * 0.6, 0.05, 0.06, '#24130a');
    c.position.set(x, y, 0.31);
    c.rotation.z = a;
    return c;
  });
  g.add(icing, ...cracks);
  g.position.set(b.x + BRICK / 2, b.y + BRICK / 2, 0);
  return { g, icing, cracks };
}

function drawBrick(m, b) {
  const hurt = 1 - b.hits / b.maxHits;
  m.icing.material.color.set(iced[b.team]).lerp(new THREE.Color(GINGER[b.team]), hurt * 0.6);
  m.icing.scale.setScalar(1 - hurt * 0.35);
  for (const c of m.cracks) c.visible = hurt > 0;
  m.g.position.set(b.x + BRICK / 2, b.y + BRICK / 2, 0);
}

/** Keeps one drawn thing per id in `list`, removing the ones that left. */
function sync(drawn, list, make, update) {
  const seen = new Set();
  for (const item of list) {
    seen.add(item.id);
    if (!drawn.has(item.id)) drawn.set(item.id, make(item));
    update(drawn.get(item.id), item);
  }
  for (const [id, m] of drawn) {
    if (seen.has(id)) continue;
    scene.remove(m.g);
    drawn.delete(id);
  }
}

const added = (m) => { scene.add(m.g); return m; };
const fighters = new Map(), donuts = new Map(), bricks = new Map(), shelves = new Map();

function poseOf(f) {
  if (f.move === 'punch' || f.move === 'kick') return f.step < 0.7 ? MOVE_POSES[f.move][f.facing] : POSES.rest;
  if (f.move === 'hurt' || f.move === 'launched') return MOVE_POSES.hurt;
  return f.onGround ? POSES.rest : MOVE_POSES.air;
}

function carry(m, look) {
  const key = JSON.stringify(look);
  if (m.carryKey === key) return;
  if (m.carried) scene.remove(m.carried);
  m.carryR = m.built.params.headRadius * 0.7;
  m.carried = look && donutMesh(look, m.carryR);
  if (m.carried) scene.add(m.carried);
  m.carryKey = key;
}

/** @param {FighterState} f */
function drawFighter(m, f, dt) {
  m.g.position.set(f.x, f.y, 0);
  m.g.rotation.y += (f.facing * TURN - m.g.rotation.y) * Math.min(1, dt * 14);
  stepFighter(m.built, dt, poseOf(f), f.onGround ? Math.abs(f.vx) : 0);
  carry(m, f.carrying);
  if (!m.carried) return;
  const P = m.built.params;
  m.g.updateMatrixWorld(true);
  m.carried.position.copy(m.built.chest.localToWorld(new THREE.Vector3(0, P.torsoH * 1.1, -(P.torsoD + m.carryR))));
}

function drawShelf(m, s) {
  const key = JSON.stringify(s.donuts);
  if (m.key === key) return;
  if (m.g) scene.remove(m.g);
  Object.assign(m, { key, g: fillShelf(s, s.donuts) });
  scene.add(m.g);
}

const hud = (id, text) => {
  const el = document.getElementById(id);
  if (el.textContent !== text) el.textContent = text;
};

/** @param {Snapshot} snap */
function draw(snap, dt) {
  sync(fighters, snap.fighters, () => null, (m, f) => drawFighter(m, f, dt));
  sync(donuts, snap.donuts, (d) => added({ g: donutMesh(d.look) }), (m, d) => m.g.position.set(d.x, d.y + DONUT_R, 0));
  sync(bricks, snap.bricks, (b) => added(brickMesh(b)), drawBrick);
  sync(shelves, snap.shelves.map((s) => ({ ...s, id: s.team })), () => ({}), drawShelf);
  hud('clock', String(Math.ceil(snap.secondsLeft)));
  for (const s of snap.shelves) hud(`count-${s.team}`, String(s.donuts.length));
  follow(snap.fighters.find((f) => f.id === ME), dt);
}

const aim = new THREE.Vector3(-6, 1, 0);

function follow(me, dt) {
  if (me) aim.lerp(new THREE.Vector3(THREE.MathUtils.clamp(me.x, -6.5, 6.5), 0.9 + me.y * 0.5, 0), Math.min(1, dt * 4));
  const vFov = THREE.MathUtils.degToRad(camera.fov) / 2, hFov = Math.atan(Math.tan(vFov) * camera.aspect);
  const dist = Math.max(VIEW_W / 2 / Math.tan(hFov), VIEW_H / 2 / Math.tan(vFov));
  camera.position.copy(aim).addScaledVector(VIEW, dist);
  camera.lookAt(aim);
}

function cast() {
  /** @type {{ id: string, team: import('./match.js').Team, f: import('./fighter.js').Fighter, dummy: boolean }[]} */
  const roster = [{ id: ME, team: 'heroes', f: mine, dummy: false }, { id: DUMMY, team: 'badGuys', f: badGuyFighter(), dummy: true }];
  return roster.map(({ id, team, f, dummy }) => {
    const built = buildFighter(f), g = new THREE.Group();
    const entrant = entrantOf(f, built, { id, team, dummy });
    g.add(built.root);
    scene.add(g);
    fighters.set(id, { g, built });
    return entrant;
  });
}

if (mine) {
  const state = api.createMatch(cast());
  const controls = createControls(ME);
  const button = (id) => document.getElementById(id);
  attachControls(controls, { camera, canvas: stage.renderer.domElement, buttons: { punch: button('punch'), kick: button('kick') } });
  let snap = api.snapshot(state), acc = 0;
  stage.run((dt) => {
    for (acc += dt; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
      api.tick(state, { [ME]: controls.take(snap) });
      snap = api.snapshot(state);
    }
    draw(snap, dt);
  });
}
