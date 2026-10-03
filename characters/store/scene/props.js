// Plain furniture: flower pots and lamps.
//
// The shop is cosy by its light and its building; DECOR is what finished objects become. So these
// are deliberately bare — a terracotta pot, a round wooden table, a lamp with a plain drum shade —
// and each says where a knitted thing would go on it (`userData.cozy`): a cosy round the pot, a
// doily on the table top, a cover over the shade. Simple cylinders on purpose, because a cylinder
// is what a knitted tube fits.
//
// They are furniture the player arranges, with the same verb as the chairs (move mode, M). Unlike
// the displays and chairs they are built ONCE and kept across days: a pot the player put by the
// window should still be by the window tomorrow.

import { props } from '../core/state.js';
import * as THREE from 'three';
import { COUNTER, roomGroup } from './room.js';
import { applyDaylight, lamps } from './stage.js';
import { growPlant } from './plants.js';
import { mergeMeshes } from './wood.js';
import { mulberry32 } from '../core/util.js';

/** Authored spots, clear of every authored display, chair, window and the doorway. */
export const PROP_SLOTS = [
  { id: 'lamp-a', kind: 'floor-lamp', x: -4.55, z: 0.8 },    // the reading corner, by the chairs
  { id: 'lamp-b', kind: 'floor-lamp', x: 4.55, z: 0.1 },    // between shelf-e and the right window
  // A pot's seed is its plant (plants.js). Picked so the opening shop shows four different forms:
  // a snake plant, a bush, a trailing plant, and the cactus on the counter.
  //
  // Only ONE floor corner is potted. checkDisplayMoves drops a wall shelf at the ends of the walls
  // and a chair into the front-right corner, and a pot standing in a corner refuses both: with a
  // pot in every corner the shelf was legal at 5 of its 20 test spots and the chair nowhere.
  { id: 'pot-a', kind: 'pot', x: -4.5, z: -3.3, seed: 3 },
  { id: 'pot-b', kind: 'pot', x: 1.5, z: -3.35, seed: 5 },    // in the pier between two back windows
  { id: 'pot-c', kind: 'pot', x: 1.05, z: 3.3, seed: 4 },     // beside the door, clear of its swing
];

export const propGroup = new THREE.Group();

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const soil = mat('#5a3e2e', { roughness: 1 });
const brass = mat('#9a7a4a', { metalness: 0.4, roughness: 0.5 });
const ceramic = mat('#e8dcc6', { roughness: 0.4 });
// One shade material for every lamp: they all glow together, and the day sets how much.
const shadeMat = mat('#f6e6c6', { emissive: '#ffc277', emissiveIntensity: 0.15, side: THREE.DoubleSide });

/** A lathed part: a cylinder (tapered if `rTop` differs) standing on `y`. */
function cyl(parent, [rTop, rBottom, h], y, material, { open = false, shadow = true } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 28, 1, open), material);
  m.position.y = y + h / 2;
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const POT = { rTop: 0.12, rBottom: 0.09, h: 0.2 };

const RIM = POT.rTop + 0.012;

/**
 * A terracotta pot with a rolled rim and soil, and a plant grown from `seed` (see plants.js). The
 * seed also sets the pot's size and the exact clay, a little either way. `scale` overrides the
 * size, for a pot that has to fit somewhere particular.
 *
 * `userData.cozy` is in the pot's own frame, so a cosy hung on the group scales with it.
 */
function makePot(seed, scale) {
  const rng = mulberry32(seed * 7919 + 11);
  const clay = mat(new THREE.Color('#c4704f')
    .offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.08));
  const g = new THREE.Group();
  cyl(g, [POT.rTop, POT.rBottom, POT.h], 0, clay);
  cyl(g, [RIM, POT.rTop + 0.008, 0.035], POT.h - 0.035, clay);
  cyl(g, [POT.rTop - 0.008, POT.rTop - 0.008, 0.01], POT.h - 0.025, soil, { shadow: false });
  g.add(growPlant(seed, { top: POT.h - 0.015, rim: RIM }));
  const s = scale ?? 0.85 + rng() * 0.2;
  g.scale.setScalar(s);
  g.userData.foot = 2 * RIM * s + 0.02;
  g.userData.cozy = { pot: { shape: 'cylinder', ...POT, y: 0 } };
  return mergeMeshes(g);   // clay, soil and three greens: five draws, not fifteen
}

