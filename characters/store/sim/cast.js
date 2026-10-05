// The NPC meshes — walking, carrying, celebrating — and their blob shadows.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { cast, displays, seats } from '../core/state.js';
import { cellRect } from '../../../inventory/notions.js';
import { BANDS, TAILS, bandMatrix, familyExtent, tailMatrix, yarnFit }
  from '../../../inventory/yarn-geometry.js';
import { POSES, applyPose, lowestResting, seatedHipsAlong, phaseStep, stepMotion, valueOf, walkPhase, walkLayer,
  walkGain, topSpeed, createCharacter, mergeCharacter, disposeCharacter, setViewMode } from '../../npc.js';
import { ACTION, STATE } from '../../visit.js';
import { WIP_STATE, readyWips, runningOut, wearOrOffer } from '../../wip.js';
import { dress, undress, wornAs } from '../../garments.js';
import { makeCraft, stepCraft, poseCraft, disposeCraft } from '../../craft-anim.js';
import { makeSparkle, playSparkle, stepSparkle } from '../../sparkle.js';
import * as THREE from 'three';
import { BOX_H, CELL, S, SEAT_H } from '../core/config.js';
import { key, scene } from '../scene/stage.js';
import { CHAIR_W } from '../scene/seating.js';
import { FILL, atlas, sizeAtlas } from '../goods/items.js';
import { YARN, YARN_FIT, bandMesh, tailMesh, yarnMeshes } from '../goods/yarn.js';
import { YARN_COLORS, cellNameFor } from '../goods/stock.js';

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
  const { uv } = geo.attributes;
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

// ---------------------------------------------------------------- what they made, worn
//
// WEARABLE-FINISHED-OBJ.md: a customer wears what they made, one per slot. The body is merged for
// draw calls, and a merged body cannot be measured for a garment, so the clothes go on BEFORE the
// merge (as crowd.js does): built un-merged, dressed, then merged. Measured in node at the shop's
// 150px cut: +1 draw per dressed NPC (the garment family), and 6-7ms a body plain against 7-29ms
// dressed (1 to 6 items). Done at spawn and when what they wear changes -- never per frame, and at
// most one body a frame (tickCast), so a round where two customers finish is not one long hitch.

const colourOf = (yarn) => YARN_COLORS[yarn.colorIndex % YARN_COLORS.length];

/**
 * What they have on, as dress() takes it: what the sim has them wearing, plus anything finished
 * that wearOrOffer will put on them at closeout -- run on a copy, so a finish shows on them the
 * round it happens, and the sim's own move still happens when the sim makes it.
 */
export function outfitOf(npc) {
  const look = { worn: { ...npc.worn }, wips: npc.wips };
  wearOrOffer(look);
  const made = Object.values(look.worn).filter(Boolean).map((w) => wornAs(w, colourOf)).filter(Boolean);
  return Object.fromEntries(made.map(({ type, item }) => [type, item]));
}

/** A body for these params, wearing `outfit`, merged if the params say so. */
export function dressedCharacter(P, kit, outfit) {
  if (!Object.keys(outfit).length) return createCharacter(P, kit);
  const built = createCharacter({ ...P, mergeMeshes: false }, kit);
  if (Object.keys(outfit).length) dress(built, outfit);
  if (P.mergeMeshes) mergeCharacter(built);
  return built;
}

/** Everything one cast record owns on the GPU. */
export function disposeRecord(rec) {
  if (rec.craft) disposeCraft(rec.craft);
  rec.craft = null;
  rec.built.root.removeFromParent();
  undress(rec.built);   // an un-merged dressed body's garments are geometry of their own
  disposeCharacter(rec.built);
}

/** Put a new body on a record, in the old one's place and mid-motion: the clothes changed. */
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
  disposeRecord(rec);     // the craft too: it is measured off the body, and comes back next frame
  rec.built = built;
}

/** Once a round (world.js): has what they are wearing changed? Rebuilt in tickCast, one a frame. */
export function checkOutfit(rec) {
  const outfit = outfitOf(rec.npc);
  const sig = JSON.stringify(outfit);
  if (sig === rec.outfitKey) return;
  rec.outfit = outfit;
  rec.outfitKey = sig;
  rec.redress = true;
}

