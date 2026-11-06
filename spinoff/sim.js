// The match host: one fixed tick of pure logic, no three.js, no Math.random (REUSE-SPEC.md §Milestones 1). It wires
// the pieces: world.js (terrain), walk.js (getting round it), combat.js (fighting), build.js (the build round) and
// donut-game.js (the game they're played for); here are the fighter record, input, the tick and the snapshot.
import { ROUND_SECONDS, TICK_HZ } from './match.js';
import { cellUnder, fetchStep, fortGrid, pilesFor, readyInput, startWhenReady } from './build.js';
import { bandOf, brickBox, floorBox, settleBricks } from './world.js';
import { JUMP_SPEED, SPRING_LIFT, TURN_SPEED, airStep, jump, navigate, reachUp, separate, walkStep } from './walk.js';
import { MATCH, MOVES, attackInput, attacks, chainOf, countDown, lungeStep, release, stompAir } from './combat.js';
import {
  INVINCIBLE_TICKS, drop, grab, holds, icingOf, leader, makeShelf, powerUp, resolve, ringOut, shelfBox, shelfLooks, shelfOf,
  shelfStep, spawnSpot, stepDonut, teamLooks, touchDonuts,
} from './donut-game.js';






/** What walking asks the game (walk.js Mind): targets by thing, attacks that root or busy a fighter, the stomp's pop, guards. */
/** @type {import('./walk.js').Mind} */
const MIND = {
  goal: resolve,
  busy: (f) => Boolean(f.attack),
  rooted: (f) => Boolean(f.attack && !MOVES[f.attack.id].walks),
  lift: (s, f) => (stompAir(s, f) ? MOVES.stomp.pop : null),
  holds,
};

function moveFighter(s, f) {
  if (f.out > 0) {
    if (--f.out === 0) f.inv = INVINCIBLE_TICKS;
    return;
  }
  f.still = f.freeze > 0;
  if (f.still) {
    if (--f.freeze === 0) release(f);
    return;
  }
  navigate(s, f, MIND);
  if (f.onGround) walkStep(s, f, MIND);
  else airStep(s, f, MIND);
  f.peak = f.onGround ? f.y : Math.max(f.peak, f.y);
  lungeStep(s, f);
  // Facing is set on the ground and by a jump, then held in the air: drifting back toward a ledge mustn't spin you round.
  // An attack holds it too, so one turned to a foe behind you still lands while you walk on (playtest)
  if (f.onGround && f.stun === 0 && !f.attack && Math.hypot(f.vx, f.vz) > TURN_SPEED) f.facing = Math.atan2(f.vz, f.vx);
  ringOut(s, f);
}




// --- input ----------------------------------------------------------------------------------

function tapAbove(s, f, t) {
  if (t.y == null || f.stun > 0 || t.y <= f.y + f.h || Math.hypot(t.x - f.x, t.z - f.z) > f.w) return;
  if (f.onGround) jump(s, f, { x: f.x, z: f.z });
  else if (f.jumps > 0) { f.jumps--; f.vy = s.jump.speed; }
}

function aim(s, f, t) {
  Object.assign(f, { target: 'stop' in t ? null : { ...t }, shelfSpot: null, nav: null, fails: 0, shelfDone: false, stuck: 0, passed: false });
  // REUSE-SPEC.md §Forts, Building is carrying blocks: carrying, a floor tap is where the block goes, so you walk up facing that cell
  f.placeCell = s.phase === 'build' && f.block && 'x' in t ? cellUnder(fortGrid(s.stage, f.team, s.bricks, s.piles), t) : null;
  if ('x' in t) tapAbove(s, f, t);
}

/** A jump tap (playtest: a second jump timed by hand was too hard to hit): on the ground a jump where you stand; in the air the
 * double jump, saved for the top of the first however early it's tapped. */
function jumpTap(s, f) {
  if (f.stun > 0) return;
  if (f.onGround) jump(s, f, { x: f.x, z: f.z });
  else if (f.jumps > 0) f.again = true;
}


function setAway(s, f, away) {
  if (away == null || away === f.away) return;
  f.away = away;
  if (away) aim(s, f, { stop: true });
}

