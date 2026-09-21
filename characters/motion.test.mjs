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
import { readFileSync } from 'node:fs';
import {
  POSES, POSE_KEYS, MOTION_KEYS, MOTION_DEFAULTS, BASE_MOTION_RANGES, STYLE_RANGES,
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

// --- MOTION_DEFAULTS alone is a COMPLETE coefficient set --------------------------------------
//
// Every coefficient the layers multiply by has to have a default. headArc lived only in
// BASE_MOTION_RANGES, so a caller passing bare MOTION_DEFAULTS multiplied by undefined and put
// NaN on all three head channels -- which does not look like a broken head, it culls the entire
// character. The lab hid it because it always merges motionOf() on top.
{
  for (const k of Object.keys({ ...BASE_MOTION_RANGES, ...STYLE_RANGES })) {
    assert.ok(MOTION_DEFAULTS[k] !== undefined,
      `MOTION_DEFAULTS is missing ${k}, so a caller not merging motionOf() gets NaN`);
  }
  const m = makeMotion(POSES.rest, 0.4);
  const buf = out();
  for (let i = 0; i < 600; i++) {
    integrate(m, POSES.browse, 1 / 60, MOTION_DEFAULTS);
    compose(buf, m, MOTION_DEFAULTS);
    walkLayer(buf, walkPhase(i / 60, 0.5, 0.238, MOTION_DEFAULTS), 1, MOTION_DEFAULTS);
    for (const k of POSE_KEYS) {
      assert.ok(Number.isFinite(buf[k]), `${k} is finite using only MOTION_DEFAULTS (frame ${i})`);
    }
  }
}

// --- the idle layer actually moves, and moves SIDEWAYS -----------------------------------------
//
// Amplitudes that are technically nonzero but read as frozen are the failure this guards: the
// first pass shipped a 0.9-degree weight shift on a fore-aft channel, which is invisible twice
// over. spineRoll is the only lateral channel on the rig, so if it stays flat nothing on the
// character can move side to side at all.
{
  const o = opts();
  const range = (key, seed, amp) => {
    const m = makeMotion(POSES.rest, seed);
    const buf = out();
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 3600; i++) {
      integrate(m, POSES.rest, 1 / 60, { ...o, idleAmp: amp });
      compose(buf, m, { ...o, idleAmp: amp });
      lo = Math.min(lo, buf[key]); hi = Math.max(hi, buf[key]);
    }
    return (hi - lo) * 180 / Math.PI;
  };

  assert.ok(range('spineRoll', 0.5, 1) > 4,
    'a standing character must sway several degrees side to side, not twitch imperceptibly');
  assert.ok(range('headYaw', 0.5, 1) > 4, 'and look around');
  assert.ok(range('spineRoll', 0.5, 1.6) > range('spineRoll', 0.5, 0.4) * 2,
    'a fidgety character must sway visibly more than a still one, or the trait does nothing');
}

// --- amplitude and duty cycle are SEPARATE knobs ----------------------------------------------
//
// "How much they fidget" and "how often they fidget" are different questions, and a single
// amplitude dial answers only the first: at full duty the sway never stops, which reads as
// permanent swaying rather than as an animal standing around. Breathing must survive the gate,
// or a still character reads as switched off rather than as still.
{
  const o = opts();
  const sample = (duty) => {
    const m = makeMotion(POSES.rest, 0.4);
    const buf = out();
    let stillFrames = 0, peakSway = 0, peakBreath = 0;
    for (let i = 0; i < 7200; i++) {           // two minutes
      integrate(m, POSES.rest, 1 / 60, { ...o, idleDuty: duty });
      compose(buf, m, { ...o, idleDuty: duty });
      if (Math.abs(buf.spineRoll) < 0.004) stillFrames++;
      peakSway = Math.max(peakSway, Math.abs(buf.spineRoll));
      peakBreath = Math.max(peakBreath, Math.abs(buf.spineBend));
    }
    return { stillPct: 100 * stillFrames / 7200, peakSway, peakBreath };
  };

  const low = sample(0.25), high = sample(1);
  assert.ok(low.stillPct > high.stillPct + 15,
    'a low duty cycle must produce real stillness between fidgets '
    + `(${low.stillPct.toFixed(0)}% still vs ${high.stillPct.toFixed(0)}% at full duty)`);
  assert.ok(low.peakSway > 0.03,
    'but when they do fidget it must still be full size -- duty is not a volume knob');
  assert.ok(low.peakBreath > 0.02,
    'breathing must NOT be gated by duty: a character that stops breathing reads as switched off');
}

