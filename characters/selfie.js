// The Guestbook selfie: how a character holds the phone, and where the phone is.
//
// What makes a picture read as a selfie rather than a portrait, in order of how much it matters:
// one arm reaching toward the lens, the lens above eye level and off to that arm's side looking
// down, a wide lens held close (so the face is big and the body falls away), and a horizon that is
// not level. Kept apart from the shop's photo studio so it can be checked in node.

import * as THREE from 'three';
import { POSES, applyPose } from './npc.js';

/**
 * Arm 0 (the -x one) out and up toward the lens. The rig has no one-arm channel: armSwingAlt is
 * armSwing's anti-symmetric partner, so equal amounts of both swing arm 0 by twice that and leave
 * arm 1 hanging. Measured on all three species: at -1.0 the hand comes up level with the shoulder
 * and forward of the face; past -1.2 it folds back toward the head.
 */
const ARM = { armSwing: -1.0, armSwingAlt: -1.0, armOut: 0.25, armOutAlt: 0.25, elbowBend: 0.1, earPerk: 0.3 };

/**
 * Ways to take one, tried in this order until one shows what they made. Signs measured: -headYaw
 * turns the face to -x (toward the lens), -headPitch lifts it, -headTilt drops the crown toward -x.
 *
 * close: the face lifted into a wide lens held close. The owl's, tuned by eye: first, so any body
 *   it works for keeps it. Flat faces only: a snout aimed down a close wide lens comes out
 *   enormous whether or not it happens to hide anything, so a long one never gets this shot.
 * high: lifted into a close wide lens, a llama's snout points straight down it, comes out
 *   enormous, and hides its own eyes (2% in view) and its hat (0%). So the nose goes down, the lens
 *   goes up (the crown is what faces it), and the lens is narrower from further back, which takes
 *   out most of the big-nose distortion. Lower only when the hand would be in front of the face.
 * neck: the high shot shows a crown and hides a throat, so a cowl on a long neck disappears under
 *   the snout. Chin up and turned aside, a lower lens: the throat is what faces it.
 */
const STYLES = Object.freeze([
  { name: 'close', pose: { headYaw: -0.35, headPitch: -0.3 }, fov: 62, heights: [0.38], flatFaced: true },
  { name: 'high', pose: { headYaw: -0.2, headPitch: 0.2 }, fov: 40, heights: [0.7, 0.55, 0.38] },
  { name: 'neck', pose: { headYaw: 0.3, headPitch: -0.45 }, fov: 40, heights: [0.15, 0.3, 0.45] },
].map((s) => Object.freeze({ ...s, pose: Object.freeze({ ...POSES.rest, ...ARM, headTilt: -0.15, ...s.pose }) })));

/**
 * The other arm, when what they made is IN it (garments.js HELD_BUILDERS, on holds[1]): swung
 * straight out in front, which turns the hold the way held pieces are built (their up is up).
 * Per side the swing is armSwing - side * armSwingAlt, so this keeps arm 0 at ARM's -2 and puts
 * arm 1 at -1.45.
 */
const SHOW = Object.freeze({ armSwing: -1.725, armSwingAlt: -0.275 });

/**
 * A photo someone else takes from behind (a shot's `behind`, the shawl's): no phone, both arms
 * straight out to the sides to spread what is on their back -- armOut 1.57 brings each paw level
 * with its shoulder, measured the same on all three species -- and the body twisted against the
 * head's turn (shoot), which measured 67-79% of the eyes seen on every species where twisting with it
 * left a lion's at 0%. How far the head itself goes
 * is the species' own (headYawMax): an owl looks straight back, a lion only over its shoulder.
 */
const SPREAD = Object.freeze({ armSwing: 0, armSwingAlt: 0, armOut: 1.57, armOutAlt: 0, elbowBend: 0.05, spineTwist: 0.6 });

/**
 * Authored shots, by what the selfie is of (an outfit key: a garment type, a held decor type, or
 * `pile`), and by species where one needs its own (`owl`, `llama`, `lion`; else `all`). Picked by
 * eye on crowd.html (selfies -> tune), then frozen here. A shot is the head's turn and lift, and a
 * framing for aim(): `up` the lens height (below 0, under the face looking up), `k` how far out
 * (1 is the face framing), `drop`/`off` how far the aim slides from the head (down toward what they
 * made, away from the phone arm), in frame halves, and the lens's `fov`. No shot: searched (STYLES).
 *
 * A fixed framing gives up the search's guarantees (the phone hand out, the eyes in), so each was
 * judged by eye with gradeSelfie's numbers beside it. Tuned 2026-10-10. Missing: bag, socks, the
 * pot holder and the armful; the owl's sweater keeps the search; hats are tuned on the owl only.
 */
