import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BASE_PARAMS, GEO, POSES, MOTION_DEFAULTS, createCharacter, getSpecies, speciesIds, stepMotion, setGeometryDetail,
  placePupils, facePaintColorFor, FACE_PAINTS,
} from './npc.js';
import { aimGameCamera } from '../spinoff/stage.js';
import './owl.js';
import './llama.js';
import './lion.js';

// BODIES.md §Look-at, §Face, seen as the match sees them (spinoff/stage.js aimGameCamera)
setGeometryDetail('med');
const STILL = { ...MOTION_DEFAULTS, idleAmount: 0 };
// off by default, so the game looks as it did till the designer picks them (the species checker's style folder)
const STYLE = { lookAt: true, eyeGlint: true };
for (const k of Object.keys(STYLE)) assert.equal(BASE_PARAMS[k], false, `${k} is off by default`);
assert.equal(BASE_PARAMS.facePaint, 'none', 'face paint on by default');
const PAINTED = FACE_PAINTS.filter((p) => p !== 'none'), SIDES = { rings: 2, slashes: 2, heart: 1 };
const paramsOf = (id, extra = {}) => ({ ...BASE_PARAMS, ...getSpecies(id).defaults, ...STYLE, mergeMeshes: false, ...extra });

/** A fighter side on at the origin, facing +x, as placeFighter turns one; the match camera on it. */
function matchView(id, extra) {
  const built = createCharacter(paramsOf(id, extra), id);
  built.root.rotation.y = Math.PI / 2;
  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.01, 100);
  aimGameCamera(camera, new THREE.Vector3(0, 0.8, -0.1));
  camera.updateMatrixWorld(true);
  built.lookTarget = camera.position;
  return { built, camera };
}

function settle(built, pose = POSES.rest, frames = 90) {
  for (let i = 0; i < frames; i++) {
    built.root.updateMatrixWorld(true);
    stepMotion(built, pose, 1 / 60, STILL);
  }
  built.root.updateMatrixWorld(true);
}

const _ray = new THREE.Raycaster(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const SCREEN = [800, 500];
const _c = new THREE.Vector3(), _ndc = new THREE.Vector2();

/** Screen pixels (on an 800 by 500 screen) where `group` is the nearest thing of the head's: a z-buffer count, by ray. */
function pixelsOf(built, camera, group) {
  const box = new THREE.Box3().setFromObject(group), r = box.getSize(_p).length() / 2;
  box.getCenter(_c);
  const centre = _c.clone().project(camera), edge = _c.clone().add(_d.set(0, 0, 0).setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r)).project(camera);
  const half = Math.ceil(Math.hypot(edge.x - centre.x, edge.y - centre.y) * SCREEN[0] / 2) + 1;
  let n = 0;
  for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) {
    _ray.setFromCamera(_ndc.set(centre.x + (2 * i) / SCREEN[0], centre.y + (2 * j) / SCREEN[1]), camera);
    const hit = _ray.intersectObject(built.joints.head, true)[0];
    if (hit && group.getObjectById(hit.object.id)) n++;
  }
  return n;
}

