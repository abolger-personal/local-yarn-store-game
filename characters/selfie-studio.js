// The selfie studio: one body, dressed, posed and framed by selfie.js, rendered once over a painted
// backdrop (store/ui/backdrop.js) and thrown away. Only the picture is kept.
//
// Shared by the shop's Guestbook (store/ui/photo.js) and the crowd page's selfie sheet, so the
// picture checked on a crowd is the picture the game takes. selfie.js stays DOM-free for node;
// this is the half that needs a WebGL context.

import * as THREE from 'three';
import { roomEnvironment } from '../inventory/room-environment.js';
import { createCharacter, disposeCharacter } from './npc.js';
import { LOOK, dress, undress } from './garments.js';
import { gradeSelfie, idLook, scoredSelfie, selfieScore, takeSelfie } from './selfie.js';
import { paintBackdrop } from './store/ui/backdrop.js';

export const W = 240, H = 300;

// ponytail: a second WebGL context, made on the first photo and kept. Rendering through the page's
// renderer into a target and reading the pixels back would save the context; not worth it for one.
let studio = null;

function buildStudio() {
  // Transparent: the character is laid over a backdrop painted in 2D (see backdrop.js).
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(roomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#ffe6c4', 2.4);
  key.position.set(1.5, 3, 2.5);
  const rim = new THREE.DirectionalLight('#bcd4ff', 0.9);
  rim.position.set(-2, 2, -2);
  scene.add(key, rim, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55));
  const print = document.createElement('canvas');
  print.width = W;
  print.height = H;
  return { renderer, scene, camera: new THREE.PerspectiveCamera(30, W / H, 0.01, 50), print: print.getContext('2d') };
}

/** Where `p` lands in the picture, in pixels. */
function inPicture(camera, p) {
  const q = p.clone().project(camera);
  return { x: ((q.x + 1) / 2) * W, y: ((1 - q.y) / 2) * H };
}

/** How far a level line through the head leans in the picture: the horizon leans the same. */
function horizonTilt(camera, built) {
  const head = built.joints.head.getWorldPosition(new THREE.Vector3());
  const across = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const a = inPicture(camera, head), b = inPicture(camera, head.clone().add(across));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** A world point to pixels, or null behind the lens (where project() would wrap it round). */
function projector(camera) {
  const v = new THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -camera.near) return null;
    v.applyMatrix4(camera.projectionMatrix);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };
}

/**
 * What the backdrop needs from this shot (backdrop.js paintBackdrop): the roll, where the horizon
 * is -- a point far off straight ahead at the lens's own height -- a projection, and the floor under
 * their feet, so the pavement and its shadow are where the lens would see them.
 */
function viewOf(camera, built) {
  const project = projector(camera);
  const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(1e4).add(camera.position);
  const root = built.root.getWorldPosition(new THREE.Vector3());
  return {
    tilt: horizonTilt(camera, built),
    // looking straight down there is no horizon ahead: put it far above the picture
    horizon: project(ahead.x, camera.position.y, ahead.z) ?? { x: W / 2, y: -H * 10 },
    project,
    feet: { x: root.x, y: new THREE.Box3().setFromObject(built.root).min.y, z: root.z, r: built.params.torsoW * 0.9 },
  };
}

/** Render the posed, framed character over a fresh backdrop, as a data URL. */
function develop(built) {
  studio.renderer.render(studio.scene, studio.camera);
  paintBackdrop(studio.print, viewOf(studio.camera, built));     // a new one every picture
  studio.print.drawImage(studio.renderer.domElement, 0, 0, W, H);
  return studio.print.canvas.toDataURL('image/png');
}

/**
 * A selfie of a body (`body`: its params; `kit`: its species) wearing and holding `outfit`
 * (dress()'s), of what they made (`type`, the outfit key it is under; none: all of it; and its
 * `silhouette`, which picks the authored shot where one is keyed by it, selfie.js shotFor). `look` is
 * the page's tone mapping and exposure, so the picture matches the page it is shown on.
 * Returns the picture as a data URL, which shot took it (selfie.js), and with `grade`, gradeSelfie's
 * numbers for it and the scored search's score. `scored`: taken by the scored search (scoredSelfie),
 * the shot then its pick, or null when no shot passed its rules.
 */
export function snap({ body, kit, outfit, type = null, silhouette = null }, { toneMapping, exposure }, { grade = false, scored = false } = {}) {
  studio ??= buildStudio();
  studio.renderer.toneMapping = toneMapping;
  studio.renderer.toneMappingExposure = exposure;
  // Un-merged, so it can be dressed.
  const built = createCharacter({ ...body, mergeMeshes: false }, kit);
  const { viewPx } = LOOK;
  LOOK.viewPx = 0;     // a close-up: build every stitch's relief, not the crowd's cut
  // A bag's selfie shows it held up in the free paw: worn at the hip or on the back, no lens finds it.
  const shown = type === 'bag' && outfit.bag ? { ...outfit, bag: { ...outfit.bag, held: true } } : outfit;
  try { dress(built, shown); } finally { LOOK.viewPx = viewPx; }
  studio.scene.add(built.root);
  // After dressing (garments are built at rest, and follow the pose), and of what they made: the
  // shot that shows a hat is not the one that shows a cowl.
  const look = idLook(built);
  const shot = scored ? scoredSelfie(built, studio.camera, type, look) : takeSelfie(built, studio.camera, type, silhouette, look);
  const grades = grade ? { ...gradeSelfie(built, studio.camera, type, look), score: selfieScore(built, studio.camera, type, look) } : null;
  const url = develop(built);
  studio.scene.remove(built.root);
  undress(built);
  disposeCharacter(built);
  return { url, shot, grades };
}
