// Find import cycles in a module graph. ESM tolerates some cycles and not others — a cycle is
// fatal the moment a module reads a binding from a partner that has not finished evaluating —
// so the only safe policy for a graph this size is to have none.
import { readFileSync, existsSync } from 'node:fs';
import { storeFiles } from './modules.mjs';
import { dirname, join, resolve, relative } from 'node:path';
import * as espree from 'espree';

const deps = new Map();
function scan(file) {
  if (deps.has(file)) return;
  deps.set(file, []);
  const ast = espree.parse(readFileSync(file, 'utf8'), { ecmaVersion: 2024, sourceType: 'module' });
  for (const n of ast.body) {
    const spec = n.type === 'ImportDeclaration' ? n.source.value
      : (n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source
        ? n.source.value : null;
    if (!spec?.startsWith('.')) continue;
    const t = resolve(join(dirname(file), spec));
    if (!existsSync(t)) continue;
    deps.get(file).push(t);
    scan(t);
  }
}
for (const f of storeFiles()) scan(resolve(f));

const cycles = [];
const colour = new Map();
const stack = [];
(function dfsAll() {
  const visit = (n) => {
    colour.set(n, 'grey');
    stack.push(n);
    for (const m of deps.get(n) ?? []) {
      if (colour.get(m) === 'grey') cycles.push([...stack.slice(stack.indexOf(m)), m]);
      else if (!colour.has(m)) visit(m);
    }
    stack.pop();
    colour.set(n, 'black');
  };
  for (const n of deps.keys()) if (!colour.has(n)) visit(n);
}());

const rel = (p) => relative(process.cwd(), p);
console.log(`${deps.size} modules, ${cycles.length} cycles\n`);
const edges = new Map();
for (const c of cycles) {
  console.log('  ' + c.map((p) => rel(p).replace('characters/store/', '').replace('.js', '')).join(' -> '));
  for (let i = 0; i < c.length - 1; i++) {
    const k = `${rel(c[i])} -> ${rel(c[i + 1])}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
}
if (cycles.length) {
  console.log('\nedges by how many cycles they appear in (cut the top ones first):');
  for (const [k, n] of [...edges].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`  ${String(n).padStart(3)}  ${k.replace(/characters\/store\//g, '')}`);
}

// ---- and the FOLDERS must form a DAG too, or the grouping is decoration.
//
// The layers are deliberately ordered: core < scene < goods < interact < sim < ui < root. An
// import that runs the other way is not an error today — it is how the file graph got circular
// last time, one reasonable-looking edge at a time.
const RANK = { core: 0, scene: 1, goods: 2, interact: 3, sim: 4, ui: 5, '': 6 };
const groupOf = (p) => {
  const parts = rel(p).split('/');
  return parts.length > 3 ? parts[2] : '';
};
const upward = [];
for (const [from, tos] of deps) {
  for (const to of tos) {
    if (!deps.has(to) || !rel(to).startsWith('characters/store/')) continue;
    const a = groupOf(from), b = groupOf(to);
    if (RANK[a] < RANK[b]) upward.push(`${rel(from)} -> ${rel(to)}  (${a} imports ${b})`);
  }
}
if (upward.length) {
  console.error(`\n${upward.length} import(s) point UP the layering:`);
  upward.forEach((u) => console.error('  ' + u));
} else console.log('folders form a DAG: core < scene < goods < interact < sim < ui < root');
process.exit(cycles.length || upward.length ? 1 : 0);
