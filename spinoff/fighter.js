import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, FACE_PAINTS, MOTION_DEFAULTS, NAMES, POSES, applyPose, createCharacter, disposeCharacter, getSpecies, knitMaterial, mergeCharacter,
  lowestResting, phaseStep, stepMotion, walkGain, walkLayer, walkPhase,
} from '../characters/npc.js';
import { SPECIES_IDS } from '../characters/species.js';
import { CRAFTS, STITCHES_BY_CRAFT, defaultItem, dress, knitWrap, undress, usualTool } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import { buildFamily } from '../inventory/yarn-geometry.js';
import { makeSparkle } from '../characters/sparkle.js';
import { GLOVE, STRIKE, SWORD_MOVES, SWORD_UP, punchLayer, punchWeight, sample } from './punches.js';
import { HAMMER } from './hammer.js';
import { kickLayer, kickLunge } from './kicks.js';

const FIGHTER_KEY = 'lys.fighter.v1';
// the chooser's order, lion first: the registry's reversed, so seeded rosters draw as they always have
export const SPECIES = Object.freeze([...SPECIES_IDS].reverse());

const swatches = (pairs) => Object.freeze(pairs.map(([hex, name]) => Object.freeze({ hex, name })));

// REUSE-SPEC.md §Look: when in doubt, colour riot. Fur is not natural colours. In rainbow order, 24–40° of
// OKLCH hue apart, so no two look alike.
const RIOT = [
  ['#ff3b7f', 'hot pink'], ['#fe7155', 'coral'], ['#ef8907', 'tangerine'], ['#ffd21a', 'lemon'],
  ['#8be02a', 'lime'], ['#1fd18b', 'jade'], ['#0fc8c5', 'turquoise'], ['#5eccf6', 'sky'],
  ['#2f6bff', 'electric blue'], ['#8154ff', 'violet'], ['#cf4bfc', 'magenta'], ['#fd9bd9', 'bubblegum'],
];

export const FUR = swatches(RIOT);
export const CLOTH = swatches([...RIOT, ['#ffffff', 'white']]);

export const HATS = Object.freeze(['beanie', 'pixie', 'beret', 'bucket', 'earflap']);
export const CAPES = Object.freeze(['cape', 'capelet']);
export const BAGS = Object.freeze(['backpack', 'drawstring bag', 'crossbody pouch']);
// REUSE-SPEC.md §Costumes: up to cable's weight; seed, puff and linen stitch cost 6–18× the triangles
export const TEXTURES = Object.freeze(['stockinette', 'rib', 'garter', 'cable', 'single crochet', 'waffle', 'lace']);
// REUSE-SPEC.md §Costumes: one of these, in the `gloves` colour (on the Greathammer, only its glowing cracks)
export const HANDS = Object.freeze(['gloves', 'sword', 'scythe', 'hammer']);
// their 48×48 icons, for the chooser and the end card's new-item button
export const HAND_ICON = Object.freeze({
  gloves: '<path d="M14 24c0-10 5-15 13-15s12 6 12 14c0 6-3 10-7 12H20c-4-2-6-6-6-11Z"/><ellipse cx="13" cy="25" rx="5" ry="7"/><rect x="17" y="36" width="18" height="8" rx="3"/>',
  sword: '<g transform="rotate(35 24 24)"><path d="M20 30V9a4 4 0 0 1 8 0v21Z"/><rect x="11" y="29" width="26" height="6" rx="3"/><rect x="21" y="35" width="6" height="7" rx="2"/><circle cx="24" cy="44" r="3.5"/><path d="M20 14l8 4M20 21l8 4" stroke="#fff" stroke-width="2.5" opacity=".7"/></g>',
  scythe: '<g transform="rotate(35 24 24)"><rect x="22" y="12" width="4" height="27" rx="2"/><path d="M24 2l5 11h-10Z"/><path d="M24 37l2.4 4.6 5 .6-3.7 3.4 1 5-4.7-2.5-4.7 2.5 1-5-3.7-3.4 5-.6Z"/><path d="M24 11c10 0 17 10 16 23-4-8-9-14-16-16Z" fill="#2f6bff"/></g>',
  hammer: '<g transform="rotate(35 24 24)"><rect x="21.5" y="14" width="5" height="33" rx="1.5" fill="#26221f"/><path d="M21 30h6M21 35h6M21 40h6" stroke="#5a4636" stroke-width="2.5"/>'
    + '<rect x="9" y="1" width="30" height="16" rx="1" fill="#3a3a3e"/><path d="M9 6h30M14 1v16M33 1v16" stroke="#17171a" stroke-width="2"/><path d="M18 4l3 5-2 4M29 10l-4 3" stroke="currentColor" stroke-width="1.4" fill="none"/></g>',
  cane: '<g transform="rotate(35 24 24)"><path d="M21.5 46V10h5v36Z"/><rect x="20" y="30" width="8" height="8" rx="2"/><path d="M24 2a4 4 0 0 1 4 4v4h-3V7a1 1 0 0 0-2 0v2h-3V6a4 4 0 0 1 4-4Z"/></g>',
  yarn: '<path d="M24 6c-6 0-9 6-9 10M24 6c6 0 9 6 9 10" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="13" cy="28" r="9"/><circle cx="35" cy="32" r="9"/><path d="M7 25c4 2 8 2 12 0M7 31c4 2 8 2 12 0M29 29c4 2 8 2 12 0M29 35c4 2 8 2 12 0" stroke="#fff8" stroke-width="1.5" fill="none"/>',
  staff: '<g transform="rotate(35 24 24)"><rect x="21.5" y="1" width="5" height="46" rx="2.5" fill="#a8743f"/><rect x="20" y="20" width="8" height="14" rx="3"/><path d="M20 23h8M20 27h8M20 31h8" stroke="#fff8" stroke-width="1.5"/></g>',
  sai: '<g transform="rotate(35 24 24)"><path d="M22.5 31V8l1.5-6 1.5 6v23Z"/><path d="M24 31c-8 0-10-4-10-12M24 31c8 0 10-4 10-12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="21.5" y="31" width="5" height="12" rx="2" fill="#fff" stroke="currentColor" stroke-width="1.5"/></g>',
});
// what flies off the hitting glove or the blade's tip as it lands; tapping the picked one goes to the next. The scythe's is fixed.
const SWORD_TRICKS = Object.freeze(['sparkle', 'bubble', 'flame', 'bebop', 'shootingStar', 'bubblegumPop', 'smiteOfLight', 'speedLines', 'lightningStorm', 'atomicBall']);
// tmnt/REUSE-SPEC.md §Hero chooser: Master Splinter's cane and Raphael's sai, a hero's only (not in HANDS), with the sword's tricks
export const CANE = 'cane', SAI = 'sai', STAFF = 'staff', YARN_BALLS = 'yarn';
export const TRICKS = Object.freeze({
  gloves: Object.freeze(['plain', 'sparkle', 'bubble', 'flame', 'bebop', 'starPunch', 'fireball', 'loveTap', 'bubblegumPop', 'powerPuff', 'magicStar', 'heartBlast', 'smiteOfLight', 'speedLines', 'lightningStorm', 'atomicBall']), sword: SWORD_TRICKS, scythe: Object.freeze(['music']),
  // lightning first: a trick the hammer doesn't have falls back to it
  hammer: Object.freeze(['lightning', 'zap']),
  [CANE]: SWORD_TRICKS, [SAI]: SWORD_TRICKS, [STAFF]: Object.freeze(['music']), [YARN_BALLS]: Object.freeze(['plain']),
});
// REUSE-SPEC.md §Fighter chooser: the levels a player must have beaten for the chooser to offer each
const UNLOCK = Object.freeze({ sword: 1, scythe: 2, hammer: 4 });
/** The hands the chooser offers a player who has beaten `beaten` levels; a bad guy gets every one (REUSE-SPEC.md §Bad guys). */
export const handsFor = (beaten, badGuy = false) => HANDS.filter((h) => badGuy === true || (UNLOCK[h] ?? 0) <= beaten);
/** The hands that are new to a player who had beaten `before` levels and now has `after` (REUSE-SPEC.md §After the lobby). */
export const newHands = (before, after) => handsFor(after).filter((h) => !handsFor(before).includes(h));

// spinoff/REUSE-SPEC.md §Bad guys: grey fur, black and dark purple, reserved from the kids' swatches
export function isBadGuyCloth(hex) {
  const { l, c, h } = oklchOf(hex);
  return l < 0.32 || (l < 0.52 && c > 0.04 && h > 280 && h < 335);
}

export function isBadGuyFur(hex) {
  const { l, c } = oklchOf(hex);
  return c < 0.035 && l > 0.3 && l < 0.78;
}

const HEX = /^#[0-9a-f]{6}$/i;
const oklab = (hex) => {
  const { l, c, h } = oklchOf(hex), a = (h * Math.PI) / 180;
  return [l, c * Math.cos(a) || 0, c * Math.sin(a) || 0];
};
/** The swatch nearest `hex`, so a colour saved from an older palette keeps its look. */
export function nearestSwatch(list, hex) {
  const p = oklab(hex), far = (s) => oklab(s.hex).reduce((d, v, i) => d + (v - p[i]) ** 2, 0);
  return list.reduce((best, s) => (far(s) < far(best) ? s : best));
}

/**
 * @typedef {{ hat: string|null, hatColor: string, hatStitch: string, cape: string|null, capeColor: string, capeStitch: string,
 *             bag: string, bagColor: string, gloves: string, hands: string, trick: string }} Look
 * @typedef {{ species: string, params: Record<string, any>, look: Look, badGuy?: boolean }} Fighter
 */

/** @returns {Look} */
const defaultLook = () => ({
  hat: 'beanie', hatColor: '#8be02a', hatStitch: 'rib', cape: 'cape', capeColor: '#8154ff', capeStitch: 'stockinette',
  bag: 'backpack', bagColor: '#ffd21a', gloves: '#ff3b7f', hands: 'gloves', trick: 'plain',
});

/** @template {Pick<Fighter, "species" | "params">} F @param {F} f @param {string} fur @returns {F} */
export function setFur(f, fur) {
  const kit = getSpecies(f.species);
  f.params.bodyColor = fur;
  f.params[kit.coatColorKey] = kit.coatOf(fur);
  return f;
}

/** @returns {Fighter} */
export function newFighter(species) {
  const f = { species, params: structuredClone(getSpecies(species).defaults), look: defaultLook() };
  return setFur(f, getSpecies(species).firstFur);
}

const pickOf = (list, rng) => list[Math.floor(rng() * list.length)];

/** @returns {Fighter} */
export function randomFighter(rng = Math.random, species = pickOf(SPECIES, rng)) {
  const f = newFighter(species);
  getSpecies(species).randomise(f.params);
  const colour = () => pickOf(CLOTH, rng).hex, hands = pickOf(HANDS, rng);
  f.look = {
    hat: pickOf([...HATS, null], rng), hatColor: colour(), hatStitch: pickOf(TEXTURES, rng),
    cape: pickOf([...CAPES, null], rng), capeColor: colour(), capeStitch: pickOf(TEXTURES, rng),
    bag: pickOf(BAGS, rng), bagColor: colour(), gloves: colour(), hands, trick: pickOf(TRICKS[hands], rng),
  };
  setFur(f, pickOf(FUR, rng).hex);
  f.params.facePaint = pickOf(FACE_PAINTS, rng);
  return f;
}

const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);

function readParams(species, raw) {
  const { defaults } = getSpecies(species), out = structuredClone(defaults);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, d] of Object.entries(defaults)) {
    const v = raw[k];
    if (typeof d === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof d === 'boolean' && typeof v === 'boolean') out[k] = v;
    else if (typeof d === 'string' && HEX.test(d) && HEX.test(v)) out[k] = v;
  }
  out.name = oneOf(NAMES, raw.name, out.name);
  out.facePaint = oneOf(FACE_PAINTS, raw.facePaint, out.facePaint);
  return out;
}

function readLook(raw) {
  const base = defaultLook(), r = raw && typeof raw === 'object' ? raw : {};
  const colour = (k) => (HEX.test(r[k]) ? nearestSwatch(CLOTH, r[k]).hex : base[k]);
  const choice = (k, list, none) => (list.includes(r[k]) || (none && r[k] === null) ? r[k] : base[k]);
  const hands = choice('hands', HANDS, false), tricks = TRICKS[hands];
  return {
    hat: choice('hat', HATS, true), hatColor: colour('hatColor'), hatStitch: choice('hatStitch', TEXTURES, false),
    cape: choice('cape', CAPES, true), capeColor: colour('capeColor'), capeStitch: choice('capeStitch', TEXTURES, false),
    bag: choice('bag', BAGS, false), bagColor: colour('bagColor'), gloves: colour('gloves'), hands, trick: tricks.includes(r.trick) ? r.trick : tricks[0],
  };
}

/** Untrusted JSON from storage or another tablet → a Fighter, or null. @returns {Fighter|null} */
export function readFighter(raw) {
  if (!raw || typeof raw !== 'object' || !SPECIES.includes(raw.species)) return null;
  return { species: raw.species, params: readParams(raw.species, raw.params), look: readLook(raw.look), ...(raw.badGuy === true && { badGuy: true }) };
}

export function loadFighter() {
  try { return readFighter(JSON.parse(localStorage.getItem(FIGHTER_KEY) ?? 'null')); } catch { return null; }
}

/** One fighter per tablet, overwritten on every change (REUSE-SPEC.md §Fighter chooser). @param {Fighter} f */
export function saveFighter(f) {
  try { localStorage.setItem(FIGHTER_KEY, JSON.stringify(f)); } catch {}
  globalThis.navigator?.storage?.persist?.().catch(() => {});
}

// REUSE-SPEC.md §Costumes: stitches big enough to survive match size, where worsted turns smooth
export const YARN = 'super-bulky';

function wear(type, silhouette, color, stitch = 'stockinette') {
  const item = defaultItem(type);
  if (!silhouette) return { ...item, on: false };
  const craft = CRAFTS.find((c) => STITCHES_BY_CRAFT[c].includes(stitch));
  return {
    ...item, on: true, silhouette, color1: color, colorCount: 1, colourwork: 'solid', craft, stitch, weight: YARN, tool: usualTool(craft, YARN),
  };
}

// tmnt/REUSE-SPEC.md §Hero chooser: a hero's sweater in colourwork, its own colour first, then the rest of `palette`
const worked = (item, work, palette) => {
  if (!work || work === 'solid') return item;
  const colours = [item.color1, ...palette.filter((c) => c !== item.color1)];
  return { ...item, colourwork: work, colorCount: colours.length, ...Object.fromEntries(colours.map((c, i) => [`color${i + 1}`, c])) };
};

/** @param {Look & Record<string, string|null>} look @param {string[]} [palette] */
export const outfitOf = (look, palette = []) => ({
  hat: wear('hat', look.hat, look.hatColor, look.hatStitch),
  shawl: wear('shawl', look.cape, look.capeColor, look.capeStitch),
  bag: wear('bag', look.bag, look.bagColor),
  // tmnt/REUSE-SPEC.md §Hero chooser: a hero's scarf, sweater and socks; a fighter's look has none
  scarf: { ...wear('scarf', look.scarf, look.scarfColor, look.scarfStitch), ...(look.scarfForm && { form: look.scarfForm }) },
  sweater: worked(wear('sweater', look.sweater, look.sweaterColor, look.sweaterStitch), look.sweaterWork, palette),
  socks: wear('socks', look.socks, look.socksColor, look.socksStitch),
});

const GLOVE_SIZE = 2.1;
let gloveGeo = null;

