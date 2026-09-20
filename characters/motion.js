// Pose data and pose maths: the channel list, the named poses, the interpolators, the idle
// layer and the walk cycle.
//
// Pure: no three.js, no DOM, no scene. Same rule as visit.js and wip.js, and for the same
// reason -- characters/motion.test.mjs runs this under bare `node`. npc.js imports three AND
// three/addons, so anything testable that way cannot live there. npc.js re-exports the pose
// data from here, so no existing import site had to change.
//
// THE INVARIANT, and everything here depends on it:
//
//   cur[] and vel[] hold the COMMANDED pose only. The idle layer, the walk layer,
//   clampArmOut and groundCharacter are read-only consumers DOWNSTREAM of it.
//   Nothing downstream is ever written back upstream.
//
// Five things break if that is violated. A filter that reads its own output is an oscillator,
// so the spring would chase the idle and emit a phase-lagged second copy of it (reads as a
// tremor). Idle amplitude would become trait-dependent by accident, because a spring's response
// to a sinusoid depends on the idle frequency over sqrt(stiff) -- a stiff character would
// breathe DEEPER than a withdrawn one, the opposite of the intent and undebuggable from the
// amplitude constant. The interrupt handover would stop being reproducible, so the motion lab
// could never hit the same interrupt twice. A blink is a ~120ms snap and through a 0.35s spring
// becomes a slow droop. And clampArmOut forces armOut UP, so fed back it would ratchet: a llama
// resting near the body ellipsoid gets pushed out, starts the next frame from the pushed value,
// gets pushed again -- arms rising over a minute, and nobody would ever find it.

// ---------------------------------------------------------------- channels

// The interpolated channels. `holdItem` is NOT here -- it is a boolean, and Boolean(0.37) is
// true, so interpolating it would show a carried item at 37% of the way through a blend. It
// rides as the derived `hold` scalar in MOTION_KEYS instead. `blink` is not here either: it is
// a ~120ms snap the idle layer writes straight into the output, and pushing it through an
// interpolator is what turns a blink into a droop.
export const POSE_KEYS = [
  'armSwing', 'armSwingAlt', 'armOut', 'elbowBend', 'legSwing', 'kneeBend',
  'hipFlex', 'spineBend', 'spineRoll', 'earPerk', 'earSplay',
  'headYaw', 'headPitch', 'headTilt',
];

// What the interpolator actually integrates: every pose channel, plus `hold`.
export const MOTION_KEYS = [...POSE_KEYS, 'hold'];

const HOLD = MOTION_KEYS.indexOf('hold');
const TAU = Math.PI * 2;

// armSwing applies to BOTH arms identically (npc.js applyPose), so the rig has no counter-swing
// channel at all -- and counter-swing is the single biggest readability cue in a walk. armSwingAlt
// is the anti-symmetric partner: positive is contralateral to positive legSwing.
export const REST_POSE = Object.freeze({
  armSwing: 0, armSwingAlt: 0, armOut: 0, elbowBend: 0, legSwing: 0, kneeBend: 0,
  hipFlex: 0, spineBend: 0, spineRoll: 0, earPerk: 0, earSplay: 0,
  headYaw: 0, headPitch: 0, headTilt: 0,
  holdItem: false, blink: 0,
});

// Every pose carries every channel, even the ones it does not use. A pose missing a key makes
// interpolation produce NaN, NaN reaches the bounding sphere, and the renderer culls the whole
// character -- which looks like characters popping in and out rather than like a broken pose.
const definePoses = (raw) => Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([name, pose]) => [name, Object.freeze({ ...REST_POSE, ...pose })]),
));

export const POSES = definePoses({
  rest:   { armOut: 0.16 },
  walk:   { armSwing: 0.42, armOut: 0.14, elbowBend: 0.30, legSwing: 0.30, kneeBend: 1.50 },
  carry:  { armSwing: -0.12, armOut: 0.02, elbowBend: 1.45, holdItem: true },
  reach:  { armSwing: -1.15, armOut: 0.30, elbowBend: 0.35 },
  browse: { armSwing: -0.45, armOut: 0.34, elbowBend: 0.85, spineBend: 0.14 },
  // thighs forward to horizontal, shins dropped back to vertical: kneeBend has to match hipFlex
  sit:    { armSwing: -0.10, armOut: 0.22, elbowBend: 0.75, kneeBend: 1.45, hipFlex: 1.45, spineBend: 0.10 },
  delighted: { armSwing: -0.30, armOut: 2.55, elbowBend: 0.55, kneeBend: 0.10, earPerk: 0.38, earSplay: 0.22 },
  'walk+carry': { armSwing: -0.10, armOut: 0.03, elbowBend: 1.40, legSwing: 0.30, kneeBend: 1.50, holdItem: true },
});

// ---------------------------------------------------------------- tuning

