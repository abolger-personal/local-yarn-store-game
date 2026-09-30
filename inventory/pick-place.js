// Pick and place: turning a pointer into a slot.
//
// Extracted from characters/store.html, which had grown the better version — a forgiving
// screen-space pick, a snap that finds the nearest slot an item actually FITS in, and multi-layer
// awareness throughout — while inventory/stash-and-stuff.html still ran the original one-plane,
// one-layer code it was ported from. Two copies of a mechanic this fiddly is how the demo ends up
// silently disagreeing with the game about what a click means, which is exactly what happened:
// the demo dropped a three-layer bulky yarn back into a single layer, because its `place()` calls
// predated items having heights at all.
//
// The decisions here are recorded in ../ai_planning_sessions/inventory/DESIGN-DECISIONS.md §7 and
// are NOT re-litigated:
//
//   - Click to pick up, click again to put down. Not press-and-hold, which was hard on the hands
//     for the core moment-to-moment mechanic.
//   - Cast a display's own slot PLANE and convert the hit to a column in O(1); never raycast the
//     items themselves. They are instanced, so they are not scene objects to begin with.
//   - Be forgiving. An ink drawing occupies a fraction of its slot, and a fingertip is bigger than
//     a slot, so an exact hit test feels like the item is not where it looks.
//
// This module owns the GEOMETRY of picking, not the app's drag bookkeeping: it answers "what is
// under the pointer" and "where would this land", and the caller decides what to do about it. It
// needs a small adapter because the two scenes differ on exactly two points — how a shelf level is
// positioned (store.html tilts them 45°; the demo stacks them flat) and how tall an item is.

import * as THREE from 'three';
import { EMPTY, gridSize, topAt, columnAt, slotRect, footprint, fits, place, nearestSlot }
  from './grid.js';

/**
 * @param {object} opts
 * @param opts.camera
 * @param opts.displays    () => iterable of displays, each { g, ... }
 * @param opts.items       () => the item array
 * @param opts.levelFrame  (disp, shelf) => Matrix4, that level's frame in world space
 * @param opts.itemHeight  (disp, item) => its TOP surface, measured above its level's origin
 * @param opts.itemTall    (disp, item) => how tall the item ITSELF is. Defaults to 0, which makes
 *                         a pick behave as it did when everything was one layer: tested against
 *                         its top face alone. Pass it and a tall thing is grabbable by its body.
 * @param opts.exposed     (disp, items, index) => may this item be lifted right now
 * @param opts.grabRadius  () => screen-space slack in CSS px
 * @param opts.snapCells   () => how far a drop reaches, in slots
 */
export function makePicker(opts) {
  const k = pickerState(opts);
  // snapTo is the drop target: the nearest slot the item FITS in, within reach of the pointer —
  // turning it a quarter turn if that is what makes it fit. The turn is not a convenience. A 2x1
  // skein against a one-column peg board has no legal placement at all as-given, while the 1x2 is
  // obviously legal, so without it the display reads as broken. Making the player rotate first
  // would be asking them to run the search by hand.
  return {
    castLocal: (disp, shelf, height) => castLocal(k, disp, shelf, height),
    slotScreenPos: (disp, shelf, item, height) => slotScreenPos(k, disp, shelf, item, height),
    pickCandidate: (event) => pickCandidate(k, event),
    hoverTarget: (event) => hoverTarget(k, event),
    displayPoint: (disp, shelf, event) => displayPoint(k, disp, shelf, event),
    snapTo: (disp, shelf, item, x, z) => nearestSlot(disp.g, shelf, item, [x, z], { reach: k.snapCells() * disp.g.cell }),
    setRay: (event) => setRay(k, event),
    raycaster: k.raycaster,
  };
}

/** One picker's options, with their defaults, and the ray and scratch vectors it reuses. */
function pickerState(opts) {
  const {
    camera, displays, items, levelFrame, itemHeight,
    itemTall = () => 0,
    exposed = () => true,
    grabRadius = () => 44,
    snapCells = () => 1.6,
  } = opts;
  return {
    camera, displays, items, levelFrame, itemHeight, itemTall, exposed, grabRadius, snapCells,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    pickPlane: new THREE.Plane(),
    _hit: new THREE.Vector3(), _n: new THREE.Vector3(), _planePt: new THREE.Vector3(),
    _localPt: new THREE.Vector3(), _ndc: new THREE.Vector3(), _inv: new THREE.Matrix4(),
  };
}

