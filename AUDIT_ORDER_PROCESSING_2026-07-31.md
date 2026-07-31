# Order Processing Audit — Duplication & Complexity (2026-07-31)

## Scope

You described the business as simple: enquiry → confirm/lost → design → send for
approval → approved/needs-update (loop) → ready to print/cancelled → printing →
received from print → post-print (loop, possibly several steps) → delivery →
payment received/not → posted to accounts → follow-up → closed — plus tracking
which printer/vendor did the print job, which person/vendor did each post-print
job, and inventory that's sometimes yours, sometimes the vendor's, sometimes
mixed.

This audit checks one thing only: **is that simple flow implemented once, or
several times over, in ways that have drifted apart?** No code was changed.
This supplements (doesn't replace) `AUDIT_REPORT_2026-07-21.md`,
`IMPROVEMENT_REPORT.md`, and `MONGODB_AUDIT_REPORT.md`, which cover security/
performance and were not re-litigated here except where directly relevant.

**Bottom line: yes — extensive duplication, on all three fronts (order stage,
vendor/print/post-print assignment, inventory). This is very likely the direct
cause of the "simple goal, complicated tool" feeling.** Nothing found is
individually broken; the problem is that the same question ("what stage is
this order at?", "who's doing the post-print job?", "did we use our stock or
the vendor's?") has multiple independent answers that are not kept in sync by
any single authority.

---

## 1. Order stage/status: four parallel state machines

The order document (`MISBackend/src/repositories/order.js`) carries **four
separate places** that each claim to represent "where is this order right
now," none of which reference each other:

| Representation | What it is | Where it's driven from |
|---|---|---|
| `stage` (+ `stageHistory`) | The intended "official" enum: `enquiry, quoted, approved, design, printing, post_printing, finishing, ready, delivered, paid` | `orderLifecycleService.js`, `businessWorkflowService.js` (two different enforcement rules — see below) |
| `Status[]` / `Status.Task` | An older free-text log ("Enquiry", "Design", "Delivered", ...) with **no enum, no validation** | Legacy `addStatus`/`updateStatus` endpoints in `statusRouter.js`, still live |
| `Steps[]` | A flat vendor/production checklist (`pending/done/posted/paid`) used for accounting postings | `stepsRouter.js` |
| `workflowSteps[]` | A template-driven, auto-progressing step queue (`pending→active→done/skipped`) that can push `stage` forward | `workflowTemplateService.js`, only when an item's workflow template happens to define steps |

Consequence, confirmed in code: `queriesRouter.js` has to OR two of these
together to answer "is this order delivered?" —
`stage in [delivered, paid]` **OR** `Status.Task` matches `/delivered/i` —
which only exists because the two can and do disagree.

### The "advance the order" logic itself is duplicated five times, inconsistently
- `orderLifecycleService.js` — its own `VALID_STAGES` array, enforces
  **no rollback** (can't move backward).
- `businessWorkflowService.js` — a **second**, separately-maintained
  `VALID_STAGES` array, does **not** enforce the no-rollback rule, and also
  has its own `CLOSED_STAGES` set containing `'cancelled'`/`'cancel'` —
  values that **don't exist in the schema's `stage` enum at all**. This
  strongly suggests the "lost/cancelled" outcome from your step 2 and step 6
  (confirm order **or lost**; ready to print **or cancelled**) was dropped
  from the schema at some point but left half-referenced here — i.e. there
  is currently no clean, enum-backed way to mark an order lost or cancelled.
- `workflowTemplateService.js` — a **third** copy of `VALID_STAGES`, used to
  auto-advance `stage` from template step data.
- `whatsappOrderCommandService.js` — a **fourth**, cruder algorithm
  (`VALID_STAGES.indexOf(stage) + 1`, i.e. pure "next in list"), with **no
  support for the approval loop or repeatable post-print steps**, plus its
  own `CLOSED_STAGES` with yet a different membership than the other two.
- `orderTaskService.js` — a **fifth** `CLOSED_STAGES` definition (third
  distinct membership) and its own string-matching check
  (`Task.includes('design')`) that treats the free-text log as equivalent to
  the enum.
- Two full REST surfaces exist for the same "advance the order" action:
  the legacy `addStatus`/`updateStatus` endpoints and the newer
  `PATCH /:id/stage` / `/lifecycle` endpoints — both live simultaneously.

### Your approval loop and post-print loop are not the same reusable thing
- **Approval loop** (design → approval → approved/needs-update, repeat): has
  **no dedicated modeling at all**. `"approved"` is one flat value in the
  `stage` enum — there's no revision count, no history of "sent back for
  changes," no field resembling `approvalStatus`/`approvalHistory` anywhere
  in the schema.
- **Post-print loop** (possibly several sequential post-print operations):
  loosely covered by the generic `workflowSteps[]` engine, but only when an
  item's catalog-defined workflow template happens to include post-print
  steps — it's driven by item data, not an explicit "run these post-print
  jobs in order" concept.
- These are conceptually the *same pattern* ("repeat a sub-step until an
  exit condition"), but instead of one shared mechanism serving both, one
  (post-print) is half-served by an existing generic engine and the other
  (approval) has no implementation to speak of.

---

## 2. Vendor/printer and post-print-person assignment: split three ways

Your requirement: know which printer/vendor printed the job, and which
person/vendor ran each post-print step.

- **Legacy `Vendors` collection** — a bare `Order↔Vendor↔Item↔Date` stamp,
  still written to by `routes/Vendor.js` as a fallback path.
- **`VendorWork`** — the *only* place print jobs specifically go
  (`routes/DesignFiles.js`, triggered by the auto-print-job flow). Carries
  process, material source, amounts.
- **`vendorAssignments`** (on the order) — auto-synced into
  **`ProductionJob`** records by `Order/_shared.js`, and this is the path
  post-print assignments actually flow through.

The practical effect, confirmed in code: the vendor summary/ledger endpoints
(`Vendor.js` `masters/summary`, `order-ledger`) aggregate **only** from
`vendorAssignments` + `VendorLedger` — **print jobs created via `VendorWork`
never show up in vendor totals**, even though they do post ledger entries
elsewhere. And `ProductionJob` itself is written from three independent code
paths (manual admin form, `businessWorkflowService`, and the auto-sync from
`vendorAssignments`), with only *some* of those paths kept in sync — a
post-print job can exist with no order-side record, or vice versa.

Frontend mirrors this: `PostPrintingControl.jsx` and `PostPrintingJob.jsx`
are two separate, overlapping pages for what should be one "assign/track
post-print job" screen, with no indication which is canonical.

---

## 3. Inventory (own stock / vendor-supplied / partial): effectively decorative

You need: "this order used N of material M, sourced from us / the vendor /
split." What actually exists:

- **`stockledgers` collection has zero write path anywhere in the codebase.**
  It is pure dead data — something still *reads* it (`/stock/summary`), but
  nothing has written to it, likely for some time.
- **`stock_movements`** is the one real, active ledger, but it's fed only
  from `ProductionJob` creation in `Vendor.js` — it has no connection to the
  order's own `workRows`.
- **`workRows.executionMode`** (the field that's supposed to say
  stock/purchase/vendor/hybrid per order line) is set once at order creation
  and **never updated again** — no code path consumes stock against it,
  reserves it, or reconciles it. It records intent, not fact.
- There is **no dedicated Stock/Inventory page in the frontend at all.**

So today, "where did the material for this order come from" is only
answered reliably for the subset of jobs that happen to flow through the
manual/auto production-job path — everything else is an unmaintained label.

---

## 4. Frontend: the same fragmentation, one layer up

- **Six separate "list of all orders" screens** (`OrderKanban.jsx`,
  `BusinessControl.jsx`, `Reports/allOrder.jsx`, `allOrdersList.jsx`,
  `allOrderMobile.jsx`, `AllOrderTableView.jsx`), each independently
  fetching and re-deriving grouped data rather than sharing one query layer.
- **Five different endpoint variants for "advance this order's stage"**
  called directly from pages via raw `axios`, bypassing the one service
  (`services/orderService.js`) that exists for this — inconsistent URL
  casing (`/order` vs `/orders`) is a direct symptom of this.
- **The stage-name list is hardcoded independently in at least four
  frontend files**, each with different values/casing
  (`OrderKanban.jsx`, `OrderUpdate.jsx`, `BusinessControl.jsx`,
  `Reports/allOrdersList.jsx`) — none imported from a shared constant.
- **Five numbered near-duplicate transaction report pages**
  (`allTransaction1.jsx` … `allTransaction5.jsx`), all still live and
  routed.
- **No dedicated approval-loop UI**, matching the backend gap above.
- Dead weight sitting in the tree unreferenced: `src/legacy/` (one archived
  file, zero imports) and four more `.archived` siblings left next to their
  live counterparts in `Reports/`.

---

## 5. Why this matters for "less data entry, maximum output reports"

Every one of your 18 steps ultimately reduces to two repeating questions:
**"what state is this order in"** and **"who/what is responsible for the
current step (vendor, printer, staff, stock)."** Right now each question has
3–5 independent, hand-maintained answers instead of one. That has two direct
costs that match your stated complaints:

- **Data entry**: staff/system code has to write to multiple places to keep
  one true fact ("order is delivered", "vendor X did the print") consistent
  — e.g. `createRouter.js` sets both `stage` and `Status.Task` separately at
  creation; `_shared.js` has to auto-sync `vendorAssignments` into
  `ProductionJob` because they're not the same record.
- **Reports**: six order-list screens and five transaction-report pages
  exist because nobody could just add a filter to one canonical view —
  it was easier to copy a page than to trust the existing one, likely
  *because* the underlying state (stage/vendor/stock) isn't reliably
  consistent enough to build one general-purpose report on top of.

## 6. Suggested direction (not a code change — for your decision)

The recurring pattern is: **one authoritative field per fact, one service
that's the only writer, everything else reads from it.** Concretely, as
candidates to evaluate before any implementation work:

1. Pick **one** stage representation (the `stage` enum + `stageHistory` is
   the most complete) and retire `Status[]` as a stage signal — keep it only
   as a free-text activity log if useful, but stop reading it to infer state.
2. Add real schema support for the two loops you actually need — approval
   (revision count/history) and repeatable post-print steps — as **one**
   shared "repeatable step queue" concept, rather than one loop having no
   support and the other being an accidental side-effect of an item-template
   engine.
3. Consolidate vendor/print/post-print assignment into the one schema that
   already has amounts, payment status, and job mode (`vendorAssignments` /
   `ProductionJob`) and retire the legacy `Vendors` collection and the
   `VendorWork`-only print path — or explicitly merge print jobs into the
   same assignment table so vendor totals are complete.
4. Decide whether `stockledgers` is truly dead (recommend confirming, then
   dropping it) and whether inventory sourcing is worth making real (wiring
   `workRows`/`stock_movements` together) or intentionally simplified to a
   single free-text/enum field if per-order stock tracking isn't actually
   needed day to day.
5. On the frontend, converge the order-list screens and the "advance stage"
   calls onto one shared hook/service and one shared stage-constants file,
   and delete the dead `.archived` files.

None of this has been implemented — this is the audit only, as requested.
