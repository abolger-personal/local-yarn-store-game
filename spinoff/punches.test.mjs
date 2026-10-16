import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, newFighter, stepFighter } from './fighter.js';
import { COMBO, COMBO_TICKS, PUNCHES, countPunch, landPunch, newCombo, punchArm, puncherOf } from './punches.js';
import { HITSTOP_TICKS } from './match.js';
import { MOVES, createMatch, snapshot, tick } from './sim.js';
import { TUTORIAL } from './levels.js';

LOOK.viewPx = 0;
setGeometryDetail('low');

const at = (o) => o.getWorldPosition(new THREE.Vector3());
const STRIKE = 0.3;

/** Gloves, hip height, a knee and the shoulders in the fighter's own frame (facing +z), `punch` posed over rest. */
function measure(built, punch) {
  for (let i = 0; i < 3; i++) stepFighter(built, 1e-4, POSES.rest, 0, punch);
  built.root.updateMatrixWorld(true);
  const arms = built.joints.upperArm.map(({ node }) => at(node));
  return { gloves: built.gloves.map(at), hips: built.root.position.y, knee: built.joints.lowerLeg[0].node.rotation.x, arms };
}

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species)), P = built.params, arm = P.upperArmLen + P.forearmLen;
  const rest = measure(built, null);
  for (const hitting of [-1, 1]) {
    const i = hitting < 0 ? 0 : 1, travel = (name, step = STRIKE) => {
      const m = measure(built, { name, arm: hitting, step });
      return { m, fwd: m.gloves[i].z - rest.gloves[i].z };
    };
    for (const name of ['jab', 'cross']) {
      const { fwd } = travel(name);
      assert.ok(fwd > 0.9 * arm, `${species} ${name} (arm ${hitting}): glove goes ${fwd.toFixed(3)} forward, want > ${(0.9 * arm).toFixed(3)}`);
    }
    const up = travel('uppercut').m;
    const top = rest.arms[i].y + arm;
    assert.ok(up.gloves[i].y > top, `${species} uppercut (arm ${hitting}): glove ${up.gloves[i].y.toFixed(3)} must end an arm above the shoulder, ${top.toFixed(3)}`);
    const low = travel('uppercut', 0.14).m;
    assert.ok(low.hips < rest.hips - 0.02 && low.knee > rest.knee + 0.5, `${species} uppercut: dips at the knees first`);
    const [hit, other] = [built.gloves[i], built.gloves[1 - i]];
    stepFighter(built, 1e-4, POSES.rest, 0, { name: 'jab', arm: hitting, step: 0.2 });
    assert.ok(hit.scale.y > 1.3 * hit.scale.x && other.scale.y === other.scale.x, `${species}: only the hitting glove stretches`);
  }
  for (const facing of [0, Math.PI]) {
    const g = new THREE.Group().add(built.root);
    g.rotation.y = Math.PI / 2 - facing;
    const { arms } = measure(built, null), near = arms[punchArm(facing) < 0 ? 0 : 1].z, far = arms[punchArm(facing, 1) < 0 ? 0 : 1].z;
    assert.ok(near > far, `${species} facing ${facing}: the first punch uses the arm nearer the camera (+z)`);
    g.remove(built.root);
  }
  measure(built, null);
  assert.ok(built.gloves.every((gl) => gl.scale.x === gl.userData.r), `${species}: gloves back to size after a punch`);
  disposeFighter(built);
}

/** Every tick's (move, step) for a fighter that punches at the given ticks, landing each (hitstop at the first active step). */
function timeline(starts) {
  const { steps, active } = MOVES.punch, out = [];
  let a = null;
  for (let tick = 0; tick < Math.max(...starts) + 100; tick++) {
    if (!a && starts.includes(tick)) a = { t: 0, freeze: 0 };
    if (a && a.freeze > 0) a.freeze--;
    else if (a && ++a.t >= steps) a = null;
    else if (a?.t === active[0]) a.freeze = HITSTOP_TICKS;
    out.push({ tick, move: a ? 'punch' : 'idle', step: a ? a.t / steps : 0 });
  }
  return out;
}

/**
 * The move drawn for each punch of `starts` (landing where `landed` is truthy, on its first active step), on a tablet
 * drawing every `every` ticks, `lag` ticks behind the hit events, as a guest does.
 */
