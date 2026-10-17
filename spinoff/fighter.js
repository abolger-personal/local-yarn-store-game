import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
import { GLOVE, SWORD_MOVES, SWORD_UP, punchLayer, sample } from './punches.js';
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
// REUSE-SPEC.md §Costumes: one or the other, in the `gloves` colour
export const HANDS = Object.freeze(['gloves', 'sword']);
// what flies off the hitting glove or the sword's tip as it lands; tapping the picked one goes to the next
export const TRICKS = Object.freeze({ gloves: Object.freeze(['plain', 'sparkle', 'bubble', 'flame']), sword: Object.freeze(['sparkle', 'bubble', 'flame']) });

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
const SWORD = { grip: 0.08, guard: 0.2, blade: 0.3, wide: 0.11, thick: 0.036, trail: 1.3 };
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
  const fan = new THREE.RingGeometry(at + 0.04, at + blade + wide / 2, 12, 1, Math.PI / 2, SWORD.trail).rotateX(Math.PI / 2);
  const line = (y, z0, z1, w) => new THREE.PlaneGeometry(z1 - z0, w).rotateY(-Math.PI / 2).translate(0, y, (z0 + z1) / 2);
  const streak = mergeGeometries([line(wide * 0.8, -0.3, at + blade * 0.5, 0.016), line(-wide * 0.8, -0.24, at + blade * 0.3, 0.016), line(0, -0.36, -0.08, 0.02)]);
  swordGeo = { handle, trim, fan, streak };
  return swordGeo;
}

/** A toy sword in the right hand (joint side -1), or the owl's right wing tip; no gloves (REUSE-SPEC.md §Costumes). */
export function addSword(built, color) {
  removeTricks(built);
  removeGloves(built);
  removeSword(built);
  const geo = swordGeometry(), { parent, at } = gloveAnchors(built)[0];
  const candy = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0 });
  const sword = new THREE.Group();
  sword.add(new THREE.Mesh(geo.handle, candy(color)), new THREE.Mesh(geo.trim, candy(color === WHITE ? '#ff3b7f' : WHITE)));
  for (const m of sword.children) m.castShadow = true;
  const swoosh = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(geo.fan, swoosh), streak = new THREE.Mesh(geo.streak, swoosh);
  sword.add(fan, streak);
  sword.position.set(...at);
  sword.userData = { side: -1, fan, streak, tip: SWORD.grip / 2 + 0.012 + SWORD.blade + SWORD.wide / 2 };
  parent.add(sword);
  built.sword = sword;
  swingSword(built, null);
  return sword;
}

export function removeSword(built) {
  built.sword?.removeFromParent();
  for (const o of built.sword?.children ?? []) if (o instanceof THREE.Mesh) o.material.dispose();
  built.sword = null;
}

/** Holds the blade at SWORD_MOVES' world angle above forward, whatever the arm is doing: a fan behind a slash, a streak behind a stab. */
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
let trickParts = null;

function trickPartsOnce() {
  if (trickParts) return trickParts;
  const drop = mergeGeometries([new THREE.SphereGeometry(1, 12, 8), new THREE.ConeGeometry(1, 2.2, 12).translate(0, 1.1, 0)]);
  trickParts = {
    ball: new THREE.SphereGeometry(1, 14, 10),
    bubble: new THREE.MeshStandardMaterial({ color: '#c8f2ff', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
    drop,
    flames: FLAMES.map(([color]) => new THREE.MeshBasicMaterial({ color, toneMapped: false })),
  };
  return trickParts;
}

const bit = (geo, mat, [x, y, z], r) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.setScalar(r);
  return m;
};

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
  return g;
}

/** A trick at the sword's tip, or at each glove; shared materials, so nothing to dispose. */
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

/** Shows only `side`'s trick (none for null), upright, `size` times its own, turned and risen. */
function poseTricks(built, side, size, turn, rise) {
  for (const g of built.tricks ?? []) {
    g.visible = g.userData.side === side;
    if (!g.visible) continue;
    g.quaternion.copy(g.parent.getWorldQuaternion(_q).invert().multiply(built.root.getWorldQuaternion(_up)));
    g.scale.setScalar(size);
    g.userData.spin.rotation.y = turn;
    g.userData.spin.position.y = rise;
  }
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
  else addGloves(built, f.look.gloves);
  addTricks(built, f.look.trick);
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
  const size = visibleBox(built.root).getSize(new THREE.Vector3());
  const chest = built.chest.getWorldPosition(new THREE.Vector3());
  const tip = ({ parent, at, r }) => parent.localToWorld(new THREE.Vector3(...at)).distanceTo(chest) + r;
  const look = team === 'heroes' ? { dough: HERO_DOUGH, frosting: f.params.bodyColor, stripe: false } : BAD_DONUT;
  return { id, team, height: size.y, width: built.root.userData.across, reach: Math.max(...gloveAnchors(built).map(tip)), look, ...(dummy && { dummy }) };
}
