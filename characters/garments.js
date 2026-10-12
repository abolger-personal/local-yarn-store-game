// Spec: ai_planning_sessions/characters/VISUAL-DESIGN-FINISHED-OBJ.md ("How the generator is built")

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, LIMB_TAPER, POSES, applyPose, femurOf, knitMaterial, tibiaOf } from './npc.js';
import { applyHatching, yarnColor } from '../inventory/yarn-look.js';
import { YARN_MATERIALS, YARN_WEIGHT_NAMES } from '../inventory/catalog.js';

const TAU = Math.PI * 2;

// VISUAL-DESIGN-FINISHED-OBJ.md §2b.5
export const STITCHES_BY_CRAFT = Object.freeze({
  knit: Object.freeze(['stockinette', 'rib', 'garter', 'seed', 'linen stitch', 'cable']),
  crochet: Object.freeze(['single crochet', 'waffle', 'puff', 'lace']),
});
export const STITCHES = Object.freeze(Object.values(STITCHES_BY_CRAFT).flat());
export const CRAFTS = Object.freeze(Object.keys(STITCHES_BY_CRAFT));
export function craftStitch(craft, stitch) {
  const list = STITCHES_BY_CRAFT[craft] ?? STITCHES_BY_CRAFT.knit;
  return list.includes(stitch) ? stitch : list[0];
}
export const COLOURWORKS = Object.freeze(['solid', 'stripes', 'checks', 'colour-block', 'motif', 'fair isle', 'marled']);
export const EDGES = Object.freeze(['none', 'rolled', 'ribbed', 'fringed', 'picot', 'scalloped']);
export const FORMS = Object.freeze(['draped', 'wrapped once', 'wrapped twice', 'tied', 'tucked']);
export const ACCESSORIES = Object.freeze(['none', 'pom-pom', 'tassel', 'buttons', 'flower']);
export const SLEEVES = Object.freeze(['none', 'short', 'long']);
export { YARN_WEIGHT_NAMES as WEIGHTS, YARN_MATERIALS as FIBRES };

export const GARMENTS = Object.freeze({
  hat: { slot: 'head', edge: 'rolled',
    silhouettes: ['beanie', 'slouch', 'fisherman', 'beret', 'earflap', 'hood', 'headband', 'bucket', 'cloche', 'pixie'] },
  scarf: { slot: 'neck', edge: 'none', forms: FORMS,
    silhouettes: ['cowl', 'infinity', 'ascot', 'long', 'trailing', 'skinny', 'kerchief', 'chunky wrap'] },
  shawl: { slot: 'shoulders', edge: 'none', forms: Object.freeze(['draped', 'tied']), accessories: Object.freeze([...ACCESSORIES.filter((a) => a !== 'pom-pom'), 'pin']),
    silhouettes: ['triangle', 'half circle', 'rectangular wrap', 'crescent', 'capelet', 'shrug'] },
  sweater: { slot: 'torso', edge: 'ribbed', sleeves: true,
    silhouettes: ['pullover', 'cardigan', 'vest', 'turtleneck', 'cropped', 'tunic', 'raglan'] },
  bag: { slot: 'bag', edge: 'none',
    silhouettes: ['shoulder bag', 'market bag', 'backpack', 'tote', 'bucket bag', 'crossbody pouch', 'drawstring bag'] },
  socks: { slot: 'feet', edge: 'ribbed',
    silhouettes: ['crew', 'knee-high', 'over-knee', 'slouch', 'leg warmers', 'slipper socks'] },
});

export const formsOf = (type) => GARMENTS[type].forms ?? [];
export const accessoriesOf = (type) => GARMENTS[type].accessories ?? ACCESSORIES;

export const FIT_RANGE = Object.freeze([0.2, 1.6]);

export const MAX_COLOURS = 6;
const PALETTE = ['#c0504d', '#f2e3c6', '#3d5a80', '#e0b04a', '#5b8c5a', '#8a5a9e'];
const colourKeys = (n) => Array.from({ length: n }, (_, i) => `color${i + 1}`);

export function defaultItem(type) {
  const g = GARMENTS[type];
  return {
    on: type === 'scarf', silhouette: g.silhouettes[0], fit: 1,
    weight: 'worsted', tool: null, fibre: 'wool', craft: 'knit',
    colorCount: 1, ...Object.fromEntries(colourKeys(MAX_COLOURS).map((k, i) => [k, PALETTE[i]])),
    colourwork: 'solid', stitch: 'stockinette', edge: g.edge, accessory: 'none',
    form: formsOf(type).includes('wrapped once') ? 'wrapped once' : formsOf(type)[0] ?? 'wrapped once', sleeves: 'long',
  };
}

export const defaultOutfit = () =>
  Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, defaultItem(type)]));

// VISUAL-DESIGN-FINISHED-OBJ.md §2b, real gauge
const STITCH_W = Object.freeze({
  lace: 0.0035, fingering: 0.004, sport: 0.0045, dk: 0.0052,
  worsted: 0.0058, aran: 0.0065, bulky: 0.0085, 'super-bulky': 0.011,
});

const TOOL_MM = Object.freeze({
  knit: { lace: 2, fingering: 2.75, sport: 3.5, dk: 4, worsted: 5, aran: 5.5, bulky: 7, 'super-bulky': 10 },
  crochet: { lace: 2, fingering: 3, sport: 4, dk: 5, worsted: 6, aran: 6.5, bulky: 8, 'super-bulky': 10 },
});
export const TOOL_RANGE = Object.freeze([1.5, 15]);
export const usualTool = (craft, weight) => (TOOL_MM[craft] ?? TOOL_MM.knit)[weight] ?? 5;

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const randomHex = () => `#${yarnColor().getHexString()}`;

export function randomItem(type) {
  const g = GARMENTS[type];
  const craft = pickOne(CRAFTS), weight = pickOne(YARN_WEIGHT_NAMES);
  return {
    ...defaultItem(type), on: true, silhouette: pickOne(g.silhouettes),
    weight, tool: usualTool(craft, weight), fibre: pickOne(YARN_MATERIALS), craft,
    colorCount: 1 + Math.floor(Math.random() * MAX_COLOURS),
    ...Object.fromEntries(colourKeys(MAX_COLOURS).map((k) => [k, randomHex()])),
    colourwork: pickOne(COLOURWORKS), stitch: pickOne(STITCHES_BY_CRAFT[craft]), edge: pickOne(EDGES), accessory: pickOne(accessoriesOf(type)),
    form: pickOne(formsOf(type).length ? formsOf(type) : FORMS), sleeves: pickOne(SLEEVES),
  };
}

export const worstOutfit = () =>
  Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...randomItem(type), sleeves: 'long' }]));

const TOOL_SHARE = 0.6;
const MM = STITCH_W.worsted / TOOL_MM.knit.worsted;
function realWidth(item) {
  const tool = item.tool ?? usualTool(item.craft, item.weight);
  return (STITCH_W[item.weight] ?? STITCH_W.worsted) ** (1 - TOOL_SHARE) * (tool * MM) ** TOOL_SHARE;
}

// VISUAL-DESIGN-FINISHED-OBJ.md §3 (proposed order)
const DRAPE = Object.freeze({
  linen: 0.1, cotton: 0.25, acrylic: 0.4, wool: 0.45, bamboo: 0.55, mohair: 0.7, alpaca: 0.85, silk: 0.9,
});

// VISUAL-DESIGN-FINISHED-OBJ.md §2b, tuned by eye
export const LOOK = { stitchScale: 2.1, relief: 1.8, rim: 0.42, viewPx: 150 };

// VISUAL-DESIGN-FINISHED-OBJ.md §2b, relief at a distance
const MIN_STITCH_PX = 1.5;

function forView(f, fit) {
  if (!LOOK.viewPx || (f.stitchW * LOOK.viewPx) / fit.height >= MIN_STITCH_PX) return f;
  return { ...f, stitch: (STITCHES_BY_CRAFT[f.craft] ?? STITCHES_BY_CRAFT.knit)[0], bump: 0 };
}

const CRAFT = Object.freeze({
  knit: { row: 0.75, thick: 1, bump: 0 },
  crochet: { row: 1.05, thick: 1.3, bump: 0.35 },
});

const ROW = Object.freeze({ garter: 0.6, 'linen stitch': 0.65, puff: 1.15 });

export function fabric(item) {
  const g = STITCH_W[item.weight] ?? STITCH_W.worsted;
  const craft = CRAFT[item.craft] ?? CRAFT.knit;
  const stitch = craftStitch(item.craft, item.stitch);
  const width = realWidth(item) * LOOK.stitchScale;
  return {
    ...item, stitch,
    stitchW: width, rowH: width * craft.row * (ROW[stitch] ?? 1),
    thick: g * LOOK.stitchScale * 1.1 * craft.thick,
    bump: craft.bump,
    drape: DRAPE[item.fibre] ?? 0.45,
    colours: colourKeys(Math.min(item.colorCount, MAX_COLOURS)).map((k) => new THREE.Color(item[k] ?? PALETTE[0])),
    colourwork: resolveColourwork(item.colourwork, item.colorCount),
  };
}

export function madeItem(pattern, used = {}) {
  const tool = pattern.tool ?? usualTool(pattern.craft, pattern.weight);
  const made = { ...pattern, tool, ...used };
  made.tool = used.tool ?? tool;
  made.stitch = craftStitch(made.craft, made.stitch);
  made.fit = used.fit ?? Math.min(FIT_RANGE[1], Math.max(FIT_RANGE[0], realWidth(made) / realWidth({ ...pattern, tool })));
  return made;
}

export function wornAs(wip, colourOf) {
  const p = wip.pattern, type = p?.patternType;
  if (!Object.hasOwn(GARMENTS, type)) return null;
  const { silhouettes } = GARMENTS[type];
  const item = { ...defaultItem(type), silhouette: silhouettes.includes(p.silhouette) ? p.silhouette : silhouettes[0], ...madeWith(wip, colourOf) };
  return { type, item: madeItem(item, wip.used) };
}

function madeWith(wip, colourOf) {
  const p = wip.pattern;
  const colours = [...new Set(wip.yarn.map(colourOf))].slice(0, MAX_COLOURS);
  return {
    on: true, craft: p.craft === 'crochet' ? 'crochet' : 'knit',
    weight: p.weight, fibre: p.materials[0], tool: p.toolSize,
    colorCount: Math.max(1, colours.length), colourwork: colours.length > 1 ? 'stripes' : 'solid',
    ...Object.fromEntries(colours.map((c, i) => [`color${i + 1}`, c])),
  };
}

export function resolveColourwork(colourwork, count) {
  return colourwork === 'solid' && count > 1 ? 'stripes' : colourwork;
}

const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _box = new THREE.Box3();

function carried(joint) {
  _inv.copy(joint.matrixWorld).invert();
  const box = new THREE.Box3();
  const visit = (node) => {
    for (const child of node.children) {
      if (child.userData.joint || child.userData.garment) continue;
      if (child.isMesh) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        box.union(_box.copy(child.geometry.boundingBox).applyMatrix4(_rel.multiplyMatrices(_inv, child.matrixWorld)));
      }
      visit(child);
    }
  };
  visit(joint);
  return box;
}

const extent = (box, axis) => Math.max(-box.min[axis], box.max[axis]);

function eyeBottom(j) {
  const low = Math.min(Infinity, ...(j.eye ?? []).map(({ node }) => new THREE.Box3().setFromObject(node).min.y));
  return Number.isFinite(low) ? j.neck.worldToLocal(new THREE.Vector3(0, low, 0)).y : Infinity;
}

function neckCoat(neck, r) {
  _inv.copy(neck.matrixWorld).invert();
  const coat = { coatTop: 0, coatR: 0 };
  for (const child of neck.children) {
    if (!child.isMesh || child.userData.garment) continue;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    _box.copy(child.geometry.boundingBox).applyMatrix4(_rel.multiplyMatrices(_inv, child.matrixWorld));
    const wide = Math.max(extent(_box, 'x'), extent(_box, 'z'));
    if (wide > r * 1.5) Object.assign(coat, { coatTop: Math.max(coat.coatTop, _box.max.y), coatR: Math.max(coat.coatR, wide) });
  }
  return coat;
}

function skullMesh(head) {
  let best = null;
  for (const child of head.children) {
    if (child.isMesh && child.geometry === GEO.sphere && (!best || child.scale.x > best.scale.x)) best = child;
  }
  return best;
}
const skullRadii = (head) => skullMesh(head)?.scale.toArray() ?? [0.17, 0.17, 0.17];

function shoulderTop(j, armR) {
  return j.chest.worldToLocal(j.upperArm[0].node.getWorldPosition(new THREE.Vector3())).y + armR;
}

export function bodyFit(built) {
  built.root.updateMatrixWorld(true);
  const { joints: j, params: P } = built;
  const head = carried(j.head), chest = carried(j.chest), arm = carried(j.upperArm[0].node);
  const chestWorld = j.chest.getWorldPosition(new THREE.Vector3());
  const floor = j.chest.worldToLocal(new THREE.Vector3(chestWorld.x, 0, chestWorld.z)).y;
  const armR = Math.max(extent(arm, 'x'), extent(arm, 'z'));
  return {
    P, joints: j, holds: built.holds, floor, root: floorOf(built.root),
    height: new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3()).y,
    head: [extent(head, 'x'), head.max.y, Math.max(-head.min.z, P.headRadius)],
    skull: skullRadii(j.head),
    torso: [extent(chest, 'x'), Math.max(chest.max.y, -chest.min.y), extent(chest, 'z')],
    shoulderX: P.torsoW * (P.shoulderOut + (built.bulge ?? 0)) + armR, shoulderY: shoulderTop(j, armR),
    arm: { r: armR, upper: P.upperArmLen, fore: P.forearmLen, foreR: P.limbThick * 1.05 * LIMB_TAPER },
    neck: { r: P.neckThick, len: P.neckLength, y: P.torsoH - P.headOverlap, overlap: P.headOverlap,
      headY: P.neckLength + P.headRadius * 0.62, ...neckCoat(j.neck, P.neckThick), eyeBottom: eyeBottom(j) },
    leg: { thighR: P.limbThick, shinR: P.limbThick * LIMB_TAPER, femur: femurOf(P), tibia: tibiaOf(P) },
  };
}

function sheet(fn, segU, segV, { closedU = false, mask = null, cut = null, from = null } = {}) {
  const cols = segU + 1, rows = segV + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  const p = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      fn(closedU && c === segU ? 0 : c / segU, r / segV, p);
      p.toArray(pos, k * 3);
      uv[k * 2] = c / segU;
      uv[k * 2 + 1] = r / segV;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(quads(segU, segV, mask, cut));
  normals(geo, { closedU, cols, rows, from });
  return geo;
}

function quads(segU, segV, mask, cut) {
  const index = [];
  const cols = segU + 1;
  for (let r = 0; r < segV; r++) {
    for (let c = 0; c < segU; c++) {
      if (mask?.((c + 0.5) / segU, (r + 0.5) / segV)) continue;
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      const { slash = false, keep = [true, true] } = cut?.(c, r) ?? {};
      const halves = slash ? [[a, d, e], [a, e, b]] : [[a, d, b], [b, d, e]];
      for (const [i, t] of halves.entries()) if (keep[i]) index.push(...t);
    }
  }
  return index;
}

function normals(geo, { closedU, cols, rows, from }) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal, p = geo.attributes.position;
  if (from) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let facing = 0;
    for (let i = 0; i < n.count; i++) facing += a.fromBufferAttribute(n, i).dot(b.fromBufferAttribute(p, i).sub(from(b.clone())));
    if (facing < 0) flip(geo);
  }
  if (closedU) {
    for (let r = 0; r < rows; r++) {
      const i = r * cols, k = i + cols - 1;
      const x = n.getX(i) + n.getX(k), y = n.getY(i) + n.getY(k), z = n.getZ(i) + n.getZ(k);
      const len = Math.hypot(x, y, z) || 1;
      n.setXYZ(i, x / len, y / len, z / len);
      n.setXYZ(k, x / len, y / len, z / len);
    }
  }
}

