// Worn finished objects: the generator behind dress-up.html, and later the shop.
//
// Spec: ai_planning_sessions/characters/VISUAL-DESIGN-FINISHED-OBJ.md (types, silhouettes, the
// five-way vocabulary, the modifiers) and WEARABLE-LOOK-VS-PERFORMANCE.md (what each choice costs).
//
// Three rules shape everything here:
//
//   1. FIT IS MEASURED, never authored per species. The head, torso and arm clearances are read off
//      whatever the species kit actually hung on those joints -- the lion's mane, the llama's
//      fleece, the owl's wings -- so a garment is authored once and a new species needs no code.
//      Ears and tufts are joints of their own, so they are not in the head's clearance and poke
//      through a hat: that is the ear hole, for free.
//   2. EVERY PIECE IS ONE PARAMETRIC SHEET over (u, v). Stitch relief, colourwork, lace holes and
//      the yarn's strand hatching all read the same (u, v), so no piece needs code of its own for
//      any of them. v runs along the knitting (rows), u across it (stitches).
//   3. ONE MESH PER JOINT, whatever is worn there, in one shared material with colour in the
//      vertices. A shawl, a sweater and a bag on the chest cost one draw between them.
//
// ponytail: garments are dressed AFTER createCharacter, onto an un-merged rig. The shop merges, and
// the merge pass repaints every mesh from its material colour (npc.js paintGeometry), which would
// wipe the colourwork. Dressing before the merge, and teaching paintGeometry to keep an existing
// colour attribute, is the upgrade -- both are small, and neither is needed by the dress-up page.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, LIMB_TAPER, femurOf, knitMaterial, tibiaOf } from './npc.js';
import { applyHatching } from '../inventory/yarn-look.js';
import { YARN_MATERIALS, YARN_WEIGHT_NAMES } from '../inventory/catalog.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- vocabulary (spec §2)

export const STITCHES = Object.freeze(['plain', 'rib', 'garter', 'seed', 'waffle', 'puff', 'cable', 'lace']);
export const COLOURWORKS = Object.freeze(['solid', 'stripes', 'checks', 'colour-block', 'motif', 'fair isle', 'marled']);
export const EDGES = Object.freeze(['none', 'rolled', 'ribbed', 'fringed', 'picot', 'scalloped']);
export const FORMS = Object.freeze(['draped', 'wrapped once', 'wrapped twice', 'tied', 'tucked']);
export const ACCESSORIES = Object.freeze(['none', 'pom-pom', 'tassel', 'buttons', 'flower']);
export const CRAFTS = Object.freeze(['knit', 'crochet']);
export const SLEEVES = Object.freeze(['none', 'short', 'long']);
export { YARN_WEIGHT_NAMES as WEIGHTS, YARN_MATERIALS as FIBRES };

/** Spec §1. `form` marks the types the "how it is worn" field applies to. */
export const GARMENTS = Object.freeze({
  hat: { slot: 'head', edge: 'rolled',
    silhouettes: ['beanie', 'slouch', 'fisherman', 'beret', 'earflap', 'hood', 'headband', 'bucket', 'cloche', 'pixie'] },
  scarf: { slot: 'neck', edge: 'none', form: true,
    silhouettes: ['cowl', 'infinity', 'ascot', 'long', 'trailing', 'skinny', 'kerchief', 'chunky wrap'] },
  shawl: { slot: 'shoulders', edge: 'none', form: true,
    silhouettes: ['triangle', 'half circle', 'rectangular wrap', 'crescent', 'capelet', 'shrug', 'knotted triangle'] },
  sweater: { slot: 'torso', edge: 'ribbed', sleeves: true,
    silhouettes: ['pullover', 'cardigan', 'vest', 'turtleneck', 'cropped', 'tunic', 'raglan'] },
  bag: { slot: 'bag', edge: 'none',
    silhouettes: ['shoulder bag', 'market bag', 'backpack', 'tote', 'bucket bag', 'crossbody pouch', 'drawstring bag'] },
  socks: { slot: 'feet', edge: 'ribbed',
    silhouettes: ['ankle', 'crew', 'knee-high', 'over-knee', 'slouch', 'leg warmers', 'slipper socks'] },
});

/** Worn size relative to a fitted one. 1 is fitted; both ends are allowed to look silly (spec §3). */
export const FIT_RANGE = Object.freeze([0.2, 1.6]);

/** Most yarn colours one item can be knitted in. Colour slots are item keys color1..color6. */
export const MAX_COLOURS = 6;
const PALETTE = ['#c0504d', '#f2e3c6', '#3d5a80', '#e0b04a', '#5b8c5a', '#8a5a9e'];
const colourKeys = (n) => Array.from({ length: n }, (_, i) => `color${i + 1}`);

/** One item's attributes, as a pattern plus how it was made would give them. */
export function defaultItem(type) {
  const g = GARMENTS[type];
  return {
    on: type === 'scarf', silhouette: g.silhouettes[0], fit: 1,
    weight: 'worsted', fibre: 'wool', craft: 'knit',
    colorCount: 1, ...Object.fromEntries(colourKeys(MAX_COLOURS).map((k, i) => [k, PALETTE[i]])),
    colourwork: 'solid', stitch: 'plain', edge: g.edge, accessory: 'none',
    form: 'wrapped once', sleeves: 'long',
  };
}

export const defaultOutfit = () =>
  Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, defaultItem(type)]));

// ---------------------------------------------------------------- yarn -> fabric

// Stitch width per yarn weight, world units, BEFORE the stylisation scale. Real gauge: lace is ~9
// stitches per cm and super-bulky ~1, against a character roughly a metre tall.
const STITCH_W = Object.freeze({
  lace: 0.0035, fingering: 0.004, sport: 0.0045, dk: 0.0052,
  worsted: 0.0058, aran: 0.0065, bulky: 0.0085, 'super-bulky': 0.011,
});

// Drape per fibre, 0 stiff .. 1 fluid (spec §3, proposed order). Picks how far ends and hems
// stand off the body; there is no cloth simulation.
const DRAPE = Object.freeze({
  linen: 0.1, cotton: 0.25, acrylic: 0.4, wool: 0.45, bamboo: 0.55, mohair: 0.7, alpaca: 0.85, silk: 0.9,
});

/**
 * Knobs the dress-up page exposes. `stitchScale` is the stylisation: at 150px real stitches are
 * sub-pixel, so relief is drawn several times real size (spec §2, "big relief"). Mutable on purpose,
 * so the page can tune them live; nothing in the shop should write them.
 */
export const LOOK = { stitchScale: 3, relief: 0.9, rim: 0.35 };

/** The resolved numbers a builder works from. */
function fabric(item) {
  const stitch = (STITCH_W[item.weight] ?? STITCH_W.worsted) * LOOK.stitchScale;
  return {
    ...item,
    stitchW: stitch, rowH: stitch * 0.8,
    thick: stitch * 1.1,                     // a knit fabric is about two yarn diameters
    drape: DRAPE[item.fibre] ?? 0.45,
    colours: colourKeys(Math.min(item.colorCount, MAX_COLOURS)).map((k) => new THREE.Color(item[k] ?? PALETTE[0])),
    colourwork: resolveColourwork(item.colourwork, item.colorCount),
  };
}

/**
 * The purchase fallback (spec §3): a solid pattern knitted in more than one colour becomes stripes,
 * which repeat through every colour, so stripes need no further upgrade. The pattern still decides
 * first. Choosing fair isle for extra colours instead is an NPC's taste, not a penalty: to come
 * with personality (spec §3).
 */
export function resolveColourwork(colourwork, count) {
  return colourwork === 'solid' && count > 1 ? 'stripes' : colourwork;
}

// ---------------------------------------------------------------- the body, measured

const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _box = new THREE.Box3();

/** What a joint carries ITSELF -- not its child joints, not garments -- in the joint's own space. */
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

/** The skull: every species kit adds it as a sphere on the head, and it is the largest one there. */
function skullMesh(head) {
  let best = null;
  for (const child of head.children) {
    if (child.isMesh && child.geometry === GEO.sphere && (!best || child.scale.x > best.scale.x)) best = child;
  }
  return best;
}
const skullRadii = (head) => skullMesh(head)?.scale.toArray() ?? [0.17, 0.17, 0.17];