function applyInput(s, f, input) {
  setAway(s, f, input?.away);
  if (f.away || !input) return;
  if (input.target && !f.out && 'jump' in input.target) jumpTap(s, f);
  else if (input.target && !f.out) aim(s, f, input.target);
  if (s.phase === 'build') readyInput(s, f, input);
  else attackInput(s, f, input);
}


// --- the match ------------------------------------------------------------------------------


function newFighter(e, at, y) {
  return { id: e.id, team: e.team, hands: e.hands ?? 'gloves', trick: e.trick ?? null, icing: e.look.frosting, block: null, placeCell: null, h: e.height, w: e.width, r: e.width / 2, reach: e.reach, dummy: Boolean(e.dummy),
    x: at.x, y, z: at.z, vx: 0, vy: 0, vz: 0, facing: e.team === 'heroes' ? 0 : Math.PI, onGround: true, jumps: 1,
    target: null, dest: null, nav: null, walkTo: null, airTo: null, navJump: null, again: false, fails: 0, stuck: 0, gain: 0, away: false, slick: false, passed: false, sprung: -1,
    attack: null, charging: false, stun: 0, stunMax: 1, hitMove: 'hurt', sliding: false, pending: null, freeze: 0, still: false, inv: 0, out: 0, percent: 0, calm: 0,
    carrying: null, touching: [], shelfDone: false, shelfSpot: null, blocked: false,
    chain: 0, chainAt: -Infinity, lastHit: null, hitBy: [], peak: y, power: 0, toy: null };
}

function refresh(s) {
  s.solids = [...s.floorBoxes, ...s.shelves.map(shelfBox(s.band.z0)), ...s.bricks.map(brickBox)];
  // routes replan once a falling brick lands, not on every tick of its fall (each replan rebuilds every body size's grid)
  if (s.bricks.some((b) => b.vy)) return;
  const key = s.bricks.map((b) => `${b.id}@${b.y.toFixed(3)}`).join(',');
  if (key !== s.brickKey) { s.brickKey = key; s.grids.clear(); }
}

/** How fast a jump and a trampoline launch take off on this stage, and the rise a route jumps for with each. */
function jumpsOn(stage) {
  const speed = JUMP_SPEED * Math.sqrt(stage.bounce ?? 1), spring = speed * Math.sqrt(SPRING_LIFT);
  return { speed, up: reachUp(speed), spring, springUp: reachUp(spring) };
}

/**
 * @param {import('./match.js').Entrant[]} entrants @param {import('./match.js').Stage} stage a level's (levels.js)
 * @param {import('./match.js').MatchOptions} [opts] pieces: each hero's pile, and a build round first if any; match: who can hit whom
 */
export function createMatch(entrants, stage, { pieces = 0, match = MATCH } = {}) {
  const s = { drop, stage, band: bandOf(stage), jump: jumpsOn(stage), floorBoxes: stage.floors.map(floorBox), tick: 0, nextDonut: 0, fighters: [], donuts: [], shelves: [], solids: [], grids: new Map(), brickKey: '',
    hits: [], fullBag: [], donutEvents: [], ringOuts: [], powers: [], hammers: [], shots: [], nextShot: 0, rules: match, phase: pieces > 0 ? 'build' : 'play', t0: 0, ready: new Set(), go: false, piles: [], nextBrick: 0,
    bricks: stage.bricks.map((b, i) => ({ id: `b${i}`, team: b.team, x: b.x, y: b.y, z: b.z, vy: 0, hits: b.hits,
      maxHits: b.hits, icing: icingOf(entrants, b.team) })) };
  s.shelves = stage.shelves.map((spot) => makeShelf(spot, teamLooks(entrants, spot.team)));
  refresh(s);
  const cursor = { dummies: 0, starts: 0 };
  s.fighters = entrants.map((e) => newFighter(e, spawnSpot(s, e, cursor), s.band.y));
  for (const f of s.fighters) if (f.dummy) f.carrying = grab(shelfOf(s, f.team));
  if (s.phase === 'build') s.piles = pilesFor(s.fighters, pieces);
  return s;
}

const played = (s) => (s.phase === 'play' ? s.tick - s.t0 : 0);
const isOver = (s) => played(s) >= ROUND_SECONDS * TICK_HZ;

