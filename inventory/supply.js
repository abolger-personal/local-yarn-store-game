// DESIGN-DECISIONS.md §6 "Supply system"; the order's shape is PLAYING-AT-YOUR-PACE.md §5.

import { anySlot, fits, place } from './grid.js';
import { mulberry32 } from '../characters/store/core/util.js';
import { SHOP_RANGE, TOOL_FOR_CRAFT, YARN_COLOR_COUNT, makeStockNotion, makeStockPattern, makeYarn, stockPatternFor }
  from './catalog.js';

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

// DESIGN-DECISIONS.md §6: six colour families.
const FAMILIES = 6;
const FAMILY_SIZE = YARN_COLOR_COUNT / FAMILIES;

function yarnOf(rng, weights, family = null) {
  const y = makeYarn(rng, pickFrom(weights, rng));
  y.material = pickFrom(SHOP_RANGE.materials, rng);
  if (family !== null) y.colorIndex = family * FAMILY_SIZE + Math.floor(rng() * FAMILY_SIZE);
  return y;
}

const times = (n, f) => Array.from({ length: n }, f);

function resolveTemplate({ kind, count = 1, weights = SHOP_RANGE.weights, family = false }, rng) {
  const fam = family || kind === 'kit' ? Math.floor(rng() * FAMILIES) : null;
  if (kind === 'yarn') return times(count, () => yarnOf(rng, weights, fam));
  if (kind === 'pattern') return times(count, () => stockPatternFor(yarnOf(rng, weights), rng));
  if (kind === 'notion') return times(count, () => makeStockNotion(rng));
  if (kind === 'kit') {
    const first = yarnOf(rng, weights, fam);
    const pattern = stockPatternFor(first, rng);
    const balls = times(pattern.yarnUnits - 1, () => ({ ...yarnOf(rng, [first.weight], fam), material: first.material }));
    return [pattern, first, ...balls];
  }
  throw new Error(`unknown template kind "${kind}"`);
}

export const resolveOrder = (order, rng = Math.random) =>
  order.flatMap((slot) => resolveTemplate(slot.template, rng));

// DESIGN-DECISIONS.md §6, "Delivery".
export const WEIGHT_INTRO = Object.freeze({ worsted: 1, dk: 1, bulky: 5, fingering: 8 });
const knownBy = (day) => Object.keys(WEIGHT_INTRO).filter((w) => WEIGHT_INTRO[w] <= day);
const newOn = (day) => Object.keys(WEIGHT_INTRO).filter((w) => WEIGHT_INTRO[w] === day);

const y = (count, more = {}) => ({ kind: 'yarn', count, ...more });
const p = (count, more = {}) => ({ kind: 'pattern', count, ...more });
const n = (count, more = {}) => ({ kind: 'notion', count, ...more });
const kit = (more = {}) => ({ kind: 'kit', ...more });
const pick = { choosable: true };
// TUTORIAL.md
export const TUTORIAL_DAYS = 3;
// TUTORIAL.md "Night 2" and "Night 3": the slip is handed over line by line until this day's order.
export const HANDOVER_DAYS = 4;

/**
 * @typedef {{ kind: string, count?: number, weights?: string[], family?: boolean,
 *             weight?: string, choosable?: boolean }} Template
 */
/** @type {readonly Template[][]} */
export const SCRIPT = Object.freeze([
  /* 1 */ [kit(), y(15), p(6)],
  /* 2 */ [y(6, { family: true }), p(2)],
  /* 3 */ [y(5, pick), p(2), kit()],
  /* 4 */ [y(4, pick), p(2, pick), n(2)],
  /* 5 */ [y(5, { weight: 'new', family: true }), p(2), n(2)],
  /* 6 */ [y(4), kit(), n(2)],
  /* 7 */ [y(6), p(2), n(2), kit()],
  /* 8 */ [y(6, { weight: 'new', family: true }), p(2), n(2), y(3)],
  /* 9 */ [y(5), p(3), n(2), y(4, { family: true })],
  /* 10 */ [y(6), p(2), n(2), y(2, { family: true })],
]);

// TUTORIAL.md §4
export function tutorialDay1(rng = Math.random) {
  const pattern = makeStockPattern(rng, 'potholder');
  const ball = { ...yarnOf(rng, [pattern.weight]), material: pattern.materials[0] };
  const hook = { name: TOOL_FOR_CRAFT[pattern.craft], size: pattern.toolSize };
  return { table: pattern, floor: [hook, ball] };
}

// DESIGN-DECISIONS.md §6, Homeostasis (b).
export const MIN_DELIVERY = 2;
const STEADY = SCRIPT[9].filter((t) => t.kind !== 'kit');
const FULL_DELIVERY = STEADY.reduce((sum, t) => sum + t.count, 0);

