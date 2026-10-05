// Where the shop's stock comes from: the morning delivery, as an ORDER resolved onto the floor.
//
// Pure: no three.js, no DOM. The store decides where a delivered box lands (world.js); this only
// decides what is in the boxes. Node-testable (see supply.test.mjs).
//
// Source: ai_planning_sessions/DESIGN-DECISIONS.md §6 "Supply system".

import { anySlot, fits, place } from './grid.js';
import { SHOP_RANGE, TOOL_FOR_CRAFT, YARN_COLOR_COUNT, makeStockNotion, makeStockPattern, makeYarn, stockPatternFor }
  from './catalog.js';

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------- templates
//
// An order is an array of SLOTS, each { template, source, playerChoosable }:
//   source           'script' (days 1-10), 'supplier' (day 11+), or 'player' (the order form, later)
//   playerChoosable  a slot the order form will hand to the player. No form yet, so it stays filled
//                    by the script — the flag is there so the form has nothing to work out.
//
// A template is a KIND of thing, never an item id (§6: ids make dead deliveries, all lace-weight
// for a player who has never met a lace knitter). It is resolved against the catalog on the day:
//   { kind: 'yarn',    count, weights?, family? }   balls; `family` keeps them one colour family
//   { kind: 'pattern', count, weights? }            named designs written for those weights
//   { kind: 'notion',  count }                      tools and accessories in the shop's sizes
//   { kind: 'kit',     weights?, family? }          one pattern plus every ball it needs: a
//                                                   formation that is solvable straight off the floor
// `weights` defaults to the shop's whole range, so a player's template can leave it out.

// The colour wheel cut into six families. YARN_COLORS places its hues evenly round the wheel by
// index, so a run of consecutive indices IS a family — reds, or blues — with no palette lookup.
const FAMILIES = 6;
const FAMILY_SIZE = YARN_COLOR_COUNT / FAMILIES;

/** A ball from the shop's range in one of `weights`, optionally inside colour family `family`. */
function yarnOf(rng, weights, family = null) {
  const y = makeYarn(rng, pickFrom(weights, rng));
  y.material = pickFrom(SHOP_RANGE.materials, rng);
  if (family !== null) y.colorIndex = family * FAMILY_SIZE + Math.floor(rng() * FAMILY_SIZE);
  return y;
}

const times = (n, f) => Array.from({ length: n }, f);

/** What one slot's template becomes on the day: catalog items, nothing placed yet. */
function resolveTemplate({ kind, count = 1, weights = SHOP_RANGE.weights, family = false }, rng) {
  const fam = family || kind === 'kit' ? Math.floor(rng() * FAMILIES) : null;
  if (kind === 'yarn') return times(count, () => yarnOf(rng, weights, fam));
  if (kind === 'pattern') return times(count, () => stockPatternFor(yarnOf(rng, weights), rng));
  if (kind === 'notion') return times(count, () => makeStockNotion(rng));
  if (kind === 'kit') {
    // The pattern is written for the first ball, so the rest only have to match its weight and
    // material — which is exactly what MatchObservedInventory asks of them. Colours vary inside
    // the family, so a two- or three-colour design still has its colours.
    const first = yarnOf(rng, weights, fam);
    const pattern = stockPatternFor(first, rng);
    const balls = times(pattern.yarnUnits - 1, () => ({ ...yarnOf(rng, [first.weight], fam), material: first.material }));
    return [pattern, first, ...balls];
  }
  throw new Error(`unknown template kind "${kind}"`);
}

/** Every item an order delivers, in slot order. */
export const resolveOrder = (order, rng = Math.random) =>
  order.flatMap((slot) => resolveTemplate(slot.template, rng));

