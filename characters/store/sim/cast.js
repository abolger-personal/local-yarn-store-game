// The NPC meshes — walking, carrying, celebrating — and their blob shadows.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { cast } from '../core/state.js';
import { cellRect } from '../../../inventory/notions.js';
import { BANDS, TAILS, bandMatrix, familyExtent, tailMatrix, yarnFit }
  from '../../../inventory/yarn-geometry.js';
import { POSES, POSE_KEYS, applyPose } from '../../npc.js';
import { ACTION, STATE } from '../../visit.js';
import * as THREE from 'three';
import { BOX_H, CELL, S } from '../core/config.js';
import { key, scene } from '../scene/stage.js';
import { FILL, atlas, sizeAtlas } from '../goods/items.js';
import { YARN, YARN_FIT, bandMesh, tailMesh, yarnMeshes } from '../goods/yarn.js';
import { cellNameFor } from '../goods/stock.js';

// ---------------------------------------------------------------- carried notions
//
// A held notion follows a hand, so it CANNOT be instanced — it is a real mesh parented to the rig's
// hold node. inventory/DESIGN-DECISIONS.md §4 calls this out as a deliberate exception to the
// instancing rule: ~10 concurrent NPCs means ~10 extra meshes, which is nothing.
//
// It is a fixed card oriented to the HAND, not a camera-facing billboard — the same doc warns that
// a billboard in a fist pivots independently of the fist and reads as detached. The UVs are baked
// into the geometry rather than fed through the atlas shader, so it needs no per-instance plumbing.
let heldMat = null, heldBoxMat = null, heldSizeMat = null;

// Matched to a shelf box so the thing in the fist is recognisably the thing off the display:
// CELL * FILL wide, one layer tall. A customer walking out should be carrying the PACKAGE they
// took, not a floating illustration of its contents.
const HELD_W = CELL * FILL, HELD_H = BOX_H;

/** One face of the carried package: an atlas cell baked straight into the plane's UVs. */
function heldLabel(atlasPack, material, cellName, w, h) {
  const [u0, v0, du, dv] = cellRect(atlasPack.manifest, cellName);
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  uv.needsUpdate = true;
  return new THREE.Mesh(geo, material);
}

/** The three materials every held item shares. Built on first use: the atlas has to exist. */
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

/**
 * A real ball of yarn in the hand.
 *
 * Finding the thing you came for is the payoff of the visit, so what leaves the shop has to be
 * the thing that was on the shelf, not the placeholder card it used to be. There is at most one
 * held item per NPC, so this is plain meshes rather than instances.
 *
 * Geometry is BORROWED from the shelf's instanced meshes — building a fresh ball per purchase
 * would leak one per sale. The material is cloned, because a held ball needs its own colour and
 * the shelf's is driven by instanceColor. `owned` records exactly that split for the teardown
 * in syncCarried: dispose the material, never the geometry.
 */
function heldYarn(item, group) {
  const [, uh] = familyExtent(item.shape, YARN.tier);
  // The SAME fit the shelf used, so a ball is the size it was when it was picked up. Sizing it to
  // HELD_H instead squeezed every family into one 2.5D layer, which is only correct for a shape
  // that is one layer tall: measured, that left held yarn at 7-85% of its shelf size depending on
  // family and weight, and a customer walking off with a visibly smaller thing than they lifted.
  // A notion box still shrinks to HELD_H, and should: one layer IS what it is on the shelf.
  const fit = yarnFit(item.shape, item.w, item.h, YARN_FIT);
  const unit = new THREE.Group();                 // unit space, so the band's own matrix applies
  unit.scale.set(fit.k, fit.ky, fit.k);
  unit.position.y = -(fit.ky * uh) / 2;           // the family sits ON y=0; the fist wants centred
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

/**
 * A notion, as a labelled box.
 *
 * Top and front only, which is all an orbiting diorama camera can see of something held at chest
 * height. The shelf boxes label all four sides; a fist hides two of them, so the extra geometry
 * per NPC is not worth it.
 */
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

  // A hook's millimetres are the whole point of the target, so they ride out of the shop with it.
  if (item.size != null) {
    const mm = heldLabel(sizeAtlas, heldSizeMat, item.size.toFixed(1), HELD_W * 0.46, HELD_H * 0.30);
    mm.position.set(0, -HELD_H * 0.22, HELD_W / 2 + 0.003);
    group.add(mm);
  }
  // Tipped up out of the fist so the top face reads from the diorama camera, per
  // inventory/DESIGN-DECISIONS.md §4: oriented to the HAND, never a camera-facing billboard,
  // which pivots independently of the fist and reads as detached.
  group.rotation.set(-0.5, 0, 0.35);
}

