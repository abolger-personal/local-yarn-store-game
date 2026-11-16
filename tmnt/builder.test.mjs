import assert from 'node:assert/strict';
import { MATCH } from '../spinoff/combat.js';
import { SIM } from '../spinoff/sim.js';
import { BUILD, builtLevel, middleOf, readPlayground, snap, spotsFor, without } from './builder.js';
import { BAND, forSim, shared, strip } from './generate.js';
import { rideStep, startRide } from './equipment.js';
import { FT, PIECES } from './pieces.js';

const IDS = Object.keys(PIECES), offered = (placed) => IDS.filter((id) => spotsFor(placed, id).length);
const put = (placed, id, at) => [...placed, { id, at: snap(spotsFor(placed, id), id, at) }];

// REUSE-SPEC.md §Build my playground: no unusable pieces. On empty ground only what starts from the ground is
// offered: no slide, no pole, no steps down from a deck that isn't there
const first = offered([]);
assert.ok(first.includes('grid') && first.includes('dome') && first.includes('swings') && first.includes('bars'));
for (const id of ['wavySlide', 'tealSlide', 'pole', 'lowDeck', 'steps', 'topDeck']) assert.ok(!first.includes(id), `${id} needs a deck first`);

// the climbing grid goes where it was dropped, snapped, and its 4 ft deck then offers what joins 4 ft: not the 7.5 ft slide
// (at the back of the band: a slide is too long to run across it from the middle)
let mine = put([], 'grid', { x: 10.2, z: -1 });
assert.ok(Math.hypot(middleOf('grid', mine[0].at).x - 10.2, middleOf('grid', mine[0].at).z + 1) <= BUILD.step, 'a piece snaps to the spot nearest the finger');
assert.ok(offered(mine).includes('bridge') && offered(mine).includes('stairsUp') && !offered(mine).includes('tealSlide'));

// up the stairs to the top deck: now the teal slide is offered, and it fits more than one side of the deck
mine = put(mine, 'stairsUp', { x: 12, z: -1.1 });
mine = put(mine, 'topDeck', { x: 13, z: -1.1 });
const slides = spotsFor(mine, 'tealSlide');
assert.ok(new Set(slides.map((c) => c.h)).size > 1, `a slide can go on more than one side of a deck (headings ${slides.map((c) => c.h)})`);
// dragged toward the front of the deck it snaps to that side, dragged on past its end, to the end
const deckEnd = mine[2].at.x + PIECES.topDeck.w * FT;
const front = snap(slides, 'tealSlide', { x: deckEnd - 0.4, z: 0.6 }), onward = snap(slides, 'tealSlide', { x: deckEnd + 1, z: -1.1 });
assert.notEqual(front.h, onward.h, 'which side it lands on follows the finger');
assert.equal(onward.h, 0);

// a side taken is not offered again, and nothing is ever laid over another piece
mine = [...mine, { id: 'tealSlide', at: onward }];
assert.ok(!spotsFor(mine, 'tealSlide').some((c) => c.h === onward.h && c.x === onward.x), 'the same spot twice');
const full = [...mine, { id: 'tealSlide', at: snap(spotsFor(mine, 'tealSlide'), 'tealSlide', { x: deckEnd - 0.4, z: 0.6 }) }];
const runs = full.map((q) => strip(q.at, 0, PIECES[q.id].w * FT));
runs.forEach((a, i) => runs.slice(i + 1).forEach((b) => assert.ok(shared(a, b) <= 0.01, 'two pieces overlap')));
for (const id of IDS) for (const c of spotsFor(full, id)) assert.ok(Math.abs(c.z) <= BAND.z1 && c.x >= BUILD.x0, `${id} offered off the playground`);

// at the most pieces, nothing more is offered
assert.deepEqual(offered(Array.from({ length: BUILD.max }, () => full[0])), []);

// it plays: a level with the ground out past the last piece to the gate, pizza hung, and the sim takes it
const level = builtLevel(full), ground = level.floors[0];
assert.ok(ground.x1 >= Math.max(...runs.map((b) => b.x1)) + BUILD.end - 1e-6 && level.slices.length >= 2 && level.rides.length === 2);
const hero = { id: 'me', team: 'heroes', height: 0.86, width: 0.3, reach: 0.3, look: { dough: '#e8c38e', frosting: '#1fd18b', stripe: false }, hands: 'gloves' };
const s = SIM.createMatch([hero], /** @type {any} */ (forSim(level)), { match: MATCH });
for (let i = 0; i < 120; i++) SIM.tick(s, { me: { target: i ? null : { x: 6, z: 0 }, punch: false, kick: false } });
assert.ok(s.fighters[0].x > 4, 'a hero walks on it');
assert.ok(builtLevel([]).floors[0].x1 >= BUILD.least, 'an empty playground is still a walk to the gate');

