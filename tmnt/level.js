import * as THREE from 'three';
import { stepGlitter } from '../characters/glitter.js';
import { DANCES, POSES, holdMiddle, makeDance, placeDancer, setGeometryDetail, stepDance } from '../characters/npc.js';
import { MATCH, MOVES } from '../spinoff/combat.js';
import { KEYS, attachControls, createControls } from '../spinoff/controls.js';
import { MOVE_POSES, entrantOf, stepFighter } from '../spinoff/fighter.js';
import { makeShadow, placeShadow } from '../spinoff/fx.js';
import { KICK_COMBO, shownStrike, strikeOf } from '../spinoff/kicks.js';
import { TICK_HZ } from '../spinoff/match.js';
import { countStrike, newCombo } from '../spinoff/punches.js';
import { SIM } from '../spinoff/sim.js';
import { aimGameCamera, makeStage } from '../spinoff/stage.js';
import { BRIDGE, bridgeLift, bridgeSlide, climbStep, airSpan, dismountOf, dismountTime, onBridge, onStairs, rideStep, stairDip, stairsOff, startClimb, startRide, startSwing, swingStep, tappedPivot } from './equipment.js';
import { BAND, climbsOf, forSim, generateLevel } from './generate.js';
import { buildHero, faceOf, loadHero } from './hero.js';
import { GATE, outdoors, playground, pizzaTime, sway, swingSeats } from './scenery.js';

// REUSE-SPEC.md §Level 1, Building it, step 2: the hero walks a generated level on the donut fighters' sim
// (spinoff/sim.js), with their keys and taps; decks are floors, so walking, jumping and falling off work already.
// Climbing, the stairs, riding the slides and the pole, the bars and the swings work (equipment.js).
setGeometryDetail('med');

const mine = loadHero();
if (!mine) location.replace('choose.html');
const query = new URLSearchParams(location.search), seed = Number(query.get('seed')) || 1;
const level = generateLevel(seed, Number(query.get('level')) || 1), ground = level.floors[0];
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
const climbs = climbsOf(level), flights = climbs.filter((c) => /** @type {string} */ (c.kind) === 'stairs');
// the flight of stairs the hero is on, and how far down its slope the hero is drawn, eased
let flight = null, dip = 0;
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

// 🦶 held and let go is the sweep, the low spinning kick, as on the donut fighters' play page (spinoff/play.js keeps the
// hold's timing and the sweep's drawing to itself, so they are here too; playtest 2026-11-12: it did nothing here)
const SWEEP_SECONDS = MOVES.sweep.steps / TICK_HZ, SWEEP_HOLD = 0.4;
let kickSince = 0, danced = false, glitter = null;
const sweepCharge = () => (kickSince ? Math.min(1, (performance.now() - kickSince) / 1000 / SWEEP_HOLD) : 0);

function attachSweep() {
  const b = el('kick'), charge = () => { kickSince = performance.now(); };
  const letGo = () => { if (sweepCharge() >= 1) controls.sweep(); kickSince = 0; };
  b.addEventListener('pointerdown', charge);
  b.addEventListener('pointerup', letGo);
  b.addEventListener('pointercancel', () => { kickSince = 0; });
  addEventListener('keydown', (e) => { if (e.code === KEYS.kick && !e.repeat && !(e.metaKey || e.ctrlKey || e.altKey)) charge(); });
  addEventListener('keyup', (e) => { if (e.code === KEYS.kick) letGo(); });
}
attachSweep();

/** The wuxia sweep is its dance, posed from how far through the move the hero is; null when it isn't sweeping. */
function sweepFrame(f) {
  if (f.move !== 'sweep') return null;
  const perf = makeDance('wuxia-turn');
  return { perf, d: stepDance(perf, f.step * SWEEP_SECONDS) };
}

// REUSE-SPEC.md §Dismounts: off a bar or a swing the hero does a Biles dismount through its flight, its own jump and
// travel left out (the launch is those), and its landing after
const HOME = built.root.position.clone();
let dismount = null;
function dismountFrame(f, tick) {
  if (!dismount || using) { dismount = null; return null; }
  if (dismount.landed === null && f.onGround && tick > dismount.t0 + 3) dismount.landed = tick;
  // no buttons, no flips: a plain landing
  if (!dismount.name) { if (dismount.landed !== null) dismount = null; return null; }
  const span = airSpan(DANCES[dismount.name].steps), down = dismount.landed === null ? null : (tick - dismount.landed) / TICK_HZ;
  // the landing, and the wolf turn if it has one, but not the salute
  if (down !== null && down > Math.min(1.2, span.end - span.to - 0.9)) { dismount = null; return null; }
  const perf = makeDance(dismount.name), d = stepDance(perf, dismountTime(span, (tick - dismount.t0) / TICK_HZ, down));
  return { perf, d: { ...d, air: false, rise: 0, travel: 0, shift: 0 } };
}