/** What an NPC carries out of the shop: a real ball, or a labelled box for everything else. */
export function makeHeldNotion(item) {
  heldMaterials();
  const group = new THREE.Group();
  if (item.name === 'yarn') heldYarn(item, group);
  else heldBox(item, group);
  group.position.set(0, -0.02, 0.02);
  return group;
}

// Finding the thing you came for is the payoff of the whole visit, and until now the only sign of
// it was a line in the debug panel — an NPC left looking exactly like an NPC who had given up.
// Placeholder per P1-SPIKE-PLAN: the `delighted` pose plus a few decaying hops.
// TODO: a real celebration beat — squash on landing, and the ear perk timed to the apex.
const CELEBRATE_S = 1.6;

const CELEBRATE_HOPS = 3;

const HOP_H = 0.10;

/** Show what an NPC bought, in their hand, from the round they pick it up. */
function syncCarried(rec) {
  const carried = rec.npc.carrying ?? null;
  // Keyed by the CELL, not the bare name: an NPC swapping a ball of yarn for a cone is carrying a
  // different-looking thing even though both are "yarn".
  const want = carried ? cellNameFor(carried) : null;
  if (rec.carriedName === want) return;
  // null -> something is the moment of the buy, and the only place in the render layer that knows
  // it happened. Not on the way back: putting an item down is not worth a dance.
  if (!rec.carriedName && want) rec.celebrate = CELEBRATE_S;
  rec.carriedName = want;
  if (rec.carriedMesh) {
    rec.carriedMesh.removeFromParent();
    // A group now, not a single plane: the box, its labels and the size sticker each own geometry.
    // Materials are module-level and shared across every NPC, so they must NOT be disposed here —
    // except a held ball's per-NPC colour clone, which is flagged `owned` because it is. Its
    // GEOMETRY is the shared family mesh and disposing it would blank the shelf.
    rec.carriedMesh.traverse((n) => {
      if (n.userData.owned) { n.material.dispose(); return; }
      n.geometry?.dispose();
    });
    rec.carriedMesh = null;
  }
  if (!want) return;
  rec.carriedMesh = makeHeldNotion(carried);
  rec.built.holds[0].add(rec.carriedMesh);
  if (rec.built.held) rec.built.held.visible = false;   // hide the rig's default skein
}

/** Which static pose an NPC holds once they have arrived for the round. */
function poseFor(npc) {
  if (npc.state === STATE.GONE) return POSES.rest;
  switch (npc.action?.type) {
    case ACTION.INTERACT:       return POSES.reach;
    case ACTION.WALK_TO_SEAT:   return POSES.sit;   // they arrive and sit down in the same round
    case ACTION.WORK_ON_WIP:    return POSES.sit;
    case ACTION.SIGN_GUESTBOOK: return POSES.reach;
    case ACTION.DROP_OFF:       return POSES.delighted;
    case ACTION.WALK_TO_NPC:
    case ACTION.WAIT:           return POSES.browse;
    default:                    return npc.carrying ? POSES.carry : POSES.rest;
  }
}

export const routeLength = (pts) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return total;
};

/**
 * Where along this round's route the NPC is at eased fraction `e`, and which way they are facing.
 *
 * Constant SPEED along the polyline, not constant time per leg — otherwise a short dodge around a
 * corner takes as long as the long stretch after it, and the walk visibly stalls at every turn.
 */
/** The point a fraction `want` of the way along a polyline, and the heading of the leg it is on. */
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

function walkRoute(rec, n, e) {
  const pts = rec.route;
  const last = pts[pts.length - 1];
  last.x = n.x;   // the destination can move after the round begins: a display dragged out from
  last.z = n.z;   // under them, or separation nudging them clear of a neighbour
  const total = routeLength(pts);
  const at = alongPolyline(pts, total * e, n.facing);
  return at ? { ...at, total } : { x: n.x, z: n.z, facing: n.facing, total };
}

// TODO: there is no walk cycle. Movement follows the round's route holding the static `walk` pose.
// P1-SPIKE-PLAN.md step E owns the real one. The route itself comes from findPath() in visit.js —
// a visibility graph over the furniture, which is what stopped NPCs walking through tables.
const blended = {};

const BLEND = 0.35;

/**
 * Advance one NPC along this round's route.
 *
 * Holds at the round's start position until this NPC's own stagger elapses. No position write is
 * needed while waiting: the root is already sitting at `from`, where last round left it.
 */