/**
 * Everything a garment has to clear, measured off the built rig in the pose it is standing in.
 * Read once per dressing; nothing here is per frame.
 */
export function bodyFit(built) {
  built.root.updateMatrixWorld(true);
  const { joints: j, params: P } = built;
  const head = carried(j.head), chest = carried(j.chest), arm = carried(j.upperArm[0].node);
  const chestWorld = j.chest.getWorldPosition(new THREE.Vector3());
  const floor = j.chest.worldToLocal(new THREE.Vector3(chestWorld.x, 0, chestWorld.z)).y;
  const armR = Math.max(extent(arm, 'x'), extent(arm, 'z'));
  return {
    P, joints: j, floor,
    head: [extent(head, 'x'), head.max.y, Math.max(-head.min.z, P.headRadius)],
    skull: skullRadii(j.head),
    torso: [extent(chest, 'x'), Math.max(chest.max.y, -chest.min.y), extent(chest, 'z')],
    shoulderX: P.torsoW * (P.shoulderOut + (built.bulge ?? 0)) + armR,
    arm: { r: armR, upper: P.upperArmLen, fore: P.forearmLen, foreR: P.limbThick * 1.05 * LIMB_TAPER },
    neck: { r: P.neckThick, len: P.neckLength, y: P.torsoH - P.headOverlap, overlap: P.headOverlap,
      headY: P.neckLength + P.headRadius * 0.62 },
    leg: { thighR: P.limbThick, shinR: P.limbThick * LIMB_TAPER, femur: femurOf(P), tibia: tibiaOf(P) },
  };
}

// ---------------------------------------------------------------- the sheet

/**
 * A parametric sheet: `fn(u, v, out)` writes the point at (u, v), both 0..1. `mask(u, v)` drops a
 * quad -- a hood's face opening, a cardigan's front, a lace hole. `from(p)` is the point a normal
 * should face away from, so relief always bumps OUTWARD whatever order the sheet was swept in.
 */
function sheet(fn, segU, segV, { closedU = false, mask = null, from = null } = {}) {
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
  geo.setIndex(quads(segU, segV, mask));
  normals(geo, { closedU, cols, rows, from });
  return geo;
}

function quads(segU, segV, mask) {
  const index = [];
  const cols = segU + 1;
  for (let r = 0; r < segV; r++) {
    for (let c = 0; c < segU; c++) {
      if (mask?.((c + 0.5) / segU, (r + 0.5) / segV)) continue;
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  return index;
}

/** Vertex normals, facing away from `from`, with a closed sheet's seam welded so it does not crease. */
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

/** How long the sheet is along u and along v, sampled, so stitch counts come from real size. */
function spans(fn) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const walk = (at) => {
    let len = 0;
    fn(...at(0), a);
    for (let i = 1; i <= 16; i++) {
      fn(...at(i / 16), b);
      len += a.distanceTo(b);
      a.copy(b);
    }
    return len;
  };
  return [walk((t) => [t, 0.5]), walk((t) => [0.5, t])];
}

// ---------------------------------------------------------------- stitch relief (spec §2)

const fract = (x) => x - Math.floor(x);

// Height 0..1 at stitch coordinates (us across, vs along). "Big relief": geometry, not a normal map.
const RELIEF = {
  plain: () => 0,
  rib: (us) => (0.5 + 0.5 * Math.cos((TAU * us) / 4)) ** 2,
  garter: (us, vs) => 0.5 + 0.5 * Math.cos((TAU * vs) / 2),
  seed: (us, vs) => 0.5 + 0.5 * Math.sin(Math.PI * us) * Math.sin(Math.PI * vs),
  waffle: (us, vs) => Math.max(Math.abs(Math.cos((Math.PI * us) / 2)), Math.abs(Math.cos((Math.PI * vs) / 2))) ** 6,
  puff: (us, vs) => Math.max(0, Math.sin((TAU * us) / 4) * Math.sin((TAU * vs) / 4)) ** 0.7,
  cable: (us, vs) => Math.max(0, 1 - Math.abs(fract(us / 8) - 0.5 - 0.22 * Math.sin((TAU * vs) / 6)) * 5),
  lace: () => 0,
};

// Crochet's plain base is bumpier than knit's smooth rows (spec §2, proposed).
const crochetBase = (us, vs) => 0.35 * (0.5 + 0.5 * Math.sin(TAU * us) * Math.sin(TAU * vs));

// Segments per stitch each relief needs to show at all. Plain needs none beyond the shape.
const DENSITY = { plain: 0, rib: 2, garter: 1, seed: 2, waffle: 1.5, puff: 1.5, cable: 2, lace: 2 };

/** A lace hole every three stitches, offset on alternate courses (spec §2: cut, not alpha-tested). */
const laceHole = (us, vs) => {
  const row = Math.floor(vs / 3);
  const a = fract(us / 3 + (row % 2) * 0.5) - 0.5, b = fract(vs / 3) - 0.5;
  return a * a + b * b < 0.04;
};

// Stitches across one repeat of each stitch and colourwork (RELIEF, COLOURWORK, laceHole). Marled
// is a speckle with no repeat; its seam column may differ, which a speckle hides.
const U_REPEAT = { rib: 4, seed: 2, waffle: 2, puff: 4, cable: 8, lace: 3, checks: 8, motif: 6, 'fair isle': 6 };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const castOn = (stitches, repeat) => Math.max(1, Math.round(stitches / repeat)) * repeat;

function relieve(geo, f, reps, seam) {
  const h = f.stitch === 'plain' && f.craft === 'crochet' ? crochetBase : RELIEF[f.stitch] ?? RELIEF.plain;
  if (h === RELIEF.plain) return;
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  const amp = f.thick * LOOK.relief;
  for (let i = 0; i < p.count; i++) {
    const d = amp * h(uv.getX(i) * reps[0], uv.getY(i) * reps[1]);
    p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  }
  normals(geo, seam);   // re-weld the seam: a bare computeVertexNormals creases it again
}

// ---------------------------------------------------------------- colourwork (spec §2, §3)

const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

// Colour index at stitch coordinates. `n` is how many colours the yarn gave.
const COLOURWORK = {
  solid: () => 0,
  stripes: (us, vs, n) => Math.floor(vs / 4) % n,
  checks: (us, vs) => (Math.floor(us / 4) + Math.floor(vs / 4)) % 2,
  'colour-block': (us, vs, n, v) => (v < 0.33 ? 1 : v > 0.82 && n > 2 ? 2 : 0),
  motif: (us, vs, n, v) => (v > 0.35 && v < 0.65 && Math.hypot(fract(us / 6) - 0.5, fract(vs / 6) - 0.5) < 0.25 ? 1 : 0),
  'fair isle': (us, vs, n) => {
    const band = Math.floor(vs / 8);
    const diamond = Math.abs(fract(us / 6) - 0.5) + Math.abs(fract(vs / 8) - 0.5) < 0.3;
    return diamond ? 1 + (band % Math.max(1, n - 1)) : 0;
  },
  marled: (us, vs) => (hash(us, vs) < 0.5 ? 0 : 1),
};

/** How many colour slots a colourwork fills; any colour past that goes to the trim (spec §3). */
const SLOTS_USED = { solid: 1, checks: 2, 'colour-block': 3, motif: 2, marled: 2, stripes: 9, 'fair isle': 9 };

const trimColour = (f) => {
  const used = Math.min(SLOTS_USED[f.colourwork] ?? 1, f.colours.length);
  return f.colours[used < f.colours.length ? used : Math.min(1, f.colours.length - 1)];
};

function paint(geo, f, reps) {
  const uv = geo.attributes.uv, count = uv.count;
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

/** The yarn-look hatching reads `aHatchScale` as rows along v, so fine stitches follow the gauge. */
function hatchRows(geo, rows) {
  geo.setAttribute('aHatchScale', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(rows), 1));
}

function flatColour(geo, colour, rows = 40) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colour.toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  hatchRows(geo, rows);
  return geo;
}

