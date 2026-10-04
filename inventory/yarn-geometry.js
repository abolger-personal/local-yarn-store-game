// The yarn geometry families, as procedural builders.
//
// Geometry only: three.js, no DOM, no materials, no scene. This is `render/geometry/*` from
// ../ai_planning_sessions/DESIGN-DECISIONS.md §3 — the part P1-SPIKE-PLAN.md marks as
// "graduates to production", as opposed to the demo scene around it, which does not.
//
// Two conventions, both load-bearing:
//
// 1. **Unit space.** Every family fits the box x,z in [-0.5, 0.5], y in [0, 1], and SITS ON y = 0.
//    The caller scales at the mesh. This is the same lesson the owls taught (DESIGN-DECISIONS.md
//    §4: "shells are now built in unit space and scaled at the mesh"): a family that bakes in one
//    display's slot size cannot be shared between displays, and shared geometry is the whole
//    reason 1000 items cost one draw call.
//
// 2. **Silhouette first.** These shapes are all "round wound fibre" and will clone-stamp unless
//    their proportions are pushed apart harder than realism wants. The DDR is blunt about it —
//    "different silhouettes are what break clone-stamping, not different colours" — so the aspect
//    ratios below are deliberately exaggerated, and `familyAspect()` exists to keep them that way.
import * as THREE from 'three';

/** Tessellation tiers. The same axis the project already ships as a player-facing quality setting. */
export const TIERS = Object.freeze(['chunky', 'low', 'med']);
export const tierIndex = (t) => Math.max(0, TIERS.indexOf(t));

// Six. The HANK was cut after the 09-08 look: draping it stopped it being a donut, but it never
// earned its slot — it is a loop of yarn next to a skein, which is also a loop of yarn, and the
// hole in its outline was not worth a whole family. Cutting it also removes the one shape that
// was crowding the booklet on proportions.
export const YARN_FAMILIES = Object.freeze(['ball', 'cake', 'skein', 'cone', 'mini', 'booklet']);

// Per-tier segment counts, indexed by tier. Pulled out so the poly budget is readable in one place
// rather than scattered through seven builders.
const SEG = {
  ball:    { w: [8, 12, 16], h: [6, 8, 12] },
  cake:    { w: [8, 12, 16] },
  cone:    { w: [8, 12, 16] },
  skein:   { r: [5, 6, 8], t: [12, 16, 24] },
  mini:    { r: [4, 5, 6], t: [8, 12, 16] },
};

const v2 = (x, y) => new THREE.Vector2(x, y);

/**
 * A cake is a centre-pull ball off a winder: a squat cylinder with a dip in the top. The dip is the
 * whole point — it is the only thing separating a cake from a ball once both are 40px across.
 */
const CAKE_PROFILE = [
  [0.08, 0.00], [0.48, 0.00], [0.50, 0.10], [0.50, 0.66], [0.46, 0.74], [0.20, 0.74], [0.14, 0.62],
].map(([x, y]) => v2(x, y));

/** A mill cone: tall and sharply tapered, so it reads as a triangle in silhouette. */
const CONE_PROFILE = [
  [0.06, 0.00], [0.34, 0.00], [0.31, 0.07], [0.13, 0.90], [0.08, 1.00], [0.03, 1.00],
].map(([x, y]) => v2(x, y));