function gloveGeometry() {
  if (gloveGeo) return gloveGeo;
  const ball = new THREE.SphereGeometry(1, 20, 14).scale(1, 0.95, 1.1);
  const thumb = new THREE.SphereGeometry(0.42, 12, 8).translate(0, 0.15, 0.85);
  const cuff = new THREE.CylinderGeometry(0.64, 0.7, 0.6, 18).translate(0, 0.95, 0);
  gloveGeo = mergeGeometries([ball, thumb, cuff], false);
  return gloveGeo;
}

const handGlove = (P) => P.limbThick * GLOVE_SIZE;

const onHands = (built) => built.holds.map((hold) => ({ parent: hold.parent, at: [0, 0, 0], r: handGlove(built.params) }));

// REUSE-SPEC.md §Costumes: a species whose hands are buried (the owl's, mid-wing) says where its gloves go instead
export const gloveAnchors = (built) => built.species.gloveAnchors?.(built, handGlove(built.params)) ?? onHands(built);

/** Boxing gloves on both hands, or both wing tips (REUSE-SPEC.md §Costumes). */
function addGloves(built, color) {
  removeTricks(built);
  removeSword(built);
  removeGloves(built);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0 });
  built.gloves = gloveAnchors(built).map(({ parent, at, r }) => {
    const glove = new THREE.Mesh(gloveGeometry(), material);
    glove.scale.setScalar(r);
    glove.userData.r = r;
    glove.position.set(...at);
    glove.castShadow = true;
    parent.add(glove);
    return glove;
  });
  return built.gloves;
}

function removeGloves(built) {
  for (const glove of built.gloves ?? []) glove.removeFromParent();
  built.gloves?.[0]?.material.dispose();
  built.gloves = [];
}

// REUSE-SPEC.md §Costumes: a toy sword, chunky with a rounded tip; along +z, gripped at the origin, flat side to the camera
const SWORD = { grip: 0.08, guard: 0.2, blade: 0.3, wide: 0.11, thick: 0.036, trail: 2.2 };
const WHITE = '#ffffff';
let swordGeo = null;

function swordGeometry() {
  if (swordGeo) return swordGeo;
  const { grip, guard, blade, wide, thick } = SWORD, at = grip / 2 + 0.012;
  const handle = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.02, grip, 12).rotateX(Math.PI / 2),
    new THREE.CapsuleGeometry(wide / 2, blade, 6, 14).rotateX(Math.PI / 2).scale(thick / wide, 1, 1).translate(0, 0, at + blade / 2 + wide / 2),
  ]);
  const trim = mergeGeometries([
    new THREE.CapsuleGeometry(0.034, guard, 4, 12).translate(0, 0, at),
    new THREE.SphereGeometry(0.034, 14, 10).translate(0, 0, -grip / 2 - 0.018),
  ]);
  swordGeo = { handle, trim, ...swooshGeometry(at + 0.04, at + blade + wide / 2, wide, at + blade * 0.5) };
  return swordGeo;
}

/** A slash's fan from `from` to `to` along the blade, and a stab's speed lines `wide` apart reaching to `reach`. */
function swooshGeometry(from, to, wide, reach) {
  // upright behind the blade, from it back up the way a chop came down
  const fan = new THREE.RingGeometry(from, to, 12, 1, 0, SWORD.trail).rotateY(-Math.PI / 2);
  const line = (y, z0, z1, w) => new THREE.PlaneGeometry(z1 - z0, w).rotateY(-Math.PI / 2).translate(0, y, (z0 + z1) / 2);
  const streak = mergeGeometries([line(wide * 0.8, -0.3, reach, 0.016), line(-wide * 0.8, -0.24, reach - 0.06, 0.016), line(0, -0.36, -0.08, 0.02)]);
  return { fan, streak };
}

const flat = (shape, depth) => mergeVertices(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 }))
  .translate(0, 0, -depth / 2);
// a shape drawn in (z, y), flat side to the camera like the sword's blade
const sideOn = (shape, depth) => flat(shape, depth).rotateY(-Math.PI / 2);

function starShape(r, inner = 0.45, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points, k = i % 2 ? r * inner : r;
    if (i) s.lineTo(Math.sin(a) * k, Math.cos(a) * k);
    else s.moveTo(0, k);
  }
  return s;
}

function heartShape(r) {
  return new THREE.Shape().moveTo(0, -r).bezierCurveTo(-1.5 * r, -0.1 * r, -0.8 * r, 1.1 * r, 0, 0.45 * r)
    .bezierCurveTo(0.8 * r, 1.1 * r, 1.5 * r, -0.1 * r, 0, -r);
}

// REUSE-SPEC.md §Costumes: the Music Scythe, about half a fighter tall; along +z, both hands at the origin, the crescent hooking down
const SCYTHE = { butt: -0.19, top: 0.17, point: 0.09, r: 0.024 };
let scytheGeo = null;

function scytheGeometry() {
  if (scytheGeo) return scytheGeo;
  const { butt, top, point, r } = SCYTHE;
  const pole = mergeGeometries([
    new THREE.CylinderGeometry(r, r, top - butt, 12).rotateX(Math.PI / 2).translate(0, 0, (top + butt) / 2),
    new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.014, 12).rotateX(Math.PI / 2).translate(0, 0, -0.03),
    new THREE.ConeGeometry(r * 1.9, point, 12).rotateX(Math.PI / 2).translate(0, 0, top + point / 2),
    new THREE.SphereGeometry(r * 0.45, 8, 6).translate(0, 0, top + point - r * 0.2),
    sideOn(starShape(0.05), 0.03).translate(0, 0, butt - 0.03),
  ]);
  const crescent = sideOn(new THREE.Shape().moveTo(top, -0.01).bezierCurveTo(top, -0.15, 0.06, -0.22, -0.08, -0.2)
    .bezierCurveTo(0.02, -0.16, 0.09, -0.1, 0.1, -0.01).lineTo(top, -0.01), 0.03);
  // the handle's star, through the pole so it shows on both sides, under the hands
  const star = sideOn(starShape(r * 1.5), r * 2.4);
  const heart = sideOn(heartShape(r * 0.5), r * 2.6);
  scytheGeo = { pole, crescent, star, heart, ...swooshGeometry(0.06, top + point, 0.11, top) };
  return scytheGeo;
}

const candy = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0 });

/** `parts` in the right hand (joint side -1), or the owl's right wing tip, with the slash's fan and the stab's streak; no gloves. */
function holdBlade(built, parts, geo, userData) {
  removeTricks(built);
  removeGloves(built);
  removeSword(built);
  const { parent, at } = gloveAnchors(built)[0], blade = new THREE.Group();
  blade.add(...parts);
  for (const m of blade.children) m.castShadow = true;
  const swoosh = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(geo.fan, swoosh), streak = new THREE.Mesh(geo.streak, swoosh);
  blade.add(fan, streak);
  blade.position.set(...at);
  blade.userData = { side: -1, both: false, fan, streak, ...userData };
  parent.add(blade);
  built.sword = blade;
  swingSword(built, null);
  return blade;
}

/** A toy sword (REUSE-SPEC.md §Costumes). */
function addSword(built, color) {
  const geo = swordGeometry();
  return holdBlade(built, [new THREE.Mesh(geo.handle, candy(color)), new THREE.Mesh(geo.trim, candy(color === WHITE ? '#ff3b7f' : WHITE))], geo,
    { tip: SWORD.grip / 2 + 0.012 + SWORD.blade + SWORD.wide / 2 });
}

const CRESCENT = '#2f6bff';
/** The Music Scythe, held in both hands: a pole in `color`, a glowing blue crescent (REUSE-SPEC.md §Costumes). */
function addScythe(built, color) {
  const geo = scytheGeometry();
  const glow = new THREE.MeshStandardMaterial({ color: CRESCENT, emissive: CRESCENT, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0 });
  return holdBlade(built, [new THREE.Mesh(geo.pole, candy(color)), new THREE.Mesh(geo.crescent, glow),
    new THREE.Mesh(geo.star, candy('#ffd21a')), new THREE.Mesh(geo.heart, candy('#8154ff'))], geo,
  { tip: SCYTHE.top + SCYTHE.point, butt: SCYTHE.butt - 0.08, both: true, lower: -0.1 });
}

// REUSE-SPEC.md §Costumes: the Greathammer, Dark Souls in a cartoon: a long dark haft with leather wraps, a massive iron block, ember cracks
// ridiculous on purpose (user: not a carpentry hammer): longer than its wielder is tall, the head wider than their body,
// and as long as it hits when thrown (HAMMER.r, REUSE-SPEC.md §Things are as big as they look)
const GREATHAMMER = { butt: -0.16, top: 0.95, r: 0.034, head: [0.4, 2 * HAMMER.r, 0.44], wraps: [-0.08, 0.02, 0.12, 0.22, 0.32] };
const NOISE = 256;
/** The knotwork's diagonal spacing in texels, a strand's half-width and the dark gap round it (REUSE-SPEC.md §Costumes). */
const KNOT = { cell: 32, strand: 5, gap: 2 };
let hammerGeo = null;
// smooth and mipmapped: a DataTexture's default nearest sampling would shimmer the knotwork on a small, moving hammer
const texture = (data) => Object.assign(new THREE.DataTexture(data, NOISE, NOISE), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, needsUpdate: true });

/**
 * Celtic plaitwork at texel (x, y): two families of diagonal strands, over and under in turn at every crossing.
 * 1 on a strand, 0 in the dark gap round one, null on the bare iron between. Tiles seamlessly across NOISE.
 */
export function knotAt(x, y) {
  const { cell, strand, gap } = KNOT, off = (n) => { const m = ((n % cell) + cell) % cell; return Math.min(m, cell - m) / Math.SQRT2; };
  const a = off(x + y), b = off(x - y), aOver = (Math.floor((x + y + cell / 2) / cell) + Math.floor((x - y + cell / 2) / cell)) % 2 === 0;
  for (const d of aOver ? [a, b] : [b, a]) {
    if (d < strand) return 1;
    if (d < strand + gap) return 0;
  }
  return null;
}

/** One wandering crack, two texels wide, black in the iron and white in the glow map. */
function crack(iron, glow, rnd, S) {
  let x = rnd() * NOISE, y = rnd() * NOISE, a = rnd() * Math.PI * 2;
  for (let n = 0; n < 40 * S; n++, a += (rnd() - 0.5) * 1.2 / S, x = (x + Math.cos(a) + NOISE) % NOISE, y = (y + Math.sin(a) + NOISE) % NOISE) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (((Math.floor(y) + dy) % NOISE) * NOISE + ((Math.floor(x) + dx) % NOISE)) * 4;
      iron.set([10, 8, 8], i);
      glow.fill(170 + 85 * rnd(), i, i + 3);
    }
  }
}

/** Grey-and-black iron noise engraved with knotwork, and a glow map black but for its white cracks, tinted by the glow colour; seeded. */
function ironMaps() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), S = NOISE / 64;
  const iron = new Uint8Array(NOISE * NOISE * 4), glow = new Uint8Array(NOISE * NOISE * 4);
  const coarse = Array.from({ length: 9 * 9 }, rnd);
  for (let y = 0; y < NOISE; y++) for (let x = 0; x < NOISE; x++) {
    const k = knotAt(x, y), i = (y * NOISE + x) * 4;
    const v = (k === 0 ? 8 : 28 + 40 * coarse[Math.floor(y / 8 / S) * 9 + Math.floor(x / 8 / S)] + (k ? 40 : 0)) + 34 * rnd();
    iron.set([v, v, v + 4, 255], i);
    glow.set([0, 0, 0, 255], i);
  }
  for (let c = 0; c < 5; c++) crack(iron, glow, rnd, S);
  return { map: Object.assign(texture(iron), { colorSpace: THREE.SRGBColorSpace }), glow: texture(glow) };
}

const spike = (r0, h, [x, y, z], turn) => new THREE.ConeGeometry(r0, h, 4)
  .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...turn)).setPosition(x, y, z));

/** A forged eight-sided head, flared striking faces, a waist each side of a raised collar, spiked all over; iron straps and a spiked pommel. */
function greathammerIron() {
  const { butt, top, r, head: [hx, hy, hz] } = GREATHAMMER, at = top - hz / 2, L = hy / 2, R = (hx + hz) / 4;
  const face = (sign) => [[0.8, 1], [0.94, 0.92], [1, 0.81], [0.82, 0.56]].map(([k, y]) => [k * R, sign * y * L]);
  const profile = [...face(-1), [0.84 * R, -0.19 * L], [1.08 * R, -0.14 * L], [1.08 * R, 0.14 * L], [0.84 * R, 0.19 * L], ...face(1).reverse()];
  return mergeGeometries([
    new THREE.LatheGeometry([[0, -L], ...profile, [0, L]].map(([x, y]) => new THREE.Vector2(x, y)), 8, Math.PI / 8).translate(0, 0, at),
    spike(R * 0.3, 0.34, [0, 0, at + R + 0.15], [Math.PI / 2, 0, 0]),
    ...[-1, 1].map((side) => spike(R * 0.34, 0.2, [0, side * (L + 0.09), at], [0, 0, side < 0 ? Math.PI : 0])),
    ...[-1, 1].map((side) => spike(R * 0.22, 0.18, [side * (1.08 * R + 0.08), 0, at], [0, 0, -side * Math.PI / 2])),
    spike(r * 1.6, 0.12, [0, 0, butt - 0.1], [-Math.PI / 2, 0, 0]),
    ...[-1, 1].map((side) => new THREE.BoxGeometry(0.01, r * 2.2, 0.26).translate(side * r * 1.08, 0, at - R - 0.12)),
    new THREE.LatheGeometry([[0, 0], [r * 1.9, 0.004], [r * 2.1, 0.02], [r * 1.4, 0.045], [r, 0.05]].map(([x, y]) => new THREE.Vector2(x, y)), 8)
      .rotateX(Math.PI / 2).translate(0, 0, butt - 0.045),
  ].map((g) => g.toNonIndexed()));
}

function greathammerGeometry() {
  if (hammerGeo) return hammerGeo;
  const { butt, top, r, head: [, hy, hz], wraps } = GREATHAMMER;
  const haft = new THREE.CylinderGeometry(r, r * 1.15, top - butt, 8).rotateX(Math.PI / 2).translate(0, 0, (top + butt) / 2);
  const leather = mergeGeometries(wraps.map((z) => new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, z)));
  hammerGeo = { haft, leather, head: greathammerIron(), ...ironMaps(), ...swooshGeometry(0.06, top, hy, top - hz) };
  return hammerGeo;
}

/** The Greathammer's haft, wraps and head, grey and black with cracks glowing `color` (REUSE-SPEC.md §Costumes); also its thrown copy (play.js). */
export function greathammerMeshes(color) {
  const geo = greathammerGeometry();
  const dark = (c, roughness) => new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0, bumpMap: geo.map, bumpScale: 1.5, flatShading: true });
  // flat-shaded, mostly metal, roughness from the noise: hard facets catching the room's light, nothing like the candy around it
  const iron = new THREE.MeshStandardMaterial({ color: '#77777d', map: geo.map, bumpMap: geo.map, bumpScale: 4, roughnessMap: geo.map,
    emissive: color, emissiveMap: geo.glow, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0.85, flatShading: true, envMapIntensity: 1.3 });
  return [new THREE.Mesh(geo.haft, dark('#221e1b', 0.9)), new THREE.Mesh(geo.leather, dark('#4a3626', 0.75)), new THREE.Mesh(geo.head, iron)];
}

