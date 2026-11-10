import assert from 'node:assert/strict';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, isBadGuyCloth, isBadGuyFur, outfitOf } from '../spinoff/fighter.js';
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
  else assert.ok(look.sweater && look.socks && look.sweaterColor === look.socksColor && look.socksColor === COLOURS[5].hex, 'the jumpsuit is taxi yellow');
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
for (let i = 0; i < 6; i++) disposeFighter(buildFighter(randomHero()));
console.log('hero ok');
