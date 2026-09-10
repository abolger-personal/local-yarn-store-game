// Renderer, scene, camera, orbit controls and lights.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { TONE_MAPPING } from '../../npc.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { S } from '../core/config.js';

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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = TONE_MAPPING[S.toneMapping];
  renderer.toneMappingExposure = S.exposure;
  app.appendChild(renderer.domElement);
  scene.background = new THREE.Color('#e8e2d9');
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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
  controls.maxDistance = 16;   // beyond this the room is a small object on screen, not a diorama
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

/** A warm key with a tight shadow camera, a cool hemisphere fill, and a cool rim from behind. */
function setUpLights() {
  key.position.set(3.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  // A box just big enough for the room. Wider wastes shadow-map resolution on empty floor.
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  key.shadow.bias = -0.0012;
  key.shadow.radius = 3;
  rim.position.set(-4, 2.5, -5);
  scene.add(key, new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.6), rim);
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installStage() {
  setUpRenderer();
  setUpControls();
  setUpLights();
}
