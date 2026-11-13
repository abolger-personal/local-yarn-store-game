import * as THREE from 'three';
import { BRIDGE } from './equipment.js';
import { FT, POLE_OUT } from './pieces.js';

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
const IRON = '#1c1c1e', FENCE = 4 * FT;
/** Half the gap in the fence at the level's end: the gate. */
export const GATE = 0.7;

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

// what sways under a hero (decided 2026-11-12: the climbing grid, the bridge): each part's move for a swing of -1..1,
// and how hard it's going
const swayers = new Map();
const sways = (key, move, rate = 7) => swayers.set(key, { move, rate, amp: 0 });

/** The parts keyed by the level's own climbs and bridges in `active` sway at `s` seconds; the others settle. */
export function sway(active, s) {
  for (const [key, w] of swayers) {
    w.amp += ((active.has(key) ? 1 : 0) - w.amp) * 0.1;
    w.move(Math.sin(s * w.rate) * w.amp);
  }
}

// the climbing grid and the bridge: how far their middles droop; how broad the grid is
const SAG = 0.12, NET = 2.5 * FT;

/** The clatter bridge: planks sagging between its end posts, yellow rope rails each side.
 *  ponytail: open underneath to look at, but solid to the ground in play, as every floor is (spinoff/sim.js). */
function bridge(b) {
  const [len, w] = b.h === 0 ? [b.x1 - b.x0, b.z1 - b.z0] : [b.z1 - b.z0, b.x1 - b.x0], g = new THREE.Group(), hang = new THREE.Group();
  const at = (k, y, z) => new THREE.Vector3(len * (k - 0.5), y - (SAG / 2) * Math.sin(Math.PI * k), z);
  for (let i = 0; i < 8; i++) {
    const m = at((i + 0.5) / 8, -0.04, 0);
    hang.add(block([len / 8 - 0.02, 0.04, w], C.deck, [m.x, m.y, 0]));
    for (const z of [-w / 2, w / 2]) for (const y of [0.22, 0.45]) hang.add(rod(at(i / 8, y, z), at((i + 1) / 8, y, z), 0.015, C.rail));
  }
  for (const x of [-len / 2, len / 2]) for (const z of [-w / 2, w / 2]) g.add(block([POST, b.y + RAIL, POST], C.post, [x, -b.y, z]));
  g.position.set((b.x0 + b.x1) / 2, b.y, (b.z0 + b.z1) / 2);
  g.rotation.y = (-b.h * Math.PI) / 180;
  sways(b, (v) => { hang.rotation.x = v * BRIDGE.roll; }, BRIDGE.rate);
  return g.add(hang);
}

/** The climbing grid: black chains with four metal rungs, hung from the deck's edge, leaning out to the ground and
 *  drooping in the middle. Built along +x from its hinge at the top, then turned to the climb's heading. */
function net(c) {
  const t = (c.h * Math.PI) / 180, len = c.h === 0 ? c.x1 - c.x0 : c.z1 - c.z0, rise = c.y1 - c.y0, g = new THREE.Group(), hang = new THREE.Group();
  const at = (k, z) => new THREE.Vector3(-len * (1 - k), -rise * (1 - k) - SAG * Math.sin(Math.PI * k), z);
  for (const z of [-NET / 2, NET / 2]) for (let i = 0; i < 8; i++) hang.add(rod(at(i / 8, z), at((i + 1) / 8, z), 0.012, IRON));
  for (const k of [0.2, 0.4, 0.6, 0.8]) hang.add(rod(at(k, -NET / 2), at(k, NET / 2), 0.02, C.dome));
  g.position.set((c.x0 + c.x1) / 2 + (Math.cos(t) * len) / 2, c.y1, (c.z0 + c.z1) / 2 + (Math.sin(t) * len) / 2);
  g.rotation.y = -t;
  sways(c, (v) => { hang.rotation.z = v * 0.07; });
  return g.add(hang);
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
  if (c.kind === 'grid') return net(c);
  const g = new THREE.Group(), rungs = Math.max(2, Math.round((c.y1 - c.y0) / (1.2 * FT)));
  for (const z of [c.z0, c.z1]) g.add(block([POST, c.y1 - c.y0, POST], C.post, [cx, c.y0, z]));
  for (let i = 1; i <= rungs; i++) g.add(rod(new THREE.Vector3(cx, c.y0 + (i * (c.y1 - c.y0)) / rungs, c.z0), new THREE.Vector3(cx, c.y0 + (i * (c.y1 - c.y0)) / rungs, c.z1), 0.025, C.rail));
  return g;
}

/** The fire pole: up past its deck and hooped back over to it, to reach out and grab. */
function pole(p) {
  const t = (p.h * Math.PI) / 180, { top } = p, head = new THREE.Vector3(p.x0, top, p.z0);
  const out = POLE_OUT * FT, back = new THREE.Vector3(p.x0 - Math.cos(t) * out, top, p.z0 - Math.sin(t) * out), g = new THREE.Group();
  g.add(rod(new THREE.Vector3(p.x1, p.y1, p.z1), head, 0.04, C.pole), rod(head, back, 0.04, C.pole), rod(back, new THREE.Vector3(back.x, p.y0, back.z), 0.04, C.pole));
  return g;
}

/** Stairs or a slide: a slab from one end to the other, `breadth` across; a pole: a yellow rod. */
function path(p) {
  const a = new THREE.Vector3(p.x0, p.y0, p.z0), b = new THREE.Vector3(p.x1, p.y1, p.z1);
  if (p.kind === 'pole') return pole(p);
  const v = new THREE.Vector3().subVectors(b, a), breadth = p.kind === 'stairs' ? 1.2 : 1.1;
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
  if (s.kind === 'swing') g.add(seat(s, top));
  return g;
}

