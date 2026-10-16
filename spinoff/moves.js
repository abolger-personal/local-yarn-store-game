import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { SPECIES, buildFighter, newFighter, stepFighter } from './fighter.js';
import { COMBO, countPunch, landPunch, newCombo, punchArm } from './punches.js';
import { HITSTOP_TICKS, TICK_HZ } from './match.js';
import { MOVES } from './sim.js';
import { makeStage } from './stage.js';

// A look at the punches (punches.js) on every species, from play.js's camera pitch, each punch landing and looping.
setGeometryDetail('med');
const ROWS = ['jab', 'cross', 'hook', 'uppercut', 'string'];
const SLOW = Number(new URLSearchParams(location.search).get('slow')) || 1;
const PERIOD = MOVES.punch.steps + HITSTOP_TICKS + 12;
const PITCH = THREE.MathUtils.degToRad(35), VIEW = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
const stage = makeStage(document.getElementById('stage'));

const cast = ROWS.flatMap((row, r) => SPECIES.map((species, c) => {
  const built = buildFighter(newFighter(species)), g = new THREE.Group().add(built.root);
  const facing = row === 'string' ? Math.PI : 0;
  g.position.set((c - 1) * 1.4, 0, (r + 1 - ROWS.length) * 1.8);
  g.rotation.y = Math.PI / 2 - facing;
  stage.scene.add(g);
  return { row, built, facing, combo: newCombo() };
}));
const fit = () => stage.frame(cast.map((m) => m.built.root), { view: VIEW, margin: 1.1 });
fit();
addEventListener('resize', fit);

/** The looping punch's sim step at tick k, held through the hitstop of a landed hit as sim.js does. */
function stepAt(k) {
  const { active } = MOVES.punch, u = (k % PERIOD) + 1;
  if (u <= active[0]) return u;
  return u <= active[0] + HITSTOP_TICKS ? active[0] : u - HITSTOP_TICKS;
}

function draw(m, s, tick, dt) {
  const f = { move: s < MOVES.punch.steps ? 'punch' : 'idle', step: s / MOVES.punch.steps };
  const n = countPunch(m.combo, f, tick), string = m.row === 'string';
  const punch = { name: string ? COMBO[n] : m.row, arm: punchArm(m.facing, string ? n : 0), step: f.step };
  stepFighter(m.built, dt, POSES.rest, 0, f.move === 'punch' ? punch : null);
}

let clock = 0, tick = 0;
stage.run((dt) => {
  for (clock += (dt * TICK_HZ) / SLOW; tick < Math.floor(clock); tick++) {
    if (tick % PERIOD === MOVES.punch.active[0] - 1) for (const m of cast) landPunch(m.combo);
  }
  for (const m of cast) draw(m, stepAt(tick), tick, dt / SLOW);
});