function stepWalk(rec, n, dt) {
  if (rec.wait > 0) { rec.wait -= dt; return; }
  if (rec.moveT >= 1) return;
  rec.moveT = Math.min(1, rec.moveT + dt / (rec.dur ?? S.travel));
  const e = rec.moveT * rec.moveT * (3 - 2 * rec.moveT);
  const at = walkRoute(rec, n, e);
  rec.built.root.position.set(at.x, rec.fromY + (rec.toY - rec.fromY) * e, at.z);
  rec.travelled = at.total;
  // Facing comes from the LEG being walked, not from the start-to-end line: rounding a table
  // means turning, and an NPC who keeps facing their final destination crabs sideways.
  if (at.total > 0.05) rec.built.root.rotation.y = at.facing;
}

/**
 * Which pose this NPC should be in.
 *
 * Delight outranks everything, including the walk: an NPC who buys as they turn away should stop
 * and cheer, and a customer gliding out mid-cheer is the tell that this is a placeholder. And
 * still WAITING is not moving — without that test they walk on the spot before setting off.
 */
function wantedPose(rec, n) {
  const celebrating = rec.celebrate > 0;
  const moving = !celebrating && rec.wait <= 0 && rec.moveT < 1 && rec.travelled > 0.05;
  if (celebrating) return POSES.delighted;
  if (moving) return n.carrying ? POSES['walk+carry'] : POSES.walk;
  return poseFor(n);
}

/** Cross-fade toward `want`, starting from wherever the current blend actually is. */
function stepPose(rec, want, dt) {
  if (want !== rec.poseTo) {
    for (const k of POSE_KEYS) rec.poseFrom[k] = blendedValue(rec, k);
    rec.poseFrom.holdItem = rec.poseTo.holdItem;
    rec.poseTo = want;
    rec.pt = 0;
  }
  if (rec.pt >= 1) return;
  rec.pt = Math.min(1, rec.pt + dt / BLEND);
  const e = rec.pt * rec.pt * (3 - 2 * rec.pt);
  for (const k of POSE_KEYS) blended[k] = rec.poseFrom[k] + (rec.poseTo[k] - rec.poseFrom[k]) * e;
  blended.holdItem = rec.pt > 0.5 ? rec.poseTo.holdItem : rec.poseFrom.holdItem;
  applyPose(rec.built, blended);
}

/**
 * The celebration hop.
 *
 * abs(sin) touches down between hops instead of floating; the (1 - t) taper lands them softly on
 * the last one rather than cutting the bounce off mid-air.
 */
function stepHop(rec, dt) {
  if (rec.celebrate <= 0) return;
  rec.celebrate = Math.max(0, rec.celebrate - dt);
  const t = 1 - rec.celebrate / CELEBRATE_S;
  rec.hop = Math.abs(Math.sin(t * Math.PI * CELEBRATE_HOPS)) * HOP_H * (1 - t);
  rec.built.root.position.y += rec.hop;
}

function tickOne(rec, dt) {
  const n = rec.npc;
  // Undo last frame's hop before anything else reads or writes y. Both the walk tween and
  // applyPose (via groundCharacter) rewrite y while they are running and neither is running once
  // an NPC has settled — so adding an offset in place would be correct half the time and would
  // launch a stationary NPC through the ceiling the other half. Removing it first composes with
  // both, and needs no captured baseline.
  if (rec.hop) { rec.built.root.position.y -= rec.hop; rec.hop = 0; }
  // The buy lands in syncCarried, so read it BEFORE choosing this frame's pose or the celebration
  // starts a frame late — visible at 60fps on a beat this short.
  syncCarried(rec);
  stepWalk(rec, n, dt);
  stepPose(rec, wantedPose(rec, n), dt);
  // The rig's placeholder skein is never correct in this game: a customer is either carrying the
  // real package or carrying nothing at all. So it is forced off every frame, unconditionally,
  // rather than only when a real notion has replaced it — applyPose turns it back on for any pose
  // with holdItem set (carry, walk+carry), and relying on the pose to keep it off is what left
  // every NPC holding one. It belongs to crowd.html's pose demo, not here.
  if (rec.built.held) rec.built.held.visible = false;
  stepHop(rec, dt);
  rec.built.root.visible = n.state !== STATE.GONE;
}

export function tickCast(dt) {
  for (const rec of cast) tickOne(rec, dt);
  updateBlobs();
}

function blendedValue(rec, k) {
  const e = rec.pt * rec.pt * (3 - 2 * rec.pt);
  return rec.poseFrom[k] + (rec.poseTo[k] - rec.poseFrom[k]) * e;
}

// ---------------------------------------------------------------- blob shadows
// Same trade as crowd.html: one instanced draw for the whole cast instead of a second shadow pass.
// Unlike crowd.html these follow the characters, because here the characters actually move.
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