// each swing's seat and chain, hung from its beam, to turn with whoever is on it
const seats = new Map();
function seat(s, top) {
  // built swinging along +x, its seat across that with a chain up from each end, then turned to the swing's heading
  const turned = new THREE.Group(), hang = new THREE.Group(), wide = 0.4;
  turned.position.copy(top);
  turned.rotation.y = (-s.h * Math.PI) / 180;
  hang.add(block([0.15, 0.04, wide], '#141414', [0, -s.arm, 0]));
  for (const z of [-wide / 2, wide / 2]) hang.add(rod(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, -s.arm, z), 0.008, '#555555'));
  seats.set(s, (a) => { hang.rotation.z = a; });
  return turned.add(hang);
}

/** Swing `on`'s seat is `a` radians round from hanging straight down; every other seat hangs still. */
export function swingSeats(on, a) {
  for (const [s, turn] of seats) turn(s === on ? a : 0);
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

/** A run of black iron fence from `a` to `b` on the ground: two rails and a picket every few inches. */
function ironRun(a, b) {
  const v = new THREE.Vector3().subVectors(b, a), n = Math.max(1, Math.round(v.length() / 0.1)), g = new THREE.Group();
  const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, FENCE, 0.02), mat(IRON), n + 1), m = new THREE.Matrix4();
  for (let i = 0; i <= n; i++) pickets.setMatrixAt(i, m.makeTranslation(a.x + (v.x * i) / n, FENCE / 2, a.z + (v.z * i) / n));
  for (const y of [0.12, FENCE - 0.08]) g.add(rod(new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z), 0.015, IRON));
  return g.add(pickets);
}

/** The park's black iron fence (REUSE-SPEC.md §Level 1, decided 2026-11-12): along the back of the band, and across
 *  the level's end, its gate standing open in the middle, the way out to school. */
function fence(ground) {
  const P = (x, z) => new THREE.Vector3(x, 0, z), back = ground.z0 - 0.3, { x1 } = ground, g = new THREE.Group();
  g.add(ironRun(P(ground.x0 - 30, back), P(x1, back)), ironRun(P(x1, back), P(x1, -GATE)), ironRun(P(x1, GATE), P(x1, ground.z1 + 1)));
  for (const z of [-GATE, GATE]) g.add(block([0.08, FENCE + 0.25, 0.08], IRON, [x1, 0, z]), ironRun(P(x1, z), P(x1 + 0.9, z * 1.5)));
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

// REUSE-SPEC.md §Pizza: what a level is for. A sign at the start points the way; a giant glowing pizza waits at the
// end, by the gate; slices hang in the awkward places (generate.js). Each is its drawing (pizza.svg, slice.svg,
// pizza-sign.svg, in the logo's ink) on a card, flat and bright, with a shine behind the pizza (playtest 2026-11-12: a soft glow was not so cute).
const pictures = new Map();
function card(file, size) {
  if (!pictures.has(file)) {
    const map = Object.assign(new THREE.TextureLoader().load(file), { colorSpace: THREE.SRGBColorSpace });
    pictures.set(file, new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), pictures.get(file));
}
let shine = null;
/** The shine behind a pizza, `size` across: shine.svg's inked rays and sparkles, facing the camera, turning (pizzaTime). */
function glow(size) {
  shine ??= new THREE.SpriteMaterial({ map: Object.assign(new THREE.TextureLoader().load('shine.svg'), { colorSpace: THREE.SRGBColorSpace }), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(shine);
  sprite.scale.setScalar(size);
  return sprite;
}

const slices = [];
/** A slice to find, turning where it hangs. */
function slice(at) {
  const g = new THREE.Group(), turn = card('slice.svg', 0.8);
  g.add(glow(1.7), turn);
  g.position.set(at.x, at.y, at.z);
  slices.push({ g, turn, y: at.y });
  return g;
}

// the giant pizza at the end, glowing, facing the camera
let pie = null;
function bigPizza(ground) {
  pie = new THREE.Group().add(glow(5), card('pizza.svg', 2.4));
  pie.position.set(ground.x1 - 0.4, 2.4, ground.z0 + 0.5);
  return pie;
}

/** The sign at the start: a pizza and an arrow, the way the level goes. */
function sign(ground) {
  const board = card('pizza-sign.svg', 1.2);
  board.position.set(ground.x0 + 2, 1.9, ground.z0 + 0.5);
  return new THREE.Group().add(board, block([0.08, 1.4, 0.08], IRON, [ground.x0 + 2, 0, ground.z0 + 0.46]));
}

/** The slices turn and bob at `t` seconds, those in `taken` (by their place in the level's list) gone; the giant pizza bobs. */
export function pizzaTime(t, taken) {
  slices.forEach((s, i) => {
    s.g.visible = !taken.has(i);
    s.turn.rotation.y = t * 2 + i;
    s.g.position.y = s.y + Math.sin(t * 3 + i) * 0.05;
  });
  if (shine) shine.rotation = t * 0.6;
  if (pie) pie.position.y = 2.4 + Math.sin(t * 1.5) * 0.08;
}

/** Everything of level `L` to see, but the heroes. @param {Level} L */
export function playground(L) {
  const [ground, ...decks] = L.floors;
  return [floor(ground), field(ground), fence(ground), sign(ground), bigPizza(ground), ...L.slices.map(slice), ...decks.filter((f) => !L.bridges.includes(/** @type {any} */ (f))).map(deck), ...L.bridges.map(bridge), ...L.climbs.map(climb), ...[...L.stairs, ...L.rides].map(path), ...L.swings.map(swing)];
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
