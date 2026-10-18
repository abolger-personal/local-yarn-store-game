import { POSES } from '../characters/npc.js';
import { MOVES } from './sim.js';

// Look only: the sim's punch is one move; each tablet draws it as the next of these for every punch that has landed.
// No hook (2026-10-15): from the side-on camera its sweep across the body read the same as a cross.
export const COMBO = Object.freeze(['jab', 'cross', 'uppercut', 'uppercut']);
/**
 * Punch starts this many ticks apart or fewer keep the string going: long enough to chase a target a hit knocked
 * back (about a second against the dummy), so a pause, not the chase, starts again at jab.
 */
export const COMBO_TICKS = 150;

const REST = Object.freeze({ hit: 0, guard: 0, hitOut: POSES.rest.armOut, guardOut: POSES.rest.armOut, elbow: POSES.rest.elbowBend });
const key = (t, p) => Object.freeze([t, Object.freeze({ ...REST, twist: 0, roll: 0, lean: 0, knee: 0, hip: 0, pitch: 0, ...p })]);
const WIND = 0.14, HOLD = 0.5;
/** How far through a punch its glove lands. */
export const STRIKE = 0.25;
const timeline = (wind, strike, hold) => Object.freeze([key(0, {}), key(WIND, wind), key(STRIKE, strike), key(HOLD, hold), key(1, {})]);

// hit/guard: each arm's forward swing (negative is forward); twist brings the hitting shoulder forward, roll lifts it;
// one elbow for both arms
export const PUNCHES = Object.freeze({
  jab: timeline(
    { hit: 0.2, guard: -0.3, hitOut: 0.25, guardOut: 0.3, elbow: 1.3, twist: -0.35, lean: -0.05 },
    { hit: -1.75, guard: 0.7, hitOut: 0.12, guardOut: 0.45, elbow: 0, twist: 0.6, lean: 0.2, pitch: -0.1 },
    { hit: -1.65, guard: 0.6, hitOut: 0.14, guardOut: 0.4, elbow: 0.1, twist: 0.5, lean: 0.18, pitch: -0.08 },
  ),
  cross: timeline(
    { hit: 0.8, guard: -0.6, hitOut: 0.35, guardOut: 0.3, elbow: 1.2, twist: -0.8, lean: -0.15 },
    { hit: -1.8, guard: 0.95, hitOut: 0.1, guardOut: 0.55, elbow: 0, twist: 1.1, lean: 0.4, hip: 0.15, pitch: -0.15 },
    { hit: -1.7, guard: 0.85, hitOut: 0.12, guardOut: 0.5, elbow: 0.1, twist: 1, lean: 0.35, hip: 0.12, pitch: -0.12 },
  ),
  uppercut: timeline(
    { hit: 0.5, guard: -0.8, hitOut: 0.3, guardOut: 0.2, elbow: 1.5, twist: -0.5, roll: -0.2, lean: 0.4, knee: 1, hip: 0.5, pitch: 0.15 },
    { hit: -2.9, guard: 0.6, hitOut: 0.2, guardOut: 0.5, elbow: 0.15, twist: 0.4, roll: 0.45, lean: -0.3, hip: -0.15, pitch: -0.35 },
    { hit: -2.8, guard: 0.5, hitOut: 0.2, guardOut: 0.45, elbow: 0.2, twist: 0.35, roll: 0.4, lean: -0.25, hip: -0.1, pitch: -0.3 },
  ),
});

// stretch along the forearm (negative squashes) and overall size of the hitting glove
export const GLOVE = Object.freeze([
  key(0, { stretch: 0, size: 1 }), key(WIND, { stretch: -0.3, size: 1.1 }), key(0.2, { stretch: 0.9, size: 1.3 }),
  key(0.27, { stretch: -0.45, size: 1.45 }), key(HOLD, { stretch: 0.15, size: 1.3 }), key(1, { stretch: 0, size: 1 }),
]);

