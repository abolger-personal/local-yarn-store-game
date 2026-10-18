import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, applyPose, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import {
  BAGS, CAPES, CLOTH, FUR, HATS, SPECIES, TEXTURES, buildFighter, disposeFighter, gloveAnchors, handsFor, newHands, isBadGuyCloth, isBadGuyFur, nearestSwatch,
  IDLE, SHOW_OFF, entrantOf, knotAt, newFighter, randomFighter, readFighter, seatDrop, setFur, showOffTrick, stepFighter, wobbleAt, wobbleHz,
} from './fighter.js';
import { wingShape } from '../characters/owl.js';
import { floorGrid } from './roster.js';
import { walkPhase } from '../characters/motion.js';
import { SYRUP_SLOW, WALK_SPEED } from './sim.js';
import { CHOP_DOWN, CHOP_UP, STRIKE } from './punches.js';
import { WIDEST_FIGHTER } from './match.js';

const SHOP_VIEW_PX = LOOK.viewPx;
LOOK.viewPx = 0;

// random bodies sampled per run; FULL=1 (npm run check:full) samples as many as before
const OWLS = process.env.FULL ? 60 : 8, BODIES = process.env.FULL ? 40 : 6;
const at = (o) => o.getWorldPosition(new THREE.Vector3());

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species));
  const anchors = gloveAnchors(built);
  assert.equal(built.gloves.length, 2, `${species}: a glove on each hand`);
  for (const pose of ['rest', 'reach', 'delighted']) {
    applyPose(built, { ...POSES.rest, ...POSES[pose] });
    built.root.updateMatrixWorld(true);
    built.gloves.forEach((glove, i) => {
      const want = anchors[i].parent.localToWorld(new THREE.Vector3(...anchors[i].at));
      assert.ok(at(glove).distanceTo(want) < 1e-6, `${species} ${pose}: glove ${i} has come off its anchor`);
    });
  }
  const r = new THREE.Box3().setFromObject(built.gloves[0]).getSize(new THREE.Vector3()).x / 2;
  assert.ok(r > 0.042 * 1.4, `${species}: a glove (r ${r.toFixed(3)}) must read bigger than the bare hand it covers`);
  disposeFighter(built);
}

for (const f of [newFighter('owl'), ...Array.from({ length: OWLS }, () => randomFighter(Math.random, 'owl'))]) {
  const built = buildFighter(f);
  const { pos, scale } = wingShape(built.params);
  applyPose(built, POSES.rest);
  built.root.updateMatrixWorld(true);
  built.gloves.forEach((glove, i) => {
    const arm = glove.parent;
    const hand = arm.worldToLocal(at(built.holds.find((h) => h.parent.parent.parent === arm).parent));
    const tip = glove.position, r = glove.scale.x;
    assert.ok(tip.y < hand.y, `owl glove ${i} sits at y ${tip.y.toFixed(3)}: above the hand (${hand.y.toFixed(3)}), not on the wing tip`);
    const across = Math.sqrt(1 - ((tip.y - pos[1]) / scale[1]) ** 2);
    assert.ok(r >= scale[0] * across && r * 1.1 >= scale[2] * across, `owl glove ${i} (r ${r.toFixed(3)}) is narrower than the wing it should swallow`);
    assert.ok(-(tip.y - r) > -(pos[1] - scale[1]), `owl glove ${i} must cover the wing's last tip, not leave it poking out below`);
  });
  disposeFighter(built);
}

