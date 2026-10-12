// Rules and invariant: ai_planning_sessions/characters/MOTION.md
export const POSE_KEYS = [
  'armSwing', 'armSwingAlt', 'armOut', 'armOutAlt', 'elbowBend', 'legSwing', 'kneeBend',
  'hipFlex', 'spineBend', 'spineRoll', 'spineTwist', 'earPerk', 'earSplay',
  'headYaw', 'headPitch', 'headTilt', 'tailLift', 'tailWag',
];

export const MOTION_KEYS = [...POSE_KEYS, 'hold'];

const HOLD = MOTION_KEYS.indexOf('hold');
const TAU = Math.PI * 2;

export const REST_POSE = Object.freeze({
  armSwing: 0, armSwingAlt: 0, armOut: 0, armOutAlt: 0, elbowBend: 0, legSwing: 0, kneeBend: 0,
  hipFlex: 0, spineBend: 0, spineRoll: 0, spineTwist: 0, earPerk: 0, earSplay: 0,
  headYaw: 0, headPitch: 0, headTilt: 0, tailLift: 0, tailWag: 0,
  holdItem: false, blink: 0,
});

const definePoses = (raw) => Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([name, pose]) => [name, Object.freeze({ ...REST_POSE, ...pose })]),
));

export const POSES = definePoses({
  rest:   { armOut: 0.16, elbowBend: 0.22 },
  walk:   { armSwing: 0.42, armOut: 0.14, elbowBend: 0.30, legSwing: 0.30, kneeBend: 1.50 },
  carry:  { armSwing: -0.12, armOut: 0.02, elbowBend: 1.45, holdItem: true },
  reach:  { armSwing: -1.15, armOut: 0.30, elbowBend: 0.35 },
  browse: { armSwing: -0.45, armOut: 0.34, elbowBend: 0.85, spineBend: 0.14 },
  sit:    { armSwing: -0.10, armOut: 0.22, elbowBend: 0.75, kneeBend: 1.45, hipFlex: 1.45, spineBend: 0.10,
            tailLift: 1.0 },
  delighted: { armSwing: -0.30, armOut: 2.55, elbowBend: 0.55, kneeBend: 0.10, earPerk: 0.38, earSplay: 0.22,
               tailLift: 0.45, tailWag: 1 },
  'walk+carry': { armSwing: -0.10, armOut: 0.03, elbowBend: 1.40, legSwing: 0.30, kneeBend: 1.50, holdItem: true },
});

// ponytail: `shift` moves the whole root, so the feet slide with the hips; upgrade is hip abduction plus grounding that follows it.
const resolveExtras = (steps) => {
  let cur = { turn: 0, rise: 0, travel: 0, shift: 0 };
  return steps.map((s) => {
    cur = {
      turn: s.turn ?? cur.turn,
      rise: s.rise ?? cur.rise,
      travel: s.travel ?? cur.travel,
      shift: s.shift ?? cur.shift,
    };
    return Object.freeze(cur);
  });
};

const resolveWalk = (steps, dance) => Object.freeze(steps.map((s) => s.walk ?? dance ?? 0));
const NO_EXTRAS = Object.freeze({ turn: 0, rise: 0, travel: 0, shift: 0 });

const defineDances = (raw) => Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([name, d]) => [name, Object.freeze({
    ...d,
    steps: Object.freeze(d.steps.map((s) => Object.freeze({ ...s }))),
    extras: Object.freeze(resolveExtras(d.steps)),
    walkAt: resolveWalk(d.steps, d.walk),
  })]),
));

