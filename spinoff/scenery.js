// Each stage's dressing and fort pieces (REUSE-SPEC.md §Forts, §Stages and difficulty are separate); levels.js says which layout wears which.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIOT } from './fx.js';
import { groundOf } from './match.js';
import { BATTER, GINGER, PIPING, box, brickMesh, damageBrick, damagePancake, mat, pancakeMesh, slabGeometry } from './treats.js';

const ICING = '#fff3f8', GUMDROP = '#00aa56', CAKE_WALL = '#f7bcd6', BREAKFAST_WALL = '#fff1c9';
const _v = new THREE.Vector3(), _goal = new THREE.Vector3();

// Cake and sprinkles (the first playtest stage, kept as it was)
/** Gingerbread with an icing top, or the gumdrop hill; raised floors are solid to the ground. @param {import('./match.js').Floor} f */
function floorMesh(f) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, g = new THREE.Group();
  g.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
  if (f.kind === 'hill') {
    g.add(new THREE.Mesh(slabGeometry(w, d, f.y, 0.7, 0.22), mat(GUMDROP, 0.3)));
    return g;
  }
  const base = f.kind === 'ground' ? 0.7 : f.y;
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

function groundTreats(ground) {
  const w = ground.x1 - ground.x0;
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

// REUSE-SPEC.md §Stages and difficulty are separate: a trampoline is always icing, never a mechanical thing: a flooded disc
// in a loud colour (plain cake icing is near-white) with a piped rim. userData.spring marks it for play.js to squash when used.
const PAD = { flood: '#14c4e0', rim: '#ff3b7f', thick: 0.05, pipe: 0.045 };
/** @param {readonly import('./match.js').Patch[]} springs */
function icingPads(springs) {
  return springs.map((p, i) => {
    const g = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, PAD.thick, 40), mat(PAD.flood, 0.35));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r - PAD.pipe, PAD.pipe, 8, 40).rotateX(Math.PI / 2), mat(PAD.rim, 0.4));
    disc.position.y = PAD.thick / 2;
    rim.position.y = PAD.thick;
    g.add(disc, rim);
    g.position.set(p.x, p.y ?? 0, p.z);
    g.userData = { spring: i, r: p.r };
    return g;
  });
}

function cakeBackdrop(backWall) {
  const wall = box(26, 7, 0.4, CAKE_WALL);
  wall.position.set(0, 2.8, backWall - 0.2);
  const skirting = box(26, 0.5, 0.2, GINGER.heroes);
  skirting.position.set(0, 0.25, backWall - 0.05);
  return [wall, skirting];
}

// Breakfast
const WAFFLE = { cell: 0.5, ridge: 0.09, deep: 0.07, dough: '#e2a24e', pocket: '#955300' };
const SYRUP = new THREE.MeshStandardMaterial({ color: '#5b2700', roughness: 0.08, transparent: true, opacity: 0.8, depthWrite: false });
const HILL = { cakes: 4, nudge: [[0.05, -0.03], [-0.04, 0.03], [0.02, 0.02], [0, 0]], browned: '#ab6306' };
// Butter: a pale, glossy, opaque slick with a pat in the middle, so it never reads as the dark see-through syrup
const BUTTER = { slick: new THREE.MeshStandardMaterial({ color: '#fff4b0', roughness: 0.08, metalness: 0.05 }), pat: '#ffe680' };

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
    const a = (i / 40) * Math.PI * 2, rr = r * (1 + 0.1 * Math.sin(3 * a + k) + 0.05 * Math.sin(5 * a + 2 * k));
    return new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr);
  });
  return new THREE.Shape(pts);
}

/** The stage's sticky syrup, lying in the waffle pockets with the ridges poking through. @param {readonly import('./match.js').Puddle[]} puddles */
function syrupPools(puddles) {
  return puddles.map(({ x, z, r }, i) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(puddle(r, i * 1.7)).rotateX(-Math.PI / 2), SYRUP);
    m.position.set(x, -WAFFLE.deep + 0.035, z);
    return m;
  });
}

/** The stage's slippery butter, melted into a slick over the floor with the pat on top. @param {readonly import('./match.js').Patch[]} butter */
function butterSlicks(butter) {
  return butter.map(({ x, z, r, y = 0 }, i) => {
    const g = new THREE.Group(), slick = new THREE.Mesh(new THREE.ShapeGeometry(puddle(r, i * 2.3 + 1)).rotateX(-Math.PI / 2), BUTTER.slick);
    const pat = new THREE.Mesh(slabGeometry(0.34, 0.26, 0.08, 0.05, 0.03), mat(BUTTER.pat, 0.3));
    slick.position.y = 0.008;
    pat.rotation.y = 0.4 + i;
    g.add(slick, pat);
    g.position.set(x, y, z);
    return g;
  });
}

/** Syrup drips hanging off the front edge of the stage. */
function syrupDrips(ground) {
  const w = ground.x1 - ground.x0;
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), SYRUP, Math.floor(w / 0.7));
  for (let i = 0; i < drips.count; i++) {
    _goal.set(ground.x0 + 0.4 + i * 0.7 + (i % 2) * 0.15, -0.08, ground.z1 + 0.02);
    drips.setMatrixAt(i, new THREE.Matrix4().compose(_goal, new THREE.Quaternion(), _v.set(1, i % 3 ? 1.6 : 2.6, 0.6)));
  }
  return drips;
}

