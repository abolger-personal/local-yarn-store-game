import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { buildFighter, disposeFighter, EFFECTS, ROLL, SHOW_OFF, TRICKS, addTricks, fromRecipe, rollEffect, rollRecipe, upgradeRecipe, newFighter, readFighter, showOffTrick, stepFighter } from './fighter.js';

LOOK.viewPx = 0;

// Every trick a hand offers has a look and a motion in EFFECTS: a new effect is one entry there.
for (const [hands, list] of Object.entries(TRICKS)) for (const t of list) assert.ok(t === 'plain' || EFFECTS[t]?.parts, `${hands}: ${t} has an EFFECTS entry`);

// Tapping the picked hands goes through its tricks; a trick the other hands don't have falls back to their first.
{
  const trick = (hands, t) => readFighter({ species: 'owl', params: {}, look: { hands, trick: t } })?.look.trick;
  assert.equal(trick('sword', 'flame'), 'flame');
  assert.equal(trick('sword', 'plain'), 'sparkle', 'a sword always has a trick');
  assert.equal(trick('gloves', 'rocket'), 'plain', 'an unknown trick is plain gloves');
  assert.equal(trick(undefined, undefined), 'plain', 'an old save is plain gloves');
  const f = newFighter('llama'), built = buildFighter({ ...f, look: { ...f.look, trick: 'bubble' } });
  const shown = (arm, step, dt = 1e-4) => {
    stepFighter(built, dt, POSES.rest, 0, step === null ? null : { name: 'cross', arm, step });
    return built.tricks.map((g) => g.visible);
  };
  assert.deepEqual(shown(1, 0.1), [false, false], 'nothing before the swoosh');
  assert.deepEqual(shown(1, 0.25), [false, true], 'only the hitting glove blows bubbles');
  shown(1, null, SHOW_OFF / 2);
  assert.deepEqual(built.tricks.map((g) => g.visible), [false, true], 'they stay out after the punch, as on the chooser');
  assert.ok(built.tricks[1].scale.x > 1, `as big as the chooser's (${built.tricks[1].scale.x.toFixed(2)}): a third of that was invisible in a fight`);
  assert.deepEqual(shown(1, null, SHOW_OFF), [false, false], 'and float away after SHOW_OFF');
  assert.deepEqual(shown(-1, 0.25), [true, false], 'the next punch blows them from its own glove');
  disposeFighter(built);
}

