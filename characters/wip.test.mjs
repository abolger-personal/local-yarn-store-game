// Self-check for the WIP / yarn / pattern model. Run: node characters/wip.test.mjs
//
// Covers the rules WIP-AND-FINISHED-OBJ-FORMATION.md, PATTERNS.md and WEARABLE-FINISHED-OBJ.md
// state as arithmetic — the ones where a plausible-looking wrong number would never crash.

import assert from 'node:assert/strict';
import {
  PATTERN_TYPES, YARN_WEIGHTS, yarnUnits, makeYarn, makePattern, makeNotion, labelOf,
  SIZED_NOTIONS, NOTION_NAMES,
} from '../inventory/catalog.js';
import {
  WIP_STATE, WEAR_SLOTS, makeCraftPrefs, makeWip, heldUnits, unitsShort, toolFits, canStart,
  wantsOf, satisfies, wantFor, stow, workRound, wearOrOffer, finishedOf, everythingMade, slotFor,
  returnToNpc, lend, photoSubject, MatchObservedInventory, yarnSuitsPattern, toolSuitsPattern,
  labelWant,
} from './wip.js';

// Deterministic stand-in for Math.random, so a test asserts behaviour and not luck.
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

// --- PATTERNS.md: yarn units per type, and units from footprint --------------
{
  assert.equal(PATTERN_TYPES.sweater.yarnUnits, 20, 'a sweater takes 20 units');
  assert.equal(PATTERN_TYPES.hat.yarnUnits, 5, 'a hat takes 5');
  assert.equal(PATTERN_TYPES.cowl.yarnUnits, 2, 'a cowl takes 2');
  assert.equal(PATTERN_TYPES.shawl.yarnUnits, 10, 'a shawl takes 10');

  // "1x1x1 yarn item = 1 unit yarn. 3x3x3 yarn item = 9 units." Nine, so it is the FOOTPRINT that
  // counts and not the cubed volume — the one place this is easy to get wrong by a factor of three.
  assert.equal(yarnUnits({ name: 'yarn', w: 1, h: 1 }), 1);
  assert.equal(yarnUnits({ name: 'yarn', w: 3, h: 3 }), 9);
  assert.equal(yarnUnits({ name: 'crochet-hook', w: 3, h: 3 }), 0, 'a hook is not yarn');

  // YARN.md: "anywhere from 1x1x1 (thread, lace weight) to 3x3x3 (super bulky)".
  assert.equal(YARN_WEIGHTS.find((w) => w.name === 'lace').size, 1);
  assert.equal(YARN_WEIGHTS.find((w) => w.name === 'super-bulky').size, 3);
  assert.ok(YARN_WEIGHTS.every((w) => w.size >= 1 && w.size <= 3), 'no weight escapes 1..3');
}

// --- catalog: only real notions carry a size ---------------------------------
{
  for (const name of NOTION_NAMES) {
    const it = makeNotion(seq(0.5), name);
    assert.equal(it.size != null, SIZED_NOTIONS.has(name),
      `${name} should ${SIZED_NOTIONS.has(name) ? '' : 'not '}have a millimetre size`);
  }
  const yarn = makeYarn(seq(0.5), 'bulky');
  assert.equal(yarn.w, 3, 'a bulky ball is 3x3');
  assert.equal(labelOf(yarn), `bulky ${yarn.material} yarn`, 'yarn is named by weight and material');
  const pat = makePattern(seq(0.5), 'cowl');
  assert.deepEqual([pat.w, pat.h], [2, 2], 'a pattern is always 2x2');
}

// --- WIP initialisation: the two hard rules ----------------------------------
{
  // "(Intellect + Orderliness)/10 determine how likely the WIP is to be initialized with a pattern"
  // — at 5 and 5 that is 1.0, so it always is.
  const always = makeWip('w', TRAITS({ Intellect: 5, Orderliness: 5 }), PREFS(), seq(0.99));
  assert.ok(always.pattern, 'Intellect 5 + Orderliness 5 always starts pattern-first');
  // "If a WIP is initialized with a pattern, then other slots are zeroed out (NPC must shop)."
  assert.equal(always.tool, null, 'pattern-first means no tool yet');
  assert.deepEqual(always.yarn, [], 'and no yarn — that is the shopping list');
  assert.equal(always.progress, 0);
  assert.equal(always.state, WIP_STATE.UNSTARTED);

  // At 1 and 1 the chance is 0.2, so a roll above it never takes the pattern branch.
  const never = makeWip('w', TRAITS({ Intellect: 1, Orderliness: 1 }), PREFS(), seq(0.9, 0.1, 0.1));
  assert.equal(never.pattern, null, 'Intellect 1 + Orderliness 1 rarely starts with a pattern');
  // "If a WIP is NOT initialized with a pattern: then TOOL NOTIONS must match one of the NPCs
  // skill types" — a crochet-only NPC must never be carrying knitting needles.
  if (never.tool) assert.equal(never.tool.name, 'crochet-hook', 'a crocheter carries a hook');
}

