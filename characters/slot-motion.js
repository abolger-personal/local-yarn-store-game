import {
  MOTION_DEFAULTS, POSES, DANCES, DANCE_NAMES, getSpecies, motionOf, makeDance, stepDance, placeDancer,
  stepMotion, walkPhase, walkLayer, walkGain, phaseStep,
} from './npc.js';
import { stepGlitter } from './glitter.js';
import { randomTraits } from './visit.js';

// The slot pages' motion (species checker, dress-up): each slot is { opts, base, phase, perf, glitter }.

/** A new individual's motion: the defaults, then a random temperament within the kit's ranges. */
export const randomOpts = (kit) => ({ ...MOTION_DEFAULTS, ...motionOf(randomTraits(), kit.motionRanges) });

/** A species' defaults, meshes left unmerged so every part can be restyled live. */
export const freshParams = (id) => Object.assign(structuredClone(getSpecies(id).defaults), { mergeMeshes: false });

/** The dance after `name` in the X key's round: none, then every dance. */
export function nextDance(name) {
  const all = ['none', ...DANCE_NAMES];
  return all[(all.indexOf(name) + 1) % all.length];
}

function restoreSpring(slot) {
  if (!slot.base) return;
  slot.opts.stiff = slot.base.stiff;
  slot.opts.zeta = slot.base.zeta;
}

/** Every slot starts dance `name` on the dance's springs; 'none' stops them and gives back their own. */
export function danceSlots(slots, name) {
  for (const slot of slots) {
    if (name === 'none') {
      slot.perf = null;
      restoreSpring(slot);
    } else {
      slot.perf = makeDance(name);
      slot.opts.stiff = DANCES[name].stiff;
      slot.opts.zeta = DANCES[name].zeta;
    }
  }
}

/** A finished dance goes round again with `state.repeat`, else the slot stops and the page hears `ended()`. */
function stepDanceFor(slot, dt, { state, ended }) {
  if (!slot.perf) return null;
  const d = stepDance(slot.perf, dt);
  if (d.done) {
    if (state.repeat) slot.perf = makeDance(state.dance);
    else { slot.perf = null; state.dance = 'none'; restoreSpring(slot); ended(); }
  }
  return d;
}

/** One frame of a slot: its dance (placed `at`) or the page's pose, the idle and walk layers, the glitter. */
export function stepSlot(character, slot, dt, page, at) {
  const { state } = page;
  slot.opts.idleAmount = state.idle ? 1 : 0;
  const d = stepDanceFor(slot, dt, page);
  const walking = d ? d.walk > 0 : state.walk;
  const dial = state.walk ? state.speed : 0;
  const speed = d ? d.walk : dial;
  const L = character.params.legHeight + character.params.hipInset;
  const w = walkPhase(slot.phase, speed, L, slot.opts);
  const gain = walkGain(character.motion, speed, dt, slot.opts);
  slot.phase = (slot.phase + phaseStep(speed * dt, speed, L, slot.opts)) % 1;
  stepMotion(character, d ? d.pose : POSES[state.pose], dt, slot.opts,
    walking ? (out) => walkLayer(out, w, gain, slot.opts) : null);
  if (d) placeDancer(character, d, at);
  slot.glitter = stepGlitter(slot.glitter, character, slot.perf, d, dt);
}
