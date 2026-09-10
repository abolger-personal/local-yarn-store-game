// Small pure helpers with no dependencies at all.
//
// This module exists to be a LEAF. `esc` used to live in hud.js, which meant the held-item
// readout imported the debug panel to escape a string — an edge that helped make the interaction
// layer circular. Anything here must stay importable from anywhere.

/** HTML-escape. Everything user-visible goes through this: NPC names are generated, not trusted. */
export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** A random integer in [0, n). */
export const rnd = (n) => Math.floor(Math.random() * n);

/**
 * mulberry32: a tiny seeded PRNG, so a palette index means the same colour across reloads.
 * Not for anything that needs statistical quality — it is here to make a demo reproducible.
 */
export const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