export const DANCE_POSES = definePoses({
  'rd-left':  { armOut: 0.10, elbowBend: 0.06, legSwing: -0.95, hipFlex: 0.95, kneeBend: 1.90, headPitch: -0.05 },
  'rd-right': { armOut: 0.10, elbowBend: 0.06, legSwing: 0.95, hipFlex: 0.95, kneeBend: 1.90, headPitch: -0.05 },
  'rd-kick-l': { armOut: 0.10, elbowBend: 0.06, legSwing: -0.80, hipFlex: 0.80, kneeBend: 0.15, headPitch: -0.05 },
  'rd-kick-r': { armOut: 0.10, elbowBend: 0.06, legSwing: 0.80, hipFlex: 0.80, kneeBend: 0.15, headPitch: -0.05 },
  'rd-hop': { armOut: 0.12, elbowBend: 0.06, legSwing: 0, hipFlex: 0.34, kneeBend: 0.82, headPitch: -0.05 },
  'rd-behind-l': { armOut: 0.10, elbowBend: 0.06, legSwing: 0.72, hipFlex: 0, kneeBend: 0, headPitch: -0.05 },
  'rd-behind-r': { armOut: 0.10, elbowBend: 0.06, legSwing: -0.72, hipFlex: 0, kneeBend: 0, headPitch: -0.05 },

  'floss-l': {
    armOutAlt: 1.05, armSwingAlt: -0.55, armOut: 0.30, elbowBend: 0.04,
    spineTwist: 0.30, spineRoll: 0.26, hipFlex: 0.10, headYaw: 0.12,
  },
  'floss-r': {
    armOutAlt: -1.05, armSwingAlt: 0.55, armOut: 0.30, elbowBend: 0.04,
    spineTwist: -0.30, spineRoll: -0.26, hipFlex: 0.10, headYaw: -0.12,
  },

  'att-prep': { armOut: 0.55, elbowBend: 0.50, hipFlex: 0.30, kneeBend: 0.75 },
  'att-hold': {
    armOut: 1.00, armOutAlt: 1.10, elbowBend: 0.45, armSwing: -0.20,
    legSwing: 0.95, hipFlex: -0.95, kneeBend: 1.25,
    spineBend: 0.12, headTilt: 0.15, headPitch: -0.08, earPerk: 0.25,
  },

  'pir-plie':  { armOut: 0.70, elbowBend: 0.90, armSwing: -0.25, hipFlex: 0.35, kneeBend: 0.90 },
  'pir-turn':  {
    armOut: 0.30, elbowBend: 1.25, armSwing: -0.55,
    legSwing: -0.70, hipFlex: 0.70, kneeBend: 2.30, earPerk: 0.20,
  },
  'pir-open':  { armOut: 0.90, armOutAlt: 0.35, elbowBend: 0.50, armSwing: -0.30, hipFlex: 0.18, kneeBend: 0.45, earPerk: 0.30 },

  'uf-step-l': { spineTwist: 0.22, spineRoll: -0.20, armSwingAlt: 0.40, armOut: 0.30, elbowBend: 0.60, headYaw: -0.15, earPerk: 0.20 },
  'uf-step-r': { spineTwist: -0.22, spineRoll: 0.20, armSwingAlt: -0.40, armOut: 0.30, elbowBend: 0.60, headYaw: 0.15, earPerk: 0.20 },
  'uf-snap-l': {
    spineTwist: 0.52, spineRoll: -0.58, armSwingAlt: 0.95, armOutAlt: -0.55,
    armOut: 0.62, elbowBend: 0.95, headYaw: -0.45, headTilt: -0.22, earPerk: 0.45, earSplay: 0.18,
    legSwing: -0.40, kneeBend: 0.60,
  },
  'uf-snap-r': {
    spineTwist: -0.52, spineRoll: 0.58, armSwingAlt: -0.95, armOutAlt: 0.55,
    armOut: 0.62, elbowBend: 0.95, headYaw: 0.45, headTilt: 0.22, earPerk: 0.45, earSplay: 0.18,
    legSwing: 0.40, kneeBend: 0.60,
  },
});

