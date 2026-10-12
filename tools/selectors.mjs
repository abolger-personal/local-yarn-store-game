// Usage: node tools/selectors.mjs (part of npm run check; see tools/README.md)
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';

// ponytail: one id pool for all pages, so an id on the wrong page passes; per-page pools if that bites
const html = ['characters/store.html', 'characters/game.html', 'characters/puzzle.html', 'characters/store/ui/exterior.js']
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
