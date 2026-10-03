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

/** A snout longer than the head is wide: a llama's is 1.3-3 head radii, a lion's under 0.5. */
const longSnout = (P) => (P.muzzleLength ?? 0) > P.headRadius;

// How much of what they made, and of their eyes, must be in view for a style to do. A hat's back
// half faces away from any lens. Measured: the owl's own hat shot shows 15-30% of it, and that is
// the shot to keep; a llama's close shot shows 0% of its hat and at most 6% of its eyes.
const ENOUGH = 0.1;

const lensDir = (up) => new THREE.Vector3(-0.42, up, 1).normalize();     // out along arm 0, above
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
function aim(camera, head, half, { up, k, drop, off }) {
  const target = head.clone().add(new THREE.Vector3(off * half * k, -drop * half * k, 0));
  camera.position.copy(target).addScaledVector(lensDir(up), (k * half) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.rotateZ(ROLL);
  camera.updateMatrixWorld(true);
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
    pupil.position.set(x, y, pupil.position.z - depth + surface);
  }
}

const _ray = new THREE.Raycaster();
/**
 * The share of `parts` the camera sees: of up to `samples` of their vertices, how many are in
 * frame with nothing of the character's in front. Skinned parts are sampled where they are drawn.
 */
export function seenShare(built, camera, parts, samples = 30) {
  const meshes = [];
  built.root.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
  let n = 0, seen = 0;
  for (const part of parts) {
    const { count } = part.geometry.attributes.position;
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / samples))) {
      const p = part.localToWorld(part.getVertexPosition(i, new THREE.Vector3()));
      n++;
      if (!onScreen(camera, p)) continue;
      const to = p.clone().sub(camera.position), dist = to.length();
      _ray.set(camera.position, to.normalize());
      _ray.far = dist + 0.01;
      const first = _ray.intersectObjects(meshes, false)[0];
      if (!first || parts.includes(first.object) || first.distance > dist - 0.004) seen++;
    }
  }
  return n ? seen / n : 0;
}

/** Every eye's meshes: the white and the pupil. */
const eyesOf = (built) => built.joints.eye.flatMap(({ node }) => node.children.filter((c) => c.isMesh));

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
 */
export function takeSelfie(built, camera, type) {
  const worn = built.garments ?? [];
  const subject = worn.filter((m) => m.userData.worn?.includes(type));
  const parts = subject.length ? subject : worn;
  let best = null;
  for (const style of STYLES.filter((st) => !(st.flatFaced && longSnout(built.params)))) {
    frame(built, camera, style, parts);
    lookAtLens(built, camera);
    // the eyes first: a few small meshes, against a garment that can be tens of thousands of triangles
    const eyes = seenShare(built, camera, eyesOf(built));
    const score = eyes < ENOUGH || !parts.length ? eyes : Math.min(eyes, seenShare(built, camera, parts));
    if (style.flatFaced && score >= ENOUGH) return style.name;    // the shot tuned by eye, when it works
    if (!best || score > best.score) best = { style, score };
  }
  frame(built, camera, best.style, parts);
  lookAtLens(built, camera);
  return best.style.name;
}
