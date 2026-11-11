import assert from 'node:assert/strict';
import { JUMP_SPEED, reachUp } from '../spinoff/walk.js';
import { SECONDS, forSim, generateLevel, secondsOf, standing, structure } from './generate.js';
import { LOOK } from '../characters/garments.js';
import { MATCH } from '../spinoff/combat.js';
import { entrantOf } from '../spinoff/fighter.js';
import { SIM } from '../spinoff/sim.js';
import { buildHero, faceOf, newHero } from './hero.js';
import { DROP_FT, FT, JUMP_FT, PIECES, REAL_A, joins } from './pieces.js';
import { rng } from '../spinoff/generate.js';

// the jump the pieces are built round is one a fighter really makes, and a 4 ft deck is the fighters' 0.9 one
assert.ok(JUMP_FT * FT <= reachUp(JUMP_SPEED), `a ${JUMP_FT} ft jump up is in reach (${reachUp(JUMP_SPEED).toFixed(2)})`);
assert.equal(4 * FT, 0.9);

// the real structure A is one string the generator can make: its ends join, from the ground and back down
const real = REAL_A.map((id) => PIECES[id]);
real.slice(1).forEach((p, i) => assert.ok(joins(real[i].out, p.in), `${real[i].id} → ${p.id}`));
assert.equal(real[0].in, 0);
assert.equal(real.at(-1).out, 0);
assert.ok(!joins(0, 6) && joins(0, 4) && joins(7, 6) && !joins(7, 7 - DROP_FT - 1), 'up a jump, down a step, no further');

// every structure starts from the ground, every join matches, and it comes back down
const r = rng(1);
for (let i = 0; i < 500; i++) {
  const ids = structure(r), ps = ids.map((id) => PIECES[id]);
  assert.ok(ps[0].in <= JUMP_FT && ps.at(-1).out === 0 && ps.slice(0, -1).every((p) => p.out > 0), ids.join(' '));
  ps.slice(1).forEach((p, j) => assert.ok(joins(ps[j].out, p.in), ids.join(' ')));
  assert.ok(ids.length >= 7 && ids.length <= 14, ids.join(' '));
}

/** Can a hero (0.15 each side) walk the ground from x0 - 1 to x1 + 1, past the decks? Worked out apart from generate.js. */
function walkable(decks, x0, x1, ground) {
  const step = 0.05, r = 0.15, zs = [];
  for (let z = ground.z0 + r; z <= ground.z1 - r + 1e-9; z += step) zs.push(z);
  const free = (x, z) => decks.every((f) => !(x > f.x0 - r && x < f.x1 + r && z > f.z0 - r && z < f.z1 + r));
  let reach = new Set(zs.map((z, k) => k).filter((k) => free(x0 - 1, zs[k])));
  for (let x = x0 - 1 + step; x <= x1 + 1 && reach.size; x += step) {
    const next = new Set([...reach].filter((k) => free(x, zs[k])));
    // spread along z through open ground at this x
    for (const k of [...next]) for (const d of [-1, 1]) for (let j = k + d; j >= 0 && j < zs.length && free(x, zs[j]) && !next.has(j); j += d) next.add(j);
    reach = next;
  }
  return reach.size > 0;
}
let turned = 0;

for (let seed = 0; seed < 200; seed++) {
  const L = generateLevel(seed);
  assert.deepEqual(generateLevel(seed), L, 'the same seed, the same level');
  assert.ok(L.seconds >= SECONDS.min && L.seconds <= SECONDS.max, `seed ${seed}: ${L.seconds} s`);
  // one ground, the lowest, under everything; every deck on it, and none higher than a piece's
  const [ground, ...rest] = L.floors;
  assert.ok(ground.kind === 'ground' && rest.every((f) => f.kind === 'deck' && f.y > 0 && f.x0 >= ground.x0 && f.x1 <= ground.x1));
  assert.ok(rest.every((f) => f.y <= 7.5 * FT + 1e-3), 'no deck higher than the top deck');
  // nobody walks past a structure on the ground: somewhere in it, decks cover the band back to front
  // (decks, climbs and stairs stand in the way; under a slide or the bridge's ends is open)
  for (const sp of L.spans) assert.ok(!walkable(standing(L), sp.x0, sp.x1, ground), `seed ${seed}: no walking past ${sp.x0}..${sp.x1}`);
  assert.ok(rest.every((f) => f.z0 >= ground.z0 && f.z1 <= ground.z1 && f.z0 < f.z1), `seed ${seed}: decks in the band`);
  turned += rest.filter((f) => f.z0 > ground.z0 || f.z1 < ground.z1).length;
  assert.ok(L.shelves.length && L.starts.length && L.ringOut.x1 > ground.x1, 'what spinoff/sim.js needs to run it');
  assert.ok(L.structures.length >= 2, `seed ${seed}: ${L.structures.length} structures`);
}
assert.ok(turned > 1000, `structures turn, not just lie across the band (${turned} decks not across it)`);
assert.notDeepEqual(generateLevel(1).structures, generateLevel(2).structures, 'seeds differ');
assert.ok(Object.values(PIECES).every((p) => secondsOf(p) > 0));
// in the donut fighters' sim, a hero that can't jump, sent (by its route-finder) to a spot past the first structure,
// never gets there: decks, climbs and stairs (steps, till step 3) stand in the way, with no way round them on foot
LOOK.viewPx = 0;
for (const seed of [1, 2, 3]) {
  const raw = generateLevel(seed), L = forSim(raw), hero = newHero(() => 0.25);
  const s = SIM.createMatch([entrantOf(faceOf(hero), buildHero(hero), { id: 'me', team: 'heroes' })], L, { match: MATCH });
  s.jump = { speed: 0, up: 0, spring: 0, springUp: 0 };
  const first = raw.spans[0], idle = { target: null, punch: false, kick: false };
  for (let i = 0; i < 900; i++) {
    s.t0 = s.tick;
    SIM.tick(s, { me: i % 60 === 0 ? { ...idle, target: { x: first.x1 + 3, z: 0 } } : idle });
  }
  const { x } = SIM.snapshot(s).fighters[0];
  assert.ok(x < first.x1, `seed ${seed}: on foot, no way past the first structure (got to ${x.toFixed(2)}, it ends at ${first.x1})`);
}
console.log('generate ok', generateLevel(1).structures.map((s) => s.join('>')).join(' | '), generateLevel(1).seconds, 's');
