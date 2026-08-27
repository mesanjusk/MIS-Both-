# MIS Office AI Audit — 27 Aug 2026

Repository: `mesanjusk/MIS-Both-`

## Executive conclusion

The MIS does **not** need to be rebuilt for Office AI. It already contains the core operational systems required to become the source of truth for a highly automated design + outsourced-printing office.

The correct architecture is:

`Existing MIS data/workflows -> Office AI reasoning -> approval/action layer -> existing MIS APIs`

Do not create parallel AI copies of Users, Attendance, Orders, Tasks, Vendors, Rate Cards, Accounts or Social data.

## Capability audit

| Capability | Current state | Existing implementation to reuse | Office AI work still required |
|---|---|---|---|
| Authentication / Users | Exists | `repositories/users`, `routes/Users`, existing auth/RBAC | Keep as source of truth; do not create AI users |
| Attendance | Exists | `routes/Attendance`, `attendanceService`, dashboard attendance | Use availability as AI context; no replacement attendance system |
| P1/P2/P3/P4 operational priority | Exists | User `operations` metadata + Team Operations | Continue dynamic frontend configuration; no hard-coded people |
| Primary / Backup 1 / Backup 2 | Exists | `Responsibility`, `operationsService`, `operationsTaskService` | Use same resolver for future AI-created tasks/actions |
| Team Operations dashboard | Exists | `Pages/TeamOperations.jsx` | Office AI v1 panel is now embedded here |
| My Operations / Daily Report | Exists | Operations routes/pages | Reuse for employee-specific AI later |
| SOP / recurring daily tasks | Exists | `routes/sop`, SOP repositories, daily task generation | Add AI exception/reminder scheduler later; do not create second SOP engine |
| Orders | Exists | `routes/Order`, order repositories/controllers | AI should create/read through existing order workflow only |
| Order lifecycle | Exists | `orderLifecycleService`, `orderStages`, `businessWorkflowService` | Add AI recommendations/controlled actions later |
| Business Control / command center | Exists | `routes/BusinessOps`, `BusinessControl.jsx` | Reuse as operational source; do not create duplicate business dashboard |
| Quick order workflow | Exists | `createQuickOrderWorkflow` | Customer AI can later feed structured requirements into this workflow |
| Rate cards / calculator | Exists | `routes/RateCard`, `RateCardMaster`, `RateCalculator` | Add AI quotation assistant around existing pricing data; do not replace rate cards |
| Vendors / freelancers | Exists | Vendor routes, vendor master/ledger, vendor pages | Add vendor scoring/recommendation intelligence |
| Post-print / production jobs | Exists | production/vendor job services + post-print pages | Add AI delay prediction / routing, not new production tables |
| Purchase orders | Exists | `routes/PurchaseOrder`, frontend page | Reuse for vendor procurement automation |
| Accounts / transactions | Exists | Accounts/Transaction routes/services/reports | Add management intelligence and anomaly/margin analysis |
| Payment follow-up | Exists | `paymentFollowup`, scheduler, frontend page | Add AI prioritisation/message suggestions |
| UPI / payments | Exists | UPI routes/pages | Keep existing financial controls; AI actions must require approval initially |
| Business reports | Exists | Reports services/pages | Reuse data for management AI answers |
| WhatsApp Cloud | Exists | `WhatsAppCloud`, `whatsappController`, templates, action log | Add AI requirement extraction and conversational handoff layer |
| WhatsApp history/chat | Exists | `routes/chat.js` | This is customer chat history, not Office AI; keep separate |
| Gmail | Exists | Gmail routes/pages | Later use for AI summaries/follow-up suggestions |
| Google Drive / design files | Exists | Drive routes + DesignFiles | Later use for design/prepress intelligence |
| Workflow templates | Exists | `workflowTemplate` routes/pages | Reuse for automated job flows |
| Scheduler | Exists | `Scheduler`, message scheduler, attendance scheduler | Extend for AI exception checks rather than creating another scheduler |
| Social media operations | Exists | Social accounts/posts/calendar/assets/analytics/campaigns/providers | Add AI content strategy/generation on top of existing publishing workflow |
| Social approval / queue | Exists | approval/publishing UI and services | Reuse for future AI-generated content approval |
| Gemini provider | Exists | `@google/generative-ai`, `GEMINI_API_KEY`, diary OCR service | Office AI v1 now reuses the same provider with an optional model override |
| Central Office AI reasoning | **Added in v1** | `officeAiService.js`, `OfficeAI.js` | Expand context and personalization in later releases |
| Office AI management brief | **Added in v1** | `/api/office-ai/brief` + Team Operations panel | Later add scheduled morning/evening delivery |
| Ask Office AI | **Added in v1** | `/api/office-ai/ask` | Later add richer drill-down and scoped employee assistants |
| AI action engine | Missing | Existing write APIs are available | Build controlled action registry; never let model call arbitrary routes |
| AI approval framework | Missing globally | Social approval is module-specific | Add Suggest -> Prepare -> Approve -> Execute policy per action |
| Customer requirement parser | Missing | WhatsApp + quick order already exist | Convert customer text into validated structured print requirements |
| AI quotation assistant | Partial foundation | Rate cards/calculator + order workflow | Recommend quotation using existing rate data + margins + vendor cost |
| Vendor intelligence | Missing | Vendor master/ledger/production history exists | Score cost, quality, delay, turnaround and suitability |
| Design AI | Missing | Drive/design-file workflow exists | Add brief/copy/generation integrations after operations AI stabilises |
| Automated prepress AI | Missing | Design files exist | Add size/bleed/resolution/font/PDF validation |
| Logistics route intelligence | Missing | Delivery/operations data exists | Build route batching and P4-vs-courier recommendations |
| Marketing generation AI | Partial foundation | Full social workflow exists | Add content ideas, copy, campaign suggestions and cross-channel planning |
| Cross-sell / new-product AI | Missing | Customer/order/item history exists | Recommend related products from actual purchase history |
| Finance intelligence | Partial foundation | Accounts, vendor ledger, reports exist | Add margin alerts, collection priorities, cash/profit explanations |
| Central exception engine | Partial foundation | Operations escalation + overdue data exists | Add scheduled detection/notifications across orders, vendors, finance and delivery |
| AI knowledge base | Missing | SOP, rate cards, items, vendors provide source material | Build retrieval over existing structured data/docs; no duplicate master data |
| AI action audit | Missing for future writes | Existing operation/WhatsApp/social audit conventions exist | Add audit only when AI write actions are introduced |

