// What the shop sells: yarn, patterns and notions, as pure data.
//
// Pure: no three.js, no DOM. Both sides of the DESIGN-DECISIONS.md §3 split read this — visit.js
// reasons about what an NPC still needs, store.html decides how it looks — so it cannot live in
// either. Node-testable (see catalog.test.mjs).
//
// Sources: NOTIONS.md, YARN.md, PATTERNS.md.

import { mulberry32 } from '../characters/store/core/util.js';

// ---------------------------------------------------------------- crafts and tools

export const CRAFTS = Object.freeze(['knitting', 'crochet']);

/** WIP-AND-FINISHED-OBJ-FORMATION.md: a tool notion is "crochet hook or knitting needles". */
export const TOOL_FOR_CRAFT = Object.freeze({ knitting: 'knitting-needles', crochet: 'crochet-hook' });
export const TOOL_NOTIONS = Object.freeze(['crochet-hook', 'knitting-needles']);

/** Which notions carry a millimetre size. Markers do not; a needle or hook always does. */
export const SIZED_NOTIONS = new Set(['crochet-hook', 'knitting-needles']);
export const HOOK_SIZES_MM = Object.freeze([2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0]);

/**
 * Every kind of thing that can sit in a display slot. The last two are pattern notions: only a
 * pattern that calls for them wants them (a design's `notions`, see `design`).
 */
export const NOTION_NAMES = Object.freeze([
  'crochet-hook', 'knitting-needles', 'darning-needle', 'stitch-markers', 'cable-needle', 'buttons',
]);

// ---------------------------------------------------------------- patterns

/**
 * PATTERNS.md's type table: every WEARABLE type, the ones characters/garments.js can build (a cowl
 * is a scarf silhouette, not a type). `yarnUnits` is the headline number, a count of yarn ITEMS of
 * the pattern's own weight: it sets how much yarn the NPC has to buy AND, via the progress formula
 * in WIP-AND-FINISHED-OBJ-FORMATION.md, how many rounds the project takes. Socks are a quick win; a
 * sweater is a project you watch across a visit or two.
 *
 * Which silhouette a pattern makes is per DESIGN (`silhouette`, from PATTERN_TITLES' keys), not per
 * type. TODO(VISUAL-DESIGN-FINISHED-OBJ.md §6): the decor types (blanket, potholder, cozy, chair
 * cover, amigurumi, mittens) wait for something that draws them -- as patterns today they would
 * finish into objects nobody can see, in the shop or in the Guestbook photo.
 */
export const PATTERN_TYPES = Object.freeze({
  sweater: { yarnUnits: 8, minColors: 2 },
  shawl:   { yarnUnits: 5, minColors: 3 },
  scarf:   { yarnUnits: 4, minColors: 1 },
  bag:     { yarnUnits: 4, minColors: 1 },
  hat:     { yarnUnits: 3, minColors: 1 },
  socks:   { yarnUnits: 2, minColors: 1 },
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
 * yarn)". Weight decides the footprint: space on the shelf, not an amount of yarn (PATTERNS.md --
 * every item is one unit toward a pattern, see yarnUnits).
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
 * PATTERNS.md: "One item is one unit, whatever its weight." Footprint and volume were both tried
 * and dropped: items span 1 to 27 by volume, so no single pattern cost worked across weights (a
 * sensible bulky sweater was 54 lace balls). A wrong-weight item still counts one; it is a
 * near-miss that moves the FO's fit (NEAR-MISS-AND-SUBSTITUTION.md), not a conversion.
 */
export const yarnUnits = (item) => (item.name === 'yarn' ? 1 : 0);

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

// ---------------------------------------------------------------- named designs

/**
 * Every pattern the shop sells is a named DESIGN, and the names are a FINITE set that comes round
 * again: the OwlyCowly on the shelf today is the same OwlyCowly tomorrow, and two customers who buy
 * it are making the same thing. That re-use is the point. A pattern name is how knitters actually
 * talk about what they made, and it is the handle a future "matchies" mechanic (two NPCs in the
 * same named FO, a trend that spreads) groups by — see WEARABLE-FINISHED-OBJ.md, "Pattern names".
 *
 * Keyed by type, then by the SILHOUETTE the design makes, in characters/garments.js's own words
 * (GARMENTS[type].silhouettes): the OwlyCowly is a scarf worn as a cowl, so the NPC who finishes it
 * wears a cowl. Both key sets are asserted against garments.js in garments.test.mjs, which this
 * module cannot import (it is pure; garments.js is three.js and imports this). Puns lean on the
 * cast: owls and birds, lions, llamas and their alpaca cousins. Titles are unique across the whole
 * set, because a title IDENTIFIES a design rather than decorating one.
 */