/** Turns the body with the sweep or the dismount and draws its glitter; straightens it again after. Fills 🦶 while
 *  it's held. */
function danceBody(sweep, dt) {
  if (sweep || danced) built.root.position.copy(HOME);
  if (sweep) placeDancer(built, sweep.d);
  else if (danced) built.root.quaternion.identity();
  danced = Boolean(sweep);
  glitter = stepGlitter(glitter, built, sweep?.perf ?? null, sweep?.d ?? null, dt);
  el('kick').classList.toggle('aiming', kickSince > 0);
  el('kick').style.setProperty('--fill', String(sweepCharge()));
}

// the bridge under the hero rocks harder the longer they're on it (to full in about a second), and they slide with it
let rock = 0;
const rockNow = (tick) => Math.sin((tick / TICK_HZ) * BRIDGE.rate) * rock;
function rockBridge(f) {
  const b = level.bridges.find((o) => onBridge(f, o));
  rock += ((b ? 1 : 0) - rock) * 0.03;
  if (b) bridgeSlide(f, b, rockNow(state.tick));
}

/** How far above or below the sim's flat floor the hero is drawn: down a flight's slope (eased), with a bridge's roll. */
function standing(f, dt, tick) {
  const under = level.bridges.find((b) => onBridge(f, b)), stairs = onStairs(flights, f);
  dip += ((stairs ? stairDip(stairs, f) : 0) - dip) * Math.min(1, dt * 14);
  return dip + (under ? bridgeLift(f, under, rockNow(tick)) : 0);
}