for (const species of SPECIES) for (const cape of CAPES) {
  const f = newFighter(species);
  f.look = { ...f.look, hat: null, bag: BAGS[0], cape };
  const built = buildFighter(f);
  const shawl = built.garments.filter((m) => m.userData.worn.includes('shawl'));
  assert.ok(shawl.length, `${species}: a ${cape} is drawn`);
  for (const mesh of shawl) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${species}: ${cape} has a NaN vertex`);
  }
  disposeFighter(built);
}

{
  const f = newFighter('lion');
  const back = new THREE.Vector3(), front = new THREE.Vector3();
  f.look = { ...f.look, hat: null, cape: 'cape' };
  const built = buildFighter(f);
  const mesh = built.garments.find((m) => m.userData.worn.includes('shawl'));
  const p = mesh.geometry.attributes.position;
  let lowBack = Infinity, lowFront = Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (p.getZ(i) < 0 && y < lowBack) { lowBack = y; back.fromBufferAttribute(p, i); }
    if (p.getZ(i) > 0 && y < lowFront) { lowFront = y; front.fromBufferAttribute(p, i); }
  }
  assert.ok(lowFront - lowBack > built.params.torsoH * 0.5, `a cape hangs much lower behind than in front (back ${lowBack.toFixed(3)}, front ${lowFront.toFixed(3)})`);
  disposeFighter(built);
}

{
  for (const { hex, name } of CLOTH) assert.ok(!isBadGuyCloth(hex), `${name} is a bad-guy colour and can't be a kid's swatch`);
  for (const { hex, name } of FUR) assert.ok(!isBadGuyFur(hex) && !isBadGuyCloth(hex), `${name} fur reads as a bad guy`);
  for (const { hex, name } of FUR) assert.ok(oklchOf(hex).c > 0.1, `${name} is too quiet for the colour riot`);
  for (const species of SPECIES) assert.ok(FUR.some((s) => s.hex === newFighter(species).params.bodyColor), `a new ${species} starts on a riot swatch`);
  assert.ok(isBadGuyCloth('#111111') && isBadGuyCloth('#4b2466') && isBadGuyFur('#8c8c8c'), 'black, dark purple and grey are the bad guys\'');
  assert.ok(!isBadGuyCloth('#c9a8f0'), 'light lavender stays a kid colour');
  assert.ok(isBadGuyFur('#a0a6ba'), 'the rig\'s default blue-grey fur reads as a bad guy, so a kid never starts with it');
}

{
  const f = randomFighter(() => 0.5);
  assert.deepEqual(readFighter(JSON.parse(JSON.stringify(f))), f, 'a saved fighter reads back unchanged');
  assert.equal(readFighter(null), null);
  assert.equal(readFighter({ species: 'dragon' }), null, 'only the three animals');
  const junk = readFighter({ species: 'llama', params: { headRadius: 'big', bodyColor: 'red;}', legHeight: Number.NaN, view: '<script>' },
    look: { hat: 'crown', hatColor: '#000000', hatStitch: 'linen stitch', cape: null, bag: 'suitcase', gloves: 12 } });
  const fresh = newFighter('llama');
  assert.equal(junk.params.headRadius, fresh.params.headRadius, 'a non-number size is ignored');
  assert.equal(junk.params.legHeight, fresh.params.legHeight, 'NaN is ignored');
  assert.equal(junk.params.view, fresh.params.view, 'free text from another tablet is ignored');
  assert.ok(/^#[0-9a-f]{6}$/i.test(junk.params.bodyColor), 'a colour must be a colour');
  assert.ok(HATS.includes(junk.look.hat), 'an unknown hat falls back to a real one');
  assert.equal(junk.look.cape, null, 'no cape is a real choice');
  assert.ok(BAGS.includes(junk.look.bag) && CLOTH.some((s) => s.hex === junk.look.gloves), 'unknown bag and glove colour fall back');
  assert.ok(CLOTH.some((s) => s.hex === junk.look.hatColor), 'black is not a kid\'s hat colour, even from another tablet');
  assert.ok(TEXTURES.includes(junk.look.hatStitch), 'linen stitch is too heavy for a tablet, even from another tablet');
}

{
  const triangles = (stitch) => {
    const f = newFighter('lion');
    f.look = { ...f.look, hat: 'beanie', hatStitch: stitch, cape: 'cape', capeStitch: stitch };
    const built = buildFighter(f);
    const n = built.garments.filter((m) => /hat|shawl/.test(m.userData.worn)).reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
    disposeFighter(built);
    return n;
  };
  const smooth = triangles('stockinette');
  for (const stitch of TEXTURES) {
    const n = triangles(stitch);
    assert.ok(n <= smooth * 5, `${stitch} hat and cape cost ${n} triangles, over 5× smooth (${smooth})`);
  }
}

{
  const f = setFur(newFighter('llama'), FUR[3].hex);
  assert.equal(f.params.bodyColor, FUR[3].hex);
  assert.notEqual(f.params.fleeceColor, newFighter('llama').params.fleeceColor, 'the fleece follows a new fur colour');
}

{
  const { cell } = floorGrid();
  // ponytail: sampled, since species randomise() is Math.random only; 1.4 vs 1.26 widest of 600 is the margin
  for (let i = 0; i < BODIES; i++) {
    const f = randomFighter();
    f.look = { ...f.look, cape: 'capelet', bag: 'crossbody pouch', hands: 'sword' };
    const built = buildFighter(f);
    built.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3());
    assert.ok(size.x < cell && size.z < cell, `a ${built.species.id} (${size.x.toFixed(2)} × ${size.z.toFixed(2)}) spills out of its ${cell} lobby square`);
    // every stage is checked with one WIDEST_FIGHTER wide (check-level.mjs)
    const { width } = entrantOf(f, built, { id: 'a', team: 'heroes' });
    assert.ok(width <= WIDEST_FIGHTER, `a ${built.species.id} is ${width.toFixed(2)} wide, wider than every stage allows for (${WIDEST_FIGHTER})`);
    disposeFighter(built);
  }
}

{
  setGeometryDetail('med');
  LOOK.viewPx = SHOP_VIEW_PX;
  const relief = (species, stitch) => {
    const f = newFighter(species);
    f.look = { ...f.look, hat: 'beanie', hatStitch: stitch, cape: 'cape', capeStitch: stitch };
    const built = buildFighter(f);
    const n = built.garments.filter((m) => /hat|shawl/.test(m.userData.worn)).reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
    disposeFighter(built);
    return n;
  };
  for (const species of SPECIES) {
    const smooth = relief(species, 'stockinette');
    for (const stitch of TEXTURES.slice(1)) assert.ok(relief(species, stitch) > smooth, `a ${species}'s ${stitch} is drawn smooth at match size`);
  }
  LOOK.viewPx = 0;
  setGeometryDetail('high');
}

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species)), drop = seatDrop(built);
  assert.ok(drop > 0.05 && drop < built.params.legHeight + built.params.hipInset + 0.05,
    `${species} sits down by part of its leg length, not through the floor or not at all (${drop})`);
  disposeFighter(built);
}

