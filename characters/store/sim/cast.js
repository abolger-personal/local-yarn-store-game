import { cast, displays, seats, shop } from '../core/state.js';
import { cellRect } from '../../../inventory/notions.js';
import { BANDS, TAILS, bandMatrix, familyExtent, tailMatrix, yarnFit }
  from '../../../inventory/yarn-geometry.js';
import { POSES, applyPose, lowestResting, seatedHipsAlong, phaseStep, stepMotion, valueOf, walkPhase, walkLayer,
  walkGain, topSpeed, createCharacter, mergeCharacter, disposeCharacter, setViewMode } from '../../npc.js';
import { ACTION, STATE } from '../../visit.js';
import { WIP_STATE, readyWips, runningOut, wearOrOffer } from '../../wip.js';
import { dress, pileAs, undress, wornAs } from '../../garments.js';
import { makeCraft, stepCraft, poseCraft, disposeCraft } from '../../craft-anim.js';
import { makeSparkle, playSparkle, stepSparkle } from '../../sparkle.js';
import * as THREE from 'three';
import { BOX_H, CELL, S, SEAT_H } from '../core/config.js';
import { key, scene } from '../scene/stage.js';
import { CHAIR_W } from '../scene/seating.js';
import { FILL, atlas, sizeAtlas } from '../goods/items.js';
import { YARN, YARN_FIT, bandMesh, tailMesh, yarnMeshes } from '../goods/yarn.js';
import { YARN_COLORS, cellNameFor } from '../goods/stock.js';

let heldMat = null, heldBoxMat = null, heldSizeMat = null;

const HELD_W = CELL * FILL, HELD_H = BOX_H;

function heldLabel(atlasPack, material, cellName, w, h) {
  const [u0, v0, du, dv] = cellRect(atlasPack.manifest, cellName);
  const geo = new THREE.PlaneGeometry(w, h);
  const { uv } = geo.attributes;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  uv.needsUpdate = true;
  return new THREE.Mesh(geo, material);
}

function heldMaterials() {
  heldMat ??= new THREE.MeshBasicMaterial({
    map: atlas.texture, color: new THREE.Color('#241e22'),
    transparent: false, alphaTest: 0.45, side: THREE.DoubleSide,
  });
  heldBoxMat ??= new THREE.MeshStandardMaterial({ color: '#e7ddc9', roughness: 0.85, metalness: 0 });
  heldSizeMat ??= new THREE.MeshBasicMaterial({
    map: sizeAtlas.texture, transparent: false, alphaTest: 0.45, side: THREE.DoubleSide,
  });
}

function heldYarn(item, group) {
  const [, uh] = familyExtent(item.shape, YARN.tier);
  const fit = yarnFit(item.shape, item.w, item.h, YARN_FIT);
  const unit = new THREE.Group();
  unit.scale.set(fit.k, fit.ky, fit.k);
  unit.position.y = -(fit.ky * uh) / 2;
  group.add(unit);
  const parts = [[yarnMeshes[item.shape], null, item.color]];
  if (BANDS[item.shape]) parts.push([bandMesh, bandMatrix(item.shape), YARN.bandColor]);
  if (TAILS[item.shape]) parts.push([tailMesh, tailMatrix(item.shape), item.color]);
  for (const [src, local, color] of parts) {
    const part = new THREE.Mesh(src.geometry, src.material.clone());
    if (local) part.applyMatrix4(local);
    part.material.color.set(color);
    part.castShadow = true;
    part.userData.owned = true;
    unit.add(part);
  }
  group.rotation.set(-0.2, 0, 0.2);
}

function heldBox(item, group) {
  const cellName = cellNameFor(item);
  const box = new THREE.Mesh(new THREE.BoxGeometry(HELD_W, HELD_H, HELD_W), heldBoxMat);
  box.castShadow = true;
  group.add(box);

  const top = heldLabel(atlas, heldMat, cellName, HELD_W * 0.7, HELD_W * 0.7);
  top.rotation.x = -Math.PI / 2;
  top.position.y = HELD_H / 2 + 0.002;
  group.add(top);

  const front = heldLabel(atlas, heldMat, cellName, HELD_W * 0.9, HELD_H * 0.56);
  front.position.set(0, HELD_H * 0.12, HELD_W / 2 + 0.002);
  group.add(front);

  if (item.size != null) {
    const mm = heldLabel(sizeAtlas, heldSizeMat, item.size.toFixed(1), HELD_W * 0.46, HELD_H * 0.30);
    mm.position.set(0, -HELD_H * 0.22, HELD_W / 2 + 0.003);
    group.add(mm);
  }
  group.rotation.set(-0.5, 0, 0.35);
}

