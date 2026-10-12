import assert from 'node:assert/strict';
import { mulberry32 } from './store/core/util.js';
import {
  PATTERN_TYPES, YARN_WEIGHTS, yarnUnits, makeYarn, makePattern, makeNotion, labelOf,
  SIZED_NOTIONS, NOTION_NAMES, PATTERN_TITLES, PATTERN_DESIGNS, SHOP_RANGE, makeStockPattern,
  stockPatternFor, CRAFTS, CRAFT_TERMS,
} from '../inventory/catalog.js';
import {
  WIP_STATE, WEAR_SLOTS, makeCraftPrefs, makeWip, heldUnits, unitsShort, toolFits, canStart,
  wantsOf, satisfies, wantFor, stow, workRound, wearOrOffer, finishedOf, everythingMade, slotFor,
  returnToNpc, lend, photoSubject, MatchObservedInventory, yarnSuitsPattern, toolSuitsPattern,
  labelWant, runningOut, readyWips,
} from './wip.js';

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const TRAITS = (over = {}) => ({
  Volatility: 3, Withdrawal: 3, Enthusiasm: 3, Assertiveness: 3, Intellect: 3,
  Openness: 3, Compassion: 3, Politeness: 3, Industriousness: 3, Orderliness: 3, ...over,
});
const PREFS = (over = {}) => ({
  skill: 3, crafts: ['crochet'], materials: ['wool'], weights: ['worsted'], ...over,
});
const npcWith = (wips, over = {}) => ({
  name: 'Test', id: 'n1', traits: TRAITS(), prefs: PREFS(),
  worn: Object.fromEntries(WEAR_SLOTS.map((s) => [s, null])), wips, ...over,
});

{
  const cost = Object.fromEntries(Object.entries(PATTERN_TYPES).map(([t, p]) => [t, p.yarnUnits]));
  assert.deepEqual(cost, { sweater: 8, shawl: 5, scarf: 4, bag: 4, hat: 3, socks: 2, potholder: 1 });
  assert.ok(Object.values(cost).every((n) => n >= 1 && n <= 8), '"never more than 8"');

  assert.equal(yarnUnits({ name: 'yarn', w: 1, h: 1 }), 1);
  assert.equal(yarnUnits({ name: 'yarn', w: 3, h: 3 }), 1, 'a bulky ball is still one item');
  assert.equal(yarnUnits({ name: 'crochet-hook', w: 3, h: 3 }), 0, 'a hook is not yarn');

  assert.equal(YARN_WEIGHTS.find((w) => w.name === 'lace').size, 1);
  assert.equal(YARN_WEIGHTS.find((w) => w.name === 'super-bulky').size, 3);
  assert.ok(YARN_WEIGHTS.every((w) => w.size >= 1 && w.size <= 3), 'no weight escapes 1..3');
}

{
  for (const name of NOTION_NAMES) {
    const it = makeNotion(seq(0.5), name);
    assert.equal(it.size != null, SIZED_NOTIONS.has(name),
      `${name} should ${SIZED_NOTIONS.has(name) ? '' : 'not '}have a millimetre size`);
  }
  const yarn = makeYarn(seq(0.5), 'bulky');
  assert.equal(yarn.w, 3, 'a bulky ball is 3x3');
  assert.equal(labelOf(yarn), `bulky ${yarn.material} yarn`, 'yarn is named by weight and material');
  const pat = makePattern(seq(0.5), 'scarf');
  assert.deepEqual([pat.w, pat.h], [2, 2], 'a pattern is always 2x2');
}

{
  const always = makeWip('w', TRAITS({ Intellect: 5, Orderliness: 5 }), PREFS(), seq(0.99));
  assert.ok(always.pattern, 'Intellect 5 + Orderliness 5 always starts pattern-first');
  assert.equal(always.tool, null, 'pattern-first means no tool yet');
  assert.deepEqual(always.yarn, [], 'and no yarn — that is the shopping list');
  assert.equal(always.progress, 0);
  assert.equal(always.state, WIP_STATE.UNSTARTED);

  const never = makeWip('w', TRAITS({ Intellect: 1, Orderliness: 1 }), PREFS(), seq(0.9, 0.1, 0.1));
  assert.equal(never.pattern, null, 'Intellect 1 + Orderliness 1 rarely starts with a pattern');
  if (never.tool) assert.equal(never.tool.name, 'crochet-hook', 'a crocheter carries a hook');
}