export const supplyFor = (occupancy) =>
  Math.max(MIN_DELIVERY, Math.round(FULL_DELIVERY * (1 - Math.min(1, Math.max(0, occupancy)))));

function supplierSlots(total, rng) {
  const counts = STEADY.map(() => 0);
  for (let i = 0; i < total; i++) {
    let r = rng() * FULL_DELIVERY, k = 0;
    while (r >= STEADY[k].count) r -= STEADY[k++].count;
    counts[k]++;
  }
  return STEADY.map(({ kind, family }, k) => ({ kind, count: counts[k], ...(family ? { family } : {}) }))
    .filter((t) => t.count > 0);
}

// ponytail: random split for now; a real budget UI later.
function splitCounts(slots, rng) {
  const lines = slots.filter((s) => s.playerChoosable && s.template.kind !== 'kit');
  const total = lines.reduce((sum, s) => sum + s.template.count, 0);
  const counts = lines.map(() => 1);
  for (let i = lines.length; i < total; i++) counts[Math.floor(rng() * lines.length)]++;
  return slots.map((s) => (lines.includes(s) ? { ...s, template: { ...s.template, count: counts[lines.indexOf(s)] } } : s));
}

export function buildOrder(day, { occupancy = 0, chosen = [], rng = Math.random, seed = 0 } = {}) {
  const row = SCRIPT[day - 1];
  const weights = knownBy(day);
  const slots = row
    ? row.map(({ choosable, weight, ...t }) => ({
      template: { ...t, weights: weight === 'new' ? newOn(day) : weights },
      source: 'script', playerChoosable: day > HANDOVER_DAYS || Boolean(choosable),
    }))
    : supplierSlots(supplyFor(occupancy), rng)
      .map((t) => ({ template: { ...t, weights }, source: 'supplier', playerChoosable: true }));
  let next = 0;
  return splitCounts(slots, mulberry32(Math.imul(day, 0x9E3779B1) ^ seed)).map((s) => (s.playerChoosable && next < chosen.length
    ? { ...s, template: chosen[next++], source: 'player' } : s));
}

function weightWords(weights = SHOP_RANGE.weights) {
  if (weights.length >= SHOP_RANGE.weights.length) return 'any weight';
  return weights.length > 1 ? `${weights.slice(0, -1).join(', ')} or ${weights.at(-1)}` : weights[0];
}

export function describeSlot({ template: { kind, count = 1, weights, family }, playerChoosable }) {
  const fam = family ? ', one colour family' : '';
  const words = {
    yarn: [count === 1 ? 'unit of yarn' : 'units of yarn', `${weightWords(weights)}${fam}`],
    pattern: [count === 1 ? 'pattern' : 'patterns', `for ${weightWords(weights)}`],
    notion: [count === 1 ? 'notion' : 'notions', 'tools and accessories'],
    kit: ['kit', `a pattern and its yarn, ${weightWords(weights)}, one colour family`],
  }[kind];
  if (!words) throw new Error(`unknown template kind "${kind}"`);
  return { count, item: words[0], detail: words[1], yours: Boolean(playerChoosable) };
}

export const slipLine = (slot) => (slot.playerChoosable && slot.source !== 'player'
  ? { ...describeSlot(slot), item: "supplier's choice", detail: '' } : describeSlot(slot));

export function choicesFor({ template: { count = 1, weights = SHOP_RANGE.weights } }) {
  return [
    ...weights.map((w) => ({ kind: 'yarn', count, weights: [w] })),
    ...weights.map((w) => ({ kind: 'yarn', count, weights: [w], family: true })),
    ...weights.map((w) => ({ kind: 'pattern', count, weights: [w] })),
    { kind: 'notion', count },
  ];
}

// DISPLAYS.md, "Overnight".
export function carryOver(items, displays) {
  const kept = items.filter((it) => !it.gone).sort((a, b) => a.layer - b.layer);
  const dropped = items.length - kept.length;
  for (const d of displays) d.g.piles = d.g.piles.map(() => []);
  items.length = 0;
  for (const it of kept) {
    const d = displays.find((o) => o.id === it.display);
    const spot = fits(d.g, it.keys, it.layers ?? 1) ? null : anySlot(d.g, it);
    if (spot) {
      it.shelf = spot.shelf; it.c = spot.c; it.r = spot.r; it.keys = spot.keys;
      if (spot.turned) { it.w = spot.w; it.h = spot.h; }
    }
    it.layer = place(d.g, it.keys, items.length, it.layers ?? 1);
    items.push(it);
  }
  return dropped;
}