// ---------------------------------------------------------------- sit and knit
//
// craft-anim.js on a customer working on a WIP in a chair: needles or a hook from the pattern, the
// piece sized by its type, pace by their skill, the running-out tell from the yarn they hold, and
// the ball on the floor beside the chair. A WIP with no pattern (or not started) has nothing to
// knit, so no craft. Built when they have sat down, and put away -- hands back, then disposed --
// when the round is something else, so standing up is not a snap.

/** The WIP this round has them knitting, or null. IN_PROGRESS implies a pattern, yarn and tool. */
function craftingWip(n) {
  if (n.action?.type !== ACTION.WORK_ON_WIP || n.seat === null) return null;
  const wip = n.wips.find((w) => w.id === n.action.params.wip);
  return wip?.state === WIP_STATE.IN_PROGRESS ? wip : null;
}

/** Needles or a hook, the piece and the ball, for this WIP in this body. */
function craftFor(rec, wip) {
  const c = makeCraft(rec.built, {
    mode: wip.pattern.craft === 'crochet' ? 'crochet' : 'knit', color: colourOf(wip.yarn[0]),
    pattern: wip.pattern.patternType, skill: rec.npc.prefs.skill, progress: wip.progress / 100, perStitch: 0,
  });
  c.wip = wip;
  return c;
}

/** Per frame; allocates only on a round change and when a craft is built. */
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
    c.progress = wip.progress / 100;      // the sim's to set; it grows a round at a time
    c.skill = n.prefs.skill;
    c.tell = runningOut(wip) ? 'out' : 'none';
  }
  stepCraft(c, dt);
}

/** READY: the buy that gives one of their projects everything it needs (PROJECTS-AND-AUTHORSHIP.md §1). */
function checkReady(rec) {
  const n = rec.npc;
  rec.ready ??= readyWips(n);   // already ready when they walked in: no sparkle for that
  if (n.bought.length === rec.boughtN) return;
  rec.boughtN = n.bought.length;
  const ready = readyWips(n);
  if (ready.some((id) => !rec.ready.includes(id))) playSparkle(rec.sparkle ??= makeSparkle(rec.built));
  rec.ready = ready;
}

// Finding the thing you came for is the payoff of the whole visit, and until now the only sign of
// it was a line in the debug panel — an NPC left looking exactly like an NPC who had given up.
// Placeholder per P1-SPIKE-PLAN: the `delighted` pose plus a few decaying hops.
// TODO: a real celebration beat — squash on landing, and the ear perk timed to the apex.
const CELEBRATE_S = 1.6;

const CELEBRATE_HOPS = 3;

const HOP_H = 0.10;

/**
 * One character's own version of the celebration, rolled once at spawn.
 *
 * Exported so world.js can put it on the record; the numbers live here because this is the file
 * that reads them, and the constants above are the middle of each range.
 */
export function rollCheer(rnd = Math.random) {
  return {
    // Long enough to break the unison, short enough that nobody looks slow on the uptake.
    delay: rnd() * 0.55,
    dur: CELEBRATE_S * (0.8 + rnd() * 0.45),
    // A whole number, or the taper cuts the last hop off mid-air instead of landing it.
    hops: CELEBRATE_HOPS + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.5 ? 0 : 1),
    height: HOP_H * (0.75 + rnd() * 0.55),
  };
}