// ---------------------------------------------------------------- a panel: sheet + relief + paint

/**
 * One knitted piece. `fn` is the shape; everything else -- how many stitches it has, how finely it
 * must be tessellated to show them, the holes, the bumps, the colours -- follows from its real size
 * and the fabric, identically for every piece of every garment.
 */
function panel(fn, f, { closedU = false, mask = null, from = null, minU = 24, minV = 12 } = {}) {
  const [lu, lv] = spans(fn);
  const reps = [lu / f.stitchW, lv / f.rowH];
  // In the round, cast on a whole number of pattern repeats, as a knitter does: otherwise the
  // stitch and colour patterns jump where the sheet meets itself, and relief opens a seam there.
  if (closedU) reps[0] = castOn(reps[0], lcm(U_REPEAT[f.stitch] ?? 1, U_REPEAT[f.colourwork] ?? 1));
  const dense = DENSITY[f.stitch] ?? 0;
  const segU = Math.min(256, Math.max(minU, Math.ceil(reps[0] * dense)));
  const segV = Math.min(192, Math.max(minV, Math.ceil(reps[1] * dense * 0.8)));
  const lace = f.stitch === 'lace' ? (u, v) => laceHole(u * reps[0], v * reps[1]) : null;
  const holes = lace && mask ? (u, v) => mask(u, v) || lace(u, v) : lace ?? mask;
  const geo = sheet(fn, segU, segV, { closedU, mask: holes, from });
  relieve(geo, f, reps, { closedU, cols: segU + 1, rows: segV + 1 });
  paint(geo, f, reps);
  return geo;
}

const piece = (joint, geo) => ({ joint, geo });

// ---------------------------------------------------------------- edges (spec §2)

/** A boundary of a panel, sampled: the points an edge treatment runs along. */
function ring(fn, v, samples = 48, { closed = true, u0 = 0, u1 = 1 } = {}) {
  const pts = [];
  const n = closed ? samples : samples + 1;
  for (let i = 0; i < n; i++) pts.push(fn(u0 + ((u1 - u0) * i) / samples, v, new THREE.Vector3()));
  return { pts, closed };
}

function tubeAlong({ pts, closed }, radius, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  return new THREE.TubeGeometry(curve, Math.max(16, pts.length * 2), radius, radial, closed);
}

function beads({ pts, closed }, spacing, make) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const count = Math.max(3, Math.floor(curve.getLength() / spacing));
  const geos = [];
  for (let i = 0; i < count; i++) geos.push(make(curve.getPointAt(closed ? i / count : i / (count - 1))));
  return geos;
}

const at = (geo, p, s) => geo.scale(...s).translate(p.x, p.y, p.z);

const EDGE = {
  none: () => [],
  rolled: (r, f) => [tubeAlong(r, f.thick * 0.6)],
  ribbed: (r, f) => {
    const g = tubeAlong(r, f.thick * 0.45, 10);
    const len = new THREE.CatmullRomCurve3(r.pts, r.closed).getLength();
    const ribs = len / (f.stitchW * 2);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const d = f.thick * 0.15 * Math.cos(TAU * uv.getX(i) * ribs);
      p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
    }
    g.computeVertexNormals();
    return [g];
  },
  // Stiff fibre fringe stands a little proud; fluid fibre hangs straight (drape, spec §3).
  fringed: (r, f) => beads(r, f.stitchW * 2.5, (p) => {
    const len = f.thick * 7 * (0.6 + 0.4 * f.drape);
    return new THREE.CylinderGeometry(f.thick * 0.35, f.thick * 0.25, len, 5).translate(p.x, p.y - len / 2, p.z);
  }),
  picot: (r, f) => beads(r, f.thick * 2.6, (p) => at(new THREE.SphereGeometry(1, 6, 4), p, [f.thick * 0.45, f.thick * 0.45, f.thick * 0.45])),
  scalloped: (r, f) => beads(r, f.thick * 2.4, (p) => at(new THREE.SphereGeometry(1, 8, 5), p.clone().setY(p.y - f.thick * 0.5), [f.thick, f.thick * 0.55, f.thick])),
};

function edgePieces(joint, rings, f) {
  const trim = trimColour(f);
  return rings.flatMap((r) => EDGE[f.edge]?.(r, f) ?? []).map((g) => piece(joint, flatColour(g, trim)));
}

// ---------------------------------------------------------------- accessories (spec §2)

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

/**
 * Accessories at the anchors a builder offers for that kind. An anchor is { joint, p, n, size }: a
 * point, the surface normal there (a flower and a button face along it) and a size in world units.
 */
function accessoryPieces(anchors, f) {
  const make = ACCESSORY[f.accessory];
  const list = anchors?.[f.accessory];
  if (!make || !list) return [];
  const colour = trimColour(f);
  return list.flatMap(({ joint, p, n, size }) => make(size).map((g) => {
    if (n && f.accessory !== 'pom-pom' && f.accessory !== 'tassel') g.applyQuaternion(_q.setFromUnitVectors(_z, n));
    return piece(joint, flatColour(g.translate(p.x, p.y, p.z), colour));
  }));
}

// ---------------------------------------------------------------- shared geometry helpers
/** A knot: a squashed ball of the trim colour where two ends are tied. */
const knot = (joint, p, size, f) =>
  piece(joint, flatColour(at(new THREE.SphereGeometry(1, 10, 8), p, [size * 1.1, size, size]), trimColour(f)));


/** A point on an axis-aligned ellipsoid at polar angle phi (0 = top) and azimuth theta (0 = +z, front). */
const onEllipsoid = (r, phi, theta, out) =>
  out.set(r[0] * Math.sin(phi) * Math.sin(theta), r[1] * Math.cos(phi), r[2] * Math.sin(phi) * Math.cos(theta));

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** A strip of width `w` along a polyline, flat in its own plane: scarf ends, straps, ties. */
function strip(path, w, f, { taper = 0, from = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(path);
  const side = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Vector3();
  const fn = (u, v, out) => {
    curve.getPointAt(v, c);
    curve.getTangentAt(v, t);
    side.set(t.z, 0, -t.x);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    return out.copy(c).addScaledVector(side, (u - 0.5) * w * (1 - taper * v));
  };
  return panel(fn, f, { minU: 4, minV: 24, from });
}

/** A tube around a vertical axis in a joint's frame: sleeves, socks, legwarmers. */
function tube(yTop, yBot, radiusAt, f, { bunch = 0 } = {}) {
  const fn = (u, v, out) => {
    const y = lerp(yTop, yBot, v);
    const r = radiusAt(v) * (1 + bunch * Math.abs(Math.sin(v * Math.PI * 5)));
    return out.set(r * Math.sin(u * TAU), y, r * Math.cos(u * TAU));
  };
  return { fn, geo: panel(fn, f, { closedU: true, from: (p) => p.set(0, p.y, 0) }) };
}

// ---------------------------------------------------------------- HAT (spec §1)

// Profiles on the unit head: [r, y] at v, v = 0 crown .. 1 brim. `seat` is the ring that grips the
// head -- a beret's band, not its flared crown -- and is what fit rests on.
const dome = (top, low) => (v) => {
  const a = lerp(0, Math.acos(clamp(low / top, -1, 1)), v);
  return [Math.sin(a) * 1.04, Math.cos(a) * top];
};

// Hats are worn pushed back off the brow, crown towards the nape. A beret sets its own (0): it
// sits flat and leans sideways instead.
const HAT_PITCH = THREE.MathUtils.degToRad(35);

/**
 * A slouch is a bag, not a dome: twice the head's height of fabric, fuller than the head above the
 * band, with a rounded end. `flop` folds it back over the crown so the end hangs down behind.
 */
function slouchBag(v) {
  const t = 1 - v;                                             // 0 at the band .. 1 at the end
  const band = Math.sqrt(1 - 0.25 * 0.25) * 1.04;              // the seat ring, as hatSeat has it
  const full = lerp(band, 1.35, clamp(t / 0.35, 0, 1) ** 0.7);
  const end = t > 0.45 ? Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2)) : 1;
  return [full * end, 0.25 + t * 1.5];
}

