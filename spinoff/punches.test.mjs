import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, newFighter, stepFighter } from './fighter.js';
import { COMBO, COMBO_TICKS, PUNCHES, countStrike, landHit, newCombo, punchArm, strikerOf } from './punches.js';
import { KICKS, KICK_COMBO } from './kicks.js';
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

/** Every tick's (move, step) for a fighter doing `move` at the given ticks, landing each (hitstop at the first active step). */
function timeline(move, starts) {
  const { steps, active } = MOVES[move], out = [];
  let a = null;
  for (let tick = 0; tick < Math.max(...starts) + 100; tick++) {
    if (!a && starts.includes(tick)) a = { t: 0, freeze: 0 };
    if (a && a.freeze > 0) a.freeze--;
    else if (a && ++a.t >= steps) a = null;
    else if (a?.t === active[0]) a.freeze = HITSTOP_TICKS;
    out.push({ tick, move: a ? move : 'idle', step: a ? a.t / steps : 0 });
  }
  return out;
}

/**
 * The move of string `S` drawn for each `move` of `starts` (landing where `landed` is truthy, on its first active
 * step), on a tablet drawing every `every` ticks, `lag` ticks behind the hit events, as a guest does.
 */
function shown([move, S], starts, landed, { every = 1, lag = 0 } = {}) {
  const frames = timeline(move, starts), hitAt = starts.filter((_, k) => landed[k]).map((s) => s + MOVES[move].active[0] - 1);
  const c = newCombo(move, S.length), out = [];
  let pending = 0;
  for (const { tick } of frames) {
    if (hitAt.includes(tick)) pending++;
    if (tick % every || tick < lag) continue;
    for (; pending; pending--) landHit(c);
    const at = c.at, n = countStrike(c, frames[tick - lag], tick);
    if (c.at !== at) out.push(S[n]);
  }
  return out;
}

const STRINGS = [['punch', COMBO], ['kick', KICK_COMBO]];
const back = (n, gap) => Array.from({ length: n }, (_, k) => k * gap);
const ALL = Array(8).fill(1);
for (const string of STRINGS) {
  const [move, S] = string, BUSY = MOVES[move].steps + HITSTOP_TICKS, cycle = Array.from({ length: 7 }, (_, i) => S[i % S.length]);
  for (const every of [1, 2]) {
    for (const lag of every === 1 ? [0] : [0, 1, 2, 3, 4]) {
      const on = { every, lag }, why = `(${move}, every ${every}, lag ${lag})`;
      assert.deepEqual(shown(string, back(7, BUSY), ALL, on), cycle, `landing every one cycles the string and loops ${why}`);
      assert.deepEqual(shown(string, back(7, COMBO_TICKS), ALL, on), cycle, `the longest gap keeps the string ${why}`);
      assert.deepEqual(shown(string, back(5, BUSY), [1, 0, 0, 1, 1], on), [S[0], S[1], S[1], S[1], S[2 % S.length]], `a miss waits ${why}`);
      assert.deepEqual(shown(string, back(3, BUSY), [0, 0, 0], on), [S[0], S[0], S[0]], `hitting the air is all firsts ${why}`);
      const pause = [0, BUSY, BUSY + COMBO_TICKS + 1, 2 * BUSY + COMBO_TICKS + 1];
      assert.deepEqual(shown(string, pause, ALL, on), [S[0], S[1], S[0], S[1]], `a pause starts again at the first ${why}`);
    }
  }
}

const fighter = (id, team, x, move = 'punch') => ({ id, team, x, z: 0, move });
const ring = [fighter('hero', 'heroes', 0), fighter('bad', 'badGuys', 0.6, 'hurt'), fighter('bad2', 'badGuys', 0.5), fighter('dummy', 'badGuys', 2, 'idle')];
const hitOn = (on, target, x, move = 'punch') => ({ x, y: 0.5, z: 0, move, on, target, broke: false });
assert.equal(strikerOf(hitOn('fighter', 'bad', 0.45), ring)?.id, 'hero', 'a teammate of the one hit never gets the hit, however near');
assert.equal(strikerOf(hitOn('brick', 'b3', 0.45), ring)?.id, 'bad2', 'a brick hit counts for the nearest puncher, like a fighter hit');
assert.equal(strikerOf(hitOn('fighter', 'dummy', 1.8), ring)?.id, 'hero', 'the dummy counts like any foe');
const kickers = [...ring, fighter('kid', 'heroes', 1.2, 'kick'), fighter('bad3', 'badGuys', 0.9, 'kick')];
assert.equal(strikerOf(hitOn('fighter', 'bad', 0.45, 'kick'), kickers)?.id, 'kid', 'a kick goes to the nearest kicker, never a teammate of the one hit');
assert.equal(strikerOf(hitOn('brick', 'b3', 0.45, 'kick'), kickers)?.id, 'bad3', 'a kick on a brick counts for the nearest kicker');
assert.ok(Object.keys(PUNCHES).every((p) => COMBO.includes(p)), 'every punch is in the combo');
assert.ok(Object.keys(KICKS).every((p) => KICK_COMBO.includes(p)), 'every kick is in the kick string');
{
  const c = newCombo('kick', KICK_COMBO.length), { steps, active } = MOVES.kick;
  countStrike(c, { move: 'kick', step: active[1] / steps }, 0);
  landHit(c);
  assert.equal(c.hits, 1, 'a kick landing on its last active step counts for the kick drawn');
}
for (const [move, S] of STRINGS) {
  // Mashing on the dummy: each hit knocks it back, and the chase must not reset the string.
  const body = { height: 0.9, width: 0.45, reach: 0.38 };
  const kid = { id: 'kid', team: 'heroes', ...body, look: { dough: '#e8c48a', frosting: '#14c4e0', stripe: false } };
  const dummy = { id: 'dummy', team: 'badGuys', ...body, look: { dough: '#2a1a14', frosting: '#7a2bbf', stripe: true }, dummy: true };
  const m = createMatch([kid, dummy], TUTORIAL.stage), c = newCombo(move, S.length), seen = [], string = [];
  let was = '', landed = 0;
  for (let t = 0; t < 60 * 20; t++) {
    const before = snapshot(m).fighters, me = before[0], d = before[1];
    const near = Math.hypot(me.x - d.x, me.z - d.z) < 0.7;
    tick(m, { kid: { target: near ? null : { thing: 'fighter', id: 'dummy' }, punch: near && move === 'punch', kick: near && move === 'kick' } });
    const s = snapshot(m), f = s.fighters.find((x) => x.id === 'kid');
    if (f.move === move && was !== move) string.push(S[landed % S.length]);
    for (const h of s.hits) if (h.move === move && strikerOf(h, s.fighters)?.id === 'kid') {
      landHit(c);
      landed++;
    }
    const n = countStrike(c, f, s.tick);
    if (f.move === move && was !== move) seen.push(S[n]);
    was = f.move;
  }
  assert.ok(landed > S.length, `mashing on the dummy lands more than one ${move} string (${landed})`);
  assert.deepEqual(seen, string, `chasing the dummy after each knock-back never starts the ${move} string again`);
}

console.log('punches: ok');
