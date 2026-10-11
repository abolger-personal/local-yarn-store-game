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
// Garments are dressed AFTER createCharacter, onto an un-merged rig, and the merge comes after
// (npc.js mergeCharacter keeps their vertex colours): crowd.js and the shop (store/sim/cast.js
// dressedCharacter) do exactly that. A merged body cannot be re-dressed -- it is rebuilt.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, LIMB_TAPER, POSES, applyPose, femurOf, knitMaterial, tibiaOf } from './npc.js';
import { applyHatching, yarnColor } from '../inventory/yarn-look.js';
import { YARN_MATERIALS, YARN_WEIGHT_NAMES } from '../inventory/catalog.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- vocabulary (spec §2)

// Stitches by craft (spec §2b.5). Not true to the real world -- you can knit lace -- but what the
// relief budget can tell apart; revisit in a later optimising pass. The first of each is its plain.
export const STITCHES_BY_CRAFT = Object.freeze({
  knit: Object.freeze(['stockinette', 'rib', 'garter', 'seed', 'linen stitch', 'cable']),
  crochet: Object.freeze(['single crochet', 'waffle', 'puff', 'lace']),
});
export const STITCHES = Object.freeze(Object.values(STITCHES_BY_CRAFT).flat());
export const CRAFTS = Object.freeze(Object.keys(STITCHES_BY_CRAFT));
/** The stitch as worked in `craft`: a stitch from the other craft falls back to this one's plain. */
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

/**
 * Spec §1. `forms`: how the type can be worn, where that field applies -- a shawl only draped or
 * tied: wrapped or tucked, it read as nothing in particular. `accessories`: its own, where it has
 * more than the shared ones -- a shawl takes a pin.
 */
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

/** How a type can be worn (empty if the field does not apply), and the accessories it takes. */
export const formsOf = (type) => GARMENTS[type].forms ?? [];
export const accessoriesOf = (type) => GARMENTS[type].accessories ?? ACCESSORIES;

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
    weight: 'worsted', tool: null, fibre: 'wool', craft: 'knit',
    colorCount: 1, ...Object.fromEntries(colourKeys(MAX_COLOURS).map((k, i) => [k, PALETTE[i]])),
    colourwork: 'solid', stitch: 'stockinette', edge: g.edge, accessory: 'none',
    form: formsOf(type).includes('wrapped once') ? 'wrapped once' : formsOf(type)[0] ?? 'wrapped once', sleeves: 'long',
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

// The usual needle or hook for each weight, in mm (Craft Yarn Council's ranges, mid-range). A
// pattern names its own tool; when it doesn't, it is this one.
const TOOL_MM = Object.freeze({
  knit: { lace: 2, fingering: 2.75, sport: 3.5, dk: 4, worsted: 5, aran: 5.5, bulky: 7, 'super-bulky': 10 },
  crochet: { lace: 2, fingering: 3, sport: 4, dk: 5, worsted: 6, aran: 6.5, bulky: 8, 'super-bulky': 10 },
});
export const TOOL_RANGE = Object.freeze([1.5, 15]);
export const usualTool = (craft, weight) => (TOOL_MM[craft] ?? TOOL_MM.knit)[weight] ?? 5;

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
// A pattern is knitted from the shop's yarn, so its colours span the shop's range -- undyed cream
// to charcoal, heather to jewel. A random HSL band of its own came out an Easter parade: setHSL
// works in LINEAR space, so its lightness 0.3-0.75 showed as 0.6-0.9 -- 79% pastel, none dark.
const randomHex = () => `#${yarnColor().getHexString()}`;

/** A random PATTERN for one item, made to pattern: the fastest way to find a pairing that breaks. */
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

/** Every slot filled, each at random, sleeves long: the most a character can wear, for budgets. */
export const worstOutfit = () =>
  Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, { ...randomItem(type), sleeves: 'long' }]));

/**
 * A stitch's width in REAL gauge, from the yarn and the tool together: yarn ** 0.4 x tool ** 0.6,
 * the tool the larger share. Both bigger, bigger stitch (spec §3). Worsted on the worsted needle is
 * STITCH_W.worsted. Fit and the drawn stitch size both come from this.
 */
const TOOL_SHARE = 0.6;
const MM = STITCH_W.worsted / TOOL_MM.knit.worsted;   // world units per mm of tool
function realWidth(item) {
  const tool = item.tool ?? usualTool(item.craft, item.weight);
  return (STITCH_W[item.weight] ?? STITCH_W.worsted) ** (1 - TOOL_SHARE) * (tool * MM) ** TOOL_SHARE;
}

// Drape per fibre, 0 stiff .. 1 fluid (spec §3, proposed order). Picks how far ends and hems
// stand off the body; there is no cloth simulation.
const DRAPE = Object.freeze({
  linen: 0.1, cotton: 0.25, acrylic: 0.4, wool: 0.45, bamboo: 0.55, mohair: 0.7, alpaca: 0.85, silk: 0.9,
});

/**
 * Knobs the dress-up page exposes. Mutable on purpose, so the page can tune them live; nothing in
 * the shop should write them.
 * - `stitchScale`: the stylisation, drawn stitch over real. Real stitches are sub-pixel at 150px, so
 *   they are drawn larger (spec §2, "big relief").
 * - `relief`: an overall depth, over each stitch's own (DEPTH).
 * - `viewPx`: the on-screen character height garments are built for; 0 is no limit (close-ups).
 *   Where a stitch would be under MIN_STITCH_PX there, its relief is not built (forView).
 *
 * Tuned by eye on the dress-up page, 2026-09-27, across the yarn weights, every crochet stitch and
 * every hat. A `spread` knob that squeezed the weights towards super-bulky ended up at 1 -- real
 * gauge -- so it was removed: weights read apart at their real ratios.
 */
export const LOOK = { stitchScale: 2.1, relief: 1.8, rim: 0.42, viewPx: 150 };

// Below this many pixels a stitch, relief is shading noise, not texture: measured 2026-09-27 at
// 150px, a lace-weight stitch is 0.9px and its relief ran to several triangles a pixel -- which
// the GPU shades in 2x2 blocks, so about four times their size (WEARABLE-LOOK-VS-PERFORMANCE.md).
const MIN_STITCH_PX = 1.5;

/**
 * The fabric as it can be seen at LOOK.viewPx: a stitch too small to see there is built as its
 * craft's plain -- no relief, no crochet bumps, no lace holes. Colourwork, hatching, edges and the
 * silhouette still carry the item.
 */
function forView(f, fit) {
  if (!LOOK.viewPx || (f.stitchW * LOOK.viewPx) / fit.height >= MIN_STITCH_PX) return f;
  return { ...f, stitch: (STITCHES_BY_CRAFT[f.craft] ?? STITCHES_BY_CRAFT.knit)[0], bump: 0 };
}

// Per craft (spec §2b.5): crochet rows stand taller than knit's, its fabric is thicker, and it is
// bumpy all over, under whatever stitch -- knit is smooth. `bump` is in stitch widths.
const CRAFT = Object.freeze({
  knit: { row: 0.75, thick: 1, bump: 0 },
  crochet: { row: 1.05, thick: 1.3, bump: 0.35 },
});

// Row height against the craft's own, where a stitch packs its rows differently: garter's ridges
// and linen stitch's slipped dashes pull rows together; puffs stand tall.
const ROW = Object.freeze({ garter: 0.6, 'linen stitch': 0.65, puff: 1.15 });

/**
 * The resolved numbers a builder works from, at fit 1 -- the pattern's own tool (spec §2b):
 * - Stitch width is its real width (yarn and tool, realWidth) times `stitchScale`: neighbouring
 *   weights look different, or a player has no reason to help find the right one.
 * - Row height is the craft's, then the stitch's. It is also how wide a stripe is.
 * - Fabric thickness is yarn weight's alone, and keeps the real spread: it is the input weight
 *   dominates (spec §2b.2). Crochet is thicker than knit.
 * - Relief depth is the stitch's (DEPTH), in stitch widths, so it grows with the stitch.
 * - A tool off the usual one for the yarn opens or tightens the stitch through realWidth: width
 *   and rows, never thickness. Fit comes from the same number, in madeItem.
 */
export function fabric(item) {
  const g = STITCH_W[item.weight] ?? STITCH_W.worsted;
  const craft = CRAFT[item.craft] ?? CRAFT.knit;
  const stitch = craftStitch(item.craft, item.stitch);
  const width = realWidth(item) * LOOK.stitchScale;
  return {
    ...item, stitch,
    stitchW: width, rowH: width * craft.row * (ROW[stitch] ?? 1),
    thick: g * LOOK.stitchScale * 1.1 * craft.thick,   // a knit fabric is about two yarn diameters
    bump: craft.bump,
    drape: DRAPE[item.fibre] ?? 0.45,
    colours: colourKeys(Math.min(item.colorCount, MAX_COLOURS)).map((k) => new THREE.Color(item[k] ?? PALETTE[0])),
    colourwork: resolveColourwork(item.colourwork, item.colorCount),
  };
}

/**
 * What an NPC actually makes from a pattern (spec §3): the pattern, with whatever it used instead --
 * `used` holds only what differs (`tool`, `weight`, `fibre`, colours, a different stitch, edge,
 * accessory or colourwork). Fit is not chosen: it is how much wider the stitches it made are than
 * the pattern's, in REAL gauge (yarn weight and tool), so worsted on a fingering pattern comes out
 * big and a good fit is the pattern's own yarn and tool -- the player's doing. `used.fit` forces it.
 */
export function madeItem(pattern, used = {}) {
  const tool = pattern.tool ?? usualTool(pattern.craft, pattern.weight);
  const made = { ...pattern, tool, ...used };
  made.tool = used.tool ?? tool;
  made.stitch = craftStitch(made.craft, made.stitch);
  made.fit = used.fit ?? Math.min(FIT_RANGE[1], Math.max(FIT_RANGE[0], realWidth(made) / realWidth({ ...pattern, tool })));
  return made;
}

/**
 * A finished WIP as the shop's sim holds it, as { type, item } for dress(), or null if it is not
 * worn (decor). The shop's pattern types (catalog.js PATTERN_TYPES) are GARMENTS' types, and a
 * named design says which silhouette it makes (`pattern.silhouette`); a one-off pattern with none,
 * or one this file has no builder for, makes the type's first. `colourOf` turns one ball of its
 * yarn into a hex. More than one colour is stripes, the purchase fallback (resolveColourwork).
 */
export function wornAs(wip, colourOf) {
  const p = wip.pattern, type = p?.patternType;
  if (!Object.hasOwn(GARMENTS, type)) return null;
  const { silhouettes } = GARMENTS[type];
  const item = { ...defaultItem(type), silhouette: silhouettes.includes(p.silhouette) ? p.silhouette : silhouettes[0], ...madeWith(wip, colourOf) };
  // `wip.used`: whatever the maker did that the pattern did not say -- madeItem's `used`
  return { type, item: madeItem(item, wip.used) };
}