export const DANCES = defineDances({
  riverdance: {
    stiff: 520, zeta: 0.80, loop: true, walk: 0,
    steps: [
      { pose: 'rd-kick-l', hold: 0.19 },
      { pose: 'rd-hop', hold: 0.15, hop: 0.055 },
      { pose: 'rd-behind-l', hold: 0.17 },
      { pose: 'rd-right', hold: 0.16 },
      { pose: 'rd-hop', hold: 0.15, hop: 0.045 },
      { pose: 'rd-kick-r', hold: 0.19 },
      { pose: 'rd-hop', hold: 0.15, hop: 0.055 },
      { pose: 'rd-behind-r', hold: 0.17 },
      { pose: 'rd-left', hold: 0.16 },
      { pose: 'rd-hop', hold: 0.15, hop: 0.045 },
    ],
  },
  floss: {
    stiff: 380, zeta: 0.75, loop: true, walk: 0,
    steps: [
      { pose: 'floss-l', hold: 0.23, shift: -0.038 },
      { pose: 'floss-r', hold: 0.23, shift: 0.038 },
    ],
  },
  attitude: {
    stiff: 190, zeta: 1.00, loop: false, walk: 0,
    steps: [
      { pose: 'att-prep', hold: 0.35 },
      { pose: 'att-hold', hold: 1.40, rise: 0.02 },
      { pose: 'att-prep', hold: 0.45, rise: 0 },
    ],
  },
  pirouette: {
    stiff: 260, zeta: 0.95, loop: false, walk: 0,
    steps: [
      { pose: 'pir-plie', hold: 0.34 },
      { pose: 'pir-turn', hold: 0.70, turn: TAU, rise: 0.035 },
      { pose: 'pir-open', hold: 0.55, rise: 0 },
    ],
  },
  'uptown-funk': {
    stiff: 340, zeta: 0.70, loop: false, walk: 0.85,
    steps: [
      { pose: 'uf-step-l', hold: 0.26, travel: 0.42 },
      { pose: 'uf-snap-l', hold: 0.40, travel: 0.42, walk: 0 },
      { pose: 'uf-step-r', hold: 0.26, travel: 0.84 },
      { pose: 'uf-snap-r', hold: 0.40, travel: 0.84, walk: 0 },
      { pose: 'uf-step-l', hold: 0.26, travel: 1.26 },
      { pose: 'uf-snap-l', hold: 0.52, travel: 1.26, walk: 0 },
    ],
  },
});

export const DANCE_NAMES = Object.freeze(Object.keys(DANCES));

export const makeDance = (name) => ({ name, i: 0, t: 0, done: false, looped: false });

const sCurve = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function advanceDance(d, dance, dt) {
  const { steps } = dance;
  d.t += dt;
  while (!d.done && d.t >= steps[d.i].hold) {
    d.t -= steps[d.i].hold;
    if (d.i + 1 < steps.length) d.i += 1;
    else if (dance.loop) { d.i = 0; d.looped = true; }
    else { d.done = true; d.t = 0; }
  }
}

function extrasBefore(d, extras) {
  if (d.i > 0) return extras[d.i - 1];
  return d.looped ? extras[extras.length - 1] : NO_EXTRAS;
}

export function stepDance(d, dt) {
  const dance = DANCES[d.name];
  const { steps, extras, walkAt } = dance;
  advanceDance(d, dance, dt);
  const step = steps[d.i];
  const raw = d.done ? 1 : Math.min(1, d.t / step.hold);
  const u = sCurve(raw);
  const from = extrasBefore(d, extras);
  const to = extras[d.i];
  const hop = (step.hop ?? 0) * Math.sin(Math.PI * raw);
  return {
    pose: DANCE_POSES[step.pose],
    turn: mix(from.turn, to.turn, u),
    rise: mix(from.rise, to.rise, u) + hop,
    travel: mix(from.travel, to.travel, u),
    shift: mix(from.shift, to.shift, u),
    walk: walkAt[d.i],
    done: d.done,
  };
}

export const MOTION_DEFAULTS = Object.freeze({
  mode: /** @type {'spring' | 'hermite' | 'smoothstep'} */ ('spring'),

  stiff: 150,
  zeta:  1.00,
  blend: 0.35,

  idleAmount: 1,
  idleAmp:  1,
  idleRate: 1,
  idleDuty: 0.65,
  headArc:  1,

  stride:    1.80,
  bounce:    0.05,
  kneeLift:  0.55,
  marchRatio: 0.55,
  armGain:   0.55,
  sway:      0.075,
  attend:    0,
  headCarry: 0,
  headCock:  0,
  armTuck:   0,
  tailCarry: 0,
  lean:      0.06,
  gateSpeed: 0.86,
  swayRateMax: 1.25,
  cadenceMax: 3.4,
  cadenceMin: 0,
  sinMax:    0.5646,
});

export const BASE_MOTION_RANGES = Object.freeze({
  stiff:    [60, 240],
  zeta:     [0.45, 1.00],
  idleAmp:  [0.40, 1.60],
  idleRate: [0.60, 3.00],
  stride:   [1.40, 2.24],
  bounce:   [0.00, 0.12],
  kneeLift: [0.35, 0.78],
  headArc:  [0.50, 1.50],
});

const SIGNED_SPANS = new Set(['bounce']);

export function spanBounds(k, lo, hi) {
  const pad = (hi - lo) * 1.5;
  return [SIGNED_SPANS.has(k) ? lo - pad : Math.max(0, lo - pad), hi + pad];
}