// --- walking STYLE must belong to personality, not to leg length ------------------------------
//
// The complaint this exists to prevent: "leg length is clearly the dominant factor, so
// personality-as-walking-style feels impossible". It was true and it was measurable -- two
// opposite personalities on the same legs produced a byte-identical walk, because three of the
// four style dials (armGain, sway, lean) were global constants and the fourth, stride, is a
// LENGTH and therefore welded to the legs.
//
// The fix is that style is carried by ANGLES. An angle has no length in it, so it reads the same
// on a stumpy owl and a stilt llama. Two properties, and the walk is only believable with both:
{
  const o = opts();
  const T = (over) => ({ ...t(3), ...over });
  const BOLD = T({ Enthusiasm: 5, Assertiveness: 5, Withdrawal: 1, Industriousness: 5, Orderliness: 1 });
  const SHY = T({ Enthusiasm: 1, Assertiveness: 1, Withdrawal: 5, Industriousness: 1, Orderliness: 5 });
  const STYLE = ['armSwingAlt', 'spineRoll', 'spineBend', 'headPitch', 'elbowBend'];

  const signature = (traits, L) => {
    const co = { ...o, ...motionOf(traits, BASE_MOTION_RANGES), idleAmount: 0 };
    const m = makeMotion(POSES.rest, 0.5);
    const buf = out();
    const w0 = walkPhase(0, 0.35, L, co);
    const peak = {};
    for (let i = 0; i < 240; i++) {
      integrate(m, POSES.rest, 1 / 60, co);
      compose(buf, m, co);
      walkLayer(buf, { ...w0, phase: i / 240 }, 1, co);
      for (const k of STYLE) peak[k] = Math.max(peak[k] ?? 0, Math.abs(buf[k]));
    }
    return peak;
  };

  const SHORT = 0.085 + 0.045, TALL = 0.345 + 0.045;   // the full tier-1 legHeight spread

  // 1. Same body, opposite temperaments -> the walks must genuinely differ.
  const bold = signature(BOLD, SHORT), shy = signature(SHY, SHORT);
  assert.ok(bold.armSwingAlt > shy.armSwingAlt * 3,
    `personality must drive arm swing (bold ${bold.armSwingAlt.toFixed(2)} vs `
    + `shy ${shy.armSwingAlt.toFixed(2)}) -- these were once identical`);
  assert.ok(bold.spineRoll > shy.spineRoll * 3, 'and how much the body rolls');
  assert.ok(bold.spineBend > shy.spineBend + 0.05, 'and how far they lean in');
  assert.ok(shy.elbowBend > bold.elbowBend + 0.2, 'and how tightly the arms are held');

  // 2. Same temperament, a 3x difference in leg length -> the STYLE must be identical. This is
  //    the decoupling: the body decides stride and cadence, the personality decides everything
  //    else, and the two no longer compete for the same visual channel.
  const tall = signature(BOLD, TALL);
  for (const k of STYLE) {
    assert.ok(Math.abs(bold[k] - tall[k]) < 0.02,
      `${k} must not change with leg length (${bold[k].toFixed(3)} vs ${tall[k].toFixed(3)})`);
  }
}

