import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  loadAtlas, cellRect, makeGridLines, makeField, makeEdge, makeShadows, makeBoxes, makeSizeAtlas,
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
import { SHADING, makeMatcap, makePaperMatcap, makeToonRamp, yarnMaterial, bakeVertexAO, makeHull,
         yarnColor, applyHatching, addHatchScale } from './yarn-look.js';

const ATLAS_URL = '../ai_planning_sessions/inventory/illustrations/build';

// EU/metric only for MVP — US/UK/manufacturer hook sizing varies too much to pin down yet.
const HOOK_SIZES_MM = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0, 9.0, 10.0, 12.0];

const S = {
  theme:      'default',
  exposure:   0.95,   // see the note where toneMappingExposure is set
  layout:     'shelf',   // shelf | pyramid | window
  cols:       7,   // one column per yarn family, so the silhouette row fits on one line
  rows:       4,
  cell:       0.26,
  shelves:    2,   // two tall shelves rather than three short ones, given the gap below
  // Tall enough for the biggest yarn the shop carries. With the uniform fit a 3x3x3 super-bulky
  // ball is ~0.70 tall, so a shorter shelf simply cannot hold one — and `fits` would refuse it
  // silently, leaving bulky yarn mysteriously absent rather than visibly too big.
  shelfGap:   0.78,
  // DERIVED: how many layer-pitches fit in the shelf gap. See syncBoxHeight.
  headroom:   4,
  fill:       34,
  tint:       '#241e22',
  // DERIVED = cell * layerRatio. Not an input.
  boxHeight:  0.0325,
  // The O axis's pitch, as a fraction of the slot pitch. This is the quantum an item's height gets
  // rounded to, and it needs to be FINE: at a coarse pitch a rounded shape cannot be represented
  // by any whole number of layers, so it either overflows its reservation (and overlaps whatever
  // stacks on it) or falls short (and holds that thing up in the air). Both were happening.
  layerRatio: 0.125,
  boxColor:   '#e7ddc9',
  unlit:      true,
  showGrid:   true,
  liftHeight: 0.14,
  edge:       true,
  edgeGrow:   1.07,
  edgeColor:  '#1b1418',
  shade:      0.28,

  // ---- yarn asset spike (YARN-ASSET-SPIKE.md) ----
  stock:      'yarn',     // notions | yarn | both  — what the shelf is filled with
  shading:    'matcap',   // matcap | toon | sheen | flat | silhouette
  tier:       'low',      // tessellation, the poly-count axis this spike is about
  familyRow:  true,       // one of each family in a line, for the silhouette test
  yarnCount:  40,
  bands:      true,       // the ball band, as a second instanced family
  tails:      true,       // the loose yarn end, as a third
  hatch:      true,       // wound-strand hatching, from the UVs the families already have
  // 0 = the original tight pastel; 1 = the full range a real shop carries. See yarnColor.
  paletteSpread: 1.0,
  hatchFreq:  26,
  hatchDepth: 0.16,
  // Strand count per yarn WEIGHT, as a multiplier on the base frequency. Physically real rather
  // than decorative: a lace-weight ball genuinely carries far more, far finer strands than a
  // super-bulky one. Costs one float per instance (see addHatchScale).
  perWeight:  true,
  outline:    true,       // ink outline, as an inverted hull
  // Both of these are FROM PLAY, not from theory: the fake sheen reads best at full strength, and
  // a medium-weight line beats a hairline. See YARN-ASSET-SPIKE.md §8.
  outlineWidth: 0.016,
  // matcap knobs, live — the whole reason the matcap is generated rather than loaded
  // Near-white and neutral: the matcap is a MULTIPLIER on albedo, so its lit midtone belongs at
  // ~1.0 or it silently darkens every colour. See makeMatcap.
  mcBase:     '#f0ebe3',
  mcLight:    '#ffffff',
  mcShadow:   '#4a3550',
  mcRim:      1.0,
  // The band's own response. Matte: no rim (the rim IS the fake sheen) and a tighter terminator,
  // because paper does not scatter light into itself the way fibre does.
  paperRim:   0.0,
  paperWrap:  0.22,
  mcWrap:     0.55,
  toonSteps:  3,
};

// Masked shelf shapes. A mask hides slots so a display can be a shop window or a stepped shelf,
// not just a full rectangle — "only certain options are available".
const LAYOUTS = {
  shelf:   () => () => true,
  pyramid: (cols) => (s, c) => c >= s && c < cols - s,                             // narrows as it rises
  window:  (cols, rows) => (s, c, r) => c === 0 || c === cols - 1 || r === 0 || r === rows - 1,  // picture frame
};

// A real pegboard hook sits in ONE column of holes; items hang below it, spanning rows but not
// columns. A full checkerboard mask (c%2 && r%2) would make every multi-cell footprint
// impossible — no two usable cells would ever be adjacent. Column-only sparsity keeps 1-wide
// items of any height placeable, while correctly ruling out anything 2 columns wide (which a
// single hook genuinely can't hold).
const PEG_COLS = 8, PEG_ROWS = 6;
// How far a stack may stick OUT from the wall, in world units rather than in layers. It has to be
// a distance now that the layer pitch is fine: a fixed "3 layers" was 0.098 once the pitch became
// cell/8, which is shorter than every yarn item there is — so nothing could be hung on the board
// at all. Converted to layers against the live pitch instead.
const PEG_REACH = 0.55;
const pegHeadroom = () => Math.max(1, Math.floor(PEG_REACH / S.boxHeight));
const pegMask = (s, c) => c % 2 === 0;

let boxHeightCtl = null, headroomCtl = null;   // read-only displays of DERIVED values

// ---------------------------------------------------------------- displays
//
// Every item's box/label/shadow matrix is computed in DISPLAY-LOCAL space — exactly the existing
// col/row/shelf/layer math, unchanged — then premultiplied by the display's `frame` to place it
// in the world. A shelf's frame is identity (local space === world space, so this is a strict
// no-op for existing behaviour). A peg board's frame is a 90° rotation: local Y (the shelf/layer
// axis — "out of the surface") becomes world Z ("out of the wall"), and local Z (rows) becomes
// world -Y (rows count DOWN the wall, like reading a grid top-to-bottom). This can't be done by
// just parenting things under a rotated Group, because every item shares ONE InstancedMesh across
// BOTH displays — there is no per-item transform hierarchy to hang a group rotation on.
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
// The item in hand, if any, and the slot it would drop into (the picker adapter is further down).
const drag = { index: EMPTY, target: null };