/** The yarn, tool and colours a WIP was made with, as item attributes. */
function madeWith(wip, colourOf) {
  const p = wip.pattern;
  const colours = [...new Set(wip.yarn.map(colourOf))].slice(0, MAX_COLOURS);
  return {
    on: true, craft: p.craft === 'crochet' ? 'crochet' : 'knit',    // catalog.js says 'knitting'
    weight: p.weight, fibre: p.materials[0], tool: p.toolSize,
    colorCount: Math.max(1, colours.length), colourwork: colours.length > 1 ? 'stripes' : 'solid',
    ...Object.fromEntries(colours.map((c, i) => [`color${i + 1}`, c])),
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

/** The bottom of the lowest eye, in the neck's frame: a scarf wrapped up high stops under it. */
function eyeBottom(j) {
  const low = Math.min(Infinity, ...(j.eye ?? []).map(({ node }) => new THREE.Box3().setFromObject(node).min.y));
  return Number.isFinite(low) ? j.neck.worldToLocal(new THREE.Vector3(0, low, 0)).y : Infinity;
}

/**
 * Any coat the neck wears -- the llama's ruff: its top and its radius, or 0s for a bare neck. A
 * coat is a mesh on the neck well wider than the neck itself. Neck items start above it rather
 * than through it: the ruff is the llama's silhouette, so it stays in view (and a band over bare
 * neck is cheaper). A scarf's ends come down over it.
 */
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
/** The top of the upper arm (a wing's root), in the chest frame: a slumped scarf rests on it. */
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
    P, joints: j, holds: built.holds, floor, root: floorOf(built.root),   // what lies on the floor follows
    height: new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3()).y,   // for forView
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

// ---------------------------------------------------------------- the sheet

/**
 * A parametric sheet: `fn(u, v, out)` writes the point at (u, v), both 0..1. `mask(u, v)` drops a
 * quad -- a hood's face opening, a cardigan's front, a lace hole. `from(p)` is the point a normal
 * should face away from, so relief always bumps OUTWARD whatever order the sheet was swept in.
 */
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

/**
 * Two triangles a quad, split corner b to corner d. `cut(c, r)` may split a quad the other way
 * (`slash`, a to e) and drop either half -- a lace hole's straight diagonal edge.
 */
function quads(segU, segV, mask, cut) {
  const index = [];
  const cols = segU + 1;
  for (let r = 0; r < segV; r++) {
    for (let c = 0; c < segU; c++) {
      if (mask?.((c + 0.5) / segU, (r + 0.5) / segV)) continue;
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      const { slash = false, keep = [true, true] } = cut?.(c, r) ?? {};
      // [lower-left, upper-right] split b-d; [upper-left, lower-right] split a-e
      const halves = slash ? [[a, d, e], [a, e, b]] : [[a, d, b], [b, d, e]];
      for (const [i, t] of halves.entries()) if (keep[i]) index.push(...t);
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

/**
 * How long the sheet is along u and along v, sampled, so stitch counts come from real size. u is
 * measured halfway along, or with `widest` where it is widest: a scarf is knitted to its flat width
 * and bunched round the neck, and counted at the bunch, a lace scarf got a super-bulky's stitches.
 * v is measured along its longest line: rows are shared across the sheet, so counted along a short
 * line they stretch on a long one. A slouch's folded-over front is four times its back, and counted
 * down the back its lace holes ran down the fold as stripes.
 */
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
  return [across, walk((t) => [0.5, t], 96)];   // finely along: it winds round the neck
}

// ---------------------------------------------------------------- stitch relief (spec §2)

const fract = (x) => x - Math.floor(x);

// Height 0..1 at stitch coordinates (us across, vs along). "Big relief": geometry, not a normal map.
const RELIEF = {
  stockinette: () => 0,
  'single crochet': () => 0,
  // Slipped stitches: a short dash every other stitch, the dashes staggered row to row.
  'linen stitch': (us, vs) => Math.max(0, Math.cos(Math.PI * (us + (Math.floor(vs) % 2)))) * Math.sin(Math.PI * fract(vs)),
  rib: (us) => (0.5 + 0.5 * Math.cos((TAU * us) / 4)) ** 2,
  garter: (us, vs) => 0.5 + 0.5 * Math.cos((TAU * vs) / 2),
  seed: (us, vs) => 0.5 + 0.5 * Math.sin(Math.PI * us) * Math.sin(Math.PI * vs),
  waffle: (us, vs) => Math.max(Math.abs(Math.cos((Math.PI * us) / 2)), Math.abs(Math.cos((Math.PI * vs) / 2))) ** 6,
  // Poofs: round pillows three stitches by three rows, bricked -- each other row shifted half a puff.
  // A dome, round on top and easing into the fabric at its edge -- a fuller dome walls up there,
  // and a sharpened sine peaks: both read as spikes.
  puff: (us, vs) => {
    const row = Math.floor(vs / 3);
    const d = 2 * Math.hypot(fract((us + (row % 2) * 1.5) / 3) - 0.5, fract(vs / 3) - 0.5);
    return d >= 1 ? 0 : (1 - d * d) ** 1.5;
  },
  // A rope: two round strands swapping sides every 6 rows, the one crossing over standing higher,
  // with 10 plain stitches between ropes. One wavy ridge every 8 stitches read as rows of bumps.
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

// Crochet is bumpy under every stitch (CRAFT.bump says how deep). One knot spans two stitches and
// two rows: a knot per stitch needs nine vertices a stitch to show, ~100k triangles on a lace hat.
const crochetBase = (us, vs) => 0.5 + 0.5 * Math.sin(Math.PI * us) * Math.sin(Math.PI * vs);

// How deep each stitch stands, in stitch widths -- the input stitch dominates is texture (spec
// §2b.3). Spread wide on purpose: the stitches have to read as different at 150px.
const DEPTH = Object.freeze({
  stockinette: 0, rib: 0.6, garter: 0.45, seed: 0.4, 'linen stitch': 0.35, cable: 0.9,
  // Puff is low for its width: a poof is wide and soft, and at 0.9 the puffs stood as tall as wide.
  'single crochet': 0, waffle: 0.6, puff: 0.5, lace: 0.2,
});

// Segments [per stitch across, per row along] each relief needs: at least three per repeat of its
// pattern in that direction, or the sampled pattern aliases. At exactly two a repeat, a sine is
// sampled at its zeros and vanishes -- which is how crochet's bumps, garter's ridges and linen
// stitch's dashes went missing. The plains need none beyond the shape.
const DENSITY = Object.freeze({
  stockinette: [0, 0], rib: [2, 0], garter: [0, 1.5], seed: [1.5, 1.5], 'linen stitch': [1.5, 3], cable: [1.5, 1],
  'single crochet': [0, 0], waffle: [1.5, 1.5], puff: [2.5, 2.5], lace: [2, 1.5],
});
const CROCHET_DENSITY = [1.5, 1.5];   // its knot repeats every two stitches and two rows

/**
 * Lace eyelets (spec §2: cut, not alpha-tested): triangles pointing up and down in turn, every six
 * quads across and three up, offset half a repeat on alternate courses -- about two stitches wide,
 * so they read at 150px. Laid out on the grid itself, so each edge runs along quad sides and
 * diagonals and is straight. Round holes cut from whole quads were staircases: pixelated circles.
 *
 * ponytail: the layout is in quads, not stitches, so where a sheet hits its quad cap (panelGrid)
 * the eyelets come out larger in stitches; lay them out from the stitch count if that shows.
 */
function laceCut(c, r) {
  const course = Math.floor(r / 3), x = c + (course % 2) * 3, y = r % 3;
  const lx = (x % 6) - 1;   // the hole spans quads 1..4 of each six, and rows 0..1 of each three
  if (lx < 0 || lx > 3 || y > 1) return null;
  const up = (Math.floor(x / 6) + course) % 2 === 0;
  const h = up ? y : 1 - y;   // quads up from the hole's base
  const left = lx < 2;
  // the edge through this quad, if any: up, x = h on the left and 3 - h on the right
  const edge = left ? lx === h : lx === 3 - h;
  const inside = left ? lx > h : lx < 3 - h;
  if (!edge) return inside ? { keep: [false, false] } : null;
  // On the left edge of an up hole the diagonal is a-e (slash); the hole is below it, lower-right.
  // A down hole is the same flipped top to bottom, so its diagonals are the other way.
  const slash = left === up;
  if (slash) return { slash, keep: up ? [true, false] : [false, true] };
  return { slash, keep: up ? [false, true] : [true, false] };
}

/**
 * Holes through a thin tube -- a scarf's band, a loop -- not just into one face of it. `front` is the
 * u at the middle of one face; the point opposite u is 2 front + 1/2 - u, through the tube's
 * thickness. Cut each face alone, every eyelet was backed by the inside of the other face a couple of
 * millimetres behind it, in the same yarn: the lace read as solid. That face's quads are cut as the
 * mirror of the quad opposite, its diagonal and halves flipped left to right.
 */
function throughCut(cut, segU, front) {
  const axis = Math.round(segU * (2 * front + 0.5));
  return (c, r) => {
    const off = Math.abs((((c + 0.5) / segU - front) % 1 + 1.5) % 1 - 0.5);   // round the section from `front`
    if (off <= 0.25) return cut(c, r);
    const k = cut((((axis - c - 1) % segU) + segU) % segU, r);
    const [a, b] = k?.keep ?? [true, true];
    return k && { slash: !k.slash, keep: [b, a] };
  };
}

// Stitches across one repeat of each stitch and colourwork (RELIEF, COLOURWORK, laceCut). Marled
// is a speckle with no repeat; its seam column may differ, which a speckle hides.
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
    // Puff is its own crochet texture: the bumps stacked on it peaked into spikes, and between the
    // puffs, at a puff's height, they were as loud as the puffs.
    const d = amp * (depth * h(us, vs) + (f.stitch === 'puff' ? 0 : bump * crochetBase(us, vs)));
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

/** How many colour slots a colourwork fills; any colour past that goes to the trim (spec §3). */
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

/** The yarn-look hatching reads `aHatchScale` as rows along v, so fine stitches follow the gauge. */
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

// ---------------------------------------------------------------- a panel: sheet + relief + paint

/**
 * One knitted piece. `fn` is the shape; everything else -- how many stitches it has, how finely it
 * must be tessellated to show them, the holes, the bumps, the colours -- follows from its real size
 * and the fabric, identically for every piece of every garment.
 */
function panel(fn, f, { closedU = false, mask = null, from = null, minU = 24, minV = 12, widest = false, through = null } = {}) {
  const reps = panelReps(fn, f, closedU, widest);
  const [quadsU, segV] = panelGrid(f, reps, minU, minV);
  const segU = through === null ? quadsU : quadsU + (quadsU % 2);   // even, so each quad has one opposite
  let lace = null;
  if (f.stitch === 'lace') lace = through === null ? laceCut : throughCut(laceCut, segU, through);
  const geo = sheet(fn, segU, segV, { closedU, mask, cut: lace, from });
  relieve(geo, f, reps, { closedU, cols: segU + 1, rows: segV + 1 });
  paint(geo, f, reps);
  return geo;
}

/** Stitches across and rows along, from the sheet's real size. */
function panelReps(fn, f, closedU, widest) {
  const [lu, lv] = spans(fn, widest);
  const reps = [lu / f.stitchW, lv / f.rowH];
  // In the round, cast on a whole number of pattern repeats, as a knitter does: otherwise the
  // stitch and colour patterns jump where the sheet meets itself, and relief opens a seam there.
  if (closedU) reps[0] = castOn(reps[0], lcm(lcm(U_REPEAT[f.stitch] ?? 1, U_REPEAT[f.colourwork] ?? 1), f.bump ? 2 : 1));
  return reps;
}

/** Segments [across, along]: enough for the relief to show, or the shape's own minimum. */
function panelGrid(f, reps, minU, minV) {
  const [du, dv] = DENSITY[f.stitch] ?? [0, 0], [cu, cv] = f.bump ? CROCHET_DENSITY : [0, 0];
  return [
    Math.min(256, Math.max(minU, Math.ceil(reps[0] * Math.max(du, cu)))),
    Math.min(768, Math.max(minV, Math.ceil(reps[1] * Math.max(dv, cv)))),
  ];
}


// `skinTo`: a second joint the piece's vertices may also follow (skinned, see neckSkin).
const piece = (joint, geo, skinTo = null) => ({ joint, geo, skinTo });

// ---------------------------------------------------------------- edges (spec §2)

/** A boundary of a panel, sampled: the points an edge treatment runs along. */
/**
 * A boundary of a panel, sampled: the points an edge treatment runs along, and at each the way the
 * fabric runs on past it (`flow`), so a scallop or a picot can continue the fabric, not stick out.
 */
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

/** `make(point, tangent, flow)` at every `spacing` along an edge; `make` may return one geometry or several. */
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

/** Geometry built in an edge's own frame -- x along the edge, -y the way the fabric runs on -- moved there. */
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
  // Stiff fibre fringe stands a little proud; fluid fibre hangs straight (drape, spec §3).
  fringed: (r, f) => beads(r, f.stitchW * 2.5, (p) => {
    const len = f.thick * 7 * (0.6 + 0.4 * f.drape);
    return new THREE.CylinderGeometry(f.thick * 0.35, f.thick * 0.25, len, 5).translate(p.x, p.y - len / 2, p.z);
  }),
  // A small triangular point carrying on past the edge, flat in the fabric, with a tiny loop at its tip.
  picot: (r, f) => beads(r, f.thick * 3, (p, tangent, flow) => {
    const w = f.thick * 0.8, h = f.thick * 2.2;
    const point = new THREE.ConeGeometry(w, h, 4).rotateZ(Math.PI).translate(0, -h / 2, 0).scale(1, 1, 0.45);
    const loop = new THREE.TorusGeometry(w * 0.5, w * 0.16, 4, 10).translate(0, -h - w * 0.4, 0);
    return [onEdge(point, p, tangent, flow), onEdge(loop, p, tangent, flow)];
  }),
  // Half-discs lying in the fabric's own surface, hanging on past the edge: a border, not a frill.
  scalloped: (r, f) => beads(r, f.thick * 2.4, (p, tangent, flow) => {
    const R = f.thick * 1.35;
    return onEdge(new THREE.SphereGeometry(1, 10, 6).scale(R, R, f.thick * 0.5).translate(0, -R * 0.15, 0), p, tangent, flow);
  }),
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
 * A pom-pom or tassel anchor may give `d`, the way it hangs off the fabric (a tassel lies along it),
 * and `floor`, the height none of it goes below.
 *
 * `surface`: the finished fabric, in the anchors' frame. Each accessory is then SEATED on it: moved
 * along n (or d) until its centre is SEAT of its size from the nearest stitch. Lifted by the deepest
 * stitch instead, a button between two cables floated; hung off a band's centre line, a tassel hung
 * below the open end of a flat band, touching nothing; a straight row of buttons left a curved
 * kerchief at both ends.
 */
const SEAT = { buttons: 0.2, flower: 0.2, 'pom-pom': 0.95, tassel: 0.3 };

/** How far the deepest stitch stands off the fabric. */
const reliefDepth = (f) => f.stitchW * LOOK.relief * ((DEPTH[f.stitch] ?? 0) + (f.bump ?? 0));

function accessoryPieces(anchors, f, surface = null) {
  const make = ACCESSORY[f.accessory];
  const list = anchors?.[f.accessory];
  if (!make || !list) return [];
  const colour = trimColour(f), flat = f.accessory === 'buttons' || f.accessory === 'flower';
  // A button's or a flower's anchor is on the surface BEFORE relief: lift it clear of the deepest
  // stitch, or it sits half-buried in the fabric and the raised stitches hide it -- in super-bulky,
  // all but a flower's centre.
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

/** Where one accessory of `parts` goes, seated on `surface` (see accessoryPieces). */
function placeOn(surface, { p, n, d, size, floor }, parts, f) {
  const flat = f.accessory === 'buttons' || f.accessory === 'flower', out = flat ? n : d, pos = p.clone();
  const near = nearSurface(surface, p, size * 6 + f.thick * 6);
  // A hanging one never seats back past its anchor: up into a flat band's open end, it slid on up
  // inside it.
  const place = () => {
    seatOn(near, pos, out, size * SEAT[f.accessory], flat ? size * (f.accessory === 'flower' ? 0.6 : 0.9) : 0);
    if (d && pos.clone().sub(p).dot(d) < 0) pos.copy(p);
  };
  place();
  if (floor !== undefined) {
    const low = Math.min(...parts.map((g) => new THREE.Box3().setFromBufferAttribute(g.attributes.position).min.y));
    pos.y = Math.max(pos.y, floor - low);
    place();
    // off an end still bending onto the floor, seating slid it on down through it: along it instead
    const along = new THREE.Vector3(d.x, 0, d.z);
    if (pos.y < floor - low && along.lengthSq() > 1e-6) {
      pos.y = floor - low;
      seatOn(near, pos, along.normalize(), size * SEAT[f.accessory]);
    }
  }
  return pos;
}

/** The triangles of `geo` with a corner within `r` of `p`. */
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

/**
 * Move `c` along `dir` until it is `gap` out from the nearest of `tris`: a few steps, each of the
 * error. Behind the fabric (a straight row of buttons down a kerchief that bows out) counts as less
 * than none, or it was pushed further in. With a `ring`, so is every point of a disc that wide round
 * c, across `dir`, and the one that needs it most sets the step: a flower rests on the highest stitch
 * under its petals. Seated by its centre alone, the cables of super-bulky stood up through them.
 */
function seatOn(tris, c, dir, gap, disc = 0) {
  if (!tris.length) return;
  const rim = discAround(dir, disc), s = new THREE.Vector3();
  for (let k = 0; k < 16; k++) {
    // the centre settles it, unless some point of the disc still needs lifting clear
    const centre = gap - signedTo(tris, c, dir);
    const lift = Math.max(...rim.map((o) => gap - signedTo(tris, s.copy(c).add(o), dir, true)));
    c.addScaledVector(dir, Math.max(centre, lift));
  }
}

/** Eight points round a circle of radius `r` across `dir`; none for no radius. */
function discAround(dir, r) {
  if (!r) return [];
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const other = new THREE.Vector3().crossVectors(dir, side);
  return Array.from({ length: 8 }, (_, i) => side.clone().multiplyScalar(Math.cos((i * TAU) / 8) * r).addScaledVector(other, Math.sin((i * TAU) / 8) * r));
}

/**
 * How far `x` is out along `dir` from the nearest of `tris`: negative where the fabric is further
 * out. `under`: only fabric below x counts -- a rim point beside a ridge's wall or a slope is not on
 * it, and is Infinity clear.
 */
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

// ---------------------------------------------------------------- shared geometry helpers
/** A knot: a squashed ball of the trim colour where two ends are tied. */
const knot = (joint, p, size, f) =>
  piece(joint, flatColour(at(new THREE.SphereGeometry(1, 10, 8), p, [size * 1.1, size, size]), trimColour(f)));


/** A point on an axis-aligned ellipsoid at polar angle phi (0 = top) and azimuth theta (0 = +z, front). */
const onEllipsoid = (r, phi, theta, out) =>
  out.set(r[0] * Math.sin(phi) * Math.sin(theta), r[1] * Math.cos(phi), r[2] * Math.sin(phi) * Math.cos(theta));

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * A strap: a flat band `width` wide and `thick` through along `pts`, lying on the body -- its
 * thickness along the body's `normal` there, its width across it -- in the scarf band's section, a
 * rounded rectangle. Drawn as a tube, a bag's strap read as a cord.
 */
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

// Pom-pom size, from the body it sits on and never from the stitch size: a pom-pom is wound to the
// size wanted, whatever the yarn, and sized from fabric thickness the stitch-size slider blew it up.
// Each matches what it was at the default worsted x3 on the owl and lion.
const POM_OF_HEAD = 0.4, POM_OF_SHIN = 1.8;
// Button radius, the same way. Big enough to read at 150px: a torso button is ~12% of its width.
const BUTTON_OF_HEAD = 0.14, BUTTON_OF_TORSO = 0.11, BUTTON_OF_SHIN = 0.6;

const BUTTONS_IN_A_ROW = 3;

/** A row of buttons centred on `p`, a little over a button apart along `dir` (down by default). */
function buttonRow(joint, p, n, size, dir = new THREE.Vector3(0, -1, 0)) {
  const count = BUTTONS_IN_A_ROW;
  return Array.from({ length: count }, (_, i) => ({ joint, p: p.clone().addScaledVector(dir, (i - (count - 1) / 2) * size * 2.6), n, size }));
}

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
  // eyesOut: a llama's eyes are on the sides of its head, outside the face opening, and were hidden.
  hood: { profile: dome(1.1, -0.95), seat: 0.44, face: true, eyesOut: true },
  headband: { seat: 0.45, soft: 0.3, open: true, profile: (v) => { const y = lerp(0.79, 0.11, v); return [Math.sqrt(1 - y * y) * 1.05, y]; } },
  bucket: { seat: 0.35, soft: 0.5, profile: (v) => (v < 0.75 ? dome(1.05, 0.35)(v / 0.75) : [lerp(0.99, 1.45, (v - 0.75) / 0.25), lerp(0.35, 0.08, (v - 0.75) / 0.25)]) },
  cloche: { seat: 0.1, profile: (v) => (v < 0.85 ? dome(1.05, 0.0)(v / 0.85) : [lerp(1.04, 1.18, (v - 0.85) / 0.15), lerp(0.0, -0.1, (v - 0.85) / 0.15)]) },
  // The point is fabric, not a horn: it folds over behind and hangs, its tip ~10 degrees off plumb.
  pixie: { seat: 0.3, flop: { hinge: 1.0, back: 0.8, angle: 2.0 }, tip: true, profile: (v) => {
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
  // Eased in over half a head above the hinge: folded at full angle from the hinge itself, the bag
  // tore off there, and one row of quads -- forty rows long at the front -- spanned the gap.
  const a = angle * (1 - v) * THREE.MathUtils.smoothstep(dh, 0, 0.5 * k);
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
  return [...pieces, ...accessoryPieces(hatAnchors(fn, head, r[1] * POM_OF_HEAD * s, r[1] * BUTTON_OF_HEAD * s, spec.open), f)];
}

function hatAnchors(fn, head, size, buttonSize, open) {
  const top = fn(0, 0, new THREE.Vector3());
  const side = fn(0.25, 0.6, new THREE.Vector3());
  const band = [0, 1, 2, 3, 4].map((i) => fn(0.19 + i * 0.03, 0.78, new THREE.Vector3()));
  // An open top (a headband) has no crown: its v=0 is the band's front edge, and a pom-pom there sat
  // mid-forehead. It goes on the band at one temple instead, half the size.
  const pomAt = open ? fn(0.2, 0.5, new THREE.Vector3()) : top, pomSize = open ? size / 2 : size;
  // Off the crown along the hat's own axis there (from a ring just below it out through it): pushed
  // out from the head's centre, a pixie's hanging tip put its pom-pom against the back of the tail.
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
  const { head } = built.joints, skull = skullMesh(head);
  const q = new THREE.Vector3();
  // Ears are worn up through an open-top hat (a headband) and out of a fisherman's hat; a hood keeps
  // the eyes out.
  const spec = HAT[f.silhouette] ?? HAT.beanie;
  const parts = [...(spec.eyesOut ? [] : built.joints.eye), ...(spec.open || spec.earsOut ? [] : built.joints.ear)];
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
  const under = new Uint8Array(pos.count);   // after pressing: what trimUnder may cut
  let moved = false;
  for (let i = 0; i < pos.count; i++) {
    const pressed = cover.press(q.fromBufferAttribute(pos, i).applyMatrix4(toHead));
    under[i] = pressed || cover.under(q) ? 1 : 0;
    if (pressed) { q.applyMatrix4(toMesh); pos.setXYZ(i, q.x, q.y, q.z); moved = true; }
  }
  if (!moved) { geo.dispose(); return; }
  if (mesh.userData.trimUnderHat) trimUnder(geo, under);
  geo.computeVertexNormals();
  geo.computeBoundingBox();      // clone() copied the old bounds: culling and fit would read the unpressed mane
  geo.computeBoundingSphere();
  const original = mesh.geometry;
  mesh.geometry = geo;
  built.covered.push(() => { geo.dispose(); mesh.geometry = original; });
}

/**
 * A coat that marks itself `trimUnderHat` (the lion's mane) loses every triangle wholly `under` the
 * hat: pressed only, some still showed through the crown, where the real hat slumps inside the
 * volume `press` works to. Triangles across the rim stay: tufts there read as fluffy hair.
 */
function trimUnder(geo, under) {
  const idx = geo.index ? geo.index.array : Array.from({ length: geo.attributes.position.count }, (_, i) => i), keep = [];
  for (let t = 0; t < idx.length; t += 3) if (!(under[idx[t]] && under[idx[t + 1]] && under[idx[t + 2]])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  geo.setIndex(keep);
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
  return Math.max(neck.r, y < neck.coatTop ? neck.coatR : 0, onTorso, onHead) + pad;
}

/** The visible band of neck a scarf can wrap: from just into the torso top, or above a neck coat, up to under the chin. */
function neckBand(fit, girth) {
  const lo = Math.max(fit.neck.overlap * 0.4, fit.neck.coatTop);
  const chin = fit.neck.headY - fit.skull[1] * 0.8;
  return [lo, Math.max(lo + girth * 2.2, chin)];
}

/** An ellipse's cos or sin, squared off: round it, a band's section is a rounded box, not a tube's. */
function square(x) {
  return Math.sign(x) * Math.sqrt(Math.abs(x));
}

/**
 * The radius a wrapped band's wall stands at, from its bottom edge `lo` up to its top edge `hi`:
 * straight between the body `r` at its two edges, never inside it. Out to the body at each height,
 * in a crease (the owl's, the lion's) its top edge rode out over the head and its bottom out over
 * the shoulders past its own face: a C in section, a saucer round the neck.
 */
const wall = (r, lo, hi) => (y) => Math.max(r(y), lerp(r(lo), r(hi), hi - lo > 1e-6 ? clamp((y - lo) / (hi - lo), 0, 1) : 0.5));

/**
 * A closed loop round the neck, once or doubled -- an infinity scarf, a kerchief's band. Doubled,
 * it is one loop gone round twice and joined to itself. Its two strands must pass each other
 * somewhere, so they part in height at the back and in depth at the front, where the outer one
 * hangs looser and lower over the inner.
 */
function scarfLoop(fit, f, { wraps, girth, sag = 0, loose = 1, base = false }) {
  const double = wraps > 1;
  // A flat band lying ON the body -- half its height, and its half-thickness -- not a tube round a
  // centre line: that stood out to the shoulders. A doubled one's strands lie one over the other.
  const h = girth * 1.3, T = f.thick * 0.9;
  // As far as it reaches below its centre (a doubled one's lower strand at the back, the sag in
  // front), and above it no higher than under the eyes: up the neck it wrapped the face. Under the
  // HEAD, on a lion or an owl, whose head comes down to its shoulders, it ringed the shoulders.
  const above = h * (double ? 2.05 : 1), underEyes = fit.neck.eyeBottom - above;
  const below = h * (double ? Math.max(2.05, 1 + 1.5 * sag) : 1 + 0.75 * sag);
  // `base`: round the bottom of the neck, over any coat (a kerchief on the llama's ruff), so what
  // hangs from it hangs on the chest. Above the ruff, its triangle stepped out over it: a shelf.
  const seat = scarfSeat(f), pad = T * 1.15 * seat.snug, body = (yy) => loopRadius(fit, yy, pad);
  const fitted = base && fit.neck.coatTop ? fit.neck.overlap * 0.4 + below : Math.min(creaseY(fit, below), underEyes);
  const { mid, hoop, lean } = loopRest(fit, seat, body, [fitted, underEyes]);
  const fn = (u, v, out) => {
    const psi = v * TAU, th = wraps * psi + Math.PI;   // joined at the back
    const outer = double ? Math.sin(psi) : 0, lift = double ? Math.cos(psi) : 0;
    const sink = slumpAt(lean, th);
    const yc = mid + lift * h * 1.05 - sag * (0.5 + 0.5 * Math.cos(th)) * (0.5 + 0.5 * outer) * h * 1.5 - sink;
    const a = u * TAU, y = yc + h * square(Math.sin(a));
    const R = (Math.max(wall(body, yc - h, yc + h)(y), hoop) + (1 + outer) * T * 1.15 + T * square(Math.cos(a))) * loose;
    return out.set(R * Math.sin(th), y, R * Math.cos(th) + lean.dz);
  };
  // ponytail: the join at the back is not welded, so relief and normals may step there; weld v like
  // closedU welds u if it shows.
  // through: a tube, its outer face round u = 0, where the section's cos is 1
  return { fn, wraps, geo: panel(fn, f, { minU: 10, minV: 48, from: (p) => p.set(0, p.y, 0), through: 0 }), front: fn(0, 0.5 / wraps, new THREE.Vector3()) };
}

/**
 * Where a wrap reaching h below its centre sits, in the neck's frame: in the narrowest stretch
 * between the shoulders and the head -- the lion's and the owl's crease, the bottom of the llama's
 * long neck above its ruff. Lower, it rang the top of the torso, out over the shoulders.
 */
/**
 * How a scarf of the wrong size sits -- the scarf's hatSeat, so the size reads at a glance. Too big,
 * what goes round the neck is a ring wider than the neck: it slides down to where the body is as
 * wide (settle) and slumps to one side, over a shoulder. Too small, it is pulled tight and rides up
 * under the chin. `big` and `small` run 0 at fit 1 to 1 at the ends of FIT_RANGE; at fit 1 nothing
 * changes. Grown only longer, an oversized scarf looked like a long one, and an undersized one like
 * a short one.
 */
function scarfSeat(f) {
  const big = clamp((f.fit - 1) / (FIT_RANGE[1] - 1), 0, 1), small = clamp((1 - f.fit) / (1 - FIT_RANGE[0]), 0, 1);
  return { big, small, loose: 1 + big * 0.7, slope: big * 0.45, snug: 1 - small * 0.6 };
}

/** Where a ring of radius R, let go at y0, comes to rest going down a body of radius r(y): no lower than `bottom`. */
function settle(r, y0, R, bottom) {
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, bottom, i / n);
    if (r(y) >= R) return y;
  }
  return bottom;
}

/**
 * How an oversized ring resting at y, `hoop` wide on a body r(y), slumps: `side`, how far its +x side
 * drops; `front`, how far its front droops; `dz`, how far it hangs forward. It tips to one side, over
 * a shoulder -- unless the shoulders are wider than it is (an owl's wings) and it is down to them
 * (`shoulder`, in y's frame): then it hangs from the back of the neck and droops in front instead,
 * a necklace too big. Tipped regardless, round the owl it swung out past its wings: a hula hoop.
 */
function slumpOf(r, y, hoop, { seat, fit, shoulder }) {
  if (!seat.big) return { side: 0, front: 0, dz: 0 };
  const total = seat.slope * hoop * 2;
  const side = heldBy(fit, hoop) ? clamp(y - shoulder, 0, total) : total, front = total - side;
  return { side, front, dz: (Math.max(0, hoop - r(y)) * front) / total };
}

/** Whether shoulders hold up a ring `hoop` wide: they stand out past the body and it both -- an owl's wings, not a lion's arms. */
function heldBy(fit, hoop) {
  return fit.shoulderX > Math.max(hoop, fit.torso[0]) * 1.1;
}

/**
 * Where an oversized ring comes to rest (settle), down to `bottom` -- but not past shoulders that
 * hold it (`shoulder`, in y0's frame). Round the owl's ball of a body it slid down to its belly, a
 * belt, though its wings stood out to catch it.
 */
function restAt(r, y0, hoop, { bottom, fit, shoulder }) {
  return settle(r, y0, hoop, heldBy(fit, hoop) ? Math.max(bottom, Math.min(y0, shoulder)) : bottom);
}

/** How far a slumped ring is down at angle `a` round the neck (0 in front, +x at a quarter turn). */
function slumpAt({ side, front }, a) {
  return (side * (1 + Math.sin(a))) / 2 + (front * (1 + Math.cos(a))) / 2;
}

function creaseY(fit, h) {
  const [lo] = neckBand(fit, 0), [bottom, top] = narrowNeck(fit);
  return clamp((bottom + top) / 2, lo + h, bottom + h);
}

/** The stretch of neck, in its frame, within 5% of its narrowest: a long one on the llama, a crease on the lion. */
function narrowNeck(fit) {
  const [lo] = neckBand(fit, 0);
  const ys = Array.from({ length: 41 }, (_, i) => lerp(lo, fit.neck.headY, i / 40));
  const r = ys.map((y) => loopRadius(fit, y, 0));
  const least = Math.min(...r);
  const narrow = ys.filter((_, i) => r[i] <= least * 1.05);
  return [narrow[0], narrow.at(-1)];
}

// How many times round the neck a scarf with ends goes. Draped goes none: a U over the nape.
const BAND_WRAPS = { draped: 0, 'wrapped once': 1, 'wrapped twice': 2, tied: 1, tucked: 1 };
const UP = new THREE.Vector3(0, 1, 0);
const SHORT_ENDS = 0.4;   // an end shorter than this, of the torso's height, rides the neck

/** How tight an end bends onto the floor: a fraction of the torso, but never more than half its drop. */
const endBend = (fit, floor, top = fit.neck.y) => Math.max(1e-3, Math.min(fit.torso[1] * 0.4, (top - floor) * 0.5));

/**
 * A scarf with ends is ONE band: up from one tip, round the neck as often as it is wrapped, and
 * down to the other tip. Hanging, it lies flat; round the neck it bunches, narrow and thick. The
 * part round the neck rides the neck joint and the ends the chest -- one sheet cut in three, so the
 * stitches run on unbroken where they meet.
 */
function scarfBand(fit, f, spec, girth) {
  const { neck: nk, joints: { neck, chest } } = fit;
  // as wide as its stitches make it: a ribbon too small, a blanket too big
  const width = (spec.width ?? 1) * Math.max(0.05, fit.torso[0] * 0.38) * f.fit, flatT = f.thick * 1.2;
  // Round the neck it stands upright on the body, a little gathered and pulled snug: a wrapped
  // strip of fabric. Bunched round a centre line, narrow and as thick as wide, it read as a tube,
  // and each turn stood a tube's width out from the last.
  // Draped, the U over the nape keeps its own line and bunch: it looked right, and on the body it
  // bowed out past its ends.
  const hug = (BAND_WRAPS[f.form] ?? 1) > 0;
  const dims = hug ? { width, flatT, H: width * 0.8, T: f.thick * 0.9 * Math.max(1, Math.sqrt(spec.tube ?? 1)) }
    : { width, flatT, H: Math.min(width, girth * 2.6), T: girth };
  const band = bandSpine(fit, f, spec, dims);
  const shape = bandShape(fit, band, { ...dims, hug }), { fn } = shape;
  // Short ends (an ascot's) hang at the throat: all of it rides the neck, or the ends stay put
  // while the head turns. Long ends ride the chest: on the neck they would swing through the body.
  const short = Math.max(...spec.ends) * f.fit < SHORT_ENDS;
  const pieces = cutBand(fit, f, shape, band, short), surface = pieces[0].geo;
  const anchors = bandAnchors(fit, f, shape, band, dims);
  pieces.push(...edgePieces(chest, [ring(fn, 0, 24), ring(fn, 1, 24)], f));
  if (f.form === 'tied') {
    const tie = knot(chest, band.spine[band.legs[0]], girth * 1.5, f);
    pieces.push(short ? tie : piece(chest, neckSkin(tie.geo, () => 1)));
  }
  const all = [...pieces, ...accessoryPieces(anchors, f, surface)];
  // everything was built in the chest frame; what rides the neck moves into its frame
  return short ? all.map(({ geo }) => piece(neck, geo.translate(0, -nk.y, 0))) : grounded(fit, f, all);
}

/**
 * What reaches the floor stays there with the root while the chest above it leans: on the chest
 * alone, a trailing scarf's ends lifted off the floor like skis. All of it as thick as the band
 * lying there follows the root, easing to none up the bend.
 */
function grounded(fit, f, pieces) {
  const { joints: { neck, chest } } = fit;
  const floor = fit.floor + f.thick * 3.5, rise = endBend(fit, fit.floor) * 1.5;
  const ground = (y) => 1 - THREE.MathUtils.smoothstep(y, floor, floor + rise);
  return pieces.map(({ geo }) => piece(chest, groundSkin(geo.attributes.skinIndex ? geo : neckSkin(geo, () => 0), ground), [neck, fit.root]));
}

const FLOORS = new WeakMap();
/**
 * The root's place and facing, down on the floor: what lies there follows the character about and
 * round, but not up and down. On the root itself, grounding dropped it 66mm as the attitude's knees
 * bent and a relevé lifted it, and the floor run of a trailing scarf bobbed with it like skis.
 * ponytail: cancels the root's height in the root's own frame, right while the root only turns
 * about the vertical; one that tilts or scales would need it rebuilt from the world matrix.
 */
function floorOf(root) {
  if (FLOORS.has(root)) return FLOORS.get(root);
  const floor = new THREE.Object3D();
  floor.name = 'floor';
  floor.updateMatrix = function updateMatrix() {
    this.position.y = -root.position.y;
    THREE.Object3D.prototype.updateMatrix.call(this);
  };
  root.add(floor);
  floor.updateMatrixWorld();   // a scarf binds it as it stands, before anything renders
  FLOORS.set(root, floor);
  return floor;
}

/**
 * Where a band's accessories go: tassels and pom-poms past its tips; a flower high on one end,
 * just below the neck, and buttons down that end, on its outer face. Down the middle of the chest
 * they were on the body, not the scarf.
 */
function bandAnchors(fit, f, { fn, curve }, { spine, legs }, { width, flatT }) {
  const { chest } = fit.joints, endT = flatT + reliefDepth(f);   // half the end's thickness, stitches and all
  const top = vAt(curve, spine, legs[0]);   // where the first end leaves the neck
  const onEnd = (v) => {
    const c = curve.getPointAt(v), faces = [0.25, 0.75].map((u) => fn(u, v, new THREE.Vector3()));
    const p = faces.reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) ? b : a));   // the face away from the body
    return { p, n: p.clone().sub(c).normalize() };
  };
  // Buttons each on the end, its own spacing apart round its bends, squeezed onto a short end: in a
  // straight row they ran off an ascot's tucked end into the air.
  // None smaller than the band is thick: on a tiny super-bulky ribbon they were lost among the stitches.
  const size = Math.max(Math.min(fit.torso[0] * BUTTON_OF_TORSO, width * 0.22), endT * 1.2);
  const step = Math.min((size * 2.6) / curve.getLength(), (top * 0.8) / (BUTTONS_IN_A_ROW - 1));
  const first = clamp(top * 0.6 - (step * (BUTTONS_IN_A_ROW - 1)) / 2, top * 0.1, top * 0.9 - step * (BUTTONS_IN_A_ROW - 1));
  const bloom = onEnd(top * 0.85);
  return {
    // never smaller than the end they cap: a tassel's head or a pom-pom narrower than the band is
    // thick sat inside its open end, touching nothing
    tassel: tipAnchors(curve, { joint: chest, size: Math.max(width * 0.35, (endT / 0.35) * 1.2), floor: fit.floor }),
    'pom-pom': tipAnchors(curve, { joint: chest, size: Math.max(width * 0.3, endT * 1.4), floor: fit.floor }),
    flower: [{ joint: chest, ...bloom, size: Math.max(width * 0.4, endT * 2.5) }],
    buttons: Array.from({ length: BUTTONS_IN_A_ROW }, (_, i) => ({ joint: chest, ...onEnd(first + i * step), size })),
  };
}

/** The band's v (arc length, 0..1) at a spine index: the spine's points are not evenly spaced. */
function vAt(curve, spine, idx) {
  let lo = 0, hi = 1;
  for (let n = 0; n < 24; n++) {
    const m = (lo + hi) / 2;
    if (curve.getUtoTmapping(m) * (spine.length - 1) < idx) lo = m;
    else hi = m;
  }
  return lo;
}

/**
 * Accessories off a band's two tips, hanging on the way the band runs there: seated (SEAT) off the
 * end, and a trailing end's lie along the floor, not through it.
 */
function tipAnchors(curve, { joint, size, floor }) {
  return [[0, -1], [1, 1]].map(([t, away]) => ({ joint, p: curve.getPointAt(t), d: curve.getTangentAt(t).multiplyScalar(away), size, floor }));
}

/**
 * How far up the neck the wraps climb: half a band's height a turn, so each turn lies over the
 * one before, but the top one no higher than the bottom of the eyes, so they peep over a chunky
 * scarf wrapped twice. It covered them.
 */
function wrapRise(fit, y0, H, wraps) {
  const top = fit.neck.y + fit.neck.eyeBottom - H / 2;   // the top wrap's centre
  // Only as far as the neck stays narrow: where the head comes down to the shoulders, the turns lie
  // one over the other in place. Climbing, they rode out round the head.
  const [bottom, narrowTop] = narrowNeck(fit);
  return clamp(Math.min(top - y0, narrowTop - bottom), 0, H * 0.5 * wraps);
}

/** From the wrap straight down to an end's top, pushed out of the body and whatever the neck carries (the llama's ruff). */
/**
 * The turns round the neck, from azimuth a0 to a1, rising `rise` from y0. Each turn lies over the
 * one before, half a band up and `out` further out, so the loop covers where an end comes out of
 * it. A band's height up a turn, the loop passed clear above that start: loop, stub and end read as
 * three pieces.
 */
function bandWrap(clear, [y0, rise], [a0, a1], out, { hoop = 0, lean = { side: 0, front: 0, dz: 0 } } = {}) {
  const steps = Math.ceil(((a1 - a0) / TAU) * 16);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const ang = lerp(a0, a1, i / steps);
    // slumped: down on the +x side, a ring of at least `hoop` pushed out by whatever it rests on
    const y = y0 + rise * (i / steps) - slumpAt(lean, ang);
    const R = Math.max(clear(y), hoop) + out * ((ang - a0) / TAU);
    return new THREE.Vector3(R * Math.sin(ang), y, R * Math.cos(ang) + lean.dz);
  });
}

