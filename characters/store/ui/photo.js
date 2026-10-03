// The Guestbook selfie: the NPC, dressed in what they made, as a 2D picture.
//
// CHARACTER-VISIT.md: "a picture generated of them holding object ... pictured in/with it even if
// they are not currently wearing it". A selfie: the pose and the phone's position are selfie.js,
// what is behind them backdrop.js. The shop's own NPCs are merged and undressed (see the ponytail
// note at the top of garments.js), so the photo is a fresh, un-merged copy of their body, dressed,
// rendered once over a backdrop, and thrown away. Only the picture is kept.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TONE_MAPPING, createCharacter, disposeCharacter, getSpecies } from '../../npc.js';
import { LOOK, dress, undress, wornAs } from '../../garments.js';
import { YARN_COLORS } from '../goods/stock.js';
import { S } from '../core/config.js';
import { shop } from '../core/state.js';
import { takeSelfie } from '../../selfie.js';
import { paintBackdrop } from './backdrop.js';

const W = 240, H = 300;

// ponytail: a second WebGL context, made on the first photo and kept. Rendering through the shop's
// renderer into a target and reading the pixels back would save the context; not worth it for one.
let studio = null;

function buildStudio() {
  // Transparent: the character is laid over a backdrop painted in 2D (see backdrop.js).
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  renderer.toneMapping = TONE_MAPPING[S.toneMapping];
  renderer.toneMappingExposure = S.exposure;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
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

const colourOf = (yarn) => YARN_COLORS[yarn.colorIndex % YARN_COLORS.length];

/** Everything they have on, with the photographed object last so it wins its slot. */
function outfitFor(npc, wip) {
  const made = [...Object.values(npc.worn).filter(Boolean), wip].map((w) => wornAs(w, colourOf));
  return Object.fromEntries(made.filter(Boolean).map(({ type, item }) => [type, item]));
}

/** Render the posed, framed character over a fresh backdrop, as a data URL. */
function develop(built) {
  studio.renderer.render(studio.scene, studio.camera);
  paintBackdrop(studio.print, horizonTilt(studio.camera, built));     // a new one every picture
  studio.print.drawImage(studio.renderer.domElement, 0, 0, W, H);
  return studio.print.canvas.toDataURL('image/png');
}

/** One photo as a data URL. Cached per guestbook entry: a selfie is taken once. */
const photos = new WeakMap();
function photoOf(entry, npc) {
  if (photos.has(entry)) return photos.get(entry);
  studio ??= buildStudio();
  const outfit = outfitFor(npc, entry.wip);
  // Un-merged, so it can be dressed.
  const built = createCharacter({ ...npc.body, mergeMeshes: false }, getSpecies(npc.speciesId));
  const { viewPx } = LOOK;
  LOOK.viewPx = 0;     // a close-up: build every stitch's relief, not the crowd's cut
  try { dress(built, outfit); } finally { LOOK.viewPx = viewPx; }
  studio.scene.add(built.root);
  // After dressing (garments are built at rest, and follow the pose), and of what they made: the
  // shot that shows a hat is not the one that shows a cowl.
  takeSelfie(built, studio.camera, wornAs(entry.wip, colourOf)?.type);
  const url = develop(built);
  studio.scene.remove(built.root);
  undress(built);
  disposeCharacter(built);
  photos.set(entry, url);
  return url;
}

/**
 * A guestbook photo entry's picture, or null. A past day's entry carries who signed it (see
 * fileGuestbook in world.js); today's visitors are still in the shop.
 */
export function photoFor(entry) {
  const who = entry.who ?? shop.world?.npcs.find((n) => n.id === entry.npcId);
  return who ? photoOf(entry, who) : null;
}
