# Architecture Consolidation Plan (2026-08-09)

## Status: this is a continuation, not a fresh start

A near-identical audit already ran on this codebase on 2026-07-31
(`AUDIT_ORDER_PROCESSING_2026-07-31.md`), and four follow-up commits already
implemented a large share of what a from-scratch "unify order/production/
vendor/inventory" pass would otherwise propose:

| Commit | What it did |
|---|---|
| `301c502` | Created `constants/orderStages.js` as the single source for `ORDER_STAGES`/`CLOSED_STAGES`; made `orderLifecycleService.updateOrderStage` **the one writer** of `order.stage`; added `lost`/`cancelled` terminal stages and `approvalRounds[]` (additive schema changes, no backfill needed) |
| `77ade0d` | Unified vendor/print/post-print job tracking onto `ProductionJob` via a new `services/vendorJobService.js`; removed the legacy `Vendors` collection; backfill script `scripts/migrate-vendorwork-to-productionjob.js` (dry-run by default) |
| `12eb429` | Vendor/print reporting now reads `ProductionJob` uniformly; built real inventory tracking (`services/inventoryService.js`) off `stock_movements`; deleted the dead `stockledgers`/`stockLedger.js` model entirely; removed duplicate order-list screens (`AllOrderTableView.jsx`, `allOrderMobile.jsx`) |
| `4f2b770` | Legacy pre-migration stage values now self-heal in place instead of needing a bulk data migration; added a frontend "Move to stage" action and shared `MISFrontend/src/constants/orderStages.js` |

**This document supersedes the July 31 audit's "suggested direction" section**
with what is actually still true today, verified against current source
(2026-08-09), not re-litigating what's already fixed above.

---

## A. Current source of truth (per concept)

| Concept | Current sources | Canonical source | Legacy/still-duplicate sources |
|---|---|---|---|
| Order lifecycle (stage) | `orderLifecycleService.updateOrderStage` | `orderLifecycleService.updateOrderStage` — **the only function that should write `order.stage`/`stageHistory`** | `Status[]`/`Status.Task` free-text log still exists and is still read as a second signal (see §B.1); `workflowTemplateService` **was** a second direct writer — fixed in this PR (see §C) |
| Production execution | `ProductionJob` (`repositories/productionJob.js`) via `services/vendorJobService.js` | `ProductionJob` + `vendorJobService.upsertVendorJob` | None remaining — `VendorWork`/legacy `Vendors` already retired |
| Vendor execution | `ProductionJob` rows (vendor id/name/status/payment per job) | `ProductionJob` | None remaining |
| Vendor master | `vendorMaster.js` (`vendor_masters` collection) | `vendorMaster.js` | None |
| Inventory | `stock_movements` via `services/inventoryService.js` | `stock_movements` | `stockledgers` model is fully deleted; only stale comments reference the name (`inventoryService.js:17`, `routes/Stock.js:8`) — not a live duplicate, just an unremoved comment |
| Reports (orders) | `hooks/useOrdersData.js` (partial adoption) | should be `useOrdersData.js` | `Pages/BusinessControl.jsx` and `Reports/allOrdersList.jsx` still run their own independent `axios.get` fetch instead of the shared hook |
| Reports (transactions) | none — 6 separate files | not yet unified | `allTransaction.jsx`, `allTransaction1-5.jsx` (5 near-duplicates), all independently routed in `App.jsx` |
| Business configuration | `routes/BusinessProfile.js` + `repositories/appSetting.js` (generic KV) | `BusinessProfile` API, narrow scope (name/address/GST/UPI, WhatsApp templates, nav visibility) | Default assignee "Sai", quick-reply text, job-type enums, reminder-hour constants, SLA thresholds are still hardcoded in source, not in this config layer (see §B.7) |

---

## B. What's still duplicated or gapped (verified against current code)

### B.1 — Order status: down to two signals, not four, but still two
`Status[]`/`Status.Task` (`repositories/order.js:198`) is still a live,
unvalidated free-text log, still written by legacy endpoints
(`routes/Order/statusRouter.js`: `POST /addStatus`, `POST/PUT /updateStatus`)
alongside the canonical `PATCH /:id/stage` / `POST /:id/lifecycle`. Two
places still read *both* signals to answer one question:
- `routes/Order/queriesRouter.js:66-67` — "is this order delivered" ORs
  `stage in [delivered, paid]` with a `Status.Task` regex match.
- `orderTaskService.js:73-75` (`isPendingOrder`) — ANDs a stage-closed check
  with a separate `Status.Task`-based closed check.

