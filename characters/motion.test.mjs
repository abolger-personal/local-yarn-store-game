import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POSES, POSE_KEYS, MOTION_KEYS, MOTION_DEFAULTS, BASE_MOTION_RANGES, STYLE_RANGES,
  makeMotion, resetMotion, integrate, compose, valueOf, velocityOf,
  motionOf, walkPhase, phaseStep, walkLayer, walkGain, spanBounds,
  DANCES, DANCE_POSES, DANCE_NAMES, makeDance, stepDance, tailStep,
} from './motion.js';

const opts = (over = {}) => ({ ...MOTION_DEFAULTS, ...over });
const out = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
const run = (m, target, o, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) integrate(m, target, dt, o);
  return m;
};

{
  const A = { armSwing: 0 }, B = { armSwing: -1.15 }, C = { armSwing: -0.45 };
  const dt = 1 / 60, BLEND = 0.35;

  let from = A.armSwing, to = B.armSwing, pt = 0, cur = A.armSwing, prev = A.armSwing;
  const step = () => {
    prev = cur;
    pt = Math.min(1, pt + dt / BLEND);
    const e = pt * pt * (3 - 2 * pt);
    cur = from + (to - from) * e;
  };
  for (let i = 0; i < 10; i++) step();
  const vBefore = (cur - prev) / dt;
  from = cur; to = C.armSwing; pt = 0;
  step();
  const vAfter = (cur - prev) / dt;

  assert.ok(Math.abs(vBefore) > 1, 'reference: the channel really is moving before the interrupt');
  assert.ok(Math.abs(vAfter) < Math.abs(vBefore) * 0.1,
    'reference: smoothstep loses >90% of its velocity across an interrupt -- this is the hitch');

  for (const mode of ['spring', 'hermite']) {
    const o = opts({ mode });
    const jumps = [1 / 60, 1 / 240, 1 / 960].map((dtx) => {
      const m = makeMotion(A, 0.5);
      for (let e = 0; e < 1 / 6; e += dtx) integrate(m, B, dtx, o);
      const v0 = velocityOf(m, 'armSwing');
      assert.ok(Math.abs(v0) > 0.5, `${mode}: genuinely moving before the interrupt`);
      const p0 = valueOf(m, 'armSwing');
      integrate(m, C, dtx, o);
      assert.ok(Math.abs(valueOf(m, 'armSwing') - p0) < Math.abs(v0) * dtx * 3,
        `${mode}: position carries across the interrupt`);
      return Math.abs(velocityOf(m, 'armSwing') - v0);
    });

    assert.ok(jumps[1] < jumps[0] * 0.6 && jumps[2] < jumps[1] * 0.6,
      `${mode}: the velocity step shrinks with dt, so velocity is CONTINUOUS across an `
      + `interrupt (got ${jumps.map((j) => j.toFixed(3)).join(' -> ')})`);
  }

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
    walkLayer(buf, walkPhase((i / 60) % 1, 0.5, 0.238, MOTION_DEFAULTS), 1, MOTION_DEFAULTS);
    for (const k of POSE_KEYS) {
      assert.ok(Number.isFinite(buf[k]), `${k} is finite using only MOTION_DEFAULTS (frame ${i})`);
    }
  }
}

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

