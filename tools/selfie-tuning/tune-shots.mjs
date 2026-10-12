// Tunes selfie.js SHOTS: one shot per species x garment x silhouette (and the pot holder and the
// armful), shared by every body of that species, by random search on selfie.js's scored-search score.
//
//   node tools/selfie-tuning/tune-shots.mjs [out.json] [workers]
//
// Per combination, a seed is BODIES fresh random bodies of the species, each dressed in a random
// item of that silhouette at close-up detail (as selfie-studio.js snap dresses them), and a fresh
// search RNG. A shot's score is the mean of selfieScore over the bodies, a body where it breaks a
// rule counting 0. The search starts from every authored front shot and the best shots already found
// for this type, draws DRAWS more across selfie.js RANGES, then hill-climbs round the top few. A
// combination is done at its first seed reaching GOOD; after SEEDS seeds without, it is flagged.
// Results go to the JSON after every combination, so a stopped run resumes where it was.
//
// The shawl is not searched: its shots are taken from behind, and the score's rules assume a front
// selfie (the face at the lens).
//
// On top of the score's rules, a worn garment's shot must hold the floors garments.test.mjs sets an
// authored shot (testFloors) on every body, or that body counts 0: the tuned shots become authored.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import * as THREE from 'three';
import { createCharacter, disposeCharacter, getSpecies, speciesIds } from '../../characters/npc.js';
import '../../characters/owl.js';
import '../../characters/llama.js';
import '../../characters/lion.js';
import { GARMENTS, LOOK, dress, heldAs, pileAs, randomItem, undress } from '../../characters/garments.js';
import { SHOTS, drawShot, idLook, seeded, seenShare, selfieScore, shoot } from '../../characters/selfie.js';
import { PATTERN_DESIGNS } from '../../inventory/catalog.js';

const BODIES = 6, SEEDS = 10, GOOD = 0.4, DRAWS = 600, TOP = 4, KEEP = 6;
const SPREADS = [0.15, 0.08, 0.04, 0.02], STEPS = 25;
const MAX = 0.58;        // the most selfie.js scoreShot can give: fill 0.21 + made 0.37, nothing off
const SKIP = new Set(['shawl']), HELD = new Set(['potholder', 'pile', 'bag']);

const round = (shot) => Object.fromEntries(Object.entries(shot).map(([k, v]) => [k, Math.round(v * 100) / 100]));

/** Every combination: [species, type, silhouette or null]. */
function combos() {
  const types = Object.keys(GARMENTS).filter((t) => !SKIP.has(t));
  return speciesIds().flatMap((id) => [
    ...types.flatMap((type) => GARMENTS[type].silhouettes.map((s) => [id, type, s])),
    [id, 'potholder', null], [id, 'pile', null],
  ]);
}
const keyOf = ([id, type, silhouette]) => `${id}|${silhouette ? `${type}:${silhouette}` : type}`;

// ---------------------------------------------------------------- worker: one combination

const hex = () => `#${new THREE.Color().setHSL(Math.random(), 0.5, 0.55).getHexString()}`;
const finished = (pattern) => ({ pattern, yarn: [{ c: hex() }] });
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** What the selfie is of, as an outfit: the garment of that silhouette, or a held piece. */
function outfitOf(type, silhouette) {
  if (type === 'potholder') return { potholder: heldAs(finished(pick(PATTERN_DESIGNS.filter((d) => d.patternType === 'potholder'))), (y) => y.c).item };
  if (type === 'pile') {
    const designs = PATTERN_DESIGNS.filter((d) => d.patternType !== 'shawl');
    return { pile: pileAs(Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => finished(pick(designs))), (y) => y.c).item };
  }
  // a bag's selfie shows it held up (selfie-studio.js snap)
  return { [type]: { ...randomItem(type), on: true, silhouette, ...(type === 'bag' && { held: true }) } };
}