for (const d of Object.values(displays)) {
  d.group = new THREE.Group();
  d.group.matrixAutoUpdate = false;
  d.group.matrix.copy(d.frame);
}

// ---------------------------------------------------------------- scene
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// 0.95, not 0.55. The old value was tuned when the shelf held nothing but ink-on-card notions,
// whose lightness came from the illustration rather than from a palette. Yarn's does come from a
// palette, and ACES at 0.55 was throwing most of it away: a pastel authored at 73% lightness
// arrived at 58% even with a near-white matcap. At 0.95 it arrives at ~73%, so what the palette
// says is what the screen shows. Exposed on the GUI, since it is a look decision.
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
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#8b7a68', 1.1));
const key = new THREE.DirectionalLight('#ffe6c4', 1.6);
key.position.set(2, 4, 2);
scene.add(key);

// ---------------------------------------------------------------- shelf display
const surface = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: '#c9bda9', roughness: 0.95 })
);
surface.rotation.x = -Math.PI / 2;
surface.userData = { dispId: 'shelf', plane: 0 };
displays.shelf.group.add(surface);
displays.shelf.floors = [surface];   // plane 0's floor never changes; levels 1+ pushed on rebuild

// Shelves above the floor had only wireframe grid lines and no physical panel at all, which read
// as "clear" rather than as a shelf. A real box (not a paper-thin plane) so the edge stays visible
// at a grazing angle, one shared material so N shelves cost one extra material, not N.
const GLASS_THICKNESS = 0.012;
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#eef4f2',
  transmission: 0.9,     // see-through
  roughness: 0.45,       // the "blur" in blurred glass — transmission scatters through this
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
  disp.floors = [surface];   // rebuilt fresh alongside the panels each level 1+ is re-tagged onto
  for (let s = 0; s < S.shelves; s++) layoutShelfLevel(disp, s, w, d);
  paintActivePlane();
}

/** One shelf level's grid lines, and above the ground its glass floor. */
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

/** The glass floor of shelf level `s`, tagged so a hover over it knows which plane it is. */
function glassPanel(w, d, s) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glassMaterial);
  panel.scale.set(w * 1.04, GLASS_THICKNESS, d * 1.04);
  panel.position.y = s * S.shelfGap - GLASS_THICKNESS / 2;
  panel.userData = { dispId: 'shelf', plane: s };
  return panel;
}

// ---------------------------------------------------------------- peg board display
//
// "Effectively a 90°-rotated shelf": same grid.js model (cols × rows × 1 plane, headroom for
// how far a stack sticks out from the wall), reprojected by displays.peg.frame. The backing panel
// and grid lines are built with the EXACT same local convention as the shelf's own surface/lines —
// lying flat facing local +Y — because it's the display's `frame` (not the geometry itself) that
// turns that into a vertical wall.
const pegBacking = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: '#b7a68d', roughness: 0.92 })
);
pegBacking.rotation.x = -Math.PI / 2;
pegBacking.userData = { dispId: 'peg', plane: 0 };
displays.peg.group.add(pegBacking);
displays.peg.floors = [pegBacking];   // single plane, never rebuilt

const hookMaterial = new THREE.MeshStandardMaterial({ color: '#8a8578', roughness: 0.55, metalness: 0.2 });

/** One peg per usable column, anchored at its top row, sticking out as far as headroom allows. */
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

// ---------------------------------------------------------------- shared: which plane is lit up
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

// ---------------------------------------------------------------- notions
let atlas = null;
let field = null;      // label on the box's forward face
let edge = null;
let fieldTop = null;   // label on the box's top face
let edgeTop = null;
let shadows = null;
let boxes = null;
let sizeTag = null;    // a number on the box's side, for notions with a size option (e.g. hooks)
let sizeAtlas = null;
const items = [];   // { name, display, shelf, c, r, w, h, layer, keys, color, yaw, size }

const SHAPES = [[1, 1], [2, 1], [1, 2], [2, 2]];
const FILL = 0.9;   // card fills 90% of its footprint, leaving a hairline gap
const CAPACITY = 256;

const _pos = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _topMat = new THREE.Matrix4();
const _sizeMat = new THREE.Matrix4();
const _boxMat = new THREE.Matrix4();
const _shadowMat = new THREE.Matrix4();
const _col = new THREE.Color();

const shelfBaseY = (shelf, layer) => shelf * S.shelfGap + layer * S.boxHeight;

// ---------------------------------------------------------------- yarn assets (the spike)
//
// See ../ai_planning_sessions/inventory/YARN-ASSET-SPIKE.md. Three questions, one instrument:
//
//   1. Does low-poly 3D cost what the spike measured?      -> the perf overlay, at yarnCount 1000
//   2. Can these seven shapes be told apart?               -> familyRow + shading 'silhouette'
//   3. Which shading reads as cosy?                        -> the shading switch, live
//
// One InstancedMesh per family, one hull per family for the ink outline, and ONE band mesh for
// every family at once — the band's per-family placement is baked into the instance matrix
// (bandMatrix premultiplied), so it needs no mesh of its own per family.
// Sized for the 1000-item sameyness check in DESIGN-DECISIONS.md §4, per family, so any single
// family can hold the whole wall. 7 x 1024 matrices is about half a megabyte — a non-issue.
const YARN_CAPACITY = 1024;
const UP = new THREE.Vector3(0, 1, 0);
const yarnMeshes = {};     // family -> InstancedMesh
const yarnHulls = {};      // family -> InstancedMesh sharing the above's instanceMatrix
let bandMesh = null;
let tailMesh = null;
let matcapTex = null;
let paperTex = null;      // the band's own matte response — see PAPER in yarn-look.js
let toonRamp = null;

