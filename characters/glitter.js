// a dance's look (DANCES.md §Gymnastics, Leotards): the Biles moves' leotards as stars that cling to the chest and
// twinkle, and in the air shed a trail that draws the flip's circle; or an action line, an ink stroke a fast-moving
// limb draws as it goes (the wuxia sweep's foot round the floor)
import * as THREE from 'three';
import { star } from './sparkle.js';
import { DANCES } from './motion.js';

const BITS = 16, TRAIL = 48, SHED = 40, TRAIL_LIFE = 0.7, BIT_R = 0.022;
const LINE = 160, LINE_GAP = 0.012, LINE_LIFE = 0.45, LINE_R = 0.014, FAST = 1.2;
const BURST = 10, BURST_LIFE = 0.35, BURST_OUT = 0.3, BURST_LEN = 0.14;
let geo = null, dot = null, rod = null;

/**
 * @typedef {{ colours: string[], bands?: boolean, count?: number, twinkle?: number, line?: [string, number],
 *   shades?: boolean, snap?: string }} Leotard
 */

/** Even over the torso (a golden-angle spiral); with `bands` the colours run top to bottom, as Tokyo's fade does. */
function chestBits(built, look, mats) {
  const { torsoW: W, torsoH: H, torsoD: D } = built.params, n = look.count ?? BITS;
  return Array.from({ length: n }, (_, i) => {
    const up = 1 - (2 * (i + 0.5)) / n, ring = Math.sqrt(1 - up * up), a = i * 2.4;
    const colour = look.bands ? Math.min(mats.length - 1, Math.floor(((1 - up) / 2) * mats.length)) : i % mats.length;
    const m = new THREE.Mesh(geo, mats[colour]);
    m.position.set(W * ring * Math.cos(a) * 1.05, H * up * 1.05, D * ring * Math.sin(a) * 1.05);
    Object.assign(m.userData, { phase: i * 1.7, prop: true, noMerge: true });
    built.joints.chest.add(m);
    return m;
  });
}

/** The far end of a limb (`[part, side]`), where its line is drawn from: the descendant furthest from the joint. */
function tipNode(built, [part, side]) {
  const limb = built.joints[part].find((j) => j.side === side).node, o = new THREE.Vector3(), p = new THREE.Vector3();
  built.root.updateMatrixWorld(true);
  limb.getWorldPosition(o);
  let tip = limb, far = -1;
  limb.traverse((n) => { const d = n.getWorldPosition(p).distanceTo(o); if (d > far) { far = d; tip = n; } });
  return tip;
}

function pool(parent, n, shape, matOf) {
  return Array.from({ length: n }, (_, i) => {
    const m = new THREE.Mesh(shape, matOf(i));
    Object.assign(m.userData, { age: Infinity, prop: true, noMerge: true });
    m.visible = false;
    parent?.add(m);
    return m;
  });
}

function makeGlitter(built, name, look) {
  geo ??= star(0, 0, 0, 1);
  dot ??= new THREE.SphereGeometry(1, 8, 6);
  const mats = look.colours.map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }));
  const g = { built, name, look, mats, bits: [], trail: [], t: 0, shed: 0, next: 0, tip: null, last: null };
  if (look.line) Object.assign(g, { trail: pool(built.root.parent, LINE, dot, () => mats[0]), tip: tipNode(built, look.line) });
  else Object.assign(g, { trail: pool(built.root.parent, TRAIL, geo, () => mats[0]), bits: chestBits(built, look, mats) });
  if (look.shades) g.shades = shades(built, mats);
  if (look.snap) Object.assign(g, { rods: neonRods(built, mats), step: -1, nextRod: 0, bursts: 0 });
  return g;
}