export const PATTERN_TITLES = Object.freeze({
  sweater: Object.freeze({
    pullover: ['the Lionhearted Pullover', 'Pride & Joy Pullover', 'No Prob-llama Pullover', 'Purl-ican Pullover', 'the Night Owl Jumper',
      'Pullover Plover'],
    cardigan: ['Owl Be Cozy Sweater', 'Alpaca Cardi for Later', 'Take a Cardi-gander',
      "Mr. Owl's Neighbourhood Cardigan", 'Llama Hugs Cardigan', 'Snuggle Cub Cardigan'],
    vest: ['Feather Weather Sweater', 'Vest in Show', 'the Vest Nest',
      'Vest Friends Forever Owl', 'Investment Lion Vest', 'Llama Vest-ival'],
    turtleneck: ['Fleece Navidad', 'the Hootleneck', 'Cable Car Llama',
      'Neck and Neck Llama', 'Turtle-Dove Neck', 'Roll Neck Robin'],
    cropped: ['Short and Tweet Sweater', 'Cream of the Crop Cub', 'Crop Circle Owl',
      'Crop Top Cockatoo', "Crop 'Til You Drop Alpaca", 'Short Stack Sparrow'],
    tunic: ['Hoot Couture Sweater', 'Lion Around Sweater', 'Ooh La Llama Tunic',
      'Toucan Tunic Tango', 'Tunic of the Pride', 'Alpaca Tunic Picnic'],
    raglan: ['Roar-some Raglan', 'Birds of a Feather Raglan', 'Rah-Rah Raglan Robin',
      'Raglan Rambler Lark', 'Ragtime Lion Raglan', 'Raggle-Taggle Llama'],
  }),
  shawl: Object.freeze({
    triangle: ['Wingspan Shawl', 'Fine Feathered Friends Shawl', 'Love Triangle Lovebirds', 'Off the Hook Owl Shawl',
      'Bermuda Triangle Puffin', 'Tri, Tri Again Lion'],
    'half circle': ['Shawl We Dance', 'Owl Seasons Shawl', 'Circle of Life Shawl',
      'Half Moon Hoot', 'Circle of Friends Flamingo', 'Semi-Circle Cygnet'],
    'rectangular wrap': ['Alpaca My Bags Wrap', 'All Owl Wrapped Up', 'Wrap Star Lion',
      'Cozy Corners Cub', 'Wrap Battle Llama', 'Squared Away Sparrow'],
    crescent: ['Llamaste Shawl', 'Plume With a View', 'Moonlit Owl Crescent',
      'Crescent Moon Mane', 'Crescendo Canary', 'Waxing Owl Crescent'],
    capelet: ['Mane Attraction Shawl', 'the Roaring Twenties Shawl', 'Superb Owl Capelet',
      'Cape Cod Cockatoo', 'Caped Crusader Cub', 'Capelet Llama Drama'],
    shrug: ['Whoo Cares Shrug', 'Shrug of War', 'Hug-a-Shrug Alpaca',
      'Shrug It Off Ostrich', 'Meh-Lion Shrug', 'Nonchalant Llama Shrug'],
  }),
  scarf: Object.freeze({
    cowl: ['the OwlyCowly', 'Llamanade Cowl', 'Cowl of the Wild', 'Mane Squeeze Cowl', 'Nest Friend Cowl',
      'Cowl-a-Doodle-Doo', 'Fa-La-La-Llama Cowl', 'Hootenanny Cowl', "the Lion's Share Cowl", 'Early Bird Cowl'],
    infinity: ['Owlways and Forever', 'Loop-de-Llama', 'Hoop Hoop Hooray',
      'Infinity and Beak-yond', 'Infinite Pride Loop', 'Round Robin Loop'],
    ascot: ['Sir Hoots-a-Lot Ascot', 'the Dandy Lion Ascot', 'Posh Peacock Ascot',
      'Ascot Alpaca Gala', 'Royal Ascot Lion', 'Tally-Ho Heron Ascot'],
    long: ['the Llong Llama Scarf', 'Long Live the King Scarf', 'Long Story Stork Scarf',
      'Long Neck Llama Scarf', 'Long Haul Albatross', 'So Long, Seagull'],
    trailing: ['Happy Trails Scarf', 'Blazing Trail Lion Scarf', 'Tail Feather Trailer',
      'Trailblazer Tern', 'Pride Trail Scarf', 'Llama Trail Mix'],
    skinny: ['Skinny Minnie Mynah', 'Skinny Dip Duck Scarf', 'String Bean Stork',
      'Skinny Latte Lark', 'Slim Pickings Pelican', 'Noodle Neck Llama'],
    kerchief: ['Ah-Kerchief Alpaca', 'Llama Bandana-rama', "Rootin' Tootin' Owl Kerchief",
      'Ker-Chief of the Pride', 'Bandit Bandana Owl', 'Kerchoo! Alpaca'],
    'chunky wrap': ["That's a Wrap, Lion", 'Chunky Chick Wrap', "Wrapper's Delight Llama",
      'Chunk-a-Llama Wrap', 'Big Bird Hug Wrap', 'Cuddle Puddle Cub Wrap'],
  }),
  bag: Object.freeze({
    'shoulder bag': ['Cold Shoulder Llama Bag', 'Shoulder to Shoulder Owl Bag', 'Chip on My Shoulder Chickadee',
      'Shoulder Season Swallow', 'Head and Shoulders Heron', 'Cool Shoulder Cub Bag'],
    'market bag': ['Supermarket Sparrow', 'Flea Market Flock Bag', 'Chain Store Lion Bag',
      'Farmers Market Finch', 'Market Day Llama', 'Mane Street Market Bag'],
    backpack: ['Owl Be Back Pack', 'Alpaca a Backpack', 'Pack Leader Lion Backpack',
      'Rucksack Robin', 'Pack It Up Puffin', 'Back to the Nest Pack'],
    tote: ['Tote-ally Owlsome', 'Tweety Tote', 'the Pride Tote',
      'Tote Bag Toucan', 'Tote-em Pole Owl', 'Tote-ally Mane-ageable'],
    'bucket bag': ['Birdseed Bucket Bag', 'Drop in the Bucket Bag', "Lion's Den Bucket Bag",
      'Bucket Brigade Lion', 'Bucketful of Sunshine Bag', 'Bucket Ducket Duckling'],
    'crossbody pouch': ['Pelican Pouch', 'Criss-Cross Cub Pouch', "Don't Cross the Llama Pouch",
      'Pouch Potato Owl', 'Cross My Heart Cockatoo', 'Kanga-Llama Pouch'],
    'drawstring bag': ['Quick Draw Llama Bag', 'Luck of the Draw Bag', 'Back to the Drawstring Board',
      'Draw a Bird Bag', 'Drawn to Llamas Bag', 'Drawstring Den Lion'],
  }),
  hat: Object.freeze({
    beanie: ['Bird Brain Beanie', 'Nest Egg Beanie', 'Cub Scout Beanie', 'Alpaca Lunch Beanie',
      'Beak-a-Boo Bobble Hat', 'Whoo Goes There Toque'],
    slouch: ['No Slouch Llama', 'Lion Low Slouch Hat', 'Slouch Potato Owl',
      'Laid-Back Lion Slouch Hat', 'Sunday Slouch Sparrow', 'Slouchy Alpaca Daydream'],
    fisherman: ['Cast Off Fisherman', 'Kingfisherman Hat', 'Reel Cool Heron Hat',
      "Gone Fishin' Pelican", 'Catch of the Day Cub', 'Fish Tales Llama'],
    beret: ['Llama Glama Beret', 'Beret Nice Owl', 'Pride of Paris Beret',
      'Beret Berry Bluebird', 'Bonjour Bird Beret', 'Oui Oui Owl Beret'],
    earflap: ['Flap Happy Hat', 'All Ears Alpaca', 'Hear Me Roar Earflap',
      'Ear to Ear Owl', 'Lend Me Your Ears Llama', 'Flappy Bird Hat'],
    hood: ['the Robin Hood', 'Little Red Riding Hoot', 'Neighbourhood Watch Owl',
      'Hoodwinked Owl', 'Pride of the Hood', 'Little Red Riding Llama'],
    headband: ['the Mane Event Hat', 'Pride Band', 'Rock-a-Llama Headband',
      'Band of Birds', 'Band Camp Llama', 'Head Honcho Lion Band'],
    bucket: ['Hooked on a Feeling Bucket Hat', 'Bucket List Llama', 'Puddle Duck Bucket Hat',
      'Rainy Day Robin Bucket Hat', 'Bandit Owl Bucket Hat', 'Lion in the Rain Bucket Hat'],
    cloche: ['Llama Llama Red Hat', 'Cloche Encounters of the Bird Kind', 'Cloche Call Cub',
      'Cloche to My Heart', 'Cloche Shave Lion', 'Flapper Finch Cloche'],
    pixie: ['Tweet Dreams Nightcap', 'Pixie Dust Owl', 'Pointy Plume Pixie',
      'Pixie Cut Cub', 'Pixie Pip Sparrow', 'Pixie Point Llama'],
  }),
  socks: Object.freeze({
    crew: ['Flight Crew Socks', 'Motley Crew Socks', 'Pride Crew Socks',
      'Crew Love Lovebird', 'Sock Hop Sparrow', 'Crew-ser Lion Socks'],
    'knee-high': ['Owl Knee-d You Socks', 'Knee Deep in Fleece', 'Knit Pick Knee-Highs',
      'Knee-Hi Hello Owl', "Bee's Knees Bluebird", 'Knee-sy Does It Llama'],
    'over-knee': ['Head Over Heels Llama', 'Over the Moon Owl Socks', 'Stockinette Stork Stockings',
      'Over the Top Toucan', 'Head Over Hooves Llama', 'Thigh-High Fly Socks'],
    slouch: ['Lazy Lion Slouch Socks', 'Lounge Llama Socks', 'Couch Cub Socks',
      'Slouchy Sunday Socks', 'Couch Potato Puffin', 'Dozy Owl Slouch Socks'],
    'leg warmers': ['Leg-endary Lion Warmers', 'One Leg Up Flamingo', 'Leg Day Llama',
      'Leg Warmer Lark', 'Shake a Leg Llama', 'Warm Up Warbler'],
    'slipper socks': ['Toasty Talons Slippers', 'Llama Pajama Slippers', 'Paws and Relax Slippers',
      'Snug as a Bug Slippers', 'Toasty Toes Toucan', 'Cozy Claws Cub Slippers'],
  }),
});