{
  const o = opts();
  const sample = (duty) => {
    const m = makeMotion(POSES.rest, 0.4);
    const buf = out();
    let stillFrames = 0, peakSway = 0, peakBreath = 0, prev = null;
    for (let i = 0; i < 7200; i++) {
      integrate(m, POSES.rest, 1 / 60, { ...o, idleDuty: duty });
      compose(buf, m, { ...o, idleDuty: duty });
      if (prev !== null && Math.abs(buf.spineRoll - prev) < 1e-4) stillFrames++;
      prev = buf.spineRoll;
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

{
  const sample = (over) => {
    const o = opts(over);
    const m = makeMotion(POSES.rest, 0.4);
    const buf = out();
    const peak = {};
    let blinks = 0, was = false;
    for (let i = 0; i < 7200; i++) {
      integrate(m, POSES.rest, 1 / 60, o);
      compose(buf, m, o);
      for (const k of POSE_KEYS) {
        peak[k] = Math.max(peak[k] ?? 0, Math.abs(buf[k] - (POSES.rest[k] ?? 0)));
      }
      const b = (buf.blink ?? 0) > 0.5;
      if (b && !was) blinks++;
      was = b;
    }
    return { peak, blinks };
  };

  const still = sample({ idleAmp: 0 });
  assert.ok(still.peak.spineBend > 0.02,
    `a character who does not fidget must still BREATHE (chest moved ${still.peak.spineBend
      .toFixed(4)} rad) -- idleAmp 0 is a temperament, not a pulse check`);
  assert.ok(still.blinks > 10,
    `and still blink (${still.blinks} in two minutes) -- a blink is not a fidget either`);
  assert.equal(still.peak.spineRoll, 0, 'but the weight shift must be gone at idleAmp 0');
  assert.equal(still.peak.earPerk, 0, 'and the ears must stop flicking');

  const off = sample({ idleAmount: 0 });
  for (const k of POSE_KEYS) {
    assert.equal(off.peak[k], 0, `idleAmount 0 must freeze ${k} solid: it is the reduce-motion `
      + 'switch and the A/B for measuring what continuous motion costs');
  }
  assert.equal(off.blinks, 0, 'idleAmount 0 stops the blinking too -- no idle means no idle');
}

{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.4);
  const buf = out();
  const trace = [];
  for (let i = 0; i < 7200; i++) {
    integrate(m, POSES.rest, 1 / 60, o);
    compose(buf, m, o);
    trace.push(buf.spineRoll);
  }
  const amp = Math.max(...trace.map(Math.abs));
  const frac = (test) => trace.filter(test).length / trace.length;
  const middle = frac((v) => Math.abs(v) < amp * 0.33);
  const ends = frac((v) => Math.abs(v) > amp * 0.75);

  assert.ok(ends > middle,
    `a weight shift must spend longer held on a foot (${(100 * ends).toFixed(0)}%) than crossing `
    + `between them (${(100 * middle).toFixed(0)}%) -- a lean that is always mid-crossing is a `
    + 'boat, and reads as one');
  assert.ok(ends > 0.55,
    `and genuinely dwell at the extremes (${(100 * ends).toFixed(0)}%; a pure sine manages 46%, `
    + 'and a sine whose amplitude is faded in and out manages 24%)');
  assert.ok(middle > 0.08,
    `but the crossing must stay smooth (${(100 * middle).toFixed(0)}% mid) -- a square wave is a `
    + 'twitch, not a shift of weight');
}

{
  const rates = [];
  for (let i = 0; i < 200; i++) rates.push(makeMotion(POSES.rest, i / 200).rateA);
  const lo = Math.min(...rates), hi = Math.max(...rates);
  assert.ok(hi / lo > 2,
    `idle sub-rhythms must differ by more than 2x across a cast (got ${(hi / lo).toFixed(2)}x, `
    + `${lo.toFixed(2)}..${hi.toFixed(2)}) -- close rates beat against each other instead of `
    + 'being independent, which is what makes a crowd look like one wave');
}

{
  const body = (over) => {
    const o = opts(over);
    const m = makeMotion(POSES.rest, 0.4);
    const buf = out();
    const peak = { spineBend: 0, spineRoll: 0, headTilt: 0 };
    for (let i = 0; i < 7200; i++) {
      integrate(m, POSES.rest, 1 / 60, o);
      compose(buf, m, o);
      for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], Math.abs(buf[k]));
    }
    return peak;
  };

  const calm = body({ idleAmp: 0.30, headArc: 1.70 });
  const lively = body({ idleAmp: 1.10, headArc: 2.20 });

  assert.ok(calm.spineBend > lively.spineBend * 0.6,
    `a calm character must still visibly breathe (${calm.spineBend.toFixed(3)} rad against `
    + `${lively.spineBend.toFixed(3)} for a lively one) -- breath depth is not fidget amplitude, `
    + 'and a chest that goes quiet with the fidget dial reads as a statue with a moving head');

  for (const [name, p] of [['calm', calm], ['lively', lively]]) {
    const ratio = p.headTilt / p.spineRoll;
    assert.ok(ratio < 1.5,
      `${name}: the head tilts ${ratio.toFixed(1)}x as far as the body rolls, on the SAME wave `
      + '-- a head outswinging its own shoulders reads as detached, not as alert');
  }
  const drift = Math.abs(calm.headTilt / calm.spineRoll - lively.headTilt / lively.spineRoll);
  assert.ok(drift < 0.1,
    `head-to-body tilt ratio must not change with the fidget dial (drifted ${drift.toFixed(2)}) `
    + '-- that is the two channels taking their amplitude from different places again');
}