/** Show what an NPC bought, in their hand, from the round they pick it up. */
function syncCarried(rec) {
  const carried = rec.npc.carrying ?? null;
  // Keyed by the CELL, not the bare name: an NPC swapping a ball of yarn for a cone is carrying a
  // different-looking thing even though both are "yarn".
  const want = carried ? cellNameFor(carried) : null;
  if (rec.carriedName === want) return;
  // null -> something is the moment of the buy, and the only place in the render layer that knows
  // it happened. Not on the way back: putting an item down is not worth a dance.
  // THE BUY IS LOCKSTEP; THE CHEER MUST NOT BE.
  //
  // advanceRound resolves every customer in one call, so everyone who buys this round buys on
  // the same frame -- and the celebration had no per-character variation whatever: the same
  // 1.6s, the same three hops, the same height. A whole shop punching the air in perfect unison.
  //
  // `cheer` is the character's own take on it, rolled once at spawn (world.js): a pause before
  // it lands, then a duration, hop count and height of their own. The pause is the important
  // one -- people react to their own good news at their own speed, and a shop where two
  // customers cheer a beat apart reads as two people rather than one cue.
  //
  // ponytail: rolled at random rather than derived from personality. Enthusiasm ought to decide
  // how fast someone lights up, and motionOf already has the factor -- but that is a motion
  // channel with its own span, not a number to smuggle in here, so it waits for the emotion
  // layer armTuck is also parked for.
  if (!rec.carriedName && want) rec.cheerIn = rec.cheer.delay;
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

/** Shortest way round: blending 350 degrees toward 10 must not go the long way about. */
const angleLerp = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/** smoothstep's peak speed over its mean: stepWalk eases every route through one. */
const EASE_PEAK = 1.5;

/** 1/s: how fast a body turns toward where it is going. 8 is a half turn in about 0.4s. */
const TURN_RATE = 8;

/** 1/s: how fast ⏸ brings a walk to a halt, and a resume back up to pace. */
const PAUSE_EASE = 4;

/** Radians off the display beyond which they are still turning, and do not reach yet. */
const FACING_OK = 0.35;

/**
 * How far in front of the chair's front edge a standing character's feet end up.
 */
const STAND_CLEAR = 0.06;

/** Where along the chair a seated character's hips go. See seatedHipsAlong in npc.js. */
const sitAlong = (P) => seatedHipsAlong(P, CHAIR_W);

/** The point `along` in front of a chair's centre (negative is behind it). */
const standPoint = (seat, along) => ({ x: seat.x + Math.sin(seat.facing) * along, z: seat.z + Math.cos(seat.facing) * along });

function walkRoute(rec, n, e) {
  const pts = rec.route;
  const last = pts[pts.length - 1];
  // the destination can move after the round begins: a display dragged out from under them, or
  // separation nudging them clear of a neighbour. A chair's is in FRONT of it, where placeSeated
  // takes over at the start of sitting down: walking to its centroid ended in a snap back out.
  const seat = n.action?.type === ACTION.WALK_TO_SEAT ? seats.find((s) => s.id === n.seat) : null;
  const to = seat ? standPoint(seat, CHAIR_W / 2 + STAND_CLEAR) : n;
  last.x = to.x;
  last.z = to.z;
  const total = routeLength(pts);
  const at = alongPolyline(pts, total * e, n.facing);
  return at ? { ...at, total } : { x: n.x, z: n.z, facing: n.facing, total };
}

/**
 * ROOT Y HAS EXACTLY ONE WRITER, and it is groundCharacter (inside applyPose).
 *
 * It used to have three, in a sequence that only worked by accident. stepWalk wrote an absolute
 * y for the seat lift, applyPose then overwrote it from the feet, stepHop added the hop on top,
 * and the next frame opened by subtracting the hop back off. The undo existed because applyPose
 * stopped running once a pose blend settled, so "add an offset in place" was correct half the
 * time and launched a standing NPC through the ceiling the other half.
 *
 * Continuous motion removes the premise: applyPose now runs every frame for every character, so
 * anything written to y outside it is erased within one frame. `built.groundOffset` is the seam
 * that already existed for this — grounding adds it before placing the feet — so the seat lift
 * and the hop both become contributions to it, recomputed from scratch each frame. Nothing to
 * undo, no captured baseline, and a stationary NPC cannot drift.
 */
/**
 * ...and a SEATED character is the exception grounding cannot express, because their weight is
 * not on their feet.
 *
 * groundCharacter places every character by its lowest foot. POSES.sit folds the legs up, so a
 * seated character's feet dangle — measured 75mm above where a standing pose puts them — and
 * grounding faithfully drops the whole body by that much to put the dangling feet on the floor.
 * They sink into the chair.
 *
 * This did not show before because applyPose stopped running once a pose blend settled, so the
 * seat tween's own y write survived and a seated NPC sat at exactly S.seatLift. That is the
 * value that was eyeballed against this chair, so it is the value to reproduce.
 *
 * Cancelling the grounding term is what reproduces it, and cancelling beats retuning S.seatLift
 * by 75mm: the term depends on LEG LENGTH, which varies 3.7x across the cast, so one constant
 * would seat a stilt llama and a stumpy owl at visibly different heights on the same chair.
 *
 * The term is read back from last frame rather than recomputed -- root.y is groundOffset plus
 * exactly that term, so the subtraction recovers it -- which needs no new npc.js export and is
 * not a feedback loop: the term depends on the pose, never on the offset. One frame stale, and
 * invisible at any frame rate.
 *
 * HOW FAR the handover has got is read off the LEGS, not off the seat tween, and that matters
 * because they run on different clocks. The tween takes rec.dur (~1.4s); the pose is a spring
 * that folds the legs in about a third of that, and poseFor commands `sit` from the moment an
 * NPC sets off for a chair, not on arrival. Driving the handover off the tween meant the legs
 * had already folded — and grounding had already dropped the body to chase the dangling feet —
 * while the lift was barely off zero. Measured: a 117mm dip through the floor, for about a
 * second, every time anyone sat down.
 *
 * hipFlex is the fold, so it is the honest progress bar: it is the channel POSES.sit uses to
 * bring the thighs up, no other pose commands it, and it is read from the interpolator's
 * COMMANDED value, which is exactly what grounding is reacting to. The two now move together
 * and the dip is arithmetic rather than timing.
 */
function seatedness(rec) {
  return Math.min(1, Math.max(0, valueOf(rec.built.motion, 'hipFlex') / POSES.sit.hipFlex));
}

/**
 * THE LIFT RIDES THE LEGS TOO, and that is the rest of the same idea.
 *
 * The height used to tween on moveT — it arrived when the WALK finished — while the sit pose
 * only began once moveT hit 1. So a character reached the chair already raised to seat height
 * but still standing, hung there in the air, and dropped into the chair a round later when they
 * finally folded. Reported as "floating over seats, then teleporting down".
 *
 * Both halves now come off `seatedness`, so rising and folding are the same motion and there is
 * no window where one has happened and the other has not. There is no tween left to run: the
 * spring that bends the hips IS the timing, which is also why standing up is smooth for free
 * rather than needing its own easing.
 *
 * S.seatLift is read live rather than captured, so the GUI slider moves everyone at once with no
 * re-seat pass.
 */
/**
 * Where the ROOT has to be for this character's backside to be on the chair.
 *
 * The thing that rests on a seat is the pelvis, and the rig's origin is at the FEET -- the hips
 * joint is a direct child of root at local y = legHeight. So placing the root at seat height put
 * the feet on the cushion and left the hips floating 90mm above it: measured on a seated owl,
 * chair surface 0.220, feet 0.254, hips 0.310.
 *
 * Targeting the hip joint instead makes this correct PER CHARACTER for free, which a constant
 * never could: legHeight varies 3.7x across the cast, so the same chair needs a leggy llama's
 * root well below the floor line and a stumpy owl's well above it. Their feet then land where
 * their legs actually reach -- on the floor for the tall one, dangling for the short one --
 * which is the same fact about the same chair seen from two bodies.
 *
 * S.seatLift is now the gap between the hip JOINT and the cushion, which is roughly the radius
 * of the thigh lying on it, rather than an eyeballed height for the whole rig.
 */
function seatedRootY(rec) {
  return SEAT_H + (rec.built.seatDrop ?? 0) - S.seatLift;
}

function groundOffsetFor(rec) {
  const sat = seatedness(rec);
  const grounded = rec.built.root.position.y - (rec.built.groundOffset ?? 0);
  return sat * (seatedRootY(rec) - grounded) + rec.hop;
}

/**
 * Advance one NPC along this round's route, and measure how fast they are actually moving.
 *
 * Holds at the round's start position until this NPC's own stagger elapses. No position write is
 * needed while waiting: the root is already sitting at `from`, where last round left it.
 *
 * SPEED IS MEASURED, NOT DERIVED, and that is the whole reason the gait survives contact with
 * this function. The route is traversed by an eased fraction of arc length, so ground speed
 * varies continuously through every move — nobody sets off at full pace. Differentiating the
 * root's own position covers that for free, and keeps covering it through things no formula
 * would survive: walkRoute rewrites the final point every frame when a display is dragged out
 * from under someone, retarget restarts the tween mid-stride, and separation nudges NPCs
 * sideways. All of it is movement, and all of it reaches the legs by being movement.
 *
 * rec.travelled is NOT this. Despite the name it is the route's total LENGTH.
 */
function stepWalk(rec, n, dt) {
  const wasX = rec.baseX, wasZ = rec.baseZ;
  let routed = false;
  const t = walkClock(rec, dt);

  if (rec.wait > 0) {
    rec.wait -= t;
    // The walk starts from wherever getting up left them, not from the cushion they were on.
    // walkRoute only ever rewrites the LAST point, so the first one is pinned at retarget --
    // and for someone still standing up that is a spot they are in the middle of leaving.
    if (rec.route[0]) { rec.route[0].x = rec.baseX; rec.route[0].z = rec.baseZ; }
  } else if (rec.moveT < 1) {
    // A walking speed makes the time the route's: rec.travelled is its live length, so a long
    // walk takes longer instead of going faster. Without one (the playground) it is S.travel.
    const dur = S.walkSpeed ? Math.max(rec.travelled * secondsPerUnit(rec), 0.05) : rec.dur;
    rec.moveT = Math.min(1, rec.moveT + t / dur);
    const e = rec.moveT * rec.moveT * (3 - 2 * rec.moveT);
    const at = walkRoute(rec, n, e);
    // BASE coordinates, not the root's. The root is the base plus the seat shift below, and
    // feeding that back in would make settling onto a cushion read as ground covered -- the
    // legs would take a stride while sitting down. The route lives in base space; the shift is
    // a display offset on top of it.
    ({ x: rec.baseX, z: rec.baseZ, total: rec.travelled } = at);
    routed = true;
    // Facing comes from the LEG being walked, not from the start-to-end line: rounding a table
    // means turning, and an NPC who keeps facing their final destination crabs sideways.
    if (at.total > 0.05) rec.faceTo = at.facing;
  }

  // ONLY THE ROUTE COUNTS AS WALKING.
  //
  // This used to be every change in position, which sounded principled -- "all of it is
  // movement, and all of it reaches the legs by being movement" -- and was wrong the moment
  // something other than the route started moving the base. Getting out of a chair does: it
  // slides the body forward off the cushion, and reading that as ground covered opened the walk
  // gate on a character whose feet were planted. Measured on a stand-up: one frame at 13.8
  // units/s as the base handed over between route and chair, which pinned walkGain at 1, after
  // which the legs sat open at phase 0.86 and closed over the next second. That is the "weird
  // little cycle" -- a stride that never went anywhere, triggered by a number that was never a
  // speed.
  //
  // Standing up is not a stride anyway. The body rises and travels forward over feet that stay
  // where they are; the step comes after. Everything the old measurement was meant to catch --
  // a display dragged out from under someone, a retarget mid-stride, separation nudges -- comes
  // through walkRoute, so it is all still inside this branch.
  rec.moved = routed ? Math.hypot(rec.baseX - wasX, rec.baseZ - wasZ) : 0;
  // dt is clamped to 0.1 upstream (main.js), so this cannot divide by something tiny.
  rec.speed = dt > 0 ? rec.moved / dt : 0;
}

/**
 * The game's ⏸ (S.paused): the walk's own clock eases to a stop and back, so a walker slows over a
 * step or two and halts where they are, and a resume carries on along the same route. Returns this
 * frame's walk time.
 */
function walkClock(rec, dt) {
  rec.go += ((S.paused ? 0 : 1) - rec.go) * (1 - Math.exp(-PAUSE_EASE * dt));
  if (S.paused && rec.go < 1e-3) rec.go = 0;   // stopped, not creeping
  return dt * rec.go;
}

/**
 * TURNING TAKES TIME. faceTo snaps at every corner of a route, and at the first step out of the
 * queue it snapped 180 degrees in one frame, which read as a teleport. The body turns after it.
 *
 * At a display they turn to IT before the reach (wantedPose waits), not along the last leg. Read
 * live, from where they are drawn: separation nudges them and the player can move the display.
 * INTERACT never walks (they are already there), so it turns from the round's start.
 */
function stepTurn(rec, n, dt) {
  const type = n.action?.type;
  const atDisplay = type === ACTION.INTERACT || (rec.moveT >= 1 && type === ACTION.WALK_TO_DISPLAY);
  const display = atDisplay ? displays.find((d) => d.id === n.action.params.displayId) : null;
  if (display) rec.faceTo = Math.atan2(display.x - rec.baseX, display.z - rec.baseZ);
  rec.heading = angleLerp(rec.heading, rec.faceTo, 1 - Math.exp(-TURN_RATE * dt));
}

/** Seconds per unit of route: the game's walking speed and their own pace, but never faster than
 * their legs can walk. Through the smoothstep the peak is EASE_PEAK times the mean, so the mean is
 * capped at topSpeed / EASE_PEAK and nobody's feet skate, whatever the speed button says. */
function secondsPerUnit(rec) {
  const P = rec.built.params;
  return Math.max(rec.pace / S.walkSpeed, EASE_PEAK / topSpeed(P.legHeight + P.hipInset, rec.opts));
}

/**
 * How far BELOW the root this character's backside is, in the sit pose. Measured once per body.
 *
 * Placing a seated character by the hip JOINT was still wrong, just less obviously: the distance
 * from that joint down to the bottom of the body is not a constant. It depends on torso size,
 * on hipInset, and on whatever the species hangs off its middle -- a llama's fleece reaches
 * lower than an owl's. Measured across six seated bodies at a fixed hip height, the backside
 * landed anywhere from 42mm INSIDE the cushion to 33mm above it, which is the floating that was
 * reported. No single offset fixes that, because the thing being offset is not the same distance
 * on any two characters.
 *
 * So measure the part that actually touches. Once, at spawn, in the pose it will be sitting in:
 * geometry does not change, and chasing it per frame would only make the idle's breathing push
 * the character through the chair.
 *
 * The legs and tail are excluded because they hang below the seat and are not what rests on it,
 * and the arms because they swing past it. See lowestResting in npc.js, which is also why this
 * must not walk the joint tree: merged, the whole body is one skinned mesh on the hips.
 */
export function measureSeatDrop(built) {
  applyPose(built, POSES.sit);
  const lowest = lowestResting(built);
  const drop = Number.isFinite(lowest) ? built.root.position.y - lowest : 0;
  applyPose(built, POSES.rest);
  return drop;
}

/**
 * Correct seatDrop against where the body ACTUALLY ends up, once, the first time this character
 * is fully seated.
 *
 * measureSeatDrop poses the rig in a bare POSES.sit, but what the character is really wearing by
 * then is that pose plus the idle layer plus whatever posture their personality carries -- and
 * the difference is not small: measured 53mm of sink against the 10mm that was asked for. Rather
 * than model the discrepancy, read it off the thing itself and cancel it. Once: chasing it every
 * frame would let the breathing push the body through the chair.
 */
function calibrateSeat(rec, sat) {
  if (rec.seatCal || sat < 0.99) return;
  rec.seatCal = true;
  const b = rec.built;
  const lowest = lowestResting(b);
  if (Number.isFinite(lowest)) b.seatDrop -= lowest - (SEAT_H - S.seatLift);
}

/** Seconds allowed for getting up, before the round's walk is allowed to start. */
export const STAND_TIME = 0.5;

/** Radians of forward lean at the midpoint of sitting down or getting up. */
const SIT_LEAN = 0.30;

/**
 * Put the character where a seated body actually goes -- which is not the middle of the chair,
 * and not facing wherever they happened to walk in from.
 *
 * TWO THINGS WERE WRONG, and only the second one was reported.
 *
 * 1. FACING. root.rotation.y had exactly one writer, inside the walk, so a seated character kept
 *    whichever way the last leg of their route pointed. The sim does set npc.facing from the
 *    seat, but nothing carried it to the rig. Measured across five seated customers: 76 to 164
 *    degrees off the chair they were sitting on -- one of them essentially backwards.
 *
 * 2. POSITION. They sat at the exact centroid, so standing up was a vertical rise out of the
 *    middle of the cushion. You do not stand up like that; you come forward off the seat, and
 *    you sit back onto it.
 *
 * Both ride `seatedness`, so they are the same motion as the fold rather than a separate tween,
 * and both are ZERO at zero seatedness -- which is what makes walking away continuous. There is
 * no moment where a shift has to be cancelled, because a character who is not sitting has no
 * shift. The base position stays the chair centroid throughout, so the route that carries them
 * off still starts from the chair.
 */
function placeSeated(rec) {
  const { root } = rec.built;
  const sat = seatedness(rec);
  // THE SEAT OUTLIVES THE ASSIGNMENT, by exactly as long as the legs stay folded.
  //
  // npc.seat clears the instant the sim gives the chair up, but the character is still most of
  // the way into the sit pose at that moment -- measured at 96% folded. Dropping the seat there
  // snapped the shift off in one frame: an 88mm teleport, larger than a whole frame of walking
  // at top speed, which is a character jumping out of a chair rather than standing up out of it.
  //
  // Held until seatedness actually reaches zero, so the shift and the turn unwind with the legs.
  if (rec.npc.seat !== null) rec.seatRef = seats.find((s) => s.id === rec.npc.seat) ?? null;
  // Near zero, not zero: a critically damped spring only approaches 0, so `<= 0` never came for
  // most of the cast, the chair was kept for good, and every walk they finished ended in a jump
  // back to it (measured: 2.7 units, the moment they stopped at a display).
  else if (sat < 0.01) rec.seatRef = null;
  const seat = rec.seatRef;
  const face = seat ? angleLerp(rec.heading, seat.facing, sat) : rec.heading;
  root.rotation.y = face;
  root.position.x = rec.baseX;
  root.position.z = rec.baseZ;
  // Backwards along the way they are facing: seated, the hips are at the back of the cushion;
  // standing, they are back at the centroid and clear to walk.
  // GETTING UP IS A STEP FORWARD, not a lift straight up out of the middle of the cushion.
  //
  // This is what was actually being complained about. Sitting at the centroid means standing at
  // the centroid, and the centroid is INSIDE the chair -- so the legs unfolded straight down
  // through the box and the feet ended up in it. You do not stand up like that: you lean
  // forward, take your weight onto your feet in front of the seat, and rise.
  //
  // So the along-facing offset runs from BEHIND centre when seated to WELL IN FRONT of the
  // front edge when standing, on the same `seatedness` the fold uses. Sitting down is the same
  // move backwards, which is also right.
  //
  // It moves the BASE rather than being a display offset on top of it, and that is deliberate:
  // base is what the gait measures its speed from, so stepping off the chair drives the legs and
  // reads as a step. A display offset would have slid them off the seat with their feet still.
  // THE CHAIR PLACES THEM UNLESS THEY ARE ACTUALLY GOING SOMEWHERE, and "still holds the chair"
  // is not the same question.
  //
  // A customer who stays seated for another round still gets retargeted -- the sim aims them at
  // the seat they are already in -- so letting any running route win dragged them forward off
  // the back of the cushion. But gating on whether they still HOLD the seat was worse: someone
  // who keeps the chair while walking off to look at something had the route and the chair
  // writing the base on alternate lines of the same frame, each undoing the other. That reads as
  // a speed of 64 units/s, which pinned the walk gate open and is the rest of the "weird little
  // cycle".
  //
  // The honest test is the route's own length. A round that keeps someone in their chair has
  // nowhere to walk to, so it is a few millimetres long; a round that sends them across the shop
  // is not. Under the threshold the chair decides where they are, over it the route does, and
  // nothing writes the base twice.
  //
  // Someone still waiting to set off FOR this chair is not in it yet either: the seat is claimed at
  // the round's start, and placing them by it through their stagger moved them across the shop
  // into it in one frame (measured: a 2.95-unit jump). Only someone getting UP waits in the chair.
  if (!seat) return;
  if (rec.moveT < 1 && rec.travelled > 0.15 && (rec.wait <= 0 || rec.npc.seat === seat.id)) return;
  calibrateSeat(rec, sat);
  const stand = CHAIR_W / 2 + STAND_CLEAR;
  // Along the CHAIR's facing, not the body's: the body is still turning as they sit, and the spot
  // in front of the seat is where the walk there ended (walkRoute).
  ({ x: rec.baseX, z: rec.baseZ } = standPoint(seat, stand + (sitAlong(rec.built.params) - stand) * sat));
  root.position.x = rec.baseX;
  root.position.z = rec.baseZ;
}

/**
 * Which pose this NPC should be in.
 *
 * Delight outranks everything: an NPC who buys as they turn away should stop and cheer, and a
 * customer gliding out mid-cheer is the tell that this is a placeholder.
 *
 * There is no `moving` branch any more, and that is the point of the walk cycle. It used to
 * return POSES.walk or POSES['walk+carry'] — single frozen frames of a stride, held for the
 * length of the move — guarded by a test for "actually going somewhere" (not still waiting, not
 * arrived, route long enough to bother) that existed only to stop characters striding on the
 * spot. The gait is now an additive layer gated on measured speed, so a character who is not
 * moving contributes exactly zero of it and the guard has nothing left to guard.
 */
function wantedPose(rec, n) {
  if (rec.celebrate > 0) return POSES.delighted;
  // YOU DO NOT SIT DOWN WHILE STILL WALKING THERE.
  //
  // poseFor answers WALK_TO_SEAT with POSES.sit — "they arrive and sit down in the same round",
  // which was reasonable when a walk was a static pose gliding along a route: the legs were not
  // doing anything either way, so adopting the seated shape early cost nothing and saved needing
  // an arrival state.
  //
  // With a real gait it means striding with the thighs folded at 83 degrees. The legs are then
  // both folded and scissoring, so the lowest foot — which is what grounding places the body by
  // — swung 90mm PER FRAME, and the body dropped 111mm through the floor chasing it. That looked
  // like a grounding bug and was not one: grounding was faithfully following an impossible pose.
  //
  // moveT reaching 1 is arrival, and cast.js is the half of this that knows it.
  if (n.action?.type === ACTION.WALK_TO_SEAT && rec.moveT < 1) {
    return n.carrying ? POSES.carry : POSES.rest;
  }
  // Nor reach into a display you are not facing yet: turn first (stepWalk), then reach.
  if (n.action?.type === ACTION.INTERACT &&
      Math.abs(Math.atan2(Math.sin(rec.faceTo - rec.heading), Math.cos(rec.faceTo - rec.heading))) > FACING_OK) {
    return POSES.browse;
  }
  return poseFor(n);
}

/**
 * The celebration hop.
 *
 * abs(sin) touches down between hops instead of floating; the (1 - t) taper lands them softly on
 * the last one rather than cutting the bounce off mid-air.
 *
 * Writes rec.hop only — groundOffsetFor folds it into the single y write. See above.
 */
function stepHop(rec, dt) {
  // The beat between realising and reacting. Runs before the pose changes too, because
  // wantedPose reads rec.celebrate -- so a character keeps browsing until their own cue lands.
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

/**
 * The gait, summed on top of the interpolated pose and never fed back into it.
 *
 * Phase follows DISTANCE, not time, so the feet stay planted at any speed and any leg length:
 * as a character eases to a halt the phase freezes mid-stride rather than the legs carrying on
 * scissoring while the body glides. walkGain then closes them over a couple of tenths, which is
 * the "bring your feet together" beat for free.
 */
function stepGait(rec, out, dt) {
  const P = rec.built.params;
  const L = P.legHeight + P.hipInset;
  // Delight outranks the walk, and an additive layer cannot express that by swapping poses the
  // way the old code did: without this an NPC who buys mid-move hops and strides at once.
  const speed = rec.celebrate > 0 ? 0 : rec.speed;
  const gain = walkGain(rec.built.motion, speed, dt, rec.opts);
  if (gain > 0) walkLayer(out, walkPhase(rec.phase, speed, L, rec.opts), gain, rec.opts);
  // THE LEAN. You cannot stand up without putting your head over your feet first, and you cannot
  // sit down without it either -- the torso goes forward, the hips go back. Peaks halfway
  // through the fold and is zero at both ends, so it costs nothing when seated or standing and
  // needs no state of its own.
  const sat = seatedness(rec);
  out.spineBend += SIT_LEAN * 4 * sat * (1 - sat);
  // Advanced AFTER the layer reads it, so a frame's pose matches the distance already covered.
  // Accumulated rather than divided out of total distance -- see phaseStep, and note this is
  // the code path where that mattered: the store's speed changes every frame.
  rec.phase = (rec.phase + phaseStep(rec.moved, speed, L, rec.opts)) % 1;
  rec.craft?.add(out);
}

function tickOne(rec, dt) {
  const n = rec.npc;
  // The buy lands in syncCarried, so read it BEFORE choosing this frame's pose or the celebration
  // starts a frame late — visible at 60fps on a beat this short.
  syncCarried(rec);
  checkReady(rec);
  stepWalk(rec, n, dt);
  stepTurn(rec, n, dt);
  stepHop(rec, dt);
  // Every contribution to root height is known before applyPose runs, because applyPose is the
  // only thing that writes it.
  placeSeated(rec);
  rec.built.groundOffset = groundOffsetFor(rec);
  // After the ground offset and before the motion: makeCraft poses the rig to measure the lap,
  // and stepMotion re-poses all of it.
  stepKnitting(rec, dt);
  stepMotion(rec.built, wantedPose(rec, n), dt, rec.opts, (out) => stepGait(rec, out, dt));
  if (rec.craft) poseCraft(rec.craft);
  if (rec.sparkle) stepSparkle(rec.sparkle, dt);
  // The package goes down while they knit: the right paw has a needle in it.
  if (rec.carriedMesh) rec.carriedMesh.visible = !(rec.craft?.hands > 0.5);
  // The rig's placeholder skein is never correct in this game: a customer is either carrying the
  // real package or carrying nothing at all. So it is forced off every frame, unconditionally,
  // rather than only when a real notion has replaced it — applyPose turns it back on for any pose
  // with holdItem set (carry), and relying on the pose to keep it off is what left every NPC
  // holding one. It belongs to crowd.html's pose demo, not here.
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
