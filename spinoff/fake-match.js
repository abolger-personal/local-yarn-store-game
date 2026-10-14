// A stand-in for sim.js with the same MatchApi and no physics, so play.js can draw before the sim lands.
import { BRICK, DONUTS_PER_SHELF, HITSTOP_TICKS, HIT_DEPTH, ROUND_SECONDS, STAGE, TICK_HZ } from './match.js';

/** @typedef {import('./match.js').Entrant} Entrant @typedef {import('./match.js').Input} Input */
/** @typedef {import('./match.js').Target} Target @typedef {import('./match.js').Snapshot} Snapshot */

const WALK = 2;
const MOVE_SECONDS = { punch: 0.3, kick: 0.45, hurt: 0.3 };
const REACH = { punch: 0.95, kick: 1.15 };
const START = { heroes: { x: -4.5, z: 0.6 }, badGuys: { x: 3, z: 0 } };
const GRAB = 0.45, SHELF_GRAB = 0.9;
const IDLE = Object.freeze({ target: null, punch: false, kick: false });

const floorY = (x, z) => Math.max(0, ...STAGE.floors.filter((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1).map((f) => f.y));

/** @param {Entrant} e */
const fighterOf = (e, carrying) => ({
  id: e.id, team: e.team, ...START[e.team], y: 0, vx: 0, vy: 0, vz: 0, facing: e.team === 'heroes' ? 0 : Math.PI, height: e.height,
  onGround: true, move: 'idle', step: 0, percent: 0, carrying, invincible: false, target: null, touching: null,
});

/** @param {Entrant[]} entrants */
export function createMatch(entrants) {
  const heroLooks = entrants.filter((e) => e.team === 'heroes').map((e) => e.look);
  const badLook = entrants.find((e) => e.team === 'badGuys')?.look;
  const heroDonuts = Array.from({ length: DONUTS_PER_SHELF }, (_, i) => heroLooks[i % heroLooks.length]);
  const [stolen, ...dropped] = heroDonuts.splice(0, 3);
  return {
    tick: 0, over: false, winner: null, frozen: 0, hits: [], fullBag: [], donutEvents: [],
    fighters: entrants.map((e) => fighterOf(e, e.dummy ? stolen : null)),
    donuts: dropped.map((look, i) => ({ id: `d${i}`, x: -2.5 + i * 0.8, y: 0, z: i ? -1.2 : 1.2, look })),
    bricks: STAGE.bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, z: b.z, hits: b.hits, maxHits: b.hits, icing: badLook.frosting })),
    shelves: STAGE.shelves.map((s) => ({ ...s, donuts: s.team === 'heroes' ? heroDonuts : Array(DONUTS_PER_SHELF).fill(badLook) })),
  };
}

/** @param {Target} t @returns {{ x: number, z: number }|null} */
function aimOf(state, f, t) {
  if ('x' in t) return { x: t.x, z: t.z };
  if ('stop' in t) return null;
  if (t.thing === 'shelf') return { x: t.team === 'heroes' ? -7.5 : 7.5, z: -1.2 };
  const o = { donut: state.donuts, brick: state.bricks, fighter: state.fighters }[t.thing].find((d) => d.id === t.id);
  if (!o) return null;
  if (t.thing === 'brick') return { x: o.x - 0.6, z: o.z + BRICK / 2 };
  return t.thing === 'fighter' ? { x: o.x + (f.x < o.x ? -0.6 : 0.6), z: o.z } : { x: o.x, z: o.z };
}

const ahead = (f, o) => (o.x - f.x) * Math.cos(f.facing) + (o.z - f.z) * Math.sin(f.facing);

function knock(state, f, foe) {
  Object.assign(foe, { move: 'hurt', step: 0, percent: foe.percent + 8, x: foe.x + Math.cos(f.facing) * 0.4 });
  if (!foe.carrying) return;
  state.donuts.push({ id: `d${state.tick}`, x: foe.x + 0.7, y: 0, z: foe.z, look: foe.carrying });
  foe.carrying = null;
}

function strike(state, f) {
  const inReach = (o) => Math.abs(o.z - f.z) <= HIT_DEPTH && ahead(f, o) > 0 && ahead(f, o) <= REACH[f.move];
  const foe = state.fighters.find((o) => o.team !== f.team && inReach(o));
  const brick = !foe && state.bricks.find((b) => inReach({ x: b.x, z: b.z + BRICK / 2 }));
  const at = foe ?? (brick && { x: brick.x, z: brick.z + BRICK / 2 });
  if (!at) return;
  state.hits.push({ x: (f.x + at.x) / 2, y: f.y + f.height * 0.55, z: (f.z + at.z) / 2, move: f.move, on: foe ? 'fighter' : 'brick', broke: Boolean(foe?.carrying) });
  state.frozen = HITSTOP_TICKS;
  if (foe) knock(state, f, foe);
}

