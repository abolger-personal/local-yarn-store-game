import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  POSES, BASE_PARAMS, MOTION_DEFAULTS, createCharacter, stepMotion, speciesIds, getSpecies, applyPose,
  lowestResting, seatedHipsAlong,
} from './npc.js';
import { stitchBeat, advanceStitch, makeCraft, stepCraft, poseCraft, glance, hesitation, pieceScale } from './craft-anim.js';
import { SPARKLE_BITS, makeSparkle, playSparkle, stepSparkle, sparkleScale, SPARKLE_TIME } from './sparkle.js';
import { CHAIR_W, SEAT_H } from './store/core/config.js';
import './owl.js';
import './llama.js';
import './lion.js';
import { mulberry32 } from './store/core/util.js';

Math.random = mulberry32(7);
const DT = 1 / 120;
const v3 = () => new THREE.Vector3();

for (const mode of ['knit', 'crochet']) {
  const a = stitchBeat(mode, 0, {}), z = stitchBeat(mode, 0.99999, {});
  for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - z[k]) < 1e-3, `${mode}.${k} jumps at the stitch seam`);
  for (let p = 0; p < 1; p += 0.01) {
    for (const v of Object.values(stitchBeat(mode, p, {}))) assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${mode} beat out of 0..1`);
  }
}
assert.ok(glance(0) < 0.01 && glance(2.4) > 0.99, 'running out: first the tail, then the yarn wall');
assert.ok(pieceScale('hat') === 2 && pieceScale('sweater') > 5 && pieceScale('sweater') < 6, 'hat 2x, sweater 5-6x');

const clock = (skill, outT = 0) => ({ mode: 'knit', speed: 1, skill, outT, wait: 0, phase: 0, count: 0, progress: 0, perStitch: 0 });
{
  const c = { ...clock(3, 1), phase: 0.3 };
  advanceStitch(c, 5);
  assert.equal(c.phase, 0.3, 'out of yarn, the knitting stops');
  const stitchesIn = (skill) => {
    const k = clock(skill);
    for (let i = 0; i < 1200; i++) advanceStitch(k, 1 / 60);
    return k.count;
  };
  assert.ok(stitchesIn(5) > 2 * stitchesIn(1), 'a skill-5 crafter knits much faster than a skill-1');
  for (let n = 0; n < 50; n++) assert.equal(hesitation(5, n), 0, 'an expert never hesitates');
  assert.ok([...Array(50).keys()].some((n) => hesitation(1, n) > 0.3), 'a novice does');
}

const rootLocal = (built, node) => built.root.worldToLocal(node.getWorldPosition(v3()));
const ellipsoid = (built, ch, p) => {
  const P = built.params, s = 1 + (built.bulge ?? 0);
  return Math.sqrt(((p.x - ch.x) / (P.torsoW * s)) ** 2 + ((p.y - ch.y) / (P.torsoH * s)) ** 2 + ((p.z - ch.z) / (P.torsoD * s)) ** 2);
};
const toEdge = (c, p) => {
  const hw = c.pieceW / 2, dx = Math.max(0, Math.abs(p.x - c.work.x) - hw);
  return Math.hypot(dx, p.y - c.work.y, p.z - c.work.z);
};

function seated(id, P) {
  const built = createCharacter({ ...P, mergeMeshes: false }, id);
  applyPose(built, POSES.sit);
  return { built, seatY: SEAT_H + built.root.position.y - lowestResting(built) - 0.01 };
}

function checkPiece(c, built, ch, tag) {
  const pos = c.piece.geometry.attributes.position, p = v3();
  const chairFront = CHAIR_W / 2 - seatedHipsAlong(built.params, CHAIR_W), seatTop = SEAT_H - built.root.position.y;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    assert.ok(ellipsoid(built, ch, p) > 1, `${tag}: the piece goes through the torso`);
    assert.ok(p.y >= -built.root.position.y - 1e-6, `${tag}: the piece goes through the floor`);
    if (p.y < seatTop && Math.abs(p.x) < CHAIR_W / 2) assert.ok(p.z > chairFront, `${tag}: the piece goes into the chair`);
  }
}

function wingOf(built, side) {
  const shape = built.species.wingShape?.(built.params);
  if (!shape) return null;
  const arm = built.joints.upperArm.find((j) => j.side === side).node;
  const inv = new THREE.Matrix4().compose(
    v3().set(shape.pos[0] * side, shape.pos[1], shape.pos[2]),
    new THREE.Quaternion().setFromAxisAngle(v3().set(0, 0, 1), side * shape.roll), v3().fromArray(shape.scale),
  ).invert();
  const unit = (pw) => pw.applyMatrix4(arm.matrixWorld.clone().invert()).applyMatrix4(inv).length();
  let k = 0;
  for (const m of arm.children) {
    if (!m.isMesh) continue;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) k = Math.max(k, unit(arm.localToWorld(v3().fromBufferAttribute(pos, i).applyMatrix4(m.matrix))));
  }
  return { k, at: (p) => unit(built.root.localToWorld(p.clone())) };
}

const toSegment = (p, a, b) => {
  const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
};

function armBones(built, side) {
  const at = (part) => rootLocal(built, built.joints[part].find((j) => j.side === side).node);
  const [shoulder, elbow] = [at('upperArm'), at('lowerArm')];
  const paw = rootLocal(built, built.holds[side < 0 ? 0 : 1]);
  const r = built.params.limbThick * 1.05;
  return [[shoulder, elbow, r], [elbow, paw, r * 0.78]];
}

let torsoMargin = Infinity;

function checkTools(c, built, ch, tag) {
  const wings = [-1, 1].map((side) => wingOf(built, side)).filter(Boolean);
  const bones = [-1, 1].flatMap((side) => armBones(built, side));
  for (const t of c.mode === 'knit' ? c.needles : [c.hook]) {
    const tip = built.root.worldToLocal(t.shaft.localToWorld(v3().set(0, 1, 0)));
    const butt = built.root.worldToLocal(t.shaft.localToWorld(v3().set(0, -1, 0)));
    const grip = rootLocal(built, t.wrist), axis = tip.clone().sub(butt);
    const at = grip.clone().sub(butt).dot(axis) / axis.lengthSq();
    assert.ok(at > 0.4 && at < 0.6, `${tag}: gripped at ${(at * 100).toFixed(0)}% of the tool, not the middle`);
    assert.ok(tip.distanceTo(t.tip) < 1e-5, `${tag}: the drawn tip is not where it was aimed`);
    for (let s = -1; s <= 1.001; s += 0.1) {
      const p = grip.clone().lerp(s > 0 ? tip : butt, Math.abs(s));
      for (const w of wings) assert.ok(w.at(p) > w.k, `${tag}: a tool goes through a wing (${w.at(p).toFixed(2)} < ${w.k.toFixed(2)} at ${s.toFixed(1)})`);
      if (Math.abs(s) < 0.3) continue;
      const e = ellipsoid(built, ch, p);
      torsoMargin = Math.min(torsoMargin, e);
      assert.ok(e > 0.94, `${tag}: a tool goes through the body (${e.toFixed(3)} at ${s.toFixed(1)})`);
      for (const [a, b, r] of bones) assert.ok(toSegment(p, a, b) > r, `${tag}: a tool goes through an arm at ${s.toFixed(1)}`);
    }
  }
}

function run(id, P, { mode, pattern }, tag) {
  const { built, seatY } = seated(id, P);
  const c = makeCraft(built, { mode, pattern, progress: 1, perStitch: 0 });
  const opts = { ...MOTION_DEFAULTS }, tips = mode === 'knit' ? c.needles : [c.hook];
  let mins = tips.map(() => Infinity), count = 0, stitches = 0;
  for (let f = 0; f < 4.5 / DT; f++) {
    stepCraft(c, DT);
    stepMotion(built, POSES.sit, DT, opts, c.add);
    built.root.position.y = seatY;
    poseCraft(c);
    if (f < 0.5 / DT) { count = c.count; continue; }
    tips.forEach((t, i) => { mins[i] = Math.min(mins[i], toEdge(c, t.tip)); });
    if (f % 12 === 0) checkTools(c, built, rootLocal(built, built.joints.chest), tag);
    if (c.count === count) continue;
    if (stitches) mins.forEach((m, i) => assert.ok(m < 0.004, `${tag}: tip ${i} stayed ${(m * 1000).toFixed(1)}mm off the work this stitch`));
    mins = tips.map(() => Infinity);
    count = c.count;
    stitches++;
  }
  assert.ok(stitches >= 3, `${tag}: not stitching`);
  checkPiece(c, built, rootLocal(built, built.joints.chest), tag);
}

for (const id of speciesIds()) {
  const kit = getSpecies(id);
  const bodies = [{ ...BASE_PARAMS, ...kit.defaults }, kit.randomise(structuredClone(kit.defaults)), kit.randomise(structuredClone(kit.defaults))];
  bodies.forEach((P, n) => {
    for (const mode of ['knit', 'crochet']) {
      for (const pattern of ['socks', 'hat', 'sweater']) run(id, P, { mode, pattern }, `${id}#${n} ${mode} ${pattern}`);
    }
  });
}

