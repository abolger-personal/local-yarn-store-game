import assert from 'node:assert/strict';
import { LOOK } from '../characters/garments.js';
import { SPECIES, buildFighter, disposeFighter, isBadGuyCloth, isBadGuyFur } from '../spinoff/fighter.js';
import { COLOURS, SCARF_FORMS, TURTLE_COLOURS, WEAR, newHero, randomHero, readHero } from './hero.js';

LOOK.viewPx = 0;

for (const { hex, name } of COLOURS) {
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
  species: 'mouse', params: { bodyColor: '#000000' },
  look: { hat: 'beanie', cape: 'cape', scarf: 'long', scarfForm: 'wrapped twice', scarfColor: '#c0c0c0', socks: 'nope', hands: 'scythe' },
});
assert.equal(hero.look.hat, null);
assert.equal(hero.look.cape, null);
assert.equal(hero.look.scarf, 'long');
assert.ok(SCARF_FORMS.includes(hero.look.scarfForm) && hero.look.scarfForm !== 'wrapped twice');
assert.ok(COLOURS.some((c) => c.hex === hero.look.scarfColor) && COLOURS.some((c) => c.hex === hero.params.bodyColor));
assert.equal(hero.look.socks, null);
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
for (let i = 0; i < 6; i++) disposeFighter(buildFighter(randomHero()));
console.log('hero ok');