function shown(starts, landed, { every = 1, lag = 0 } = {}) {
  const frames = timeline(starts), hitAt = starts.filter((_, k) => landed[k]).map((s) => s + MOVES.punch.active[0] - 1);
  const c = newCombo(), out = [];
  let pending = 0;
  for (const { tick } of frames) {
    if (hitAt.includes(tick)) pending++;
    if (tick % every || tick < lag) continue;
    for (; pending; pending--) landPunch(c);
    const at = c.at, n = countPunch(c, frames[tick - lag], tick);
    if (c.at !== at) out.push(COMBO[n]);
  }
  return out;
}

const back = (n, gap) => Array.from({ length: n }, (_, k) => k * gap);
const BUSY = MOVES.punch.steps + HITSTOP_TICKS, ALL = Array(8).fill(1);
const cycle = Array.from({ length: 7 }, (_, i) => COMBO[i % COMBO.length]);
for (const every of [1, 2]) {
  for (const lag of every === 1 ? [0] : [0, 1, 2, 3, 4]) {
    const on = { every, lag }, why = `(every ${every}, lag ${lag})`;
    assert.deepEqual(shown(back(7, BUSY), ALL, on), cycle, `landing every punch cycles the string and loops ${why}`);
    assert.deepEqual(shown(back(7, COMBO_TICKS), ALL, on), cycle, `the longest gap keeps the string ${why}`);
    assert.deepEqual(shown(back(5, BUSY), [1, 0, 0, 1, 1], on), ['jab', 'cross', 'cross', 'cross', 'uppercut'], `a miss waits ${why}`);
    assert.deepEqual(shown(back(3, BUSY), [0, 0, 0], on), ['jab', 'jab', 'jab'], `punching the air is all jabs ${why}`);
    const pause = [0, BUSY, BUSY + COMBO_TICKS + 1, 2 * BUSY + COMBO_TICKS + 1];
    assert.deepEqual(shown(pause, ALL, on), ['jab', 'cross', 'jab', 'cross'], `a pause starts again at jab ${why}`);
  }
}

const fighter = (id, team, x, move = 'punch') => ({ id, team, x, z: 0, move });
const ring = [fighter('hero', 'heroes', 0), fighter('bad', 'badGuys', 0.6, 'hurt'), fighter('bad2', 'badGuys', 0.5), fighter('dummy', 'badGuys', 2, 'idle')];
const hitOn = (on, target, x) => ({ x, y: 0.5, z: 0, move: 'punch', on, target, broke: false });
assert.equal(puncherOf(hitOn('fighter', 'bad', 0.45), ring)?.id, 'hero', 'a teammate of the one hit never gets the hit, however near');
assert.equal(puncherOf(hitOn('brick', 'b3', 0.45), ring)?.id, 'bad2', 'a brick hit counts for the nearest puncher, like a fighter hit');
assert.equal(puncherOf(hitOn('fighter', 'dummy', 1.8), ring)?.id, 'hero', 'the dummy counts like any foe');
assert.equal(puncherOf({ ...hitOn('fighter', 'bad', 0.45), move: 'kick' }, ring), null, 'kicks are not punches');
assert.ok(Object.keys(PUNCHES).every((p) => COMBO.includes(p)), 'every punch is in the combo');
{
  // Mashing on the dummy: each hit knocks it back, and the chase must not reset the string.
  const body = { height: 0.9, width: 0.45, reach: 0.38 };
  const kid = { id: 'kid', team: 'heroes', ...body, look: { dough: '#e8c48a', frosting: '#14c4e0', stripe: false } };
  const dummy = { id: 'dummy', team: 'badGuys', ...body, look: { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true }, dummy: true };
  const m = createMatch([kid, dummy], TUTORIAL.stage), c = newCombo(), seen = [];
  let was = '';
  for (let t = 0; t < 60 * 20; t++) {
    const before = snapshot(m).fighters, me = before[0], d = before[1];
    const near = Math.hypot(me.x - d.x, me.z - d.z) < 0.7;
    tick(m, { kid: { target: near ? null : { thing: 'fighter', id: 'dummy' }, punch: near, kick: false } });
    const s = snapshot(m);
    for (const h of s.hits) if (puncherOf(h, s.fighters)?.id === 'kid') landPunch(c);
    const f = s.fighters.find((x) => x.id === 'kid'), n = countPunch(c, f, s.tick);
    if (f.move === 'punch' && was !== 'punch') seen.push(COMBO[n]);
    was = f.move;
  }
  const string = seen.map((_, i) => COMBO[i % COMBO.length]);
  assert.ok(seen.length > COMBO.length, `mashing on the dummy throws more than one string (${seen.length} punches)`);
  assert.deepEqual(seen, string, 'chasing the dummy after each knock-back never starts the string again');
}

console.log('punches: ok');
