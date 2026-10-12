// CRAFT-ANIM.md; VISUAL-DESIGN-FINISHED-OBJ.md §4b; PROJECTS-AND-AUTHORSHIP.md §1
import * as THREE from 'three';
import { POSES, applyPose, knitMaterial } from './npc.js';
import { PATTERN_TYPES } from '../inventory/catalog.js';

export const CRAFT_MODES = Object.freeze(['knit', 'crochet', 'idle']);
export const TELLS = Object.freeze(['none', 'out']);

export const STITCH_TIME = Object.freeze({ knit: 0.7, crochet: 0.9 });

const RIGHT = -1, LEFT = 1;
const HOLD_R = 0, HOLD_L = 1;

export const HOLD = Object.freeze({ armSwing: -0.60, armOut: -0.30, elbowBend: 0.20, headPitch: 0.45, spineBend: 0.08 });
const HOLD_KEYS = Object.keys(HOLD);

const PIECE = Object.freeze({ w: 0.10, h0: 0.02, h1: 0.13 });
const WING_CLEAR = 1.2;
const ABOVE_LAP = 0.03;
const BALL_R = 0.04;
const STRAND_N = 12, STRAND_R = 0.005;
const ROWS = 18;
const GLANCE_PERIOD = 4;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bump = (a, b, x) => smooth(a, (a + b) / 2, x) - smooth((a + b) / 2, b, x);

export const pieceScale = (type) => 2 + ((PATTERN_TYPES[type]?.yarnUnits ?? 3) - 3) * 0.7;

export const skillRate = (skill) => 0.55 + 0.8 * clamp01((skill - 1) / 4);

export function hesitation(skill, count) {
  const h = Math.sin(count * 78.233 + 1.7) * 43758.5453;
  return clamp01((5 - skill) / 4) * 0.6 * (h - Math.floor(h));
}

export const skillReach = (skill) => 1.2 - 0.1 * skill;

export function stitchBeat(mode, phase, out) {
  const p = phase - Math.floor(phase);
  if (mode === 'crochet') {
    out.reach = smooth(0, 0.25, p) - smooth(0.5, 0.7, p);
    out.wrap = bump(0.2, 0.5, p);
    out.pull = bump(0.65, 1, p);
    out.push = 0.5 * bump(0.1, 0.6, p);
  } else {
    out.reach = smooth(0, 0.3, p) - smooth(0.5, 0.8, p);
    out.wrap = bump(0.28, 0.52, p);
    out.pull = 0;
    out.push = bump(0.72, 1, p);
  }
  return out;
}

export function toolTargets(mode, b, k, right, left) {
  if (mode === 'crochet') {
    right.x = -0.008 * b.wrap * k - 0.03 * b.pull * k;
    right.y = 0.01 * b.wrap * k + 0.03 * b.pull * k;
    right.z = 0.02 - 0.04 * b.reach * k;
    left.x = 0; left.y = 0; left.z = 0;
  } else {
    right.x = 0.035 + 0.012 * b.reach * k;
    right.y = 0.012 * b.wrap * k;
    right.z = 0.018 - 0.04 * b.reach * k;
    left.x = -0.035; left.y = 0.012 * b.push * k; left.z = 0.01 * b.push * k;
  }
}

export const glance = (t) => {
  const u = (t / GLANCE_PERIOD) % 1;
  return smooth(0.3, 0.42, u) - smooth(0.8, 0.92, u);
};

export function advanceStitch(c, dt) {
  const t = STITCH_TIME[c.mode];
  if (!t) return;
  let go = (dt * c.speed * (1 - c.outT) * skillRate(c.skill)) / t;
  const waited = Math.min(c.wait, go);
  c.wait -= waited;
  go -= waited;
  c.phase += go;
  while (c.phase >= 1) {
    c.phase -= 1;
    c.count++;
    c.progress = Math.min(1, c.progress + c.perStitch);
    c.wait = hesitation(c.skill, c.count);
  }
}

export function stepCraft(c, dt) {
  const k = 1 - Math.exp(-dt * 5);
  c.hands += ((c.mode === 'idle' ? 0 : 1) - c.hands) * k;
  c.outT += ((c.tell === 'out' ? 1 : 0) - c.outT) * k;
  c.t += dt;
  advanceStitch(c, dt);
  stitchBeat(c.mode, c.phase, c.beat);
  toolTargets(c.mode, c.beat, skillReach(c.skill) * (1 - c.outT), c.offR, c.offL);
}

function swingArm(out, side, a) {
  out.armSwing += a / 2;
  out.armSwingAlt -= (side * a) / 2;
}
function spreadArm(out, side, a) {
  out.armOut += a / 2;
  out.armOutAlt += (side * a) / 2;
}

