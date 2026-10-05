// Self-check for how customers walk in the game, headless. Run: node characters/store/walk.test.mjs
//
// The real sim and renderer (world.js, cast.js, visit.js) over whole days at every speed, with the
// GPU (scene/stage.js) and the stock painting (goods/paint.js) stubbed out and just enough DOM to
// import. Positions are read off the rigs every frame, so a teleport, a skate, a pause that does
// not pause or a reach into thin air fails here rather than in a playtest.

import assert from 'node:assert/strict';
import { register } from 'node:module';

// ---------------------------------------------------------------- the stand-ins
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

// ---------------------------------------------------------------- the shop
const { S, gameSpeed } = await import('./core/config.js');
const { shop, cast, clocks } = await import('./core/state.js');
await import('../owl.js'); await import('../llama.js'); await import('../lion.js');
const { STATE, ACTION } = await import('../visit.js');
const { topSpeed } = await import('../motion.js');
const { buildRoomShell } = await import('./scene/room.js');
const { installSeating } = await import('./scene/seating.js');
const { installDisplays } = await import('./scene/displays.js');
const { installWorld, restart, doAdvanceRound } = await import('./sim/world.js');
const { tickCast } = await import('./sim/cast.js');
const { cellNameFor } = await import('./goods/stock.js');
buildRoomShell(); installSeating(); installDisplays(); installWorld();
S.blobShadows = false;

/** A new day. The instanced stock meshes need the atlas, so the last steps of restart() fail. */
function open({ k, tutorial }) {
  Object.assign(S, gameSpeed(k), { tutorial });
  try { restart({ keepRegulars: false }); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
  assert.ok(shop.world, 'the day opened');
}

/** boot.js tickClocks, the rounds half. `sit` sends a free customer to a chair half the time. */
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
/** Run `seconds` of frames, calling `each(rec, t)` per customer per frame after the tick. */
function run(seconds, { sit = false, each = () => {}, at = () => {} } = {}) {
  const last = new Map();
  for (let f = 0; f * DT < seconds; f++) {
    at(f * DT);
    // The carried package is an atlas mesh; mark it made so syncCarried leaves it alone.
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

// ---------------------------------------------------------------- 3. day 1 comes straight in
{
  open({ k: 1, tutorial: true });
  let set = null;
  run(1, { each: (rec, t) => { if (set === null && rec.speed > 0) set = t; } });
  assert.ok(set !== null && set < 0.1, `the first customer sets off at once, not a round later (${set})`);
}

// ---------------------------------------------------------------- 1. ⏸ halts the walk, ▶ resumes it
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

// ---------------------------------------------------------------- 2, 4, 5. every speed, whole days
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
      // Facing the display while at it, allowing the turn itself (TURN_RATE: a half turn ~0.4s).
      const n = rec.npc, d = n.action?.type === ACTION.INTERACT && shop.world.displays.find((q) => q.id === n.action.params.displayId);
      const off = d && angleOff(rec.built.root.rotation.y, Math.atan2(d.x - rec.built.root.position.x, d.z - rec.built.root.position.z)) > 0.35;
      if (off) turning.set(rec, turning.get(rec) ?? t);
      else turning.delete(rec);
      if (off) longTurn = Math.max(longTurn, t - turning.get(rec));
    },
  });
  // A step of 0.06 a frame is 3.6 units/s: no walk or sit in the shop comes near it; a teleport does.
  assert.ok(step < 0.06, `${k}x: nobody jumps (worst frame ${step.toFixed(3)})`);
  assert.ok(skate <= 1.05, `${k}x: nobody outwalks their legs (${(skate * 100).toFixed(0)}% of top speed)`);
  // The swing is the walk layer's weight times what foot-lock needs: under 1, the feet skate.
  assert.ok(walking > 0 && gain / walking > 0.9, `${k}x: a walk is a full stride, not a glide (mean weight ${(gain / walking).toFixed(2)})`);
  assert.ok(longTurn < 0.5, `${k}x: turned to the display before reaching (longest turn ${longTurn.toFixed(2)}s)`);
}

// ---------------------------------------------------------------- 6. the tutorial friend's pot holder
// TUTORIAL.md: bought on day 1, finished in the shop on day 3 -- never at home or before day 3, and
// early on day 3, whatever the friend's traits. The kit is handed over as they walk in on day 1, the
// most knitting time days 1-2 can give. Seeded, every seed must pass.
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
    friend.willReturn = true;   // as a purchase would
    const potHolder = friend.wips[0];
    assert.equal(potHolder.state, WIP_STATE.IN_PROGRESS, `seed ${seed}: the kit starts the pot holder`);
    for (let day = 1; day <= 3; day++) {
      if (day > 1) try { restart(); } catch (err) { assert.match(err.stack, /sizeInstanceBuffers/); }
      assert.ok(shop.world.npcs.includes(friend), `seed ${seed}: the friend comes in on day ${day}`);
      for (let r = 0; r < 200 && shop.world.npcs.some((n) => n.state !== STATE.GONE); r++) doAdvanceRound();
      if (day < 3) assert.equal(potHolder.state, WIP_STATE.IN_PROGRESS, `seed ${seed}: not finished on day ${day} (${potHolder.progress}%)`);
    }
    assert.equal(potHolder.state, WIP_STATE.FINISHED, `seed ${seed}: finished on day 3 (${potHolder.progress}%)`);
    assert.ok(shop.world.guestbook.some((g) => g.npcId === friend.id && g.kind === 'photo' && g.wip === potHolder),
      `seed ${seed}: and photographed with it in day 3's Guestbook`);
    rounds.push(potHolder.finishedRound);
  }
  Math.random = random;
  rounds.sort((x, y) => x - y);
  assert.ok(rounds.at(-1) <= 5, `the finish comes early on day 3 (rounds ${rounds.join(',')})`);
  console.log(`tutorial: the pot holder is finished in the shop on day 3, round ${rounds[25]} (median), ${rounds.at(-1)} (worst)`);
}

console.log('walk: prompt door, real pause, full strides at every speed, no jumps, faces the display');
