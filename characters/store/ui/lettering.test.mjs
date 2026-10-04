// lettering.js self-check: the frieze still measures what the door was drawn at, and every name
// the shop will ever letter (customers, pattern titles, the board's own words) has its glyphs.
import assert from 'node:assert/strict';
import { CELL, GLYPHS, GOLD_DEFS, layout, svgLettering } from './lettering.js';
import { NAMES } from '../../npc.js';
import { PATTERN_TITLES } from '../../../inventory/catalog.js';

// LOCAL YARN STORE was laid out at 370 units on the frieze before this module existed.
assert.equal(layout('LOCAL YARN STORE').width, 370);
assert.equal(layout('A B').width, GLYPHS.A[0] + 18 + GLYPHS.B[0], 'a space is the word gap alone, no letter gap');

const titles = Object.values(PATTERN_TITLES).flatMap((byShape) => Object.values(byShape).flat());
const words = [...NAMES, ...titles, 'CUSTOMER OF THE WEEK', 'NO PHOTOS YET'].map((w) => w.toUpperCase());
for (const w of words)
  for (const ch of w) assert.ok(ch === ' ' || GLYPHS[ch], `no glyph for ${JSON.stringify(ch)} in ${JSON.stringify(w)}`);

// Every path parses as SVG path data: letters, numbers and the commands this table uses only.
for (const [ch, [w, d]] of Object.entries(GLYPHS)) {
  assert.ok(w > 0, `${ch} has no width`);
  assert.match(d, /^[MLHVACSZ0-9.\s-]*$/, `${ch} path has an unexpected character`);
}
// Shrinking to fit keeps it inside the room given.
const svg = svgLettering('CUSTOMER OF THE WEEK', 100, 50, { cap: 40, maxWidth: 120 });
const scale = Number(/scale\(([\d.]+)\)/.exec(svg)[1]);
assert.ok(layout('CUSTOMER OF THE WEEK').width * scale <= 120.01, 'fitted line overflows');

// Gold strokes must not use an objectBoundingBox paint: a straight vertical or horizontal stroke
// (the i's stem, I, L, T, -) has a zero-width or zero-height box, and SVG then paints nothing.
const gold = svgLettering('i', 12, 22, { cap: 20, gold: true });
const ref = /stroke="url\(#([\w-]+)\)"/.exec(gold)?.[1];
assert.ok(ref, 'gold lettering does not stroke with a gradient');
const def = new RegExp(`<linearGradient id="${ref}"[^>]*>`).exec(GOLD_DEFS)?.[0];
assert.ok(def, `GOLD_DEFS does not define #${ref}`);
assert.match(def, /gradientUnits="userSpaceOnUse"/, 'gold gradient would vanish on a zero-width stroke');
assert.match(def, new RegExp(`y1="0"[^>]*y2="${CELL}"`), 'gold gradient does not span the cap height');

console.log(`lettering.test.mjs: all checks passed (${Object.keys(GLYPHS).length} glyphs, ${words.length} names)`);