export const MOTION_DEFAULTS = Object.freeze({
  // TEMPORARY: 'spring' | 'hermite'. Two interpolators exist only so the motion lab can hit the
  // SAME interrupt with both, side by side, on two characters in the same frame -- which is what
  // makes this a per-character option rather than a module-level switch. When one wins, DELETE
  // the loser: the losing branch in integrate(), this key, and the one read of opts.mode. Three
  // places, all grep-able as `mode`. Do not build anything on it.
  //
  // 'smoothstep' is the third: the behaviour this change REPLACES, kept selectable so the lab can
  // show the defect rather than assert it. Without a baseline on screen there is nothing to judge
  // the other two against. It goes when the winner is chosen.
  mode: /** @type {'spring' | 'hermite' | 'smoothstep'} */ ('spring'),

  stiff: 150,     // spring: natural frequency is sqrt(stiff) rad/s
  zeta:  1.00,    // spring: damping RATIO, never an absolute coefficient -- absolute damping
                  // means every stiffness increase silently under-damps the whole cast at once
  blend: 0.35,    // hermite: the duration cast.js used to hardcode as BLEND

  idleAmount: 1,  // master idle gain. 0 disables the layer entirely (the "reduce motion" answer,
                  // and the A/B switch for measuring what continuous motion actually costs)
  idleAmp:  1,
  idleRate: 1,
  // HOW OFTEN they fidget, as distinct from how far. At 1 the sway runs continuously, which
  // reads as permanent swaying rather than as standing around; below 1 it comes in bursts with
  // real stillness between. Amplitude and duty cycle are genuinely different knobs, and
  // conflating them is why a continuous idle looks restless rather than alive.
  idleDuty: 0.65,
  headArc:  1,    // MUST be here and not only in BASE_MOTION_RANGES: a caller using the defaults
                  // alone would otherwise multiply by undefined, and NaN on a head channel
                  // reaches the bounding sphere and culls the whole character.

  stride:    1.80,   // stride length as a multiple of leg-chain length. The foot-lock condition
                     // is sin(swingAmp) = stride/2, so stride is capped near 2*sinMax ~ 1.13
                     // before the legs physically cannot reach far enough and skate begins.
  bounce:    0.05,   // NEGATIVE cancels the free bounce; see walkLayer
  kneeLift:  0.55,   // swing-leg knee flexion. Without it the legs are sticks and both feet stomp.
  armGain:   0.55,
  sway:      0.075,  // lateral body lean per step. The side-to-side half of a walk.
  headCarry: 0,      // posture, not gait: applied standing AND walking
  armTuck:   0,
  lean:      0.06,   // forward lean at full speed
  gateSpeed: 0.35,   // ground speed at which the walk layer reaches full weight
  cadenceMax: 3.4,   // steps/sec before stride stretches instead of cadence rising
  sinMax:    0.5646, // sin(0.6 rad): the most scissor that still reads as walking
});

// Per-individual spans. A species kit overrides these to say how much variation ITS individuals
// get: the trait values pick WHERE in the span a character lands, the species owns HOW WIDE the
// span is. A narrow span means every llama moves alike; a wide one means high individual variety.
// Kits may narrow or widen a span -- never invent a channel. That is "ADD or SCALE, never
// REPLACE" applied to motion, and the self-check asserts it.
export const BASE_MOTION_RANGES = Object.freeze({
  stiff:    [60, 240],
  // Damping RATIO, not an absolute coefficient -- absolute damping means every stiffness
  // increase silently under-damps the whole cast at once. Below 1 overshoots.
  //
  // Measured overshoot on a fresh move: 0.45 -> 19.6%, 0.55 -> 11.6%, 0.65 -> 5.7%,
  // 0.75 -> 2.0%, 0.85 -> 0.2%, and everything from 0.85 up is indistinguishable. The old
  // [0.60, 1.50] span spent two thirds of its travel in that dead zone, which is why the
  // bounce read as flat across a cast. This span is live end to end: a volatile character
  // wobbles visibly, an orderly one arrives dead clean.
  zeta:     [0.45, 1.00],
  idleAmp:  [0.40, 1.60],
  idleRate: [0.75, 1.25],
  stride:   [1.40, 2.24],
  bounce:   [0.00, 0.12],
  headArc:  [0.50, 1.50],
});

/**
 * WALKING STYLE: personality only, identical for every species, NOT tunable per kit.
 *
 * All of these are ANGLES, and that is the whole reason they live apart from the table above.
 *
 * A style expressed as a LENGTH is welded to leg length -- stride has to scale with the legs or
 * the feet skate -- so it can never carry personality on its own: a stilt llama and a stumpy owl
 * of identical temperament will always differ more than two opposite temperaments on the same
 * legs. Angles have no such coupling. A 40-degree arm swing is a 40-degree arm swing on any
 * body, so these read as character rather than as size.
 *
 * Which is exactly why a species must NOT be able to touch them. The moment a kit narrows
 * `sway`, "excitable characters roll when they walk" stops being true of the game and starts
 * being true of one animal, and the reader of a walk has to know which species they are looking
 * at before they can read the temperament. These five are the part of the vocabulary that is
 * supposed to be universal.
 *
 * It is also the maintenance argument, with more kits coming: seven spans to consider per new
 * species instead of twelve, and no way to accidentally flatten a style dial in a kit and spend
 * an afternoon wondering why one species reads as having no personality.
 *
 * Measured before splitting: neither shipped kit overrode ANY of these -- between-species share
 * of variance was 0% for all five -- so this removes a capability nobody used, not a tuning.
 */
