import * as THREE from 'three';
import { POSES, holdMiddle, setGeometryDetail } from '../characters/npc.js';
import { MATCH, MOVES } from '../spinoff/combat.js';
import { attachControls, createControls } from '../spinoff/controls.js';
import { MOVE_POSES, entrantOf, stepFighter } from '../spinoff/fighter.js';
import { makeShadow, placeShadow } from '../spinoff/fx.js';
import { KICK_COMBO, shownStrike, strikeOf } from '../spinoff/kicks.js';
import { TICK_HZ } from '../spinoff/match.js';
import { countStrike, newCombo } from '../spinoff/punches.js';
import { SIM } from '../spinoff/sim.js';
import { aimGameCamera, makeStage } from '../spinoff/stage.js';
import { climbStep, rideStep, startClimb, startRide } from './equipment.js';
import { BAND, forSim, generateLevel } from './generate.js';
import { buildHero, faceOf, loadHero } from './hero.js';
import { GATE, outdoors, playground, sway } from './scenery.js';

// REUSE-SPEC.md §Level 1, Building it, step 2: the hero walks a generated level on the donut fighters' sim
// (spinoff/sim.js), with their keys and taps; decks are floors, so walking, jumping and falling off work already.
// Climbing and riding the slides and the pole work (equipment.js); stairs are blocks for now; swings come next (step 3).
setGeometryDetail('med');

const mine = loadHero();
if (!mine) location.replace('choose.html');
const seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
const level = generateLevel(seed), ground = level.floors[0];
const ME = 'me';
const el = (id) => document.getElementById(id);

const stage = makeStage(el('stage')), { scene, camera } = stage;
outdoors(scene);
scene.add(...playground(level));

const built = buildHero(mine), g = new THREE.Group().add(built.root), shadow = makeShadow(scene);
scene.add(g);
const solid = /** @type {any} */ (forSim(level));
// the donut fighters' later levels' rules: double jump on
const state = SIM.createMatch([entrantOf(faceOf(mine), built, { id: ME, team: 'heroes' })], solid, { match: { ...MATCH, doubleJump: true } });
const controls = createControls(ME, solid);
attachControls(controls, { camera, canvas: stage.renderer.domElement, buttons: { punch: el('punch'), kick: el('kick'), drop: el('drop') }, keyHelp: el('keys') });

let yaw = 0, shown = null, using = null, out = false;
const combo = { punch: newCombo(), kick: newCombo('kick', KICK_COMBO.length) };
// as the donut fighters' play page: a kick in the air turns you right round, a spinning jump kick on the way up, a
// backflip on the way down
const HANG = MOVES.stomp.hang / MOVES.stomp.steps;
const stompTurn = (f) => (!f.onGround && f.move === 'kick' && f.turn ? 2 * Math.PI * (1 - (1 - Math.min(1, f.step / HANG)) ** 2) : 0);

/** The punch or kick the hero is throwing, as the play page shows it. */
function strikeNow(f, tick) {
  const n = { punch: countStrike(combo.punch, f, tick), kick: countStrike(combo.kick, f, tick) }[f.move];
  shown = shownStrike(shown, n === undefined ? null : strikeOf(f.move, n, f.facing, f.step));
  return shown;
}

/** The hero where the sim has it, turned toward where it faces, walking, in the air, punching, kicking, spinning. */
function drawHero(f, dt, tick) {
  yaw += (((Math.PI / 2 - f.facing - yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 14);
  g.position.set(f.x, f.y, f.z);
  g.rotation.set(0, yaw + (f.turn === 'spin' ? stompTurn(f) : 0), 0);
  if (f.turn === 'flip' && stompTurn(f)) holdMiddle(g, f.height / 2, (o) => o.rotateX(-stompTurn(f)));
  const speed = f.onGround ? Math.hypot(f.vx, f.vz) : 0;
  stepFighter(built, dt, f.onGround || using ? POSES.rest : MOVE_POSES.air, speed, strikeNow(f, tick));
  placeShadow(solid, shadow, f, 0.42);
}

/** After each tick: up a climb the hero walked into, down a slide or the pole it got on, and never off the front or
 *  back of the band. */
function afterTick() {
  const f = state.fighters[0];
  if (!using) {
    const climb = startClimb(level.climbs, f), ride = climb ? null : startRide(level.rides, f);
    using = climb ? { step: climbStep, k: climb } : ride && { step: rideStep, k: ride };
  }
  if (using && !using.step(f, using.k)) using = null;
  f.z = Math.min(BAND.z1 - f.r, Math.max(BAND.z0 + f.r, f.z));
  throughGate(f);
}

// REUSE-SPEC.md §Level 1: the level ends out the iron gate, on the way to school (decided 2026-11-12)
// ponytail: school isn't a level yet, so the gate leads back to the lobby; the fence either side of it isn't solid
function throughGate(f) {
  if (out || f.x < ground.x1 - 0.4) return;
  if (Math.abs(f.z) > GATE - f.r) { f.x = ground.x1 - 0.4; return; }
  out = true;
  location.href = 'lobby.html';
}

/** What sways under the hero: the climb it's on, the bridges it stands on. */
function swaying(f) {
  const on = (b) => f.onGround && Math.abs(f.y - b.y) < 0.05 && f.x > b.x0 && f.x < b.x1 && f.z > b.z0 && f.z < b.z1;
  return new Set([...(using?.step === climbStep ? [using.k.c] : []), ...level.bridges.filter(on)]);
}

// the match camera (GAME_VIEW), following the hero along the level, held off the ends
const aim = new THREE.Vector3(3, 0.8, 0.1), goal = new THREE.Vector3();
function follow(f, dt) {
  aim.lerp(goal.set(THREE.MathUtils.clamp(f.x, ground.x0 + 3, ground.x1 - 3), 0.8 + f.y * 0.4, -0.1 + f.z * 0.4), Math.min(1, dt * 4));
  aimGameCamera(camera, aim);
}

let snap = SIM.snapshot(state), acc = 0;
stage.run((dt) => {
  for (acc += dt; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
    // ponytail: no clock on a level; the donut fighters' round ends 90 s in, so the round's start keeps moving up
    state.t0 = state.tick;
    SIM.tick(state, { [ME]: controls.take(snap) });
    afterTick();
    snap = SIM.snapshot(state);
  }
  const f = snap.fighters.find((o) => o.id === ME);
  drawHero(f, dt, snap.tick);
  sway(swaying(f), snap.tick / TICK_HZ);
  follow(f, dt);
});
el('leave').addEventListener('click', () => { location.href = 'lobby.html'; });