const HAT = {
  beanie: { profile: dome(1.06, 0.25), seat: 0.25, size: 0.9 },   // size: what reads as fitted at fit 1
  slouch: { profile: slouchBag, seat: 0.25, size: 0.9, flop: { hinge: 0.9, back: 1.0, angle: 2.7 }, soft: 1.2 },
  fisherman: { profile: dome(1.08, 0.25), seat: 0.25, earsOut: true },
  beret: { seat: 0.44, tilt: 0.3, pitch: 0, soft: 1.6, profile: (v) => (v < 0.55
    ? [lerp(0, 1.4, v / 0.55), lerp(1.18, 1.0, v / 0.55)]
    : [lerp(1.4, 0.92, (v - 0.55) / 0.45), lerp(1.0, 0.44, (v - 0.55) / 0.45)]) },
  earflap: { profile: dome(1.06, 0.3), seat: 0.3, flaps: true },
  hood: { profile: dome(1.1, -0.95), seat: 0.44, face: true },
  headband: { seat: 0.45, soft: 0.3, open: true, profile: (v) => { const y = lerp(0.79, 0.11, v); return [Math.sqrt(1 - y * y) * 1.05, y]; } },
  bucket: { seat: 0.35, soft: 0.5, profile: (v) => (v < 0.75 ? dome(1.05, 0.35)(v / 0.75) : [lerp(0.99, 1.45, (v - 0.75) / 0.25), lerp(0.35, 0.08, (v - 0.75) / 0.25)]) },
  cloche: { seat: 0.1, profile: (v) => (v < 0.85 ? dome(1.05, 0.0)(v / 0.85) : [lerp(1.04, 1.18, (v - 0.85) / 0.15), lerp(0.0, -0.1, (v - 0.85) / 0.15)]) },
  pixie: { seat: 0.3, bend: 1.2, tip: true, profile: (v) => {
    const y = lerp(2.3, 0.3, v);
    return [Math.sqrt(clamp(1 - 0.3 * 0.3, 0, 1)) * 1.04 * (1 - (1 - v) ** 1.6), y];
  } },
};

/**
 * Where a hat of fit `s` comes to rest. Its seat ring rests where the head is as wide as the ring:
 * too small perches higher, too big drops, and past the widest point it has nothing to grip and
 * slips to one side (spec: "a hat so big it slips to the side").
 */
function hatSeat(spec, s) {
  const ringR = Math.sqrt(Math.max(0, 1 - spec.seat * spec.seat)) * 1.04;
  const want = s * ringR;
  const restY = want < 1 ? Math.sqrt(1 - want * want) : 0;
  const slip = clamp((want - 1) * 4, 0, 1);
  return { dy: restY - s * spec.seat - slip * 0.35, tilt: slip * 0.55 + (spec.tilt ?? 0), dx: slip * 0.25,
    pitch: spec.pitch ?? HAT_PITCH };
}


/** A seated hat's lean: pitched back about the head's centre, then slipped to the side. */
const hatRotation = (seat) => new THREE.Matrix4().makeRotationZ(-seat.tilt).multiply(new THREE.Matrix4().makeRotationX(-seat.pitch));

/**
 * Knit has no stiffness: nothing it makes is a clean surface of revolution. On the unit head, the
 * fabric above the seat slumps back and down under its own weight -- more in fluid fibre, more the
 * more fabric there is above the seat -- and the circumference wobbles in two or three soft lobes.
 * The seat itself grips the head, so both fade out towards it. `soft` scales both per silhouette.
 * ponytail: fixed lobe phases, so every beanie slumps the same way; seed them per item for variety.
 */
function slump(spec, f, v, py, th) {
  const soft = spec.soft ?? 1;
  const free = (1 - v) ** 1.5;
  const sag = soft * (0.35 + f.drape) * 0.12 * free * Math.max(0, py);
  const wobble = 1 + soft * 0.035 * (0.3 + free) * (Math.sin(2 * th + 0.7) * 0.6 + Math.sin(3 * th + 2.1) * 0.4);
  return { sag, wobble };
}

/**
 * A hat rests ON the head: whatever the profile, slump, seat or flap does, no point may sink past
 * the skull `r` scaled by `lift` (one fabric thickness). Pushed straight out from the skull centre.
 */
function outsideSkull(p, r, lift) {
  const len = Math.hypot(p.x / r[0], p.y / r[1], p.z / r[2]);
  return len < lift ? p.multiplyScalar(lift / Math.max(len, 1e-6)) : p;
}

/**
 * Folds everything above the hinge back, about a side-to-side axis at the hinge height and at the
 * BACK of the bag (`back`, on the unit head): the fold deepens towards the end, so the end hangs
 * down behind (angle ~155 degrees). Hinged at the head's centreline instead, the end swung down
 * into the back of the skull.
 */
function flop(p, { hinge: h, back, angle }, k, dy, v) {
  const hinge = h * k + dy, pivot = -back * k;
  const dh = p.y - hinge;
  if (dh <= 0) return;
  const a = angle * (1 - v);
  // Knit has no body: as it folds, the bag collapses flat against its own back instead of
  // staying a tube, whose front would swing a whole bag-width out behind the head.
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
    const bent = spec.bend ? Math.max(0, py - 0.8) ** 2 * spec.bend : 0;
    const { sag, wobble } = slump(spec, f, v, py, th);
    const w = pr * wobble * s * lift;
    out.set(w * Math.sin(th), (py - sag * 0.6) * s * lift + seat.dy, w * Math.cos(th) - bent - sag);
    if (spec.flop) flop(out, spec.flop, s * lift, seat.dy, v);
    out.applyMatrix4(rot);
    out.x += seat.dx;
    return outsideSkull(out.set(out.x * r[0], out.y * r[1], out.z * r[2]), r, lift);
  };
}

function buildHat(fit, f) {
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const head = fit.joints.head;
  // The skull, not the head's box: the box holds the lion's mane and the owl's feather shell, and a
  // hat sized to those sits on them like a lampshade. Mane and feathers clip instead (spec §3).
  const r = fit.skull;
  const s = f.fit * (spec.size ?? 1);
  const fn = hatShape(spec, r, s, f);
  // A hood's sheet runs round from one side of the face to the other, so its edge IS the opening's
  // rounded arch -- where masking quads out of a closed sheet cut a stair-stepped rectangle.
  const body = spec.face ? (u, v, out) => { const h = faceHalf(v); return fn((h + u * (TAU - 2 * h)) / TAU, v, out); } : fn;
  const pieces = [piece(head, panel(body, f, { closedU: !spec.face, from: (p) => p.set(0, 0, 0) }))];
  if (spec.flaps) pieces.push(...earflaps(fn, head, f, r, 1 + f.thick / r[1]));
  pieces.push(...edgePieces(head, [ring(body, 1, 48, { closed: !spec.face })], f));
  return [...pieces, ...accessoryPieces(hatAnchors(fn, head, Math.max(f.thick * 3.5, r[1] * 0.28) * s, f), f)];
}

function hatAnchors(fn, head, size, f) {
  const top = fn(0, 0, new THREE.Vector3());
  const side = fn(0.25, 0.6, new THREE.Vector3());
  return {
    'pom-pom': [{ joint: head, p: top.clone().addScaledVector(top.clone().normalize(), size), size }],
    tassel: [{ joint: head, p: top, size: size * 0.8 }],
    flower: [{ joint: head, p: side, n: side.clone().normalize(), size: size * 0.7 }],
    buttons: [{ joint: head, p: side, n: side.clone().normalize(), size: f.thick * 1.6 }],
  };
}