function setRay(k, event) {
  k.pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  k.raycaster.setFromCamera(k.pointer, k.camera);
}

/**
 * Intersect the plane "local Y = height" of one shelf level, and return the hit in that level's
 * LOCAL coordinates.
 *
 * This is what lets a shelf turned 90° against a side wall — or tilted 45° like a Montessori
 * bookshelf — use exactly the same column maths as a flat table: the frame does the rotating and
 * columnAt() never learns about it.
 *
 * Returns plain numbers rather than a shared Vector3, deliberately: callers compare hits from
 * many displays and levels in one pass, and cannot have a later call overwrite an earlier one.
 */
function castLocal(k, disp, shelf, height = 0) {
  const F = k.levelFrame(disp, shelf);
  k._n.set(0, 1, 0).transformDirection(F);
  k._planePt.set(0, height, 0).applyMatrix4(F);
  k.pickPlane.setFromNormalAndCoplanarPoint(k._n, k._planePt);
  const hit = k.raycaster.ray.intersectPlane(k.pickPlane, k._hit);
  if (!hit) return null;
  const distSq = k.raycaster.ray.origin.distanceToSquared(hit);
  k._localPt.copy(hit).applyMatrix4(k._inv.copy(F).invert());
  return { x: k._localPt.x, z: k._localPt.z, distSq };
}

/** Where a point on a slot's axis lands on screen, in CSS px, or null if behind the camera. */
function slotScreenPos(k, disp, shelf, item, height = k.itemHeight(disp, item)) {
  const rect = slotRect(disp.g, item.c, item.r, item.w, item.h);
  k._ndc.set(rect.x, height, rect.z)
    .applyMatrix4(k.levelFrame(disp, shelf))
    .project(k.camera);
  if (k._ndc.z > 1) return null;   // behind the camera projects to a mirrored point; reject it
  return { x: (k._ndc.x * 0.5 + 0.5) * innerWidth, y: (-k._ndc.y * 0.5 + 0.5) * innerHeight };
}

/**
 * Screen distance from the pointer to the item's VERTICAL AXIS — bottom of the thing to top of
 * it — rather than to the single point on top of it.
 *
 * On a one-layer notion box, 15px tall on screen, the difference is nothing. On a super-bulky
 * cone, 60px tall, measuring from the top face puts the whole lower half of the object outside a
 * 22px grab radius: the player clicks the middle of something they can plainly see and nothing
 * happens. The taller the item the harder it was to pick up, which is exactly backwards.
 */
function axisDistance(k, { disp, shelf, item }, px, py) {
  const top = slotScreenPos(k, disp, shelf, item);
  if (!top) return null;
  const base = slotScreenPos(k, disp, shelf, item, k.itemHeight(disp, item) - k.itemTall(disp, item));
  if (!base) return Math.hypot(top.x - px, top.y - py);
  const dx = base.x - top.x, dy = base.y - top.y;
  const len2 = dx * dx + dy * dy;
  // t clamped to [0,1]: past either end the nearest point IS that end, which is what keeps this
  // a distance to the object rather than to the infinite line running through it.
  const t = len2 < 1e-9 ? 0
    : Math.min(1, Math.max(0, ((px - top.x) * dx + (py - top.y) * dy) / len2));
  return Math.hypot(top.x + dx * t - px, top.y + dy * t - py);
}

/**
 * What the player clicked on, across EVERY display and EVERY shelf level.
 *
 * Each occupied column is tested against ITS OWN plane, so there is no parallax to correct: a
 * single cast at the shelf FLOOR while the player clicked a box TOP is off by over half a slot at
 * a diorama angle, which frequently landed outside the lattice altogether.
 *
 * That plane is the item's MIDDLE, not its top. A diorama angle turns a height difference into a
 * horizontal offset — half the item's height over the tangent of the camera's elevation — and
 * from the top face of a three-layer ball that offset is most of a slot, so a click on the front
 * of the ball tested a column in front of the ball. Measuring from the middle halves the worst
 * case and centres it, which is what makes a tall item grabbable over its whole body rather
 * than only near its lid.
 *
 * FORGIVING. An exact hit wins outright; failing that, the nearest box within a SCREEN-SPACE
 * radius. Screen space, not world space, is the point — the tolerance has to mean the same thing
 * to a fingertip whatever the zoom, the resolution or the viewing angle. Still never raycasts an
 * item: these are plane intersections and a projection, a few dozen per press.
 */