/**
 * Where a loop comes to rest, in the neck frame (see scarfSeat): fitted at `fitted`; too small, up
 * towards under the eyes; too big, a ring `hoop` wide settled onto the shoulders, and how it leans.
 */
function loopRest(fit, seat, body, [fitted, underEyes]) {
  const hoop = seat.big ? body(fitted) * seat.loose : 0;
  const held = { seat, fit, bottom: fitted - fit.torso[1] * 0.6, shoulder: fit.shoulderY - fit.neck.y };
  const mid = seat.big ? restAt(body, fitted, hoop, held) : lerp(fitted, Math.max(fitted, underEyes), seat.small * 0.8);
  return { mid, hoop, lean: slumpOf(body, mid, hoop, held) };
}

/**
 * Where a band's wrap starts and how far it climbs, in the chest frame (see scarfSeat): too small,
 * up under the chin; too big, a ring `hoop` wide settled down onto the shoulders, where it cannot
 * climb.
 */
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

/**
 * Round the neck the long way, by the nape, from end A to end B: the start and end azimuths on a
 * loop of radius R, `wraps` whole turns more than that apart. Wrapped, each end comes out of the
 * wrap in front of it. Draped, the U meets each end straight above it, over the shoulder: from in
 * front of the neck it hooked back out to the ends, and read as a separate piece.
 */
