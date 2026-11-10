// Rules and invariant: ai_planning_sessions/characters/MOTION.md
export const POSE_KEYS = [
  'armSwing', 'armSwingAlt', 'armOut', 'armOutAlt', 'elbowBend', 'legSwing', 'kneeBend', 'legOut', 'legOutAlt',
  'hipFlex', 'spineBend', 'spineRoll', 'spineTwist', 'earPerk', 'earSplay',
  'headYaw', 'headPitch', 'headTilt', 'tailLift', 'tailWag', 'earFlap',
];

export const MOTION_KEYS = [...POSE_KEYS, 'hold'];

const HOLD = MOTION_KEYS.indexOf('hold');
const TAU = Math.PI * 2;

export const REST_POSE = Object.freeze({
  armSwing: 0, armSwingAlt: 0, armOut: 0, armOutAlt: 0, elbowBend: 0, legSwing: 0, kneeBend: 0,
  hipFlex: 0, legOut: 0, legOutAlt: 0, spineBend: 0, spineRoll: 0, spineTwist: 0, earPerk: 0, earSplay: 0,
  headYaw: 0, headPitch: 0, headTilt: 0, tailLift: 0, tailWag: 0, earFlap: 0,
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
  let cur = { turn: 0, rise: 0, travel: 0, shift: 0, flip: 0, roll: 0 };
  return steps.map((s) => {
    cur = {
      turn: s.turn ?? cur.turn,
      flip: s.flip ?? cur.flip,
      roll: s.roll ?? cur.roll,
      rise: s.rise ?? cur.rise,
      travel: s.travel ?? cur.travel,
      shift: s.shift ?? cur.shift,
    };
    return Object.freeze(cur);
  });
};

const resolveWalk = (steps, dance) => Object.freeze(steps.map((s) => s.walk ?? dance ?? 0));
const NO_EXTRAS = Object.freeze({ turn: 0, rise: 0, travel: 0, shift: 0, flip: 0, roll: 0 });

const defineDances = (raw) => Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([name, d]) => [name, Object.freeze({
    ...d,
    steps: Object.freeze(d.steps.map((s) => Object.freeze({ ...s }))),
    extras: Object.freeze(resolveExtras(d.steps)),
    walkAt: resolveWalk(d.steps, d.walk),
  })]),
));

// the booty shake, a taunt (DANCES.md §Booty shake): back turned, the hips sat back behind the heels as into a chair
// (the spine bends from the bottom of the torso, so bending alone tips the bum forward), bent well over, hands on the
// knees, looking back over the shoulder
const BOOTY = { hipFlex: 1.35, kneeBend: 1.25, spineBend: 0.85, armSwing: -0.45, armOut: 0.25, elbowBend: 0.35, headYaw: 0.9, headPitch: -0.6, tailLift: 0.9 };

