import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';

// Rule choices and why not a preset: tools/README.md. Every rule is an error.
const CORRECTNESS = {
  // Real bug classes; clean today, so they guard tomorrow.
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
  // Left out: max-lines (a big file needs a split, not a lint fix), no-magic-numbers (geometry's tuned constants).
  complexity: ['error', 12],
  'max-depth': ['error', 4],
  'max-params': ['error', 5],             // past five, an options object reads better at the call
  'consistent-return': 'error',           // a value on some paths and none on others is a bug class
  'no-nested-ternary': 'error',
  'prefer-destructuring': ['error', { object: true, array: false }],
};

const SECURITY = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-caller': 'error',
};

const CLEANLINESS = {
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
  // Only bug-catchers core lacks; not unicorn/recommended (see tools/README.md).
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
      // A TDZ read at module load blanks the page; function declarations hoist, so they're allowed.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
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
    // The module graph, everywhere.
    files: ['**/*.js', '**/*.mjs'],
    plugins: { 'import-x': importX },
    settings: {
      // `three` and `trystero` come from a CDN import map at runtime, so they can't resolve on disk.
      'import-x/ignore': ['^three', '^trystero'],
      'import-x/resolver': { node: { extensions: ['.js', '.mjs'] } },
    },
    rules: {
      // A cycle can read a `const` mid-evaluation: a TDZ error and a blank page.
      'import-x/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      // A missing named export is a SyntaxError in the browser but invisible to per-file lint.
      'import-x/named': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^three', '^trystero'] }],
      'import-x/no-self-import': 'error',
    },
  },
  {
    files: ['characters/store/**/*.js'],
    plugins: { 'import-x': importX },
    rules: {
      // The shop's layering: core < scene < goods < interact < sim < ui; each imports only from below.
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
    // ROADMAP A1: a day replays from its seed, day and attempt.
    files: ['characters/store/**/*.js'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Math', property: 'random',
        message: 'Draw from the world: simRng for the sim, a hash for visual timing.' }],
    },
  },
  {
    // DESIGN-DECISIONS.md: the simulation stays headless. Inert until src/sim exists.
    files: ['src/sim/**/*.js', 'src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'three', message: 'src/sim must stay headless - no three.js imports.' }],
        patterns: [{ group: ['three/*', '**/render/**'], message: 'src/sim must stay headless.' }],
      }],
    },
  },
  {
    // The self-checks run under node.
    files: ['**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    // tools/ runs under node.
    files: ['tools/**/*.js', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    files: ['**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