// --- a global tuning knob must actually REACH the character -----------------------------------
//
// The lab merges its global settings with motionOf()'s per-personality values. motionOf spread
// last, so every key it returns silently overwrote the slider -- five knobs looked wired, moved
// a number, and did nothing at all. Scaling after the merge keeps both. This pins the shape of
// that merge so the next coefficient added cannot quietly join the dead pile.
{
  const traits = t(3);
  const SCALED = ['stiff', 'zeta', 'stride', 'bounce', 'idleRate',
                  'armGain', 'sway', 'lean'];
  const coeffsLike = (scale) => {
    const per = motionOf(traits, BASE_MOTION_RANGES);
    for (const k of SCALED) per[k] *= scale[k];
    return { ...MOTION_DEFAULTS, ...per };
  };
  const neutral = Object.fromEntries(SCALED.map((k) => [k, 1]));
  const base = coeffsLike(neutral);

  for (const k of SCALED) {
    const bumped = coeffsLike({ ...neutral, [k]: 2 });
    assert.ok(Math.abs(bumped[k] - base[k] * 2) < 1e-9,
      `a global "${k}" knob must reach the character and scale it`);
  }
  // and the knobs that are NOT per-personality must survive the merge untouched
  const per = motionOf(traits, BASE_MOTION_RANGES);
  for (const k of ['blend', 'idleAmount', 'idleDuty', 'gateSpeed', 'sinMax']) {
    assert.equal(base[k], MOTION_DEFAULTS[k], `${k} must survive the motionOf merge`);
    assert.ok(!(k in per), `${k} must not be returned by motionOf, or its slider is clobbered`);
  }
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

  // THE FOOT-LOCK CONDITION. A phase is one CYCLE -- legSwing runs a whole sine over it -- which
  // is TWO steps, and each leg is planted for exactly half of it. So while one foot is down the
  // body advances strideLen/2, and THAT is the distance that foot has to cover backwards
  // relative to the body. Its peak-to-peak fore-aft travel is 2*L*sin(swingAmp), so
  //
  //     2*L*sin(swingAmp) = strideLen/2
  //
  // This assertion previously demanded the full strideLen, which is the same off-by-a-half the
  // code had: a probe that watched one leg for a whole cycle instead of its stance half. Slip
  // measured on the real stance window is 10.7% of stride under this condition and 55.7% under
  // the other, so the two are not a matter of taste.
  for (const L of [short, tall, 0.13, 0.475]) {
    for (const speed of [0.15, 0.4, 0.8]) {
      const p = walkPhase(0, speed, L, o);
      if (p.skate > 0) continue;                 // past the ceiling the shortfall is reported
      const travel = 2 * L * Math.sin(p.swingAmp);
      assert.ok(Math.abs(travel - p.strideLen / 2) < 1e-9,
        `foot travel ${travel.toFixed(4)} must equal half the stride ${(p.strideLen / 2).toFixed(4)} `
        + `(L=${L}, speed=${speed}) or the planted foot slides`);
    }
  }

  // CADENCE IS A CAP, NOT A WISH. This is what the legs blurring at high speed actually was:
  // phase was divided by a stride clamped to the geometric ceiling, so once that bound, cadence
  // ran away linearly with speed. A short-legged owl at speed 2.5 hit 21.5 steps/s -- 10.7 leg
  // cycles per second against a 60fps sampler, about 5.6 frames per cycle, close enough to
  // Nyquist that the legs alias rather than animate.
  //
  // The body is allowed to outrun the legs; that is what `skate` reports. What is not allowed
  // is the legs spinning to pretend otherwise.
  for (const L of [0.103, 0.238, 0.448]) {
    for (const speed of [0.2, 1, 2.5, 6, 20]) {
      const p = walkPhase(0, speed, L, o);
      const cadence = (2 * speed) / p.strideLen;
      assert.ok(cadence <= o.cadenceMax + 1e-9,
        `L=${L} speed=${speed}: ${cadence.toFixed(1)} steps/s exceeds the ${o.cadenceMax} cap `
        + '-- at 60fps the legs alias instead of animating');
      // and the legs must never scissor past what the geometry allows
      assert.ok(p.swingAmp <= Math.asin(o.sinMax) + 1e-9, `L=${L} speed=${speed}: over-scissored`);
      assert.ok(p.skate >= 0 && p.skate < 1, 'skate stays a reportable fraction');
    }
  }

  // The swing-leg knee, which is what stops both feet reaching the floor together. Two rigid
  // mirrored legs have their feet at identical heights twice a cycle, so the body stomps; the
  // knee is the only thing that breaks the tie. Measured on the rig: ground clearance went from
  // 5mm to 9% of leg length when this was added.
  for (const L of [short, tall]) {
    const thigh = L * 0.55, shin = L * 0.45;
    const footY = (pose, side) => {
      const hip = pose.legSwing * side - (pose.hipFlex ?? 0);
      const knee = hip + Math.max(0, side * (pose.kneeSwing ?? 0));
      return L - Math.cos(hip) * thigh - Math.cos(knee) * shin;
    };
    const at = (phase) => {
      const p = walkPhase(phase * walkPhase(0, 0.4, L, o).strideLen, 0.4, L, o);
      const out = { legSwing: 0, hipFlex: 0, kneeBend: 0, armSwing: 0, armSwingAlt: 0, spineBend: 0, spineRoll: 0 };
      walkLayer(out, p, 1, o);
      return out;
    };
    // side +1 is planted around phase 0 and mid-swing at 0.5, so at 0.5 its foot must be UP
    assert.ok(footY(at(0.5), 1) - footY(at(0.5), -1) > 0.02 * L,
      `L=${L}: the swinging foot must clear the planted one at mid-swing`);
    // and its knee must be straight through its own stance, or grounding sits on a short leg
    assert.ok(Math.max(0, 1 * at(0).kneeSwing) < 1e-9, `L=${L}: stance knee must be straight`);
  }
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

  // Counter-swing, stated the way applyPose actually computes it rather than as a sign on one
  // channel -- the previous version pinned `armSwingAlt < 0`, which is the BROKEN direction, so
  // it locked the bug in. Arms and legs both hang along -Y, so the same rotation.x sends both to
  // the same side of the body; a walk needs the same-side pair pointing opposite ways.
  for (const side of [-1, 1]) {
    const arm = on.armSwing - side * on.armSwingAlt;
    const leg = on.legSwing * side;
    assert.ok(arm * leg < 0,
      `side ${side}: arm ${arm.toFixed(3)} and leg ${leg.toFixed(3)} must swing opposite ways`);
  }

  assert.equal(on.kneeBend, 0,
    'the walk leaves kneeBend to the base pose and drives kneeSwing instead');
}

