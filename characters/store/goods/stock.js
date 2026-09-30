// What the shop puts out, and where: colours, packaging, and addItem.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { items } from '../core/state.js';
import { rnd } from '../core/util.js';
import { YARN_COLOR_COUNT } from '../../../inventory/catalog.js';
import { fits, footprint, place } from '../../../inventory/grid.js';
import { scatterYaw } from '../../../inventory/pick-place.js';
import { yarnFit } from '../../../inventory/yarn-geometry.js';
import { yarnColor } from '../../../inventory/yarn-look.js';
import { pick } from '../../npc.js';
import { CAPACITY } from './items.js';
import { YARN_FIT } from './yarn.js';

/**
 * Which atlas cell an item draws. Yarn and patterns vary their icon by an ATTRIBUTE — shape and
 * type respectively — so this is not simply the item's name.
 */
export function cellNameFor(item) {
  if (item.name === 'yarn') return `yarn-${item.shape}`;
  if (item.name === 'pattern') return `pattern-${item.patternType}`;
  return item.name;
}

// The package a NOTION comes in, as a [cols, rows] footprint. It belongs to the KIND, not to the
// instance — a random shape per box would invent a property the product does not have.
//
// Yarn and patterns do NOT appear here: their footprints are not packaging choices but real
// attributes the sim reads. A yarn's size comes from its weight and decides how many units it is
// worth (PATTERNS.md), and a pattern is always 2x2. Both come from catalog.js instead.
const PACKAGES = {
  'crochet-hook':     [[1, 1], [2, 1]],   // single hook, or a set in a long case
  'knitting-needles': [[1, 1], [1, 2]],   // a pair, or a long circular set
  'darning-needle':   [[1, 1], [1, 2]],   // a packet, or a deep sleeve of assorted sizes
  'stitch-markers':   [[1, 1], [2, 2]],   // a little bag, or a big assorted tin
};

const packageFor = (name) => pick(PACKAGES[name] ?? [[1, 1]]);

// Yarn colours, from the OKLCH generator the bake-off tuned — hand-picked hexes were the reason
// the shelf read as a curated palette rather than as a shop, and could not make a rainbow wall.
// Still indexed by the yarn's own colorIndex, so the sim carries colour without importing a
// palette; the index just addresses far more of the range than twelve hexes could.
//
// Seeded, so an index means the SAME colour across reloads. The shop is reseeded every reload and
// a palette that moved with it would make "the teal one" unrepeatable while chasing a bug.
const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const YARN_COLORS = (() => {
  const rng = mulberry32(0x105);
  // PLACE the hues on a jittered even grid instead of rolling them. Rolling is right for one item
  // and wrong for a fixed index — 48 rolls left holes of up to 103 degrees across seeds, and
  // walking the anchors in order only got that to 52, because the heavy tail comes from the jitter
  // within each arc rather than from which arc is picked. Placing bounds the largest gap at two
  // grid steps by construction, which is the property "you can build a rainbow wall" actually
  // needs. Lightness and chroma still come from the generator, so the range is unchanged.
  return Array.from({ length: YARN_COLOR_COUNT }, (_, i) =>
    `#${yarnColor(rng, undefined,
                  { hue: ((i + rng()) * 360) / YARN_COLOR_COUNT }).getHexString()}`);
})();

const INK = '#241e22';

/**
 * Put one item in the first slot it fits, scanning from a random start. Returns its index or -1.
 * `avoidWall` keeps it off a shelf's wall-facing row, which DISPLAYS.md says can never be noticed
 * — without it a "guaranteed buyable" seed can land somewhere an NPC is not allowed to see.
 *
 * Takes a catalog OBJECT now rather than a name and a size. Yarn and patterns carry attributes a
 * two-argument signature cannot express, and having the caller build the thing means the shop
 * cannot invent a yarn weight or a pattern that catalog.js would not have produced.
 */
/**
 * How many 2.5D layers tall this item reserves. Takes the RESOLVED footprint, forced or not.
 *
 * Yarn derives it from its SHAPE rather than taking catalog.js's `layers`, because the mesh is
 * what has to fit: a flat skein reserves fewer layers than a round ball on the same footprint.
 * Reserving what is drawn is the whole reason nothing stacks on air — see yarnFit. It also means
 * tall yarn simply fails over to a table or the floor when a wall shelf cannot take it, which is
 * the correct answer and the one SHELF_CLEAR governs.
 *
 * It must take the footprint the item ACTUALLY ends up with.
 * A forced `shape` (the burial seed's 1x1 override) also flattened the reservation to one layer —
 * but paintYarn does not read `item.layers`, it re-derives the height by calling yarnFit on
 * `item.w`/`item.h`. So a buried cone reserved one layer and was drawn four tall, and the notion
 * lid dropped on top of it landed at its midpoint. Non-yarn has no such split: a box IS whatever
 * `item.layers` says, in the grid and on screen alike, so there is nothing to reconcile there.
 */
function layersFor(spec, w, h) {
  if (spec.name === 'yarn') return yarnFit(spec.shape, w, h, YARN_FIT).layers;
  return spec.layers ?? 1;
}

/**
 * Every cell of a display, starting somewhere random so stock does not pile into one corner.
 * `avoidWall` drops the wall-facing row, which DISPLAYS.md says can never be noticed.
 */
/**
 * @param {any} display
 * @param {{c?: number, r?: number, avoidWall?: boolean}} start
 */
function cellOrder(display, { c, r, avoidWall }) {
  const { g } = display;
  const cells = [];
  for (let rr = 0; rr < g.rows; rr++)
    for (let cc = 0; cc < g.cols; cc++) {
      if (avoidWall && rr === display.wallRow) continue;
      cells.push({ c: cc, r: rr });
    }
  if (c != null) return [{ c, r }, ...cells];
  return cells.slice(rnd(cells.length)).concat(cells);
}

/**
 * @param {any} display
 * @param {number} shelf
 * @param {any} spec
 * @param {{c?: number, r?: number, avoidWall?: boolean, shape?: number[]}} [where]
 */
export function addItem(display, shelf, spec, { c, r, avoidWall = false, shape } = {}) {
  if (items.length >= CAPACITY) return -1;   // the instanced buffers cannot grow past this
  const { g } = display;
  // Yarn and patterns bring their own footprint; a notion gets one of its packagings.
  const [w, h] = shape ?? (spec.w ? [spec.w, spec.h] : packageFor(spec.name));
  const layers = layersFor(spec, w, h);

  for (const cell of cellOrder(display, { c, r, avoidWall })) {
    // footprint() returns null the moment any covered cell runs off the grid or hits a mask, and
    // fits() treats null as "no" — so an oversized package simply fails over to the next cell.
    const keys = footprint(g, shelf, [cell.c, cell.r], [w, h]);
    if (!fits(g, keys, layers)) continue;
    const index = items.length;
    items.push({
      ...spec,
      display: display.id, shelf, c: cell.c, r: cell.r, w, h, layers,
      keys, layer: place(g, keys, index, layers),
      // Yarn is the one thing whose colour is an attribute rather than ink.
      color: spec.name === 'yarn' ? YARN_COLORS[spec.colorIndex % YARN_COLORS.length] : INK,
      yaw: scatterYaw(), gone: false, held: false,
    });
    return index;
  }
  return -1;
}
