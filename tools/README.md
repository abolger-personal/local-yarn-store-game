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
| — (nothing caught it) | `tsc -p jsconfig.json` — wrong names, wrong argument counts |

`npm run typecheck` is TypeScript reading the plain JS (`checkJs`), no build step and no
TypeScript syntax. It catches what a per-file linter structurally cannot: an import of a name the
target does not export, a call with the wrong number of arguments, a `.checked` on something that
is not an input. `three` is a devDependency for its type definitions ONLY — at runtime it still
comes from the CDN import map in the html.

Two things it does NOT catch, so do not trust it for them:

- **Property typos on plain object literals.** In `.js` files TypeScript treats them as expandos,
  so `fit.kk` on a `{k, ky, ...}` return reads as `any`. Typos against a *typed* API (three, the
  DOM) are caught.
- **`null` from a missed DOM lookup** — that needs `strictNullChecks`, which is 151 errors on this
  codebase today, nearly all of them fine. `selectors.mjs` covers the shop's own lookups instead.

What is left is project-specific, and no off-the-shelf rule knows about it:

- **`selectors.mjs`** — every `getElementById` / `querySelector` in the shop resolves to real
  markup in `store.html`, `game.html`, `puzzle.html` or `ui/exterior.js` (which draws the entry
  and the door). One pool for all pages: it catches an id on no page, not one on the wrong page. Renaming an element is otherwise silent: the lookup returns null and the
  failure lands somewhere else entirely. `#rotator` → `#furnBtns` cost a debugging round this way.
- **`sideeffects.mjs`** — the bare `import '../owl.js'` registrations are still there. They export
  nothing and are referenced by nothing, so every other tool considers them dead code. Dropping
  them leaves no species registered and the shop fails to open.
- **`modules.mjs`** — shared helper: every store module, wherever it lives in the folder tree.
- **`run-tests.mjs`** — `node tools/run-tests.mjs [fast|slow|all] [file ...]`: each test file in its own
  `node`, timed. A fast-section file over 2 s fails (`npm run check`); `slow` is `npm run check:slow`.
  `FULL=1` lifts the limit, since it samples more.

Every lint rule is an **error**, not a warning: a warning nobody has to fix is one nobody reads.

## selfie-tuning/tune-shots.mjs

`node tools/selfie-tuning/tune-shots.mjs [out.json] [workers]` — tunes `characters/selfie.js`
SHOTS: one shot per species × garment silhouette (plus the pot holder and the armful), by random
search on selfie.js's scored-search score. Results: `selfie-tuning/shots-report.md`.

- A seed is `BODIES` fresh random bodies, each in a random item of that silhouette at close-up
  detail (as `selfie-studio.js` snap dresses them; a bag is held up). A shot's score is the mean
  over the bodies, a body where it breaks a rule counting 0.
- A worn garment's shot must also hold `garments.test.mjs`'s authored-shot floors on every body,
  since the tuned shots become authored. Held pieces only have to show, which the score checks.
- The search starts from every authored front shot, the best already found for that type (any
  species), and the best kept so far (rescored on each seed's bodies, so a shot must hold for any
  body), draws `DRAWS` more across selfie.js RANGES, then hill-climbs round the top few.
- A combination is done at its first seed reaching `GOOD`; after `SEEDS` without, it is flagged.
- The shawl is not searched: its shots are from behind and the score assumes a front selfie.
- Results are written after every combination, so a stopped run resumes.

## Why not eslint-config-google / airbnb

Both were checked and rejected, on facts rather than taste:

- **`eslint-config-google`** — 0.14.0, last real release 2020, eslintrc-only. 79 rules, 34 of
  them formatting rules that eslint 10 removed from core. Of the remainder most are already in
  `js.configs.recommended`; what is genuinely new is about a dozen plain core rules, which are
  now written out in `eslint.config.js` directly.
- **`eslint-config-airbnb-base`** — 15.0.0, peer range stops at `eslint ^8`. Will not install here.
- **Meta** publishes no general JS config: `eslint-config-fbjs` and `eslint-config-fb-strict` are
  Flow + React + Babel on `eslint ^8`.
- **`eslint-plugin-sonarjs`** — supports eslint 10, but its `ts-api-utils` breaks against the
  TypeScript 7 this repo now uses for `npm run typecheck`. Not worth pinning TS backwards for.

`eslint-plugin-unicorn` is in, but NOT its `recommended` preset: that reports 974 findings here
and ~70% of them sit in four rules that are actively wrong for a geometry project —
`no-zero-fractions` (rewrites `CELL = 0.20`), `single-line-block-comment-style` (reformats the
comments that are this codebase's documentation), `no-null` (rewrites a sentinel used on purpose)
and `prefer-math-trunc`, which would replace mulberry32's `| 0`. That `| 0` is a 32-bit **wrap**,
not a truncation: with `Math.trunc` the generator's state grows past 2^53 and the sequence
diverges after ~4.9 million draws. Presets are a starting point to measure, not to adopt.

Run: `npm run lint` and `npm run check`.