{
  const wobble = (percent) => {
    let peak = 0, swings = 0, was = 0;
    for (let i = 0; i < 120; i++) {
      const { z } = wobbleAt(percent, wobbleHz(percent) * i / 120);
      peak = Math.max(peak, Math.abs(z));
      if (z * was < 0) swings++;
      was = z;
    }
    return { peak, swings };
  };
  assert.deepEqual(wobbleAt(0, 0.3), { x: 0, z: 0 }, 'an unhit fighter stands still');
  const some = wobble(15), lots = wobble(80);
  assert.ok(some.peak > 0.12, `a few hits already show (${some.peak} rad)`);
  assert.ok(lots.peak > 0.35 && lots.swings >= 8, `a ready-to-fly fighter wobbles hard and fast (${lots.peak} rad, ${lots.swings} swings a second)`);
  let cycles = 0, was = wobbleAt(80, 0).z, jump = 0;
  for (let i = 1; i < 60 * 90; i++) {
    const percent = Math.min(80, 80 - (i - 3600) * 0.5);
    cycles += wobbleHz(percent) / 60;
    const { z } = wobbleAt(percent, cycles);
    jump = Math.max(jump, Math.abs(z - was));
    was = z;
  }
  assert.ok(jump < 0.2, `a calming fighter never snaps, however late in the round (${jump} rad in one frame)`);
}

{
  const built = buildFighter(newFighter('owl')), L = built.params.legHeight + built.params.hipInset;
  for (const speed of [WALK_SPEED, WALK_SPEED * SYRUP_SLOW]) {
    const { skate } = walkPhase(0, speed, L, IDLE);
    assert.ok(skate < 0.2, `feet keep up with the body at ${speed} m/s (skating ${skate.toFixed(2)} of each stride)`);
  }
  disposeFighter(built);
}