/**
 * The skein — the hero shape, and the hardest.
 *
 * A **figure eight**, per the 09-08 feedback: the first version rode a 3-cycle wobble on a closed
 * ellipse and read, fairly, as a garlic knot. The figure eight is also the more honest primitive.
 * A real twisted hank is a loop folded once and twisted back on itself, which is a lemniscate —
 * the crossing in the middle is the fold, and it is exactly the "stick pretzel" read that was
 * asked for. A trefoil-ish wobble is a knot, which is a different object.
 *
 * Gerono's lemniscate, because it is the one that stays a clean figure eight rather than pinching
 * to a cusp at the crossing: x = cos t, z = sin 2t / 2.
 *
 * `twist` lifts the strand so the two passes cross OVER and UNDER each other rather than through
 * each other. It has to be `sin(t)`, one lift per loop — NOT `sin(2t)`.
 *
 * That distinction is the whole thing and it is easy to get wrong: the crossings are at t = pi/2
 * and 3pi/2, and `sin(2t)` is exactly ZERO at both, so a 2-cycle lift separates the passes by
 * precisely nothing and the tube runs through itself. `sin(t)` is at its extremes there, so the
 * strand is at its highest on one pass and its lowest on the other — which is what a fold is.
 *
 * The twist must also exceed the tube RADIUS, or the two passes still overlap even when their
 * centrelines differ. Checked in yarncheck.mjs, because it is invisible from outside: a
 * self-intersecting tube renders as a perfectly plausible pretzel right up until it z-fights.
 */
function skeinCurve(length, thickness, twist) {
  const pts = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      length * Math.cos(t),
      0.5 + twist * Math.sin(t),
      thickness * Math.sin(2 * t) / 2,
    ));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

/**
 * Each family in unit space. Every builder ends by seating its result on y = 0 and centring it in
 * x/z, so no builder has to get the bookkeeping right by hand — see `seat()`.
 */
const BUILDERS = {
  // Slightly oblate: a perfect sphere reads as a bouncy ball, a squashed one as something soft
  // that has been sitting on a shelf.
  ball: (t) => new THREE.SphereGeometry(0.5, SEG.ball.w[t], SEG.ball.h[t]).scale(1, 0.92, 1),

  cake: (t) => new THREE.LatheGeometry(CAKE_PROFILE, SEG.cake.w[t]),

  cone: (t) => new THREE.LatheGeometry(CONE_PROFILE, SEG.cone.w[t]),

  // 0.35 + the 0.135 tube radius = 0.485, inside the unit box with room for the Catmull-Rom to
  // overshoot slightly between control points. At 0.40 it burst the box, which would have scaled
  // the skein wrong in every slot it ever sat in.
  // Built with enough twist to clear itself, then SQUASHED — and the order matters.
  //
  // The twist has to exceed the tube radius or the two passes of the eight intersect (see
  // skeinCurve). But raising it to 0.17 to achieve that also made the skein much rounder in
  // profile — 0.62 tall against its length, up from 0.44 — and a thick figure eight reads as a
  // knot rather than as a skein. Squashing afterwards fixes the profile without undoing the
  // clearance: the separation and the tube both shrink together, so the passes stay apart.
  //
  // It is also what the object actually does. A skein lying on a shelf is a soft bundle settling
  // under its own weight, so an elliptical cross-section is truer than a round one.
  //
  // Squashing is SAFE for the clearance at any factor, which is why it is the right lever: it
  // scales the separation between the two passes and the thickness of the tube by the same amount,
  // so their ratio is invariant. Only the twist and the tube radius can bring them together.
  skein: (t) => new THREE.TubeGeometry(
    skeinCurve(0.35, 0.13, 0.17), SEG.skein.t[t], 0.125, SEG.skein.r[t], true).scale(1, 0.58, 1),

  // Not just a scaled skein. P1-SPIKE-PLAN.md flags this one specifically — "must read as
  // distinct, since these come in bundles" — and a uniformly shrunk skein has, by definition, the
  // SAME proportions, so at shelf distance it is the same object. familyAspect() caught exactly
  // that: a 0.26-long copy sat 0.038 away from the skein, effectively a duplicate.
  //
  // So the mini is stubby rather than small: barely longer than it is round, with a fat tube and a
  // tight twist. It reads as a chunky little bundle next to a long twisted log.
  // Squashed harder than the skein: it is short, so the same twist leaves it proportionally much
  // rounder — it measured 0.86 tall against its length, which is a ball with a dent in it.
  mini: (t) => new THREE.TubeGeometry(
    skeinCurve(0.20, 0.082, 0.155), SEG.mini.t[t], 0.115, SEG.mini.r[t], true).scale(1, 0.50, 1),

  // A pattern booklet STANDS. It is the only hard-edged, planar thing in the set, and standing it
  // up is what makes it punctuate a shelf of round objects rather than disappearing under them.
  booklet: () => new THREE.BoxGeometry(0.68, 0.90, 0.11),
};