export const STYLE_RANGES = Object.freeze({
  armGain:   [0.20, 1.10],   // how much the arms counter-swing
  sway:      [0.02, 0.17],   // how far the body rolls over the planted foot
  lean:      [0.00, 0.17],   // how far they lean into the walk
  headCarry: [-0.24, 0.22],  // negative = head up and open, positive = head down and closed
  // ponytail: armTuck is a CONSTANT elbow offset, so it also bends the arm of a character who
  // is reaching for a shelf -- capped low enough that this reads as "holds themselves in"
  // rather than as a broken reach. The real fix is posture that fades out while a pose needs a
  // specific arm shape; do that if the knitting pose ever lands.
  armTuck:   [0.00, 0.50],   // elbows bent, arms held in against the body
});

// ---------------------------------------------------------------- traits -> coefficients

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (range, u) => range[0] + (range[1] - range[0]) * clamp01(u);

/**
 * Per-character motion coefficients, from the five Big-5 FACTORS.
 *
 * The ten assets remain the stored, spec-named truth -- CHARACTER-ATTRIBUTES.md is explicit that
 * those exact names carry the spec and that synonyms are a violation -- but motion reads the five
 * factors derived from them, because twelve coefficients hanging off ten assets is more
 * personality dials than anyone can hold while tuning. See factors().
 *
 * @param {Record<string, number>} traits the ten assets, 1-5 (visit.js randomTraits)
 * @param {Record<string, number[]>} [ranges] the species' spans
 */
export function motionOf(traits, ranges = BASE_MOTION_RANGES) {
  const u = traitPositions(traits);
  // Written out rather than looped, so the coefficient object has a real shape for the type
  // checker and for anything reading this to find out what a species can tune. The self-check
  // asserts every BASE_MOTION_RANGES key still appears, so the two cannot drift apart.
  // A species may narrow or widen anything in BASE_MOTION_RANGES. STYLE_RANGES is deliberately
  // not consulted through `ranges` at all, so a kit cannot reach it even by passing the key.
  const pick = (k) => span(ranges[k] ?? BASE_MOTION_RANGES[k], u[k]);
  const style = (k) => span(STYLE_RANGES[k], u[k]);
  return {
    stiff: pick('stiff'), zeta: pick('zeta'), idleAmp: pick('idleAmp'),
    idleRate: pick('idleRate'), stride: pick('stride'), bounce: pick('bounce'),
    headArc: pick('headArc'), armGain: style('armGain'), sway: style('sway'),
    lean: style('lean'), headCarry: style('headCarry'), armTuck: style('armTuck'),
  };
}

// A coefficient built from TWO traits lands on a triangular distribution, not a flat one: the
// two middles cancel far more often than the ends line up, so a random cast bunches around the
// centre of the span and the dial reads as if it were not wired to anything. Measured p10..p90
// occupancy: 75% for every two-trait coefficient against 100% for every single-trait one.
//
// `d` is the deviation from the middle of the span. Single-FACTOR coefficients do not come
// through here at all: the quantile mapping above already makes those uniform, and they reach
// 87% occupancy, which is simply what nine discrete levels give you. Only differences need it.
//
// Swept with the quantile factors in place: 1.3 leaves the worst difference dial at 68%, 1.6
// reaches 83%, and 1.9 reaches 87% -- the same ceiling the single-factor dials have, so that is
// where it stops being the limiting factor. Past 1.9 nothing improves and the pinning keeps
// climbing (21% at 2.2, 28% at 3.0).
const SPREAD = 1.9;
const pair = (d) => clamp01(0.5 + SPREAD * d);

/**
 * The five FACTORS, each the mean of its two assets, on the assets' own 1..5 scale.
 *
 * Motion is tied to these rather than to the ten assets. Twelve coefficients hanging off ten
 * assets meant ten personality dials to reason about before you could predict how one character
 * would move, and no way to hold "how extraverted is this one" in your head at all.
 *
 * The pairing is DeYoung's and it is the one visit.js already documents at its TRAITS list, so
 * this invents nothing: the assets keep their exact spec names as the inputs, and the factors
 * are only a reading of them. Note that the Openness/Intellect FACTOR shares a name with the
 * Openness ASSET inside it -- that collision is DeYoung's, not ours, so the factor key spells
 * out both halves.
 */
export function factors(t) {
  return {
    Neuroticism: (t.Volatility + t.Withdrawal) / 2,
    Extraversion: (t.Enthusiasm + t.Assertiveness) / 2,
    OpennessIntellect: (t.Openness + t.Intellect) / 2,
    Agreeableness: (t.Compassion + t.Politeness) / 2,
    Conscientiousness: (t.Industriousness + t.Orderliness) / 2,
  };
}