Three frontend files still call the legacy endpoints directly via raw
`axios` instead of `services/orderService.js`: `Pages/OrderKanban.jsx:61`,
`Pages/OrderUpdate.jsx:441`, `Reports/billUpdate.jsx:97`.

**Not fixed in this pass** — retiring `Status[]` as a stage signal means
auditing every consumer of `Status.Task` string-matching first (some of it,
e.g. `Status.Task.includes('design')` patterns, encodes business meaning
that has no `stage`-enum equivalent yet). This is real, live-order-affecting
surgery and needs its own reviewed PR per the "no giant rewrite" rule below.

### B.2 — `workflowTemplateService` was a second stage-writer — **fixed in this PR**
`orderLifecycleService.js` already carried a code comment stating it should
be "the one writer" that "every other service ... should route stage
changes through ... rather than mutating stage/stageHistory directly" — but
`workflowTemplateService.applyWorkflowToOrder` and `.completeWorkflowStep`
were still doing exactly that direct mutation, bypassing the no-rollback
rule centralized in `301c502`. Fixed here (see §C) — this is the one code
change in this PR, everything else below is documented for a future pass.

### B.3 — Frontend order-list screens: down to 3 separate fetches, from 6
`Reports/allOrder.jsx` is now a re-export of `Pages/AllOrder.jsx`, which
uses the shared `hooks/useOrdersData.js`; `OrderKanban.jsx` also uses it.
Still separate: `Pages/BusinessControl.jsx` and `Reports/allOrdersList.jsx`
each run their own `axios.get`. Two of three converged; two hold-outs
remain.

### B.4 — Transaction reports: 6 separate files, untouched
`allTransaction.jsx` + `allTransaction1-5.jsx`, all independently routed in
`App.jsx`. None of the four fix commits touched this. Highest-value,
lowest-risk remaining frontend consolidation (pure read/report code, no
order-mutation risk) — good candidate for the next PR.

### B.5 — Frontend stage constants: 12 files converged, 1 hold-out
`MISFrontend/src/constants/orderStages.js` is now imported by 12 files.
`Components/orders/OrderBoard.jsx` still hardcodes its own kanban column
groupings (`GROUPS`) and a stage-transition map (`NEXT_STAGE`). Note: unlike
the other hold-outs, `NEXT_STAGE` isn't a pure duplicate of the stage list —
it encodes the approval/hold loop's actual branching logic (e.g.
`approval → ready_to_print`, `hold → new_design`), which can't be
mechanically derived from `ORDER_STAGES`' linear order without risking a
behavior change to a live drag-and-drop board no test currently covers.
Left alone in this pass; flagged for a dedicated PR with a component test
first.

### B.6 — `stockledgers`: confirmed fully dead, not just "overlapping"
The May 9 and July 31 audits both still called this "overlapping" with
`stock_movements`. It's not — the model file is deleted
(commit `12eb429`); only two stale code comments still name it
(`inventoryService.js:17`, `routes/Stock.js:8`). No action needed beyond,
optionally, updating those comments — not done here to keep this PR's diff
minimal.

### B.7 — Business configuration: real but narrow; hardcoded values remain
`routes/BusinessProfile.js` + `repositories/appSetting.js` exist and are
wired to a real admin screen (`Pages/BusinessControl.jsx`). Still hardcoded
in source, not configurable:

| Value | Location |
|---|---|
| Default assignee "Sai" | `routes/Enquiry.js:11,32`; `routes/Order/_shared.js:18` (already reads `process.env.DEFAULT_ORDER_ASSIGNEE` first); `MISFrontend/Pages/addOrder1.jsx:75` (already reads `VITE_DEFAULT_ORDER_ASSIGNEE` first) — both already env-var-overridable, "Sai" is just the fallback |
| WhatsApp quick replies | `Components/whatsapp/ChatInput.jsx:3` |
| Production job types | `repositories/productionJob.js:41-49` (Mongoose enum — changing this is a schema decision, not a config-table one) |
| Reminder-hour triggers | `services/messageScheduler.js:213,217,222,345` |
| Escalation/SOP timing text | `services/sopService.js:114,117` |
| SLA numeric thresholds | **none exist anywhere** — this is a genuine gap (no config, no hardcoded fallback either) |

None of these are touched in this pass — moving them to the config layer is
Phase 6 of the original brief and needs its own admin-UI + permission-gated
API work, not a drive-by change alongside a lifecycle-service fix.

### B.8 — Dead files: none found
No `.archived` files, no `src/legacy/` directory in either package —
already fully cleaned up in `301c502`.