function earflaps(fn, head, f, r, lift) {
  return [-1, 1].map((side) => {
    const u0 = side < 0 ? 0.75 : 0.25;
    const base = fn(u0, 1, new THREE.Vector3());
    const out = new THREE.Vector3();
    // Hangs from the brim itself, wherever the hat's tilt has put it, straight down under gravity.
    // A padded tab, not a sheet: u runs round its cross-section, a flat oval that stands out from
    // the head by up to two fabric thicknesses and pinches shut along both edges, the top one against
    // the brim -- open there, a big flap read as an ice-cream cone.
    const flap = (u, v, p) => {
      const a = u * TAU;
      fn(u0 + Math.cos(a) * 0.06 * (1 - v * 0.6), 1, p);
      p.y -= v * base.length() * 0.7;
      const puff = f.thick * 1.5 * Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 4));   // 0 at both ends: closed
      p.addScaledVector(out.set(p.x, 0, p.z).normalize(), puff * (1 + Math.sin(a)));
      return outsideSkull(p, r, lift);
    };
    return piece(head, panel(flap, f, { closedU: true, minU: 16, minV: 8, from: (p) => p.set(base.x, p.y, base.z) }));
  });
}

// ---------------------------------------------------------------- what a hat covers

/**
 * The hat as a volume in the head's space: its profile turned about the head, in the same frame
 * hatShape builds in. Slump, wobble and bends are left out, so `press` works to an INNER volume a
 * margin inside it.
 * ponytail: a very drapey crown slumps past that margin at the front and can bare a pressed tip;
 * fold slump() into the profile here if it shows.
 */
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
    /** A head-space point the hat hides: inside it, and not in a hood's face opening. */
    under: (q) => inside(toProfile(q, p), 1),
    press: hatPress(toProfile, (pt) => inside(pt, 0.9), byOpening),
  };
}

/**
 * A head-space point that shows through the hat is pulled in, towards the head's centre, to just
 * inside it; returns false if it was clear. "Shows through" is: the line from the head's centre
 * out to it passes through the hat and leaves by the fabric -- not by an opening (a hood's face, a
 * headband's open top) -- so a tiny perched hat only presses what is under it.
 */
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

// A hood's face opening: an arch from the brow (v 0.42) down to the hem, round at the top and as
// wide as +-64 degrees about the front at the hem.
const FACE_BROW = 0.42, FACE_HALF = Math.acos(0.45);
function faceHalf(v) {
  const t = (v - FACE_BROW) / (1 - FACE_BROW);
  return t <= 0 ? 0 : FACE_HALF * Math.sqrt(Math.max(0, 2 * t - t * t));
}

