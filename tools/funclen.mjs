// Any function over 20 CODE lines (comments and blanks excluded).
import * as espree from 'espree';
import { readFileSync } from 'node:fs';
import { storeFiles } from './modules.mjs';
const rows = [];
for (const f of storeFiles()) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const ast = espree.parse(src, { ecmaVersion: 2024, sourceType: 'module', loc: true });
  const visit = (n, name) => {
    if (!n || typeof n !== 'object') return;
    if (/Function(Declaration|Expression)|ArrowFunctionExpression/.test(n.type)
        && n.body?.type === 'BlockStatement') {
      let code = 0, block = false;
      for (const l of lines.slice(n.loc.start.line - 1, n.loc.end.line)) {
        const t = l.trim();
        if (block) { if (t.includes('*/')) block = false; continue; }
        if (t.startsWith('/*')) { if (!t.includes('*/')) block = true; continue; }
        if (!t || t.startsWith('//')) continue;
        code++;
      }
      if (code > 20) rows.push([code, f, n.id?.name ?? name ?? '(anon)', n.loc.start.line]);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      const hint = n.type === 'VariableDeclarator' ? n.id?.name
        : (n.type === 'Property' ? n.key?.name : name);
      if (Array.isArray(v)) v.forEach((c) => visit(c, hint));
      else if (v && typeof v.type === 'string') visit(v, hint);
    }
  };
  visit(ast);
}
rows.sort((a, b) => b[0] - a[0]);
console.log(rows.length ? `${rows.length} functions over 20 code lines\n` : 'every function is 20 code lines or fewer');
for (const [n, f, name, ln] of rows) console.log(`  ${String(n).padStart(3)}  ${f}:${ln}  ${name}`);
process.exit(rows.length ? 1 : 0);
