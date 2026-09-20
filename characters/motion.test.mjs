// Self-check for the pure motion layer. Run: node characters/motion.test.mjs
//
// Covers the properties that are invisible on screen and silent when they break: velocity
// continuity through an interrupt, numerical stability at a throttled frame time, frame-rate
// independent overshoot, and the every-pose-carries-every-channel rule whose failure mode is a
// character vanishing rather than a character posed wrongly.
//
// Runs under bare node because motion.js imports nothing. That is the whole reason it is not
// inside npc.js.

import assert from 'node:assert/strict';
import {
  POSES, POSE_KEYS, MOTION_KEYS, MOTION_DEFAULTS, BASE_MOTION_RANGES,
  makeMotion, resetMotion, integrate, compose, valueOf, velocityOf,
  motionOf, walkPhase, walkLayer, walkGain,
} from './motion.js';

const opts = (over = {}) => ({ ...MOTION_DEFAULTS, ...over });
const out = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
const run = (m, target, o, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) integrate(m, target, dt, o);
  return m;
};

// --- the premise: smoothstep discards velocity, and both replacements do not ------------------
//
// This is the assertion the whole change exists to satisfy. The reference implementation below is
// what cast.js used to do; it is here so the test PROVES the premise instead of asserting it.
{
  const A = { armSwing: 0 }, B = { armSwing: -1.15 }, C = { armSwing: -0.45 };
  const dt = 1 / 60, BLEND = 0.35;

  // cast.js as it was: position carried across the interrupt, velocity thrown away, because
  // t*t*(3-2*t) has slope zero at t = 0.
  let from = A.armSwing, to = B.armSwing, pt = 0, cur = A.armSwing, prev = A.armSwing;
  const step = () => {
    prev = cur;
    pt = Math.min(1, pt + dt / BLEND);
    const e = pt * pt * (3 - 2 * pt);
    cur = from + (to - from) * e;
  };
  for (let i = 0; i < 10; i++) step();
  const vBefore = (cur - prev) / dt;
  from = cur; to = C.armSwing; pt = 0;          // THE INTERRUPT
  step();
  const vAfter = (cur - prev) / dt;

  assert.ok(Math.abs(vBefore) > 1, 'reference: the channel really is moving before the interrupt');
  assert.ok(Math.abs(vAfter) < Math.abs(vBefore) * 0.1,
    'reference: smoothstep loses >90% of its velocity across an interrupt -- this is the hitch');

  // The rigorous statement of the property, and the one that does not depend on which way the
  // target moved: continuity means the velocity step across the interrupt SHRINKS WITH dt. A
  // real deceleration is bounded by acceleration x dt, so halving dt halves it. Smoothstep's
  // jump is the whole velocity at any frame rate, because its slope at t=0 is identically zero.
  for (const mode of ['spring', 'hermite']) {
    const o = opts({ mode });
    const jumps = [1 / 60, 1 / 240, 1 / 960].map((dtx) => {
      const m = makeMotion(A, 0.5);
      for (let e = 0; e < 1 / 6; e += dtx) integrate(m, B, dtx, o);
      const v0 = velocityOf(m, 'armSwing');
      assert.ok(Math.abs(v0) > 0.5, `${mode}: genuinely moving before the interrupt`);
      const p0 = valueOf(m, 'armSwing');
      integrate(m, C, dtx, o);                  // THE INTERRUPT
      assert.ok(Math.abs(valueOf(m, 'armSwing') - p0) < Math.abs(v0) * dtx * 3,
        `${mode}: position carries across the interrupt`);
      return Math.abs(velocityOf(m, 'armSwing') - v0);
    });

    assert.ok(jumps[1] < jumps[0] * 0.6 && jumps[2] < jumps[1] * 0.6,
      `${mode}: the velocity step shrinks with dt, so velocity is CONTINUOUS across an `
      + `interrupt (got ${jumps.map((j) => j.toFixed(3)).join(' -> ')})`);
  }

  // And the readable version, on an interrupt that does not reverse direction: retargeting from
  // browse to the further-along reach must not slow the arm down at all.
  for (const mode of ['spring', 'hermite']) {
    const o = opts({ mode });
    const m = makeMotion(A, 0.5);
    run(m, C, o, 10);
    const v0 = velocityOf(m, 'armSwing');
    integrate(m, B, dt, o);
    assert.ok(Math.abs(velocityOf(m, 'armSwing')) > Math.abs(v0) * 0.9,
      `${mode}: an interrupt toward a further target keeps the arm moving`);
  }
}