const _yarnMat = new THREE.Matrix4();
const _bandLocal = new THREE.Matrix4();
const _tailLocal = new THREE.Matrix4();
const _yarnCol = new THREE.Color();
const _q = new THREE.Quaternion();
const _s3 = new THREE.Vector3();
const _p3 = new THREE.Vector3();

/**
 * Strand density for a yarn's weight, relative to the base frequency.
 *
 * Inverse to bulk, and by more than 1/bulk: a bulky ball is drawn THREE TIMES LARGER as well, so
 * without the extra falloff its strands would still be finer on screen than a lace ball's. What
 * should stay roughly constant is the strand's WORLD thickness growing with the yarn's thickness,
 * which is what these numbers do.
 */
const HATCH_FOR_BULK = [1.8, 1.0, 0.62];
const hatchScaleOf = (item) => (S.perWeight ? HATCH_FOR_BULK[(item.bulk ?? 1) - 1] : 1);

// Fitting a family into its footprint lives in yarn-geometry.js — the shop needs the identical
// arithmetic, and two copies of it is how the donut and the floating bugs would come back on one
// page only. Here the footprint comes from the GEOMETRY (a skein is 2x1); in the shop it comes
// from the catalog, where footprint means yarn weight.
const yarnFit = (family, bulk) =>
  sharedYarnFit(family, ...familyFootprint(family, bulk),
                { cell: S.cell, boxHeight: S.boxHeight, fill: FILL, tier: S.tier });

/** How many 2.5D layers an item occupies. Derived from its shape for yarn; a notion is flat. */
const itemLayers = (item) => (item.kind === 'yarn' ? (item.layers ?? 1) : 1);

/**
 * How tall an item is drawn — which is EXACTLY the space it reserves in the grid, and that
 * identity is the whole point.
 *
 * The demo previously drew yarn at "true volume" (bulk x cell) while reserving bulk LAYERS, and a
 * layer is much shorter than a slot is wide: a bulky ball drew 0.70 tall into 0.13 of reserved
 * height, so it grew straight up through whatever was stacked above it and through the shelf. That
 * is the stacking bug — not the grid, which was reserving correctly all along.
 *
 * store.html never had it because it has only ever had one height function. So does this now: the
 * O axis of the NxMxO grid is `boxHeight` per layer, and a thing that occupies O layers is O
 * layers tall. If yarn should look chunkier, the lever is `shelf spacing` (which syncBoxHeight
 * turns into a taller layer) — NOT a second, disagreeing notion of how tall something is.
 */
const itemTall = (item) => itemLayers(item) * S.boxHeight;

function buildYarnMeshes() {
  for (const f of YARN_FAMILIES) buildFamilyMesh(f);
  // The band and the tail are the same structure as a family: one instanced mesh each, and the
  // per-family placement baked into the instance matrix, so neither needs a mesh per family.
  bandMesh?.removeFromParent();
  bandMesh = makeDetailMesh(buildBand(S.tier));
  tailMesh?.removeFromParent();
  tailMesh = makeDetailMesh(buildTail(S.tier));
  applyShading();
}