{
  const o = opts();
  const T = (over) => ({ ...t(3), ...over });
  const BOLD = T({ Enthusiasm: 5, Assertiveness: 5, Withdrawal: 1, Industriousness: 5, Orderliness: 1 });
  const SHY = T({ Enthusiasm: 1, Assertiveness: 1, Withdrawal: 5, Industriousness: 1, Orderliness: 5 });
  const STYLE = ['armSwingAlt', 'spineRoll', 'spineBend', 'headPitch', 'elbowBend'];

  const signature = (traits, L, speed = 0.35) => {
    const co = { ...o, ...motionOf(traits, BASE_MOTION_RANGES), idleAmount: 0 };
    const m = makeMotion(POSES.rest, 0.5);
    const buf = out();
    const w0 = walkPhase(0, speed, L, co);
    const peak = {};
    for (let i = 0; i < 240; i++) {
      integrate(m, POSES.rest, 1 / 60, co);
      compose(buf, m, co);
      walkLayer(buf, { ...w0, phase: i / 240 }, 1, co);
      for (const k of STYLE) peak[k] = Math.max(peak[k] ?? 0, Math.abs(buf[k]));
    }
    return peak;
  };

  const SHORT = 0.085 + 0.045, TALL = 0.345 + 0.045;

  const bold = signature(BOLD, SHORT), shy = signature(SHY, SHORT);
  assert.ok(bold.armSwingAlt > shy.armSwingAlt * 3,
    `personality must drive arm swing (bold ${bold.armSwingAlt.toFixed(2)} vs `
    + `shy ${shy.armSwingAlt.toFixed(2)}) -- these were once identical`);
  assert.ok(bold.spineRoll > shy.spineRoll * 3, 'and how much the body rolls');
  assert.ok(bold.spineBend > shy.spineBend + 0.05, 'and how far they lean in');
  assert.equal(bold.elbowBend, shy.elbowBend,
    'armTuck must not vary with personality -- it is an emotion channel now');
  const carry = (t) => motionOf(t, BASE_MOTION_RANGES).headCarry;
  assert.ok(carry(SHY) > carry(BOLD) + 0.1,
    `and how they carry their head (shy ${carry(SHY).toFixed(2)} vs bold ${carry(BOLD).toFixed(2)}) `
    + '-- positive is down and closed, negative is up and open');

  const tall = signature(BOLD, TALL, 0.35 * (TALL / SHORT));
  for (const k of STYLE) {
    assert.ok(Math.abs(bold[k] - tall[k]) < 0.02,
      `${k} must not change with leg length (${bold[k].toFixed(3)} vs ${tall[k].toFixed(3)})`);
  }

  const strolling = signature(BOLD, SHORT, 0.12);
  assert.ok(bold.spineRoll < strolling.spineRoll - 0.01,
    `a faster cadence must damp the sway (hurrying ${bold.spineRoll.toFixed(3)} vs `
    + `strolling ${strolling.spineRoll.toFixed(3)}) -- otherwise the torso rolls the same `
    + 'amount in half the time, which reads as a vibration rather than a swagger');

  const asked = Math.abs(motionOf(BOLD, BASE_MOTION_RANGES).sway);
  assert.ok(strolling.spineRoll > asked * 0.9,
    `the rate cap must not be the ceiling on an ordinary walk (asked ${asked.toFixed(3)} rad, `
    + `delivered ${strolling.spineRoll.toFixed(3)} strolling) -- a cap that binds at every `
    + 'speed makes the whole sway span undialable, not just a hurried one');
}

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
  const per = motionOf(traits, BASE_MOTION_RANGES);
  for (const k of ['blend', 'idleAmount', 'idleDuty', 'gateSpeed', 'sinMax']) {
    assert.equal(base[k], MOTION_DEFAULTS[k], `${k} must survive the motionOf merge`);
    assert.ok(!(k in per), `${k} must not be returned by motionOf, or its slider is clobbered`);
  }
}

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

