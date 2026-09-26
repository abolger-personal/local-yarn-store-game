// Lion species kit.
//
// The reference case for a silhouette carried on the HEAD. The owl's identity is plumage on the
// torso, the llama's is neck length plus a ruff at the neck base; the lion's is a mane, and a
// mane is not a collar -- it is a halo that frames a bare face. That distinction is the whole
// kit:
//
//   1. The mane is a scallop shell on `ctx.head`, not `ctx.neck`. Two reasons, both structural.
//      The base neck is 0.100 long against the llama's 0.380, so there is barely any neck to
//      hang fleece from; and `buildScarf` already puts a torus at neckLength * 0.35 with radius
//      max(neckThick * 1.9, headRadius * 0.92), so the neck ring is occupied. Every character in
//      this shop wears a scarf.
//   2. `skipFront` does the framing. It is the same face-gap mechanism the owl already uses for
//      its head plumage (owl.js headShell) -- the mane is that shell, wider, hung lower, and with
//      a much bigger gap.
//
// The cost of anchoring to the head is that the mane turns with the head, because `ctx.head` is
// an articulated joint. That is correct for cheek and jaw fur and overstated for the shoulder
// mass, which is why a second shell on `ctx.chest` is the obvious next move if this reads too
// light. Deliberately not built yet: one shell first, see how it sits.

import {
  BASE_PARAMS, BASE_RANDOM_RANGES, BASE_MOTION_RANGES, BASE_GUI, GEO,
  addEars, addEyes, createCharacter, deriveCoatColor, touchingScallopSize,
  feltMaterial, LIMB_TAPER, part, randomiseBase, registerSpecies, scallopAngles,
  scallopBases, scallopGeometry, scallopMesh,
} from './npc.js';

// GEO.taper's narrow end, as a fraction of its wide end. Baked into the shared geometry, so
// the cap has to be sized from the same number or it will not sit flush.
const TIP = LIMB_TAPER;

// Bare snout between the skull and the back of the nose, over the nose's own depth. At 0 the
// nose meets the face exactly; past about 0.5 there is enough naked muzzle to read as a fox or
// a rodent rather than a cat. muzzleLength is solved from a draw in this band rather than
// drawn itself -- see solveSnout.
const SNOUT_GAP = Object.freeze([0.00, 0.45]);

// below this the taper is a stub inside the skull and only the cap and nose show
const MIN_MUZZLE = 0.030;

// How far the nose pad stands out of the round cap, as a fraction of the pad's own depth.
// Fixed, so muzzleRound cannot swallow the nose -- see noseAt.
const NOSE_PROUD = 0.30;

// Rows of scallops down the mane. Below five it stops reading as a mane at all --
// a handful of long spikes is a wolf's ruff or a hedgehog, whatever the other
// settings say. The floor is on the slider as well as the presets: there is no
// lion anywhere under it, so leaving it reachable is just a trap.
const MIN_MANE_ROWS = 5;

// How far down the skull the mane may stop, as a fraction of PI from the crown. 0.5 is the
// equator: above that the mane is a cap sitting on top of the head rather than a mane hanging
// round it, and the animal reads as a punk hedgehog again. There is no matching ceiling -- 1.0
// is the bottom pole and a mane that long simply hangs onto the shoulders, which is a lion.
const MIN_MANE_BOTTOM = 0.50;

// How far out along its own direction a spike base may sit, as a fraction of the skull surface.
// The same number and the same reason as EAR_SEAT in npc.js: 1.0 puts the base exactly on the
// skin, which leaves nothing buried to hold the spike on. See skullInShell.
const MANE_SEAT = 0.95;

// ---------------------------------------------------------------- params