/** Centre in x/z and seat on y = 0, so every family agrees on where the shelf is. */
function seat(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** One family's geometry, in unit space, at one tessellation tier. */
/** @param {string} name @param {number|string} [tier] index into TIERS, or its name */
export function buildFamily(name, tier = 1) {
  const make = BUILDERS[name];
  if (!make) throw new Error(`unknown yarn family: ${name}`);
  return seat(make(typeof tier === 'string' ? tierIndex(tier) : tier));
}

/**
 * How many slots a family takes at bulk 1.
 *
 * A skein is a LOG — long and thin — and sizing it 1x1 like everything else made it read as the
 * same object as a mini-skein, which is the one comparison P1-SPIKE-PLAN.md specifically warns
 * about. Two slots is also just what a skein is next to a ball: the shape is the reason it needs
 * the room, so the footprint belongs with the geometry rather than with whoever stocks the shelf.
 */
export const FAMILY_FOOTPRINT = Object.freeze({
  ball:    [1, 1],
  cake:    [1, 1],
  cone:    [1, 1],
  skein:   [2, 1],
  mini:    [1, 1],
  booklet: [1, 1],
});

/**
 * A family's footprint at a given bulk (YARN.md's 1x1x1 .. 3x3x3).
 *
 * Bulk grows the SHORT axis and adds the same amount to the long one, rather than multiplying:
 * a bulky skein at 2x scale would be 4x2 and could not fit a 5-wide shelf beside anything else.
 */
/** @returns {[number, number]} */
export const familyFootprint = (name, bulk = 1) => {
  const [w, h] = FAMILY_FOOTPRINT[name] ?? [1, 1];
  return [w + bulk - 1, h + bulk - 1];
};

/** Every family at one tier, as { name: geometry }. */
export const buildAll = (tier = 1) =>
  Object.fromEntries(YARN_FAMILIES.map((n) => [n, buildFamily(n, tier)]));

/**
 * The ball band: a contrasting paper ring, as a separate instanced family.
 *
 * DESIGN-DECISIONS.md §2 already settled the why — a second family "keeps the band's colour
 * independent of the yarn's, which is the entire readability win" — and it is the single largest
 * legibility lever in the set, because it breaks a plain blob into two colour regions that survive
 * being 40px across.
 *
 * `axis: 'x'` wraps the band around a log lying down (skein, mini); `'y'` around something
 * standing (ball, cake, cone). A booklet's cover IS its label, so it declines one.
 */
// `y` is a FRACTION of the family's own height, not an absolute — the families do not all reach
// the top of the unit box (a seated skein is only 0.47 tall), so an absolute height that suited a
// ball left the skein's band floating in the air above it.
export const BANDS = Object.freeze({
  ball:    { r: 0.53, y: 0.50, h: 0.30, axis: 'y' },
  cake:    { r: 0.53, y: 0.49, h: 0.34, axis: 'y' },
  // Raised clear of the base flare, and narrowed to match. The first placement spanned y
  // 0.030-0.230 at r 0.31, but the cone's foot is r 0.34 flaring to 0.31 over its first 0.07 —
  // so the base poked straight through the bottom edge of the band. A straight cylinder on a
  // taper has to sit where the taper across its own height is small: this one spans 0.23-0.33,
  // where the cone runs 0.275 down to 0.254.
  cone:    { r: 0.285, y: 0.28, h: 0.10, axis: 'y' },
  // Wraps the whole BUNDLE at the crossing, where the two passes of the eight sit one above the
  // other — not the single tube. Retuned when the skein was squashed: the bundle is shorter now,
  // so a band sized for the unsquashed one stood off it like a hoop.
  skein:   { r: 0.215, y: 0.50, h: 0.26, axis: 'x' },
  mini:    { r: 0.178, y: 0.50, h: 0.20, axis: 'x' },
  booklet: null,
});

// Resolving `y` needs the family's built height, and bandMatrix is called per item per redraw, so
// the heights are memoised on first use rather than rebuilt each time.
const _height = new Map();
const familyHeight = (name) => {
  if (!_height.has(name)) _height.set(name, buildFamily(name, 1).boundingBox.max.y);
  return _height.get(name);
};

/** An open-ended cylinder: the band is a wrapper, so it has no end caps to draw. */
/** @param {number|string} [tier] */
export const buildBand = (tier = 1) =>
  new THREE.CylinderGeometry(1, 1, 1, [10, 14, 18][typeof tier === 'string' ? tierIndex(tier) : tier],
                             1, true);

const _rz = new THREE.Matrix4();
const _tz = new THREE.Matrix4();

/** Where one family's band sits, as a matrix in that family's unit space. Null if it has none. */
export function bandMatrix(name, target = new THREE.Matrix4()) {
  const b = BANDS[name];
  if (!b) return null;
  // buildBand's cylinder is radius 1, height 1, so the scale IS the radius and height.
  target.makeScale(b.r, b.h, b.r);
  if (b.axis === 'x') target.premultiply(_rz.makeRotationZ(Math.PI / 2));
  return target.premultiply(_tz.makeTranslation(0, b.y * familyHeight(name), 0));
}

/**
 * The loose yarn end: one little curl of strand per item.
 *
 * Asked for in the 09-08 feedback, and it is the cheapest anti-sameyness lever left — it adds a
 * *hand-drawn* read that no amount of proportion tuning can, because it says "someone wound this"
 * rather than "this is a shape".
 *
 * Structurally it is the ball band again: one more instanced family, one matrix per yarn family,
 * one extra draw call for the whole shop. And because the inverted hull outlines whatever geometry
 * it is given, a tail built as a thin tube gets its ink line for free — which is what makes it
 * read as a drawn detail rather than a piece of modelling.
 */
function tailCurve() {
  const pts = [];
  // A curl: one and a bit turns of a shrinking spiral, falling as it goes. Not a full loop —
  // a loose end that has curled, not a coil.
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 2.3;
    const r = 0.42 * (1 - 0.55 * t);
    pts.push(new THREE.Vector3(Math.cos(a) * r, -0.55 * t, Math.sin(a) * r * 0.7));
  }
  return new THREE.CatmullRomCurve3(pts, false);
}