{
  const o = opts();
  const short = 0.085 + 0.045, tall = 0.430 + 0.045;

  const a = walkPhase(0, 0.2, short, o), b = walkPhase(0, 0.2, tall, o);
  assert.ok(Math.abs(a.swingAmp - b.swingAmp) < 1e-12,
    'swing amplitude is scale-invariant: the leg length cancels out of asin(stride/4)');
  assert.ok(b.strideLen > a.strideLen * 2, 'a longer leg takes a proportionally longer stride');

  for (const L of [short, tall]) {
    const w = walkPhase(0, 0.2, L, o);
    assert.ok(Math.abs(phaseStep(w.strideLen, 0.2, L, o) - 1) < 1e-12,
      `one stride is one cycle at L=${L}`);
    assert.ok(Math.abs(phaseStep(w.strideLen / 4, 0.2, L, o) - 0.25) < 1e-12,
      `and a quarter of it is a quarter cycle at L=${L}`);
  }

  const w = walkPhase(0, 0.2, short, o);
  const dist = 2.0;
  assert.ok(Math.abs((dist / w.strideLen) * w.strideLen - dist) < 1e-12, 'distance reconciles');

  {
    const L = short;
    const len = 2.0, dur = 1.4, dt = 1 / 60;
    const ease = (x) => x * x * (3 - 2 * x);
    for (const startPhase of [0, 0.37]) {
      let phase = startPhase, prev = null, worst = 0, cycles = 0;
      for (let i = 0; i <= dur / dt; i++) {
        const tNow = Math.min(1, (i * dt) / dur);
        const moved = len * (ease(tNow) - ease(Math.max(0, tNow - dt / dur)));
        const speed = moved / dt;
        if (prev !== null) {
          let d = phase - prev;
          d -= Math.round(d);
          worst = Math.max(worst, Math.abs(d));
          cycles += Math.abs(d);
        }
        prev = phase;
        phase = (phase + phaseStep(moved, speed, L, o)) % 1;
      }
      assert.ok(worst < 0.2,
        `the gait must not jump (worst ${(100 * worst).toFixed(1)}% of a cycle in one frame) -- `
        + 'a phase that leaps on deceleration is legs spinning, not a walk');
      const honest = len / walkPhase(0, 0.2, L, o).strideLen;
      assert.ok(cycles < honest * 1.6,
        `a ${len}-unit move must be about ${honest.toFixed(1)} cycles, not ${cycles.toFixed(1)} `
        + '-- extra cycles are the phase spinning, and they scale with how far they have walked');
    }
  }

  assert.equal(walkPhase(0, 0.2, short, o).skate, 0, 'no skate at a walkable speed');
  assert.ok(walkPhase(0, 4.0, short, o).skate > 0.5,
    'skate is reported, not hidden, once the geometric ceiling binds');

  for (const L of [short, tall, 0.13, 0.475]) {
    for (const speed of [0.15, 0.4, 0.8]) {
      const p = walkPhase(0, speed, L, o);
      if (p.skate > 0) continue;
      const travel = 2 * L * Math.sin(p.swingAmp);
      assert.ok(Math.abs(travel - p.strideLen / 2) < 1e-9,
        `foot travel ${travel.toFixed(4)} must equal half the stride ${(p.strideLen / 2).toFixed(4)} `
        + `(L=${L}, speed=${speed}) or the planted foot slides`);
    }
  }

  {
    const marching = { ...o, kneeLift: 1.4 };
    const T = 0.238, thigh = T * 0.55;
    let kneeFrontAtPeak = 0, peakFlex = 0;
    for (let i = 0; i < 400; i++) {
      const buf = { legSwing: 0, hipFlex: 0, kneeBend: 0, armSwing: 0, armSwingAlt: 0,
        spineBend: 0, spineRoll: 0, kneeSwing: 0 };
      walkLayer(buf, walkPhase(i / 400, 0.5, T, marching), 1, marching);
      const flex = Math.max(0, buf.kneeSwing);
      if (flex > peakFlex) {
        peakFlex = flex;
        kneeFrontAtPeak = -Math.sin(buf.legSwing - buf.hipFlex) * thigh;
      }
    }
    assert.ok(peakFlex > 0.1, 'the knee must actually flex');
    assert.ok(kneeFrontAtPeak > 0.01,
      `at peak knee flexion the knee sits ${kneeFrontAtPeak.toFixed(4)} from the hip -- it has `
      + 'to be IN FRONT, or the gait reads as a butt kick however high the lift goes');
  }

  for (const L of [0.103, 0.238, 0.448]) {
    for (const speed of [0.2, 1, 2.5, 6, 20]) {
      const p = walkPhase(0, speed, L, o);
      const cadence = (2 * speed) / p.strideLen;
      assert.ok(cadence <= o.cadenceMax + 1e-9,
        `L=${L} speed=${speed}: ${cadence.toFixed(1)} steps/s exceeds the ${o.cadenceMax} cap `
        + '-- at 60fps the legs alias instead of animating');
      assert.ok(p.swingAmp <= Math.asin(o.sinMax) + 1e-9, `L=${L} speed=${speed}: over-scissored`);
      assert.ok(p.skate >= 0 && p.skate < 1, 'skate stays a reportable fraction');
    }
  }

  for (const L of [short, tall]) {
    const thigh = L * 0.55, shin = L * 0.45;
    const footY = (pose, side) => {
      const hip = pose.legSwing * side - (pose.hipFlex ?? 0);
      const knee = hip + Math.max(0, side * (pose.kneeSwing ?? 0));
      return L - Math.cos(hip) * thigh - Math.cos(knee) * shin;
    };
    const at = (phase) => {
      const p = walkPhase(phase, 0.4, L, o);
      const out = { legSwing: 0, hipFlex: 0, kneeBend: 0, armSwing: 0, armSwingAlt: 0, spineBend: 0, spineRoll: 0 };
      walkLayer(out, p, 1, o);
      return out;
    };
    assert.ok(footY(at(0.5), 1) - footY(at(0.5), -1) > 0.02 * L,
      `L=${L}: the swinging foot must clear the planted one at mid-swing`);
    assert.ok(Math.max(0, 1 * at(0).kneeSwing) < 1e-9, `L=${L}: stance knee must be straight`);
  }
}