// REUSE-SPEC.md §Costumes: the sword's own string in the punches' places and timing, arm poses as PUNCHES plus
// up: the blade's world angle above forward, swoosh: how strongly its trail shows, stab: 1 for a streak, 0 for a fan
export const SWORD_UP = 0.6;
/** The chop is raised by CHOP_UP and swings down until CHOP_DOWN, through the hit at STRIKE. */
export const CHOP_UP = 0.1, CHOP_DOWN = 0.45;
const blade = (stab, wind, strike, hold) => Object.freeze([
  key(0, { up: SWORD_UP, swoosh: 0, stab }), key(WIND, { swoosh: 0, stab, ...wind }), key(STRIKE, { swoosh: 0.75, stab, ...strike }),
  key(HOLD, { swoosh: 0, stab, ...hold }), key(1, { up: SWORD_UP, swoosh: 0, stab }),
]);
export const SWORD_MOVES = Object.freeze({
  // stab: drawn back at the chest, then the arm shoots straight out along the blade
  jab: blade(1,
    { hit: 0.3, guard: -0.2, hitOut: 0.3, guardOut: 0.4, elbow: 1.7, twist: -0.4, lean: -0.05, up: 0.05 },
    { hit: -1.55, guard: 0.6, hitOut: 0.05, guardOut: 0.5, elbow: 0, twist: 0.7, lean: 0.25, pitch: -0.1, up: -0.05 },
    { hit: -1.5, guard: 0.5, hitOut: 0.05, guardOut: 0.45, elbow: 0.05, twist: 0.6, lean: 0.22, pitch: -0.08, up: -0.05 }),
  // slash: an overhead chop, raised fast up and back over the head, then one long swing down through the front that
  // passes the hit and ends low (playtest: a flat sweep across the front read from neither the side nor the front, and
  // a chop between the punches' keys was over in two frames)
  cross: Object.freeze([
    key(0, { up: SWORD_UP, swoosh: 0, stab: 0 }),
    key(CHOP_UP, { hit: -3.1, guard: -0.3, hitOut: 0.2, guardOut: 0.35, elbow: 0.4, twist: -0.4, lean: -0.3, pitch: 0.2, up: 2.5, swoosh: 0, stab: 0 }),
    key(CHOP_DOWN, { hit: -0.8, guard: 0.6, hitOut: 0.1, guardOut: 0.5, elbow: 0, twist: 0.7, lean: 0.5, hip: 0.25, knee: 0.5, pitch: -0.3, up: -1.2, swoosh: 0.8, stab: 0 }),
    key(0.7, { hit: -0.85, guard: 0.5, hitOut: 0.1, guardOut: 0.45, elbow: 0.05, twist: 0.6, lean: 0.45, hip: 0.2, knee: 0.4, pitch: -0.25, up: -1.1, swoosh: 0, stab: 0 }),
    key(1, { up: SWORD_UP, swoosh: 0, stab: 0 }),
  ]),
  // upward stab: crouched with the blade low, then thrust up and forward to point at the sky
  uppercut: blade(1,
    { hit: 0.5, guard: -0.6, hitOut: 0.3, guardOut: 0.3, elbow: 1.3, twist: -0.4, lean: 0.4, knee: 1, hip: 0.5, pitch: 0.15, up: 0.4 },
    { hit: -2.5, guard: 0.6, hitOut: 0.15, guardOut: 0.5, elbow: 0.1, twist: 0.3, roll: 0.35, lean: -0.15, hip: -0.15, pitch: -0.35, up: 1.2 },
    { hit: -2.4, guard: 0.5, hitOut: 0.15, guardOut: 0.45, elbow: 0.15, twist: 0.25, roll: 0.3, lean: -0.12, hip: -0.1, pitch: -0.3, up: 1.15 }),
});

const ease = (k) => k * k * (3 - 2 * k);