// ---------------------------------------------------------------- the script, days 1-10
//
// When each weight first arrives. Two to start so sorting has a dimension on day one; the others
// turn up mid-script as a "new weight" slot, which is the template §6 uses as its example.
export const WEIGHT_INTRO = Object.freeze({ worsted: 1, dk: 1, bulky: 5, fingering: 8 });
const knownBy = (day) => Object.keys(WEIGHT_INTRO).filter((w) => WEIGHT_INTRO[w] <= day);
const newOn = (day) => Object.keys(WEIGHT_INTRO).filter((w) => WEIGHT_INTRO[w] === day);

// One row per day. `weight: 'new'` is that day's newly introduced weight; everything else draws on
// every weight introduced so far. The tutorial is three days (TUTORIAL.md): days 1-2 are the
// script's alone, day 3's order (set on night 2) has one line that is the player's (`pick`), and
// from day 4 every line is the player's, the script's choice standing in for a blank one, as the
// supplier's choice will on the packing slip. Notions are held back until day 4, so the first
// formations the player learns are yarn and pattern only (§6, "tutorial pacing").
//
// Day 1 is the starting pile: 24-30 things, sized to fill a display or two, with one kit in it so
// the pile is guaranteed to hold a formation that works ("the deck is loaded").
const y = (count, more = {}) => ({ kind: 'yarn', count, ...more });
const p = (count, more = {}) => ({ kind: 'pattern', count, ...more });
const n = (count, more = {}) => ({ kind: 'notion', count, ...more });
const kit = (more = {}) => ({ kind: 'kit', ...more });
const pick = { choosable: true };
/** The tutorial's length (TUTORIAL.md). After it, the whole order is the player's. */
export const TUTORIAL_DAYS = 3;

/**
 * @typedef {{ kind: string, count?: number, weights?: string[], family?: boolean,
 *             weight?: string, choosable?: boolean }} Template
 */
/** @type {readonly Template[][]} */
export const SCRIPT = Object.freeze([
  /* 1 */ [kit(), y(15), p(6)],
  /* 2 */ [y(6, { family: true }), p(2)],
  /* 3 */ [y(5, pick), p(2), kit()],
  /* 4 */ [y(4), p(2), n(2)],
  /* 5 */ [y(5, { weight: 'new', family: true }), p(2), n(2)],
  /* 6 */ [y(4), kit(), n(2)],
  /* 7 */ [y(6), p(2), n(2), kit()],
  /* 8 */ [y(6, { weight: 'new', family: true }), p(2), n(2), y(3)],
  /* 9 */ [y(5), p(3), n(2), y(4, { family: true })],
  /* 10 */ [y(6), p(2), n(2), y(2, { family: true })],
]);

/**
 * Tutorial day 1 (TUTORIAL.md §4): the whole shop is three things. A pot holder pattern for the
 * table, and the crochet hook and the one ball it calls for as the morning's delivery, on the
 * floor -- so this replaces SCRIPT[0] and the stockCount fill. game.html only (S.tutorial).
 * TODO(SCRIPTED-EVENTS.md): these become the tutorial script's day-1 `seed` actions.
 */
export function tutorialDay1(rng = Math.random) {
  const pattern = makeStockPattern(rng, 'potholder');
  const ball = { ...yarnOf(rng, [pattern.weight]), material: pattern.materials[0] };
  const hook = { name: TOOL_FOR_CRAFT[pattern.craft], size: pattern.toolSize };
  return { table: pattern, floor: [hook, ball] };
}

// ---------------------------------------------------------------- the supplier, day 11 on
//
// §6 (b), the soft throttle: deliveries SHRINK as the shop fills and never stop. The full size is
// day 10's, and the floor is MIN_DELIVERY — the morning pile is the ritual that opens a session,
// so it is never empty.
export const MIN_DELIVERY = 2;
const STEADY = SCRIPT[9].filter((t) => t.kind !== 'kit');
const FULL_DELIVERY = STEADY.reduce((sum, t) => sum + t.count, 0);