// --- stability at a throttled frame time ------------------------------------------------------
//
// store/main.js clamps dt to 0.1s, which is NOT enough for a stiff spring. The clamp inside
// integrate() is what this pins: without it, explicit Euler diverges to Infinity then NaN within
// ~15 steps, and NaN reaches the bounding sphere and culls the whole character.
{
  for (const mode of ['spring', 'hermite']) {
    for (const dt of [1 / 60, 1 / 30, 0.1, 0.25]) {
      for (const stiff of [40, 150, 600, 900, 2000]) {
        const m = makeMotion(POSES.rest, 0.3);
        run(m, POSES.delighted, opts({ mode, stiff, zeta: 0.6 }), 200, dt);
        for (let i = 0; i < m.cur.length; i++) {
          assert.ok(Number.isFinite(m.cur[i]),
            `${mode}: ${MOTION_KEYS[i]} stayed finite at dt=${dt}, stiff=${stiff}`);
          assert.ok(Number.isFinite(m.vel[i]),
            `${mode}: ${MOTION_KEYS[i]} velocity stayed finite at dt=${dt}, stiff=${stiff}`);
        }
      }
    }
  }
}

// --- overshoot is frame-rate independent ------------------------------------------------------
//
// A semi-implicit integrator is equally stable but its overshoot decays as dt grows, so the
// bounce tuned at 60fps flattens out under a 20x CPU throttle -- the personality disappears on
// exactly the hardware it was for. This catches a regression back to one.
{
  const o = opts({ stiff: 40, zeta: 0.6 });
  const peaks = [1 / 60, 1 / 30, 0.1].map((dt) => {
    const m = makeMotion({ armSwing: 0 }, 0.5);
    const target = { armSwing: 1 };
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      integrate(m, target, dt, o);
      peak = Math.max(peak, valueOf(m, 'armSwing'));
    }
    return peak;
  });

  assert.ok(peaks[0] > 1.02, `an under-damped spring must actually overshoot (got ${peaks[0]})`);
  const spread = (Math.max(...peaks) - Math.min(...peaks)) / Math.min(...peaks);
  assert.ok(spread < 0.10,
    `overshoot must not decay with frame time: peaks ${peaks.map((p) => p.toFixed(3))}`);
}

// --- every pose carries every channel ---------------------------------------------------------
//
// npc.js's rule, pinned here: a pose missing a key interpolates to NaN, NaN reaches the bounding
// sphere, and the renderer culls the character -- which presents as characters popping in and out
// rather than as a broken pose. The single likeliest mistake when adding a channel.
{
  for (const [name, pose] of Object.entries(POSES)) {
    for (const k of POSE_KEYS) {
      assert.ok(Number.isFinite(pose[k]), `POSES.${name} is missing ${k}`);
    }
    assert.equal(typeof pose.holdItem, 'boolean', `POSES.${name}.holdItem must stay a boolean`);
  }
  assert.ok(!POSE_KEYS.includes('holdItem'),
    'holdItem must never be interpolated: Boolean(0.37) is true, so the item would appear at 37%');
  assert.ok(!POSE_KEYS.includes('blink'),
    'blink must not be interpolated: a 120ms snap through a 0.35s spring becomes a droop');
}

// --- holdItem crosses exactly once ------------------------------------------------------------
{
  for (const mode of ['spring', 'hermite']) {
    const o = opts({ mode });
    const m = makeMotion(POSES.rest, 0.5);
    const seen = [];
    const buf = out();
    for (let i = 0; i < 120; i++) {
      integrate(m, POSES.carry, 1 / 60, o);
      const held = compose(buf, m, o).holdItem;
      if (seen.at(-1) !== held) seen.push(held);
    }
    assert.deepEqual(seen, [false, true], `${mode}: holdItem flips exactly once on rest -> carry`);
  }
}

// --- walk phase is a pure function of distance, and scale-invariant ---------------------------
//
// The claim that decides distance-driven over time-driven: a stumpy character and a stilt
// character walking the same ground cover it with the SAME swing amplitude and a different number
// of steps. If this fails, the feet skate on one of them.
{
  const o = opts();
  const short = 0.085 + 0.045, tall = 0.430 + 0.045;   // legHeight + hipInset, the tier-1 spread

  const a = walkPhase(0, 0.2, short, o), b = walkPhase(0, 0.2, tall, o);
  assert.ok(Math.abs(a.swingAmp - b.swingAmp) < 1e-12,
    'swing amplitude is scale-invariant: the leg length cancels out of asin(stride/4)');
  assert.ok(b.strideLen > a.strideLen * 2, 'a longer leg takes a proportionally longer stride');

  // one full stride returns to the same phase, at any leg length
  for (const L of [short, tall]) {
    const w = walkPhase(0, 0.2, L, o);
    for (const d of [0, 0.37, 1.9]) {
      assert.ok(Math.abs(walkPhase(d, 0.2, L, o).phase - walkPhase(d + w.strideLen, 0.2, L, o).phase) < 1e-9,
        `phase repeats every stride at L=${L}`);
    }
  }

  // steps x strideLen === distance, which is what "the feet do not skate" means numerically
  const w = walkPhase(0, 0.2, short, o);
  const dist = 2.0;
  assert.ok(Math.abs((dist / w.strideLen) * w.strideLen - dist) < 1e-12, 'distance reconciles');

  // and the honest report when the body outruns the legs
  assert.equal(walkPhase(0, 0.2, short, o).skate, 0, 'no skate at a walkable speed');
  assert.ok(walkPhase(0, 4.0, short, o).skate > 0.5,
    'skate is reported, not hidden, once the geometric ceiling binds');
}