/** One family's instanced mesh and its outline hull, replacing whatever it had. */
function buildFamilyMesh(f) {
  yarnMeshes[f]?.removeFromParent();
  yarnHulls[f]?.removeFromParent();
  const geo = bakeVertexAO(buildFamily(f, S.tier));
  const mesh = new THREE.InstancedMesh(geo, currentYarnMaterial(), YARN_CAPACITY);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(YARN_CAPACITY * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.userData.owner = [];        // instance slot -> items[] index, for picking
  if (mesh.material.userData.hatch) addHatchScale(mesh, YARN_CAPACITY);
  yarnMeshes[f] = mesh;
  scene.add(mesh);

  const hull = makeHull(mesh, { color: S.edgeColor, width: S.outlineWidth });
  yarnHulls[f] = hull;
  scene.add(hull);
}

function makeDetailMesh(geometry) {
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
  // A second matcap is the entire cost of giving paper its own surface: no extra draw call, no
  // extra material slot, no shader variant. See PAPER in yarn-look.js.
  const m = yarnMaterial(S.shading, { matcap: paper ? paperTex : matcapTex, ramp: toonRamp });
  // Hatching goes on the yarn, never on the band or the tail: a paper band is not wound, and a
  // single strand hatched with strand marks reads as a tiny rope.
  if (hatch) applyHatching(m, { freq: S.hatchFreq, depth: S.hatchDepth });
  return m;
}

/** Swap every yarn material, and strip the scene back to shapes alone for the silhouette test. */
function applyShading() {
  const solo = S.shading === 'silhouette';
  for (const f of YARN_FAMILIES) reshadeFamily(f, solo);
  // The band gets the matte PAPER response; the tail is yarn and keeps the yarn's.
  for (const [mesh, on, paper] of [[bandMesh, S.bands, true], [tailMesh, S.tails, false]]) {
    mesh.material.dispose();
    mesh.material = currentYarnMaterial({ hatch: false, paper });
    // The silhouette test keeps them: they are part of the shape being judged. A tail in
    // particular is there precisely to change an outline.
    mesh.visible = on;
  }
  showScenery(!solo);
  paintActivePlane();
}

/** A fresh yarn material on one family, and its outline shown unless this is the silhouette test. */
function reshadeFamily(f, solo) {
  const mesh = yarnMeshes[f];
  mesh.material.dispose();
  mesh.material = currentYarnMaterial();
  // The per-instance attribute lives on the GEOMETRY and survives a material swap, but the
  // define that reads it lives on the MATERIAL — so a fresh material has to be told again.
  if (mesh.material.userData.hatch && mesh.geometry.getAttribute('aHatchScale')) {
    mesh.material.defines = { ...mesh.material.defines, USE_HATCH_SCALE: '' };
    mesh.material.needsUpdate = true;
    mesh.userData.hatchScale = mesh.geometry.getAttribute('aHatchScale');
  }
  yarnHulls[f].visible = S.outline && !solo;
}

/**
 * The silhouette test is only a test if nothing else is in the picture: white ground, no shelf,
 * no grid, no shadows, no notions. If the shapes cannot be named like this, no amount of
 * shading will rescue them at 40px on a busy shelf.
 */
function showScenery(on) {
  scene.background.set(on ? '#ddd5c8' : '#ffffff');
  surface.visible = on;
  pegBacking.visible = on;
  displays.shelf.panels.forEach((p) => { p.visible = on; });
  if (displays.peg.hooks) displays.peg.hooks.visible = on;
  if (shadows) shadows.visible = on;
}

/** One yarn item, at rest or floating. Unit-space geometry scaled into the slot. */
function paintYarn(display, index, { cx, cz, base, yaw }) {
  const item = items[index];
  const mesh = yarnMeshes[item.family];
  // UNIFORM horizontally, settled vertically — see yarnFit. Never one scale per axis: that is what
  // turned skeins into donuts and left everything stacked on air.
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

/** The ball band and the loose end, riding the yarn's own matrix (already in _yarnMat). */
function paintYarnDetails(item) {
  if (item.bandSlot != null) {
    const bm = bandMatrix(item.family, _bandLocal);
    bandMesh.setMatrixAt(item.bandSlot, bm.premultiply(_yarnMat));
    bandMesh.instanceMatrix.needsUpdate = true;
    // A band is PAPER, not yarn: near-white and independent of the ball's colour, which is the
    // readability win DESIGN-DECISIONS.md §2 wanted from making it a separate family at all.
    bandMesh.setColorAt(item.bandSlot, _yarnCol.set('#f6efe1'));
    bandMesh.instanceColor.needsUpdate = true;
  }

  if (item.tailSlot != null) {
    const tm = tailMatrix(item.family, _tailLocal);
    tailMesh.setMatrixAt(item.tailSlot, tm.premultiply(_yarnMat));
    // ponytail: a non-square parent (the 2x1 skein) stretches the curl along with it. It reads
    // fine at 2x1; if a family ever goes wider, undo the parent's aspect on the tail instead.
    tailMesh.instanceMatrix.needsUpdate = true;
    // The end IS the yarn, so it takes the ball's own colour — that is what makes it read as a
    // strand escaping the wind rather than as a separate object stuck on.
    tailMesh.setColorAt(item.tailSlot, item.color);
    tailMesh.instanceColor.needsUpdate = true;
  }
}

function paintYarnShadow(display, item, fit, { cx, cz, base, yaw }) {
  // Rule 6 of the perf rules: items never cast into a shadow map, they get a fake contact quad.
  // Without one, a ball reads as hovering above the shelf rather than resting on it.
  // Rule 6 again: the contact shadow sized to what is actually DRAWN, not to the slot. With a
  // uniform fit a family rarely fills its footprint exactly, and a shadow bigger than the object
  // is the other way to make something look like it is hovering.
  const [uw, , ud] = familyExtent(item.family, S.tier);
  _pos.set(cx, base + 0.003, cz);
  shadows.setMatrixAt(item.shadowSlot,
    placeMatrix(_pos, fit.k * uw * 1.02, fit.k * ud * 1.02, yaw, _shadowMat).premultiply(display.frame));
  shadows.instanceMatrix.needsUpdate = true;
}

// A box gives the item real volume; the illustrated card becomes a label glued to the box's
// forward face (standing, so it reads like a product on a shelf) AND a second copy lying flat on
// the box's top, so the item is identifiable looking straight down as well as from the side.
//
// Everything here is computed in DISPLAY-LOCAL space, identically regardless of which display —
// `.premultiply(display.frame)` is what projects it into the world, so a peg board needs no
// separate version of this function. That's the concrete meaning of "just a rotated shelf".
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

/** The box's front label, its top label and the size number on its side. */
function paintLabels(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH }) {
  // Instance index, NOT the items[] index: yarn and notions now share one item list but have
  // separate meshes, so an item's position in the list is no longer its position in a buffer.
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

/**
 * A size number on the box's SIDE face (perpendicular to the front label) — reuses
 * placeLabelMatrix with the yaw rotated 90° further, since that's exactly the box's side normal.
 */
function paintSizeTag(item, F, { cx, cz, boxBase, yaw }, { boxW, boxD, boxH }) {
  const sx = Math.cos(yaw), sz = -Math.sin(yaw);
  const sideOut = boxW / 2 + 0.003;
  _pos.set(cx + sx * sideOut, boxBase + boxH * 0.55, cz + sz * sideOut);
  setInstance(sizeTag, item.slot, {
    matrix: placeLabelMatrix(_pos, boxD * 0.5, boxH * 0.5, yaw + Math.PI / 2, _sizeMat).premultiply(F),
    rect: cellRect(sizeAtlas.manifest, item.size != null ? item.size.toFixed(1) : 'blank'),
  });
}

// Draw an item at rest in its slot.
function refresh(index) {
  const item = items[index];
  const disp = displays[item.display];
  const rect = slotRect(disp.g, item.c, item.r, item.w, item.h);
  const base = shelfBaseY(item.shelf, item.layer);
  const at = { cx: rect.x, cz: rect.z, yaw: item.yaw };
  if (item.kind === 'yarn') paintYarn(disp, index, { ...at, base });
  else paintInstance(disp, index, { ...at, boxBase: base, shadowBase: base }, { footW: rect.w * FILL, footD: rect.d * FILL });
}

// Draw an item floating under the pointer, on WHICHEVER display is currently active — that may
// differ from the item's own display if the player switched displays mid-drag.
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

/**
 * Hand every item a slot in its own mesh and redraw.
 *
 * Separated from scatter because the slot mapping has to be rebuilt whenever the SET of drawn
 * items changes for any reason — a stock switch, a band toggle, a family retessellation — not only
 * when the shelf is reshuffled. items[] index and instance slot are two different numbers now.
 */
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

/** Every item its instance slot in its own mesh(es); returns how many each shared mesh now holds. */
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

/** `bulk` is YARN.md's 1x1x1..3x3x3 grid size — NOT a notion's `size`, which is hook millimetres. */
function pushYarn(disp, family, bulk, { shelf, c, r, keys }) {
  const index = items.length;
  const fit = yarnFit(family, bulk);
  items.push({
    kind: 'yarn', family, bulk, display: 'shelf',
    shelf, c, r, w: fit.w, h: fit.h, keys,
    // Layers come from the SHAPE, not from bulk — a flat skein reserves fewer than a round ball of
    // the same footprint. Stored rather than recomputed so the grid and the renderer can never
    // disagree about how many layers an item is holding.
    layers: fit.layers,
    layer: place(disp.g, keys, index, fit.layers),
    color: yarnColor(Math.random, undefined, { spread: S.paletteSpread }),
    // Booklets stand square to the shelf like books; everything round gets a nudge.
    // Booklets stand square to the shelf like books; everything round gets the same nudge a
    // notion gets, from the shared jitter rather than a third private number.
    yaw: family === 'booklet' ? 0 : scatterYaw(),
  });
}

/**
 * The silhouette test, as a layout: one of each family, all the SAME size, in a line.
 *
 * Same size is the point — a size difference would let the eye tell two families apart for a
 * reason that says nothing about whether their shapes are distinguishable, which is the one thing
 * this row exists to answer.
 */
function addFamilyRow(disp) {
  // Walk a cursor rather than indexing by family, since footprints now differ — a 2x1 skein must
  // not be laid on top of the ball to its left.
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
    if (!keys) break;                       // out of room; the rest of the row is simply not shown
    pushYarn(disp, family, 1, { shelf: 0, c, r, keys });
    c += w;
  }
}

/** The biggest bulk of this family that will actually fit under a shelf. At least 1. */
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
    // YARN.md: "anywhere from 1x1x1 (thread, lace weight) to 3x3x3 (super bulky housewares yarn)".
    // Clamped to what the shelf can actually take: an unclamped roll on a short shelf throws away
    // most of its attempts and quietly produces a shop with no bulky yarn in it at all.
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
  if (drag.index !== EMPTY) return;   // avoid desyncing item indices out from under an active drag
  const disp = displays.shelf;
  buildShelfGrid();
  layoutShelfDisplay();
  // Only shelf items are cleared/regenerated — the peg board is a manually-curated experiment
  // area, not something "reshuffle" should touch.
  for (let i = items.length - 1; i >= 0; i--) if (items[i].display === 'shelf') items.splice(i, 1);

  if (S.stock !== 'notions') addYarn(disp);
  if (S.stock !== 'yarn') addNotions(disp);
  restage();
}