function bandArc(a, b, wraps, R) {
  const azimuth = (p) => {
    if (wraps) return Math.atan2(p.x, p.z);
    const s = Math.asin(clamp(p.x / R, -0.95, 0.95));
    return p.z >= 0 ? s : Math.PI - s;
  };
  // the long way: by the nape to ends in front, round the front to ends behind
  const a0 = azimuth(a);
  let a1 = azimuth(b);
  while (a1 - a0 < Math.PI * 0.9) a1 += TAU;
  return [a0, a1 + TAU * wraps];
}

/**
 * The band's centre line, in the chest frame, and how bunched it is at each point. `legs` are the
 * spine indices where it leaves the neck for each end.
 */
function bandSpine(fit, f, spec, { width, H, T }) {
  const { torso, neck: nk } = fit;
  const tuck = f.form === 'tucked' ? 0.35 : 1, wraps = BAND_WRAPS[f.form] ?? 1;
  // Draped, the ends hang either side of the neck, apart: together they closed the U at the throat.
  const x = torso[0] * (spec.cross ? 0.05 : 0.28) + (wraps ? 0 : width * 0.5);
  const seat = scarfSeat(f), clear = (y) => loopRadius(fit, y - nk.y, T * 1.15 * seat.snug);   // in the chest frame
  const { y0, rise, hoop, lean } = bandSeat(fit, clear, { H, wraps }, seat);
  // what hangs starts below where the wrap came to rest
  const endTop = Math.min(nk.y, torso[1] * 0.9, seat.big ? y0 - H : Infinity);
  const [endA, endB] = spec.ends.map((k, i) => endPath(fit, f, i ? -x : x, k * torso[1] * f.fit * tuck, { back: spec.back?.[i], top: endTop }));
  const [a0, arcEnd] = bandArc(endA[0], endB[0], wraps, clear(y0));   // each turn above the last
  // Crossed at the throat (an ascot), the way round from end to end is itself a whole turn: on top
  // of it, wrapped once went round twice.
  const a1 = spec.cross && wraps ? arcEnd - TAU : arcEnd;
  // each turn a band's thickness out from the one under it, no more: a girth a turn stood out
  const wrap = bandWrap(clear, [y0, rise], [a0, a1], wraps ? T * 2.3 : 0, { hoop, lean });
  const legA = [...endA].reverse(), dropA = bandDrop(clear, wrap[0], endA[0]).reverse(), dropB = bandDrop(clear, wrap.at(-1), endB[0]);
  return {
    spine: [...legA, ...dropA, ...wrap, ...dropB, ...endB],
    bunch: [...legA.map(() => 0), ...dropA.map(() => 0.5), ...wrap.map(() => 1), ...dropB.map(() => 0.5), ...endB.map(() => 0)],
    legs: [legA.length - 1, legA.length + dropA.length + wrap.length + dropB.length],
  };
}