// A factor is the MEAN of two independent 1..5 assets, so its nine possible values are not
// equally likely: there are five ways to average 3 and only one to average 1. Feeding that mean
// straight into a span would bunch a cast around the middle of every dial -- the same defect the
// two-asset differences had, but now baked into every single coefficient as well.
//
// So a factor's position on a span is its QUANTILE, not its value: the share of the population
// at or below it. That makes factor position uniform by construction, and needs no widening and
// pins nobody at a limit. Indexed by the SUM of the two assets, 2..10.
//
// Measured alternative, for the record: leaving the mean raw and widening instead needs SPREAD
// 1.9 to reach the same spread, and that pins one character in six at an end of every dial.
const FACTOR_Q = Object.freeze([0, 0.0625, 0.1667, 0.3125, 0.5, 0.6875, 0.8333, 0.9375, 1]);
const factorUnit = (a, b) => FACTOR_Q[a + b - 2];

/**
 * Where this character sits, 0..1, on each coefficient's span.
 *
 * Four of the five factors drive motion. Agreeableness does not, and that is not an oversight:
 * it is the factor about how you treat people, and it belongs to what an NPC DOES -- visit.js
 * already spends it -- rather than to how their body moves. Nothing says every factor has to
 * drive every system.
 */
function traitPositions(t) {
  const N = factorUnit(t.Volatility, t.Withdrawal);
  const E = factorUnit(t.Enthusiasm, t.Assertiveness);
  const C = factorUnit(t.Industriousness, t.Orderliness);
  const O = factorUnit(t.Openness, t.Intellect);
  return {
    // Outgoing and settled moves like it meant it; anxious and withdrawn dawdles.
    stiff: pair(0.5 * (E - N)),
    // Neuroticism is reactivity, so it is what un-damps; Conscientiousness pulls back toward
    // exactly critical. Low here means overshoot.
    zeta: pair(0.5 * (C - N)),
    idleAmp: pair(0.5 * (E - N)),
    idleRate: N,
    stride: C,
    bounce: E,
    headArc: O,
    // Arms swing when a character is outgoing and pin to the body when they are not.
    armGain: pair(0.5 * (E - N)),
    // A conscientious character walks a tidy line; an excitable one rolls.
    sway: pair(0.5 * (E - C)),
    // Leaning into the walk is purposefulness: outgoing AND organised.
    lean: pair(0.5 * (E + C) - 0.5),
    // The single most readable posture signal, and completely free of leg length: head up and
    // open, or down and closed.
    headCarry: pair(0.5 * (N - E)),
    armTuck: N,
  };
}

// ---------------------------------------------------------------- per-character state

// Explicit Euler on a spring diverges once dt gets large, and store/main.js clamps dt to 0.1 --
// which is NOT enough: at stiff 240 the bound is ~0.129s and a lab slider at 500 is already
// outside it. Divergence gives Infinity, then NaN, then the bounding sphere, then the renderer
// culls the character. So the clamp lives HERE rather than at the call sites: crowd.html and the
// lab inherit it without knowing, and motion merely slows during a hitch instead of exploding.
const MAX_DT = 1 / 30;

// The substep cap is what keeps overshoot frame-rate INDEPENDENT. Measured: a semi-implicit
// one-liner is equally stable but its overshoot decays with dt (1.077 / 1.064 / 1.032 at
// 60 / 30 / 10fps), so the bounce you tune on a laptop quietly flattens on a throttled tablet --
// i.e. the personality vanishes on exactly the hardware it was for. Substepping holds it at
// 1.089 / 1.089 / 1.089. Cost at the worst frame is ~12 substeps, on a frame already late.
const MAX_H = 1 / 120;

const FLICK_DUR = 0.34;   // an ear flick is quick; slower reads as a droop
const BLINK_DUR = 0.12;
const BREATH_W = TAU * 0.25;    // ~4s per breath at idleRate 1

/** @typedef {ReturnType<typeof makeMotion>} Motion */
/** @typedef {typeof MOTION_DEFAULTS & ReturnType<typeof motionOf>} MotionOpts */

/** Reads a pose object into a channel array. `hold` is derived, never stored, so it cannot drift. */
function readInto(arr, pose) {
  for (let i = 0; i < MOTION_KEYS.length; i++) {
    arr[i] = i === HOLD ? (pose.holdItem ? 1 : 0) : (pose[MOTION_KEYS[i]] ?? 0);
  }
  return arr;
}

/**
 * One character's motion state.
 *
 * Typed arrays indexed by MOTION_KEYS position rather than string-keyed objects: fixed shape, no
 * hidden-class churn, no megamorphic property access on the per-frame path.
 *
 * @param {Record<string, any>} pose the pose the rig was BUILT in, so frame 1 has zero error and zero
 *   velocity by construction and there is nothing to lurch from
 * @param {number} [seed] 0..1, so a crowd does not breathe in unison
 */
