import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from './room-environment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  CARD_LOOK, loadAtlas, cellRect, makeGridLines, makeField, makeEdge, makeShadows, makeBoxes, makeSizeAtlas,
  setInstance, placeMatrix, placeBoxMatrix, placeLabelMatrix,
} from './notions.js';
import {
  EMPTY, makeDisplay, gridSize, footprint, fits, place, lift, topAt, columnAt, slotRect,
  usableAt, clearShelf, fullyExposed, anySlot,
} from './grid.js';
import { makePicker, placeItem, scatterYaw, settleYaw } from './pick-place.js';
import {
  YARN_FAMILIES, TIERS, BANDS, TAILS, buildFamily, buildBand, buildTail, bandMatrix, tailMatrix,
  familyFootprint, familyExtent, triangleCount, aspectDistance, yarnFit as sharedYarnFit,
} from './yarn-geometry.js';
import { SHADING, YARN_LOOK, makeMatcap, makePaperMatcap, makeToonRamp, yarnMaterial, bakeVertexAO, makeHull,
         yarnColor, applyHatching, addHatchScale } from './yarn-look.js';

// Relative to this module, not the page, so it still resolves when served below a site root (GitHub Pages).
const ATLAS_URL = new URL('../ai_planning_sessions/inventory/illustrations/build', import.meta.url).href;

const HOOK_SIZES_MM = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0, 9.0, 10.0, 12.0];

const S = {
  theme:      'default',
  exposure:   0.95,   // YARN-ASSET-SPIKE.md §16
  layout:     'shelf',
  cols:       7,
  rows:       4,
  cell:       0.26,
  shelves:    2,
  shelfGap:   0.78,   // YARN-ASSET-SPIKE.md §14: must exceed the tallest yarn
  headroom:   4,
  fill:       34,
  tint:       '#241e22',
  boxHeight:  0.0325,
  // YARN-ASSET-SPIKE.md §14: a fine quantum
  layerRatio: 0.125,
  boxColor:   '#e7ddc9',
  unlit:      true,
  showGrid:   true,
  liftHeight: 0.14,
  edge:       true,
  edgeGrow:   CARD_LOOK.edgeGrow,
  edgeColor:  CARD_LOOK.edgeColor,
  shade:      CARD_LOOK.shade,

  stock:      'yarn',
  shading:    'matcap',
  tier:       YARN_LOOK.tier,
  familyRow:  true,
  yarnCount:  40,
  bands:      true,
  tails:      true,
  hatch:      true,
  paletteSpread: 1.0,
  hatchFreq:  YARN_LOOK.hatch.freq,
  hatchDepth: YARN_LOOK.hatch.depth,
  perWeight:  true,
  outline:    true,
  outlineWidth: YARN_LOOK.outline.width,
  inkColor:   YARN_LOOK.outline.color,
  mcBase:     YARN_LOOK.matcap.base,
  mcLight:    YARN_LOOK.matcap.light,
  mcShadow:   YARN_LOOK.matcap.shadow,
  mcRim:      YARN_LOOK.matcap.rim,
  paperRim:   YARN_LOOK.paper.rim,
  paperWrap:  YARN_LOOK.paper.wrap,
  mcWrap:     YARN_LOOK.matcap.wrap,
  toonSteps:  3,
};

const LAYOUTS = {
  shelf:   () => () => true,
  pyramid: (cols) => (s, c) => c >= s && c < cols - s,
  window:  (cols, rows) => (s, c, r) => c === 0 || c === cols - 1 || r === 0 || r === rows - 1,
};

const PEG_COLS = 8, PEG_ROWS = 6;
// YARN-ASSET-SPIKE.md §14: a distance, not a layer count
const PEG_REACH = 0.55;
const pegHeadroom = () => Math.max(1, Math.floor(PEG_REACH / S.boxHeight));
const pegMask = (s, c) => c % 2 === 0;

let boxHeightCtl = null, headroomCtl = null;

function makeFrame(position, quaternion) {
  const m = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return { frame: m, frameInv: m.clone().invert(), quat: quaternion.clone() };
}

const displays = {
  shelf: { id: 'shelf', ...makeFrame(new THREE.Vector3(0, 0, 0), new THREE.Quaternion()),
           g: null, plane: 0, lines: [], panels: [], group: null, floors: [] },
  peg:   { id: 'peg', ...makeFrame(
             new THREE.Vector3(2.1, 0.9, 0),
             new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
           ), g: null, plane: 0, lines: [], hooks: null, group: null, floors: [] },
};
let activeId = 'shelf';
const activeDisplay = () => displays[activeId];
const drag = { index: EMPTY, target: null };

for (const d of Object.values(displays)) {
  d.group = new THREE.Group();
  d.group.matrixAutoUpdate = false;
  d.group.matrix.copy(d.frame);
  d.group.matrixWorldNeedsUpdate = true;
}

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = S.exposure;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ddd5c8');
for (const d of Object.values(displays)) scene.add(d.group);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#8b7a68', 1.1));
const key = new THREE.DirectionalLight('#ffe6c4', 1.6);
key.position.set(2, 4, 2);
scene.add(key);

const surface = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: '#c9bda9', roughness: 0.95 })
);
surface.rotation.x = -Math.PI / 2;
surface.userData = { dispId: 'shelf', plane: 0 };
displays.shelf.group.add(surface);
displays.shelf.floors = [surface];

const GLASS_THICKNESS = 0.012;
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#eef4f2',
  transmission: 0.9,
  roughness: 0.45,
  thickness: 0.05,
  ior: 1.3,
  clearcoat: 0.3,
  side: THREE.DoubleSide,
  transparent: true,
});