{
  const built = createCharacter({ ...BASE_PARAMS, ...getSpecies('owl').defaults }, 'owl');
  applyPose(built, POSES.sit);
  const bare = lowestResting(built);
  const c = makeCraft(built, { mode: 'knit', pattern: 'sweater', progress: 1 });
  const s = makeSparkle(built);
  playSparkle(s);
  stepSparkle(s, 0.3);
  stepCraft(c, 1);
  applyPose(built, POSES.sit);
  poseCraft(c);
  assert.ok(Math.abs(lowestResting(built) - bare) < 1e-6, 'a prop changed where the seat is measured');
}

{
  assert.ok(SPARKLE_BITS.length >= 3, 'at least three sparkle bits');
  assert.equal(sparkleScale(SPARKLE_TIME + 0.1), 0, 'the burst ends');
  assert.ok(sparkleScale(0.18) > 1.3, 'it pops');
  const settled = Math.min(...[0.5, 1, 1.5, 2].map(sparkleScale));
  const bit = 2 * Math.max(...SPARKLE_BITS.map((b) => b[3]));
  for (const id of speciesIds()) {
    const built = createCharacter({ ...BASE_PARAMS, ...getSpecies(id).defaults }, id);
    const tall = new THREE.Box3().setFromObject(built.root).getSize(v3()).y;
    const px = (bit * settled * 150) / tall;
    assert.ok(px >= 20, `${id}: the biggest sparkle bit is ${px.toFixed(1)}px across at shop distance`);
  }
}
console.log(`craft-anim: closest a tool comes to the torso: ${torsoMargin.toFixed(3)} of its radii`);
console.log('craft-anim: tips through the edge every stitch on every body and size, skill sets the pace, nothing clips; sparkle reads at shop distance');
