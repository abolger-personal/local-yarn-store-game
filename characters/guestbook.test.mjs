import assert from 'node:assert/strict';
import { TRAITS, makeNpc } from './visit.js';
import { wantsOf } from './wip.js';
import { bandCard, bandLines, entryRows, patternNeeds, placeWord, tagCard, thankYou } from './guestbook.js';
import { GLYPHS } from './store/ui/lettering.js';
import { mulberry32 } from './store/core/util.js';

const yarn = (extra) => ({ name: 'yarn', weight: 'worsted', material: 'wool', shape: 'ball', colorIndex: 32, ...extra });
const pattern = { name: 'pattern', patternType: 'hat', craft: 'knitting', toolSize: 4.5, weight: 'worsted', materials: ['wool'], yarnUnits: 3 };
const made = (yarns, opts) => ({ id: 'WIP 1', pattern, yarn: yarns, ...opts });

const cases = [
  made([yarn({ place: 'by the window' })]),
  made([yarn({ place: 'in the back corner', beside: 'socks', alsoIn: 'Bramblewick' })]),
  made([yarn({ place: 'on the floor' })]),
  made([yarn()]),
];
for (const m of cases) {
  for (const lead of TRAITS) {
    for (const enthusiasm of [1, 5]) {
      const traits = { ...Object.fromEntries(TRAITS.map((t) => [t, 2])), [lead]: 5, Enthusiasm: enthusiasm };
      for (const workedHere of [false, true]) {
        const line = thankYou(m, traits, { workedHere });
        assert.ok(line.facts.length >= 1, 'every line names at least one fact');
        for (const word of line.facts) assert.ok(line.full.includes(word), `"${line.full}" names "${word}"`);
        assert.ok(line.short.includes(line.facts[0]) || line.short.includes(line.facts[0].split(' ').at(-1)),
          `short "${line.short}" keeps the fact "${line.facts[0]}"`);
        assert.ok(line.short.length <= 24, `"${line.short}" fits a polaroid`);
      }
    }
  }
}

const room = { door: { x: 0, z: 3.25 }, guestbook: { x: -3, z: 1.55 }, windows: [{ x: 0, z: -3.6 }],
               bounds: { minX: -4.2, maxX: 4.2, minZ: -2.2, maxZ: 2.7 } };
assert.equal(placeWord({ form: 'floor', solid: false, x: 0, z: 0 }, room), 'on the floor');
assert.equal(placeWord({ form: 'table', x: 0.5, z: 2.5 }, room), 'by the door');
assert.equal(placeWord({ form: 'wall-shelf', x: 0, z: -3.1 }, room), 'by the window');
assert.equal(placeWord({ form: 'wall-shelf', x: -4.3, z: -2.0 }, room), 'in the back corner');

const rows = (did) => entryRows({ bought: [yarn()], did }).map((r) => r.text);
assert.ok(rows([])[0].startsWith('bought a worsted wool ball, '), 'a purchase reads as its ball band');
assert.deepEqual(rows([{ what: 'putBack', item: yarn({ weight: 'dk' }), witnessed: true }])[1].split(', ')[0],
  'turned over a dk wool ball', 'a witnessed put-back says what it was');
assert.equal(rows([{ what: 'putBack', item: yarn(), witnessed: false }])[1], 'turned something over and put it back');
assert.ok(rows([{ what: 'sat', pattern, witnessed: true }])[1].startsWith('sat and knitted on the hat pattern'));
assert.equal(rows([{ what: 'sat', pattern, witnessed: false }])[1], 'sat and worked on a project');

assert.deepEqual(bandLines(yarn({ weight: 'super-bulky', shape: 'cone' })), ['SUPER BULKY WEIGHT', 'WOOL', 'BLUE', 'CONE', '4 UNITS']);
assert.deepEqual(bandLines({ ...pattern, title: 'Bird Brain Beanie', silhouette: 'beanie' }),
  ['BIRD BRAIN BEANIE', 'MAKES BEANIE HAT', '4.5MM KNITTING NEEDLES', 'TAKES 3 UNITS WORSTED WOOL']);
assert.ok(bandLines({ ...pattern, yarnUnits: 1 }).includes('TAKES 1 UNIT WORSTED WOOL'), 'one unit reads singular, like a yarn band');
assert.deepEqual(bandLines({ ...pattern, minColors: 3 }).at(-1), 'SUGGESTS 3 COLOURS');
assert.deepEqual(bandLines({ ...pattern, minColors: 1 }).at(-1), 'SUGGESTS 1 COLOUR');
assert.deepEqual(bandLines({ name: 'crochet-hook', size: 5 }), ['CROCHET HOOK', '5.0MM']);
assert.deepEqual(bandLines({ name: 'stitch-markers', size: null }), ['STITCH MARKERS']);

for (let seed = 1; seed <= 40; seed++) {
  const npc = makeNpc({ id: `n${seed}`, name: 'Marguerite', species: 'Owl', rng: mulberry32(seed) });
  assert.ok(wantsOf(npc).length, 'a fresh customer has wants to hide');
  assert.deepEqual(tagCard(npc), { head: 'MARGUERITE', body: '<p class="status">Nothing bought yet</p>' }, 'an unwatched tag shows no wants');
  npc.bought.push(yarn(), { name: 'crochet-hook', size: 5 });
  const onNeedles = npc.wips.find((w) => w.pattern)?.pattern ?? pattern;
  npc.did.push({ what: 'sat', pattern: onNeedles, witnessed: false });
  assert.equal(tagCard(npc).body, '<ul class="items"><li>WORSTED WOOL BALL, BLUE</li><li>CROCHET HOOK 5.0MM</li></ul>',
    'an unwitnessed sit stays hidden; each thing bought is one list entry');
  npc.did[0].witnessed = true;
  const { head, body } = tagCard(npc);
  const making = body.slice(body.indexOf('<section class="making">'));
  assert.ok(body.indexOf('</ul>') < body.indexOf('<section class="making">'), 'what they bought, then what they make');
  assert.match(making, /^<section class="making"><h3>Making<\/h3><p class="title">[^<]+<\/p><dl class="needs">/, 'a titled pattern section');
  assert.deepEqual([...making.matchAll(/<dt>(\w+)<\/dt><dd>[^<]+<\/dd>/g)].map((m) => m[1]),
    patternNeeds(onNeedles).map(([k]) => k), 'each need its own label/value row');
  for (const ch of head) assert.ok(ch === ' ' || GLYPHS[ch], `the lettering draws "${ch}" in ${head}`);
}
assert.deepEqual(bandCard({ name: 'crochet-hook', size: 5 }), { head: 'CROCHET HOOK', body: '<ul class="facts"><li>5.0MM</li></ul>' });
assert.equal(bandCard({ name: 'stitch-markers', size: null }).body, '', 'nothing more to say, no empty list');
console.log('guestbook: ok');