export function makeHeldNotion(item) {
  heldMaterials();
  const group = new THREE.Group();
  if (item.name === 'yarn') heldYarn(item, group);
  else heldBox(item, group);
  group.position.set(0, -0.02, 0.02);
  return group;
}

const colourOf = (yarn) => YARN_COLORS[yarn.colorIndex % YARN_COLORS.length];

export function outfitOf(npc) {
  const look = { worn: { ...npc.worn }, wips: npc.wips };
  wearOrOffer(look);
  const made = [...Object.values(look.worn).filter(Boolean).map((w) => wornAs(w, colourOf)), pileAs(npc.carries ?? [], colourOf)];
  return Object.fromEntries(made.filter(Boolean).map(({ type, item }) => [type, item]));
}

const laden = (npc) => Boolean(npc.carrying || npc.carries?.length);

export function dressedCharacter(P, kit, outfit) {
  if (!Object.keys(outfit).length) return createCharacter(P, kit);
  const built = createCharacter({ ...P, mergeMeshes: false }, kit);
  if (Object.keys(outfit).length) dress(built, outfit);
  if (P.mergeMeshes) mergeCharacter(built);
  return built;
}

export function disposeRecord(rec) {
  if (rec.craft) disposeCraft(rec.craft);
  rec.craft = null;
  rec.built.root.removeFromParent();
  undress(rec.built);
  disposeCharacter(rec.built);
}

function redress(rec) {
  rec.redress = false;
  const old = rec.built;
  const built = dressedCharacter(rec.npc.body, old.species, rec.outfit);
  for (const k of ['motion', 'groundOffset', 'seatDrop', 'tailTrack']) built[k] = old[k];
  built.root.position.copy(old.root.position);
  built.root.rotation.copy(old.root.rotation);
  built.root.visible = old.root.visible;
  setViewMode(built.root, S.view);
  old.root.parent?.add(built.root);
  if (rec.carriedMesh) built.holds[0].add(rec.carriedMesh);
  if (rec.sparkle) { built.root.add(rec.sparkle.mesh); rec.sparkle.built = built; }
  disposeRecord(rec);
  rec.built = built;
}

export function checkOutfit(rec) {
  const outfit = outfitOf(rec.npc);
  const sig = JSON.stringify(outfit);
  if (sig === rec.outfitKey) return;
  rec.outfit = outfit;
  rec.outfitKey = sig;
  rec.redress = true;
}

function craftingWip(n) {
  if (n.action?.type !== ACTION.WORK_ON_WIP || n.seat === null) return null;
  const wip = n.wips.find((w) => w.id === n.action.params.wip);
  return wip?.state === WIP_STATE.IN_PROGRESS ||
    (wip?.state === WIP_STATE.FINISHED && wip.finishedRound === shop.world?.round) ? wip : null;
}

function craftFor(rec, wip) {
  const c = makeCraft(rec.built, {
    mode: wip.pattern.craft === 'crochet' ? 'crochet' : 'knit', color: colourOf(wip.yarn[0]),
    pattern: wip.pattern.patternType, skill: rec.npc.prefs.skill, progress: wip.progress / 100, perStitch: 0,
  });
  c.wip = wip;
  return c;
}

function stepKnitting(rec, dt) {
  const n = rec.npc;
  if (n.action !== rec.craftFor) { rec.craftFor = n.action; rec.craftWip = craftingWip(n); }
  const wip = rec.craftWip;
  let c = rec.craft;
  if (c && c.wip !== wip) {
    c.mode = 'idle';
    if (c.hands < 0.02) { disposeCraft(c); rec.craft = c = null; }
  }
  if (!c && wip && seatedness(rec) > 0.9) c = rec.craft = craftFor(rec, wip);
  if (!c) return;
  if (c.wip === wip) {
    c.progress = wip.progress / 100;
    c.skill = n.prefs.skill;
    c.tell = runningOut(wip) ? 'out' : 'none';
  }
  stepCraft(c, dt);
}