function pickCandidate(k, event) {
  setRay(k, event);
  const px = event.clientX, py = event.clientY;
  // A finger needs the full 44px; a mouse is precise enough that a big radius would start
  // grabbing things the user was clearly not pointing at.
  const radius = k.grabRadius() * (matchMedia('(pointer: coarse)').matches ? 1 : 0.5);
  const all = k.items();
  const best = { exact: null, near: null };

  for (const disp of k.displays()) {
    for (let s = 0; s < disp.g.shelves; s++) {
      for (let r = 0; r < disp.g.rows; r++) {
        for (let c = 0; c < disp.g.cols; c++) weighCell(k, { disp, s, c, r, all, px, py, radius }, best);
      }
    }
  }
  return best.exact ?? best.near;
}

/** One column of the pick: its top item, if it may be lifted, as an exact hit or a near miss. */
function weighCell(k, cell, best) {
  const { disp, s, c, r, all } = cell;
  const index = topAt(disp.g, s, c, r);
  if (index === EMPTY) return;
  // A package bridging two columns with something stacked on its other half is not
  // grabbable — lifting it would pop that column too and evict whatever sits there.
  if (!k.exposed(disp, all, index)) return;
  const item = all[index];
  // Consider each package once, from its anchor cell. This is now purely about not doing
  // the same work four times for a 2x2 — `slotScreenPos` measures from the item's own
  // anchor, so a duplicate visit produces an identical verdict. (It used to matter: an
  // earlier version measured from the loop's (c,r) and so answered about a corner
  // instead of the box. Removing the guard today changes nothing but the cost, which is
  // why no test can fail on it.)
  if (item.c !== c || item.r !== r) return;
  const hit = castLocal(k, disp, s, k.itemHeight(disp, item) - k.itemTall(disp, item) / 2);
  if (hit) weighHit(k, cell, { index, item, hit }, best);
}

/** A cast that met this item's plane: an exact hit on the box, or a near miss scored on screen. */
function weighHit(k, { disp, s, px, py, radius }, { index, item, hit }, best) {
  const col = columnAt(disp.g, hit.x, hit.z);
  if (col && topAt(disp.g, s, col.c, col.r) === index) {
    // Landed on the box itself. Nearest to the camera wins, which is the one in front.
    if (!best.exact || hit.distSq < best.exact.distSq) best.exact = { disp, shelf: s, index, distSq: hit.distSq };
    return;
  }
  if (best.exact) return;                       // an exact hit always beats a near miss
  const d = axisDistance(k, { disp, shelf: s, item }, px, py);
  if (d === null || d > radius) return;
  // Among near misses take the closest ON SCREEN, and only then the closest to the
  // camera, so two boxes overlapping in the picture resolve to the front one.
  const { near } = best;
  if (!near || d < near.d - 1 || (Math.abs(d - near.d) <= 1 && hit.distSq < near.distSq)) best.near = { disp, shelf: s, index, distSq: hit.distSq, d };
}

const nearGrid = (g, x, z, pad) => {
  const { w, d } = gridSize(g);
  return Math.abs(x) <= w / 2 + pad && Math.abs(z) <= d / 2 + pad;
};

/**
 * Which display and level the pointer is over while carrying something. Unlike the pick, this
 * does not need an item there — it needs somewhere to PUT one.
 *
 * "Nearest in-bounds" is what makes per-level pointing work: looking down, an upper shelf's plane
 * is always hit closer to the camera, but only where it is actually over the lattice, so pointing
 * at the exposed front strip of a lower shelf correctly selects the lower one.
 */
function hoverTarget(k, event) {
  setRay(k, event);
  let best = null;
  for (const disp of k.displays()) {
    for (let s = 0; s < disp.g.shelves; s++) {
      const hit = castLocal(k, disp, s);
      // Half a slot of slack outside the lattice: without it the outermost row of every display
      // could only be aimed at from one side, since anything past the edge selected no display
      // at all and the snap never got a chance to run.
      if (!hit || !nearGrid(disp.g, hit.x, hit.z, disp.g.cell * 0.5)) continue;
      if (!best || hit.distSq < best.distSq) best = { disp, shelf: s, distSq: hit.distSq };
    }
  }
  return best;
}