function flip(geo) {
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const b = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = b;
  }
  const n = geo.attributes.normal;
  for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
}

function spans(fn, widest = false) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const walk = (at, n = 16) => {
    let len = 0;
    fn(...at(0), a);
    for (let i = 1; i <= n; i++) {
      fn(...at(i / n), b);
      len += a.distanceTo(b);
      a.copy(b);
    }
    return len;
  };
  if (!widest) return [walk((t) => [t, 0.5]), Math.max(...[0, 0.25, 0.5, 0.75].map((u) => walk((t) => [u, t])))];
  const across = Math.max(...[0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95].map((v) => walk((t) => [t, v])));
  return [across, walk((t) => [0.5, t], 96)];
}

const fract = (x) => x - Math.floor(x);

const RELIEF = {
  stockinette: () => 0,
  'single crochet': () => 0,
  'linen stitch': (us, vs) => Math.max(0, Math.cos(Math.PI * (us + (Math.floor(vs) % 2)))) * Math.sin(Math.PI * fract(vs)),
  rib: (us) => (0.5 + 0.5 * Math.cos((TAU * us) / 4)) ** 2,
  garter: (us, vs) => 0.5 + 0.5 * Math.cos((TAU * vs) / 2),
  seed: (us, vs) => 0.5 + 0.5 * Math.sin(Math.PI * us) * Math.sin(Math.PI * vs),
  waffle: (us, vs) => Math.max(Math.abs(Math.cos((Math.PI * us) / 2)), Math.abs(Math.cos((Math.PI * vs) / 2))) ** 6,
  puff: (us, vs) => {
    const row = Math.floor(vs / 3);
    const d = 2 * Math.hypot(fract((us + (row % 2) * 1.5) / 3) - 0.5, fract(vs / 3) - 0.5);
    return d >= 1 ? 0 : (1 - d * d) ** 1.5;
  },
  cable: (us, vs) => {
    const x = fract(us / 16) * 16 - 8, phi = (TAU * vs) / 12;
    let h = 0;
    for (const side of [1, -1]) {
      const d = (x - side * 1.5 * Math.cos(phi)) / 1.6;
      if (Math.abs(d) < 1) h = Math.max(h, (1 - d * d) ** 0.6 * (0.8 + 0.2 * side * Math.sin(phi)));
    }
    return h;
  },
  lace: () => 0,
};

const crochetBase = (us, vs) => 0.5 + 0.5 * Math.sin(Math.PI * us) * Math.sin(Math.PI * vs);

// VISUAL-DESIGN-FINISHED-OBJ.md §2b
const DEPTH = Object.freeze({
  stockinette: 0, rib: 0.6, garter: 0.45, seed: 0.4, 'linen stitch': 0.35, cable: 0.9,
  'single crochet': 0, waffle: 0.6, puff: 0.5, lace: 0.2,
});

const DENSITY = Object.freeze({
  stockinette: [0, 0], rib: [2, 0], garter: [0, 1.5], seed: [1.5, 1.5], 'linen stitch': [1.5, 3], cable: [1.5, 1],
  'single crochet': [0, 0], waffle: [1.5, 1.5], puff: [2.5, 2.5], lace: [2, 1.5],
});
const CROCHET_DENSITY = [1.5, 1.5];

// ponytail: the layout is in quads, not stitches, so where a sheet hits its quad cap (panelGrid)
// the eyelets come out larger in stitches; lay them out from the stitch count if that shows.
function laceCut(c, r) {
  const course = Math.floor(r / 3), x = c + (course % 2) * 3, y = r % 3;
  const lx = (x % 6) - 1;
  if (lx < 0 || lx > 3 || y > 1) return null;
  const up = (Math.floor(x / 6) + course) % 2 === 0;
  const h = up ? y : 1 - y;
  const left = lx < 2;
  const edge = left ? lx === h : lx === 3 - h;
  const inside = left ? lx > h : lx < 3 - h;
  if (!edge) return inside ? { keep: [false, false] } : null;
  const slash = left === up;
  if (slash) return { slash, keep: up ? [true, false] : [false, true] };
  return { slash, keep: up ? [false, true] : [true, false] };
}

function throughCut(cut, segU, front) {
  const axis = Math.round(segU * (2 * front + 0.5));
  return (c, r) => {
    const off = Math.abs((((c + 0.5) / segU - front) % 1 + 1.5) % 1 - 0.5);
    if (off <= 0.25) return cut(c, r);
    const k = cut((((axis - c - 1) % segU) + segU) % segU, r);
    const [a, b] = k?.keep ?? [true, true];
    return k && { slash: !k.slash, keep: [b, a] };
  };
}

const U_REPEAT = { rib: 4, seed: 2, 'linen stitch': 2, waffle: 2, puff: 3, cable: 16, lace: 3, checks: 8, motif: 6, 'fair isle': 6 };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const castOn = (stitches, repeat) => Math.max(1, Math.round(stitches / repeat)) * repeat;

function relieve(geo, f, reps, seam) {
  const depth = DEPTH[f.stitch] ?? 0, bump = f.bump ?? 0;
  if (!depth && !bump) return;
  const h = RELIEF[f.stitch] ?? RELIEF.stockinette;
  const p = geo.attributes.position, n = geo.attributes.normal, { uv } = geo.attributes;
  const amp = f.stitchW * LOOK.relief;
  for (let i = 0; i < p.count; i++) {
    const us = uv.getX(i) * reps[0], vs = uv.getY(i) * reps[1];
    const d = amp * (depth * h(us, vs) + (f.stitch === 'puff' ? 0 : bump * crochetBase(us, vs)));
    p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  }
  normals(geo, seam);
}

const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

const COLOURWORK = {
  solid: () => 0,
  stripes: (us, vs, n) => Math.floor(vs / 4) % n,
  checks: (us, vs) => (Math.floor(us / 4) + Math.floor(vs / 4)) % 2,
  'colour-block': (us, vs, n, v) => {
    if (v < 0.33) return 1;
    return v > 0.82 && n > 2 ? 2 : 0;
  },
  motif: (us, vs, n, v) => (v > 0.35 && v < 0.65 && Math.hypot(fract(us / 6) - 0.5, fract(vs / 6) - 0.5) < 0.25 ? 1 : 0),
  'fair isle': (us, vs, n) => {
    const band = Math.floor(vs / 8);
    const diamond = Math.abs(fract(us / 6) - 0.5) + Math.abs(fract(vs / 8) - 0.5) < 0.3;
    return diamond ? 1 + (band % Math.max(1, n - 1)) : 0;
  },
  marled: (us, vs) => (hash(us, vs) < 0.5 ? 0 : 1),
};

const SLOTS_USED = { solid: 1, checks: 2, 'colour-block': 3, motif: 2, marled: 2, stripes: 9, 'fair isle': 9 };

const trimColour = (f) => {
  const used = Math.min(SLOTS_USED[f.colourwork] ?? 1, f.colours.length);
  return f.colours[used < f.colours.length ? used : Math.min(1, f.colours.length - 1)];
};

function paint(geo, f, reps) {
  const { uv } = geo.attributes, { count } = uv;
  const colors = new Float32Array(count * 3);
  const pick = COLOURWORK[f.colourwork] ?? COLOURWORK.solid;
  const n = f.colours.length;
  for (let i = 0; i < count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    f.colours[pick(u * reps[0], v * reps[1], n, v) % n].toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  hatchRows(geo, reps[1]);
}

function hatchRows(geo, rows) {
  geo.setAttribute('aHatchScale', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(rows), 1));
}

function flatColour(geo, colour, rows = 40) {
  const { count } = geo.attributes.position;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colour.toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  hatchRows(geo, rows);
  return geo;
}

function panel(fn, f, { closedU = false, mask = null, from = null, minU = 24, minV = 12, widest = false, through = null } = {}) {
  const reps = panelReps(fn, f, closedU, widest);
  const [quadsU, segV] = panelGrid(f, reps, minU, minV);
  const segU = through === null ? quadsU : quadsU + (quadsU % 2);
  let lace = null;
  if (f.stitch === 'lace') lace = through === null ? laceCut : throughCut(laceCut, segU, through);
  const geo = sheet(fn, segU, segV, { closedU, mask, cut: lace, from });
  relieve(geo, f, reps, { closedU, cols: segU + 1, rows: segV + 1 });
  paint(geo, f, reps);
  return geo;
}

function panelReps(fn, f, closedU, widest) {
  const [lu, lv] = spans(fn, widest);
  const reps = [lu / f.stitchW, lv / f.rowH];
  if (closedU) reps[0] = castOn(reps[0], lcm(lcm(U_REPEAT[f.stitch] ?? 1, U_REPEAT[f.colourwork] ?? 1), f.bump ? 2 : 1));
  return reps;
}

function panelGrid(f, reps, minU, minV) {
  const [du, dv] = DENSITY[f.stitch] ?? [0, 0], [cu, cv] = f.bump ? CROCHET_DENSITY : [0, 0];
  return [
    Math.min(256, Math.max(minU, Math.ceil(reps[0] * Math.max(du, cu)))),
    Math.min(768, Math.max(minV, Math.ceil(reps[1] * Math.max(dv, cv)))),
  ];
}

const piece = (joint, geo, skinTo = null) => ({ joint, geo, skinTo });

function ring(fn, v, samples = 48, { closed = true, u0 = 0, u1 = 1 } = {}) {
  const pts = [], flow = [];
  const n = closed ? samples : samples + 1;
  const inward = v >= 0.5 ? v - 0.02 : v + 0.02;
  for (let i = 0; i < n; i++) {
    const u = u0 + ((u1 - u0) * i) / samples;
    const p = fn(u, v, new THREE.Vector3());
    pts.push(p);
    flow.push(p.clone().sub(fn(u, inward, new THREE.Vector3())).normalize());
  }
  return { pts, closed, flow };
}

function tubeAlong({ pts, closed }, radius, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  return new THREE.TubeGeometry(curve, Math.max(16, pts.length * 2), radius, radial, closed);
}

const DOWN = new THREE.Vector3(0, -1, 0);

function beads({ pts, closed, flow }, spacing, make) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const count = Math.max(3, Math.floor(curve.getLength() / spacing));
  const geos = [];
  for (let i = 0; i < count; i++) {
    const t = closed ? i / count : i / (count - 1);
    const along = flow?.[Math.round(t * (closed ? pts.length : pts.length - 1)) % pts.length] ?? DOWN;
    geos.push(...[make(curve.getPointAt(t), curve.getTangentAt(t), along)].flat());
  }
  return geos;
}

function onEdge(geo, p, tangent, flow) {
  const x = tangent.clone().normalize(), y = flow.clone().negate();
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
}

const at = (geo, p, s) => geo.scale(...s).translate(p.x, p.y, p.z);

const EDGE = {
  none: () => [],
  rolled: (r, f) => [tubeAlong(r, f.thick * 0.6)],
  ribbed: (r, f) => {
    const g = tubeAlong(r, f.thick * 0.45, 10);
    const len = new THREE.CatmullRomCurve3(r.pts, r.closed).getLength();
    const ribs = len / (f.stitchW * 2);
    const p = g.attributes.position, n = g.attributes.normal, { uv } = g.attributes;
    for (let i = 0; i < p.count; i++) {
      const d = f.thick * 0.15 * Math.cos(TAU * uv.getX(i) * ribs);
      p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
    }
    g.computeVertexNormals();
    return [g];
  },
  fringed: (r, f) => beads(r, f.stitchW * 2.5, (p) => {
    const len = f.thick * 7 * (0.6 + 0.4 * f.drape);
    return new THREE.CylinderGeometry(f.thick * 0.35, f.thick * 0.25, len, 5).translate(p.x, p.y - len / 2, p.z);
  }),
  picot: (r, f) => beads(r, f.thick * 3, (p, tangent, flow) => {
    const w = f.thick * 0.8, h = f.thick * 2.2;
    const point = new THREE.ConeGeometry(w, h, 4).rotateZ(Math.PI).translate(0, -h / 2, 0).scale(1, 1, 0.45);
    const loop = new THREE.TorusGeometry(w * 0.5, w * 0.16, 4, 10).translate(0, -h - w * 0.4, 0);
    return [onEdge(point, p, tangent, flow), onEdge(loop, p, tangent, flow)];
  }),
  scalloped: (r, f) => beads(r, f.thick * 2.4, (p, tangent, flow) => {
    const R = f.thick * 1.35;
    return onEdge(new THREE.SphereGeometry(1, 10, 6).scale(R, R, f.thick * 0.5).translate(0, -R * 0.15, 0), p, tangent, flow);
  }),
};

function edgePieces(joint, rings, f) {
  const trim = trimColour(f);
  return rings.flatMap((r) => EDGE[f.edge]?.(r, f) ?? []).map((g) => piece(joint, flatColour(g, trim)));
}

function pomPom(size) {
  const g = new THREE.SphereGeometry(size, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.12 * hash(Math.round(p.getX(i) * 400), Math.round(p.getY(i) * 400 + p.getZ(i) * 300));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return [g];
}

function tassel(size) {
  return [
    new THREE.SphereGeometry(size * 0.35, 8, 6),
    new THREE.CylinderGeometry(size * 0.18, size * 0.45, size * 1.6, 8).translate(0, -size * 0.9, 0),
  ];
}

function flower(size) {
  const petals = [0, 1, 2, 3, 4].map((i) => at(new THREE.SphereGeometry(1, 8, 5),
    new THREE.Vector3(Math.cos((i * TAU) / 5) * size * 0.55, Math.sin((i * TAU) / 5) * size * 0.55, 0),
    [size * 0.42, size * 0.42, size * 0.16]));
  return [...petals, new THREE.SphereGeometry(size * 0.3, 8, 6)];
}

const button = (size) => [new THREE.CylinderGeometry(size, size, size * 0.4, 12).rotateX(Math.PI / 2)];

const ACCESSORY = { 'pom-pom': pomPom, tassel, flower, buttons: button };

const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

const SEAT = { buttons: 0.2, flower: 0.2, 'pom-pom': 0.95, tassel: 0.3 };

const reliefDepth = (f) => f.stitchW * LOOK.relief * ((DEPTH[f.stitch] ?? 0) + (f.bump ?? 0));

function accessoryPieces(anchors, f, surface = null) {
  const make = ACCESSORY[f.accessory];
  const list = anchors?.[f.accessory];
  if (!make || !list) return [];
  const colour = trimColour(f), flat = f.accessory === 'buttons' || f.accessory === 'flower';
  const proud = (size) => size * 0.2 + reliefDepth(f);
  return list.flatMap((anchor) => {
    const { joint, p, n, d, size } = anchor, parts = make(size);
    if (n && flat) parts.forEach((g) => g.applyQuaternion(_q.setFromUnitVectors(_z, n)));
    if (d && f.accessory === 'tassel') parts.forEach((g) => g.applyQuaternion(_q.setFromUnitVectors(DOWN, d)));
    const pos = surface && (flat ? n : d) ? placeOn(surface, anchor, parts, f) : p.clone();
    if (!surface && n && flat) pos.addScaledVector(n, proud(size));
    return parts.map((g) => piece(joint, flatColour(g.translate(pos.x, pos.y, pos.z), colour)));
  });
}

function placeOn(surface, { p, n, d, size, floor }, parts, f) {
  const flat = f.accessory === 'buttons' || f.accessory === 'flower', out = flat ? n : d, pos = p.clone();
  const near = nearSurface(surface, p, size * 6 + f.thick * 6);
  const place = () => {
    seatOn(near, pos, out, size * SEAT[f.accessory], flat ? size * (f.accessory === 'flower' ? 0.6 : 0.9) : 0);
    if (d && pos.clone().sub(p).dot(d) < 0) pos.copy(p);
  };
  place();
  if (floor !== undefined) {
    const low = Math.min(...parts.map((g) => new THREE.Box3().setFromBufferAttribute(g.attributes.position).min.y));
    pos.y = Math.max(pos.y, floor - low);
    place();
    const along = new THREE.Vector3(d.x, 0, d.z);
    if (pos.y < floor - low && along.lengthSq() > 1e-6) {
      pos.y = floor - low;
      seatOn(near, pos, along.normalize(), size * SEAT[f.accessory]);
    }
  }
  return pos;
}

function nearSurface(geo, p, r) {
  const pos = geo.attributes.position, idx = geo.index.array, r2 = r * r, v = new THREE.Vector3();
  const close = (i) => v.fromBufferAttribute(pos, i).distanceToSquared(p) < r2;
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (close(idx[t]) || close(idx[t + 1]) || close(idx[t + 2])) {
      out.push(new THREE.Triangle(...[0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx[t + k]))));
    }
  }
  return out;
}