/** The band's surface round its spine: flat and wide hanging, narrow and thick where it bunches. */
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

/**
 * A radius profile r(y) on [lo, hi] with its steps closed over `w`: the most within w, averaged over
 * w. Never inside r, and with no step for a band w high to tear across. Pressed onto the body as it
 * was, a band crossing the top of the llama's ruff put half its stitches on the ruff and half on the
 * neck, and stood off it like a blade.
 */
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

/** How bunched a band is at v along `curve`, between its spine points' `bunch`. */
function bunchAlong(curve, spine, bunch) {
  return (v) => {
    const k = curve.getUtoTmapping(v) * (spine.length - 1), i = Math.min(spine.length - 2, Math.floor(k));
    return lerp(bunch[i], bunch[i + 1], k - i);
  };
}

/**
 * Which way a band's width runs at v, across its tangent there, into `out`: flat across the body's
 * surface, upright against the neck when bunched. Eased over a short stretch: where the wrap turns
 * down into an end the band's way turns a right angle in a few rows, and its width with it, in one
 * twist.
 */
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

/**
 * A band's width at N + 1 points tip to tip, carried on from the last, not taken fresh: where the
 * band turns up off the chest into its wrap its tangent can pass right through the way its width
 * should run, and the width went to nothing and flipped -- the band sheared inside out, a blade off
 * the llama's long neck. Each takes the way closer to the last, and keeps the last's where the fresh
 * one fades.
 */
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

/**
 * Round the neck a band lies ON the body: a point at the body's radius at its own height, plus the
 * turns under it and its depth through the band -- not round a centre line, where its edges stood
 * out over the shoulders or sank into the head. `b` blends it in where the band leaves the neck.
 */
function onBody(p, c, { b, body, halfT }) {
  const rc = Math.hypot(c.x, c.z), r = Math.hypot(p.x, p.z);
  if (rc < 1e-6 || r < 1e-6) return p;
  const under = Math.max(0, rc - body(c.y) - halfT * 1.15);   // the turns already round the neck
  const across = ((p.x - c.x) * c.x + (p.z - c.z) * c.z) / rc;   // through the band's thickness
  const k = lerp(r, body(p.y) + under + halfT * 1.15 + across, b) / r;
  p.x *= k;
  p.z *= k;
  return p;
}

/** The band as one sheet, cut where it leaves the neck: the part between rides the neck, the ends the chest. */
/** Moves a point to the nearest of `n` points along `curve`: the inside of a band round it, for its normals. */
function nearestOn(curve, n = 200) {
  const samples = curve.getSpacedPoints(n);
  return (p) => p.copy(samples.reduce((best, s) => (s.distanceToSquared(p) < best.distanceToSquared(p) ? s : best)));
}

function cutBand(fit, f, { fn, curve }, { spine, legs }, whole) {
  const nearest = nearestOn(curve);
  // through: a tube, one face round u = 1/4, where the section's sin is 1
  const geo = panel(fn, f, { closedU: true, minU: 8, minV: Math.max(48, spine.length * 2), from: nearest, widest: true, through: 0.25 });
  if (whole) return [piece(fit.joints.chest, geo)];
  const [cols, rows] = gridOf(geo);
  const [cutA, cutB] = legs.map((idx) => Math.round(vAt(curve, spine, idx) * (rows - 1))), { chest } = fit.joints;
  // Round the neck it follows the neck; hanging, the chest; across each cut, a few rows of both, so
  // it bends there as the head turns. Cut in two pieces, one on each joint, it tore apart.
  const k = Math.max(2, Math.round(rows * 0.03));
  const ease = (a, b, r) => clamp((r - a) / (b - a), 0, 1) ** 2 * (3 - 2 * clamp((r - a) / (b - a), 0, 1));
  return [piece(chest, neckSkin(geo, (i) => {
    const r = Math.floor(i / cols);
    return ease(cutA - k, cutA + k, r) * (1 - ease(cutB - k, cutB + k, r));
  }))];
}

/** Bone 0 is the joint a piece hangs on, bone 1 the one it also follows (the neck; over a knee, the shin): vertex i follows it by `w(i)`. */
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

/** Bone 2 is the root: a vertex follows it by `w(y)` of its height, out of what the neck leaves. */
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

/**
 * A garment mesh on `joint` that also follows `others`. A child joint (the neck) is bound in the
 * REST pose: the geometry was built with it unposed, whatever pose the character stands in now.
 * Anything else (the root, an arm's drape) is bound as it stands: the floor was measured in this
 * pose. Bone matrices map the joint's own space to world, so the bind matrix is the identity.
 * Read fresh: a drape made this dressing had never had its world matrix worked out.
 */
function skinnedGarment(geo, joint, others) {
  const mesh = new THREE.SkinnedMesh(geo, garmentMaterial());
  const inverse = (b) => (b.parent === joint
    ? new THREE.Matrix4().makeTranslation(-b.position.x, -b.position.y, -b.position.z)
    : new THREE.Matrix4().copy((b.updateWorldMatrix(true, false), b.matrixWorld)).invert().multiply(joint.matrixWorld));
  mesh.bind(new THREE.Skeleton([joint, ...others], [new THREE.Matrix4(), ...others.map(inverse)]), new THREE.Matrix4());
  return mesh;
}

/** A sheet's grid: [columns, rows] of vertices, the first row being where v is 0. */
function gridOf(geo) {
  const uv = geo.attributes.uv.array;
  let cols = 0;
  while (uv[cols * 2 + 1] === 0) cols++;
  return [cols, geo.attributes.uv.count / cols];
}

/** How far in front of (or behind) the torso an end hangs at chest height y. */
function endDepth(fit, f, back) {
  const { torso } = fit;
  // The band's own half-thickness and a hair: an end lies ON the body, at no angle to it. A
  // stand-off for stiff fibre, and a depth read on the centre line when the end hangs to the side,
  // where the torso curves back, held the ends out in the air.
  const standoff = f.thick * 1.4;
  return (y, x) => {
    // below the chest's widest it hangs straight, not in under the belly
    const k = Math.sqrt(Math.max(0, 1 - (Math.max(0, y) / torso[1]) ** 2 - (x / torso[0]) ** 2));
    return (back ? -1 : 1) * (torso[2] * k + standoff);
  };
}

/**
 * A hanging end, in the CHEST frame: down the torso, round a bend onto the floor and along it. An
 * end longer than the drop simply trails -- that is the "so long it trails on the ground" of the
 * spec, reached by length rather than by a special case. It met the floor in a corner, and read as
 * a 90-degree kink.
 */
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
  // a stride down, six round the bend, eight along the floor
  const spaced = (a, b, n) => Array.from({ length: n }, (_, i) => lerp(a, b, (i + 1) / n));
  const ss = [0, ...spaced(0, Math.min(length, down), 24)];
  if (length > down) ss.push(...spaced(down, Math.min(length, down + arc), 6));
  if (length > down + arc) ss.push(...spaced(down + arc, length, 8));
  return ss.filter((v, i) => i === 0 || v > ss[i - 1] + 1e-6).map(point);
}

// `formless`: no ends, so nothing to drape, tie or tuck; the item's form is ignored and not offered.
const SCARF = {
  cowl: { cowl: true, formless: true },
  infinity: { wraps: 2, sag: 0.5, formless: true },   // loose only when oversized: at fit 1 it hugs
  ascot: { ends: [0.2, 0.18], cross: true, width: 0.7, tube: 0.7 },
  long: { ends: [1.6, 1.3] },
  // Trailing behind, like a scarf flung back: trailing down the front, the ends were under the feet.
  trailing: { ends: [9, 8.6], back: [true, true] },
  skinny: { ends: [1.9, 1.7], width: 0.55, tube: 0.55, back: [false, true] },
  kerchief: { kerchief: true },
  'chunky wrap': { ends: [1.3, 1.1], width: 1.5, tube: 1.8 },
};

const FORM_WRAPS = { draped: 1, 'wrapped once': 1, 'wrapped twice': 2, tied: 1, tucked: 1 };

/** How a closed loop is worn: its turns and sag from the silhouette or the form, looser when oversized. */
const loopOptions = (spec, f, girth) => ({
  wraps: spec.wraps ?? FORM_WRAPS[f.form] ?? 1, girth,
  sag: spec.sag ?? (f.form === 'draped' ? 1 : 0), loose: spec.loose ?? 1,   // oversized: scarfSeat
  base: Boolean(spec.kerchief),
});

/** Whether this item's form changes how it is worn (the dress-up page hides the menu if not). */
export const hasForm = (type, silhouette) => formsOf(type).length > 0 && !(type === 'scarf' && SCARF[silhouette]?.formless);

function buildScarf(fit, item) {
  const spec = SCARF[item.silhouette] ?? SCARF.long;
  const f = spec.formless ? { ...item, form: null } : item;
  const { neck } = fit.joints;
  const girth = f.thick * 1.6 * (spec.tube ?? 1);
  if (spec.cowl) return cowl(fit, f, neck, girth);
  if (spec.ends) return scarfBand(fit, f, spec, girth);
  const loop = scarfLoop(fit, f, loopOptions(spec, f, girth));
  // a kerchief's triangle carries what it can, unless its band all but covers it (too small)
  const tri = Boolean(spec.kerchief) && kerchiefShows(fit, f, loop);
  const pieces = [piece(neck, loop.geo), ...accessoryPieces(loopAnchors(fit, f, loop, { girth, kerchief: tri }), f, loop.geo)];
  if (spec.kerchief) pieces.push(...kerchief(fit, f, loop, tri));
  if (f.form === 'tied') pieces.push(knot(neck, loop.front, girth * 1.5, f));
  return pieces;
}

/**
 * A loop's accessories, on the neck: a flower on the band at the front, off to one side, and on an
 * infinity scarf a row of buttons along it there (a kerchief's buttons and its pom-pom or tassel
 * are on its triangle). A loop offered none, so a flower on one was never made.
 */
function loopAnchors(fit, f, { fn, wraps }, { girth, kerchief: tri }) {
  const { neck } = fit.joints;
  const v = (Math.PI + 0.6) / (wraps * TAU);   // 0.6 radians round from the front, on the outer strand
  const p = fn(0, v, new THREE.Vector3()), n = new THREE.Vector3(p.x, 0, p.z).normalize();
  const along = new THREE.Vector3(n.z, 0, -n.x);   // round the neck
  // A pom-pom or tassel hangs from the strand's lowest edge there; a kerchief's hangs off its point.
  const low = lowest((u) => fn(u, v, new THREE.Vector3()));
  return {
    flower: [{ joint: neck, p, n, size: girth * 1.2 }],
    buttons: tri ? [] : buttonRow(neck, p, n, Math.min(girth * 0.7, fit.torso[0] * BUTTON_OF_TORSO), along),
    ...(!tri && hangFrom(neck, low, fit.torso[0], f)),
  };
}


/** The outward normal (away from the neck's axis) of a surface `fn(u, v)` at (u, v). */
function normalAt(fn, u, v, e = 1e-3) {
  const pt = (du, dv) => fn(u + du, v + dv, new THREE.Vector3());
  const n = new THREE.Vector3().crossVectors(pt(e, 0).sub(pt(-e, 0)), pt(0, e).sub(pt(0, -e))).normalize();
  const p = pt(0, 0);
  return n.x * p.x + n.z * p.z < 0 ? n.negate() : n;
}

/** The lowest of a ring of points round a section, `at(u)` for u in 0..1. */
function lowest(pointAt) {
  return Array.from({ length: 24 }, (_, i) => pointAt(i / 24)).reduce((a, b) => (b.y < a.y ? b : a));
}

/**
 * A pom-pom and a tassel hanging straight down from `p`, a loop's or a cowl's bottom edge: a scarf
 * end's size, but never smaller than the fabric is thick, or in super-bulky one hung lost among the
 * stitches.
 */
function hangFrom(joint, p, torso, f) {
  const t = f.thick * 1.2 + reliefDepth(f);
  return {
    'pom-pom': [{ joint, p, d: DOWN, size: Math.max(torso * 0.12, t * 1.4) }],
    tassel: [{ joint, p, d: DOWN, size: Math.max(torso * 0.12, (t / 0.35) * 1.2) }],
  };
}

