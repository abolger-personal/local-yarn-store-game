import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

const between = (rng, a, b) => a + rng() * (b - a);
const count = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

const GREENS = { bush: '#6f9c58', spiky: '#5d8c4c', cactus: '#82a67c', trailing: '#68a05c' };

// DESIGN-DECISIONS.md §7: greens jitter off one anchor per form, never a free hue.
function greens(rng, anchor) {
  const base = new THREE.Color(anchor)
    .offsetHSL(between(rng, -0.03, 0.03), between(rng, -0.1, 0.08), between(rng, -0.06, 0.05));
  return [0, 0.06, -0.06].map((dl) =>
    new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0, dl), roughness: 0.85 }));
}

const LEAF = new THREE.IcosahedronGeometry(1, 1);
const BLADE = new THREE.ConeGeometry(1, 1, 5);

function part(parent, geo, mat, { at = [0, 0, 0], scale = [1, 1, 1], tilt = 0 }) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...at);
  m.scale.set(...scale);
  m.rotation.x = tilt;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function bush(g, rng, mats, { top, rim }) {
  const n = count(rng, 5, 11), spread = between(rng, 0.3, 0.8) * rim, tall = between(rng, 0.06, 0.2);
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0 : spread * Math.sqrt(rng()), a = rng() * Math.PI * 2;
    const s = between(rng, 0.045, 0.085);
    const y = top + s * 0.7 + tall * (1 - r / (spread + 1e-6)) * rng();
    part(g, LEAF, mats[i % 3], { at: [Math.cos(a) * r, y, Math.sin(a) * r], scale: [s, s * between(rng, 1, 1.5), s] });
  }
}

function spiky(g, rng, mats, { top }) {
  const n = count(rng, 5, 10), tallest = between(rng, 0.2, 0.4);
  for (let i = 0; i < n; i++) {
    const h = tallest * between(rng, 0.45, 1), lean = between(rng, 0.04, 0.5), w = between(rng, 0.018, 0.03);
    const pivot = new THREE.Group();
    pivot.position.y = top;
    pivot.rotation.y = rng() * Math.PI * 2;
    g.add(pivot);
    part(pivot, BLADE, mats[i % 3], {
      at: [0, Math.cos(lean) * h / 2, Math.sin(lean) * h / 2], scale: [w, h, w * 0.4], tilt: lean });
  }
}

function cactus(g, rng, mats, { top, rim }) {
  if (rng() < 0.35) barrel(g, rng, mats, { top, rim });
  else columns(g, rng, mats, { top, rim });
}

function barrel(g, rng, mats, { top, rim }) {
  const n = count(rng, 1, 3);
  for (let i = 0; i < n; i++) {
    const s = between(rng, 0.5, 0.85) * rim / (i * 0.6 + 1), a = rng() * Math.PI * 2;
    const off = i === 0 ? 0 : rim * 0.55;
    part(g, LEAF, mats[i % 3], {
      at: [Math.cos(a) * off, top + s * 0.55, Math.sin(a) * off], scale: [s, s * between(rng, 0.7, 1.2), s] });
  }
}

function columns(g, rng, mats, { top, rim }) {
  const cols = count(rng, 1, 3);
  for (let i = 0; i < cols; i++) {
    const r = between(rng, 0.026, 0.05), h = between(rng, 0.08, 0.3) / (i * 0.5 + 1);
    const pivot = new THREE.Group();
    const a = rng() * Math.PI * 2, off = i === 0 ? 0 : rim * 0.45;
    pivot.position.set(Math.cos(a) * off, top, Math.sin(a) * off);
    pivot.rotation.set(between(rng, -0.15, 0.15), rng() * Math.PI * 2, 0);
    g.add(pivot);
    part(pivot, new THREE.CapsuleGeometry(r, h, 3, 8), mats[i % 3], { at: [0, h / 2 + r * 0.6, 0] });
    for (let k = count(rng, 0, 2); k > 0; k--) {
      const side = k === 1 ? 1 : -1, arm = new THREE.CapsuleGeometry(r * 0.6, h * between(rng, 0.2, 0.45), 3, 8);
      part(pivot, arm, mats[(i + k) % 3], { at: [side * r * 1.4, h * between(rng, 0.4, 0.85), 0] });
    }
  }
}

function trailing(g, rng, mats, { top, rim }) {
  bush(g, rng, mats, { top, rim: rim * 0.6 });
  const strands = count(rng, 3, 6);
  for (let s = 0; s < strands; s++) {
    const a = rng() * Math.PI * 2, steps = count(rng, 3, 7);
    const drop = Math.min(between(rng, 0.025, 0.04), (top - 0.04) / steps);
    for (let k = 0; k < steps; k++) {
      const out = k === 0 ? rim * 0.85 : rim + 0.015, y = top + 0.02 - k * drop;
      const leaf = between(rng, 0.018, 0.028);
      part(g, LEAF, mats[k % 3], { at: [Math.cos(a) * out, y, Math.sin(a) * out], scale: [leaf, leaf * 0.7, leaf] });
    }
  }
}

export const FORMS = { bush, spiky, cactus, trailing };

export function growPlant(seed, { top, rim }) {
  const rng = mulberry32(Math.imul(seed, 0x9E3779B1));
  const names = Object.keys(FORMS);
  const form = names[Math.floor(rng() * names.length)];
  const g = new THREE.Group();
  FORMS[form](g, rng, greens(rng, GREENS[form]), { top, rim });
  g.userData.form = form;
  return g;
}