export const SHOTS = {
  hat: { owl: { headYaw: -0.2, headPitch: 0.2, fov: 40, up: 0.7, k: 0.6, drop: 0.15, off: 0.2 } },
  scarf: {
    all: { headYaw: -0.85, headPitch: -0.9, fov: 60, up: 1.13, k: 0.86, drop: 0.67, off: 0 },
    llama: { headYaw: 0.3, headPitch: -0.45, fov: 40, up: 0.25, k: 1.51, drop: 0.55, off: 0.5 },
    lion: null,   // the shared shot bent its head down over the scarf: 14% of its eyes
  },
  shawl: {
    all: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 2.2, drop: 0.35, off: 0, behind: true },
    owl: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 1.51, drop: 0.35, off: 0, behind: true },
  },
  sweater: { llama: { headYaw: 0.2, headPitch: 0.43, fov: 40, up: -0.05, k: 1.6, drop: 0.81, off: 0.35 } },
  bag: {
    all: { headYaw: 0.25, headPitch: 0.16, fov: 42, up: 0.93, k: 1, drop: 0.8, off: 0.5 },
    llama: { headYaw: 0.25, headPitch: 0.16, fov: 42, up: 0.93, k: 1.32, drop: 0.81, off: 0.5 },
  },
  socks: {
    all: { headYaw: -0.3, headPitch: 0.1, fov: 50, up: 0.4, k: 1, drop: 0.95, off: 0.3 },
    llama: null,     // searched until a llama shot is tuned
  },
};

/** The authored shot of `type` for this species, or null: searched. A species set to null opts out of `all`. */
export const shotFor = (type, speciesId) => {
  const shots = SHOTS[type] ?? {};
  return (Object.hasOwn(shots, speciesId) ? shots[speciesId] : shots.all) ?? null;
};

/** A snout longer than the head is wide: a llama's is 1.3-3 head radii, a lion's under 0.5. */
const longSnout = (P) => (P.muzzleLength ?? 0) > P.headRadius;

// How much of what they made, and of their eyes, must be in view for a style to do. A hat's back
// half faces away from any lens. Measured: the owl's own hat shot shows 15-30% of it, and that is
// the shot to keep; a llama's close shot shows 0% of its hat and at most 6% of its eyes.
const ENOUGH = 0.1;

/**
 * Where the lens is from the head: out along arm 0 in front, or, for a shot someone else takes from
 * behind (`back`, the side the head turns to: 1 or -1), behind them on that side.
 */
const lensDir = (up, back = 0) => (back ? new THREE.Vector3(0.42 * back, up, -1) : new THREE.Vector3(-0.42, up, 1)).normalize();
const ROLL = -0.15;                                                        // the held-out phone's tilt
// The face spans half the frame's width: the owl's, tuned by eye, and the one that reads as a selfie.
// Framing head-to-chest instead left a llama's small head on its long neck at a quarter of it, the
// llama a third of the picture away from either edge.
const FACE = 2.95;                // frame half-height, in head radii, at k = 1

const _v = new THREE.Vector3();
const onScreen = (camera, p, m = 1) => {
  _v.copy(p).project(camera);
  return Math.abs(_v.x) <= m && Math.abs(_v.y) <= m && _v.z < 1;
};

/**
 * Put the camera `k` times the face framing's distance out, `up` high, aimed at the head moved
 * `drop` frame halves down (toward what they made) and `off` halves away from arm 0 (off-centre).
 */
