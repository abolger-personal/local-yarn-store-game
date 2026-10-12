import { cast, seats, props, displays, items, shop, mover } from './core/state.js';
import { SHOP_RANGE, SIZED_NOTIONS, YARN_SHAPES, yarnWeight } from '../../inventory/catalog.js';
import { fits, footprint, makeDisplay, place, usableAt } from '../../inventory/grid.js';
import { familyExtent, yarnFit } from '../../inventory/yarn-geometry.js';
import { createCharacter, disposeCharacter, getSpecies, speciesIds } from '../npc.js';
import { labelOf, obstacles, seatById } from '../visit.js';
import * as THREE from 'three';
import { BOX_H, CELL, S, TALLEST_LAYERS } from './core/config.js';
import { applyDaylight, camera, controls, renderer, scene, key as sun } from './scene/stage.js';
import { COUNTER, HALF_D, HALF_W, SHADOW_LAYER, cullWalls, shadowCasters, walls } from './scene/room.js';
import { ROOM_FLOOR, applyTransform } from './scene/displays.js';
import { atlas, boxes } from './goods/items.js';
import { YARN, YARN_FIT, yarnMeshes } from './goods/yarn.js';
import { refresh, refreshAll } from './goods/paint.js';
import { cellNameFor } from './goods/stock.js';
import { movePose, YAW_STEP, applySeat, canPlaceAt, cancelMove, clearSelection, constrainPose, moveApply } from './interact/move.js';
import { onPointerDown, onPointerMove, onPointerUp } from './interact/input.js';
import { isUnder } from './ui/framing.js';
import { makeHeldNotion } from './sim/cast.js';

function* orbitSamples(target) {
  const radii = [controls.minDistance, 4, 8, controls.maxDistance];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 32)
    for (let p = 0.01; p <= controls.maxPolarAngle; p += controls.maxPolarAngle / 20)
      for (const r of radii)
        yield {
          x: target.x + r * Math.sin(p) * Math.sin(a),
          y: target.y + r * Math.cos(p),
          z: target.z + r * Math.sin(p) * Math.cos(a),
        };
}

export function checkWallCulling() {
  const home = camera.position.clone();
  let bare = 0, sunk = 0, samples = 0, fewest = walls.length;
  for (const at of orbitSamples(controls.target)) {
    camera.position.set(at.x, at.y, at.z);
    cullWalls();
    samples++;
    const shown = walls.reduce((n, w) => n + (w.visible ? 1 : 0), 0);
    fewest = Math.min(fewest, shown);
    if (shown < 2) bare++;
    if (camera.position.y <= 0) sunk++;
  }
  camera.position.copy(home);
  cullWalls();
  console.assert(bare === 0, `wall culling: ${bare} camera angles show fewer than 2 walls`);
  console.assert(sunk === 0, `wall culling: ${sunk} camera angles drop to or below the floor`);
  console.info(`wall culling: ${samples} angles swept, fewest walls visible ${fewest}, ${sunk} below floor`);
}

function checkLabels() {
  const wrong = items.filter((it) => {
    const sized = it.size != null;
    return sized !== SIZED_NOTIONS.has(it.name);
  });
  console.assert(wrong.length === 0,
    `item sizes: ${wrong.length} wrong`, wrong.slice(0, 5).map((it) => `${it.name}=${it.size}`));
  const noArt = items.filter((it) => !atlas.manifest.cells[cellNameFor(it)]);
  console.assert(noArt.length === 0, 'items with no atlas cell:',
    [...new Set(noArt.map(cellNameFor))]);
  return { wrong: wrong.length, noArt: noArt.length };
}

function checkYarnUnits() {
  const bad = items.filter((it) => it.name === 'yarn' && it.w !== yarnWeight(it.weight).size);
  console.assert(bad.length === 0, 'yarn footprints that do not match their weight:',
    bad.slice(0, 5).map((it) => `${it.weight}=${it.w}`));
}

function checkYarnHeights() {
  const noMesh = YARN_SHAPES.filter((sh) => !yarnMeshes[sh]);
  console.assert(noMesh.length === 0, 'yarn shapes with no geometry family:', noMesh);
  const floats = items.filter((it) => {
    if (it.name !== 'yarn') return false;
    const fit = yarnFit(it.shape, it.w, it.h, YARN_FIT);
    const [, uh] = familyExtent(it.shape, YARN.tier);
    return Math.abs(fit.ky * uh - it.layers * BOX_H) > 1e-6;
  });
  console.assert(floats.length === 0, 'yarn drawn height != reserved height:',
    floats.slice(0, 5).map((it) => `${it.shape}/${it.weight}`));
}