/** The middle hill: big pancakes, the top one exactly the floor you stand on, the ones under it a little bigger; any butter on top is real (butterSlicks). @param {import('./match.js').Floor} f */
function pancakeHill(f) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, g = new THREE.Group(), cake = f.y / HILL.cakes;
  HILL.nudge.forEach(([x, z], i) => {
    const grow = 0.04 * (HILL.cakes - 1 - i), m = new THREE.Mesh(slabGeometry(w + grow, d + grow, cake, (f.round ?? 0) + grow / 2, 0.06), mat(BATTER.heroes, 0.75));
    m.position.set(x, i * cake, z);
    g.add(m);
  });
  const top = new THREE.Mesh(slabGeometry(w - 0.3, d - 0.3, 0.012, (f.round ?? 0) - 0.15, 0.004), mat(HILL.browned, 0.7));
  top.position.y = f.y - 0.008;
  g.add(top);
  return g;
}

const STACKED = { thick: 0.22, nudge: [[0, 0], [0.04, 0.02], [-0.03, -0.02], [0.03, -0.01], [-0.02, 0.02]] };

/** A deck: waffles stacked up to y, the top one exactly the floor you stand on, the ones under it nudged. @param {import('./match.js').Floor} f */
function waffleStack(f) {
  const g = new THREE.Group(), n = Math.round(f.y / STACKED.thick), t = f.y / n;
  for (let i = 0; i < n; i++) {
    const [x, z] = STACKED.nudge[(n - 1 - i) % STACKED.nudge.length];
    const w = waffle(f.x1 - f.x0, f.z1 - f.z0, (i + 1) * t, t - 0.01);
    w.position.set(x, 0, z);
    w.rotation.y = z * 0.4;
    g.add(w);
  }
  return g;
}

/** A waffle ground, waffle-stack decks and the pancake hill; raised floors are solid to the ground. */
/** @param {import('./match.js').Floor} f */
function breakfastFloor(f) {
  const make = { ground: (o) => waffle(o.x1 - o.x0, o.z1 - o.z0, o.y, 0.7), deck: waffleStack, hill: pancakeHill }[f.kind];
  const g = make(f);
  g.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
  return g;
}

function breakfastBackdrop(backWall) {
  const wall = box(26, 7, 0.4, BREAKFAST_WALL);
  wall.position.set(0, 2.8, backWall - 0.2);
  const skirting = box(26, 0.5, 0.2, WAFFLE.dough);
  skirting.position.set(0, 0.25, backWall - 0.05);
  return [wall, skirting];
}

export const SHELF_WOOD = Object.freeze({ back: '#9a5b2c', plank: '#7a4520' });

// What each surface shows from a distance, for the visibility rules (visibility.test.mjs, REUSE-SPEC.md §Stage visibility rules)
const hex = (m) => `#${m.color.getHexString()}`;
const RIDGES = 1 - ((WAFFLE.cell - WAFFLE.ridge) / WAFFLE.cell) ** 2;
const WAFFLE_TOP = [{ color: WAFFLE.dough, share: RIDGES }, { color: WAFFLE.pocket, share: 1 - RIDGES }];
const PAD_RIM = 1 - (1 - (2 * PAD.pipe) / 0.45) ** 2; // on a 0.45 pad

/** @typedef {import('./match.js').Stage} Stage */
/**
 * @typedef {{ color: string, share?: number, opacity?: number, over?: string }} Paint  share of the area; a see-through paint shows `over` through it
 * @typedef {{ ground: Paint[], deck: Paint[], hill: Paint[], side: Paint[], wall: string, syrup?: Paint[], butter?: Paint[], spring?: Paint[],
 *   brick: (team: import('./match.js').Team, icing: string) => Paint[] }} Surfaces
 */
const breakfast = (stage) => [...stage.floors.map(breakfastFloor), ...syrupPools(stage.puddles), ...butterSlicks(stage.butter ?? []),
  syrupDrips(groundOf(stage)), ...breakfastBackdrop(stage.backWall)];
const cake = (stage) => [...stage.floors.map(floorMesh), ...icingPads(stage.springs ?? []), ...groundTreats(groundOf(stage)), ...cakeBackdrop(stage.backWall)];

/**
 * @typedef {{ background: string, scenery: (stage: Stage) => THREE.Object3D[], brick: (b: import('./match.js').BrickState) => any,
 *   damage: (m: any, b: import('./match.js').BrickState) => void, surfaces: Surfaces }} Theme
 * @type {Record<import('./levels.js').Level['theme'], Theme>}
 */
export const THEMES = {
  breakfast: { background: '#fff6e0', scenery: breakfast, brick: pancakeMesh, damage: damagePancake, surfaces: {
    ground: WAFFLE_TOP, deck: WAFFLE_TOP, hill: [{ color: HILL.browned }],
    side: [{ color: WAFFLE.dough }], wall: BREAKFAST_WALL,
    syrup: [{ color: hex(SYRUP), opacity: SYRUP.opacity, over: WAFFLE.pocket }],
    butter: [{ color: hex(BUTTER.slick) }],
    brick: (team, icing) => [{ color: BATTER[team], share: 0.67 }, { color: icing, share: 0.33 }],
  } },
  cake: { background: '#ffe3f0', scenery: cake, brick: brickMesh, damage: damageBrick, surfaces: {
    ground: [{ color: ICING }], deck: [{ color: ICING }], hill: [{ color: GUMDROP }], wall: CAKE_WALL,
    side: [{ color: GINGER.heroes, share: 0.8 }, { color: ICING, share: 0.2 }],
    spring: [{ color: PAD.flood, share: 1 - PAD_RIM }, { color: PAD.rim, share: PAD_RIM }],
    brick: (team, icing) => [{ color: GINGER[team], share: 0.35 }, { color: icing, share: 0.55 }, { color: PIPING, share: 0.1 }],
  } },
};