function seatOn(tris, c, dir, gap, disc = 0) {
  if (!tris.length) return;
  const rim = discAround(dir, disc), s = new THREE.Vector3();
  for (let k = 0; k < 16; k++) {
    const centre = gap - signedTo(tris, c, dir);
    const lift = Math.max(...rim.map((o) => gap - signedTo(tris, s.copy(c).add(o), dir, true)));
    c.addScaledVector(dir, Math.max(centre, lift));
  }
}

function discAround(dir, r) {
  if (!r) return [];
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const other = new THREE.Vector3().crossVectors(dir, side);
  return Array.from({ length: 8 }, (_, i) => side.clone().multiplyScalar(Math.cos((i * TAU) / 8) * r).addScaledVector(other, Math.sin((i * TAU) / 8) * r));
}

function signedTo(tris, x, dir, under = false) {
  const q = new THREE.Vector3(), best = new THREE.Vector3();
  let dist = Infinity;
  for (const t of tris) {
    const d = t.closestPointToPoint(x, q).distanceTo(x);
    if (d < dist) {
      dist = d;
      best.copy(q);
    }
  }
  const along = best.sub(x).dot(dir);
  if (under && Math.abs(along) < dist * 0.7) return Infinity;
  return along > 0 ? -dist : dist;
}

const knot = (joint, p, size, f) =>
  piece(joint, flatColour(at(new THREE.SphereGeometry(1, 10, 8), p, [size * 1.1, size, size]), trimColour(f)));

const onEllipsoid = (r, phi, theta, out) =>
  out.set(r[0] * Math.sin(phi) * Math.sin(theta), r[1] * Math.cos(phi), r[2] * Math.sin(phi) * Math.cos(theta));

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function strapBand(pts, f, { closed = false, width, thick, normal }) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const c = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3(), wide = new THREE.Vector3();
  const fn = (u, v, out) => {
    curve.getPointAt(v, c);
    curve.getTangentAt(v, t);
    normal(c, n).addScaledVector(t, -n.dot(t)).normalize();
    wide.crossVectors(n, t).normalize();
    const a = u * TAU;
    return out.copy(c).addScaledVector(wide, (width / 2) * square(Math.cos(a))).addScaledVector(n, thick * square(Math.sin(a)));
  };
  return panel(fn, f, { closedU: true, minU: 8, minV: 48, from: nearestOn(curve) });
}

function tube(yTop, yBot, radiusAt, f, { bunch = 0 } = {}) {
  const fn = (u, v, out) => {
    const y = lerp(yTop, yBot, v);
    const r = radiusAt(v) * (1 + bunch * Math.abs(Math.sin(v * Math.PI * 5)));
    return out.set(r * Math.sin(u * TAU), y, r * Math.cos(u * TAU));
  };
  return { fn, geo: panel(fn, f, { closedU: true, from: (p) => p.set(0, p.y, 0) }) };
}

const dome = (top, low) => (v) => {
  const a = lerp(0, Math.acos(clamp(low / top, -1, 1)), v);
  return [Math.sin(a) * 1.04, Math.cos(a) * top];
};

const HAT_PITCH = THREE.MathUtils.degToRad(35);

// VISUAL-DESIGN-FINISHED-OBJ.md, more shape rules
const POM_OF_HEAD = 0.4, POM_OF_SHIN = 1.8;
const BUTTON_OF_HEAD = 0.14, BUTTON_OF_TORSO = 0.11, BUTTON_OF_SHIN = 0.6;

const BUTTONS_IN_A_ROW = 3;

function buttonRow(joint, p, n, size, dir = new THREE.Vector3(0, -1, 0)) {
  const count = BUTTONS_IN_A_ROW;
  return Array.from({ length: count }, (_, i) => ({ joint, p: p.clone().addScaledVector(dir, (i - (count - 1) / 2) * size * 2.6), n, size }));
}

function slouchBag(v) {
  const t = 1 - v;
  const band = Math.sqrt(1 - 0.25 * 0.25) * 1.04;
  const full = lerp(band, 1.35, clamp(t / 0.35, 0, 1) ** 0.7);
  const end = t > 0.45 ? Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2)) : 1;
  return [full * end, 0.25 + t * 1.5];
}

const HAT = {
  beanie: { profile: dome(1.06, 0.25), seat: 0.25, size: 0.9 },
  slouch: { profile: slouchBag, seat: 0.25, size: 0.9, flop: { hinge: 0.9, back: 1.0, angle: 2.7 }, soft: 1.2 },
  fisherman: { profile: dome(1.08, 0.25), seat: 0.25, earsOut: true },
  beret: { seat: 0.44, tilt: 0.3, pitch: 0, soft: 1.6, profile: (v) => (v < 0.55
    ? [lerp(0, 1.4, v / 0.55), lerp(1.18, 1.0, v / 0.55)]
    : [lerp(1.4, 0.92, (v - 0.55) / 0.45), lerp(1.0, 0.44, (v - 0.55) / 0.45)]) },
  earflap: { profile: dome(1.06, 0.3), seat: 0.3, flaps: true },
  hood: { profile: dome(1.1, -0.95), seat: 0.44, face: true, eyesOut: true },
  headband: { seat: 0.45, soft: 0.3, open: true, profile: (v) => { const y = lerp(0.79, 0.11, v); return [Math.sqrt(1 - y * y) * 1.05, y]; } },
  bucket: { seat: 0.35, soft: 0.5, profile: (v) => (v < 0.75 ? dome(1.05, 0.35)(v / 0.75) : [lerp(0.99, 1.45, (v - 0.75) / 0.25), lerp(0.35, 0.08, (v - 0.75) / 0.25)]) },
  cloche: { seat: 0.1, profile: (v) => (v < 0.85 ? dome(1.05, 0.0)(v / 0.85) : [lerp(1.04, 1.18, (v - 0.85) / 0.15), lerp(0.0, -0.1, (v - 0.85) / 0.15)]) },
  pixie: { seat: 0.3, flop: { hinge: 1.0, back: 0.8, angle: 2.0 }, tip: true, profile: (v) => {
    const y = lerp(2.3, 0.3, v);
    return [Math.sqrt(clamp(1 - 0.3 * 0.3, 0, 1)) * 1.04 * (1 - (1 - v) ** 1.6), y];
  } },
};

function hatSeat(spec, s) {
  const ringR = Math.sqrt(Math.max(0, 1 - spec.seat * spec.seat)) * 1.04;
  const want = s * ringR;
  const restY = want < 1 ? Math.sqrt(1 - want * want) : 0;
  const slip = clamp((want - 1) * 4, 0, 1);
  return { dy: restY - s * spec.seat - slip * 0.35, tilt: slip * 0.55 + (spec.tilt ?? 0), dx: slip * 0.25,
    pitch: spec.pitch ?? HAT_PITCH };
}

const hatRotation = (seat) => new THREE.Matrix4().makeRotationZ(-seat.tilt).multiply(new THREE.Matrix4().makeRotationX(-seat.pitch));

// ponytail: fixed lobe phases, so every beanie slumps the same way; seed them per item for variety.
function slump(spec, f, v, py, th) {
  const soft = spec.soft ?? 1;
  const free = (1 - v) ** 1.5;
  const sag = soft * (0.35 + f.drape) * 0.12 * free * Math.max(0, py);
  const wobble = 1 + soft * 0.035 * (0.3 + free) * (Math.sin(2 * th + 0.7) * 0.6 + Math.sin(3 * th + 2.1) * 0.4);
  return { sag, wobble };
}

function outsideSkull(p, r, lift) {
  const len = Math.hypot(p.x / r[0], p.y / r[1], p.z / r[2]);
  return len < lift ? p.multiplyScalar(lift / Math.max(len, 1e-6)) : p;
}

function flop(p, { hinge: h, back, angle }, k, dy, v) {
  const hinge = h * k + dy, pivot = -back * k;
  const dh = p.y - hinge;
  if (dh <= 0) return;
  const a = angle * (1 - v) * THREE.MathUtils.smoothstep(dh, 0, 0.5 * k);
  const dz = (p.z - pivot) * lerp(1, 0.3, a / angle);
  const c = Math.cos(a), sn = Math.sin(a);
  p.set(p.x, hinge + dh * c + dz * sn, pivot - dh * sn + dz * c);
}

function hatShape(spec, r, s, f) {
  const seat = hatSeat(spec, s);
  const lift = 1 + f.thick / r[1];
  const rot = hatRotation(seat);
  return (u, v, out) => {
    const [pr, py] = spec.profile(v);
    const th = u * TAU;
    const { sag, wobble } = slump(spec, f, v, py, th);
    const w = pr * wobble * s * lift;
    out.set(w * Math.sin(th), (py - sag * 0.6) * s * lift + seat.dy, w * Math.cos(th) - sag);
    if (spec.flop) flop(out, spec.flop, s * lift, seat.dy, v);
    out.applyMatrix4(rot);
    out.x += seat.dx;
    return outsideSkull(out.set(out.x * r[0], out.y * r[1], out.z * r[2]), r, lift);
  };
}

function buildHat(fit, f) {
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const { head } = fit.joints;
  const r = fit.skull;
  const s = f.fit * (spec.size ?? 1);
  const fn = hatShape(spec, r, s, f);
  const body = spec.face ? (u, v, out) => { const h = faceHalf(v); return fn((h + u * (TAU - 2 * h)) / TAU, v, out); } : fn;
  const pieces = [piece(head, panel(body, f, { closedU: !spec.face, from: (p) => p.set(0, 0, 0) }))];
  if (spec.flaps) pieces.push(...earflaps(fn, head, f, r, 1 + f.thick / r[1]));
  pieces.push(...edgePieces(head, [ring(body, 1, 48, { closed: !spec.face })], f));
  return [...pieces, ...accessoryPieces(hatAnchors(fn, head, r[1] * POM_OF_HEAD * s, r[1] * BUTTON_OF_HEAD * s, spec.open), f)];
}

function hatAnchors(fn, head, size, buttonSize, open) {
  const top = fn(0, 0, new THREE.Vector3());
  const side = fn(0.25, 0.6, new THREE.Vector3());
  const band = [0, 1, 2, 3, 4].map((i) => fn(0.19 + i * 0.03, 0.78, new THREE.Vector3()));
  const pomAt = open ? fn(0.2, 0.5, new THREE.Vector3()) : top, pomSize = open ? size / 2 : size;
  const below = Array.from({ length: 8 }, (_, i) => fn(i / 8, 0.2, new THREE.Vector3()))
    .reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(8);
  const out = open ? pomAt.clone().normalize() : top.clone().sub(below).normalize();
  return {
    'pom-pom': [{ joint: head, p: pomAt.clone().addScaledVector(out, pomSize), size: pomSize }],
    tassel: [{ joint: head, p: top, size: size * 0.8 }],
    flower: [{ joint: head, p: side, n: side.clone().normalize(), size: size * 0.7 }],
    buttons: band.map((p) => ({ joint: head, p, n: p.clone().normalize(), size: buttonSize })),
  };
}

function earflaps(fn, head, f, r, lift) {
  return [-1, 1].map((side) => {
    const u0 = side < 0 ? 0.75 : 0.25;
    const base = fn(u0, 1, new THREE.Vector3());
    const out = new THREE.Vector3();
    const flap = (u, v, p) => {
      const a = u * TAU;
      fn(u0 + Math.cos(a) * 0.06 * (1 - v * 0.6), 1, p);
      p.y -= v * base.length() * 0.7;
      const puff = f.thick * 1.5 * Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 4));
      p.addScaledVector(out.set(p.x, 0, p.z).normalize(), puff * (1 + Math.sin(a)));
      return outsideSkull(p, r, lift);
    };
    return piece(head, panel(flap, f, { closedU: true, minU: 16, minV: 8, from: (p) => p.set(base.x, p.y, base.z) }));
  });
}

// ponytail: a very drapey crown slumps past press's margin at the front and can bare a pressed tip;
// fold slump() into the profile here if it shows.
function hatCover(fit, f) {
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const r = fit.skull;
  const s = f.fit * (spec.size ?? 1);
  const seat = hatSeat(spec, s);
  const k = s * (1 + f.thick / r[1]);
  const unrot = hatRotation(seat).invert();
  const { top, rAt, inFace } = hatProfile(spec);
  const low = spec.profile(1)[1];
  const toProfile = (q, out) => out.set(q.x / r[0] - seat.dx, q.y / r[1], q.z / r[2]).applyMatrix4(unrot).setY(out.y - seat.dy).divideScalar(k);
  const inside = (p, m) => p.y >= low && p.y <= top * m && Math.hypot(p.x, p.z) < rAt(p.y) * m && !inFace(p);
  const p = new THREE.Vector3();
  const byOpening = (pt) => inFace(pt) || (spec.open && pt.y > top * 0.9 - 0.02);
  return {
    under: (q) => inside(toProfile(q, p), 1),
    press: hatPress(toProfile, (pt) => inside(pt, 0.9), byOpening),
  };
}

function hatPress(toProfile, inside, byOpening) {
  const p = new THREE.Vector3(), step = new THREE.Vector3();
  const along = (q, t) => toProfile(step.copy(q).multiplyScalar(t), p);
  return (q) => {
    if (inside(toProfile(q, p))) return false;
    let last = -1;
    for (let i = 1; i <= 24; i++) if (inside(along(q, i / 24))) last = i;
    if (last < 0 || byOpening(along(q, (last + 1) / 24))) return false;
    q.multiplyScalar(last / 24);
    return true;
  };
}

const FACE_BROW = 0.42, FACE_HALF = Math.acos(0.45);
function faceHalf(v) {
  const t = (v - FACE_BROW) / (1 - FACE_BROW);
  return t <= 0 ? 0 : FACE_HALF * Math.sqrt(Math.max(0, 2 * t - t * t));
}

function hatProfile(spec) {
  const prof = Array.from({ length: 65 }, (_, i) => spec.profile(i / 64));
  const sample = (y) => {
    for (let i = 0; i < 64; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      const t = (y0 - y) / (y0 - y1 || 1);
      if (y <= y0 && y >= y1) return [lerp(r0, r1, t), (i + t) / 64];
    }
    return [0, y > prof[0][1] ? 0 : 1];
  };
  return {
    top: prof[0][1], rAt: (y) => sample(y)[0],
    inFace: (p) => Boolean(spec.face) && Math.abs(Math.atan2(p.x, p.z)) < faceHalf(sample(p.y)[1]),
  };
}

function wholly(head, node, under) {
  const q = new THREE.Vector3();
  node.updateWorldMatrix(true, true);
  return node.children.every(({ isMesh, geometry, matrixWorld }) => {
    if (!isMesh) return true;
    const { position } = geometry.attributes;
    for (let i = 0; i < position.count; i++) if (!under(head.worldToLocal(q.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)))) return false;
    return true;
  });
}

function coverUnderHat(built, f) {
  const fit = bodyFit(built);
  const cover = hatCover(fit, f);
  const { head } = built.joints, skull = skullMesh(head);
  const q = new THREE.Vector3();
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const parts = [
    ...(spec.eyesOut ? [] : built.joints.eye.filter(({ node }) => wholly(head, node, cover.under))),
    ...(spec.open || spec.earsOut ? [] : built.joints.ear.filter(({ node }) => cover.under(head.worldToLocal(node.getWorldPosition(q))))),
  ];
  for (const { node } of parts) {
    if (!node.visible) continue;
    node.visible = false;
    built.covered.push(() => { node.visible = true; });
  }
  for (const mesh of coats(head, skull, new THREE.Vector3(0, fit.skull[1] * 0.9, 0))) pressMesh(built, head, mesh, cover);
}

