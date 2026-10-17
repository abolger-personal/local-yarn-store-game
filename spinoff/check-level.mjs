// The playability checks every stage passes, hand-made (levels.test.mjs) or generated (generate.test.mjs).
// Syrup, butter and trampolines are all round patches lying on a floor top.
import assert from 'node:assert/strict';
import { BRICK, MAX_HEROES, TICK_HZ, groundOf, outside, overlaps, spotRect } from './match.js';
import { createMatch, snapshot, tick } from './sim.js';
import { HEIGHT_LIMIT } from './build.js';

const KINDS = ['ground', 'deck', 'hill'];
const LOOK = { dough: '#e8c48a', frosting: '#14c4e0', stripe: false };
const ENEMY = { heroes: 'badGuys', badGuys: 'heroes' };

/**
 * Ticks until a fighter of `team`, tapped from its spawn to the other team's shelf, steals there; Infinity if not within 30
 * seconds. With `kicks`, it kicks whenever it stands blocked at a wall, the way a kid learns to break in.
 */
export function ticksToShelf(stage, team = 'heroes', kicks = false) {
  const m = createMatch([{ id: 'kid', team, height: 0.9, width: 0.45, reach: 0.38, look: LOOK }], stage);
  const go = { kid: { target: { thing: 'shelf', team: ENEMY[team] }, punch: false, kick: false } };
  for (let i = 0; i < 30 * TICK_HZ; i++) {
    const kick = kicks && i % 20 === 0 && snapshot(m).fighters[0].move === 'blocked';
    tick(m, i === 0 ? go : { kid: { target: null, punch: false, kick } });
    if (snapshot(m).donutEvents.some((e) => e.kind === 'steal')) return i;
  }
  return Infinity;
}

/** Whether a hero tapped from its spawn onto the middle of `floor`'s top ends up standing there within 20 seconds, forts knocked down. */
function reachesTop(stage, floor) {
  const m = createMatch([{ id: 'kid', team: 'heroes', height: 0.9, width: 0.45, reach: 0.38, look: LOOK }], { ...stage, bricks: [] });
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

/** Asserts a stage is playable; `at` names it in failures. `breakIn`: the bad guys' shelf must be walled in, reached only by kicking through. */
export function checkLevel(stage, at, breakIn = false) {
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
  assert.equal(ticksToShelf({ ...stage, bricks: across, starts: undefined }, 'badGuys'), Infinity,
    `${at}: a wall across the heroes' third as high as the height limit (${HEIGHT_LIMIT}) can't be got over`);
  // REUSE-SPEC.md §Mode: dropped donuts stay where they land, so any top one can land on must be reachable
  for (const f of raised) assert.ok(reachesTop(stage, f), `${at}: the ${f.kind} top at x ${f.x0}..${f.x1}, y ${f.y} can be reached, or a donut landing there is lost`);
  if (!breakIn) {
    assert.ok(ticksToShelf(stage) < Infinity, `${at}: a hero tapped from its spawn to the bad guys' shelf gets there`);
    return;
  }
  assert.equal(ticksToShelf(stage), Infinity, `${at}: there is no way round or over the bad guys' fort, so you have to break in`);
  assert.ok(ticksToShelf(stage, 'heroes', true) < Infinity, `${at}: kicking the wall where you get stuck breaks a way in to the shelf`);
}
