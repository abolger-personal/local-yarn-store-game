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

export function cellNameFor(item) {
  if (item.name === 'yarn') return `yarn-${item.shape}`;
  if (item.name === 'pattern') return `pattern-${item.patternType}`;
  return item.name;
}

// inventory/NOTIONS.md §Packaging
const PACKAGES = {
  'crochet-hook':     [[1, 1], [2, 1]],
  'knitting-needles': [[1, 1], [1, 2]],
  'darning-needle':   [[1, 1], [1, 2]],
  'stitch-markers':   [[1, 1], [2, 2]],
  'cable-needle':     [[1, 1]],
  'buttons':          [[1, 1], [2, 1]],
};

const packageFor = (name) => pick(PACKAGES[name] ?? [[1, 1]]);

const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// inventory/YARN-ASSET-SPIKE.md §17: the palette
export const YARN_COLORS = (() => {
  const rng = mulberry32(0x105);
  return Array.from({ length: YARN_COLOR_COUNT }, (_, i) =>
    `#${yarnColor(rng, undefined,
                  { hue: ((i + rng()) * 360) / YARN_COLOR_COUNT }).getHexString()}`);
})();

const INK = '#241e22';

const centredOn = (over, w, h) =>
  ({ c: over.c + Math.floor((over.w - w) / 2), r: over.r + Math.floor((over.h - h) / 2) });

function layersFor(spec, w, h) {
  if (spec.name === 'yarn') return yarnFit(spec.shape, w, h, YARN_FIT).layers;
  return spec.layers ?? 1;
}

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
 * @param {{c?: number, r?: number, over?: any, avoidWall?: boolean, shape?: number[], reserve?: number}} [where]
 *   reserve: layers kept free above it; over: an item to stack on, centre on centre
 */
export function addItem(display, shelf, spec, { c, r, over, avoidWall = false, shape, reserve = 0 } = {}) {
  if (items.length >= CAPACITY) return -1;
  const { g } = display;
  const [w, h] = shape ?? (spec.w ? [spec.w, spec.h] : packageFor(spec.name));
  const layers = layersFor(spec, w, h);

  for (const cell of cellOrder(display, over ? { ...centredOn(over, w, h), avoidWall } : { c, r, avoidWall })) {
    const keys = footprint(g, shelf, [cell.c, cell.r], [w, h]);
    if (!fits(g, keys, layers + reserve)) continue;
    const index = items.length;
    items.push({
      ...spec,
      display: display.id, shelf, c: cell.c, r: cell.r, w, h, layers,
      keys, layer: place(g, keys, index, layers),
      color: spec.name === 'yarn' ? YARN_COLORS[spec.colorIndex % YARN_COLORS.length] : INK,
      yaw: scatterYaw(), gone: false, held: false,
    });
    return index;
  }
  return -1;
}