// tmnt/REUSE-SPEC.md §Hero chooser: a giant crochet hook for a cane, held like the sword and swung as it, hanging hook-down
// at rest: a shaft narrowing to the throat, a round head with the hook's lip curled back over it (in y, so the side-on
// camera sees it), a flat thumb rest
const CANE_PARTS = { shaft: 0.3, r: 0.02, clear: 0.03 };
// the cane at rest, as the character sees it: straight down, a touch forward, whatever the arm is doing
const HANG = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0.12).normalize());
const HANG_UP = -Math.PI / 2 + 0.12;
let caneGeo = null;
function caneGeometry() {
  const { shaft, r } = CANE_PARTS, end = shaft - 0.04, head = end + r * 0.6;
  caneGeo ??= {
    stick: mergeGeometries([
      new THREE.CylinderGeometry(r * 0.7, r * 1.1, shaft, 12).rotateX(Math.PI / 2).translate(0, 0, shaft / 2 - 0.04),
      new THREE.SphereGeometry(r * 1.1, 12, 8).translate(0, 0, -0.04),
      new THREE.CylinderGeometry(r * 1.7, r * 1.7, 0.06, 16).rotateX(Math.PI / 2).scale(0.55, 1, 1).translate(0, 0, 0.1),
      new THREE.SphereGeometry(r * 0.95, 12, 10).scale(1, 1, 1.2).translate(0, 0, head),
      new THREE.TorusGeometry(r * 0.75, r * 0.38, 8, 14, Math.PI * 1.15).rotateY(Math.PI / 2).translate(0, r * 0.55, head - r * 0.15),
    ]),
    ...swooshGeometry(0.06, head + r, 0.11, shaft),
  };
  return caneGeo;
}

const _hang = new THREE.Quaternion(), _held = new THREE.Quaternion(), _tip = new THREE.Vector3(), _grip = new THREE.Vector3();
const _plane = new THREE.Quaternion(), _x = new THREE.Euler(), _none = new THREE.Quaternion();
/**
 * Takes `1 - w` of the arm's sideways tilt off a hanging blade (w: how far into a swing): the turn from hanging down in the
 * arm's plane to straight down, put on the whole swing, so it stays small and never flips.
 */
function hang(built, blade, arm, w) {
  if (!blade.userData.hangs || w >= 1) return;
  blade.parent.updateWorldMatrix(true, false);
  _hang.copy(blade.parent.getWorldQuaternion(_held).invert()).multiply(built.root.getWorldQuaternion(_held)).multiply(HANG);
  _hang.multiply(_plane.setFromEuler(_x.set(-(HANG_UP + arm), 0, 0)).invert());
  blade.quaternion.premultiply(_none.identity().slerp(_hang, 1 - w));
}

/** One cane for every body: a hand nearer the floor than the cane is long grips it further down the shaft, so the knob
 * just reaches the floor and the rest stands up past the hand (the designer, 2026-11-09: not a cane sized per animal). */
function gripToFloor(built, cane) {
  built.root.updateMatrixWorld(true);
  const grip = cane.getWorldPosition(_grip).y, tip = cane.localToWorld(_tip.set(0, 0, cane.userData.tip)).y;
  const down = Math.max(0, CANE_PARTS.clear - tip) / Math.max(1e-6, grip - tip) * cane.userData.tip;
  for (const part of cane.children) part.position.z -= down;
  cane.userData.tip -= down;
}

function addCane(built, color) {
  const geo = caneGeometry(), { shaft, r } = CANE_PARTS;
  const cane = holdBlade(built, [new THREE.Mesh(geo.stick, candy(color))], geo, { tip: shaft - 0.04 + r * 1.8, hangs: true });
  gripToFloor(built, cane);
  return cane;
}

// tmnt/REUSE-SPEC.md §Hero chooser: Raphael's sai, held and swung as the sword: a long point, two prongs curving
// forward from the guard (in y, so the side-on camera sees them), a white grip
const SAI_PARTS = { grip: 0.08, point: 0.3, r: 0.011, prong: 0.055, reach: 0.07 };
let saiGeo = null;
function saiGeometry() {
  const { grip, point, r, prong, reach } = SAI_PARTS;
  const curve = (side) => new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0.004), new THREE.Vector3(0, side * prong, 0.004),
    new THREE.Vector3(0, side * prong, reach));
  saiGeo ??= {
    metal: mergeGeometries([
      new THREE.CylinderGeometry(r * 0.25, r, point, 10).rotateX(Math.PI / 2).translate(0, 0, point / 2),
      ...[-1, 1].map((side) => new THREE.TubeGeometry(curve(side), 12, r * 0.8, 8)),
      ...[-1, 1].map((side) => new THREE.SphereGeometry(r * 0.9, 8, 6).translate(0, side * prong, reach)),
    ]),
    grip: mergeGeometries([
      new THREE.CylinderGeometry(r * 1.5, r * 1.5, grip, 10).rotateX(Math.PI / 2).translate(0, 0, -grip / 2),
      new THREE.SphereGeometry(r * 2, 10, 8).translate(0, 0, -grip),
    ]),
    ...swooshGeometry(0.06, point, 0.11, point * 0.8),
  };
  return saiGeo;
}

function addSai(built, color) {
  const geo = saiGeometry();
  return holdBlade(built, [new THREE.Mesh(geo.metal, candy(color)), new THREE.Mesh(geo.grip, candy(color === WHITE ? '#ff3b7f' : WHITE))], geo,
    { tip: SAI_PARTS.point });
}

// tmnt/REUSE-SPEC.md §Hero chooser: Donatello's bo staff, held and swung as the Music Scythe with no blade, longer for
// reach: a wooden pole, its grip wrapped in knitting in the picked colour
const STAFF_PARTS = { butt: -0.34, top: 0.3, r: 0.022, wrap: [-0.19, 0.08], wood: '#a8743f' };
let staffGeo = null;
function staffGeometry() {
  const { butt, top, r } = STAFF_PARTS;
  staffGeo ??= {
    pole: mergeGeometries([
      new THREE.CylinderGeometry(r, r, top - butt, 12).rotateX(Math.PI / 2).translate(0, 0, (top + butt) / 2),
      ...[butt, top].map((z) => new THREE.SphereGeometry(r, 12, 8).translate(0, 0, z)),
    ]),
    ...swooshGeometry(0.06, top, 0.11, top * 0.8),
  };
  return staffGeo;
}

function addStaff(built, color) {
  const geo = staffGeometry(), { butt, top, r, wrap: [w0, w1], wood } = STAFF_PARTS;
  const staff = holdBlade(built, [new THREE.Mesh(geo.pole, new THREE.MeshStandardMaterial({ color: wood, roughness: 0.8, metalness: 0 }))], geo, { tip: top, butt: butt - 0.04, both: true, lower: -0.1 });
  // the scarves' stockinette, a size finer than theirs (about 10 stitches round), so it reads as knitting on a thin pole
  const wrap = knitWrap({ ...wear('scarf', 'long', color), weight: 'bulky' }, w1 - w0, r * 1.25);
  wrap.position.z = (w0 + w1) / 2;
  wrap.traverse((o) => { o.userData.ownGeometry = true; });
  staff.add(wrap);
  return staff;
}

// tmnt/REUSE-SPEC.md §Hero chooser: Michelangelo's nunchucks, two balls of yarn on one strand held by its middle. Each
// ball swings on its strand as a pendulum hung from the hand (in the character's own space), so a punch flings them out
// and they swing back on their own; the strands a little different, so the balls part
const YARN_PARTS = { r: 0.042, strands: [0.17, 0.2], thread: 0.005, damp: 1.4, g: 9.8, apart: 0.03 };
let yarnGeo = null;
function yarnGeometry() {
  if (yarnGeo) return yarnGeo;
  const ball = buildFamily('ball', 'chunky');
  ball.computeBoundingSphere();
  const { center, radius } = ball.boundingSphere, k = YARN_PARTS.r / radius;
  ball.translate(-center.x, -center.y, -center.z).scale(k, k, k);
  yarnGeo = { ball, thread: new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0), ...swooshGeometry(0.06, 0.2, 0.11, 0.16) };
  return yarnGeo;
}

function addYarn(built, color) {
  const geo = yarnGeometry(), mat = knitMaterial(color);
  const balls = YARN_PARTS.strands.map((len, i) => ({
    len, side: i ? 1 : -1, ball: new THREE.Mesh(geo.ball, mat), thread: new THREE.Mesh(geo.thread, mat), p: null, v: new THREE.Vector3(),
  }));
  return holdBlade(built, balls.flatMap((b) => [b.ball, b.thread]), geo, { tip: 0, balls });
}

const _hand = new THREE.Vector3(), _ball = new THREE.Vector3(), _dir = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
function swingBall(b, hand, dt) {
  const { r, damp, g } = YARN_PARTS, was = _ball.copy(b.p);
  b.v.y -= g * dt;
  b.p.addScaledVector(b.v.multiplyScalar(Math.exp(-damp * dt)), dt);
  b.p.sub(hand).setLength(b.len).add(hand);
  b.p.y = Math.max(b.p.y, r);
  b.v.subVectors(b.p, was).divideScalar(dt);
  b.ball.rotation.x += (b.v.length() * dt) / r;
}

/** Puts a ball (in the character's space) on its strand from the hand, in the held group's space. */
function placeBall(built, b) {
  const local = built.sword.worldToLocal(built.root.localToWorld(_ball.copy(b.p)));
  b.ball.position.copy(local);
  b.thread.quaternion.setFromUnitVectors(Y, _dir.copy(local).normalize());
  b.thread.scale.set(YARN_PARTS.thread, Math.max(0, local.length() - YARN_PARTS.r), YARN_PARTS.thread);
}

/** Michelangelo's yarn balls, `dt` on: a pendulum each, kept a ball apart; with dt 0, hung straight down. */
function stepYarn(built, dt) {
  const balls = built.sword?.userData.balls;
  if (!balls) return;
  built.root.updateMatrixWorld(true);
  built.root.worldToLocal(built.sword.getWorldPosition(_hand));
  for (const b of balls) {
    b.p ??= new THREE.Vector3(b.side * YARN_PARTS.apart, -b.len, 0).add(_hand);
    if (dt > 0) swingBall(b, _hand, Math.min(dt, 1 / 30));
  }
  const [a, b] = balls, gap = _dir.subVectors(b.p, a.p), short = 2 * YARN_PARTS.r - gap.length();
  if (short > 0) { gap.setLength(short / 2); a.p.sub(gap); b.p.add(gap); }
  for (const ball of balls) placeBall(built, ball);
}

/** The Greathammer, held like the sword (REUSE-SPEC.md §Costumes): `built.sword`, so it swings on SWORD_MOVES. */
function addHammer(built, color) {
  return holdBlade(built, greathammerMeshes(color), greathammerGeometry(), { tip: GREATHAMMER.top - GREATHAMMER.head[2] / 2 });
}

const _s = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Line3();
const _aim = new THREE.Quaternion(), _arm = new THREE.Quaternion(), _above = new THREE.Quaternion();
/**
 * The scythe's left hand turns its arm `w` of the way to the pole, below the right hand. The arms are too short to meet
 * round a body, so it reaches on its own side for the spot the side-on camera sees on the pole.
 */
function reachPole(built, w) {
  const blade = built.sword;
  if (!blade?.userData.both || w <= 0) return;
  const { parent, at } = gloveAnchors(built)[1], arm = built.joints.upperArm[1].node, { root } = built, { lower, butt } = blade.userData;
  root.updateMatrixWorld(true);
  const s = root.worldToLocal(arm.getWorldPosition(_s)), long = root.worldToLocal(parent.localToWorld(_h.set(...at))).distanceTo(s);
  _pole.start.copy(root.worldToLocal(blade.localToWorld(_t.set(0, 0, lower)))).setX(s.x);
  _pole.end.copy(root.worldToLocal(blade.localToWorld(_t.set(0, 0, butt)))).setX(s.x);
  const near = _pole.closestPointToPoint(s, true, _t), d = near.distanceTo(s);
  near.x += Math.sign(s.x) * Math.sqrt(Math.max(0, long * long - d * d));
  root.localToWorld(near);
  root.localToWorld(s);
  _aim.identity().slerp(_arm.setFromUnitVectors(parent.localToWorld(_h.set(...at)).sub(s).normalize(), near.sub(s).normalize()), w);
  arm.quaternion.copy(arm.parent.getWorldQuaternion(_above).invert().multiply(_aim).multiply(arm.getWorldQuaternion(_arm)));
}

/** Drops the sword or the scythe (`built.sword` is whichever blade is held). */
function removeSword(built) {
  built.sword?.removeFromParent();
  for (const o of built.sword?.children ?? []) if (o instanceof THREE.Mesh) o.material.dispose();
  // the staff's knitted wrap is its own geometry (the blades' are shared); its material is the garments' shared one
  built.sword?.traverse((o) => { if (o.userData.ownGeometry && o instanceof THREE.Mesh) o.geometry.dispose(); });
  built.sword = null;
}

/** Holds the sword or scythe at SWORD_MOVES' world angle above forward, whatever the arm is doing: a fan behind a slash, a streak behind a stab; `dt` on, Michelangelo's yarn balls swing. */
function swingSword(built, punch, dt = 0) {
  const { sword } = built;
  if (!sword) return;
  let arm = 0;
  for (let n = sword.parent; n && n !== built.chest; n = n.parent) arm += n.rotation.x;
  const { up, swoosh, stab } = punch ? sample(SWORD_MOVES[punch.name], punch.step) : { up: SWORD_UP, swoosh: 0, stab: 0 };
  // the cane rises out of hanging down and back, through the sword's moves: the lift in the arm's plane, so it always
  // comes up in front, and `hang` takes off the arm's sideways tilt while it hangs
  const w = punch ? punchWeight(punch.step) : 0;
  sword.rotation.set(-((sword.userData.hangs ? THREE.MathUtils.lerp(HANG_UP, up, w) : up) + arm), 0, 0);
  hang(built, sword, arm, w);
  stepYarn(built, dt);
  const { fan, streak } = sword.userData;
  fan.visible = swoosh > 0.02 && stab < 0.5;
  streak.visible = swoosh > 0.02 && stab >= 0.5;
  fan.material.opacity = swoosh;
}

const BUBBLES = [[0, 0, 0, 0.05], [0.07, 0.06, 0.02, 0.035], [-0.05, 0.09, -0.02, 0.03], [0.02, 0.15, 0.01, 0.025], [-0.08, 0.01, 0.03, 0.04]];
// The flame (playtest: of three tried, this beat a spray of little flames, and the old stacked blob looked cheap): one
// cartoon flame, orange round a yellow heart, with star embers round it thrown wider as it spreads; x, y, z, size
const FLAMES = ['#ff5a1f', '#ffd21a'];
const EMBERS = [[0.13, 0.08, 0, 0.03], [-0.12, 0.12, 0.02, 0.025], [0.05, -0.1, -0.02, 0.022], [-0.1, -0.07, 0.03, 0.028]];
const BLAZE = [[0, -0.5], [0.55, -0.5, 0.7, 0.1, 0.35, 0.6], [0.45, 0.35, 0.25, 0.3, 0.2, 0.45], [0.25, 0.9, 0.05, 1.1, 0, 1.5],
  [-0.15, 1.05, -0.4, 0.95, -0.3, 0.6], [-0.45, 0.75, -0.55, 0.5, -0.5, 0.3], [-0.7, 0, -0.45, -0.5, 0, -0.5]];
// REUSE-SPEC.md §Costumes: the Greathammer's crackle, zigzag bolts round its head, a white core on each; x, y, size, tilt
const BOLTS = [[0, 0, 0.11, 0], [0.09, 0.06, 0.07, 1.1], [-0.08, 0.07, 0.06, -1]];
const BOLT = [[-0.15, 1], [0.3, 1], [0.05, 0.2], [0.38, 0.2], [-0.25, -1], [0, -0.1], [-0.32, -0.1]];
let trickParts = null;
// REUSE-SPEC.md §Costumes: the scythe's stars, hearts and notes round the yarn store's sparkle, in riot colours
/** @type {[string, string, [number, number, number], number][]} */
const MUSIC = [
  ['star', '#ffd21a', [0.13, 0.05, 0], 0.05], ['heart', '#ff3b7f', [-0.12, 0.08, 0.02], 0.045], ['note', '#5eccf6', [0.06, 0.17, -0.02], 0.08],
  ['star', '#ff7a1a', [-0.06, -0.1, 0.03], 0.04], ['heart', '#fd9bd9', [0.1, -0.09, -0.03], 0.035], ['note', '#8be02a', [-0.17, -0.02, 0], 0.07],
];

