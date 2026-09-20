// Every element the shop looks up must exist in store.html.
//
// The markup and the code that drives it are in different files, so renaming an element is a
// silent break: `getElementById` returns null and the failure lands later, somewhere else. It
// cost a whole debugging round when #rotator became #furnBtns — installMove() threw, which took
// out installInput() behind it, and the symptom was "items don't follow the mouse".
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';

// Both pages, as one pool of ids. The store modules drive the shop AND the puzzle bench, and a
// module cannot say which page it was loaded by — so this can no longer tell you an element is on
// the WRONG page, only that it exists on neither, which is the failure that actually happened.
const html = ['characters/store.html', 'characters/puzzle.html']
  .map((f) => readFileSync(f, 'utf8')).join('\n');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));

let bad = 0;
const miss = (what, f) => { console.error(`  MISSING ${what}  (used by ${f})`); bad++; };
for (const f of storeFiles()) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/getElementById\('([^']+)'\)/g))
    if (!ids.has(m[1])) miss(`#${m[1]}`, f);
  for (const m of src.matchAll(/querySelectorAll?\('([^']+)'\)/g))
    for (const part of m[1].split(/[\s>]+/)) {
      if (part.startsWith('#') && !ids.has(part.slice(1))) miss(part, f);
      if (part.startsWith('.') && !classes.has(part.slice(1))) miss(part, f);
    }
}
console.log(bad ? `${bad} selector(s) have no element` : 'every selector the JS uses exists in the markup');
process.exit(bad ? 1 : 0);