/**
 * A lamp's drum shade and, if `power` is set, the light in it, registered so the day can turn it up.
 *
 * Every point light is a cost on EVERY lit pixel in the shop — the felted customers included — so
 * only the floor lamps carry one. The counter lamp's shade glows (it is in `lamps` with no light)
 * but casts nothing; the floor lamp beside it does the lighting.
 */
function shadeWithLight(g, [rTop, rBottom, h], y, power = 0) {
  cyl(g, [rTop, rBottom, h], y, shadeMat, { open: true });
  let light = null;
  if (power > 0) {
    // Warm, short reach, no shadow map: a pool of light round the lamp.
    light = new THREE.PointLight('#ffbf73', 0, 3.2, 2);
    light.position.y = y + h * 0.4;
    g.add(light);
  }
  lamps.push({ light, shade: shadeMat, power });
  return { shape: 'cylinder', rTop, rBottom, h, y };
}

// Lamp bases are broad ceramic drums ON PURPOSE: a knitted lamp cosy is a tube, and a tube needs a
// fat plain cylinder to go round. A thin pole has nothing to dress.
const FLOOR_BASE = { rTop: 0.085, rBottom: 0.1, h: 0.32, y: 0 };
const TABLE_BASE = { rTop: 0.06, rBottom: 0.07, h: 0.13, y: 0 };

/** A standard lamp: a broad ceramic drum, a brass stem, a drum shade at a seated customer's head. */
function makeFloorLamp() {
  const g = new THREE.Group();
  cyl(g, [FLOOR_BASE.rTop, FLOOR_BASE.rBottom, FLOOR_BASE.h], 0, ceramic);
  cyl(g, [0.014, 0.014, 0.96 - FLOOR_BASE.h], FLOOR_BASE.h, brass);
  g.userData.cozy = {
    base: { shape: 'cylinder', ...FLOOR_BASE },
    shade: shadeWithLight(g, [0.1, 0.13, 0.2], 0.96, 2.2),
  };
  return g;
}

/** A table lamp: a fat ceramic base and a small drum shade. */
function makeTableLamp() {
  const g = new THREE.Group();
  cyl(g, [TABLE_BASE.rTop, TABLE_BASE.rBottom, TABLE_BASE.h], 0, ceramic);
  cyl(g, [0.008, 0.008, 0.035], TABLE_BASE.h, brass);
  g.userData.cozy = {
    base: { shape: 'cylinder', ...TABLE_BASE },
    shade: shadeWithLight(g, [0.065, 0.085, 0.1], TABLE_BASE.h + 0.03),
  };
  return g;
}

const BUILD = { 'pot': makePot, 'floor-lamp': makeFloorLamp };

/** Floor footprint per kind, for placement and for NPCs to walk round. */
const FOOT = { 'floor-lamp': 0.26 };   // a pot measures its own

/** Put a prop somewhere. Props are only scene: the sim reads the same record as an obstacle. */
export function applyProp(p, x, z, yaw) {
  p.x = x; p.z = z; p.yaw = yaw;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = yaw;
}

/** The lamp and the pot on the counter. Part of the counter, so not movable on their own. */
function dressCounter() {
  const lamp = makeTableLamp();
  lamp.position.set(COUNTER.x - 0.52, COUNTER.h, COUNTER.z + 0.04);
  const pot = makePot(1, 0.55);   // a cactus, and a seed no floor pot uses
  pot.position.set(COUNTER.x + 0.5, COUNTER.h, COUNTER.z);
  roomGroup.add(lamp, pot);
}

/** Everything this module does ONCE, at boot. Called from main.js, after the room shell. */
export function installProps() {
  roomGroup.add(propGroup);
  PROP_SLOTS.forEach((slot) => {
    const mesh = BUILD[slot.kind](slot.seed);
    const foot = mesh.userData.foot ?? FOOT[slot.kind];
    const p = { ...slot, yaw: 0, w: foot, d: foot, mesh, prop: true };
    mesh.userData.prop = p;
    propGroup.add(mesh);
    applyProp(p, slot.x, slot.z, 0);
    props.push(p);
  });
  dressCounter();
  applyDaylight(0);   // the lamps exist now, so set them to the opening hour
}