function buildShelfGrid() {
  const mask = LAYOUTS[S.layout](S.cols, S.rows, S.shelves);
  displays.shelf.g = makeDisplay(S.cols, S.rows, { shelves: S.shelves, headroom: S.headroom, cell: S.cell, mask });
}

function layoutShelfDisplay() {
  const disp = displays.shelf;
  const { g } = disp;
  const { w, d } = gridSize(g);
  surface.scale.set(w * 1.04, d * 1.04, 1);
  for (const list of [disp.lines, disp.panels]) {
    list.forEach((o) => o.removeFromParent());
    list.length = 0;
  }
  disp.floors = [surface];
  for (let s = 0; s < S.shelves; s++) layoutShelfLevel(disp, s, w, d);
  paintActivePlane();
}

function layoutShelfLevel(disp, s, w, d) {
  const lines = makeGridLines(disp.g, s);
  lines.position.y = s * S.shelfGap + 0.002;
  disp.lines.push(lines);
  disp.group.add(lines);

  if (s > 0) {
    const panel = glassPanel(w, d, s);
    disp.panels.push(panel);
    disp.floors.push(panel);
    disp.group.add(panel);
  }
}

function glassPanel(w, d, s) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glassMaterial);
  panel.scale.set(w * 1.04, GLASS_THICKNESS, d * 1.04);
  panel.position.y = s * S.shelfGap - GLASS_THICKNESS / 2;
  panel.userData = { dispId: 'shelf', plane: s };
  return panel;
}

const pegBacking = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: '#b7a68d', roughness: 0.92 })
);
pegBacking.rotation.x = -Math.PI / 2;
pegBacking.userData = { dispId: 'peg', plane: 0 };
displays.peg.group.add(pegBacking);
displays.peg.floors = [pegBacking];

const hookMaterial = new THREE.MeshStandardMaterial({ color: '#8a8578', roughness: 0.55, metalness: 0.2 });

function makeHooks(g, length) {
  const { w, d } = gridSize(g);
  const positions = [];
  for (let c = 0; c < g.cols; c++) {
    if (!usableAt(g, 0, c, 0)) continue;
    positions.push((c + 0.5) * g.cell - w / 2, -d / 2 + g.cell * 0.18);
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.006, 0.006, length, 8),
    hookMaterial,
    Math.max(positions.length / 2, 1),
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < positions.length / 2; i++) {
    m.makeTranslation(positions[i * 2], length / 2, positions[i * 2 + 1]);
    mesh.setMatrixAt(i, m);
  }
  mesh.count = positions.length / 2;
  return mesh;
}

function buildPegGrid() {
  displays.peg.g = makeDisplay(PEG_COLS, PEG_ROWS, { shelves: 1, headroom: pegHeadroom(), cell: S.cell, mask: pegMask });
}

function layoutPegDisplay() {
  const disp = displays.peg;
  const { g } = disp;
  const { w, d } = gridSize(g);
  pegBacking.scale.set(w * 1.06, d * 1.06, 1);
  disp.lines.forEach((l) => l.removeFromParent());
  disp.lines.length = 0;
  const lines = makeGridLines(g, 0);
  lines.position.y = 0.002;
  disp.lines.push(lines);
  disp.group.add(lines);

  disp.hooks?.removeFromParent();
  disp.hooks = makeHooks(g, PEG_REACH);
  disp.group.add(disp.hooks);
  paintActivePlane();
}

function paintActivePlane() {
  for (const disp of Object.values(displays)) {
    disp.lines.forEach((lines, s) => {
      const isActive = disp === activeDisplay() && s === disp.plane;
      lines.visible = S.showGrid;
      lines.material.color.set(isActive ? '#c2703f' : '#9d9282');
      lines.material.opacity = isActive ? 1 : 0.5;
      lines.material.transparent = !isActive;
    });
  }
}

let atlas = null;
let field = null;
let edge = null;
let fieldTop = null;
let edgeTop = null;
let shadows = null;
let boxes = null;
let sizeTag = null;
let sizeAtlas = null;
const items = [];

const SHAPES = [[1, 1], [2, 1], [1, 2], [2, 2]];
const FILL = 0.9;
const CAPACITY = 256;

const _pos = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _topMat = new THREE.Matrix4();
const _sizeMat = new THREE.Matrix4();
const _boxMat = new THREE.Matrix4();
const _shadowMat = new THREE.Matrix4();
const _col = new THREE.Color();

const shelfBaseY = (shelf, layer) => shelf * S.shelfGap + layer * S.boxHeight;

const YARN_CAPACITY = 1024;
const UP = new THREE.Vector3(0, 1, 0);
const yarnMeshes = {};
const yarnHulls = {};
let bandMesh = null;
let tailMesh = null;
let matcapTex = null;
let paperTex = null;
let toonRamp = null;

const _yarnMat = new THREE.Matrix4();
const _bandLocal = new THREE.Matrix4();
const _tailLocal = new THREE.Matrix4();
const _yarnCol = new THREE.Color();
const _q = new THREE.Quaternion();
const _s3 = new THREE.Vector3();
const _p3 = new THREE.Vector3();

const hatchScaleOf = (item) => (S.perWeight ? YARN_LOOK.hatchForBulk[(item.bulk ?? 1) - 1] : 1);

const yarnFit = (family, bulk) =>
  sharedYarnFit(family, ...familyFootprint(family, bulk),
                { cell: S.cell, boxHeight: S.boxHeight, fill: FILL, tier: S.tier });

const itemLayers = (item) => (item.kind === 'yarn' ? (item.layers ?? 1) : 1);

const itemTall = (item) => itemLayers(item) * S.boxHeight;

function buildYarnMeshes() {
  for (const f of YARN_FAMILIES) buildFamilyMesh(f);
  bandMesh?.removeFromParent();
  bandMesh = yarnInstances(buildBand(S.tier));
  tailMesh?.removeFromParent();
  tailMesh = yarnInstances(buildTail(S.tier));
  applyShading();
}