export const DANCE_POSES = definePoses({
  'bs-bend': BOOTY,
  'bs-l': { ...BOOTY, spineRoll: 0.24, tailWag: 1, headTilt: 0.15 },
  'bs-r': { ...BOOTY, spineRoll: -0.24, tailWag: -1, headTilt: -0.15 },
  'bs-slap': { ...BOOTY, armSwing: 0.4, armSwingAlt: 0.8, elbowBend: 0.6 },

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

  // the wuxia sweep turn, sao tang tui (DANCES.md §Gymnastics): crouched on one leg, the other straight out to the side
  // on the floor (legSwing = hipFlex keeps the out leg's thigh level while the standing one folds); both hands down
  // through the sweep, then one thrown up for the freeze; all measured per species
  'wx-crouch': { kneeBend: 1.6, hipFlex: 0.55, spineBend: 0.25, armSwing: 0.6, armOut: 0.35, elbowBend: 0.3, headPitch: 0.1 },
  'wx-sweep': {
    legSwing: 0.55, hipFlex: 0.55, kneeBend: 2.3, legOut: 0.6, legOutAlt: 0.6,
    spineBend: 0.8, armSwing: -0.2, armOut: 0.35, elbowBend: 0.05, headPitch: -0.3, earSplay: 0.2,
  },
  'wx-freeze': {
    legSwing: 0.55, hipFlex: 0.55, kneeBend: 2.3, legOut: 0.6, legOutAlt: 0.6,
    spineBend: 0.55, spineRoll: 0.4, armSwing: -0.55, armSwingAlt: 0.55, armOut: 1.5, armOutAlt: -0.8, elbowBend: 0, headPitch: -0.25, headYaw: -0.35, earPerk: 0.35,
  },

  // the back tuck (DANCES.md §Gymnastics, Flips worked out): crouch with the arms back, up into a tuck, open out
  // coming down so the legs are straight for the landing, soak it, then the salute
  'bt-crouch': { kneeBend: 1.4, hipFlex: 0.6, spineBend: 0.35, armSwing: 0.8, armOut: 0.2, elbowBend: 0.2, headPitch: 0.1 },
  'bt-tuck': { kneeBend: 2.3, hipFlex: 1.8, spineBend: 0.5, armSwing: -0.9, armOut: 0.25, elbowBend: 1.3, headPitch: 0.35, earPerk: -0.3 },
  'bt-open': { kneeBend: 0.3, hipFlex: 0.15, spineBend: -0.1, armSwing: -2.4, armOut: 0.4, elbowBend: 0.1, headPitch: -0.2 },
  'bt-land': { kneeBend: 1.3, hipFlex: 0.5, spineBend: 0.25, armSwing: -1.2, armOut: 0.5, elbowBend: 0.2 },
  salute: { armOut: 2.5, elbowBend: 0.05, kneeBend: 0.1, spineBend: -0.2, headPitch: -0.3, earPerk: 0.4, tailLift: 0.5 },
  // tumbling: no hands on the floor (a chibi head is lower than its raised hands upside down), so the run-in is the
  // hands-free versions, an aerial round-off (a star, legs wide) and a whip back (arched, arms reaching back)
  'tb-reach': { armSwing: -2.7, armOut: 0.2, elbowBend: 0.05, kneeBend: 0.5, hipFlex: 0.35, spineBend: 0.15 },
  'tb-star': { armSwing: -2.8, armOut: 0.55, elbowBend: 0, legOut: 0.55, kneeBend: 0.05, spineBend: -0.1, headPitch: -0.2 },
  'tb-whip': { armSwing: -2.9, armOut: 0.2, elbowBend: 0, kneeBend: 0.2, hipFlex: -0.5, spineBend: -0.65, headPitch: -0.5 },
  'tb-pike': { hipFlex: 1.8, kneeBend: 0.05, spineBend: 0.4, armSwing: -1.3, armOut: 0.2, elbowBend: 0.05, headPitch: 0.3 },
  // the wolf: squatting on one leg, the other nearly straight in front, its foot just off the floor; the free leg
  // is the one turned out a little (`legOutAlt`), which is what straightens its knee
  wolf: { hipFlex: 1.5, kneeBend: 2.2, legOut: 0.25, legOutAlt: 0.25, spineBend: 0.3, armOut: 1.3, elbowBend: 0.05, headPitch: -0.1 },
  'tb-layout': { armSwing: 0.1, armOut: 0.35, elbowBend: 0.05, kneeBend: 0.05, spineBend: -0.15, headPitch: -0.1 },

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

// the floor passes' run-in (DANCES.md §Gymnastics): a reach, an aerial round-off, a whip back, a rebound. All one way
// round in the world: the round-off's half `turn` leaves the body facing back, so the same `flip` direction is a
// back salto from then on; the pass travels the way the body first faced
const RUN_IN = [
  { pose: 'tb-reach', hold: 0.30, travel: 0.10 },
  { pose: 'tb-star', hold: 0.32, air: true, rise: 0.70, flip: Math.PI, turn: Math.PI / 2, travel: 0.30 },
  { pose: 'bt-open', hold: 0.30, air: true, rise: 0, flip: TAU, turn: Math.PI, travel: 0.50 },
  { pose: 'bt-land', hold: 0.12, travel: 0.55 },
  { pose: 'tb-whip', hold: 0.30, air: true, rise: 0.70, flip: 3 * Math.PI, travel: 0.75 },
  { pose: 'bt-open', hold: 0.28, air: true, rise: 0, flip: 2 * TAU, travel: 0.95 },
  { pose: 'bt-land', hold: 0.14, travel: 1.00 },
];
const BEAM_DISMOUNT = [
  { pose: 'bt-crouch', hold: 0.30 },
  { pose: 'bt-tuck', hold: 0.75, air: true, rise: 0.95, flip: -TAU, turn: TAU },
  { pose: 'bt-open', hold: 0.70, air: true, rise: 0, flip: -2 * TAU, turn: 2 * TAU },
  { pose: 'bt-land', hold: 0.30 },
];

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
  // crouch, one turn low with the leg sweeping the floor, then a dead-still film freeze in the same shape;
  // stiff and critically damped so the freeze stops rather than settles
  // the jump is two `air` steps, up to the top tucking and down opening out, so grounding lets go for both and the
  // legs are straight again by the landing; the turns are whole, so it lands upright
  'back-tuck': {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    steps: [
      { pose: 'bt-crouch', hold: 0.28 },
      { pose: 'bt-tuck', hold: 0.36, air: true, rise: 0.7, flip: -Math.PI },
      { pose: 'bt-open', hold: 0.34, air: true, rise: 0, flip: -TAU },
      { pose: 'bt-land', hold: 0.30 },
      { pose: 'salute', hold: 0.90 },
    ],
  },
  // Simone Biles's beam dismount, the Biles (2019): a double back tuck with two twists, here from a standing jump;
  // the twists (`turn`) spread through both flips, about the flipping body. Far slower than hers: at a real ~1 s in the
  // air it was a blur on a small figure (playtest), so it hangs like a cartoon jump
  'biles-beam': {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    // Rio 2016 beam final: mostly red, blue and silver stripes at the neck
    glitter: { colours: ['#e8102f', '#e8102f', '#e8102f', '#1f4fd8', '#dfe3ec'] },
    steps: [...BEAM_DISMOUNT, { pose: 'salute', hold: 0.90 }],
  },
  // the Biles on floor (2013): the run-in, then a double layout with the half twist in the second flip
  biles: {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    // the Rio 2016 Games' colours
    glitter: { colours: ['#00b34a', '#ffd100', '#ff7a00', '#0080e0'], twinkle: 0.6 },
    steps: [
      ...RUN_IN,
      { pose: 'tb-layout', hold: 0.75, air: true, rise: 0.95, flip: 3 * TAU, travel: 1.15 },
      { pose: 'tb-layout', hold: 0.70, air: true, rise: 0, flip: 4 * TAU, turn: TAU, travel: 1.30 },
      { pose: 'bt-land', hold: 0.30 },
      { pose: 'salute', hold: 0.90 },
    ],
  },
  // the triple-double (2019): the run-in, then a double back tuck with three twists
  'biles-ii': {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    // Tokyo team final: red to white to blue, top to bottom
    glitter: { colours: ['#e8102f', '#ffffff', '#1f4fd8'], bands: true, count: 24 },
    steps: [
      ...RUN_IN,
      { pose: 'bt-tuck', hold: 0.75, air: true, rise: 0.95, flip: 3 * TAU, turn: 4 * Math.PI, travel: 1.15 },
      { pose: 'bt-open', hold: 0.70, air: true, rise: 0, flip: 4 * TAU, turn: 7 * Math.PI, travel: 1.30 },
      { pose: 'bt-land', hold: 0.30 },
      { pose: 'salute', hold: 0.90 },
    ],
  },
  // the Biles II vault (2023), a Yurchenko double pike: the run-in stands in for the board and table
  'biles-ii-vault': {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    // Paris vault final, her 7th gold: "power color" red, dense
    glitter: { colours: ['#b0001c', '#ff2847', '#ff8fa3'], count: 30, twinkle: 0.25 },
    steps: [
      ...RUN_IN,
      { pose: 'tb-pike', hold: 0.75, air: true, rise: 0.95, flip: 3 * TAU, travel: 1.15 },
      { pose: 'bt-open', hold: 0.70, air: true, rise: 0, flip: 4 * TAU, travel: 1.30 },
      { pose: 'bt-land', hold: 0.30 },
      { pose: 'salute', hold: 0.90 },
    ],
  },
  // the beam dismount ending in a 2½ wolf turn instead of the salute, the one she made famous at Rio 2016
  'biles-wolf': {
    stiff: 700, zeta: 0.85, loop: false, walk: 0,
    // Paris "Luminous Legacy": a night sky with a constellation of crystals
    glitter: { colours: ['#1a237e', '#ffffff', '#a9c1ff', '#ffffff'], twinkle: 0.95 },
    steps: [
      ...BEAM_DISMOUNT,
      { pose: 'wolf', hold: 1.40, turn: 9 * Math.PI },
      { pose: 'wolf', hold: 0.60 },
    ],
  },
  'wuxia-turn': {
    stiff: 420, zeta: 1.00, loop: false, walk: 0,
    // an action line: the sweeping foot draws an ink stroke round the floor
    glitter: { colours: ['#1c1c24'], line: ['lowerLeg', 1] },
    steps: [
      { pose: 'wx-crouch', hold: 0.22 },
      { pose: 'wx-sweep', hold: 0.60, turn: TAU },
      { pose: 'wx-freeze', hold: 1.50 },
    ],
  },
  // the hips swing by `shift`, the shoulders countering (as the floss's); a whole turn back round to finish
  'booty-shake': {
    stiff: 420, zeta: 0.65, loop: false, walk: 0,
    steps: [
      { pose: 'bs-bend', hold: 0.40, turn: Math.PI },
      ...[1, 2, 3].flatMap(() => [{ pose: 'bs-l', hold: 0.15, shift: -0.035 }, { pose: 'bs-r', hold: 0.15, shift: 0.035 }]),
      { pose: 'bs-slap', hold: 0.35, shift: 0 },
      ...[1, 2].flatMap(() => [{ pose: 'bs-l', hold: 0.12, shift: -0.035 }, { pose: 'bs-r', hold: 0.12, shift: 0.035 }]),
      { pose: 'bs-bend', hold: 0.20, shift: 0 },
      { pose: 'salute', hold: 0.60, turn: TAU },
    ],
  },
  'uptown-funk': {
    stiff: 340, zeta: 0.70, loop: false, walk: 0.85,
    // sunglasses for the strut, and neon speed lines off every snap (the designer)
    glitter: { colours: ['#ff2bd6', '#19e6ff', '#ffe81a'], count: 0, shades: true, snap: 'uf-snap' },
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

/**
 * How far through a step each extra is. On the ground, an S-curve. In the air (`air` steps, DANCES.md §Gymnastics)
 * a jump's two halves are a parabola's: fast off the floor and slow at the top going up (`launch` follows it, for
 * placeDancer to lift from the crouch), slow at the top and fast at the floor coming down; and turns are fastest
 * at the top, tucked, starting slow off the floor (turning at once swung the head into it) and settling at the landing.
 */
function curves(step, raw, from, to) {
  const u = sCurve(raw);
  if (!step.air) return { u, spin: u, lift: u, launch: 1 };
  const rising = to.rise > from.rise, lift = rising ? 1 - (1 - raw) ** 2 : raw * raw;
  return { u, spin: rising ? raw * raw : 1 - (1 - raw) ** 2, lift, launch: rising ? lift : 1 };
}

export function stepDance(d, dt) {
  const dance = DANCES[d.name];
  const { steps, extras, walkAt } = dance;
  advanceDance(d, dance, dt);
  const step = steps[d.i];
  const raw = d.done ? 1 : Math.min(1, d.t / step.hold);
  const from = extrasBefore(d, extras);
  const to = extras[d.i];
  const { u, spin, lift, launch } = curves(step, raw, from, to);
  const hop = (step.hop ?? 0) * Math.sin(Math.PI * raw);
  return {
    pose: DANCE_POSES[step.pose],
    turn: mix(from.turn, to.turn, spin), flip: mix(from.flip, to.flip, spin), roll: mix(from.roll, to.roll, spin),
    rise: mix(from.rise, to.rise, lift) + hop,
    travel: mix(from.travel, to.travel, u), shift: mix(from.shift, to.shift, u),
    air: Boolean(step.air) && !d.done, launch,
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
const FLAP_AMP = 0.90;
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
  // Outward only, on the wag clock: a flap that swung inward would cross the ears over the head.
  out.earSplay += out.earFlap * FLAP_AMP * (1 - Math.cos(m.wagPhase)) / 2;

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