export function makeMotion(pose, seed = Math.random()) {
  const n = MOTION_KEYS.length;
  const m = {
    cur: new Float64Array(n), vel: new Float64Array(n),
    from: new Float64Array(n), fromVel: new Float64Array(n), to: new Float64Array(n),
    target: null,      // identity only, for interrupt detection. NEVER read for values.
    t: 1,
    seed: seed * TAU,
    rateA: seed * 0.10,               // per-character sub-rhythm rates: see idleLayer
    rateB: (1 - seed) * 0.07,
    idlePhase: seed * TAU,
    blinkT: 1 + seed * 4,
    earT: 0.7 + seed * 5,             // offset from the blink so the two never sync up
    earWay: seed < 0.5 ? -1 : 1,      // which ear leads this flick
    walkGain: 0,
  };
  readInto(m.cur, pose);
  m.to.set(m.cur);
  return m;
}

/** Snaps to a pose with zero velocity. Spawn, and the lab's reset button. */
export function resetMotion(m, pose) {
  readInto(m.cur, pose);
  m.vel.fill(0);
  m.to.set(m.cur);
  m.target = null;
  m.t = 1;
  m.walkGain = 0;
  return m;
}

export const valueOf = (m, key) => m.cur[MOTION_KEYS.indexOf(key)];
export const velocityOf = (m, key) => m.vel[MOTION_KEYS.indexOf(key)];

// ---------------------------------------------------------------- the interpolators

/**
 * Advances the commanded pose toward `target`, and the idle clocks with it.
 *
 * The property both modes exist to provide: VELOCITY survives an interrupt. Today's smoothstep,
 * t*t*(3-2*t), has slope zero at both ends, so retargeting mid-blend discards the channel's speed
 * -- measured at 97% lost on a walk->browse blend interrupted by delight. Position was already
 * continuous; velocity was not, and that is the hitch.
 *
 * @param {Motion} m state from makeMotion
 * @param {Record<string, any>} target a pose object. Held by IDENTITY for interrupt detection and copied for
 *   values -- never retained for reading, or a caller passing the composed output back in would
 *   make the interpolator chase itself.
 * @param {number} dt seconds
 * @param {MotionOpts} opts MOTION_DEFAULTS merged with motionOf()
 */
