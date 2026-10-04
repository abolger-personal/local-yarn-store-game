// Self-checks. Diagnostics only: nothing here is on the render path.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { cast, seats, props, displays, items, shop } from './core/state.js';
import { SHOP_RANGE, SIZED_NOTIONS, YARN_SHAPES, yarnWeight } from '../../inventory/catalog.js';
import { fits, footprint, makeDisplay, place, usableAt } from '../../inventory/grid.js';
import { familyExtent, yarnFit } from '../../inventory/yarn-geometry.js';
import { createCharacter, disposeCharacter, getSpecies, speciesIds } from '../npc.js';
import { labelOf, obstacles, seatById } from '../visit.js';
import * as THREE from 'three';
import { BOX_H, CELL, S, TALLEST_LAYERS } from './core/config.js';
import { applyDaylight, camera, controls, key as sun } from './scene/stage.js';
import { COUNTER, HALF_D, HALF_W, SHADOW_LAYER, cullWalls, shadowCasters, walls } from './scene/room.js';
import { ROOM_FLOOR, applyTransform } from './scene/displays.js';
import { atlas, boxes } from './goods/items.js';
import { YARN, YARN_FIT, yarnMeshes } from './goods/yarn.js';
import { refresh, refreshAll } from './goods/paint.js';
import { cellNameFor } from './goods/stock.js';
import { movePose, YAW_STEP, applySeat, canPlaceAt, constrainPose, moveApply } from './interact/move.js';
import { isUnder } from './ui/framing.js';
import { makeHeldNotion } from './sim/cast.js';

// ---------------------------------------------------------------- framing
/**
 * Self-check: sweep every camera position the controls allow and assert the two things that can
 * actually go wrong.
 *
 * Note what is NOT asserted: "no visible wall shows its outside face" is unfalsifiable here, since
 * cullWalls DEFINES visible as exactly that test. The failures worth catching are the ones on
 * either side of it — hiding so eagerly that the shop becomes an open plane again, and letting the
 * camera under the floor, where the cutaway would show you the underside of the whole set.
 */
/** Every camera angle the controls allow, as {x,y,z} positions around the orbit target. */
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

/**
 * Self-check: no item carries a size its kind cannot have, and every hook has one.
 * The failure this catches is silent — a number appears on a box that should have none, and the
 * only symptom is the player reading an attribute that does not exist.
 */
/**
 * A millimetre size belongs to hooks and needles and to nothing else — a number on a ball of yarn
 * invents an attribute the product does not have, in the one channel the player reads. And every
 * item must resolve to a real atlas cell, or it silently draws the whole sheet.
 */
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

/** A yarn's footprint has to match its weight, since that is what its unit value is read from. */
function checkYarnUnits() {
  const bad = items.filter((it) => it.name === 'yarn' && it.w !== yarnWeight(it.weight).size);
  console.assert(bad.length === 0, 'yarn footprints that do not match their weight:',
    bad.slice(0, 5).map((it) => `${it.weight}=${it.w}`));
}

/**
 * Drawn height must EQUAL reserved height.
 *
 * Not a tautology while `layers` has two possible sources: catalog.js still carries its own
 * (weight-derived) value, and taking that one instead is what leaves flat skeins holding the next
 * item up in the air.
 */
function checkYarnHeights() {
  // Every shape the catalog can produce needs a mesh, or paintYarn dereferences undefined the
  // first time one is stocked — a crash in the render loop, well away from the cause.
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

/**
 * Nothing the shop can ROLL may be too tall for every display in the room.
 *
 * addItem fails over to the next cell and fillStock re-rolls, so an unplaceable shape is not a
 * crash — it is a shop that is quietly short of stock, which is exactly the kind of bug nobody
 * notices for a month.
 */
function checkStockable() {
  const tallest = Math.max(...displays.map((d) => d.g.headroom));
  const rolls = YARN_SHAPES.flatMap((sh) => SHOP_RANGE.weights
    .map((wn) => /** @type {[string, string, number]} */
      ([sh, wn, yarnFit(sh, yarnWeight(wn).size, yarnWeight(wn).size, YARN_FIT).layers])));
  const unstockable = rolls.filter((row) => row[2] > tallest);
  console.assert(unstockable.length === 0, 'yarn the shop can roll but nothing can hold:',
    unstockable.map(([sh, wn, L]) => `${sh}/${wn}=${L} layers > ${tallest}`));
  // config.js cannot build geometry, so TALLEST_LAYERS is written down; this is what keeps it true.
  const biggest = Math.max(...rolls.map((row) => row[2]));
  console.assert(biggest === TALLEST_LAYERS,
    `tallest yarn is ${biggest} layers, config.js TALLEST_LAYERS says ${TALLEST_LAYERS}`);
  // Two of the biggest, one on the other, on a scratch grid as tall as a real floor tile. Not the
  // tile itself: placing into it would leave a phantom stack in the shop's stock.
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
  // The shop is MEANT to be cluttered (config.js): a stock count that quietly does not land is
  // a sparse shop nobody asked for. stockTheShop logs the shortfall; this makes it fail.
  console.assert(items.length >= S.stockCount,
    `stock: asked for ${S.stockCount} boxes, only ${items.length} landed`);
  const kinds = {};
  for (const it of items) kinds[it.name] = (kinds[it.name] ?? 0) + 1;
  console.info(`stock: ${items.length} items —`,
    Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', '),
    `| ${wrong} wrong sizes, ${noArt} missing art`);
}