{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  m.walkGain = 1;
  for (let i = 0; i < 300; i++) walkGain(m, 0, 1 / 60, o);
  assert.equal(m.walkGain, 0, 'walk gain reaches EXACTLY zero when stopped, not merely near it');

  const base = out(), walked = out();
  const w = walkPhase(0.3, 0, 0.238, o);
  walkLayer(walked, w, 0, o);
  assert.deepEqual(walked, base, 'at zero gain the walk layer contributes nothing at all');

  const on = out();
  walkLayer(on, walkPhase(0.25, 0.5, 0.238, o), 1, o);
  assert.ok(on.legSwing > 0.05, 'the legs swing');

  for (const side of [-1, 1]) {
    const arm = on.armSwing - side * on.armSwingAlt;
    const leg = on.legSwing * side;
    assert.ok(arm * leg < 0,
      `side ${side}: arm ${arm.toFixed(3)} and leg ${leg.toFixed(3)} must swing opposite ways`);
  }

  assert.equal(on.kneeBend, 0,
    'the walk leaves kneeBend to the base pose and drives kneeSwing instead');
}

{
  const o = { ...opts(), idleDuty: 1 };
  const swing = (gain) => {
    const m = makeMotion(POSES.rest, 0.42);
    resetMotion(m, POSES.rest);
    m.walkGain = gain;
    const buf = {};
    let lo = Infinity, hi = -Infinity, headLo = Infinity, headHi = -Infinity;
    for (let i = 0; i < 60 * 90; i++) {
      integrate(m, POSES.rest, 1 / 60, o);
      m.walkGain = gain;
      compose(buf, m, o);
      lo = Math.min(lo, buf.spineRoll); hi = Math.max(hi, buf.spineRoll);
      headLo = Math.min(headLo, buf.headYaw); headHi = Math.max(headHi, buf.headYaw);
    }
    return { roll: hi - lo, head: headHi - headLo };
  };

  const standing = swing(0), walking = swing(1);
  assert.ok(walking.roll < standing.roll * 0.05,
    `the standing weight shift must stop while walking (${walking.roll.toFixed(3)} against `
    + `${standing.roll.toFixed(3)}) -- the walk's own sway is already doing that job`);
  assert.ok(standing.roll > 0.05, 'and it must still be there while standing');

  assert.ok(walking.head < standing.head * 0.75,
    'a walking character should scan less than a standing one');
  assert.ok(walking.head > standing.head * 0.2,
    `but must not stop looking around (${walking.head.toFixed(3)} against `
    + `${standing.head.toFixed(3)}) -- curiosity does not switch off because your feet moved`);
}

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
  assert.ok(peak + 0.38 < 1.2,
    `a flick on top of POSES.delighted reaches ${(peak + 0.38).toFixed(2)} rad, past what the `
    + 'rig authors for an ear');
}

{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.42);
  resetMotion(m, POSES.rest);
  const buf = {};
  integrate(m, POSES.rest, 1 / 60, o);
  compose(buf, m, o);
  assert.ok(buf.elbowBend > 0.1,
    `a resting arm must keep some bend (got ${buf.elbowBend.toFixed(3)}) -- dead straight reads `
    + 'as a doll, and it cannot depend on a personality channel to supply it');
  for (const name of Object.keys(POSES)) {
    assert.ok((POSES[name].elbowBend ?? 0) > 0.1,
      `POSES.${name} authors elbowBend ${(POSES[name].elbowBend ?? 0).toFixed(2)} -- every pose `
      + 'needs some, or it locks the arm straight');
  }
}

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
  const neckPeriod = (2 * SECS) / Math.max(1, crossings);
  assert.ok(neckPeriod > 3,
    `the neck settles every ${neckPeriod.toFixed(1)}s -- that is a whip, not a long neck easing`);

  const off = { ...o, idleAmount: 0 };
  const still = makeMotion(POSES.rest, 0.42);
  resetMotion(still, POSES.rest);
  integrate(still, POSES.rest, 1 / 60, off);
  compose(buf, still, off);
  assert.equal(buf.neckCurve, 0, 'neck motion must answer the master idle dial');
}

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
  assert.ok(worst < 0.28,
    `forward lean reaches ${worst.toFixed(3)} rad (${(worst * 180 / Math.PI).toFixed(0)} deg) `
    + 'across personality and walk gain -- attention lean and gait lean must crossfade, not sum');
}

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

  const slowBreath = period(0.6, 'spineBend');
  const fastBreath = period(3.0, 'spineBend');
  assert.ok(fastBreath > slowBreath / 2.2,
    `breathing sped up ${(slowBreath / fastBreath).toFixed(1)}x with the fidget rate -- that is `
    + 'panting, which reads as distress rather than as nervous energy');
}

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
  assert.notEqual(motionOf(traits, { ...BASE_MOTION_RANGES, stiff: [10, 11] }).stiff, base.stiff,
    'a kit must still be able to tune the per-species spans');
}