/** @param {number|string} [tier] */
export const buildTail = (tier = 1) => {
  const t = typeof tier === 'string' ? tierIndex(tier) : tier;
  return new THREE.TubeGeometry(tailCurve(), [8, 12, 16][t], 0.075, [3, 4, 5][t], false);
};

/**
 * Where each family's end sits, and how big, in that family's unit space.
 *
 * Deliberately varied per family rather than placed by one rule: the feedback asked for it
 * "curled around the base, or sticking up, or drawn from the outline in under the ball band", and
 * that variety is the point — a tail in the same spot on all seven would be one more thing that
 * makes them look alike.
 */
export const TAILS = Object.freeze({
  // Over the CROWN, not under the band. The first placement put it at 0.66 of the ball's height on
  // a 0.42 radius — which is inside the band cylinder (0.53 radius, spanning 0.31-0.61), so it was
  // completely hidden. A tail has to clear the band in height or in radius; on a sphere the crown
  // is the only place with room, and a strand curling over the top reads well anyway.
  ball:    { at: [0.22, 0.88, 0.17], size: 0.26, spin: 0.6 },
  cake:    { at: [0.00, 0.74, 0.00], size: 0.32, spin: 0.0 },   // up out of the centre pull
  skein:   { at: [0.34, 0.44, 0.10], size: 0.26, spin: 2.2 },   // off one lobe of the eight
  mini:    { at: [0.22, 0.46, 0.08], size: 0.20, spin: 2.0 },
  // A CONE has none. It read as weird on the 09-08 look, and there is a reason: a mill cone is
  // machine-wound onto a spool, so a loose hand-curled end is the wrong story for it. Its band
  // sits low and its taper is already the detail that distinguishes it.
  cone:    null,
  booklet: null,                                                 // a book has no yarn end
});