function aim(camera, head, half, { up, k, drop, off, back = 0 }) {
  const target = head.clone().add(new THREE.Vector3(off * half * k, -drop * half * k, 0));
  camera.position.copy(target).addScaledVector(lensDir(up, back), (k * half) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.rotateZ(back ? 0 : ROLL);     // a friend holds the camera level
  camera.updateMatrixWorld(true);
}

/**
 * Whether the phone hand is wholly in the picture. Cut by the edge is fine; all of it in, and the
 * phone it holds would be in too -- the illusion that the lens IS the phone breaks.
 */
function handWhole(camera, built) {
  const paw = built.holds[0].parent.children[0];
  const arm = built.joints.upperArm.find(({ node }) => node.getObjectById(paw.id)).node;
  // An owl's wing wraps its arm, paw and all: the wing is what shows, so it is what must be cut.
  // The arm's own taper and cap come first; garments (a sleeve) are not part of the hand.
  const wing = arm.children.slice(2).filter((c) => c.isMesh && !c.userData.worn);
  const p = new THREE.Vector3();
  return [paw, ...wing].every(({ geometry: { attributes: { position } }, matrixWorld }) => {
    for (let i = 0; i < position.count; i++) if (!onScreen(camera, p.fromBufferAttribute(position, i).applyMatrix4(matrixWorld))) return false;
    return true;
  });
}

/** The points a selfie is framed by, in world space, as the character stands now. */
function landmarks(built, subject) {
  const at = (o) => o.getWorldPosition(new THREE.Vector3());
  const head = at(built.joints.head), hand = at(built.holds[0]);
  const worn = subject.length ? subject.reduce((b, g) => b.expandByObject(g), new THREE.Box3()) : null;
  return {
    head, hand,
    crown: head.clone().setY(head.y + built.params.headRadius),
    // what they made has to be IN it, not just its edge: a quarter of the way down from its top
    made: worn ? worn.getCenter(new THREE.Vector3()).setY(worn.max.y - (worn.max.y - worn.min.y) * 0.25) : head,
  };
}

/** Candidate framings: the highest lens first, then closest first, so zooming out is given up last. */
function* framings(heights) {
  for (const up of heights) for (let k = 1; k <= 2.21; k += 0.1) {
    for (const drop of [0.3, 0.55, 0.8, 1.05]) for (let off = 0.1; off <= 0.61; off += 0.05) yield { up, k, drop, off };
  }
}

/**
 * Pupils on the lens. The rig has no gaze, but buildEye puts the white (child 0) and the pupil
 * (child 1) on one joint at the eyeball's centre, so the pupil can slide across the white's face
 * toward the camera, kept on its surface. Eyes at the side of the head (a llama's) look forward out
 * of their front edge. GAZE is how far across, as a share of the white's radius.
 */
const GAZE = 0.45;
function lookAtLens(built, camera) {
  for (const { node } of built.joints.eye) {
    const [white, pupil] = node.children;
    if (!white || !pupil) continue;
    const to = node.worldToLocal(camera.position.clone()).normalize();
    const r = white.scale.x, ry = white.scale.y, depth = white.scale.z;
    const x = to.x * r * GAZE, y = to.y * ry * GAZE;
    const surface = depth * Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / ry) ** 2));
    // from where the rig put it, not from the last call's: from there, every call sank it deeper
    const rest = (pupil.userData.restZ ??= pupil.position.z);
    pupil.position.set(x, y, rest - depth + surface);
  }
}

// ---------------------------------------------------------------- what the lens sees
//
// An ID buffer, rasterized in plain JS: every mesh's triangles drawn into a picture-sized grid that
// keeps, per pixel, the nearest mesh. Was a raycast per sample, which tested every ray against every
// triangle: 4-14s a selfie against a full outfit's 60-190k triangles. One pass a camera instead, on
// the CPU so node's tests run the very code the game does.

const LOOK_W = 240;            // the photo's own width: what a pixel can hide is what the picture shows
const _p = new THREE.Vector3(), _p4 = new THREE.Vector4(), _vp = new THREE.Matrix4(), _q = new THREE.Vector3();

/**
 * A `look` for seenShare: is world point `p` (on one of `parts`) seen from `camera`, in frame with
 * nothing of the character's in front of it? Its pixel shows one of `parts`, or nothing at all.
 * ponytail: plain geometry, so the sleeves' shader-side arm push (garments.js ARM_ATTRIBUTES) is not
 * in it, and a triangle crossing behind the lens is dropped rather than clipped. Millimetres, and
 * only the phone arm reaches that close.
 */
export function idLook(built) {
  const meshes = [];
  // what the renderer draws: an eye under a hat is hidden at its joint, not at its meshes
  built.root.traverseVisible((o) => { if (o.isMesh) meshes.push(o); });
  const buf = { w: 0, h: 0, id: null, z: null, key: '' };
  return (camera, p, parts) => {
    const key = `${camera.matrixWorld.elements.join(',')},${camera.projectionMatrix.elements.join(',')}`;
    if (key !== buf.key) { buf.key = key; drawIds(buf, meshes, camera); }
    _q.copy(p).project(camera);
    if (Math.abs(_q.x) > 1 || Math.abs(_q.y) > 1 || _q.z >= 1) return false;
    const col = Math.min(buf.w - 1, Math.floor(((_q.x + 1) / 2) * buf.w));
    const id = buf.id[Math.min(buf.h - 1, Math.floor(((1 - _q.y) / 2) * buf.h)) * buf.w + col];
    return id === 0 || parts.includes(meshes[id - 1]);
  };
}