export const STYLE_RANGES = Object.freeze({
  armGain:   [0.20, 1.10],
  sway:      [0.02, 0.26],
  lean:      [0.00, 0.17],
  headCarry: [-0.24, 0.22],
  headCock:  [0.00, 0.20],
  attend:    [-0.05, 0.18],
  // ponytail: a constant elbow offset, so it also bends a reach; fade posture during arm poses if a knitting pose lands
  armTuck:   [0.00, 0.50],
  tailCarry: [-0.35, 0.35],
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const span = (range, u) => range[0] + (range[1] - range[0]) * clamp01(u);

/**
 * @param {Record<string, number>} traits
 * @param {Record<string, number[]>} [ranges]
 */
export function motionOf(traits, ranges = BASE_MOTION_RANGES) {
  const u = traitPositions(traits);
  const pick = (k) => span(ranges[k] ?? BASE_MOTION_RANGES[k], u[k]);
  const style = (k) => span(STYLE_RANGES[k], u[k]);
  return {
    stiff: pick('stiff'), zeta: pick('zeta'), idleAmp: pick('idleAmp'),
    idleRate: pick('idleRate'), stride: pick('stride'), bounce: pick('bounce'),
    kneeLift: pick('kneeLift'),
    headArc: pick('headArc'), armGain: style('armGain'), sway: style('sway'),
    lean: style('lean'), headCarry: style('headCarry'), headCock: style('headCock'),
    attend: style('attend'), armTuck: style('armTuck'), tailCarry: style('tailCarry'),
  };
}

// MOTION.md §Traits to motion
const SPREAD = 1.9;
const pair = (d) => clamp01(0.5 + SPREAD * d);

export function factors(t) {
  return {
    Neuroticism: (t.Volatility + t.Withdrawal) / 2,
    Extraversion: (t.Enthusiasm + t.Assertiveness) / 2,
    OpennessIntellect: (t.Openness + t.Intellect) / 2,
    Agreeableness: (t.Compassion + t.Politeness) / 2,
    Conscientiousness: (t.Industriousness + t.Orderliness) / 2,
  };
}

const FACTOR_Q = Object.freeze([0, 0.0625, 0.1667, 0.3125, 0.5, 0.6875, 0.8333, 0.9375, 1]);
const factorUnit = (a, b) => FACTOR_Q[a + b - 2];

function factorUnits(t) {
  return {
    N: factorUnit(t.Volatility, t.Withdrawal),
    E: factorUnit(t.Enthusiasm, t.Assertiveness),
    C: factorUnit(t.Industriousness, t.Orderliness),
    O: factorUnit(t.Openness, t.Intellect),
  };
}

function traitPositions(t) {
  const { N, E, C, O } = factorUnits(t);
  return {
    stiff: pair(0.5 * (E - N)),
    zeta: pair(0.5 * (C - N)),
    idleAmp: pair(0.5 * (E - N)),
    idleRate: N, stride: C, bounce: E,
    kneeLift: C,
    headArc: O,
    armGain: pair(0.5 * (E - N)),
    sway: pair(0.5 * (E - C)),
    lean: pair(0.5 * (E + C) - 0.5),
    headCarry: pair(0.5 * (N - E)),
    headCock: O,
    attend: C,
    armTuck: 0,
    tailCarry: pair(0.5 * (E - N)),
  };
}

// MOTION.md §Integration
const MAX_DT = 1 / 30;

const MAX_H = 1 / 120;

const WAG_W = TAU * 2.0;
const WAG_AMP = 0.45;
const FLICK_DUR = 0.34;
const BLINK_DUR = 0.12;
const BREATH_W = TAU * 0.25;

const FIDGET_W = TAU * 0.30;

const breathRate = (r) => 0.65 + 0.35 * r;

const breathDepth = (amp) => 0.65 + 0.35 * amp;

/** @typedef {ReturnType<typeof makeMotion>} Motion */
/** @typedef {typeof MOTION_DEFAULTS & ReturnType<typeof motionOf>} MotionOpts */

function readInto(arr, pose) {
  for (let i = 0; i < MOTION_KEYS.length; i++) arr[i] = pose[MOTION_KEYS[i]] ?? 0;
  arr[HOLD] = pose.holdItem ? 1 : 0;
  return arr;
}

function rhythms(seed) {
  return {
    seed: seed * TAU,
    idlePhase: seed * TAU,
    fidgetPhase: seed * TAU,
    rateA: 0.55 + seed * 1.05,
    rateB: 0.30 + (1 - seed) * 0.55,
    blinkT: 1 + seed * 4,
    earT: 0.7 + seed * 5,
    earWay: seed < 0.5 ? -1 : 1,
    cockWay: seed < 0.5 ? -1 : 1,
    wagPhase: seed * TAU,
  };
}

export function makeMotion(pose, seed = Math.random()) {
  const n = MOTION_KEYS.length;
  const m = {
    cur: new Float64Array(n), vel: new Float64Array(n),
    from: new Float64Array(n), fromVel: new Float64Array(n), to: new Float64Array(n),
    target: null,
    tail: new Float64Array(8),
    t: 1,
    walkGain: 0,
    ...rhythms(seed),
  };
  readInto(m.cur, pose);
  m.to.set(m.cur);
  return m;
}

export function resetMotion(m, pose) {
  readInto(m.cur, pose);
  m.vel.fill(0);
  m.to.set(m.cur);
  m.target = null;
  m.t = 1;
  m.walkGain = 0;
  m.tail.fill(0);
  return m;
}

export const valueOf = (m, key) => m.cur[MOTION_KEYS.indexOf(key)];
export const velocityOf = (m, key) => m.vel[MOTION_KEYS.indexOf(key)];

/**
 * @param {Motion} m
 * @param {Record<string, any>} target
 * @param {number} dt
 * @param {MotionOpts} opts
 */
export function integrate(m, target, dt, opts) {
  const step = dt > MAX_DT ? MAX_DT : dt;
  const retargeted = target !== m.target;
  if (retargeted) {
    m.from.set(m.cur);
    m.fromVel.set(m.vel);
    readInto(m.to, target);
    m.target = target;
    m.t = 0;
  }

  if (opts.mode === 'hermite') hermite(m, step, opts);
  else if (opts.mode === 'smoothstep') smoothstep(m, step, opts);
  else spring(m, step, opts);

  advanceClocks(m, dt, opts);
  return m;
}

function advanceClocks(m, dt, opts) {
  m.idlePhase += dt * BREATH_W * breathRate(opts.idleRate);
  if (m.idlePhase > TAU * 1e6) m.idlePhase %= TAU;
  m.fidgetPhase += dt * FIDGET_W * opts.idleRate
    * dutyGate(m.idlePhase, opts.idleDuty ?? 1, m.seed);
  if (m.fidgetPhase > TAU * 1e6) m.fidgetPhase %= TAU;

  m.wagPhase += dt * WAG_W * (0.7 + 0.3 * opts.idleRate);
  if (m.wagPhase > TAU * 1e6) m.wagPhase %= TAU;

  m.blinkT -= dt;
  if (m.blinkT < -BLINK_DUR) m.blinkT = 2 + Math.random() * 5;

  m.earT -= dt * (0.45 + 0.55 * (opts.idleDuty ?? 1));
  if (m.earT < -FLICK_DUR) {
    m.earT = 1.4 + Math.random() * 6;
    m.earWay = Math.random() < 0.5 ? -1 : 1;
  }
}

function spring(m, dt, opts) {
  const k = opts.stiff;
  const c = 2 * opts.zeta * Math.sqrt(k);
  const n = Math.ceil(dt / MAX_H) || 1;
  const h = dt / n;
  const { cur, vel, to } = m;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < cur.length; i++) {
      vel[i] += ((to[i] - cur[i]) * k - vel[i] * c) * h;
      cur[i] += vel[i] * h;
    }
  }
}

