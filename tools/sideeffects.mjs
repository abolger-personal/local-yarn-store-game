// Usage: node tools/sideeffects.mjs (part of npm run check; see tools/README.md)
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';

const REQUIRED = ['owl.js', 'llama.js', 'lion.js'];   // register a species with npc.js
const src = storeFiles().map((f) => readFileSync(f, 'utf8')).join('\n');

const bare = new Set([...src.matchAll(/^import\s+'([^']+)';/gm)].map((m) => m[1].split('/').pop()));
const missing = REQUIRED.filter((r) => !bare.has(r));
console.log(`bare imports present: ${[...bare].join(', ') || '(none)'}`);
if (missing.length) console.error(`  MISSING registration import(s): ${missing.join(', ')}`);
else console.log('every registration import survived the split');
process.exit(missing.length ? 1 : 0);
