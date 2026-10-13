import assert from 'node:assert/strict';
import { register } from 'node:module';

const mod = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const STAGE = mod(`import * as THREE from ${JSON.stringify(import.meta.resolve('three'))};
  export const renderer = { domElement: {}, setAnimationLoop() {}, render() {} };
  export const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1.6, 0.01, 200);
  camera.position.set(0, 6, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  export const controls = { target: new THREE.Vector3(), update() {}, enabled: true };
  export const key = new THREE.DirectionalLight(), rim = new THREE.DirectionalLight(), hemi = new THREE.HemisphereLight();
  export const lamps = [];
  export function applyRenderScale() {} export function applyDaylight() {} export function tickDaylight() {}
  export function installStage() {}`);
const PAINT = mod(`const no = () => {};
  export { no as hideBox, no as boxGeometry, no as paintShadow, no as hideItem, no as refresh, no as refreshFloating, no as refreshAll };`);
register(mod(`export async function resolve(spec, ctx, next) {
  const r = await next(spec, ctx);
  if (r.url.endsWith('/store/scene/stage.js')) return { url: ${JSON.stringify(STAGE)}, shortCircuit: true };
  if (r.url.endsWith('/store/goods/paint.js')) return { url: ${JSON.stringify(PAINT)}, shortCircuit: true };
  return r;
}`));

const el = () => new Proxy(function () {}, {
  get: (t, k) => {
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'then') return undefined;
    if (k === 'style' || k === 'dataset') return {};
    return ['width', 'height', 'clientWidth', 'clientHeight'].includes(k) ? 256 : el();
  },
  apply: () => el(), construct: () => el(), set: () => true,
});
Object.assign(globalThis, { document: el(), window: globalThis, innerWidth: 1280, innerHeight: 800,
  devicePixelRatio: 1, addEventListener() {}, HTMLElement: class {} });

const { S, gameSpeed } = await import('./core/config.js');
const { shop, cast, clocks } = await import('./core/state.js');
await import('../owl.js'); await import('../llama.js'); await import('../lion.js');
const { STATE, ACTION } = await import('../visit.js');
const { topSpeed } = await import('../motion.js');
const { buildRoomShell } = await import('./scene/room.js');
const { installSeating } = await import('./scene/seating.js');
const { installDisplays } = await import('./scene/displays.js');
const { installWorld, restart, doAdvanceRound, lentGroup } = await import('./sim/world.js');
const { tickCast } = await import('./sim/cast.js');
const { cellNameFor } = await import('./goods/stock.js');
buildRoomShell(); installSeating(); installDisplays(); installWorld();
S.blobShadows = false;