// --- the idle must not bounce a seated character --------------------------------------------
//
// groundCharacter derives root Y from the lowest foot, and that foot's sensitivity to hipFlex is
// sin(hip): ~0 standing, ~1 folded up (POSES.sit authors hipFlex 1.45). So an idle term sized
// for a standing character becomes a whole-body vertical bounce when seated -- measured 0.05mm
// standing against 5.20mm sitting, and still 4.38mm with the duty cycle at its lowest, which is
// what "the owls never stop moving when sitting" actually was.
{
  const L = 0.238, thigh = L * 0.55, shin = L * 0.45;
  const lowest = (pose) => Math.min(...[-1, 1].map((side) => {
    const hip = pose.legSwing * side - (pose.hipFlex ?? 0);
    const knee = hip + Math.max(0, side * (pose.kneeSwing ?? 0));
    return L - Math.cos(hip) * thigh - Math.cos(knee) * shin;
  }));

  const bob = (poseName) => {
    const o = opts();
    const m = makeMotion(POSES[poseName], 0.42);
    resetMotion(m, POSES[poseName]);
    const buf = {};
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 60 * 90; i++) {
      integrate(m, POSES[poseName], 1 / 60, o);
      compose(buf, m, o);
      const y = -lowest(buf);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return hi - lo;
  };

  const standing = bob('rest');
  assert.ok(bob('sit') <= standing + 1e-4,
    `a seated character bobs ${(bob('sit') * 1000).toFixed(2)}mm against `
    + `${(standing * 1000).toFixed(2)}mm standing -- the weight-shift idle has to fade out as `
    + 'the legs fold, or grounding turns it into a whole-body bounce');
}

