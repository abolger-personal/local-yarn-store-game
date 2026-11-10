// The Greathammer's throw: one path for the aiming preview (play.js) and the flight (sim.js). REUSE-SPEC.md §Costumes, The Greathammer.
import { clamp, groundOf } from './match.js';

/**
 * `short`..`long`: the oval's length at k 0 and 1, `wide` its width for its length; `speed` a second along it; `chest` the
 * height it flies at, for the thrower's height; `r` the head's hit radius. 🥊 held `aim` seconds shows the path, full size at `full`.
 */
export const HAMMER = Object.freeze({ short: 2, long: 8, wide: 0.35, speed: 8, chest: 0.6, r: 0.35, aim: 0.4, full: 2.5 });
const SEG = 64;
// the oval for a throw 1 long, and how far along it each point is: every throw's is this, scaled by its length
const OVAL = Array.from({ length: SEG + 1 }, (_, i) => [0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SEG), (HAMMER.wide / 2) * Math.sin((2 * Math.PI * i) / SEG)]);
const RUN = [0];
for (let i = 1; i <= SEG; i++) RUN.push(RUN[i - 1] + Math.hypot(OVAL[i][0] - OVAL[i - 1][0], OVAL[i][1] - OVAL[i - 1][1]));

/** The path's size for 🥊 held `held` seconds, or null before the path shows. */
export const aimOf = (held) => (held < HAMMER.aim ? null : Math.min(1, (held - HAMMER.aim) / (HAMMER.full - HAMMER.aim)));

/** Where a fighter `h` tall throws from: its chest, facing its way. @param {{ x: number, y: number, z: number, facing: number }} f */
export const handOf = (f, h) => ({ x: f.x, y: f.y + HAMMER.chest * h, z: f.z, facing: f.facing });

/**
 * The hammer `t` seconds after a throw of size `k` from `from`: an oval flat at chest height, its long side along the facing,
 * out on the camera's side and back on the far one, at HAMMER.speed, kept inside the stage band; `to` is the hand now, which it
 * drifts to so it ends there. `T` is the whole lap's seconds.
 * @param {{ x: number, y: number, z: number, facing: number }} from @param {import('./match.js').Stage} stage
 * @param {{ x: number, y: number, z: number }} [to]
 */
export function hammerPath(from, k, t, stage, to = from) {
  const len = HAMMER.short + (HAMMER.long - HAMMER.short) * k;
  const T = (RUN[SEG] * len) / HAMMER.speed, d = (clamp(t, 0, T) * HAMMER.speed) / len;
  let i = 1;
  while (i < SEG && RUN[i] < d) i++;
  const w = (d - RUN[i - 1]) / (RUN[i] - RUN[i - 1] || 1), p = OVAL[i - 1], q = OVAL[i];
  const along = (p[0] + (q[0] - p[0]) * w) * len, across = (p[1] + (q[1] - p[1]) * w) * len;
  const ux = Math.cos(from.facing), uz = Math.sin(from.facing), side = ux < 0 ? -1 : 1;
  const g = groundOf(stage), m = HAMMER.r, drift = T > 0 ? clamp(t / T, 0, 1) : 1;
  return {
    x: clamp(from.x + ux * along - uz * across * side + (to.x - from.x) * drift, g.x0 + m, g.x1 - m),
    y: from.y + (to.y - from.y) * drift,
    z: clamp(from.z + uz * along + ux * across * side + (to.z - from.z) * drift, stage.backWall + m, g.z1 - m),
    T,
  };
}
