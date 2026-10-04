// Renderer, scene, camera, orbit controls and lights.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { TONE_MAPPING } from '../../npc.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../../../inventory/room-environment.js';
import { ROOM, S } from '../core/config.js';
import { shop } from '../core/state.js';

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');

export const renderer = new THREE.WebGLRenderer({ antialias: true });

export const applyRenderScale = () =>
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * S.renderScale);

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 200);

export const controls = new OrbitControls(camera, renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);

export const key = new THREE.DirectionalLight('#ffe6c4', 2.4);

export const rim = new THREE.DirectionalLight('#bcd4ff', 0.9);

function setUpRenderer() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = TONE_MAPPING[S.toneMapping];
  renderer.toneMappingExposure = S.exposure;
  app.appendChild(renderer.domElement);
  scene.background = new THREE.Color('#e8e2d9');
  scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;
}

/**
 * Fence the camera in, and hand the primary button to the PLAYER'S VERB.
 *
 * Hiding the near walls only works while the camera stays above the shop looking down into it.
 * Below the horizon you would be under the floor with every near wall culled, which is exactly
 * the "outside of the box" view the cutaway exists to prevent. 0.42π keeps a shallow angle
 * available (good for reading shelf faces) without ever reaching level with the floor.
 *
 * Arranging is the only thing the player does in this game (LYS.md), so left-drag is theirs and
 * orbiting moves to right-drag — the same mapping as inventory/stash-and-stuff.html, so the
 * muscle memory carries over.
 */
function setUpControls() {
  controls.enableDamping = true;
  controls.minDistance = 2.5;
  controls.maxPolarAngle = Math.PI * 0.42;
  // Beyond this the room is a small object on screen, not a diorama. ~1.3x the distance at which
  // the whole room just fits a landscape view from the default angle (14.6 at 16:9 for the 9.6 x 7.2
  // shop, measured in scratchpad/layout-probe.mjs) — the same headroom 16 gave the old 6.4 room.
  controls.maxDistance = 20;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  // Panning must not let the player drag the shop off screen and lose it.
  controls.screenSpacePanning = false;
}

/*
 * Why `controls.touches` is a CONSTANT, and the event is withheld instead.
 *
 * ONE finger is the player's verb when there is something under it, and the camera otherwise.
 * That used to be done by REWRITING controls.touches.ONE on every pointerdown, and it caused the
 * camera to spin on its own: this page's handler runs on the window in the CAPTURE phase, so it
 * flipped the setting before OrbitControls had read it, and OrbitControls then measured a drag
 * against a start point recorded under the other setting. One stale delta, amplified by damping,
 * reads as the view suddenly whipping round. Now a press that belongs to the player is stopped
 * before it reaches OrbitControls, so no rotation is ever begun that has to be cancelled.
 * See onPointerDown.
 *
 * TWO fingers PAN and zoom, they do not rotate. DOLLY_ROTATE was the default here and it made
 * every two-finger drag spin the room, because dolly tracks finger SEPARATION while rotate tracks
 * the midpoint — and separation is so much the more sensitive of the two that a pan attempt reads
 * as a spin. Pinch-to-zoom plus two-finger-pan is also what every map on a tablet does, so it is
 * the gesture a player already has. Rotation stays on one finger over empty floor.
 */

export const hemi = new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.6);

/** A warm key with a tight shadow camera, a hemisphere fill, and a rim from behind. */
function setUpLights() {
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  // A box just big enough for the room. Wider wastes shadow-map resolution on empty floor.
  // DERIVED: the room's half-diagonal plus enough for the wall tops, which the sun sees side-on.
  // A hand-typed ±5 is what clipped the corners the moment the room grew; at 9.6 x 7.2 the
  // morning sun's worst wall-top corner lands at 96% of this box.
  const r = Math.hypot(ROOM.w, ROOM.d) / 2 + 0.8;
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 1;   // three 0.160 ignored this under PCFSoft; 1 keeps that edge now PCF is soft
  rim.position.set(-4, 2.5, -5);
  scene.add(key, hemi, rim);
  applyDaylight(0);
}

// ---------------------------------------------------------------- the light over a day
//
// The shop opens on a bright morning and closes on a cosy late afternoon, and the light walks
// between the two as the day goes (shop.dayT). Two looks and a lerp rather than a sun model: what
// matters is the mood at each end, and both ends are authored.
//
// The sun is the key light, and it comes in through the WINDOWS: high from the back-left in the
// morning, so the room is bright all over; low and amber from the back-right in the afternoon, so
// the walls shade most of the floor and the sun lands in long pools through the window openings.
// The walls cast that shade even while the cutaway hides them — see bakeShadowCasters in room.js.
//
// The afternoon sun is low enough that the back wall's shadow reaches the FRONT wall: 2.6 high at
// 0.9/0.30 is 7.8 of shade against a 7.2-deep room. Any higher (0.34 gave 6.9) and a strip of sun
// slides over the back wall onto the floor by the door, which no window explains.
//
// `lamp` is how bright the lamps are, 0-1: off in the morning, on by the afternoon.
const LOOKS = {
  morning: {
    sunDir: [-0.4, 1.1, -0.2], sun: '#fff4e4', sunI: 2.6,
    sky: '#e4eeff', ground: '#9a8a74', hemiI: 0.8, rimI: 0.7, bg: '#e6ecee', lamp: 0.15,
  },
  afternoon: {
    sunDir: [0.25, 0.30, -0.9], sun: '#ffb46e', sunI: 3.2,
    sky: '#ffd8b0', ground: '#6e5242', hemiI: 0.5, rimI: 0.15, bg: '#f0c493', lamp: 1,
  },
};

/** Lamps register here — `{ light, shade, power }`, light may be null — so the day can turn them up. */
export const lamps = [];

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixColor = (target, a, b, t) => target.copy(_ca.set(a)).lerp(_cb.set(b), t);
const mix = (a, b, t) => a + (b - a) * t;

/** Set the whole rig to a point in the day, 0 = morning, 1 = late afternoon. */
export function applyDaylight(t) {
  const { morning: m, afternoon: a } = LOOKS;
  key.position.copy(_a.fromArray(m.sunDir).normalize()
    .lerp(_b.fromArray(a.sunDir).normalize(), t).normalize().multiplyScalar(10));
  mixColor(key.color, m.sun, a.sun, t);
  key.intensity = mix(m.sunI, a.sunI, t);
  mixColor(hemi.color, m.sky, a.sky, t);
  mixColor(hemi.groundColor, m.ground, a.ground, t);
  hemi.intensity = mix(m.hemiI, a.hemiI, t);
  rim.intensity = mix(m.rimI, a.rimI, t);
  if (scene.background instanceof THREE.Color) mixColor(scene.background, m.bg, a.bg, t);
  const glow = mix(m.lamp, a.lamp, t);
  for (const l of lamps) {
    if (l.light) l.light.intensity = glow * l.power;
    l.shade.emissiveIntensity = 0.15 + glow * 0.85;
  }
}

let shownT = 0;

/**
 * Ease toward the hour, once a frame. A round lands as a jump in shop.dayT; eased, the light drifts
 * instead of stepping. The overnight reset (1 back to 0) eases too, as a short dawn.
 */
export function tickDaylight(dt) {
  const target = S.followDay ? shop.dayT : S.timeOfDay;
  if (Math.abs(target - shownT) < 1e-4) return;
  shownT += (target - shownT) * (1 - Math.exp(-dt / 1.2));
  applyDaylight(shownT);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installStage() {
  setUpRenderer();
  setUpControls();
  setUpLights();
}