/** How many items the supplier sends at this occupancy (0 = empty shop, 1 = full). */
export const supplyFor = (occupancy) =>
  Math.max(MIN_DELIVERY, Math.round(FULL_DELIVERY * (1 - Math.min(1, Math.max(0, occupancy)))));

/** `total` items dealt one at a time across day 10's slots, weighted by their counts: day 10's shape. */
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

/**
 * Day `day`'s order. `occupancy` (0..1) throttles the supplier; the script ignores it.
 *
 * `chosen` is THE SEAM for the order form: templates the player picked, which take the
 * playerChoosable slots in order and become source 'player'. Today nobody passes it, so the
 * script fills those slots itself.
 */
export function buildOrder(day, { occupancy = 0, chosen = [], rng = Math.random } = {}) {
  const row = SCRIPT[day - 1];
  const weights = knownBy(day);
  const slots = row
    ? row.map(({ choosable, weight, ...t }) => ({
      template: { ...t, weights: weight === 'new' ? newOn(day) : weights },
      source: 'script', playerChoosable: day > TUTORIAL_DAYS || Boolean(choosable),
    }))
    : supplierSlots(supplyFor(occupancy), rng)
      .map((t) => ({ template: { ...t, weights }, source: 'supplier', playerChoosable: true }));
  let next = 0;
  return slots.map((s) => (s.playerChoosable && next < chosen.length
    ? { ...s, template: chosen[next++], source: 'player' } : s));
}

// ---------------------------------------------------------------- the order, in words

/** "worsted or dk", "fingering, dk or bulky"; every weight the shop stocks is "any weight". */
function weightWords(weights = SHOP_RANGE.weights) {
  if (weights.length >= SHOP_RANGE.weights.length) return 'any weight';
  return weights.length > 1 ? `${weights.slice(0, -1).join(', ')} or ${weights.at(-1)}` : weights[0];
}

/**
 * One slot in plain words, for the night's packing slip: `count` × `item` is how many of what (a
 * slip's own singular, "5 × ball of yarn"), `detail` the template's limits, `yours` a slot the
 * order form will hand to the player (playerChoosable). The template's words, never an item's:
 * the catalog only picks the items on the day.
 */
export function describeSlot({ template: { kind, count = 1, weights, family }, playerChoosable }) {
  const fam = family ? ', one colour family' : '';
  const words = {
    yarn: ['ball of yarn', `${weightWords(weights)}${fam}`],
    pattern: ['pattern', `for ${weightWords(weights)}`],
    notion: ['notion', 'tools and accessories'],
    kit: ['kit', `a pattern and its yarn, ${weightWords(weights)}, one colour family`],
  }[kind];
  if (!words) throw new Error(`unknown template kind "${kind}"`);
  return { count, item: words[0], detail: words[1], yours: Boolean(playerChoosable) };
}

// ---------------------------------------------------------------- overnight

/**
 * Close the day without clearing the shop: drop what was bought and re-index the rest.
 *
 * An item's index in `items` is its instance index AND what the grid columns hold, so removing the
 * bought ones means every survivor's index moves. The grids are rebuilt from the survivors rather
 * than patched: bottom layer first, each back on its own keys, so a stack comes back as the same
 * stack (minus anything bought out from under it, which it drops onto). Displays, positions and
 * slots are all left as the player arranged them.
 *
 * Mutates `items` in place — every module holds that one array. Returns how many were dropped.
 */
export function carryOver(items, displays) {
  const kept = items.filter((it) => !it.gone).sort((a, b) => a.layer - b.layer);
  const dropped = items.length - kept.length;
  for (const d of displays) d.g.piles = d.g.piles.map(() => []);
  items.length = 0;
  for (const it of kept) {
    const d = displays.find((o) => o.id === it.display);
    // Dropping onto what is left can land it on the RIM of a round ball that the bought item used
    // to cover (grid.js restsOnCentres). Then it moves to the first legal spot on the same display;
    // with none anywhere it stays put, since losing stock overnight is worse than an overhang.
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
