import js from '@eslint/js';
import globals from 'globals';

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
      'prefer-template': 'warn',
      'object-shorthand': 'warn',
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
    ignores: ['node_modules/**', 'dist/**'],
  },
];