const _ts = new THREE.Matrix4();
const _tr = new THREE.Matrix4();

/** One family's yarn-end transform, in its unit space. Null if it has none. */
export function tailMatrix(name, target = new THREE.Matrix4()) {
  const t = TAILS[name];
  if (!t) return null;
  target.makeScale(t.size, t.size, t.size);
  target.premultiply(_tr.makeRotationY(t.spin));
  return target.premultiply(_ts.makeTranslation(t.at[0], t.at[1] * familyHeight(name), t.at[2]));
}

// ---------------------------------------------------------------- measuring the set

export const triangleCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/**
 * A family's bounding-box proportions, as [width, height, depth] normalised so the largest is 1.
 *
 * This is the objective half of the silhouette test. Two families whose aspect vectors are close
 * together will read as the same object at shelf distance however differently they are shaded, so
 * this is the number to watch when tuning a shape — and the one a self-check can assert on, which
 * "does it look distinct" cannot be.
 */
const _extent = new Map();

/**
 * A family's raw bounding-box extent in unit space, as [w, h, d].
 *
 * Needed because the families do NOT all fill the unit box: a skein is 0.44 tall, a cone is 1.00.
 * Anything that scales a family into a slot has to know that, or it will squash and stretch each
 * shape by a different arbitrary amount — which is exactly how a flat figure-eight skein becomes a
 * donut when the shelf gap goes up.
 */
/** @param {string} name @param {number|string} [tier] */
export function familyExtent(name, tier = 1) {
  const cacheKey = `${name}@${tier}`;
  if (_extent.has(cacheKey)) return _extent.get(cacheKey);
  const g = buildFamily(name, tier);
  const b = g.boundingBox;
  const out = Object.freeze([b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]);
  g.dispose();
  _extent.set(cacheKey, out);
  return out;
}

/**
 * How far an item may be squashed to meet the layer grid. Only ever a SQUASH, never a stretch:
 * drawn height must not exceed reserved height or the thing above it overlaps, which is the bug
 * this whole path exists to avoid. With a fine pitch the correction is a couple of percent.
 */
export const SETTLE_MIN = 0.82;

/**
 * Fit a yarn family into the slots its footprint gives it, WITHOUT wrecking its proportions.
 *
 * Lives here rather than in a page because both pages need it and the two must not drift — the
 * same lesson `pick-place.js` came out of. It replaces scaling x, y and z independently to fill
 * the slot box, which had two consequences that looked like separate bugs and were the same one:
 *
 *   - **Donuts.** A skein is 1.00 x 0.44 x 0.40 by design — a flat figure eight. Stretching y to
 *     fill a tall layer turned it into a fat ring. Every family was distorted by a different
 *     arbitrary amount, because none of them fill the unit box equally.
 *   - **Floating.** The reverse of the same thing: a family whose unit height is 0.44 drew only
 *     44% of the height it had RESERVED, so whatever stacked on top sat on empty air.
 *
 * So: one uniform scale from the footprint, and then the LAYER COUNT is derived from the height
 * that produces — rather than the layer count being assumed and the shape stretched to meet it.
 * A flat skein therefore reserves fewer layers than a round ball of the same footprint, which is
 * both what fixes the float and what is physically true.
 *
 * The footprint is passed in rather than derived, because the two callers disagree about where a
 * footprint comes from and both are right: the demo takes it from the geometry
 * (`familyFootprint`, so a skein is 2x1 and cannot be mistaken for a mini-skein), while the shop
 * takes it from `catalog.js`, where a yarn's footprint is its WEIGHT and decides how many units
 * toward a pattern the ball is worth.
 *
 * @param {string} family
 * @param {number} footW  footprint width in slots
 * @param {number} footD  footprint depth in slots
 * @param {{cell: number, boxHeight: number, fill?: number, tier?: number|string,
 *          settleMin?: number}} grid
 */