function buildFamilyMesh(f) {
  yarnMeshes[f]?.removeFromParent();
  yarnHulls[f]?.removeFromParent();
  const mesh = yarnInstances(bakeVertexAO(buildFamily(f, S.tier)));
  mesh.userData.owner = [];
  if (mesh.material.userData.hatch) addHatchScale(mesh, YARN_CAPACITY);
  yarnMeshes[f] = mesh;
  yarnHulls[f] = makeHull(mesh, { color: S.inkColor, width: S.outlineWidth });
  scene.add(yarnHulls[f]);
}

function yarnInstances(geometry) {
  const mesh = new THREE.InstancedMesh(geometry, currentYarnMaterial(), YARN_CAPACITY);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(YARN_CAPACITY * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

function currentYarnMaterial({ hatch = S.hatch, paper = false } = {}) {
  matcapTex ??= makeMatcap({ base: S.mcBase, light: S.mcLight, shadow: S.mcShadow,
                             rim: S.mcRim, wrap: S.mcWrap });
  paperTex ??= makePaperMatcap({ rim: S.paperRim, wrap: S.paperWrap });
  toonRamp ??= makeToonRamp(S.toonSteps);
  const m = yarnMaterial(S.shading, { matcap: paper ? paperTex : matcapTex, ramp: toonRamp });
  if (hatch) applyHatching(m, { freq: S.hatchFreq, depth: S.hatchDepth });
  return m;
}

function applyShading() {
  const solo = S.shading === 'silhouette';
  for (const f of YARN_FAMILIES) reshadeFamily(f, solo);
  for (const [mesh, on, paper] of [[bandMesh, S.bands, true], [tailMesh, S.tails, false]]) {
    mesh.material.dispose();
    mesh.material = currentYarnMaterial({ hatch: false, paper });
    mesh.visible = on;
  }
  showScenery(!solo);
  paintActivePlane();
}

function reshadeFamily(f, solo) {
  const mesh = yarnMeshes[f];
  mesh.material.dispose();
  mesh.material = currentYarnMaterial();
  if (mesh.material.userData.hatch && mesh.geometry.getAttribute('aHatchScale')) {
    mesh.material.defines = { ...mesh.material.defines, USE_HATCH_SCALE: '' };
    mesh.material.needsUpdate = true;
    mesh.userData.hatchScale = mesh.geometry.getAttribute('aHatchScale');
  }
  yarnHulls[f].visible = S.outline && !solo;
}

function showScenery(on) {
  scene.background.set(on ? '#ddd5c8' : '#ffffff');
  surface.visible = on;
  pegBacking.visible = on;
  displays.shelf.panels.forEach((p) => { p.visible = on; });
  if (displays.peg.hooks) displays.peg.hooks.visible = on;
  if (shadows) shadows.visible = on;
}

function paintYarn(display, index, { cx, cz, base, yaw }) {
  const item = items[index];
  const mesh = yarnMeshes[item.family];
  const fit = yarnFit(item.family, item.bulk);
  _yarnMat.compose(_p3.set(cx, base, cz), _q.setFromAxisAngle(UP, yaw), _s3.set(fit.k, fit.ky, fit.k))
    .premultiply(display.frame);
  mesh.setMatrixAt(item.slot, _yarnMat);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(item.slot, item.color);
  mesh.instanceColor.needsUpdate = true;
  const hs = mesh.userData.hatchScale;
  if (hs) { hs.setX(item.slot, hatchScaleOf(item)); hs.needsUpdate = true; }
  paintYarnDetails(item);
  paintYarnShadow(display, item, fit, { cx, cz, base, yaw });
}

function paintYarnDetails(item) {
  if (item.bandSlot != null) {
    const bm = bandMatrix(item.family, _bandLocal);
    bandMesh.setMatrixAt(item.bandSlot, bm.premultiply(_yarnMat));
    bandMesh.instanceMatrix.needsUpdate = true;
    bandMesh.setColorAt(item.bandSlot, _yarnCol.set(YARN_LOOK.bandColor));
    bandMesh.instanceColor.needsUpdate = true;
  }

  if (item.tailSlot != null) {
    const tm = tailMatrix(item.family, _tailLocal);
    tailMesh.setMatrixAt(item.tailSlot, tm.premultiply(_yarnMat));
    // ponytail: a non-square parent (the 2x1 skein) stretches the curl along with it. It reads
    // fine at 2x1; if a family ever goes wider, undo the parent's aspect on the tail instead.
    tailMesh.instanceMatrix.needsUpdate = true;
    tailMesh.setColorAt(item.tailSlot, item.color);
    tailMesh.instanceColor.needsUpdate = true;
  }
}

function paintYarnShadow(display, item, fit, { cx, cz, base, yaw }) {
  // DESIGN-DECISIONS.md perf rule 6
  const [uw, , ud] = familyExtent(item.family, S.tier);
  _pos.set(cx, base + 0.003, cz);
  shadows.setMatrixAt(item.shadowSlot,
    placeMatrix(_pos, fit.k * uw * 1.02, fit.k * ud * 1.02, yaw, _shadowMat).premultiply(display.frame));
  shadows.instanceMatrix.needsUpdate = true;
}

function paintInstance(display, index, { cx, cz, boxBase, shadowBase, yaw }, { footW, footD, grow = 1 }) {
  const item = items[index];
  const boxW = footW * grow, boxD = footD * grow;
  const boxH = S.boxHeight;
  const F = display.frame;

  _pos.set(cx, boxBase + boxH / 2, cz);
  setInstance(boxes, item.slot, { matrix: placeBoxMatrix(_pos, [boxW, boxD, boxH], yaw, _boxMat).premultiply(F) });
  paintLabels(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH });

  _pos.set(cx, shadowBase + 0.003, cz);
  shadows.setMatrixAt(item.shadowSlot, placeMatrix(_pos, boxW * 1.08, boxD * 1.08, yaw, _shadowMat).premultiply(F));
  shadows.instanceMatrix.needsUpdate = true;
}

function paintLabels(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH }) {
  const { slot } = item;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const halfOut = boxD / 2 + 0.003;
  _pos.set(cx + fx * halfOut, boxBase + boxH * 0.55, cz + fz * halfOut);
  setInstance(field, slot, {
    matrix: placeLabelMatrix(_pos, boxW * 0.92, boxH * 0.82, yaw, _mat).premultiply(F),
    rect: cellRect(atlas.manifest, item.name),
    color: _col.set(item.color),
  });

  _pos.set(cx, boxBase + boxH + 0.002, cz);
  setInstance(fieldTop, slot, {
    matrix: placeMatrix(_pos, boxW * 0.86, boxD * 0.86, yaw, _topMat).premultiply(F),
    rect: cellRect(atlas.manifest, item.name),
    color: _col.set(item.color),
  });
  paintSizeTag(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH });
}

