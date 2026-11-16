// Usage: node tools/exports.mjs [dir...] (part of npm run check; see tools/README.md)
// An export no other file names is shared surface nobody shares: delete it or drop its `export`.
// ponytail: matches names as words, not real imports, so a same-named word in another file hides an unused export;
// use knip if that's ever seen. (import-x/no-unused-modules is a no-op on ESLint 10.)
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';

const DIRS = process.argv.length > 2 ? process.argv.slice(2) : ['tmnt'];
const everything = ['characters', 'inventory', 'spinoff', 'tmnt'].flatMap((d) => storeFiles(d)).map((f) => [f, readFileSync(f, 'utf8')]);
const tests = ['spinoff', 'tmnt', 'characters', 'inventory'].flatMap((d) => storeFiles(d, '.mjs')).map((f) => [f, readFileSync(f, 'utf8')]);
const all = [...everything, ...tests];
const unused = everything.filter(([f]) => DIRS.some((d) => f.startsWith(`${d}/`))).flatMap(([f, src]) =>
  [...src.matchAll(/^export (?:async )?(?:const|let|function\*?|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
    .filter((name) => !all.some(([g, other]) => g !== f && new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(other)))
    .map((name) => `${f}: ${name}`));
for (const u of unused) console.error(`  unused export ${u}`);
if (!unused.length) console.log(`every export in ${DIRS.join(', ')} is used by another file`);
process.exit(unused.length ? 1 : 0);