// --- ears are part of the idle ---------------------------------------------------------------
//
// earPerk and earSplay existed from the day the rig was built and nothing drove them, so a
// llama's ears and an owl's tufts sat dead through every idle -- on an animal whose ears are
// half its silhouette, the most visibly missing thing on screen.
{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.42);
  resetMotion(m, POSES.rest);
  const buf = {};
  let flicks = 0, was = false, peak = 0, splay = 0;
  for (let i = 0; i < 60 * 180; i++) {
    integrate(m, POSES.rest, 1 / 60, o);
    compose(buf, m, o);
    const on = buf.earPerk > 0.01;
    if (on && !was) flicks++;
    was = on;
    peak = Math.max(peak, buf.earPerk);
    splay = Math.max(splay, Math.abs(buf.earSplay));
  }
  assert.ok(flicks / 3 > 2, `ears must flick while idling (got ${(flicks / 3).toFixed(1)}/min)`);
  assert.ok(splay > 0.01, 'a flick must be asymmetric, or both ears move as one slab');
  // headroom: BASE_GUI authors earPerk over -1.2..1.2 and POSES.delighted uses 0.38, so a flick
  // landing on top of delight must still be an angle an ear can physically reach
  assert.ok(peak + 0.38 < 1.2,
    `a flick on top of POSES.delighted reaches ${(peak + 0.38).toFixed(2)} rad, past what the `
    + 'rig authors for an ear');
}

// --- a long neck is not a broom handle --------------------------------------------------------
//
// The neck joint has always existed and has always been written; what it lacked was any motion
// of its OWN. It only ever took a fixed 0.35 share of wherever the head was looking, so it moved
// as a rigid extension of the head and a llama read as having a pole for a neck.
//
// npc.js owns the share (it needs the species' neckLength), so what is pinned here is the part
// motion.js is responsible for: the neck's independent rhythm.
{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.42);
  resetMotion(m, POSES.rest);
  const buf = {};
  let peak = 0, crossings = 0, prev = null;
  const SECS = 180;
  for (let i = 0; i < 60 * SECS; i++) {
    integrate(m, POSES.rest, 1 / 60, o);
    compose(buf, m, o);
    peak = Math.max(peak, Math.abs(buf.neckCurve));
    if (prev !== null && Math.sign(buf.neckCurve) !== Math.sign(prev)) crossings++;
    prev = buf.neckCurve;
  }
  assert.ok(peak > 0.01, 'the neck must move on its own, not only as a share of the head');
  // slower than the head's glancing, or a long neck whipping about reads as alarm
  const neckPeriod = (2 * SECS) / Math.max(1, crossings);
  assert.ok(neckPeriod > 3,
    `the neck settles every ${neckPeriod.toFixed(1)}s -- that is a whip, not a long neck easing`);

  // and it must stop when the character is told to stop, like every other idle
  const off = { ...o, idleAmount: 0 };
  const still = makeMotion(POSES.rest, 0.42);
  resetMotion(still, POSES.rest);
  integrate(still, POSES.rest, 1 / 60, off);
  compose(buf, still, off);
  assert.equal(buf.neckCurve, 0, 'neck motion must answer the master idle dial');
}