function checkReady(rec) {
  const n = rec.npc;
  rec.ready ??= readyWips(n);
  if (n.bought.length === rec.boughtN) return;
  rec.boughtN = n.bought.length;
  const ready = readyWips(n);
  if (ready.some((id) => !rec.ready.includes(id))) playSparkle(rec.sparkle ??= makeSparkle(rec.built));
  rec.ready = ready;
}

// CHARACTER-VISIT.md §Celebration
const CELEBRATE_S = 1.6;

const CELEBRATE_HOPS = 3;

const HOP_H = 0.15;

export function rollCheer(rnd = Math.random) {
  return {
    delay: rnd() * 0.55,
    dur: CELEBRATE_S * (0.8 + rnd() * 0.45),
    hops: CELEBRATE_HOPS + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.5 ? 0 : 1),
    height: HOP_H * (0.75 + rnd() * 0.55),
  };
}

function syncCarried(rec) {
  const carried = rec.npc.carrying ?? null;
  const want = carried ? cellNameFor(carried) : null;
  if (rec.carriedName === want) return;
  // ponytail: cheer delay is random, not personality-driven; derive it from enthusiasm in the emotion layer.
  if (!rec.carriedName && want) rec.cheerIn = rec.cheer.delay;
  rec.carriedName = want;
  if (rec.carriedMesh) {
    rec.carriedMesh.removeFromParent();
    rec.carriedMesh.traverse((n) => {
      if (n.userData.owned) { n.material.dispose(); return; }
      n.geometry?.dispose();
    });
    rec.carriedMesh = null;
  }
  if (!want) return;
  rec.carriedMesh = makeHeldNotion(carried);
  rec.built.holds[0].add(rec.carriedMesh);
  if (rec.built.held) rec.built.held.visible = false;
}

function poseFor(npc) {
  if (npc.state === STATE.GONE) return POSES.rest;
  switch (npc.action?.type) {
    case ACTION.INTERACT:       return POSES.reach;
    case ACTION.WALK_TO_SEAT:   return POSES.sit;
    case ACTION.WORK_ON_WIP:    return POSES.sit;
    case ACTION.SIGN_GUESTBOOK: return POSES.reach;
    case ACTION.LEND:           return POSES.delighted;
    case ACTION.WALK_TO_NPC:
    case ACTION.WAIT:           return POSES.browse;
    default:                    return laden(npc) ? POSES.carry : POSES.rest;
  }
}

export const routeLength = (pts) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return total;
};

function alongPolyline(pts, want, fallbackFacing) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + seg < want && i !== pts.length - 1) { acc += seg; continue; }
    const f = seg < 1e-6 ? 1 : Math.min(1, (want - acc) / seg);
    return {
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
      facing: seg < 1e-6 ? fallbackFacing : Math.atan2(b.x - a.x, b.z - a.z),
    };
  }
  return null;
}

const angleLerp = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/** smoothstep's peak speed over its mean */
const EASE_PEAK = 1.5;

// CHARACTER-VISIT.md §Turning and pausing
const TURN_RATE = 8;

const PAUSE_EASE = 4;

const FACING_OK = 0.35;

const STAND_CLEAR = 0.06;

const sitAlong = (P) => seatedHipsAlong(P, CHAIR_W);

const standPoint = (seat, along) => ({ x: seat.x + Math.sin(seat.facing) * along, z: seat.z + Math.cos(seat.facing) * along });

function walkRoute(rec, n, e) {
  const pts = rec.route;
  const last = pts[pts.length - 1];
  const seat = n.action?.type === ACTION.WALK_TO_SEAT ? seats.find((s) => s.id === n.seat) : null;
  const to = seat ? standPoint(seat, CHAIR_W / 2 + STAND_CLEAR) : n;
  last.x = to.x;
  last.z = to.z;
  const total = routeLength(pts);
  const at = alongPolyline(pts, total * e, n.facing);
  return at ? { ...at, total } : { x: n.x, z: n.z, facing: n.facing, total };
}

function seatedness(rec) {
  return Math.min(1, Math.max(0, valueOf(rec.built.motion, 'hipFlex') / POSES.sit.hipFlex));
}

