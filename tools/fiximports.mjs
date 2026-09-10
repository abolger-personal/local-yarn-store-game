// Add the imports eslint reports as missing, and drop the ones it reports as unused.
// Uses eslint's real scope analysis rather than a token scan — which is what got template-literal
// `${names}` wrong when this was done by hand.
import { ESLint } from 'eslint';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = storeFiles();

const owner = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const here = `./${f.split('/').pop()}`;
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm))
    owner.set(m[1], here);
  // destructured exports too: `export const { a, b: c } = picker;`
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+\{([^}]+)\}\s*=/gm))
    for (const n of m[1].split(',')) {
      const t = n.includes(':') ? n.split(':')[1] : n;
      if (t.trim()) owner.set(t.trim(), here);
    }
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) owner.set(m[1], here);
}
const ext = JSON.parse(readFileSync(process.argv[2], 'utf8')).ext_name;

for (let pass = 1; pass <= 8; pass++) {
  const results = await new ESLint().lintFiles(files);
  let changed = 0;
  for (const r of results) {
    const self = `./${r.filePath.split('/').pop()}`;
    const missing = new Set(r.messages.filter((m) => m.ruleId === 'no-undef')
      .map((m) => /'([^']+)' is not defined/.exec(m.message)?.[1]).filter(Boolean));
    const dead = new Set(r.messages
      .filter((m) => m.ruleId === 'no-unused-vars' && /is defined but never used/.test(m.message))
      .map((m) => /'([^']+)'/.exec(m.message)?.[1]).filter(Boolean));
    if (!missing.size && !dead.size) continue;
    let src = readFileSync(r.filePath, 'utf8');
    // prune first, so a name that is both stale and re-needed lands in the right place
    src = src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*('[^']+');/g, (all, body, from) => {
      const keep = body.split(',').map((x) => x.trim()).filter(Boolean)
        .filter((x) => !dead.has(x.split(/\s+as\s+/).pop().trim()));
      if (!keep.length) return '';
      const joined = keep.join(', ');
      return joined.length < 92 ? `import { ${joined} } from ${from};`
        : `import {\n  ${keep.join(',\n  ')},\n} from ${from};`;
    });
    const bySrc = new Map();
    for (const n of missing) {
      const from = owner.get(n) === self ? null : (owner.get(n) ?? ext[n]);
      if (!from) { console.log(`  ?? ${self} needs ${n} — no owner`); continue; }
      if (!bySrc.has(from)) bySrc.set(from, []);
      bySrc.get(from).push(n);
    }
    const lines = src.split('\n');
    for (const [from, names] of bySrc) {
      const i = lines.findIndex((l) => l.startsWith('import {') && l.includes(`from '${from}'`));
      if (i >= 0) lines[i] = lines[i].replace('import { ', `import { ${names.join(', ')}, `);
      else lines.splice(Math.max(lines.findIndex((l) => l.startsWith('import ')), 0), 0,
        `import { ${names.join(', ')} } from '${from}';`);
    }
    writeFileSync(r.filePath, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
    changed++;
  }
  if (!changed) { console.log(`imports stable after ${pass} pass(es)`); break; }
}