// --- Conscientiousness reaches a standing character -------------------------------------------
//
// It used to move zeta, stride, sway and lean, and every one of those is walk-or-arrival: a
// diligent character and a careless one were identical until they set off. `attend` is the
// standing tell.
{
  const o = opts();
  const still = (C) => {
    const t = { Volatility: 3, Withdrawal: 3, Enthusiasm: 3, Assertiveness: 3, Openness: 3,
      Intellect: 3, Compassion: 3, Politeness: 3, Industriousness: C, Orderliness: C };
    const co = { ...o, ...motionOf(t) };
    const m = makeMotion(POSES.rest, 0.42);
    resetMotion(m, POSES.rest);
    const buf = {};
    integrate(m, POSES.rest, 1 / 60, co);
    compose(buf, m, co);
    return { spineBend: buf.spineBend, co };
  };
  assert.ok(still(5).spineBend - still(1).spineBend > 0.1,
    'a conscientious character must lean in while STANDING, or C is invisible until they walk');

  // THE CROSSFADE. `attend` and `lean` are both the torso going forward. Summed, a focused and
  // purposeful character reaches about 20 degrees off vertical, which reads as falling rather
  // than as intent -- so walking must trade one for the other, not add them.
  let worst = 0;
  for (const C of [1, 3, 5]) {
    for (const E of [1, 3, 5]) {
      const t = { Volatility: 3, Withdrawal: 3, Enthusiasm: E, Assertiveness: E, Openness: 3,
        Intellect: 3, Compassion: 3, Politeness: 3, Industriousness: C, Orderliness: C };
      const co = { ...o, ...motionOf(t), idleAmount: 0 };
      for (const gain of [0, 0.25, 0.5, 0.75, 1]) {
        const m = makeMotion(POSES.rest, 0.42);
        resetMotion(m, POSES.rest);
        const buf = {};
        integrate(m, POSES.rest, 1 / 60, co);
        compose(buf, m, co);
        walkLayer(buf, walkPhase(0, 0.5, 0.238, co), gain, co);
        worst = Math.max(worst, Math.abs(buf.spineBend));
      }
    }
  }
  // POSES.browse leans 0.14 as a deliberate look-at-the-goods; twice that is falling over
  assert.ok(worst < 0.28,
    `forward lean reaches ${worst.toFixed(3)} rad (${(worst * 180 / Math.PI).toFixed(0)} deg) `
    + 'across personality and walk gain -- attention lean and gait lean must crossfade, not sum');
}

// --- fidgeting and breathing are separate tempos ----------------------------------------------
//
// A keyed-up character taps and jiggles several times faster than a placid one, but one
// BREATHING three times faster is panting -- distress, or having just run somewhere, not nerves.
// So idleRate drives the fidget clock fully and the breath clock only partly.
//
// The measurement that forced this: the weight shift used to run at 0.17x the breath frequency,
// so a cycle took 18.2s on a calm owl and 11.4s on the most volatile one. A drift, not a
// fidget, and no widening of idleRate could have fixed it.
{
  const period = (rate, key) => {
    const o = { ...opts(), idleRate: rate, idleDuty: 1 };
    const m = makeMotion(POSES.rest, 0.42);
    resetMotion(m, POSES.rest);
    const buf = {};
    let crossings = 0, prev = null;
    const SECS = 120;
    for (let i = 0; i < 60 * SECS; i++) {
      integrate(m, POSES.rest, 1 / 60, o);
      compose(buf, m, o);
      // count zero crossings of the channel's deviation from its settled value
      const v = buf[key] - (key === 'spineBend' ? -0 : 0);
      if (prev !== null && Math.sign(v) !== Math.sign(prev) && Math.abs(v) > 1e-6) crossings++;
      prev = v;
    }
    return crossings > 1 ? (2 * SECS) / crossings : Infinity;
  };

  const slowFidget = period(0.6, 'spineRoll');
  const fastFidget = period(3.0, 'spineRoll');
  assert.ok(fastFidget < slowFidget / 3,
    `a volatile character must fidget far faster: got ${fastFidget.toFixed(1)}s against `
    + `${slowFidget.toFixed(1)}s, which is not a difference anyone reads on screen`);
  assert.ok(fastFidget < 2,
    `the fastest fidget is ${fastFidget.toFixed(1)}s per cycle -- that is a drift, not a fidget`);

  // ...and breathing must NOT race with it
  const slowBreath = period(0.6, 'spineBend');
  const fastBreath = period(3.0, 'spineBend');
  assert.ok(fastBreath > slowBreath / 2.2,
    `breathing sped up ${(slowBreath / fastBreath).toFixed(1)}x with the fidget rate -- that is `
    + 'panting, which reads as distress rather than as nervous energy');
}