export const DEFAULT_PARAMS = {
  ...BASE_PARAMS,
  name:          'Bramble',
  footColor:     '#6b5336',

  // A cat turns its head less than a llama and far less than an owl.
  headYawMax:    1.30,    // ~74 degrees

  shoulderOut:   0.88,    // the mane is on the head, so the shoulders stay near the base value
  shoulderLift:  0.32,
  clampArmOut:   true,    // lion arms are visible against the body, never buried

  // Short neck: the mane hangs from the skull, so a long neck would push it up off the shoulders.
  neckLength:    0.105,
  neckThick:     0.082,
  headOverlap:   0.070,
  headRadius:    0.178,   // a broad skull; the mane then reads as mass rather than as a fringe
  eyeFront:      0.680,
  eyeSpread:     0.420,   // forward-set, like the owl: a predator's eyes face the same way
  eyeRadius:     0.070,

  // species kit -- snout. Short and BROAD where the llama's is long and blunt. It tapers, which
  // is the whole difference: GEO.taper narrows to LIMB_TAPER (0.78) along its length, and the
  // nose pad then steps in again, so base to tip reads much narrower than 0.78 alone.
  // muzzleStart is the one that bites. A cat's snout is SHORT, so a short length on a broad head
  // buries it: at the llama's 0.30 start with length 0.118 the tip lands at z 0.1607 against a
  // head that is 0.1687 deep at that height, and the whole snout sits inside the skull. The llama
  // gets away with 0.30 because its head is small (0.112) next to a 0.215 muzzle -- 1.92x. Here
  // the ratio is 0.66x, so the snout has to START near the surface instead of being lengthened
  // into a camelid one. At 0.65 it protrudes 0.0520 and still reads short.
  muzzleStart:   0.65,    // where the taper begins, as a fraction of head radius
  muzzleLength:  0.056,
  muzzleWidth:   0.104,   // X half-width at the skull end -- wider than it is deep, like a cat
  muzzleDepth:   0.082,   // HEIGHT at the skull end, not depth -- see addMuzzle on the axes
  muzzleRound:   0.85,    // 0 = the bare flat disc and its rim, 1 = a hemisphere on the end
  muzzleDrop:    0.300,   // below head centre, as a fraction of head radius
  muzzleColor:   '#e8d9bd',
  noseColor:     '#241a1c',
  noseSize:      0.52,    // nose pad radius as a fraction of the muzzle's narrow end
  earLength:     0.088,
  earWidth:      0.040,
  earFlatten:    0.40,
  earSpread:     0.520,
  earTilt:       0.300,
  // How far the point reaches PAST the leaf top, as a fraction of earLength. 0 leaves the
  // llama's rounded leaf. Its width is not set here -- it is taken from the ear's own half-width
  // at the junction, so the point widens with earWidth and earFlatten on its own.
  earPoint:      0.30,

  // mane
  mane:          true,
  maneColor:     '#8a5a2b',
  manePreset:    0,       // this default IS preset 0 -- tuned at the checker, then baked
  maneRows:      8,
  manePerRow:    11,
  maneAutoSize:  true,
  maneTouch:     1.155,   // above 1.0 the curls overlap, which is what closes the mass
  maneSize:      0.230,   // manual override, only used when maneAutoSize is off
  // Faceted spikes, not domes. A dome has no direction, so a mane built from them reads as
  // wool however the counts are tuned -- which is the owl's and the llama's whole point and
  // exactly wrong here. 0 falls back to the dome; 3 is a sharp triangular spike, 4 a pyramid,
  // and by 6 it is rounding off again.
  maneSides:     5,
  // a spike wants to be LONGER than it is wide; a dome at 0.92 is a bump
  maneProud:     1.524,
  maneTop:       0.00,    // starts at the crown itself -- see maneCrownGap
  maneBottom:    0.58,    // a high tight halo, not a shoulder-length mane
  maneStagger:   false,
  // Radians of +Z left open. The parameter that makes it a mane rather than a hood -- and it has
  // to be bigger than it looks, because skipFront culls scallop CENTRES while each scallop still
  // has a base radius, so the ones flanking the gap spill across it. It also quantises by
  // manePerRow: at 11 the steps are 0.571 rad, so a range of values collapses to one shell.
  // Measured with the spikes in: the eyes are covered with no gap at all and clear from 1.5 up,
  // so 2.50 sits well clear and still brings the mane around the cheeks.
  maneFaceGap:   3.20,
  // No maneSpread or maneFlat: every spike base sits on the skull now (see skullInShell), so
  // there is nothing left for a base radius or a sink depth to set. Reach is maneProud's job.
  maneTall:      0.981,   // Y scale of the shell, so the rows fan out oval rather than round
  maneDrop:      0.111,   // shell centre below head centre, as a fraction of head radius
  manePush:      0.185,   // shell centre in FRONT of head centre, bringing the halo to the cheeks
};