function coats(head, skull, crown) {
  const out = [], box = new THREE.Box3();
  const visit = (node) => {
    for (const mesh of node.children) {
      if (mesh.userData.joint || mesh.userData.garment) continue;
      visit(mesh);
      if (!mesh.isMesh || mesh === skull) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox).applyMatrix4(_rel.multiplyMatrices(_inv.copy(head.matrixWorld).invert(), mesh.matrixWorld));
      if (box.containsPoint(crown)) out.push(mesh);
    }
  };
  visit(head);
  return out;
}

function pressMesh(built, head, mesh, cover) {
  const toHead = new THREE.Matrix4().multiplyMatrices(_inv.copy(head.matrixWorld).invert(), mesh.matrixWorld);
  const toMesh = toHead.clone().invert();
  const geo = mesh.geometry.clone(), pos = geo.attributes.position, q = new THREE.Vector3();
  const under = new Uint8Array(pos.count);
  let moved = false;
  for (let i = 0; i < pos.count; i++) {
    const pressed = cover.press(q.fromBufferAttribute(pos, i).applyMatrix4(toHead));
    under[i] = pressed || cover.under(q) ? 1 : 0;
    if (pressed) { q.applyMatrix4(toMesh); pos.setXYZ(i, q.x, q.y, q.z); moved = true; }
  }
  if (!moved) { geo.dispose(); return; }
  if (mesh.userData.trimUnderHat) trimUnder(geo, under);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const original = mesh.geometry;
  mesh.geometry = geo;
  built.covered.push(() => { geo.dispose(); mesh.geometry = original; });
}

function trimUnder(geo, under) {
  const idx = geo.index ? geo.index.array : Array.from({ length: geo.attributes.position.count }, (_, i) => i), keep = [];
  for (let t = 0; t < idx.length; t += 3) if (!(under[idx[t]] && under[idx[t + 1]] && under[idx[t + 2]])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  geo.setIndex(keep);
}

function loopRadius(fit, y, pad) {
  const { torso, neck } = fit;
  const sk = fit.skull;
  const chestY = y + neck.y;
  const onTorso = chestY < torso[1] ? Math.max(torso[0], torso[2]) * Math.sqrt(Math.max(0, 1 - (chestY / torso[1]) ** 2)) : 0;
  const hy = (y - neck.headY) / sk[1];
  const onHead = Math.abs(hy) < 1 ? Math.max(sk[0], sk[2]) * Math.sqrt(1 - hy * hy) : 0;
  return Math.max(neck.r, y < neck.coatTop ? neck.coatR : 0, onTorso, onHead) + pad;
}

function neckBand(fit, girth) {
  const lo = Math.max(fit.neck.overlap * 0.4, fit.neck.coatTop);
  const chin = fit.neck.headY - fit.skull[1] * 0.8;
  return [lo, Math.max(lo + girth * 2.2, chin)];
}

function square(x) {
  return Math.sign(x) * Math.sqrt(Math.abs(x));
}

const wall = (r, lo, hi) => (y) => Math.max(r(y), lerp(r(lo), r(hi), hi - lo > 1e-6 ? clamp((y - lo) / (hi - lo), 0, 1) : 0.5));

function scarfLoop(fit, f, { wraps, girth, sag = 0, loose = 1, base = false }) {
  const double = wraps > 1;
  const h = girth * 1.3, T = f.thick * 0.9;
  const above = h * (double ? 2.05 : 1), underEyes = fit.neck.eyeBottom - above;
  const below = h * (double ? Math.max(2.05, 1 + 1.5 * sag) : 1 + 0.75 * sag);
  const seat = scarfSeat(f), pad = T * 1.15 * seat.snug, body = (yy) => loopRadius(fit, yy, pad);
  const fitted = base && fit.neck.coatTop ? fit.neck.overlap * 0.4 + below : Math.min(creaseY(fit, below), underEyes);
  const { mid, hoop, lean } = loopRest(fit, seat, body, [fitted, underEyes]);
  const fn = (u, v, out) => {
    const psi = v * TAU, th = wraps * psi + Math.PI;
    const outer = double ? Math.sin(psi) : 0, lift = double ? Math.cos(psi) : 0;
    const sink = slumpAt(lean, th);
    const yc = mid + lift * h * 1.05 - sag * (0.5 + 0.5 * Math.cos(th)) * (0.5 + 0.5 * outer) * h * 1.5 - sink;
    const a = u * TAU, y = yc + h * square(Math.sin(a));
    const R = (Math.max(wall(body, yc - h, yc + h)(y), hoop) + (1 + outer) * T * 1.15 + T * square(Math.cos(a))) * loose;
    return out.set(R * Math.sin(th), y, R * Math.cos(th) + lean.dz);
  };
  // ponytail: the join at the back is not welded, so relief and normals may step there; weld v like
  // closedU welds u if it shows.
  return { fn, wraps, geo: panel(fn, f, { minU: 10, minV: 48, from: (p) => p.set(0, p.y, 0), through: 0 }), front: fn(0, 0.5 / wraps, new THREE.Vector3()) };
}

function scarfSeat(f) {
  const big = clamp((f.fit - 1) / (FIT_RANGE[1] - 1), 0, 1), small = clamp((1 - f.fit) / (1 - FIT_RANGE[0]), 0, 1);
  return { big, small, loose: 1 + big * 0.7, slope: big * 0.45, snug: 1 - small * 0.6 };
}

function settle(r, y0, R, bottom) {
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, bottom, i / n);
    if (r(y) >= R) return y;
  }
  return bottom;
}

function slumpOf(r, y, hoop, { seat, fit, shoulder }) {
  if (!seat.big) return { side: 0, front: 0, dz: 0 };
  const total = seat.slope * hoop * 2;
  const side = heldBy(fit, hoop) ? clamp(y - shoulder, 0, total) : total, front = total - side;
  return { side, front, dz: (Math.max(0, hoop - r(y)) * front) / total };
}

function heldBy(fit, hoop) {
  return fit.shoulderX > Math.max(hoop, fit.torso[0]) * 1.1;
}

function restAt(r, y0, hoop, { bottom, fit, shoulder }) {
  return settle(r, y0, hoop, heldBy(fit, hoop) ? Math.max(bottom, Math.min(y0, shoulder)) : bottom);
}

function slumpAt({ side, front }, a) {
  return (side * (1 + Math.sin(a))) / 2 + (front * (1 + Math.cos(a))) / 2;
}

function creaseY(fit, h) {
  const [lo] = neckBand(fit, 0), [bottom, top] = narrowNeck(fit);
  return clamp((bottom + top) / 2, lo + h, bottom + h);
}

function narrowNeck(fit) {
  const [lo] = neckBand(fit, 0);
  const ys = Array.from({ length: 41 }, (_, i) => lerp(lo, fit.neck.headY, i / 40));
  const r = ys.map((y) => loopRadius(fit, y, 0));
  const least = Math.min(...r);
  const narrow = ys.filter((_, i) => r[i] <= least * 1.05);
  return [narrow[0], narrow.at(-1)];
}

const BAND_WRAPS = { draped: 0, 'wrapped once': 1, 'wrapped twice': 2, tied: 1, tucked: 1 };
const UP = new THREE.Vector3(0, 1, 0);
const SHORT_ENDS = 0.4;

const endBend = (fit, floor, top = fit.neck.y) => Math.max(1e-3, Math.min(fit.torso[1] * 0.4, (top - floor) * 0.5));

function scarfBand(fit, f, spec, girth) {
  const { neck: nk, joints: { neck, chest } } = fit;
  const width = (spec.width ?? 1) * Math.max(0.05, fit.torso[0] * 0.38) * f.fit, flatT = f.thick * 1.2;
  const hug = (BAND_WRAPS[f.form] ?? 1) > 0;
  const dims = hug ? { width, flatT, H: width * 0.8, T: f.thick * 0.9 * Math.max(1, Math.sqrt(spec.tube ?? 1)) }
    : { width, flatT, H: Math.min(width, girth * 2.6), T: girth };
  const band = bandSpine(fit, f, spec, dims);
  const shape = bandShape(fit, band, { ...dims, hug }), { fn } = shape;
  const short = Math.max(...spec.ends) * f.fit < SHORT_ENDS;
  const pieces = cutBand(fit, f, shape, band, short), surface = pieces[0].geo;
  const anchors = bandAnchors(fit, f, shape, band, dims);
  pieces.push(...edgePieces(chest, [ring(fn, 0, 24), ring(fn, 1, 24)], f));
  if (f.form === 'tied') {
    const tie = knot(chest, band.spine[band.legs[0]], girth * 1.5, f);
    pieces.push(short ? tie : piece(chest, neckSkin(tie.geo, () => 1)));
  }
  const all = [...pieces, ...accessoryPieces(anchors, f, surface)];
  return short ? all.map(({ geo }) => piece(neck, geo.translate(0, -nk.y, 0))) : grounded(fit, f, all);
}

function grounded(fit, f, pieces) {
  const { joints: { neck, chest } } = fit;
  const floor = fit.floor + f.thick * 3.5, rise = endBend(fit, fit.floor) * 1.5;
  const ground = (y) => 1 - THREE.MathUtils.smoothstep(y, floor, floor + rise);
  return pieces.map(({ geo }) => piece(chest, groundSkin(geo.attributes.skinIndex ? geo : neckSkin(geo, () => 0), ground), [neck, fit.root]));
}

const FLOORS = new WeakMap();
// ponytail: cancels the root's height in the root's own frame, right while the root only turns
// about the vertical; one that tilts or scales would need it rebuilt from the world matrix.
function floorOf(root) {
  if (FLOORS.has(root)) return FLOORS.get(root);
  const floor = new THREE.Object3D();
  floor.name = 'floor';
  floor.updateMatrix = function updateMatrix() {
    this.position.y = -root.position.y;
    THREE.Object3D.prototype.updateMatrix.call(this);
  };
  root.add(floor);
  floor.updateMatrixWorld();
  FLOORS.set(root, floor);
  return floor;
}

function bandAnchors(fit, f, { fn, curve }, { spine, legs }, { width, flatT }) {
  const { chest } = fit.joints, endT = flatT + reliefDepth(f);
  const top = vAt(curve, spine, legs[0]);
  const onEnd = (v) => {
    const c = curve.getPointAt(v), faces = [0.25, 0.75].map((u) => fn(u, v, new THREE.Vector3()));
    const p = faces.reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) ? b : a));
    return { p, n: p.clone().sub(c).normalize() };
  };
  const size = Math.max(Math.min(fit.torso[0] * BUTTON_OF_TORSO, width * 0.22), endT * 1.2);
  const step = Math.min((size * 2.6) / curve.getLength(), (top * 0.8) / (BUTTONS_IN_A_ROW - 1));
  const first = clamp(top * 0.6 - (step * (BUTTONS_IN_A_ROW - 1)) / 2, top * 0.1, top * 0.9 - step * (BUTTONS_IN_A_ROW - 1));
  const bloom = onEnd(top * 0.85);
  return {
    tassel: tipAnchors(curve, { joint: chest, size: Math.max(width * 0.35, (endT / 0.35) * 1.2), floor: fit.floor }),
    'pom-pom': tipAnchors(curve, { joint: chest, size: Math.max(width * 0.3, endT * 1.4), floor: fit.floor }),
    flower: [{ joint: chest, ...bloom, size: Math.max(width * 0.4, endT * 2.5) }],
    buttons: Array.from({ length: BUTTONS_IN_A_ROW }, (_, i) => ({ joint: chest, ...onEnd(first + i * step), size })),
  };
}

function vAt(curve, spine, idx) {
  let lo = 0, hi = 1;
  for (let n = 0; n < 24; n++) {
    const m = (lo + hi) / 2;
    if (curve.getUtoTmapping(m) * (spine.length - 1) < idx) lo = m;
    else hi = m;
  }
  return lo;
}

function tipAnchors(curve, { joint, size, floor }) {
  return [[0, -1], [1, 1]].map(([t, away]) => ({ joint, p: curve.getPointAt(t), d: curve.getTangentAt(t).multiplyScalar(away), size, floor }));
}

function wrapRise(fit, y0, H, wraps) {
  const top = fit.neck.y + fit.neck.eyeBottom - H / 2;
  const [bottom, narrowTop] = narrowNeck(fit);
  return clamp(Math.min(top - y0, narrowTop - bottom), 0, H * 0.5 * wraps);
}

function bandWrap(clear, [y0, rise], [a0, a1], out, { hoop = 0, lean = { side: 0, front: 0, dz: 0 } } = {}) {
  const steps = Math.ceil(((a1 - a0) / TAU) * 16);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const ang = lerp(a0, a1, i / steps);
    const y = y0 + rise * (i / steps) - slumpAt(lean, ang);
    const R = Math.max(clear(y), hoop) + out * ((ang - a0) / TAU);
    return new THREE.Vector3(R * Math.sin(ang), y, R * Math.cos(ang) + lean.dz);
  });
}

function loopRest(fit, seat, body, [fitted, underEyes]) {
  const hoop = seat.big ? body(fitted) * seat.loose : 0;
  const held = { seat, fit, bottom: fitted - fit.torso[1] * 0.6, shoulder: fit.shoulderY - fit.neck.y };
  const mid = seat.big ? restAt(body, fitted, hoop, held) : lerp(fitted, Math.max(fitted, underEyes), seat.small * 0.8);
  return { mid, hoop, lean: slumpOf(body, mid, hoop, held) };
}

function bandSeat(fit, clear, { H, wraps }, seat) {
  const { neck: nk, torso } = fit;
  let y0 = nk.y + creaseY(fit, H / 2);
  const rise = wrapRise(fit, y0, H, wraps) * (1 - seat.big);
  y0 = Math.max(y0, lerp(y0, nk.y + nk.eyeBottom - H / 2 - rise, seat.small * 0.8));
  if (!seat.big) return { y0, rise, hoop: 0, lean: undefined };
  const hoop = clear(y0) * seat.loose, bottom = Math.max(torso[1] * 0.5, y0 - torso[1] * 0.6), rest = restAt(clear, y0, hoop, { bottom, fit, shoulder: fit.shoulderY });
  return { y0: rest, rise, hoop, lean: slumpOf(clear, rest, hoop, { seat, fit, shoulder: fit.shoulderY }) };
}

const bandDrop = (clear, from, to) => [0.35, 0.7].map((t) => {
  const p = from.clone().lerp(to, t);
  const r = Math.hypot(p.x, p.z), R = clear(p.y);
  return r < R ? p.set((p.x * R) / r, p.y, (p.z * R) / r) : p;
});

function bandArc(a, b, wraps, R) {
  const azimuth = (p) => {
    if (wraps) return Math.atan2(p.x, p.z);
    const s = Math.asin(clamp(p.x / R, -0.95, 0.95));
    return p.z >= 0 ? s : Math.PI - s;
  };
  const a0 = azimuth(a);
  let a1 = azimuth(b);
  while (a1 - a0 < Math.PI * 0.9) a1 += TAU;
  return [a0, a1 + TAU * wraps];
}

