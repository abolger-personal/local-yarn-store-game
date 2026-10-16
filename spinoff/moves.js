import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { SPECIES, buildFighter, newFighter, stepFighter } from './fighter.js';
import { COMBO, countStrike, landHit, newCombo } from './punches.js';
import { KICK_COMBO, strikeOf } from './kicks.js';
import { HITSTOP_TICKS, TICK_HZ } from './match.js';
import { MOVES } from './sim.js';
import { makeStage } from './stage.js';

// A look at the punches (punches.js) and kicks (kicks.js) on every species, from play.js's camera pitch, each landing and looping.
setGeometryDetail('med');
const ROWS = [
  ['punch', 'jab', '👊 jab'], ['punch', 'cross', '👊 cross'], ['punch', 'uppercut', '👊 upper'], ['punch', 'string', '🥊 string'],
  ['kick', 'kick', '🦶 kick'], ['kick', 'thrust', '🦵 thrust'], ['kick', 'string', '🦶 string'],
];
const STRINGS = { punch: COMBO, kick: KICK_COMBO };
const SLOW = Number(new URLSearchParams(location.search).get('slow')) || 1;
const PITCH = THREE.MathUtils.degToRad(35), VIEW = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
const stage = makeStage(document.getElementById('stage'));
const period = (move) => MOVES[move].steps + HITSTOP_TICKS + 12;

function label(text, z) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 128 }), g = canvas.getContext('2d');
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillStyle = '#5a3a28';
  g.fillText(text, 500, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(-2.8, 0.4, z);
  stage.scene.add(sprite);
  return sprite;
}

const labels = [];
const cast = ROWS.flatMap(([move, name, text], r) => {
  const z = (r + 1 - ROWS.length) * 1.8, facing = name === 'string' ? Math.PI : 0;
  labels.push(label(text, z));
  return SPECIES.map((species, c) => {
    const built = buildFighter(newFighter(species)), g = new THREE.Group().add(built.root);
    g.position.set((c - 1) * 1.4, 0, z);
    g.rotation.y = Math.PI / 2 - facing;
    stage.scene.add(g);
    return { move, name, built, facing, combo: newCombo(move, STRINGS[move].length) };
  });
});
const fit = () => stage.frame([...labels, ...cast.map((m) => m.built.root)], { view: VIEW, margin: 1.05 });
fit();
addEventListener('resize', fit);

/** The looping move's sim step at tick k, held through the hitstop of a landed hit as sim.js does. */
function stepAt(move, k) {
  const { active } = MOVES[move], u = (k % period(move)) + 1;
  if (u <= active[0]) return u;
  return u <= active[0] + HITSTOP_TICKS ? active[0] : u - HITSTOP_TICKS;
}

function draw(m, tick, dt) {
  const { steps } = MOVES[m.move], s = stepAt(m.move, tick), string = m.name === 'string';
  const f = { move: s < steps ? m.move : 'idle', step: s / steps };
  const n = countStrike(m.combo, f, tick), strike = strikeOf(m.move, string ? n : 0, m.facing, f.step);
  stepFighter(m.built, dt, POSES.rest, 0, f.move === m.move ? { ...strike, name: string ? strike.name : m.name } : null);
}

let clock = 0, tick = 0;
stage.run((dt) => {
  for (clock += (dt * TICK_HZ) / SLOW; tick < Math.floor(clock); tick++) {
    for (const m of cast) if (tick % period(m.move) === MOVES[m.move].active[0] - 1) landHit(m.combo);
  }
  for (const m of cast) draw(m, tick, dt / SLOW);
});
