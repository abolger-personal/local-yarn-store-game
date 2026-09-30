import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';

/**
 * The "cleaner code" tier.
 *
 * NOT eslint-config-google or airbnb: both are eslintrc-only and unmaintained (airbnb's peer
 * range stops at eslint 8), and roughly half of what they set is FORMATTING, which eslint 10
 * removed from core outright. What survives that filter from either guide is a couple of dozen
 * plain core rules, which is what this is — plus the handful from eslint-plugin-unicorn that
 * catch bug classes core has no rule for.
 *
 * Chosen by MEASURING against this codebase rather than by adopting a preset wholesale:
 * unicorn's own `recommended` reports 974 findings here, ~70% of them in four rules that are
 * actively wrong for a geometry project (`no-zero-fractions` would rewrite `CELL = 0.20`,
 * `no-null` would rewrite the sentinel this codebase uses on purpose, and `prefer-math-trunc`
 * would replace mulberry32's `| 0` — which is a 32-bit WRAP, not a truncation, and the generator
 * diverges after ~4.9M draws once its state is free to grow past 2^53).
 *
 * Every rule is an ERROR. A warning nobody has to fix is one nobody reads: there were 107 of them,
 * and the TDZ that blanked a page was one. They were fixed once, and now a new one fails the lint.
 */
const CORRECTNESS = {
  // Real bug classes. All of these are clean on this codebase today, so they cost nothing to
  // turn on and they are guards against tomorrow rather than a refactor.
  'array-callback-return': 'error',       // a .map/.filter callback that forgets to return
  'no-constant-binary-expression': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'error', // '${x}' written in a plain quoted string
  'no-unmodified-loop-condition': 'error',
  'no-unreachable-loop': 'error',
  'no-promise-executor-return': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-loop-func': 'error',                // a closure capturing the loop variable
  'no-return-assign': 'error',
  'no-unused-expressions': 'error',       // a statement that computes something and drops it
  'no-duplicate-imports': 'error',
  'default-case-last': 'error',
  'radix': 'error',
  'guard-for-in': 'error',
  'no-extend-native': 'error',
  'no-new-wrappers': 'error',
  'no-throw-literal': 'error',
  'prefer-promise-reject-errors': 'error',
  'no-await-in-loop': 'error',             // usually a serialised fetch that meant to be parallel
  'require-atomic-updates': 'error',
};

const MODULARITY = {
  // Shape limits beside max-lines-per-function: they keep a function doing one thing and a helper
  // callable. Measured before they were turned on: 120 hits, all fixed. Left out on purpose:
  // max-lines (garments.js and npc.js are ~1800 lines -- a split, not a lint fix) and
  // no-magic-numbers (3060 hits: this is geometry, and the numbers are the tuned constants).
  complexity: ['error', 12],
  'max-depth': ['error', 4],
  'max-params': ['error', 5],             // past five, an options object reads better at the call
  'consistent-return': 'error',           // a value on some paths and none on others is a bug class
  'no-nested-ternary': 'error',
  'prefer-destructuring': ['error', { object: true, array: false }],
};

const SECURITY = {
  // Nothing here uses these; the point is that nothing ever starts to.
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-caller': 'error',
};

const CLEANLINESS = {
  // Judgement calls, but cheap ones to honour: each had a handful of hits, all fixed.
  'no-shadow': 'error',
  'default-param-last': 'error',           // `(rng = Math.random, type)` cannot be called sanely
  'no-implicit-coercion': 'error',
  'no-sequences': 'error',
  'no-useless-concat': 'error',
  'no-useless-rename': 'error',
  'no-useless-computed-key': 'error',
  'no-object-constructor': 'error',
  'no-array-constructor': 'error',
  'prefer-object-spread': 'error',
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
  'no-multi-str': 'error',
  'symbol-description': 'error',
  'new-cap': ['error', { capIsNew: false }],
  'camelcase': ['error', { properties: 'never' }],
};