function checkStockable() {
  const tallest = Math.max(...displays.map((d) => d.g.headroom));
  const rolls = YARN_SHAPES.flatMap((sh) => SHOP_RANGE.weights
    .map((wn) => /** @type {[string, string, number]} */
      ([sh, wn, yarnFit(sh, yarnWeight(wn).size, yarnWeight(wn).size, YARN_FIT).layers])));
  const unstockable = rolls.filter((row) => row[2] > tallest);
  console.assert(unstockable.length === 0, 'yarn the shop can roll but nothing can hold:',
    unstockable.map(([sh, wn, L]) => `${sh}/${wn}=${L} layers > ${tallest}`));
  const biggest = Math.max(...rolls.map((row) => row[2]));
  console.assert(biggest === TALLEST_LAYERS,
    `tallest yarn is ${biggest} layers, config.js TALLEST_LAYERS says ${TALLEST_LAYERS}`);
  const tile = displays.find((d) => d.solid === false);
  const g = makeDisplay(1, 1, { headroom: tile?.g.headroom ?? 0 });
  const keys = footprint(g, 0, [0, 0], [1, 1]);
  place(g, keys, 0, biggest);
  console.assert(fits(g, keys, biggest),
    `floor: two ${biggest}-layer items do not stack under its ${g.headroom}-layer headroom`);
}

export function checkItemSizes() {
  const { wrong, noArt } = checkLabels();
  checkYarnUnits();
  checkYarnHeights();
  checkStockable();
  console.assert(items.length >= S.stockCount,
    `stock: asked for ${S.stockCount} boxes, only ${items.length} landed`);
  const kinds = {};
  for (const it of items) kinds[it.name] = (kinds[it.name] ?? 0) + 1;
  console.info(`stock: ${items.length} items —`,
    Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', '),
    `| ${wrong} wrong sizes, ${noArt} missing art`);
}

export function checkSlotMasking() {
  const report = displays.map((d) => {
    let usable = 0, total = 0;
    for (let s = 0; s < d.g.shelves; s++)
      for (let r = 0; r < d.g.rows; r++)
        for (let c = 0; c < d.g.cols; c++) { total++; if (usableAt(d.g, s, c, r)) usable++; }
    return { id: d.id, form: d.form, usable, total };
  });
  const dead = report.filter((x) => x.usable === 0);
  console.assert(dead.length === 0,
    'slot masking: display(s) left with no usable slots', dead.map((x) => x.id));
  const carved = report.filter((x) => x.usable < x.total);
  const which = carved.length ? ` — ${carved.map((x) => `${x.id} ${x.usable}/${x.total}`).join(', ')}` : '';
  console.info(`slot masking: ${carved.length} of ${report.length} displays carved${which}`);
}

function floorCellAt(d, c, r) {
  const x0 = -(ROOM_FLOOR.cols * CELL) / 2, z0 = -(ROOM_FLOOR.rows * CELL) / 2;
  return {
    fx: (d.x + (c + 0.5) * CELL - (d.g.cols * CELL) / 2 - x0) / CELL - 0.5,
    fz: (d.z + (r + 0.5) * CELL - (d.g.rows * CELL) / 2 - z0) / CELL - 0.5,
  };
}

function claimFloorCell(d, c, r, claimed, fails) {
  const { fx, fz } = floorCellAt(d, c, r);
  const ix = Math.round(fx), iz = Math.round(fz);
  const key = `${ix},${iz}`;
  if (Math.abs(fx - ix) > 1e-6 || Math.abs(fz - iz) > 1e-6)
    fails.push(`${d.id} cell ${c},${r} sits off the floor lattice`);
  else if (ix < 0 || iz < 0 || ix >= ROOM_FLOOR.cols || iz >= ROOM_FLOOR.rows)
    fails.push(`${d.id} cell ${c},${r} sits outside the floor`);
  if (claimed.has(key)) fails.push(`${d.id} and ${claimed.get(key)} both claim floor cell ${key}`);
  claimed.set(key, d.id);
}