/**
 * The layer height is DERIVED, not set: `boxHeight = (shelfGap / headroom) * boxFill`.
 *
 * It used to be an independent slider that was merely clamped down when it exceeded the gap, and
 * that made "raise the shelf spacing to get chunkier yarn" quietly not work: raising the gap
 * raised the CEILING and left the height sitting exactly where it was. The two numbers describe
 * one physical thing — how tall a slot of the O axis is — so only one of them can be the input.
 *
 * `boxFill` is the knob that survives: what fraction of the available pitch a layer actually
 * occupies, for when a stack should have air in it. At 1 a full stack exactly fills the gap.
 */
function syncBoxHeight() {
  S.boxHeight = S.cell * S.layerRatio;
  // Headroom is now DERIVED too: it is simply how many layer-pitches fit under the next shelf.
  // Making it an input alongside the gap and the pitch was over-determining one physical fact.
  S.headroom = Math.max(1, Math.floor(S.shelfGap / S.boxHeight));
  boxHeightCtl?.updateDisplay();
  headroomCtl?.updateDisplay();
}

function rebuild() {
  displays.shelf.plane = Math.min(displays.shelf.plane, S.shelves - 1);
  syncBoxHeight();
  // The peg board's headroom follows the layer pitch too, so it is no longer a build-once display:
  // leaving it stale would let a stack stick further out from the wall than its hooks reach.
  if (displays.peg.g) { buildPegGrid(); layoutPegDisplay(); }
  scatter();
  frame();
}