function hermite(m, dt, opts) {
  const dur = opts.blend;
  m.t = Math.min(1, m.t + dt / dur);
  const { t } = m, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2;
  const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1, d01 = -6 * t2 + 6 * t;
  const { cur, vel, from, fromVel, to } = m;
  for (let i = 0; i < cur.length; i++) {
    const m0 = fromVel[i] * dur;
    cur[i] = h00 * from[i] + h10 * m0 + h01 * to[i];
    vel[i] = (d00 * from[i] + d10 * m0 + d01 * to[i]) / dur;
  }
}

function smoothstep(m, dt, opts) {
  m.t = Math.min(1, m.t + dt / opts.blend);
  const e = m.t * m.t * (3 - 2 * m.t);
  const de = (6 * m.t - 6 * m.t * m.t) / opts.blend;
  const { cur, vel, from, to } = m;
  for (let i = 0; i < cur.length; i++) {
    cur[i] = from[i] + (to[i] - from[i]) * e;
    vel[i] = (to[i] - from[i]) * de;
  }
}

export function compose(out, m, opts) {
  for (let i = 0; i < POSE_KEYS.length; i++) out[POSE_KEYS[i]] = m.cur[i];
  out.holdItem = m.cur[HOLD] > 0.5;
  out.blink = 0;
  out.kneeSwing = 0;
  out.neckCurve = 0;

  out.headPitch += opts.headCarry ?? 0;
  out.headTilt += (opts.headCock ?? 0) * m.cockWay;
  out.spineBend += opts.attend ?? 0;
  out.elbowBend += opts.armTuck ?? 0;
  out.tailPitch = out.tailLift + (opts.tailCarry ?? 0);
  out.tailYaw = out.tailWag * WAG_AMP * Math.sin(m.wagPhase);

  if (opts.idleAmount <= 0) return out;
  const a = opts.idleAmount * opts.idleAmp;

  idleLayer(out, m, opts, a);
  if (m.blinkT < 0) out.blink = Math.sin((1 + m.blinkT / BLINK_DUR) * Math.PI);
  return out;
}