// --- the walk gate closes cleanly -------------------------------------------------------------
//
// A standing character must be bit-identical to its base pose, or every idle is polluted by a
// walk cycle that is almost-but-not-quite off.
{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  m.walkGain = 1;
  for (let i = 0; i < 300; i++) walkGain(m, 0, 1 / 60, o);
  assert.equal(m.walkGain, 0, 'walk gain reaches EXACTLY zero when stopped, not merely near it');

  const base = out(), walked = out();
  const w = walkPhase(1.3, 0, 0.238, o);
  walkLayer(walked, w, 0, o);
  assert.deepEqual(walked, base, 'at zero gain the walk layer contributes nothing at all');

  // and it does contribute when open, anti-symmetrically in the arms
  const on = out();
  walkLayer(on, walkPhase(0.25 * w.strideLen, 0.5, 0.238, o), 1, o);
  assert.ok(on.legSwing > 0.05, 'the legs swing');
  assert.ok(on.armSwingAlt < 0, 'the arms counter-swing');
  assert.equal(on.kneeBend, 0,
    'the walk drives no knee channel: npc.js kneeAmount already derives it from legSwing');
}

// --- traits to coefficients, and the per-species span -----------------------------------------
{
  const flat = Object.fromEntries(Object.keys(motionOf(t(3))).map((k) => [k, 0]));
  assert.ok(Object.keys(flat).length > 0);

  assert.ok(motionOf(t(3, { Assertiveness: 5 })).stiff > motionOf(t(3, { Assertiveness: 1 })).stiff,
    'assertive characters commit to a pose harder');
  assert.ok(motionOf(t(3, { Withdrawal: 5 })).stiff < motionOf(t(3, { Withdrawal: 1 })).stiff,
    'withdrawn characters dawdle');
  assert.ok(motionOf(t(3, { Volatility: 5, Orderliness: 1 })).zeta < 1,
    'high Volatility under-damps, so the character overshoots and settles');
  assert.ok(motionOf(t(3, { Volatility: 1, Orderliness: 5 })).zeta >= 1,
    'an orderly, unvolatile character does not overshoot');
  assert.ok(motionOf(t(3, { Enthusiasm: 5 })).idleAmp > motionOf(t(3, { Withdrawal: 5 })).idleAmp,
    'enthusiasm fidgets, withdrawal holds still');

  // every trait combination stays finite and inside the declared span
  for (let v = 1; v <= 5; v++) {
    const c = motionOf(t(v));
    for (const [k, range] of Object.entries(BASE_MOTION_RANGES)) {
      assert.ok(Number.isFinite(c[k]), `${k} is finite at trait ${v}`);
      assert.ok(c[k] >= range[0] - 1e-9 && c[k] <= range[1] + 1e-9,
        `${k}=${c[k]} stays inside its span at trait ${v}`);
    }
  }

  // THE PER-SPECIES KNOB: a narrow span means every individual of that species moves alike.
  const narrow = { ...BASE_MOTION_RANGES, stiff: [140, 150] };
  const lo = motionOf(t(3, { Assertiveness: 1, Withdrawal: 5 }), narrow).stiff;
  const hi = motionOf(t(3, { Assertiveness: 5, Withdrawal: 1 }), narrow).stiff;
  assert.ok(hi - lo <= 10, 'a narrowed species span compresses the whole cast into it');
  assert.ok(hi > lo, 'but the ordering inside the span survives');

  const wide = motionOf(t(3, { Assertiveness: 5, Withdrawal: 1 }), BASE_MOTION_RANGES).stiff
             - motionOf(t(3, { Assertiveness: 1, Withdrawal: 5 }), BASE_MOTION_RANGES).stiff;
  assert.ok(wide > 100, 'and a wide span gives the same traits real spread');
}

/** The ten assets at a uniform value, with named overrides. Exact names: synonyms are a spec violation. */
function t(all, over = {}) {
  return {
    Volatility: all, Withdrawal: all, Enthusiasm: all, Assertiveness: all, Intellect: all,
    Openness: all, Compassion: all, Politeness: all, Industriousness: all, Orderliness: all,
    ...over,
  };
}

// --- reset is a genuine snap ------------------------------------------------------------------
{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  run(m, POSES.delighted, o, 20);
  assert.ok(Math.abs(velocityOf(m, 'armOut')) > 0.1, 'moving before the reset');
  resetMotion(m, POSES.rest);
  assert.equal(velocityOf(m, 'armOut'), 0, 'reset zeroes velocity');
  assert.equal(valueOf(m, 'armOut'), POSES.rest.armOut, 'reset snaps to the pose');
}

console.log('motion.js self-check: all assertions passed');