function trickPartsOnce() {
  if (trickParts) return trickParts;
  trickParts = {
    ball: new THREE.SphereGeometry(1, 14, 10),
    bubble: new THREE.MeshStandardMaterial({ color: '#c8f2ff', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
    flats: FLAMES.map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })),
    bolt: new THREE.ShapeGeometry(new THREE.Shape(BOLT.map(([x, y]) => new THREE.Vector2(x, y)))),
    zap: ['#7fd4ff', '#ffffff'].map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })),
    music: {
      star: new THREE.ShapeGeometry(starShape(1)), heart: new THREE.ShapeGeometry(heartShape(1)),
      note: mergeGeometries([new THREE.CircleGeometry(0.5, 14).scale(1.2, 0.85, 1).rotateZ(0.35), new THREE.PlaneGeometry(0.16, 1.6).translate(0.5, 0.8, 0),
        new THREE.PlaneGeometry(0.5, 0.16).rotateZ(-0.6).translate(0.72, 1.45, 0)]),
    },
    paints: MUSIC.map(([, color]) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })),
  };
  return trickParts;
}

const bit = (geo, mat, [x, y, z], r) => {
  const m = geo.isObject3D ? geo : new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.userData.base = m.position.clone();
  m.scale.setScalar(r);
  return m;
};

/** The Greathammer's crackle: each bolt and its white core, tilted. */
function addBolts(g, p) {
  for (const [x, y, r, tilt] of BOLTS) {
    g.add(bit(p.bolt, p.zap[0], [x, y, 0], r), bit(p.bolt, p.zap[1], [x, y, 0.002], r * 0.55));
    for (const m of g.children.slice(-2)) m.rotation.z = tilt;
  }
}

const flick = (m, phase) => { Object.assign(m.userData, { flick: phase, r: m.scale.x }); return m; };

/** The flame in two crossed planes, so it shows from the side and from the front, flickering; star embers round it, half
 * turned the other way for the same reason. */
const blazeShape = () => BLAZE.slice(1).reduce((sh, c) => sh.bezierCurveTo(...c), new THREE.Shape().moveTo(...BLAZE[0]));
const blazeOf = (p) => (p.blaze ??= new THREE.ShapeGeometry(blazeShape(), 12));

function addFlame(g, p) {
  blazeOf(p);
  for (const turn of [0, Math.PI / 2]) {
    const outer = flick(bit(p.blaze, p.flats[0], [0, -0.05, 0], 0.11), turn * 3), inner = flick(bit(p.blaze, p.flats[1], [0, -0.07, 0], 0.06), turn * 3 + 1);
    for (const m of [outer, inner]) m.rotation.y = turn;
    g.add(outer, inner);
  }
  EMBERS.forEach(([x, y, z, r], i) => { g.add(bit(p.music.star, p.paints[i % 2 ? 3 : 0], [x, y, z], r)).children.at(-1).rotation.y = (i % 2) * Math.PI / 2; });
}

const sparkleOf = (built) => Object.assign(makeSparkle(built).mesh, { visible: true });
const scatter = (g, geo, mat, list) => { for (const [x, y, z, r] of list) g.add(bit(geo, mat, [x, y, z], r)); };

/**
 * Every trick, by name (TRICKS lists which hands get which). `parts(g, p, built)` builds its look into `g`, about a glove
 * across round its origin, from the shared parts `p` (trickPartsOnce); a bit made with `bit` spreads, and one marked with
 * `flick` flickers. The rest override EFFECT, how it moves once shown; a new effect is one entry here, or a recipe from dev
 * mode's randomizer pasted into fromRecipe.
 * @typedef {{ life: number, size: number, turn: number, drift: number, spreadAlong: number, spreadAcross: number, stream: number, arc: number, amplitude: number,
 *   frequency: number, ease: number, twist: number, grow: number, hue: number, rise: number, flicker: number }} Motion
 * @type {Record<string, { parts: (g: THREE.Group, p: any, built: any) => void } & Partial<Motion>>}
 */
