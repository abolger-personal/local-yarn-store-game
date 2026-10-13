// Run: node inventory/supply.test.mjs
import assert from 'node:assert/strict';
import { mulberry32 } from '../characters/store/core/util.js';
import { makeDisplay, footprint, place, topAt } from './grid.js';
import { MIN_DELIVERY, SCRIPT, buildOrder, carryOver, choicesFor, describeSlot, resolveOrder, slipLine, supplyFor, tutorialDay1 } from './supply.js';
import { WIP_STATE, stow, toolSuitsPattern, wantFor, wantsOf, yarnSuitsPattern } from '../characters/wip.js';

const isGoods = (it) => it.name === 'yarn' || it.name === 'pattern';

for (let seed = 1; seed <= 50; seed++) {
  const pile = resolveOrder(buildOrder(1), mulberry32(seed));
  assert.ok(pile.length >= 24 && pile.length <= 33, `day 1 is 24-33 items, got ${pile.length}`);
  const solvable = pile.some((pat) => pat.name === 'pattern' && pile.filter((it) => it.name === 'yarn' &&
    it.weight === pat.weight && pat.materials.includes(it.material)).length >= pat.yarnUnits);
  assert.ok(solvable, 'the starting pile holds a pattern AND every ball it needs');
}

for (let day = 1; day <= 3; day++) {
  for (let seed = 1; seed <= 20; seed++) {
    const order = buildOrder(day).filter((s) => s.template.kind !== 'kit');
    assert.ok(resolveOrder(order, mulberry32(seed)).every(isGoods), `day ${day} has no notions outside its kit`);
  }
}

const kitDays = SCRIPT.flatMap((row, i) => (row.some((t) => t.kind === 'kit') ? [i + 1] : []));
for (const day of kitDays) {
  for (let seed = 1; seed <= 200; seed++) {
    const kit = resolveOrder(buildOrder(day).filter((s) => s.template.kind === 'kit'), mulberry32(seed));
    const pattern = kit[0];
    assert.ok(kit.some((it) => toolSuitsPattern(it, pattern)), `day ${day} seed ${seed}: the kit's tool fits`);
    for (const name of pattern.notions) assert.ok(kit.some((it) => it.name === name), `day ${day} seed ${seed}: ${name}`);
    const npc = { wips: [{ id: 0, state: WIP_STATE.UNSTARTED, pattern: null, yarn: [], tool: null, notions: [], progress: 0 }] };
    for (const it of kit) assert.ok(stow(npc, it, wantFor(npc, it)), `day ${day} seed ${seed}: ${it.name} is wanted`);
    assert.deepEqual(wantsOf(npc), [], `day ${day} seed ${seed}: the kit alone completes "${pattern.title}"`);
    assert.equal(npc.wips[0].state, WIP_STATE.IN_PROGRESS);
  }
}
assert.ok(resolveOrder(buildOrder(4), mulberry32(1)).some((it) => !isGoods(it)), 'notions arrive on day 4');
assert.ok(buildOrder(5).every((s) => s.source === 'script'), 'days 1-10 are scripted');

assert.deepEqual(buildOrder(5)[0].template.weights, ['bulky'], 'day 5 introduces bulky');
assert.ok(!buildOrder(4).some((s) => s.template.weights?.includes('bulky')), 'and nothing has it before');

SCRIPT.forEach((row, i) => {
  const day = i + 1;
  const want = day <= 2 ? 0 : day === 3 ? 1 : day === 4 ? 2 : row.length;
  assert.equal(buildOrder(day).filter((s) => s.playerChoosable).length, want, `day ${day} choosable slots`);
});
const mine = { kind: 'notion', count: 3 };
const withForm = buildOrder(7, { chosen: [mine] });
assert.equal(withForm.filter((s) => s.source === 'player').length, 1, 'a chosen template takes one slot');
assert.equal(withForm.find((s) => s.source === 'player').template, mine, 'and is used as given');

let last = Infinity;
for (let occ = 0; occ <= 1.2; occ += 0.05) {
  const n = supplyFor(occ);
  assert.ok(n >= MIN_DELIVERY && n <= last, `supply at ${occ.toFixed(2)} is ${n}`);
  last = n;
}
assert.ok(supplyFor(0) > supplyFor(0.8), 'a fuller shop gets a smaller delivery');
for (let seed = 1; seed <= 20; seed++) {
  for (const occupancy of [0, 0.5, 1]) {
    const order = buildOrder(11 + seed, { occupancy, rng: mulberry32(seed) });
    assert.ok(order.every((s) => s.source === 'supplier'), 'day 11+ is the supplier');
    assert.equal(resolveOrder(order, mulberry32(seed)).length, supplyFor(occupancy), 'delivers what the throttle says');
  }
}

