// The blocking lint gate.
//
// The project carries roughly 1400 legacy lint errors, almost all of them
// `react/prop-types` on components written before the rule was enabled. Making
// `eslint .` blocking would mean either a mass rewrite of files this release
// does not touch, or a permanently red build that everyone learns to ignore.
// Neither protects anything.
//
// So this config enables only the rules that catch code which *cannot work* —
// a reference that does not exist, a hook called conditionally, a variable
// declared twice, a `finally` that swallows a return. Those are bugs, not
// style, and every one of them is worth stopping a merge for.
//
// It is deliberately a floor, not a ceiling. `npm run lint` still reports
// everything; the remaining debt is inventoried in docs/LINT_TECHNICAL_DEBT.md
// and can be paid down file by file, raising this gate as it goes.

import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: ['dist/**', 'build/**', 'coverage/**', 'public/sw.js'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    // `react` and `react-refresh` are registered but none of their rules are
    // switched on. Source files carry eslint-disable comments naming those
    // rules, and ESLint errors on a directive for a rule it cannot resolve —
    // so without registering the plugins this gate would fail on comments
    // rather than on code.
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    linterOptions: {
      // Those same directives target rules this config deliberately leaves off,
      // which would otherwise be reported as unused. `npm run lint` still
      // reports genuinely stale directives against the full rule set.
      reportUnusedDisableDirectives: 'off',
    },
    // Start from nothing rather than from js.configs.recommended, so adding a
    // rule here is always a deliberate decision about what should block a merge.
    rules: {
      // References that do not resolve — the crash class this release fixed
      // three of (adminHome, orderPrint, updateCustomer).
      'no-undef': 'error',
      'no-obj-calls': 'error',
      'no-import-assign': 'error',
      'no-const-assign': 'error',
      'no-class-assign': 'error',
      'no-func-assign': 'error',

      // Declared twice: one of the two is silently doing nothing.
      'no-redeclare': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-case': 'error',

      // Control flow that does not do what it reads as.
      'no-unsafe-finally': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'getter-return': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // Ships a breakpoint to production.
      'no-debugger': 'error',

      // Invisible characters that change what the parser sees.
      'no-irregular-whitespace': 'error',

      // Hooks called conditionally or out of a component: React's own state
      // machine breaks, usually as a bug that only appears on a later render.
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    // Test files run in the Vitest environment and legitimately use its globals.
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
  },
];