/** Dark glossy lenses over both eyes and a bridge between, on the head, sized to the eyes. */
function shades(built, mats) {
  const r = built.params.eyeRadius, mat = new THREE.MeshStandardMaterial({ color: '#0c0c10', roughness: 0.15, metalness: 0.6 });
  mats.push(mat);
  const group = new THREE.Group(), eyes = built.joints.eye.map(({ node }) => node.position);
  const piece = ([x, y, z], [sx, sy, sz]) => {
    const m = new THREE.Mesh(dot, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    Object.assign(m.userData, { prop: true, noMerge: true });
    group.add(m);
  };
  for (const e of eyes) piece([e.x, e.y, e.z + r * 0.6], [r * 1.3, r * 1.05, r * 0.25]);
  const [a, b] = eyes;
  piece([(a.x + b.x) / 2, (a.y + b.y) / 2 + r * 0.3, Math.max(a.z, b.z) + r * 0.5], [Math.abs(a.x - b.x) / 2, r * 0.12, r * 0.12]);
  built.joints.head.add(group);
  return group;
}

/** Neon rods for the snaps' speed lines, each with a soft halo, on the root so a burst moves with the dancer. */
function neonRods(built, mats) {
  rod ??= new THREE.CylinderGeometry(1, 1, 1, 6);
  const halos = mats.map((m) => new THREE.MeshBasicMaterial({
    color: m.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  mats.push(...halos);
  const rods = pool(built.root, BURST * 2, rod, (i) => mats[i % halos.length]);
  for (const [i, m] of rods.entries()) {
    const halo = new THREE.Mesh(rod, halos[i % halos.length]);
    halo.scale.set(3, 1, 3);
    m.add(halo);
  }
  return rods;
}

/** On each step whose pose starts with `snap`, a ring of lines shoots out from the chest; they fly and fade. */
function snapLines(g, perf, dt) {
  const pose = perf ? DANCES[g.name].steps[perf.i].pose : '';
  if (perf && perf.i !== g.step && pose.startsWith(g.look.snap)) burst(g);
  g.step = perf?.i ?? -1;
  for (const m of g.rods) {
    m.userData.age += dt;
    const k = m.userData.age / BURST_LIFE, { angle: a, at } = m.userData;
    m.visible = k < 1;
    if (!m.visible) continue;
    const len = BURST_LEN * (1 - k) + 0.02, r = m.userData.from + BURST_OUT * k + len / 2;
    m.position.set(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, at.z);
    m.rotation.z = a - Math.PI / 2;
    m.scale.set(0.007, len, 0.007);
  }
}

function burst(g) {
  const { root, joints, params: P } = g.built;
  root.updateMatrixWorld(true);
  const at = root.worldToLocal(joints.chest.getWorldPosition(new THREE.Vector3()));
  g.bursts += 1;
  for (let k = 0; k < BURST; k++) {
    const m = g.rods[g.nextRod];
    g.nextRod = (g.nextRod + 1) % g.rods.length;
    Object.assign(m.userData, { age: 0, at, angle: ((k + 0.5 * (g.bursts % 2)) / BURST) * Math.PI * 2, from: Math.max(P.torsoW, P.torsoH) * 1.6 });
  }
}

function disposeGlitter(g) {
  for (const m of [...g.bits, ...g.trail, ...(g.rods ?? []), g.shades]) m?.removeFromParent();
  for (const m of g.mats) m.dispose();
}

function twinkle(g) {
  const tw = g.look.twinkle ?? 0.4;
  for (const m of g.bits) {
    const w = Math.sin(g.t * 7 + m.userData.phase) * 0.5 + 0.5;
    m.scale.setScalar(BIT_R * (1 - tw + 2 * tw * w ** 3));
    m.rotation.y = g.t * 2 + m.userData.phase;
  }
}

function age(g, dt, life, r) {
  for (const m of g.trail) {
    m.userData.age += dt;
    const k = 1 - m.userData.age / life;
    m.visible = k > 0;
    if (k > 0) m.scale.setScalar(r * k);
  }
}

/** Dots laid edge to edge from where the tip was to where it is, while it moves fast: a stroke that thins as it fades. */
function drawLine(g, dt) {
  age(g, dt, LINE_LIFE, LINE_R);
  const { parent } = g.trail[0];
  if (!parent) return;
  g.built.root.updateMatrixWorld(true);
  const now = parent.worldToLocal(g.tip.getWorldPosition(new THREE.Vector3()));
  const was = g.last ?? now, gap = now.distanceTo(was);
  g.last = now;
  if (!(dt > 0) || gap / dt < FAST) return;
  const n = Math.min(g.trail.length, Math.ceil(gap / LINE_GAP));
  for (let j = 1; j <= n; j++) {
    const m = g.trail[g.next];
    g.next = (g.next + 1) % g.trail.length;
    m.position.lerpVectors(was, now, j / n);
    m.userData.age = ((n - j) / n) * dt;
    m.visible = true;
    m.scale.setScalar(LINE_R);
  }
}

function shedTrail(g, air, dt) {
  age(g, dt, TRAIL_LIFE, BIT_R * 1.3);
  if (!air || !g.bits.length || !g.trail[0].parent) return;
  g.built.root.updateMatrixWorld(true);
  for (g.shed += dt * SHED; g.shed >= 1; g.shed -= 1) {
    const m = g.trail[g.next], from = g.bits[(g.next * 7) % g.bits.length];
    g.next = (g.next + 1) % g.trail.length;
    m.material = from.material;
    m.parent.worldToLocal(from.getWorldPosition(m.position));
    m.userData.age = 0;
    m.visible = true;
    m.scale.setScalar(BIT_R * 1.3);
  }
}

/**
 * The glitter for `perf`'s dance on `built`, stepped `dt`: made when a dance with a leotard (`glitter` in DANCES)
 * starts, kept while it plays, gone when it ends or the character is rebuilt. Call after placeDancer; returns what
 * to pass next frame.
 */
export function stepGlitter(g, built, perf, d, dt) {
  const name = perf?.name, look = name ? DANCES[name].glitter : null;
  if (g && (g.built !== built || g.name !== name)) { disposeGlitter(g); g = null; }
  if (!g && look) g = makeGlitter(built, name, look);
  if (!g) return null;
  g.t += dt;
  twinkle(g);
  if (g.tip) drawLine(g, dt);
  else shedTrail(g, Boolean(d?.air), dt);
  if (g.rods) snapLines(g, perf, dt);
  return g;
}