/**
 * Self-check: slot masking must carve displays, not delete them.
 * The failure it catches is silent — a display whose every slot overlapped something ends up with
 * nowhere to put anything, and simply never shows stock, which looks like a stocking bug.
 */
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

/**
 * Self-check: the floor tiles still tile the floor.
 *
 * The floor is cut into piles so that an NPC deciding where to walk has somewhere specific to walk
 * to, and the cut is pure arithmetic on the tile size. So the way it breaks is an off-by-one: a
 * seam of floor no tile owns, or an overlap where two tiles claim the same cell and an item
 * dropped onto one is found by the other. Neither raises anything — both just read as "that patch
 * of floor behaves oddly", which is the kind of bug nobody ever tracks down.
 *
 * Every tile cell must therefore land on the ONE floor lattice ROOM_FLOOR describes, and no cell
 * may be claimed twice. The tile count is asserted too: one tile IS the old room-sized floor, and
 * that is the regression this whole split exists to prevent.
 */
/** Which cell of the one floor lattice a tile's own cell sits on, in whole cells from a corner. */
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

/**
 * Self-check: DISPLAYS.md rule 10. Everything the player can move can be moved and turned, stock
 * comes with it, and the per-type restrictions hold. Runs against the live layout and restores
 * every pose afterwards.
 */
/**
 * "Wall shelves stay against the wall": dropped anywhere at all, one ends up on a wall, facing in.
 */
function checkShelfSnap(shelf, fails) {
  for (const [x, z] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2.5, 2.5], [-2.9, -1]]) {
    const q = constrainPose(shelf, x, z, 0.3);
    // Front (local +Z) must point back toward the middle of the room, not out through the wall.
    if (Math.sin(q.yaw) * -q.x + Math.cos(q.yaw) * -q.z <= 0) fails.push(`shelf from ${x},${z} faces out`);
    if (Math.abs(q.x) > HALF_W || Math.abs(q.z) > HALF_D) fails.push(`shelf from ${x},${z} left the room`);
  }
}

/**
 * The bug this exists to catch: the snap put the shelf's back row inside the very wall clearance
 * the placement test enforces, so a wall shelf was refused on EVERY wall — it snapped nicely into
 * place and then went red, with nowhere in the shop it could be dropped.
 */
function checkShelfPlaceable(shelf, fails) {
  let legal = 0, tried = 0;
  for (const along of [-2, -1, 0, 1, 2])
    for (const [x, z] of [[along, -9], [along, 9], [-9, along], [9, along]]) {
      tried++;
      if (canPlaceAt(shelf, constrainPose(shelf, x, z, 0))) legal++;
    }
  if (legal < tried * 0.5) fails.push(`wall shelf legal at only ${legal}/${tried} wall positions`);
}

/** Rotation lands on 45° detents, whatever angle it is asked for. */
function checkDetents(pile, fails) {
  for (const raw of [0.1, 0.9, -2.2, 3.9]) {
    const q = constrainPose(pile, pile.x, pile.z, raw);
    if (Math.abs(q.yaw / YAW_STEP - Math.round(q.yaw / YAW_STEP)) > 1e-9)
      fails.push(`yaw ${raw} snapped to ${q.yaw}, not a 45° detent`);
  }
}

/**
 * "All Inventory will stay with the move": a box on this display shifts by exactly what the
 * display shifted by. This is the claim the whole mechanic rests on.
 */