const UNICORN = {
  // Only the bug-catchers core has no equivalent for. Deliberately NOT unicorn/recommended —
  // see the note above.
  'unicorn/no-unsafe-string-replacement': 'error',  // an unescaped `$&` in a replacement string
  'unicorn/no-invalid-remove-event-listener': 'error',
  'unicorn/no-invalid-fetch-options': 'error',
  'unicorn/no-single-promise-in-promise-methods': 'error',
  'unicorn/no-thenable': 'error',
  'unicorn/require-array-join-separator': 'error',
  'unicorn/no-magic-array-flat-depth': 'error',
  'unicorn/error-message': 'error',
  'unicorn/no-instanceof-builtins': 'error',
  'unicorn/prefer-add-event-listener': 'error',
  'unicorn/prefer-set-has': 'error',
  'unicorn/no-new-array': 'error',
  'unicorn/no-return-array-push': 'error',
  'unicorn/no-useless-spread': 'error',
  'unicorn/no-unreadable-array-destructuring': 'error',
  'unicorn/consistent-existence-index-check': 'error',
  'unicorn/no-chained-comparison': 'error',
  'unicorn/no-declarations-before-early-exit': 'error',
  'unicorn/no-late-event-control': 'error',         // stopPropagation() deferred out of the handler
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    plugins: { unicorn },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // A `const` read above its own declaration is a TDZ ReferenceError at module load — the
      // whole graph fails and the page is blank white, with a stack pointing at a line that looks
      // fine. Nothing else here catches it: it is not a cycle, not a missing export, not a type.
      // `functions: false` because function declarations hoist and calling one earlier is normal.
      // An error everywhere: a page script runs top to bottom at load exactly as the shop does,
      // and the harmless cases (read inside a function that runs later) cost a line move to fix.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      // A function longer than this is doing more than one thing. Comments and blanks do not
      // count — this codebase explains itself, and prose is not complexity.
      'max-lines-per-function': ['error', { max: 20, skipComments: true, skipBlankLines: true }],
      'prefer-template': 'error',
      'object-shorthand': 'error',
      ...MODULARITY,
      ...CORRECTNESS,
      ...SECURITY,
      ...CLEANLINESS,
      ...UNICORN,
    },
  },
  {
    // The module graph, everywhere: pages, the shop, the characters, the inventory and the node
    // self-checks. These replace hand-rolled scripts that did the same job worse: a cycle
    // detector and an export/import linker. eslint already parses every file — it was always the
    // right place for this. They started in the shop alone; repo-wide they had no hits.
    files: ['**/*.js', '**/*.mjs'],
    plugins: { 'import-x': importX },
    settings: {
      // `three` and its addons come from a CDN import map at runtime, so they are unresolvable
      // on disk by design. Everything relative must resolve.
      'import-x/ignore': ['^three'],
      'import-x/resolver': { node: { extensions: ['.js', '.mjs'] } },
    },
    rules: {
      // The one that matters most: a cycle is not a style issue. `yarn.js` read a `const` from
      // `items.js` while `items.js` was still evaluating `yarn.js`, which is a TDZ ReferenceError
      // and a blank page.
      'import-x/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      // `import { x }` where the target has no `export x` is a SyntaxError in the browser and a
      // clean lint everywhere else, because eslint checks one file at a time. Not any more.
      'import-x/named': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^three'] }],
      'import-x/no-self-import': 'error',
    },
  },
  {
    // The shop's module graph, on top of the checks above: its layering.
    files: ['characters/store/**/*.js'],
    plugins: { 'import-x': importX },
    rules: {
      // The layering, declared rather than computed: core < scene < goods < interact < sim < ui.
      // Each zone may only import from the ones below it. This is what stops the graph drifting
      // back into a tangle one reasonable-looking edge at a time.
      'import-x/no-restricted-paths': ['error', {
        zones: [
          { target: './characters/store/core', from: './characters/store', except: ['./core'] },
          { target: './characters/store/scene', from: './characters/store',
            except: ['./core', './scene'] },
          { target: './characters/store/goods', from: './characters/store',
            except: ['./core', './scene', './goods'] },
          { target: './characters/store/interact', from: './characters/store',
            except: ['./core', './scene', './goods', './interact'] },
          { target: './characters/store/sim', from: './characters/store',
            except: ['./core', './scene', './goods', './interact', './sim'] },
        ],
      }],
    },
  },
  {
    // Architectural boundary from DESIGN-DECISIONS.md: the simulation must stay headless so it
    // can be tested and run deterministically without a renderer. Inert until src/sim exists.
    files: ['src/sim/**/*.js', 'src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'three', message: 'src/sim must stay headless - no three.js imports.' }],
        patterns: [{ group: ['three/*', '**/render/**'], message: 'src/sim must stay headless.' }],
      }],
    },
  },
  {
    // The node-run self-checks (`node inventory/grid.test.mjs`). Same rules as the modules they
    // test, but they run in node: `console` is a global there, not a browser affordance.
    files: ['**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    // Build/verification scripts run in node, not the browser. What is left in tools/ is only
    // what no off-the-shelf rule knows about — see tools/README.md.
    files: ['tools/**/*.js', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    // The self-checks run under bare `node` too. Without this they match no block that sets
    // globals at all — the `**/*.js` block above does not cover .mjs — so every `console.log`
    // in visit.test.mjs, wip.test.mjs and motion.test.mjs reported as no-undef.
    files: ['**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