{
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
    if (k === 'armTuck') continue;
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

{
  const lab = readFileSync(new URL('./motion-lab.js', import.meta.url), 'utf8');
  const wired = new Set([...lab.matchAll(/knob\([^,]+,\s*[^,]+,\s*'([^']+)'/g)].map((m) => m[1]));
  const spans = new Set(Object.keys(BASE_MOTION_RANGES));

  for (const k of Object.keys(MOTION_DEFAULTS)) {
    if (k === 'mode') continue;
    assert.ok(wired.has(k) || spans.has(k),
      `MOTION_DEFAULTS.${k} has no control in motion-lab.js: add a knob() for it, or a span in `
      + 'BASE_MOTION_RANGES if it should vary per species');
  }

  const help = lab.slice(lab.indexOf('const SPAN_HELP'));
  const labelled = new Set([...help.slice(0, help.indexOf('};')).matchAll(/^\s*(\w+):/gm)]
    .map((m) => m[1]));
  for (const k of spans) {
    assert.ok(labelled.has(k),
      `BASE_MOTION_RANGES.${k} has no SPAN_HELP entry in motion-lab.js, so its two slider rows `
      + 'will both read "undefined"');
  }

  const known = new Set([...Object.keys(MOTION_DEFAULTS), ...spans]);
  for (const k of wired) {
    if (!known.has(k) && /^(stiff|zeta|blend|idle|stride|bounce|knee|arm|sway|lean|head|gate|cadence|sin)/.test(k)) {
      assert.ok(false, `motion-lab.js has a knob for '${k}', which is not a motion key any more`);
    }
  }
}

{
  for (const k of Object.keys(BASE_MOTION_RANGES)) {
    const [lo, hi] = BASE_MOTION_RANGES[k];
    const [floor, ceil] = spanBounds(k, lo, hi);
    assert.ok(ceil > hi, `${k}'s slider must reach ABOVE the shipped span, or a kit that authors `
      + 'a bolder value than the base cannot be dialled to it');
    if (k === 'bounce') {
      assert.ok(floor < 0, 'bounce must still go negative -- that is how the free bob from the '
        + 'legs scissoring gets cancelled, and it is a documented setting');
      continue;
    }
    assert.ok(floor >= 0,
      `${k}'s span slider floor is ${floor.toFixed(2)}: it is an amount, and below zero it is `
      + 'either meaningless (a flipped phase, a backwards clock) or unstable (NaN damping, '
      + 'injected energy). Add it to SIGNED_SPANS only if negative is a real setting');
  }

  const [floor] = spanBounds('kneeLift', 0.35, 1.70);
  assert.ok(floor === 0, `a span whose pad crosses zero must stop AT zero, not at its own low `
    + `end (got ${floor}) -- no knee lift at all is a real setting`);
  const [stiffFloor] = spanBounds('stiff', 100, 120);
  assert.ok(stiffFloor > 0 && stiffFloor < 100,
    `a span whose pad does NOT cross zero must keep its padding (got ${stiffFloor})`);
}

{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  const buf = out();
  let hi = 0;
  for (let i = 0; i < 3600; i++) {
    integrate(m, POSES.rest, 1 / 60, { ...o, headArc: 2.2 });
    compose(buf, m, { ...o, headArc: 2.2 });
    hi = Math.max(hi, Math.abs(buf.headYaw));
  }
  assert.ok(hi * 180 / Math.PI < 45,
    `idle glancing must stay modest even at the widest headArc (got ${(hi * 180 / Math.PI).toFixed(0)}deg) `
    + '-- the full swivel is for deliberate looks, not for standing around');
  assert.ok(hi > 0.05, 'but they must still look around while idle');
}

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

  const narrow = { ...BASE_MOTION_RANGES, stiff: [140, 150] };
  const lo = motionOf(t(3, { Assertiveness: 1, Withdrawal: 5 }), narrow).stiff;
  const hi = motionOf(t(3, { Assertiveness: 5, Withdrawal: 1 }), narrow).stiff;
  assert.ok(hi - lo <= 10, 'a narrowed species span compresses the whole cast into it');
  assert.ok(hi > lo, 'but the ordering inside the span survives');

  const wide = motionOf(t(3, { Assertiveness: 5, Withdrawal: 1 }), BASE_MOTION_RANGES).stiff
             - motionOf(t(3, { Assertiveness: 1, Withdrawal: 5 }), BASE_MOTION_RANGES).stiff;
  assert.ok(wide > 100, 'and a wide span gives the same traits real spread');
}

function t(all, over = {}) {
  return {
    Volatility: all, Withdrawal: all, Enthusiasm: all, Assertiveness: all, Intellect: all,
    Openness: all, Compassion: all, Politeness: all, Industriousness: all, Orderliness: all,
    ...over,
  };
}

{
  const o = opts();
  const m = makeMotion(POSES.rest, 0.5);
  run(m, POSES.delighted, o, 20);
  assert.ok(Math.abs(velocityOf(m, 'armOut')) > 0.1, 'moving before the reset');
  resetMotion(m, POSES.rest);
  assert.equal(velocityOf(m, 'armOut'), 0, 'reset zeroes velocity');
  assert.equal(valueOf(m, 'armOut'), POSES.rest.armOut, 'reset snaps to the pose');
}

{
  assert.ok(DANCE_NAMES.length >= 5, 'DANCES.md asks for five dances');

  for (const [name, pose] of Object.entries(DANCE_POSES)) {
    for (const k of POSE_KEYS) {
      assert.equal(typeof pose[k], 'number', `dance pose ${name} is missing ${k}`);
      assert.ok(Number.isFinite(pose[k]), `dance pose ${name}.${k} is not finite`);
    }
  }

  for (const name of DANCE_NAMES) {
    const d = DANCES[name];
    assert.ok(d.steps.length > 0, `${name} has no steps`);
    for (const s of d.steps) {
      assert.ok(s.pose in DANCE_POSES, `${name} names a pose that does not exist: ${s.pose}`);
      assert.ok(s.hold > 0, `${name} has a step with hold ${s.hold} -- the advance loop needs > 0`);
    }
    if (!d.loop) continue;
    for (const e of d.extras) {
      assert.equal(e.turn, 0, `${name} loops, so it may not turn the root`);
      assert.equal(e.travel, 0, `${name} loops, so it may not travel`);
    }
  }
}

{
  const d = makeDance('riverdance');
  const a = stepDance(d, 0).pose;
  const b = stepDance(d, 1 / 60).pose;
  assert.equal(a, b, 'the same step must hand back the SAME pose object, not an equal one');
  assert.equal(a, DANCE_POSES[DANCES.riverdance.steps[0].pose], 'and it must be the frozen singleton');
}

{
  for (const name of DANCE_NAMES) {
    const d = DANCES[name];
    const total = d.steps.reduce((s, x) => s + x.hold, 0);
    const perf = makeDance(name);
    let elapsed = 0, endedAt = null;
    for (let i = 0; i < 4000; i++) {
      const r = stepDance(perf, 1 / 120);
      elapsed += 1 / 120;
      if (r.done && endedAt === null) endedAt = elapsed;
    }
    if (d.loop) {
      assert.equal(endedAt, null, `${name} loops and must never report done`);
    } else {
      assert.ok(endedAt !== null, `${name} does not loop and must finish`);
      assert.ok(Math.abs(endedAt - total) < 0.05,
        `${name} ran ${endedAt?.toFixed(2)}s against ${total.toFixed(2)}s of holds`);
    }
  }
}

{
  for (const name of DANCE_NAMES) {
    const perf = makeDance(name);
    let prev = stepDance(perf, 0);
    for (let i = 0; i < 1200; i++) {
      const now = stepDance(perf, 1 / 120);
      for (const k of ['turn', 'rise', 'travel', 'shift']) {
        assert.ok(Math.abs(now[k] - prev[k]) < 0.25,
          `${name}: ${k} jumped ${(now[k] - prev[k]).toFixed(3)} in one frame at step ${perf.i}`);
      }
      prev = now;
    }
  }
}

{
  const perf = makeDance('uptown-funk');
  const samples = [];
  for (let i = 0; i < 400; i++) samples.push(stepDance(perf, 1 / 120));
  const moving = samples.filter((s) => s.walk > 0);
  const frozen = samples.filter((s) => s.walk === 0);
  assert.ok(moving.length > 20, 'the strut must spend real time stepping');
  assert.ok(frozen.length > 20, 'and real time frozen mid-step -- that pause IS the dance');

  let crept = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].walk === 0 && samples[i - 1].walk === 0) {
      crept = Math.max(crept, Math.abs(samples[i].travel - samples[i - 1].travel));
    }
  }
  assert.ok(crept < 1e-9, `the character crept ${crept.toFixed(5)} during a freeze`);

  const firstFreeze = samples.findIndex((s) => s.walk === 0);
  assert.ok(samples.slice(firstFreeze).some((s) => s.walk > 0),
    'the walk must come back after a freeze -- `walk` falls back to the dance, it does not carry');
}