// saved and read back the same; a save that was tampered with keeps only what can stand
assert.deepEqual(readPlayground(JSON.parse(JSON.stringify({ v: 1, placed: full }))), full);
assert.deepEqual(readPlayground({ placed: [{ id: 'tealSlide', at: { x: 5, z: 0, h: 0 } }, full[0], { id: 'nope', at: full[0].at }, { id: 'grid' }] }), [full[0]]);
assert.deepEqual(readPlayground(null), []);
console.log('builder ok');

// a colour a piece: it is the colour of that piece's parts in the level, and of no other's; it saves, a bad one doesn't
const painted = [{ ...full[0], colour: '#e0245e' }, ...full.slice(1, 3), { ...full[3], colour: '#0056d6' }, full[4]], shown = /** @type {any} */ (builtLevel(painted));
assert.deepEqual(shown.climbs.map((c) => c.colour), ['#e0245e']);
assert.deepEqual(shown.rides.map((q) => q.colour), ['#0056d6', undefined]);
assert.equal(shown.floors[0].colour, undefined, 'the ground is no piece');
assert.deepEqual(readPlayground({ placed: painted }), painted);
assert.equal(readPlayground({ placed: [{ ...full[0], colour: 'red; x' }] })[0].colour, undefined);

// one piece taken away: the swings alone go; the top deck gone, the two slides that came off it go too, the rest stay
assert.deepEqual(without([...full, { id: 'swings', at: { x: 20, z: 0, h: 0 } }], 5), full);
assert.deepEqual(without(full, 2).map((q) => q.id), ['grid', 'stairsUp']);
assert.deepEqual(without(full, 0), [], 'the first piece gone, nothing is left standing');

// REUSE-SPEC.md §Build my playground, monkey bars: a ground piece; from its step a hero walking on swings across under the
// bars to the far step, and one that jumps from the step is up on top
assert.ok(first.includes('monkeyBars'));
const bars = builtLevel([{ id: 'monkeyBars', at: { x: 5, z: 0, h: 0 } }]), [, step, top, far] = bars.floors, across = bars.rides[0];
assert.equal(across.kind, 'monkey');
const swinger = { x: step.x1 - 0.1, y: step.y, z: 0, r: 0.15, onGround: true, walkTo: { x: far.x1, z: 0 }, rest: 0 };
const hold = startRide(bars.rides, /** @type {any} */ (swinger));
assert.ok(hold, 'walking off the step under the bars, a hero takes hold');
let ticks = 0;
while (rideStep(/** @type {any} */ (swinger), hold) && ticks++ < 600);
assert.ok(swinger.x > far.x0 && swinger.x < far.x1 && Math.abs(swinger.y - far.y) < 1e-6 && ticks > 60, `it swings across to the far step, not in a blink (${ticks} ticks)`);
assert.equal(startRide(bars.rides, /** @type {any} */ ({ ...swinger, x: step.x1 - 0.1, y: step.y + 0.6, onGround: false, rest: 0 })), null, 'jumping from the step, it does not take hold');
const jumper = SIM.createMatch([hero], /** @type {any} */ (forSim(bars)), { match: MATCH }).fighters[0];
assert.ok(top.y - step.y <= 1.3, 'the top is a jump up from the step');
assert.ok(jumper && top.rungs && !step.rungs);

// and back again from the far step (playtest 2026-11-15)
const back = { x: far.x0 + 0.1, y: far.y, z: 0, r: 0.15, onGround: true, walkTo: { x: step.x0, z: 0 }, rest: 0 };
const holdBack = startRide(bars.rides, /** @type {any} */ (back));
assert.ok(holdBack && holdBack.p.x1 < holdBack.p.x0, 'from the far step, walking back, a hero takes hold the other way');
while (rideStep(/** @type {any} */ (back), holdBack));
assert.ok(back.x > step.x0 && back.x < step.x1, 'and swings back to the first step');
assert.equal(startRide(bars.rides, /** @type {any} */ ({ ...back, x: far.x0 + 0.1, walkTo: { x: far.x1 + 1, z: 0 }, rest: 0 })), null, 'walking on off the far step, it does not');