// --- what a WIP still needs ---------------------------------------------------
{
  const pattern = { ...makePattern(seq(0.5), 'hat'), craft: 'crochet', yarnUnits: 5,
                    toolSize: 4.0, weight: 'worsted', materials: ['wool'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 };
  const npc = npcWith([wip]);

  assert.equal(unitsShort(wip), 5, 'a hat with no yarn is five units short');
  assert.deepEqual(wantsOf(npc).map((w) => w.kind).sort(), ['tool', 'yarn'],
    'it wants yarn and a tool, but not another pattern');

  wip.yarn.push({ name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' });   // 4 units
  assert.equal(heldUnits(wip), 4);
  assert.equal(unitsShort(wip), 1, 'still one short');
  // "1 or more YARN units exist" is the threshold for STARTING, not the full requirement — you
  // cast on with what you have.
  wip.tool = { name: 'crochet-hook', size: 4.0 };
  assert.ok(canStart(wip), 'one unit and the right tool is enough to begin');

  wip.yarn.push({ name: 'yarn', w: 1, h: 1, weight: 'worsted', material: 'wool' });
  assert.equal(unitsShort(wip), 0, 'five units is the whole hat');
  assert.deepEqual(wantsOf(npc), [], 'and nothing is wanted any more');
}

// --- the yarn match is on material AND weight --------------------------------
{
  const pattern = { ...makePattern(seq(0.5), 'cowl'), craft: 'crochet', yarnUnits: 2,
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

// --- the tool match is on kind AND millimetres -------------------------------
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

  // A tool already in the slot that is the wrong size still leaves the want open.
  wip.tool = { name: 'knitting-needles', size: 8.0 };
  assert.ok(!toolFits(wip.tool, wip), 'the right needles at the wrong size do not fit');
  assert.ok(wantsOf(npc).some((w) => w.kind === 'tool'), 'so the tool is still wanted');
  wip.tool = { name: 'knitting-needles', size: 3.5 };
  assert.ok(toolFits(wip.tool, wip), 'the right needles at the right size do');
  assert.ok(canStart(wip), 'and the WIP can start');
}

// --- no pattern: a pattern is the ONLY thing wanted --------------------------
{
  // "A WIP that has a YARN but no pattern, then notion tools should not match."
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

  // "any pattern with the same yarn attributes (weight, material) will match"
  const pat = (over) => ({ ...makePattern(seq(0.5), 'cowl'), weight: 'worsted',
                           materials: ['alpaca'], ...over });
  assert.ok(wantFor(npc, pat()), 'a pattern matching the yarn they hold matches');
  assert.ok(!wantFor(npc, pat({ weight: 'lace' })), 'a pattern for a different weight does not');
  assert.ok(!wantFor(npc, pat({ materials: ['cotton'] })), 'nor one for a different material');

  // With NO yarn either, any pattern will do — there is nothing yet to be compatible with.
  const empty = npcWith([{ id: 'w', state: WIP_STATE.UNSTARTED, pattern: null, yarn: [], tool: null, progress: 0 }]);
  assert.ok(wantFor(empty, pat({ weight: 'lace', materials: ['cotton'] })),
    'an empty slot takes any pattern at all');
}

// --- MatchObservedInventory: a whole shelf at once ---------------------------
{
  const pattern = { ...makePattern(seq(0.5), 'cowl'), craft: 'crochet', yarnUnits: 6,
                    toolSize: 4.5, weight: 'worsted', materials: ['wool'] };
  const npc = npcWith([{ id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 }]);

  const shelf = [
    { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' },     // 0 matches
    { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'silk' },     // 1 wrong material
    { name: 'crochet-hook', size: 4.5 },                                   // 2 matches
    { name: 'crochet-hook', size: 2.0 },                                   // 3 wrong size
    { name: 'knitting-needles', size: 4.5 },                               // 4 wrong craft
    { name: 'stitch-markers', size: null },                                // 5 not wanted
    { name: 'pattern', patternType: 'hat', weight: 'worsted', materials: ['wool'] },  // 6 has one
  ];
  const matches = MatchObservedInventory(npc, shelf);
  assert.deepEqual(matches.map((m) => m.index), [0, 2],
    'only the yarn and hook that genuinely fit the pattern are matched');
  assert.deepEqual(matches.map((m) => m.want.kind), ['yarn', 'tool'],
    'and each match carries the want it satisfies, so the buy knows where to file it');
  assert.ok(matches.every((m) => m.want.wip === 'w'), 'including which WIP slot it is for');

  // Nothing wanted, nothing matched — an NPC with a finished project walks past the lot.
  const done = npcWith([{ id: 'w', state: WIP_STATE.FINISHED, pattern, yarn: [], tool: null, progress: 100 }]);
  assert.deepEqual(MatchObservedInventory(done, shelf), []);
}

// --- a finished WIP wants nothing --------------------------------------------
{
  const done = { id: 'w', state: WIP_STATE.FINISHED, pattern: makePattern(seq(0.5), 'hat'),
                 yarn: [], tool: null, progress: 100 };
  assert.deepEqual(wantsOf(npcWith([done])), [], 'a finished object is not a shopping list');
}

// --- buying files the item into the WIP that wanted it -----------------------
{
  const pattern = { ...makePattern(seq(0.5), 'cowl'), craft: 'crochet', yarnUnits: 2,
                    toolSize: 4.5, weight: 'worsted', materials: ['wool'] };
  const wip = { id: 'w', state: WIP_STATE.UNSTARTED, pattern, yarn: [], tool: null, progress: 0 };
  const npc = npcWith([wip]);

  const yarn = { name: 'yarn', w: 2, h: 2, weight: 'worsted', material: 'wool' };
  stow(npc, yarn, wantFor(npc, yarn));
  assert.equal(heldUnits(wip), 4, 'the yarn goes into the WIP that wanted it');
  assert.equal(wip.state, WIP_STATE.UNSTARTED, 'still no tool, so it cannot start');

  const hook = { name: 'crochet-hook', size: 4.5 };
  stow(npc, hook, wantFor(npc, hook));
  assert.equal(wip.state, WIP_STATE.IN_PROGRESS,
    'pattern + yarn + tool moves it from UNSTARTED to IN PROGRESS');

  // An item nothing wanted must be refused outright rather than filed into the nearest slot.
  const before = JSON.stringify(wip);
  assert.equal(stow(npc, { name: 'stitch-markers', size: null }, null), null,
    'a null want files nothing');
  assert.equal(JSON.stringify(wip), before, 'and changes nothing');
}

// --- the progress formula -----------------------------------------------------
{
  // "1/(units called for) * characterWeight", characterWeight = (skill/3) * (Industriousness/3).
  const mk = (skill, ind, units) => {
    const pattern = { ...makePattern(seq(0.5), 'hat'), yarnUnits: units, craft: 'crochet' };
    const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern,
                  yarn: [{ name: 'yarn', w: 3, h: 3 }], tool: { name: 'crochet-hook', size: 4 },
                  progress: 0 };
    return { npc: npcWith([wip], { prefs: PREFS({ skill }), traits: TRAITS({ Industriousness: ind }) }), wip };
  };

  // Weight exactly 1: a 5-unit hat is a 5-round job.
  const a = mk(3, 3, 5);
  let rounds = 0;
  while (!workRound(a.npc, a.wip)) { rounds++; assert.ok(rounds < 50, 'runaway'); }
  assert.equal(rounds + 1, 5, 'skill 3 / Industriousness 3 finishes a 5-unit hat in 5 rounds');

  // A 20-unit sweater at the same speed is a 20-round job — the pattern sets the pace.
  const b = mk(3, 3, 20);
  rounds = 0;
  while (!workRound(b.npc, b.wip)) { rounds++; assert.ok(rounds < 100, 'runaway'); }
  assert.equal(rounds + 1, 20, 'and a 20-unit sweater takes 20');

  // Skill and Industriousness both multiply, so the best crafter is (5/3)^2 = ~2.8x the baseline.
  const c = mk(5, 5, 20);
  rounds = 0;
  while (!workRound(c.npc, c.wip)) { rounds++; assert.ok(rounds < 100, 'runaway'); }
  assert.ok(rounds + 1 <= 8, `skill 5 / Industriousness 5 should be far faster, took ${rounds + 1}`);

  // The slowest crafter must still finish rather than stalling forever.
  const d = mk(1, 1, 20);
  rounds = 0;
  while (!workRound(d.npc, d.wip)) { rounds++; assert.ok(rounds < 1000, 'a slow crafter never finishes'); }
  assert.ok(rounds > 100, 'skill 1 / Industriousness 1 on a sweater is genuinely a slog');
}

// --- finishing raises crafter skill, capped at five --------------------------
{
  const mk = (skill) => {
    const pattern = { ...makePattern(seq(0.5), 'cowl'), yarnUnits: 2, craft: 'crochet' };
    const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern, yarn: [], tool: null, progress: 99 };
    return { npc: npcWith([wip], { prefs: PREFS({ skill }) }), wip };
  };
  const up = mk(2);
  assert.ok(workRound(up.npc, up.wip), 'it finishes');
  assert.equal(up.npc.prefs.skill, 3, '"a permanent +1 to the NPCs crafter skill level"');
  assert.equal(up.wip.progress, 100, 'progress is clamped rather than overshooting');

  const capped = mk(5);
  workRound(capped.npc, capped.wip);
  assert.equal(capped.npc.prefs.skill, 5, '"up to a max of 5"');

  // Work on something not yet started must do nothing at all.
  const idle = mk(3);
  idle.wip.state = WIP_STATE.UNSTARTED;
  idle.wip.progress = 0;
  assert.equal(workRound(idle.npc, idle.wip), false);
  assert.equal(idle.wip.progress, 0, 'an unstarted WIP makes no progress');
}

// --- WEARABLE-FINISHED-OBJ.md: wear first, lend the overflow -----------------
{
  const fo = (id, type) => ({ id, state: WIP_STATE.FINISHED, progress: 100,
                              pattern: { ...makePattern(seq(0.5), type), patternType: type },
                              yarn: [], tool: null });
  assert.equal(slotFor(fo('a', 'hat')), 'head');
  assert.equal(slotFor(fo('a', 'sweater')), 'torso');
  assert.equal(slotFor(fo('a', 'cowl')), 'neck');
  assert.equal(slotFor(fo('a', 'shawl')), 'torso', 'a shawl shares the torso slot with a sweater');

  // One unfinished project alongside three finished ones, to prove only the finished leave.
  const wip = { id: 'live', state: WIP_STATE.IN_PROGRESS, progress: 40, yarn: [], tool: null,
                pattern: makePattern(seq(0.5), 'hat') };
  const npc = npcWith([fo('hat1', 'hat'), wip, fo('hat2', 'hat'), fo('cowl1', 'cowl')]);
  const offered = wearOrOffer(npc);

  assert.equal(npc.worn.head.id, 'hat1', 'the first hat is worn');
  assert.equal(npc.worn.neck.id, 'cowl1', 'and the cowl, which uses a different slot');
  assert.deepEqual(offered.map((w) => w.id), ['hat2'],
    'only the second hat is offered — a full slot is what makes an object spare');

  // A WORN object leaves the slots now — "store FO in a worn slot" is a move.
  assert.ok(!npc.wips.includes(npc.worn.head), 'the worn hat is out of its slot');
  assert.ok(!npc.wips.includes(npc.worn.neck), 'and so is the cowl');

  // One to be LENT does NOT leave yet: the spec puts that at the Drop Off, which is two steps
  // after the Guestbook. They sign holding what they made, then hand it over.
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
  // A finished object that is NOT wearable still leaves the slots — it just has nowhere to go but
  // the shop. Nothing in PATTERNS.md's MVP list is unwearable, so this guards a future type.
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

// --- the Guestbook photo is of the MOST RECENTLY finished object ------------
{
  const fo = (id, type, round) => ({ id, state: WIP_STATE.FINISHED, progress: 100, yarn: [],
                                     tool: null, finishedRound: round,
                                     pattern: { ...makePattern(seq(0.5), type), patternType: type } });

  // Two hats: the first is worn, the second has nowhere to go and is bound for the shop. The photo
  // must be of the SECOND — "even if they are not currently wearing it".
  const npc = npcWith([fo('early hat', 'hat', 3), fo('late hat', 'hat', 9)]);
  wearOrOffer(npc);
  assert.equal(npc.worn.head.id, 'early hat', 'the first one finished is the one being worn');
  assert.equal(photoSubject(npc).id, 'late hat',
    'but the photo is of the newest thing they made, not of what they happen to have on');

  // Different slots, so both are worn: still the newest.
  const two = npcWith([fo('hat', 'hat', 2), fo('cowl', 'cowl', 7)]);
  wearOrOffer(two);
  assert.equal(photoSubject(two).id, 'cowl', 'newest wins among worn objects too');

  // Order in the slots must not decide it — the stamp must.
  const shuffled = npcWith([fo('newest', 'hat', 12), fo('oldest', 'cowl', 1)]);
  wearOrOffer(shuffled);
  assert.equal(photoSubject(shuffled).id, 'newest', 'slot order does not decide the photo');

  // Something brought from home has no stamp and loses to anything made during the visit.
  const home = npcWith([fo('from home', 'cowl', undefined), fo('made today', 'hat', 4)]);
  wearOrOffer(home);
  assert.equal(photoSubject(home).id, 'made today', 'an unstamped object sorts oldest');

  // ...but is still the subject when it is all they have.
  const onlyHome = npcWith([fo('from home', 'cowl', undefined)]);
  wearOrOffer(onlyHome);
  assert.equal(photoSubject(onlyHome).id, 'from home', 'and is photographed when nothing beats it');

  assert.equal(photoSubject(npcWith([])), null, 'nothing made means no photo subject');

  // Once it is in the book it is not photographed again: a regular back in yesterday's hat.
  const regular = npcWith([fo('hat', 'hat', 9)]);
  wearOrOffer(regular);
  regular.worn.head.photographed = true;
  assert.equal(photoSubject(regular), null, 'something already photographed is not news');
  regular.wips.push(fo('cowl', 'cowl', 2));
  assert.equal(photoSubject(regular).id, 'cowl', 'even an older stamp beats a photographed object');
}

// --- workRound stamps the round it finished on ------------------------------
{
  const pattern = { ...makePattern(seq(0.5), 'cowl'), yarnUnits: 2, craft: 'crochet' };
  const wip = { id: 'w', state: WIP_STATE.IN_PROGRESS, pattern, yarn: [], tool: null, progress: 99 };
  const npc = npcWith([wip]);
  assert.ok(workRound(npc, wip, 17), 'it finishes');
  assert.equal(wip.finishedRound, 17, 'and records which round it finished on');
}

// --- handing a borrowed object back ------------------------------------------
{
  const fo = (id) => ({ id, state: WIP_STATE.FINISHED, progress: 100, yarn: [], tool: null,
                        pattern: { ...makePattern(seq(0.5), 'hat'), patternType: 'hat' } });
  const old = fo('old'), lent = fo('lent');
  const npc = npcWith([old, lent], { worn: { head: old, torso: null, hands: null, neck: null } });
  const world = { dropOff: [{ npc: 'Test', npcId: 'n1', wip: lent }], backPile: [] };

  assert.ok(returnToNpc(world, npc, lent), 'the shop can hand it back');
  assert.equal(npc.worn.head, lent, 'it goes into the worn slot');
  assert.equal(world.dropOff.length, 0, 'and comes off the Drop Off display');
  assert.deepEqual(world.backPile.map((b) => b.wip.id), ['old'],
    '"place any previously offscreen item the NPC was wearing in a pile"');

  // Handing back something the shop does not have must fail rather than inventing it.
  assert.equal(returnToNpc(world, npc, fo('never')), false);
}

// --- craft preferences are independent of personality ------------------------
{
  // "personal craft preferences completely unrelated to personality". The strongest check available
  // without reaching into the implementation: identical traits must still yield varied preferences.
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

// --- every want can be NAMED -------------------------------------------------------------------
// The guestbook read "Horace came in looking for undefined": npc.target became a want when WIPs
// replaced hardcoded targets, and a want has no `name` for labelOf to read. Generated from real
// wantsOf output rather than hand-built literals, so a new want kind is covered the day it appears.
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
  assert.deepEqual([...kinds].sort(), ['pattern', 'tool', 'yarn'], 'all three want kinds exercised');

  // The empty case is a sentence too — an NPC with nothing outstanding still has to read.
  assert.ok(!/undefined/.test(labelWant(null)), 'no want at all still renders');

  // And the specifics survive: a want names WHAT, not just its kind. This is what the debug panel
  // and the guestbook line both lost when they each grew their own half-version of this.
  const yarnWant = { kind: 'yarn', wip: 'WIP 1', units: 5, materials: ['wool', 'alpaca'], weight: 'aran' };
  const line = labelWant(yarnWant);
  for (const bit of ['5 units', 'aran', 'wool', 'alpaca']) assert.ok(line.includes(bit), `"${line}" names ${bit}`);
  assert.ok(labelWant({ ...yarnWant, units: 1 }).includes('1 unit of'), 'singular unit reads correctly');
  assert.ok(labelWant({ kind: 'tool', tool: 'crochet-hook', size: 4 }).includes('4.0'), 'a tool want names its size');
}

console.log('wip.js self-check: all assertions passed');
