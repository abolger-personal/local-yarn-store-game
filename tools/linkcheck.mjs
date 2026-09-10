// Does every `import { x } from './y.js'` actually find an `export x` in y.js?
//
// eslint cannot see this: it checks one file at a time, so a missing export is a clean lint and a
// SyntaxError in the browser ("does not provide an export named ..."). For a refactor that moves
// 3,200 lines across 20 files, this is the check that matters.
import { readFileSync, existsSync } from 'node:fs';
import { storeFiles } from './modules.mjs';
import { dirname, join, resolve } from 'node:path';
import * as espree from 'espree';

const seen = new Set(); const problems = [];
const exportsOf = (file) => {
  const ast = espree.parse(readFileSync(file, 'utf8'), { ecmaVersion: 2024, sourceType: 'module' });
  const out = new Set();
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration?.type === 'VariableDeclaration')
        for (const d of n.declaration.declarations)
          (function pat(p) {
            if (p.type === 'Identifier') out.add(p.name);
            else if (p.type === 'ObjectPattern') p.properties.forEach((q) => pat(q.value ?? q.argument));
            else if (p.type === 'ArrayPattern') p.elements.filter(Boolean).forEach(pat);
          }(d.id));
      else if (n.declaration?.id) out.add(n.declaration.id.name);
      for (const s of n.specifiers ?? []) out.add(s.exported.name);
    } else if (n.type === 'ExportDefaultDeclaration') out.add('default');
    else if (n.type === 'ExportAllDeclaration') out.add('*');
  }
  return out;
};

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const ast = espree.parse(readFileSync(file, 'utf8'), { ecmaVersion: 2024, sourceType: 'module', loc: true });
  for (const n of ast.body) {
    if (n.type !== 'ImportDeclaration') continue;
    const spec = n.source.value;
    if (!spec.startsWith('.')) continue;                    // bare specifiers come from the CDN
    const target = resolve(join(dirname(file), spec));
    if (!existsSync(target)) { problems.push(`${file}:${n.loc.start.line}  missing file ${spec}`); continue; }
    const ex = exportsOf(target);
    if (!ex.has('*')) {
      for (const s of n.specifiers) {
        if (s.type !== 'ImportSpecifier') continue;
        if (!ex.has(s.imported.name))
          problems.push(`${file}:${n.loc.start.line}  '${s.imported.name}' is not exported by ${spec}`);
      }
    }
    walk(target);
  }
}

for (const f of storeFiles()) walk(resolve(f));
console.log(`${seen.size} modules linked`);
problems.forEach((p) => console.error('  ' + p));
console.log(problems.length ? `${problems.length} BROKEN IMPORTS` : 'every import resolves to a real export');
process.exit(problems.length ? 1 : 0);
