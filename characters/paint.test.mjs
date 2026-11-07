import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE_PARAMS, createCharacter, getSpecies, speciesIds, setGeometryDetail } from './npc.js';
import { FRAY_BAND, FUR_RAMP, INK_RAMP, PAINT, inkFrays, paintBright, paintRamp } from './paint.js';
import { aimGameCamera } from '../spinoff/stage.js';
import './species.js';

// BODIES.md §Painterly
setGeometryDetail('med');
const paramsOf = (id, extra = {}) => ({ ...BASE_PARAMS, ...getSpecies(id).defaults, mergeMeshes: false, ...extra });
const hsl = (rgb) => new THREE.Color(...rgb).getHSL({ h: 0, s: 0, l: 0 });
const chroma = (rgb) => Math.max(...rgb) - Math.min(...rgb);
const saturation = (rgb) => chroma(rgb) / Math.max(...rgb, 1e-9);

// the fur ramp: lit is brighter and as saturated (no grey wash), shadow deeper and more saturated, in the same family
for (const hex of ['#3a5fcd', '#c8752e', '#8f8f96', '#4caf50', '#e8d9bd', '#6e4220']) {
  const base = new THREE.Color(hex).toArray();
  const { shadow, light } = paintRamp(base, FUR_RAMP);
  const [b, s] = [base, shadow].map(hsl);
  assert.ok(Math.max(...light) >= Math.max(...base) && saturation(light) >= saturation(base) - 1e-9, `${hex}: the lit colour is greyer (${saturation(light).toFixed(2)} vs ${saturation(base).toFixed(2)}) or no brighter`);
  assert.ok(s.l < b.l, `${hex}: the shadow is not deeper`);
  const [bs, ss] = [saturation(base), saturation(shadow)];
  if (bs > 0.05) assert.ok(ss > bs || ss === 1, `${hex}: the shadow (${ss.toFixed(2)}) is no more saturated than the base (${bs.toFixed(2)})`);
  const ink = paintRamp(base, INK_RAMP);
  assert.ok(hsl(ink.shadow).l < b.l && hsl(ink.light).l > b.l, `${hex}: the ink wash does not run dark to pale`);
}

// never darker than the felt: the banded light is at least the light, and at most a band more
for (const level of [0.4, 0.8, 1.6]) {
  for (let e = 0; e < 4; e += 0.01) {
    const b = paintBright(e, PAINT.bands.value, level), step = (2 * level) / PAINT.bands.value;
    assert.ok(b >= e && b <= e + step + 1e-9, `light ${e.toFixed(2)} paints as ${b.toFixed(2)} (level ${level})`);
  }
}

// on: matte, no specular, its own family per style; off: the felt exactly as before
for (const id of speciesIds()) {
  const kit = getSpecies(id), on = createCharacter(paramsOf(id, { painterly: true }), id), style = kit.paint?.style;
  const plain = createCharacter(paramsOf(id, { painterly: false }), id), before = createCharacter(paramsOf(id, { painterly: undefined }), id);
  const felt = (b) => b.materials.filter((m) => !['eye', 'knit'].includes(m.userData.family));
  for (const m of style ? felt(on) : []) {
    assert.equal(m.userData.family, `paint-${style}`, `${id}: a felt material is left unpainted`);
    assert.ok(m.roughness === 1 && m.sheen === 0 && m.specularIntensity === 0 && m.clearcoat === 0, `${id}: a painted material keeps a highlight`);
  }
  plain.materials.forEach((m, i) => {
    const json = (x) => ({ ...x.toJSON(), uuid: null });
    assert.deepEqual(json(m), json(before.materials[i]), `${id}: painterly off changes a material`);
    assert.equal(m.customProgramCacheKey, THREE.Material.prototype.customProgramCacheKey, `${id}: painterly off keeps a program key`);
    assert.equal(m.onBeforeCompile, THREE.Material.prototype.onBeforeCompile, `${id}: painterly off leaves a shader hook`);
  });
  assert.ok(on.materials.filter((m) => m.userData.family === 'eye').every((m) => !m.userData.paint), `${id}: the eyes are painted`);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  felt(on)[0].onBeforeCompile(shader);
  assert.ok(!style || shader.vertexShader.includes('vPaintUv = uv') && shader.fragmentShader.includes('outgoingLight = paintC'), `${id}: the paint never reaches the shader`);
  const draws = (painterly) => {
    let n = 0;
    createCharacter(paramsOf(id, { painterly, mergeMeshes: true }), id).root.traverse((o) => { if (o.isMesh) n++; });
    return n;
  };
  assert.equal(draws(true), draws(false), `${id}: painted and merged, the character costs more draws`);
}

