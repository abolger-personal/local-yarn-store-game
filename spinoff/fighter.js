import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, MOTION_DEFAULTS, NAMES, POSES, applyPose, createCharacter, deriveCoatColor, disposeCharacter, getSpecies, knitMaterial, mergeCharacter,
  lowestResting, phaseStep, stepMotion, walkGain, walkLayer, walkPhase,
} from '../characters/npc.js';
import { deriveManeColor } from '../characters/lion.js';
import { CRAFTS, STITCHES_BY_CRAFT, defaultItem, dress, undress, usualTool } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import '../characters/llama.js';
import { wingShape } from '../characters/owl.js';
import { makeSparkle } from '../characters/sparkle.js';
import { GLOVE, STRIKE, SWORD_MOVES, SWORD_UP, punchLayer, punchWeight, sample } from './punches.js';
import { HAMMER } from './hammer.js';
import { kickLayer, kickLunge } from './kicks.js';

export const FIGHTER_KEY = 'lys.fighter.v1';
export const SPECIES = Object.freeze(['lion', 'llama', 'owl']);

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
const FIRST_FUR = Object.freeze({ lion: '#ef8907', llama: '#fd9bd9', owl: '#0fc8c5' });

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
});
// what flies off the hitting glove or the blade's tip as it lands; tapping the picked one goes to the next. The scythe's is fixed.
export const TRICKS = Object.freeze({
  gloves: Object.freeze(['plain', 'sparkle', 'bubble', 'flame', 'bebop']), sword: Object.freeze(['sparkle', 'bubble', 'flame', 'bebop']), scythe: Object.freeze(['music']),
  hammer: Object.freeze(['lightning']),
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
export const defaultLook = () => ({
  hat: 'beanie', hatColor: '#8be02a', hatStitch: 'rib', cape: 'cape', capeColor: '#8154ff', capeStitch: 'stockinette',
  bag: 'backpack', bagColor: '#ffd21a', gloves: '#ff3b7f', hands: 'gloves', trick: 'plain',
});

const coatOf = (species, fur) => (species === 'lion' ? deriveManeColor(fur) : deriveCoatColor(fur));

/** @param {Fighter} f @param {string} fur */
export function setFur(f, fur) {
  f.params.bodyColor = fur;
  f.params[getSpecies(f.species).coatColorKey] = coatOf(f.species, fur);
  return f;
}

/** @returns {Fighter} */
export function newFighter(species) {
  const f = { species, params: structuredClone(getSpecies(species).defaults), look: defaultLook() };
  return setFur(f, FIRST_FUR[species]);
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
  return setFur(f, pickOf(FUR, rng).hex);
}

function readParams(species, raw) {
  const { defaults } = getSpecies(species), out = structuredClone(defaults);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, d] of Object.entries(defaults)) {
    const v = raw[k];
    if (typeof d === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof d === 'boolean' && typeof v === 'boolean') out[k] = v;
    else if (typeof d === 'string' && HEX.test(d) && HEX.test(v)) out[k] = v;
  }
  if (NAMES.includes(raw.name)) out.name = raw.name;
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

/** @param {Look} look */
export const outfitOf = (look) => ({
  hat: wear('hat', look.hat, look.hatColor, look.hatStitch),
  shawl: wear('shawl', look.cape, look.capeColor, look.capeStitch),
  bag: wear('bag', look.bag, look.bagColor),
});

export const GLOVE_SIZE = 2.1;
let gloveGeo = null;

function gloveGeometry() {
  if (gloveGeo) return gloveGeo;
  const ball = new THREE.SphereGeometry(1, 20, 14).scale(1, 0.95, 1.1);
  const thumb = new THREE.SphereGeometry(0.42, 12, 8).translate(0, 0.15, 0.85);
  const cuff = new THREE.CylinderGeometry(0.64, 0.7, 0.6, 18).translate(0, 0.95, 0);
  gloveGeo = mergeGeometries([ball, thumb, cuff], false);
  return gloveGeo;
}

export const WING_TIP = 0.8;

const handGlove = (P) => P.limbThick * GLOVE_SIZE;

const onHands = (built) => built.holds.map((hold) => ({ parent: hold.parent, at: [0, 0, 0], r: handGlove(built.params) }));

// REUSE-SPEC.md §Costumes: the owl's hand is buried mid-wing, so its wing tips go into the gloves,
// each big enough to swallow its tip whatever the owl's wing size
function onWingTips(built) {
  const { pos, scale } = wingShape(built.params);
  const across = Math.sqrt(1 - WING_TIP ** 2);
  const r = 1.05 * Math.max(handGlove(built.params), scale[0] * across, (scale[2] * across) / 1.1, (scale[1] * (1 - WING_TIP)) / 0.95);
  return built.joints.upperArm.map(({ node, side }) => ({ parent: node, at: [side * pos[0], pos[1] - scale[1] * WING_TIP, 0], r }));
}

export const gloveAnchors = (built) => (built.species.id === 'owl' ? onWingTips(built) : onHands(built));

/** Boxing gloves on both hands, or both wing tips (REUSE-SPEC.md §Costumes). */
export function addGloves(built, color) {
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

export function removeGloves(built) {
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
export function addSword(built, color) {
  const geo = swordGeometry();
  return holdBlade(built, [new THREE.Mesh(geo.handle, candy(color)), new THREE.Mesh(geo.trim, candy(color === WHITE ? '#ff3b7f' : WHITE))], geo,
    { tip: SWORD.grip / 2 + 0.012 + SWORD.blade + SWORD.wide / 2 });
}

const CRESCENT = '#2f6bff';
/** The Music Scythe, held in both hands: a pole in `color`, a glowing blue crescent (REUSE-SPEC.md §Costumes). */
export function addScythe(built, color) {
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

/** The Greathammer, held like the sword (REUSE-SPEC.md §Costumes): `built.sword`, so it swings on SWORD_MOVES. */
export function addHammer(built, color) {
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
export function removeSword(built) {
  built.sword?.removeFromParent();
  for (const o of built.sword?.children ?? []) if (o instanceof THREE.Mesh) o.material.dispose();
  built.sword = null;
}

/** Holds the sword or scythe at SWORD_MOVES' world angle above forward, whatever the arm is doing: a fan behind a slash, a streak behind a stab. */
export function swingSword(built, punch) {
  const { sword } = built;
  if (!sword) return;
  let arm = 0;
  for (let n = sword.parent; n && n !== built.chest; n = n.parent) arm += n.rotation.x;
  const { up, swoosh, stab } = punch ? sample(SWORD_MOVES[punch.name], punch.step) : { up: SWORD_UP, swoosh: 0, stab: 0 };
  sword.rotation.x = -(up + arm);
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
  const m = new THREE.Mesh(geo, mat);
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
const blazeOf = (p) => (p.blaze ??= new THREE.ShapeGeometry(BLAZE.slice(1).reduce((sh, c) => sh.bezierCurveTo(...c), new THREE.Shape().moveTo(...BLAZE[0])), 12));

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
 * @typedef {{ life: number, size: number, turn: number, drift: number, spread: number, stream: number, stretch: number, rise: number, rides: boolean, flicker: number }} Motion
 * @type {Record<string, { parts: (g: THREE.Group, p: any, built: any) => void } & Partial<Motion>>}
 */
export const EFFECTS = Object.freeze({
  // found with dev mode's randomizer (2026-11-01): notes and bubbles, orange, yellow and green, spinning and spreading wide
  bebop: fromRecipe({ life: 1.698, size: 2.036, turn: 8.331, drift: 0.405, spread: 4.473, flicker: 0.241, bits: [
    { shape: 'note', colour: '#ff7a1a', at: [0.002, 0, 0.15], r: 0.048, turn: 0, beat: 0.287 },
    { shape: 'note', colour: '#ff7a1a', at: [-0.125, 0.14, 0.122], r: 0.051, turn: 1.571, beat: 0.82 },
    { shape: 'bubble', colour: '#8be02a', at: [-0.14, 0.121, -0.027], r: 0.049, turn: 0, beat: 0.799 },
    { shape: 'note', colour: '#ffd21a', at: [-0.067, 0.079, 0.066], r: 0.028, turn: 1.571, beat: 2.409 },
    { shape: 'bubble', colour: '#ffd21a', at: [0.086, -0.13, 0.138], r: 0.026, turn: 0, beat: 3.199 },
    { shape: 'note', colour: '#ffd21a', at: [-0.159, -0.001, -0.016], r: 0.03, turn: 1.571, beat: 4.802 },
    { shape: 'note', colour: '#ffd21a', at: [0.008, 0.126, -0.139], r: 0.04, turn: 0, beat: 3.143 },
    { shape: 'note', colour: '#ff7a1a', at: [-0.131, 0.026, 0.027], r: 0.035, turn: 1.571, beat: 0.051 },
    { shape: 'bubble', colour: '#ff7a1a', at: [0.001, 0.062, 0.128], r: 0.051, turn: 0, beat: 0.228 },
  ] }),
  sparkle: { parts: (g, _p, built) => g.add(sparkleOf(built)) },
  bubble: { parts: (g, p) => scatter(g, p.ball, p.bubble, BUBBLES) },
  flame: { parts: addFlame, flicker: 0.3 },
  // the scythe's stars, hearts and notes fly out past its point, along the blade (spray)
  music: { parts: (g, p, built) => {
    g.add(sparkleOf(built));
    g.userData.spray = MUSIC.map(([shape, , xyz, r], i) => g.add(bit(p.music[shape], p.paints[i], xyz, r)).children.at(-1));
  }, rides: true },
  lightning: { parts: addBolts, rides: true },
});

/**
 * How a trick moves, unless its EFFECTS entry says otherwise. Shown for `life` seconds from the hit, `size` times its own,
 * shrinking away over the last quarter, turning `turn` radians a second. Off a glove or a blade it leaves as the hit lands
 * and flies `drift` along the hit's force, its bits spreading to `spread` times their gaps (`stretch` times that along the
 * force: a jet), leaving together (`stream` 0: a blast) or one after another (1: a stream); one that `rides` stays on the
 * blade's head and floats `rise` up off it. `flicker`: how far a flicking bit stretches, as a share of its size.
 */
/** @type {Readonly<Motion>} */
export const EFFECT = Object.freeze({ life: 1.2, size: 1.4, turn: 5, drift: 0.7, spread: 3, stream: 0, stretch: 1, rise: 0.35, rides: false, flicker: 0 });
/** With `stream` 1, the last bit leaves this far through the effect's life. */
const STREAM_WAIT = 0.7;

// ponytail: a trial randomizer for new effects (the bad-guy dress-up rolls one when you tap your gloves or sword again); a seed
// that looks good is copied into EFFECTS by hand. What a roll draws from: its shapes, colours, how many bits how far out and
// how big, and each EFFECT setting between these bounds.
export const ROLL = Object.freeze({
  shapes: ['ball', 'bubble', 'star', 'heart', 'note', 'blaze', 'bolt'],
  // a roll's colours come from one family (playtest: mixed ones looked muddled); riot is the old anything-goes
  families: {
    sunset: ['#ff3b7f', '#ff7a1a', '#ffd21a'], sea: ['#2f6bff', '#5eccf6', '#ffffff'], berry: ['#cf4bfc', '#ff3b7f', '#fd9bd9'],
    lime: ['#8be02a', '#ffd21a', '#ffffff'], candle: ['#ffd21a', '#ffffff', '#ff7a1a'],
    riot: ['#ff3b7f', '#ffd21a', '#5eccf6', '#8be02a', '#ff7a1a', '#cf4bfc', '#ffffff', '#2f6bff'],
  },
  finishes: ['flat', 'glow', 'toon', 'glossy', 'knit'],
  count: [3, 10], reach: 0.16, bit: [0.02, 0.07],
  motion: { life: [0.8, 1.8], size: [0.9, 2.2], turn: [0, 10], drift: [0.3, 1.5], spread: [1, 5], stream: [0, 1], stretch: [1, 4], flicker: [0, 0.45] },
});

const TWO = THREE.DoubleSide;
/** What a bit's surface is made of, by finish: flat paper, a glow (flat, with a halo: see rolledBit), cartoon shading,
 * shiny candy, or yarn. Shared per finish and colour. */
const FINISH = {
  flat: (color) => new THREE.MeshBasicMaterial({ color, side: TWO, toneMapped: false }),
  glow: (color) => new THREE.MeshBasicMaterial({ color, side: TWO, toneMapped: false }),
  toon: (color) => new THREE.MeshToonMaterial({ color, side: TWO }),
  glossy: (color) => new THREE.MeshStandardMaterial({ color, side: TWO, roughness: 0.12, metalness: 0 }),
  knit: (color) => Object.assign(knitMaterial(color), { side: TWO }),
};

/** A soft dot, white in the middle fading to clear: a glow's halo, tinted per colour. */
function haloOf(p, color) {
  if (!p.haloMap) {
    const n = 32, px = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const d = Math.hypot((i % n) - n / 2 + 0.5, Math.floor(i / n) - n / 2 + 0.5) / (n / 2);
      px.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 2)], i * 4);
    }
    p.haloMap = Object.assign(new THREE.DataTexture(px, n, n), { needsUpdate: true });
  }
  return new THREE.SpriteMaterial({ map: p.haloMap, color, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
}

/** One bit of a rolled effect, in `colour` and `finish`, flicking on its own beat; flat shapes cross the camera every other
 * way. A bubble is always the glass bubble. */
function rolledBit(g, p, { shape, colour, at, r, turn, beat }, finish) {
  const mats = (p.finished ??= new Map()), key = `${finish} ${colour}`;
  if (!mats.has(key)) mats.set(key, (FINISH[finish] ?? FINISH.flat)(colour));
  const geo = { ball: p.ball, bubble: p.ball, star: p.music.star, heart: p.music.heart, note: p.music.note, blaze: blazeOf(p), bolt: p.bolt }[shape];
  const m = flick(bit(geo, shape === 'bubble' ? p.bubble : mats.get(key), at, r), beat);
  m.rotation.y = turn;
  if (finish === 'glow' && shape !== 'bubble') {
    if (!mats.has(`halo ${colour}`)) mats.set(`halo ${colour}`, haloOf(p, colour));
    const halo = new THREE.Sprite(mats.get(`halo ${colour}`));
    halo.scale.set(3.2, 3.2, 1);
    m.add(halo);
  }
  g.add(m);
}

/** @typedef {{ shape: string, colour: string, at: number[], r: number, turn: number, beat: number }} Bit
 * @typedef {Partial<Motion> & { bits: Bit[], finish?: string, family?: string }} Recipe */
/** An effect from a recipe: its motion, and its bits as rolledBit draws them (what dev mode shows, to paste into EFFECTS). @param {Recipe} recipe */
export function fromRecipe({ bits, finish = 'flat', family: _, ...motion }) {
  return { ...motion, parts: (g, p) => { for (const b of bits) rolledBit(g, p, b, finish); } };
}

/** The effect seed `seed` rolls from ROLL, the same every time; for gloves and the sword (the scythe and hammer keep theirs).
 * `recipe` is everything it rolled, rounded, to paste into EFFECTS through fromRecipe (a seed only lasts until ROLL changes). */
export function rollEffect(seed) {
  let n = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647), pick = (list) => list[Math.floor(rnd() * list.length)];
  const span = (/** @type {readonly number[]} */ [a, b]) => a + (b - a) * rnd(), off = () => (rnd() * 2 - 1) * ROLL.reach;
  const motion = Object.fromEntries(Object.entries(ROLL.motion).map(([k, range]) => [k, span(range)]));
  const family = pick(Object.keys(ROLL.families)), finish = pick(ROLL.finishes), colours = ROLL.families[family];
  const shapes = [pick(ROLL.shapes), pick(ROLL.shapes)];
  const bits = Array.from({ length: Math.round(span(ROLL.count)) }, (_, i) => ({ shape: pick(shapes), colour: pick(colours),
    at: [off(), off(), off()], r: span(ROLL.bit), turn: (i % 2) * Math.PI / 2, beat: rnd() * 6 }));
  // rounded first, so what's shown is exactly what's drawn
  const recipe = JSON.stringify({ finish, family, ...motion, bits }, (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  return { ...fromRecipe(JSON.parse(recipe)), recipe };
}

/** An effect's look, with its EFFECT, in `g.userData.fx`; `kind` an EFFECTS name or an effect itself (as rollEffect's). */
function trickMesh(kind, built) {
  const g = new THREE.Group(), effect = typeof kind === 'string' ? EFFECTS[kind] : kind;
  effect.parts(g, trickPartsOnce(), built);
  g.userData.fx = { ...EFFECT, ...effect };
  return g;
}

/** A trick at the blade's tip, or at each glove; shared materials, so nothing to dispose. */
/** @param {string|{ parts: Function, rides?: boolean }} kind an EFFECTS name, or an effect itself (as rollEffect's) */
export function addTricks(built, kind) {
  removeTricks(built);
  if (kind === 'plain') return;
  // a trick isn't on the glove or the blade: it leaves as the hit lands and flies on, so the fist or blade going back
  // doesn't take it along (playtest: riding the sword home it floated into the face), unless it `rides`
  const tip = built.sword && { parent: built.sword, at: [0, 0, built.sword.userData.tip], side: built.sword.userData.side };
  const spots = tip
    ? [(typeof kind === 'string' ? EFFECTS[kind] : kind).rides ? tip : { parent: built.root, at: [0, 0, 0], side: tip.side, anchor: tip }]
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

export function removeTricks(built) {
  for (const g of built.tricks ?? []) g.removeFromParent();
  built.tricks = [];
}

const _q = new THREE.Quaternion(), _up = new THREE.Quaternion(), _now = new THREE.Vector3();
/** How far apart the scythe's music bits fly out past its point, in the trick's own size. */
const SPRAY_GAP = 0.09;

const _along = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** A trick off a glove or a blade, `k` (0-1) through its life: along the force from where it left, spreading out; with
 * `stream` its bits leave one after another, and with `stretch` they spread further along the force than across it. */
function fly(g, spin, fx, k) {
  const { from, dir } = g.userData, bits = spin.children.filter((m) => m.userData.base), size = Math.max(g.scale.x, 1e-3);
  g.position.copy(from).addScaledVector(dir, fx.drift * k);
  _along.copy(dir).applyAxisAngle(UP, -spin.rotation.y);
  bits.forEach((m, i) => {
    // the last bit leaves STREAM_WAIT of the way through, and each makes its whole flight in the time it has left
    const wait = fx.stream * STREAM_WAIT * (bits.length > 1 ? i / (bits.length - 1) : 0), own = Math.min(1, Math.max(0, (k - wait) / (1 - wait)));
    const along = m.userData.base.dot(_along);
    m.position.copy(m.userData.base).addScaledVector(_along, along * (fx.stretch - 1)).multiplyScalar(1 + (fx.spread - 1) * own)
      .addScaledVector(_along, (fx.drift * (own - k)) / size);
  });
}

/** Each flicking bit stretches and squashes on its own beat. */
function flicker(spin, fx, t) {
  for (const m of spin.children) {
    const { flick: beat, r } = m.userData;
    if (beat !== undefined) m.scale.set(r, r * (1 + fx.flicker * Math.sin(t * fx.turn * 3 + beat)), r);
  }
}

/** Shows only `side`'s trick (none for null), `t` seconds after its hit, upright, moving as its EFFECT says. */
function poseTricks(built, side, t) {
  for (const g of built.tricks ?? []) {
    const { spin, anchor } = g.userData, { fx } = spin.userData, k = t / fx.life;
    g.visible = g.userData.side === side && t >= 0 && k < 1;
    if (!g.visible) continue;
    g.quaternion.copy(g.parent.getWorldQuaternion(_q).invert().multiply(built.root.getWorldQuaternion(_up)));
    g.scale.setScalar(fx.size * Math.min(1, 4 * (1 - k)));
    spin.rotation.y = t * fx.turn;
    spin.position.y = anchor ? 0 : fx.rise * k;
    if (anchor) fly(g, spin, fx, k);
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
/** The chooser's trick, `t` seconds after its jab would land, as in a fight. */
export const showOffTrick = (built, side, t) => poseTricks(built, side, t);

/** The hitting hand's trick pops off it as the swoosh starts, as big and as long as the chooser's show-off (playtest: shown
 * only through the swoosh, at a third of that size, it was all but invisible in a fight). */
export function stepTricks(built, punch, dt) {
  const on = Boolean(punch) && sample(SWORD_MOVES[punch.name], punch.step).swoosh > 0.015;
  const g = punch && built.tricks?.find((o) => o.userData.anchor && o.userData.side === punch.arm);
  if (g && on && punch.step <= STRIKE) aimTrick(built, g, !built.trickOn);
  if (on && !built.trickOn) Object.assign(built, { trickT: 0, trickSide: punch.arm });
  built.trickOn = on;
  built.trickT = (built.trickT ?? Infinity) + dt;
  showOffTrick(built, built.trickSide ?? null, built.trickT);
}

/** Same order as the shop's `dressedCharacter` (store/sim/cast.js): dress unmerged, then merge. @param {Fighter} f */
export function buildFighter(f) {
  const built = createCharacter({ ...BASE_PARAMS, ...f.params, mergeMeshes: false }, f.species);
  built.root.updateMatrixWorld(true);
  built.root.userData.across = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3()).x;
  dress(built, outfitOf(f.look));
  mergeCharacter(built);
  if (f.look.hands === 'sword') addSword(built, f.look.gloves);
  else if (f.look.hands === 'scythe') addScythe(built, f.look.gloves);
  else if (f.look.hands === 'hammer') addHammer(built, f.look.gloves);
  else addGloves(built, f.look.gloves);
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
  swingSword(built, null);
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
export function squashGloves(built, punch) {
  const { stretch, size } = sample(GLOVE, punch?.step ?? 1);
  built.gloves.forEach((glove, i) => {
    const { r } = glove.userData, hits = punch && (i === 0) === (punch.arm < 0);
    if (hits) glove.scale.set(r * size * (1 - 0.3 * stretch), r * size * (1 + 0.6 * stretch), r * size * (1 - 0.3 * stretch));
    else glove.scale.setScalar(r);
  });
}

/** @param {import('./punches.js').Punch|import('./kicks.js').Kick|null} [strike] layered over the walk */
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
  const out = stepMotion(built, pose, dt, IDLE, (o) => {
    if (gain > 0) walkLayer(o, w, gain, IDLE);
    if (punch) punchLayer(o, punch, built.sword ? SWORD_MOVES : undefined);
    if (kick) kickLayer(o, kick);
  });
  swingSword(built, punch);
  reachPole(built, punch ? punchWeight(punch.step) : 0);
  stepTricks(built, punch, dt);
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
function visibleBox(root) {
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
  return { id, team, height: size.y, width: built.root.userData.across, reach: Math.max(...gloveAnchors(built).map(tip)), look, hands: f.look.hands, ...(dummy && { dummy }) };
}