/** Advances an attack or a flinch; true while it holds the fighter still. */
function act(state, f, input) {
  const move = (input.kick && 'kick') || (input.punch && 'punch');
  if (move && f.move !== 'hurt') Object.assign(f, { move, step: 0 });
  if (!(f.move in MOVE_SECONDS)) return false;
  const was = f.step;
  f.step += 1 / (MOVE_SECONDS[f.move] * TICK_HZ);
  if (f.move !== 'hurt' && was < 0.4 && f.step >= 0.4) strike(state, f);
  if (f.step < 1) return f.move !== 'punch';
  Object.assign(f, { move: 'idle', step: 0 });
  return false;
}

function walk(f, still) {
  const dx = f.target ? f.target.x - f.x : 0, dz = f.target ? f.target.z - f.z : 0, d = Math.hypot(dx, dz);
  if (d < 1e-6) f.target = null;
  const s = still || d < 1e-6 ? 0 : Math.min(d, WALK / TICK_HZ) / d;
  Object.assign(f, { x: f.x + dx * s, z: f.z + dz * s, vx: dx * s * TICK_HZ, vz: dz * s * TICK_HZ });
  if (s) f.facing = Math.atan2(dz, dx);
  f.y = floorY(f.x, f.z);
  if (f.target) f.target.y = f.y;
  if (!(f.move in MOVE_SECONDS)) f.move = s ? 'walk' : 'idle';
}

const event = (f, at) => ({ fighter: f.id, x: at.x, y: at.y, z: at.z });

function touchDonut(state, f) {
  const d = state.donuts.find((o) => Math.hypot(o.x - f.x, o.z - f.z) < GRAB);
  if (d && f.carrying && f.touching !== d.id) state.fullBag.push(event(f, d));
  else if (d && !f.carrying) {
    state.donuts.splice(state.donuts.indexOf(d), 1);
    f.carrying = d.look;
    state.donutEvents.push({ ...event(f, d), kind: 'pickup' });
  }
  return d?.id ?? null;
}

function touchShelf(state, f) {
  const s = state.shelves.find((o) => Math.hypot(o.x - f.x, o.z - f.z) < SHELF_GRAB && f.y >= o.y - 0.05);
  if (!s) return null;
  const mine = s.team === f.team;
  if (!mine && f.carrying && f.touching !== s.team) state.fullBag.push(event(f, s));
  else if (!mine && !f.carrying && s.donuts.length) {
    f.carrying = s.donuts.pop();
    state.donutEvents.push({ ...event(f, s), kind: 'steal' });
  } else if (mine && f.carrying) {
    s.donuts.push(f.carrying);
    f.carrying = null;
    state.donutEvents.push({ ...event(f, s), kind: 'bank' });
  }
  return s.team;
}

/** @param {Input} input */
function stepFighter(state, f, input) {
  if (input.target) f.target = aimOf(state, f, input.target);
  walk(f, act(state, f, input));
  f.touching = touchDonut(state, f) ?? touchShelf(state, f);
}

function endOf(state) {
  const count = (team) => state.shelves.find((s) => s.team === team).donuts.length;
  const [h, b] = [count('heroes'), count('badGuys')];
  Object.assign(state, { over: true, winner: h === b ? null : (h > b && 'heroes') || 'badGuys' });
}

/** @param {Record<string, Input>} inputs */
export function tick(state, inputs) {
  Object.assign(state, { hits: [], fullBag: [], donutEvents: [] });
  if (state.over) return;
  state.tick++;
  if (state.tick >= ROUND_SECONDS * TICK_HZ) endOf(state);
  if (state.frozen > 0) { state.frozen--; return; }
  for (const f of state.fighters) stepFighter(state, f, inputs[f.id] ?? IDLE);
}

/** @returns {Snapshot} */
export const snapshot = (state) => structuredClone({
  tick: state.tick, secondsLeft: Math.max(0, ROUND_SECONDS - state.tick / TICK_HZ), over: state.over, winner: state.winner,
  fighters: state.fighters, donuts: state.donuts, bricks: state.bricks, shelves: state.shelves,
  hits: state.hits, fullBag: state.fullBag, donutEvents: state.donutEvents,
});