function rhythmLayer(c, out) {
  const g = (1 - c.outT) * c.hands * skillReach(c.skill), b = c.beat;
  if (c.mode === 'crochet') {
    swingArm(out, RIGHT, -0.08 * b.reach * g);
    spreadArm(out, RIGHT, 0.10 * b.pull * g);
    swingArm(out, LEFT, -0.04 * b.push * g);
  } else {
    swingArm(out, RIGHT, (-0.10 * b.reach + 0.04 * b.wrap) * g);
    spreadArm(out, RIGHT, 0.05 * b.wrap * g);
    swingArm(out, LEFT, -0.07 * b.push * g);
  }
}

function tellLayer(c, out) {
  const o = c.outT * c.hands;
  if (o <= 0.001) return;
  const g = glance(c.t);
  out.headPitch -= (0.45 + 0.15 * g) * o;
  out.headYaw += c.wallYaw * g * o;
}

export function craftLayer(c, out) {
  const h = c.hands;
  if (h <= 0.001) return;
  for (const k of HOLD_KEYS) out[k] += HOLD[k] * h;
  rhythmLayer(c, out);
  tellLayer(c, out);
}

let woodMat = null;
const yarnMats = new Map(), pieceMats = new Map();
const NEEDLE_GEO = new THREE.CylinderGeometry(0.004, 0.012, 2, 8);
const HOOK_GEO = new THREE.CylinderGeometry(0.009, 0.009, 2, 8);
const KNOB_R = 0.017;
const BARB_GEO = new THREE.TorusGeometry(0.013, 0.005, 5, 10, Math.PI);
const BALL_GEO = new THREE.SphereGeometry(1, 12, 8);

function cached(map, color, make) {
  if (!map.has(color)) map.set(color, make(color));
  return map.get(color);
}
const yarnMat = (color) => cached(yarnMats, color, knitMaterial);
const pieceMat = (color) => cached(pieceMats, color, (c) => Object.assign(knitMaterial(c), { side: THREE.DoubleSide }));

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _g = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

const rootLocal = (c, node, out) => c.root.worldToLocal(node.getWorldPosition(out));

function bellyFront(built, chest, y) {
  const P = built.params, s = 1 + (built.bulge ?? 0);
  const dy = (y - chest.y) / (P.torsoH * s);
  return chest.z + (Math.abs(dy) < 1 ? P.torsoD * s * Math.sqrt(1 - dy * dy) : 0);
}

function measureLap(c) {
  const { built } = c, P = built.params;
  const pose = { ...POSES.sit };
  for (const k of HOLD_KEYS) pose[k] += HOLD[k];
  applyPose(built, pose);
  c.root.updateMatrixWorld(true);
  const hip = rootLocal(c, built.joints.upperLeg[0].node, new THREE.Vector3());
  const knee = rootLocal(c, built.joints.lowerLeg[0].node, new THREE.Vector3());
  const chest = rootLocal(c, built.joints.chest, new THREE.Vector3());
  c.lapY = Math.max(hip.y, knee.y) + P.limbThick + 0.005;
  c.kneeFront = knee.z + P.limbThick + 0.01;
  const y = c.lapY + ABOVE_LAP;
  c.work.set(0, y, bellyFront(built, chest, y) + 0.08);
}

function makeTool(c, hold, hook = false) {
  const side = hold === HOLD_R ? RIGHT : LEFT;
  const wrist = new THREE.Group();
  const shaft = new THREE.Mesh(hook ? HOOK_GEO : NEEDLE_GEO, woodMat);
  const end = new THREE.Mesh(hook ? BARB_GEO : BALL_GEO, woodMat);
  if (!hook) end.scale.setScalar(KNOB_R);
  wrist.add(shaft, end);
  c.built.holds[hold].add(wrist);
  return {
    hold: c.built.holds[hold], wrist, shaft, end, hook, tip: new THREE.Vector3(),
    arm: c.built.joints.upperArm.find((j) => j.side === side).node, wing: wingFrame(c.built, side),
  };
}

function wingFrame(built, side) {
  const shape = built.species.wingShape?.(built.params);
  if (!shape) return null;
  const [x, y, z] = shape.pos, [sx, sy, sz] = shape.scale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x * side, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * shape.roll),
    new THREE.Vector3(sx, sy, sz).multiplyScalar(WING_CLEAR),
  );
}

