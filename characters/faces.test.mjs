import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE_PARAMS, GEO, createCharacter, getSpecies, speciesIds } from './npc.js';
import './species.js';

// today's faces with shaped faces off (default params, unmerged): mesh count and head bounds, taken before the change;
// a species not listed in OFF or CHECK gets only the generic checks
const OFF = {
  owl:   [41, [-0.22452, 0.52702, -0.16758, 0.22452, 0.89686, 0.24156]],
  llama: [38, [-0.12757, 0.91516, -0.12992, 0.12757, 1.22366, 0.31092]],
  lion:  [42, [-0.25192, 0.56904, -0.26689, 0.25192, 0.98695, 0.26343]],
};

const paramsOf = (id, extra) => ({ ...BASE_PARAMS, ...getSpecies(id).defaults, ...extra });
const build = (P, id) => {
  const built = createCharacter(P, id);
  built.root.updateMatrixWorld(true);
  return built;
};
const meshes = (root) => {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};
const named = (built, name) => built.head.children.filter((o) => o.name === name);

/** a head-local mesh's vertices, in head space */
function vertices(mesh) {
  mesh.updateMatrix();
  const pos = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix));
  return out;
}

const ellipsoid = (host) => (v) => Math.hypot(...['x', 'y', 'z'].map((k) => (v[k] - host.position[k]) / host.scale[k]));
// the llama's muzzle tube: radius scale.x across, scale.z up, ending at its front
const tube = (host) => (v) => {
  const front = host.position.z + host.scale.y / 2;
  return v.z > front ? Infinity : Math.hypot((v.x - host.position.x) / host.scale.x, (v.y - host.position.y) / host.scale.z);
};

/** partly inside a host (attached, not floating), its front outside every host (showing, not buried) */
function assertOnSurface(mesh, hosts, label) {
  const vs = vertices(mesh);
  const norm = (v) => Math.min(...hosts.map((h) => h(v)));
  const front = vs.reduce((a, v) => (v.z > a.z ? v : a));
  assert.ok(Math.min(...vs.map(norm)) < 1, `${label}: ${mesh.name} floats off the face`);
  assert.ok(norm(front) > 1, `${label}: ${mesh.name} is buried`);
}

const headHost = (built) => [ellipsoid(built.head.children[0])];
const muzzleParts = (built) => built.head.children.filter((o) => o.isMesh && o.material === built.mat.muzzle);

function checkOwl(built, label) {
  assert.equal(named(built, 'beak').length, 1, `${label}: one beak`);
  assertOnSurface(named(built, 'beak')[0], headHost(built), label);
  assert.equal(named(built, 'mandible').length + named(built, 'cere').length, 0, `${label}: a second beak-coloured lump`);
}

function checkLlama(built, label) {
  const [cyl] = muzzleParts(built);
  const lips = named(built, 'lip'), [jaw] = named(built, 'jaw');
  assert.equal(lips.length, 2, `${label}: two lip lobes`);
  lips.forEach((lip) => assertOnSurface(lip, [tube(cyl)], label));
  assertOnSurface(jaw, lips.map(ellipsoid), label);
  const r = built.params.muzzleThick;
  const lipFront = Math.max(...lips.flatMap(vertices).map((v) => v.z));
  const under = Math.max(...vertices(jaw).map((v) => v.z)) - lipFront;
  assert.ok(under > 0 && under < 0.08 * r, `${label}: the underbite is only a hint (${(under / r).toFixed(3)} r)`);
}

function checkLion(built, label) {
  const cap = muzzleParts(built).find((o) => o.geometry === GEO.sphere);
  const pads = named(built, 'pad');
  assert.equal(pads.length, 2, `${label}: two whisker pads`);
  for (const mesh of [...pads, ...named(built, 'nose')]) assertOnSurface(mesh, [ellipsoid(cap)], label);
}

const CHECK = { owl: checkOwl, llama: checkLlama, lion: checkLion };
const FACE = new Set(['beak', 'lip', 'jaw', 'pad']);