// The chooser's preview hits nothing, so after its jab lands the trick floats up off the hand to be seen.
for (const [hands, trick] of [['sword', 'sparkle'], ['sword', 'flame'], ['gloves', 'bubble'], ['gloves', 'sparkle']]) {
  const f = newFighter('lion'), built = buildFighter({ ...f, look: { ...f.look, hands, trick } });
  const g = built.tricks.at(-1).userData.side === -1 ? built.tricks.at(-1) : built.tricks[0];
  const meshes = () => { let n = 0; g.traverse((o) => { if (o instanceof THREE.Mesh && o.visible) n++; }); return n; };
  const where = () => built.root.worldToLocal(g.userData.spin.getWorldPosition(new THREE.Vector3()));
  showOffTrick(built, -1, 0.1);
  const early = { at: where(), size: g.scale.x };
  showOffTrick(built, -1, SHOW_OFF * 0.6);
  assert.ok(g.visible && meshes() > 0 && built.tricks.every((t) => t === g || !t.visible), `${hands} ${trick}: shows on the jabbing side, and only there`);
  assert.ok(early.size >= 1.3 && where().distanceTo(early.at) > 0.1, `${hands} ${trick}: big, and flying off`);
  showOffTrick(built, -1, SHOW_OFF);
  assert.ok(!g.visible, `${hands} ${trick}: gone after the show-off`);
  disposeFighter(built);
}
// A glove's trick leaves the fist along the punch's force, the way the fist was going as it landed, and keeps going
// while the fist comes back (playtest: riding the glove home, it looked like the bubbles were sucked back in).
{
  const f = newFighter('lion'), built = buildFighter({ ...f, look: { ...f.look, trick: 'bubble' } });
  const g = built.tricks.find((t) => t.userData.side === 1), where = () => built.root.worldToLocal(g.userData.spin.getWorldPosition(new THREE.Vector3()));
  for (const [name, axis] of [['jab', 'z'], ['cross', 'z'], ['uppercut', 'y']]) {
    for (let i = 0; i <= 16; i++) stepFighter(built, 1 / 60, POSES.rest, 0, { name, arm: 1, step: i / 16 });
    const { dir } = g.userData, mid = where();
    assert.ok(dir[axis] > 0.6, `${name}: the trick flies ${axis === 'y' ? 'up' : 'forward'} (${dir.toArray().map((v) => v.toFixed(2))})`);
    for (let i = 0; i < 20; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
    assert.ok(g.visible && where()[axis] > mid[axis], `${name}: and keeps going after the punch, while the fist comes back`);
  }
  // it ends by fading out, not by shrinking (playtest: shrinking pulled the spread back in, which looked odd)
  const bit = g.userData.spin.children[0], { fx } = g.userData.spin.userData;
  for (let i = 0; i < 90 && g.visible && bit.material.opacity === bit.material.userData.opacity; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
  assert.ok(g.visible && bit.material.opacity < bit.material.userData.opacity && g.scale.x === fx.size, 'fading out at full size');
  // dev mode's randomizer: a seed rolls the same effect every time, inside ROLL's bounds, and it goes on like a named one
  const roll = rollEffect(42), { motion, count } = ROLL;
  assert.equal(roll.recipe, rollEffect(42).recipe, 'a seed rolls the same effect every time');
  assert.notEqual(roll.recipe, rollEffect(43).recipe, 'and another seed another');
  // a list of ranges is a choice of them
  const bounds = (range) => [Math.min(...range.flat()), Math.max(...range.flat())];
  for (const [k, range] of Object.entries(motion)) {
    const [lo, hi] = bounds(range);
    assert.ok(roll[k] >= lo && roll[k] <= hi, `rolled ${k} ${roll[k]} is within ${lo}-${hi}`);
  }
  addTricks(built, roll);
  const bits = built.tricks[0].userData.spin.children.length;
  assert.ok(built.tricks.length === 2 && bits >= bounds(count)[0] && bits <= bounds(count)[1] && built.tricks[0].userData.anchor, `a rolled effect goes on both gloves, ${bits} bits, flying off along the punch`);
  // a blast spreads round; `stream` strings its bits out along the punch, and spreading more along it makes a long jet
  const ball = fromRecipe(rollRecipe(7, { layout: 'ball', count: 10, reach: 0.2 }));
  const shape = (over) => {
    addTricks(built, { ...ball, life: 1, turn: 0, spreadAlong: 2, spreadAcross: 2, drift: 1, arc: 0, amplitude: 0, ease: 0, twist: 0, ...over });
    for (let i = 0; i <= 16; i++) stepFighter(built, 1 / 60, POSES.rest, 0, { name: 'jab', arm: 1, step: i / 16 });
    for (let i = 0; i < 25; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
    const g = built.tricks.find((t) => t.userData.side === 1), { dir } = g.userData, ext = (a) => Math.max(...a) - Math.min(...a);
    const ps = g.userData.spin.children.map((m) => built.root.worldToLocal(m.getWorldPosition(new THREE.Vector3())));
    return ext(ps.map((q) => q.dot(dir))) / ext(ps.map((q) => q.clone().addScaledVector(dir, -q.dot(dir)).length()));
  };
  const [blast, stream, jet] = [{ stream: 0 }, { stream: 1 }, { stream: 0, spreadAlong: 12 }].map(shape);
  assert.ok(blast < 1.3 && stream > blast + 0.3 && jet > 3, `long along the punch for its width: a blast ${blast.toFixed(1)}, a stream ${stream.toFixed(1)}, a jet ${jet.toFixed(1)}`);
  // `arc` bends a trick's path up off the punch's line, and a wave (`amplitude`, `frequency`) snakes a stream's bits from side to side of it
  const across = (over) => {
    shape(over);
    const g = built.tricks.find((t) => t.userData.side === 1), { dir } = g.userData, side = new THREE.Vector3(0, dir.z, -dir.y).normalize();
    return g.userData.spin.children.map((m) => built.root.worldToLocal(m.getWorldPosition(new THREE.Vector3())).dot(side));
  };
  const mean = (a) => a.reduce((x, y) => x + y) / a.length, wobble = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(mean(across({ arc: 1 })) > mean(across({})) + 0.15, 'arc bends the path up');
  const still = { stream: 1, spreadAlong: 1, spreadAcross: 1 };
  assert.ok(wobble(across({ ...still, amplitude: 0.3, frequency: 2 })) > wobble(across(still)) + 0.2, 'a wave snakes a stream');
  // `twist` corkscrews the bits round the path: across it, they move round, the same distance out
  const turned = (twist) => across({ spreadAcross: 1, spreadAlong: 1, twist });
  assert.ok(turned(0).some((v, i) => Math.abs(v - turned(0.25)[i]) > 0.01), 'twist turns the bits round the path');
  // `ease` shoots out and slows to a stop: further early, the same at the end
  const out = (ease) => {
    shape({ ease, spreadAlong: 1, spreadAcross: 1 });
    return built.tricks.find((t) => t.userData.side === 1).position.distanceTo(built.tricks.find((t) => t.userData.side === 1).userData.from);
  };
  assert.ok(out(1) > out(0) + 0.1, `eased, it's further out early (${out(1).toFixed(2)} to ${out(0).toFixed(2)})`);
  // each finish is its own surface, and a glow has its halo; a recipe from before finishes is flat
  const surface = (finish) => {
    addTricks(built, fromRecipe({ finish, bits: [{ shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.05, turn: 0, beat: 0 }] }));
    return built.tricks[0].userData.spin.children[0];
  };
  const kinds = ROLL.finishes.map((finish) => surface(finish).material.type);
  const paper = ['flat', 'glow', 'neon'], basic = (f) => kinds[ROLL.finishes.indexOf(f)] === 'MeshBasicMaterial';
  assert.ok(ROLL.finishes.every((f) => basic(f) === paper.includes(f)), `paper finishes are flat colour, the rest lit or shined (${kinds})`);
  assert.ok(surface('glow').children[0]?.isSprite && surface('neon').children[0]?.isSprite && !surface('flat').children.length, 'a glow and neon have a halo');
  const neon = surface('neon');
  // not added light: on the stages' near-white backgrounds that only ever made white spots
  assert.ok(neon.material.blending === THREE.NormalBlending && neon.children.filter((c) => c.isMesh && c.material.color.getHexString() === 'ffffff').length === 2, 'neon is its colour with a white-hot middle');
  assert.ok(surface('sticker').children[0]?.material.side === THREE.BackSide, 'a sticker is outlined');
  assert.notEqual(surface('chrome').material.matcap, surface('glitter').material.matcap, 'chrome and glitter shine differently');
  const thick = (finish) => {
    const { geometry } = surface(finish);
    geometry.computeBoundingBox();
    return geometry.boundingBox.getSize(new THREE.Vector3()).z;
  };
  assert.ok(ROLL.finishes.every((f) => (thick(f) === 0) === paper.includes(f)), 'paper finishes are flat, the rest puffy to catch the light');
  assert.equal(surface(undefined).material.type, kinds[0], 'a recipe without a finish is flat');
  assert.ok(ROLL.finishes.includes(JSON.parse(roll.recipe).finish) && JSON.parse(roll.recipe).family in ROLL.families, 'a roll names its finish and colour family');
  // the effects menu fixes one setting at a time: the rest of the roll, bits and all, stays as rolled
  // (on a ball: a ring or a line has to make room for more, and one bit on its own is a big one)
  const base = rollRecipe(42, { layout: 'ball', count: 6 }), spun = rollRecipe(42, { layout: 'ball', count: 6, turn: 15 }), more = rollRecipe(42, { layout: 'ball', count: 9 });
  assert.ok(spun.turn === 15 && JSON.stringify(spun.bits) === JSON.stringify(base.bits) && spun.finish === base.finish, 'a motion slider leaves the bits as they were');
  assert.deepEqual(more.bits.slice(0, base.bits.length), base.bits, 'more bits keeps the ones there were, and adds to them');
  assert.ok(rollRecipe(42, { finish: 'knit', shape: 'heart', accent: 'none' }).bits.every((b) => b.shape === 'heart'), 'and a fixed shape is every bit\'s');
  // the second shape is only an accent: some bits, smaller, and only ever a twinkle
  const accented = rollRecipe(9, { shape: 'heart', accent: 'twinkle', count: 24, layout: 'ball', bit: [0.1, 0.1] }).bits;
  const twinkles = accented.filter((b) => b.shape === 'twinkle');
  assert.ok(twinkles.length > 0 && twinkles.length < 12 && twinkles.every((b) => b.r < 0.1) && accented.every((b) => b.shape === 'heart' || b.shape === 'twinkle'), `an accent: ${twinkles.length} of 24, small`);
  assert.ok(ROLL.accents.every((a) => a === 'none' || a === 'twinkle'), 'accents are twinkles or nothing');
  // every shape builds in every finish (a text bit, with nothing here to draw it on, is a star)
  for (const finish of ROLL.finishes) {
    addTricks(built, fromRecipe({ finish, bits: ROLL.shapes.map((shape, i) => ({ shape, colour: '#ff3b7f', at: [0, 0, 0.01 * i], r: 0.05, turn: 0, beat: i })) }));
    const meshes = built.tricks[0].userData.spin.children;
    assert.ok(meshes.length === ROLL.shapes.length && meshes.every((m) => m.geometry.attributes.position.count > 0 && !m.geometry.attributes.position.array.some(Number.isNaN)), `${finish}: every shape`);
  }
  // `grow` shrinks a bit away (or swells it), `hue` turns its colour, and a streak points the way it flies
  const late = (over) => {
    addTricks(built, fromRecipe({ life: 1, drift: 1, bits: [{ shape: 'streak', colour: '#ff3b7f', at: [0, 0, 0], r: 0.05, turn: 0, beat: 0 }], ...over }));
    for (let i = 0; i <= 16; i++) stepFighter(built, 1 / 60, POSES.rest, 0, { name: 'jab', arm: 1, step: i / 16 });
    for (let i = 0; i < 30; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
    return built.tricks.find((t) => t.userData.side === 1).userData.spin.children[0];
  };
  assert.ok(late({ grow: -1 }).scale.x < late({}).scale.x * 0.6 && late({ grow: 2 }).scale.x > late({}).scale.x * 1.4, 'grow shrinks or swells a bit');
  assert.notEqual(late({ hue: 0.5 }).material.color.getHexString(), late({}).material.color.getHexString(), 'hue turns its colour');
  const streak = late({}), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(streak.getWorldQuaternion(new THREE.Quaternion()));
  const flying = built.tricks.find((t) => t.userData.side === 1).userData.dir.clone().transformDirection(built.root.matrixWorld);
  assert.ok(Math.abs(axis.dot(flying)) > 0.9, `a streak points along its flight (${axis.dot(flying).toFixed(2)})`);
  // a layout places the bits: all in the middle, or round a ring as wide as the roll's reach, facing the camera
  assert.ok(rollRecipe(5, { layout: 'middle' }).bits.every((b) => b.at.every((v) => v === 0)), 'middle: every bit in the middle');
  const ringed = rollRecipe(5, { layout: 'ring', count: 8 });
  assert.ok(ringed.bits.every((b) => b.at[0] === 0 && Math.abs(Math.hypot(...b.at) - ringed.reach) < 1e-9), 'ring: round a circle, side-on');
  // a recipe from before 2026-11-02 comes in with its size in its bits, and its spread and stretch as spreading along and across
  const old = upgradeRecipe({ size: 2, spread: 3, stretch: 0.5, bits: [{ shape: 'star', colour: '#fff', at: [0.1, 0, 0], r: 0.05, turn: 0, beat: 0 }] });
  assert.ok(old.spreadAcross === 3 && old.spreadAlong === 1.5 && old.bits[0].r === 0.1 && old.bits[0].at[0] === 0.2 && !('size' in old), 'an old recipe upgrades');
  disposeFighter(built);
}
{
  const f = newFighter('owl'), built = buildFighter(f);
  showOffTrick(built, -1, 0.1);
  assert.equal(built.tricks.length, 0, 'plain gloves show nothing');
  disposeFighter(built);
}

// A sword's trick with `stream` leaves its bits one by one along the swing, each staying where the tip left it (trail)
{
  // the standard lion, so every run swings the same
  const f = newFighter('lion'), built = buildFighter({ ...f, params: {}, look: { ...f.look, hands: 'sword', trick: 'sparkle' } });
  const star = (i) => ({ shape: 'star', colour: '#ffd21a', at: [0, 0, 0], r: 0.05, turn: 0, beat: i });
  addTricks(built, fromRecipe({ life: 1, turn: 0, drift: 0, spreadAcross: 1, stream: 1, bits: [0, 1, 2, 3, 4, 5].map(star) }));
  const g = built.tricks[0], where = (m) => built.root.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
  const tip = () => built.root.worldToLocal(built.sword.localToWorld(new THREE.Vector3(0, 0, built.sword.userData.tip)));
  let first = null, tipThen = null;
  for (let i = 0; i <= 30; i++) {
    stepFighter(built, 1 / 60, POSES.rest, 0, { name: 'cross', arm: 1, step: i / 30 });
    if (!first && g.userData.spin.children[0].userData.gone) [first, tipThen] = [where(g.userData.spin.children[0]), tip()];
  }
  const now = where(g.userData.spin.children[0]), ps = g.userData.spin.children.map(where);
  assert.ok(first && now.distanceTo(first) < 1e-4 && tip().distanceTo(tipThen) > 0.05, `the first bit stays where it was left while the tip swings on (${first && now.distanceTo(first)})`);
  assert.ok(Math.max(...ps.map((q) => q.distanceTo(ps[0]))) > 0.1, 'and the bits lie apart, along the swing');
  // a stab's bits don't climb: the way they go on is the tip's swing, not their own spreading on it, nor a held blade's drift
  // (playtest: a ring of twinkles flew up into the air after a stab)
  const ringOf = rollRecipe(3, { layout: 'ring', count: 12, reach: 0.03, shape: 'twinkle', accent: 'none' });
  addTricks(built, fromRecipe({ ...ringOf, life: 0.61, turn: 0, drift: 1.8, spreadAcross: 3, stream: 1, arc: 0, amplitude: 0, ease: 0, twist: 0, grow: 0 }));
  const meanY = () => built.tricks[0].userData.spin.children.map(where).reduce((sum, q) => sum + q.y, 0) / 12;
  let low = Infinity;
  for (let i = 0; i <= 42; i++) {
    stepFighter(built, 1 / 60, POSES.rest, 0, { name: 'jab', arm: 1, step: i / 42 });
    if (built.trickOn) low = Math.min(low, meanY());
  }
  assert.ok(meanY() - low < 0.2, `a stab's trail stays where it was swung (up ${(meanY() - low).toFixed(2)})`);
  // without stream, a recipe's bits stay on the tip and spread round it (playtest: kept to their gaps, they looked bunched up)
  const ring = (i) => ({ ...star(i), at: [0, Math.cos(i), Math.sin(i)].map((v) => v * 0.1) });
  addTricks(built, fromRecipe({ life: 1, turn: 0, spreadAcross: 3, bits: [0, 1, 2, 3].map(ring) }));
  const wide = () => {
    const qs = built.tricks[0].userData.spin.children.map(where);
    return Math.max(...qs.map((q) => q.distanceTo(qs[0])));
  };
  // from a swing of its own: the stab before left its trick's clock running
  for (let i = 0; i < 30; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
  for (let step = 0; !built.trickOn; step += 0.02) stepFighter(built, 1 / 60, POSES.rest, 0, { name: 'cross', arm: 1, step });
  const early = wide();
  for (let i = 0; i < 30; i++) stepFighter(built, 1 / 60, POSES.rest, 0, null);
  assert.ok(built.tricks[0].visible && wide() > early * 1.5, `spreading round the tip (${early.toFixed(3)} to ${wide().toFixed(3)})`);
  disposeFighter(built);
}

console.log('tricks ok');
