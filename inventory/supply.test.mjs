// Self-check for the delivery script, the supplier throttle and the overnight carry-over.
// Run: node inventory/supply.test.mjs
import assert from 'node:assert/strict';
import { mulberry32 } from '../characters/store/core/util.js';
import { makeDisplay, footprint, place, topAt } from './grid.js';
import { MIN_DELIVERY, SCRIPT, buildOrder, carryOver, describeSlot, resolveOrder, supplyFor, tutorialDay1 } from './supply.js';
import { toolSuitsPattern, yarnSuitsPattern } from '../characters/wip.js';

const isGoods = (it) => it.name === 'yarn' || it.name === 'pattern';

// --- day 1 is the starting pile, with one formation that works ------------------------------
for (let seed = 1; seed <= 50; seed++) {
  const pile = resolveOrder(buildOrder(1), mulberry32(seed));
  assert.ok(pile.length >= 24 && pile.length <= 30, `day 1 is 24-30 items, got ${pile.length}`);
  const solvable = pile.some((pat) => pat.name === 'pattern' && pile.filter((it) => it.name === 'yarn' &&
    it.weight === pat.weight && pat.materials.includes(it.material)).length >= pat.yarnUnits);
  assert.ok(solvable, 'the starting pile holds a pattern AND every ball it needs');
}

// --- no notions until day 4; script slots carry their source ---------------------------------
for (let day = 1; day <= 3; day++) {
  for (let seed = 1; seed <= 20; seed++) {
    assert.ok(resolveOrder(buildOrder(day), mulberry32(seed)).every(isGoods), `day ${day} has no notions`);
  }
}
assert.ok(resolveOrder(buildOrder(4), mulberry32(1)).some((it) => !isGoods(it)), 'notions arrive on day 4');
assert.ok(buildOrder(5).every((s) => s.source === 'script'), 'days 1-10 are scripted');

// --- a new weight is only the new weight ----------------------------------------------------
assert.deepEqual(buildOrder(5)[0].template.weights, ['bulky'], 'day 5 introduces bulky');
assert.ok(!buildOrder(4).some((s) => s.template.weights?.includes('bulky')), 'and nothing has it before');

// --- the order's lines: the script's for two days, one of yours on night 2, then all yours ----
SCRIPT.forEach((row, i) => {
  const day = i + 1;
  const want = day <= 2 ? 0 : day === 3 ? 1 : row.length;
  assert.equal(buildOrder(day).filter((s) => s.playerChoosable).length, want, `day ${day} choosable slots`);
});
const mine = { kind: 'notion', count: 3 };
const withForm = buildOrder(7, { chosen: [mine] });
assert.equal(withForm.filter((s) => s.source === 'player').length, 1, 'a chosen template takes one slot');
assert.equal(withForm.find((s) => s.source === 'player').template, mine, 'and is used as given');

// --- day 11+: shrinks as the shop fills, never below the minimum ----------------------------
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

// --- carry-over: what was there, minus what was bought, plus the delivery --------------------
{
  const floor = { id: 'floor0', g: makeDisplay(4, 4, { headroom: 24 }) };
  const items = [];
  const put = (it, c, r) => {
    const keys = footprint(floor.g, 0, [c, r], [1, 1]);
    items.push({ ...it, display: floor.id, shelf: 0, c, r, keys, layers: 1,
      layer: place(floor.g, keys, items.length, 1), gone: false });
  };
  for (let i = 0; i < 6; i++) put({ name: 'yarn', i }, i % 2, 0);   // two stacks of three
  items[1].gone = true;                                              // bought: bottom of stack 1
  items[4].gone = true;                                              // bought: top of stack 0
  assert.equal(carryOver(items, [floor]), 2, 'two bought items dropped');
  assert.equal(items.length, 4, 'six minus two purchases');
  assert.deepEqual(items.map((it) => it.layer), [0, 1, 0, 1], 'what sat on a bought item drops; the rest keep their layer');
  assert.equal(items[topAt(floor.g, 0, 0, 0)].i, 2, 'the grid points at the re-indexed survivors');
  const delivery = resolveOrder(buildOrder(2), mulberry32(3));
  delivery.forEach((it, k) => put(it, 2 + (k % 2), 1 + (k % 3)));
  assert.equal(items.length, 4 + delivery.length, 'carried stock plus the delivery');
}

// --- the packing slip: tomorrow's order in words, the player's slots marked ------------------
// The night screen shows the order built at closing and delivers that same object, so the words
// only have to be true to the slots: day 3's order (set on night 2), with its one line that is yours.
assert.deepEqual(buildOrder(3).map(describeSlot), [
  { count: 5, item: 'ball of yarn', detail: 'worsted or dk', yours: true },
  { count: 2, item: 'pattern', detail: 'for worsted or dk', yours: false },
  { count: 1, item: 'kit', detail: 'a pattern and its yarn, worsted or dk, one colour family', yours: false },
]);
assert.deepEqual(describeSlot(buildOrder(5)[0]),
  { count: 5, item: 'ball of yarn', detail: 'bulky, one colour family', yours: true }, "day 5's new weight, alone");
assert.equal(describeSlot(buildOrder(1)[0]).detail, 'a pattern and its yarn, worsted or dk, one colour family');
for (let day = 1; day <= 30; day++)
  for (const slot of buildOrder(day, { occupancy: 0.4, rng: mulberry32(day) }))
    assert.equal(describeSlot(slot).yours, slot.playerChoosable, `day ${day}: a choosable slot is marked`);

// --- tutorial day 1 (game.html): exactly a pot holder pattern, its hook and one ball ------------
// The playground's day 1 is the pile above, and random stock never holds the tutorial's pot holder.
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

console.log('supply.test.mjs: all checks passed');
