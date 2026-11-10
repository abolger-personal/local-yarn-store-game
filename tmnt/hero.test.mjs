import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOK } from '../characters/garments.js';
import { POSES } from '../characters/npc.js';
import { CANE, MIC, NEEDLES, SAI, SPECIES, STAFF, YARN_BALLS, stepFighter, animateFighter, buildFighter, disposeFighter, isBadGuyCloth, isBadGuyFur, outfitOf } from '../spinoff/fighter.js';
import { CLOTH, COLOURS, PALETTE, PRESETS, SCARF_FORMS, SWEATER_WORKS, TURTLE_COLOURS, WEAR, newHero, randomHero, readHero } from './hero.js';

LOOK.viewPx = 0;

for (const { hex, name } of CLOTH) {
  assert.ok(!isBadGuyCloth(hex) && !isBadGuyFur(hex), `${name} is a hero colour, not a bad guy's`);
}

// REUSE-SPEC.md §Hero chooser: six presets, the four turtles in their scarves, April and Master Splinter
const presets = Array.from({ length: PRESETS }, (_, i) => newHero(() => (i + 0.5) / PRESETS));
assert.equal(PRESETS, 6);
presets.slice(0, 4).forEach(({ species, look }, i) => {
  assert.equal(species, 'turtle');
  assert.equal(look.scarfColor, TURTLE_COLOURS[i].hex, 'each turtle in his own colour');
});
const [april, splinter] = presets.slice(4).map(({ species, look }) => ({ species, ...look }));
assert.deepEqual([april.species, april.sweaterColor, april.socksColor, april.hands, april.trick], ['llama', COLOURS[5].hex, '#ffffff', MIC, 'sparkle'], 'April: a taxi yellow jumpsuit, white boots, her microphone throwing stars');
assert.deepEqual([splinter.species, splinter.sweater, splinter.hands], ['mouse', 'vest', CANE], 'Master Splinter: a vest and his cane');

// the trust boundary: no hats or capes, no Sock Clan scarf, no colour outside the hero colours
const hero = readHero({
  species: 'mouse', params: { bodyColor: '#fefefe' },
  look: { hat: 'beanie', cape: 'cape', scarf: 'long', scarfForm: 'wrapped twice', scarfColor: '#c0c0c0', socks: 'nope', bagColor: '#fefefe', hands: 'sword' },
});
assert.equal(hero.look.hat, null);
assert.equal(hero.look.cape, null);
assert.equal(hero.look.scarf, 'long');
assert.ok(SCARF_FORMS.includes(hero.look.scarfForm) && hero.look.scarfForm !== 'wrapped twice');
assert.ok(CLOTH.some((c) => c.hex === hero.look.scarfColor), "a silver scarf snaps to a hero colour");
assert.equal(hero.look.socks, null);
assert.equal(hero.look.hands, 'gloves', "the fighters' sword isn't a hero's");
assert.equal(hero.look.bagColor, '#ffffff', 'white clothes');
assert.ok(COLOURS.some((c) => c.hex === hero.params.bodyColor), 'white fur snaps to a hero colour');
assert.equal(readHero({ species: 'hydra' }), null);