// ---------------------------------------------------------------- tidy up
//
// Regroups one plane's items by kind into piles, zeroing yaw so each pile reads as a clean
// stack rather than a scatter of jittered boxes. Rebuilds the plane from scratch (clearShelf)
// rather than repacking in place, which sidesteps reasoning about the old layout at all.
function tidyPlane(disp, s) {
  const byKind = kindsOnPlane(disp, s);
  clearShelf(disp.g, s);
  const cells = emptyCells(disp.g, s);
  for (const [, indices] of [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    pileKind(disp, s, indices, cells);
  }
}

/** This plane's items by what they are: kind name -> items[] indices. */
function kindsOnPlane(disp, s) {
  const byKind = new Map();
  items.forEach((item, i) => {
    if (item.display !== disp.id || item.shelf !== s) return;
    // Yarn has no `name` — it has a family. Without this every yarn item grouped under the key
    // `undefined` and tidying piled all seven families into one indiscriminate stack.
    const kind = item.kind === 'yarn' ? `yarn:${item.family}` : item.name;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(i);
  });
  return byKind;
}

/** A cursor over the plane's empty usable cells, in order: `next` stays put until it fills, `skip` moves on. */
function emptyCells(g, s) {
  let cursor = 0;
  return {
    next() {
      while (cursor < g.cols * g.rows) {
        const c = cursor % g.cols, r = (cursor / g.cols) | 0;
        if (usableAt(g, s, c, r) && topAt(g, s, c, r) === EMPTY) return { c, r };
        cursor++;
      }
      return null;   // plane is full
    },
    skip() { cursor++; },
  };
}

/** One kind's items stacked into a pile, and an overflow pile of the same kind when it tops out. */
function pileKind(disp, s, indices, cells) {
  const { g } = disp;
  let anchor = cells.next();   // a NEW kind always starts a fresh pile, never joins one in progress
  for (const i of indices) {
    if (!anchor) break;   // ponytail: plane ran out of room; leftovers just keep their old spot, unrendered
    const item = items[i];
    const tall = itemLayers(item);
    let keys = footprint(g, s, [anchor.c, anchor.r], [item.w, item.h]);
    if (!fits(g, keys, tall)) {   // this pile hit headroom — start an overflow pile of the SAME kind
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
  if (drag.index !== EMPTY) return;   // no-op mid-drag rather than risk corrupting the grid
  const disp = activeDisplay();
  tidyPlane(disp, disp.plane);        // only the plane the player is currently arranging
}

// ---------------------------------------------------------------- dragging
//
// The geometry of this now lives in ./pick-place.js, shared with characters/store.html. It was
// EXTRACTED FROM store.html rather than from here: the game had grown the better version — a
// forgiving screen-space pick, a snap onto the nearest slot the item actually fits in, and layer
// awareness throughout — while this demo still ran the one-plane, one-layer original it was
// ported from. Adding yarn (which is genuinely 1-3 layers tall) is what made the divergence bite:
// a bulky ball picked up off a stack came back down flattened into a single layer.
//
// The decisions themselves are unchanged and recorded in
// ../ai_planning_sessions/inventory/DESIGN-DECISIONS.md §7 — click to pick up rather than
// press-and-hold, cast the slot plane rather than the items, be forgiving about aim.
//
// The adapter below is the entire difference between this scene and the game's: how a shelf level
// is positioned (here, stacked flat at shelfGap; there, tilted 45°) and how tall an item is.
// Last real pointer position, kept fresh on every pointermove — lets a KEYBOARD-triggered plane
// or display switch mid-hold (see the keydown handler) recompute the ghost/drop target right away,
// without waiting on the player to also jiggle the mouse after pressing [ ] / ] / D.
const lastPointer = { clientX: innerWidth / 2, clientY: innerHeight / 2 };

const _levelFrame = new THREE.Matrix4();
const _levelOffset = new THREE.Matrix4();

const picker = makePicker({
  camera,
  displays: () => Object.values(displays),
  items: () => items,
  // A level here is the display's frame lifted along its own local Y. store.html builds these once
  // because its levels are tilted and never move; this one has live GUI sliders for shelfGap, so
  // it composes on demand instead.
  levelFrame: (disp, shelf) => _levelFrame.copy(disp.frame)
    .multiply(_levelOffset.makeTranslation(0, shelf * S.shelfGap, 0)),
  itemHeight: (_disp, item) => item.layer * S.boxHeight + itemTall(item),
  itemTall: (_disp, item) => itemTall(item),
  exposed: fullyExposed,
  grabRadius: () => S.grabRadius,
  snapCells: () => S.snapCells,
});
// hoverTarget is deliberately NOT taken: see pickTarget below for why this scene resolves the
// display by occlusion instead. store.html uses it because its levels are tilted apart.
const { pickCandidate, snapTo, raycaster, setRay: setRayFromEvent } = picker;
const displayPoint = (disp, event) => picker.displayPoint(disp, disp.plane, event);

/**
 * Which DISPLAY the pointer is over, by a real raycast against its floor/panel meshes.
 *
 * Kept separate from the picker's own hoverTarget: this demo has two PHYSICALLY separate displays
 * (a shelf unit and a peg board on a wall), and which one you are pointing at is settled by true
 * occlusion rather than by which math plane happens to be nearest. A couple of objects, nowhere
 * near the scale the "never raycast items" rule is about.
 *
 * Deliberately stops at DISPLAY granularity, not shelf LEVEL. Every level shares the same (col,row)
 * footprint and the glass panels are only VISUALLY transparent — a raycast knows nothing about
 * `transmission` — so a click could resolve to whichever panel physically sits in the way rather
 * than the level the player can plainly see through to. That needs an unambiguous signal, which
 * [ ] already is. (store.html can do per-level hover because its levels are tilted and therefore
 * do not stack into the same screen area.)
 */
function pickTarget(event) {
  setRayFromEvent(event);
  const candidates = Object.values(displays).map((disp) => disp.floors[disp.plane]);
  const hits = raycaster.intersectObjects(candidates, false);
  if (!hits.length) return null;
  const disp = displays[hits[0].object.userData.dispId];
  const local = hits[0].point.clone().applyMatrix4(disp.frameInv);
  if (!columnAt(disp.g, local.x, local.z)) return null;   // hit the panel, but outside the grid
  return disp;
}

/**
 * Pick up whatever is under the pointer.
 *
 * Two-stage, and the order matters. The shared forgiving pick runs FIRST, because it is the one
 * that can grab a box the pointer merely came close to — the thing that makes this usable with a
 * finger. Only if it finds nothing does the display raycast run, so that clicking bare shelf still
 * selects the display you are pointing at: you should be able to point at where you are about to
 * work, not only at where a box already is.
 */
function pickUp(event) {
  const found = pickCandidate(event);
  if (found) {
    const { disp, index, shelf } = found;
    if (activeId !== disp.id) setActiveId(disp.id, false);
    if (disp.plane !== shelf) setPlane(shelf);
    drag.index = index;
    lift(disp.g, items[index].keys);   // out of the grid, so it can't block its own drop
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
  if (drag.index === EMPTY) return;   // only relevant while holding something

  // Hovering onto a different display TEMPORARILY activates it, no keyboard step required.
  // Hovering into "dead space" (over neither display) snaps activation back to wherever the held
  // item actually came from — items[drag.index].display never changes during a hold except on a
  // successful drop, so it's already the single source of truth for "home", no extra state needed.
  const hover = pickTarget(event);
  const wantId = hover ? hover.id : items[drag.index].display;
  if (wantId !== activeId) setActiveId(wantId, false);

  const disp = activeDisplay();
  const point = displayPoint(disp, event);
  if (!point) return;
  const item = items[drag.index];
  // The shared snap: the nearest slot the item ACTUALLY FITS IN, layers included, rather than
  // whichever column the ray happened to land in.
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
    // Moving to a NEW display/plane — may differ from where it was picked up.
    item.display = activeId;
    item.shelf = activeDisplay().plane;
  }
  // else: no valid target on whichever display/plane is now active — it falls back to wherever it
  // actually still belongs, which placeItem reads off the item itself.
  const home = displays[item.display];
  // Through placeItem, NOT place() directly: it carries the layer count, and forgetting that is
  // precisely the bug this refactor exists to kill — a three-layer bulky ball placed as one layer
  // looks fine until something stacks into the two layers it was silently not occupying.
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
  // The target's own footprint, not the item's: a turned drop swaps them, and the preview has
  // to show where it will ACTUALLY land or the turn is a surprise at release.
  const rect = slotRect(disp.g, t.c, t.r, t.w ?? item.w, t.h ?? item.h);
  marker.position.set(rect.x, shelfBaseY(disp.plane, t.layer) + 0.004, rect.z).applyMatrix4(disp.frame);
  marker.quaternion.copy(disp.quat).multiply(FLAT_Q);
  marker.scale.set(rect.w * 0.96, rect.d * 0.96, 1);
  marker.material.color.set('#3f7f5a');
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
// Window-level, not canvas-level: movement must keep tracking (for the display hand-off above)
// even if the cursor wanders over the HUD or GUI chrome while something is held.
addEventListener('pointermove', onPointerMove);

// ---------------------------------------------------------------- framing
//
// NOT "take the shelf's local offset and rotate it through the frame" — that seems tempting
// (reuse the same trick paintInstance uses) but it's wrong here. For the shelf, world Y
// (elevation) and world Z (pull the camera back) are two DIFFERENT axes that happen to both be
// perpendicular to the "layer" axis. Rotating that same offset through the peg board's frame
// collapses them onto the wrong axes — it puts the camera staring straight down at the wall
// instead of standing in front of it. World Y is elevation and world Z is "pull back toward the
// viewer" for BOTH displays (the peg board's frame was specifically built so rows still go up in
// world Y) — so express the camera position directly in world space instead.
function frame() {
  const disp = activeDisplay();
  const { w, d } = gridSize(disp.g);
  const isShelf = disp.id === 'shelf';
  const height = isShelf ? S.shelves * S.shelfGap : PEG_REACH;
  const center = new THREE.Vector3(0, height * 0.4, 0).applyMatrix4(disp.frame);   // a point, not a direction

  // The peg board's "height" above is only how far a stack sticks OUT (small) — its actual size
  // on the wall is (w, d), same as the shelf's own (w, d, height) volume.
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

/**
 * Pull back until one slot is about 64 CSS pixels across — roughly what a shelved item occupies at
 * the game's own diorama distance.
 *
 * This is the actual test. A shape that cannot be named at this size will not be nameable in play
 * however good the model is, and judging silhouettes at a comfortable working zoom is how a set of
 * shapes gets approved and then reads as mush in the game.
 */
function frameSilhouette(px = 64) {
  const disp = displays.shelf;
  const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const dist = (S.cell * innerHeight) / (2 * Math.tan(halfFov) * px);
  // The family row lives on row 0 of the shelf, which is the grid's near edge; the grid itself is
  // centred on x, so the row's midpoint is x = 0.
  const { d } = gridSize(disp.g);
  const center = new THREE.Vector3(0, S.cell * 0.45, -d / 2 + S.cell / 2);
  controls.target.copy(center);
  camera.position.set(center.x, center.y + dist * 0.18, center.z + dist);
  controls.update();
}

// ---------------------------------------------------------------- gui
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
// refocus=false is used when the switch happens incidentally mid-hold (hovering onto a different
// display while carrying an item) — jumping the camera there would yank the view out from under
// the player's hands. An explicit switch (D key, dropdown, or a fresh pickup) still recentres.
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
// onChange, not onFinishChange: this now drives how tall the stock is drawn, so it should be
// visible while dragging rather than only on release.
gGrid.add(S, 'shelfGap', 0.12, 0.9, 0.01).name('shelf spacing').onChange(() => {
  syncBoxHeight();
  items.forEach((_, i) => refresh(i));
}).onFinishChange(rebuild);
gGrid.add(S, 'showGrid').name('show grid  (G)').onChange(paintActivePlane);

const gLook = gui.addFolder('notion look');
// The input is the layer RATIO — how finely the O axis is subdivided. Everything else about the
// vertical axis follows from it and the shelf gap, and is shown read-only so nothing can disagree.
gLook.add(S, 'layerRatio', 0.05, 0.5, 0.005).name('layer pitch (of a slot)').onFinishChange(rebuild);
boxHeightCtl = gLook.add(S, 'boxHeight').name('layer height (derived)').listen().disable();
gLook.addColor(S, 'boxColor').name('box colour').onChange((v) => boxes.material.color.set(v));
gLook.addColor(S, 'tint').name('label ink').onChange(() => {
  items.forEach((item, i) => { item.color = S.tint; refresh(i); });
});
gLook.add(S, 'shade', 0, 0.8, 0.01).name('gradient').onChange((v) => {
  field.material.userData.uniforms.uShade.value = v;
  fieldTop.material.userData.uniforms.uShade.value = v;
});

// ---------------------------------------------------------------- yarn spike controls
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
gHatch.add(S, 'hatchFreq', 4, 90, 1).name('strands').onChange((v) => {
  for (const f of YARN_FAMILIES) {
    const u = yarnMeshes[f].material.userData.hatch;
    if (u) u.uHatchFreq.value = v;
  }
});
gHatch.add(S, 'perWeight').name('vary by weight').onChange(() => items.forEach((_, i) => refresh(i)));
gHatch.add(S, 'hatchDepth', 0, 0.6, 0.01).name('depth').onChange((v) => {
  for (const f of YARN_FAMILIES) {
    const u = yarnMeshes[f].material.userData.hatch;
    if (u) u.uHatchDepth.value = v;
  }
});
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
gLook.add(S, 'exposure', 0.2, 2, 0.01).name('exposure')
  .onChange((v) => { renderer.toneMappingExposure = v; });

const gHull = gYarn.addFolder('ink outline');
gHull.add(S, 'outline').name('enabled').onChange(applyShading);
gHull.add(S, 'outlineWidth', 0, 0.05, 0.001).name('width').onChange((v) => {
  for (const f of YARN_FAMILIES) yarnHulls[f].material.userData.uniforms.uWidth.value = v;
});

const gEdge = gui.addFolder('thickness / outline');
gEdge.add(S, 'edge').name('enabled').onChange((v) => { edge.visible = v; edgeTop.visible = v; });
gEdge.add(S, 'edgeGrow', 1.0, 1.30, 0.005).name('outline width')
  .onChange((v) => { edge.material.userData.uniforms.uGrow.value = v; edgeTop.material.userData.uniforms.uGrow.value = v; });
gEdge.addColor(S, 'edgeColor').name('colour').onChange((v) => { edge.material.color.set(v); edgeTop.material.color.set(v); });

// One action per key. A Map, not an object: `e.key` is the page's, and 'constructor' is a key too.
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
  // A keyboard switch changed WHERE a held item would drop (plane or display) but the mouse itself
  // never moved, so nothing would normally recompute drag.target/the ghost until the next real
  // pointermove — meaning a click right after [ / ] / D dropped the item back where it started.
  // Re-run the move logic against the last known pointer position to pick that up immediately.
  if (drag.index !== EMPTY) onPointerMove(lastPointer);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- perf
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
  // Headroom derives from the gap, so a full stack fits by construction. What CAN fail is the
  // shelf being too short for the biggest yarn the shop carries — say so, rather than letting
  // `fits` silently omit it.
  const capped = YARN_FAMILIES.filter((f) => maxBulk(f) < 3);
  const clash = capped.length
    ? `\n!! shelf too short for bulky ${capped.slice(0, 3).join(', ')}` : '';
  const closest = S.familyRow ? closestFamilies() : '';
  perfEl.textContent =
    `${fps.toFixed(0)} fps\ndraw calls ${r.calls}\ntriangles  ${r.triangles}\n` +
    `notions    ${field ? field.count : 0}\n` +
    `yarn       ${yarnN}  (${(yarnTris / 1000).toFixed(1)}k tris)\n` +
    `per 1000   ${yarnN ? ((yarnTris / yarnN) * 1000 / 1000).toFixed(0) : 0}k tris\n` +
    `${S.shading} / ${S.tier}   ${disp.id} plane ${disp.plane}${closest}${clash}`;
}

/** How many yarn items are drawn, and their triangles (twice over, with the outline hull on). */
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

/** The two families whose silhouettes are nearest alike, for the family-row readout. */
function closestFamilies() {
  let worst = { d: Infinity, pair: '' };
  for (let i = 0; i < YARN_FAMILIES.length; i++)
    for (let j = i + 1; j < YARN_FAMILIES.length; j++) {
      const d = aspectDistance(YARN_FAMILIES[i], YARN_FAMILIES[j], S.tier);
      if (d < worst.d) worst = { d, pair: `${YARN_FAMILIES[i]}/${YARN_FAMILIES[j]}` };
    }
  return `\nclosest    ${worst.pair} ${worst.d.toFixed(2)}`;
}

// ---------------------------------------------------------------- go
const clock = new THREE.Clock();

/** The notion meshes, built on the loaded atlas: labels, outlines, boxes, size tags, shadows. */
function buildNotionMeshes(loaded) {
  atlas = loaded;
  field = makeField(atlas.texture, CAPACITY, { unlit: S.unlit, shade: S.shade });
  edge = makeEdge(field, S.edgeColor);
  edge.material.userData.uniforms.uGrow.value = S.edgeGrow;
  edge.visible = S.edge;

  fieldTop = makeField(atlas.texture, CAPACITY, { unlit: S.unlit, shade: S.shade });
  edgeTop = makeEdge(fieldTop, S.edgeColor);
  edgeTop.material.userData.uniforms.uGrow.value = S.edgeGrow;
  edgeTop.visible = S.edge;

  // Shadows are shared by notions and yarn, so the mesh is sized for both at once.
  shadows = makeShadows(CAPACITY + YARN_CAPACITY);
  boxes = makeBoxes(CAPACITY, S.boxColor);
  boxes.userData.owner = [];   // instance slot -> items[] index, for picking

  sizeAtlas = makeSizeAtlas(HOOK_SIZES_MM.map((mm) => mm.toFixed(1)));
  sizeTag = makeField(sizeAtlas.texture, CAPACITY, { unlit: true, shade: 0 });

  scene.add(field, edge, fieldTop, edgeTop, shadows, boxes, sizeTag);
}

loadAtlas(ATLAS_URL, S.theme).then((loaded) => {
  buildNotionMeshes(loaded);

  // Yarn meshes before the first scatter: restage() hands out their instance slots.
  buildYarnMeshes();

  // Derived values first: the peg board's headroom is now a function of the layer pitch, so it
  // cannot be built before that pitch exists.
  syncBoxHeight();
  buildPegGrid();
  layoutPegDisplay();

  rebuild();
  if (location.hash === '#test') keyboardPlaneTest();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    updatePerf(Math.min(clock.getDelta(), 0.1));
  });
}).catch((err) => {
  document.getElementById('hud').innerHTML =
    `<b>atlas failed to load</b><br>${err.message}<br>` +
    `<span style="opacity:.7">run notion_processing.py first</span>`;
});

/** `#test`: a keyboard plane switch mid-hold must re-aim the drop without the mouse moving. */
function keyboardPlaneTest() {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const { victimIndex, clientX, clientY } = holdOverClearColumn(displays.shelf.g);

  onPointerMove({ clientX, clientY });   // establish a target on plane 0, like a real drag would
  console.log('TEST target on plane 0:', JSON.stringify(drag.target));

  dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));   // switch to plane 1 WITHOUT moving the mouse
  console.log('TEST after ]: plane', displays.shelf.plane, '(expect 1) target now', JSON.stringify(drag.target));

  onPointerDown({ button: 0, clientX, clientY });   // drop, still at the same screen position
  const after = items[victimIndex];
  console.log('TEST after drop: shelf', after.shelf, 'c', after.c, 'r', after.r, '(expect 1 2 2)');
}

/** The test's setup: item 0 in hand, over column (2,2) cleared on every level; where that is on screen. */
function holdOverClearColumn(g) {
  // Isolate the mechanism under test (stale ghost/target after a KEYBOARD plane switch) from
  // incidental scatter occlusion by bypassing pickUp's own box raycast — lift a known item
  // directly and drive drag state exactly like pickUp would have left it.
  const victimIndex = 0;
  const victim = items[victimIndex];
  lift(g, victim.keys);
  drag.index = victimIndex;
  displays.shelf.plane = 0;
  if (activeId !== 'shelf') setActiveId('shelf', false);

  // Column (2,2) — well inside the grid, not a corner — cleared on every shelf level so the
  // hover test has nothing else to hit and no parallax round-trip pushes it out of bounds.
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