export function yarnFit(family, footW, footD,
                        { cell, boxHeight, fill = 0.9, tier = 1, settleMin = SETTLE_MIN }) {
  const [uw, uh, ud] = familyExtent(family, tier);
  // One scale for both horizontal axes: whichever of width or depth runs out first.
  const k = Math.min((footW * cell * fill) / uw, (footD * cell * fill) / ud);
  const natural = k * uh;
  // CEIL, not round: the reservation must be at least as tall as the thing in it. Rounding down
  // and stretching the slot to fit is how a ball came to poke 15% out of the top of its own
  // reservation and into whatever was stacked above.
  const layers = Math.max(1, Math.ceil((natural * settleMin) / boxHeight));
  // Then settle DOWN into the reservation, so the top of the item is the top of its layers and the
  // next item rests on it rather than on air. Capped at 1: never stretched.
  const settle = Math.min(1, (layers * boxHeight) / natural);
  return { k, ky: k * settle, layers, w: footW, h: footD };
}

const _aspect = new Map();

/** @param {string} name @param {number|string} [tier] */
export function familyAspect(name, tier = 1) {
  // Memoised: this is a pure function of (family, tier), and the demo polls it for the overlay.
  // Rebuilding a geometry per call would also leak one per call, since nothing disposes them.
  const cacheKey = `${name}@${tier}`;
  if (_aspect.has(cacheKey)) return _aspect.get(cacheKey);
  const g = buildFamily(name, tier);
  const b = g.boundingBox;
  const d = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  const m = Math.max(...d);
  const out = Object.freeze(d.map((v) => v / m));
  g.dispose();
  _aspect.set(cacheKey, out);
  return out;
}

/** How far apart two families are in proportion. Bigger is more distinguishable. */
/** @param {string} a @param {string} b @param {number|string} [tier] */
export const aspectDistance = (a, b, tier = 1) => {
  const [p, q] = [familyAspect(a, tier), familyAspect(b, tier)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const _relief = new Map();

const DOWN = new THREE.Vector3(0, -1, 0);

/** Grid nodes per side of a family's relief map. 48 puts a node every ~2% of the family's width. */
const RELIEF_N = 48;

/**
 * A family's real top and bottom surfaces, as heights over its footprint — in unit space, measured
 * from the bottom of its bounding box. NaN where there is no yarn at that point.
 *
 * Read off the mesh with one vertical ray per node, because the bounding box is the wrong answer
 * for anything round: a ball's top is that high only at its very middle, and its bottom touches
 * down only there. Stacking at the box height is what drew a ball perched off-centre on another
 * hovering over its shoulder. Interpolated bilinearly where all four nodes hit; at the rim, where
 * some miss, the highest top and lowest bottom of those that hit, which errs towards a hair of air
 * rather than overlap.
 *
 * @param {string} name @param {number|string} [tier]
 * @returns {{top: (x: number, z: number) => number, bottom: (x: number, z: number) => number}}
 */
export function familyRelief(name, tier = 1) {
  const cacheKey = `${name}@${tier}`;
  if (_relief.has(cacheKey)) return _relief.get(cacheKey);
  const geo = buildFamily(name, tier);
  const b = geo.boundingBox.clone();
  const { top, bottom } = castRelief(geo, b);
  geo.dispose();
  const out = {
    top: (x, z) => sampleRelief(top, b, x, z, Math.max),
    bottom: (x, z) => sampleRelief(bottom, b, x, z, Math.min),
  };
  _relief.set(cacheKey, out);
  return out;
}


/** One vertical ray per node of the relief grid: the highest and lowest yarn under it, or NaN. */
function castRelief(geo, b) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const N = RELIEF_N, size = (N + 1) * (N + 1);
  const top = new Float32Array(size).fill(NaN), bottom = new Float32Array(size).fill(NaN);
  // Nudged off the exact node: a ray straight through a pole vertex can report one hit, not two.
  const at = (i, lo, hi) => lo + ((hi - lo) * i) / N + 1e-5;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      ray.set(new THREE.Vector3(at(i, b.min.x, b.max.x), b.max.y + 1, at(j, b.min.z, b.max.z)), DOWN);
      const ys = ray.intersectObject(mesh).map((h) => h.point.y - b.min.y);
      if (ys.length) { top[j * (N + 1) + i] = Math.max(...ys); bottom[j * (N + 1) + i] = Math.min(...ys); }
    }
  return { top, bottom };
}