/** The keyframe values at progress t, eased between the keys either side. @returns {Record<string, number>} */
export function sample(keys, t) {
  const i = Math.max(1, keys.findIndex(([at]) => at >= Math.min(1, t)));
  const [[t0, a], [t1, b]] = [keys[i - 1], keys[i]];
  const k = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
  return Object.fromEntries(Object.keys(b).map((n) => [n, a[n] + (b[n] - a[n]) * k]));
}

/** @typedef {{ name: string, arm: number, step: number }} Punch  arm: the hitting arm's joint side, -1 or 1 */

/** The facing-keyed hitting arm: the one nearer the camera, or the far one on the combo's odd punches. */
export const punchArm = (facing, n = 0) => (Math.cos(facing) >= 0 ? 1 : -1) * (n % 2 ? 1 : -1);

/** How much a punch `step` through has taken the arms over from the walk: 0 at the ends, 1 from the wind-up to the hold. */
export const punchWeight = (step) => Math.min(1, step / WIND, (1 - step) / (1 - HOLD));

/** Writes punch `p` (from `moves`, PUNCHES or SWORD_MOVES) over a pose that already has the walk in it: arms take over, torso and legs add on. */
export function punchLayer(out, { name, arm, step }, moves = PUNCHES) {
  const s = sample(moves[name], step), w = punchWeight(step);
  const mix = (k, v) => { out[k] = v + (out[k] - POSES.rest[k]) * (1 - w); };
  mix('armSwing', (s.hit + s.guard) / 2);
  mix('armSwingAlt', (-arm * (s.hit - s.guard)) / 2);
  mix('armOut', (s.hitOut + s.guardOut) / 2);
  mix('armOutAlt', (arm * (s.hitOut - s.guardOut)) / 2);
  mix('elbowBend', s.elbow);
  out.spineTwist -= arm * s.twist;
  out.spineRoll -= arm * s.roll;
  out.spineBend += s.lean;
  out.kneeBend += s.knee;
  out.hipFlex += s.hip;
  out.headPitch += s.pitch;
  return out;
}

/** @typedef {{ of: string, length: number, move: string, step: number, at: number, hits: number, ahead: number, n: number }} ComboCount */
/** A count of landed `of` moves (punch or kick) for a string `length` long. @returns {ComboCount} */
export const newCombo = (of = 'punch', length = COMBO.length) => ({ of, length, move: '', step: 0, at: -Infinity, hits: 0, ahead: 0, n: 0 });

/**
 * Who threw hit event `h`: the nearest fighter showing that move to the contact point not on the target's team
 * (friendly fire is off), or failing that, as a guest draws a few ticks behind, the nearest such fighter.
 * @param {import('./match.js').HitEvent} h @param {import('./match.js').FighterState[]} fighters
 */
export function strikerOf(h, fighters) {
  const team = h.on === 'fighter' ? fighters.find((f) => f.id === h.target)?.team : null;
  const by = (f) => (f.move === MOVES[h.move].shows ? 0 : 1e3) + Math.hypot(f.x - h.x, f.z - h.z);
  return fighters.filter((f) => f.team !== team).sort((a, b) => by(a) - by(b))[0] ?? null;
}

/** A hit landed; one this tablet hasn't drawn the start of yet counts once it has. */
export function landHit(c) {
  if (c.move === c.of && c.step <= MOVES[c.of].active[1] / MOVES[c.of].steps) c.hits++;
  else c.ahead++;
}

/**
 * The string index of the move `f` is showing, from hits landed before it started. A move starts when `f` turns to
 * it or its step goes back; one starting more than COMBO_TICKS after the last starts the string again.
 */
export function countStrike(c, f, tick) {
  if (f.move === c.of && (c.move !== c.of || f.step < c.step)) {
    const at = tick - Math.round(f.step * MOVES[c.of].steps);
    if (at - c.at > COMBO_TICKS) c.hits = 0;
    Object.assign(c, { n: c.hits % c.length, hits: c.hits + c.ahead, ahead: 0, at });
  }
  Object.assign(c, { move: f.move, step: f.step });
  return c.n;
}