export function checkFloorTiling() {
  const fails = [];
  const tiles = displays.filter((d) => d.form === 'floor');
  const claimed = new Map();
  for (const d of tiles)
    for (let r = 0; r < d.g.rows; r++)
      for (let c = 0; c < d.g.cols; c++) claimFloorCell(d, c, r, claimed, fails);
  if (tiles.length < 2) fails.push(`the floor is ${tiles.length} pile(s) — it is not cut up at all`);
  console.assert(fails.length === 0, 'floor tiling:', fails.slice(0, 8));
  console.info(`floor tiling: ${tiles.length} piles holding ${claimed.size} of `
    + `${ROOM_FLOOR.cols * ROOM_FLOOR.rows} floor cells`);
}

function checkStaysInRoom(m, fails) {
  for (const [x, z] of [[99, 0], [-99, 0], [0, 99], [0, -99], [99, -99], [-99, 99]]) {
    for (const yaw of [0, YAW_STEP, 2 * YAW_STEP]) {
      const q = constrainPose(m, x, z, yaw);
      if (Math.abs(q.x) > HALF_W || Math.abs(q.z) > HALF_D) fails.push(`${m.id} dragged to ${x},${z} left the room`);
    }
  }
  if (canPlaceAt(m, { x: NaN, z: 0, yaw: 0 })) fails.push(`${m.id} was allowed a NaN pose`);
}

function checkBackToBack(fails) {
  const [a, b] = displays.filter((d) => d.kind === 'shelf');
  if (!b) return;
  let pairs = 0;
  for (let x = -4; x <= 4; x += 0.25)
    for (let z = -3; z <= 3; z += 0.25) {
      if (!canPlaceAt(a, { x, z, yaw: 0 })) continue;
      moveApply(a, x, z, 0);
      if (canPlaceAt(b, { x, z: z - a.d, yaw: Math.PI })) fails.push(`shelves overlapped back to back at ${x},${z}`);
      const q = constrainPose(b, x, z - a.d - 0.07, Math.PI);
      if (q.x === x && q.z === z - a.d - 0.07 && canPlaceAt(b, q)) pairs++;
    }
  if (!pairs) fails.push('nowhere in the shop can two shelves stand back to back');
}

function checkDetents(pile, fails) {
  for (const raw of [0.1, 0.9, -2.2, 3.9]) {
    const q = constrainPose(pile, pile.x, pile.z, raw);
    if (Math.abs(q.yaw / YAW_STEP - Math.round(q.yaw / YAW_STEP)) > 1e-9)
      fails.push(`yaw ${raw} snapped to ${q.yaw}, not a 45° detent`);
  }
}

function checkStockTravels(pile, fails) {
  const index = items.findIndex((it) => it.display === pile.id && !it.gone && !it.held && it.name !== 'yarn');
  if (index === -1 || !boxes) return;
  const m = new THREE.Matrix4(), before = new THREE.Vector3(), after = new THREE.Vector3();
  boxes.getMatrixAt(index, m); before.setFromMatrixPosition(m);
  applyTransform(pile, pile.x + 0.5, pile.z - 0.25, pile.yaw);
  refresh(index);
  boxes.getMatrixAt(index, m); after.setFromMatrixPosition(m);
  if (Math.abs(after.x - before.x - 0.5) > 1e-6 || Math.abs(after.z - before.z + 0.25) > 1e-6)
    fails.push(`stock did not travel with ${pile.id}`);
}

function checkPileRefusals(pile, fails) {
  if (canPlaceAt(pile, { x: HALF_W + 1, z: 0, yaw: 0 })) fails.push('a display outside the room was allowed');
  if (canPlaceAt(pile, { x: COUNTER.x, z: COUNTER.z, yaw: 0 })) fails.push('a display inside the counter was allowed');
  if (canPlaceAt(pile, { x: 0, z: HALF_D - 0.45, yaw: 0 })) fails.push('a display across the doorway was allowed');
}

function checkChair(chair, pile, fails) {
  if (!canPlaceAt(chair, constrainPose(chair, chair.x, chair.z, chair.facing)))
    fails.push('a chair is illegal where it already stands');
  if (canPlaceAt(chair, { x: COUNTER.x, z: COUNTER.z, yaw: 0 })) fails.push('a chair inside the counter was allowed');
  if (pile && canPlaceAt(chair, { x: pile.x, z: pile.z, yaw: 0 })) fails.push('a chair on top of a display was allowed');
  if (canPlaceAt(chair, constrainPose(chair, 99, 99, 0)) === false) fails.push('a chair cannot reach the room corner');
  applySeat(chair, chair.x + 0.3, chair.z, chair.facing);
  if (Math.abs(chair.mesh.position.x - chair.x) > 1e-9) fails.push('chair mesh did not follow the seat');
  const live = shop.world && seatById(shop.world, chair.id);
  if (live && Math.abs(live.x - chair.x) > 1e-9) fails.push('the sim did not learn the chair moved');
}