function seatedRootY(rec) {
  return SEAT_H + (rec.built.seatDrop ?? 0) - S.seatLift;
}

function groundOffsetFor(rec) {
  const sat = seatedness(rec);
  const grounded = rec.built.root.position.y - (rec.built.groundOffset ?? 0);
  return sat * (seatedRootY(rec) - grounded) + rec.hop;
}

function stepWalk(rec, n, dt) {
  const wasX = rec.baseX, wasZ = rec.baseZ;
  let routed = false;
  const t = walkClock(rec, dt);

  if (rec.wait > 0) {
    rec.wait -= t;
    if (rec.route[0]) { rec.route[0].x = rec.baseX; rec.route[0].z = rec.baseZ; }
  } else if (rec.moveT < 1) {
    const dur = S.walkSpeed ? Math.max(rec.travelled * secondsPerUnit(rec), 0.05) : rec.dur;
    rec.moveT = Math.min(1, rec.moveT + t / dur);
    const e = rec.moveT * rec.moveT * (3 - 2 * rec.moveT);
    const at = walkRoute(rec, n, e);
    ({ x: rec.baseX, z: rec.baseZ, total: rec.travelled } = at);
    routed = true;
    if (at.total > 0.05) rec.faceTo = at.facing;
  }

  rec.moved = routed ? Math.hypot(rec.baseX - wasX, rec.baseZ - wasZ) : 0;
  rec.speed = dt > 0 ? rec.moved / dt : 0;
}

function walkClock(rec, dt) {
  rec.go += ((S.paused ? 0 : 1) - rec.go) * (1 - Math.exp(-PAUSE_EASE * dt));
  if (S.paused && rec.go < 1e-3) rec.go = 0;
  return dt * rec.go;
}

function stepTurn(rec, n, dt) {
  const type = n.action?.type;
  const atDisplay = type === ACTION.INTERACT || (rec.moveT >= 1 && type === ACTION.WALK_TO_DISPLAY);
  const display = atDisplay ? displays.find((d) => d.id === n.action.params.displayId) : null;
  if (display) rec.faceTo = Math.atan2(display.x - rec.baseX, display.z - rec.baseZ);
  rec.heading = angleLerp(rec.heading, rec.faceTo, 1 - Math.exp(-TURN_RATE * dt));
}

function secondsPerUnit(rec) {
  const P = rec.built.params;
  return Math.max(rec.pace / S.walkSpeed, EASE_PEAK / topSpeed(P.legHeight + P.hipInset, rec.opts));
}

export function measureSeatDrop(built) {
  applyPose(built, POSES.sit);
  const lowest = lowestResting(built);
  const drop = Number.isFinite(lowest) ? built.root.position.y - lowest : 0;
  applyPose(built, POSES.rest);
  return drop;
}

function calibrateSeat(rec, sat) {
  if (rec.seatCal || sat < 0.99) return;
  rec.seatCal = true;
  const b = rec.built;
  const lowest = lowestResting(b);
  if (Number.isFinite(lowest)) b.seatDrop -= lowest - (SEAT_H - S.seatLift);
}

export const STAND_TIME = 0.5;

// CHARACTER-VISIT.md §Sitting
const SIT_LEAN = 0.30;

function placeSeated(rec) {
  const { root } = rec.built;
  const sat = seatedness(rec);
  if (rec.npc.seat !== null) rec.seatRef = seats.find((s) => s.id === rec.npc.seat) ?? null;
  else if (sat < 0.01) rec.seatRef = null;
  const seat = rec.seatRef;
  const face = seat ? angleLerp(rec.heading, seat.facing, sat) : rec.heading;
  root.rotation.y = face;
  root.position.x = rec.baseX;
  root.position.z = rec.baseZ;
  if (!seat) return;
  if (rec.moveT < 1 && rec.travelled > 0.15 && (rec.wait <= 0 || rec.npc.seat === seat.id)) return;
  calibrateSeat(rec, sat);
  const stand = CHAIR_W / 2 + STAND_CLEAR;
  ({ x: rec.baseX, z: rec.baseZ } = standPoint(seat, stand + (sitAlong(rec.built.params) - stand) * sat));
  root.position.x = rec.baseX;
  root.position.z = rec.baseZ;
}