function paintSizeTag(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH }) {
  const sx = Math.cos(yaw), sz = -Math.sin(yaw);
  const sideOut = boxW / 2 + 0.003;
  _pos.set(cx + sx * sideOut, boxBase + boxH * 0.55, cz + sz * sideOut);
  setInstance(sizeTag, item.slot, {
    matrix: placeLabelMatrix(_pos, boxD * 0.5, boxH * 0.5, yaw + Math.PI / 2, _sizeMat).premultiply(F),
    rect: cellRect(sizeAtlas.manifest, item.size != null ? item.size.toFixed(1) : 'blank'),
  });
}

function refresh(index) {
  const item = items[index];
  const disp = displays[item.display];
  const rect = slotRect(disp.g, item.c, item.r, item.w, item.h);
  const base = shelfBaseY(item.shelf, item.layer);
  const at = { cx: rect.x, cz: rect.z, yaw: item.yaw };
  if (item.kind === 'yarn') paintYarn(disp, index, { ...at, base });
  else paintInstance(disp, index, { ...at, boxBase: base, shadowBase: base }, { footW: rect.w * FILL, footD: rect.d * FILL });
}

function refreshFloating(index, x, z) {
  const item = items[index];
  const disp = activeDisplay();
  const floor = disp.plane * S.shelfGap;
  const at = { cx: x, cz: z, yaw: item.yaw };
  if (item.kind === 'yarn') paintYarn(disp, index, { ...at, base: floor + S.liftHeight });
  else {
    paintInstance(disp, index, { ...at, boxBase: floor + S.liftHeight, shadowBase: floor },
      { footW: item.w * S.cell * FILL, footD: item.h * S.cell * FILL, grow: 1.08 });
  }
}

function restage() {
  const { notion, band, tail, shadow } = assignSlots();
  field.count = edge.count = fieldTop.count = edgeTop.count = sizeTag.count = notion;
  boxes.count = notion;
  bandMesh.count = band;
  tailMesh.count = tail;
  shadows.count = shadow;
  for (const f of YARN_FAMILIES) yarnHulls[f].count = yarnMeshes[f].count;
  items.forEach((_, i) => refresh(i));
}

function assignSlots() {
  let notion = 0, band = 0, tail = 0, shadow = 0;
  for (const f of YARN_FAMILIES) { yarnMeshes[f].count = 0; yarnMeshes[f].userData.owner.length = 0; }
  boxes.userData.owner.length = 0;

  items.forEach((item, i) => {
    item.shadowSlot = shadow++;
    if (item.kind === 'yarn') {
      const mesh = yarnMeshes[item.family];
      item.slot = mesh.count++;
      mesh.userData.owner[item.slot] = i;
      item.bandSlot = S.bands && BANDS[item.family] ? band++ : null;
      item.tailSlot = S.tails && TAILS[item.family] ? tail++ : null;
    } else {
      item.slot = notion++;
      boxes.userData.owner[item.slot] = i;
    }
  });
  return { notion, band, tail, shadow };
}

const rnd = (n) => (Math.random() * n) | 0;

function pushYarn(disp, family, bulk, { shelf, c, r, keys }) {
  const index = items.length;
  const fit = yarnFit(family, bulk);
  items.push({
    kind: 'yarn', family, bulk, display: 'shelf',
    shelf, c, r, w: fit.w, h: fit.h, keys,
    layers: fit.layers,
    layer: place(disp.g, keys, index, fit.layers),
    color: yarnColor(Math.random, undefined, { spread: S.paletteSpread }),
    yaw: scatterYaw(),
  });
}

function addFamilyRow(disp) {
  let c = 0, r = 0;
  for (const family of YARN_FAMILIES) {
    const { w, h, layers } = yarnFit(family, 1);
    let keys = null;
    while (r + h <= disp.g.rows) {
      if (c + w > disp.g.cols) { c = 0; r += 1; continue; }
      keys = footprint(disp.g, 0, [c, r], [w, h]);
      if (keys && fits(disp.g, keys, layers)) break;
      keys = null;
      c += 1;
    }
    if (!keys) break;
    pushYarn(disp, family, 1, { shelf: 0, c, r, keys });
    c += w;
  }
}

function maxBulk(family) {
  for (let bulk = 3; bulk > 1; bulk--) if (yarnFit(family, bulk).layers <= S.headroom) return bulk;
  return 1;
}

