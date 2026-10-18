// The playability checks every stage passes, hand-made (levels.test.mjs) or generated (generate.test.mjs).
// Syrup, butter and trampolines are all round patches lying on a floor top.
import assert from 'node:assert/strict';
import { BRICK, MAX_HEROES, TICK_HZ, WIDEST_FIGHTER, groundOf, outside, overlaps, spotRect } from './match.js';
import { createMatch, snapshot, tick } from './sim.js';
import { HEIGHT_LIMIT } from './build.js';
import { MATCH } from './roster.js';

const KINDS = ['ground', 'deck', 'hill'];
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const ENEMY = { heroes: 'badGuys', badGuys: 'heroes' };
/** The widest dressed-up kid: if it gets through, everyone does (playtest: a gap only as wide as two blocks). */
const kid = (team, width = WIDEST_FIGHTER) => ({ id: 'kid', team, height: 0.9, width, reach: 0.38, look: LOOK });
export const NARROW = 0.45;

/**
 * Ticks until a fighter of `team`, tapped from its spawn to the other team's shelf, steals there; Infinity if not within a
 * minute. With `kicks`, stood blocked at a wall it taps the nearest block of it and kicks it down, then heads on, the way
 * a kid learns to break in: a wide one breaks block after block until the hole fits it. `match`: the level's rules (double jumps).
 */
export function ticksToShelf(stage, team = 'heroes', kicks = false, width = WIDEST_FIGHTER, match = MATCH) {
  const m = createMatch([kid(team, width)], stage, { match }), shelf = { thing: 'shelf', team: ENEMY[team] };
  let brick = null, sent = null;
  for (let i = 0; i < 60 * TICK_HZ; i++) {
    const s = snapshot(m), [f] = s.fighters;
    if (brick && !s.bricks.some((b) => b.id === brick)) brick = null;
    if (kicks && !brick && f.move === 'blocked') {
      const theirs = s.bricks.filter((b) => b.team !== team), d = (b) => Math.hypot(b.x + BRICK / 2 - f.x, b.z + BRICK / 2 - f.z);
      brick = theirs.sort((a, b) => d(a) - d(b) || a.y - b.y)[0]?.id ?? null;
    }
    const target = brick ? { thing: 'brick', id: brick } : shelf, key = JSON.stringify(target);
    const kick = Boolean(brick) && i % 20 === 0 && f.move === 'idle';
    tick(m, { kid: { target: key === sent ? null : target, punch: false, kick } });
    sent = key;
    if (snapshot(m).donutEvents.some((e) => e.kind === 'steal')) return i;
  }
  return Infinity;
}

/** Whether a hero carrying a donut, tapped from its spawn to its own shelf, banks it within 30 seconds. */
export function banksHome(stage, match = MATCH) {
  const m = createMatch([kid('heroes')], stage, { match });
  m.fighters[0].carrying = LOOK;
  for (let i = 0; i < 30 * TICK_HZ; i++) {
    tick(m, i === 0 ? { kid: { target: { thing: 'shelf', team: 'heroes' }, punch: false, kick: false } } : {});
    if (snapshot(m).donutEvents.some((e) => e.kind === 'bank')) return true;
  }
  return false;
}

/** Whether a hero tapped from its spawn onto the middle of `floor`'s top ends up standing there within 20 seconds, forts knocked down. */
function reachesTop(stage, floor, match) {
  const m = createMatch([kid('heroes', NARROW)], { ...stage, bricks: [] }, { match });
  const x = (floor.x0 + floor.x1) / 2, z = (floor.z0 + floor.z1) / 2;
  for (let i = 0; i < 20 * TICK_HZ; i++) {
    tick(m, i === 0 ? { kid: { target: { x, z, y: floor.y }, punch: false, kick: false } } : {});
    const [f] = snapshot(m).fighters;
    if (f.onGround && f.y === floor.y && outside(floor, f.x, f.z) === 0 && f.move === 'idle') return true;
  }
  return false;
}

const brickRect = (b) => ({ x0: b.x, x1: b.x + BRICK, z0: b.z, z1: b.z + BRICK });