/**
 * A title that puns on one craft's own words is a design OF that craft: a crocheted "Purl-ican
 * Pullover" is a joke that lies. Animal, yarn and cosy puns fit either. Shared with the check in
 * wip.test.mjs, so the data and the test cannot disagree about what counts as a craft pun.
 */
export const CRAFT_TERMS = Object.freeze({
  knitting: /purl|knit|stockinette|cable|garter|\bribb?(ed|ing)?\b|needle|cast on|cast off|bind off|yarn.?over/i,
  crochet: /hook|chain|crochet|granny|amigurumi|slip stitch|treble/i,
});
/** The craft a title's pun commits it to, or null for a pun that fits either. */
export const craftOfTitle = (title) => CRAFTS.find((c) => CRAFT_TERMS[c].test(title)) ?? null;

/**
 * One design, fixed by its place `g` in the flat title list — so a title always means one spec.
 *
 * Weight and material are DEALT rather than rolled: g walks every weight x material pair in the
 * shop's range before repeating (the material skews by one each lap, so neighbouring designs — and
 * so each type — get a mix of both), the first 16 designs cover all 16, and a customer holding ANY
 * stock yarn has at least one named pattern that suits it (stockPatternFor relies on this; craft
 * plays no part in that match). Craft and tool size are rolled from a PRNG seeded by g, which is
 * just as fixed but less regimented -- except that a craft pun decides its own craft.
 * ponytail: specs follow list ORDER, so append new titles; reordering reassigns them (harmless
 * while nothing is saved across reloads; key the seed on the title if that changes).
 */