export const EFFECTS = Object.freeze({
  // found with dev mode's randomizer (2026-11-01): notes and bubbles, orange, yellow and green, spinning and spreading wide
  bebop: fromRecipe({ life: 1.698, turn: 8.331, drift: 0.405, spreadAlong: 4.473, spreadAcross: 4.473, flicker: 0.241, bits: [
    { shape: 'note', colour: '#ff7a1a', at: [0.004, 0, 0.305], r: 0.098, turn: 0, beat: 0.287 },
    { shape: 'note', colour: '#ff7a1a', at: [-0.255, 0.285, 0.248], r: 0.104, turn: 1.571, beat: 0.82 },
    { shape: 'bubble', colour: '#8be02a', at: [-0.285, 0.246, -0.055], r: 0.1, turn: 0, beat: 0.799 },
    { shape: 'note', colour: '#ffd21a', at: [-0.136, 0.161, 0.134], r: 0.057, turn: 1.571, beat: 2.409 },
    { shape: 'bubble', colour: '#ffd21a', at: [0.175, -0.265, 0.281], r: 0.053, turn: 0, beat: 3.199 },
    { shape: 'note', colour: '#ffd21a', at: [-0.324, -0.002, -0.033], r: 0.061, turn: 1.571, beat: 4.802 },
    { shape: 'note', colour: '#ffd21a', at: [0.016, 0.257, -0.283], r: 0.081, turn: 0, beat: 3.143 },
    { shape: 'note', colour: '#ff7a1a', at: [-0.267, 0.053, 0.055], r: 0.071, turn: 1.571, beat: 0.051 },
    { shape: 'bubble', colour: '#ff7a1a', at: [0.002, 0.126, 0.261], r: 0.104, turn: 0, beat: 0.228 },
  ] }),
  // found 2026-11-02: glossy sunset stars fired single file along the punch. Gloves only: a blade's trick stays on its
  // tip, so it wouldn't fly out in a line. All its bits start in the middle, so spreading wouldn't do anything (left out)
  starPunch: fromRecipe({ finish: 'glossy', life: 0.68, turn: 1, drift: 3, stream: 1, flicker: 0, bits: [
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.157, turn: 0, beat: 4.574 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.218, turn: 1.571, beat: 0.747 },
    { shape: 'star', colour: '#ff3b7f', at: [0, 0, 0], r: 0.189, turn: 0, beat: 5.231 },
    { shape: 'star', colour: '#ff3b7f', at: [0, 0, 0], r: 0.173, turn: 1.571, beat: 2.014 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.209, turn: 0, beat: 5.385 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.226, turn: 1.571, beat: 5.595 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.187, turn: 0, beat: 2.288 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.173, turn: 1.571, beat: 0.348 },
  ] }),
  // found 2026-11-02: a glowing ball of yellow, orange and white flames and bolts, flickering hard, punched well out
  fireball: fromRecipe({ finish: 'glow', life: 0.68, turn: 0, drift: 2.5, spreadAlong: 1.325, spreadAcross: 2.65, flicker: 1, bits: [
    { shape: 'bolt', colour: '#ffd21a', at: [0.307, 0.058, 0.264], r: 0.119, turn: 0, beat: 4.408 },
    { shape: 'bolt', colour: '#ffffff', at: [0.192, 0.14, 0.093], r: 0.121, turn: 1.571, beat: 3.598 },
    { shape: 'blaze', colour: '#ff7a1a', at: [-0.208, 0.141, 0.251], r: 0.113, turn: 0, beat: 3.742 },
    { shape: 'blaze', colour: '#ffffff', at: [0.262, -0.099, 0.199], r: 0.113, turn: 1.571, beat: 0.404 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0.255, -0.301, -0.331], r: 0.106, turn: 0, beat: 1.976 },
    { shape: 'bolt', colour: '#ffffff', at: [-0.043, 0.195, 0.117], r: 0.106, turn: 1.571, beat: 2.237 },
    { shape: 'blaze', colour: '#ffffff', at: [-0.275, -0.247, -0.158], r: 0.136, turn: 0, beat: 3.133 },
    { shape: 'blaze', colour: '#ff7a1a', at: [0.246, 0.125, -0.173], r: 0.13, turn: 1.571, beat: 4.791 },
    { shape: 'bolt', colour: '#ffd21a', at: [-0.326, -0.294, 0.108], r: 0.119, turn: 0, beat: 2.049 },
    { shape: 'bolt', colour: '#ffd21a', at: [-0.227, -0.171, -0.262], r: 0.108, turn: 1.571, beat: 1.325 },
    { shape: 'blaze', colour: '#ffd21a', at: [-0.076, -0.329, 0.311], r: 0.134, turn: 0, beat: 4.922 },
    { shape: 'bolt', colour: '#ffd21a', at: [0.08, 0.314, 0.164], r: 0.121, turn: 1.571, beat: 4.051 },
    { shape: 'blaze', colour: '#ffd21a', at: [0.037, 0.236, 0.233], r: 0.136, turn: 0, beat: 5.761 },
    { shape: 'bolt', colour: '#ffffff', at: [0.061, 0.156, 0.286], r: 0.134, turn: 1.571, beat: 4.576 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0.257, 0.136, -0.138], r: 0.126, turn: 0, beat: 0.938 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0.149, -0.231, 0.048], r: 0.112, turn: 1.571, beat: 1.138 },
  ] }),
  // found 2026-11-02: one big glossy pink heart, punched slowly out and turning, lingering. One bit in the middle, so
  // spreading and stream wouldn't do anything (left out)
  loveTap: fromRecipe({ finish: 'glossy', life: 2.34, turn: 0.83, drift: 2.45, flicker: 0, bits: [
    { shape: 'heart', colour: '#ff3b7f', at: [0, 0, 0], r: 0.235, turn: 0, beat: 0.307 },
  ] }),
  // found 2026-11-02: tiny glowing white, yellow and orange stars left one by one along a sword's swing (trail), flying
  // on and flickering. All its bits start in the middle, so spreading wouldn't do anything (left out)
  shootingStar: fromRecipe({ finish: 'glow', life: 0.81, turn: 0, drift: 1.16, stream: 1, flicker: 1, bits: [
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.058, turn: 0, beat: 2.699 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.031, turn: 1.571, beat: 3.467 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.058, turn: 0, beat: 3.276 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.014, turn: 1.571, beat: 0.852 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.087, turn: 0, beat: 5.506 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.036, turn: 1.571, beat: 2.562 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.029, turn: 0, beat: 5.523 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.022, turn: 1.571, beat: 3.712 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.027, turn: 0, beat: 1.132 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.082, turn: 1.571, beat: 5.268 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.039, turn: 0, beat: 0.166 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.063, turn: 1.571, beat: 4.412 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.08, turn: 0, beat: 5.667 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.014, turn: 1.571, beat: 4.926 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.058, turn: 0, beat: 2.123 },
    { shape: 'star', colour: '#ff7a1a', at: [0, 0, 0], r: 0.017, turn: 1.571, beat: 5.056 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.07, turn: 0, beat: 5.644 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.048, turn: 1.571, beat: 1.295 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.058, turn: 0, beat: 1.495 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.075, turn: 1.571, beat: 1.728 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.075, turn: 0, beat: 0.884 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.039, turn: 1.571, beat: 3.53 },
    { shape: 'star', colour: '#ffffff', at: [0, 0, 0], r: 0.087, turn: 0, beat: 1.834 },
    { shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.029, turn: 1.571, beat: 4.151 },
  ] }),
  // found 2026-11-02: one big glass bubble shot out and stopped short, bobbing, swelling 4 times over and turning pink as
  // it pops. A bubble is always glass (finish and colours don't matter); one bit in the middle, so spreading, twist and
  // stream wouldn't do anything (left out). On a blade it swells on the tip
  bubblegumPop: fromRecipe({ life: 0.48, turn: 0, drift: 1.277, flicker: 0, amplitude: 0.289, frequency: 2.371, ease: 1, grow: 3, hue: -0.57, bits: [
    { shape: 'bubble', colour: '#ff7a1a', at: [0, 0, 0], r: 0.23, turn: 0, beat: 0.537 },
  ] }),
  // found 2026-11-02: a ring of neon blue and white bolts round the fist that bursts out along the punch and flattens to a
  // line across it, flickering, shrinking and turning violet, in under half a second. It doesn't fly (drift 0), so its
  // path settings wouldn't do anything (left out)
  powerPuff: fromRecipe({ finish: 'neon', life: 0.44, turn: 0, drift: 0, spreadAlong: 3.46, spreadAcross: 0.3, flicker: 0.46, ease: 0.53, grow: -0.8, hue: 0.41, bits: [
    { shape: 'bolt', colour: '#2f6bff', at: [0, 0.383, 0], r: 0.207, turn: 0, beat: 0.809 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.362, 0.124], r: 0.195, turn: 1.571, beat: 1.395 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, 0.302, 0.235], r: 0.263, turn: 0, beat: 0.513 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, 0.21, 0.321], r: 0.276, turn: 1.571, beat: 3.959 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, 0.094, 0.371], r: 0.228, turn: 0, beat: 5.119 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, -0.032, 0.382], r: 0.264, turn: 1.571, beat: 4.502 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, -0.154, 0.351], r: 0.202, turn: 0, beat: 2.371 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, -0.259, 0.282], r: 0.287, turn: 1.571, beat: 3.707 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, -0.337, 0.182], r: 0.257, turn: 0, beat: 0.405 },
    { shape: 'bolt', colour: '#ffffff', at: [0, -0.378, 0.063], r: 0.276, turn: 1.571, beat: 0.693 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, -0.378, -0.063], r: 0.159, turn: 0, beat: 4.172 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, -0.337, -0.182], r: 0.284, turn: 1.571, beat: 2.698 },
    { shape: 'bolt', colour: '#ffffff', at: [0, -0.259, -0.282], r: 0.157, turn: 0, beat: 5.554 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, -0.154, -0.351], r: 0.222, turn: 1.571, beat: 0.024 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, -0.032, -0.382], r: 0.264, turn: 0, beat: 1.483 },
    { shape: 'bolt', colour: '#5eccf6', at: [0, 0.094, -0.371], r: 0.29, turn: 1.571, beat: 4.128 },
    { shape: 'bolt', colour: '#2f6bff', at: [0, 0.21, -0.321], r: 0.194, turn: 0, beat: 2.088 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.302, -0.235], r: 0.251, turn: 1.571, beat: 2.444 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.362, -0.124], r: 0.205, turn: 0, beat: 3.145 },
  ] }),
  // found 2026-11-03: a spiral of neon mint and white hearts, twinkles among them, streaming out one after another and
  // corkscrewing, shooting out and slowing, spreading wide and wiggling a little
  magicStar: fromRecipe({ finish: 'neon', life: 0.904, turn: 1.152, drift: 2.1, spreadAlong: 3.314, spreadAcross: 4.418, stream: 1, flicker: 0.288,
    amplitude: 0.05, frequency: 1.947, ease: 0.89, twist: 1.069, grow: 0.222, bits: [
    { shape: 'twinkle', colour: '#b8ffe6', at: [0, 0, 0], r: 0.047, turn: 0, beat: 2.224 },
    { shape: 'twinkle', colour: '#ffffff', at: [0, 0.011, 0.007], r: 0.046, turn: 1.571, beat: 5.63 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, 0.012, 0.024], r: 0.051, turn: 0, beat: 0.758 },
    { shape: 'heart', colour: '#b8ffe6', at: [0, -0.003, 0.04], r: 0.059, turn: 1.571, beat: 4.322 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.031, 0.044], r: 0.056, turn: 0, beat: 4.413 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.062, 0.027], r: 0.062, turn: 1.571, beat: 2.607 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.08, -0.011], r: 0.071, turn: 0, beat: 2.207 },
    { shape: 'heart', colour: '#ffffff', at: [0, -0.073, -0.059], r: 0.087, turn: 1.571, beat: 5.302 },
    { shape: 'heart', colour: '#b8ffe6', at: [0, -0.036, -0.101], r: 0.068, turn: 0, beat: 3.443 },
    { shape: 'heart', colour: '#ffffff', at: [0, 0.025, -0.119], r: 0.074, turn: 1.571, beat: 0.825 },
    { shape: 'heart', colour: '#b8ffe6', at: [0, 0.092, -0.098], r: 0.063, turn: 0, beat: 4.453 },
    { shape: 'heart', colour: '#ffffff', at: [0, 0.142, -0.04], r: 0.082, turn: 1.571, beat: 5.206 },
    { shape: 'heart', colour: '#ffffff', at: [0, 0.155, 0.044], r: 0.045, turn: 0, beat: 2.566 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, 0.119, 0.128], r: 0.087, turn: 1.571, beat: 1.818 },
    { shape: 'twinkle', colour: '#3ee8b5', at: [0, 0.038, 0.184], r: 0.04, turn: 0, beat: 0.632 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.068, 0.19], r: 0.071, turn: 1.571, beat: 1.004 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.167, 0.136], r: 0.054, turn: 0, beat: 5.365 },
    { shape: 'twinkle', colour: '#ffffff', at: [0, -0.226, 0.031], r: 0.036, turn: 1.571, beat: 5.064 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, -0.222, -0.096], r: 0.086, turn: 0, beat: 5.739 },
    { shape: 'twinkle', colour: '#ffffff', at: [0, -0.147, -0.209], r: 0.048, turn: 1.571, beat: 5.182 },
    { shape: 'heart', colour: '#ffffff', at: [0, -0.018, -0.268], r: 0.09, turn: 0, beat: 2.913 },
    { shape: 'heart', colour: '#b8ffe6', at: [0, 0.13, -0.251], r: 0.071, turn: 1.571, beat: 1.874 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, 0.253, -0.154], r: 0.05, turn: 0, beat: 2.583 },
    { shape: 'heart', colour: '#3ee8b5', at: [0, 0.309, 0], r: 0.053, turn: 1.571, beat: 5.894 },
  ] }),
  // found 2026-11-03: a ring of glowing golden donuts and twinkles, spinning fast and streaming out wide, swelling and
  // flickering. Kept for a special occasion: on no hands in TRICKS yet, so nobody can pick it till something earns it
  goldenDonut: fromRecipe({ finish: 'glow', life: 1.227, turn: 8.784, drift: 2.811, spreadAlong: 2.287, spreadAcross: 5.034, stream: 1, flicker: 1,
    amplitude: 0.147, frequency: 1.514, ease: 0.315, grow: 0.757, bits: [
    { shape: 'donut', colour: '#fff4c2', at: [0, 0.285, 0], r: 0.12, turn: 0, beat: 1.397 },
    { shape: 'donut', colour: '#fff4c2', at: [0, 0.274, 0.077], r: 0.114, turn: 1.571, beat: 3.469 },
    { shape: 'donut', colour: '#ffd21a', at: [0, 0.243, 0.148], r: 0.13, turn: 0, beat: 5.503 },
    { shape: 'donut', colour: '#ffb300', at: [0, 0.194, 0.208], r: 0.04, turn: 1.571, beat: 5.037 },
    { shape: 'donut', colour: '#ffd21a', at: [0, 0.131, 0.253], r: 0.034, turn: 0, beat: 5.918 },
    { shape: 'twinkle', colour: '#ffb300', at: [0, 0.058, 0.279], r: 0.076, turn: 1.571, beat: 0.152 },
    { shape: 'donut', colour: '#ffd21a', at: [0, -0.019, 0.284], r: 0.087, turn: 0, beat: 5.271 },
    { shape: 'twinkle', colour: '#ffb300', at: [0, -0.095, 0.268], r: 0.053, turn: 1.571, beat: 2.172 },
    { shape: 'donut', colour: '#fff4c2', at: [0, -0.164, 0.232], r: 0.076, turn: 0, beat: 0.011 },
    { shape: 'twinkle', colour: '#fff4c2', at: [0, -0.221, 0.18], r: 0.031, turn: 1.571, beat: 4.827 },
    { shape: 'donut', colour: '#ffb300', at: [0, -0.261, 0.113], r: 0.101, turn: 0, beat: 2.645 },
    { shape: 'donut', colour: '#ffd21a', at: [0, -0.282, 0.039], r: 0.078, turn: 1.571, beat: 2.959 },
    { shape: 'donut', colour: '#ffb300', at: [0, -0.282, -0.039], r: 0.036, turn: 0, beat: 2.087 },
    { shape: 'twinkle', colour: '#ffb300', at: [0, -0.261, -0.113], r: 0.061, turn: 1.571, beat: 4.133 },
    { shape: 'donut', colour: '#fff4c2', at: [0, -0.221, -0.18], r: 0.118, turn: 0, beat: 2.721 },
    { shape: 'donut', colour: '#ffd21a', at: [0, -0.164, -0.232], r: 0.1, turn: 1.571, beat: 5.753 },
    { shape: 'donut', colour: '#ffd21a', at: [0, -0.095, -0.268], r: 0.059, turn: 0, beat: 0.004 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, -0.019, -0.284], r: 0.086, turn: 1.571, beat: 3.89 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, 0.058, -0.279], r: 0.068, turn: 0, beat: 0.799 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, 0.131, -0.253], r: 0.063, turn: 1.571, beat: 1.575 },
    { shape: 'donut', colour: '#ffd21a', at: [0, 0.194, -0.208], r: 0.07, turn: 0, beat: 0.789 },
    { shape: 'donut', colour: '#ffd21a', at: [0, 0.243, -0.148], r: 0.053, turn: 1.571, beat: 2.958 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, 0.274, -0.077], r: 0.082, turn: 0, beat: 0.539 },
  ] }),
  // found 2026-11-03: one big glowing green ZAP! for the Greathammer, swelling on its head as it swings. A blade's trick
  // stays on the tip, so only what works there is kept (its life, flicker, swelling, and spreading off the head)
  zap: fromRecipe({ finish: 'glow', life: 1.943, turn: 0, spreadAcross: 3.532, flicker: 0.255, ease: 0.554, grow: 0.963, bits: [
    { shape: 'text', colour: '#8be02a', at: [0.085, -0.101, -0.104], r: 0.291, turn: 0, beat: 3.666, text: 'ZAP!' },
  ] }),
  // found 2026-11-03: a star of outlined galaxy hearts, pink, violet, blue and white, blasted out together and spreading
  // wide as it flies, wiggling a little and slowing
  heartBlast: fromRecipe({ finish: 'sticker', life: 1.784, turn: 0, drift: 2.861, spreadAlong: 2.683, spreadAcross: 4.343, flicker: 0,
    amplitude: 0.2, frequency: 1.378, ease: 0.51, bits: [
    { shape: 'heart', colour: '#ff6bd6', at: [0, 0.323, 0], r: 0.03, turn: 0, beat: 0.568 },
    { shape: 'heart', colour: '#7a4cff', at: [0, 0.165, 0.066], r: 0.041, turn: 1.571, beat: 3.832 },
    { shape: 'heart', colour: '#ff6bd6', at: [0, 0.108, 0.205], r: 0.084, turn: 0, beat: 2.091 },
    { shape: 'heart', colour: '#2f6bff', at: [0, 0.055, 0.255], r: 0.069, turn: 1.571, beat: 0.804 },
    { shape: 'heart', colour: '#2f6bff', at: [0, -0.062, 0.142], r: 0.114, turn: 0, beat: 5.016 },
    { shape: 'heart', colour: '#ffffff', at: [0, -0.228, 0.182], r: 0.077, turn: 1.571, beat: 1.052 },
    { shape: 'heart', colour: '#ffffff', at: [0, -0.19, 0.073], r: 0.058, turn: 0, beat: 2.594 },
    { shape: 'heart', colour: '#2f6bff', at: [0, -0.19, -0.073], r: 0.076, turn: 1.571, beat: 2.348 },
    { shape: 'heart', colour: '#ffffff', at: [0, -0.228, -0.182], r: 0.1, turn: 0, beat: 2.277 },
    { shape: 'heart', colour: '#2f6bff', at: [0, -0.062, -0.142], r: 0.13, turn: 1.571, beat: 2.327 },
    { shape: 'heart', colour: '#2f6bff', at: [0, 0.055, -0.255], r: 0.046, turn: 0, beat: 5.778 },
    { shape: 'heart', colour: '#ffffff', at: [0, 0.108, -0.205], r: 0.075, turn: 1.571, beat: 4.245 },
    { shape: 'heart', colour: '#ff6bd6', at: [0, 0.165, -0.066], r: 0.112, turn: 0, beat: 4.395 },
  ] }),
  // found 2026-11-03: neon streaks of yellow, blue and pink with twinkles among them, shot out one after another and
  // bending up, slowing hard at the end: a beam off a glove, spread along the arc off a sword. All its bits start in the
  // middle, so spreading wouldn't do anything (left out)
  smiteOfLight: fromRecipe({ finish: 'neon', life: 0.94, turn: 0.828, drift: 1.986, stream: 1, flicker: 0, arc: 0.761, ease: 0.967, grow: 0.24, bits: [
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.075, turn: 0, beat: 3.569 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.08, turn: 1.571, beat: 1.503 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.047, turn: 0, beat: 2.861 },
    { shape: 'streak', colour: '#8fd8ff', at: [0, 0, 0], r: 0.121, turn: 1.571, beat: 5.577 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.073, turn: 0, beat: 2.895 },
    { shape: 'streak', colour: '#8fd8ff', at: [0, 0, 0], r: 0.147, turn: 1.571, beat: 2.917 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.21, turn: 0, beat: 1.975 },
    { shape: 'twinkle', colour: '#fff27a', at: [0, 0, 0], r: 0.075, turn: 1.571, beat: 5.944 },
    { shape: 'twinkle', colour: '#fff27a', at: [0, 0, 0], r: 0.058, turn: 0, beat: 2.542 },
    { shape: 'twinkle', colour: '#fff27a', at: [0, 0, 0], r: 0.048, turn: 1.571, beat: 4.605 },
    { shape: 'streak', colour: '#ff8fd1', at: [0, 0, 0], r: 0.168, turn: 0, beat: 2.848 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.157, turn: 1.571, beat: 2.298 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.081, turn: 0, beat: 0.205 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.079, turn: 1.571, beat: 0.344 },
    { shape: 'twinkle', colour: '#fff27a', at: [0, 0, 0], r: 0.05, turn: 0, beat: 2.988 },
    { shape: 'twinkle', colour: '#ff8fd1', at: [0, 0, 0], r: 0.113, turn: 1.571, beat: 4.3 },
    { shape: 'streak', colour: '#8fd8ff', at: [0, 0, 0], r: 0.17, turn: 0, beat: 5.708 },
    { shape: 'streak', colour: '#fff27a', at: [0, 0, 0], r: 0.188, turn: 1.571, beat: 2.217 },
    { shape: 'streak', colour: '#ff8fd1', at: [0, 0, 0], r: 0.071, turn: 0, beat: 5.328 },
    { shape: 'streak', colour: '#ff8fd1', at: [0, 0, 0], r: 0.127, turn: 1.571, beat: 0.088 },
  ] }),
  // found 2026-11-03: chrome speed lines, white and a little yellow, shot out one after another, dipping a little and
  // braking hard. All its bits start in the middle, so spreading wouldn't do anything (left out)
  speedLines: fromRecipe({ finish: 'chrome', life: 1.24, turn: 2.55, drift: 1.986, stream: 1, flicker: 0.26, arc: -0.26, ease: 0.967, grow: -0.02, hue: 0.8, bits: [
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.098, turn: 0, beat: 3.569 },
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.101, turn: 1.571, beat: 1.503 },
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.081, turn: 0, beat: 2.861 },
    { shape: 'streak', colour: '#ffd21a', at: [0, 0, 0], r: 0.127, turn: 1.571, beat: 5.577 },
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.097, turn: 0, beat: 2.895 },
    { shape: 'streak', colour: '#ffd21a', at: [0, 0, 0], r: 0.143, turn: 1.571, beat: 2.917 },
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.182, turn: 0, beat: 1.975 },
    { shape: 'streak', colour: '#ffffff', at: [0, 0, 0], r: 0.129, turn: 1.571, beat: 5.944 },
  ] }),
  lightningStorm: fromRecipe({ finish: 'neon', life: 0.84, turn: 0.669, drift: 1.2, spreadAlong: 2.733, spreadAcross: 1.619, stream: 1, flicker: 1, amplitude: 0.061, frequency: 1.71, ease: 1, grow: -1, bits: [
    { shape: 'bolt', colour: '#ff7a1a', at: [0, 0, 0], r: 0.197, turn: 0, beat: 1.497 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.026, 0.02], r: 0.162, turn: 1.571, beat: 3.232 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, 0.016, 0.063], r: 0.173, turn: 0, beat: 0.408 },
    { shape: 'twinkle', colour: '#ff7a1a', at: [0, -0.039, 0.09], r: 0.113, turn: 1.571, beat: 3.222 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, -0.115, 0.062], r: 0.199, turn: 0, beat: 1.416 },
    { shape: 'bolt', colour: '#ffffff', at: [0, -0.161, -0.027], r: 0.164, turn: 1.571, beat: 5.922 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, -0.133, -0.144], r: 0.16, turn: 0, beat: 3.508 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, -0.019, -0.228], r: 0.197, turn: 1.571, beat: 4.152 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.143, -0.219], r: 0.178, turn: 0, beat: 0.95 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0, 0.278, -0.095], r: 0.194, turn: 1.571, beat: 1.264 },
    { shape: 'bolt', colour: '#ffffff', at: [0, 0.309, 0.106], r: 0.165, turn: 0, beat: 0.933 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, 0.196, 0.3], r: 0.123, turn: 1.571, beat: 1.177 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0, -0.032, 0.39], r: 0.166, turn: 0, beat: 4.8 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, -0.287, 0.312], r: 0.182, turn: 1.571, beat: 0.388 },
    { shape: 'bolt', colour: '#ffffff', at: [0, -0.451, 0.075], r: 0.192, turn: 0, beat: 1.616 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, -0.43, -0.233], r: 0.184, turn: 1.571, beat: 4.22 },
    { shape: 'twinkle', colour: '#ffd21a', at: [0, -0.21, -0.478], r: 0.122, turn: 0, beat: 5.992 },
    { shape: 'bolt', colour: '#ffd21a', at: [0, 0.136, -0.538], r: 0.198, turn: 1.571, beat: 1.847 },
    { shape: 'twinkle', colour: '#ffffff', at: [0, 0.464, -0.361], r: 0.121, turn: 0, beat: 1.717 },
    { shape: 'bolt', colour: '#ff7a1a', at: [0, 0.62, 0], r: 0.185, turn: 1.571, beat: 3.198 },
  ] }),
  atomicBall: fromRecipe({ finish: 'neon', life: 1.24, turn: 15.58, drift: 1.44, stream: 0.16, flicker: 0.84, amplitude: 0.19, frequency: 0.665, ease: 1, grow: 5.23, hue: -0.84, bits: [
    { shape: 'donut', colour: '#ff7a1a', at: [0, 0, 0], r: 0.047, turn: 0, beat: 5.468 },
    { shape: 'donut', colour: '#ff3b7f', at: [0, 0, 0], r: 0.065, turn: 1.571, beat: 0.716 },
    { shape: 'donut', colour: '#ff7a1a', at: [0, 0, 0], r: 0.066, turn: 0, beat: 4.565 },
    { shape: 'donut', colour: '#ff7a1a', at: [0, 0, 0], r: 0.041, turn: 1.571, beat: 5.057 },
    { shape: 'donut', colour: '#ff7a1a', at: [0, 0, 0], r: 0.067, turn: 0, beat: 4.221 },
    { shape: 'donut', colour: '#ffd21a', at: [0, 0, 0], r: 0.071, turn: 1.571, beat: 1.896 },
    { shape: 'donut', colour: '#ff7a1a', at: [0, 0, 0], r: 0.04, turn: 0, beat: 2.456 },
  ] }),
  sparkle: { parts: (g, _p, built) => g.add(sparkleOf(built)) },
  bubble: { parts: (g, p) => scatter(g, p.ball, p.bubble, BUBBLES) },
  flame: { parts: addFlame, flicker: 0.3 },
  // the scythe's stars, hearts and notes fly out past its point, along the blade (spray)
  music: { parts: (g, p, built) => {
    g.add(sparkleOf(built));
    g.userData.spray = MUSIC.map(([shape, , xyz, r], i) => g.add(bit(p.music[shape], p.paints[i], xyz, r)).children.at(-1));
  } },
  lightning: { parts: addBolts },
});