function addYarn(disp) {
  if (S.familyRow) {
    addFamilyRow(disp);
    return;
  }
  const target = Math.min(S.yarnCount, YARN_CAPACITY);
  for (let attempt = 0; items.length < target && attempt < target * 80; attempt++) {
    const family = YARN_FAMILIES[rnd(YARN_FAMILIES.length)];
    const bulk = 1 + rnd(maxBulk(family));
    const fit = yarnFit(family, bulk);
    const shelf = rnd(S.shelves), c = rnd(S.cols), r = rnd(S.rows);
    const keys = footprint(disp.g, shelf, [c, r], [fit.w, fit.h]);
    if (!fits(disp.g, keys, fit.layers)) continue;
    pushYarn(disp, family, bulk, { shelf, c, r, keys });
  }
}

function addNotions(disp) {
  const target = Math.min(S.fill + items.length, CAPACITY);
  for (let attempt = 0; items.length < target && attempt < target * 80; attempt++) {
    const [w, h] = SHAPES[rnd(SHAPES.length)];
    const shelf = rnd(S.shelves), c = rnd(S.cols), r = rnd(S.rows);
    const keys = footprint(disp.g, shelf, [c, r], [w, h]);
    if (!fits(disp.g, keys)) continue;
    const index = items.length;
    const name = atlas.names[index % atlas.names.length];
    items.push({
      kind: 'notion', name, display: 'shelf',
      shelf, c, r, w, h, keys, layer: place(disp.g, keys, index, 1),
      color: S.tint,
      yaw: scatterYaw(),
      size: name === 'crochet-hook' ? HOOK_SIZES_MM[rnd(HOOK_SIZES_MM.length)] : null,
    });
  }
}

function scatter() {
  if (drag.index !== EMPTY) return;
  const disp = displays.shelf;
  buildShelfGrid();
  layoutShelfDisplay();
  for (let i = items.length - 1; i >= 0; i--) if (items[i].display === 'shelf') items.splice(i, 1);

  if (S.stock !== 'notions') addYarn(disp);
  if (S.stock !== 'yarn') addNotions(disp);
  restage();
}

function syncBoxHeight() {
  S.boxHeight = S.cell * S.layerRatio;
  S.headroom = Math.max(1, Math.floor(S.shelfGap / S.boxHeight));
  boxHeightCtl?.updateDisplay();
  headroomCtl?.updateDisplay();
}

function rebuild() {
  displays.shelf.plane = Math.min(displays.shelf.plane, S.shelves - 1);
  syncBoxHeight();
  if (displays.peg.g) { buildPegGrid(); layoutPegDisplay(); }
  scatter();
  frame();
}

function tidyPlane(disp, s) {
  const byKind = kindsOnPlane(disp, s);
  clearShelf(disp.g, s);
  const cells = emptyCells(disp.g, s);
  for (const [, indices] of [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    pileKind(disp, s, indices, cells);
  }
}

function kindsOnPlane(disp, s) {
  const byKind = new Map();
  items.forEach((item, i) => {
    if (item.display !== disp.id || item.shelf !== s) return;
    const kind = item.kind === 'yarn' ? `yarn:${item.family}` : item.name;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(i);
  });
  return byKind;
}

function emptyCells(g, s) {
  let cursor = 0;
  return {
    next() {
      while (cursor < g.cols * g.rows) {
        const c = cursor % g.cols, r = (cursor / g.cols) | 0;
        if (usableAt(g, s, c, r) && topAt(g, s, c, r) === EMPTY) return { c, r };
        cursor++;
      }
      return null;
    },
    skip() { cursor++; },
  };
}

function pileKind(disp, s, indices, cells) {
  const { g } = disp;
  let anchor = cells.next();
  for (const i of indices) {
    if (!anchor) break;   // ponytail: plane ran out of room; leftovers just keep their old spot, unrendered
    const item = items[i];
    const tall = itemLayers(item);
    let keys = footprint(g, s, [anchor.c, anchor.r], [item.w, item.h]);
    if (!fits(g, keys, tall)) {
      cells.skip();
      anchor = cells.next();
      if (!anchor) break;
      keys = footprint(g, s, [anchor.c, anchor.r], [item.w, item.h]);
    }
    item.display = disp.id; item.shelf = s; item.c = anchor.c; item.r = anchor.r; item.yaw = 0;
    item.keys = keys;
    item.layer = place(g, keys, i, tall);
    refresh(i);
  }
}

function tidyActive() {
  if (drag.index !== EMPTY) return;
  const disp = activeDisplay();
  tidyPlane(disp, disp.plane);
}

const lastPointer = { clientX: innerWidth / 2, clientY: innerHeight / 2 };

const _levelFrame = new THREE.Matrix4();
const _levelOffset = new THREE.Matrix4();

const picker = makePicker({
  camera,
  displays: () => Object.values(displays),
  items: () => items,
  levelFrame: (disp, shelf) => _levelFrame.copy(disp.frame)
    .multiply(_levelOffset.makeTranslation(0, shelf * S.shelfGap, 0)),
  itemHeight: (_disp, item) => item.layer * S.boxHeight + itemTall(item),
  itemTall: (_disp, item) => itemTall(item),
  exposed: fullyExposed,
});
const { pickCandidate, snapTo, raycaster, setRay: setRayFromEvent } = picker;
const displayPoint = (disp, event) => picker.displayPoint(disp, disp.plane, event);

function pickTarget(event) {
  setRayFromEvent(event);
  const candidates = Object.values(displays).map((disp) => disp.floors[disp.plane]);
  const hits = raycaster.intersectObjects(candidates, false);
  if (!hits.length) return null;
  const disp = displays[hits[0].object.userData.dispId];
  const local = hits[0].point.clone().applyMatrix4(disp.frameInv);
  if (!columnAt(disp.g, local.x, local.z)) return null;
  return disp;
}

function pickUp(event) {
  const found = pickCandidate(event);
  if (found) {
    const { disp, index, shelf } = found;
    if (activeId !== disp.id) setActiveId(disp.id, false);
    if (disp.plane !== shelf) setPlane(shelf);
    drag.index = index;
    lift(disp.g, items[index].keys);
    const point = displayPoint(disp, event);
    if (point) refreshFloating(index, point.x, point.z);
    return;
  }
  const disp = pickTarget(event);
  if (disp && activeId !== disp.id) setActiveId(disp.id, false);
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  if (drag.index === EMPTY) pickUp(event);
  else putDown();
}

function onPointerMove(event) {
  lastPointer.clientX = event.clientX; lastPointer.clientY = event.clientY;
  if (drag.index === EMPTY) return;

  const hover = pickTarget(event);
  const wantId = hover ? hover.id : items[drag.index].display;
  if (wantId !== activeId) setActiveId(wantId, false);

  const disp = activeDisplay();
  const point = displayPoint(disp, event);
  if (!point) return;
  const item = items[drag.index];
  drag.target = snapTo(disp, disp.plane, { ...item, layers: itemLayers(item) }, point.x, point.z);
  ghost(item);
  refreshFloating(drag.index, point.x, point.z);
}

const FLAT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const marker = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: '#3f7f5a', transparent: true, opacity: 0.32, depthWrite: false })
);
marker.visible = false;
scene.add(marker);