function earFlick(out, m, a) {
  if (m.earT >= 0) return;
  const k = Math.sin((1 + m.earT / FLICK_DUR) * Math.PI);
  out.earPerk += a * 0.30 * k;
  out.earSplay += a * 0.16 * k * m.earWay;
}

function dutyGate(p, duty, seed) {
  if (duty >= 1) return 1;
  const e = Math.sin(p * 0.37 + seed * 1.7);
  const threshold = 1 - 2 * duty;
  return Math.max(0, Math.min(1, (e - threshold) / 0.35));
}

function idleLayer(out, m, opts, a) {
  const p = m.idlePhase;
  const g = a * dutyGate(p, opts.idleDuty ?? 1, m.seed);
  const breath = (opts.idleAmount ?? 1) * breathDepth(opts.idleAmp ?? 1);
  out.spineBend -= breath * 0.045 * Math.sin(p);
  out.armOut += breath * 0.022 * Math.sin(p);

  const q = m.fidgetPhase;
  // MOTION.md §Idle: the weight shift dwells
  const w = Math.tanh(2.2 * Math.sin(q * m.rateA + m.seed)) / Math.tanh(2.2);

  const still = 1 - (m.walkGain ?? 0);
  out.spineRoll += a * still * 0.085 * w;

  const upright = clamp01(1 - Math.abs(out.hipFlex) / 0.9);
  out.hipFlex += a * upright * still * 0.020 * Math.sin(q * m.rateA * 2 + m.seed);
  const look = (opts.idleAmount ?? 1) * opts.headArc * (0.40 + 0.60 * still)
    * dutyGate(p, opts.idleDuty ?? 1, m.seed);
  out.neckCurve = look * 0.075 * Math.sin(q * m.rateB * 0.62 + m.seed * 5);

  out.tailYaw += a * 0.12 * Math.sin(q * m.rateB * 0.7 + m.seed * 7);

  out.headTilt += g * still * 0.070 * w;
  headLook(out, m, look, q);
  earFlick(out, m, a);
}

function headLook(out, m, look, q) {
  out.headYaw += look * 0.180 * Math.sin(q * m.rateB + m.seed * 2);
  out.headPitch += look * 0.055 * Math.sin(q * m.rateB * 0.8 + m.seed * 3);
}

const TAIL_TIP = 0.55;
const _rootSpring = [0, 0, 0], _tipSpring = [0, 0, 0];
const TAIL_MAX = 1.3;
// MOTION.md §Tail
const TAIL_COUNTER = 2.5;
const tailLim = (v) => Math.min(TAIL_MAX, Math.max(-TAIL_MAX, v));

/**
 * @param {Motion} m
 * @param {Record<string, number>} out
 * @param {number[]} accel
 * @param {number} dt
 * @param {{stiff: number, zeta: number, reach: number, droop: number}} tail
 */
