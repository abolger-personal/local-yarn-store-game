// What the shop sells: yarn, patterns and notions, as pure data.
//
// Pure: no three.js, no DOM. Both sides of the DESIGN-DECISIONS.md §3 split read this — visit.js
// reasons about what an NPC still needs, store.html decides how it looks — so it cannot live in
// either. Node-testable (see catalog.test.mjs).
//
// Sources: NOTIONS.md, YARN.md, PATTERNS.md.

// ---------------------------------------------------------------- crafts and tools

export const CRAFTS = Object.freeze(['knitting', 'crochet']);

/** WIP-AND-FINISHED-OBJ-FORMATION.md: a tool notion is "crochet hook or knitting needles". */
export const TOOL_FOR_CRAFT = Object.freeze({ knitting: 'knitting-needles', crochet: 'crochet-hook' });
export const TOOL_NOTIONS = Object.freeze(['crochet-hook', 'knitting-needles']);

/** Which notions carry a millimetre size. Markers do not; a needle or hook always does. */
export const SIZED_NOTIONS = new Set(['crochet-hook', 'knitting-needles']);
export const HOOK_SIZES_MM = Object.freeze([2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0]);

/** Every kind of thing that can sit in a display slot. */
export const NOTION_NAMES = Object.freeze([
  'crochet-hook', 'knitting-needles', 'darning-needle', 'stitch-markers',
]);

// ---------------------------------------------------------------- patterns

/**
 * PATTERNS.md. `yarnUnits` is the headline number: it sets how much yarn the NPC has to buy AND,
 * via the progress formula in WIP-AND-FINISHED-OBJ-FORMATION.md, how many rounds the project takes.
 * A cowl is a single-visit win; a sweater is a project you watch across a whole day.
 *
 * `hints` are invisible to the player — they become the garment rendered on an NPC who finishes the
 * thing. TODO: nothing consumes them yet; that is the FO-on-the-character work.
 */
export const PATTERN_TYPES = Object.freeze({
  sweater: { yarnUnits: 20, minColors: 2, hints: ['stripes'] },
  hat:     { yarnUnits: 5,  minColors: 1, hints: ['pom pom'] },
  cowl:    { yarnUnits: 2,  minColors: 1, hints: ['stripes'] },
  shawl:   { yarnUnits: 10, minColors: 3, hints: ['fringe', 'star'] },
});
export const PATTERN_NAMES = Object.freeze(Object.keys(PATTERN_TYPES));

/** "Physical grid wise it is always 2x2x1." */
export const PATTERN_FOOTPRINT = Object.freeze([2, 2]);

// ---------------------------------------------------------------- yarn

export const YARN_MATERIALS = Object.freeze([
  'wool', 'cotton', 'alpaca', 'silk', 'acrylic', 'linen', 'mohair', 'bamboo',
]);

/**
 * YARN.md: yarn runs "from 1x1x1 (thread, lace weight yarn) to 3x3x3 (super bulky housewares
 * yarn)". Weight is therefore what decides the footprint, which in turn decides how many units of
 * yarn one ball is worth — so a bulky yarn is both physically bigger on the shelf and worth more
 * toward a pattern, which is the right relationship.
 */
export const YARN_WEIGHTS = Object.freeze([
  { name: 'lace',        size: 1 },
  { name: 'fingering',   size: 1 },
  { name: 'sport',       size: 1 },
  { name: 'dk',          size: 2 },
  { name: 'worsted',     size: 2 },
  { name: 'aran',        size: 2 },
  { name: 'bulky',       size: 3 },
  { name: 'super-bulky', size: 3 },
]);
export const YARN_WEIGHT_NAMES = Object.freeze(YARN_WEIGHTS.map((w) => w.name));
export const yarnWeight = (name) => YARN_WEIGHTS.find((w) => w.name === name);

/** "at least balls, cones, and skeins" */
export const YARN_SHAPES = Object.freeze(['ball', 'cone', 'skein']);

/**
 * How many distinct colours a yarn can be. Not a palette — this module stays pure data and knows
 * nothing about hexes — just how wide the index is, so the renderer's palette and the sim's notion
 * of "the same colour" cannot disagree about the count.
 *
 * YARN.md wants "an overwhelming variety". Twelve was a placeholder sized to a hand-written list,
 * and it read as a curated set rather than a shop: no rainbow wall is possible out of twelve.
 */
export const YARN_COLOR_COUNT = 48;

/**
 * PATTERNS.md: "units of yarn will map to their physical volume grid size: 1x1x1 yarn item = 1 unit
 * yarn. 3x3x3 yarn item = 9 units." Nine, not twenty-seven — so it is the FOOTPRINT that counts,
 * not the volume, and the 2.5D height is how tall the ball looks rather than how much wool is on it.
 */
export const yarnUnits = (item) =>
  (item.name === 'yarn' ? (item.w ?? 1) * (item.h ?? 1) : 0);

// ---------------------------------------------------------------- generation

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

/**
 * A pattern as it sits on a shelf. Everything it SPECIFIES is what its owner then has to match when
 * shopping (see MatchObservedInventory in wip.js), so each field here is a real constraint rather
 * than flavour: the craft names the tool, `toolSize` names its millimetres, and `materials` names
 * what the yarn has to be made of.
 *
 * `toolSize` is not in PATTERNS.md's attribute list, but the shopping-list rule requires "the
 * notion is the correct size (hook or knitting needle size comparison match)" — which needs a size
 * to compare against. CHARACTER-ATTRIBUTES.md assumes one too ("crochet and needle size tiny" for
 * a high-Intellect pattern), so it belongs on the pattern.
 * TODO(spec): tie the size to pattern difficulty rather than rolling it flat, per that line.
 *
 * `weight` is likewise implied rather than listed: the shopping rule matches a pattern to a yarn
 * the NPC already owns "with the same yarn attributes (weight, material)", which needs the pattern
 * to name a weight. Adding it to PATTERNS.md's attribute list would make both explicit.
 */