function makeRibbon(n, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const index = [];
  for (let i = 0; i < n - 1; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function makeStrand(mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STRAND_N * 4 * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(STRAND_N * 4 * 3), 3));
  const index = [];
  for (let i = 0; i < STRAND_N - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j, b = i * 4 + ((j + 1) % 4);
      index.push(a, b, a + 4, b, b + 4, a + 4);
    }
  }
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function buildProps(c) {
  woodMat ??= new THREE.MeshStandardMaterial({ color: '#c9a06a', roughness: 0.55, metalness: 0 });
  const mat = yarnMat(c.color);
  c.needles = [makeTool(c, HOLD_R), makeTool(c, HOLD_L)];
  c.hook = makeTool(c, HOLD_R, true);
  c.piece = makeRibbon(ROWS + 1, pieceMat(c.color));
  c.ball = new THREE.Mesh(BALL_GEO, mat);
  c.ball.scale.setScalar(BALL_R);
  c.ball.position.set(-(c.built.params.torsoW * (1 + (c.built.bulge ?? 0)) + 0.12), 0, 0.06);
  c.strand = makeStrand(mat);
  for (const m of [c.ball, c.piece, c.strand]) m.userData.prop = true;
  c.props.add(c.ball, c.strand, c.piece);
  for (const o of [c.props, c.hook.wrist, ...c.needles.map((n) => n.wrist)]) o.userData.noMerge = true;
  c.root.add(c.props);
}

export function makeCraft(built, { mode = 'knit', color = '#c8657a', pattern = 'hat', skill = 3, progress = 0.2, wallYaw = 0.9, speed = 1.5, perStitch = 1 / 400 } = {}) {
  const c = {
    built, root: built.root, mode, tell: 'none', color, pattern, skill, progress, wallYaw, speed, perStitch,
    t: 0, phase: 0, count: 0, wait: 0, hands: 0, outT: 0,
    beat: { reach: 0, wrap: 0, pull: 0, push: 0 },
    offR: { x: 0, y: 0, z: 0 }, offL: { x: 0, y: 0, z: 0 },
    work: new THREE.Vector3(), lapY: 0, kneeFront: 0, pieceW: 0, pieceLen: 0, floor: Number.NaN, props: new THREE.Group(),
    needles: null, hook: null, piece: null, ball: null, strand: null, add: null,
  };
  c.add = (out) => craftLayer(c, out);
  measureLap(c);
  buildProps(c);
  return c;
}

// ponytail: the tool telescopes ~1cm as the hand rhythm moves the paw; invisible at shop distance, upgrade is arm IK.
function aim(c, tool, off, spin = 0) {
  tool.hold.updateWorldMatrix(true, false);
  tool.tip.set(c.work.x + off.x, c.work.y + off.y, c.work.z + off.z);
  c.root.localToWorld(_v.copy(tool.tip));
  gripAt(tool, _v, _g);
  tool.hold.worldToLocal(_v);
  tool.wrist.position.copy(tool.hold.worldToLocal(_g));
  const len = _v.sub(_g).length();
  tool.wrist.quaternion.setFromUnitVectors(UP, _v.divideScalar(len || 1));
  if (spin) tool.wrist.quaternion.multiply(_q.setFromAxisAngle(UP, spin));
  tool.shaft.scale.y = len;
  if (tool.hook) tool.end.position.set(0.01, len, 0);
  else tool.end.position.set(0, -len, 0);
}

function gripAt(tool, tip, out) {
  tool.hold.getWorldPosition(out);
  if (!tool.wing) return out;
  _m1.multiplyMatrices(tool.arm.matrixWorld, tool.wing);
  _m2.copy(_m1).invert();
  const e = _e.copy(tip).applyMatrix4(_m2), d = e.length();
  if (d <= 1.0001) return out;
  e.divideScalar(d);
  const paw = out.applyMatrix4(_m2);
  paw.addScaledVector(e, -paw.dot(e));
  if (paw.lengthSq() < 1e-12) paw.crossVectors(e, Math.abs(e.y) > 0.9 ? X : UP);
  paw.normalize().multiplyScalar(Math.sqrt(1 - 1 / (d * d))).addScaledVector(e, 1 / d);
  return paw.applyMatrix4(_m1);
}

export function drapeAt(s, d, out) {
  const { y: y0, z: z0 } = d.work;
  const lap = Math.min(d.lapY, y0);
  let left = s, y = y0, z = z0;
  const step = (len) => {
    const t = Math.min(Math.max(len, 0), left);
    left -= t;
    return t;
  };
  if (z0 < d.kneeFront) {
    y -= step(y0 - lap);
    z += step(d.kneeFront - z0);
    y -= step(lap - d.floor);
  } else y -= step(y0 - d.floor);
  out.y = y;
  out.z = z + left;
  return out;
}

