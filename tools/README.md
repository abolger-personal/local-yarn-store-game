# tools

Checks that eslint cannot do, and nothing else.

Everything about the module graph moved into `eslint.config.js`, which was always the right place
for it — eslint already parses every file:

| was | now |
| --- | --- |
| `cycles.mjs` (import cycles) | `import-x/no-cycle` |
| `cycles.mjs` (folder layering) | `import-x/no-restricted-paths`, declared as zones |
| `linkcheck.mjs` (missing exports) | `import-x/named`, `import-x/no-unresolved` |
| `funclen.mjs` (long functions) | `max-lines-per-function` |
| `fiximports.mjs`, `repoint.mjs` | one-offs for the module split; the split is done |
| — (nothing caught it) | `no-use-before-define` — the TDZ that blanked the page |

What is left is project-specific, and no off-the-shelf rule knows about it:

- **`selectors.mjs`** — every `getElementById` / `querySelector` in the shop resolves to real
  markup in `store.html`. Renaming an element is otherwise silent: the lookup returns null and the
  failure lands somewhere else entirely. `#rotator` → `#furnBtns` cost a debugging round this way.
- **`sideeffects.mjs`** — the bare `import '../owl.js'` registrations are still there. They export
  nothing and are referenced by nothing, so every other tool considers them dead code. Dropping
  them leaves no species registered and the shop fails to open.
- **`modules.mjs`** — shared helper: every store module, wherever it lives in the folder tree.

Run: `npm run lint` and `npm run check`.
