import { FACE_PAINTS, getSpecies } from '../characters/npc.js';
import { COLOURWORKS, FORMS } from '../characters/garments.js';
import { BAGS, CANE, MIC, NEEDLES, SCISSORS, STAFF, YARN_BALLS, SPECIES, TEXTURES, TRICKS, nearestSwatch, readFighter, setFur } from '../spinoff/fighter.js';

const HERO_KEY = 'tmnt.hero.v1';
const HEX = /^#[0-9a-f]{6}$/i;

// REUSE-SPEC.md §Hero chooser: the designer's six (2026-11-09), the four turtles' colours first, then turtle green and April's taxi yellow
export const COLOURS = Object.freeze([
  ['#ff6a00', 'orange'], ['#0056d6', 'blue'], ['#874efe', 'purple'], ['#b51a00', 'red'],
  ['#4f7a28', 'turtle green'], ['#f5ec00', 'taxi yellow'],
].map(([hex, name]) => Object.freeze({ hex, name })));
const GREEN = COLOURS[4].hex, TAXI = COLOURS[5].hex;
export const TURTLE_COLOURS = COLOURS.slice(0, 4);
export const PALETTE = COLOURS.map((c) => c.hex);
// REUSE-SPEC.md §Hero chooser: clothes also come in white (April's boots), fur never
const WHITE = '#ffffff';
export const CLOTH = Object.freeze([...COLOURS, Object.freeze({ hex: WHITE, name: 'white' })]);
// REUSE-SPEC.md §Hero chooser: the sweater, tapped again, in the next colourwork, so it reads as a sweater when small
export const SWEATER_WORKS = COLOURWORKS;

// REUSE-SPEC.md §Hero chooser: scarves, sweaters (April's jumpsuit is one), socks and bags; no hats or capes;
// wrapped twice is the Sock Clan's
export const WEAR = Object.freeze({
  scarf: ['trailing', 'long', 'cowl'], sweater: ['pullover', 'turtleneck', 'vest'], socks: ['crew', 'knee-high', 'over-knee'], bag: BAGS,
});
export const SCARF_FORMS = Object.freeze(FORMS.filter((f) => f !== 'wrapped twice'));
const DEFAULT_HANDS = 'gloves';
// REUSE-SPEC.md §Hero chooser: the gloves and the heroes' own; not the fighters' sword, scythe or hammer
export const HERO_HANDS = Object.freeze([DEFAULT_HANDS, SCISSORS, NEEDLES, STAFF, YARN_BALLS, MIC, CANE]);
// REUSE-SPEC.md §Hero chooser: the mouse is Master Splinter, with his cane
export const handsOf = (species) => (species === 'mouse' ? CANE : DEFAULT_HANDS);

/** @typedef {{ species: string, params: Record<string, any>, look: import('../spinoff/fighter.js').Look & Record<string, any> }} Hero */

// every piece off, in the fighters' Look shape (no hat or cape: heroes don't get them)
/** @returns {Hero['look']} */
const blankLook = () => ({
  hat: null, hatColor: GREEN, hatStitch: 'stockinette', cape: null, capeColor: GREEN, capeStitch: 'stockinette', bag: null, bagColor: GREEN,
  scarfForm: 'draped', sweaterWork: 'solid', hands: DEFAULT_HANDS, trick: TRICKS[DEFAULT_HANDS][0], gloves: GREEN,
  ...Object.fromEntries(Object.keys(WEAR).flatMap((k) => [[k, null], [`${k}Color`, GREEN], [`${k}Stitch`, 'stockinette']])),
});

