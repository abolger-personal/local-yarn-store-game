import * as THREE from 'three';
import { FT } from './pieces.js';

// REUSE-SPEC.md §Level 1, Building it, step 2: the generated level drawn in simple posts, decks, panels, tubes and
// bars in the playground's colours (§Level 1, What it looks like), the field far behind. Plain shapes, no ink yet.
/** @typedef {import('./generate.js').Level} Level */

const C = Object.freeze({
  post: '#2f3db8', rail: '#f0b648', deck: '#3a3a3a', panel: '#2f7a50', dome: '#9aa0a6', pole: '#f0d000',
  slide: '#2a7f6f', violet: '#6b55d9', rubber: '#7085b8', teal: '#5e9e8f', terracotta: '#c48a5e',
  turf: '#86b46c', line: '#f4f4ee', grass: '#9cc184', sky: '#5fa8e8', horizon: '#cfe5f5',
});
// a little texture (playtest 2026-11-10): the poured rubber's coloured crumbs, the panels' slots, the turf's mown
// stripes, as small canvases tinted by each material's colour
function canvasMap(size, draw) {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size }), g = c.getContext('2d');
  draw(g, size);
  const map = new THREE.CanvasTexture(c);
  Object.assign(map, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.SRGBColorSpace });
  return map;
}
/** The poured rubber's crumbs: specks of light and dark grey on near white. */
function crumbs(g, n) {
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `hsl(0 0% ${70 + ((i * 37) % 30)}%)`;
    g.fillRect((i * 53) % n, (i * 97 + (i >> 3)) % n, 2, 2);
  }
}
/** Stripes `w` of `n` wide, every `every`, on white: the panels' slots, the turf's mown rows. */
const stripes = (w, every, shade) => (g, n) => {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, n, n);
  g.fillStyle = shade;
  for (let x = 4; x < n; x += every) g.fillRect(x, 0, w, n);
};
let maps = null;
const textures = () => (maps ??= { crumb: canvasMap(128, crumbs), slots: canvasMap(64, stripes(4, 12, '#c8c8c8')), stripes: canvasMap(64, stripes(32, 64, '#e4e4e4')) });
const mats = new Map();
/** The material for `color`, with texture `tex` (a key of textures()) repeated `repeat` times, shared by colour. */
function mat(color, tex = '', repeat = 1) {
  const key = `${color} ${tex} ${repeat}`;
  if (mats.has(key)) return mats.get(key);
  const map = tex && typeof document !== 'undefined' ? textures()[tex].clone() : null;
  if (map) map.repeat.set(repeat, repeat);
  return mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, map })).get(key);
}
const POST = 0.06, SLAB = 0.06, RAIL = 0.45;

/** A box `w` by `h` by `d` with its bottom middle at (x, y, z). */
function block([w, h, d], color, [x, y, z], tex = '', repeat = 1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, tex, repeat));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** A rod from `a` to `b`, `r` thick. */
function rod(a, b, r, color) {
  const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 8), mat(color));
  m.position.copy(a).addScaledVector(v, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return m;
}

/**
 * A deck: its slab, a blue post at each corner, and the space under it, solid in play, closed in by yellow panels.
 * Where a structure turns, decks overlap at the same height (playtest 2026-11-10: they flickered), so the `i`th is
 * lifted and drawn in a hair from its neighbours, too little to see.
 */
function deck(f, i) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, g = new THREE.Group(), k = i % 4;
  const lift = k * 0.003, inset = POST + k * 0.008;
  g.add(block([w, SLAB, d], C.deck, [cx, f.y - SLAB + lift, cz]), block([w - inset, f.y - SLAB, d - inset], C.rail, [cx, 0, cz], 'slots', 2));
  for (const [x, z] of [[f.x0, f.z0], [f.x0, f.z1], [f.x1, f.z0], [f.x1, f.z1]]) g.add(block([POST, f.y + RAIL, POST], C.post, [x, 0, z]));
  return g;
}

/** A climb: the dome a grey half ball, the grid and the squiggle climber yellow rungs between blue posts. */
function climb(c) {
  const w = c.x1 - c.x0, d = c.z1 - c.z0, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  if (c.kind === 'dome') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.dome));
    m.scale.set(w, (c.y1 - c.y0) * 2, d);
    m.position.set(cx, c.y0, cz);
    return m;
  }
  const g = new THREE.Group(), rungs = Math.max(2, Math.round((c.y1 - c.y0) / (1.2 * FT)));
  for (const z of [c.z0, c.z1]) g.add(block([POST, c.y1 - c.y0, POST], C.post, [cx, c.y0, z]));
  for (let i = 1; i <= rungs; i++) g.add(rod(new THREE.Vector3(cx, c.y0 + (i * (c.y1 - c.y0)) / rungs, c.z0), new THREE.Vector3(cx, c.y0 + (i * (c.y1 - c.y0)) / rungs, c.z1), 0.025, C.rail));
  return g;
}