function checkStockTravels(pile, fails) {
  // A box: yarn is drawn by the yarn meshes and its box instance is parked hidden, so a ball's box
  // matrix never moves and the check failed whenever the table's first item happened to be yarn.
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

/** Nowhere illegal may be accepted: outside the room, inside the counter, across the doorway. */
function checkPileRefusals(pile, fails) {
  if (canPlaceAt(pile, { x: HALF_W + 1, z: 0, yaw: 0 })) fails.push('a display outside the room was allowed');
  if (canPlaceAt(pile, { x: COUNTER.x, z: COUNTER.z, yaw: 0 })) fails.push('a display inside the counter was allowed');
  if (canPlaceAt(pile, { x: 0, z: HALF_D - 0.45, yaw: 0 })) fails.push('a display across the doorway was allowed');
}

/**
 * A chair is free on the floor, so it must have somewhere to go — and must still be refused
 * inside the counter and on top of a display. Both the scene and the SIM's own copy of the seat
 * list have to follow it.
 */
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

/**
 * Every pot and lamp stands somewhere legal, is refused on the counter and on a
 * display, follows a move with its mesh — and the SIM routes round it where it now stands, since
 * NPCs walking through a lamp is exactly the bug a scene-only move would make.
 */
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

/**
 * Self-check: DISPLAYS.md rule 10. Everything the player can move can be moved and turned, stock
 * comes with it, and the per-type restrictions hold. Runs against the live layout and restores
 * every pose afterwards.
 */
export function checkDisplayMoves() {
  const fails = [];
  const saved = [...displays, ...seats, ...props].map((m) => ({ m, ...movePose(m) }));
  const shelf = displays.find((d) => d.form === 'wall-shelf');
  // `solid !== false` as well as 'pile': the floor tiles are piles too, and at displayCount 1
  // there is no table, so this would otherwise pick a floor tile and start dragging the floor.
  const pile = displays.find((d) => d.kind === 'pile' && d.solid !== false);
  const chair = seats[0];

  if (shelf) { checkShelfSnap(shelf, fails); checkShelfPlaceable(shelf, fails); }
  if (pile) { checkDetents(pile, fails); checkStockTravels(pile, fails); checkPileRefusals(pile, fails); }
  if (chair) checkChair(chair, pile, fails);
  checkProps(pile, fails);

  for (const s of saved) moveApply(s.m, s.x, s.z, s.yaw);
  refreshAll();
  console.assert(fails.length === 0, 'display moves:', fails);
  console.info(`display moves: ${fails.length ? `${fails.length} FAILED` : 'ok'}`);
}

/**
 * Self-check: nobody walks in holding anything, and the thing they DO hold can still be hidden.
 *
 * Not visible as a crash, and not visible as a wrong flag either: the rig hid its placeholder
 * skein exactly as intended (`held.visible = false`), and then mergeCharacter lifted that skein's
 * meshes OUT of the hidden group and re-parented them into the always-visible joint. Every NPC
 * walked in holding one, so "is this customer carrying something?" — the only read the player gets
 * on whether a visit succeeded — was stuck on yes.
 */
/** Nobody starts a visit carrying, in the sim or on screen. */
function checkNobodyStartsCarrying(fails) {
  for (const rec of cast) {
    if (rec.npc.carrying) fails.push(`${rec.npc.name} spawned carrying ${labelOf(rec.npc.carrying)}`);
    if (rec.built.held?.visible) fails.push(`${rec.npc.name} spawned with the skein showing`);
    if (rec.carriedMesh) fails.push(`${rec.npc.name} spawned with a notion in hand`);
  }
}

/**
 * The skein survives the merge as its own hideable subtree.
 *
 * At the quality setting that actually MERGES — testing with merging off would have passed
 * throughout the bug this exists to catch.
 */
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

/**
 * A ball leaves the shop the size it was on the shelf.
 *
 * A notion box SHOULD shrink to one layer in the fist — that is what it is on the shelf too. Yarn
 * should not: it is drawn at its own settled fit, and squashing every family into one layer made
 * a super-bulky ball leave at a third of the width it was picked up at, which reads as the
 * customer walking off with a different, smaller thing.
 *
 * Measured off the mesh that is actually built, not recomputed from the formula: the same
 * arithmetic on both sides of an assertion compares a value to itself and passes forever.
 */
function checkHeldYarnSize(fails) {
  for (const shape of YARN_SHAPES) {
    const w = yarnWeight(SHOP_RANGE.weights[0]).size;
    const held = makeHeldNotion({ name: 'yarn', shape, w, h: w, color: '#888' });
    const unit = held.children[0];
    const want = yarnFit(shape, w, w, YARN_FIT);
    if (Math.abs(unit.scale.x - want.k) > 1e-9)
      fails.push(`held ${shape} is ${unit.scale.x.toFixed(4)} wide, shelf draws it ${want.k.toFixed(4)}`);
    // Same split as syncCarried's teardown: the cloned materials are this probe's, the geometry
    // belongs to the shelf's instanced meshes and disposing it would blank every shelf.
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

/**
 * Self-check: the sun comes in through the windows. Rays from a grid of floor points toward the
 * sun, against the walls' shadow stand-ins — the same geometry the shadow map sees. The morning
 * must light most of the floor; the afternoon must shade most of it and still land SOME sun on it,
 * which is only possible through a window. A window moved behind solid wall, or a sun angle that
 * misses every opening, fails here rather than as a vaguely gloomy afternoon.
 */
/** The share of a grid over the floor that can see the sun at time-of-day `t`. */
function floorInSun(t) {
  const ray = new THREE.Raycaster();
  ray.layers.set(SHADOW_LAYER);   // the stand-in lives where only the shadow camera looks
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

export function checkSunPools() {
  const morning = floorInSun(0), afternoon = floorInSun(1);
  applyDaylight(S.followDay ? shop.dayT : S.timeOfDay);
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  console.assert(morning > 0.7, `sun: the morning lights only ${pct(morning)} of the floor`);
  console.assert(afternoon < 0.3 && afternoon > 0.03,
    `sun: the afternoon lights ${pct(afternoon)} of the floor — want a few window pools`);
  console.info(`sun: morning lights ${pct(morning)} of the floor, afternoon ${pct(afternoon)} (window pools)`);
}
