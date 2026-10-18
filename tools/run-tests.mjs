// Usage: node tools/run-tests.mjs [fast|slow|all] [file ...] (see tools/README.md)
import { spawnSync } from 'node:child_process';

const LIMIT_MS = 2000;

// CPU-heavy work, not waiting: too slow for the fast section; an entry may carry env (generate: the seeds it ran before)
const SLOW = [
  ['spinoff/generate.test.mjs', { SEEDS: '20' }],
  'characters/rig.test.mjs',
  'characters/craft-anim.test.mjs',
  'characters/garments.test.mjs',
  'characters/store/walk.test.mjs',
];

const FAST = [
  'characters/motion.test.mjs',
  'characters/visit.test.mjs',
  'characters/guestbook.test.mjs',
  'characters/wip.test.mjs',
  'characters/store/plants.test.mjs',
  'characters/store/wood.test.mjs',
  'characters/store/speed.test.mjs',
  'characters/store/view.test.mjs',
  'inventory/supply.test.mjs',
  'characters/store/ui/lettering.test.mjs',
  'inventory/grid.test.mjs',
  'inventory/pick-place.test.mjs',
  'spinoff/fighter.test.mjs',
  'spinoff/punches.test.mjs',
  'spinoff/kicks.test.mjs',
  'spinoff/stage.test.mjs',
  'spinoff/roster.test.mjs',
  'spinoff/controls.test.mjs',
  'spinoff/sim.test.mjs',
  'spinoff/hammer.test.mjs',
  'spinoff/build.test.mjs',
  'spinoff/cpu.test.mjs',
  'spinoff/multiplayer.test.mjs',
  'spinoff/together.test.mjs',
  'spinoff/levels.test.mjs',
  'spinoff/progress.test.mjs',
  'spinoff/generate.test.mjs',
  'spinoff/visibility.test.mjs',
];

const [section = 'fast', ...only] = process.argv.slice(2);
const files = only.length ? only : { fast: FAST, slow: SLOW, all: [...FAST, ...SLOW] }[section];
if (!files) throw new Error(`unknown section ${section}`);
// FULL=1 (check:full) samples more than the fast section's time allows
const timed = section === 'fast' && !process.env.FULL;

let failed = 0;
for (const entry of files) {
  const [f, env] = [entry].flat();
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...env, ...process.env } });
  const ms = performance.now() - t0;
  const over = timed && ms > LIMIT_MS;
  const bad = r.status !== 0 || over;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${(ms / 1000).toFixed(2).padStart(6)} s  ${f}${over ? `  (over ${LIMIT_MS / 1000} s)` : ''}`);
  if (r.status !== 0) process.stdout.write(r.stdout + r.stderr);
  failed += bad ? 1 : 0;
}
console.log(failed ? `${failed} of ${files.length} failed` : `all ${files.length} passed`);
process.exit(failed ? 1 : 0);