function design({ type, silhouette, title }, g) {
  const { weights, materials, toolSizes } = SHOP_RANGE;
  const rng = mulberry32(g + 1);
  const rolled = makePattern(rng, type);
  return Object.freeze({
    ...rolled,
    title,
    silhouette,
    craft: craftOfTitle(title) ?? rolled.craft,
    toolSize: pickFrom(toolSizes, rng),
    weight: weights[g % weights.length],
    materials: Object.freeze([materials[(g + Math.floor(g / weights.length)) % materials.length]]),
    // ARRANGEMENT-RECIPES.md §3: a cabled design needs a cable needle, a buttoned one buttons.
    // ponytail: read off the title and silhouette; a real per-design field once recipes exist.
    notions: Object.freeze([
      ...(/cable/i.test(title) ? ['cable-needle'] : []),
      ...(silhouette === 'cardigan' ? ['buttons'] : []),
    ]),
  });
}

/** The whole finite set the shop draws from, frozen: a shelf copy is made by makeStockPattern. */
export const PATTERN_DESIGNS = Object.freeze(Object.entries(PATTERN_TITLES)
  .flatMap(([type, looks]) => Object.entries(looks)
    .flatMap(([silhouette, titles]) => titles.map((title) => ({ type, silhouette, title }))))
  .map(design));