{
  for (const name of DANCE_NAMES) {
    if (!DANCES[name].loop) continue;
    const perf = makeDance(name);
    let prev = stepDance(perf, 0);
    let prevStep = perf.i;
    let wraps = 0, worst = 0, worstKey = null;
    for (let i = 0; i < 2400; i++) {
      const now = stepDance(perf, 1 / 240);
      if (perf.i === 0 && prevStep !== 0) wraps += 1;
      for (const k of ['turn', 'rise', 'travel', 'shift']) {
        const jump = Math.abs(now[k] - prev[k]);
        if (jump > worst) { worst = jump; worstKey = k; }
      }
      prev = now;
      prevStep = perf.i;
    }
    assert.ok(wraps >= 2, `${name} loops but only wrapped ${wraps} times -- the probe is too short`);
    assert.ok(worst < 0.01,
      `${name}: ${worstKey} jumped ${worst.toFixed(4)} across ${wraps} loop wraps`);
  }
}

{
  const perf = makeDance('pirouette');
  let last = null;
  for (let i = 0; i < 1000; i++) last = stepDance(perf, 1 / 120);
  assert.ok(last.done, 'the pirouette should have finished by now');
  assert.ok(Math.abs(last.turn % (Math.PI * 2)) < 1e-9,
    `a pirouette must end on a whole turn -- ended ${last.turn.toFixed(4)} rad off`);
  assert.equal(last.rise, 0, 'and back down off the releve');
}

