import { props } from '../core/state.js';
import * as THREE from 'three';
import { COUNTER, roomGroup } from './room.js';
import { applyDaylight, lamps } from './stage.js';
import { growPlant } from './plants.js';
import { mergeMeshes } from './wood.js';
import { mulberry32 } from '../core/util.js';

export const PROP_SLOTS = [
  { id: 'lamp-a', kind: 'floor-lamp', x: -4.55, z: 0.8 },
  { id: 'lamp-b', kind: 'floor-lamp', x: 4.55, z: 0.1 },
  // STORE-SCENE.md §Props: the seeds and the one potted corner
  { id: 'pot-a', kind: 'pot', x: -4.5, z: -3.3, seed: 3 },
  { id: 'pot-b', kind: 'pot', x: 1.5, z: -3.35, seed: 5 },
  { id: 'pot-c', kind: 'pot', x: 1.05, z: 3.3, seed: 4 },
];

export const propGroup = new THREE.Group();

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const soil = mat('#5a3e2e', { roughness: 1 });
const brass = mat('#9a7a4a', { metalness: 0.4, roughness: 0.5 });
const ceramic = mat('#e8dcc6', { roughness: 0.4 });
const shadeMat = mat('#f6e6c6', { emissive: '#ffc277', emissiveIntensity: 0.15, side: THREE.DoubleSide });

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
  return mergeMeshes(g);
}

function shadeWithLight(g, [rTop, rBottom, h], y, power = 0) {
  cyl(g, [rTop, rBottom, h], y, shadeMat, { open: true });
  let light = null;
  if (power > 0) {
    light = new THREE.PointLight('#ffbf73', 0, 3.2, 2);
    light.position.y = y + h * 0.4;
    g.add(light);
  }
  lamps.push({ light, shade: shadeMat, power });
  return { shape: 'cylinder', rTop, rBottom, h, y };
}

const FLOOR_BASE = { rTop: 0.085, rBottom: 0.1, h: 0.32, y: 0 };
const TABLE_BASE = { rTop: 0.06, rBottom: 0.07, h: 0.13, y: 0 };

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

const FOOT = { 'floor-lamp': 0.26 };

export function applyProp(p, x, z, yaw) {
  p.x = x; p.z = z; p.yaw = yaw;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = yaw;
}

function dressCounter() {
  const lamp = makeTableLamp();
  lamp.position.set(COUNTER.x - 0.52, COUNTER.h, COUNTER.z + 0.04);
  const pot = makePot(1, 0.55);
  pot.position.set(COUNTER.x + 0.5, COUNTER.h, COUNTER.z);
  roomGroup.add(lamp, pot);
}

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
  applyDaylight(0);
}