const _p = { y: 0, z: 0 }, _p2 = { y: 0, z: 0 };

function ribbonRow(c, i, s) {
  const { position: pos, normal: nrm } = c.piece.geometry.attributes;
  drapeAt(s, c, _p);
  drapeAt(s + 0.003, c, _p2);
  const ty = _p2.y - _p.y, tz = _p2.z - _p.z, tl = Math.hypot(ty, tz) || 1, hw = c.pieceW / 2;
  pos.setXYZ(i * 2, c.work.x - hw, _p.y, _p.z);
  pos.setXYZ(i * 2 + 1, c.work.x + hw, _p.y, _p.z);
  nrm.setXYZ(i * 2, 0, tz / tl, -ty / tl);
  nrm.setXYZ(i * 2 + 1, 0, tz / tl, -ty / tl);
}

function drapePiece(c) {
  const scale = pieceScale(c.pattern);
  const len = scale * (PIECE.h0 + (PIECE.h1 - PIECE.h0) * c.progress);
  const floor = 0.005 - c.root.position.y;
  if (Math.abs(len - c.pieceLen) < 1e-4 && Math.abs(floor - c.floor) < 1e-4 && c.pieceW === PIECE.w * scale) return;
  c.pieceLen = len;
  c.floor = floor;
  c.pieceW = PIECE.w * scale;
  for (let i = 0; i <= ROWS; i++) ribbonRow(c, i, (i / ROWS) * len);
  const { position: pos, normal: nrm } = c.piece.geometry.attributes;
  pos.needsUpdate = nrm.needsUpdate = true;
}

const _t = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _a = new THREE.Vector3();

function strandRing(pos, nrm, i, p, t) {
  _s1.crossVectors(t, Math.abs(t.y) > 0.9 ? X : UP).normalize();
  _s2.crossVectors(t, _s1).normalize();
  for (let j = 0; j < 4; j++) {
    const n = j % 2 ? _s2 : _s1, sign = j < 2 ? 1 : -1;
    pos.setXYZ(i * 4 + j, p.x + n.x * sign * STRAND_R, p.y + n.y * sign * STRAND_R, p.z + n.z * sign * STRAND_R);
    nrm.setXYZ(i * 4 + j, n.x * sign, n.y * sign, n.z * sign);
  }
}

function drapeStrand(c, a, b) {
  const { position: pos, normal: nrm } = c.strand.geometry.attributes;
  const sag = 0.25 * Math.hypot(b.x - a.x, b.z - a.z) + 0.01;
  for (let i = 0; i < STRAND_N; i++) {
    const s = i / (STRAND_N - 1);
    const dip = sag * 4 * s * (1 - s), slope = sag * 4 * (1 - 2 * s);
    _a.set(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s - dip, a.z + (b.z - a.z) * s);
    _t.set(b.x - a.x, b.y - a.y - slope, b.z - a.z).normalize();
    strandRing(pos, nrm, i, _a, _t);
  }
  pos.needsUpdate = nrm.needsUpdate = true;
}

function showTools(c, on) {
  const knit = on && c.mode === 'knit', crochet = on && c.mode === 'crochet';
  for (const n of c.needles) n.wrist.visible = knit;
  c.hook.wrist.visible = crochet;
  c.props.visible = on;
}

// ponytail: the ball sits on y = 0 of the root's parent (a floor-level scene); a chair-top or lap ball needs the owner to set c.ball.position.
function poseYarn(c, tip) {
  c.ball.position.y = BALL_R - c.root.position.y;
  const gone = c.outT > 0.5;
  c.ball.visible = !gone;
  if (gone) drapeStrand(c, tip, _w.set(tip.x + 0.01, tip.y - 0.10, tip.z + 0.02));
  else drapeStrand(c, _w.set(c.ball.position.x, c.ball.position.y + BALL_R, c.ball.position.z), tip);
}

export function poseCraft(c) {
  const on = c.hands > 0.5 && c.mode !== 'idle';
  showTools(c, on);
  if (!on) return;
  if (c.mode === 'knit') {
    aim(c, c.needles[0], c.offR);
    aim(c, c.needles[1], c.offL);
  } else aim(c, c.hook, c.offR, 2.2 * c.beat.wrap * (1 - c.outT));
  drapePiece(c);
  poseYarn(c, c.mode === 'knit' ? c.needles[0].tip : c.hook.tip);
}

export function disposeCraft(c) {
  for (const t of [...c.needles, c.hook]) t.wrist.removeFromParent();
  c.props.removeFromParent();
  c.piece.geometry.dispose();
  c.strand.geometry.dispose();
}
