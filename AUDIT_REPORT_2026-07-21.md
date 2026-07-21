# MIS Project — Comprehensive Audit (2026-07-21)

This audit covers the full codebase as of `main` (`895eb4a`), with focus on what
has changed since the two prior audits (`IMPROVEMENT_REPORT.md`, 2026-05-20;
`MONGODB_AUDIT_REPORT.md`, 2026-05-09) — most notably the new WhatsApp
order/payment command feature, which lets chat messages move money and create
records and therefore gets the deepest review here.

---

## 0. Critical — Action Required

### 0.1 Live database credential committed to the repo
| | |
|---|---|
| **Severity** | **Critical** |
| **File** | `MISBackend/scripts/create-order-indexes.js scrcreate-order-indexes.js` (note: the filename itself is corrupted — a literal space plus a duplicated/garbled name, likely leftover from a bad file operation) |
| **Problem** | Line 6 hardcodes a full MongoDB Atlas connection string with a real username and password as the fallback when `MONGO_URI` isn't set: `mongodb+srv://sanjuahuja:cY7NtMKm8M10MbUs@cluster0.wdfsd.mongodb.net/MISSK`. It has been in git history since commit `65f7ba7` and is present on `main` today — anyone with read access to the repo (or its history) has full read/write access to that database. |
| **Recommendation** | Rotate the Atlas password for `sanjuahuja` immediately (git history removal alone does not revoke a still-valid credential). Then remove the hardcoded fallback — the script should `throw` if `process.env.MONGO_URI` is unset, never embed a real URI. Also fix the corrupted filename. Per your instruction, this is documented only; no fix was applied in this pass. |

---

## 1. WhatsApp Order/Payment Commands (new since last audit)

Four commits since 2026-07-13 added a feature letting staff run order actions —
and, in the last two phases, collect payments and create orders — from a
WhatsApp chat, gated behind a shared-number keyword session. This is the
highest-risk surface added since the last audit because it lets external chat
input trigger money-moving and record-creating backend calls. Overall the
design is careful (permission re-checked at execute time, not just at
button-request time; ownership re-checked for customer-facing reads even when
the id came from a list the server itself sent), but a few gaps stand out.

