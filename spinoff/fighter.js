import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BASE_PARAMS, DANCE_POSES, MOTION_DEFAULTS, NAMES, POSES, applyPose, createCharacter, deriveCoatColor, disposeCharacter, getSpecies, mergeCharacter,
  lowestResting, phaseStep, stepMotion, walkGain, walkLayer, walkPhase,
} from '../characters/npc.js';
import { deriveManeColor } from '../characters/lion.js';
import { CRAFTS, STITCHES_BY_CRAFT, defaultItem, dress, undress, usualTool } from '../characters/garments.js';
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
// REUSE-SPEC.md §Costumes: up to cable's weight; seed, puff and linen stitch cost 6–18× the triangles
export const TEXTURES = Object.freeze(['stockinette', 'rib', 'garter', 'cable', 'single crochet', 'waffle', 'lace']);

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
 * @typedef {{ hat: string|null, hatColor: string, hatStitch: string, cape: string|null, capeColor: string, capeStitch: string,
 *             bag: string, bagColor: string, gloves: string }} Look
 * @typedef {{ species: string, params: Record<string, any>, look: Look }} Fighter
 */

/** @returns {Look} */
export const defaultLook = () => ({
  hat: 'beanie', hatColor: '#8be02a', hatStitch: 'rib', cape: 'cape', capeColor: '#8a4dff', capeStitch: 'stockinette',
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
    hat: pickOf([...HATS, null], rng), hatColor: colour(), hatStitch: pickOf(TEXTURES, rng),
    cape: pickOf([...CAPES, null], rng), capeColor: colour(), capeStitch: pickOf(TEXTURES, rng),
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
    hat: choice('hat', HATS, true), hatColor: colour('hatColor'), hatStitch: choice('hatStitch', TEXTURES, false),
    cape: choice('cape', CAPES, true), capeColor: colour('capeColor'), capeStitch: choice('capeStitch', TEXTURES, false),
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

// REUSE-SPEC.md §Tier 3: no personalities, so one idle style for everyone
const IDLE = Object.freeze({ ...MOTION_DEFAULTS });

/** @param {keyof typeof POSES} [pose] */
export const animateFighter = (built, dt, pose = 'rest') => stepMotion(built, POSES[pose], dt, IDLE);

/** Rest pose plus the walk layer at `speed`, the way characters/dress-up.js walks. */
// REUSE-SPEC.md §What the fighter needs: hits taken show as a fast wobble on the feet, growing to full by
// the percent a hit starts ringing a fighter out (measured: ~60% for punches, ~96% for kicks). No health bar.
const WOBBLE = { full: 80, tilt: 0.38, hz: [2, 4.5] };
/** A fighter's tilt in radians about world x (toward the camera) and z (sideways), `t` seconds in. */
export function wobbleAt(percent, t, seed = 0) {
  const k = Math.min(1, Math.max(0, percent) / WOBBLE.full);
  if (k === 0) return { x: 0, z: 0 };
  const a = WOBBLE.tilt * Math.sqrt(k), w = 2 * Math.PI * (WOBBLE.hz[0] + (WOBBLE.hz[1] - WOBBLE.hz[0]) * k) * t + seed;
  return { x: 0.5 * a * Math.cos(w * 0.9), z: a * Math.sin(w) };
}

export function stepFighter(built, dt, pose, speed) {
  const L = built.params.legHeight + built.params.hipInset;
  const at = built.walkAt ?? 0;
  const w = walkPhase(at, speed, L, IDLE);
  const gain = walkGain(built.motion, speed, dt, IDLE);
  built.walkAt = (at + phaseStep(speed * dt, speed, L, IDLE)) % 1;
  return stepMotion(built, pose, dt, IDLE, gain > 0 ? (out) => walkLayer(out, w, gain, IDLE) : null);
}

const posed = (p) => Object.freeze({ ...POSES.rest, ...p });

const jab = (side) => posed({ armSwing: -0.75, armSwingAlt: -0.8 * side, armOut: 0.05, elbowBend: 0, spineTwist: 0.4 * side });

// REUSE-SPEC.md §Navigation: a punch is upper body only, so it layers over the walk. Keyed by facing,
// so the arm and leg nearer the camera do the hitting.
export const MOVE_POSES = Object.freeze({
  punch: Object.freeze({ 1: jab(1), [-1]: jab(-1) }),
  kick: Object.freeze({ 1: DANCE_POSES['rd-kick-r'], [-1]: DANCE_POSES['rd-kick-l'] }),
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

// REUSE-SPEC.md §Mode: how donuts look
export const HERO_DOUGH = '#e8c48e';
export const BAD_DONUT = Object.freeze({ dough: '#241a1d', frosting: '#7b2fbf', stripe: true });

/**
 * A built, unturned fighter as a match Entrant, measured from its rest-pose bounding box and glove anchors.
 * @param {Fighter} f @param {{ id: string, team: import('./match.js').Team, dummy?: boolean }} who
 * @returns {import('./match.js').Entrant}
 */
export function entrantOf(f, built, who) {
  const { id, team, dummy = false } = who;
  built.root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3());
  const chest = built.chest.getWorldPosition(new THREE.Vector3());
  const tip = ({ parent, at, r }) => parent.localToWorld(new THREE.Vector3(...at)).distanceTo(chest) + r;
  const look = team === 'heroes' ? { dough: HERO_DOUGH, frosting: f.params.bodyColor, stripe: false } : BAD_DONUT;
  return { id, team, height: size.y, width: size.z, reach: Math.max(...gloveAnchors(built).map(tip)), look, ...(dummy && { dummy }) };
}