// The swatches in rainbow order, far enough apart in hue to tell apart; a colour saved from the old palette keeps its look.
{
  const hues = FUR.map((s) => oklchOf(s.hex).h);
  const gaps = hues.map((h, i) => (hues[(i + 1) % hues.length] - h + 360) % 360);
  assert.ok(gaps.every((g) => g > 0 && g < 90), `the fur swatches go round the hue circle once, in order (${gaps.map(Math.round)})`);
  assert.ok(Math.min(...gaps) >= 20, `no two fur swatches closer than 20° of hue (${gaps.map(Math.round)})`);
  const old = { '#ff7a1a': 'tangerine', '#14c4e0': 'turquoise', '#6fc8ff': 'sky', '#8a4dff': 'violet', '#e83ad8': 'magenta', '#ff6f61': 'coral', '#ff9ad5': 'bubblegum' };
  for (const [hex, name] of Object.entries(old)) assert.equal(nearestSwatch(CLOTH, hex).name, name, `a saved ${hex} becomes ${name}`);
  assert.equal(nearestSwatch(CLOTH, '#ffffff').name, 'white', 'white stays white');
  const saved = readFighter({ species: 'owl', params: {}, look: { hatColor: '#e83ad8', gloves: '#2a0a3a' } });
  assert.equal(saved.look.hatColor, '#cf4bfc', 'an old saved hat colour moves to its new swatch');
  assert.ok(CLOTH.some((s) => s.hex === saved.look.gloves) && !isBadGuyCloth(saved.look.gloves), 'any saved colour lands on a swatch, never a bad guy\'s');
}