// REUSE-SPEC.md §Hero chooser: each turtle's own things on top of the scarf: Raphael (red) his knitting needles and red socks;
// happy-go-lucky Michelangelo (orange) an open scarf, short socks, a backpack, cheek paint and his balls of yarn; nerdy
// Donatello (purple) a cowl, a fanny pack and his bo staff; straight-laced Leonardo (blue) high boots, a drawstring bag
// and his giant safety scissors, a half in each hand
const ORANGE = COLOURS[0].hex, BLUE = COLOURS[1].hex, PURPLE = COLOURS[2].hex, RED = COLOURS[3].hex;
const SIGNATURE = {
  [PURPLE]: { look: { scarf: 'cowl', bag: 'crossbody pouch', bagColor: PURPLE, socks: 'knee-high', socksColor: PURPLE, hands: STAFF, trick: TRICKS[STAFF][0] } },
  [BLUE]: { look: { socks: 'over-knee', socksColor: BLUE, bag: 'drawstring bag', bagColor: BLUE, hands: SCISSORS, trick: TRICKS[SCISSORS][0] } },
  [RED]: { look: { hands: NEEDLES, trick: TRICKS[NEEDLES][0], socks: 'over-knee', socksColor: RED } },
  [ORANGE]: { look: { scarf: 'long', scarfForm: 'draped', socks: 'crew', socksColor: ORANGE, bag: 'backpack', bagColor: ORANGE, hands: YARN_BALLS, trick: 'plain' }, facePaint: 'slashes' },
};
const scarfLook = (colour) => ({ ...blankLook(), scarf: 'trailing', scarfColor: colour, gloves: colour, ...SIGNATURE[colour]?.look });
// REUSE-SPEC.md §Hero chooser: leggy April is an orange llama: her jumpsuit a yellow sweater, her boots white socks, a
// blue drawstring bag, a heart on her cheek, her giant microphone
const jumpsuitLook = () => ({
  ...blankLook(), sweater: 'pullover', sweaterColor: TAXI, socks: 'over-knee', socksColor: WHITE, bag: 'drawstring bag', bagColor: BLUE,
  hands: MIC, trick: TRICKS[MIC][0], gloves: ORANGE,
});
// REUSE-SPEC.md §Hero chooser: the six presets: the four turtles, April, and Master Splinter (an orange mouse in a red
// vest and white socks, with his cane)
const turtle = (scarf) => ({ species: 'turtle', fur: GREEN, facePaint: SIGNATURE[scarf]?.facePaint, look: () => scarfLook(scarf) });
const WHO = Object.freeze([
  ...TURTLE_COLOURS.map(({ hex }) => turtle(hex)),
  { species: 'llama', fur: ORANGE, facePaint: 'heart', look: jumpsuitLook },
  { species: 'mouse', fur: ORANGE, look: () => ({ ...blankLook(), sweater: 'vest', sweaterColor: RED, socks: 'crew', socksColor: WHITE,
    hands: CANE, trick: TRICKS[CANE][0], gloves: RED }) },
]);
/** How many presets 🍕 steps through. */
export const PRESETS = WHO.length;

/** One of the presets; `species` given (the chooser's animal), in that animal. @returns {Hero} */
export function newHero(rng = Math.random, species = undefined) {
  const who = WHO[Math.floor(rng() * PRESETS)], look = who.look(), animal = species ?? who.species;
  if (animal === 'mouse') Object.assign(look, { hands: handsOf(animal), trick: TRICKS[handsOf(animal)][0] });
  const params = structuredClone(getSpecies(animal).defaults);
  params.facePaint = who.facePaint ?? params.facePaint;
  return setFur({ species: animal, params, look }, who.fur);
}

const pickOf = (list, rng) => list[Math.floor(rng() * list.length)];

/** 🎲: any animal, any colours, each piece worn or not. @returns {Hero} */
export function randomHero(rng = Math.random) {
  const hero = newHero(rng, pickOf(SPECIES, rng)), { look } = hero, colour = () => pickOf(CLOTH, rng).hex;
  getSpecies(hero.species).randomise(hero.params);
  for (const [kind, list] of Object.entries(WEAR)) Object.assign(look, { [kind]: pickOf([...list, null], rng), [`${kind}Color`]: colour() });
  Object.assign(look, { sweaterWork: pickOf(SWEATER_WORKS, rng), scarfForm: pickOf(SCARF_FORMS, rng), hands: pickOf(HERO_HANDS, rng), gloves: colour() });
  look.trick = pickOf(TRICKS[look.hands], rng);
  hero.params.facePaint = pickOf(FACE_PAINTS, rng);
  return setFur(hero, pickOf(COLOURS, rng).hex);
}

function readLook(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, look = blankLook();
  const one = (k, list) => (list.includes(r[k]) ? r[k] : look[k]);
  const colour = (k) => (HEX.test(r[k]) ? nearestSwatch(CLOTH, r[k]).hex : look[k]);
  for (const [kind, list] of Object.entries(WEAR)) {
    Object.assign(look, { [kind]: one(kind, list), [`${kind}Color`]: colour(`${kind}Color`), [`${kind}Stitch`]: one(`${kind}Stitch`, TEXTURES) });
  }
  Object.assign(look, { sweaterWork: one('sweaterWork', SWEATER_WORKS), scarfForm: one('scarfForm', SCARF_FORMS), hands: one('hands', HERO_HANDS), gloves: colour('gloves') });
  look.trick = one('trick', TRICKS[look.hands]);
  return look;
}

/** Untrusted JSON from storage or another tablet → a Hero, or null; fur and clothes snap to the hero colours. @returns {Hero|null} */
export function readHero(raw) {
  const f = readFighter(raw);
  if (!f) return null;
  return setFur({ species: f.species, params: f.params, look: readLook(raw.look) }, nearestSwatch(COLOURS, f.params.bodyColor).hex);
}

export function loadHero() {
  try { return readHero(JSON.parse(localStorage.getItem(HERO_KEY) ?? 'null')); } catch { return null; }
}

/** Its own key: the donut fighters' save is on the same site. @param {Hero} h */
export function saveHero(h) {
  try { localStorage.setItem(HERO_KEY, JSON.stringify(h)); } catch {}
}
