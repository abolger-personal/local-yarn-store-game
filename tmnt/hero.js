import * as THREE from 'three';
import { getSpecies } from '../characters/npc.js';
import { PAINT, inkMaterial, inkOutline } from '../characters/paint.js';
import { COLOURWORKS, FORMS, GARMENTS } from '../characters/garments.js';
import { BAGS, CAPES, CLOTH as RIOT, HANDS, CANE, MIC, NEEDLES, SCISSORS, STAFF, YARN_BALLS, SPECIES, TEXTURES, TRICKS, buildFighter, nearestSwatch, readFighter, setFur } from '../spinoff/fighter.js';

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
// REUSE-SPEC.md §Hero chooser: face paint without the NFL eye black (it doesn't show on a turtle), and glasses
export const PAINTS = Object.freeze(['none', 'rings', 'heart']);
export const FACES = Object.freeze([...PAINTS, 'glasses']);
const DEFAULT_HANDS = 'gloves';
// REUSE-SPEC.md §Hero chooser: the gloves and the heroes' own; not the fighters' sword, scythe or hammer
export const HERO_HANDS = Object.freeze([DEFAULT_HANDS, SCISSORS, NEEDLES, STAFF, YARN_BALLS, MIC, CANE]);
// REUSE-SPEC.md §Hero chooser: the mouse is Master Splinter, with his cane
export const handsOf = (species) => (species === 'mouse' ? CANE : DEFAULT_HANDS);

/** @typedef {{ species: string, params: Record<string, any>, look: import('../spinoff/fighter.js').Look & Record<string, any> }} Hero */

// every piece off, in the fighters' Look shape (no hat or cape: heroes don't get them)
/** @returns {Hero['look']} */
const blankLook = (base = GREEN) => ({
  hat: null, hatColor: base, hatStitch: 'stockinette', cape: null, capeColor: base, capeStitch: 'stockinette', bag: null, bagColor: base,
  scarfForm: 'draped', scarfCover: 0, sweaterWork: 'solid', glasses: false, hands: DEFAULT_HANDS, trick: TRICKS[DEFAULT_HANDS][0], gloves: base,
  ...Object.fromEntries(Object.keys(WEAR).flatMap((k) => [[k, null], [`${k}Color`, base], [`${k}Stitch`, 'stockinette']])),
});