/**
 * Fewer, larger curls than the llama's fleece: a mane is coarse. Size is derived from the counts,
 * so a preset only chooses how many curls there are, how far down the skull they go, and how far
 * they stand proud.
 *
 * maneBottom is the ladder now, running 0.58 to 0.97: a high tight halo at one end and a
 * shoulder-length mane at the other. It used to run 0.94 to 0.99, so every preset was the same
 * long mane and the only variation on screen was how many curls it was made of -- which at 150px
 * is no variation at all. Preset 0 IS the shipped default; the rest walk away from it.
 *
 * maneProud is SOLVED, not chosen: stand-off is linear in it, so two samples fix it exactly for a
 * target stand-off. Picking proud by hand does not survive a change to the counts or to
 * maneBottom, because both move the derived curl size underneath it.
 *
 * Re-solved when the bases moved onto the skull: spikes at the back of a forward-pushed mane now
 * sit further out and grow to match, so the same proud reaches further than it did. Measured
 * worst across every preset and randomiser corner: stand-off 0.20x head half-width, no curl in
 * front of an eye, crown covered by at least 0.09 rad.
 */
export const MANE_PRESETS = Object.freeze([
  { maneRows: 8, manePerRow: 11, maneProud: 1.524, maneStagger: false, maneTop: 0.00, maneBottom: 0.58 },
  { maneRows: 8, manePerRow: 13, maneProud: 1.740, maneStagger: true,  maneTop: 0.02, maneBottom: 0.63 },
  { maneRows: 7, manePerRow: 11, maneProud: 1.291, maneStagger: false, maneTop: 0.04, maneBottom: 0.70 },
  { maneRows: 7, manePerRow: 13, maneProud: 1.885, maneStagger: true,  maneTop: 0.06, maneBottom: 0.78 },
  { maneRows: 6, manePerRow: 13, maneProud: 1.617, maneStagger: true,  maneTop: 0.08, maneBottom: 0.86 },
  { maneRows: 6, manePerRow: 15, maneProud: 1.501, maneStagger: false, maneTop: 0.10, maneBottom: 0.92 },
  { maneRows: 5, manePerRow: 15, maneProud: 1.140, maneStagger: true,  maneTop: 0.12, maneBottom: 0.97 },
]);

export function applyManePreset(P, index) {
  const count = MANE_PRESETS.length;
  P.manePreset = index;
  Object.assign(P, MANE_PRESETS[((index % count) + count) % count]);
  return P;
}

// maneFaceGap and the presets' maneBottom are the tier 1 carriers here, the way neckLength is for the llama:
// a lion in a huge dark halo and one with a thin fringe read as different animals at 150px.
export const RANDOM_RANGES = Object.freeze({
  ...BASE_RANDOM_RANGES,
  headRadius:   [0.158, 0.198],
  headOverlap:  [0.050, 0.098],
  neckLength:   [0.085, 0.140],
  legHeight:    [0.150, 0.250],   // stocky; a lion is not a leggy animal
  // floor is geometry, not taste: below about 0.60 the shortest muzzle on the widest head
  // never leaves the skull. rig.test walks the worst corner of these four spans together.
  muzzleStart:  [0.620, 0.800],
  // muzzleLength is NOT here on purpose: solveSnout derives it from the drawn snout gap, and
  // two authors for one param is how the ratio drifted in the first place.
  muzzleWidth:  [0.086, 0.126],
  muzzleDepth:  [0.068, 0.098],
  muzzleRound:  [0.620, 1.150],
  muzzleDrop:   [0.220, 0.380],
  earLength:    [0.066, 0.118],
  earWidth:     [0.030, 0.052],
  earFlatten:   [0.28, 0.56],
  earSpread:    [0.440, 0.600],
  earTilt:      [0.160, 0.440],
  earPoint:     [0.150, 0.550],
  maneTouch:    [1.040, 1.200],
  // Face gap floor is geometry, not taste, and it is set by the WORST preset rather than by the
  // default. The gap quantises by manePerRow -- at 13 columns the steps are 0.483 rad -- so the
  // column flanking the gap either clears the eye or sits right over it with nothing in between.
  // Measured across every preset at every corner: the default (11 columns) is clear from 1.80,
  // but preset 1 (13 columns) only clears from 2.45, so the floor is 2.45 plus a step of margin.
  // Ceiling is stand-off: past 3.8 so many columns are culled that the halo thins to 0.30x.
  maneFaceGap:  [2.600, 3.800],
  maneTall:     [0.940, 1.200],
  maneDrop:     [0.080, 0.260],
  eyeRadius:    [0.058, 0.082],
  eyeSpread:    [0.360, 0.480],
  eyeFront:     [0.620, 0.740],
});