/**
 * How a trick moves, unless its EFFECTS entry says otherwise. Shown for `life` seconds from the hit, `size` times its own
 * (a recipe's sizes are in its bits), fading out over the last quarter, turning `turn` radians a second. Off a glove it
 * leaves as the hit lands and flies `drift` along the hit's force, its bits' gaps growing `spreadAlong` times along the
 * force and `spreadAcross` times across it, leaving together (`stream` 0: a blast) or one after another (1: a stream).
 * Its path bends off the straight line by `arc` (up, or down if less than 0) and snakes across it `frequency` times over
 * its life, `amplitude` out each side; its bits corkscrew `twist` turns round it. `ease` 0 goes at one speed, 1 shoots out
 * and slows to a stop. On a blade it stays on the tip, a recipe's spreading round it, and floats `rise` up off it, or
 * with `stream` its bits are left one by one along the swing, going on `drift` the way the tip was going (trail).
 * `flicker`: how far a flicking bit stretches, as a share of its size; `grow`: how much bigger it ends (-1: gone);
 * `hue`: how far round the colour wheel it turns.
 */
/** @type {Readonly<Motion>} */
export const EFFECT = Object.freeze({
  life: 1.2, size: 1.4, turn: 5, drift: 0.7, spreadAlong: 3, spreadAcross: 3, stream: 0, arc: 0, amplitude: 0, frequency: 2, ease: 0, twist: 0, grow: 0, hue: 0,
  rise: 0.35, flicker: 0,
});
/** With `stream` 1, the last bit leaves this far through the effect's life. */
const STREAM_WAIT = 0.7;

// ponytail: a trial randomizer for new effects (the bad-guy dress-up rolls one when you tap your gloves or sword again); a seed
// that looks good is copied into EFFECTS by hand. What a roll draws from: its shape and accent, colours, where its bits start (layout)
// how far out (reach) and how big, and each EFFECT setting between these bounds. A list of ranges is a choice of them, one
// picked and then drawn in (playtest, 12 favourites by 2026-11-02: turn still, slow or fast, never between; stream 0 or 1;
// flicker off, a shimmer or a strobe; 6 to 24 bits, or one big one).
export const ROLL = Object.freeze({
  shapes: ['ball', 'bubble', 'star', 'heart', 'note', 'blaze', 'bolt', 'streak', 'twinkle', 'donut', 'yarn', 'gem', 'drop', 'petal', 'swirl', 'text'],
  // a roll's second shape is only ever an accent: some of its bits, small (playtest: two main shapes, hearts and blazes, never looked right)
  accents: ['none', 'twinkle'], accentShare: 0.3, accentSize: 0.6,
  // what a `text` bit says: a word drawn in its colour, or an emoji washed in it
  texts: ['POW!', 'BAM!', 'ZAP!', '🍩', '💖', '✨', '⭐', '🧶', '🎵', '🔥'],
  // a roll's colours come from one family (playtest: mixed ones looked muddled); riot is the old anything-goes
  families: {
    sunset: ['#ff3b7f', '#ff7a1a', '#ffd21a'], sea: ['#2f6bff', '#5eccf6', '#ffffff'], berry: ['#cf4bfc', '#ff3b7f', '#fd9bd9'],
    lime: ['#8be02a', '#ffd21a', '#ffffff'], candle: ['#ffd21a', '#ffffff', '#ff7a1a'],
    mint: ['#3ee8b5', '#b8ffe6', '#ffffff'], ice: ['#bfefff', '#7fc8ff', '#ffffff'], gold: ['#ffd21a', '#ffb300', '#fff4c2'],
    bubblegum: ['#ff8fd1', '#8fd8ff', '#fff27a'], galaxy: ['#7a4cff', '#ff6bd6', '#2f6bff', '#ffffff'], grape: ['#6a2bd8', '#cf4bfc', '#e8c8ff'],
    ember: ['#ff3b1a', '#ff7a1a', '#ffd21a', '#8a1a0a'],
    riot: ['#ff3b7f', '#ffd21a', '#5eccf6', '#8be02a', '#ff7a1a', '#cf4bfc', '#ffffff', '#2f6bff'],
  },
  finishes: ['flat', 'glow', 'neon', 'toon', 'sticker', 'glossy', 'chrome', 'glitter', 'knit'],
  layouts: ['ball', 'middle', 'ring', 'line', 'spiral', 'heart', 'star'],
  count: [[1, 1], [6, 24], [6, 24], [6, 24], [6, 24]], reach: [0.15, 0.4], bit: [0.03, 0.15], bigBit: [0.15, 0.3],
  motion: {
    life: [0.7, 2.4], turn: [[0, 0], [0.5, 1.2], [8, 10]], drift: [0.5, 3], spreadAlong: [1.5, 6], spreadAcross: [1.5, 6],
    stream: [[0, 0], [1, 1]], flicker: [[0, 0], [0.2, 0.3], [1, 1]], arc: [[0, 0], [-0.8, 0.8]], amplitude: [[0, 0], [0.05, 0.3]],
    frequency: [0.5, 3], ease: [0, 1], twist: [[0, 0], [0, 0], [0.5, 2]], grow: [[0, 0], [-0.8, 0], [0, 1]], hue: [[0, 0], [0, 0], [-0.3, 0.3]],
  },
});

const onCircle = (turns) => [0, Math.cos(2 * Math.PI * turns), Math.sin(2 * Math.PI * turns)];
/** A star's outline, `t` (0-1) of the way round from its top point. */
function onStar(t) {
  const corner = (j) => onCircle(j / 10).map((v) => v * (j % 2 ? 0.45 : 1)), at = 10 * t, j = Math.floor(at), f = at - j;
  return corner(j).map((v, i) => v + (corner(j + 1)[i] - v) * f);
}
/** Where bit `i` of `n` starts, by layout, before the roll's reach scales it; `xyz` three dice for a ball. The flat ones
 * face the side-on camera, in the fighter's (y, z). */
const LAYOUT = {
  ball: (_i, _n, xyz) => xyz.map((v) => v * 2 - 1),
  middle: () => [0, 0, 0],
  ring: (i, n) => onCircle(i / n),
  line: (i, n) => [0, n > 1 ? (2 * i) / (n - 1) - 1 : 0, 0],
  spiral: (i, n) => onCircle((2 * i) / Math.max(1, n - 1)).map((v) => (v * i) / Math.max(1, n - 1)),
  heart: (i, n) => {
    const a = (2 * Math.PI * i) / n;
    return [0, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16, Math.sin(a) ** 3];
  },
  star: (i, n) => onStar(i / n),
};

const TWO = THREE.DoubleSide;
const unlit = (color) => new THREE.MeshBasicMaterial({ color, side: TWO, toneMapped: false });
const cartoon = (color) => new THREE.MeshToonMaterial({ color, side: TWO });
/** What a bit's surface is made of, by finish: flat paper; a glow (flat, with a halo: see adorn); neon, a white-hot
 * middle in a strong glow of its colour (adorn; not added light: on the stages' near-white backgrounds that only ever
 * made white spots, playtest); cartoon shading, and a sticker (that, outlined in white); shiny candy; chrome and glitter
 * (pictures of a shine, turning with the bit, so lit the same anywhere); or yarn. Shared per finish and colour. */
const FINISH = {
  flat: unlit, glow: unlit, neon: unlit, toon: cartoon, sticker: cartoon,
  glossy: (color) => new THREE.MeshStandardMaterial({ color, side: TWO, roughness: 0.12, metalness: 0 }),
  chrome: (color, p) => new THREE.MeshMatcapMaterial({ color, side: TWO, matcap: matcapOf(p, 'chrome') }),
  glitter: (color, p) => new THREE.MeshMatcapMaterial({ color, side: TWO, matcap: matcapOf(p, 'glitter') }),
  knit: (color) => Object.assign(knitMaterial(color), { side: TWO }),
};

/** How bright a matcap is where a bit faces (u, v), each -1 to 1 across the view: chrome, a sky over a dark horizon over
 * the floor, with a sun; glitter, a soft shine flecked with sparks (`i` its texel, for which ones). */
const SHINE = {
  chrome: (u, v) => {
    const ground = v > -0.15 ? 0.1 : 0.3 - 0.2 * v;
    return (v > 0 ? 0.6 + 0.4 * v : ground) + Math.exp(-40 * ((u + 0.35) ** 2 + (v - 0.45) ** 2));
  },
  glitter: (u, v, i) => (((i * 2654435761) >>> 0) % 100 < 7 ? 1 : 0.45 + 0.3 * v - 0.1 * u),
};
function matcapOf(p, kind) {
  const maps = (p.matcaps ??= {});
  if (!maps[kind]) {
    const n = 64, px = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const lit = Math.round(255 * Math.min(1, SHINE[kind]((i % n) / (n / 2) - 1, Math.floor(i / n) / (n / 2) - 1, i)));
      px.set([lit, lit, lit, 255], i * 4);
    }
    maps[kind] = Object.assign(new THREE.DataTexture(px, n, n), { needsUpdate: true });
  }
  return maps[kind];
}

/** A soft dot, white in the middle fading to clear: a glow's halo, tinted per colour; neon's is stronger. */
function haloOf(p, color, neon) {
  if (!p.haloMap) {
    const n = 32, px = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const d = Math.hypot((i % n) - n / 2 + 0.5, Math.floor(i / n) - n / 2 + 0.5) / (n / 2);
      px.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 2)], i * 4);
    }
    p.haloMap = Object.assign(new THREE.DataTexture(px, n, n), { needsUpdate: true });
  }
  return new THREE.SpriteMaterial({ map: p.haloMap, color, transparent: true, opacity: neon ? 1 : 0.7, depthWrite: false, toneMapped: false });
}

/** A w by h box turned by `a` round its middle, at (x, y). */
const plank = (w, h, a, x, y) => new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]]
  .map(([u, v]) => new THREE.Vector2((u * w) / 2, (v * h) / 2).rotateAround(new THREE.Vector2(), a).add(new THREE.Vector2(x, y))));
/** A flat bit's shape as a puffy sticker, rounded at its edges, for a finish that's lit: paper faces just one way, so all
 * of it caught the light alike and toon, glossy and knit looked the same (playtest). */
/** A shape through points (x, y) from `at(t)`, `t` 0-1 round it. */
const traced = (at, n = 32) => new THREE.Shape(Array.from({ length: n }, (_, i) => new THREE.Vector2(...at(i / n))));
function donutShape() {
  const ring = new THREE.Shape().absarc(0, 0, 1, 0, 2 * Math.PI, false);
  ring.holes.push(new THREE.Path().absarc(0, 0, 0.45, 0, 2 * Math.PI, true));
  return ring;
}
/** A curl: out along a spiral one way, back along it a little further in. */
function swirlShape() {
  const at = (a, w) => [(0.15 + 0.28 * a + w) * Math.cos(a), (0.15 + 0.28 * a + w) * Math.sin(a)];
  const out = Array.from({ length: 24 }, (_, i) => at((3 * Math.PI * i) / 23, 0.12));
  return new THREE.Shape([...out, ...out.map((_, i) => at((3 * Math.PI * (23 - i)) / 23, -0.12))].map(([x, y]) => new THREE.Vector2(x, y)));
}
const PUFFY = {
  star: () => starShape(1), heart: () => heartShape(1), blaze: blazeShape, twinkle: () => starShape(1, 0.22, 4), donut: donutShape, swirl: swirlShape,
  bolt: () => new THREE.Shape(BOLT.map(([x, y]) => new THREE.Vector2(x, y))),
  // the paper note's head, stem and flag
  note: () => [new THREE.Shape().absellipse(0, 0, 0.6, 0.425, 0, 2 * Math.PI, false, 0.35), plank(0.16, 1.6, 0, 0.5, 0.8), plank(0.5, 0.16, -0.6, 0.72, 1.45)],
  gem: () => new THREE.Shape([[0, -0.8], [0.65, 0.3], [0.35, 0.65], [-0.35, 0.65], [-0.65, 0.3]].map(([x, y]) => new THREE.Vector2(x, y))),
  drop: () => traced((t) => [0.7 * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t), Math.cos(2 * Math.PI * t)]),
  petal: () => traced((t) => [0.45 * Math.sin(2 * Math.PI * t) ** 3 + 0.15 * Math.sin(2 * Math.PI * t), Math.cos(2 * Math.PI * t)]),
};
const PAPER = new Set(['flat', 'glow', 'neon']);
const puffyOf = (p, shape) => ((p.puffy ??= {})[shape] ??= mergeVertices(new THREE.ExtrudeGeometry(PUFFY[shape](),
  { depth: 0.04, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.07, bevelSegments: 4, curveSegments: 8 })).translate(0, 0, -0.02));
/** Shapes that are round already, the same whatever the finish: a ball of yarn wound three ways, and a streak (pointed
 * along its flight: see aimStreak). */
const SOLID = {
  ball: (p) => p.ball, bubble: (p) => p.ball,
  yarn: (p) => (p.yarn ??= mergeGeometries([new THREE.SphereGeometry(0.9, 14, 10),
    ...[0, 1, 2].map((i) => new THREE.TorusGeometry(0.9, 0.09, 6, 24).rotateX((i * Math.PI) / 3).rotateY(i))])),
  streak: (p) => (p.streak ??= new THREE.CapsuleGeometry(0.12, 1.4, 4, 8)),
};
/** A bit's shape for its finish: paper for a flat one, puffy for a lit one (round ones as they are). */
function geometryOf(p, shape, finish) {
  if (SOLID[shape]) return SOLID[shape](p);
  if (!PAPER.has(finish)) return puffyOf(p, shape);
  return { star: p.music.star, heart: p.music.heart, note: p.music.note, blaze: blazeOf(p), bolt: p.bolt }[shape]
    ?? ((p.paper ??= {})[shape] ??= new THREE.ShapeGeometry(PUFFY[shape](), 12));
}

/** A glow's or neon's halo round bit `m`, and neon's white-hot middle on each face; or a sticker's white outline (its
 * shape again, a little bigger, seen from inside). */