/** Every mesh into a fresh buffer the camera's shape, mesh i as id i + 1 (0 is nothing). */
function drawIds(buf, meshes, camera) {
  buf.w = LOOK_W;
  buf.h = Math.round(LOOK_W / camera.aspect);
  buf.id = new Uint16Array(buf.w * buf.h);
  buf.z = new Float32Array(buf.w * buf.h).fill(Infinity);
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  meshes.forEach((m, i) => drawMesh(buf, m, i + 1));
}

/**
 * One mesh's triangles. Which faces are drawn follows its material's side, as a raycast's would:
 * `cull` 1 keeps the front faces only, -1 the back, 0 both. A mirroring transform swaps them.
 */
const CULL = { [THREE.FrontSide]: 1, [THREE.BackSide]: -1, [THREE.DoubleSide]: 0 };
function drawMesh(buf, mesh, id) {
  const pos = screenPositions(buf, mesh);
  const [{ side }] = [mesh.material].flat();
  const cull = CULL[side] * Math.sign(mesh.matrixWorld.determinant());
  const { index } = mesh.geometry, n = index ? index.count : pos.length / 3;
  for (let t = 0; t + 2 < n; t += 3) {
    /** @type {[number, number, number]} */
    const tri = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
    drawTri(buf, pos, tri, id, cull);
  }
}

/** Each vertex as [pixel x, pixel y, depth], skinned where drawn; NaN behind the lens. */
function screenPositions(buf, mesh) {
  const { count } = mesh.geometry.attributes.position;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    mesh.getVertexPosition(i, _p).applyMatrix4(mesh.matrixWorld);
    _p4.set(_p.x, _p.y, _p.z, 1).applyMatrix4(_vp);
    if (_p4.w <= 0) { out[i * 3] = Number.NaN; continue; }
    out[i * 3] = ((_p4.x / _p4.w + 1) / 2) * buf.w;
    out[i * 3 + 1] = ((1 - _p4.y / _p4.w) / 2) * buf.h;
    out[i * 3 + 2] = _p4.z / _p4.w;
  }
  return out;
}

/**
 * Which side of the edge a to b point (px, py) is on, as twice that triangle's signed area in
 * pixels (y down). A triangle's own area is negative when it faces the lens, as three winds them.
 */
const edge = (ax, ay, bx, by) => (px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);

/** One triangle: every pixel centre inside it, nearer than what is there, becomes `id`. */
function drawTri(buf, pos, [a, b, c], id, cull) {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], bx = pos[b * 3], by = pos[b * 3 + 1], cx = pos[c * 3], cy = pos[c * 3 + 1];
  const area = edge(ax, ay, bx, by)(cx, cy);
  if (!area || Number.isNaN(area) || cull * area > 0) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(buf.w - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(buf.h - 1, Math.ceil(Math.max(ay, by, cy)));
  const z = [pos[a * 3 + 2], pos[b * 3 + 2], pos[c * 3 + 2]];
  const toA = edge(bx, by, cx, cy), toB = edge(cx, cy, ax, ay);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const wa = toA(px, py) / area, wb = toB(px, py) / area, wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const k = y * buf.w + x, depth = wa * z[0] + wb * z[1] + wc * z[2];
      if (depth < buf.z[k]) { buf.z[k] = depth; buf.id[k] = id; }
    }
  }
}

/**
 * The share of `parts` the camera sees: of up to `samples` of their vertices, how many `look` says
 * are seen. Skinned parts are sampled where they are drawn.
 */
export function seenShare(built, camera, parts, samples = 30, look = idLook(built)) {
  let n = 0, seen = 0;
  for (const part of parts) {
    const { count } = part.geometry.attributes.position;
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / samples))) {
      n++;
      if (look(camera, part.localToWorld(part.getVertexPosition(i, new THREE.Vector3())), parts)) seen++;
    }
  }
  return n ? seen / n : 0;
}

/** Every eye's meshes: the white and the pupil. An eye a hat hides (garments.js) is none of them. */
const eyesOf = (built) => built.joints.eye.flatMap(({ node }) => (node.visible ? node.children.filter((c) => c.isMesh) : []));

/** Frame one style: pose, lens, and the closest framing that keeps the hand out (see takeSelfie). */
function frame(built, camera, style, subject) {
  applyPose(built, style.pose);
  built.root.updateMatrixWorld(true);
  const { head, hand, crown, made } = landmarks(built, subject);
  const half = built.params.headRadius * FACE;
  camera.fov = style.fov;
  camera.updateProjectionMatrix();
  for (const f of framings(style.heights)) {
    aim(camera, head, half, f);
    if (!onScreen(camera, hand) && onScreen(camera, crown, 0.97) && onScreen(camera, made)) return;
  }
  // nothing kept the hand out: the face, plainly, with the hand in it
  aim(camera, head, half, { up: style.heights[0], k: 1.3, drop: 0.3, off: 0.1 });
}