// REUSE-SPEC.md §Hero chooser: each turtle's own things on top of the scarf: Raphael (red) his knitting needles and red socks;
// happy-go-lucky Michelangelo (orange) an open scarf, short socks, a backpack and his balls of yarn; nerdy
// Donatello (purple) black-rimmed glasses, a cowl, a fanny pack and his bo staff; straight-laced Leonardo (blue) high boots, a drawstring bag
// and his giant safety scissors, a half in each hand
const ORANGE = COLOURS[0].hex, BLUE = COLOURS[1].hex, PURPLE = COLOURS[2].hex, RED = COLOURS[3].hex;
const SIGNATURE = {
  [PURPLE]: { look: { glasses: true, scarf: 'cowl', bag: 'crossbody pouch', bagColor: PURPLE, socks: 'knee-high', socksColor: PURPLE, hands: STAFF, trick: TRICKS[STAFF][0] } },
  [BLUE]: { look: { socks: 'over-knee', socksColor: BLUE, bag: 'drawstring bag', bagColor: BLUE, hands: SCISSORS, trick: TRICKS[SCISSORS][0] } },
  [RED]: { look: { hands: NEEDLES, trick: TRICKS[NEEDLES][0], socks: 'over-knee', socksColor: RED } },
  [ORANGE]: { look: { scarf: 'long', scarfForm: 'draped', socks: 'crew', socksColor: ORANGE, bag: 'backpack', bagColor: ORANGE, hands: YARN_BALLS, trick: 'plain' } },
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
// every turtle starts in his mask (amended 2026-11-10, the kids asked), Donatello's glasses over his
const turtle = (scarf) => ({ species: 'turtle', fur: GREEN, facePaint: 'rings', look: () => scarfLook(scarf) });
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

// REUSE-SPEC.md §Bad guys: purple, black and silver are theirs. The villain designer (the chooser with ?debug=1) has
// every garment built (characters/garments.js), hats and capes too, every scarf form, the fighters' weapons, and
// the fighters' colours on top of the heroes' and their own (decided 2026-11-12)
const BLACK = '#141414', SILVER = '#c0c4cc';
const VILLAIN_COLOURS = Object.freeze([{ hex: PURPLE, name: 'purple' }, { hex: BLACK, name: 'black' }, { hex: SILVER, name: 'silver' }].map((c) => Object.freeze(c)));
const unique = (list) => list.filter((c, i) => list.findIndex((o) => o.hex === c.hex) === i);
const ALL_CLOTH = Object.freeze(unique([...VILLAIN_COLOURS, ...CLOTH, ...RIOT]));
const kinds = (type) => GARMENTS[type].silhouettes;
const ALL_WEAR = Object.freeze({
  hat: kinds('hat'), cape: [...new Set([...CAPES, ...kinds('shawl')])], scarf: kinds('scarf'), sweater: kinds('sweater'), socks: kinds('socks'), bag: kinds('bag'),
});

/** What a chooser offers and a save keeps: a hero's, or a villain's (everything).
 *  @typedef {{ key: string, wear: Record<string, readonly string[]>, cloth: readonly { hex: string, name: string }[],
 *   fur: readonly { hex: string, name: string }[], forms: readonly string[], hands: readonly string[], palette: string[], base: string,
 *   mask: boolean }} Kit  `mask`: a wrapped scarf can cover the face (`look.scarfCover`, 0..1; characters/garments.js) */
/** @type {Kit} */
const HERO_KIT = Object.freeze({ key: HERO_KEY, wear: WEAR, cloth: CLOTH, fur: COLOURS, forms: SCARF_FORMS, hands: HERO_HANDS, palette: PALETTE, base: GREEN, mask: false });
/** @returns {Kit} */
const villainKit = (key) => Object.freeze({
  key, wear: ALL_WEAR, cloth: ALL_CLOTH, fur: ALL_CLOTH, forms: FORMS, hands: [...new Set([...HERO_HANDS, ...HANDS])],
  palette: VILLAIN_COLOURS.map((c) => c.hex), base: BLACK, mask: true,
});
export const KITS = Object.freeze({ hero: HERO_KIT, sock: villainKit('tmnt.sock.v1'), sweater: villainKit('tmnt.sweater.v1') });

// REUSE-SPEC.md §Bad guys: the Sock Clan's soldiers, made in the villain designer (2026-11-12), all in a black hood, a
// purple triangle shawl, a black vest, socks and silver hands: a black owl with a heart on its cheek and a scythe, a
// black llama with bare gloves, a red lion in red crew socks with balls of yarn, and two in their own clothes.
const SOCK_LOOK = {
  hat: 'hood', hatColor: BLACK, cape: 'triangle', capeColor: PURPLE, sweater: 'vest', sweaterColor: BLACK, socks: 'over-knee', socksColor: BLACK,
  socksStitch: 'single crochet', scarfForm: 'wrapped twice', scarfColor: PURPLE, gloves: SILVER,
};
const VILLAINS = {
  sock: [
    { species: 'owl', params: { bodyColor: BLACK, featherColor: '#464444', facePaint: 'heart' }, look: { ...SOCK_LOOK, hands: 'scythe', trick: 'music' } },
    { species: 'llama', params: { bodyColor: BLACK, fleeceColor: '#464444' }, look: { ...SOCK_LOOK, capeStitch: 'garter' } },
    { species: 'lion', params: { bodyColor: RED, maneColor: '#fb8ca3' }, look: {
      ...SOCK_LOOK, hatStitch: 'garter', capeStitch: 'garter', socks: 'crew', socksColor: RED, hands: YARN_BALLS, trick: 'plain' } },
    // the odd one out: a purple mouse in a red hood and kerchief, a violet fair isle cropped sweater, with the hammer
    { species: 'mouse', params: { bodyColor: PURPLE, maneColor: '#391057' }, look: {
      hat: 'hood', hatColor: RED, cape: 'half circle', capeColor: PURPLE, scarf: 'kerchief', scarfColor: RED, scarfForm: 'wrapped twice',
      sweater: 'cropped', sweaterColor: '#8154ff', sweaterWork: 'fair isle', socks: 'knee-high', socksColor: RED, hands: 'hammer', trick: 'lightning',
      gloves: RED, bagColor: WHITE, bagStitch: 'rib' } },
    // a red dragon in a black hood, over-knee socks and the flame sword: level 1's boss (REUSE-SPEC.md §Level 1)
    { species: 'dragon', params: { bodyColor: RED }, look: {
      hat: 'hood', hatColor: BLACK, cape: 'capelet', capeColor: PURPLE, capeStitch: 'garter', scarf: 'infinity', scarfColor: PURPLE, scarfForm: 'tied',
      sweater: 'cropped', sweaterColor: '#8154ff', sweaterWork: 'fair isle', socks: 'over-knee', socksColor: RED, hands: 'sword', trick: 'flame',
      gloves: RED, bagColor: WHITE, bagStitch: 'rib' } },
  ],
  // The Sweater's outfit, as the designer made it (2026-11-12): a black earflap hat, a purple cape, a black fair isle
  // vest, and a silver trailing scarf wrapped twice up over half its face. Which animal is open (the kids vote); a
  // lion in its natural fur till then
  sweater: [{ species: 'lion', look: {
    hat: 'earflap', hatColor: BLACK, hatStitch: 'waffle', cape: 'cape', capeColor: PURPLE, capeStitch: 'single crochet', scarf: 'trailing',
    scarfColor: SILVER, scarfForm: 'wrapped twice', scarfCover: 1, sweater: 'vest', sweaterColor: BLACK, sweaterWork: 'fair isle', socks: 'over-knee',
    socksColor: BLACK, trick: 'atomicBall', gloves: BLACK, bagColor: '#ff3b7f',
  } }],
};
/** How many kinds of Sock Clan soldier there are. */
export const SOCK_KINDS = VILLAINS.sock.length;
/** A Sock Clan soldier (`sock`, its `kind`th) or The Sweater (`sweater`) to design from; in another `species`, the
 *  same clothes on its natural fur. @returns {Hero} */
export function newVillain(role, species = undefined, kind = 0) {
  const who = VILLAINS[role][kind % VILLAINS[role].length], animal = species ?? who.species, own = animal === who.species ? who.params : {};
  return { species: animal, params: { ...structuredClone(getSpecies(animal).defaults), ...own }, look: { ...blankLook(BLACK), ...who.look } };
}

const pickOf = (list, rng) => list[Math.floor(rng() * list.length)];

/** 🎲: any animal, any colours, each piece worn or not, of what `kit` offers. @param {Kit} kit @returns {Hero} */
export function randomHero(rng = Math.random, kit = HERO_KIT) {
  const animal = pickOf(SPECIES, rng), hero = kit === HERO_KIT ? newHero(rng, animal) : newVillain('sweater', animal);
  const { look } = hero, colour = () => pickOf(kit.cloth, rng).hex;
  getSpecies(hero.species).randomise(hero.params);
  for (const [kind, list] of Object.entries(kit.wear)) Object.assign(look, { [kind]: pickOf([...list, null], rng), [`${kind}Color`]: colour() });
  Object.assign(look, { sweaterWork: pickOf(SWEATER_WORKS, rng), scarfForm: pickOf(kit.forms, rng), hands: pickOf(kit.hands, rng), gloves: colour() });
  look.trick = pickOf(TRICKS[look.hands], rng);
  hero.params.facePaint = pickOf(PAINTS, rng);
  look.glasses = rng() < 0.25;
  return setFur(hero, pickOf(kit.fur, rng).hex);
}

/** @param {Kit} kit */
function readLook(raw, kit) {
  const r = raw && typeof raw === 'object' ? raw : {}, look = blankLook(kit.base);
  const one = (k, list) => (list.includes(r[k]) ? r[k] : look[k]);
  const colour = (k) => (HEX.test(r[k]) ? nearestSwatch(kit.cloth, r[k]).hex : look[k]);
  for (const [kind, list] of Object.entries(kit.wear)) {
    Object.assign(look, { [kind]: one(kind, list), [`${kind}Color`]: colour(`${kind}Color`), [`${kind}Stitch`]: one(`${kind}Stitch`, TEXTURES) });
  }
  look.glasses = r.glasses === true;
  look.scarfCover = kit.mask ? Math.min(1, Math.max(0, Number(r.scarfCover) || 0)) : 0;
  Object.assign(look, { sweaterWork: one('sweaterWork', SWEATER_WORKS), scarfForm: one('scarfForm', kit.forms), hands: one('hands', kit.hands), gloves: colour('gloves') });
  look.trick = one('trick', TRICKS[look.hands]);
  return look;
}

/** Untrusted JSON from storage or another tablet → a Hero, or null; fur and clothes snap to the hero colours (a
 *  villain's clothes to its kit's, its fur kept: natural, till one is picked). @param {Kit} kit @returns {Hero|null} */
export function readHero(raw, kit = HERO_KIT) {
  const f = readFighter(raw);
  if (!f) return null;
  if (!PAINTS.includes(f.params.facePaint)) f.params.facePaint = 'none';
  const hero = { species: f.species, params: f.params, look: readLook(raw.look, kit) };
  return kit === HERO_KIT ? setFur(hero, nearestSwatch(COLOURS, f.params.bodyColor).hex) : hero;
}

/** @param {Kit} kit */
export function loadHero(kit = HERO_KIT) {
  try { return readHero(JSON.parse(localStorage.getItem(kit.key) ?? 'null'), kit); } catch { return null; }
}

/** Its own key: the donut fighters' save is on the same site; a villain's design under its kit's. @param {Hero} h @param {Kit} kit */
export function saveHero(h, kit = HERO_KIT) {
  try { localStorage.setItem(kit.key, JSON.stringify(h)); } catch {}
}

// REUSE-SPEC.md §Hero chooser: the mask (rings) in the scarf's colour, so a turtle's sync up; on a turtle's big eyes, narrow
const MASK_ON = Object.freeze({ turtle: 0.35 });
/** The hero as it's built: the mask's colour and size set from the scarf and the animal. @param {Hero} hero @returns {Hero} */
export function faceOf(hero) {
  const { look, species } = hero, params = /** @type {Record<string, any>} */ ({ ...hero.params, facePaintColor: look.scarf ? look.scarfColor : '' });
  if (params.facePaint === 'rings') params.facePaintSize = MASK_ON[species] ?? params.facePaintSize;
  return { ...hero, params };
}

// REUSE-SPEC.md §Hero chooser: black-rimmed glasses, a rim round the front of each eye and a bridge between
const RIM = new THREE.TorusGeometry(1, 0.1, 8, 28), BRIDGE = new THREE.CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2);
const GLASSES = { size: 1.12, ahead: 0.85, thick: 0.012 };
function addGlasses(built) {
  const black = built.addMaterial(new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.45 }));
  const rims = built.joints.eye.map(({ node, r }) => {
    const rim = new THREE.Mesh(RIM, black);
    rim.position.copy(node.position).add(new THREE.Vector3(0, 0, r * GLASSES.ahead));
    rim.scale.setScalar(r * GLASSES.size);
    node.parent.add(rim);
    return rim;
  });
  const [a, b] = rims, gap = Math.abs(a.position.x - b.position.x) - a.scale.x - b.scale.x;
  if (gap <= 0) return;
  const bridge = new THREE.Mesh(BRIDGE, black);
  bridge.position.copy(a.position).add(b.position).multiplyScalar(0.5).add(new THREE.Vector3(0, a.scale.x * 0.3, 0));
  bridge.scale.set(GLASSES.thick, gap, GLASSES.thick);
  a.parent.add(bridge);
}