function bandSpine(fit, f, spec, { width, H, T }) {
  const { torso, neck: nk } = fit;
  const tuck = f.form === 'tucked' ? 0.35 : 1, wraps = BAND_WRAPS[f.form] ?? 1;
  const x = torso[0] * (spec.cross ? 0.05 : 0.28) + (wraps ? 0 : width * 0.5);
  const seat = scarfSeat(f), clear = (y) => loopRadius(fit, y - nk.y, T * 1.15 * seat.snug);
  const { y0, rise, hoop, lean } = bandSeat(fit, clear, { H, wraps }, seat);
  const endTop = Math.min(nk.y, torso[1] * 0.9, seat.big ? y0 - H : Infinity);
  const [endA, endB] = spec.ends.map((k, i) => endPath(fit, f, i ? -x : x, k * torso[1] * f.fit * tuck, { back: spec.back?.[i], top: endTop }));
  const [a0, arcEnd] = bandArc(endA[0], endB[0], wraps, clear(y0));
  const a1 = spec.cross && wraps ? arcEnd - TAU : arcEnd;
  const wrap = bandWrap(clear, [y0, rise], [a0, a1], wraps ? T * 2.3 : 0, { hoop, lean });
  const legA = [...endA].reverse(), dropA = bandDrop(clear, wrap[0], endA[0]).reverse(), dropB = bandDrop(clear, wrap.at(-1), endB[0]);
  return {
    spine: [...legA, ...dropA, ...wrap, ...dropB, ...endB],
    bunch: [...legA.map(() => 0), ...dropA.map(() => 0.5), ...wrap.map(() => 1), ...dropB.map(() => 0.5), ...endB.map(() => 0)],
    legs: [legA.length - 1, legA.length + dropA.length + wrap.length + dropB.length],
  };
}

function bandShape(fit, { spine, bunch }, { width, H, T, flatT, hug }) {
  const curve = new THREE.CatmullRomCurve3(spine, false, 'centripetal');
  const c = new THREE.Vector3(), t = new THREE.Vector3(), wide = new THREE.Vector3(), thick = new THREE.Vector3();
  const ys = spine.map((p) => p.y);
  const body = stepless((y) => loopRadius(fit, y - fit.neck.y, 0), Math.min(...ys) - H, Math.max(...ys) + H, H / 4);
  const bunchAt = bunchAlong(curve, spine, bunch);
  const widthAt = bandWidths(curve, bunchAt);
  const fn = (u, v, out) => {
    curve.getPointAt(v, c);
    curve.getTangentAt(v, t);
    const b = bunchAt(v);
    widthAt(v, t, wide);
    thick.crossVectors(t, wide).normalize();
    const a = u * TAU, halfT = lerp(flatT, T, b), half = lerp(width, H, b) * 0.5, up = Math.abs(wide.y) * half;
    out.copy(c).addScaledVector(wide, half * square(Math.cos(a))).addScaledVector(thick, halfT * square(Math.sin(a)));
    return hug && b > 0 ? onBody(out, c, { b, body: wall(body, c.y - up, c.y + up), halfT }) : out;
  };
  return { fn, curve };
}

function stepless(r, lo, hi, w) {
  const n = 160, dy = (hi - lo) / n, k = Math.max(1, Math.round(w / dy));
  const raw = Array.from({ length: n + 1 }, (_, i) => r(lo + i * dy));
  const window = (a, i, f) => f(a.slice(Math.max(0, i - k), i + k + 1));
  const most = raw.map((_, i) => window(raw, i, (s) => Math.max(...s)));
  const even = most.map((_, i) => window(most, i, (s) => s.reduce((x, y) => x + y) / s.length));
  return (y) => {
    const f = clamp((y - lo) / dy, 0, n), i = Math.min(n - 1, Math.floor(f));
    return lerp(even[i], even[i + 1], f - i);
  };
}

function bunchAlong(curve, spine, bunch) {
  return (v) => {
    const k = curve.getUtoTmapping(v) * (spine.length - 1), i = Math.min(spine.length - 2, Math.floor(k));
    return lerp(bunch[i], bunch[i + 1], k - i);
  };
}

function bandWidths(curve, bunchAt, N = 1024) {
  const widths = carriedWidths(curve, bunchAt, N), easeOver = 6;
  const eased = widths.map((_, s) => {
    const sum = new THREE.Vector3();
    for (let k = Math.max(0, s - easeOver); k <= Math.min(N, s + easeOver); k++) sum.add(widths[k]);
    return sum.normalize();
  });
  return (v, tangent, out) => {
    const f = v * N, s = Math.min(N - 1, Math.floor(f));
    out.lerpVectors(eased[s], eased[s + 1], f - s).addScaledVector(tangent, -out.dot(tangent));
    return out.lengthSq() < 1e-8 ? out.set(1, 0, 0) : out.normalize();
  };
}

function carriedWidths(curve, bunchAt, N) {
  const c = new THREE.Vector3(), t = new THREE.Vector3(), widths = [];
  for (let s = 0; s <= N; s++) {
    curve.getPointAt(s / N, c);
    curve.getTangentAt(s / N, t);
    const wide = new THREE.Vector3(-c.z, 0, c.x).normalize().lerp(UP, bunchAt(s / N));
    wide.addScaledVector(t, -wide.dot(t));
    const sure = THREE.MathUtils.smoothstep(wide.length(), 0.05, 0.3);
    const last = widths.at(-1)?.clone() ?? (wide.lengthSq() > 1e-8 ? wide.clone() : new THREE.Vector3(1, 0, 0));
    last.addScaledVector(t, -last.dot(t)).normalize();
    if (wide.lengthSq() > 1e-8 && wide.normalize().dot(last) < 0) wide.negate();
    widths.push(last.lerp(wide, sure).normalize());
  }
  return widths;
}

function onBody(p, c, { b, body, halfT }) {
  const rc = Math.hypot(c.x, c.z), r = Math.hypot(p.x, p.z);
  if (rc < 1e-6 || r < 1e-6) return p;
  const under = Math.max(0, rc - body(c.y) - halfT * 1.15);
  const across = ((p.x - c.x) * c.x + (p.z - c.z) * c.z) / rc;
  const k = lerp(r, body(p.y) + under + halfT * 1.15 + across, b) / r;
  p.x *= k;
  p.z *= k;
  return p;
}

function nearestOn(curve, n = 200) {
  const samples = curve.getSpacedPoints(n);
  return (p) => p.copy(samples.reduce((best, s) => (s.distanceToSquared(p) < best.distanceToSquared(p) ? s : best)));
}

function cutBand(fit, f, { fn, curve }, { spine, legs }, whole) {
  const nearest = nearestOn(curve);
  const geo = panel(fn, f, { closedU: true, minU: 8, minV: Math.max(48, spine.length * 2), from: nearest, widest: true, through: 0.25 });
  if (whole) return [piece(fit.joints.chest, geo)];
  const [cols, rows] = gridOf(geo);
  const [cutA, cutB] = legs.map((idx) => Math.round(vAt(curve, spine, idx) * (rows - 1))), { chest } = fit.joints;
  const k = Math.max(2, Math.round(rows * 0.03));
  const ease = (a, b, r) => clamp((r - a) / (b - a), 0, 1) ** 2 * (3 - 2 * clamp((r - a) / (b - a), 0, 1));
  return [piece(chest, neckSkin(geo, (i) => {
    const r = Math.floor(i / cols);
    return ease(cutA - k, cutA + k, r) * (1 - ease(cutB - k, cutB + k, r));
  }))];
}

function neckSkin(geo, w) {
  const n = geo.attributes.position.count;
  const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    index[i * 4 + 1] = 1;
    weight[i * 4 + 1] = w(i);
    weight[i * 4] = 1 - weight[i * 4 + 1];
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
  return geo;
}

function groundSkin(geo, w) {
  const p = geo.attributes.position, index = geo.attributes.skinIndex.array, weight = geo.attributes.skinWeight.array;
  for (let i = 0; i < p.count; i++) {
    const g = Math.min(w(p.getY(i)), 1 - weight[i * 4 + 1]);
    index[i * 4 + 2] = 2;
    weight[i * 4 + 2] = g;
    weight[i * 4] = 1 - weight[i * 4 + 1] - g;
  }
  return geo;
}

function skinnedGarment(geo, joint, others) {
  const mesh = new THREE.SkinnedMesh(geo, garmentMaterial());
  const inverse = (b) => (b.parent === joint
    ? new THREE.Matrix4().makeTranslation(-b.position.x, -b.position.y, -b.position.z)
    : new THREE.Matrix4().copy((b.updateWorldMatrix(true, false), b.matrixWorld)).invert().multiply(joint.matrixWorld));
  mesh.bind(new THREE.Skeleton([joint, ...others], [new THREE.Matrix4(), ...others.map(inverse)]), new THREE.Matrix4());
  return mesh;
}

function gridOf(geo) {
  const uv = geo.attributes.uv.array;
  let cols = 0;
  while (uv[cols * 2 + 1] === 0) cols++;
  return [cols, geo.attributes.uv.count / cols];
}

function endDepth(fit, f, back) {
  const { torso } = fit;
  const standoff = f.thick * 1.4;
  return (y, x) => {
    const k = Math.sqrt(Math.max(0, 1 - (Math.max(0, y) / torso[1]) ** 2 - (x / torso[0]) ** 2));
    return (back ? -1 : 1) * (torso[2] * k + standoff);
  };
}

function endPath(fit, f, x, length, { back = false, top = Math.min(fit.neck.y, fit.torso[1] * 0.9) } = {}) {
  const zAt = endDepth(fit, f, back), dir = back ? -1 : 1;
  const floor = fit.floor + f.thick;
  const bend = endBend(fit, floor, top), arc = (bend * Math.PI) / 2;
  const down = Math.max(0, top - floor - bend), splay = x * (1 + (1 - f.drape) * 0.2);
  const z0 = zAt(floor + bend, splay);
  const point = (s, i) => {
    const xi = i ? splay : x;
    if (s <= down) return new THREE.Vector3(xi, top - s, zAt(top - s, xi));
    const a = Math.min(s - down, arc) / bend, along = Math.max(0, s - down - arc);
    return new THREE.Vector3(xi, floor + bend * (1 - Math.sin(a)), z0 + dir * (bend * (1 - Math.cos(a)) + along));
  };
  if (length < 1e-4) return [point(0, 0), point(0, 0).setY(top - 0.01)];
  const spaced = (a, b, n) => Array.from({ length: n }, (_, i) => lerp(a, b, (i + 1) / n));
  const ss = [0, ...spaced(0, Math.min(length, down), 24)];
  if (length > down) ss.push(...spaced(down, Math.min(length, down + arc), 6));
  if (length > down + arc) ss.push(...spaced(down + arc, length, 8));
  return ss.filter((v, i) => i === 0 || v > ss[i - 1] + 1e-6).map(point);
}

const SCARF = {
  cowl: { cowl: true, formless: true },
  infinity: { wraps: 2, sag: 0.5, formless: true },
  ascot: { ends: [0.2, 0.18], cross: true, width: 0.7, tube: 0.7 },
  long: { ends: [1.6, 1.3] },
  trailing: { ends: [9, 8.6], back: [true, true] },
  skinny: { ends: [1.9, 1.7], width: 0.55, tube: 0.55, back: [false, true] },
  kerchief: { kerchief: true },
  'chunky wrap': { ends: [1.3, 1.1], width: 1.5, tube: 1.8 },
};

const FORM_WRAPS = { draped: 1, 'wrapped once': 1, 'wrapped twice': 2, tied: 1, tucked: 1 };

const loopOptions = (spec, f, girth) => ({
  wraps: spec.wraps ?? FORM_WRAPS[f.form] ?? 1, girth,
  sag: spec.sag ?? (f.form === 'draped' ? 1 : 0), loose: spec.loose ?? 1,
  base: Boolean(spec.kerchief),
});

export const hasForm = (type, silhouette) => formsOf(type).length > 0 && !(type === 'scarf' && SCARF[silhouette]?.formless);

function buildScarf(fit, item) {
  const spec = SCARF[item.silhouette] ?? SCARF.long;
  const f = spec.formless ? { ...item, form: null } : item;
  const { neck } = fit.joints;
  const girth = f.thick * 1.6 * (spec.tube ?? 1);
  if (spec.cowl) return cowl(fit, f, neck, girth);
  if (spec.ends) return scarfBand(fit, f, spec, girth);
  const loop = scarfLoop(fit, f, loopOptions(spec, f, girth));
  const tri = Boolean(spec.kerchief) && kerchiefShows(fit, f, loop);
  const pieces = [piece(neck, loop.geo), ...accessoryPieces(loopAnchors(fit, f, loop, { girth, kerchief: tri }), f, loop.geo)];
  if (spec.kerchief) pieces.push(...kerchief(fit, f, loop, tri));
  if (f.form === 'tied') pieces.push(knot(neck, loop.front, girth * 1.5, f));
  return pieces;
}

function loopAnchors(fit, f, { fn, wraps }, { girth, kerchief: tri }) {
  const { neck } = fit.joints;
  const v = (Math.PI + 0.6) / (wraps * TAU);
  const p = fn(0, v, new THREE.Vector3()), n = new THREE.Vector3(p.x, 0, p.z).normalize();
  const along = new THREE.Vector3(n.z, 0, -n.x);
  const low = lowest((u) => fn(u, v, new THREE.Vector3()));
  return {
    flower: [{ joint: neck, p, n, size: girth * 1.2 }],
    buttons: tri ? [] : buttonRow(neck, p, n, Math.min(girth * 0.7, fit.torso[0] * BUTTON_OF_TORSO), along),
    ...(!tri && hangFrom(neck, low, fit.torso[0], f)),
  };
}

function normalAt(fn, u, v, e = 1e-3) {
  const pt = (du, dv) => fn(u + du, v + dv, new THREE.Vector3());
  const n = new THREE.Vector3().crossVectors(pt(e, 0).sub(pt(-e, 0)), pt(0, e).sub(pt(0, -e))).normalize();
  const p = pt(0, 0);
  return n.x * p.x + n.z * p.z < 0 ? n.negate() : n;
}

function lowest(pointAt) {
  return Array.from({ length: 24 }, (_, i) => pointAt(i / 24)).reduce((a, b) => (b.y < a.y ? b : a));
}

function hangFrom(joint, p, torso, f) {
  const t = f.thick * 1.2 + reliefDepth(f);
  return {
    'pom-pom': [{ joint, p, d: DOWN, size: Math.max(torso * 0.12, t * 1.4) }],
    tassel: [{ joint, p, d: DOWN, size: Math.max(torso * 0.12, (t / 0.35) * 1.2) }],
  };
}

function cowl(fit, f, neck, girth) {
  const [lo, hi] = neckBand(fit, girth), seat = scarfSeat(f), body = (y) => loopRadius(fit, y, f.thick * 1.2 * seat.snug);
  const tall = (hi - lo) * clamp(f.fit, 0.4, 1.2);
  const collar = seat.big ? body(lo) * (1 + (f.fit - 1) * 0.5) : 0;
  const held = { seat, fit, bottom: lo - fit.torso[1] * 0.6, shoulder: fit.shoulderY - fit.neck.y };
  const base = seat.big ? restAt(body, lo, collar, held) : lerp(lo, hi - tall, seat.small), lean = slumpOf(body, base, collar, held);
  const fn = (u, v, out) => {
    const th = u * TAU, y = base + tall * v - slumpAt(lean, th);
    const R = Math.max(body(y), collar) * (1 + 0.12 * Math.sin(v * Math.PI));
    return out.set(R * Math.sin(th), y, R * Math.cos(th) + lean.dz);
  };
  const geo = panel(fn, f, { closedU: true, from: (p) => p.set(0, p.y, 0) });
  const side = fn(0, 0.5, new THREE.Vector3());
  const anchors = { flower: [{ joint: neck, p: side, n: normalAt(fn, 0, 0.5), size: girth * 1.4 }],
    buttons: [0.2, 0.5, 0.8].map((v) => ({ joint: neck, p: fn(0.02, v, new THREE.Vector3()), n: normalAt(fn, 0.02, v), size: fit.torso[0] * BUTTON_OF_TORSO * 0.8 })),
    ...hangFrom(neck, fn(0, 0, new THREE.Vector3()), fit.torso[0], f) };
  return [piece(neck, geo), ...edgePieces(neck, [ring(fn, 1), ring(fn, 0)], f), ...accessoryPieces(anchors, f, geo)];
}

