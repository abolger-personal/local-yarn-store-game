// A stand-in for sim.js with the same MatchApi and no physics, so play.js can draw before the sim lands.
import { BRICK, DONUTS_PER_SHELF, ROUND_SECONDS, STAGE, TICK_HZ } from './match.js';

/** @typedef {import('./match.js').Entrant} Entrant @typedef {import('./match.js').Input} Input */
/** @typedef {import('./match.js').Target} Target @typedef {import('./match.js').Snapshot} Snapshot */

const WALK = 1.5;
const MOVE_SECONDS = { punch: 0.3, kick: 0.45 };
const START_X = { heroes: -6.5, badGuys: 5 };

/** @param {Entrant} e */
const fighterOf = (e, carrying) => ({
  id: e.id, team: e.team, x: START_X[e.team], y: 0, vx: 0, vy: 0, facing: e.team === 'heroes' ? 1 : -1,
  onGround: true, move: 'idle', step: 0, percent: 0, carrying, invincible: false, target: null,
});

/** @param {Entrant[]} entrants */
export function createMatch(entrants) {
  const heroLooks = entrants.filter((e) => e.team === 'heroes').map((e) => e.look);
  const badLook = entrants.find((e) => e.team === 'badGuys')?.look;
  const heroDonuts = Array.from({ length: DONUTS_PER_SHELF }, (_, i) => heroLooks[i % heroLooks.length]);
  const [stolen, dropped] = heroDonuts.splice(0, 2);
  return {
    tick: 0,
    fighters: entrants.map((e) => fighterOf(e, e.dummy ? stolen : null)),
    donuts: [{ id: 'd0', x: -2, y: 0, look: dropped }],
    bricks: STAGE.bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, hits: b.hits, maxHits: b.hits })),
    shelves: STAGE.shelves.map((s) => ({ ...s, donuts: s.team === 'heroes' ? heroDonuts : Array(DONUTS_PER_SHELF).fill(badLook) })),
  };
}

/** @param {Target} t @returns {{ x: number, y: number }} */
function pointOf(state, t) {
  if ('x' in t) return t;
  if (t.thing === 'shelf') return state.shelves.find((s) => s.team === t.team);
  const list = { donut: state.donuts, brick: state.bricks, fighter: state.fighters }[t.thing];
  return list.find((o) => o.id === t.id) ?? null;
}

function attack(f, input) {
  const move = (input.kick && 'kick') || (input.punch && 'punch');
  if (move) { f.move = move; f.step = 0; }
  if (f.move !== 'punch' && f.move !== 'kick') return false;
  f.step += 1 / (MOVE_SECONDS[f.move] * TICK_HZ);
  if (f.step < 1) return true;
  f.move = 'idle';
  f.step = 0;
  return false;
}

/** @param {Input} [input] */
function stepFighter(state, f, input = { target: null, punch: false, kick: false }) {
  const at = input.target && pointOf(state, input.target);
  if (at) f.target = { x: at.x + ('thing' in input.target && input.target.thing === 'brick' ? BRICK / 2 : 0), y: at.y };
  const busy = attack(f, input);
  const dx = f.target ? f.target.x - f.x : 0;
  const stride = Math.min(Math.abs(dx), WALK / TICK_HZ) * Math.sign(dx);
  f.x += stride;
  f.vx = stride * TICK_HZ;
  if (stride) f.facing = stride > 0 ? 1 : -1;
  else f.target = null;
  if (!busy) f.move = stride ? 'walk' : 'idle';
}

/** @param {Record<string, Input>} inputs */
export function tick(state, inputs) {
  state.tick++;
  for (const f of state.fighters) stepFighter(state, f, inputs[f.id]);
}

/** @returns {Snapshot} */
export const snapshot = (state) => structuredClone({
  tick: state.tick,
  secondsLeft: Math.max(0, ROUND_SECONDS - state.tick / TICK_HZ),
  fighters: state.fighters, donuts: state.donuts, bricks: state.bricks, shelves: state.shelves,
});