/** A random body of the species, dressed at close-up detail as snap dresses it. */
function body(id, type, silhouette) {
  const kit = getSpecies(id);
  const built = createCharacter({ ...kit.randomise(structuredClone(kit.defaults)), mergeMeshes: false }, kit);
  const { viewPx } = LOOK;
  LOOK.viewPx = 0;
  try { dress(built, outfitOf(type, silhouette)); } finally { LOOK.viewPx = viewPx; }
  const showing = built.garments.some((m) => m.parent === built.holds[1]);
  return { built, showing, look: idLook(built) };
}

const camera = new THREE.PerspectiveCamera(30, 240 / 300, 0.01, 50);

/**
 * What garments.test.mjs holds an authored shot to, beyond the score's own rules (10% of the eyes):
 * over a quarter of the eyes seen, every eye in view looking into the lens -- the pupil turns only
 * so far (selfie.js GAZE), so a face turned well aside leaves it looking past it -- and the horizon
 * visibly off level, which a lens looking steeply down loses.
 */
function testFloors(built, look) {
  if (Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).y) <= 0.11) return false;
  const eyes = built.joints.eye.map(({ node }) => node.children.filter((c) => c.isMesh));
  if (seenShare(built, camera, eyes.flat(), 120, look) <= 0.26) return false;
  return built.joints.eye.every(({ node }, i) => {
    if (seenShare(built, camera, eyes[i], 60, look) < 0.2) return true;
    const c = node.getWorldPosition(new THREE.Vector3());
    return node.children[1].getWorldPosition(new THREE.Vector3()).sub(c).angleTo(camera.position.clone().sub(c)) < 0.24;
  });
}

/**
 * A shot's mean score over the bodies (a broken rule counts 0), its worst, and how many pass. Stops
 * early, returning null, once even full marks on the rest could not reach `bar`.
 */
function evaluate(bodies, type, shot, bar) {
  let sum = 0, min = Infinity, passed = 0;
  for (const [i, { built, showing, look }] of bodies.entries()) {
    shoot(built, camera, shot, showing);
    let s = selfieScore(built, camera, type, look);
    // held pieces: the test asks only that they show, which the score already does
    if (Number.isFinite(s) && !HELD.has(type) && !testFloors(built, look)) s = -Infinity;
    const v = Number.isFinite(s) ? s : 0;
    if (Number.isFinite(s)) passed++;
    sum += v;
    min = Math.min(min, v);
    if (sum + (bodies.length - i - 1) * MAX < bar * bodies.length) return null;
  }
  return { shot, mean: sum / bodies.length, min, passed };
}

/** One seed's search: starts, random draws, then hill-climbing round the top few. Returns its top, best first. */
function searchSeed(bodies, type, starts, rng) {
  let top = [];
  const consider = (shot) => {
    const bar = top.length < TOP ? 0 : top.at(-1).mean;
    const r = evaluate(bodies, type, round(shot), bar);
    if (!r || (top.length >= TOP && r.mean <= bar) || r.mean <= 0) return r;
    if (top.some((t) => JSON.stringify(t.shot) === JSON.stringify(r.shot))) return r;
    top = [...top, r].toSorted((a, b) => b.mean - a.mean).slice(0, TOP);
    return r;
  };
  for (const s of starts) consider(s);
  for (let i = 0; i < DRAWS; i++) consider(drawShot(rng));
  return climb(top, (shot, bar) => evaluate(bodies, type, round(shot), bar), rng);
}

/** Hill-climb each of `top`: narrowing draws round it, keeping any that score higher. */
function climb(top, score, rng) {
  return top.map((start) => {
    let best = start;
    for (const spread of SPREADS) {
      for (let i = 0; i < STEPS; i++) {
        const r = score(drawShot(rng, best.shot, spread), best.mean);
        if (r && r.mean > best.mean) best = r;
      }
    }
    return best;
  }).toSorted((a, b) => b.mean - a.mean);
}