/** A cowl is a band, not a loop: it covers as much of the neck as there is, tallest on a llama. */
function cowl(fit, f, neck, girth) {
  const [lo, hi] = neckBand(fit, girth), seat = scarfSeat(f), body = (y) => loopRadius(fit, y, f.thick * 1.2 * seat.snug);
  const tall = (hi - lo) * clamp(f.fit, 0.4, 1.2);
  // too small, a short tight collar up under the chin; too big, settled onto the shoulders, slumped
  const collar = seat.big ? body(lo) * (1 + (f.fit - 1) * 0.5) : 0;
  const held = { seat, fit, bottom: lo - fit.torso[1] * 0.6, shoulder: fit.shoulderY - fit.neck.y };   // neck frame
  const base = seat.big ? restAt(body, lo, collar, held) : lerp(lo, hi - tall, seat.small), lean = slumpOf(body, base, collar, held);
  const fn = (u, v, out) => {
    const th = u * TAU, y = base + tall * v - slumpAt(lean, th);
    const R = Math.max(body(y), collar) * (1 + 0.12 * Math.sin(v * Math.PI));
    return out.set(R * Math.sin(th), y, R * Math.cos(th) + lean.dz);
  };
  const geo = panel(fn, f, { closedU: true, from: (p) => p.set(0, p.y, 0) });
  const side = fn(0, 0.5, new THREE.Vector3());
  // facing the cowl's own surface: facing straight ahead, on its slopes they touched it at one edge
  const anchors = { flower: [{ joint: neck, p: side, n: normalAt(fn, 0, 0.5), size: girth * 1.4 }],
    buttons: [0.2, 0.5, 0.8].map((v) => ({ joint: neck, p: fn(0.02, v, new THREE.Vector3()), n: normalAt(fn, 0.02, v), size: fit.torso[0] * BUTTON_OF_TORSO * 0.8 })),
    ...hangFrom(neck, fn(0, 0, new THREE.Vector3()), fit.torso[0], f) };
  return [piece(neck, geo), ...edgePieces(neck, [ring(fn, 1), ring(fn, 0)], f), ...accessoryPieces(anchors, f, geo)];
}

/**
 * The triangle hangs from the band: its top tucked up inside the band's front, round the neck, and
 * its top rows follow the neck with the band. Built flat on the chest, it floated clear of the band.
 */
function kerchief(fit, f, loop, carries = true) {
  const { torso, neck: nk, joints: { neck, chest } } = fit;
  const top = nk.y + loop.front.y, len = torso[1] * 0.9 * f.fit;
  const hang = hanging(fit, [top, top - len], f.thick * 1.3);
  const fn = (u, v, out) => {
    const y = top - v * len, th = (u - 0.5) * 2 * (1 - v);   // a radian either side at the top, to a point
    const R = hang(y);
    return out.set(R * Math.sin(th), y, R * Math.cos(th));
  };
  const geo = panel(fn, f, { minU: 12, minV: 12, from: (p) => p.set(0, p.y, 0) });
  const { uv } = geo.attributes;
  // A pom-pom or tassel hangs off its point, and buttons run down its middle.
  const tip = fn(0.5, 1, new THREE.Vector3()), size = torso[0] * 0.12;
  const hangOff = () => [{ joint: chest, p: tip, d: DOWN, size }];
  const anchors = { 'pom-pom': hangOff(), tassel: hangOff(), buttons: kerchiefButtons(fit, fn, { top, len, loop }) };
  const skin = (g) => neckSkin(g, (i) => 1 - THREE.MathUtils.smoothstep(uv.getY(i), 0, 0.3));
  return [piece(chest, skin(geo), [neck, fit.root]), ...(carries ? accessoryPieces(anchors, f, geo) : [])];
}

/**
 * Whether a kerchief's triangle shows below its band enough to carry its accessories: a row of
 * buttons squeezed to half their spacing. Too small, its band all but covered it, and they hung off
 * its point or sank into the band; then the band carries them.
 */
function kerchiefShows(fit, f, loop) {
  const { torso, neck: nk } = fit;
  const top = nk.y + loop.front.y, len = torso[1] * 0.9 * f.fit, buttonSize = torso[0] * BUTTON_OF_TORSO * 0.8;
  const under = nk.y + new THREE.Box3().setFromBufferAttribute(loop.geo.attributes.position).min.y;
  return under - buttonSize * 1.2 - (top - len * 0.8) >= buttonSize * 1.3 * (BUTTONS_IN_A_ROW - 1);
}

/**
 * A kerchief's buttons down its middle, each on it, from under its band -- which covers the
 * triangle's top, a deep one in super-bulky -- squeezed to end well clear of the point.
 */
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

/**
 * How far out fabric hanging from the top of [top, bottom] lies at each height, in the chest frame:
 * taut over whatever stands out below it, the way a scarf's end comes down off its wrap, and on the
 * body where it touches. Following the body's clearance instead, a kerchief stepped straight out at
 * the top of the llama's ruff: a shelf round its neck.
 */
function hanging(fit, [top, bottom], pad) {
  const n = 32;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const y = lerp(top, bottom, i / n);
    return [y, loopRadius(fit, y - fit.neck.y, pad)];
  });
  // the outer hull from the top down: from each point, on to whichever below it is steepest out
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

// ---------------------------------------------------------------- SHAWL

/**
 * A draped shawl's hem: how far below the shoulder line it hangs at azimuth th (0 front, PI back), in
 * torso half-heights -- the outline of the flat shape once draped. Its long top edge goes round the
 * neck, so the back of the shape hangs down the back and the two ENDS of the top edge hang down in
 * front, either side of the opening `open`. At the sides it covers the shoulder and the arm, down to
 * `side` (given at use, from the arm: see SHAWL's `arm`). Hung only at the back, a triangle read as a
 * yoke with a cape behind, and the wrap's ends as two more pieces.
 * `ease` shapes each stretch, front point to side and side to back: linear for a triangle's straight
 * edges, eased for a half circle's square corners and round back, fast for a crescent's thin points.
 */
function hemOf(front, back, { open, easeFront = (t) => t, easeBack = (t) => t }) {
  return (th, side) => {
    const a = Math.abs((((th + Math.PI) % TAU) + TAU) % TAU - Math.PI);   // 0 at the front .. PI at the back
    if (a <= Math.PI / 2) return lerp(front, side, easeFront(clamp((a - open) / (Math.PI / 2 - open), 0, 1)));
    return lerp(side, back, easeBack((a - Math.PI / 2) / (Math.PI / 2)));
  };
}

// `arm`: how far down the upper arm its sides come -- a small shawl to the top of the triceps, a big
// one to the elbow. A shawl has no armhole: it goes round the body, over the shoulder and the arm.
// The shrug's `depth` is the old outline, in extra polar angle past the shoulder line: it looked right.
const back = (th) => Math.max(0, -Math.cos(th));
const STOLE_TURN = 0.6;   // radians round from the end of a stole's front drop to its side
const STOLE_WIDTH = 0.6;   // a stole's band, in torso half-heights below the shoulder line
const SHAWL = {
  triangle: { hem: hemOf(1.1, 1.4, { open: 0.35 }), open: 0.35, arm: 0.8 },
  'half circle': { hem: hemOf(0.8, 1.05, { open: 0.3, easeFront: (t) => t * t, easeBack: (t) => 1 - (1 - t) ** 2 }), open: 0.3, arm: 0.7 },
  // A stole: as wide all round, its ends hanging long in front. Each end's square bottom corner is
  // real; its outer edge then rises straight up off it and curves round into the side over STOLE_TURN.
  // Stepped straight from the end to the side, it turned a right angle on the front. Round the back
  // it is the band's own width, STOLE_WIDTH at most: hung to the arms, the owl's long wings took its
  // back down as far as its ends, a blanket.
  'rectangular wrap': { hem: (th, side) => {
    const a = Math.abs((((th + Math.PI) % TAU) + TAU) % TAU - Math.PI);
    const t = clamp((a - 1.0) / STOLE_TURN, 0, 1), b = clamp((a - 2.0) / (Math.PI - 2.0), 0, 1);
    return lerp(lerp(1.6, side, Math.sqrt(1 - (1 - t) ** 2)), Math.min(side, STOLE_WIDTH), b * b * (3 - 2 * b));
  }, open: 0.45, arm: 0.75 },
  crescent: { hem: hemOf(1.0, 0.45, { open: 0.6, easeFront: Math.sqrt }), open: 0.6, arm: 0.35 },
  // a 3/4 circle: closed round the shoulders it is a cone standing 49 degrees out, not a tube
  capelet: { hem: () => 0.55, open: 0, button: true, circle: 0.75 },
  shrug: { depth: (th) => (back(th) > 0 ? 0.07 : 0), open: Math.PI / 2, sleeves: true },
};

const SHOULDER = 0.42 * Math.PI;   // polar angle where a shawl stops hugging and starts to hang
const ROLL = 0.8;   // radians round the neck an open shawl's top edge takes to turn down the front

/**
 * Open, a shawl's long straight edge goes round the nape and on down to the front points, rolling
 * over the collarbone: how far down it has turned at azimuth a (0 at the front) -- 1 at the opening,
 * 0 round the neck ROLL further out, a quarter round between. A ring round the neck met by a cut
 * straight down the front made a square corner there.
 */
function rollDown(a, open) {
  const t = clamp((a - open) / ROLL, 0, 1);
  return open > 0 ? 1 - Math.sqrt(1 - (1 - t) ** 2) : 0;
}

/**
 * The front edge's top, swung round the neck: at v=0 the edge column sits CURVE further round than
 * the opening and comes back to it by v=CURVE_V, so the long edge turns from round the neck to down
 * the front over several rows. Turned by the roll alone, the whole turn fell between the first
 * column past the cut and the cut itself: two corners on the collarbones. Columns out to ROLL past
 * the opening are squeezed along with it, so they keep their order.
 */
const CURVE = 0.5, CURVE_V = 0.3;
function frontCurve(th, v, open) {
  if (!open) return th;
  const s = Math.atan2(Math.sin(th), Math.cos(th)), a = Math.abs(s);
  return Math.sign(s) * (a + CURVE * Math.max(0, 1 - v / CURVE_V) ** 2 * Math.max(0, 1 - (a - open) / ROLL));
}

/** Out from the body in a soft lump where the top edge rolls (`drop` part way), as over the owl's wings. */
function bunched(p, drop, v) {
  const k = 1 + 4 * drop * (1 - drop) * Math.max(0, 1 - v / 0.35) ** 2 * 0.18;
  return p.set(p.x * k, p.y, p.z * k);
}

