// Rewrite `import { x } from './old.js'` to the module that actually exports x.
// After moving declarations between modules, the old import still lints clean (eslint checks one
// file at a time) and fails only in the browser — so this runs off the real export map.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = storeFiles();
const owner = new Map();
for (const f of files) {
  const src = readFileSync(`${DIR}/${f}`, 'utf8');
  const here = `./${f}`;
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm))
    owner.set(m[1], here);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+\{([^}]+)\}\s*=/gm))
    for (const n of m[1].split(',')) {
      const t = (n.includes(':') ? n.split(':')[1] : n).trim();
      if (t) owner.set(t, here);
    }
}
let moved = 0;
for (const f of files) {
  const path = `${DIR}/${f}`;
  let src = readFileSync(path, 'utf8');
  const add = new Map();
  src = src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'(\.\/[^']+)';\n/g, (all, body, from) => {
    const keep = [];
    for (const raw of body.split(',').map((x) => x.trim()).filter(Boolean)) {
      const local = raw.split(/\s+as\s+/).pop().trim();
      const real = owner.get(local);
      if (real && real !== from && real !== `./${f}`) {
        if (!add.has(real)) add.set(real, []);
        add.get(real).push(raw);
        moved++;
        console.log(`  ${f}: ${local}  ${from} -> ${real}`);
      } else keep.push(raw);
    }
    if (!keep.length) return '';
    const joined = keep.join(', ');
    return joined.length < 92 ? `import { ${joined} } from '${from}';\n`
      : `import {\n  ${keep.join(',\n  ')},\n} from '${from}';\n`;
  });
  if (!add.size) continue;
  const lines = src.split('\n');
  for (const [from, names] of add) {
    const i = lines.findIndex((l) => l.startsWith('import {') && l.includes(`from '${from}'`));
    if (i >= 0) lines[i] = lines[i].replace('import { ', `import { ${names.join(', ')}, `);
    else lines.splice(Math.max(lines.findIndex((l) => l.startsWith('import ')), 0), 0,
      `import { ${names.join(', ')} } from '${from}';`);
  }
  writeFileSync(path, lines.join('\n'));
}
console.log(moved ? `${moved} imports repointed` : 'every import already points at the real owner');