{
  const pattern = { ...makePattern(seq(0.5), 'hat'), craft: 'crochet',
                    toolSize: 4.0, weight: 'worsted', materials: ['wool'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 };
  const npc = npcWith([wip]);
  const ball = { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' };

  assert.equal(unitsShort(wip), 3, 'a hat with no yarn is three balls short');
  assert.deepEqual(wantsOf(npc).map((w) => w.kind).sort(), ['tool', 'yarn'],
    'it wants yarn and a tool, but not another pattern');

  wip.yarn.push(ball);
  assert.equal(heldUnits(wip), 1, 'a 2x2 ball is one unit, not four');
  assert.equal(unitsShort(wip), 2, 'still two short');
  wip.tool = { name: 'crochet-hook', size: 4.0 };
  assert.ok(canStart(wip), 'one unit and the right tool is enough to begin');

  wip.yarn.push({ ...ball }, { ...ball });
  assert.equal(unitsShort(wip), 0, 'three balls is the whole hat');
  assert.deepEqual(wantsOf(npc), [], 'and nothing is wanted any more');
}

{
  const pattern = { ...makePattern(seq(0.5), 'scarf'), craft: 'crochet', yarnUnits: 2,
                    toolSize: 5.0, weight: 'worsted', materials: ['wool', 'alpaca'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 };
  const npc = npcWith([wip]);
  const want = wantsOf(npc).find((w) => w.kind === 'yarn');
  const yarn = (over) => ({ name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool', ...over });

  assert.ok(satisfies(yarn(), want), 'right material and right weight matches');
  assert.ok(satisfies(yarn({ material: 'alpaca' }), want), 'either listed material will do');
  assert.ok(!satisfies(yarn({ material: 'silk' }), want), 'a material the pattern does not list does not');
  assert.ok(!satisfies(yarn({ weight: 'lace' }), want), 'nor does the wrong weight');
  assert.ok(!satisfies({ name: 'crochet-hook', size: 5.0 }, want), 'and a hook is not yarn');
  assert.ok(yarnSuitsPattern(yarn(), pattern) && !yarnSuitsPattern(yarn({ weight: 'dk' }), pattern));
}

{
  const pattern = { ...makePattern(seq(0.5), 'hat'), craft: 'knitting', yarnUnits: 5,
                    toolSize: 3.5, weight: 'dk', materials: ['wool'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern,
                yarn: [{ name: 'yarn', w: 3, h: 3, weight: 'dk', material: 'wool' }],
                tool: null, progress: 0 };
  const npc = npcWith([wip], { prefs: PREFS({ crafts: ['knitting', 'crochet'] }) });
  const want = wantsOf(npc).find((w) => w.kind === 'tool');

  assert.equal(want.tool, 'knitting-needles', 'the craft names the kind');
  assert.equal(want.size, 3.5, 'and the pattern names the size');
  assert.ok(satisfies({ name: 'knitting-needles', size: 3.5 }, want));
  assert.ok(!satisfies({ name: 'knitting-needles', size: 4.0 }, want), 'the wrong size does not match');
  assert.ok(!satisfies({ name: 'crochet-hook', size: 3.5 }, want), 'nor the wrong kind at the right size');
  assert.ok(!toolSuitsPattern({ name: 'crochet-hook', size: 3.5 }, pattern), 'a hook cannot knit');

  wip.tool = { name: 'knitting-needles', size: 8.0 };
  assert.ok(!toolFits(wip.tool, wip), 'the right needles at the wrong size do not fit');
  assert.ok(wantsOf(npc).some((w) => w.kind === 'tool'), 'so the tool is still wanted');
  wip.tool = { name: 'knitting-needles', size: 3.5 };
  assert.ok(toolFits(wip.tool, wip), 'the right needles at the right size do');
  assert.ok(canStart(wip), 'and the WIP can start');
}

{
  const yarn = { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'alpaca' };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern: null, yarn: [yarn], tool: null, progress: 0 };
  const npc = npcWith([wip], { prefs: PREFS({ crafts: ['knitting', 'crochet'] }) });

  assert.deepEqual(wantsOf(npc).map((w) => w.kind), ['pattern'],
    'without a pattern there is nothing else to want yet');
  assert.equal(wantFor(npc, { name: 'crochet-hook', size: 4.0 }), null,
    'a tool must not match a WIP that has no pattern');
  assert.equal(wantFor(npc, { name: 'knitting-needles', size: 4.0 }), null);
  assert.equal(wantFor(npc, { name: 'yarn', w: 1, h: 1, weight: 'lace', material: 'silk' }), null,
    'and more yarn is not the answer either');

  const pat = (over) => ({ ...makePattern(seq(0.5), 'scarf'), weight: 'worsted',
                           materials: ['alpaca'], ...over });
  assert.ok(wantFor(npc, pat()), 'a pattern matching the yarn they hold matches');
  assert.ok(!wantFor(npc, pat({ weight: 'lace' })), 'a pattern for a different weight does not');
  assert.ok(!wantFor(npc, pat({ materials: ['cotton'] })), 'nor one for a different material');

  const empty = npcWith([{ id: 'w', state: WIP_STATE.UNSTARTED, pattern: null, yarn: [], tool: null, progress: 0 }]);
  assert.ok(wantFor(empty, pat({ weight: 'lace', materials: ['cotton'] })),
    'an empty slot takes any pattern at all');
}

{
  const pattern = { ...makePattern(seq(0.5), 'scarf'), craft: 'crochet', yarnUnits: 6,
                    toolSize: 4.5, weight: 'worsted', materials: ['wool'] };
  const npc = npcWith([{ id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 }]);

  const shelf = [
    { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' },
    { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'silk' },
    { name: 'crochet-hook', size: 4.5 },
    { name: 'crochet-hook', size: 2.0 },
    { name: 'knitting-needles', size: 4.5 },
    { name: 'stitch-markers', size: null },
    { name: 'pattern', patternType: 'hat', weight: 'worsted', materials: ['wool'] },
  ];
  const matches = MatchObservedInventory(npc, shelf);
  assert.deepEqual(matches.map((m) => m.index), [0, 2],
    'only the yarn and hook that genuinely fit the pattern are matched');
  assert.deepEqual(matches.map((m) => m.want.kind), ['yarn', 'tool'],
    'and each match carries the want it satisfies, so the buy knows where to file it');
  assert.ok(matches.every((m) => m.want.wip === 'w'), 'including which WIP slot it is for');

  const done = npcWith([{ id: 'w', state: WIP_STATE.FINISHED, pattern, yarn: [], tool: null, progress: 100 }]);
  assert.deepEqual(MatchObservedInventory(done, shelf), []);
}

{
  const done = { id: 'w', state: WIP_STATE.FINISHED, pattern: makePattern(seq(0.5), 'hat'),
                 yarn: [], tool: null, progress: 100 };
  assert.deepEqual(wantsOf(npcWith([done])), [], 'a finished object is not a shopping list');
}

{
  const pattern = { ...makePattern(seq(0.5), 'scarf'), craft: 'crochet', yarnUnits: 2,
                    toolSize: 4.5, weight: 'worsted', materials: ['wool'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 };
  const npc = npcWith([wip]);

  const yarn = { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' };
  stow(npc, yarn, wantFor(npc, yarn));
  assert.equal(heldUnits(wip), 1, 'the yarn goes into the WIP that wanted it');
  assert.equal(wip.state, WIP_STATE.UNSTARTED, 'still no tool, so it cannot start');

  const hook = { name: 'crochet-hook', size: 4.5 };
  stow(npc, hook, wantFor(npc, hook));
  assert.equal(wip.state, WIP_STATE.IN_PROGRESS,
    'pattern + yarn + tool moves it from UNSTARTED to IN PROGRESS');

  const before = JSON.stringify(wip);
  assert.equal(stow(npc, { name: 'stitch-markers', size: null }, null), null,
    'a null want files nothing');
  assert.equal(JSON.stringify(wip), before, 'and changes nothing');
}

{
  for (const name of ['cable-needle', 'buttons']) assert.ok(NOTION_NAMES.includes(name), `${name} is stocked`);
  const cabled = PATTERN_DESIGNS.find((d) => d.title === 'Cable Car Llama');
  assert.deepEqual(cabled.notions, ['cable-needle'], 'a cable design calls for a cable needle');
  const cardi = PATTERN_DESIGNS.find((d) => d.silhouette === 'cardigan');
  assert.ok(cardi.notions.includes('buttons'), 'a cardigan calls for buttons');
  assert.ok(PATTERN_DESIGNS.filter((d) => d.notions.length).length < PATTERN_DESIGNS.length / 4,
    'most designs need no extra notion');

  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern: cardi, yarn: [], tool: null, notions: [], progress: 0 };
  const npc = npcWith([wip]);
  const card = { name: 'buttons', size: null };
  const want = wantFor(npc, card);
  assert.equal(want?.kind, 'notion', 'buttons satisfy the cardigan\'s notion want');
  assert.equal(labelWant(want), 'buttons', 'and the want names itself');
  assert.equal(wantFor(npc, { name: 'cable-needle', size: null }), null, 'a cardigan has no use for a cable needle');
  stow(npc, card, want);
  assert.equal(wip.tool, null, 'buttons do not take the tool slot');
  assert.ok(!wantsOf(npc).some((w) => w.kind === 'notion'), 'held buttons are no longer wanted');
}

{
  const mk = (skill, ind, units) => {
    const pattern = { ...makePattern(seq(0.5), 'hat'), yarnUnits: units, craft: 'crochet' };
    const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern,
                  yarn: Array.from({ length: units }, () => ({ name: 'yarn', w: 3, h: 3 })), tool: { name: 'crochet-hook', size: 4 },
                  progress: 0 };
    return { npc: npcWith([wip], { prefs: PREFS({ skill }), traits: TRAITS({ Industriousness: ind }) }), wip };
  };

  const { hat, sweater } = PATTERN_TYPES;

  const a = mk(3, 3, hat.yarnUnits);
  let rounds = 0;
  while (!workRound(a.npc, a.wip)) { rounds++; assert.ok(rounds < 50, 'runaway'); }
  assert.equal(rounds + 1, 3, 'skill 3 / Industriousness 3 finishes a 3-ball hat in 3 rounds');

  const b = mk(3, 3, sweater.yarnUnits);
  rounds = 0;
  while (!workRound(b.npc, b.wip)) { rounds++; assert.ok(rounds < 100, 'runaway'); }
  assert.equal(rounds + 1, 8, 'and an 8-ball sweater takes 8');

  const c = mk(5, 5, sweater.yarnUnits);
  rounds = 0;
  while (!workRound(c.npc, c.wip)) { rounds++; assert.ok(rounds < 100, 'runaway'); }
  assert.ok(rounds + 1 <= 3, `skill 5 / Industriousness 5 should be far faster, took ${rounds + 1}`);

  const d = mk(1, 1, sweater.yarnUnits);
  rounds = 0;
  while (!workRound(d.npc, d.wip)) { rounds++; assert.ok(rounds < 1000, 'a slow crafter never finishes'); }
  assert.ok(rounds > 50, 'skill 1 / Industriousness 1 on a sweater is genuinely a slog');
}

{
  const mk = (skill) => {
    const pattern = { ...makePattern(seq(0.5), 'scarf'), yarnUnits: 2, craft: 'crochet' };
    const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern, yarn: [{ name: 'yarn' }, { name: 'yarn' }], tool: null, progress: 99 };
    return { npc: npcWith([wip], { prefs: PREFS({ skill }) }), wip };
  };
  const up = mk(2);
  assert.ok(workRound(up.npc, up.wip), 'it finishes');
  assert.equal(up.npc.prefs.skill, 3, '"a permanent +1 to the NPCs crafter skill level"');
  assert.equal(up.wip.progress, 100, 'progress is clamped rather than overshooting');

  const capped = mk(5);
  workRound(capped.npc, capped.wip);
  assert.equal(capped.npc.prefs.skill, 5, '"up to a max of 5"');

  const idle = mk(3);
  idle.wip.state = WIP_STATE.UNSTARTED;
  idle.wip.progress = 0;
  assert.equal(workRound(idle.npc, idle.wip), false);
  assert.equal(idle.wip.progress, 0, 'an unstarted WIP makes no progress');
}

{
  const fo = (id, type) => ({ id, state: WIP_STATE.FINISHED, progress: 100,
                              pattern: { ...makePattern(seq(0.5), type), patternType: type },
                              yarn: [], tool: null });
  assert.equal(slotFor(fo('a', 'hat')), 'head');
  assert.equal(slotFor(fo('a', 'sweater')), 'torso');
  assert.equal(slotFor(fo('a', 'scarf')), 'neck', 'a cowl is a scarf, so the neck');
  assert.equal(slotFor(fo('a', 'shawl')), 'shoulders', 'a shawl has its own layer, over a sweater');
  assert.equal(slotFor(fo('a', 'bag')), 'bag');
  assert.equal(slotFor(fo('a', 'socks')), 'feet');
  assert.equal(slotFor({ pattern: { patternType: 'mittens' } }), null, 'mittens are decor: nobody wears them');
  assert.equal(slotFor(fo('a', 'potholder')), null, 'a pot holder is decor: always lent');

  const wip = { id: 'live', state: WIP_STATE.IN_PROGRESS, progress: 40, yarn: [], tool: null,
                pattern: makePattern(seq(0.5), 'hat') };
  const npc = npcWith([fo('hat1', 'hat'), wip, fo('hat2', 'hat'), fo('cowl1', 'scarf')]);
  const offered = wearOrOffer(npc);

  assert.equal(npc.worn.head.id, 'hat1', 'the first hat is worn');
  assert.equal(npc.worn.neck.id, 'cowl1', 'and the cowl, which uses a different slot');
  assert.deepEqual(offered.map((w) => w.id), ['hat2'],
    'only the second hat is offered — a full slot is what makes an object spare');

  assert.ok(!npc.wips.includes(npc.worn.head), 'the worn hat is out of its slot');
  assert.ok(!npc.wips.includes(npc.worn.neck), 'and so is the cowl');

  assert.deepEqual(npc.wips.map((w) => w.id), ['live', 'hat2'],
    'the spare hat waits in its slot until the Drop Off; the live project stays put');
  assert.equal(everythingMade(npc).length, 3,
    'all three are findable for the Guestbook photo, taken before any of them is lent');

  lend(npc, offered[0]);
  assert.deepEqual(npc.wips.map((w) => w.id), ['live'],
    '"the item should LEAVE the NPC\'s WIPs slots at this point"');
  assert.equal(finishedOf(npc).length, 0, 'and nothing finished still occupies a slot');
}

{
  const odd = { id: 'blanket', state: WIP_STATE.FINISHED, progress: 100, yarn: [], tool: null,
                pattern: { ...makePattern(seq(0.5), 'hat'), patternType: 'blanket' } };
  const npc = npcWith([odd]);
  assert.equal(slotFor(odd), null, 'a blanket fits no clothing slot');
  const offered = wearOrOffer(npc);
  assert.deepEqual(offered.map((w) => w.id), ['blanket'], 'so it is offered to the shop');
  assert.deepEqual(npc.wips.map((w) => w.id), ['blanket'], 'and waits in its slot until the Drop Off');
  lend(npc, offered[0]);
  assert.deepEqual(npc.wips, [], 'where it leaves the slot like any other lend');
}

{
  const fo = (id, type, round) => ({ id, state: WIP_STATE.FINISHED, progress: 100, yarn: [],
                                     tool: null, finishedRound: round,
                                     pattern: { ...makePattern(seq(0.5), type), patternType: type } });

  const npc = npcWith([fo('early hat', 'hat', 3), fo('late hat', 'hat', 9)]);
  wearOrOffer(npc);
  assert.equal(npc.worn.head.id, 'early hat', 'the first one finished is the one being worn');
  assert.equal(photoSubject(npc).id, 'late hat',
    'but the photo is of the newest thing they made, not of what they happen to have on');

  const two = npcWith([fo('hat', 'hat', 2), fo('cowl', 'scarf', 7)]);
  wearOrOffer(two);
  assert.equal(photoSubject(two).id, 'cowl', 'newest wins among worn objects too');

  const shuffled = npcWith([fo('newest', 'hat', 12), fo('oldest', 'scarf', 1)]);
  wearOrOffer(shuffled);
  assert.equal(photoSubject(shuffled).id, 'newest', 'slot order does not decide the photo');

  const home = npcWith([fo('from home', 'scarf', undefined), fo('made today', 'hat', 4)]);
  wearOrOffer(home);
  assert.equal(photoSubject(home).id, 'made today', 'an unstamped object sorts oldest');

  const onlyHome = npcWith([fo('from home', 'scarf', undefined)]);
  wearOrOffer(onlyHome);
  assert.equal(photoSubject(onlyHome).id, 'from home', 'and is photographed when nothing beats it');

  assert.equal(photoSubject(npcWith([])), null, 'nothing made means no photo subject');

  const regular = npcWith([fo('hat', 'hat', 9)]);
  wearOrOffer(regular);
  regular.worn.head.photographed = true;
  assert.equal(photoSubject(regular), null, 'something already photographed is not news');
  regular.wips.push(fo('cowl', 'scarf', 2));
  assert.equal(photoSubject(regular).id, 'cowl', 'even an older stamp beats a photographed object');
}

{
  const pattern = { ...makePattern(seq(0.5), 'scarf'), yarnUnits: 2, craft: 'crochet' };
  const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern, yarn: [{ name: 'yarn' }, { name: 'yarn' }], tool: null, progress: 99 };
  const npc = npcWith([wip]);
  assert.ok(workRound(npc, wip, 17), 'it finishes');
  assert.equal(wip.finishedRound, 17, 'and records which round it finished on');
}

{
  const fo = (id) => ({ id, state: WIP_STATE.FINISHED, progress: 100, yarn: [], tool: null,
                        pattern: { ...makePattern(seq(0.5), 'hat'), patternType: 'hat' } });
  const old = fo('old'), lent = fo('lent');
  const npc = npcWith([old, lent]);
  npc.worn.head = old;
  const world = { dropOff: [{ npc: 'Test', npcId: 'n1', wip: lent }], backPile: [] };

  assert.ok(returnToNpc(world, npc, lent), 'the shop can hand it back');
  assert.equal(npc.worn.head, lent, 'it goes into the worn slot');
  assert.equal(world.dropOff.length, 0, 'and comes off the Drop Off display');
  assert.deepEqual(world.backPile.map((b) => b.wip.id), ['old'],
    '"place any previously offscreen item the NPC was wearing in a pile"');

  assert.equal(returnToNpc(world, npc, fo('never')), false);
}

{
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = makeCraftPrefs();
    assert.ok(p.skill >= 1 && p.skill <= 5, 'skill stays 1..5');
    assert.ok(p.crafts.length >= 1 && p.crafts.length <= 2);
    assert.ok(p.materials.length >= 2 && p.materials.length <= 6, '"between 2 and 6" materials');
    assert.ok(p.weights.length >= 2 && p.weights.length <= 6, '"between 2 and 6" weights');
    assert.equal(new Set(p.materials).size, p.materials.length, 'no duplicate materials');
    assert.equal(new Set(p.weights).size, p.weights.length, 'no duplicate weights');
    seen.add(`${p.skill}|${p.crafts.join()}`);
  }
  assert.ok(seen.size > 5, 'preferences must actually vary across a cast');
}

{
  const kinds = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const rng = seq(...Array.from({ length: 24 }, (_, i) => ((seed * 7 + i * 13) % 97) / 97));
    const prefs = makeCraftPrefs(rng);
    const npc = { wips: [makeWip('WIP 1', TRAITS(), prefs, rng), makeWip('WIP 2', TRAITS(), prefs, rng)] };
    for (const want of wantsOf(npc)) {
      const line = labelWant(want);
      kinds.add(want.kind);
      assert.ok(typeof line === 'string' && line.length > 0, 'a want always names itself');
      assert.ok(!/undefined|null|NaN|\[object/.test(line), `want (${want.kind}) rendered "${line}"`);
    }
  }
  assert.deepEqual([...kinds].sort(), ['notion', 'pattern', 'tool', 'yarn'], 'all four want kinds exercised');

  assert.ok(!/undefined/.test(labelWant(null)), 'no want at all still renders');

  const yarnWant = { kind: 'yarn', wip: 'WIP 1', units: 5, materials: ['wool', 'alpaca'], weight: 'aran' };
  const line = labelWant(yarnWant);
  for (const bit of ['5 units', 'aran', 'wool', 'alpaca']) assert.ok(line.includes(bit), `"${line}" names ${bit}`);
  assert.ok(labelWant({ ...yarnWant, units: 1 }).includes('1 unit of'), 'singular unit reads correctly');
  assert.ok(labelWant({ kind: 'tool', tool: 'crochet-hook', size: 4 }).includes('4.0'), 'a tool want names its size');
}

{
  assert.deepEqual(Object.keys(PATTERN_TITLES).sort(), Object.keys(PATTERN_TYPES).sort(), 'names for every type');
  for (const [type, looks] of Object.entries(PATTERN_TITLES)) {
    for (const [silhouette, titles] of Object.entries(looks)) {
      assert.ok(titles.length >= 6, `${type} / ${silhouette} has at least 6 names, has ${titles.length}`);
      for (const title of titles) {
        const d = PATTERN_DESIGNS.find((p) => p.title === title);
        assert.ok(d.patternType === type && d.silhouette === silhouette, `"${title}" makes a ${silhouette} ${type}`);
      }
    }
  }
  const titles = PATTERN_DESIGNS.map((d) => d.title);
  assert.equal(new Set(titles).size, titles.length, 'no title is used by two designs');
  for (const craft of CRAFTS) {
    const puns = PATTERN_DESIGNS.filter((d) => CRAFT_TERMS[craft].test(d.title));
    assert.ok(puns.length > 0, `some title puns on ${craft}`);
    for (const d of puns) assert.equal(d.craft, craft, `"${d.title}" puns on ${craft}, so it is ${craft}`);
  }
  for (let i = 0; i < 200; i++) {
    const p = makeStockPattern();
    const named = PATTERN_DESIGNS.find((d) => d.title === p.title);
    assert.ok(named, 'stock patterns come from the named set');
    assert.deepEqual(p, named, `"${p.title}" always means the same spec`);
  }
  const rng = mulberry32(7);
  for (const [type, looks] of Object.entries(PATTERN_TITLES)) {
    const kinds = Object.keys(looks), draws = 300 * kinds.length, seen = {};
    for (let i = 0; i < draws; i++) {
      const { silhouette } = makeStockPattern(rng, type);
      seen[silhouette] = (seen[silhouette] ?? 0) + 1;
    }
    for (const k of kinds) {
      assert.ok(Math.abs(seen[k] / 300 - 1) < 0.25, `${type} / ${k}: ${seen[k]} of ${draws}, want about 300`);
    }
  }
  for (const weight of SHOP_RANGE.weights) {
    for (const material of SHOP_RANGE.materials) {
      const p = stockPatternFor({ name: 'yarn', weight, material });
      assert.ok(p.title && yarnSuitsPattern({ weight, material }, p), `${weight} ${material} has a design`);
    }
  }
  assert.ok(labelOf(makeStockPattern(seq(0), 'scarf')).startsWith('the OwlyCowly'), 'labels lead with the name');

  const pattern = makeStockPattern(seq(0), 'scarf');
  const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, progress: 99, tool: null, pattern,
                yarn: Array.from({ length: pattern.yarnUnits }, () => ({ name: 'yarn' })) };
  const npc = npcWith([wip]);
  workRound(npc, wip);
  wearOrOffer(npc);
  assert.equal(npc.worn.neck?.pattern.title, 'the OwlyCowly', 'the finished object keeps its pattern name');
}

{
  const pattern = { yarnUnits: 4 };
  const ball = makeYarn(seq(0));
  const per = yarnUnits(ball);
  const wip = (progress, balls) => ({ pattern, progress, yarn: Array.from({ length: balls }, () => ball) });
  assert.equal(runningOut(wip(0, 1)), false, 'just cast on, yarn in hand');
  assert.equal(runningOut(wip(100 * per / 4, 1)), true, 'knitted up to the end of the ball');
  assert.equal(runningOut(wip(99, Math.ceil(4 / per))), false, 'all the yarn the pattern wants: never short');
  assert.equal(runningOut({ pattern: null, progress: 50, yarn: [] }), false, 'no pattern, nothing to run out of');

  const knitter = npcWith([]);
  const short = { ...wip(0, 1), state: WIP_STATE.IN_PROGRESS };
  for (let r = 0; r < 50; r++) workRound(knitter, short);
  assert.equal(short.state, WIP_STATE.IN_PROGRESS, 'out of yarn, they cannot finish');
  assert.ok(Math.abs(short.progress - (100 * per) / 4) < 1e-9, `progress stops where the yarn runs out (${short.progress})`);
}

{
  const pattern = { yarnUnits: 1, materials: ['wool'], weight: 'dk', craft: 'knitting', toolSize: 4 };
  const done = { id: 'a', state: WIP_STATE.UNSTARTED, pattern, progress: 0,
    yarn: [{ name: 'yarn', material: 'wool', weight: 'dk' }], tool: { name: 'knitting-needles', size: 4 }, notions: [] };
  const short = { ...done, id: 'b', yarn: [] };
  const npc = { wips: [done, short] };
  assert.ok(wantsOf(npc).length > 0, 'the other project still wants yarn');
  assert.deepEqual(readyWips(npc), ['a'], 'yet the first one is ready');
  assert.deepEqual(readyWips({ wips: [{ ...short, pattern: null }] }), [], 'no pattern, not ready');
}

console.log('wip.js self-check: all assertions passed');