function putDown() {
  const item = items[drag.index];
  const t = drag.target;
  if (t) {
    item.display = activeId;
    item.shelf = activeDisplay().plane;
  }
  const home = displays[item.display];
  placeItem(item, drag.index, t, { home, homeShelf: item.shelf, layers: itemLayers, anySlot });
  settleYaw(item);

  refresh(drag.index);
  marker.visible = false;
  drag.index = EMPTY;
  drag.target = null;
}

function ghost(item) {
  const disp = activeDisplay();
  const t = drag.target;
  marker.visible = Boolean(t);
  if (!t) return;
  const rect = slotRect(disp.g, t.c, t.r, t.w ?? item.w, t.h ?? item.h);
  marker.position.set(rect.x, shelfBaseY(disp.plane, t.layer) + 0.004, rect.z).applyMatrix4(disp.frame);
  marker.quaternion.copy(disp.quat).multiply(FLAT_Q);
  marker.scale.set(rect.w * 0.96, rect.d * 0.96, 1);
  marker.material.color.set('#3f7f5a');
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
addEventListener('pointermove', onPointerMove);

function frame() {
  const disp = activeDisplay();
  const { w, d } = gridSize(disp.g);
  const isShelf = disp.id === 'shelf';
  const height = isShelf ? S.shelves * S.shelfGap : PEG_REACH;
  const center = new THREE.Vector3(0, height * 0.4, 0).applyMatrix4(disp.frame);

  const extent = (isShelf ? Math.max(w, d, height) : Math.max(w, d)) * 1.3;
  const dist = extent / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));

  controls.target.copy(center);
  camera.position.set(
    center.x,
    center.y + dist * (isShelf ? 0.7 : 0.25),
    center.z + dist * (isShelf ? 0.66 : 0.9),
  );
  controls.update();
}

function frameSilhouette(px = 64) {
  const disp = displays.shelf;
  const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const dist = (S.cell * innerHeight) / (2 * Math.tan(halfFov) * px);
  const { d } = gridSize(disp.g);
  const center = new THREE.Vector3(0, S.cell * 0.45, -d / 2 + S.cell / 2);
  controls.target.copy(center);
  camera.position.set(center.x, center.y + dist * 0.18, center.z + dist);
  controls.update();
}

const planeCount = (disp) => (disp.id === 'shelf' ? S.shelves : 1);

const gui = new GUI({ title: 'stash and stuff' });
gui.add(S, 'fill', 1, 80, 1).name('notions').onFinishChange(scatter);
gui.add({ f: scatter }, 'f').name('reshuffle  (R)');
gui.add({ f: tidyActive }, 'f').name('tidy up  (T)');
const displayCtl = gui.add(
  { get d() { return activeId; }, set d(v) { setActiveId(v); } },
  'd', { 'shelf unit': 'shelf', 'peg board': 'peg' },
).name('display  (D)');
const planeCtl = gui.add({ get s() { return activeDisplay().plane; }, set s(v) { setPlane(v | 0); } }, 's', 0, 5, 1)
  .name('active plane  [ ]').listen();
planeCtl.max(S.shelves - 1);

function setPlane(p) {
  const disp = activeDisplay();
  disp.plane = (p + planeCount(disp)) % planeCount(disp);
  paintActivePlane();
  planeCtl.updateDisplay();
}
function setActiveId(id, refocus = true) {
  activeId = id;
  planeCtl.max(planeCount(activeDisplay()) - 1);
  paintActivePlane();
  planeCtl.updateDisplay();
  displayCtl?.updateDisplay();
  if (refocus) frame();
}

const gGrid = gui.addFolder('shelf unit');
gGrid.add(S, 'layout', Object.keys(LAYOUTS)).name('shape').onFinishChange(rebuild);
gGrid.add(S, 'cols', 2, 12, 1).onFinishChange(rebuild);
gGrid.add(S, 'rows', 2, 12, 1).onFinishChange(rebuild);
gGrid.add(S, 'shelves', 1, 5, 1).onFinishChange(() => { if (activeId === 'shelf') planeCtl.max(S.shelves - 1); rebuild(); });
headroomCtl = gGrid.add(S, 'headroom').name('layers per shelf (derived)').listen().disable();
gGrid.add(S, 'cell', 0.14, 0.5, 0.01).name('slot size').onFinishChange(rebuild);
gGrid.add(S, 'shelfGap', 0.12, 0.9, 0.01).name('shelf spacing').onChange(() => {
  syncBoxHeight();
  items.forEach((_, i) => refresh(i));
}).onFinishChange(rebuild);
gGrid.add(S, 'showGrid').name('show grid  (G)').onChange(paintActivePlane);