// ---------------------------------------------------------------- shell settings

// broad and slightly flattened: a cat skull is wider than it is tall, where the owl's is a ball.
// Three things measure against this shape -- the head mesh, where the muzzle leaves the skin, and
// where the mane has to reach to cover the crown -- so it is one triple rather than three copies
// of 0.94 that can drift apart.
const HEAD_SHAPE = Object.freeze([1.04, 0.94, 1.00]);
const headScale = (P) => HEAD_SHAPE.map((k) => P.headRadius * k);

const curlSize = (P, shape) => (P.maneAutoSize
  ? touchingScallopSize(shape) * P.maneTouch
  : P.maneSize);

/**
 * The skull, as seen from inside the mane shell's own unit space, shrunk to MANE_SEAT of itself.
 *
 * This is what makes the mane WRAP the head instead of hanging off it. Every spike base sits on
 * the shell's own oval, and once maneBottom runs the rows past the bottom of the skull that oval
 * is out in the air below the jaw. With this, npc.js pulls any base that would land outside the
 * skull back along its own direction onto it -- so the mane follows the skull round underneath,
 * however far maneBottom is slid, and bases already inside do not move at all.
 *
 * The shell is scaled [spread, spread*tall, spread] and moved by (0, -drop, push) inside the head,
 * so in its unit space the skull is still an axis-aligned ellipsoid: offset and squashed.
 *
 * ponytail: this puts drop, push and tall into the geometry cache key, so randomised lions
 * stop sharing a mane geometry (~0.5-1.5k verts each). Upgrade if a crowd ever shows the cost:
 * quantise these three, or do the seating in the vertex shader.
 */
const skullInShell = (P) => ({
  centre: [0, P.maneDrop / P.maneTall, -P.manePush],
  axes: [HEAD_SHAPE[0] * MANE_SEAT, HEAD_SHAPE[1] * MANE_SEAT / P.maneTall, HEAD_SHAPE[2] * MANE_SEAT],
});

const maneShell = (P) => {
  const shape = {
    rows: P.maneRows, perRow: P.manePerRow,
    top: P.maneTop, bottom: P.maneBottom,
    skipFront: P.maneFaceGap,
    sides: P.maneSides,
  };
  return {
    ...shape, size: curlSize(P, shape),
    flat: 0, proud: P.maneProud, stagger: P.maneStagger,
    inside: skullInShell(P),
  };
};

/**
 * The bare arc at the crown of the skull, in radians. Negative means a scallop covers the top of
 * the head; positive is bare head ringed by mane, which reads as a bald patch.
 *
 * This is why maneTop has no fixed maximum. How far down the mane may start depends on how WIDE
 * a scallop is (touchingScallopSize, so both counts and maneTouch), and where the shell sits
 * relative to the skull -- manePush especially, since
 * pushing the shell forward moves the crown off the shell's own pole and eats the margin from one
 * side. A constant could only ever be right for one combination of those.
 *
 * Measured on the shipped default: -0.229 rad of cover, crossing to bare at maneTop ~0.155.
 */
