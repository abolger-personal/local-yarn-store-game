export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** @param {[string, () => void][]} steps @returns {string[]} the steps that threw */
export function runSteps(steps) {
  const broken = [];
  for (const [name, step] of steps) {
    try { step(); } catch (err) { broken.push(name); console.error(`install ${name} failed:`, err); }
  }
  return broken;
}

export const rnd = (n, rng) => Math.floor(rng() * n);

export const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

export const between = (rng, a, b) => a + rng() * (b - a);

const mix = (a) => {
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export const mulberry32 = (a) => () => mix(a = (a + 0x6D2B79F5) | 0);

/** mulberry32 whose state is `w.rngState`, so `w` stays plain data. */
export const draw = (w) => mix(w.rngState = (w.rngState + 0x6D2B79F5) | 0);

/** FNV-1a over the parts, numbers and strings alike. */
export function hash(...parts) {
  let h = 0x811C9DC5;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}