const gLook = gui.addFolder('notion look');
gLook.add(S, 'layerRatio', 0.05, 0.5, 0.005).name('layer pitch (of a slot)').onFinishChange(rebuild);
boxHeightCtl = gLook.add(S, 'boxHeight').name('layer height (derived)').listen().disable();
gLook.addColor(S, 'boxColor').name('box colour').onChange((v) => boxes.material.color.set(v));
gLook.addColor(S, 'tint').name('label ink').onChange(() => {
  items.forEach((item, i) => { item.color = S.tint; refresh(i); });
});
gLook.add(S, 'shade', 0, 0.8, 0.01).name('gradient').onChange((v) => {
  for (const f of [field, fieldTop]) f.material.userData.uniforms.uShade.value = v;
});
gLook.add(S, 'exposure', 0.2, 2, 0.01).name('exposure')
  .onChange((v) => { renderer.toneMappingExposure = v; });

const gEdge = gLook.addFolder('card edge');
const edges = () => [edge, edgeTop];
gEdge.add(S, 'edge').name('enabled').onChange((v) => edges().forEach((e) => { e.visible = v; }));
gEdge.add(S, 'edgeGrow', 1.0, 1.30, 0.005).name('width')
  .onChange((v) => edges().forEach((e) => { e.material.userData.uniforms.uGrow.value = v; }));
gEdge.addColor(S, 'edgeColor').name('colour').onChange((v) => edges().forEach((e) => e.material.color.set(v)));

const remakeMatcap = () => {
  matcapTex?.dispose();
  paperTex?.dispose();
  toonRamp?.dispose();
  matcapTex = paperTex = toonRamp = null;
  applyShading();
};
const retessellate = () => { buildYarnMeshes(); restage(); };

const gYarn = gui.addFolder('yarn assets  (spike)');
gYarn.add(S, 'stock', ['notions', 'yarn', 'both']).name('shelf holds').onChange(scatter);
gYarn.add(S, 'shading', SHADING).name('shading  (1-5)').onChange(applyShading);
gYarn.add(S, 'tier', TIERS).name('tessellation').onChange(retessellate);
gYarn.add(S, 'familyRow').name('one of each  (Y)').onChange(scatter);
gYarn.add(S, 'yarnCount', 1, 1000, 1).name('yarn count').onFinishChange(scatter);
gYarn.add({ f: () => { S.yarnCount = 1000; S.cols = 12; S.rows = 12; S.shelves = 5; S.familyRow = false;
                       gui.controllersRecursive().forEach((c) => c.updateDisplay()); rebuild(); } }, 'f')
  .name('the 1000-item wall');
gYarn.add(S, 'paletteSpread', 0, 1, 0.05).name('colour range').onFinishChange(scatter);
gYarn.add(S, 'bands').name('ball bands').onChange(() => { restage(); applyShading(); });
gYarn.add(S, 'tails').name('yarn ends').onChange(() => { restage(); applyShading(); });

const gHatch = gYarn.addFolder('strand hatching');
gHatch.add(S, 'hatch').name('enabled').onChange(applyShading);
const setHatch = (uniform) => (v) => {
  for (const f of YARN_FAMILIES) {
    const u = yarnMeshes[f].material.userData.hatch;
    if (u) u[uniform].value = v;
  }
};
gHatch.add(S, 'hatchFreq', 4, 90, 1).name('strands').onChange(setHatch('uHatchFreq'));
gHatch.add(S, 'perWeight').name('vary by weight').onChange(() => items.forEach((_, i) => refresh(i)));
gHatch.add(S, 'hatchDepth', 0, 0.6, 0.01).name('depth').onChange(setHatch('uHatchDepth'));
gYarn.add({ f: () => frameSilhouette() }, 'f').name('zoom to 64px  (N)');

const gMat = gYarn.addFolder('matcap');
gMat.addColor(S, 'mcBase').name('midtone (keep near-white)').onChange(remakeMatcap);
gMat.addColor(S, 'mcLight').name('light').onChange(remakeMatcap);
gMat.addColor(S, 'mcShadow').name('shadow').onChange(remakeMatcap);
gMat.add(S, 'mcRim', 0, 1, 0.01).name('rim (fake sheen)').onChange(remakeMatcap);
gMat.add(S, 'mcWrap', 0, 1.2, 0.01).name('terminator wrap').onChange(remakeMatcap);
gMat.add(S, 'toonSteps', 2, 6, 1).name('toon bands').onChange(remakeMatcap);
gMat.add(S, 'paperRim', 0, 1, 0.01).name('band sheen (paper)').onChange(remakeMatcap);
gMat.add(S, 'paperWrap', 0, 1.2, 0.01).name('band softness').onChange(remakeMatcap);

const gHull = gYarn.addFolder('ink outline');
gHull.add(S, 'outline').name('enabled').onChange(applyShading);
gHull.add(S, 'outlineWidth', 0, 0.05, 0.001).name('width').onChange((v) => {
  for (const f of YARN_FAMILIES) yarnHulls[f].material.userData.uniforms.uWidth.value = v;
});
gHull.addColor(S, 'inkColor').name('colour').onChange((v) => {
  for (const f of YARN_FAMILIES) yarnHulls[f].material.color.set(v);
});