export function maneCrownGap(P) {
  const shell = maneShell(P);
  // Exact, not a bound: each base sits on the skull at some distance d along its own direction,
  // and npc.js grows the spike by that same d, so its disc always spans atan(size) of arc.
  const reach = Math.atan(shell.size);
  // the crown, seen from the shell's centre, mapped back into the shell's own unit space
  const y = (HEAD_SHAPE[1] + P.maneDrop) / P.maneTall;
  const z = -P.manePush;
  const n = Math.hypot(y, z);
  let nearest = Infinity;
  for (const { phi, theta } of scallopAngles(shell)) {
    const dot = (Math.cos(phi) * y + Math.sin(phi) * Math.sin(theta) * z) / n;
    nearest = Math.min(nearest, Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  return nearest - reach;
}

/** Every mane spike base, in the shell's unit space -- the same path the geometry is built from. */
export const maneBases = (P) => scallopBases(maneShell(P));

// The mane rides on the HEAD, not the torso, so it never pushes the shoulders out. Returning 0
// is the honest answer rather than an oversight: `bulge` exists to stop a thick coat swallowing
// the elbows, and nothing on this species' torso can reach them.
export const coatBulge = () => 0;

// ---------------------------------------------------------------- kit

function addHead(ctx, P) {
  ctx.head.add(part(GEO.sphere, ctx.mat.body, { scale: headScale(P) }));
}

/**
 * A taper, not a tube. GEO.taper is radius 1 at +Y and LIMB_TAPER (0.78) at -Y, so rotating by
 * -PI/2 about X puts the NARROW end forward: broad at the skull, narrowing to the nose. The
 * llama's snout is the opposite shape deliberately -- a blunt tube reads camelid, a taper reads
 * cat -- so this does not share that code.
 *
 * MIND THE AXES. That same -PI/2 sends local +Z to world +Y, so the scale triple is
 * [width, length, HEIGHT] -- muzzleDepth sizes the snout vertically, not front to back. Front to
 * back is muzzleLength alone.
 *
 * The taper's narrow end is a flat disc meeting the wall at a hard circular rim, which is what
 * reads as machined. muzzleRound caps it with a sphere sized to that exact end ellipse, so the
 * two are tangent and the rim disappears: 0 leaves the bare disc, 1 is a hemisphere on the end,
 * and past that it swells toward an egg.
 */
function addMuzzle(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const start = P.headRadius * P.muzzleStart;
  const { muzzleLength: len, muzzleWidth: w, muzzleDepth: d } = P;

  ctx.head.add(part(GEO.taper, ctx.mat.muzzle, {
    pos: [0, y, start + len / 2],
    scale: [w, len, d],
    rot: [-Math.PI * 0.5, 0, 0],
  }));
  if (P.muzzleRound <= 0) return;
  ctx.head.add(part(GEO.sphere, ctx.mat.muzzle, {
    pos: [0, y, start + len],
    scale: [w * TIP, d * TIP, w * TIP * P.muzzleRound],
  }));
}

/**
 * Where the nose pad sits, in head-local space. Shared with the randomiser rather than inlined,
 * because the ratio it constrains is defined by these exact numbers -- a randomiser working from
 * its own copy of them would drift the moment the nose moved.
 */
function noseAt(P) {
  const tipW = P.muzzleWidth * TIP;
  const r = tipW * P.noseSize;
  const depth = r * 1.80;
  // Measured from the CAP FRONT, not from a fixed fraction along the muzzle. Offsetting by
  // tipW * muzzleRound * 0.62 let the cap swell past the nose as muzzleRound rose: the pad stood
  // 25% of its own depth proud at round 0.62 and 3% at 1.15, a 7.5x swing that turns the nose
  // into a dark smudge and leaves the snout reading as bare muzzle.
  const capFront = P.headRadius * P.muzzleStart + P.muzzleLength + tipW * P.muzzleRound;
  const front = capFront + NOSE_PROUD * depth;
  return { r, centre: front - r * 0.90, back: front - depth, depth, front };
}

/** Where the muzzle leaves the skull, at the muzzle's own height. */
function headSkinZ(P) {
  const k = 1 - (-P.muzzleDrop / HEAD_SHAPE[1]) ** 2;
  return k > 0 ? P.headRadius * HEAD_SHAPE[2] * Math.sqrt(k) : 0;
}

/**
 * Bare snout between the skull and the back of the nose, as a fraction of the nose's own depth.
 * This one ratio is what separates a lion from a fox: at 0 the nose meets the face, and by about
 * 0.5 there is enough naked muzzle showing to read as a snout rather than a cat's flat face.
 */
export const snoutGap = (P) => {
  const nose = noseAt(P);
  return (nose.back - headSkinZ(P)) / nose.depth;
};

// The nose pad steps in again from the taper's narrow end, which is what stops the snout reading
// as a cone with a ball stuck on it. Sits slightly proud so the muzzle curve cannot swallow it.
function addNose(ctx, P) {
  const y = -P.headRadius * P.muzzleDrop;
  const { r, centre } = noseAt(P);

  ctx.head.add(part(GEO.sphere, ctx.mat.nose, {
    pos: [0, y + r * 0.30, centre],
    scale: [r * 1.25, r * 0.85, r * 0.90],
  }));
}

/**
 * The mane: one scallop shell on the head with a gap cut out of the front.
 *
 * Offset back and down inside the head node rather than centred, so it frames the face instead
 * of wrapping it.
 *
 * Every spike base sits on the skull (skullInShell), so the shell is scaled only by the head
 * radius and maneTall; how far the halo stands off comes from maneProud alone. rig.test pins the
 * worst stand-off corner.
 */
function addMane(ctx, P) {
  if (!P.mane) return;
  const radius = P.headRadius;
  const shell = scallopMesh(scallopGeometry(maneShell(P)), ctx.mat.mane,
    [radius, radius * P.maneTall, radius]);
  if (!shell) return;
  shell.name = 'mane';   // rig.test finds it by name to measure the face gap and the stand-off
  shell.position.set(0, -P.headRadius * P.maneDrop, P.headRadius * P.manePush);
  ctx.head.add(shell);
}

// A cat ear is a leaf with a point on it. The leaf alone is the llama's rounded ear, so the tip
// cone is what earPoint buys -- at 0 it is not added at all and the ear is a llama's.
// Where the point meets the leaf, as a fraction of the leaf's upper half. The leaf is an
// ellipsoid, so its half-width there is a real number rather than a guess -- and taking it from
// the ear instead of from a constant is the whole fix.
const JOIN = 0.5;

function addEarTips(ctx, P) {
  if (P.earPoint <= 0) return;
  for (const ear of ctx.joints.ear) {
    const { size, length, midY, halfH, flatten } = ear;
    const k = Math.sqrt(1 - JOIN * JOIN);        // leaf half-width at the junction, 0.866
    const base = midY + halfH * JOIN;
    const h = halfH * (1 - JOIN) + length * P.earPoint;   // junction -> leaf top -> the point
    ear.node.add(part(GEO.cone, ctx.mat.body, {
      pos: [0, base + h / 2, 0],
      scale: [size * k, h, size * flatten * k],
    }));
  }
}

function buildKit(ctx, P) {
  ctx.mat.mane = ctx.addMaterial(feltMaterial(P, P.maneColor));
  ctx.mat.muzzle = ctx.addMaterial(feltMaterial(P, P.muzzleColor));
  ctx.mat.nose = ctx.addMaterial(feltMaterial(P, P.noseColor));

  addHead(ctx, P);
  addEyes(ctx, P, { squash: 1.0, head: headScale(P) });
  addMuzzle(ctx, P);
  addNose(ctx, P);
  addEars(ctx, P, {
    size: P.earWidth, length: P.earLength, shape: 'leaf',
    spread: P.earSpread, tilt: P.earTilt, lift: 0.70, back: -0.14,
    flatten: P.earFlatten, head: headScale(P),
  });
  addEarTips(ctx, P);
  addMane(ctx, P);
}

// ---------------------------------------------------------------- randomisation

/** Applies randomised lion identity onto a params object, in place. */
/**
 * muzzleLength is SOLVED, not drawn, so the snout gap lands where it was asked to.
 *
 * Drawing headRadius, muzzleStart, muzzleWidth, muzzleRound and muzzleDrop independently and then
 * drawing a length too puts the ratio anywhere: measured over 4000 draws it spanned 0.27 to 2.12
 * and sat outside the lion band 98.7% of the time. The ratio is the read, so the ratio is what
 * gets drawn, and the one parameter with no other job absorbs it.
 *
 * If that leaves a degenerate stub of a taper, muzzleStart gives way instead and the length pins
 * at the floor -- the ratio stays exact either way, which is the whole point.
 */
function solveSnout(P) {
  const gap = SNOUT_GAP[0] + Math.random() * (SNOUT_GAP[1] - SNOUT_GAP[0]);
  const tipW = P.muzzleWidth * TIP;
  const r = tipW * P.noseSize;
  // noseBack = capFront - (1 - NOSE_PROUD) * depth, and capFront carries the full cap now
  const depth = r * 1.80;
  const front = headSkinZ(P) + gap * depth + (1 - NOSE_PROUD) * depth - tipW * P.muzzleRound;
  P.muzzleLength = front - P.headRadius * P.muzzleStart;
  if (P.muzzleLength >= MIN_MUZZLE) return;
  P.muzzleLength = MIN_MUZZLE;
  P.muzzleStart = (front - MIN_MUZZLE) / P.headRadius;
}

export function randomiseInto(P) {
  randomiseBase(P, RANDOM_RANGES);
  solveSnout(P);
  applyManePreset(P, Math.floor(Math.random() * MANE_PRESETS.length));
  P.maneColor = deriveCoatColor(P.bodyColor);
  return P;
}

/** A fresh randomised params object, with optional fixed overrides. */
export function randomParams(overrides = {}) {
  return Object.assign(randomiseInto(structuredClone(DEFAULT_PARAMS)), overrides);
}

// ---------------------------------------------------------------- gui

export const LION_GUI = Object.freeze({
  'snout & ears': [
    ['muzzleStart', 0.2, 1.0], ['muzzleLength', 0.04, 0.24],
    ['muzzleWidth', 0.04, 0.18], ['muzzleDepth', 0.03, 0.14],
    ['muzzleRound', 0, 1.8],
    ['muzzleDrop', 0, 0.8], ['muzzleColor', 'color'], ['noseColor', 'color'],
    ['noseSize', 0.2, 1.0],
    ['earLength', 0.03, 0.20], ['earWidth', 0.010, 0.08], ['earFlatten', 0.15, 1.0],
    ['earSpread', 0.1, 0.9], ['earTilt', -0.6, 0.9], ['earPoint', 0, 0.9],
  ],
  mane: [
    ['mane', 'bool'], ['maneColor', 'color'],
    ['manePreset', 0, MANE_PRESETS.length - 1, 1],
    ['maneFaceGap', 0, 4.2], ['maneTall', 0.7, 1.4],
    // floored at 0: a negative drop grows the mane from above the skull's centre, which bunches
    // every row up round the crown
    ['maneDrop', 0, 0.6], ['manePush', -0.6, 0.3],
    ['maneSides', 0, 8, 1],
    ['maneRows', MIN_MANE_ROWS, 10, 1], ['manePerRow', 3, 20, 1],
    ['maneAutoSize', 'bool'], ['maneTouch', 0.8, 1.6], ['maneSize', 0.08, 0.55],
    ['maneProud', 0.1, 3.0],
    // maneTop keeps its bald-patch end reachable on purpose -- unlike maneRows there IS a lion
    // under part of it, and where the edge falls depends on the counts. See maneCrownGap.
    ['maneTop', 0, 0.4], ['maneBottom', MIN_MANE_BOTTOM, 1], ['maneStagger', 'bool'],
  ],
});

// ---------------------------------------------------------------- species

// How much motion variation ONE lion gets. See owl.js for the shape and the reasoning.
//
// Heavy and deliberate. The owl is snappy and the llama is languid; a lion is neither -- it is
// unhurried but it commits, so the spring is stiff and the idle is slow. Starting values, to be
// tuned in the motion lab the way the llama's were.
export const MOTION_RANGES = Object.freeze({
  ...BASE_MOTION_RANGES,
  stiff:    [70, 210],
  idleRate: [0.55, 1.35],
  idleAmp:  [0.45, 1.25],
  headArc:  [0.70, 1.30],   // a short neck carries less of a head turn than the llama's
  bounce:   [0.01, 0.05],   // some weight in the step, unlike the llama's near-flat glide
  stride:   [1.30, 1.75],   // stocky legs, shorter steps
  kneeLift: [0.45, 1.05],   // a cat pads rather than places
});

export const lion = registerSpecies({
  id: 'lion',
  label: 'Lion',
  defaults: DEFAULT_PARAMS,
  randomRanges: RANDOM_RANGES,
  motionRanges: MOTION_RANGES,
  gui: { ...BASE_GUI, ...LION_GUI },
  buildKit,
  coatBulge,
  coatColorKey: 'maneColor',
  randomise: randomiseInto,
  onPresetChange: applyManePreset,
  presetKey: 'manePreset',
});

export const createLion = (P) => createCharacter(P, lion);