// REUSE-SPEC.md §Ink outlines: this game's painter dials (decided 2026-11-12, set on the species checker): bolder
// bands and brush, the fur pooling dark at its edge, and a thin ink outline. Only this game's pages set them.
const GAME_PAINT = Object.freeze({
  bands: 5, brush: 1, light: 0.99, size: 2.59, accentSize: 0.66, soft: 0.17, fray: 0.56, feather: 0.84, pool: 0, edgePool: 1, ink: 0.0015, scales: 0.5, scaleSize: 1,
});
function gamePaint() {
  for (const [k, v] of Object.entries(GAME_PAINT)) PAINT[k].value = v;
  inkMaterial().visible = true;
}

/** A hero built for the stage: as a fighter, with the hero colours for sweater colourwork, the face set, glasses on,
 *  painted and outlined in this game's ink. @param {Hero} hero */
export function buildHero(hero, palette = PALETTE) {
  gamePaint();
  const built = buildFighter(faceOf(hero), palette);
  if (hero.look.glasses) addGlasses(built);
  inkOutline(built.root);
  return built;
}

// REUSE-SPEC.md §Level 1, the heroes pop: a soft glow in the hero's scarf colour and a dark shadow, behind them, each
// as strong as its URL value (?glow=, ?shadow=, 0 to 1); two materials for every hero, set as each is added
const POP = { glow: null, shadow: null };
let popMap = null;
function popTexture() {
  if (popMap) return popMap;
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, '#fff'); r.addColorStop(0.45, '#fffc'); r.addColorStop(1, '#fff0');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return (popMap = new THREE.CanvasTexture(c));
}