/** A shelf copy of a design: its own `materials` list, so nothing downstream can edit the design. */
const copyOf = (d) => ({ ...d, materials: [...d.materials] });

// Both params default, mirroring makePattern/makeYarn/makeNotion above: the second one is
// derived from the first rather than left bare. A bare `type` would force the one caller that
// wants to name a notion to pass `Math.random` positionally just to reach past it, which is
// exactly what buryOne was already doing.
/**
 * Pick from `designs` with every SILHOUETTE in them equally likely, then a design within it. A
 * silhouette with ten names (the cowl) must not turn up three times as often as one with three:
 * what the shop carries is a spread of things to make, and the name count is just how many puns
 * one silhouette happened to inspire.
 */
function evenly(designs, rng) {
  const looks = [...new Set(designs.map((d) => `${d.patternType}/${d.silhouette}`))];
  const look = pickFrom(looks, rng);
  return copyOf(pickFrom(designs.filter((d) => `${d.patternType}/${d.silhouette}` === look), rng));
}

/** A pattern this shop sells: a named design of that type, its silhouettes evenly spread. */
export const makeStockPattern = (rng = Math.random, type = pickFrom(PATTERN_NAMES, rng)) =>
  evenly(PATTERN_DESIGNS.filter((d) => d.patternType === type), rng);

/**
 * A named design written for this yarn — what a customer who already owns the yarn is shopping
 * for. Never empty for stock yarn: `design` deals every weight x material pair (asserted in
 * wip.test.mjs). The comparison is wip.js's yarnSuitsPattern, inlined because wip.js imports this.
 */
export const stockPatternFor = (yarn, rng = Math.random) => evenly(PATTERN_DESIGNS.filter(
  (d) => d.weight === yarn.weight && d.materials.includes(yarn.material)), rng);

/** A ball from the shop's range. */
export const makeStockYarn = (rng = Math.random) => {
  const y = makeYarn(rng, pickFrom(SHOP_RANGE.weights, rng));
  y.material = pickFrom(SHOP_RANGE.materials, rng);
  return y;
};

/** A tool in a size the shop stocks; other notions unchanged. */
export const makeStockNotion = (rng = Math.random, name = pickFrom(NOTION_NAMES, rng)) => {
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
    // A named design leads with its name; a one-off (makePattern, the puzzle builder) has none.
    return `${thing.title ? `${thing.title} — ` : ''}${thing.patternType} pattern (${thing.craft} ${thing.toolSize}mm, ` +
           `${thing.weight} ${thing.materials.join('/')})`;
  }
  return thing.size != null ? `${thing.name} ${thing.size.toFixed(1)}mm` : thing.name;
}