export function makePattern(rng = Math.random, type = pickFrom(PATTERN_NAMES, rng)) {
  const spec = PATTERN_TYPES[type];
  return {
    name: 'pattern',
    patternType: type,
    craft: pickFrom(CRAFTS, rng),
    toolSize: pickFrom(HOOK_SIZES_MM, rng),
    weight: pickFrom(YARN_WEIGHT_NAMES, rng),
    yarnUnits: spec.yarnUnits,
    minColors: spec.minColors,
    materials: [pickFrom(YARN_MATERIALS, rng)],
    hints: spec.hints,
    w: PATTERN_FOOTPRINT[0],
    h: PATTERN_FOOTPRINT[1],
    layers: 1,          // "Physical grid wise it is always 2x2x1" — a book lies flat
  };
}

/** One ball, cone or skein. Its footprint comes from its weight, and its units from its footprint. */
export function makeYarn(rng = Math.random, weightName = pickFrom(YARN_WEIGHT_NAMES, rng)) {
  const weight = yarnWeight(weightName);
  return {
    name: 'yarn',
    material: pickFrom(YARN_MATERIALS, rng),
    weight: weight.name,
    shape: pickFrom(YARN_SHAPES, rng),
    // TODO(YARN.md): colour is one flat hue. The doc wants gradients, sparkle, fuzziness and ball
    // bands — all of which need art and a detail channel, not just another field here.
    colorIndex: Math.floor(rng() * YARN_COLOR_COUNT),
    w: weight.size,
    h: weight.size,
    // YARN.md: "anywhere from 1x1x1 (thread, lace weight yarn) to 3x3x3 (super bulky housewares
    // yarn)" — so a bulky ball is as TALL as it is wide. Without this it renders as a flat slab
    // covering most of a table, which is the wrong read entirely: a ball, not a mat.
    layers: weight.size,
  };
}

/** A tool or accessory notion. Size is kept only for the kinds that genuinely have one. */
export function makeNotion(rng = Math.random, name = pickFrom(NOTION_NAMES, rng)) {
  return {
    name,
    size: SIZED_NOTIONS.has(name) ? pickFrom(HOOK_SIZES_MM, rng) : null,
  };
}

/**
 * The RANGE this shop carries, as opposed to everything that exists.
 *
 * This is a game-balance decision, not a spec rule, and it is load-bearing. Matching is strict —
 * a pattern's yarn want names one weight and one material out of 8x8, and its tool want one of
 * 2x12 — so against uniformly random stock the chance a shelf item satisfies a given want is about
 * 0.9% for yarn and 0.5% for a tool. A display holds roughly twenty items, so an NPC whose
 * shopping list changes mid-visit would essentially never find the follow-up by chance, and almost
 * no project would ever get made.
 *
 * A real local yarn store does not carry one of everything either: it carries a curated range,
 * deeply. Drawing both the stock AND the patterns from the same small palette is what makes the
 * strict match playable, and it is the honest fix — the alternative, loosening the match, would
 * throw away the mechanic the spec asks for.
 *
 * TODO: this should become the player's decision. What the shop orders in is exactly the kind of
 * choice LYS.md wants the player making, and CHARACTER-ATTRIBUTES.md's "getting to know your NPCs
 * will help the player better solve the puzzle" only means something if stocking is a choice.
 */
export const SHOP_RANGE = Object.freeze({
  weights: Object.freeze(['fingering', 'dk', 'worsted', 'bulky']),
  materials: Object.freeze(['wool', 'cotton', 'alpaca', 'acrylic']),
  toolSizes: Object.freeze([3.0, 4.0, 5.0, 6.0]),
});

/** A pattern written for yarn this shop actually sells. */
export const makeStockPattern = (rng = Math.random, type) => {
  const p = makePattern(rng, type);
  p.weight = pickFrom(SHOP_RANGE.weights, rng);
  p.materials = [pickFrom(SHOP_RANGE.materials, rng)];
  p.toolSize = pickFrom(SHOP_RANGE.toolSizes, rng);
  return p;
};

/** A ball from the shop's range. */
export const makeStockYarn = (rng = Math.random) => {
  const y = makeYarn(rng, pickFrom(SHOP_RANGE.weights, rng));
  y.material = pickFrom(SHOP_RANGE.materials, rng);
  return y;
};

/** A tool in a size the shop stocks; other notions unchanged. */
export const makeStockNotion = (rng = Math.random, name) => {
  const it = makeNotion(rng, name);
  if (it.size != null) it.size = pickFrom(SHOP_RANGE.toolSizes, rng);
  return it;
};

// ---------------------------------------------------------------- labels

/**
 * One human-readable line for anything in the catalog — the single label function for the HUD, the
 * debug panel and the sim's log, so a thing is never named two different ways in one screen.
 * Hyphenated names are kept as-is, matching how they read everywhere else in the codebase.
 */
export function labelOf(thing) {
  if (!thing) return '—';
  if (thing.name === 'yarn') return `${thing.weight} ${thing.material} yarn`;
  if (thing.name === 'pattern') {
    return `${thing.patternType} pattern (${thing.craft} ${thing.toolSize}mm, ` +
           `${thing.weight} ${thing.materials.join('/')})`;
  }
  return thing.size != null ? `${thing.name} ${thing.size.toFixed(1)}mm` : thing.name;
}
