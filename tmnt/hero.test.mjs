import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOK } from '../characters/garments.js';
import { CANE, SAI, SPECIES, STAFF, animateFighter, buildFighter, disposeFighter, isBadGuyCloth, isBadGuyFur, outfitOf } from '../spinoff/fighter.js';
import { CLOTH, COLOURS, PALETTE, SCARF_FORMS, SWEATER_WORKS, TURTLE_COLOURS, WEAR, newHero, randomHero, readHero } from './hero.js';

LOOK.viewPx = 0;

for (const { hex, name } of CLOTH) {
  assert.ok(!isBadGuyCloth(hex) && !isBadGuyFur(hex), `${name} is a hero colour, not a bad guy's`);
}

// REUSE-SPEC.md §Hero chooser: a turtle in one of the four turtles' scarves, or in April's yellow jumpsuit
const looks = new Set();
for (const r of [0, 0.25, 0.45, 0.65, 0.95]) {
  const { species, look } = newHero(() => r);
  assert.equal(species, 'turtle');
  if (look.scarf) assert.ok(TURTLE_COLOURS.some((c) => c.hex === look.scarfColor), 'a turtle colour scarf');
  else assert.ok(look.sweater && look.socks && look.sweaterColor === COLOURS[5].hex && look.socksColor === '#ffffff', 'a taxi yellow jumpsuit, white boots');
  looks.add(look.scarf ? look.scarfColor : 'jumpsuit');
}
assert.equal(looks.size, 5, 'all four scarves and the jumpsuit come up');

// the trust boundary: no hats or capes, no Sock Clan scarf, no colour outside the hero colours
const hero = readHero({
  species: 'mouse', params: { bodyColor: '#fefefe' },
  look: { hat: 'beanie', cape: 'cape', scarf: 'long', scarfForm: 'wrapped twice', scarfColor: '#c0c0c0', socks: 'nope', bagColor: '#fefefe', hands: 'scythe' },
});
assert.equal(hero.look.hat, null);
assert.equal(hero.look.cape, null);
assert.equal(hero.look.scarf, 'long');
assert.ok(SCARF_FORMS.includes(hero.look.scarfForm) && hero.look.scarfForm !== 'wrapped twice');
assert.ok(CLOTH.some((c) => c.hex === hero.look.scarfColor), "a silver scarf snaps to a hero colour");
assert.equal(hero.look.socks, null);
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
const april = newHero(() => 0.95);
for (const work of SWEATER_WORKS) {
  const sweater = outfitOf({ ...april.look, sweaterWork: work }, PALETTE).sweater;
  assert.equal(sweater.color1, april.look.sweaterColor, `${work}: the picked colour leads`);
  assert.equal(sweater.colourwork, work);
  assert.equal(sweater.colorCount, work === 'solid' ? 1 : PALETTE.length);
  disposeFighter(buildFighter({ ...april, look: { ...april.look, sweaterWork: work } }, PALETTE));
}
assert.equal(outfitOf({ ...april.look, sweaterWork: 'stripes' }).sweater.colorCount, 1, 'a fighter (no palette) keeps a one-colour sweater');
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
  assert.ok(low > -0.005 && low < 0.06, `${species}: the knob just off the floor (${low.toFixed(3)})`);
  assert.equal(built.sword.scale.x, 1, `${species}: the same cane as everyone's`);
  disposeFighter(built);
}
// Donatello (purple) has his bo staff, held in both hands, its grip wrapped in knitting
assert.equal(newHero(() => 0.45).look.hands, STAFF);
for (const species of SPECIES) {
  const built = buildFighter({ ...newHero(() => 0.45, species), look: newHero(() => 0.45).look });
  let knit = 0;
  built.sword.traverse((o) => { if (o.userData.ownGeometry && o instanceof THREE.Mesh) knit++; });
  assert.ok(built.sword.userData.both && knit === 1, `${species}: a two-handed staff with a knitted wrap`);
  disposeFighter(built);
}
for (let i = 0; i < 6; i++) disposeFighter(buildFighter(randomHero()));
console.log('hero ok');