// ink frays only the plumage, only near the silhouette; the beak and the face are left whole
{
  const owl = createCharacter(paramsOf('owl', { painterly: true }), 'owl');
  assert.ok(owl.mat.feather.userData.accent, 'the plumage never frays');
  // the beak, feet, eyes and any face colour stay whole; the feathers and the body fray
  assert.ok(owl.mat.body.userData.accent && owl.materials.every((m) => [owl.mat.feather, owl.mat.body].includes(m) || !m.userData.accent), 'the ink frays the beak, feet or face');
  const merged = createCharacter(paramsOf('owl', { painterly: true, mergeMeshes: true }), 'owl');
  const ink = [];
  merged.root.traverse((o) => { if (o.userData.merged && o.material.userData.paint) ink.push(o); });
  assert.equal(ink.length, 1, 'the merged owl is not one ink draw');
  assert.notEqual(ink[0].material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile, 'merged, the owl loses its ink shader');
  const uv = ink[0].geometry.attributes.uv;
  let accented = 0;
  for (let i = 0; i < uv.count; i++) accented += uv.getY(i) > 1.5 ? 1 : 0;
  assert.ok(accented > 0 && accented < uv.count, `merged, ${accented} of ${uv.count} owl vertices are marked as plumage`);
}
// BODIES.md §Painterly, accent pieces: the mane and the wool take their own fur stroke size; merged, they are the only
// vertices lifted 2 tiles (so no other part may already sit there)
for (const [id, key] of [['lion', 'mane'], ['llama', 'fleece']]) {
  const kit = createCharacter(paramsOf(id, { painterly: true }), id);
  assert.ok(kit.mat[key].userData.accent && kit.materials.every((m) => m === kit.mat[key] || !m.userData.accent), `${id}: the ${key} is not its only accent piece`);
  let lifted = 0, accentVerts = 0;
  kit.root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.uv) return;
    const { uv } = o.geometry.attributes;
    for (let i = 0; i < uv.count; i++) lifted += uv.getY(i) > 1.5 ? 1 : 0;
  });
  assert.equal(lifted, 0, `${id}: unmerged, a part's uv already reads as an accent piece`);
  const merged = createCharacter(paramsOf(id, { painterly: true, mergeMeshes: true }), id);
  merged.root.traverse((o) => {
    if (!o.userData.merged || !o.material.userData.paint) return;
    const { uv } = o.geometry.attributes;
    for (let i = 0; i < uv.count; i++) accentVerts += uv.getY(i) > 1.5 ? 1 : 0;
  });
  assert.ok(accentVerts > 0, `${id}: merged, the ${key} is not marked as an accent piece`);
}
{
  const dragon = createCharacter(paramsOf('dragon', { painterly: true }), 'dragon'), plain = [dragon.mat.spike, dragon.mat.horn, dragon.mat.belly];
  assert.ok(dragon.materials.every((m) => Boolean(m.userData.accent) === plain.includes(m)), 'dragon: scales painted on the spikes, horns or belly plates, or missing off the body');
}
for (let k = 0; k <= 20; k++) {
  const noise = k / 20, fray = PAINT.fray.value;
  assert.ok(!inkFrays(FRAY_BAND, noise, fray) && !inkFrays(1, noise, fray), 'the ink frays away from the silhouette');
}
assert.ok(inkFrays(0, 0.05, PAINT.fray.value), 'the ink never frays');
// worst case (every brush value frays), from the match camera: what the fray opens to the background lies on the outline
{
  const owl = createCharacter(paramsOf('owl', { painterly: true }), 'owl');
  owl.root.rotation.y = Math.PI / 2;
  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.01, 100), W = 800, H = 500;
  aimGameCamera(camera, new THREE.Vector3(0, 0.8, -0.1));
  owl.root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(owl.root), ray = new THREE.Raycaster(), n = new THREE.Vector3();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera));
  const [x0, x1, y0, y1] = [Math.min(...corners.map((c) => c.x)), Math.max(...corners.map((c) => c.x)), Math.min(...corners.map((c) => c.y)), Math.max(...corners.map((c) => c.y))]
    .map((v, i) => Math.round(((i < 2 ? v * W : v * H) / 2)));
  const frays = (hit) => hit.object.material.userData.accent
    && inkFrays(n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).dot(ray.ray.direction) * -1, 0, PAINT.fray.value);
  const solid = new Set(), whole = new Set();
  for (let i = x0 - 1; i <= x1 + 1; i++) for (let j = y0 - 1; j <= y1 + 1; j++) {
    ray.setFromCamera(new THREE.Vector2((2 * i) / W, (2 * j) / H), camera);
    const hits = ray.intersectObject(owl.root, true);
    if (hits.length) solid.add(`${i},${j}`);
    if (hits.some((h) => !frays(h))) whole.add(`${i},${j}`);
  }
  const holes = [...solid].filter((k) => !whole.has(k));
  const toEdge = (k) => {
    const [i, j] = k.split(',').map(Number);
    for (let r = 1; r < 20; r++) for (let a = -r; a <= r; a++) for (const [di, dj] of [[a, -r], [a, r], [-r, a], [r, a]]) if (!solid.has(`${i + di},${j + dj}`)) return r;
    return 20;
  };
  const deepest = Math.max(0, ...holes.map(toEdge));
  console.log(`owl ink, match camera: ${holes.length} of ${solid.size} px fray open, the deepest ${deepest} px in from the outline`);
  assert.ok(holes.length > solid.size * 0.1, `the fray is too faint to see (${holes.length} px)`);
  assert.ok(deepest <= 8, `the fray opens a hole ${deepest} px in from the outline`);
}

console.log('paint: ok');