function kerchief(fit, f, loop, carries = true) {
  const { torso, neck: nk, joints: { neck, chest } } = fit;
  const top = nk.y + loop.front.y, len = torso[1] * 0.9 * f.fit;
  const hang = hanging(fit, [top, top - len], f.thick * 1.3);
  const fn = (u, v, out) => {
    const y = top - v * len, th = (u - 0.5) * 2 * (1 - v);
    const R = hang(y);
    return out.set(R * Math.sin(th), y, R * Math.cos(th));
  };
  const geo = panel(fn, f, { minU: 12, minV: 12, from: (p) => p.set(0, p.y, 0) });
  const { uv } = geo.attributes;
  const tip = fn(0.5, 1, new THREE.Vector3()), size = torso[0] * 0.12;
  const hangOff = () => [{ joint: chest, p: tip, d: DOWN, size }];
  const anchors = { 'pom-pom': hangOff(), tassel: hangOff(), buttons: kerchiefButtons(fit, fn, { top, len, loop }) };
  const skin = (g) => neckSkin(g, (i) => 1 - THREE.MathUtils.smoothstep(uv.getY(i), 0, 0.3));
  return [piece(chest, skin(geo), [neck, fit.root]), ...(carries ? accessoryPieces(anchors, f, geo) : [])];
}

function kerchiefShows(fit, f, loop) {
  const { torso, neck: nk } = fit;
  const top = nk.y + loop.front.y, len = torso[1] * 0.9 * f.fit, buttonSize = torso[0] * BUTTON_OF_TORSO * 0.8;
  const under = nk.y + new THREE.Box3().setFromBufferAttribute(loop.geo.attributes.position).min.y;
  return under - buttonSize * 1.2 - (top - len * 0.8) >= buttonSize * 1.3 * (BUTTONS_IN_A_ROW - 1);
}

function kerchiefButtons(fit, fn, { top, len, loop }) {
  const { torso, neck: nk, joints: { chest } } = fit;
  const size = torso[0] * BUTTON_OF_TORSO * 0.8, under = nk.y + new THREE.Box3().setFromBufferAttribute(loop.geo.attributes.position).min.y;
  const high = Math.min(top - len * 0.3, under - size * 1.2), low = top - len * 0.8;
  const step = Math.max(0, Math.min(size * 2.6, (high - low) / (BUTTONS_IN_A_ROW - 1)));
  return Array.from({ length: BUTTONS_IN_A_ROW }, (_, i) => {
    const v = (top - (high - i * step)) / len;
    return { joint: chest, p: fn(0.5, v, new THREE.Vector3()), n: normalAt(fn, 0.5, v), size };
  });
}

function hanging(fit, [top, bottom], pad) {
  const n = 32;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const y = lerp(top, bottom, i / n);
    return [y, loopRadius(fit, y - fit.neck.y, pad)];
  });
  const hull = [pts[0]];
  for (let i = 0; i < n;) {
    const [y0, r0] = pts[i], slope = (j) => (pts[j][1] - r0) / (y0 - pts[j][0]);
    let next = i + 1;
    for (let j = i + 2; j <= n; j++) if (slope(j) > slope(next)) next = j;
    hull.push(pts[next]);
    i = next;
  }
  return (y) => {
    const found = hull.findIndex(([hy]) => hy <= y), k = found === -1 ? hull.length - 1 : Math.max(1, found);
    const [ya, ra] = hull[k - 1], [yb, rb] = hull[k] ?? hull[k - 1];
    return ya === yb ? ra : lerp(ra, rb, (ya - y) / (ya - yb));
  };
}

function hemOf(front, back, { open, easeFront = (t) => t, easeBack = (t) => t }) {
  return (th, side) => {
    const a = Math.abs((((th + Math.PI) % TAU) + TAU) % TAU - Math.PI);
    if (a <= Math.PI / 2) return lerp(front, side, easeFront(clamp((a - open) / (Math.PI / 2 - open), 0, 1)));
    return lerp(side, back, easeBack((a - Math.PI / 2) / (Math.PI / 2)));
  };
}

// VISUAL-DESIGN-FINISHED-OBJ.md, more shape rules
const back = (th) => Math.max(0, -Math.cos(th));
const STOLE_TURN = 0.6;
const STOLE_WIDTH = 0.6;
const SHAWL = {
  triangle: { hem: hemOf(1.1, 1.4, { open: 0.35 }), open: 0.35, arm: 0.8 },
  'half circle': { hem: hemOf(0.8, 1.05, { open: 0.3, easeFront: (t) => t * t, easeBack: (t) => 1 - (1 - t) ** 2 }), open: 0.3, arm: 0.7 },
  'rectangular wrap': { hem: (th, side) => {
    const a = Math.abs((((th + Math.PI) % TAU) + TAU) % TAU - Math.PI);
    const t = clamp((a - 1.0) / STOLE_TURN, 0, 1), b = clamp((a - 2.0) / (Math.PI - 2.0), 0, 1);
    return lerp(lerp(1.6, side, Math.sqrt(1 - (1 - t) ** 2)), Math.min(side, STOLE_WIDTH), b * b * (3 - 2 * b));
  }, open: 0.45, arm: 0.75 },
  crescent: { hem: hemOf(1.0, 0.45, { open: 0.6, easeFront: Math.sqrt }), open: 0.6, arm: 0.35 },
  capelet: { hem: () => 0.55, open: 0, button: true, circle: 0.75 },
  shrug: { depth: (th) => (back(th) > 0 ? 0.07 : 0), open: Math.PI / 2, sleeves: true },
};

const SHOULDER = 0.42 * Math.PI;
const ROLL = 0.8;

function rollDown(a, open) {
  const t = clamp((a - open) / ROLL, 0, 1);
  return open > 0 ? 1 - Math.sqrt(1 - (1 - t) ** 2) : 0;
}

const CURVE = 0.5, CURVE_V = 0.3;
function frontCurve(th, v, open) {
  if (!open) return th;
  const s = Math.atan2(Math.sin(th), Math.cos(th)), a = Math.abs(s);
  return Math.sign(s) * (a + CURVE * Math.max(0, 1 - v / CURVE_V) ** 2 * Math.max(0, 1 - (a - open) / ROLL));
}

function bunched(p, drop, v) {
  const k = 1 + 4 * drop * (1 - drop) * Math.max(0, 1 - v / 0.35) ** 2 * 0.18;
  return p.set(p.x * k, p.y, p.z * k);
}

function shawlShape(fit, f, spec) {
  const { torso } = fit;
  const pad = f.thick * 1.6;
  const r = [Math.max(torso[0], fit.shoulderX) + pad, torso[1] + pad, torso[2] + pad];
  const flare = (1 - f.drape) * 0.25 + (f.fit > 1 ? (f.fit - 1) * 0.3 : 0);
  const top = 0.17 * Math.PI;
  const p = new THREE.Vector3();
  const fall = r[1] * 1.6;
  const side = sideHem(fit, r, spec.arm ?? 0.5), arms = upperArms(fit), clear = fit.arm.r * 1.15 + pad;
  return (u, v, out) => {
    const th = spec.hem ? frontCurve(u * TAU, v, spec.open) : u * TAU, drop = spec.hem ? rollDown(Math.abs(Math.atan2(Math.sin(th), Math.cos(th))), spec.open) : 0;
    const reach = SHOULDER + (spec.hem ? (spec.hem(th, side) * torso[1] * f.fit) / fall : spec.depth(th) * Math.PI * f.fit);
    const phi = lerp(Math.min(top + drop * ROLL * 0.5, reach), reach, v);
    if (phi <= SHOULDER) onEllipsoid(r, phi, th, out);
    else hangBelow(onEllipsoid(r, SHOULDER, th, p), (phi - SHOULDER) * fall, flare / r[1], out);
    bunched(out, drop, v);
    if (spec.circle) return flared(out, spec.circle, { top: onEllipsoid(r, top, th, p).y, around: th, drape: f.drape });
    return phi > SHOULDER ? overArms(out, arms, clear) : out;
  };
}

function upperArms(fit) {
  const { chest } = fit.joints;
  return fit.joints.upperArm.map(({ node }) => new THREE.Line3(
    chest.worldToLocal(node.getWorldPosition(new THREE.Vector3())),
    chest.worldToLocal(node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0)))));
}

function overArms(p, arms, clear) {
  const q = new THREE.Vector3(), d = new THREE.Vector3(), out = new THREE.Vector3();
  for (const arm of arms) {
    arm.closestPointToPoint(p, true, q);
    if (q.distanceTo(p) < clear) {
      d.subVectors(p, q);
      out.set(q.x, 0, q.z).normalize();
      if (d.dot(out) < 0) d.addScaledVector(out, -2 * d.dot(out));
      if (d.lengthSq() < 1e-10) d.copy(out);
      p.copy(q).addScaledVector(d.normalize(), clear);
    }
    // ponytail: marched in steps of clear/4, so the outline is found to within that; solve the
    // capsule exit exactly if the step shows.
    out.set(p.x, 0, p.z).normalize();
    for (let i = 0; i < 64 && underArm(p, arm, clear); i++) p.addScaledVector(out, clear / 4);
  }
  return p;
}

const _flat = new THREE.Line3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
function underArm(p, arm, clear) {
  _flat.set(_f.copy(arm.start).setY(0), _g.copy(arm.end).setY(0));
  const t = _flat.closestPointToPointParameter(_f.set(p.x, 0, p.z), true);
  return t > 0 && _flat.at(t, _g).distanceTo(_f) < clear && p.y < lerp(arm.start.y, arm.end.y, t);
}

function sideHem(fit, r, arm) {
  const [{ start, end }] = upperArms(fit);
  return Math.max(0.05, r[1] * Math.cos(SHOULDER) - lerp(start.y, end.y, arm) + fit.arm.r * 2) / fit.torso[1];
}

function hangBelow(p, hang, flare, out) {
  return out.set(p.x * (1 + flare * hang), p.y - hang, p.z * (1 + flare * hang));
}

function flared(p, circle, { top, around, drape }) {
  const down = Math.max(0, top - p.y), lean = Math.asin(circle) * (1 - drape * 0.35);
  const r = Math.hypot(p.x, p.z), cone = r + down * Math.tan(lean) * 0.6;
  const fold = 1 + 0.06 * Math.min(1, down / 0.1) * Math.sin(around * 9);
  const k = (Math.max(r, cone) * fold) / Math.max(r, 1e-6);
  return p.set(p.x * k, p.y, p.z * k);
}

function buildShawl(fit, f) {
  const spec = SHAWL[f.silhouette] ?? SHAWL.triangle;
  const { chest } = fit.joints;
  const fn = shawlShape(fit, f, spec);
  const { open } = spec;
  const mask = open ? (u) => { const th = u * TAU; return Math.cos(th) > Math.cos(open); } : null;
  const pieces = [piece(chest, panel(fn, f, { closedU: true, mask, minU: 72, minV: 24, from: (p) => p.set(0, p.y * 0.3, 0) }))];
  const edging = edgePieces(chest, [ring(fn, 1, 64, open ? { closed: false, u0: open / TAU, u1: 1 - open / TAU } : {})], f);
  pieces.push(...edging);
  const front = fn(0, 0.1, new THREE.Vector3());
  if (f.form === 'tied') pieces.push(knot(chest, front, f.thick * 2.6, f));
  if (spec.sleeves) pieces.push(...shrugSleeves(fit, f));
  if (f.accessory === 'pin') pieces.push(...pinOn(fit, f, fn, spec));
  const acc = spec.button && f.accessory === 'none' ? { ...f, accessory: 'buttons' } : f;
  const [u0, u1] = open ? [open / TAU, 1 - open / TAU] : [0, 1];
  const hem = Array.from({ length: 257 }, (_, k) => fn(lerp(u0, u1, k / 256), 1, new THREE.Vector3()));
  return offArms(fit, [...pieces, ...accessoryPieces(shawlAnchors(fn, chest, front, f, fit.torso[0]), acc)], fit.arm.r * 0.95, { flap: { hem, edging: edging.length }, keepWorn: true });
}

function offArms(fit, pieces, r, { flap = null, keepWorn = false } = {}) {
  const { chest } = fit.joints, toHem = flap && ontoLine(flap.hem);
  const skin = (geo, k) => {
    if (!flap) return neckSkin(geo, () => 0);
    return flapSkin(geo, fit, k >= 1 && k <= flap.edging ? toHem : null);
  };
  return pieces.map((pc, k) => (pc.joint === chest ? piece(chest, armCapsules(skin(pc.geo, k), fit, r, { keepWorn }), armBones(fit)) : pc));
}

function ontoLine(line) {
  const seg = new THREE.Line3(), q = new THREE.Vector3(), best = new THREE.Vector3();
  return (p) => {
    let d = Infinity;
    for (let k = 1; k < line.length; k++) {
      seg.set(line[k - 1], line[k]).closestPointToPoint(p, true, q);
      if (q.distanceToSquared(p) < d) { d = q.distanceToSquared(p); best.copy(q); }
    }
    return p.copy(best);
  };
}

function flapSkin(geo, fit, onto = null) {
  const pos = geo.attributes.position, n = pos.count, p = new THREE.Vector3();
  const index = new Uint16Array(n * 4).map((_, i) => [0, 3, 4, 1][i % 4]), weight = new Float32Array(n * 4);
  const arms = upperArms(fit), sides = arms.map(({ start }) => new THREE.Vector2(start.x, start.z).normalize());
  const pivot = Math.min(...arms.map(({ start }) => Math.hypot(start.x, start.z)));
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    if (onto) onto(p);
    const out = Math.hypot(p.x, p.z), dir = new THREE.Vector2(p.x, p.z).divideScalar(Math.max(out, 1e-6));
    const away = THREE.MathUtils.smoothstep(out, pivot, pivot + fit.arm.r * 1.5);
    sides.forEach((side, s) => { weight[i * 4 + 1 + s] = away * THREE.MathUtils.smoothstep(dir.dot(side), 0, Math.cos(0.3)); });
  }
  for (let i = 0; i < n; i++) {
    const arm = weight[i * 4 + 1] + weight[i * 4 + 2], k = arm > 1 ? 1 / arm : 1;
    weight.set([1 - Math.min(arm, 1), weight[i * 4 + 1] * k, weight[i * 4 + 2] * k], i * 4);
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
  return geo;
}

function armBones(fit) {
  const { neck, upperArm } = fit.joints;
  return [neck, fit.root, ...upperArm.map(({ node }) => armRef(node))];
}

const ARM_ATTRIBUTES = ['aArmA0', 'aArmB0', 'aArmA1', 'aArmB1', 'aArmR'];
function armCapsules(geo, fit, r, { keepWorn = false } = {}) {
  const pos = geo.attributes.position, n = pos.count, p = new THREE.Vector3(), q = new THREE.Vector3();
  const arms = upperArms(fit).map(({ start, end }) => new THREE.Line3(start.clone().lerp(end, 0.15), end));
  arms.forEach(({ start, end }, s) => {
    geo.setAttribute(`aArmA${s}`, new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => start.getComponent(i % 3)), 3));
    geo.setAttribute(`aArmB${s}`, new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => end.getComponent(i % 3)), 3));
  });
  const inside = (i) => keepWorn && arms.some((arm) => arm.closestPointToPointParameter(p.fromBufferAttribute(pos, i), false) >= 0
    && arm.closestPointToPoint(p, true, q).distanceTo(p) < r * 0.8);
  geo.setAttribute('aArmR', new THREE.BufferAttribute(new Float32Array(n).map((_, i) => (inside(i) ? 0 : r)), 1));
  return geo;
}

const ARM_REFS = new WeakMap();
function armRef(arm) {
  if (!ARM_REFS.has(arm)) {
    const ref = new THREE.Object3D();
    ref.name = 'arm';
    arm.add(ref);
    ARM_REFS.set(arm, ref);
  }
  return ARM_REFS.get(arm);
}

const PIN_COLOUR = new THREE.Color('#b8975a');