const named = (built, name) => {
  const out = [];
  built.root.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

// look-at: the head turns toward the camera, and more of the eyes show from the match camera
for (const id of speciesIds()) {
  const views = [false, true].map((lookAt) => {
    const { built, camera } = matchView(id, { lookAt });
    settle(built);
    const eyes = built.joints.eye.map(({ node }) => pixelsOf(built, camera, node));
    const facing = built.joints.head.getWorldDirection(new THREE.Vector3())
      .angleTo(camera.position.clone().sub(built.joints.head.getWorldPosition(new THREE.Vector3())));
    return { eyes, facing, built };
  });
  const [off, on] = views;
  const sum = (a) => a[0] + a[1];
  console.log(`${id}: head ${THREE.MathUtils.radToDeg(off.facing).toFixed(0)}° → ${THREE.MathUtils.radToDeg(on.facing).toFixed(0)}° from the camera; eyes ${off.eyes.join(' + ')} → ${on.eyes.join(' + ')} px`);
  assert.ok(on.facing < off.facing - 0.6, `${id}: looking at the camera turns the head only ${(off.facing - on.facing).toFixed(2)} rad toward it`);
  const far = off.eyes[0] < off.eyes[1] ? 0 : 1;
  assert.ok(sum(on.eyes) > sum(off.eyes) * 1.2, `${id}: looking at the camera shows ${sum(on.eyes)} px of eye to ${sum(off.eyes)}`);
  assert.ok(on.eyes[far] > off.eyes[far] * 1.8, `${id}: looking at the camera, the far eye shows ${on.eyes[far]} px to ${off.eyes[far]}`);
  assert.ok(Math.min(...on.eyes) > 10, `${id}: looking at the camera, an eye is still hidden (${on.eyes} px)`);
  assert.equal(off.built.joints.head.rotation.y, 0, `${id}: with look-at off the head still turns`);
}

// a dance that turns the head itself has it to itself; the pupils still find the camera ahead of the head
{
  const { built } = matchView('owl');
  settle(built, { ...POSES.rest, headYaw: 0.45 });
  assert.ok(Math.abs(built.look.yaw) < 0.01, `a dance's own head turn still carries ${built.look.yaw.toFixed(3)} of look-at`);
  const { built: turning } = matchView('owl');
  settle(turning, POSES.rest, 3);
  assert.ok(Math.abs(turning.look.eyeYaw) > Math.abs(turning.look.yaw), 'the pupils do not lead the head');
}

/** Corners of a species' random ranges: all low, all high, and the two alternations. */
function corners(id) {
  const ranges = Object.entries(getSpecies(id).randomRanges);
  return [0, 1, 2, 3].map((c) => Object.fromEntries(ranges.map(([k, [lo, hi]], i) => [k, [lo, hi, i % 2 ? lo : hi, i % 2 ? hi : lo][c]])));
}

const skullOf = (built) => built.joints.head.children.find((m) => m.isMesh && m.geometry === GEO.sphere);
const inSkull = (skull, v) => Math.hypot(v.x / skull.scale.x, v.y / skull.scale.y, v.z / skull.scale.z);

// pupils stay on the white that shows, however hard they look; the patches lie on the skull, neither sunk nor floating
for (const id of speciesIds()) for (const corner of corners(id)) {
  const built = createCharacter(paramsOf(id, corner), id), skull = skullOf(built);
  for (const [eyeYaw, eyePitch] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, -0.7]]) {
    built.look = { eyeYaw, eyePitch };
    placePupils(built);
    built.root.updateMatrixWorld(true);
    for (const { node, pupil, r, ry } of built.joints.eye) {
      const pr = built.params.eyeRadius * built.params.pupilScale;
      /** How far out of the skull the white is under the pupil's edge (dx, dy) with the pupil at (px, py). */
      const under = (px, py, dx, dy) => {
        const x = px + dx * pr, y = py + dy * pr * (ry / r);
        assert.ok(Math.hypot(x / r, y / ry) <= 1, `${id}: a pupil looking (${eyeYaw}, ${eyePitch}) slides off its eye`);
        const white = new THREE.Vector3(x, y, node.children[0].scale.z * Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / ry) ** 2)));
        return inSkull(skull, built.joints.head.worldToLocal(node.localToWorld(white)));
      };
      // the leading edge; some faces' skin already climbs over a pupil's nose-side edge at rest, so no deeper than that
      for (const [dx, dy] of [[Math.sign(eyeYaw), 0], [0, -Math.sign(eyePitch)]].filter(([a, b]) => a || b)) {
        const now = under(pupil.position.x, pupil.position.y, dx, dy), rest = under(0, 0, dx, dy);
        assert.ok(now >= Math.min(0.995, rest) - 1e-9, `${id}: a pupil looking (${eyeYaw}, ${eyePitch}) slides under the skin (${now.toFixed(3)}, ${rest.toFixed(3)} at rest)`);
      }
    }
  }
  for (const patch of PAINTED.flatMap((facePaint) => named(createCharacter(paramsOf(id, { ...corner, facePaint }), id), 'facePaint'))) {
    const pos = patch.geometry.attributes.position, v = new THREE.Vector3();
    let lo = Infinity, hi = 0;
    for (let i = 0; i < pos.count; i++) {
      const k = inSkull(skull, v.fromBufferAttribute(pos, i));
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
    }
    const r = Math.min(skull.scale.x, skull.scale.y, skull.scale.z);
    assert.ok(lo > 1 + 0.001 / r && hi < 1 + 0.012 / r, `${id}: the ${patch.name} lies ${lo.toFixed(3)}..${hi.toFixed(3)} of the skull out`);
    // the middles of its triangles too, or a flat shape's face cuts through the skull and only its rim shows
    const tri = new THREE.Triangle(), mid = new THREE.Vector3(), index = patch.geometry.index;
    for (let t = 0; t < (index ? index.count : pos.count) / 3; t++) {
      const at = (k) => (index ? index.getX(3 * t + k) : 3 * t + k);
      tri.setFromAttributeAndIndices(pos, at(0), at(1), at(2)).getMidpoint(mid);
      assert.ok(inSkull(skull, mid) > 1, `${id}: the ${patch.name} sinks into the skull mid-triangle (${inSkull(skull, mid).toFixed(4)})`);
    }
  }
}