/**
 * What a taken selfie gets right, as numbers to judge a shot by: the phone hand cut by the frame or out of it,
 * the share of what they made (`type`) and of their eyes that can be seen, and how much of the
 * picture's width the face spans (the close shot's is about half).
 */
export function gradeSelfie(built, camera, type, look = idLook(built)) {
  const at = (o) => o.getWorldPosition(new THREE.Vector3());
  const made = (built.garments ?? []).filter((m) => m.userData.worn?.includes(type));
  const head = at(built.joints.head), across = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    .multiplyScalar(built.params.headRadius);
  return {
    handOut: shotFor(type, built.species?.id)?.behind ? null : !handWhole(camera, built),   // null: no phone
    made: made.length ? seenShare(built, camera, made, 30, look) : null,
    eyes: seenShare(built, camera, eyesOf(built), 30, look),
    face: (head.clone().add(across).project(camera).x - head.clone().sub(across).project(camera).x) / 2,
  };
}

/** What the selfie is of: the meshes holding `type`, or everything worn when none does. */
function subjectParts(worn, type) {
  const subject = worn.filter((m) => m.userData.worn?.includes(type));
  return subject.length ? subject : worn;
}

/** The styles this body can take, in order, with the other arm out when something is in it. */
const stylesFor = (built, showing) => STYLES.filter((st) => !(st.flatFaced && longSnout(built.params)))
  .map((st) => (showing ? { ...st, pose: { ...st.pose, ...SHOW } } : st));

/** Take an authored shot (SHOTS) as written: pose, lens, eyes on it. */
function shoot(built, camera, { headYaw, headPitch, fov, up, k, drop, off, behind = false }, showing) {
  // From behind, the camera stands on the side the head turns to: a positive headYaw turns it to -x.
  const back = behind ? -Math.sign(headYaw) || -1 : 0;
  applyPose(built, behind ? { ...POSES.rest, ...SPREAD, spineTwist: -SPREAD.spineTwist * back, headYaw, headPitch }
    : { ...POSES.rest, ...ARM, headTilt: -0.15, headYaw, headPitch, ...(showing && SHOW) });
  built.root.updateMatrixWorld(true);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  aim(camera, built.joints.head.getWorldPosition(new THREE.Vector3()), built.params.headRadius * FACE, { up, k, drop, off, back });
  lookAtLens(built, camera);
  return 'authored';
}

/**
 * Pose `built` for the selfie in `type` (the garment it is of) and put `camera` where the phone is.
 *
 * The phone is IN the raised hand, so a selfie never shows that hand: the arm runs out of the frame.
 * Bodies differ too much for one framing (an owl's wing reaches its face, a llama's leg stops halfway
 * up its neck), so it is searched for: face big first, then sliding the aim down toward what they
 * made and away from the arm, and only then zooming out. Kept in: the crown, and what they made.
 *
 * And no one shot shows everything: one that shows a llama's hat hides its cowl. So each style is
 * scored by raycasting what they made and their eyes (the lesser of the two). The close shot is
 * kept whenever it shows both; otherwise whichever style showed the most. Returns the style's name.
 *
 * An authored shot (SHOTS) skips all of that: it is taken as written, and named 'authored'.
 */
export function takeSelfie(built, camera, type, look = idLook(built)) {
  const worn = built.garments ?? [];
  const showing = worn.some((m) => m.parent === built.holds[1]);
  const shot = shotFor(type, built.species?.id);
  if (shot) return shoot(built, camera, shot, showing);
  const parts = subjectParts(worn, type);
  let best = null;
  for (const style of stylesFor(built, showing)) {
    frame(built, camera, style, parts);
    lookAtLens(built, camera);
    // the eyes first: a few small meshes, against a garment that can be tens of thousands of triangles
    const eyes = seenShare(built, camera, eyesOf(built), 30, look);
    const score = eyes < ENOUGH || !parts.length ? eyes : Math.min(eyes, seenShare(built, camera, parts, 30, look));
    if (style.flatFaced && score >= ENOUGH) return style.name;    // the shot tuned by eye, when it works
    if (!best || score > best.score) best = { style, score };
  }
  frame(built, camera, best.style, parts);
  lookAtLens(built, camera);
  return best.style.name;
}