### 1.1 View-scope restriction is bypassable by guessing an order number
| | |
|---|---|
| **Severity** | Medium |
| **File** | `MISBackend/src/services/whatsappOrderCommandService.js` (`handleWhatsAppOrderCommand`, `buildOrderDetailMessage`) |
| **Problem** | `findOrdersForStaff` correctly restricts the `orders` list command to a low-tier staff member's own assigned orders (`viewScope: 'assigned'`). But the `order <number>` free-text lookup and the button-tap detail view never check `viewScope` — they call `findOrderByUuid`/`Orders.findOne({ Order_Number })` unconditionally. A low-tier staff member (worker/delivery, or any custom group with `viewOrders: true` but `viewScope: 'assigned'`) can type `order 42` for **any** order number and see its stage, amount, due date, and outstanding balance, regardless of assignment. |
| **Impact** | Currently low in practice because the default tiers that get `viewScope: 'assigned'` (worker/delivery) also default `advanceOrderStage`/`assignOrders`/`receivePayments` to `false`, so this is an information-disclosure gap (order financials to internal staff), not a money-moving one, by default. But it becomes a real authorization bypass the moment an admin configures a custom group via the Group Permissions page with `viewScope: 'assigned'` plus any of the mutating permissions `true` — the mutating actions are gated by the boolean permission, not by ownership, so that combination lets a restricted-view user act on orders outside their assignment by number-guessing. |
| **Recommendation** | Enforce `viewScope` inside `findOrderByUuid`/the detail-lookup path too (filter by `assignedTo` when scope isn't `'all'`), not only in the list query. |

### 1.2 Direct Meta webhook signature check fails open when secret is unset
| | |
|---|---|
| **Severity** | Medium |
| **File** | `MISBackend/src/controllers/whatsappController.js` (`receiveWebhook`, ~line 1450) |
| **Problem** | `const enforceSignature = ... !== 'false'` defaults to `true`, but the actual check is gated by `if (enforceSignature && WHATSAPP_APP_SECRET)`. If `WHATSAPP_APP_SECRET` is simply not set in the environment, signature verification is silently skipped and any POST to `/webhook` is accepted and processed as a genuine Meta event — no log, no warning. Compare with the parallel Metabsp path (`verifyMetabspSignature`), which correctly **fails closed** (returns `false`, rejects) when its secret is missing. |
| **Recommendation** | Make the direct webhook fail closed the same way: reject (or at minimum emit a startup-time `logger.fatal`/`process.exit`-style warning) when `WHATSAPP_APP_SECRET` is unset in production, rather than silently accepting unsigned traffic. |

### 1.3 Payment/order-creation confirm step isn't idempotent under a race
| | |
|---|---|
| **Severity** | Low |
| **File** | `whatsappOrderCommandService.js` (`executeOrderAction` action `'pay'`, `executeCreateOrder`) |
| **Problem** | Both read the `WhatsAppPendingInput` record, then call `receiveOrderPayment`/`createQuickOrderWorkflow`, then delete the pending record — three separate steps, not one atomic operation. Two near-simultaneous "Confirm" taps (double-tap, or a client retry) would both pass the pending-state check before either write completes, posting the payment or creating the order twice. |
| **Recommendation** | Use `findOneAndDelete` (atomic claim-and-clear) instead of `findOne` + later `deleteOne`, so only one concurrent request can proceed past the check. |

### 1.4 No upper bound on WhatsApp-entered payment amount
| | |
|---|---|
| **Severity** | Low |
| **File** | `whatsappOrderCommandService.js` (`parseAmountFromText`, `handlePaymentTextStep`) |
| **Problem** | The amount a staff member types for "Receive payment" is validated as a positive finite number but never checked against the order's actual outstanding balance before the Confirm step is offered. A fat-fingered or malicious entry (e.g. an extra zero) posts straight through `receiveOrderPayment`. |
| **Recommendation** | Cap the accepted amount at the outstanding balance (or flag/require a second confirmation) when the value exceeds it, matching whatever guard the main app's payment UI already has, if any. |

### 1.5 Duplicated role-hierarchy table between app auth and WhatsApp permissions
| | |
|---|---|
| **Severity** | Low (maintainability, indirect security risk) |
| **Files** | `MISBackend/src/middleware/authorize.js` and `MISBackend/src/services/permissionService.js` |
| **Problem** | Both files independently define `ROLE_HIERARCHY` and `ROLE_ALIASES` with a code comment in `permissionService.js` explicitly acknowledging the duplication ("Same tiering as middleware/authorize.js — duplicated here... because this resolves WhatsApp-command permissions from a plain group name string"). If the app-side hierarchy changes (new role, renamed tier) without updating the WhatsApp copy, the two authorization surfaces silently drift — e.g. a role downgraded in the main app could still retain elevated WhatsApp money/order permissions. |
| **Recommendation** | Extract `ROLE_HIERARCHY`/`ROLE_ALIASES`/`normalizeRole` into a single shared module both files import. |

### 1.6 Customer-facing command (`whatsappCustomerCommandService.js`) — no issues found
Reviewed the read-only customer order-status flow (Phase 4, `895eb4a`) — it
deliberately has no free-text order-number lookup (preventing enumeration) and
re-verifies `Customer_uuid` ownership on every detail view even though the id
came from a list the server itself generated. This is solid design; no
changes recommended.

---

## 2. Status Check — Prior `IMPROVEMENT_REPORT.md` Recommendations (2 months later)

| # | Recommendation | Status |
|---|---|---|
| 1 | Paginate `/all-data` endpoint | ❌ Still unpaginated — `routes/Order/queriesRouter.js:10` still does an unbounded fetch |
| 2 | Add `authLimiter` to `/addUser` | ❌ Still missing — `routes/Users.js:74` has `requireAuth` + validation but no rate limiter (login itself does have `authLimiter`, so only account-creation is exposed) |
| 3 | Create `constants/orderConstants.js` for magic strings | ❌ Not created — no `constants/` directory exists in the backend |
| 4 | Add compound indexes for stage/customer/dueDate | ✅ Done — `repositories/order.js` now has `{ stage: 1, createdAt: -1 }`, `{ stage: 1, priority: 1, dueDate: 1 }`, `{ Customer_uuid: 1, createdAt: -1 }`, plus several more added for vendor/step queries |
| 5 | `react-hook-form` + `zod` on `addOrder1.jsx` | ❌ Not adopted (manual `formErrors` state still in use) |
| 6 | Ban direct `localStorage` reads via lint rule | ❌ Not enforced — no custom ESLint rule found; direct reads likely still present |
| 7 | Offline conflict detection (optimistic locking) | ❌ Not implemented |
| 8 | Order archival cron | ❌ Not implemented |
| 9 | Compound indexes for reporting performance | ✅ Covered by the same index additions as #4 |
| 10 | `VITE_DEFAULT_ORDER_ASSIGNEE` env var | ❌ Still hardcoded — `MISFrontend/src/Pages/addOrder1.jsx:75`, `const DEFAULT_ORDER_ASSIGNEE_NAME = 'Sai'` |

**Net progress: 2 of 10 done** (both index-related, likely delivered as a side
effect of general query-performance work rather than a direct response to the
report). The other eight — including the two lowest-effort items (#2 auth
limiter, #10 env var) — remain open.

---

## 3. Correction to `MONGODB_AUDIT_REPORT.md`: `accounts` is no longer unused

The 2026-05-09 report marked the `accounts` collection **"❌ CONFIRMED
UNUSED — SAFE TO REMOVE"** with the evidence "no route file... zero imports."
That has changed: `routes/Accounts.js` now exists (342 lines), and
`repositories/accounts` is imported by `services/accountRegistry.js`,
`routes/PurchaseOrder.js`, `scripts/seedSystemAccounts.js`,
`scripts/migrateAccountNamesToUuids.js`, and a one-time migration block in
`src/index.js` (duplicate "Opening Balance" account cleanup). It's now an
active chart-of-accounts backing real double-entry postings. **Do not act on
the old report's "safe to remove" recommendation for this collection** — it
is stale. The rest of that report's collection inventory (unused `calllogs`
integration, disconnected `priorities`/`taskgroups` reference tables, legacy
`vendors` vs `vendorworks` overlap, `stockledgers` vs `stock_movements`
overlap) was spot-checked and still holds true today.

Also still true: `calllogs.Mobile_number` is `{ type: Number, unique: true }`
(`repositories/callLogs.js:6`) — will silently corrupt numbers with a leading
`0` or `+91`, and the `unique` constraint on a lossy numeric type risks
spurious duplicate-key errors.

---

## 4. General Backend Security Posture

Reviewed independently of the WhatsApp feature:

- **Helmet/CORS/rate-limit/mongo-sanitize** are all wired up in `index.js` and
  reasonably configured. CORS fails closed in production (rejects unknown
  origins when `NODE_ENV=production`), open by convenience in dev.
- **Password hashing** (`utils/password.js`) uses `scrypt` with a random salt,
  N=16384, and a timing-safe compare — solid. Falls back to plaintext
  comparison only for legacy unhashed records, then migrates them to scrypt
  on next successful login — an intentional, reasonable transition path, not
  a new issue.
- **JWT**: default expiry is 365 days (`routes/Users.js:42`, intentionally
  extended from 7 days per commit `1f54370`). There's no visible revocation
  mechanism (blacklist, session table, or token version field), so a leaked
  token is valid for up to a year with no way to invalidate it short of
  rotating `ACCESS_TOKEN_SECRET` for every user at once. Worth a deliberate
  risk acceptance decision, not necessarily a bug.
- **`requireInternalKey`** (cron/server-to-server auth) fails closed when
  `INTERNAL_API_KEY` is unset — the correct pattern, and a good contrast to
  finding 1.2 above. Uses `!==` rather than `crypto.timingSafeEqual` for the
  key comparison; a low-value nitpick given it's an internal, low-traffic
  endpoint.
- **No test suite** exists in either package (`MISBackend/package.json`'s
  `"test"` script is a placeholder that exits 1; no `*.test.js`/`*.spec.js`
  files anywhere in the repo). For an app now handling live payments and
  chat-triggered order mutations, this is a real gap — the WhatsApp
  command flow in particular (multi-step pending state, permission checks,
  amount parsing) is exactly the kind of logic that benefits most from unit
  tests and regresses silently without them.
- No use of `eval`/`new Function` or `dangerouslySetInnerHTML` was found in
  either codebase — no obvious injection-via-templating surface.

---

## 5. Dependency Vulnerabilities (`npm audit`, 2026-07-21)

### Backend (`MISBackend`)
17 vulnerabilities (2 critical, 9 high, 6 moderate), notably:
- `ws` 8.0.0–8.20.1 (high) — uninitialized memory disclosure + fragment-based
  DoS, pulled in via `socket.io-adapter`
- `socket.io-parser` (high) — unbounded binary attachment count
- `express`'s vulnerable `qs` version range
- `uuid` <11.1.1 (moderate) — buffer bounds check, fix requires a major
  version bump (breaking)

Run `npm audit fix` for the non-breaking fixes; `ws`/`socket.io` fixes should
be tested against the live Socket.IO chat/notification features before
deploying given the app's real-time usage.

### Frontend (`MISFrontend`)
15 vulnerabilities (2 critical, 9 high, 4 moderate), notably:
- `xlsx` (high) — prototype pollution + ReDoS, **no fix available upstream**;
  since spreadsheet import/export is a named skill trigger in this workspace
  and the package is used directly, consider constraining input file size/
  origin or evaluating an alternative (`exceljs`) if untrusted files are ever
  parsed
- `ws`, `tar-fs`, `turbo-stream`, `yaml` (transitive, via build tooling) — fix
  available via `npm audit fix`, lower real-world exposure since these are
  dev/build-time dependencies, not shipped to the browser

---

## 6. Priority Recommendations

| Priority | Action | Effort |
|---|---|---|
| 1 | Rotate the exposed MongoDB Atlas credential (§0.1) | Low, urgent |
| 2 | Enforce `viewScope` on WhatsApp order-detail lookups, not just the list (§1.1) | Low |
| 3 | Fail closed on missing `WHATSAPP_APP_SECRET` for the direct Meta webhook (§1.2) | Low |
| 4 | Add `authLimiter` to `/addUser`; create `VITE_DEFAULT_ORDER_ASSIGNEE` env var — both still open from the last report and low-effort | Low |
| 5 | Make the WhatsApp payment/order-creation confirm step atomic (`findOneAndDelete`) (§1.3) | Low |
| 6 | Add a minimal test suite starting with the WhatsApp order-command service (permission checks, amount parsing, pending-state transitions) | Medium |
| 7 | Deduplicate `ROLE_HIERARCHY` between `authorize.js` and `permissionService.js` (§1.5) | Low |
| 8 | Cap WhatsApp-entered payment amount at outstanding balance (§1.4) | Low |
| 9 | Fix `calllogs.Mobile_number` type/uniqueness; decide on `priorities`/`taskgroups` wiring | Low–Medium |
| 10 | Run `npm audit fix` on both packages and re-test Socket.IO paths | Medium |

---

*This report supplements, and does not replace, `IMPROVEMENT_REPORT.md`
(2026-05-20) and `MONGODB_AUDIT_REPORT.md` (2026-05-09) — see §2 and §3 above
for what has changed since.*