/** The hero where the sim has it, turned toward where it faces, walking, in the air, punching, kicking, spinning. */
function drawHero(f, dt, tick) {
  yaw += (((Math.PI / 2 - f.facing - yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 14);
  g.position.set(f.x, f.y + standing(f, dt, tick), f.z);
  g.rotation.set(0, yaw + (f.turn === 'spin' ? stompTurn(f) : 0), 0);
  swung();
  if (f.turn === 'flip' && stompTurn(f)) holdMiddle(g, f.height / 2, (o) => o.rotateX(-stompTurn(f)));
  const speed = f.onGround ? Math.hypot(f.vx, f.vz) : 0, sweep = sweepFrame(f) ?? dismountFrame(f, tick);
  /** @type {any} */ (built).spring = sweep && DANCES[sweep.perf.name];
  stepFighter(built, dt, sweep?.d.pose ?? (f.onGround || using ? POSES.rest : MOVE_POSES.air), speed, strikeNow(f, tick));
  danceBody(sweep, dt);
  placeShadow(solid, shadow, f, 0.42);
  shadow.position.y += dip;
}

// REUSE-SPEC.md §The pieces, the bars and the swings: what the player just did that they answer to: a tap on the
// stage (and where), a jump
let tapped = false, want = null;

const cmd = { tap: null, jump: false, punch: false, kick: false };
stage.renderer.domElement.addEventListener('pointerdown', () => { tapped = true; });
const onSwing = (f, k) => swingStep(f, k, cmd, level.swings);

/** On a bar or a swing the hero turns with it, feet out and head toward the bar; the swing's seat goes with it. */
const _across = new THREE.Vector3();
function swung() {
  const k = using?.step === onSwing ? using.k : null;
  if (k) g.rotateOnWorldAxis(_across.set(-Math.sin((k.p.h * Math.PI) / 180), 0, Math.cos((k.p.h * Math.PI) / 180)), k.a);
  swingSeats(k?.p ?? null, k?.a ?? 0);
}

// REUSE-SPEC.md §Dismounts: "Cowl-a-bunga!" in large letters as a hero comes off a bar or a swing, the dismount's
// name under it (playtest 2026-11-12: every one looked the same, so which buttons did what couldn't be told)
const MOVE_NAMES = { 'biles-beam': 'the beam dismount', biles: 'the Biles', 'biles-ii': 'the triple-double', 'biles-wolf': 'the wolf turn', 'biles-ii-vault': 'the double pike' };
function shout(move) {
  const words = el('shout');
  el('move').textContent = MOVE_NAMES[move];
  words.classList.remove('go');
  words.getBoundingClientRect();
  words.classList.add('go');
}

/** A dismount's buttons count from the tap that says where to go, round the bar and into the first moment of the flight
 *  (playtest 2026-11-12), never before; through the flight they pick the move and don't punch or kick. @param {any} input */
const PICK_SECONDS = 0.4;
function pickDismount(input) {
  if (!dismount || dismount.landed !== null) return;
  if ((input.punch || input.kick) && (state.tick - dismount.t0) / TICK_HZ <= PICK_SECONDS) {
    dismount.keys += (input.punch ? 'p' : '') + (input.kick ? 'k' : '');
    const name = dismountOf(dismount.keys);
    if (name !== dismount.name) shout(dismount.name = name);
  }
  Object.assign(input, { punch: false, kick: false });
}

// REUSE-SPEC.md §Jumping forward (playtest 2026-11-12: a jump only went straight up): a tap again at once is a jump to
// there, on the ground or in the air; a jump while walking carries on that way; in the air an arrow or a tap steers
const DOUBLE_TAP = 0.35 * TICK_HZ;
let lastTap = -DOUBLE_TAP, leap = null;
function doubleTap(input) {
  const t = tapped && !using ? input.target : null, twice = t?.x !== undefined && state.tick - lastTap <= DOUBLE_TAP;
  leap = twice ? { x: t.x, z: t.z } : null;
  if (twice) input.target = { jump: true };
  if (t?.x !== undefined) lastTap = state.tick;
}
function steer(f, t) {
  if (f.onGround || using || dismount?.landed === null) return;
  const to = t?.jump ? leap ?? f.target : t;
  if (to?.x !== undefined) f.airTo = { x: to.x, z: to.z };
}

/** What the hero gets on this tick, if anything: a climb it walked into, a slide or the pole, a bar or a swing. */
function getOn(f) {
  const climb = startClimb(climbs, f), ride = climb ? null : startRide(level.rides, f);
  if (climb || ride) return climb ? { step: climbStep, k: climb } : { step: rideStep, k: ride };
  // a tapped bar or swing is wanted till the hero gets there, or the player taps somewhere else or jumps
  if (cmd.tap || cmd.jump) want = cmd.tap ? tappedPivot(level.swings, cmd.tap) : null;
  const hang = startSwing(level.swings, f, want);
  return hang && { step: onSwing, k: hang };
}

/** Off the equipment. Off a bar or a swing, unless it's to catch the next one: the dismount its buttons picked, and the shout. */
function getOff() {
  if (using.step === onSwing && !(using.k.to && 'arm' in using.k.to)) {
    dismount = { keys: using.k.keys, name: dismountOf(using.k.keys), t0: state.tick, landed: null };
    if (dismount.name) shout(dismount.name);
  }
  using = null;
}

// REUSE-SPEC.md §Pizza: a slice is eaten by getting to it; 🍕 counts them
const SLICE_REACH = 0.65, eaten = new Set();
function eat(f) {
  level.slices.forEach((s, i) => {
    if (eaten.has(i) || Math.hypot(f.x - s.x, f.y + (f.height ?? 0.86) / 2 - s.y, f.z - s.z) > SLICE_REACH) return;
    eaten.add(i);
    el('slices').textContent = `🍕 ${eaten.size}`;
  });
}

/** After each tick: onto and along the equipment, the bridge rocking, and never off the front or back of the band.
 *  @param {any} input this tick's, from the controls */
function afterTick(input) {
  const f = state.fighters[0];
  Object.assign(cmd, { tap: tapped && input.target?.x !== undefined ? input.target : null, jump: Boolean(input.target?.jump), punch: input.punch, kick: input.kick });
  tapped = false;
  using ??= getOn(f) || null;
  if (using && !using.step(f, using.k)) getOff();
  steer(f, input.target);
  rockBridge(f);
  eat(f);
  const now = onStairs(flights, f);
  if (flight && !now) stairsOff(flight, f);
  flight = now;
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
  return new Set([...(using?.step === climbStep ? [using.k.c] : []), ...level.bridges.filter((b) => onBridge(f, b))]);
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
    const input = controls.take(snap);
    pickDismount(input);
    doubleTap(input);
    SIM.tick(state, { [ME]: input });
    afterTick(input);
    snap = SIM.snapshot(state);
  }
  const f = snap.fighters.find((o) => o.id === ME);
  drawHero(f, dt, snap.tick);
  sway(swaying(f), snap.tick / TICK_HZ);
  pizzaTime(snap.tick / TICK_HZ, eaten);
  follow(f, dt);
});
el('leave').addEventListener('click', () => { location.href = 'lobby.html'; });