/** Where on a display's plane the pointer is — used to float a carried item, not to pick. */
function displayPoint(k, disp, shelf, event) {
  setRay(k, event);
  const guess = castLocal(k, disp, shelf);
  if (!guess) return null;
  const col = columnAt(disp.g, guess.x, guess.z);
  const topIndex = col ? topAt(disp.g, shelf, col.c, col.r) : EMPTY;
  if (topIndex === EMPTY) return guess;
  return castLocal(k, disp, shelf, k.itemHeight(disp, k.items()[topIndex])) ?? guess;
}

// ---------------------------------------------------------------- hand-arranged jitter
//
// Shelves stocked on an exact grid read as a spreadsheet. A degree or two of rotation per item is
// what sells "somebody put these here by hand", and it is the cheapest character in the whole
// scene — it rides in the instance matrix and costs nothing.
//
// Shared because it had drifted into three copies with three different amounts: 0.18pi in the
// shop, 0.22pi for notions in the demo, and 0.5pi for yarn — which is nearly a quarter turn and
// reads as "dumped" rather than "arranged". One number, one place.
//
// ponytail: stored per item, not derived. ../ai_planning_sessions/DESIGN-DECISIONS.md §5 specifies
// `hash(itemId, slotIndex)` so the jitter is stable across reloads and needs no storage — worth
// doing when items get stable ids, but it changes nothing visible today.

/** Spread of the initial rotation when stock is first put out. */
export const YAW_SCATTER = 0.22 * Math.PI;
/** Extra nudge each time an item is set down — a thing never lands quite as it was lifted. */
export const YAW_SETTLE = 0.12 * Math.PI;

/** A starting rotation for freshly stocked inventory. */
export const scatterYaw = (rng = Math.random) => (rng() - 0.5) * YAW_SCATTER;

/** Nudge an item's rotation as it is set down. Mutates, and returns the new yaw. */
export function settleYaw(item, rng = Math.random) {
  item.yaw = (item.yaw ?? 0) + (rng() - 0.5) * YAW_SETTLE;
  return item.yaw;
}

/**
 * Put a held item down, layer count included.
 *
 * Shared because the layer argument is the part that gets forgotten — `place(g, keys, i)` is a
 * perfectly good call that silently makes a three-layer bulky yarn one layer tall, and nothing
 * fails until a stack quietly overlaps. Every caller that puts an item into a grid should route
 * through here rather than calling `place` directly.
 *
 * `target` is a slot from snapTo, or null to send it back where it already belongs.
 */
/**
 * @param {any} item
 * @param {number} index
 * @param {any} target  a slot from snapTo, or null
 * @param {{home: any, homeShelf: number, layers?: (item: any) => number, anySlot?: Function}} opts
 *   `home` and `homeShelf`: the display and shelf it goes back to when there is no target
 */
export function placeItem(item, index, target, { home, homeShelf, layers = () => 1, anySlot }) {
  const tall = layers(item);
  if (target) {
    item.c = target.c; item.r = target.r; item.keys = target.keys;
    // A turned drop is applied by SWAPPING the footprint, and by nothing else. It is tempting to
    // also add 90 degrees of yaw, and that would be a bug: every renderer here derives the drawn
    // size from slotRect(w, h), so the swap has already rotated the thing. Adding yaw on top would
    // spin it back.
    if (target.turned) { item.w = target.w; item.h = target.h; }
  } else {
    item.keys = footprint(home.g, homeShelf, [item.c, item.r], [item.w, item.h]);
  }

  // Its own column may have filled up while it was in hand — an NPC tidying, or another drop. place()
  // does not check headroom, so without this the item would float above a full stack.
  if (!fits(home.g, item.keys, tall) && anySlot) {
    const spot = anySlot(home.g, item);
    if (spot) {
      item.shelf = spot.shelf; item.c = spot.c; item.r = spot.r; item.keys = spot.keys;
      if (spot.turned) { item.w = spot.w; item.h = spot.h; }
    }
  }
  item.layer = place(home.g, item.keys, index, tall);
  return item.layer;
}

// Re-exported so a scene needs one import for the whole mechanic rather than reaching past this
// module into grid.js for the half of it that happens to be pure.
export { EMPTY, footprint, fits, dropLayer, place, slotRect, columnAt, topAt } from './grid.js';