/** Stairs or a slide: a slab from one end to the other, `breadth` across; a pole: a yellow rod. */
function path(p) {
  const a = new THREE.Vector3(p.x0, p.y0, p.z0), b = new THREE.Vector3(p.x1, p.y1, p.z1);
  if (p.kind === 'pole') return rod(a, b, 0.03, C.pole);
  const v = new THREE.Vector3().subVectors(b, a), breadth = p.kind === 'stairs' ? 1.2 : 0.5;
  const m = new THREE.Mesh(new THREE.BoxGeometry(breadth, SLAB, v.length()), mat(p.kind === 'stairs' ? C.deck : C.slide));
  m.position.copy(a).addScaledVector(v, 0.5);
  m.lookAt(b);
  return m;
}

/** A swing's frame (an arch of blue posts and a beam) and its seat; a bar, yellow, on two posts. */
function swing(s) {
  const t = ((s.h + 90) * Math.PI) / 180, half = new THREE.Vector3(Math.cos(t), 0, Math.sin(t)).multiplyScalar(s.span / 2);
  const top = new THREE.Vector3(s.x, s.y, s.z), g = new THREE.Group(), ends = [top.clone().sub(half), top.clone().add(half)];
  const color = s.kind === 'bar' ? C.rail : C.post;
  g.add(rod(ends[0], ends[1], s.kind === 'bar' ? 0.025 : 0.04, color));
  for (const e of ends) g.add(rod(e, new THREE.Vector3(e.x, 0, e.z), 0.04, color));
  if (s.kind === 'swing') g.add(block([0.35, 0.04, 0.15], '#141414', [s.x, s.y - s.arm, s.z]), rod(top, new THREE.Vector3(s.x, s.y - s.arm, s.z), 0.008, '#555555'));
  return g;
}

/** The rubber floor under the band in big soft blobs of slate blue, teal and terracotta, and grass round it. */
function floor(ground) {
  const len = ground.x1 - ground.x0, g = new THREE.Group();
  g.add(block([len + 60, 0.01, 60], C.grass, [(ground.x0 + ground.x1) / 2, -0.02, 0], 'stripes', 20));
  g.add(block([len, 0.01, ground.z1 - ground.z0], C.rubber, [(ground.x0 + ground.x1) / 2, -0.01, 0], 'crumb', 12));
  for (let x = ground.x0 + 2, i = 0; x < ground.x1; x += 3.1, i++) {
    const blob = new THREE.Mesh(new THREE.CircleGeometry(1 + (i % 3) * 0.3, 24), mat([C.teal, C.terracotta][i % 2], 'crumb', 2));
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(x, 0.001, ((i * 1.7) % 3) - 1.5);
    g.add(blob);
  }
  return g;
}

/** Capuano Field far behind, barely seen: turf, its white lines, goals and light poles, faded toward the sky. */
function field(ground) {
  const g = new THREE.Group(), len = ground.x1 - ground.x0 + 60, cx = (ground.x0 + ground.x1) / 2, z = -14;
  const pale = (color) => `#${new THREE.Color(color).lerp(new THREE.Color(C.horizon), 0.45).getHexString()}`;
  g.add(block([len, 0.01, 18], pale(C.turf), [cx, -0.015, z - 7], 'stripes', 12));
  for (let x = ground.x0 - 20; x < ground.x1 + 20; x += 24) {
    g.add(block([0.08, 0.01, 18], pale(C.line), [x, -0.005, z - 7]), block([0.06, 6, 0.06], pale('#8a8f96'), [x + 12, 0, z - 1]));
    g.add(block([2.4, 0.8, 0.05], pale(C.line), [x + 4, 0, z - 4]));
  }
  return g;
}

/** Everything of level `L` to see, but the heroes. @param {Level} L */
export function playground(L) {
  const [ground, ...decks] = L.floors;
  return [floor(ground), field(ground), ...decks.map(deck), ...L.climbs.map(climb), ...[...L.stairs, ...L.rides].map(path), ...L.swings.map(swing)];
}

/** Outdoors (playtest 2026-11-10): a blue sky fading to a pale horizon behind the field, and sunlight and skylight on the
 *  playground, on top of the stage's own lights that keep the heroes well lit. */
export function outdoors(scene) {
  scene.background = canvasMap(4, (g, n) => {
    const sky = g.createLinearGradient(0, 0, 0, n);
    sky.addColorStop(0, C.sky);
    sky.addColorStop(1, C.horizon);
    g.fillStyle = sky;
    g.fillRect(0, 0, n, n);
  });
  const sun = new THREE.DirectionalLight('#fff4e0', 1.1);
  sun.position.set(-6, 12, 8);
  scene.add(new THREE.HemisphereLight('#cfe7ff', C.grass, 0.7), sun);
}