/** One relief map at (x, z): bilinear inside the yarn, `edge` of the nodes that hit at its rim. */
function sampleRelief(map, b, x, z, edge) {
  const N = RELIEF_N;
  const fx = ((x - b.min.x) / (b.max.x - b.min.x)) * N, fz = ((z - b.min.z) / (b.max.z - b.min.z)) * N;
  if (!(fx >= 0 && fx <= N && fz >= 0 && fz <= N)) return NaN;
  const i = Math.min(N - 1, Math.floor(fx)), j = Math.min(N - 1, Math.floor(fz));
  const tx = fx - i, tz = fz - j, row = N + 1;
  const v = [map[j * row + i], map[j * row + i + 1], map[(j + 1) * row + i], map[(j + 1) * row + i + 1]];
  if (v.every(Number.isFinite))
    return (v[0] * (1 - tx) + v[1] * tx) * (1 - tz) + (v[2] * (1 - tx) + v[3] * tx) * tz;
  const hit = v.filter(Number.isFinite);
  return hit.length ? edge(...hit) : NaN;
}

/**
 * An item's solid, for settling one thing onto another (pick-place.js settledBase): its top and
 * bottom as heights above its own base at an offset (dx, dz) from its centre, NaN off it, and a
 * radius that bounds it. `family` null is a box — a notion or a pattern — filling its footprint to
 * `fill` and `boxHeight` per layer, flat top and bottom. Yarn is drawn the way yarn.js draws it:
 * one horizontal scale from yarnFit, settled vertically, turned by the item's yaw.
 *
 * @param {string|null} family
 * @param {{w: number, h: number, layers?: number, yaw?: number}} item
 * @param {{cell: number, boxHeight: number, fill?: number, tier?: number|string}} grid
 */
export function restingSolid(family, item, grid) {
  const { cell, boxHeight, fill = 0.9, tier = 1 } = grid;
  const cos = Math.cos(item.yaw ?? 0), sin = Math.sin(item.yaw ?? 0);
  // World offset into the item's own frame: the inverse of the yaw yarn.js draws it with.
  const local = (dx, dz) => [dx * cos - dz * sin, dx * sin + dz * cos];
  if (!family) {
    const hw = (item.w * cell * fill) / 2, hd = (item.h * cell * fill) / 2;
    const tall = boxHeight * (item.layers ?? 1);
    const inside = (dx, dz) => { const [x, z] = local(dx, dz); return Math.abs(x) <= hw && Math.abs(z) <= hd; };
    return { top: (dx, dz) => (inside(dx, dz) ? tall : NaN), bottom: (dx, dz) => (inside(dx, dz) ? 0 : NaN),
             r: Math.hypot(hw, hd) };
  }
  const { k, ky } = yarnFit(family, item.w, item.h, { cell, boxHeight, fill, tier });
  const relief = familyRelief(family, tier);
  const [uw, , ud] = familyExtent(family, tier);
  const at = (fn) => (dx, dz) => { const [x, z] = local(dx, dz); return fn(x / k, z / k) * ky; };
  return { top: at(relief.top), bottom: at(relief.bottom), r: (k * Math.hypot(uw, ud)) / 2 };
}