export function integrate(m, target, dt, opts) {
  const step = dt > MAX_DT ? MAX_DT : dt;
  const retargeted = target !== m.target;
  if (retargeted) {
    m.from.set(m.cur);
    m.fromVel.set(m.vel);     // the measured incoming velocity -- this is the whole fix
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

/**
 * The three idle clocks: the breathing phase, the blink, and the ear flick.
 *
 * All advance with the REAL dt, not the clamped one -- a long frame really did take that long,
 * and a breath that stalls through a hitch reads worse than one that jumps. They run at rates
 * that are deliberately not multiples of each other: two twitch rhythms sharing a period read as
 * one mechanism, and that is what makes an idle look like an animation instead of like life.
 */
function advanceClocks(m, dt, opts) {
  m.idlePhase += dt * BREATH_W * opts.idleRate;
  if (m.idlePhase > TAU * 1e6) m.idlePhase %= TAU;

  m.blinkT -= dt;
  if (m.blinkT < -BLINK_DUR) m.blinkT = 2 + Math.random() * 5;

  // Flick rate follows how often they fidget, so one knob governs both -- but an ear is never
  // fully stilled, for the same reason breathing is not.
  m.earT -= dt * (0.45 + 0.55 * (opts.idleDuty ?? 1));
  if (m.earT < -FLICK_DUR) {
    m.earT = 1.4 + Math.random() * 6;
    m.earWay = Math.random() < 0.5 ? -1 : 1;
  }
}

function spring(m, dt, opts) {
  const k = opts.stiff;
  const c = 2 * opts.zeta * Math.sqrt(k);     // hoisted: zeta is a ratio, damping is derived
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

// Smoothstep IS this Hermite with m0 = m1 = 0 -- t*t*(3-2*t) is the h01 basis alone. So this is a
// strict generalisation of what cast.js used to do, and it states the old bug in one line: m0 was
// hard-zero, so every interrupt relaunched from a standstill.
function hermite(m, dt, opts) {
  const dur = opts.blend;
  m.t = Math.min(1, m.t + dt / dur);
  const t = m.t, t2 = t * t, t3 = t2 * t;
  // The h11 basis and its derivative are absent on purpose: the outgoing tangent m1 is 0, so a
  // transition arrives at rest and both terms are multiplications by zero.
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2;
  // Basis derivatives, so velocity is maintained ANALYTICALLY. A finite difference would inject
  // the frame-time jitter of a throttled tablet into the next transition's start tangent -- the
  // one thing this whole change exists to keep clean.
  const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1, d01 = -6 * t2 + 6 * t;
  const { cur, vel, from, fromVel, to } = m;
  for (let i = 0; i < cur.length; i++) {
    const m0 = fromVel[i] * dur;               // the MEASURED incoming velocity: the whole fix
    cur[i] = h00 * from[i] + h10 * m0 + h01 * to[i];
    vel[i] = (d00 * from[i] + d10 * m0 + d01 * to[i]) / dur;
  }
}

// The OLD behaviour, for comparison only: Hermite with both tangents forced to zero. Position
// is carried across an interrupt but velocity is not, because t*t*(3-2*t) has slope zero at
// t = 0 -- so a channel travelling at 4 rad/s is stopped dead in a single frame and has to
// accelerate again from rest. That is the hitch this whole module exists to remove.
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

// ---------------------------------------------------------------- the additive layers

/**
 * Scatters the commanded pose into a plain object and sums the idle layer on top.
 *
 * Stateless and downstream: the idle offsets are never written back into cur[]. See the header.
 */
export function compose(out, m, opts) {
  for (let i = 0; i < POSE_KEYS.length; i++) out[POSE_KEYS[i]] = m.cur[i];
  out.holdItem = m.cur[HOLD] > 0.5;
  out.blink = 0;
  out.kneeSwing = 0;

  // POSTURE: how this character carries itself, standing or walking. It sits ABOVE the idle
  // early-out on purpose -- posture is carriage, not fidgeting, so a character with the idle
  // layer turned all the way down is still withdrawn or still confident. Putting it below meant
  // "idle amount 0" silently erased personality along with the movement. Pure angles, so it
  // reads the same on a stumpy owl and a stilt llama.
  out.headPitch += opts.headCarry ?? 0;
  out.elbowBend += opts.armTuck ?? 0;

  const a = opts.idleAmount * opts.idleAmp;
  if (a <= 0) return out;

  idleLayer(out, m, opts, a);
  // Blink rides its own timer, not the phase: blinks are Poisson-ish, and a blink on a sine is
  // metronomic in a way that reads as a machine.
  if (m.blinkT < 0) out.blink = Math.sin((1 + m.blinkT / BLINK_DUR) * Math.PI);
  return out;
}

/**
 * Is this character mid-fidget right now?
 *
 * Returns 0 while holding still and ramps to 1 through a burst. Breathing is deliberately NOT
 * gated by this -- an animal that stops breathing when it stops shifting its weight reads as
 * switched off rather than as still.
 */

/**
 * Ear flicks: the idle channel the rig has always had and nothing ever drove.
 *
 * A llama's ears and an owl's tufts sat dead through every idle, which on an animal whose ears
 * are half its silhouette is the most obviously missing thing on screen.
 *
 * A flick is not a sway -- it is fast, asymmetric, and on its own clock -- so it rides a
 * Poisson-ish timer like the blink rather than the idle sine. A sine here would read as ears
 * flapping in a breeze. Both ears share one channel pair, so the asymmetry has to come from
 * splay rather than a per-ear angle; that reads as one ear cocking, which is the right shape
 * even though both are moving.
 */
function earFlick(out, m, a) {
  if (m.earT >= 0) return;
  const k = Math.sin((1 + m.earT / FLICK_DUR) * Math.PI);   // 0 -> 1 -> 0 across the flick
  out.earPerk += a * 0.30 * k;
  out.earSplay += a * 0.16 * k * m.earWay;
}

function dutyGate(p, duty, seed) {
  if (duty >= 1) return 1;
  const e = Math.sin(p * 0.37 + seed * 1.7);
  const threshold = 1 - 2 * duty;          // duty 0.5 -> half the time, 0.15 -> rarely
  return Math.max(0, Math.min(1, (e - threshold) / 0.35));
}

/** Breathing, the lateral weight shift, and the wandering head. All additive, all stateless. */
function idleLayer(out, m, opts, a) {
  const p = m.idlePhase;
  const g = a * dutyGate(p, opts.idleDuty ?? 1, m.seed);
  // Breathing. The chest lifts and the arms follow it a little, because an arm that stays put
  // while the ribcage moves reads as a detached limb.
  out.spineBend -= a * 0.045 * Math.sin(p);
  out.armOut += a * 0.022 * Math.sin(p);

  // WEIGHT SHIFT -- the side-to-side one, and the reason spineRoll exists. Everything else on
  // the rig is fore-aft (spineBend, legSwing, hipFlex all rotate about X), so without a lateral
  // channel an idle character can only ever bob forwards and backwards, which reads as breathing
  // hard rather than as standing around.
  //
  // Each sub-rhythm gets a rate derived from the character's own seed (rateA/rateB, set in
  // makeMotion), so no two characters run the same loop at an offset -- incommensurate rates
  // never repeat, and a visible repeat is what makes an idle read as an animation, not as life.
  const w = Math.sin(p * (0.17 + m.rateA) + m.seed);
  out.spineRoll += g * 0.085 * w;

  // The hip part of the weight shift FADES OUT as the character folds up, and this is not a
  // nicety. groundCharacter derives root Y from the lowest foot, whose sensitivity to hipFlex is
  // sin(hip) -- which is ~0 standing (hip near 0) and ~1 seated (POSES.sit has hipFlex 1.45).
  // So the identical 0.020 rad wobble is invisible on a standing character and a 100x larger
  // whole-body bounce on a seated one. Measured over two simulated minutes: root travel 0.05mm
  // standing against 5.20mm sitting, and still 4.38mm with the duty cycle at its lowest, which
  // is why a sitting owl looked like it never stopped moving however far that knob came down.
  //
  // It is also just wrong: you do not shift your weight between your feet while sitting on them.
  const upright = clamp01(1 - Math.abs(out.hipFlex) / 0.9);
  out.hipFlex += g * upright * 0.020 * Math.sin(p * (0.17 + m.rateA) * 2 + m.seed);
  out.headTilt += g * 0.070 * opts.headArc * w;
  out.headYaw += g * 0.180 * opts.headArc * Math.sin(p * (0.11 + m.rateB) + m.seed * 2);
  out.headPitch += g * 0.055 * opts.headArc * Math.sin(p * (0.09 + m.rateB) + m.seed * 3);

  earFlick(out, m, a);
}


/**
 * Stride phase, stride length and swing amplitude, from DISTANCE TRAVELLED rather than time.
 *
 * Time-driven would skate, and skate differently for every character: legHeight is a tier-1
 * silhouette carrier spanning 5x across the cast, and stepWalk eases every route through a
 * smoothstep so nobody moves at constant speed anyway. Distance-driven gives the ease-out free --
 * as speed approaches zero the phase freezes mid-stride with the feet planted.
 *
 * The amplitude is scale-INVARIANT and that is the point: foot-lock needs the foot's peak-to-peak
 * travel, 2*L*sin(swingAmp), to equal the strideLen the body covers, so sin(swingAmp) = stride/2
 * and the L cancels. One knob, and the lock then holds at every leg length with no per-character
 * tuning -- verified against the rig across the full 5x legHeight spread.
 *
 * `skate` is the residual once the geometric ceiling binds -- the honest report that the feet are
 * now sliding because the body is moving faster than legs that length can carry it. Real hardware
 * and real routes never match the ideal; surface the number rather than hiding it.
 *
 * @param {number} walkDist metres accumulated along the ground
 * @param {number} speed current ground speed
 * @param {number} L leg-chain length: legHeight + hipInset
 */
export function walkPhase(walkDist, speed, L, opts) {
  const natural = opts.stride * L;
  const ceiling = 4 * L * opts.sinMax;
  const needed = opts.cadenceMax > 0 ? (2 * speed) / opts.cadenceMax : natural;
  const strideLen = Math.min(ceiling, Math.max(natural, needed));
  // THE FOOT-LOCK CONDITION.
  //
  // A phase is one CYCLE -- legSwing runs a whole sine over it -- which is TWO steps, and each
  // leg is planted for exactly half of it. So while one foot is down the body advances
  // strideLen/2, not strideLen, and that is the distance that foot has to cover backwards
  // relative to the body. Its peak-to-peak fore-aft travel is 2*L*sin(swingAmp), so
  //
  //     2*L*sin(swingAmp) = strideLen/2   ->   sin(swingAmp) = strideLen / (4*L)
  //
  // A previous pass changed this to /(2*L) on the strength of a probe that measured a whole
  // cycle of one leg instead of its stance half -- the same off-by-a-half, just on the other
  // side. Measured over the real stance window, planted-foot slip is 10.7% of stride at /(4*L)
  // and 55.7% at /(2*L).
  const swingAmp = Math.asin(Math.min(strideLen / (4 * L), opts.sinMax));
  const skate = needed > ceiling ? (needed - ceiling) / needed : 0;
  const phase = strideLen > 0 ? (walkDist / strideLen) % 1 : 0;
  return { phase, strideLen, swingAmp, skate };
}

/**
 * Sums the walk cycle into an already-composed pose.
 *
 * kneeBend deliberately gets NOTHING. npc.js's kneeAmount already derives each knee from
 * tanh(legSwing * side * 4), which gives the leading leg the full bend and straightens the
 * trailing one, flipping smoothly through the passing frame. At a typical swing that is
 * tanh(+/-1.64) = +/-0.93 -- a walk cycle for free out of machinery that already shipped.
 *
 * Torso bounce is free too: groundCharacter derives root Y from the hip and knee angles, and
 * scissored legs are geometrically shorter, so the hips drop at footfall and rise at the passing
 * pose. That is also why you cannot exaggerate it by adding root Y -- grounding writes Y
 * absolutely and would erase it. The lever is hipFlex, which shortens both legs together.
 */
export function walkLayer(out, w, gain, opts) {
  if (gain <= 0) return out;
  const s = Math.sin(TAU * w.phase);
  out.legSwing += gain * w.swingAmp * s;
  // Counter-swing. applyPose does `armSwing - side * armSwingAlt`, so side +1's arm goes BACK
  // (rotation.x positive) when armSwingAlt is positive -- which is exactly when side +1's leg is
  // going back too. Opposite of a walk. This was `-=`, i.e. the arms swung WITH the legs.
  out.armSwingAlt += gain * opts.armGain * w.swingAmp * s;
  // THE SWING-LEG KNEE. Without this the legs are rigid sticks: measured swing-foot ground
  // clearance was 5mm on a 1.0-tall character, and because two rigid legs are exact mirrors
  // BOTH feet reach the floor at the same instant, twice a cycle. That is the stomp that reads
  // as a limp -- there is no stance phase at all, both feet plant and lift together.
  //
  // applyPose rectifies this per side (`max(0, side * kneeSwing)`), so one leg gets a positive
  // pulse over its swing half and the other gets the same pulse half a cycle later, each leg
  // dead straight through its whole stance. (kneeAmount cannot do this job -- it sees position,
  // not direction, and a leg at legSwing 0 is mid-swing going one way and mid-stance the other.)
  //
  // WHICH HALF IS SWING, since every phase below depends on it and getting it backwards is
  // invisible in a still frame. A limb hangs along -Y, so rotating it by +rotation.x puts its
  // far end at -Z; the character faces +Z (POSES.browse leans in with spineBend +0.14, and the
  // spine points up, so the same sign tips the head to +Z). Positive legSwing*side therefore
  // puts that foot BEHIND. Side +1's hip angle is swingAmp*sin(TAU*p), so its foot sits at
  // -L*sin(angle), which travels backwards relative to a body moving +Z exactly while
  // cos(TAU*p) > 0. So side +1 is in STANCE around phase 0 and mid-SWING at phase 0.5, and the
  // lift needs -cos, not +cos.
  //
  // ponytail: KNOWN CEILING. applyPose drives both legs from one scalar as `legSwing * side`,
  // so the two legs are exact MIRRORS -- at every phase their hip angles are equal and
  // opposite, so with equal knees their feet sit at exactly the same height and grounding has
  // no reason to prefer either. Only the knee breaks the tie, and a backward-bending knee only
  // RAISES the foot while the leg is behind the hip: flexing a leg that is already forward just
  // brings the shin back toward vertical and puts the foot down. So the lift works over the
  // back half of the swing and does nothing over the front half. Swept over amplitude x phase,
  // the best a one-harmonic lift reaches is 3 contact swaps per cycle instead of 2 -- one extra
  // flicker near footstrike, where the feet are genuinely tied anyway.
  //
  // The upgrade path, when the gait needs to be better than "reads right at diorama distance":
  // a per-leg shape f(p) with the other leg at f(p + 0.5) is exactly representable on the
  // channels that already exist, because `hip = legSwing * side - hipFlex` is `a + b * side`
  // with a = -hipFlex and b = legSwing. Set legSwing = (f(p) - f(p+0.5))/2 and
  // hipFlex = -(f(p) + f(p+0.5))/2 and ANY stance/swing asymmetry becomes authorable -- a real
  // 60/40 split, a fast swing, a slow stance. The knee needs the same treatment, which means
  // replacing the rectifier in applyPose with a linear `kneeSwing + side * kneeSwingAlt` pair.
  // Do that only if the flicker actually reads on screen; it is a redesign, not a tweak.
  out.kneeSwing = -gain * opts.kneeLift * Math.cos(TAU * w.phase);
  // Footfall is MAX SCISSOR -- phase 0.25 and 0.75 -- not phase 0. Phase 0 is the passing pose,
  // where the legs cross and the hips are at their highest. Measured root height over a cycle:
  // -0.0003 at phase 0, -0.0416 at phase 0.25. This term had a +cos here, so it was adding its
  // crouch at the top of the bob and cancelling the free one; that flattening is half of why the
  // walk read as wrong. -cos puts it at the bottom, deepening the dip as intended, and a
  // NEGATIVE bounce now cancels instead.
  // ponytail: hipFlex also rotates both thighs forward, so past ~0.12 the character walks in a
  // crouch. If a deeper bob is ever wanted, it needs a real pelvis height channel, not more of this.
  out.hipFlex += gain * opts.bounce * (0.5 - 0.5 * Math.cos(2 * TAU * w.phase));
  out.spineBend += gain * opts.lean;
  // Sway: the mass leans OVER the planted foot, once per cycle. Side +1 is planted around phase
  // 0 and sits at +X, and applyPose negates spineRoll into rotation.z so that positive tips the
  // head toward +X -- so +cos is right, and in phase with the knee lift's stance half.
  out.spineRoll += gain * opts.sway * Math.cos(TAU * w.phase);
  return out;
}

/**
 * How much of the walk layer applies, 0..1, smoothed so it never pops on or off.
 *
 * At zero speed this returns exactly 0, so a standing character is bit-identical to its base
 * pose. The decay is also the "bring your feet together" beat, for free: the phase freezes where
 * it stopped and the gain closes the scissor over a few tenths.
 */
export function walkGain(m, speed, dt, opts) {
  const want = Math.min(1, speed / opts.gateSpeed);
  const lambda = 6;
  m.walkGain += (want - m.walkGain) * (1 - Math.exp(-lambda * Math.min(dt, MAX_DT)));
  if (m.walkGain < 1e-4) m.walkGain = 0;
  return m.walkGain;
}
