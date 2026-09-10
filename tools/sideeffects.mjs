// Every bare `import './x.js'` that the shop used to have must still be there somewhere.
//
// A bare import is a REGISTRATION: owl.js and llama.js add themselves to npc.js's species list
// and export nothing. Nothing references them by name, so eslint sees nothing missing, the link
// checker sees nothing missing, and the failure surfaces far away — at the first NPC spawn, as
// "Cannot read properties of undefined (reading 'randomise')". Which is how it got dropped when
// the inline script became 20 modules.
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';

const REQUIRED = ['owl.js', 'llama.js'];   // register a species with npc.js; export nothing
const src = storeFiles().map((f) => readFileSync(f, 'utf8')).join('\n');

const bare = new Set([...src.matchAll(/^import\s+'([^']+)';/gm)].map((m) => m[1].split('/').pop()));
const missing = REQUIRED.filter((r) => !bare.has(r));
console.log(`bare imports present: ${[...bare].join(', ') || '(none)'}`);
if (missing.length) console.error(`  MISSING registration import(s): ${missing.join(', ')}`);
else console.log('every registration import survived the split');
process.exit(missing.length ? 1 : 0);
