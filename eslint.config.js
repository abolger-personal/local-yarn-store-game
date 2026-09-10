import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // A `const` read above its own declaration is a TDZ ReferenceError at module load — the
      // whole graph fails and the page is blank white, with a stack pointing at a line that looks
      // fine. Nothing else here catches it: it is not a cycle, not a missing export, not a type.
      // `functions: false` because function declarations hoist and calling one earlier is normal.
      // A warning repo-wide: the existing sim files have several of these and they are all safe
      // (used inside a function, which runs long after the declaration). An ERROR in the shop
      // below, where module-eval order is load-bearing and getting it wrong blanks the page.
      'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
      // A function longer than this is doing more than one thing. Comments and blanks do not
      // count — this codebase explains itself, and prose is not complexity.
      'max-lines-per-function': ['warn', { max: 20, skipComments: true, skipBlankLines: true }],
      'prefer-template': 'warn',
      'object-shorthand': 'warn',
    },
  },
  {
    // The shop's module graph. These four rules replace hand-rolled scripts that did the same
    // job worse: a cycle detector, an export/import linker, a layering check and a length check.
    // eslint already parses every file — it was always the right place for this.
    files: ['characters/store/**/*.js'],
    plugins: { 'import-x': importX },
    settings: {
      // `three` and its addons come from a CDN import map at runtime, so they are unresolvable
      // on disk by design. Everything relative must resolve.
      'import-x/ignore': ['^three'],
      'import-x/resolver': { node: { extensions: ['.js'] } },
    },
    rules: {
      // The one that matters most: a cycle here is not a style issue. `yarn.js` read a `const`
      // from `items.js` while `items.js` was still evaluating `yarn.js`, which is a TDZ
      // ReferenceError and a blank page.
      'import-x/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      // `import { x }` where the target has no `export x` is a SyntaxError in the browser and a
      // clean lint everywhere else, because eslint checks one file at a time. Not any more.
      'import-x/named': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^three'] }],
      'import-x/no-self-import': 'error',
      // Here it is an error, not a warning. This is the rule that would have caught the TDZ that
      // blanked the page: a `const` read above its own declaration at module-eval time.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
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
    // Build/verification scripts run in node, not the browser. tools/linkcheck.mjs checks that
    // every `import { x } from './y.js'` finds a real `export x` — something eslint cannot see,
    // because it lints one file at a time and a missing export is a clean lint and a blank page.
    files: ['tools/**/*.js', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
