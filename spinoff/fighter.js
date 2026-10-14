import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, MOTION_DEFAULTS, NAMES, POSES, createCharacter, deriveCoatColor, disposeCharacter, getSpecies, mergeCharacter,
  stepMotion,
} from '../characters/npc.js';
import { deriveManeColor } from '../characters/lion.js';
import { defaultItem, dress, undress, usualTool } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import '../characters/llama.js';
import { wingShape } from '../characters/owl.js';

export const FIGHTER_KEY = 'lys.fighter.v1';
export const SPECIES = Object.freeze(['lion', 'llama', 'owl']);

const swatches = (pairs) => Object.freeze(pairs.map(([hex, name]) => Object.freeze({ hex, name })));

// REUSE-SPEC.md §Look: when in doubt, colour riot. Fur is not natural colours.
const RIOT = [
  ['#ff3b7f', 'hot pink'], ['#ff7a1a', 'tangerine'], ['#ffd21a', 'lemon'], ['#8be02a', 'lime'],
  ['#1fd18b', 'jade'], ['#14c4e0', 'cyan'], ['#2f6bff', 'electric blue'], ['#8a4dff', 'violet'],
  ['#e83ad8', 'magenta'], ['#ff6f61', 'coral'], ['#6fc8ff', 'sky'], ['#ff9ad5', 'bubblegum'],
];

export const FUR = swatches(RIOT);
export const CLOTH = swatches([...RIOT, ['#ffffff', 'white']]);
const FIRST_FUR = Object.freeze({ lion: '#ff7a1a', llama: '#ff9ad5', owl: '#14c4e0' });

export const HATS = Object.freeze(['beanie', 'pixie', 'beret', 'bucket', 'earflap']);
export const CAPES = Object.freeze(['cape', 'capelet']);
export const BAGS = Object.freeze(['backpack', 'drawstring bag', 'crossbody pouch']);

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
const hexIn = (list, hex) => list.some((s) => s.hex === hex);

/**
 * @typedef {{ hat: string|null, hatColor: string, cape: string|null, capeColor: string,
 *             bag: string, bagColor: string, gloves: string }} Look
 * @typedef {{ species: string, params: Record<string, any>, look: Look }} Fighter
 */

/** @returns {Look} */
export const defaultLook = () => ({
  hat: 'beanie', hatColor: '#8be02a', cape: 'cape', capeColor: '#8a4dff',
  bag: 'backpack', bagColor: '#ffd21a', gloves: '#ff3b7f',
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
  const colour = () => pickOf(CLOTH, rng).hex;
  f.look = {
    hat: pickOf([...HATS, null], rng), hatColor: colour(), cape: pickOf([...CAPES, null], rng), capeColor: colour(),
    bag: pickOf(BAGS, rng), bagColor: colour(), gloves: colour(),
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
  const colour = (k) => (hexIn(CLOTH, r[k]) ? r[k] : base[k]);
  const choice = (k, list, none) => (list.includes(r[k]) || (none && r[k] === null) ? r[k] : base[k]);
  return {
    hat: choice('hat', HATS, true), hatColor: colour('hatColor'), cape: choice('cape', CAPES, true), capeColor: colour('capeColor'),
    bag: choice('bag', BAGS, false), bagColor: colour('bagColor'), gloves: colour('gloves'),
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

/** @param {Fighter} f */
export function saveFighter(f) {
  try { localStorage.setItem(FIGHTER_KEY, JSON.stringify(f)); } catch {}
}

function wear(type, silhouette, color) {
  const item = defaultItem(type);
  if (!silhouette) return { ...item, on: false };
  return { ...item, on: true, silhouette, color1: color, colorCount: 1, colourwork: 'solid', tool: usualTool(item.craft, item.weight) };
}

/** @param {Look} look */
export const outfitOf = (look) => ({
  hat: wear('hat', look.hat, look.hatColor),
  shawl: wear('shawl', look.cape, look.capeColor),
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
  removeGloves(built);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0 });
  built.gloves = gloveAnchors(built).map(({ parent, at, r }) => {
    const glove = new THREE.Mesh(gloveGeometry(), material);
    glove.scale.setScalar(r);
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

/** Same order as the shop's `dressedCharacter` (store/sim/cast.js): dress unmerged, then merge. @param {Fighter} f */
export function buildFighter(f) {
  const built = createCharacter({ ...BASE_PARAMS, ...f.params, mergeMeshes: false }, f.species);
  dress(built, outfitOf(f.look));
  mergeCharacter(built);
  addGloves(built, f.look.gloves);
  return built;
}

export function disposeFighter(built) {
  removeGloves(built);
  undress(built);
  disposeCharacter(built);
}

// ponytail: one idle style for everyone; per-fighter motionOf(traits) once fighters have personalities
const IDLE = Object.freeze({ ...MOTION_DEFAULTS });

/** @param {keyof typeof POSES} [pose] */
export const animateFighter = (built, dt, pose = 'rest') => stepMotion(built, POSES[pose], dt, IDLE);