// every piece a hero can pick dresses every animal
for (const species of SPECIES) {
  for (const kind of Object.keys(WEAR)) {
    for (const v of WEAR[kind]) {
      const built = buildFighter({ ...newHero(() => 0, species), look: { ...newHero(() => 0).look, scarf: null, [kind]: v } });
      assert.ok(built.garments.some((m) => m.userData.worn.includes(kind)), `${species} wears the ${v} ${kind}`);
      disposeFighter(built);
    }
  }
}
// the sweater, tapped again, in each colourwork: its own colour first, then the other hero colours
const jumpsuit = presets[4];
for (const work of SWEATER_WORKS) {
  const sweater = outfitOf({ ...jumpsuit.look, sweaterWork: work }, PALETTE).sweater;
  assert.equal(sweater.color1, jumpsuit.look.sweaterColor, `${work}: the picked colour leads`);
  assert.equal(sweater.colourwork, work);
  assert.equal(sweater.colorCount, work === 'solid' ? 1 : PALETTE.length);
  disposeFighter(buildFighter({ ...jumpsuit, look: { ...jumpsuit.look, sweaterWork: work } }, PALETTE));
}
assert.equal(outfitOf({ ...jumpsuit.look, sweaterWork: 'stripes' }).sweater.colorCount, 1, 'a fighter (no palette) keeps a one-colour sweater');
// Raphael (red) has his sai and red socks; the mouse is Master Splinter, with his cane, hanging down to the floor at rest
const raph = newHero(() => 0.65);
assert.deepEqual([raph.look.scarfColor, raph.look.hands, raph.look.socksColor], [COLOURS[3].hex, SAI, COLOURS[3].hex]);
assert.equal(newHero(() => 0, 'mouse').look.hands, CANE);
for (const species of SPECIES) {
  const built = buildFighter({ ...newHero(() => 0, species), look: { ...newHero(() => 0).look, hands: CANE } });
  let low = Infinity, dir = null;
  // a whole idle cycle: the knob's lowest is what touches down
  for (let i = 0; i < 180; i++) {
    animateFighter(built, 1 / 60);
    built.root.updateMatrixWorld(true);
    low = Math.min(low, built.sword.localToWorld(new THREE.Vector3(0, 0, built.sword.userData.tip)).y);
    dir = new THREE.Vector3(0, 0, 1).transformDirection(built.sword.matrixWorld);
  }
  assert.ok(dir.y < -0.95, `${species}: the cane hangs straight down (${dir.y.toFixed(2)})`);
  // one cane for everyone: a hand higher than the cane is long (the turtle) leaves it hovering
  assert.ok(low > -0.005 && low < 0.1, `${species}: the hook off the floor, not far (${low.toFixed(3)})`);
  assert.equal(built.sword.scale.x, 1, `${species}: the same cane as everyone's`);
  disposeFighter(built);
}
// Donatello (purple): a cowl, a fanny pack and his bo staff, held in both hands, its grip wrapped in knitting
const donnie = newHero(() => 0.45).look;
assert.deepEqual([donnie.scarf, donnie.bag, donnie.socks, donnie.hands], ['cowl', 'crossbody pouch', 'knee-high', STAFF]);
// Leonardo (blue): high boots and a knitting needle in each hand, gone again when he puts them down
const leo = buildFighter(newHero(() => 0.25));
const pair = leo.sword.userData.pair;
assert.ok(pair?.parent && leo.sword.parent !== pair.parent, 'a needle in each hand');
assert.deepEqual([newHero(() => 0.25).look.hands, newHero(() => 0.25).look.socks], [NEEDLES, 'over-knee']);
disposeFighter(leo);
assert.equal(pair.parent, null, 'the left needle goes with the right');
for (const species of SPECIES) {
  const built = buildFighter({ ...newHero(() => 0.45, species), look: newHero(() => 0.45).look });
  let knit = 0;
  built.sword.traverse((o) => { if (o.userData.ownGeometry && o instanceof THREE.Mesh) knit++; });
  assert.ok(built.sword.userData.both && knit === 1, `${species}: a two-handed staff with a knitted wrap`);
  disposeFighter(built);
}
// Michelangelo (orange) has his balls of yarn: hanging from the hand a ball apart, off the floor, flung out by a punch
const mikey = buildFighter(newHero(() => 0.05));
assert.equal(newHero(() => 0.05).look.hands, YARN_BALLS);
for (let i = 0; i < 180; i++) animateFighter(mikey, 1 / 60);
const hand = mikey.root.worldToLocal(mikey.sword.getWorldPosition(new THREE.Vector3())), balls = mikey.sword.userData.balls;
for (const b of balls) assert.ok(b.p.y < hand.y && b.p.y >= 0.04 && Math.abs(b.p.distanceTo(hand) - b.len) < 0.01, `a ball hangs on its strand (${b.p.distanceTo(hand).toFixed(3)} of ${b.len})`);
assert.ok(balls[0].p.distanceTo(balls[1].p) >= 0.084 - 1e-6, 'the balls a ball apart');
const rest = balls.map((b) => b.p.clone());
let flung = 0;
for (let i = 0; i <= 30; i++) {
  stepFighter(mikey, 1 / 60, POSES.rest, 0, { name: 'cross', arm: -1, step: i / 60 });
  flung = Math.max(flung, ...balls.map((b, j) => b.p.distanceTo(rest[j])));
}
assert.ok(flung > 0.2, `a cross flings the yarn (${flung.toFixed(2)})`);
disposeFighter(mikey);
for (let i = 0; i < 6; i++) disposeFighter(buildFighter(randomHero()));
console.log('hero ok');