{
  const spring = { stiff: 260, zeta: 0.35, reach: 0.3, droop: -1.0 };
  const buf = { ...out(), tailYaw: 0, tailPitch: 0 };

  const m = makeMotion(POSES.rest, 0.3);
  let rootPeakAt = -1, tipPeakAt = -1, rootPeak = 0, tipPeak = 0, firstSwing = 0;
  for (let i = 0; i < 240; i++) {
    buf.tailYaw = 0; buf.tailPitch = 0; buf.spineRoll = 0;
    tailStep(m, buf, [i < 6 ? 30 : 0, 0, 0], 1 / 120, spring);
    if (i === 8) firstSwing = buf.tailYaw;
    if (buf.tailYaw > rootPeak) { rootPeak = buf.tailYaw; rootPeakAt = i; }
    if (buf.tailYawTip > tipPeak) { tipPeak = buf.tailYawTip; tipPeakAt = i; }
  }
  assert.ok(firstSwing > 0.02, `a sideways shove must swing the tail the other way first -- got ${firstSwing.toFixed(3)}`);
  assert.ok(rootPeak > 0.05, `and visibly -- peak yaw ${rootPeak.toFixed(3)}`);
  assert.ok(tipPeakAt > rootPeakAt, `the tip must trail the root (root peaked at ${rootPeakAt}, tip at ${tipPeakAt})`);
  assert.ok(Math.abs(buf.tailYaw) < 0.01 && Math.abs(buf.tailYawTip) < 0.01,
    `and it settles back: yaw ${buf.tailYaw.toFixed(4)} two seconds later`);

  const r = makeMotion(POSES.rest, 0.3);
  for (let i = 0; i < 240; i++) {
    Object.assign(buf, { tailYaw: 0, tailPitch: 0, spineRoll: 0.1 });
    tailStep(r, buf, [0, 0, 0], 1 / 60, spring);
  }
  assert.ok(buf.tailYaw > 0.1, `a tail must swing against the body's roll -- got ${buf.tailYaw.toFixed(3)}`);

  const up = motionOf(t(3, { Enthusiasm: 5, Assertiveness: 5, Volatility: 1, Withdrawal: 1 }));
  const down = motionOf(t(3, { Enthusiasm: 1, Assertiveness: 1, Volatility: 5, Withdrawal: 5 }));
  assert.ok(up.tailCarry > 0.2 && down.tailCarry < -0.2,
    `outgoing must carry the tail up and anxious tuck it -- got ${up.tailCarry} and ${down.tailCarry}`);
  const c = makeMotion(POSES.rest, 0.3);
  integrate(c, POSES.rest, 1 / 60, opts({ ...up, idleAmount: 0 }));
  compose(buf, c, opts({ ...up, idleAmount: 0 }));
  assert.equal(buf.tailPitch, up.tailCarry, 'carriage is posture, so it holds with the idle off');
  assert.equal(buf.tailYaw, 0, 'and with the idle off and no wag the tail is still');

  let wag = 0;
  const d = makeMotion(POSES.rest, 0.3);
  for (let i = 0; i < 180; i++) {
    integrate(d, POSES.delighted, 1 / 60, opts({ idleAmount: 0 }));
    compose(buf, d, opts({ idleAmount: 0 }));
    wag = Math.max(wag, Math.abs(buf.tailYaw));
  }
  assert.ok(wag > 0.3, `a delighted character wags -- peak target yaw ${wag.toFixed(3)}`);
  assert.ok(POSES.sit.tailLift > 0.5, 'a seated tail is lifted clear of the seat cube');
}

console.log('motion.js self-check: all assertions passed');