function shawlShape(fit, f, spec) {
  const { torso } = fit;
  const pad = f.thick * 1.6;
  // out past the arms at the sides: it hangs over them, not between them and the body
  const r = [Math.max(torso[0], fit.shoulderX) + pad, torso[1] + pad, torso[2] + pad];
  const flare = (1 - f.drape) * 0.25 + (f.fit > 1 ? (f.fit - 1) * 0.3 : 0);
  const top = 0.17 * Math.PI;
  const p = new THREE.Vector3();
  const fall = r[1] * 1.6;   // how far it hangs a radian past the shoulder line
  const side = sideHem(fit, r, spec.arm ?? 0.5), arms = upperArms(fit), clear = fit.arm.r * 1.15 + pad;   // room for its relief, and to round the arm
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

/** The upper arms, in the chest frame as they stand: shoulder joint to elbow. */
function upperArms(fit) {
  const { chest } = fit.joints;
  return fit.joints.upperArm.map(({ node }) => new THREE.Line3(
    chest.worldToLocal(node.getWorldPosition(new THREE.Vector3())),
    chest.worldToLocal(node.localToWorld(new THREE.Vector3(0, -fit.arm.upper, 0)))));
}

/**
 * Over the arms, not through them: a point nearer an upper arm than `clear` goes out to lie on the
 * arm's outer side -- flipped there if it was between the arm and the body. The lion's arms splay
 * out from the shoulder, and a side hanging straight down went in through them.
 * Below an arm it hangs from the arm's outline, as cloth over a rail does: a point under the arm,
 * inside its outline seen from above, goes straight out away from the body until it is outside it.
 * Left there, a side hanging on past a splayed arm went back in under it, round it like a sleeve.
 */
function overArms(p, arms, clear) {
  const q = new THREE.Vector3(), d = new THREE.Vector3(), out = new THREE.Vector3();
  for (const arm of arms) {
    arm.closestPointToPoint(p, true, q);
    if (q.distanceTo(p) < clear) {
      d.subVectors(p, q);
      out.set(q.x, 0, q.z).normalize();   // away from the body
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
/** Whether p is below `arm` and within `clear` of it seen from above. */
function underArm(p, arm, clear) {
  _flat.set(_f.copy(arm.start).setY(0), _g.copy(arm.end).setY(0));
  const t = _flat.closestPointToPointParameter(_f.set(p.x, 0, p.z), true);
  return t > 0 && _flat.at(t, _g).distanceTo(_f) < clear && p.y < lerp(arm.start.y, arm.end.y, t);
}

/**
 * How far below the shoulder line, in torso half-heights, a shawl comes at the sides: `arm` of the
 * way down the upper arm from where it joins to the elbow, as the arm stands -- the lion's splay
 * out, and an elbow is far higher than a hanging arm's length below the shoulder. It hangs on past
 * the arm's underside there: ended on the arm, a splayed arm's hem wrapped it front, top and back --
 * a cuff, which read as a sleeve.
 */
function sideHem(fit, r, arm) {
  const [{ start, end }] = upperArms(fit);
  return Math.max(0.05, r[1] * Math.cos(SHOULDER) - lerp(start.y, end.y, arm) + fit.arm.r * 2) / fit.torso[1];
}

/** Straight down `hang` from a shoulder-line point p, flaring out by `flare` of its fall. */
function hangBelow(p, hang, flare, out) {
  return out.set(p.x * (1 + flare * hang), p.y - hang, p.z * (1 + flare * hang));
}

/**
 * A circle cape's flare: a `circle` of a full circle (3/4, a capelet), closed round the shoulders, is a
 * cone out at asin(circle) from the vertical -- eased towards hanging by drape -- standing off the
 * body below its top, with soft folds round its hem where the circle has more fabric than the cone.
 */
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
  // fine enough to bend over an arm (overArms): 24 round by 12 down, its quads spanned one
  const pieces = [piece(chest, panel(fn, f, { closedU: true, mask, minU: 72, minV: 24, from: (p) => p.set(0, p.y * 0.3, 0) }))];
  const edging = edgePieces(chest, [ring(fn, 1, 64, open ? { closed: false, u0: open / TAU, u1: 1 - open / TAU } : {})], f);
  pieces.push(...edging);
  const front = fn(0, 0.1, new THREE.Vector3());
  if (f.form === 'tied') pieces.push(knot(chest, front, f.thick * 2.6, f));
  if (spec.sleeves) pieces.push(...shrugSleeves(fit, f));
  if (f.accessory === 'pin') pieces.push(...pinOn(fit, f, fn, spec));
  const acc = spec.button && f.accessory === 'none' ? { ...f, accessory: 'buttons' } : f;
  // Hung on the chest, shaped round the arms as they stand, a swinging arm went through it.
  const [u0, u1] = open ? [open / TAU, 1 - open / TAU] : [0, 1];
  const hem = Array.from({ length: 257 }, (_, k) => fn(lerp(u0, u1, k / 256), 1, new THREE.Vector3()));
  return offArms(fit, [...pieces, ...accessoryPieces(shawlAnchors(fn, chest, front, f, fit.torso[0]), acc)], fit.arm.r * 0.95, { flap: { hem, edging: edging.length }, keepWorn: true });
}

/**
 * Chest pieces kept off the upper arms whatever the pose: the vertex shader pushes what an arm moves
 * into out to `r` from its axis (armCapsules; 0, none). `flap` (a drape): its side panels lift with
 * the arms instead (flapSkin): its edging (`flap.edging` pieces after the sheet, `pieces[0]`) by the
 * point of `flap.hem` it hangs from, so it moves as one with its bit of hem; the rest -- the sheet,
 * a pin -- by where it sits (a pin on the chest given its nearest hem's place flew off). By their
 * own place, a fringe strand's tip sat further round than its root and stretched; by the nearest
 * vertex of the sheet, neighbours snapped to different columns and pulled apart like gum.
 * Pushed alone, not lifted, a drape stacked up round the arm like a sleeve; lifted, only the cloth
 * at the shoulder joint is left for the push (the owl's wing in the attitude: 142 of 5081 points).
 */
function offArms(fit, pieces, r, { flap = null, keepWorn = false } = {}) {
  const { chest } = fit.joints, toHem = flap && ontoLine(flap.hem);
  const skin = (geo, k) => {
    if (!flap) return neckSkin(geo, () => 0);
    return flapSkin(geo, fit, k >= 1 && k <= flap.edging ? toHem : null);
  };
  return pieces.map((pc, k) => (pc.joint === chest ? piece(chest, armCapsules(skin(pc.geo, k), fit, r, { keepWorn }), armBones(fit)) : pc));
}

/** Moves a point onto the nearest point of the polyline `line` (an array of points). */
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

/**
 * A drape's side panels lift with the arms, as a cape does held out: each vertex's weight on each
 * arm (bones 3, 4; slots 1, 2) is how far round towards that arm's side it lies, easing out by 80
 * degrees from it, times how far out past the shoulder joint, none inside it and all an arm and a half
 * beyond -- so the panel turns about the shoulder as one piece and the front, back and neck stay. Cloth
 * inside the joint turned with it swung down into the body as the arm rose (from partway out from the
 * neck: 240-300 points into the torso in the attitude); what the arm's root lifts into at the joint
 * the shader pushes off (offArms). Weighted by
 * closeness to the arm, the cloth on and round it went with it and the cloth beside it did not:
 * layers of it stacked round the raised arm like a sleeve, and sheared where the weight fell off.
 */
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

/** A chest piece's bones: the neck and root (a scarf's 1, 2), then each upper arm as it stands (3, 4). */
function armBones(fit) {
  const { neck, upperArm } = fit.joints;
  return [neck, fit.root, ...upperArm.map(({ node }) => armRef(node))];
}

const ARM_ATTRIBUTES = ['aArmA0', 'aArmB0', 'aArmA1', 'aArmB1', 'aArmR'];
/**
 * Each upper arm as a capsule the vertex shader keeps this piece out of, whatever the pose (see
 * garmentMaterial): the segment in the piece's bind space, carried to where the arm is now by bones
 * 3 and 4. Skinning alone cannot: what half follows an arm raised overhead (the attitude) sits half
 * way, and the arm went up through it. Per vertex, not uniforms: the material is shared by every
 * garment on every character. A radius of 0 (anything not given this) is never pushed; `r` is how
 * far out from the arm's axis it is pushed to.
 */
function armCapsules(geo, fit, r, { keepWorn = false } = {}) {
  const pos = geo.attributes.position, n = pos.count, p = new THREE.Vector3(), q = new THREE.Vector3();
  // Open at the shoulder end, from a little way down the arm, where the arm grows out of the body.
  const arms = upperArms(fit).map(({ start, end }) => new THREE.Line3(start.clone().lerp(end, 0.15), end));
  arms.forEach(({ start, end }, s) => {
    geo.setAttribute(`aArmA${s}`, new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => start.getComponent(i % 3)), 3));
    geo.setAttribute(`aArmB${s}`, new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => end.getComponent(i % 3)), 3));
  });
  // `keepWorn`: only what an arm moves INTO is pushed; what is deep inside one already as worn (a
  // sweater's body under its sleeve, at the armhole) keeps 0. Pushed, it moved nearly an arm's
  // radius at rest. Only deep: one just inside was left to the owl's wing swinging further in.
  const inside = (i) => keepWorn && arms.some((arm) => arm.closestPointToPointParameter(p.fromBufferAttribute(pos, i), false) >= 0
    && arm.closestPointToPoint(p, true, q).distanceTo(p) < r * 0.8);
  geo.setAttribute('aArmR', new THREE.BufferAttribute(new Float32Array(n).map((_, i) => (inside(i) ? 0 : r)), 1));
  return geo;
}

const ARM_REFS = new WeakMap();
/**
 * The bone a garment follows an upper arm by: an empty node on it. The arm joint itself is the
 * chest's child, which skinnedGarment binds unposed; this one is bound as it stands, as the shawl
 * was shaped round the arm (overArms). Made once per arm and kept: it costs nothing unused.
 * (Squeezed along a raised arm, to slide the cloth off it, it flattened the owl's into a disc.)
 */
function armRef(arm) {
  if (!ARM_REFS.has(arm)) {
    const ref = new THREE.Object3D();
    ref.name = 'arm';
    arm.add(ref);
    ARM_REFS.set(arm, ref);
  }
  return ARM_REFS.get(arm);
}

const PIN_COLOUR = new THREE.Color('#b8975a');   // brass

/**
 * Where a shawl's pin goes: draped, across its front edges, high on the chest, pinning them; tied --
 * or so open at the front that its edges are over the shoulders, a shrug's -- on the left shoulder.
 */
function pinOn(fit, f, fn, spec) {
  const size = fit.torso[0] * 0.3, v = 0.3, step = 1 / 72;
  const across = f.form !== 'tied' && spec.open < 0.8;
  const [ua, ub] = across ? [spec.open / TAU + step, 1 - spec.open / TAU - step] : [0.14, 0.2];
  const a = fn(ua, v, new THREE.Vector3()), b = fn(ub, v, new THREE.Vector3()), n = normalAt(fn, across ? 0 : 0.17, v);
  // closed at the front (a capelet), it spans the seam
  if (a.distanceTo(b) < size) {
    const mid = a.clone().add(b).multiplyScalar(0.5), side = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    a.copy(mid).addScaledVector(side, -size * 0.6);
    b.copy(mid).addScaledVector(side, size * 0.6);
  }
  return shawlPin(a, b, n.clone(), size).map((g) => piece(fit.joints.chest, flatColour(g, PIN_COLOUR)));
}

/**
 * A shawl pin: a ring lying on the fabric and a stick through it from a to b, beyond both, a bead
 * at its end; `n` out of the fabric.
 * ponytail: one style; shawl pins come in many (penannular, stick, hairpin) -- a style field picks
 * the shape here when they are wanted.
 */
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
  // The body stays on the chest, but an arm raised overhead (the attitude) is pushed clear of it --
  // to just inside the sleeve, which covers it there at rest.
  return offArms(fit, [...pieces, ...accessoryPieces(anchors, acc)], fit.arm.r * 0.95, { keepWorn: true });
}

/**
 * A sweater's neckline: a band worked on round its opening, in the trim colour -- what a knitter or
 * crocheter picks up and finishes it with, and much of how it reads. Round the neck (a crew); round
 * the back and down both sides of a V (a vest); up one front, round the neck and down the other, a
 * button band (a cardigan). Lying on the body (strapBand), its ridges across it. Without one, the
 * sweater's neck was a raw edge.
 */
function neckband(fit, f, spec, fn) {
  const { r, hugY } = sweaterSpan(fit, f, spec);
  const normal = (p, out) => out.set(p.x / r[0] ** 2, p.y > hugY ? p.y / r[1] ** 2 : 0, p.z / r[2] ** 2).normalize();
  // its ridges run across it: the band's v runs along the neckline, and garter's relief with the rows
  const band = { ...f, stitch: 'garter', bump: 0 };
  // on the sweater, not half in it: its path lifted by its own half-thickness
  const thick = f.thick * 0.6, n = new THREE.Vector3();
  const path = necklinePath(spec, fn).map((p) => p.addScaledVector(normal(p, n), thick));
  const geo = strapBand(path, band, { closed: !spec.open, width: Math.max(fit.torso[0] * 0.1, f.thick * 3.5), thick, normal });
  return flatColour(geo, trimColour(f));
}

/** A sweater's neckline, on its body `fn`: see neckband. The V and the front opening are sweaterMask's. */
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

/**
 * Sleeves on the arm joints, sized to what the kit hung there -- the owl's wing included, so the
 * sleeve goes over the wing (spec §3). Fit sets length: a small sweater's sleeves stop short, a big
 * one's run down over the hands.
 *
 * Each is closed at the top by a cap, a dome over the shoulder, as a set-in sleeve is. The tube was
 * open there, and the shoulder joint sits out where the body has narrowed -- wide of it by an owl's
 * wing, a llama's fleece, a lion's splayed arm -- so the open end stood up to 1.6 arm radii outside
 * the body on every sleeved sweater: from above, a hole down into the sleeve beside the neck. Inside
 * the body, the cap is hidden; outside it, it is the shoulder.
 */
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

/**
 * A sleeve's cap: a low dome `r` round on the arm's axis, from the tube's top at `top` (see sleeves).
 * Low: a round one stood the owl's well above the top of the sweater's body, like shoulder pads.
 */