/** REUSE-SPEC.md §Forts, Start spots come first: six spots, each with its pile room clear ground in the heroes' third. */
function checkStarts(stage, at) {
  const ground = groundOf(stage), third = stage.zones.find((z) => z.team === 'heroes'), starts = stage.starts ?? [];
  assert.equal(starts.length, MAX_HEROES, `${at}: a start spot for each of ${MAX_HEROES} heroes`);
  const rects = starts.map(spotRect);
  rects.forEach((q, i) => {
    const where = `${at}: start spot ${i} at ${starts[i].x},${starts[i].z}`;
    assert.ok(q.x0 >= ground.x0 && q.x1 <= third.x1 && q.z0 >= stage.backWall && q.z1 <= ground.z1, `${where} is on the ground in the heroes' third`);
    assert.ok(stage.floors.every((f) => f === ground || !overlaps(q, f)), `${where} is not under a raised floor`);
    assert.ok(stage.bricks.every((b) => !overlaps(q, brickRect(b))), `${where} has no brick in it`);
    for (const p of [...stage.puddles, ...stage.butter ?? [], ...stage.springs ?? []])
      assert.ok(outside(q, p.x, p.z) >= p.r, `${where} is clear of the patch at ${p.x},${p.z}`);
    assert.ok(rects.every((o, j) => j === i || !overlaps(q, o)), `${where} doesn't overlap another`);
  });
}

/** Asserts a stage is playable; `at` names it in failures. `breakIn`: the bad guys' shelf must be walled in, reached only by kicking through; `match`: the level's rules. */
export function checkLevel(stage, at, breakIn = false, match = MATCH) {
  assert.ok(stage.floors.every((f) => KINDS.includes(f.kind)), `${at}: every floor is a ${KINDS.join('/')}`);
  assert.equal(stage.floors.filter((f) => f.kind === 'ground').length, 1, `${at}: exactly one ground`);
  const ground = groundOf(stage), raised = stage.floors.filter((f) => f.y > ground.y);
  assert.equal(raised.length, stage.floors.length - 1, `${at}: the ground is the lowest floor`);
  for (const sh of stage.shelves)
    assert.ok(stage.floors.some((f) => f.y === sh.y && outside(f, sh.x, sh.z) === 0), `${at}: the ${sh.team} shelf stands on a floor`);
  for (const p of [...stage.puddles, ...stage.butter ?? [], ...stage.springs ?? []]) {
    const y = p.y ?? ground.y;
    assert.ok(stage.floors.some((f) => f.y === y && outside(f, p.x, p.z) === 0), `${at}: patch at ${p.x},${p.z} lies on a floor ${y} high`);
    assert.ok(stage.floors.every((f) => f.y <= y || outside(f, p.x, p.z) >= p.r), `${at}: patch at ${p.x},${p.z} is clear of higher floors`);
  }
  for (const b of stage.bricks)
    assert.ok(raised.every((f) => b.y >= f.y || !overlaps(brickRect(b), f)), `${at}: brick at ${b.x},${b.y},${b.z} is not inside a raised floor`);
  checkStarts(stage, at);
  // REUSE-SPEC.md §Forts: the height limit is high enough that nobody can jump over the wall, on every stage's jump
  const third = stage.zones.find((z) => z.team === 'heroes'), across = [];
  for (let z = stage.backWall; z < ground.z1 - 1e-9; z += BRICK)
    for (let k = 0; k < HEIGHT_LIMIT; k++) across.push({ team: 'heroes', x: third.x1 - 4 * BRICK, z, y: k * BRICK, hits: 2 });
  assert.equal(ticksToShelf({ ...stage, bricks: across, starts: undefined }, 'badGuys', false, NARROW, match), Infinity,
    `${at}: a wall across the heroes' third as high as the height limit (${HEIGHT_LIMIT}) can't be got over`);
  // REUSE-SPEC.md §Mode: dropped donuts stay where they land, so any top one can land on must be reachable
  assert.ok(banksHome(stage, match), `${at}: the widest fighter (${WIDEST_FIGHTER}) gets from its start spot to its own shelf to bank`);
  for (const f of raised) assert.ok(reachesTop(stage, f, match), `${at}: the ${f.kind} top at x ${f.x0}..${f.x1}, y ${f.y} can be reached, or a donut landing there is lost`);
  // a gap or a wall it can break lets the widest fighter in: some walls are only ever broken by the biggest kids
  assert.ok(ticksToShelf(stage, 'heroes', true, WIDEST_FIGHTER, match) < Infinity, `${at}: the widest fighter (${WIDEST_FIGHTER}) gets to the bad guys' shelf, through a gap or kicking a way in`);
  if (!breakIn) {
    assert.ok(ticksToShelf(stage, 'heroes', false, NARROW, match) < Infinity, `${at}: a hero tapped from its spawn to the bad guys' shelf gets there without kicking`);
    return;
  }
  assert.equal(ticksToShelf(stage, 'heroes', false, NARROW, match), Infinity, `${at}: there is no way round or over the bad guys' fort, so you have to break in`);
}