function adorn(m, p, finish, colour) {
  const mats = p.finished;
  if (finish === 'glow' || finish === 'neon') {
    if (!mats.has(`halo ${finish} ${colour}`)) mats.set(`halo ${finish} ${colour}`, haloOf(p, colour, finish === 'neon'));
    m.add(new THREE.Sprite(mats.get(`halo ${finish} ${colour}`)));
    m.children.at(-1).scale.set(3.2, 3.2, 1);
  }
  if (finish === 'neon') {
    mats.set('core', mats.get('core') ?? new THREE.MeshBasicMaterial({ color: '#ffffff', side: TWO, toneMapped: false }));
    for (const z of [-0.05, 0.05]) m.add(Object.assign(new THREE.Mesh(m.geometry, mats.get('core')), { renderOrder: 1 })).children.at(-1).position.z = z;
    for (const core of m.children.slice(-2)) core.scale.setScalar(0.45);
  }
  if (finish === 'sticker') {
    mats.set('outline', mats.get('outline') ?? new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide }));
    m.add(new THREE.Mesh(m.geometry, mats.get('outline')));
    m.children.at(-1).scale.setScalar(1.15);
  }
}

/** A word in its colour or an emoji washed in it, drawn once per text and colour, facing the camera; a star where there's
 * nothing to draw it on. */
function textBit(p, text, colour, at, r) {
  const key = `text ${text} ${colour}`, mats = p.finished;
  if (!mats.has(key)) {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), ctx = c.getContext('2d');
    const word = /\w/.test(text);
    Object.assign(ctx, { font: `900 ${word ? 44 : 96}px system-ui, sans-serif`, textAlign: 'center', textBaseline: 'middle', lineWidth: 8, strokeStyle: '#2a1630', fillStyle: colour });
    if (word) ctx.strokeText(text, 64, 68);
    ctx.fillText(text, 64, 68);
    // an emoji washed in its colour, so it changes with the family like every other bit (playtest: they stayed as they were)
    if (!word) Object.assign(ctx, { globalCompositeOperation: 'source-atop', globalAlpha: 0.6 }).fillRect(0, 0, 128, 128);
    mats.set(key, new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
  }
  const m = bit(new THREE.Object3D(), null, at, r).add(new THREE.Sprite(mats.get(key)));
  m.children[0].scale.set(2.4, 2.4, 1);
  return m;
}

/** One bit of a rolled effect, in `colour` and `finish`, flicking on its own beat; flat shapes cross the camera every other
 * way. A bubble is always the glass bubble. */
function rolledBit(g, p, { shape, colour, at, r, turn, beat, text = '✨' }, finish) {
  p.finished ??= new Map();
  if (shape === 'text' && typeof document !== 'undefined') return g.add(flick(textBit(p, text, colour, at, r), beat));
  const mats = p.finished, key = `${finish} ${colour}`;
  if (!mats.has(key)) mats.set(key, (FINISH[finish] ?? FINISH.flat)(colour, p));
  const m = flick(bit(geometryOf(p, shape === 'text' ? 'star' : shape, finish), shape === 'bubble' ? p.bubble : mats.get(key), at, r), beat);
  m.rotation.y = turn;
  m.userData.streak = shape === 'streak';
  if (shape !== 'bubble') adorn(m, p, finish, colour);
  return g.add(m);
}

/** @typedef {{ shape: string, colour: string, at: number[], r: number, turn: number, beat: number, text?: string }} Bit
 * @typedef {Partial<Motion> & { bits: Bit[], finish?: string, family?: string, shape?: string, accent?: string, shapes?: string[], layout?: string, reach?: number,
 *   bit?: number[], spread?: number, stretch?: number }} Recipe */
/**
 * A recipe from before 2026-11-02 as one now: its `size` put into its bits, and its `spread` and `stretch` as spreadAcross
 * and spreadAlong (the same at the end; a stretched one no longer starts stretched). One now comes back as it was.
 * @param {Recipe} recipe @returns {Recipe}
 */
export function upgradeRecipe({ size, spread, stretch, ...r }) {
  const k = size ?? 1, spreads = spread === undefined ? {} : { spreadAcross: spread, spreadAlong: spread * (stretch ?? 1) };
  return { ...spreads, ...r, bits: r.bits.map((b) => ({ ...b, at: b.at.map((v) => v * k), r: b.r * k })) };
}

/** An effect from a recipe: its motion, and its bits as rolledBit draws them (what dev mode shows, to paste into EFFECTS). @param {Recipe} recipe */
export function fromRecipe(recipe) {
  const { bits, finish = 'flat', family: _family, shape: _shape, accent: _accent, shapes: _shapes, layout: _layout, reach: _reach, bit: _bit, ...motion } = upgradeRecipe(recipe);
  return { ...motion, size: 1, spreads: true, parts: (g, p) => { for (const b of bits) rolledBit(g, p, b, finish); } };
}

/** Numbers 0-1 from `seed`, the same ones every time. */
function dice(seed) {
  let n = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((n = (n * 16807) % 2147483647) / 2147483647);
}

/**
 * The recipe seed `seed` rolls from ROLL, the same every time, with anything in `fix` (finish, family, shape, accent, layout, count,
 * bit: [min, max], reach, or a motion setting) used instead of what was rolled. Every number is drawn either way, so fixing
 * one thing (a slider in the effects menu) leaves the rest as rolled. What it rolled the bits from comes back with them.
 * @param {number} seed
 * @param {{ finish?: string, family?: string, shape?: string, accent?: string, layout?: string, count?: number, bit?: number[], reach?: number } & Partial<Motion>} fix
 * @returns {Recipe & { finish: string, family: string, shape: string, accent: string, layout: string, reach: number, bit: number[] }}
 */
export function rollRecipe(seed, fix = {}) {
  const rnd = dice(seed), pick = (list) => list[Math.floor(rnd() * list.length)];
  const span = (/** @type {readonly number[]} */ [a, b]) => a + (b - a) * rnd();
  const draw = (range) => (Array.isArray(range[0]) ? span(pick(range)) : span(range));
  const motion = Object.fromEntries(Object.entries(ROLL.motion).map(([k, range]) => [k, draw(range)]).map(([k, v]) => [k, fix[k] ?? v]));
  const rolled = { family: pick(Object.keys(ROLL.families)), finish: pick(ROLL.finishes), shape: pick(ROLL.shapes), accent: pick(ROLL.accents),
    layout: pick(ROLL.layouts), count: Math.round(draw(ROLL.count)), reach: span(ROLL.reach) };
  const { family, finish, shape: main, accent, layout, count, reach } = { ...rolled, ...Object.fromEntries(Object.entries(fix).filter(([k]) => k in rolled)) };
  const colours = ROLL.families[family], sizes = fix.bit ?? (count === 1 ? ROLL.bigBit : ROLL.bit);
  // each bit draws the same eight numbers whatever is fixed, so bit i is the same bit at any count
  const bits = Array.from({ length: count }, (_, i) => {
    const [s, c, x, y, z, r, beat, w] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    const accented = accent !== 'none' && count > 1 && s < ROLL.accentShare, shape = accented ? accent : main;
    return { shape, colour: colours[Math.floor(c * colours.length)], at: LAYOUT[layout](i, count, [x, y, z]).map((v) => v * reach),
      r: (sizes[0] + (sizes[1] - sizes[0]) * r) * (accented ? ROLL.accentSize : 1), turn: (i % 2) * Math.PI / 2, beat: beat * 6, ...(shape === 'text' ? { text: ROLL.texts[Math.floor(w * ROLL.texts.length)] } : {}) };
  });
  return { finish, family, shape: main, accent, layout, reach, bit: sizes, ...motion, bits };
}

/** A recipe as dev mode and the effects menu show it, every number to 3 places: what's drawn is what's copied. */
export const recipeText = (recipe) => JSON.stringify(recipe, (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));

/** The effect seed `seed` rolls (rollRecipe), with `recipe`, its recipeText, to paste into EFFECTS through fromRecipe. */
export function rollEffect(seed) {
  const recipe = recipeText(rollRecipe(seed));
  return { ...fromRecipe(JSON.parse(recipe)), recipe };
}

/** An effect's look, with its EFFECT, in `g.userData.fx`; `kind` an EFFECTS name or an effect itself (as rollEffect's). */
function trickMesh(kind, built) {
  const g = new THREE.Group(), effect = typeof kind === 'string' ? EFFECTS[kind] : kind;
  effect.parts(g, trickPartsOnce(), built);
  // its own see-through copy of each material, to fade out on (the shared ones stay as they are)
  g.traverse((m) => {
    if (m.material) m.material = Object.assign(m.material.clone(), { transparent: true, userData: { opacity: m.material.opacity, color: m.material.color?.clone() } });
  });
  g.userData.fx = { ...EFFECT, ...effect };
  return g;
}

/** How faded a trick is, `k` (0-1) through its life: fully there, then fading out over its last quarter; and its colours
 * turned `hue` of the way round the wheel by its end. */
function fade(spin, fx, k) {
  const shown = Math.min(1, 4 * (1 - k));
  spin.traverse((m) => {
    if (!m.material) return;
    m.material.opacity = m.material.userData.opacity * shown;
    if (fx.hue) m.material.color.copy(m.material.userData.color).offsetHSL(fx.hue * k, 0, 0);
  });
}

/** A trick at the blade's tip, or at each glove. */
/** @param {string|{ parts: Function }} kind an EFFECTS name, or an effect itself (as rollEffect's) */
export function addTricks(built, kind) {
  removeTricks(built);
  if (kind === 'plain') return;
  // a glove's trick isn't on the glove: it leaves as the hit lands and flies on, so the fist going back doesn't take it
  // along. A blade's stays on its tip, through the swing and back (playtest: flying off, it never followed the swing)
  const spots = built.sword
    ? [{ parent: built.sword, at: [0, 0, built.sword.userData.tip], side: built.sword.userData.side }]
    : gloveAnchors(built).map((anchor, i) => ({ parent: built.root, at: [0, 0, 0], side: i ? 1 : -1, anchor }));
  built.tricks = spots.map(({ parent, at, side, anchor }) => {
    const spin = trickMesh(kind, built), g = new THREE.Group().add(spin);
    g.position.set(...at);
    g.userData = { side, spin, anchor, from: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), start: new THREE.Vector3() };
    g.visible = false;
    parent.add(g);
    return g;
  });
}

function removeTricks(built) {
  for (const g of built.tricks ?? []) {
    g.removeFromParent();
    g.traverse((m) => m.material?.dispose());
  }
  built.tricks = [];
}

const _q = new THREE.Quaternion(), _up = new THREE.Quaternion(), _now = new THREE.Vector3();
/** How far apart the scythe's music bits fly out past its point, in the trick's own size. */
const SPRAY_GAP = 0.09;

const _along = new THREE.Vector3(), _side = new THREE.Vector3(), _across = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** How far off its straight line a trick's path is, `t` (0-1) along it. */
const bend = (fx, t) => fx.arc * t * t + fx.amplitude * Math.sin(2 * Math.PI * fx.frequency * t);
/** How far along its flight a bit is, `t` (0-1) through it: steady, or with `ease` shooting out and slowing to a stop. */
const go = (fx, t) => t + fx.ease * (1 - (1 - t) ** 3 - t);
/** A glove's trick, `k` (0-1) through its life: along the force from where it left (and off it, by `bend`), spreading out
 * along it and across it, twisting round it; with `stream` its bits leave one after another, each along the same path. */
function fly(g, spin, fx, k) {
  const { from, dir } = g.userData, bits = spin.children.filter((m) => m.userData.base), size = Math.max(g.scale.x, 1e-3), at = go(fx, k);
  // across the force, as the side-on camera sees it: up for a punch forward
  _side.set(0, dir.z, -dir.y).normalize();
  g.position.copy(from).addScaledVector(dir, fx.drift * at).addScaledVector(_side, bend(fx, at));
  _along.copy(dir).applyAxisAngle(UP, -spin.rotation.y);
  _across.copy(_side).applyAxisAngle(UP, -spin.rotation.y);
  bits.forEach((m, i) => {
    // the last bit leaves STREAM_WAIT of the way through, and each makes its whole flight in the time it has left
    const wait = fx.stream * STREAM_WAIT * (bits.length > 1 ? i / (bits.length - 1) : 0), own = go(fx, Math.min(1, Math.max(0, (k - wait) / (1 - wait))));
    const along = m.userData.base.dot(_along);
    m.position.copy(m.userData.base).addScaledVector(_along, -along).multiplyScalar(1 + (fx.spreadAcross - 1) * own)
      .applyAxisAngle(_along, 2 * Math.PI * fx.twist * own)
      .addScaledVector(_along, along * (1 + (fx.spreadAlong - 1) * own) + (fx.drift * (own - at)) / size)
      .addScaledVector(_across, (bend(fx, own) - bend(fx, at)) / size);
  });
}

const _p = new THREE.Vector3();
/** A bit on a blade's tip, spreading round it (playtest: kept to their gaps there, a roll's bits looked all bunched up). */
const ride = (m, fx, k) => m.position.copy(m.userData.base).multiplyScalar(1 + (fx.spreadAcross - 1) * go(fx, k));
/** Where a bit of `spin` is, in its fighter's own space. */
const inRoot = (built, spin, at, out) => built.root.worldToLocal(spin.localToWorld(out.copy(at)));
/** How far the tip must have gone to count as a swing: held out at the end of a stab it sways a little, and that way
 * isn't a swing's (playtest: it sent a stab's bits up into the air). */
const SWUNG = 0.1;
/** The tip while the blade swings: the way the swing is taking it, from where the swing began as the side-on camera sees
 * it (the tip's, not a bit's: a bit spreading or rising on it would count its own way). */
function follow(built, spin) {
  const d = spin.userData, now = built.root.worldToLocal(spin.parent.localToWorld(_p.set(0, 0, 0)));
  (d.start ??= now.clone());
  now.sub(d.start).setX(0);
  if (now.length() > SWUNG) (d.going ??= new THREE.Vector3()).copy(now).normalize();
}

/** A bit leaving the tip, `k` through: where it is on the tip, going on the way the swing took it. */
function letGo(built, spin, m, fx, k) {
  const d = m.userData;
  d.left = inRoot(built, spin, ride(m, fx, k), d.left ?? new THREE.Vector3());
  d.going = (d.going ?? new THREE.Vector3()).copy(spin.userData.going ?? _p.set(0, 0, 0));
  Object.assign(d, { leftAt: k, gone: true });
}

/**
 * A blade's trick with `stream`, `k` (0-1) through its life: each bit rides the tip until its turn, then stays where the tip left it and goes on `drift` the way the tip was going, spreading, so the
 * bits lay the swing's arc out (playtest: flying off in a line, a stream never followed the swing). Any still on the tip
 * when the swing ends leave then (playtest: riding the blade back up, they were thrown up into the air).
 */
function trail(built, spin, fx, k) {
  const bits = spin.children.filter((m) => m.userData.base);
  spin.updateWorldMatrix(true, false);
  if (built.trickOn) follow(built, spin);
  bits.forEach((m, i) => {
    // at `stream` 1 the last bit leaves STREAM_WAIT of the way through; less, and they all go later, so that near 0 they
    // stay on the tip like a stream of 0 (playtest: a tiny stream let them all go at once, in a clump where the swing began)
    const d = m.userData, leave = 1 - fx.stream * (1 - (STREAM_WAIT * (i + 1)) / bits.length);
    if (!d.gone && k < leave && built.trickOn) {
      ride(m, fx, k);
      return;
    }
    if (!d.gone) letGo(built, spin, m, fx, k);
    const own = go(fx, Math.max(0, (k - d.leftAt) / (1 - d.leftAt)));
    spin.worldToLocal(built.root.localToWorld(_p.copy(d.left).addScaledVector(d.going, fx.drift * own)));
    m.position.copy(_p).addScaledVector(d.base, (fx.spreadAcross - 1) * own);
  });
}