function applyInputs(s, inputs) {
  for (const f of s.fighters) if (!f.dummy) applyInput(s, f, inputs[f.id]);
  if (s.phase === 'build') startWhenReady(s);
}

/** One fixed 1/TICK_HZ step. @param {Record<string, import('./match.js').Input>} inputs */
export function tick(s, inputs) {
  if (isOver(s)) return;
  Object.assign(s, { hits: [], fullBag: [], donutEvents: [], ringOuts: [], powers: [] });
  applyInputs(s, inputs);
  for (const f of s.fighters) moveFighter(s, f);
  separate(s, MIND);
  attacks(s);
  settleBricks(s);
  refresh(s);
  for (const d of s.donuts) stepDonut(s, d);
  for (const f of s.fighters) {
    if (!f.toy) grabStep(s, f);
    if (!f.still) countDown(f);
  }
  powerUp(s);
  s.tick++;
}


/** Donuts and blocks: what a fighter touches or stands at. A toy (TOY) grabs nothing. */
function grabStep(s, f) {
  touchDonuts(s, f);
  (s.phase === 'build' ? fetchStep : shelfStep)(s, f);
}


// --- the snapshot ---------------------------------------------------------------------------


function moveOf(f) {
  if (f.pending || f.stun > 0) return f.hitMove;
  if (f.attack) return MOVES[f.attack.id].shows;
  if (f.charging) return 'charge';
  if (!f.onGround) return f.vy > 0 ? 'jump' : 'fall';
  if (f.away) return 'sit';
  if (f.nav?.done && f.nav.blocked) return 'blocked';
  return Math.hypot(f.vx, f.vz) > TURN_SPEED ? 'walk' : 'idle';
}

function stepOf(f) {
  if (f.stun > 0) return 1 - f.stun / f.stunMax;
  return f.attack ? f.attack.t / MOVES[f.attack.id].steps : 0;
}

/** @returns {import('./match.js').FighterState} */
const fighterView = (s, f) => ({
  id: f.id, team: f.team, x: f.x, y: f.y, z: f.z, vx: f.vx, vy: f.vy, vz: f.vz, facing: f.facing, height: f.h, width: f.w,
  onGround: f.onGround, move: moveOf(f), step: stepOf(f), shooting: Boolean(f.attack?.shot), percent: f.percent, carrying: f.carrying ? { ...f.carrying } : null,
  invincible: f.inv > 0, respawn: f.out / TICK_HZ, target: f.dest ? { x: f.dest.x, y: f.dest.y, z: f.dest.z } : null, block: f.block,
  power: f.power, chain: chainOf(s, f), toy: f.toy?.kind ?? null, ...(f.attack?.turn && { turn: f.attack.turn }),
});


/** @returns {import('./match.js').Snapshot} */
export function snapshot(s) {
  return {
    tick: s.tick, secondsLeft: Math.max(0, ROUND_SECONDS - played(s) / TICK_HZ), over: isOver(s), winner: isOver(s) ? leader(s) : null,
    phase: s.phase, ready: [...s.ready], piles: s.piles.map((p) => ({ ...p })),
    fighters: s.fighters.map((f) => fighterView(s, f)),
    donuts: s.donuts.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, look: { ...d.look }, by: d.by })),
    hammers: s.hammers.map((h) => ({ owner: h.owner, x: h.x, y: h.y, z: h.z })),
    shots: s.shots.map((t) => ({ id: t.id, by: t.by, trick: t.trick, x: t.x, y: t.y, z: t.z, ux: t.ux, uz: t.uz, left: t.left })),
    bricks: s.bricks.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y, z: b.z, hits: b.hits, maxHits: b.maxHits, icing: b.icing })),
    shelves: s.shelves.map((sh) => ({ team: sh.team, x: sh.x, y: sh.y, z: sh.z, donuts: shelfLooks(sh) })),
    hits: s.hits.map((h) => ({ ...h })),
    fullBag: s.fullBag.map((e) => ({ ...e })),
    donutEvents: s.donutEvents.map((e) => ({ ...e })),
    ringOuts: s.ringOuts.map((e) => ({ ...e })),
    powers: s.powers.map((e) => ({ ...e })),
  };
}

/** @type {import('./match.js').MatchApi} */
export const SIM = Object.freeze({ createMatch, tick, snapshot });