### B.9 — `ProductionJob`: adequate for core tracking, has real gaps
Current fields cover job category/type/mode, vendor id/name, dates, order
linkage, status, payment status, drive file, input/output items, cost,
notes. Missing, despite `quality_check` being a listed `job_type`: no QC
pass/fail/inspector/defect fields, no priority field, no computed
overdue/deadline-breach flag, no rework/rejection counter, no
completion-proof attachment field. Not touched here — additive schema
fields are low-risk but should land with the UI that uses them, not alone.

### B.10 — Test coverage: real progress, two gaps
18 backend test files now exist (was 0 in the 2026-07-21 audit), covering
`orderLifecycleService`, `inventoryService`, `orderStages` constants,
`whatsappOrderCommandService`, permissions, accounting. **No test file
existed for `vendorJobService.js` or `productionJob`** — the newest,
most-rewritten module — before this PR. This PR adds
`test/services/workflowTemplateService.test.js` to lock in the stage
auto-advance fix (§C); `vendorJobService`/`productionJob` coverage remains a
gap for a future PR. Frontend has only 2 test files total, no component or
hook tests.

---

## C. What this PR actually changes

Scope kept deliberately small — one real bug fix, matching the codebase's
own documented intent, plus the test that locks it in:

1. **`MISBackend/src/services/workflowTemplateService.js`** —
   `applyWorkflowToOrder` and `completeWorkflowStep` no longer mutate
   `order.stage`/`order.stageHistory` directly. Both now call
   `orderLifecycleService.updateOrderStage` after the workflow-step save
   completes, so the no-rollback rule and stage side effects (auto-created
   designer/post-design tasks, delivery notification) apply uniformly
   regardless of whether a stage change came from the API, WhatsApp, or a
   workflow template's auto-advance. Wrapped in try/catch so a stage-advance
   failure (e.g. an out-of-date template step targeting a stage the order
   already passed via another path) logs instead of breaking step
   completion — since step completion is the primary action here, and
   stage auto-advance is a side effect of it.
2. **`MISBackend/test/services/workflowTemplateService.test.js`** (new) —
   three tests: stage advances and records history on `applyWorkflowToOrder`;
   stage advances again on `completeWorkflowStep`; and — the actual
   regression this fix prevents — a template step targeting a stage the
   order has already moved past via another path no longer throws or rolls
   the order backward, it's silently skipped.

No schema changes, no data migration, no API surface change, no frontend
change. Existing consumers of `applyWorkflowToOrder`/`completeWorkflowStep`
are unaffected — the functions' signatures, return values, and the
DB writes to `workflowSteps[]` are all unchanged; only *how* `stage` gets
written changed (through the canonical function instead of inline).

---

## D. Explicitly NOT done in this PR, and why

Per the brief's own Phase 9/10 rules ("small, reversible migrations", "if
anything could affect existing live orders, STOP and clearly tell me"), the
following are documented above as real, verified gaps but **not
implemented** here, because each requires either a live-data-affecting
change, a UI surface no automated test currently protects, or genuinely new
admin-facing surface area — none of which belong in the same PR as a
lifecycle bug fix on a production system:

- Retiring `Status[]`/legacy `addStatus`/`updateStatus` endpoints (§B.1) —
  needs a full audit of every `Status.Task` string-match consumer first.
- Rewiring `BusinessControl.jsx`/`allOrdersList.jsx` onto `useOrdersData`
  (§B.3) and consolidating the 6 transaction report pages (§B.4) — safe in
  principle, but each is its own reviewable frontend PR.
- Rewriting `OrderBoard.jsx`'s `NEXT_STAGE` map (§B.5) — encodes real
  workflow branching; needs a component test before refactoring.
- Business Configuration admin UI for job types / quick replies / SLA
  thresholds (§B.7) — new schema + new admin API + permission gating, i.e.
  all of the original brief's Phase 6, not a small change.
- `ProductionJob` QC/priority/overdue fields (§B.9) — additive schema is
  low-risk, but should ship with the UI that reads/writes them.

## E. Recommended next-PR order (smallest blast radius first)

1. Transaction report consolidation (§B.4) — read-only, zero order-mutation
   risk.
2. `BusinessControl.jsx`/`allOrdersList.jsx` onto `useOrdersData` (§B.3).
3. Audit + retire `Status[]` read paths one consumer at a time (§B.1) —
   the biggest remaining "two sources of truth" risk, but also the one
   that most needs careful, incremental handling on live data.
4. `vendorJobService`/`productionJob` test coverage (§B.10), independent of
   any behavior change — pure safety net.
5. `OrderBoard.jsx` NEXT_STAGE refactor (§B.5), only after a component test
   exists for the board's drag-to-advance behavior.
6. Business Configuration admin surface (§B.7) — largest, do last.