// --- walking style is universal: a species CANNOT tune it --------------------------------------
//
// The style dials are angles, and that is why they carry personality: a 40-degree arm swing is
// the same on any body, while a length is welded to leg length. The moment a kit could narrow
// `sway`, "excitable characters roll when they walk" would stop being true of the game and
// start being true of one animal -- and reading a walk would require knowing the species first.
//
// So this is enforced, not merely documented: passing style keys in a kit's ranges must change
// nothing at all. Without it the split is a naming convention that the next kit quietly breaks.
{
  const traits = t(3, { Enthusiasm: 5, Assertiveness: 5, Withdrawal: 1, Volatility: 1 });
  const base = motionOf(traits);
  const sabotage = {
    ...BASE_MOTION_RANGES,
    ...Object.fromEntries(Object.keys(STYLE_RANGES).map((k) => [k, [0, 0]])),
  };
  const after = motionOf(traits, sabotage);
  for (const k of Object.keys(STYLE_RANGES)) {
    assert.equal(after[k], base[k],
      `a kit flattened ${k} by passing it in MOTION_RANGES -- style must not be reachable `
      + 'from a species kit, or one animal ends up with no walking personality');
  }
  // and the per-species dials must still be reachable, or the split broke the wrong half
  assert.notEqual(motionOf(traits, { ...BASE_MOTION_RANGES, stiff: [10, 11] }).stiff, base.stiff,
    'a kit must still be able to tune the per-species spans');
}

// --- personality actually spreads the cast ---------------------------------------------------
//
// A dial wired to personality but bunched at the middle of its span is indistinguishable, on
// screen, from a dial wired to nothing -- which is exactly how it gets reported. A coefficient
// built from TWO traits lands on a triangular distribution, so without widening it occupies
// only 75% of its span against 100% for a single-trait one, and the middle 80% of a cast sits
// in a band far narrower than that suggests.
{
  // An exhaustive sweep of the eight assets motionOf reads -- the two halves of each of the four
  // factors that drive motion -- rather than a random sample, so this can never fail
  // intermittently. 5^8 is 390625 casts: every personality there is, as far as motion can see.
  // (Compassion and Politeness are absent because Agreeableness drives nothing here.)
  const DRIVERS = ['Volatility', 'Withdrawal', 'Enthusiasm', 'Assertiveness',
    'Industriousness', 'Orderliness', 'Openness', 'Intellect'];
  const vals = {};
  let N = 0;
  const walk = (i, traits) => {
    if (i === DRIVERS.length) {
      N++;
      for (const [k, v] of Object.entries(motionOf(traits))) (vals[k] ??= []).push(v);
      return;
    }
    for (let v = 1; v <= 5; v++) walk(i + 1, { ...traits, [DRIVERS[i]]: v });
  };
  walk(0, t(3));
  for (const [k, list] of Object.entries(vals)) {
    const [lo, hi] = BASE_MOTION_RANGES[k] ?? STYLE_RANGES[k];
    list.sort((a, b) => a - b);
    const p10 = list[Math.floor(N * 0.1)], p90 = list[Math.floor(N * 0.9)];
    const uses = (p90 - p10) / (hi - lo);
    assert.ok(uses > 0.85,
      `motionOf.${k} spreads a cast over only ${(uses * 100).toFixed(0)}% of its span `
      + `[${lo}, ${hi}] — too bunched to read as personality on screen`);
    assert.ok(p10 >= lo - 1e-9 && p90 <= hi + 1e-9, `motionOf.${k} escaped its span`);
  }
}

