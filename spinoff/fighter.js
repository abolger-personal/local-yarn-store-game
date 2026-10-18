import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, MOTION_DEFAULTS, NAMES, POSES, applyPose, createCharacter, deriveCoatColor, disposeCharacter, getSpecies, mergeCharacter,
  lowestResting, phaseStep, stepMotion, walkGain, walkLayer, walkPhase,
} from '../characters/npc.js';
import { deriveManeColor } from '../characters/lion.js';
import { CRAFTS, STITCHES_BY_CRAFT, defaultItem, dress, undress, usualTool } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import '../characters/llama.js';
import { wingShape } from '../characters/owl.js';
import { makeSparkle } from '../characters/sparkle.js';
import { GLOVE, SWORD_MOVES, SWORD_UP, punchLayer, punchWeight, sample } from './punches.js';
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
  gloves: Object.freeze(['plain', 'sparkle', 'bubble', 'flame']), sword: Object.freeze(['sparkle', 'bubble', 'flame']), scythe: Object.freeze(['music']),
  hammer: Object.freeze(['lightning']),
});
// REUSE-SPEC.md §Fighter chooser: the levels a player must have beaten for the chooser to offer each
const UNLOCK = Object.freeze({ sword: 1, scythe: 2, hammer: 4 });
/** The hands the chooser offers a player who has beaten `beaten` levels. */
export const handsFor = (beaten) => HANDS.filter((h) => (UNLOCK[h] ?? 0) <= beaten);
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
 * @typedef {{ species: string, params: Record<string, any>, look: Look }} Fighter
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
  return { species: raw.species, params: readParams(raw.species, raw.params), look: readLook(raw.look) };
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
const FLAMES = [['#ff5a1f', 0.075], ['#ff9a1a', 0.055], ['#ffd21a', 0.035]];
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
  const drop = mergeGeometries([new THREE.SphereGeometry(1, 12, 8), new THREE.ConeGeometry(1, 2.2, 12).translate(0, 1.1, 0)]);
  trickParts = {
    ball: new THREE.SphereGeometry(1, 14, 10),
    bubble: new THREE.MeshStandardMaterial({ color: '#c8f2ff', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
    drop,
    flames: FLAMES.map(([color]) => new THREE.MeshBasicMaterial({ color, toneMapped: false })),
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

/** The trick's look, about a glove across, centred on its origin. */
function trickMesh(kind, built) {
  const p = trickPartsOnce(), g = new THREE.Group();
  if (kind === 'sparkle') g.add(Object.assign(makeSparkle(built).mesh, { visible: true }));
  if (kind === 'bubble') {
    for (const [x, y, z, r] of BUBBLES) g.add(bit(p.ball, p.bubble, [x, y, z], r));
  }
  if (kind === 'flame') {
    FLAMES.forEach(([, r], i) => g.add(bit(p.drop, p.flames[i], [0.035 * i, -0.04 - 0.01 * i, 0.035 * i], r)));
  }
  if (kind === 'lightning') addBolts(g, p);
  if (kind === 'music') {
    g.add(Object.assign(makeSparkle(built).mesh, { visible: true }));
    g.userData.spray = MUSIC.map(([shape, , xyz, r], i) => g.add(bit(p.music[shape], p.paints[i], xyz, r)).children.at(-1));
  }
  return g;
}

/** A trick at the blade's tip, or at each glove; shared materials, so nothing to dispose. */
export function addTricks(built, kind) {
  removeTricks(built);
  if (kind === 'plain') return;
  const spots = built.sword
    ? [{ parent: built.sword, at: [0, 0, built.sword.userData.tip], side: built.sword.userData.side }]
    : gloveAnchors(built).map(({ parent, at }, i) => ({ parent, at, side: i ? 1 : -1 }));
  built.tricks = spots.map(({ parent, at, side }) => {
    const spin = trickMesh(kind, built), g = new THREE.Group().add(spin);
    g.position.set(...at);
    g.userData = { side, spin };
    g.visible = false;
    parent.add(g);
    return g;
  });
}

export function removeTricks(built) {
  for (const g of built.tricks ?? []) g.removeFromParent();
  built.tricks = [];
}

const _q = new THREE.Quaternion(), _up = new THREE.Quaternion();
/** How far apart the scythe's music bits fly out past its point, in the trick's own size. */
const SPRAY_GAP = 0.09;

/** Shows only `side`'s trick (none for null), upright, `size` times its own, turned and risen. */
function poseTricks(built, side, size, turn, rise) {
  for (const g of built.tricks ?? []) {
    g.visible = g.userData.side === side;
    if (!g.visible) continue;
    g.quaternion.copy(g.parent.getWorldQuaternion(_q).invert().multiply(built.root.getWorldQuaternion(_up)));
    g.scale.setScalar(size);
    g.userData.spin.rotation.y = turn;
    g.userData.spin.position.y = rise;
    if (g.userData.spin.userData.spray) spray(g, turn);
  }
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

/** The hitting hand's trick pops up, upright and turning, through the swoosh of the punch. */
export function stepTricks(built, punch) {
  const k = punch ? sample(SWORD_MOVES[punch.name], punch.step).swoosh / 0.75 : 0;
  poseTricks(built, k > 0.02 ? punch.arm : null, 0.3 + k, (punch?.step ?? 0) * 9, 0.12 * (punch?.step ?? 0));
}

// REUSE-SPEC.md §Fighter chooser: the preview never hits anything, so its trick stays out to be seen
export const SHOW_OFF = 1.2;
/** The chooser's trick, `t` seconds after its jab would land: big, floating up off the hand, gone after SHOW_OFF. */
export const showOffTrick = (built, side, t) =>
  poseTricks(built, t >= 0 && t < SHOW_OFF ? side : null, 1.4 * Math.min(1, 4 * (1 - t / SHOW_OFF)), t * 5, 0.35 * (t / SHOW_OFF));

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
  stepTricks(built, punch);
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