function checkProps(pile, fails) {
  for (const p of props) {
    if (!canPlaceAt(p, constrainPose(p, p.x, p.z, p.yaw))) fails.push(`${p.id} is illegal where it stands`);
  }
  const p = props[0];
  if (!p) return;
  if (canPlaceAt(p, { x: COUNTER.x, z: COUNTER.z, yaw: 0 })) fails.push('a prop inside the counter was allowed');
  if (pile && canPlaceAt(p, { x: pile.x, z: pile.z, yaw: 0 })) fails.push('a prop on top of a display was allowed');
  moveApply(p, p.x, p.z - 0.3, p.yaw);
  if (Math.abs(p.mesh.position.z - p.z) > 1e-9) fails.push('prop mesh did not follow the move');
  if (shop.world && !obstacles(shop.world).some((o) => o.x === p.x && o.z === p.z))
    fails.push('the sim does not route round a moved prop');
}

function nearbySpot(m) {
  const from = movePose(m);
  for (const step of [0.5, 0.8, 1.2])
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = constrainPose(m, from.x + dx * step, from.z + dz * step, from.yaw);
      if (Math.hypot(q.x - from.x, q.z - from.z) > 0.2 && canPlaceAt(m, q)) return q;
    }
  return null;
}

function overheadInMoveMode() {
  const was = { at: camera.position.clone(), q: camera.quaternion.clone(), mode: S.moveMode };
  camera.position.set(0, 14, 0.01);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  S.moveMode = true;
  return () => {
    clearSelection();
    S.moveMode = was.mode;
    camera.position.copy(was.at);
    camera.quaternion.copy(was.q);
    camera.updateMatrixWorld();
  };
}

function floorEvent(type, x, z) {
  const v = new THREE.Vector3(x, 0, z).project(camera);
  return { type, clientX: (v.x + 1) / 2 * innerWidth, clientY: (1 - v.y) / 2 * innerHeight,
    target: renderer.domElement, button: 0, pointerId: 99, pointerType: 'mouse', stopPropagation() {} };
}

function clickFloor(x, z) {
  scene.updateMatrixWorld();
  onPointerDown(floorEvent('pointerdown', x, z));
  onPointerUp(floorEvent('pointerup', x, z));
}

function clickCarry(m, from, to, hover) {
  clickFloor(from.x, from.z);
  if (mover.m !== m) return false;
  if (hover) onPointerMove(floorEvent('pointermove', to.x, to.z));
  clickFloor(to.x, to.z);
  return true;
}

const near = (m, q) => Math.hypot(m.x - q.x, m.z - q.z) < 0.02;

function checkClickMoves(m, hover, fails) {
  const from = movePose(m), to = nearbySpot(m);
  if (!to) { fails.push(`${m.id} has nowhere legal to go`); return; }
  if (!clickCarry(m, from, to, hover)) { fails.push(`a click did not pick up ${m.id}`); return; }
  if (mover.m) fails.push(`the second click did not set ${m.id} down`);
  if (!near(m, to)) fails.push(`${m.id} was clicked to ${to.x.toFixed(2)},${to.z.toFixed(2)}, is at ${m.x.toFixed(2)},${m.z.toFixed(2)}`);
  if (!(Math.abs(m.x) <= HALF_W && Math.abs(m.z) <= HALF_D)) fails.push(`${m.id} was set down outside the room`);
  clickFloor(to.x, to.z);
  onPointerMove(floorEvent('pointermove', from.x, from.z));
  cancelMove();
  if (mover.m || !near(m, to) || movePose(m).yaw !== to.yaw) fails.push(`Escape did not put ${m.id} back`);
  clickCarry(m, to, from, true);
}

function checkClickToMove(pieces, fails) {
  const undo = overheadInMoveMode();
  for (const [m, hover] of pieces) checkClickMoves(m, hover, fails);
  undo();
}

