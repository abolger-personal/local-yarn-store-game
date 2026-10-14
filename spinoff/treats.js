// Donuts and gingerbread (REUSE-SPEC.md §Theme: treats, §Forts), one geometry and one material per kind, shared.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRICK } from './match.js';

/** @typedef {import('./match.js').DonutLook} DonutLook @typedef {import('./match.js').BrickState} BrickState */

const materials = new Map();
/** @returns {THREE.MeshStandardMaterial} */
export function mat(color, roughness = 0.7) {
  const key = `${color}/${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key);
}

export function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.absarc(x, -y, r, -Math.PI / 2, 0);
  s.absarc(x, y, r, 0, Math.PI / 2);
  s.absarc(-x, y, r, Math.PI / 2, Math.PI);
  s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5);
  return s;
}

/** A rounded, bevelled block w × d, h tall, bottom at y = 0. */
export function slabGeometry(w, d, h, r, bevel = Math.min(0.06, h / 3)) {
  const b = Math.min(bevel, w / 4, d / 4);
  const opts = { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6 };
  return new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, d - 2 * b, Math.max(0.01, r - b)), opts).rotateX(-Math.PI / 2).translate(0, b, 0);
}

const TUBE = 0.42, RING = 1 - TUBE;
const icingFront = (rho) => {
  const k = 1 - ((rho - RING) / (TUBE * 0.9)) ** 2;
  return k > 0 ? TUBE * 0.6 + TUBE * 0.5 * Math.sqrt(k) : 0.12;
};

// REUSE-SPEC.md §Mode: a squiggly zig-zag drizzle, never a straight bar
function drizzleGeometry() {
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = -0.95 + (1.9 * i) / 40, y = 0.4 * Math.sin((i / 40) * Math.PI * 5) * Math.sqrt(1 - x * x * 0.85) + 0.1 * x;
    return new THREE.Vector3(x, y, icingFront(Math.hypot(x, y)) + 0.06);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.09, 6);
}

const DONUT_GEO = {
  dough: new THREE.TorusGeometry(RING, TUBE, 12, 24),
  icing: new THREE.TorusGeometry(RING, TUBE * 0.9, 10, 24).scale(1, 1, 0.55).translate(0, 0, TUBE * 0.6),
  drizzle: drizzleGeometry(),
};

/** A unit donut, frosting toward +z, scaled to radius r. @param {DonutLook} look */
export function donutMesh(look, r = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(DONUT_GEO.dough, mat(look.dough)), new THREE.Mesh(DONUT_GEO.icing, mat(look.frosting, 0.45)));
  if (look.stripe) g.add(new THREE.Mesh(DONUT_GEO.drizzle, mat('#f1e4ff', 0.4)));
  g.scale.setScalar(r);
  return g;
}

export const sameLook = (a, b) => a === b || Boolean(a && b && a.dough === b.dough && a.frosting === b.frosting && a.stripe === b.stripe);

// REUSE-SPEC.md §Milestones 1: upright cookie panels, bevelled, a thick piped border, flooded icing, dots, cracks
const PANEL = { w: BRICK * 0.9, d: BRICK * 0.62, r: 0.07, bevel: 0.03 };
const FRONT = PANEL.d / 2;

function outlineTube(w, h, r, radius) {
  const pts = roundedRect(w, h, r).getSpacedPoints(64).slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y, FRONT + 0.004));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, radius, 6, true);
}

function crack(points) {
  const bars = points.slice(1).map(([x, y], i) => {
    const [x0, y0] = points[i], len = Math.hypot(x - x0, y - y0);
    return new THREE.BoxGeometry(len + 0.024, 0.026, 0.016).rotateZ(Math.atan2(y - y0, x - x0))
      .translate((x + x0) / 2, (y + y0) / 2, FRONT + 0.016);
  });
  return mergeGeometries(bars);
}

function brickGeometry() {
  const { w, d, r, bevel } = PANEL, inner = w - 2 * bevel;
  const panel = slabGeometry(w, w, d, r, bevel).rotateX(Math.PI / 2).translate(0, 0, -FRONT);
  const dots = [[-0.07, 0.06], [0.08, 0.05], [-0.05, -0.08], [0.07, -0.07]]
    .map(([x, y]) => new THREE.SphereGeometry(0.024, 8, 6).scale(1, 1, 0.6).translate(x, y, FRONT + 0.01));
  return {
    panel,
    piping: mergeGeometries([outlineTube(inner - 0.04, inner - 0.04, r - 0.04, 0.026), ...dots]),
    flood: new THREE.ShapeGeometry(roundedRect(inner - 0.03, inner - 0.03, r - 0.04)).translate(0, 0, FRONT + 0.003),
    cracks: [crack([[-0.15, 0.13], [-0.05, 0.05], [-0.09, -0.01], [0.02, -0.06]]), crack([[0.15, -0.14], [0.07, -0.04], [0.12, 0.03], [0.04, 0.12]])],
  };
}

let BRICK_GEO = null;
export const GINGER = Object.freeze({ heroes: '#c07a3e', badGuys: '#4a2a1a' });
export const PIPING = '#fffaf0';
const CRACK = '#1e0d05';

const hashOf = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);

/** A drawn brick, centred in its cell, with a small hand-built tilt from its id. @param {BrickState} b */
export function brickMesh(b) {
  BRICK_GEO ??= brickGeometry();
  const g = new THREE.Group(), tilt = new THREE.Group(), h = hashOf(b.id);
  const flood = new THREE.Mesh(BRICK_GEO.flood, mat(b.icing, 0.45));
  const cracks = BRICK_GEO.cracks.map((c) => new THREE.Mesh(c, mat(CRACK, 0.9)));
  tilt.add(new THREE.Mesh(BRICK_GEO.panel, mat(GINGER[b.team], 0.8)), new THREE.Mesh(BRICK_GEO.piping, mat(PIPING, 0.5)), flood, ...cracks);
  tilt.rotation.set(0, ((h % 5) - 2) * 0.04, (((h >> 3) % 7) - 3) * 0.025);
  g.add(tilt);
  return { g, tilt, flood, cracks, hits: -1, wobble: 0 };
}

/** Cracks and missing icing as hits drop; only when they change. @param {BrickState} b */
export function damageBrick(m, b) {
  if (m.hits === b.hits) return;
  const hurt = 1 - b.hits / b.maxHits;
  m.hits = b.hits;
  m.cracks[0].visible = hurt > 0;
  m.cracks[1].visible = hurt >= 0.5;
  m.flood.material = mat(`#${new THREE.Color(b.icing).lerp(new THREE.Color(GINGER[b.team]), hurt * 0.5).getHexString()}`, 0.45);
  m.flood.scale.set(1 - hurt * 0.3, 1 - hurt * 0.45, 1);
  m.flood.position.set(hurt * 0.04, -hurt * 0.05, 0);
}