{
  const floor = { id: 'floor0', g: makeDisplay(4, 4, { headroom: 24 }) };
  const items = [];
  const put = (it, c, r) => {
    const keys = footprint(floor.g, 0, [c, r], [1, 1]);
    items.push({ ...it, display: floor.id, shelf: 0, c, r, keys, layers: 1,
      layer: place(floor.g, keys, items.length, 1), gone: false });
  };
  for (let i = 0; i < 6; i++) put({ name: 'yarn', i }, i % 2, 0);
  items[1].gone = true;
  items[4].gone = true;
  assert.equal(carryOver(items, [floor]), 2, 'two bought items dropped');
  assert.equal(items.length, 4, 'six minus two purchases');
  assert.deepEqual(items.map((it) => it.layer), [0, 1, 0, 1], 'what sat on a bought item drops; the rest keep their layer');
  assert.equal(items[topAt(floor.g, 0, 0, 0)].i, 2, 'the grid points at the re-indexed survivors');
  const delivery = resolveOrder(buildOrder(2), mulberry32(3));
  delivery.forEach((it, k) => put(it, 2 + (k % 2), 1 + (k % 3)));
  assert.equal(items.length, 4 + delivery.length, 'carried stock plus the delivery');
}

assert.deepEqual(buildOrder(3).map(describeSlot), [
  { count: 5, item: 'units of yarn', detail: 'worsted or dk', yours: true },
  { count: 2, item: 'patterns', detail: 'for worsted or dk', yours: false },
  { count: 1, item: 'kit', detail: 'a pattern with its yarn, tool and notions, worsted or dk, one colour family', yours: false },
]);
assert.deepEqual(describeSlot(buildOrder(5)[0]),
  { count: 5, item: 'units of yarn', detail: 'bulky, one colour family', yours: true }, "day 5's new weight, alone");
assert.equal(describeSlot(buildOrder(1)[0]).detail, 'a pattern with its yarn, tool and notions, worsted or dk, one colour family');
for (let day = 1; day <= 30; day++)
  for (const slot of buildOrder(day, { occupancy: 0.4, rng: mulberry32(day) }))
    assert.equal(describeSlot(slot).yours, slot.playerChoosable, `day ${day}: a choosable slot is marked`);

const choosable = (order) => order.filter((s) => s.playerChoosable && s.template.kind !== 'kit');
const sum = (order) => order.reduce((t, s) => t + s.template.count, 0);
for (let day = 4; day <= 30; day++) {
  for (let seed = 0; seed <= 10; seed++) {
    const opts = { occupancy: 0.3, seed };
    const lines = choosable(buildOrder(day, { ...opts, rng: mulberry32(day) }));
    const plan = day <= SCRIPT.length ? SCRIPT[day - 1].filter((t) => t.kind !== 'kit') : null;
    assert.deepEqual(lines.map((s) => s.template.count),
      choosable(buildOrder(day, { ...opts, rng: mulberry32(day) })).map((s) => s.template.count), 'split is seeded');
    assert.ok(lines.every((s) => s.template.count >= 1), `day ${day}: every line gets at least one`);
    if (plan && day > 4) assert.equal(sum(lines), plan.reduce((t, x) => t + x.count, 0), `day ${day}: within the plan`);
    if (!plan) assert.equal(sum(lines), supplyFor(0.3), `day ${day}: within the delivery budget`);
  }
}
assert.equal(sum(choosable(buildOrder(4))), 6, "day 4's two lines share the yarn and pattern counts");
assert.ok([1, 2, 3, 4, 5].some((s) => buildOrder(9, { seed: s })[0].template.count !== SCRIPT[8][0].count),
  'counts are split, not the script\'s');
assert.deepEqual(buildOrder(3).map(slipLine).map(({ count, item, detail }) => [count, item, detail]), [
  [5, "supplier's choice", ''], [2, 'patterns', 'for worsted or dk'],
  [1, 'kit', 'a pattern with its yarn, tool and notions, worsted or dk, one colour family'],
], 'a line of the player\'s reads as the supplier\'s choice until picked');
{
  const [line] = buildOrder(3);
  const picked = { ...line, template: choicesFor(line)[0], source: 'player' };
  assert.deepEqual(slipLine(picked), { count: 5, item: 'units of yarn', detail: 'worsted', yours: true }, 'and as the pick after');
}

for (let seed = 1; seed <= 50; seed++) {
  const { table, floor } = tutorialDay1(mulberry32(seed));
  assert.equal(table.patternType, 'potholder');
  assert.equal(table.craft, 'crochet', 'a pot holder is a hook project');
  assert.equal(table.yarnUnits, 1, 'and one ball');
  assert.equal(floor.length, 2, 'the delivery is the hook and the ball, nothing else');
  const [hook, ball] = floor;
  assert.ok(toolSuitsPattern(hook, table), `${hook.name} ${hook.size}mm makes "${table.title}"`);
  assert.ok(yarnSuitsPattern(ball, table), `${ball.weight} ${ball.material} makes "${table.title}"`);
  assert.ok(!resolveOrder(buildOrder(1), mulberry32(seed)).some((it) => it.patternType === 'potholder'),
    'no pot holder in the playground pile');
}

{
  const line = buildOrder(3).find((s) => s.playerChoosable);
  assert.ok(line, 'day 3 has a line of the player\'s');
  for (const template of choicesFor(line)) {
    const got = resolveOrder([{ ...line, template, source: 'player' }], mulberry32(7));
    assert.equal(got.length, line.template.count, `${describeSlot({ template }).item}: ${got.length}`);
    assert.ok(got.every((it) => !it.weight || line.template.weights.includes(it.weight)), 'in the line\'s weights');
  }
}

console.log('supply.test.mjs: all checks passed');