// each switch really takes its part off; the parts merge into the families already drawn
for (const id of speciesIds()) {
  assert.equal(named(createCharacter(paramsOf(id), id), 'glint').length, 2, `${id}: no glint with eyeGlint on`);
  assert.equal(named(createCharacter(paramsOf(id, { eyeGlint: false }), id), 'glint').length, 0, `${id}: a glint with eyeGlint off`);
  for (const facePaint of FACE_PAINTS) {
    const n = named(createCharacter(paramsOf(id, { facePaint }), id), 'facePaint').length;
    assert.equal(n, SIDES[facePaint] ?? 0, `${id}: ${n} pieces of ${facePaint} face paint`);
  }
  const [glint] = named(createCharacter(paramsOf(id), id), 'glint');
  assert.ok(glint.material.userData.family === 'eye' && glint.material.color.getHex() === 0xffffff, `${id}: the glint is not a white glassy eye part`);
  const draws = (extra) => {
    let n = 0;
    createCharacter(paramsOf(id, { mergeMeshes: true, ...extra }), id).root.traverse((o) => { if (o.isMesh) n++; });
    return n;
  };
  for (const facePaint of PAINTED) assert.equal(draws({ facePaint }), draws({ eyeGlint: false }), `${id}: ${facePaint} face paint adds draws`);
}

// every face paint can be seen from the match camera, looking at it (the heart is on the near cheek)
for (const id of speciesIds()) {
  for (const facePaint of PAINTED) {
    const { built, camera } = matchView(id, { facePaint });
    settle(built);
    const seen = named(built, 'facePaint').map((m) => pixelsOf(built, camera, m));
    console.log(`${id}: ${facePaint} ${seen.join(' + ')} px`);
    // side on, the far cheek's paint hides behind the face; the near one must show
    assert.ok(Math.max(...seen) > 6, `${id}: only ${seen.join(' + ')} px of the ${facePaint} can be seen in a match`);
  }
}

// face paint is the fur's complement
for (const fur of ['#3d7bd9', '#4caf50', '#e0a53c', '#8f8f96', '#d94c8a']) {
  const a = {}, b = {};
  new THREE.Color(facePaintColorFor(fur)).getHSL(a);
  new THREE.Color(fur).getHSL(b);
  assert.ok(a.s > 0.7 && (b.s < 0.12 || Math.abs(Math.abs(a.h - b.h) - 0.5) < 0.01), `the face paint for ${fur} is not across the hue circle from it`);
}

console.log('face: ok');