## What should NOT be rebuilt

1. Users / employee identities
2. Attendance
3. P1-P4 operational role system
4. Responsibility and backup resolver
5. Order schema/lifecycle
6. Business Control
7. Rate Card master
8. Vendor master/ledger
9. Accounting / transactions
10. WhatsApp Cloud integration
11. Social publishing workflow
12. Existing scheduler framework

Office AI must call or compose these systems rather than owning parallel data.

## Office AI v1 implemented in this update

### Backend

- `MISBackend/src/services/officeAiService.js`
  - Builds a compact read-only snapshot from existing MIS data.
  - Generates deterministic priority/exception briefs even when Gemini is unavailable.
  - Reuses existing Gemini SDK/API key when configured.
  - Treats MIS/customer text as data, not instructions.
  - Explicitly operates in `suggest` mode.

- `MISBackend/src/routes/OfficeAI.js`
  - Management-only via existing auth/RBAC.
  - `GET /api/office-ai/status`
  - `GET /api/office-ai/brief`
  - `POST /api/office-ai/ask`
  - No write endpoints.

- `MISBackend/test/services/officeAiService.test.js`
  - Snapshot compaction tests.
  - Priority detection tests.
  - Provider-free fallback answer tests.

### Frontend

- `MISFrontend/src/services/officeAiService.js`
- `MISFrontend/src/Components/OfficeAiPanel.jsx`
- `MISFrontend/src/Pages/TeamOperations.jsx`
  - Office AI is embedded into the existing Team Operations page instead of adding another duplicate dashboard.

### Configuration

Office AI reuses `GEMINI_API_KEY`.

Optional overrides:

- `GEMINI_OFFICE_MODEL`
- `GEMINI_TEXT_MODEL`

If Gemini is not configured or temporarily unavailable, the UI remains functional using MIS rule-based analysis.

## Safety / rollout policy

Office AI v1 is deliberately **read-only**.

Recommended rollout levels for future releases:

1. **Suggest** — AI analyses and recommends only. (Current)
2. **Prepare** — AI prepares a quotation/message/task/action for review.
3. **Approve & Execute** — authorised user approves an exact prepared action.
4. **Auto** — only low-risk, explicitly whitelisted actions can execute automatically.

Never provide the model with unrestricted database or arbitrary HTTP/API execution.

## Recommended next releases

### Release 2 — Customer AI + structured requirement parser

- Parse WhatsApp enquiries into product, quantity, size, material, print sides, finish and deadline.
- Ask only for missing fields.
- Prepare (not auto-submit initially) an existing quick-order workflow.
- Add human handoff and confidence/validation.

### Release 3 — Smart quotation

- Reuse Rate Card + product/item + vendor cost data.
- Calculate recommended sell price, margin and turnaround.
- Add owner approval before sending.

### Release 4 — AI action/approval framework

- Central whitelist of safe actions.
- Exact payload preview.
- Required permission per action.
- Human approval and audit trail.
- Idempotency to prevent duplicate execution.

### Release 5 — Vendor intelligence + production exceptions

- Vendor cost/turnaround/reliability score.
- Delayed-job detection.
- Recommended vendor, never silent auto-routing initially.

### Release 6 — Prepress + design intelligence

- Automated file validation first.
- Then design brief/copy/generation assistance.

### Release 7 — Logistics + marketing + finance intelligence

- Route batching and courier recommendation.
- AI content planning using the existing social workflow.
- Margin/outstanding/cash alerts and management explanations.

## Acceptance rule for every future AI feature

Before creating any schema, route, page or workflow, search the existing repository and use this order:

**Reuse -> Extend -> Refactor -> Create new only when genuinely necessary.**