/** The pop strengths from the page's address, each clamped to 0..1; 0 (off) without them. */
export function popFromQuery(query = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(query), dial = (k) => Math.min(1, Math.max(0, Number(q.get(k)) || 0));
  return { glow: dial('glow'), shadow: dial('shadow') };
}

const _mid = new THREE.Vector3(), _away = new THREE.Vector3(), _size = new THREE.Vector3(), _one = new THREE.Quaternion();
/** Puts `kind` behind `built`, `strength` strong, `colour`, kept on the far side of the hero from the camera, `grow` times its height across. */
function popSprite(built, kind, strength, colour, grow) {
  const box = new THREE.Box3().setFromObject(built.root), h = box.getSize(_size).y, centre = built.root.worldToLocal(box.getCenter(new THREE.Vector3()));
  const material = (POP[kind] ??= new THREE.SpriteMaterial({ map: popTexture(), depthWrite: false }));
  Object.assign(material, { opacity: strength }).color.set(colour);
  const sprite = Object.assign(new THREE.Sprite(material), { frustumCulled: false });
  sprite.onBeforeRender = (_r, _s, camera) => {
    built.root.localToWorld(_mid.copy(centre));
    _away.copy(_mid).sub(camera.position).normalize().multiplyScalar(h * 0.6);
    sprite.matrixWorld.compose(_mid.add(_away), _one, _size.setScalar(h * grow));
  };
  built.root.add(sprite);
}

/** The heroes pop off the playground: `pop.shadow` a dark halo behind, `pop.glow` the scarf's colour (the gloves' with no scarf). */
export function addPop(built, hero, pop) {
  if (pop.shadow) popSprite(built, 'shadow', pop.shadow, '#141414', 1.9);
  if (pop.glow) popSprite(built, 'glow', pop.glow, hero.look.scarf ? hero.look.scarfColor : hero.look.gloves, 1.6);
}