/** A hat's profile read back as a solid: its crown height, its radius at a height, its face opening. */
function hatProfile(spec) {
  const prof = Array.from({ length: 65 }, (_, i) => spec.profile(i / 64));   // crown .. brim, y falling
  const sample = (y) => {                                                      // [r, v] at height y
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

/**
 * Whatever the head carries that the hat should cover (spec §3: fit is measured, never per
 * species). Eyes and ears are joints: under the hat, not drawn at all -- fewer draws, not more.
 * A coat over the skull -- the lion's mane, the owl's feather shell -- is one mesh that cannot be
 * dropped whole, so its points are pressed under the hat, once, at dressing time: the head and
 * hat never move relative to each other, so nothing runs per frame. Each pressed mesh gets its own
 * copy of the geometry (rigs share primitives), undone by undress.
 *
 * Only coats: a coat is what goes over the crown. The face -- snout, beak, nose -- sits under a
 * bucket's brim, which the profile reads as solid, and pressing it put the face inside the skull.
 */
function coverUnderHat(built, f) {
  const fit = bodyFit(built);
  const cover = hatCover(fit, f);
  const head = built.joints.head, skull = skullMesh(head);
  const q = new THREE.Vector3();
  // Ears are worn up through an open-top hat (a headband), and out of a fisherman's hat: only eyes go under.
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const parts = spec.open || spec.earsOut ? built.joints.eye : [...built.joints.eye, ...built.joints.ear];
  for (const { node } of parts) {
    if (!node.visible || !cover.under(head.worldToLocal(node.getWorldPosition(q)))) continue;
    node.visible = false;
    built.covered.push(() => { node.visible = true; });
  }
  for (const mesh of coats(head, skull, new THREE.Vector3(0, fit.skull[1] * 0.9, 0))) pressMesh(built, head, mesh, cover);
}

/** The meshes the head carries, bar the skull, whose bounds take in the crown. */
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
  let moved = false;
  for (let i = 0; i < pos.count; i++) {
    if (!cover.press(q.fromBufferAttribute(pos, i).applyMatrix4(toHead))) continue;
    q.applyMatrix4(toMesh);
    pos.setXYZ(i, q.x, q.y, q.z);
    moved = true;
  }
  if (!moved) { geo.dispose(); return; }
  geo.computeVertexNormals();
  geo.computeBoundingBox();      // clone() copied the old bounds: culling and fit would read the unpressed mane
  geo.computeBoundingSphere();
  const original = mesh.geometry;
  mesh.geometry = geo;
  built.covered.push(() => { geo.dispose(); mesh.geometry = original; });
}

// ---------------------------------------------------------------- SCARF

/**
 * The loop's radius at height y in the neck's frame: clear of the neck, the torso top and the head,
 * whichever is widest there. That one rule is why the owl's scarf sits round its shoulders under
 * that big head and the llama's climbs a long neck: it is measured, not authored (spec §3, neck
 * length in species fit).
 */
function loopRadius(fit, y, pad) {
  const { torso, neck } = fit;
  const sk = fit.skull;
  const chestY = y + neck.y;
  const onTorso = chestY < torso[1] ? Math.max(torso[0], torso[2]) * Math.sqrt(Math.max(0, 1 - (chestY / torso[1]) ** 2)) : 0;
  const hy = (y - neck.headY) / sk[1];
  const onHead = Math.abs(hy) < 1 ? Math.max(sk[0], sk[2]) * Math.sqrt(1 - hy * hy) : 0;
  return Math.max(neck.r, onTorso, onHead) + pad;
}

/** The visible band of neck a scarf can wrap: from just into the torso top up to under the chin. */
function neckBand(fit, girth) {
  const lo = fit.neck.overlap * 0.4;
  const chin = fit.neck.headY - fit.skull[1] * 0.8;
  return [lo, Math.max(lo + girth * 2.2, chin)];
}

function scarfLoop(fit, f, { wraps, girth, sag = 0, loose = 1 }) {
  const [lo, hi] = neckBand(fit, girth);
  const top = wraps > 1 ? hi : lerp(lo, hi, 0.35);
  const fn = (u, v, out) => {
    const th = v * TAU * wraps;
    const yc = lerp(lo, top, wraps > 1 ? v : 0.5) - sag * (0.5 + 0.5 * Math.cos(th)) * girth * 3;
    const R = loopRadius(fit, yc, girth) * loose;
    const a = u * TAU;
    const rr = R + girth * Math.cos(a);
    return out.set(rr * Math.sin(th), yc + girth * 1.3 * Math.sin(a), rr * Math.cos(th));
  };
  return { fn, geo: panel(fn, f, { minU: 10, minV: 48, from: (p) => p.set(0, p.y, 0) }), front: fn(0, 0, new THREE.Vector3()) };
}

/**
 * A hanging end, in the CHEST frame: down the torso front, then on down to the floor and along it.
 * An end longer than the drop simply trails -- that is the "so long it trails on the ground" of the
 * spec, reached by length rather than by a special case. Stiff fibre stands off the body more.
 */
/** How far in front of (or behind) the torso an end hangs at chest height y. */
function endDepth(fit, f, back) {
  const { torso } = fit;
  const standoff = f.thick * 2 + (1 - f.drape) * 0.03;
  return (y) => {
    const k = y > -torso[1] ? Math.sqrt(Math.max(0, 1 - (y / torso[1]) ** 2)) : 0;
    return (back ? -1 : 1) * (torso[2] * k + standoff);
  };
}

function endPath(fit, f, x, length, { back = false } = {}) {
  const { torso, neck } = fit;
  const zAt = endDepth(fit, f, back);
  const pts = [];
  let y = Math.min(neck.y, torso[1] * 0.9), left = length;
  const step = length / 24;
  const floor = fit.floor + f.thick;
  pts.push(new THREE.Vector3(x, y, zAt(y)));
  for (let i = 0; i < 24 && left > 0; i++, left -= step) {
    if (y - step > floor) y -= step;
    const last = pts.at(-1);
    pts.push(y - step > floor || last.y > floor + 1e-4
      ? new THREE.Vector3(x * (1 + (1 - f.drape) * 0.2), Math.max(y, floor), zAt(y))
      : last.clone().add(new THREE.Vector3(0, 0, back ? -step : step)));
  }
  return pts.length > 1 ? pts : [pts[0], pts[0].clone().setY(pts[0].y - 0.01)];
}

const SCARF = {
  cowl: { cowl: true },
  infinity: { wraps: 2, loose: 1.25, sag: 1 },
  ascot: { ends: [0.5, 0.45], cross: true },
  long: { ends: [1.6, 1.3] },
  trailing: { ends: [9, 8.6] },
  skinny: { ends: [1.9, 1.7], width: 0.55, tube: 0.55, back: true },
  kerchief: { kerchief: true },
  'chunky wrap': { ends: [1.3, 1.1], width: 1.5, tube: 1.8, edge: 'fringed' },
};

const FORM_WRAPS = { draped: 1, 'wrapped once': 1, 'wrapped twice': 2, tied: 1, tucked: 1 };

function buildScarf(fit, f) {
  const spec = SCARF[f.silhouette] ?? SCARF.long;
  const { neck, chest } = fit.joints;
  const girth = f.thick * 1.6 * (spec.tube ?? 1);
  if (spec.cowl) return cowl(fit, f, neck, girth);
  const loop = scarfLoop(fit, f, {
    wraps: spec.wraps ?? FORM_WRAPS[f.form] ?? 1, girth,
    sag: spec.sag ?? (f.form === 'draped' ? 1 : 0), loose: (spec.loose ?? 1) * (f.fit > 1 ? 1 + (f.fit - 1) * 0.4 : 1),
  });
  const pieces = [piece(neck, loop.geo)];
  if (spec.kerchief) pieces.push(kerchief(fit, f, chest, f.fit));
  const ends = scarfEnds(fit, f, spec, f.fit, chest);
  pieces.push(...ends.pieces, ...edgePieces(chest, ends.tips, spec.edge && f.edge === 'none' ? { ...f, edge: spec.edge } : f));
  if (f.form === 'tied') pieces.push(knot(neck, loop.front, girth * 1.5, f));
  return [...pieces, ...accessoryPieces(ends.anchors, f)];
}


function scarfEnds(fit, f, spec, s, chest) {
  const lens = spec.ends ?? [];
  const width = (spec.width ?? 1) * Math.max(0.05, fit.torso[0] * 0.38);
  const tuck = f.form === 'tucked' ? 0.35 : 1;
  const out = { pieces: [], tips: [], anchors: { tassel: [], 'pom-pom': [], flower: [], buttons: [] } };
  lens.forEach((k, i) => {
    const x = (i ? -1 : 1) * fit.torso[0] * (spec.cross ? 0.05 : 0.28);
    const path = endPath(fit, f, x, k * fit.torso[1] * s * tuck, { back: spec.back && i === 1 });
    out.pieces.push(piece(chest, strip(path, width, f, { from: (p) => p.set(0, p.y, 0) })));
    const tip = path.at(-1);
    out.tips.push({ pts: [tip.clone().setX(tip.x - width / 2), tip, tip.clone().setX(tip.x + width / 2)], closed: false });
    out.anchors.tassel.push({ joint: chest, p: tip, size: width * 0.35 });
    out.anchors['pom-pom'].push({ joint: chest, p: tip, size: width * 0.3 });
  });
  if (out.pieces.length) midAnchors(fit, f, chest, width, out.anchors);
  return out;
}

function midAnchors(fit, f, chest, width, anchors) {
  const mid = endPath(fit, f, 0, fit.torso[1] * 0.5)[3];
  anchors.flower.push({ joint: chest, p: mid, n: new THREE.Vector3(0, 0, 1), size: width * 0.4 });
  anchors.buttons.push({ joint: chest, p: mid, n: new THREE.Vector3(0, 0, 1), size: f.thick * 1.6 });
}

/** A cowl is a band, not a loop: it covers as much of the neck as there is, tallest on a llama. */
function cowl(fit, f, neck, girth) {
  const [lo, hi] = neckBand(fit, girth);
  const top = lerp(lo, hi, clamp(f.fit, 0.4, 1.2));
  const fn = (u, v, out) => {
    const y = lerp(lo, top, v);
    const R = loopRadius(fit, y, f.thick * 1.2) * (1 + 0.12 * Math.sin(v * Math.PI)) * (f.fit > 1 ? 1 + (f.fit - 1) * 0.5 : 1);
    return out.set(R * Math.sin(u * TAU), y, R * Math.cos(u * TAU));
  };
  const geo = panel(fn, f, { closedU: true, from: (p) => p.set(0, p.y, 0) });
  const side = fn(0, 0.5, new THREE.Vector3());
  const anchors = { flower: [{ joint: neck, p: side, n: new THREE.Vector3(0, 0, 1), size: girth * 1.4 }],
    buttons: [0.3, 0.7].map((v) => ({ joint: neck, p: fn(0.02, v, new THREE.Vector3()), n: new THREE.Vector3(0, 0, 1), size: f.thick * 1.4 })) };
  return [piece(neck, geo), ...edgePieces(neck, [ring(fn, 1), ring(fn, 0)], f), ...accessoryPieces(anchors, f)];
}

function kerchief(fit, f, chest, s) {
  const { torso, neck } = fit;
  const y0 = Math.min(neck.y, torso[1] * 0.85);
  const fn = (u, v, out) => {
    const y = y0 - v * torso[1] * 0.9 * s;
    const k = Math.sqrt(Math.max(0.05, 1 - (y / torso[1]) ** 2));
    const x = (u - 0.5) * torso[0] * 1.3 * (1 - v);
    return out.set(x, y, torso[2] * k + f.thick * 2);
  };
  return piece(chest, panel(fn, f, { minU: 12, minV: 12, from: (p) => p.set(0, p.y, 0) }));
}

// ---------------------------------------------------------------- SHAWL

// Outlines: how far down (as extra polar angle past the shoulder line) the shawl reaches at azimuth
// theta, 0 = front, PI = back. `open` is the half-angle of the front opening.
const back = (th) => Math.max(0, -Math.cos(th));
const SHAWL = {
  triangle: { depth: (th) => 0.55 * back(th) ** 1.5 + 0.04, open: 0.35 },
  'half circle': { depth: (th) => 0.35 * back(th) ** 0.5 + 0.03, open: 0.3 },
  'rectangular wrap': { depth: () => 0.22, open: 0.45, ends: true },
  crescent: { depth: (th) => 0.28 * back(th) + 0.02, open: 0.6 },
  capelet: { depth: () => 0.16, open: 0, button: true },
  shrug: { depth: (th) => (back(th) > 0 ? 0.07 : 0), open: Math.PI / 2, sleeves: true },
  'knotted triangle': { depth: (th) => 0.55 * back(th) ** 1.5 + 0.04, open: 0.35, knot: true },
};

const SHOULDER = 0.42 * Math.PI;   // polar angle where a shawl stops hugging and starts to hang

function shawlShape(fit, f, spec) {
  const { torso } = fit;
  const pad = f.thick * 1.6;
  const r = [Math.max(torso[0], fit.shoulderX * 0.95) + pad, torso[1] + pad, torso[2] + pad];
  const flare = (1 - f.drape) * 0.25 + (f.fit > 1 ? (f.fit - 1) * 0.3 : 0);
  const top = 0.17 * Math.PI;
  const p = new THREE.Vector3();
  return (u, v, out) => {
    const th = u * TAU;
    const reach = SHOULDER + spec.depth(th) * Math.PI * f.fit;
    const phi = lerp(top, reach, v);
    if (phi <= SHOULDER) return onEllipsoid(r, phi, th, out);
    onEllipsoid(r, SHOULDER, th, p);
    const hang = (phi - SHOULDER) * r[1] * 1.6;
    return out.set(p.x * (1 + flare * hang / r[1]), p.y - hang, p.z * (1 + flare * hang / r[1]));
  };
}

const shawlEnds = (fit, f, chest) => [-1, 1].map((sd) => piece(chest, strip(
  endPath(fit, f, sd * fit.torso[0] * 0.45, fit.torso[1] * 1.2 * f.fit), fit.torso[0] * 0.35, f,
  { from: (p) => p.set(0, p.y, 0) })));

function buildShawl(fit, f) {
  const spec = SHAWL[f.silhouette] ?? SHAWL.triangle;
  const chest = fit.joints.chest;
  const fn = shawlShape(fit, f, spec);
  const wrapped = f.form === 'wrapped once' || f.form === 'wrapped twice';
  const open = wrapped ? 0 : spec.open;
  const mask = open ? (u) => { const th = u * TAU; return Math.cos(th) > Math.cos(open); } : null;
  const pieces = [piece(chest, panel(fn, f, { closedU: true, mask, from: (p) => p.set(0, p.y * 0.3, 0) }))];
  pieces.push(...edgePieces(chest, [ring(fn, 1, 64, open ? { closed: false, u0: open / TAU, u1: 1 - open / TAU } : {})], f));
  const front = fn(0, 0.1, new THREE.Vector3());
  if (spec.knot || f.form === 'tied') pieces.push(knot(chest, front, f.thick * 2.6, f));
  if (spec.ends) pieces.push(...shawlEnds(fit, f, chest));
  if (spec.sleeves) pieces.push(...shrugSleeves(fit, f));
  const acc = spec.button && f.accessory === 'none' ? { ...f, accessory: 'buttons' } : f;
  return [...pieces, ...accessoryPieces(shawlAnchors(fn, chest, front, f), acc)];
}


function shawlAnchors(fn, chest, front, f) {
  const low = fn(0.5, 1, new THREE.Vector3());
  return {
    buttons: [{ joint: chest, p: front, n: new THREE.Vector3(0, 0, 1), size: f.thick * 1.8 }],
    flower: [{ joint: chest, p: fn(0.08, 0.3, new THREE.Vector3()), n: new THREE.Vector3(0, 0, 1), size: f.thick * 4 }],
    tassel: [{ joint: chest, p: low, size: f.thick * 5 }],
    'pom-pom': [{ joint: chest, p: low, size: f.thick * 4 }],
  };
}

function shrugSleeves(fit, f) {
  return fit.joints.upperArm.map(({ node }) => {
    const r = fit.arm.r + f.thick * 1.4;
    return piece(node, tube(r * 0.4, -fit.arm.upper * 0.55, () => r, f).geo);
  });
}

// ---------------------------------------------------------------- SWEATER

const SWEATER = {
  pullover: { hem: -0.85 },
  cardigan: { hem: -0.85, open: true },
  vest: { hem: -0.8, vneck: true, sleeves: 'none' },
  turtleneck: { hem: -0.85, collar: true },
  cropped: { hem: -0.25 },
  tunic: { hem: -1.4, flare: 0.12 },
  raglan: { hem: -0.85, yoke: true },
};

const HUG = 0.72 * Math.PI;   // below this polar angle the body is no longer followed: the hem hangs

/**
 * The body, on the torso's measured clearance (coat included). Fit moves the HEM -- too small shows
 * a midriff, too big goes down past the hips (and may clip the legs: allowed, spec §3) -- and a big
 * one also stands off the body.
 */
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
  const chest = fit.joints.chest;
  const fn = sweaterBody(fit, f, spec);
  const fw = spec.yoke && f.colourwork === 'solid' && f.colours.length > 1 ? { ...f, colourwork: 'colour-block' } : f;
  const pieces = [piece(chest, panel(fn, fw, { closedU: true, mask: sweaterMask(spec), from: (p) => p.set(0, p.y * 0.2, 0) }))];
  pieces.push(...edgePieces(chest, [ring(fn, 1, 64)], f));
  pieces.push(...sleeves(fit, f, spec.sleeves ?? f.sleeves));
  if (spec.collar) pieces.push(...cowl(fit, { ...f, fit: 1, accessory: 'none' }, fit.joints.neck, f.thick * 1.6));
  const line = [0.1, 0.3, 0.5, 0.7, 0.9].map((v) => fn(0, v * 0.8, new THREE.Vector3()));
  const anchors = {
    buttons: (spec.open ? line : line.slice(0, 2)).map((p) => ({ joint: chest, p, n: new THREE.Vector3(0, 0, 1), size: f.thick * 1.4 })),
    flower: [{ joint: chest, p: fn(0.06, 0.25, new THREE.Vector3()), n: new THREE.Vector3(0, 0, 1), size: f.thick * 4 }],
  };
  const acc = spec.open && f.accessory === 'none' ? { ...f, accessory: 'buttons' } : f;
  return [...pieces, ...accessoryPieces(anchors, acc)];
}