/** One combination, seed after seed until one is GOOD or SEEDS run out. */
function tune([id, type, silhouette], warm) {
  const t0 = performance.now();
  const authored = Object.values(SHOTS).flatMap(Object.values).filter((s) => s && !s.behind)
    .map(({ headYaw, headPitch, fov, up, k, drop, off }) => ({ headYaw, headPitch, fov, up, k, drop, off }));
  const starts = [...authored, ...warm];
  let kept = [], seedMaxes = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const bodies = Array.from({ length: BODIES }, () => body(id, type, silhouette));
    // the best so far go in again, scored on these bodies: a shot must hold for any of them
    const top = searchSeed(bodies, type, [...kept.map((r) => r.shot), ...starts], seeded(Math.floor(Math.random() * 2 ** 32)));
    for (const { built } of bodies) { undress(built); disposeCharacter(built); }
    seedMaxes = [...seedMaxes, top[0]?.mean ?? 0];
    kept = [...kept, ...top].toSorted((a, b) => b.mean - a.mean).slice(0, KEEP);
    parentPort.postMessage({ progress: `${keyOf([id, type, silhouette])} seed ${seed}: ${(top[0]?.mean ?? 0).toFixed(3)}` });
    if ((kept[0]?.mean ?? 0) >= GOOD) break;
  }
  const best = kept[0] ?? { shot: null, mean: 0, min: 0, passed: 0 };
  return { species: id, type, silhouette, shot: best.shot, max: best.mean, min: best.min, passed: best.passed, bodies: BODIES,
    seeds: seedMaxes.length, seedMaxes, flagged: best.mean < GOOD, top: kept, seconds: Math.round((performance.now() - t0) / 1000) };
}

if (!isMainThread) {
  parentPort.on('message', ({ combo, warm }) => parentPort.postMessage({ key: keyOf(combo), result: tune(combo, warm) }));
}

// ---------------------------------------------------------------- main: the queue and the file

function main() {
  const out = process.argv[2] ?? 'tools/selfie-tuning/shots-tuned.json';
  const workers = Number(process.argv[3] ?? Math.max(1, availableParallelism() - 1));
  let results = {};
  try { results = JSON.parse(readFileSync(out, 'utf8')); } catch { /* no file yet: a fresh run */ }
  const queue = combos().filter((c) => !results[keyOf(c)]);
  const total = combos().length, t0 = Date.now();
  console.log(`${total} combinations, ${total - queue.length} done already, ${queue.length} to go on ${workers} workers`);
  const save = () => {
    writeFileSync(`${out}.tmp`, `${JSON.stringify(results, null, 1)}\n`);
    renameSync(`${out}.tmp`, out);
  };
  // the best shots found so far for this type, any species: good starts for its other silhouettes
  const warmFor = ([, type]) => Object.values(results).filter((r) => r.type === type && r.shot).map((r) => r.shot);
  const next = (w) => {
    const combo = queue.shift();
    if (combo) w.postMessage({ combo, warm: warmFor(combo) });
    else w.terminate();
  };
  for (let i = 0; i < Math.min(workers, queue.length); i++) {
    const w = new Worker(new URL(import.meta.url));
    w.on('message', (m) => {
      if (m.progress) { console.log(`  [w${i}] ${m.progress}`); return; }
      results[m.key] = m.result;
      save();
      const done = Object.keys(results).length, mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`${done}/${total} ${m.key}: max ${m.result.max.toFixed(3)} min ${m.result.min.toFixed(3)} passed ${m.result.passed}/${BODIES}`
        + ` seeds ${m.result.seeds} ${m.result.seconds}s${m.result.flagged ? ' FLAGGED' : ''} (${mins} min)`);
      next(w);
    });
    w.on('error', (e) => { console.error(e); process.exitCode = 1; });
    next(w);
  }
}

if (isMainThread) main();
