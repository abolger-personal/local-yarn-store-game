// Pure data, no three.js or DOM (DESIGN-DECISIONS.md §3). Sources: PATTERNS.md, YARN.md, NOTIONS.md.

import { mulberry32 } from '../characters/store/core/util.js';

export const CRAFTS = Object.freeze(['knitting', 'crochet']);

export const TOOL_FOR_CRAFT = Object.freeze({ knitting: 'knitting-needles', crochet: 'crochet-hook' });
export const TOOL_NOTIONS = Object.freeze(['crochet-hook', 'knitting-needles']);

export const SIZED_NOTIONS = new Set(['crochet-hook', 'knitting-needles']);
export const HOOK_SIZES_MM = Object.freeze([2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0]);

export const NOTION_NAMES = Object.freeze([
  'crochet-hook', 'knitting-needles', 'darning-needle', 'stitch-markers', 'cable-needle', 'buttons',
]);

// PATTERNS.md, "Pattern types".
export const PATTERN_TYPES = Object.freeze({
  sweater: { yarnUnits: 8, minColors: 2 },
  shawl:   { yarnUnits: 5, minColors: 3 },
  scarf:   { yarnUnits: 4, minColors: 1 },
  bag:     { yarnUnits: 4, minColors: 1 },
  hat:     { yarnUnits: 3, minColors: 1 },
  socks:   { yarnUnits: 2, minColors: 1 },
  potholder: { yarnUnits: 1, minColors: 1, decor: true },
});
export const PATTERN_NAMES = Object.freeze(Object.keys(PATTERN_TYPES));
const STOCKED = PATTERN_NAMES.filter((t) => !PATTERN_TYPES[t].decor);

// PATTERNS.md: always 2x2x1.
export const PATTERN_FOOTPRINT = Object.freeze([2, 2]);

export const YARN_MATERIALS = Object.freeze([
  'wool', 'cotton', 'alpaca', 'silk', 'acrylic', 'linen', 'mohair', 'bamboo',
]);

// PATTERNS.md: weight decides the shelf footprint.
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

export const YARN_SHAPES = Object.freeze(['ball', 'cone', 'skein']);
// YARN.md, "Units".
export const SHAPE_UNITS = Object.freeze({ skein: 1, ball: 2, cone: 4 });

// YARN.md, "Colour count".
export const YARN_COLOR_COUNT = 48;

export const yarnUnits = (item) => (item.name === 'yarn' ? SHAPE_UNITS[item.shape] ?? 1 : 0);

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

export function makePattern(rng = Math.random, type = pickFrom(STOCKED, rng)) {
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
    layers: 1,
  };
}

export function makeYarn(rng = Math.random, weightName = pickFrom(YARN_WEIGHT_NAMES, rng)) {
  const weight = yarnWeight(weightName);
  return {
    name: 'yarn',
    material: pickFrom(YARN_MATERIALS, rng),
    weight: weight.name,
    shape: pickFrom(YARN_SHAPES, rng),
    colorIndex: Math.floor(rng() * YARN_COLOR_COUNT),
    w: weight.size,
    h: weight.size,
    layers: weight.size,
  };
}

export function makeNotion(rng = Math.random, name = pickFrom(NOTION_NAMES, rng)) {
  return {
    name,
    size: SIZED_NOTIONS.has(name) ? pickFrom(HOOK_SIZES_MM, rng) : null,
  };
}

// DESIGN-DECISIONS.md §6, "The shop's range".
export const SHOP_RANGE = Object.freeze({
  weights: Object.freeze(['fingering', 'dk', 'worsted', 'bulky']),
  materials: Object.freeze(['wool', 'cotton', 'alpaca', 'acrylic']),
  toolSizes: Object.freeze([3.0, 4.0, 5.0, 6.0]),
});

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
  potholder: Object.freeze({
    square: ['Hot Off the Hook Pot Holder', 'Granny Owl Pot Holder', 'Chain Reaction Lion Pot Holder',
      'Hooked on Hot Pots', 'Granny Llama Oven Square', 'Hot Chain Chickadee'],
  }),
});

export const CRAFT_TERMS = Object.freeze({
  knitting: /purl|knit|stockinette|cable|garter|\bribb?(ed|ing)?\b|needle|cast on|cast off|bind off|yarn.?over/i,
  crochet: /hook|chain|crochet|granny|amigurumi|slip stitch|treble/i,
});
export const craftOfTitle = (title) => CRAFTS.find((c) => CRAFT_TERMS[c].test(title)) ?? null;

// ponytail: a design's spec follows its list ORDER, so append new titles; key the seed on the title once saves span reloads.
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
    // ponytail: ARRANGEMENT-RECIPES.md §3 notions read off the title; a per-design field once recipes exist.
    notions: Object.freeze([
      ...(/cable/i.test(title) ? ['cable-needle'] : []),
      ...(silhouette === 'cardigan' ? ['buttons'] : []),
    ]),
  });
}

export const PATTERN_DESIGNS = Object.freeze(Object.entries(PATTERN_TITLES)
  .flatMap(([type, looks]) => Object.entries(looks)
    .flatMap(([silhouette, titles]) => titles.map((title) => ({ type, silhouette, title }))))
  .map(design));

const copyOf = (d) => ({ ...d, materials: [...d.materials] });

function evenly(designs, rng) {
  const looks = [...new Set(designs.map((d) => `${d.patternType}/${d.silhouette}`))];
  const look = pickFrom(looks, rng);
  return copyOf(pickFrom(designs.filter((d) => `${d.patternType}/${d.silhouette}` === look), rng));
}

export const makeStockPattern = (rng = Math.random, type = pickFrom(STOCKED, rng)) =>
  evenly(PATTERN_DESIGNS.filter((d) => d.patternType === type), rng);

export const stockPatternFor = (yarn, rng = Math.random) => evenly(PATTERN_DESIGNS.filter(
  (d) => STOCKED.includes(d.patternType) && d.weight === yarn.weight && d.materials.includes(yarn.material)), rng);

export const makeStockYarn = (rng = Math.random) => {
  const y = makeYarn(rng, pickFrom(SHOP_RANGE.weights, rng));
  y.material = pickFrom(SHOP_RANGE.materials, rng);
  return y;
};

export const makeStockNotion = (rng = Math.random, name = pickFrom(NOTION_NAMES, rng)) => {
  const it = makeNotion(rng, name);
  if (it.size != null) it.size = pickFrom(SHOP_RANGE.toolSizes, rng);
  return it;
};

export function labelOf(thing) {
  if (!thing) return '—';
  if (thing.name === 'yarn') return `${thing.weight} ${thing.material} yarn`;
  if (thing.name === 'pattern') {
    return `${thing.title ? `${thing.title} — ` : ''}${thing.patternType} pattern (${thing.craft} ${thing.toolSize}mm, ` +
           `${thing.weight} ${thing.materials.join('/')})`;
  }
  return thing.size != null ? `${thing.name} ${thing.size.toFixed(1)}mm` : thing.name;
}