// inventory/DISPLAYS.md rule 10
export function checkDisplayMoves() {
  const fails = [];
  const saved = [...displays, ...seats, ...props].map((m) => ({ m, ...movePose(m) }));
  const shelf = displays.find((d) => d.form === 'wall-shelf');
  const pile = displays.find((d) => d.kind === 'pile' && d.solid !== false);
  const chair = seats[0];

  checkClickToMove([[chair, true], [shelf, false]].filter(([m]) => m), fails);
  for (const m of [shelf, pile]) if (m) checkStaysInRoom(m, fails);
  checkBackToBack(fails);
  if (pile) { checkDetents(pile, fails); checkStockTravels(pile, fails); checkPileRefusals(pile, fails); }
  if (chair) checkChair(chair, pile, fails);
  checkProps(pile, fails);

  for (const s of saved) moveApply(s.m, s.x, s.z, s.yaw);
  refreshAll();
  console.assert(fails.length === 0, 'display moves:', fails);
  console.info(`display moves: ${fails.length ? `${fails.length} FAILED` : 'ok'}`);
}

function checkNobodyStartsCarrying(fails) {
  for (const rec of cast) {
    if (rec.npc.carrying) fails.push(`${rec.npc.name} spawned carrying ${labelOf(rec.npc.carrying)}`);
    if (rec.built.held?.visible) fails.push(`${rec.npc.name} spawned with the skein showing`);
    if (rec.carriedMesh) fails.push(`${rec.npc.name} spawned with a notion in hand`);
  }
}

function checkHeldIsHideable(fails) {
  const kit = getSpecies(speciesIds()[0]);
  const probe = createCharacter(
    { ...structuredClone(kit.defaults), holdItem: true, mergeMeshes: true }, kit);
  let meshes = 0;
  probe.held?.traverse((n) => { if (n.isMesh) meshes++; });
  if (!meshes) fails.push('the held item was merged away — .visible can no longer hide it');
  probe.held.visible = false;
  let shown = 0;
  probe.root.traverse((n) => { if (n.isMesh && n.visible && !isUnder(n, probe.held)) shown++; });
  if (!shown) fails.push('hiding the held item hid the whole character');
  disposeCharacter(probe);
  return meshes;
}

function checkHeldYarnSize(fails) {
  for (const shape of YARN_SHAPES) {
    const w = yarnWeight(SHOP_RANGE.weights[0]).size;
    const held = makeHeldNotion({ name: 'yarn', shape, w, h: w, color: '#888' });
    const unit = held.children[0];
    const want = yarnFit(shape, w, w, YARN_FIT);
    if (Math.abs(unit.scale.x - want.k) > 1e-9)
      fails.push(`held ${shape} is ${unit.scale.x.toFixed(4)} wide, shelf draws it ${want.k.toFixed(4)}`);
    held.traverse((n) => { if (n.userData.owned) n.material.dispose(); });
  }
}

export function checkHeldItem() {
  const fails = [];
  checkNobodyStartsCarrying(fails);
  checkHeldYarnSize(fails);
  const meshes = checkHeldIsHideable(fails);
  console.assert(fails.length === 0, 'held item:', fails);
  console.info(`held item: ${fails.length
    ? `${fails.length} FAILED` : `ok (${meshes} mesh in hand, hideable)`}`);
}

function floorInSun(t) {
  const ray = new THREE.Raycaster();
  ray.layers.set(SHADOW_LAYER);
  applyDaylight(t);
  const toSun = sun.position.clone().normalize();
  let n = 0, total = 0;
  for (let x = -HALF_W + 0.2; x < HALF_W; x += 0.2)
    for (let z = -HALF_D + 0.2; z < HALF_D; z += 0.2) {
      ray.set(new THREE.Vector3(x, 0.01, z), toSun);
      total++;
      if (!ray.intersectObjects(shadowCasters, false).length) n++;
    }
  return n / total;
}

// STORE-SCENE.md §Daylight
export function checkSunPools() {
  const morning = floorInSun(0), afternoon = floorInSun(1);
  applyDaylight(S.followDay ? shop.dayT : S.timeOfDay);
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  console.assert(morning > 0.7, `sun: the morning lights only ${pct(morning)} of the floor`);
  console.assert(afternoon < 0.3 && afternoon > 0.03,
    `sun: the afternoon lights ${pct(afternoon)} of the floor — want a few window pools`);
  console.info(`sun: morning lights ${pct(morning)} of the floor, afternoon ${pct(afternoon)} (window pools)`);
}
