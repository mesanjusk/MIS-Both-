# Frontend lint technical debt

Measured on the production-stabilization branch, after the fixes described
below. Regenerate with:

```bash
cd MISFrontend && npx eslint . -f json -o /tmp/lint.json
```

## Headline

| | Count |
|---|---:|
| Errors | 1375 |
| Warnings | 34 |
| Files with at least one finding | 138 |
| **Findings that block CI** | **0** |

`npm run lint:critical` — the blocking gate — **passes**. `npm run lint` —
the full rule set — does not, and is not claimed to.

## The number was wrong before this release

The previously quoted figure was **2702 errors**. That was not the codebase; it
was a configuration bug.

`eslint.config.js` placed `ignores: ['dist']` inside the same object as
`files`. In ESLint flat config an `ignores` key alongside `files` scopes only
that config object — a global ignore must be its own entry with no `files`
key. So `eslint .` was linting the production bundles in `dist/`, and **1308
of the 2702 findings were in minified vendor code** — xlsx, recharts, jspdf,
html2canvas — that no one can act on and that is regenerated on every build.

Fixed in this release. The honest baseline is the ~1400 findings below.

## By rule and reachability

"Reachable" means the file is in the import graph from `src/main.jsx`.
Unreachable files are legacy screens and components nothing mounts any more;
they are kept because the 45-day telemetry window has not closed
(see below), but a finding there cannot affect a user today.

| Rule | Reachable | Unreachable | Total |
|---|---:|---:|---:|
| `react/prop-types` | 900 | 302 | 1202 |
| `no-unused-vars` | 72 | 66 | 138 |
| `react/no-unescaped-entities` | 27 | 0 | 27 |
| `react-hooks/exhaustive-deps` | 21 | 4 | 25 |
| `react-refresh/only-export-components` | 8 | 1 | 9 |
| `no-empty` | 4 | 2 | 6 |
| `react/no-unknown-property` | 2 | 0 | 2 |
| **Total** | **1034** | **375** | **1409** |

Of 317 source files, **247 are reachable and 56 are unreachable** (the
remainder are test files).

## What this actually is

**87% of the debt (1202 of 1409) is `react/prop-types`** — components written
before the rule was switched on that do not declare a `propTypes` block. It is
a documentation and type-safety gap, not a defect: none of it can misbehave at
runtime.

The rest:

- `no-unused-vars` (138) — dead imports and abandoned locals. Harmless, and
  the single most mechanical thing to clear.
- `react/no-unescaped-entities` (27) — a literal `'` or `"` in JSX text.
  Cosmetic.
- `react-hooks/exhaustive-deps` (25, warnings) — the one group worth reading
  individually. Most are deliberate "run once on mount" effects, but a genuine
  stale-closure bug hides in exactly this shape. Not mechanically fixable:
  adding the missing dependency can turn a one-shot effect into a render loop.
- `react-refresh/only-export-components` (9) — a module exporting both a
  component and a helper. Affects dev-server hot reload only.
- `no-empty` (6) — empty `catch` blocks. Worth a comment saying why the error
  is being swallowed.
- `react/no-unknown-property` (2) — a DOM attribute React does not recognise.

## Fixed in this release

Every runtime-dangerous finding in the tree is now at zero. There were six.

| File | Was | Reachable? |
|---|---|---|
| `src/Pages/adminHome.jsx` | `order.Items[i]` — `i` never defined; threw on render | No |
| `src/Pages/orderPrint.jsx` | `html2pdf()` — never imported, not a dependency; "Download PDF" threw on every click | No |
| `src/Reports/updateCustomer.jsx` | `handleEditClick` — never defined; the edit button threw on click | No |
| `src/Components/Toast.jsx` | `eslint-disable` naming `only-export-Components` (capital C) — not a rule, so it suppressed nothing | Yes |
| `src/Components/AssignVendorDialog.jsx`, `src/Components/StatementModal.jsx` | `eslint-disable` for `no-await-in-loop`, a rule this project does not enable | Yes |

All three `no-undef` crashes were in **unreachable** files. That is worth
stating plainly rather than implying this release fixed live crashes: it did
not, because there were none to fix. What it fixed is code that would have
crashed the moment anyone re-mounted those screens.

One finding was **deliberately kept**: `src/Reports/business/BusinessReports.jsx`
prepends a U+FEFF byte-order mark to its CSV export, which `no-irregular-whitespace`
correctly flags as an invisible character. Removing it would make Excel open
UTF-8 exports in the local codepage and mangle every non-ASCII name. It now
carries a targeted `eslint-disable-next-line` explaining why.

## The gate

`npm run lint:critical` (`eslint.critical.config.js`) enables only rules that
catch code which cannot work:

- **Unresolvable references** — `no-undef`, `no-obj-calls`, `no-import-assign`,
  `no-const-assign`, `no-class-assign`, `no-func-assign`
- **Declared twice** — `no-redeclare`, `no-dupe-args`, `no-dupe-keys`,
  `no-dupe-class-members`, `no-duplicate-case`
- **Control flow that lies** — `no-unsafe-finally`, `no-unreachable`,
  `no-cond-assign`, `no-self-assign`, `no-setter-return`, `getter-return`,
  `use-isnan`, `valid-typeof`
- **Shipped debugger** — `no-debugger`
- **Invisible characters** — `no-irregular-whitespace`
- **React hook rules** — `react-hooks/rules-of-hooks`

It runs in CI ahead of the tests and blocks a merge. It was made blocking only
after it passed, so the gate has never been red on `main`.

`react-hooks/exhaustive-deps` is deliberately **not** in the gate. It is a
warning by design, and the 25 current instances need reading one at a time.

## Paying it down

The gate is a floor to raise, not a permanent settlement.

1. **`no-unused-vars` (138)** — start here. Almost entirely mechanical, and
   dead imports are the ones that quietly grow bundle size. Once at zero,
   promote it into `eslint.critical.config.js`.
2. **`react/prop-types` in reachable files (900)** — file by file, ideally when
   the file is being changed for another reason. 900 in one commit is a diff
   nobody can review, and the risk of a mass automated pass is real: a wrong
   `propTypes` produces console noise that trains people to ignore console noise.
3. **`react-hooks/exhaustive-deps` (25)** — read each. Either add the missing
   dependency, or add a comment saying why the effect is intentionally one-shot.
   Do not silence them in bulk.
4. **Unreachable files (375 findings, 56 files)** — do not spend effort here.
   These screens are default-off pending telemetry. If the telemetry says they
   are dead, they get deleted and the debt goes with them; fixing their
   `propTypes` first would be work thrown away.

## Deferred: the default-off pages

18 legacy pages and 12 maintenance APIs are switched off by default and
reversible from **Admin → API Performance**. They stay in the tree — and their
375 lint findings with them — until at least 45 days of API telemetry has been
collected from **28 August 2026**, i.e. **on or after roughly 12 October 2026**.

Removing them earlier would delete the evidence needed to know whether removing
them is safe.