function sleeveCap(top, r, f) {
  const fn = (u, v, out) => {
    const a = (v * Math.PI) / 2;
    return out.set(r * Math.sin(a) * Math.sin(u * TAU), top + r * 0.4 * Math.cos(a), r * Math.sin(a) * Math.cos(u * TAU));
  };
  return panel(fn, f, { closedU: true, from: (p) => p.set(0, top, 0) });
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

function bagPlace(fit, spec, dims, s) {
  const { torso } = fit;
  const out = new THREE.Vector3();
  if (spec.at === 'back') return out.set(0, -torso[1] * 0.05, -(torso[2] + dims[2] + 0.01));
  // Its strap is knitted at the bag's gauge, so the bag's drop from over the shoulder grows with
  // fit: hung at a fixed height, the bag swelled about it and its strap never changed. Its top
  // stays under the arm, its bottom off the floor.
  const sh = torso[1] * 1.15;
  const hang = (y) => clamp(sh - (sh - y) * s, fit.floor + dims[1] * 1.1, fit.shoulderY - fit.arm.r * 2 - dims[1]);
  if (spec.at === 'front') return out.set(torso[0] * 0.35, hang(-torso[1] * 0.7), torso[2] + dims[2] + 0.005);
  return out.set(torso[0] + dims[0] * 0.55, hang(-torso[1] * 0.75), torso[2] * 0.15);
}

/** Strap paths in the chest frame, and the body they lie on (R, the torso's padded radii). */
function strapPaths(fit, spec, body, dims) {
  const { torso } = fit;
  const pad = 0.012;
  const R = [Math.max(torso[0], fit.shoulderX * 0.8) + pad, torso[1] + pad, torso[2] + pad];
  const top = body.clone().setY(body.y + dims[1] * 0.9);
  if (spec.strap === 'cross') return { R, paths: [crossStrap(R, top, dims)] };
  if (spec.strap === 'short') return { R, paths: [shortStrap(fit, R, top, dims)] };
  return { R, paths: packStraps(R, top, body, dims) };
}

/**
 * From the bag's top in front, over the far shoulder, and down the back into its top behind: a loop
 * round the body over that shoulder, opened where it passes the bag. Closed round the body, it
 * never met the bag -- two pieces, the bag hung from nothing.
 */
function crossStrap(R, top, dims) {
  // The loop is where the plane through the far shoulder and the bag's top, standing front to back,
  // cuts the padded body: it lies on the body, wherever the bag hangs. A hoop sized from the torso
  // alone stood up to 1.6 torsos off it and hung past the bag. In p / R space the cut is a circle.
  // ponytail: one flat cut, so a pouch's strap runs on past it, ~0.1 lower, round the near hip; a
  // strap pulled level round the waist needs a second plane behind the bag.
  const S = new THREE.Vector3(-R[0] * 0.55, R[1] * 0.83, 0), radii = new THREE.Vector3(...R), n = 32;
  const m = new THREE.Vector3((top.y - S.y) * R[0], (S.x - top.x) * R[1], 0), c = (top.y - S.y) * S.x + (S.x - top.x) * S.y;
  const centre = m.clone().multiplyScalar(c / m.lengthSq()), r = Math.sqrt(Math.max(0, 1 - (c * c) / m.lengthSq()));
  const u = new THREE.Vector3(0, 0, 1), v = new THREE.Vector3().crossVectors(m, u).normalize();
  const loop = Array.from({ length: n }, (_, i) => centre.clone().addScaledVector(u, r * Math.cos((i / n) * TAU))
    .addScaledVector(v, r * Math.sin((i / n) * TAU)).multiply(radii));
  // Opened where it passes nearest the bag, both ends run on into the bag's top the way the loop
  // goes there. Opened at its lowest, a pouch in front took its back end straight through the body.
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

/**
 * A backpack's straps: from the bag's top over each shoulder, down the front, round under the arm
 * and back into the bag's lower corner -- on the body all the way. From the front straight back to
 * the bag, they ran through the body and showed as two arcs over the shoulders.
 */
function packStraps(R, top, body, dims) {
  const on = (x, y, z) => { const v = new THREE.Vector3(x, y, z); return v.divideScalar(Math.hypot(x / R[0], y / R[1], z / R[2])); };
  return [-1, 1].map((sd) => {
    const x = sd * R[0] * 0.45;
    // into the bag's top within its width, however wide the shoulders (an owl's wings) spread them
    return [new THREE.Vector3(sd * Math.min(R[0] * 0.45, dims[0] * 0.7), top.y, top.z + 0.005), on(x, R[1] * 0.95, -R[2] * 0.3), on(x, R[1] * 0.8, R[2] * 0.6),
      on(x * 1.3, R[1] * 0.2, R[2]), on(sd * R[0] * 0.8, -R[1] * 0.35, R[2] * 0.5), on(sd * R[0], -R[1] * 0.45, -R[2] * 0.2),
      new THREE.Vector3(body.x + sd * dims[0] * 0.7, body.y - dims[1] * 0.6, body.z + dims[2] * 0.4)];
  });
}

/**
 * A bag held up to show it (`f.held`: its selfie, selfie-studio.js snap), on the free paw like the
 * pot holder -- worn, a bag hangs at the hip or on the back, where no selfie reaches it. The body
 * stands on the paw in the hold's frame (see buildPotholder), the strap hanging from its top corners
 * down past the paw.
 * ponytail: no edge, trim or accessory in hand; add them if a held bag's close-up needs them.
 */
function buildHeldBag(fit, f) {
  const spec = BAG[f.silhouette] ?? BAG['shoulder bag'], paw = fit.holds[1];
  const [w, h, d] = spec.size.map((k, i) => k * fit.torso[i === 1 ? 1 : 0] * 0.5 * f.fit);
  const c = new THREE.Vector3(0, -d - 0.01, h * 0.8);
  // bagBody's up is y; the hold's is z (and its y runs out along the arm): a quarter turn about x
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
  // Width and depth from torso width, height from torso height; fit is the bag's size (3+ sizes).
  const dims = spec.size.map((k, i) => k * fit.torso[i === 1 ? 1 : 0] * 0.5 * f.fit);
  const centre = bagPlace(fit, spec, dims, f.fit);
  const fn = bagBody(dims, spec.round ?? 0, centre);
  const netted = spec.net ? { ...f, stitch: 'lace', stitchW: f.stitchW * 2, rowH: f.rowH * 2 } : f;
  const pieces = [piece(chest, panel(fn, netted, { closedU: true, minU: 32, minV: 20, from: () => centre.clone() }))];
  pieces.push(...bagStraps(fit, f, spec, { centre, dims }).map((geo) => piece(chest, flatColour(geo, trimColour(f)))));
  pieces.push(...edgePieces(chest, [ring(fn, 0.82)], f));
  return [...pieces, ...accessoryPieces(bagAnchors(fn, centre, chest, dims, fit.torso[0] * BUTTON_OF_TORSO * 0.8), f)];
}

/** A bag's straps: flat bands lying on the body (strapBand), its ends in the bag; a drawstring's cords stay cords. */
function bagStraps(fit, f, spec, { centre, dims }) {
  const { R, paths } = strapPaths(fit, spec, centre, dims);
  if (spec.strap === 'cords') return paths.map((pts) => tubeAlong({ pts, closed: false }, f.thick * 0.5, 6));
  // out from the torso, a padded ellipsoid: the gradient of its surface
  const normal = (p, out) => out.set(p.x / R[0] ** 2, p.y / R[1] ** 2, p.z / R[2] ** 2).normalize();
  // as wide as the body calls for, but never under 3.5 times the fabric is thick: or it is a cord.
  // Knitted at the bag's gauge, fit widens it with the bag: at a fixed width it never changed.
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

// ---------------------------------------------------------------- SOCKS

// How far up the shin each reaches (0 ankle .. 1 knee), whether it covers the foot, and extras.
// (An ankle sock was too like a crew one to tell apart.)
const SOCKS = {
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
    const leg = { spec, up, loose, bunch, thigh: spec.thigh ? { node: fit.joints.upperLeg[i].node, reach: spec.thigh * Math.min(1, s) } : null };
    pieces.push(...sockLeg(fit, f, node, leg, anchors));
  });
  const acc = spec.pom && f.accessory === 'none' ? { ...f, accessory: 'pom-pom' } : f;
  return [...pieces, ...accessoryPieces(anchors, acc)];
}

/**
 * One leg's sock, adding that leg's accessory anchors to `anchors`: on its shin joint, or -- over the
 * knee -- on its thigh's (overKnee).
 */
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

/**
 * An over-knee sock's leg: ONE tube, on the thigh's joint, from up the thigh past the knee to the
 * ankle, easing from the thigh's girth to the shin's across the knee, its stitches below the knee
 * following the shin (skinned, as a scarf's band follows the neck). Two tubes, one on each joint,
 * left an open step at the knee -- the thigh is the wider -- and a hole when it bent.
 * Both eases are 1 minus a rising smoothstep: three's smoothstep takes its edges low then high, and
 * given them high then low it gave the ankle half to the thigh and the thigh half to the shin -- a
 * bent knee turned the sock half a turn about it, two tubes sticking out like boomerangs.
 */
function overKnee(fit, f, shin, { node: thigh, reach, yBot, loose, bunch }) {
  const knee = shin.position.y, d = fit.leg.thighR;   // the shin's joint, in the thigh's frame
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

// ---------------------------------------------------------------- held: in the free paw
//
// Built on holds[1] (holds[0] is the phone in a selfie, the purchase in the shop), in the hold's
// frame as the carry pose leaves it (motion.js POSES.carry, elbows at 1.45): -y runs out along the
// forearm, +z is up. A straight arm swung forward leaves it the same way: selfie.js SHOW.

/**
 * How high, in a hold's frame (up is +z), the arm it is on reaches over the rectangle x in `xs`, y in
 * `ys`: the paw, and whatever the kit hung on the arm -- an owl's wing wraps its paw. Measured, as
 * every fit here is, so a held piece rests on top of what is there rather than through it.
 */
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

/**
 * A pot holder: a crocheted square lying flat on the upturned paw like a tray, parallel to the
 * floor, its loop at the far corner. Stood up on the paw, it cut through the paw in the picture; laid
 * just over the paw, it cut through an owl's wing. So it rests on whatever is highest under it
 * (armTopOver), a fabric's thickness clear, and runs out ahead of the paw.
 */
function buildPotholder(fit, f) {
  const s = fit.torso[0] * 0.75, paw = fit.holds[1];
  const z = Math.max(0.016, armTopOver(fit, paw, [-s / 2, s / 2], [0.04 - s, 0.04]) + f.thick * 1.5);
  const fn = (u, v, out) => out.set((u - 0.5) * s, 0.04 - v * s, z);
  const face = panel(fn, f, { from: (p) => p.setZ(p.z - 1) });
  const r = s * 0.08, far = 0.04 - s - r;
  const pts = Array.from({ length: 16 }, (_, i) => new THREE.Vector3(Math.sin((i / 16) * TAU) * r, far + Math.cos((i / 16) * TAU) * r, z));
  return [piece(paw, face), piece(paw, flatColour(tubeAlong({ pts, closed: true }, f.thick * 0.6, 6), f.colours[0]))];
}

/** A pile of folded knits carried on the forearm, bottom up: each fold a rounded slab of its own fabric. */
function buildPile(fit, f) {
  const w = fit.torso[0], paw = fit.holds[1];
  let z = 0;
  return f.folds.map((fold, i) => {
    const ff = forView(fabric(fold), fit), h = w * 0.07 + ff.thick;
    const c = new THREE.Vector3((i % 2 ? 1 : -1) * w * 0.05, -w * 0.4, z + h);
    z += 2 * h;
    // bagBody's up is y; the hold's is z (and its y runs out along the arm): a quarter turn about x
    const slab = bagBody([w * (0.6 + 0.06 * ((i * 7) % 3)), h, w * 0.45], 0.15, new THREE.Vector3());
    const fn = (u, v, out) => { slab(u, v, out); return out.set(c.x + out.x, c.y - out.z, c.z + out.y); };
    return piece(paw, panel(fn, ff, { closedU: true, minU: 24, minV: 8, from: () => c.clone() }));
  });
}

/** Decor types drawn in hand, by pattern type; and `pile`, an armful of folded knits. */
const HELD_BUILDERS = { potholder: buildPotholder };

/** What a held piece has that no pattern says: plain stitch, no edge, no trim. */
const PLAIN = Object.freeze({ fit: 1, silhouette: null, stitch: 'stockinette', edge: 'none', accessory: 'none' });

/**
 * A finished piece of decor (catalog.js `decor`: the pot holder) as { type, item } for dress(),
 * held in the free paw (HELD_BUILDERS), or null if nothing here can draw it. Decor is never worn
 * (WEARABLE-FINISHED-OBJ.md), so its photo shows it in hand.
 */
export function heldAs(wip, colourOf) {
  const type = wip.pattern?.patternType;
  if (!Object.hasOwn(HELD_BUILDERS, type)) return null;
  return { type, item: madeItem({ ...PLAIN, ...madeWith(wip, colourOf) }) };
}

/**
 * An armful of finished pieces (`buildPile`), as { type: 'pile', item } for dress(), or null: each
 * fold the fabric it would be worn or held in.
 */
export function pileAs(wips, colourOf) {
  const folds = wips.map((w) => (wornAs(w, colourOf) ?? heldAs(w, colourOf))?.item).filter(Boolean);
  return folds.length ? { type: 'pile', item: { ...folds[0], on: true, folds } } : null;
}

// ---------------------------------------------------------------- dressing

const BUILDERS = { hat: buildHat, scarf: buildScarf, shawl: buildShawl, sweater: buildSweater, bag: buildBag, socks: buildSocks,
  ...HELD_BUILDERS, pile: buildPile };

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
  // Its own family, one for the whole cast: the merge pass folds garments into a character's merged
  // meshes and uses this as it is -- a clone would drop the hatching and rim hooks.
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

/**
 * After skinning, a vertex inside an upper arm's capsule (armCapsules) goes straight out to its
 * surface: cloth the arm moves into is pushed aside, every frame, on the GPU. The capsule is carried
 * to the arm's present place by bones 3 and 4. garments.test.mjs mirrors offArm to check it.
 */
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
    .flatMap(([type, item]) => BUILDERS[type](fit, forView(fabric(item), fit)).map((p) => ({ ...p, type })));
}

/**
 * Runs `build` with the character in its rest pose, then puts its pose of the moment back: what is
 * worn is shaped round, and bound to, the body as it stands. Dressed mid-motion (the dress-up page
 * redresses on every change while it dances), a lean tilted everything hung from the chest, and a
 * shawl was cut round the arms where they swung -- off by up to 0.3m, and still off once redressed.
 */
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

/**
 * Put an outfit on a built character, replacing whatever it wore. One mesh per joint, whatever is
 * worn there (rule 3 at the top). Returns the meshes, which are also kept on `built.garments`.
 */
export function dress(built, outfit) {
  undress(built);
  if (outfit.hat?.on) coverUnderHat(built, fabric(outfit.hat));
  atRest(built, () => {
    const byJoint = new Map(), skinOf = new Map(), typesOf = new Map();
    for (const { joint, geo, skinTo, type } of outfitPieces(built, outfit)) {
      if (!byJoint.has(joint)) byJoint.set(joint, []);
      byJoint.get(joint).push(geo);
      typesOf.set(joint, new Set([...(typesOf.get(joint) ?? []), type]));
      // the longest list: a shawl's [neck, root, arms] starts with a scarf's [neck, root]
      if (skinTo && skinTo.length > (skinOf.get(joint)?.length ?? 0)) skinOf.set(joint, skinTo);
    }
    built.garments = [...byJoint].map(([joint, geos]) => garmentMesh(joint, geos, skinOf.get(joint)));
    // which types each merged mesh holds, so a viewer can find one item again (the selfie does)
    for (const mesh of built.garments) mesh.userData.worn = [...typesOf.get(mesh.parent)];
  });
  return built.garments;
}

/** Everything worn on one joint as one mesh, on it; skinned if part of it also follows `others`. */
function garmentMesh(joint, geos, others) {
  // still one mesh a joint: the rest of what is worn there follows the joint alone
  if (others) geos.forEach((g) => g.attributes.skinIndex || neckSkin(g, () => 0));
  // the merge needs them on every part: a part without arms gets a radius of 0, never pushed
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
  mesh.userData.dropOnMerge = ARM_ATTRIBUTES;   // the arm push needs this mesh's own skeleton
  joint.add(mesh);
  return mesh;
}

// mergeGeometries needs every part to carry exactly the same attributes.
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