/** A new swing: every bit of trick `g` back on the tip. */
function restartTrail(g) {
  Object.assign(g.userData.spin.userData, { start: null, going: null });
  for (const m of g.userData.spin.children) m.userData.gone = false;
}

/** A blade's trick: a trail with `stream`, or a recipe's bits spreading round the tip. */
function onTip(built, spin, fx, k) {
  if (fx.stream > 0) trail(built, spin, fx, k);
  else if (fx.spreads) for (const m of spin.children) if (m.userData.base) ride(m, fx, k);
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _back = new THREE.Quaternion();
/** A streak, pointed the way it moved in the world since last time (it and its whole trick both move). */
function aimStreak(m) {
  const d = m.userData;
  m.getWorldPosition(_w);
  _v.subVectors(_w, (d.prev ??= _w.clone()));
  d.prev.copy(_w);
  if (_v.lengthSq() > 1e-12) m.quaternion.setFromUnitVectors(UP, _v.applyQuaternion(m.parent.getWorldQuaternion(_back).invert()).normalize());
}

/** Each flicking bit stretches and squashes on its own beat, growing (or shrinking) `grow` of its size by the end; a
 * streak points the way it's going. */
function flicker(spin, fx, t) {
  const swell = (r) => r * Math.max(0, 1 + fx.grow * (t / fx.life));
  for (const m of spin.children) {
    const { flick: beat, r } = m.userData;
    if (beat !== undefined) m.scale.set(swell(r), swell(r) * (1 + fx.flicker * Math.sin(t * fx.turn * 3 + beat)), swell(r));
    if (m.userData.streak) aimStreak(m);
  }
}

/** A trick's look to fly as its shot (REUSE-SPEC.md §Trick shots), from `built`, the thrower. */
export function shotTrick(kind, built) {
  const g = new THREE.Group();
  g.add(trickMesh(kind, built));
  return g;
}

/**
 * A shot's trick at `at`, flying along `dir`, `done` (0-1) of the way through its flight, `t` seconds in: its whole
 * look from the fist (spreading, twisting, growing, turning colour, flickering) played over the flight, so it flares
 * as it arrives, but at the shot rather than drifting off on its own, and never fading (playtest: smaller and flat).
 */
export function poseShotTrick(g, at, dir, done, t) {
  const spin = g.children[0], { fx } = spin.userData, k = 0.75 * done;
  g.scale.setScalar(fx.size);
  g.userData.from = at;
  g.userData.dir = dir;
  fade(spin, fx, k);
  spin.rotation.y = t * fx.turn;
  fly(g, spin, fx, k);
  g.position.copy(at);
  flicker(spin, fx, k * fx.life);
}

/** Shows only `side`'s trick (none for null), `t` seconds after its hit, upright, moving as its EFFECT says: the chooser's
 * show-off, `t` seconds after its jab would land, as in a fight. */
export function showOffTrick(built, side, t) {
  for (const g of built.tricks ?? []) {
    const { spin, anchor } = g.userData, { fx } = spin.userData, k = t / fx.life;
    g.visible = g.userData.side === side && t >= 0 && k < 1;
    if (!g.visible) continue;
    g.quaternion.copy(g.parent.getWorldQuaternion(_q).invert().multiply(built.root.getWorldQuaternion(_up)));
    g.scale.setScalar(fx.size);
    fade(spin, fx, k);
    spin.rotation.y = t * fx.turn;
    spin.position.y = anchor ? 0 : fx.rise * k;
    if (anchor) fly(g, spin, fx, k);
    else if (!spin.userData.spray) onTip(built, spin, fx, k);
    if (spin.userData.spray) spray(g, t * fx.turn);
    flicker(spin, fx, t);
  }
}

/**
 * On the fist until it lands, then off along the force: the way the fist went from the swoosh's start to the hit,
 * as the side-on camera sees it (across the body would fly at the camera) and never back behind the fighter.
 */
function aimTrick(built, g, first) {
  const now = gloveAt(built, g.userData.anchor, _now), { from, dir, start } = g.userData;
  if (first) start.copy(now);
  from.copy(now);
  dir.copy(now).sub(start).setX(0);
  dir.z = Math.max(dir.z, 0);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
  dir.normalize();
}

/** Where a glove is now, in its fighter's own space. */
function gloveAt(built, { parent, at }, out) {
  parent.updateWorldMatrix(true, false);
  return built.root.worldToLocal(parent.localToWorld(out.set(...at)));
}

const _out = new THREE.Vector3();
/**
 * The scythe's stars, hearts and notes fly out past the point, along the blade, each twinkling, so they
 * mark the swing like the sword's trick without covering the crescent (playtest: round the tip, they hid the scythe).
 */
function spray(g, turn) {
  const { spin } = g.userData;
  spin.rotation.y = 0;
  _out.set(0, 0, 1).applyQuaternion(_q.copy(g.quaternion).invert());
  spin.userData.spray.forEach((m, i) => {
    m.position.copy(_out).multiplyScalar(SPRAY_GAP * (i + 1.5));
    m.rotation.y = turn * (i % 2 ? 1 : -1);
  });
}

// REUSE-SPEC.md §Fighter chooser: the preview never hits anything, so its trick stays out to be seen
export const SHOW_OFF = EFFECT.life;

/** The hitting hand's trick pops off it as the swoosh starts, as big and as long as the chooser's show-off (playtest: shown
 * only through the swoosh, at a third of that size, it was all but invisible in a fight). */
export function stepTricks(built, punch, dt) {
  const on = Boolean(punch) && sample(SWORD_MOVES[punch.name], punch.step).swoosh > 0.015;
  const g = punch && built.tricks?.find((o) => o.userData.anchor && o.userData.side === punch.arm);
  if (g && on && punch.step <= STRIKE) aimTrick(built, g, !built.trickOn);
  if (on && !built.trickOn) Object.assign(built, { trickT: 0, trickSide: punch.arm }).tricks?.forEach(restartTrail);
  built.trickOn = on;
  built.trickT = (built.trickT ?? Infinity) + dt;
  showOffTrick(built, built.trickSide ?? null, built.trickT);
}

// REUSE-SPEC.md §Look, the 0.0.8 art pass: every fighter wears these; ?plain on the page turns them off, to compare
// readability in a match
const PLAIN = typeof location !== 'undefined' && new URLSearchParams(location.search).has('plain');
export const LOOKS = Object.freeze(Object.fromEntries(['lookAt', 'eyeGlint', 'painterly', 'shapedFaces'].map((k) => [k, !PLAIN])));
const HOLD = { gloves: addGloves, sword: addSword, scythe: addScythe, hammer: addHammer, [CANE]: addCane, [SAI]: addSai, [STAFF]: addStaff, [YARN_BALLS]: addYarn };

/** Same order as the shop's `dressedCharacter` (store/sim/cast.js): dress unmerged, then merge. @param {Fighter} f */
/** @param {string[]} [palette] the colours a hero's sweater colourwork is worked in */
export function buildFighter(f, palette) {
  const built = createCharacter({ ...BASE_PARAMS, ...f.params, ...LOOKS, mergeMeshes: false }, f.species);
  built.root.updateMatrixWorld(true);
  built.root.userData.across = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3()).x;
  dress(built, outfitOf(f.look, palette));
  mergeCharacter(built);
  (HOLD[f.look.hands] ?? addGloves)(built, f.look.gloves);
  const tricks = TRICKS[f.look.hands] ?? TRICKS.gloves;
  addTricks(built, tricks.length === 1 ? tricks[0] : f.look.trick);
  return built;
}

export function disposeFighter(built) {
  removeTricks(built);
  removeGloves(built);
  removeSword(built);
  undress(built);
  disposeCharacter(built);
}

// REUSE-SPEC.md §Tier 3: no personalities, so one idle style for everyone. Fighters run at WALK_SPEED on short
// legs; the shop's stroll cap of 3.4 steps a second left their feet skating three quarters of every stride.
export const IDLE = Object.freeze({ ...MOTION_DEFAULTS, cadenceMax: 12 });

/** @param {keyof typeof POSES} [pose] */
export function animateFighter(built, dt, pose = 'rest') {
  const out = stepMotion(built, POSES[pose], dt, IDLE);
  swingSword(built, null, dt);
  return out;
}

/** Rest pose plus the walk layer at `speed`, the way characters/dress-up.js walks. */
// REUSE-SPEC.md §What the fighter needs: hits taken show as a fast wobble on the feet, growing to full by
// the percent a hit starts ringing a fighter out (measured: ~60% for punches, ~96% for kicks). No health bar.
const WOBBLE = { full: 80, tilt: 0.38, hz: [2, 4.5] };
const wobbleK = (percent) => Math.min(1, Math.max(0, percent) / WOBBLE.full);
/** Wobbles a second; add it up each frame (cycles += wobbleHz × dt) so a change in percent never jumps the phase. */
export const wobbleHz = (percent) => WOBBLE.hz[0] + (WOBBLE.hz[1] - WOBBLE.hz[0]) * wobbleK(percent);
/** A fighter's tilt in radians about world x (toward the camera) and z (sideways), `cycles` wobbles in. */
export function wobbleAt(percent, cycles) {
  const k = wobbleK(percent);
  if (k === 0) return { x: 0, z: 0 };
  const a = WOBBLE.tilt * Math.sqrt(k), w = 2 * Math.PI * cycles;
  return { x: 0.5 * a * Math.cos(w * 0.9), z: a * Math.sin(w) };
}

/** The hitting glove stretches along the arm as it flies and squashes on landing; gloves are in joint-side order. */
function squashGloves(built, punch) {
  const { stretch, size } = sample(GLOVE, punch?.step ?? 1);
  built.gloves.forEach((glove, i) => {
    const { r } = glove.userData, hits = punch && (i === 0) === (punch.arm < 0);
    if (hits) glove.scale.set(r * size * (1 - 0.3 * stretch), r * size * (1 + 0.6 * stretch), r * size * (1 - 0.3 * stretch));
    else glove.scale.setScalar(r);
  });
}

/** @param {import('./punches.js').Punch|import('./kicks.js').Kick|null} [strike] layered over the walk */
/** `built.spring` (a dance's stiff and zeta) stands in for the idle spring while a move plays a dance. */
const springOf = (built) => (built.spring ? { ...IDLE, stiff: built.spring.stiff, zeta: built.spring.zeta } : IDLE);

export function stepFighter(built, dt, pose, speed, strike = null) {
  const L = built.params.legHeight + built.params.hipInset;
  const at = built.walkAt ?? 0;
  const w = walkPhase(at, speed, L, IDLE);
  const gain = walkGain(built.motion, speed, dt, IDLE);
  built.walkAt = (at + phaseStep(speed * dt, speed, L, IDLE)) % 1;
  const kick = strike && 'leg' in strike ? strike : null;
  const punch = strike && 'arm' in strike ? { ...strike, arm: built.sword?.userData.side ?? strike.arm } : null;
  squashGloves(built, punch);
  built.root.position.z = kick ? kickLunge(built.params, kick) : 0;
  const out = stepMotion(built, pose, dt, springOf(built), (o) => {
    if (gain > 0) walkLayer(o, w, gain, IDLE);
    if (punch) punchLayer(o, punch, built.sword ? SWORD_MOVES : undefined);
    if (kick) kickLayer(o, kick);
  });
  swingSword(built, punch, dt);
  reachPole(built, punch ? punchWeight(punch.step) : 0);
  stepTricks(built, built.noTrick ? null : punch, dt);
  return out;
}

const posed = (p) => Object.freeze({ ...POSES.rest, ...p });

// Punches and kicks are timelines layered over the walk (punches.js, kicks.js).
export const MOVE_POSES = Object.freeze({
  hurt: posed({ armSwing: -0.5, armOut: 0.9, elbowBend: 1.2, spineBend: -0.2, headPitch: 0.25, kneeBend: 0.3 }),
  air: posed({ armOut: 0.9, elbowBend: 0.4, kneeBend: 0.9, hipFlex: 0.6 }),
  // REUSE-SPEC.md §Network gotchas: a guest who leaves the screen sits on the floor, legs out in front
  sit: posed({ ...POSES.sit, kneeBend: 0.15 }),
});

/** How far a fighter's root drops for its seat to rest on the floor in MOVE_POSES.sit. */
export function seatDrop(built) {
  applyPose(built, MOVE_POSES.sit);
  const drop = lowestResting(built) - built.root.position.y;
  applyPose(built, POSES.rest);
  return drop;
}

export const BAD_GUY_FUR = '#8f8f96';
// REUSE-SPEC.md §Bad guys, Play a bad guy: two sets, so two bad-guy players can be told apart
const BAD_GUY_LOOKS = Object.freeze([
  Object.freeze({ fur: BAD_GUY_FUR, hatColor: '#2a2030', capeColor: '#3b2152', bagColor: '#1d1a20', gloves: '#4b2a6b' }),
  Object.freeze({ fur: '#5f5f66', hatColor: '#4b2a6b', capeColor: '#1d1a20', bagColor: '#3b2152', gloves: '#2a2030' }),
]);

/** A fighter as every tablet draws it: one flagged `badGuy` in bad-guy set `set`, painted here, never sent. @param {Fighter} f @returns {Fighter} */
export function paint(f, set = 0) {
  if (!f.badGuy) return f;
  const { fur, ...colours } = BAD_GUY_LOOKS[set % BAD_GUY_LOOKS.length];
  return setFur({ ...f, params: { ...f.params }, look: { ...f.look, ...colours } }, fur);
}

/** Each bad-guy player's set, by sorted id. @param {[string, Fighter|undefined][]} seats @returns {Map<string, number>} */
export const badGuySets = (seats) => new Map(seats.filter(([, f]) => f?.badGuy).map(([id]) => id).sort().map((id, i) => [id, i]));

// REUSE-SPEC.md §Mode: how donuts look
export const HERO_DOUGH = '#e8c48e';
export const BAD_DONUT = Object.freeze({ dough: '#241a1d', frosting: '#7b2fbf', stripe: true });

/**
 * A built, unturned fighter as a match Entrant: as tall as its rest-pose bounding box, as wide as its body before it's
 * dressed (REUSE-SPEC.md §Costumes), and reaching to its glove anchors.
 * @param {Fighter} f @param {{ id: string, team: import('./match.js').Team, dummy?: boolean }} who
 * @returns {import('./match.js').Entrant}
 */
const part = new THREE.Box3();

/** The box around what shows: a hidden swoosh, speed line or trick never makes a fighter bigger (REUSE-SPEC.md §Costumes). */
export function visibleBox(root) {
  const box = new THREE.Box3();
  root.traverseVisible((o) => {
    if (!o.geometry) return;
    if (o.boundingBox !== undefined) o.computeBoundingBox();
    else if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(part.copy(o.boundingBox ?? o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

export function entrantOf(f, built, who) {
  const { id, team, dummy = false } = who;
  built.root.updateMatrixWorld(true);
  // REUSE-SPEC.md §Costumes: a held blade isn't body, so a Greathammer held high doesn't make its wielder tall
  if (built.sword) built.sword.visible = false;
  const size = visibleBox(built.root).getSize(new THREE.Vector3());
  if (built.sword) built.sword.visible = true;
  const chest = built.chest.getWorldPosition(new THREE.Vector3());
  const tip = ({ parent, at, r }) => parent.localToWorld(new THREE.Vector3(...at)).distanceTo(chest) + r;
  const look = team === 'heroes' ? { dough: HERO_DOUGH, frosting: f.params.bodyColor, stripe: false } : BAD_DONUT;
  return { id, team, height: size.y, width: built.root.userData.across, reach: Math.max(...gloveAnchors(built).map(tip)), look, hands: f.look.hands, trick: f.look.trick, ...(dummy && { dummy }) };
}