// what shows of the new face stays below the eyes' tops (the lips are the old muzzle tip)
function checkLow(built, label) {
  const eyeTop = Math.min(...built.joints.eye.map((e) => e.node.position.y)) + built.params.eyeRadius;
  const [skull] = headHost(built);
  for (const mesh of built.head.children.filter((o) => FACE.has(o.name) && o.name !== 'lip')) {
    const shown = vertices(mesh).filter((v) => skull(v) > 1);
    assert.ok(Math.max(...shown.map((v) => v.y)) < eyeTop, `${label}: ${mesh.name} reaches up past the eyes`);
  }
}

function corners(id) {
  const ranges = getSpecies(id).randomRanges;
  const at = (i) => Object.fromEntries(Object.entries(ranges).map(([k, r]) => [k, r[i]]));
  const random = Array.from({ length: 12 }, () => getSpecies(id).randomise(paramsOf(id)));
  return [['defaults', {}], ['min', at(0)], ['max', at(1)], ...random.map((P, i) => [`random ${i}`, P])];
}

// every part on the face, low, across range corners
for (const id of speciesIds()) {
  for (const [corner, extra] of corners(id)) {
    const label = `${id} ${corner}`;
    const built = build(paramsOf(id, { ...extra, shapedFaces: true, mergeMeshes: false }), id);
    CHECK[id]?.(built, label);
    checkLow(built, label);
  }
}

// the beak curls down at the tip, more steeply than at its root
{
  const built = build(paramsOf('owl', { shapedFaces: true, mergeMeshes: false }), 'owl');
  const [beak] = named(built, 'beak');
  const rings = new Map();
  const pos = beak.geometry.attributes.position, head = vertices(beak);
  for (let i = 0; i < pos.count; i++) {
    const key = pos.getY(i).toFixed(4);
    if (!rings.has(key)) rings.set(key, []);
    rings.get(key).push(head[i]);
  }
  const centres = [...rings.entries()].sort((a, b) => a[0] - b[0])
    .map(([, vs]) => vs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vs.length));
  const slope = (a, b) => (b.y - a.y) / (b.z - a.z);
  const tip = slope(centres.at(-2), centres.at(-1)), root = slope(centres[0], centres[1]);
  assert.ok(tip < -0.3, `the beak tip points down (slope ${tip.toFixed(2)})`);
  assert.ok(tip < root - 0.3, 'the beak curls: its tip steeper than its root');
  const out = centres.at(-1).z - built.head.children[0].scale.z * Math.sqrt(1 - (beak.position.y / built.head.children[0].scale.y) ** 2);
  assert.ok(out < built.params.beakSize, 'a short beak: no longer than beakSize out of the face');
}

// no line art: shape only (the black mouths and whisker dots came off 2026-11-05)
for (const id of speciesIds()) {
  const built = build(paramsOf(id, { shapedFaces: true, mergeMeshes: false }), id);
  assert.equal(named(built, 'mouth').length + named(built, 'whiskerDot').length, 0, `${id}: line art on the face`);
}

// off is exactly today's face
for (const id of speciesIds().filter((s) => OFF[s])) {
  const built = build(paramsOf(id, { mergeMeshes: false }), id);
  const [count, bounds] = OFF[id];
  assert.equal(meshes(built.root).length, count, `${id}: off keeps today's meshes`);
  const box = new THREE.Box3().setFromObject(built.head);
  [...box.min.toArray(), ...box.max.toArray()].forEach((v, i) =>
    assert.ok(Math.abs(v - bounds[i]) < 1e-5, `${id}: off keeps today's head bounds`));
}

// the face merges with the character, at a modest cost
const triangles = (root) => meshes(root).reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);
for (const id of speciesIds()) {
  const off = build(paramsOf(id), id), on = build(paramsOf(id, { shapedFaces: true }), id);
  assert.equal(meshes(on.root).length, meshes(off.root).length, `${id}: shaped faces merge, no loose meshes`);
  on.root.traverse((o) => assert.ok(!(o.isMesh && FACE.has(o.name)), `${id}: ${o.name} left unmerged`));
  const added = triangles(on.root) - triangles(off.root);
  assert.ok(added < 1000, `${id}: shaped faces add ${added} triangles`);
  if (process.env.VERBOSE) console.info(id, 'adds', added, 'triangles');
}

console.info('faces ok');