const KEY_ACTIONS = new Map([
  ['g', () => { S.showGrid = !S.showGrid; paintActivePlane(); }],
  ['r', scatter],
  ['t', tidyActive],
  ['f', frame],
  ['n', frameSilhouette],
  ['y', () => { S.familyRow = !S.familyRow; scatter(); }],
  ['d', () => { setActiveId(activeId === 'shelf' ? 'peg' : 'shelf'); displayCtl.updateDisplay(); }],
  ['[', () => setPlane(activeDisplay().plane - 1)],
  [']', () => setPlane(activeDisplay().plane + 1)],
]);

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  KEY_ACTIONS.get(k)?.();
  if (k >= '1' && k <= '5') { S.shading = SHADING[Number(k) - 1]; applyShading(); }
  if (drag.index !== EMPTY) onPointerMove(lastPointer);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const perfEl = document.getElementById('perf');
let fps = 60;
let lastPerf = 0;

function updatePerf(dt) {
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.06;
  if (performance.now() - lastPerf < 250) return;
  lastPerf = performance.now();
  const r = renderer.info.render;
  const disp = activeDisplay();
  const { yarnN, yarnTris } = yarnTotals();
  const capped = YARN_FAMILIES.filter((f) => maxBulk(f) < 3);
  const clash = capped.length
    ? `\n!! shelf too short for bulky ${capped.slice(0, 3).join(', ')}` : '';
  const closest = S.familyRow ? closestFamilies() : '';
  perfEl.textContent =
    `${fps.toFixed(0)} fps\ndraw calls ${r.calls}\ntriangles  ${r.triangles}\n` +
    `notions    ${field ? field.count : 0}\n` +
    `yarn       ${yarnN}  (${(yarnTris / 1000).toFixed(1)}k tris)\n` +
    `per 1000   ${yarnN ? (yarnTris / yarnN).toFixed(0) : 0}k tris\n` +
    `${S.shading} / ${S.tier}   ${disp.id} plane ${disp.plane}${closest}${clash}`;
}

function yarnTotals() {
  let yarnN = 0, yarnTris = 0;
  for (const f of YARN_FAMILIES) {
    const m = yarnMeshes[f];
    if (!m) continue;
    yarnN += m.count;
    yarnTris += m.count * triangleCount(m.geometry) * (S.outline && S.shading !== 'silhouette' ? 2 : 1);
  }
  return { yarnN, yarnTris };
}

function closestFamilies() {
  let worst = { d: Infinity, pair: '' };
  for (let i = 0; i < YARN_FAMILIES.length; i++)
    for (let j = i + 1; j < YARN_FAMILIES.length; j++) {
      const d = aspectDistance(YARN_FAMILIES[i], YARN_FAMILIES[j], S.tier);
      if (d < worst.d) worst = { d, pair: `${YARN_FAMILIES[i]}/${YARN_FAMILIES[j]}` };
    }
  return `\nclosest    ${worst.pair} ${worst.d.toFixed(2)}`;
}

const clock = new THREE.Timer();

function buildNotionMeshes(loaded) {
  atlas = loaded;
  field = makeField(atlas.texture, CAPACITY, { unlit: S.unlit, shade: S.shade });
  fieldTop = makeField(atlas.texture, CAPACITY, { unlit: S.unlit, shade: S.shade });
  edge = makeEdge(field, S.edgeColor);
  edgeTop = makeEdge(fieldTop, S.edgeColor);
  for (const e of edges()) {
    e.material.userData.uniforms.uGrow.value = S.edgeGrow;
    e.visible = S.edge;
  }

  shadows = makeShadows(CAPACITY + YARN_CAPACITY);
  boxes = makeBoxes(CAPACITY, S.boxColor);
  boxes.userData.owner = [];

  sizeAtlas = makeSizeAtlas(HOOK_SIZES_MM.map((mm) => mm.toFixed(1)));
  sizeTag = makeField(sizeAtlas.texture, CAPACITY, { unlit: true, shade: 0 });

  scene.add(field, edge, fieldTop, edgeTop, shadows, boxes, sizeTag);
}

loadAtlas(ATLAS_URL, S.theme).then((loaded) => {
  buildNotionMeshes(loaded);

  buildYarnMeshes();

  syncBoxHeight();
  buildPegGrid();
  layoutPegDisplay();

  rebuild();
  if (location.hash === '#test') keyboardPlaneTest();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    updatePerf(Math.min(clock.update().getDelta(), 0.1));
  });
}).catch((err) => {
  document.getElementById('hud').innerHTML =
    `<b>atlas failed to load</b><br>${err.message}<br>` +
    `<span style="opacity:.7">run notion_processing.py first</span>`;
});

function keyboardPlaneTest() {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const { victimIndex, clientX, clientY } = holdOverClearColumn(displays.shelf.g);

  onPointerMove({ clientX, clientY });
  console.log('TEST target on plane 0:', JSON.stringify(drag.target));

  dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
  console.log('TEST after ]: plane', displays.shelf.plane, '(expect 1) target now', JSON.stringify(drag.target));

  onPointerDown({ button: 0, clientX, clientY });
  const after = items[victimIndex];
  console.log('TEST after drop: shelf', after.shelf, 'c', after.c, 'r', after.r, '(expect 1 2 2)');
}

function holdOverClearColumn(g) {
  const victimIndex = 0;
  const victim = items[victimIndex];
  lift(g, victim.keys);
  drag.index = victimIndex;
  displays.shelf.plane = 0;
  if (activeId !== 'shelf') setActiveId('shelf', false);

  for (const it of items) {
    if (it !== victim && it.display === 'shelf' && it.c === 2 && it.r === 2 && it.keys) lift(g, it.keys);
  }
  const rect = slotRect(g, 2, 2, 1, 1);
  const worldPt = new THREE.Vector3(rect.x, shelfBaseY(0, 0) + S.boxHeight / 2, rect.z).applyMatrix4(displays.shelf.frame);
  const proj = worldPt.clone().project(camera);
  const clientX = (proj.x * 0.5 + 0.5) * innerWidth;
  const clientY = (-proj.y * 0.5 + 0.5) * innerHeight;
  return { victimIndex, clientX, clientY };
}
