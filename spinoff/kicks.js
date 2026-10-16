import { POSES } from '../characters/npc.js';
import { COMBO, punchArm, sample } from './punches.js';
import { MOVES } from './sim.js';

// Look only, like the punch string (punches.js): the sim's kick is one move, drawn as the next of these per landed kick.
export const KICK_COMBO = Object.freeze(['kick', 'thrust']);

const ZERO = Object.freeze({ thigh: 0, stand: 0, knee: 0, sink: 0, lean: 0, pitch: 0, swing: 0, out: POSES.rest.armOut, elbow: POSES.rest.elbowBend, lunge: 0 });
const key = (t, p) => Object.freeze([t, Object.freeze({ ...ZERO, ...p })]);
const WIND = 0.18, STRIKE = MOVES.kick.active[0] / MOVES.kick.steps, HOLD = 0.56;
const timeline = (wind, strike, hold) => Object.freeze([key(0, {}), key(WIND, wind), key(STRIKE, strike), key(HOLD, hold), key(1, {})]);

// thigh/stand: the kicking and standing thighs' swing (negative is forward); knee/sink: their knees; lean: spine
// (negative is back); swing/out/elbow: both arms; lunge: the drawn body's slide along the facing, in leg lengths
export const KICKS = Object.freeze({
  kick: timeline(
    { thigh: -0.9, knee: 1.3, sink: 0.2, lean: 0.1, swing: -0.2, out: 0.25, elbow: 0.6 },
    { thigh: -1.6, knee: 0.1, sink: 0.1, pitch: -0.05, swing: 0.2, out: 0.3, elbow: 0.2, lunge: 0.15 },
    { thigh: -1.55, knee: 0.15, sink: 0.1, pitch: -0.05, swing: 0.2, out: 0.25, elbow: 0.2, lunge: 0.12 },
  ),
  thrust: timeline(
    { thigh: -1.5, knee: 2.1, stand: -0.3, sink: 0.8, lean: 0.25, pitch: 0.15, swing: -0.5, out: 0.35, elbow: 1.4, lunge: -0.1 },
    { thigh: -1.95, stand: 0.2, sink: 0.2, lean: -1.2, pitch: -0.45, swing: 1.1, out: 1, elbow: 0.3, lunge: 0.8 },
    { thigh: -1.85, knee: 0.05, stand: 0.2, sink: 0.25, lean: -1.1, pitch: -0.4, swing: 1, out: 0.95, elbow: 0.35, lunge: 0.7 },
  ),
});

/** @typedef {{ name: string, leg: number, step: number }} Kick  leg: the kicking leg's joint side, -1 or 1 */

/** The kicking leg: the one nearer the camera, the same side as the first punch's arm, for every kick of the string. */
export const kickLeg = (facing) => punchArm(facing);

/** What a fighter facing `facing` shows as the `n`th move of its punch or kick string, at `step`. */
export const strikeOf = (move, n, facing, step) => (move === 'punch'
  ? { name: COMBO[n], arm: punchArm(facing, n), step }
  : { name: KICK_COMBO[n], leg: kickLeg(facing), step });

/** Writes kick `k` over the pose: legs, arms and lean take over from the walk, the head adds on. */
export function kickLayer(out, { name, leg, step }) {
  const s = sample(KICKS[name], step), w = Math.min(1, step / WIND, (1 - step) / (1 - HOLD));
  const mix = (k, v) => { out[k] = v + (out[k] - (POSES.rest[k] ?? 0)) * (1 - w); };
  mix('legSwing', (leg * (s.thigh - s.stand)) / 2);
  mix('hipFlex', -(s.thigh + s.stand) / 2);
  mix('kneeBend', s.knee);
  // the rig straightens the standing knee as the legs part (npc.js kneeAmount); kneeSwing bends it back by the rest
  mix('kneeSwing', -leg * Math.max(0, s.sink - s.knee * (1 - 0.85 * Math.max(0, Math.tanh(2 * (s.stand - s.thigh))))));
  mix('armSwing', s.swing);
  mix('armSwingAlt', 0);
  mix('armOut', s.out);
  mix('armOutAlt', 0);
  mix('elbowBend', s.elbow);
  mix('spineBend', s.lean);
  out.headPitch += s.pitch;
  return out;
}

/** How far the drawn body slides along its facing at this point of kick `k` (draw only; the sim doesn't move). */
export const kickLunge = (P, { name, step }) => sample(KICKS[name], step).lunge * (P.legHeight + P.hipInset);