function pinOn(fit, f, fn, spec) {
  const size = fit.torso[0] * 0.3, v = 0.3, step = 1 / 72;
  const across = f.form !== 'tied' && spec.open < 0.8;
  const [ua, ub] = across ? [spec.open / TAU + step, 1 - spec.open / TAU - step] : [0.14, 0.2];
  const a = fn(ua, v, new THREE.Vector3()), b = fn(ub, v, new THREE.Vector3()), n = normalAt(fn, across ? 0 : 0.17, v);
  if (a.distanceTo(b) < size) {
    const mid = a.clone().add(b).multiplyScalar(0.5), side = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    a.copy(mid).addScaledVector(side, -size * 0.6);
    b.copy(mid).addScaledVector(side, size * 0.6);
  }
  return shawlPin(a, b, n.clone(), size).map((g) => piece(fit.joints.chest, flatColour(g, PIN_COLOUR)));
}

// ponytail: one shawl pin style; a style field picks the shape here when more are wanted.
function shawlPin(a, b, n, size) {
  const mid = a.clone().add(b).multiplyScalar(0.5), along = b.clone().sub(a), len = along.length() * 1.3;
  along.normalize();
  const lift = (k) => mid.clone().addScaledVector(n, size * k);
  const stick = new THREE.CylinderGeometry(size * 0.05, size * 0.035, len, 8)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, along));
  const hoop = new THREE.TorusGeometry(size * 0.42, size * 0.07, 8, 24).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_z, n));
  const bead = new THREE.SphereGeometry(size * 0.11, 10, 8), one = [1, 1, 1];
  return [at(stick, lift(0.16), one), at(hoop, lift(0.1), one), at(bead, lift(0.16).addScaledVector(along, -len / 2), one)];
}

function shawlAnchors(fn, chest, front, f, torso) {
  const low = fn(0.5, 1, new THREE.Vector3());
  return {
    buttons: buttonRow(chest, front, new THREE.Vector3(0, 0, 1), torso * BUTTON_OF_TORSO),
    flower: [{ joint: chest, p: fn(0.08, 0.3, new THREE.Vector3()), n: new THREE.Vector3(0, 0, 1), size: f.thick * 4 }],
    tassel: [{ joint: chest, p: low, size: f.thick * 5 }],
  };
}

function shrugSleeves(fit, f) {
  return fit.joints.upperArm.map(({ node }) => {
    const r = fit.arm.r + f.thick * 1.4;
    return piece(node, tube(r * 0.4, -fit.arm.upper * 0.55, () => r, f).geo);
  });
}

const SWEATER = {
  pullover: { hem: -0.85 },
  cardigan: { hem: -0.85, open: true },
  vest: { hem: -0.8, vneck: true, sleeves: 'none' },
  turtleneck: { hem: -0.85, collar: true },
  cropped: { hem: -0.25 },
  tunic: { hem: -1.4, flare: 0.12 },
  raglan: { hem: -0.85, yoke: true },
};

const HUG = 0.72 * Math.PI;

function sweaterSpan(fit, f, spec) {
  const s = f.fit;
  const loose = s > 1 ? 1 + (s - 1) * 0.35 : 1;
  const r = fit.torso.map((x) => (x + f.thick * 1.3) * loose);
  const hem = spec.hem - (s - 1) * (s > 1 ? 1.1 : 1.9);
  const neckPhi = 0.2 * Math.PI;
  const hugY = Math.cos(HUG) * r[1];
  const hemY = Math.min(hugY - 0.01, hem * fit.torso[1]);
  const splitV = (hugY - r[1] * Math.cos(neckPhi)) / (hemY - r[1] * Math.cos(neckPhi));
  return { r, neckPhi, hugY, hemY, splitV };
}

function sweaterBody(fit, f, spec) {
  const { r, neckPhi, hugY, hemY, splitV } = sweaterSpan(fit, f, spec);
  const p = new THREE.Vector3();
  return (u, v, out) => {
    const th = u * TAU;
    if (v <= splitV) return onEllipsoid(r, lerp(neckPhi, HUG, v / splitV), th, out);
    onEllipsoid(r, HUG, th, p);
    const t = (v - splitV) / (1 - splitV);
    const k = 1 + (spec.flare ?? 0) * t;
    return out.set(p.x * k, lerp(hugY, hemY, t), p.z * k);
  };
}

function sweaterMask(spec) {
  if (spec.open) return (u) => Math.abs(Math.sin(u * TAU)) < 0.05 && Math.cos(u * TAU) > 0;
  if (spec.vneck) return (u, v) => Math.cos(u * TAU) > 0 && Math.abs(Math.sin(u * TAU)) < (0.35 - v) * 1.2;
  return null;
}

function buildSweater(fit, f) {
  const spec = SWEATER[f.silhouette] ?? SWEATER.pullover;
  const { chest } = fit.joints;
  const fn = sweaterBody(fit, f, spec);
  const fw = spec.yoke && f.colourwork === 'solid' && f.colours.length > 1 ? { ...f, colourwork: 'colour-block' } : f;
  const pieces = [piece(chest, panel(fn, fw, { closedU: true, mask: sweaterMask(spec), from: (p) => p.set(0, p.y * 0.2, 0) }))];
  pieces.push(...edgePieces(chest, [ring(fn, 1, 64)], f));
  pieces.push(...sleeves(fit, f, spec.sleeves ?? f.sleeves));
  if (spec.collar) pieces.push(...cowl(fit, { ...f, fit: 1, accessory: 'none' }, fit.joints.neck, f.thick * 1.6));
  else pieces.push(piece(chest, neckband(fit, f, spec, fn)));
  const line = [0.1, 0.3, 0.5, 0.7, 0.9].map((v) => fn(0, v * 0.8, new THREE.Vector3()));
  const anchors = {
    buttons: (spec.open ? line : line.slice(0, 2)).map((p) => ({ joint: chest, p, n: new THREE.Vector3(0, 0, 1), size: fit.torso[0] * BUTTON_OF_TORSO })),
    flower: [{ joint: chest, p: fn(0.06, 0.25, new THREE.Vector3()), n: new THREE.Vector3(0, 0, 1), size: f.thick * 4 }],
  };
  const acc = spec.open && f.accessory === 'none' ? { ...f, accessory: 'buttons' } : f;
  return offArms(fit, [...pieces, ...accessoryPieces(anchors, acc)], fit.arm.r * 0.95, { keepWorn: true });
}

function neckband(fit, f, spec, fn) {
  const { r, hugY } = sweaterSpan(fit, f, spec);
  const normal = (p, out) => out.set(p.x / r[0] ** 2, p.y > hugY ? p.y / r[1] ** 2 : 0, p.z / r[2] ** 2).normalize();
  const band = { ...f, stitch: 'garter', bump: 0 };
  const thick = f.thick * 0.6, n = new THREE.Vector3();
  const path = necklinePath(spec, fn).map((p) => p.addScaledVector(normal(p, n), thick));
  const geo = strapBand(path, band, { closed: !spec.open, width: Math.max(fit.torso[0] * 0.1, f.thick * 3.5), thick, normal });
  return flatColour(geo, trimColour(f));
}

function necklinePath(spec, fn) {
  const pt = (u, v) => fn(((u % 1) + 1) % 1, v, new THREE.Vector3()), n = 48;
  const round = (u0, u1) => Array.from({ length: n + 1 }, (_, i) => pt(lerp(u0, u1, i / n), 0));
  const edge = (v0, v1, side) => Array.from({ length: 13 }, (_, i) => {
    const v = lerp(v0, v1, i / 12), w = Math.asin(clamp(spec.vneck ? (0.35 - v) * 1.2 : 0.05, 0, 1)) / TAU;
    return pt(side > 0 ? w : 1 - w, v);
  });
  if (spec.vneck) {
    const top = Math.asin(0.42) / TAU;
    return [...edge(0.35, 0, 1).slice(0, -1), ...round(top, 1 - top), ...edge(0, 0.35, -1).slice(1, -1)];
  }
  if (spec.open) {
    const w = Math.asin(0.05) / TAU;
    return [...edge(1, 0, 1).slice(0, -1), ...round(w, 1 - w), ...edge(0, 1, -1).slice(1)];
  }
  return round(0, 1).slice(0, -1);
}

function sleeves(fit, f, kind) {
  if (kind === 'none') return [];
  const s = f.fit;
  const loose = s > 1 ? 1 + (s - 1) * 0.5 : 1;
  const out = [];
  const upperR = (fit.arm.r + f.thick * 1.3) * loose;
  const upperLen = fit.arm.upper * (kind === 'short' ? 0.6 * s : 1);
  fit.joints.upperArm.forEach(({ node }, i) => {
    const top = upperR * 0.5, t = tube(top, -Math.min(upperLen, fit.arm.upper), () => upperR, f);
    out.push(piece(node, t.geo), piece(node, sleeveCap(top, upperR, f)));
    if (kind === 'short' || upperLen < fit.arm.upper) out.push(...edgePieces(node, [ring(t.fn, 1)], f));
    if (kind !== 'long') return;
    const lower = fit.joints.lowerArm[i].node;
    const foreR = (fit.arm.foreR + f.thick * 1.3) * loose;
    const len = fit.arm.fore * clamp(0.55 + 0.45 * s, 0.5, 1.3);
    const lt = tube(0, -len, (v) => foreR * (1 + (s > 1 ? (s - 1) * 0.6 * v : 0)), f);
    out.push(piece(lower, lt.geo), ...edgePieces(lower, [ring(lt.fn, 1)], f));
  });
  return out;
}

function sleeveCap(top, r, f) {
  const fn = (u, v, out) => {
    const a = (v * Math.PI) / 2;
    return out.set(r * Math.sin(a) * Math.sin(u * TAU), top + r * 0.4 * Math.cos(a), r * Math.sin(a) * Math.cos(u * TAU));
  };
  return panel(fn, f, { closedU: true, from: (p) => p.set(0, top, 0) });
}

const BAG = {
  'shoulder bag': { size: [0.75, 0.65, 0.3], at: 'hip', strap: 'cross' },
  'market bag': { size: [0.7, 0.85, 0.45], at: 'hip', strap: 'short', round: 0.9, net: true },
  backpack: { size: [0.9, 1.0, 0.4], at: 'back', strap: 'pack' },
  tote: { size: [0.7, 0.8, 0.22], at: 'hip', strap: 'short' },
  'bucket bag': { size: [0.55, 0.7, 0.55], at: 'hip', strap: 'cross', round: 1 },
  'crossbody pouch': { size: [0.4, 0.32, 0.15], at: 'front', strap: 'cross' },
  'drawstring bag': { size: [0.75, 0.9, 0.5], at: 'back', strap: 'cords', round: 0.9 },
};

const spow = (x, e) => Math.sign(x) * Math.abs(x) ** e;

function bagBody(dims, round, centre) {
  const [w, h, d] = dims;
  const e = 0.25 + 0.75 * round;
  return (u, v, out) => {
    const th = u * TAU, phi = v * Math.PI;
    return out.set(
      centre.x + w * spow(Math.sin(phi), e) * spow(Math.sin(th), e),
      centre.y + h * spow(Math.cos(phi), e),
      centre.z + d * spow(Math.sin(phi), e) * spow(Math.cos(th), e));
  };
}

function bagPlace(fit, spec, dims, s) {
  const { torso } = fit;
  const out = new THREE.Vector3();
  if (spec.at === 'back') return out.set(0, -torso[1] * 0.05, -(torso[2] + dims[2] + 0.01));
  const sh = torso[1] * 1.15;
  const hang = (y) => clamp(sh - (sh - y) * s, fit.floor + dims[1] * 1.1, fit.shoulderY - fit.arm.r * 2 - dims[1]);
  if (spec.at === 'front') return out.set(torso[0] * 0.35, hang(-torso[1] * 0.7), torso[2] + dims[2] + 0.005);
  return out.set(torso[0] + dims[0] * 0.55, hang(-torso[1] * 0.75), torso[2] * 0.15);
}

function strapPaths(fit, spec, body, dims) {
  const { torso } = fit;
  const pad = 0.012;
  const R = [Math.max(torso[0], fit.shoulderX * 0.8) + pad, torso[1] + pad, torso[2] + pad];
  const top = body.clone().setY(body.y + dims[1] * 0.9);
  if (spec.strap === 'cross') return { R, paths: [crossStrap(R, top, dims)] };
  if (spec.strap === 'short') return { R, paths: [shortStrap(fit, R, top, dims)] };
  return { R, paths: packStraps(R, top, body, dims) };
}

function crossStrap(R, top, dims) {
  // ponytail: one flat cut, so a pouch's strap runs on past it, ~0.1 lower, round the near hip; a
  // strap pulled level round the waist needs a second plane behind the bag.
  const S = new THREE.Vector3(-R[0] * 0.55, R[1] * 0.83, 0), radii = new THREE.Vector3(...R), n = 32;
  const m = new THREE.Vector3((top.y - S.y) * R[0], (S.x - top.x) * R[1], 0), c = (top.y - S.y) * S.x + (S.x - top.x) * S.y;
  const centre = m.clone().multiplyScalar(c / m.lengthSq()), r = Math.sqrt(Math.max(0, 1 - (c * c) / m.lengthSq()));
  const u = new THREE.Vector3(0, 0, 1), v = new THREE.Vector3().crossVectors(m, u).normalize();
  const loop = Array.from({ length: n }, (_, i) => centre.clone().addScaledVector(u, r * Math.cos((i / n) * TAU))
    .addScaledVector(v, r * Math.sin((i / n) * TAU)).multiply(radii));
  const k = loop.reduce((j, p, i) => (p.distanceToSquared(top) < loop[j].distanceToSquared(top) ? i : j), 0);
  const way = loop[(k + 1) % n].clone().sub(loop[(k + n - 1) % n]).setY(0).normalize();
  const reach = 0.6 * Math.hypot(way.x * dims[0], way.z * dims[2]);
  const open = Array.from({ length: n - 5 }, (_, i) => loop[(k + 3 + i) % n]);
  return [top.clone().addScaledVector(way, reach), ...open, top.clone().addScaledVector(way, -reach)];
}

function shortStrap(fit, R, top, dims) {
  const sh = new THREE.Vector3(fit.shoulderX * 0.9, R[1] * 0.75, 0);
  return [top.clone().setZ(top.z + dims[2] * 0.6), sh.clone().setZ(R[2] * 0.4), sh.clone().setY(R[1] * 0.95),
    sh.clone().setZ(-R[2] * 0.4), top.clone().setZ(top.z - dims[2] * 0.6)];
}

function packStraps(R, top, body, dims) {
  const on = (x, y, z) => { const v = new THREE.Vector3(x, y, z); return v.divideScalar(Math.hypot(x / R[0], y / R[1], z / R[2])); };
  return [-1, 1].map((sd) => {
    const x = sd * R[0] * 0.45;
    return [new THREE.Vector3(sd * Math.min(R[0] * 0.45, dims[0] * 0.7), top.y, top.z + 0.005), on(x, R[1] * 0.95, -R[2] * 0.3), on(x, R[1] * 0.8, R[2] * 0.6),
      on(x * 1.3, R[1] * 0.2, R[2]), on(sd * R[0] * 0.8, -R[1] * 0.35, R[2] * 0.5), on(sd * R[0], -R[1] * 0.45, -R[2] * 0.2),
      new THREE.Vector3(body.x + sd * dims[0] * 0.7, body.y - dims[1] * 0.6, body.z + dims[2] * 0.4)];
  });
}

// ponytail: no edge, trim or accessory on a held bag; add them if its close-up needs them.
function buildHeldBag(fit, f) {
  const spec = BAG[f.silhouette] ?? BAG['shoulder bag'], paw = fit.holds[1];
  const [w, h, d] = spec.size.map((k, i) => k * fit.torso[i === 1 ? 1 : 0] * 0.5 * f.fit);
  const c = new THREE.Vector3(0, -d - 0.01, h * 0.8);
  const body = bagBody([w, h, d], spec.round ?? 0, new THREE.Vector3());
  const fn = (u, v, out) => { body(u, v, out); return out.set(c.x + out.x, c.y - out.z, c.z + out.y); };
  const netted = spec.net ? { ...f, stitch: 'lace', stitchW: f.stitchW * 2, rowH: f.rowH * 2 } : f;
  const top = c.z + h * 0.9, low = -h * 0.9;
  const strap = new THREE.CatmullRomCurve3([[-w * 0.7, top], [-w * 0.75, low * 0.3], [-w * 0.45, low], [0, low * 1.08],
    [w * 0.45, low], [w * 0.75, low * 0.3], [w * 0.7, top]].map(([x, z]) => new THREE.Vector3(x, c.y, z))).getPoints(32);
  return [piece(paw, panel(fn, netted, { closedU: true, minU: 32, minV: 20, from: () => c.clone() })),
    piece(paw, flatColour(tubeAlong({ pts: strap, closed: false }, f.thick * 0.9, 6), trimColour(f)))];
}