/**
 * Sleeves on the arm joints, sized to what the kit hung there -- the owl's wing included, so the
 * sleeve goes over the wing (spec §3). Fit sets length: a small sweater's sleeves stop short, a big
 * one's run down over the hands.
 */
function sleeves(fit, f, kind) {
  if (kind === 'none') return [];
  const s = f.fit;
  const loose = s > 1 ? 1 + (s - 1) * 0.5 : 1;
  const out = [];
  const upperR = (fit.arm.r + f.thick * 1.3) * loose;
  const upperLen = fit.arm.upper * (kind === 'short' ? 0.6 * s : 1);
  fit.joints.upperArm.forEach(({ node }, i) => {
    const t = tube(upperR * 0.5, -Math.min(upperLen, fit.arm.upper), () => upperR, f);
    out.push(piece(node, t.geo));
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

// ---------------------------------------------------------------- BAG

// Body size (w, h, d) as fractions of the torso, where it hangs, and how it is carried.
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

/** A rounded box, as a superellipsoid sheet: one parametric body for every bag. */
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

function bagPlace(fit, spec, dims) {
  const { torso } = fit;
  const out = new THREE.Vector3();
  if (spec.at === 'back') return out.set(0, -torso[1] * 0.05, -(torso[2] + dims[2] + 0.01));
  if (spec.at === 'front') return out.set(torso[0] * 0.35, -torso[1] * 0.7, torso[2] + dims[2] + 0.005);
  return out.set(torso[0] + dims[0] * 0.55, -torso[1] * 0.75, torso[2] * 0.15);
}

/** Strap paths in the chest frame. A cross strap runs from the bag over the far shoulder and back. */
function strapPaths(fit, spec, body, dims) {
  const { torso } = fit;
  const pad = 0.012;
  const R = [Math.max(torso[0], fit.shoulderX * 0.8) + pad, torso[1] + pad, torso[2] + pad];
  const top = body.clone().setY(body.y + dims[1] * 0.9);
  if (spec.strap === 'cross') return [crossStrap(R, top)];
  if (spec.strap === 'short') return [shortStrap(fit, R, top, dims)];
  return packStraps(R, top, body, dims);
}

/** A closed loop tilted from the bag's side over the far shoulder. */
function crossStrap(R, top) {
  const tilt = Math.atan2(top.x + R[0] * 0.7, R[1] * 1.3);
  const axis = new THREE.Vector3(0, 0, 1);
  return Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * TAU;
    return new THREE.Vector3(Math.sin(a) * R[0], Math.cos(a) * R[1] * 1.15, Math.sin(a + Math.PI / 2) * R[2])
      .applyAxisAngle(axis, -tilt);
  });
}

function shortStrap(fit, R, top, dims) {
  const sh = new THREE.Vector3(fit.shoulderX * 0.9, R[1] * 0.75, 0);
  return [top.clone().setZ(top.z + dims[2] * 0.6), sh.clone().setZ(R[2] * 0.4), sh.clone().setY(R[1] * 0.95),
    sh.clone().setZ(-R[2] * 0.4), top.clone().setZ(top.z - dims[2] * 0.6)];
}

function packStraps(R, top, body, dims) {
  return [-1, 1].map((sd) => {
    const x = sd * R[0] * 0.45;
    return [new THREE.Vector3(x, top.y, top.z + 0.005), new THREE.Vector3(x, R[1] * 0.95, -R[2] * 0.3),
      new THREE.Vector3(x, R[1] * 0.8, R[2] * 0.7), new THREE.Vector3(x * 1.3, 0, R[2] + 0.004),
      new THREE.Vector3(x * 1.6, body.y - dims[1] * 0.6, body.z + dims[2] * 0.4)];
  });
}

function buildBag(fit, f) {
  const spec = BAG[f.silhouette] ?? BAG['shoulder bag'];
  const chest = fit.joints.chest;
  // Width and depth from torso width, height from torso height; fit is the bag's size (3+ sizes).
  const dims = spec.size.map((k, i) => k * fit.torso[i === 1 ? 1 : 0] * 0.5 * f.fit);
  const centre = bagPlace(fit, spec, dims);
  const fn = bagBody(dims, spec.round ?? 0, centre);
  const netted = spec.net ? { ...f, stitch: 'lace', stitchW: f.stitchW * 2, rowH: f.rowH * 2 } : f;
  const pieces = [piece(chest, panel(fn, netted, { closedU: true, minU: 32, minV: 20, from: () => centre.clone() }))];
  const thin = spec.strap === 'cords' ? 0.4 : 1;
  pieces.push(...strapPaths(fit, spec, centre, dims).map((pts) => piece(chest, flatColour(
    tubeAlong({ pts, closed: spec.strap === 'cross' }, f.thick * 1.2 * thin, 6), trimColour(f)))));
  pieces.push(...edgePieces(chest, [ring(fn, 0.82)], f));
  return [...pieces, ...accessoryPieces(bagAnchors(fn, centre, chest, dims, f), f)];
}

function bagAnchors(fn, centre, chest, dims, f) {
  const face = fn(0, 0.45, new THREE.Vector3());
  const n = face.clone().sub(centre).normalize();
  return {
    buttons: [{ joint: chest, p: face, n, size: f.thick * 1.8 }],
    flower: [{ joint: chest, p: face, n, size: dims[0] * 0.4 }],
    tassel: [{ joint: chest, p: fn(0.1, 0.95, new THREE.Vector3()), size: dims[1] * 0.35 }],
    'pom-pom': [{ joint: chest, p: fn(0, 0.05, new THREE.Vector3()), size: dims[0] * 0.25 }],
  };
}

// ---------------------------------------------------------------- SOCKS

// How far up the shin each reaches (0 ankle .. 1 knee), whether it covers the foot, and extras.
const SOCKS = {
  ankle: { up: 0.2 },
  crew: { up: 0.5 },
  'knee-high': { up: 0.95 },
  'over-knee': { up: 1, thigh: 0.55 },
  slouch: { up: 0.9, bunch: 0.22 },
  'leg warmers': { up: 0.95, from: 0.12, noFoot: true, loose: 1.35 },
  'slipper socks': { up: 0.12, pom: true },
};

const FOOT = { pos: [0, 0.016, 0.038], r: [0.055, 0.028, 0.078] };

/** Shin radius at v (0 knee .. 1 ankle): GEO.taper narrows toward the foot by LIMB_TAPER. */
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
    pieces.push(...sockLeg(fit, f, spec, node, { up, loose, bunch }, anchors));
    if (spec.thigh) pieces.push(...thighSock(fit, f, fit.joints.upperLeg[i].node, spec.thigh * Math.min(1, s), loose));
  });
  const acc = spec.pom && f.accessory === 'none' ? { ...f, accessory: 'pom-pom' } : f;
  return [...pieces, ...accessoryPieces(anchors, acc)];
}

