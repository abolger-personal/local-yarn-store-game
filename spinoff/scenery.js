// Each level's stage dressing and fort pieces (REUSE-SPEC.md §Forts: one treat theme per level).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIOT } from './fx.js';
import { STAGE } from './match.js';
import { BATTER, GINGER, box, brickMesh, damageBrick, damagePancake, mat, pancakeMesh, slabGeometry } from './treats.js';

const ICING = '#fff3f8';
const _v = new THREE.Vector3(), _goal = new THREE.Vector3();

// Level 2: cake and sprinkles (the first playtest stage, kept as it was)
/** Gingerbread with an icing top, or the gumdrop hill; raised floors are solid to the ground. */
function floorMesh(f, i) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, g = new THREE.Group();
  g.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
  if (f.y > 0 && f.z0 > STAGE.backWall) {
    g.add(new THREE.Mesh(slabGeometry(w, d, f.y, 0.7, 0.22), mat('#2fd17a', 0.3)));
    return g;
  }
  const base = i === 0 ? 0.7 : f.y;
  const body = new THREE.Mesh(slabGeometry(w, d, base, 0.12), mat(GINGER.heroes, 0.8));
  const top = new THREE.Mesh(slabGeometry(w + 0.08, d + 0.08, 0.08, 0.16, 0.03), mat(ICING, 0.45));
  body.position.y = f.y - base;
  top.position.y = f.y - 0.07;
  g.add(body, top);
  return g;
}

/** Instanced bits laid out with the R2 sequence, so they spread evenly without a random seed. */
function scatter(geometry, material, n, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, n), m = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    place(m, i, (i * 0.618034) % 1, (i * 0.7548776) % 1);
    m.updateMatrix();
    mesh.setMatrixAt(i, m.matrix);
    mesh.setColorAt(i, c.set(RIOT[i % RIOT.length]));
  }
  return mesh;
}

function groundTreats() {
  const [ground] = STAGE.floors, w = ground.x1 - ground.x0;
  const sprinkles = scatter(new THREE.CapsuleGeometry(0.03, 0.1, 2, 6), mat('#ffffff', 0.5), 110, (m, i, u, v) => {
    m.position.set(ground.x0 + 0.2 + u * (w - 0.4), 0.025, ground.z0 + 0.2 + v * (ground.z1 - ground.z0 - 0.4));
    m.rotation.set(Math.PI / 2, 0, i * 2.4);
  });
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), mat(ICING, 0.45), Math.floor(w / 0.3));
  for (let i = 0; i < drips.count; i++) {
    _goal.set(ground.x0 + 0.15 + i * 0.3, -0.06, ground.z1 + 0.02);
    drips.setMatrixAt(i, new THREE.Matrix4().compose(_goal, new THREE.Quaternion(), _v.set(1, i % 3 ? 1.3 : 2, 0.7)));
  }
  return [sprinkles, drips];
}

function cakeBackdrop() {
  const wall = box(26, 7, 0.4, '#f7bcd6');
  wall.position.set(0, 2.8, STAGE.backWall - 0.2);
  const skirting = box(26, 0.5, 0.2, GINGER.heroes);
  skirting.position.set(0, 0.25, STAGE.backWall - 0.05);
  return [wall, skirting];
}

// Level 1: breakfast
const WAFFLE = { cell: 0.5, ridge: 0.09, deep: 0.07, dough: '#e2a24e', pocket: '#a8651f' };
const SYRUP = new THREE.MeshStandardMaterial({ color: '#c0560c', roughness: 0.08, transparent: true, opacity: 0.6, depthWrite: false });
const HILL = { cakes: 4, nudge: [[0, 0], [0.05, -0.03], [-0.04, 0.03], [0.02, 0.02]], browned: '#c47a2c', butter: '#ffe680' };

/** A waffle slab w × d, its ridges topping out at y, solid down `base`. */
function waffle(w, d, y, base) {
  const { cell, ridge, deep } = WAFFLE, g = new THREE.Group(), nx = Math.round(w / cell), nz = Math.round(d / cell);
  const body = new THREE.Mesh(slabGeometry(w, d, base - deep, 0.04), mat(WAFFLE.dough, 0.75));
  const pockets = new THREE.Mesh(new THREE.PlaneGeometry(w - ridge, d - ridge).rotateX(-Math.PI / 2), mat(WAFFLE.pocket, 0.85));
  const ridges = new THREE.Mesh(mergeGeometries([
    ...Array.from({ length: nx + 1 }, (_, i) => new THREE.BoxGeometry(ridge, deep, d).translate(-w / 2 + (i * w) / nx, 0, 0)),
    ...Array.from({ length: nz + 1 }, (_, i) => new THREE.BoxGeometry(w, deep, ridge).translate(0, 0, -d / 2 + (i * d) / nz)),
  ]), mat(WAFFLE.dough, 0.75));
  body.position.y = y - base;
  pockets.position.y = y - deep + 0.002;
  ridges.position.y = y - deep / 2;
  g.add(body, pockets, ridges);
  return g;
}