/** A new day; without the atlas, restart() throws at sizeInstanceBuffers. */
function open({ k, tutorial }) {
  Object.assign(S, gameSpeed(k), { tutorial });
  try { restart({ keepRegulars: false }); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
  assert.ok(shop.world, 'the day opened');
}

/** boot.js tickClocks, the rounds half. */
function tickRounds(dt, sit) {
  if (!S.autoRounds || !shop.world.npcs.some((n) => n.state !== STATE.GONE)) return;
  clocks.auto += dt;
  if (clocks.auto < S.autoSeconds || cast.some((rec) => rec.moveT < 1)) return;
  for (const n of shop.world.npcs) {
    const free = sit && shop.world.seats.find((s) => s.occupiedBy === null);
    if (free && n.state === STATE.BROWSE && n.seat === null && !n.prescribed && Math.random() < 0.5)
      n.prescribed = { type: ACTION.WALK_TO_SEAT, params: { wip: n.wips[0].id, seatId: free.id } };
  }
  doAdvanceRound();
}

const DT = 1 / 60;

function run(seconds, { sit = false, each = () => {}, at = () => {} } = {}) {
  const last = new Map();
  for (let f = 0; f * DT < seconds; f++) {
    at(f * DT);
    // no atlas: mark the carried package made so syncCarried leaves it alone
    for (const rec of cast) rec.carriedName = rec.npc.carrying ? cellNameFor(rec.npc.carrying) : null;
    tickCast(DT);
    tickRounds(DT, sit);
    for (const rec of cast) {
      const p = rec.built.root.position, was = last.get(rec) ?? { x: p.x, z: p.z };
      last.set(rec, { x: p.x, z: p.z });
      each(rec, f * DT, Math.hypot(p.x - was.x, p.z - was.z));
    }
  }
}
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

{
  open({ k: 1, tutorial: true });
  let set = null;
  run(1, { each: (rec, t) => { if (set === null && rec.speed > 0) set = t; } });
  assert.ok(set !== null && set < 0.1, `the first customer sets off at once, not a round later (${set})`);
}

{
  open({ k: 1, tutorial: true });
  const round = () => shop.world.round;
  let r0 = 0, r1 = 0, after = 0, back = 0;
  run(16, {
    at: (t) => {
      if (t === 120 * DT) { Object.assign(S, gameSpeed(0)); r0 = round(); }   // mid-walk through the door
      if (t === 840 * DT) { r1 = round(); Object.assign(S, gameSpeed(1)); }
    },
    each: (rec, t) => {
      if (t > 3.5 && t < 14) after = Math.max(after, rec.speed);
      if (t > 15) back = Math.max(back, rec.speed);
    },
  });
  assert.ok(after < 0.005, `paused, the walk halts within a step or two (${after.toFixed(4)} units/s after)`);
  assert.ok(back > 0.1, `and resumes on ▶ (${back.toFixed(3)} units/s)`);
  assert.ok(r0 > 0 && r1 === r0, `no rounds while paused (round ${r0} at ⏸, ${r1} at ▶)`);
}

for (const k of [1, 2, 3]) {
  open({ k, tutorial: false });
  let step = 0, skate = 0, gain = 0, walking = 0, turning = new Map(), longTurn = 0;
  run(150, {
    sit: true,
    each: (rec, t, moved) => {
      const P = rec.built.params, top = topSpeed(P.legHeight + P.hipInset, rec.opts);
      step = Math.max(step, moved);
      skate = Math.max(skate, rec.speed / top);
      if (rec.speed > 0.15) { walking++; gain += rec.built.motion.walkGain; }
      // 0.35 rad / 0.5 s: TURN_RATE turns half way round in ~0.4 s
      const n = rec.npc, d = n.action?.type === ACTION.INTERACT && shop.world.displays.find((q) => q.id === n.action.params.displayId);
      const off = d && angleOff(rec.built.root.rotation.y, Math.atan2(d.x - rec.built.root.position.x, d.z - rec.built.root.position.z)) > 0.35;
      if (off) turning.set(rec, turning.get(rec) ?? t);
      else turning.delete(rec);
      if (off) longTurn = Math.max(longTurn, t - turning.get(rec));
    },
  });
  // 0.06 a frame is 3.6 units/s: only a teleport
  assert.ok(step < 0.06, `${k}x: nobody jumps (worst frame ${step.toFixed(3)})`);
  assert.ok(skate <= 1.05, `${k}x: nobody outwalks their legs (${(skate * 100).toFixed(0)}% of top speed)`);
  assert.ok(walking > 0 && gain / walking > 0.9, `${k}x: a walk is a full stride, not a glide (mean weight ${(gain / walking).toFixed(2)})`);
  assert.ok(longTurn < 0.5, `${k}x: turned to the display before reaching (longest turn ${longTurn.toFixed(2)}s)`);
}

{
  const { items } = await import('./core/state.js');
  const { WIP_STATE, wantFor, stow } = await import('../wip.js');
  const random = Math.random, rounds = [];
  for (let seed = 1; seed <= 50; seed++) {
    let a = seed;   // mulberry32
    Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    open({ k: 1, tutorial: true });
    const friend = shop.world.npcs[0];
    for (const kind of ['pattern', 'yarn', 'crochet-hook']) {
      const it = items.find((x) => x.name === kind && !x.gone);
      it.gone = true;
      stow(friend, it, wantFor(friend, it));
    }
    friend.willReturn = true;
    const potHolder = friend.wips[0];
    assert.equal(potHolder.state, WIP_STATE.IN_PROGRESS, `seed ${seed}: the kit starts the pot holder`);
    for (let day = 1; day <= 3; day++) {
      if (day > 1) try { restart(); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
      assert.ok(shop.world.npcs.includes(friend), `seed ${seed}: the friend comes in on day ${day}`);
      if (day === 2 && seed === 3) {
        let sat = null, crafting = null;
        run(60, { each: (rec, t) => {
          if (rec.npc !== friend) return;
          if (sat === null && rec.npc.seat !== null && rec.moveT >= 1) sat = t;
          if (crafting === null && rec.craft?.hands > 0.5) crafting = t;
        } });
        assert.ok(sat !== null && crafting - sat < 1.5, `the friend starts crocheting once seated, not a round later (${(crafting - sat).toFixed(2)}s)`);
      }
      if (day === 3 && seed === 1) {
        let crocheted = 0;
        run(200, { each: (rec) => { if (rec.npc === friend && rec.craft?.mode === 'crochet' && rec.craft.hands > 0.5) crocheted += DT; } });
        assert.ok(crocheted > 5, `the friend is seen crocheting the round they finish it (${crocheted.toFixed(1)}s)`);
      }
      for (let r = 0; r < 200 && shop.world.npcs.some((n) => n.state !== STATE.GONE); r++) doAdvanceRound();
      if (day < 3) assert.equal(potHolder.state, WIP_STATE.IN_PROGRESS, `seed ${seed}: not finished on day ${day} (${potHolder.progress}%)`);
    }
    assert.equal(potHolder.state, WIP_STATE.FINISHED, `seed ${seed}: finished on day 3 (${potHolder.progress}%)`);
    assert.ok(shop.world.guestbook.some((g) => g.npcId === friend.id && g.kind === 'photo' && g.wip === potHolder),
      `seed ${seed}: and photographed with it in day 3's Guestbook`);
    const onCounter = () => lentGroup.children.length === 1 && lentGroup.children[0].children[0]?.isMesh;
    assert.ok(onCounter(), `seed ${seed}: the lent pot holder lies on the counter`);
    try { restart(); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
    assert.ok(onCounter() && shop.world.lent[0]?.wip === potHolder, `seed ${seed}: and is still there on day 4`);
    rounds.push(potHolder.finishedRound);
  }
  Math.random = random;
  rounds.sort((x, y) => x - y);
  assert.ok(rounds.at(-1) <= 5, `the finish comes early on day 3 (rounds ${rounds.join(',')})`);
  console.log(`tutorial: the pot holder is finished in the shop on day 3, round ${rounds[25]} (median), ${rounds.at(-1)} (worst)`);
}

{
  const owners = () => shop.world.npcs.filter((n) => n.farewell);
  open({ k: 1, tutorial: true });
  assert.equal(owners().length, 1, 'the Former Owner is in on day 1, once');
  const [owner] = owners(), rec = cast.find((r) => r.npc === owner);
  assert.ok(Object.values(owner.worn).every(Boolean) && Object.keys(owner.worn).length === 6, 'wearing all six slots');
  assert.deepEqual(Object.keys(rec.outfit).sort(), ['bag', 'hat', 'pile', 'scarf', 'shawl', 'socks', 'sweater'],
    'drawn in all six and carrying a pile');
  const states = new Set();
  for (let r = 0; r < 200 && shop.world.npcs.some((n) => n.state !== STATE.GONE); r++) { doAdvanceRound(); states.add(owner.state); }
  assert.ok(!states.has(STATE.QUEUED) && !states.has(STATE.BROWSE) && owner.bought.length === 0, 'not a customer');
  const signed = shop.world.guestbook.filter((g) => g.farewell);
  assert.equal(signed.length, 1, 'one farewell in the Guestbook');
  assert.equal(signed[0].note.full, "Shop's all yours! Make some fun stuff!");
  assert.equal(owner.state, STATE.GONE, 'and out of the door');
  try { restart(); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
  assert.equal(owners().length, 0, 'never again');
  assert.ok(shop.pastBooks[0].entries.find((g) => g.farewell).who.carries.length, 'the filed photo keeps the pile');
}

{
  const { items } = await import('./core/state.js');
  const { wantFor, wantsOf, satisfies, stow } = await import('../wip.js');
  const { addItem } = await import('./goods/stock.js');
  const { planTomorrow } = await import('./sim/world.js');
  const { makeStockNotion } = await import('../../inventory/catalog.js');
  const random = Math.random;
  let emptyWalks = 0;
  const runDay = () => { for (let r = 0; r < 400 && shop.world.npcs.some((n) => n.state !== STATE.GONE); r++) {
    const stocked = new Set(items.filter((x) => !x.gone && !x.held).map((x) => x.display));
    doAdvanceRound();
    emptyWalks += shop.world.npcs.filter((n) => n.action?.type === ACTION.WALK_TO_DISPLAY && !stocked.has(n.action.params.displayId)).length;
  } };
  for (let seed = 1; seed <= 40; seed++) {
    let a = seed;   // mulberry32
    Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    open({ k: 1, tutorial: true });
    const friend = shop.world.npcs[0];
    runDay();
    const page = shop.world.guestbook.find((g) => g.npc === friend.name);
    assert.equal(page?.mood, 'happy', `seed ${seed}: day 1's friend takes the kit off the floor and goes home (${friend.state})`);
  }
  let buried = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let a = seed;   // mulberry32
    Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    open({ k: 1, tutorial: true });
    const friend = shop.world.npcs[0], pattern = items.find((x) => x.name === 'pattern');
    pattern.gone = true;
    stow(friend, pattern, wantFor(friend, pattern));
    friend.willReturn = true;
    const kit = items.filter((x) => !x.gone);
    for (const x of kit) x.held = true;
    runDay();
    for (const x of kit) x.held = false;
    try { restart({ order: planTomorrow() }); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
    const table = shop.world.displays.find((d) => d.form === 'table');
    for (const it of wantsOf(friend).map((w) => items.find((x) => !x.gone && satisfies(x, w))).filter(Boolean)) {
      const spec = { ...it };
      for (const k of ['display', 'shelf', 'c', 'r', 'keys', 'layer', 'layers']) delete spec[k];
      it.gone = true;
      const roomy = seed % 2 ? addItem(table, 0, spec, { reserve: 1 }) : -1;
      const i = roomy >= 0 ? roomy : addItem(table, 0, spec);
      assert.ok(i >= 0, `seed ${seed}: room on the table`);
      if (roomy >= 0) buried += addItem(table, 0, makeStockNotion(Math.random, 'darning-needle'),
        { c: items[i].c, r: items[i].r, shape: [items[i].w, items[i].h] }) >= 0;
    }
    runDay();
    const page = shop.world.guestbook.find((g) => g.npc === friend.name);
    assert.equal(page?.mood, 'happy', `seed ${seed}: the friend found the hook and ball on the table (${page?.tags})`);
  }
  Math.random = random;
  assert.ok(buried >= 10, `only ${buried} wanted things were buried; the dig-out went untested`);
  assert.equal(emptyWalks, 0, 'nobody walks up to a display holding nothing to browse it');
}

console.log('walk: prompt door, real pause, full strides at every speed, no jumps, faces the display');