export function tailStep(m, out, accel, dt, { stiff, zeta, reach, droop }) {
  const step = dt > MAX_DT ? MAX_DT : dt;
  const n = Math.ceil(step / MAX_H) || 1, h = step / n;
  const s = m.tail;
  const root = springOf(_rootSpring, stiff, zeta, h), tip = springOf(_tipSpring, stiff * TAIL_TIP, zeta, h);
  const p = droop + s[1];
  const fy = accel[0] / reach;
  const fp = -(accel[1] * Math.cos(p) + accel[2] * Math.sin(p)) / reach;
  const yaw = out.tailYaw + TAIL_COUNTER * out.spineRoll;
  for (let i = 0; i < n; i++) {
    chase(s, 0, yaw, fy, root);
    chase(s, 1, out.tailPitch, fp, root);
    chase(s, 4, s[0], fy, tip);
    chase(s, 5, s[1], fp, tip);
  }
  out.tailYaw = tailLim(s[0]);
  out.tailPitch = tailLim(s[1]);
  out.tailYawTip = tailLim(s[4]);
  out.tailPitchTip = tailLim(s[5]);
}

function springOf(sp, k, zeta, h) {
  sp[0] = k;
  sp[1] = 2 * zeta * Math.sqrt(k);
  sp[2] = h;
  return sp;
}

function chase(s, i, to, f, sp) {
  const k = sp[0], c = sp[1], h = sp[2];
  s[i + 2] += ((to - s[i]) * k - s[i + 2] * c + f) * h;
  s[i] += s[i + 2] * h;
}

export function topSpeed(L, opts) {
  return (opts.cadenceMax * 4 * L * opts.sinMax) / 2;
}

const wrap01 = (x) => ((x % 1) + 1) % 1;

export function strideFor(speed, L, opts) {
  const natural = opts.cadenceMin > 0
    ? Math.min(opts.stride * L, Math.max((2 * speed) / opts.cadenceMin, 1e-6))
    : opts.stride * L;
  const needed = opts.cadenceMax > 0 ? (2 * speed) / opts.cadenceMax : natural;
  return Math.max(natural, needed);
}

export function walkPhase(at, speed, L, opts) {
  const ceiling = 4 * L * opts.sinMax;
  const gaitLen = strideFor(speed, L, opts);
  const reach = Math.min(gaitLen, ceiling);
  const swingAmp = Math.asin(Math.min(reach / (4 * L), opts.sinMax));
  const skate = gaitLen > reach ? (gaitLen - reach) / gaitLen : 0;
  return { phase: wrap01(at), strideLen: gaitLen, reach, swingAmp, skate,
           cadence: 2 * speed / gaitLen };
}

export function phaseStep(moved, speed, L, opts) {
  const gaitLen = strideFor(speed, L, opts);
  return gaitLen > 0 ? moved / gaitLen : 0;
}

export function walkLayer(out, w, gain, opts) {
  if (gain <= 0) return out;
  const s = Math.sin(TAU * w.phase);

  const lift = opts.kneeLift * (opts.marchRatio ?? 0);
  const hipOf = (ph) => w.swingAmp * Math.sin(TAU * ph)
    - lift * Math.max(0, -Math.cos(TAU * ph));
  const near = hipOf(w.phase), far = hipOf(w.phase + 0.5);
  out.legSwing += gain * (near - far) * 0.5;
  out.hipFlex -= gain * (near + far) * 0.5;
  out.armSwingAlt += gain * opts.armGain * w.swingAmp * s;
  // ponytail: one rectified knee harmonic, so a flicker near footstrike remains (MOTION-TODO.md §Known ceiling)
  out.kneeSwing = -gain * opts.kneeLift * Math.cos(TAU * w.phase);
  // ponytail: past ~0.12 bounce this walks in a crouch; a deeper bob needs a pelvis height channel
  out.hipFlex += gain * opts.bounce * (0.5 - 0.5 * Math.cos(2 * TAU * w.phase));
  out.spineBend += gain * (opts.lean - (opts.attend ?? 0));
  const rate = Math.abs(opts.sway) * TAU * w.cadence * 0.5;
  const swayCap = rate > opts.swayRateMax ? opts.swayRateMax / rate : 1;
  out.spineRoll += gain * opts.sway * swayCap * Math.cos(TAU * w.phase);
  return out;
}

export function walkGain(m, speed, dt, opts) {
  const want = Math.min(1, speed / opts.gateSpeed);
  const lambda = 6;
  m.walkGain += (want - m.walkGain) * (1 - Math.exp(-lambda * Math.min(dt, MAX_DT)));
  if (m.walkGain < 1e-4) m.walkGain = 0;
  return m.walkGain;
}