function buildBag(fit, f) {
  if (f.held) return buildHeldBag(fit, f);
  const spec = BAG[f.silhouette] ?? BAG['shoulder bag'];
  const { chest } = fit.joints;
  const dims = spec.size.map((k, i) => k * fit.torso[i === 1 ? 1 : 0] * 0.5 * f.fit);
  const centre = bagPlace(fit, spec, dims, f.fit);
  const fn = bagBody(dims, spec.round ?? 0, centre);
  const netted = spec.net ? { ...f, stitch: 'lace', stitchW: f.stitchW * 2, rowH: f.rowH * 2 } : f;
  const pieces = [piece(chest, panel(fn, netted, { closedU: true, minU: 32, minV: 20, from: () => centre.clone() }))];
  pieces.push(...bagStraps(fit, f, spec, { centre, dims }).map((geo) => piece(chest, flatColour(geo, trimColour(f)))));
  pieces.push(...edgePieces(chest, [ring(fn, 0.82)], f));
  return [...pieces, ...accessoryPieces(bagAnchors(fn, centre, chest, dims, fit.torso[0] * BUTTON_OF_TORSO * 0.8), f)];
}

function bagStraps(fit, f, spec, { centre, dims }) {
  const { R, paths } = strapPaths(fit, spec, centre, dims);
  if (spec.strap === 'cords') return paths.map((pts) => tubeAlong({ pts, closed: false }, f.thick * 0.5, 6));
  const normal = (p, out) => out.set(p.x / R[0] ** 2, p.y / R[1] ** 2, p.z / R[2] ** 2).normalize();
  const width = Math.max(fit.torso[0] * (spec.strap === 'pack' ? 0.16 : 0.12), f.thick * 3.5) * f.fit;
  return paths.map((pts) => strapBand(pts, f, { width, thick: f.thick * 0.5, normal }));
}

function bagAnchors(fn, centre, chest, dims, buttonSize) {
  const face = fn(0, 0.45, new THREE.Vector3());
  const n = face.clone().sub(centre).normalize();
  return {
    buttons: buttonRow(chest, face, n, buttonSize),
    flower: [{ joint: chest, p: face, n, size: dims[0] * 0.4 }],
    tassel: [{ joint: chest, p: fn(0.1, 0.95, new THREE.Vector3()), size: dims[1] * 0.35 }],
    'pom-pom': [{ joint: chest, p: fn(0, 0.05, new THREE.Vector3()), size: dims[0] * 0.25 }],
  };
}

const SOCKS = {
  crew: { up: 0.5 },
  'knee-high': { up: 0.95 },
  'over-knee': { up: 1, thigh: 0.55 },
  slouch: { up: 0.9, bunch: 0.22 },
  'leg warmers': { up: 0.95, from: 0.12, noFoot: true, loose: 1.35 },
  'slipper socks': { up: 0.12, pom: true },
};

const FOOT = { pos: [0, 0.016, 0.038], r: [0.055, 0.028, 0.078] };

const shinR = (fit, y) => fit.leg.shinR * lerp(1, LIMB_TAPER, clamp(-y / fit.leg.tibia, 0, 1));

function buildSocks(fit, f) {
  const spec = SOCKS[f.silhouette] ?? SOCKS.crew;
  const s = f.fit;
  const loose = (spec.loose ?? 1) * (s > 1 ? 1 + (s - 1) * 0.6 : 1);
  const bunch = (spec.bunch ?? 0) + Math.max(0, s - 1) * 0.35;
  const up = clamp(spec.up * (s < 1 ? s : 1), 0.05, 1);
  const pieces = [];
  const anchors = { 'pom-pom': [], tassel: [], flower: [], buttons: [] };
  fit.joints.lowerLeg.forEach(({ node }, i) => {
    const leg = { spec, up, loose, bunch, thigh: spec.thigh ? { node: fit.joints.upperLeg[i].node, reach: spec.thigh * Math.min(1, s) } : null };
    pieces.push(...sockLeg(fit, f, node, leg, anchors));
  });
  const acc = spec.pom && f.accessory === 'none' ? { ...f, accessory: 'pom-pom' } : f;
  return [...pieces, ...accessoryPieces(anchors, acc)];
}

function sockLeg(fit, f, node, { spec, up, loose, bunch, thigh }, anchors) {
  const tib = fit.leg.tibia;
  const yTop = -tib * (1 - up), yBot = -tib * (1 - (spec.from ?? 0));
  const { t, joint, skin } = thigh ? overKnee(fit, f, node, { ...thigh, yBot, loose, bunch })
    : { t: tube(yTop, yBot, (v) => (shinR(fit, lerp(yTop, yBot, v)) + f.thick * 1.2) * loose, f, { bunch }), joint: node };
  const cuff = t.fn(0, 0, new THREE.Vector3());
  anchors['pom-pom'].push({ joint, p: t.fn(0.5, 0.2, new THREE.Vector3()), size: fit.leg.shinR * POM_OF_SHIN });
  anchors.tassel.push({ joint, p: cuff, size: f.thick * 3 });
  anchors.flower.push({ joint, p: cuff, n: new THREE.Vector3(0, 0, 1), size: f.thick * 3 });
  anchors.buttons.push(...[0.15, 0.3, 0.45].map((v) => ({ joint, p: t.fn(0.25, v, new THREE.Vector3()), n: new THREE.Vector3(1, 0, 0), size: fit.leg.shinR * BUTTON_OF_SHIN })));
  const out = [piece(joint, t.geo, skin), ...edgePieces(joint, [ring(t.fn, 0)], f)];
  if (!spec.noFoot) out.push(piece(node, sockFoot(fit, f, tib)));
  return out;
}

function overKnee(fit, f, shin, { node: thigh, reach, yBot, loose, bunch }) {
  const knee = shin.position.y, d = fit.leg.thighR;
  const top = -fit.leg.femur * (1 - reach), bot = knee + yBot, below = (y, a, b) => 1 - THREE.MathUtils.smoothstep(y, a, b);
  const radius = (y) => (y > knee ? lerp(fit.leg.thighR, shinR(fit, 0), below(y, knee, knee + d)) : shinR(fit, y - knee));
  const t = tube(top, bot, (v) => (radius(lerp(top, bot, v)) + f.thick * 1.2) * loose, f, { bunch });
  const { uv } = t.geo.attributes, bend = (v) => below(lerp(top, bot, v), knee - d * 0.5, knee + d * 0.5);
  neckSkin(t.geo, (i) => bend(uv.getY(i)));
  return { t, joint: thigh, skin: [shin] };
}

function sockFoot(fit, f, tib) {
  const c = new THREE.Vector3(FOOT.pos[0], -tib + FOOT.pos[1], FOOT.pos[2]);
  const r = FOOT.r.map((x) => x + f.thick * 1.1);
  const fn = bagBody(r, 1, c);
  return panel(fn, f, { closedU: true, minU: 24, minV: 12, from: () => c.clone() });
}

function armTopOver(fit, hold, xs, ys) {
  const arm = fit.joints.upperArm.find(({ node }) => node.getObjectById(hold.id))?.node;
  const inv = hold.matrixWorld.clone().invert(), p = new THREE.Vector3();
  let top = -Infinity;
  arm?.traverse((m) => {
    if (!m.isMesh || m.userData.garment) return;
    const { position } = m.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (p.x >= xs[0] && p.x <= xs[1] && p.y >= ys[0] && p.y <= ys[1]) top = Math.max(top, p.z);
    }
  });
  return top;
}

function buildPotholder(fit, f) {
  const s = fit.torso[0] * 0.75, paw = fit.holds[1];
  const z = Math.max(0.016, armTopOver(fit, paw, [-s / 2, s / 2], [0.04 - s, 0.04]) + f.thick * 1.5);
  const fn = (u, v, out) => out.set((u - 0.5) * s, 0.04 - v * s, z);
  const face = panel(fn, f, { from: (p) => p.setZ(p.z - 1) });
  const r = s * 0.08, far = 0.04 - s - r;
  const pts = Array.from({ length: 16 }, (_, i) => new THREE.Vector3(Math.sin((i / 16) * TAU) * r, far + Math.cos((i / 16) * TAU) * r, z));
  return [piece(paw, face), piece(paw, flatColour(tubeAlong({ pts, closed: true }, f.thick * 0.6, 6), f.colours[0]))];
}

function buildPile(fit, f) {
  const w = fit.torso[0], paw = fit.holds[1];
  let z = 0;
  return f.folds.map((fold, i) => {
    const ff = forView(fabric(fold), fit), h = w * 0.07 + ff.thick;
    const c = new THREE.Vector3((i % 2 ? 1 : -1) * w * 0.05, -w * 0.4, z + h);
    z += 2 * h;
    const slab = bagBody([w * (0.6 + 0.06 * ((i * 7) % 3)), h, w * 0.45], 0.15, new THREE.Vector3());
    const fn = (u, v, out) => { slab(u, v, out); return out.set(c.x + out.x, c.y - out.z, c.z + out.y); };
    return piece(paw, panel(fn, ff, { closedU: true, minU: 24, minV: 8, from: () => c.clone() }));
  });
}

const HELD_BUILDERS = { potholder: buildPotholder };

const PLAIN = Object.freeze({ fit: 1, silhouette: null, stitch: 'stockinette', edge: 'none', accessory: 'none' });

export function heldAs(wip, colourOf) {
  const type = wip.pattern?.patternType;
  if (!Object.hasOwn(HELD_BUILDERS, type)) return null;
  return { type, item: madeItem({ ...PLAIN, ...madeWith(wip, colourOf) }) };
}

export function pileAs(wips, colourOf) {
  const folds = wips.map((w) => (wornAs(w, colourOf) ?? heldAs(w, colourOf))?.item).filter(Boolean);
  return folds.length ? { type: 'pile', item: { ...folds[0], on: true, folds } } : null;
}

const BUILDERS = { hat: buildHat, scarf: buildScarf, shawl: buildShawl, sweater: buildSweater, bag: buildBag, socks: buildSocks,
  ...HELD_BUILDERS, pile: buildPile };

let material = null;

export function garmentMaterial() {
  if (material) return material;
  material = knitMaterial('#ffffff');
  Object.assign(material.userData, { family: 'garment', shared: true });
  material.vertexColors = true;
  material.side = THREE.DoubleSide;
  material.defines = { ...material.defines, USE_HATCH_SCALE: '' };
  applyHatching(material, { freq: 1, depth: 0.22 });
  const hatch = material.onBeforeCompile;
  const rim = { value: LOOK.rim };
  material.userData.rim = rim;
  material.onBeforeCompile = (shader, renderer) => {
    hatch(shader, renderer);
    addRim(shader, rim);
    addArmPush(shader);
  };
  material.customProgramCacheKey = () => 'garment-knit-hatch-rim-arms';
  return material;
}

const ARM_PUSH_COMMON = `#include <common>
attribute vec3 aArmA0;
attribute vec3 aArmB0;
attribute vec3 aArmA1;
attribute vec3 aArmB1;
attribute float aArmR;
vec3 offArm(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ab = b - a;
  float t = dot(p - a, ab) / max(dot(ab, ab), 1e-8);
  vec3 q = a + ab * min(t, 1.0);
  float l = length(p - q);
  return (t >= 0.0 && l < r && l > 1e-6) ? q + (p - q) * (r / l) : p;
}`;

const ARM_PUSH_VERTEX = `#include <skinning_vertex>
#ifdef USE_SKINNING
  if (aArmR > 0.0) {
    mat4 arm0 = bindMatrixInverse * getBoneMatrix(3.0), arm1 = bindMatrixInverse * getBoneMatrix(4.0);
    transformed = offArm(transformed, (arm0 * vec4(aArmA0, 1.0)).xyz, (arm0 * vec4(aArmB0, 1.0)).xyz, aArmR);
    transformed = offArm(transformed, (arm1 * vec4(aArmA1, 1.0)).xyz, (arm1 * vec4(aArmB1, 1.0)).xyz, aArmR);
  }
#endif`;

function addArmPush(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', () => ARM_PUSH_COMMON)
    .replace('#include <skinning_vertex>', () => ARM_PUSH_VERTEX);
}

function addRim(shader, rim) {
  shader.uniforms.uRim = rim;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uRim;')
    .replace('#include <opaque_fragment>', `{
      float facing = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
      outgoingLight += vec3(uRim) * pow(facing, 3.0);
    }
    #include <opaque_fragment>`);
}

export function outfitPieces(built, outfit) {
  const fit = bodyFit(built);
  return Object.entries(outfit)
    .filter(([type, item]) => item?.on && BUILDERS[type])
    .flatMap(([type, item]) => BUILDERS[type](fit, forView(fabric(item), fit)).map((p) => ({ ...p, type })));
}

function atRest(built, build) {
  const rig = [];
  built.root.traverse((o) => { rig.push([o, o.position.clone(), o.quaternion.clone(), o.visible]); });
  applyPose(built, POSES.rest);
  built.root.updateMatrixWorld(true);
  build();
  for (const [o, p, q, visible] of rig) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.visible = visible;
  }
  built.root.updateMatrixWorld(true);
}

export function dress(built, outfit) {
  undress(built);
  if (outfit.hat?.on) coverUnderHat(built, fabric(outfit.hat));
  atRest(built, () => {
    const byJoint = new Map(), skinOf = new Map(), typesOf = new Map();
    for (const { joint, geo, skinTo, type } of outfitPieces(built, outfit)) {
      if (!byJoint.has(joint)) byJoint.set(joint, []);
      byJoint.get(joint).push(geo);
      typesOf.set(joint, new Set([...(typesOf.get(joint) ?? []), type]));
      if (skinTo && skinTo.length > (skinOf.get(joint)?.length ?? 0)) skinOf.set(joint, skinTo);
    }
    built.garments = [...byJoint].map(([joint, geos]) => garmentMesh(joint, geos, skinOf.get(joint)));
    for (const mesh of built.garments) mesh.userData.worn = [...typesOf.get(mesh.parent)];
  });
  return built.garments;
}

function garmentMesh(joint, geos, others) {
  if (others) geos.forEach((g) => g.attributes.skinIndex || neckSkin(g, () => 0));
  if (geos.some((g) => g.attributes.aArmR)) {
    for (const g of geos) {
      const n = g.attributes.position.count;
      for (const name of ARM_ATTRIBUTES) if (!g.attributes[name]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * (name === 'aArmR' ? 1 : 3)), name === 'aArmR' ? 1 : 3));
    }
  }
  const merged = geos.length === 1 ? strip4(geos[0]) : mergeGeometries(geos.map(strip4), false);
  if (geos.length > 1) geos.forEach((g) => g.dispose());
  const mesh = others ? skinnedGarment(merged, joint, others) : new THREE.Mesh(merged, garmentMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.garment = true;
  mesh.userData.dropOnMerge = ARM_ATTRIBUTES;
  joint.add(mesh);
  return mesh;
}

const KEEP = new Set(['position', 'normal', 'uv', 'color', 'aHatchScale', 'skinIndex', 'skinWeight', ...ARM_ATTRIBUTES]);
function strip4(geo) {
  for (const name of Object.keys(geo.attributes)) if (!KEEP.has(name)) geo.deleteAttribute(name);
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  return geo;
}

export function undress(built) {
  for (const mesh of built.garments ?? []) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.skeleton?.dispose();
  }
  built.garments = [];
  for (const undo of built.covered ?? []) undo();
  built.covered = [];
}