// --- every knob has a control -----------------------------------------------------------------
//
// A tunable with no slider can only be changed by editing source, which means it never gets
// tuned and quietly becomes a constant. This has already bitten twice: five sliders that were
// silently overwritten by the coefficient merge, and `kneeLift`, which shipped with no control
// at all so the swing-leg knee could not be dialled to zero to see what it was doing.
//
// Static check: the lab's own source must mention every MOTION_DEFAULTS key, either as a knob()
// call or as a BASE_MOTION_RANGES span (which generates its own min/max rows).
{
  const lab = readFileSync(new URL('./motion-lab.js', import.meta.url), 'utf8');
  const wired = new Set([...lab.matchAll(/knob\([^,]+,\s*[^,]+,\s*'([^']+)'/g)].map((m) => m[1]));
  // Only BASE_MOTION_RANGES generates the per-species min/max rows; STYLE_RANGES is not
  // per-species and deliberately has no rows in that folder.
  const spans = new Set(Object.keys(BASE_MOTION_RANGES));

  for (const k of Object.keys(MOTION_DEFAULTS)) {
    // `mode` is the bake-off engine, chosen per row by the lab's layout rather than by a slider
    if (k === 'mode') continue;
    assert.ok(wired.has(k) || spans.has(k),
      `MOTION_DEFAULTS.${k} has no control in motion-lab.js: add a knob() for it, or a span in `
      + 'BASE_MOTION_RANGES if it should vary per species');
  }

  // Every span also needs a plain-English label, or its two generated rows render as
  // "undefined — least" and "undefined — most". Adding a key to BASE_MOTION_RANGES and
  // forgetting SPAN_HELP is a one-line omission with no other symptom.
  const help = lab.slice(lab.indexOf('const SPAN_HELP'));
  const labelled = new Set([...help.slice(0, help.indexOf('};')).matchAll(/^\s*(\w+):/gm)]
    .map((m) => m[1]));
  for (const k of spans) {
    assert.ok(labelled.has(k),
      `BASE_MOTION_RANGES.${k} has no SPAN_HELP entry in motion-lab.js, so its two slider rows `
      + 'will both read "undefined"');
  }

  // and the reverse: a knob naming a key that no longer exists is a slider wired to nothing
  const known = new Set([...Object.keys(MOTION_DEFAULTS), ...spans]);
  for (const k of wired) {
    if (!known.has(k) && /^(stiff|zeta|blend|idle|stride|bounce|knee|arm|sway|lean|head|gate|cadence|sin)/.test(k)) {
      assert.ok(false, `motion-lab.js has a knob for '${k}', which is not a motion key any more`);
    }
  }
}

// --- head yaw is anatomy, and species differ in it enormously ---------------------------------
//
// headYawMax lives in the rig params next to neckLength, not in the motion ranges, because it is
// a fact about the animal rather than about one individual's temperament. Anything that turns a
// head asks for an angle and gets clamped to what that species actually has -- which is what
// lets one shared look-at serve a 264-degree owl and a 109-degree llama with no per-species code.
//
// Asserted here on the pose side (the clamp itself lives in npc.js applyPose, which needs three):
// headArc scales how much they IDLY glance and must stay modest, or every character spends the
// day staring backwards.
{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  const buf = out();
  let hi = 0;
  for (let i = 0; i < 3600; i++) {
    integrate(m, POSES.rest, 1 / 60, { ...o, headArc: 2.2 });      // the owl's widest span
    compose(buf, m, { ...o, headArc: 2.2 });
    hi = Math.max(hi, Math.abs(buf.headYaw));
  }
  assert.ok(hi * 180 / Math.PI < 45,
    `idle glancing must stay modest even at the widest headArc (got ${(hi * 180 / Math.PI).toFixed(0)}deg) `
    + '-- the full swivel is for deliberate looks, not for standing around');
  assert.ok(hi > 0.05, 'but they must still look around while idle');
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
      assert.ok(!(k in STYLE_RANGES),
        `${k} is in both range tables -- a key belongs to exactly one, or which one wins `
        + 'depends on lookup order');
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