// A sword or the Music Scythe instead of gloves: saved and sent like any look, held in the right hand, swung on the
// sword's moves, and the same reach and width as the gloves (REUSE-SPEC.md §Costumes).
{
  const look = (hands) => readFighter({ species: 'lion', params: {}, look: { hands } })?.look.hands;
  assert.equal(look('sword'), 'sword', 'a sword reads back');
  for (const junk of [undefined, null, 'axe', 3]) assert.equal(look(junk), 'gloves', `an old save or a junk ${junk} gets gloves`);
  assert.deepEqual([0, 1, 2].map(handsFor), [['gloves'], ['gloves', 'sword'], ['gloves', 'sword', 'scythe']], 'the sword after level 1, the scythe after level 2');
  assert.deepEqual([[0, 1], [1, 2], [2, 2], [0, 2], [3, 4]].map(([b, a]) => newHands(b, a)), [['sword'], ['scythe'], [], ['sword', 'scythe'], ['hammer']],
    'the end card names only what this win unlocked: the Greathammer after level 4');
  const { hands, trick } = readFighter({ species: 'lion', params: {}, look: { hands: 'scythe', trick: 'flame' } }).look;
  assert.deepEqual([hands, trick], ['scythe', 'music'], 'a scythe reads back, always with its music');
  assert.equal(readFighter({ species: 'lion', params: {}, look: { hands: 'hammer', trick: 'bubble' } }).look.trick, 'lightning', 'the Greathammer always crackles with lightning');
  for (const species of SPECIES) {
    const f = newFighter(species), gloved = buildFighter(f);
    assert.equal(gloved.tricks.length, 0, `${species}: plain gloves have no trick`);
    for (const held of ['sword', 'scythe', 'hammer']) {
      const built = buildFighter({ ...f, look: { ...f.look, hands: held, trick: 'sparkle' } });
      const hand = species === 'owl' ? built.joints.upperArm[0].node : built.holds[0].parent;
      assert.ok(built.sword?.parent === hand && built.gloves.length === 0, `${species}: a ${held} in the right hand and no gloves`);
      const entrant = (b) => entrantOf(f, b, { id: 'a', team: 'heroes' });
      const size = (b) => { const e = entrant(b); return [e.reach, e.width, e.height]; };
      assert.deepEqual(size(built), size(gloved), `${species}: the ${held} hits exactly as far as gloves, and is as wide and as tall`);
      /** The blade's angle above level, its turn from straight ahead and its angle round from ahead as the side-on camera sees it, in degrees, and which swoosh shows. */
      const blade = (name, step) => {
        for (let i = 0; i < 3; i++) stepFighter(built, 1e-4, POSES.rest, 0, { name, arm: 1, step });
        built.root.updateMatrixWorld(true);
        const d = built.sword.localToWorld(new THREE.Vector3(0, 0, 0.4)).sub(at(built.sword)).normalize();
        const { fan, streak } = built.sword.userData;
        return { up: Math.asin(d.y) * 57.3, turn: Math.atan2(d.x, d.z) * 57.3, side: Math.atan2(d.y, d.z) * 57.3, fan: fan.visible, streak: streak.visible };
      };
      const stab = [blade('jab', 0.14), blade('jab', 0.25)], slash = [blade('cross', CHOP_UP), blade('cross', CHOP_DOWN)], mid = blade('cross', STRIKE);
      const lift = [blade('uppercut', 0.14), blade('uppercut', 0.25)];
      assert.ok(stab.every((b) => Math.abs(b.up) < 25 && Math.abs(b.turn) < 45) && stab[1].streak && !stab[1].fan,
        `${species} ${held}: a stab thrusts the blade level and straight ahead, with a streak (${JSON.stringify(stab)})`);
      // a chop, up and down where the side-on camera and the chooser's front view both see it (playtest: a level sweep read from neither)
      assert.ok(slash[0].side > 100 && slash[1].side < -45 && slash[1].fan && !slash[1].streak,
        `${species} ${held}: a slash chops the blade down from up and back over the head to well below level in front, with a fan (${JSON.stringify(slash)})`);
      // still swinging as the hit lands: the downswing is long enough to see (playtest: over in two frames, it couldn't be)
      assert.ok(mid.side < slash[0].side - 40 && mid.side > slash[1].side + 40, `${species} ${held}: the slash is mid-swing as it hits (${mid.side.toFixed(0)}°)`);
      assert.ok(lift[0].up < 20 && lift[1].up > 60 && lift[1].streak, `${species} ${held}: an upward stab ends pointing at the sky (${JSON.stringify(lift)})`);
      if (held === 'scythe') {
        const { tip, butt } = built.sword.userData, tall = entrant(gloved).height;
        assert.ok(Math.abs((tip - butt) / tall - 0.5) < 0.1, `${species}: the scythe (${(tip - butt).toFixed(2)}) is about half the fighter (${tall.toFixed(2)})`);
        for (const name of ['jab', 'cross', 'uppercut']) {
          blade(name, 0.25);
          const side = (v) => built.root.worldToLocal(v).setX(0), { parent, at: spot } = gloveAnchors(built)[1];
          const grip = side(at(built.sword)), end = side(built.sword.localToWorld(new THREE.Vector3(0, 0, butt))).sub(grip), pole = end.clone().normalize();
          const other = side(parent.localToWorld(new THREE.Vector3(...spot))).sub(grip), on = other.dot(pole), off = other.addScaledVector(pole, -on).length();
          // a slash turns the pole across the body, too far for the other arm, so it is only in line with it
          assert.ok(off < 0.09 && (name === 'cross' || (on > 0 && on < end.length() + 0.05)), `${species} ${name}: seen side-on the other hand is on the pole below the first (${off.toFixed(3)} off, ${on.toFixed(2)} of ${end.length().toFixed(2)} along)`);
        }
        assert.ok(built.tricks[0].userData.spin.children.length > 4, `${species}: sparkles, stars, hearts and notes, whatever trick was saved`);
      }
      blade('jab', 0.25);
      if (species !== 'owl') {
        const fore = built.holds[0].parent.parent, along = at(built.sword).sub(at(fore)).normalize();
        const d = built.sword.localToWorld(new THREE.Vector3(0, 0, 0.4)).sub(at(built.sword)).normalize();
        assert.ok(d.angleTo(along) < 0.35, `${species} ${held}: the stabbing arm reaches along the blade (${d.angleTo(along).toFixed(2)} rad off)`);
      }
      assert.ok(built.tricks.length === 1 && built.tricks[0].parent === built.sword && built.tricks[0].visible, `${species}: the ${held}'s trick at its tip as it lands`);
      if (held === 'scythe') {
        // the stars, hearts and notes fly out past the point through the chop, never over the crescent (playtest: they hid it)
        const tipAt = () => built.sword.localToWorld(new THREE.Vector3(0, 0, built.sword.userData.tip));
        for (const step of [0.2, 0.3, 0.4]) {
          blade('cross', step);
          const hand = at(built.sword), reach = tipAt().distanceTo(hand), spray = built.tricks[0].userData.spin.userData.spray;
          assert.ok(spray.every((m) => at(m).distanceTo(hand) > reach), `${species}: the scythe's music flies out past its point (${step})`);
        }
      }
      disposeFighter(built);
    }
    disposeFighter(gloved);
  }
}