/** One leg's sock on its shin joint, adding that leg's accessory anchors to `anchors`. */
function sockLeg(fit, f, spec, node, { up, loose, bunch }, anchors) {
  const tib = fit.leg.tibia;
  const yTop = -tib * (1 - up), yBot = -tib * (1 - (spec.from ?? 0));
  const t = tube(yTop, yBot, (v) => (shinR(fit, lerp(yTop, yBot, v)) + f.thick * 1.2) * loose, f, { bunch });
  const cuff = t.fn(0, 0, new THREE.Vector3());
  anchors['pom-pom'].push({ joint: node, p: t.fn(0.5, 0.2, new THREE.Vector3()), size: f.thick * 2.5 });
  anchors.tassel.push({ joint: node, p: cuff, size: f.thick * 3 });
  anchors.flower.push({ joint: node, p: cuff, n: new THREE.Vector3(0, 0, 1), size: f.thick * 3 });
  anchors.buttons.push({ joint: node, p: t.fn(0.25, 0.3, new THREE.Vector3()), n: new THREE.Vector3(1, 0, 0), size: f.thick * 1.2 });
  const out = [piece(node, t.geo), ...edgePieces(node, [ring(t.fn, 0)], f)];
  if (!spec.noFoot) out.push(piece(node, sockFoot(fit, f, tib)));
  return out;
}

function sockFoot(fit, f, tib) {
  const c = new THREE.Vector3(FOOT.pos[0], -tib + FOOT.pos[1], FOOT.pos[2]);
  const r = FOOT.r.map((x) => x + f.thick * 1.1);
  const fn = bagBody(r, 1, c);
  return panel(fn, f, { closedU: true, minU: 24, minV: 12, from: () => c.clone() });
}

function thighSock(fit, f, node, reach, loose) {
  const len = fit.leg.femur;
  const t = tube(-len * (1 - reach), -len - 0.001, () => (fit.leg.thighR + f.thick * 1.2) * loose, f);
  return [piece(node, t.geo), ...edgePieces(node, [ring(t.fn, 0)], f)];
}

// ---------------------------------------------------------------- dressing

const BUILDERS = { hat: buildHat, scarf: buildScarf, shawl: buildShawl, sweater: buildSweater, bag: buildBag, socks: buildSocks };

let material = null;

/**
 * THE garment material, shared by every garment on every character: knit sheen (npc.js
 * knitMaterial), colour from the vertices, the yarn's strand hatching (inventory/yarn-look.js) at a
 * per-vertex row count, and a rim on garments only -- the rim is what separates a tone-on-tone
 * garment from the fur now that colour is never nudged (spec §2).
 */
export function garmentMaterial() {
  if (material) return material;
  material = knitMaterial('#ffffff');
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
  };
  material.customProgramCacheKey = () => 'garment-knit-hatch-rim';
  return material;
}

/** A Fresnel rim, added to the lit colour: light where the surface turns away from the camera. */
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

/** Everything one outfit puts on this character, as { joint, geo } pieces. */
export function outfitPieces(built, outfit) {
  const fit = bodyFit(built);
  return Object.entries(outfit)
    .filter(([type, item]) => item?.on && BUILDERS[type])
    .flatMap(([type, item]) => BUILDERS[type](fit, fabric(item)));
}

/**
 * Put an outfit on a built character, replacing whatever it wore. One mesh per joint, whatever is
 * worn there (rule 3 at the top). Returns the meshes, which are also kept on `built.garments`.
 */
export function dress(built, outfit) {
  undress(built);
  if (outfit.hat?.on) coverUnderHat(built, fabric(outfit.hat));
  const byJoint = new Map();
  for (const { joint, geo } of outfitPieces(built, outfit)) {
    if (!byJoint.has(joint)) byJoint.set(joint, []);
    byJoint.get(joint).push(geo);
  }
  built.garments = [...byJoint].map(([joint, geos]) => {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos.map(strip4), false);
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, garmentMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.garment = true;
    joint.add(mesh);
    return mesh;
  });
  return built.garments;
}

// mergeGeometries needs every part to carry exactly the same attributes.
const KEEP = new Set(['position', 'normal', 'uv', 'color', 'aHatchScale']);
function strip4(geo) {
  for (const name of Object.keys(geo.attributes)) if (!KEEP.has(name)) geo.deleteAttribute(name);
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  return geo;
}

export function undress(built) {
  for (const mesh of built.garments ?? []) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  built.garments = [];
  for (const undo of built.covered ?? []) undo();
  built.covered = [];
}