function wantedPose(rec, n) {
  if (rec.celebrate > 0) return POSES.delighted;
  if (n.action?.type === ACTION.WALK_TO_SEAT && rec.moveT < 1) {
    return laden(n) ? POSES.carry : POSES.rest;
  }
  if (n.action?.type === ACTION.INTERACT &&
      Math.abs(Math.atan2(Math.sin(rec.faceTo - rec.heading), Math.cos(rec.faceTo - rec.heading))) > FACING_OK) {
    return POSES.browse;
  }
  return poseFor(n);
}

function stepHop(rec, dt) {
  if (rec.cheerIn > 0) {
    rec.cheerIn -= dt;
    if (rec.cheerIn <= 0) rec.celebrate = rec.cheer.dur;
    rec.hop = 0;
    return;
  }
  if (rec.celebrate <= 0) { rec.hop = 0; return; }
  rec.celebrate = Math.max(0, rec.celebrate - dt);
  const t = 1 - rec.celebrate / rec.cheer.dur;
  rec.hop = Math.abs(Math.sin(t * Math.PI * rec.cheer.hops)) * rec.cheer.height * (1 - t);
}

function stepGait(rec, out, dt) {
  const P = rec.built.params;
  const L = P.legHeight + P.hipInset;
  const speed = rec.celebrate > 0 ? 0 : rec.speed;
  const gain = walkGain(rec.built.motion, speed, dt, rec.opts);
  if (gain > 0) walkLayer(out, walkPhase(rec.phase, speed, L, rec.opts), gain, rec.opts);
  const sat = seatedness(rec);
  out.spineBend += SIT_LEAN * 4 * sat * (1 - sat);
  rec.phase = (rec.phase + phaseStep(rec.moved, speed, L, rec.opts)) % 1;
  rec.craft?.add(out);
}

function tickOne(rec, dt) {
  const n = rec.npc;
  syncCarried(rec);
  checkReady(rec);
  stepWalk(rec, n, dt);
  stepTurn(rec, n, dt);
  stepHop(rec, dt);
  placeSeated(rec);
  rec.built.groundOffset = groundOffsetFor(rec);
  stepKnitting(rec, dt);
  stepMotion(rec.built, wantedPose(rec, n), dt, rec.opts, (out) => stepGait(rec, out, dt));
  if (rec.craft) poseCraft(rec.craft);
  if (rec.sparkle) stepSparkle(rec.sparkle, dt);
  if (rec.carriedMesh) rec.carriedMesh.visible = !(rec.craft?.hands > 0.5);
  if (rec.built.held) rec.built.held.visible = false;
  rec.built.root.visible = n.state !== STATE.GONE;
}

const wantsRedress = (r) => r.redress;

export function tickCast(dt) {
  const next = cast.find(wantsRedress);
  if (next) redress(next);
  for (const rec of cast) tickOne(rec, dt);
  updateBlobs();
}

let blobs = null, blobTex = null;

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.30)');
  g.addColorStop(1.0, 'rgba(0,0,0,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildBlobs() {
  if (blobs) { scene.remove(blobs); blobs.geometry.dispose(); blobs.material.dispose(); blobs = null; }
  if (!S.blobShadows || !cast.length) return;
  blobTex ??= blobTexture();
  blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55 }),
    cast.length,
  );
  blobs.frustumCulled = false;
  scene.add(blobs);
  updateBlobs();
}

const _bm = new THREE.Matrix4();

const _bq = new THREE.Quaternion();

const _bp = new THREE.Vector3();

const _bs = new THREE.Vector3();

function updateBlobs() {
  if (!blobs) return;
  const dx = -key.position.x, dz = -key.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const lx = dx / len, lz = dz / len;
  _bq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-lz, lx));
  cast.forEach((rec, i) => {
    const P = rec.built.params;
    const rx = P.torsoW * 2.8 * 1.45, rz = P.torsoD * 2.8;
    const off = rx * 0.22;
    const p = rec.built.root.position;
    _bp.set(p.x + lx * off, 0.004, p.z + lz * off);
    _bs.set(rx, 1, rz);
    blobs.setMatrixAt(i, _bm.compose(_bp, _bq, _bs));
  });
  blobs.instanceMatrix.needsUpdate = true;
}