// Tapping the picked hands goes through its tricks; a trick the other hands don't have falls back to their first.
{
  const trick = (hands, t) => readFighter({ species: 'owl', params: {}, look: { hands, trick: t } })?.look.trick;
  assert.equal(trick('sword', 'flame'), 'flame');
  assert.equal(trick('sword', 'plain'), 'sparkle', 'a sword always has a trick');
  assert.equal(trick('gloves', 'rocket'), 'plain', 'an unknown trick is plain gloves');
  assert.equal(trick(undefined, undefined), 'plain', 'an old save is plain gloves');
  const f = newFighter('llama'), built = buildFighter({ ...f, look: { ...f.look, trick: 'bubble' } });
  const shown = (arm, step) => {
    stepFighter(built, 1e-4, POSES.rest, 0, { name: 'cross', arm, step });
    return built.tricks.map((g) => g.visible);
  };
  assert.deepEqual(shown(1, 0.25), [false, true], 'only the hitting glove blows bubbles');
  assert.deepEqual(shown(-1, 0.25), [true, false]);
  assert.deepEqual(shown(-1, 0.8), [false, false], 'and only while the punch lands');
  disposeFighter(built);
}

// The chooser's preview hits nothing, so after its jab lands the trick floats up off the hand to be seen.
for (const [hands, trick] of [['sword', 'sparkle'], ['sword', 'flame'], ['gloves', 'bubble'], ['gloves', 'sparkle']]) {
  const f = newFighter('lion'), built = buildFighter({ ...f, look: { ...f.look, hands, trick } });
  const g = built.tricks.at(-1).userData.side === -1 ? built.tricks.at(-1) : built.tricks[0];
  const meshes = () => { let n = 0; g.traverse((o) => { if (o instanceof THREE.Mesh && o.visible) n++; }); return n; };
  showOffTrick(built, -1, 0.1);
  const early = { y: g.userData.spin.position.y, size: g.scale.x };
  showOffTrick(built, -1, SHOW_OFF * 0.6);
  assert.ok(g.visible && meshes() > 0 && built.tricks.every((t) => t === g || !t.visible), `${hands} ${trick}: shows on the jabbing side, and only there`);
  assert.ok(early.size >= 1.3 && g.userData.spin.position.y > early.y, `${hands} ${trick}: big, and floating up`);
  showOffTrick(built, -1, SHOW_OFF);
  assert.ok(!g.visible, `${hands} ${trick}: gone after the show-off`);
  disposeFighter(built);
}
{
  const f = newFighter('owl'), built = buildFighter(f);
  showOffTrick(built, -1, 0.1);
  assert.equal(built.tricks.length, 0, 'plain gloves show nothing');
  disposeFighter(built);
}

// REUSE-SPEC.md §Costumes: a fighter is as wide as its body, whatever it wears; as tall as what shows, but a hidden swoosh or trick
{
  const f = newFighter('lion'), built = buildFighter(f), who = { id: 'a', team: /** @type {const} */ ('heroes') };
  const { width, height } = entrantOf(f, built, who);
  const dressed = { ...f, look: { ...f.look, cape: 'capelet', hands: 'sword' } }, big = buildFighter(dressed);
  assert.equal(entrantOf(dressed, big, who).width, width, 'a capelet and a sword don\'t make a body wider');
  disposeFighter(big);
  const far = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5));
  far.visible = false;
  built.root.add(far);
  assert.deepEqual([entrantOf(f, built, who).width, entrantOf(f, built, who).height], [width, height], 'a hidden part is not measured');
  far.visible = true;
  assert.ok(entrantOf(f, built, who).height > height + 1, 'a shown part is');
  disposeFighter(built);
}

console.log('fighter ok');

{
  // REUSE-SPEC.md §Costumes: the Greathammer's knotwork is a true plait, each strand over then under at its crossings
  const tops = [0, 1, 2, 3, 4, 5].map((n) => knotAt(16 * n + 4, -16 * n - 4));
  assert.deepEqual(tops, [1, 0, 1, 0, 1, 0], `over, under, over along one strand (${tops})`);
  assert.ok([0, 64, 200].every((y) => knotAt(0, y) === knotAt(256, y) && knotAt(y, 0) === knotAt(y, 256)), 'and it tiles seamlessly');
}