/** A wobbly round puddle shape, radius about r. */
function puddle(r, k) {
  const pts = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2, rr = r * (1 + 0.18 * Math.sin(3 * a + k) + 0.08 * Math.sin(5 * a + 2 * k));
    return new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr);
  });
  return new THREE.Shape(pts);
}

/** Syrup lying in the waffle pockets with the ridges poking through. */
function syrupPools() {
  return [[-4.2, 1, 0.7], [2.4, -1.3, 0.5], [-2.2, 1.4, 0.45], [6.9, 1.1, 0.6], [-7.6, 0.9, 0.5]].map(([x, z, r], i) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(puddle(r, i * 1.7)).rotateX(-Math.PI / 2), SYRUP);
    m.position.set(x, -WAFFLE.deep + 0.035, z);
    return m;
  });
}

/** Syrup drips hanging off the front edge of the stage. */
function syrupDrips() {
  const [ground] = STAGE.floors, w = ground.x1 - ground.x0;
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), SYRUP, Math.floor(w / 0.7));
  for (let i = 0; i < drips.count; i++) {
    _goal.set(ground.x0 + 0.4 + i * 0.7 + (i % 2) * 0.15, -0.08, ground.z1 + 0.02);
    drips.setMatrixAt(i, new THREE.Matrix4().compose(_goal, new THREE.Quaternion(), _v.set(1, i % 3 ? 1.6 : 2.6, 0.6)));
  }
  return drips;
}

/** The middle hill: a stack of big pancakes with butter and syrup on top. @param {import('./match.js').Floor} f */
function pancakeHill(f) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, g = new THREE.Group(), cake = f.y / HILL.cakes;
  HILL.nudge.forEach(([x, z], i) => {
    const m = new THREE.Mesh(slabGeometry(w - 0.06 * i, d - 0.06 * i, cake, 0.6, 0.06), mat(BATTER.heroes, 0.75));
    m.position.set(x, i * cake, z);
    g.add(m);
  });
  const top = new THREE.Mesh(slabGeometry(w - 0.3, d - 0.3, 0.012, 0.5, 0.004), mat(HILL.browned, 0.7));
  const syrup = new THREE.Mesh(new THREE.ShapeGeometry(puddle(0.75, 2)).rotateX(-Math.PI / 2), SYRUP);
  const butter = new THREE.Mesh(slabGeometry(0.34, 0.26, 0.08, 0.05, 0.03), mat(HILL.butter, 0.35));
  top.position.set(0.02, f.y - 0.008, 0.02);
  syrup.position.set(0.1, f.y + 0.012, 0);
  butter.position.set(-0.35, f.y, -0.2);
  butter.rotation.y = 0.4;
  g.add(top, syrup, butter);
  return g;
}

/** Waffles for the ground and decks, the pancake stack for the hill; raised floors are solid to the ground. */
function breakfastFloor(f, i) {
  const g = f.y > 0 && f.z0 > STAGE.backWall ? pancakeHill(f) : waffle(f.x1 - f.x0, f.z1 - f.z0, f.y, i === 0 ? 0.7 : f.y);
  g.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
  return g;
}

function breakfastBackdrop() {
  const wall = box(26, 7, 0.4, '#fff1c9');
  wall.position.set(0, 2.8, STAGE.backWall - 0.2);
  const skirting = box(26, 0.5, 0.2, WAFFLE.dough);
  skirting.position.set(0, 0.25, STAGE.backWall - 0.05);
  return [wall, skirting];
}

/**
 * @typedef {{ background: string, scenery: () => THREE.Object3D[], brick: (b: import('./match.js').BrickState) => any,
 *   damage: (m: any, b: import('./match.js').BrickState) => void }} Theme
 * @type {Record<number, Theme>}
 */
export const THEMES = {
  1: { background: '#fff6e0', scenery: () => [...STAGE.floors.map(breakfastFloor), ...syrupPools(), syrupDrips(), ...breakfastBackdrop()], brick: pancakeMesh, damage: damagePancake },
  2: { background: '#ffe3f0', scenery: () => [...STAGE.floors.map(floorMesh), ...groundTreats(), ...cakeBackdrop()], brick: brickMesh, damage: damageBrick },
};

/** ?level=2 shows a later level's look; anything else is Level 1. */
export const themeFor = (search) => THEMES[Number(new URLSearchParams(search).get('level'))] ?? THEMES[1];
