# Standard Operating Procedure (SOP)
## MIS-Both- Printing Business
### Version 1.0 — May 2026

---

## ROLES REFERENCE

| Role | Key Responsibilities |
|---|---|
| Owner / Admin | All approvals, financial sign-off, vendor negotiations, monthly review |
| Office Staff / Sales | Enquiry intake, quotation, order booking, customer communication, delivery |
| Designer | Design work, Google Drive file management, proof sharing, file confirmation |
| Production Staff | Printing, post-print processes, quality check, packing |
| Accounts | Transactions, payments, vendor bills, UPI, day book, reconciliation |

---

## SECTION 1 — DAY START PROCEDURES

**Responsible:** Owner + All Staff | **Time:** 9:00–9:30 AM

1. Every staff member logs into MIS with individual credentials. Mark attendance (dashboard or WhatsApp command). Absences by 9:15 AM are escalated to Owner.
2. Owner opens Dashboard and reviews summary cards:
   - Today's Orders Count, Pending Orders, Today's Revenue, Today's Deliveries, Pending Receivables
3. Action "Stuck Orders" widget immediately:
   - **Ready Not Delivered** — must be dispatched today
   - **Delivered Unpaid** — assign to Accounts for payment follow-up
4. Review Overdue Orders (dueDate in the past, not delivered) — prioritise immediately.
5. Accounts opens Day Book, verifies cash opening balance.
6. Accounts reviews all Payment Reminders scheduled for today.
7. 5-minute standup: each person states what they're working on, what's pending, any blockers.

**KPIs:** 100% staff attendance by 9:15 AM | 0 unreviewed overdue orders at day start

---

## SECTION 2 — ENQUIRY HANDLING

**Responsible:** Office Staff | **Channels:** WhatsApp, Walk-in, Phone, Email

### All Channels — Common Steps
- Create customer record if new: Customer name, Mobile, Customer group, Tags
- Log every enquiry in MIS → Add Enquiry: Customer name, Item/Task, Priority, Assigned to, Delivery Date, Remark
- Respond/acknowledge to customer within **15 minutes** of receipt

### WhatsApp
- Monitor WhatsApp Cloud inbox continuously during business hours
- Automated Flow Builder handles keyword triggers (price, quote, order) — verify active flows in Flow Builder
- Send acknowledgement using saved template or free-text reply

### Walk-in
- Search existing customer by name/mobile. Add if new.
- Note sample/sketch; photograph if helpful; note filename in Remarks.
- Inform quotation turnaround: same day (standard items) / next day (custom/large jobs)

### Phone
- Log in MIS → Call Logs: Name, Mobile, Type=Inbound, Duration, Status
- Create customer + log enquiry within 10 minutes of call ending

### Email
- Check Gmail (linked via MIS) at 9:30 AM, 1:00 PM, 5:00 PM
- Reply via MIS Email Compose to maintain history

**KPIs:** Response time < 15 min | 100% enquiries logged | 70%+ enquiry-to-quote conversion

---

## SECTION 3 — QUOTATION AND ESTIMATION

**Responsible:** Owner / Office Staff | **Time:** Within 2 hours (standard) / same day (custom)

1. Review enquiry + customer order history and outstanding balance.
2. Calculate rate: paper/substrate cost + printing + post-print (lamination, UV, cutting, foiling, binding) + packing + vendor jobwork + profit margin (min 20% on materials, 30%+ on pure jobwork).
3. Create new Order in MIS at **enquiry** stage:
   - Customer, Order mode (items/note), line items (name, qty, rate, amount), Priority, Due Date, Remark
4. For vendor jobs, add Vendor Assignment: vendor, job mode (jobwork_only / vendor_with_material / own_material_sent / mixed), work type, estimated amount, due date.
5. Share quotation via WhatsApp using **order_new_sk** template (5 variables: customer name, order#, item, amount, date).
6. Set follow-up reminder if no response within 24 hours.

**KPIs:** Quotation sent < 2 hours | 60%+ acceptance rate

---

## SECTION 4 — ORDER CONFIRMATION AND BOOKING

**Responsible:** Office Staff | **Trigger:** Customer confirms verbally, via WhatsApp, or by advance payment

1. Open existing enquiry-stage order → move stage to **approved** in MIS.
2. If advance paid: Business Control → Receive Payment (Cash/UPI/Bank). System posts: Debit Cash, Credit Customer Advance. Auto-sends WhatsApp receipt using **amount_received_sk** template.
3. For new customers or orders above Rs 5,000: collect full details (GST, address, email) and update customer record.
4. Print job card if required (Order Print page): shows Order#, Customer, items, qty, amount, due date, special instructions.
5. Inform Designer — system will auto-create design task when stage moves to 'design'.

**KPIs:** 60% booking rate | 30% advance collection on orders > Rs 2,000 | Stage updated in MIS < 30 min

---

## SECTION 5 — DESIGN WORKFLOW

**Responsible:** Designer | **Trigger:** Order stage moves to 'design'

1. System auto-creates a designer task with deadline = order dueDate or +2 days. Designer reviews from Dashboard → My Day.
2. Collect design brief from customer (WhatsApp media, email attachment, USB/scan for walk-in, or previous order Drive file for reprints).
3. Create/retrieve design file:
   - All files MUST be stored in linked Google Drive folder (Order record has driveFile sub-document).
   - If Drive is connected, system auto-creates file copy from template. If not, upload manually and update order's Drive file details.
   - DesignFileLink tracks file through: **draft** (working) → **confirmed** (approved) → **printing** (sent to press).
4. Share proof with customer via WhatsApp (Drive link or PDF/JPEG from customer chat window). Add Order Note: "Proof sent on [date/time]".
5. Customer approval:
   - **Approved:** Log approval in order notes. Move Drive file to 'confirmed' folder.
   - **Changes requested:** Revise and send new proof. Track revision count in notes.
6. Once approved, update driveFile.webViewLink, DesignFileLink.linkStatus = 'confirmed'. Notify Office Staff to proceed to production.

**KPIs:** Proof sent < 4 working hours after design stage | 70%+ approval in 24 hours | ≤ 1.5 revision rounds avg

---

## SECTION 6 — PRODUCTION PLANNING AND VENDOR ASSIGNMENT

**Responsible:** Owner / Production Staff | **Trigger:** Design approved

1. Review order job spec: items, qty, all finishing requirements.
2. Determine production mode per process: in-house / jobwork_only / vendor_with_material / own_material_sent / mixed.
3. Check raw material stock BEFORE starting (MIS → Stock Report). If any item ≤ reorderLevel → raise PO immediately (Section 16).
4. For vendor jobs, add Vendor Assignment in order:
   - VendorMaster record, workType (printing/lamination/uv_coating/cutting/foiling/binding/packing/finishing/embossing/quality_check), sequence, amount, advance (if any), expected due date.
   - System auto-creates ProductionJob, posts Vendor Bill accounting entry, creates VendorLedger credit entry, creates PaymentFollowup reminder.
5. For multi-vendor jobs, add separate assignment rows with sequential sequence numbers.
6. Verify overall timeline meets customer delivery date. If delay risk → inform customer proactively.

**KPIs:** Production planning < 1 hour of design approval | 100% vendor assignments in MIS same day | 0 jobs started without stock check

---

## SECTION 7 — PRINTING AND PRODUCTION

**Responsible:** Production Staff | **Trigger:** ProductionJob status = in_progress; order stage = printing

1. Designer provides final print-ready file from Drive (DesignFileLink.linkStatus = 'confirmed' → move to 'printing').
2. Press operator verifies: dimensions, bleed, resolution (≥300 DPI), CMYK colours. Test print on plain paper for first-time designs.
3. Load correct paper from inventory. Record material issue: StockMovement type = consume_in_production (deducts from StockLedger).
4. Run print job. Check colour/registration every 50–100 sheets for long runs. Set aside 5–10 pull samples for QC. Record wastage (StockMovement type = wastage).
5. On completion: count output vs. order quantity. If short → Owner decides reprint.
6. For vendor printing: hand over materials with challan. Record StockMovement: issue_to_vendor. On return: receive_from_vendor.
7. Update ProductionJob status → completed. Move order stage to **post_printing**.

**KPIs:** Reprint/rejection rate < 5% | On-time print stage completion 90%

---

## SECTION 8 — POST-PRINTING (LAMINATION, UV, CUTTING, FINISHING, BINDING)

**Responsible:** Post-Print Coordinator | **Trigger:** Order stage = post_printing

Review Post-Print Jobs page (shows all post_printing + finishing orders with KPI cards).

For each process in sequence:

| Process | Action |
|---|---|
| **Lamination** | Confirm type (matt/gloss/thermal). Vendor assignment workType=lamination. Hand over with count. StockMovement: issue_to_vendor. |
| **UV Coating** | Full/spot/soft touch. Done after lamination. Vendor assignment workType=uv_coating. |
| **Cutting** | Verify cut size from design. Use pre-set die/guillotine for standard sizes. New die = charge to order. |
| **Foiling** | Confirm colour and area. Provide foil-ready file (separate layer). Vendor workType=foiling. |
| **Binding** | Specify type (saddle/perfect/spiral/comb/hardcover). Confirm page sequence. Vendor workType=binding. |
| **Embossing** | Custom die required. Vendor workType=embossing. |

- Do NOT start next process until previous is confirmed complete.
- On vendor completion: update vendorAssignment.status = completed. Record StockMovement: receive_from_vendor.
- Vendor payment: Business Control → Pay Vendor. System posts: Debit Vendor Payable / Credit Cash/UPI/Bank. Sends WhatsApp using **amount_payment_sk** template.
- Move order to **finishing** stage.

**KPIs:** 100% vendor assignments tracked per process | Vendor paid same day or next day after completion

---

## SECTION 9 — QUALITY CHECK

**Responsible:** Production Staff / Owner (high-value jobs) | **Trigger:** All post-print processes complete

**Visual Check:** Colours match proof | No banding, streaks, smudging | Text sharp and legible | Correct bleed/margins

**Dimensional Check:** Spot-check 5–10 pieces per 500-piece batch | Verify uniformity

**Finishing Check:** Lamination (no bubbles/peeling) | UV (even application) | Foil adhered | Binding tight | Embossing crisp

**If QC Passes:**
- Add Order Note: "QC Passed — [person] — [date/time]"
- Update QC workflow step → completed
- Proceed to packing

**If QC Fails:**
- Do NOT advance to 'ready'
- Add Note: "QC Failed — [defect description] — [date]"
- If vendor defect: raise with vendor (debit note or redo at no charge)
- If in-house defect: rectification plan; Owner approval required for reprints

**KPIs:** 92%+ QC pass rate (first attempt) | 100% QC documented in MIS | < 8% rework rate

---

## SECTION 10 — PACKING AND DISPATCH PREPARATION

**Responsible:** Production Staff / Office Staff | **Trigger:** QC passed

1. Pack appropriately by product type:
   - Visiting cards / stationery → tissue/butter paper → box or envelope
   - Brochures / leaflets → bands of 50/100 → wrapped batch
   - Banners / standees → cardboard tube or rigid box
   - Books / calendars → bubble wrap individually
2. Label each package: Customer name, Order#, Item description + qty, delivery address, contact number.
3. Record packing material consumption: StockMovement = consume_in_production (if tracked in inventory).
4. Move order stage to **ready** in MIS. System auto-creates Delivery task and adds to "Ready Not Delivered" counter.
5. Notify customer via WhatsApp using **order_completed_sk** template (2 variables: customer name, order#).
6. For courier: generate consignment slip externally; add tracking number to Order Notes: "Dispatched via [courier] — AWB [#] — [date]".

**KPIs:** Stage updated < 30 min after QC | 100% WhatsApp notification on same day | 0 packing errors

---

## SECTION 11 — DELIVERY AND PROOF OF DELIVERY

**Responsible:** Office Staff / Delivery Person | **Trigger:** Order stage = ready

### Customer Pickup
1. Verify customer identity and order number. Hand over package. Collect payment if unpaid (see Section 12).
2. Mark delivered in MIS: Business Control → Mark Delivered (or PATCH stage = delivered).
   - System auto-posts Customer Invoice (Debit Customer Receivable / Credit Sales)
   - Sends WhatsApp delivery notification with amount due
   - Creates PaymentFollowup reminder (3 days from delivery)

### Courier / Outstation Delivery
1. Paste consignment label; hand to courier.
2. On delivery confirmation (call / WhatsApp / courier system): Mark delivered in MIS.
3. Add Order Note: "Delivered to [person] at [time] — [date]". Note signed challan reference if available.

**KPIs:** 100% delivered orders marked in MIS same day | 0 wrong deliveries

---

## SECTION 12 — PAYMENT COLLECTION AND FOLLOW-UP

**Responsible:** Accounts / Office Staff | **Trigger:** Order delivered; payment due

### Collection at Delivery
1. State amount due (saleSubtotal minus any advance already paid).
2. Accept Cash / UPI / Bank Transfer.
3. Record in MIS: Business Control → Receive Payment. System posts: Debit Cash/UPI/Bank, Credit Customer Receivable. Auto-updates billStatus → 'paid' if fully settled. Auto-advances stage to 'paid'.
4. Send WhatsApp receipt using **amount_received_sk** template.

### Follow-up for Unpaid Orders
1. Open MIS → Account Reports → Payment Reminders. Review all pending reminders due today.
2. Escalation by aging:
   - **0–30 days:** WhatsApp reminder using **followup_due_today_sk** or **followup_friendly_sk** template
   - **31–60 days:** Personal call from Office Staff
   - **61–90 days:** Owner calls; arrange payment plan
   - **90+ days:** Formal letter/email + Owner decision; consider stopping future orders until cleared
3. Mark each actioned reminder as 'done'. Create new follow-up for any customer promise date.

**KPIs:** 60% collection at delivery | Outstanding > 30 days < 20% of receivables | Outstanding > 60 days < 10% | Avg collection < 15 days from delivery

---

## SECTION 13 — VENDOR PAYMENT MANAGEMENT

**Responsible:** Accounts / Owner | **Frequency:** Daily review; pay per vendor terms

1. Review Vendor Payable section (Business Control or Post-Print Jobs page): each vendor's outstanding balance = credit entries (job bills) minus debit entries (advances + payments).
2. Prioritise: completed jobs received first, shorter payment term vendors, critical material suppliers.
3. Make payment (Cash/UPI/Bank): Business Control → Pay Vendor. System posts: Debit Vendor Payable / Credit Cash/UPI/Bank. Creates VendorLedger 'payment' debit entry. Updates vendorAssignment.paymentStatus.
4. Send vendor payment confirmation via WhatsApp using **amount_payment_sk** template.
5. For advances before job completion: record as VendorLedger entry_type = advance_paid. Accounting: Debit Vendor Advance / Credit Cash.
6. Monthly: run Vendor Ledger report. No unresolved vendor balance > 30 days after job completion.

**KPIs:** 80% of vendor payments within 7 days of completion | 100% monthly reconciliation | 0 disputes

---

## SECTION 14 — CUSTOMER RELATIONSHIP MANAGEMENT

**Responsible:** Office Staff / Owner | **Frequency:** Ongoing + weekly review

1. Every customer must have: Customer_name, Mobile_number, Customer_group, Tags, Email in MIS.
2. Check customer timeline (orders, payments, notes, WhatsApp messages) before any outreach.
3. Log all important calls and decisions as Order Notes (linked to Customer_uuid).
4. Run Customers Report weekly: segment by value, frequency, last interaction, outstanding balance. Identify inactive customers (no order in 60+ days) for re-engagement.
5. WhatsApp inbox is the official communication history — never delete conversations.
6. Complaints: log as Order Note with "complaint" tag. Escalate to Owner within 1 hour for quality/delivery/wrong item complaints. Resolution target: 24 hours.
7. Top 10 customers by revenue: Owner calls top 5 monthly. Offer loyalty benefits (priority turnaround, bulk discounts).

**KPIs:** 100% customer data completeness | 70% retention (repeat within 6 months) | Complaint resolution < 24 hours at 90%

---

## SECTION 15 — MARKETING AND LEAD GENERATION

**Responsible:** Owner / Office Staff | **Frequency:** Daily awareness + weekly campaign planning

1. **WhatsApp Broadcasts:** Use MIS Broadcast Page. Build lists by Customer Group + Tags. Campaigns for festivals, new products, seasonal promos. Schedule at 10 AM or 6 PM for best response. Use Flow Builder for interactive automated campaigns.
2. **Content:** Photograph finished products. Maintain photo library. Collect customer testimonials (use with permission in future campaigns).
3. **Lead Tracking:** Every lead → Enquiry record in MIS. Weekly funnel review: Enquiries → Quotes → Orders → Delivered → Paid.
4. **Referral Program:** Owner defines incentive. Tag referred customers with source tag (e.g., "ref-[referrer-name]"). Track quarterly via Customers Report.
5. **Offline / Social leads:** Log as Enquiry or Call Log with remark: "Source: Instagram / Google / Referral" for source tracking in monthly reports.

**KPIs:** ≥ 2 targeted campaigns/month | 55%+ enquiry-to-order conversion | Monthly new customer growth trend positive | < 2% WhatsApp opt-out per campaign

---

## SECTION 16 — INVENTORY MANAGEMENT

**Responsible:** Production Staff (daily) + Accounts (purchases) | **Frequency:** Daily check, weekly review, monthly physical count

### Daily
Check Dashboard "Low Stock" card. For any item at/below reorderLevel:
- Raise Purchase Order in MIS (PO# auto-generated): Vendor, items, qty, rate, expected delivery. Status = draft → sent once communicated.
- Send PO to vendor via WhatsApp using **purchase_order_sk** template.

### On Material Receipt
Verify against PO. Record StockLedger: txnType=purchase (qtyIn). Record StockMovement: movement_type=purchase. Update PO status → received. Post vendor bill in accounting.

### On Issue to Production
Record StockLedger: txnType=issue (qtyOut). Record StockMovement: consume_in_production or issue_to_vendor.

### Adjustments
Record with reason. Owner approval required for any adjustment > Rs 500 in value.

### Weekly (Every Monday)
Review Stock Report for all tracked items. Compare system qty vs. physical count for critical items (paper, laminates, inks). Identify slow-moving items (not consumed in 30+ days).

### Monthly (Last Working Day)
Full physical count. Reconcile with MIS. Record all adjustments with explanation. Owner signs off on monthly stock report.

**KPIs:** 0 stockouts causing production delay | 100% reorder compliance (PO raised before stockout) | < 2% physical-vs-system variance by value monthly

---

## SECTION 17 — DAY END PROCEDURES

**Responsible:** Owner + Accounts + Office Staff | **Time:** 6:00–6:30 PM

1. **Order sweep:** Review Order Kanban. Ensure no order is stuck without a next action. Communicate delays to affected customers proactively.
2. **Cash reconciliation:** Count physical cash. Compare with MIS Day Book (opening + receipts - payments = closing balance). Discrepancy > Rs 100 requires Owner sign-off.
3. **UPI reconciliation:** All today's UPI payments appear in system with reference numbers. Check Bank Reconciliation page for unmatched entries.
4. **Payment reminders:** All due-today reminders actioned (called/messaged) and marked 'done' or rescheduled.
5. **Vendor follow-up:** Verify all vendor assignments due today. If work not received, call vendor and update due date in MIS.
6. **Design files:** Designer confirms all active files saved in Google Drive. Pending customer approvals followed up via WhatsApp.
7. **Attendance out** marked by all staff.
8. **Owner reviews Business Control (Operations Center):**
   - Open orders count, unassigned orders (must = 0)
   - Ready Not Delivered (action or explain each one)
   - Delivered Unpaid (verify follow-ups are set)
   - Vendor Payable (identify any urgent vendor payments)
   - Today's Receipts (cash in)

**KPIs:** 100% cash reconciled daily | 0 unactioned payment reminders at close | 0 "Ready Not Delivered" at close | 100% today's entries in MIS before close

---

## SECTION 18 — WEEKLY REVIEW AND REPORTING

**Responsible:** Owner | **When:** Every Monday morning | **Duration:** 45–60 minutes

1. **Orders:** Total received vs. last week | Orders completed | Overdue orders (each reviewed individually) | Avg turnaround time
2. **Financial:** Weekly revenue | Total collections (cash + UPI + bank) | Vendor payments made | Net cash flow
3. **Outstanding:** Run Aging Report — 0–30 days (ensure follow-up set) | 31–60 days (direct calls this week) | 60+ days (Owner personally handles)
4. **Customers:** New customers added | Top 5 by order value | Any complaints and resolution status
5. **Vendors:** Any late deliveries or quality issues noted | Any vendor past payment terms?
6. **Stock:** Weekly position for tracked items | Any items hit reorder level — PO raised on time?
7. **Staff:** Task completion rates | Designer avg turnaround | Sales follow-up completion rate
8. **Action list for coming week:** Top 5 priority orders | Vendor payments to make | Customer collection calls | Procurement or maintenance needed

| Weekly KPI | Target |
|---|---|
| Orders delivered on time | 85%+ |
| Cash collected / orders delivered | 60%+ same-day |
| Overdue orders (% of open) | < 10% |
| QC pass rate | 92%+ |
| Design approvals within 24 hours | 70%+ |
| Vendor payments within 7 days | 80%+ |

---

## SECTION 19 — MONTHLY ANALYSIS AND GROWTH PLANNING

**Responsible:** Owner | **When:** First 3 working days of each month | **Duration:** 2–3 hours

1. **Financial close:** All previous-month transactions entered in MIS. No back-dated entries after the 3rd without Owner approval. Run Trial Balance — verify Debits = Credits across all accounts.
2. **Revenue + profitability:** Total Sales, COGS (Purchase + Stock + Jobwork Expense), Gross Margin (target ≥ 35%). Compare MoM and YoY.
3. **Customer analysis:** Top 10 by revenue | New vs. churned | Average order value trend | Best-performing customer group.
4. **Vendor analysis:** Total paid per vendor | Late deliveries / quality issues | Rate review — negotiate if needed.
5. **Production analysis:** Avg turnaround per product category (from stageHistory timestamps) | Rework/reprint rate and cost impact | Machine utilisation estimate.
6. **Inventory audit:** Full physical count and reconciliation (per Section 16). Adjust reorder levels based on actual monthly consumption.
7. **Team performance:** Attendance report | Task completion rates | Designer productivity | Sales conversion rate.
8. **Marketing ROI:** Campaigns sent | New customers acquired from campaigns | Campaign response rates.
9. **Growth plan for next month:**
   - Revenue target: last month + 10% minimum
   - 3 specific revenue growth actions (e.g., lapsed customer WhatsApp campaign, new product line launch, seasonal offer)
   - 1–2 operational improvements (e.g., reduce turnaround for standard items, add vendor for production bottleneck)
   - Marketing campaign calendar for the month
10. **System maintenance:** Fix duplicate customers | Update items master rates (defaultPurchaseRate, defaultSaleRate) | Review and update WhatsApp flow templates | Archive stale enquiries older than 3 months.

### Monthly Reports to Generate

| Report | Location in MIS |
|---|---|
| Trial Balance | Account Reports → Trial Balance |
| Aging Report | Collection Reports → Aging Report |
| All Orders | Orders Reports → All Orders |
| All Payments | Account Reports → Payments Report |
| Customers Report | Dashboard Reports → Customers Report |
| Attendance Report | Attendance → Attendance Report |
| Delivery Report | Orders Reports → Delivery Report |
| Account Book | Account Reports → Account Book |

| Monthly KPI | Target |
|---|---|
| Revenue growth MoM | 8–10% |
| Gross margin | 35%+ |
| Net collections / net sales | 85%+ |
| Customer retention | 70%+ |
| New customers/month | 10%+ of active base |
| Trial Balance balanced | 100% — non-negotiable |
| Orders on time | 85%+ |
| Stock variance (physical vs. system) | < 2% by value |

---

## APPENDIX A — ORDER STAGE REFERENCE

| Stage | Meaning | System Auto-Actions |
|---|---|---|
| enquiry | Quote being prepared | None |
| quoted | Quote sent to customer | None |
| approved | Customer confirmed | None |
| design | Design in progress | Auto-creates Designer task |
| printing | Production in progress | Vendor bill posted if vendor assigned |
| post_printing | Lamination/UV/cutting/finishing | Auto-creates post-design coordination task |
| finishing | Final finishing steps | None |
| ready | Complete, awaiting delivery | Delivery task created; WhatsApp notification to customer |
| delivered | Handed to customer | Invoice posted; PaymentFollowup created (3 days); WhatsApp sent |
| paid | Fully paid | billStatus = 'paid'; stage auto-advanced |

---

## APPENDIX B — WHATSAPP TEMPLATE QUICK REFERENCE

| Template Code | When to Use | Variables |
|---|---|---|
| order_new_sk | New order confirmation to customer | 5: name, order#, item, amount, date |
| order_completed_sk | Order ready for pickup / dispatch | 2: name, order# |
| amount_received_sk | Payment receipt to customer | 5: name, amount, mode, order#, date |
| amount_payment_sk | Payment confirmation to vendor | 5: vendor name, amount, mode, order#, date |
| followup_friendly_sk | Advance payment reminder | 4: name, amount, order#, date |
| followup_due_today_sk | Same-day payment reminder | 4: name, amount, order#, due date |
| purchase_order_sk | PO sent to vendor | 4: vendor name, PO#, items, amount |
| task_assigned_sk | Task assignment notification | 5: user, task name, order#, deadline, instructions |
| attendance_marked_sk | Attendance confirmation | 4: name, time, date, status |

---

## APPENDIX C — ACCOUNTING ENTRIES QUICK REFERENCE

| Business Event | Debit | Credit |
|---|---|---|
| Customer advance received | Cash / UPI / Bank | Customer Advance |
| Order delivered (invoice posted) | Customer Receivable | Sales |
| Customer payment received (post-invoice) | Cash / UPI / Bank | Customer Receivable |
| Vendor jobwork bill | Job Work Expense | Vendor Payable |
| Vendor payment made | Vendor Payable | Cash / UPI / Bank |
| Material purchase | Stock / Purchase | Vendor Payable |
| Cash expense | General Expense | Cash |

> All entries use double-entry bookkeeping. Debit total must equal Credit total per transaction. The system enforces this validation before saving.

---

## APPENDIX D — DAILY CHECKLIST

### Morning (9:00–9:30 AM)
- [ ] All staff attendance marked in MIS
- [ ] Dashboard reviewed: pending, overdue, stuck orders actioned
- [ ] Today's payment reminders reviewed
- [ ] Morning standup completed

### During the Day
- [ ] Every enquiry logged within 30 minutes of receipt
- [ ] Every quotation sent within 2 hours (standard items)
- [ ] Every completed production stage updated in MIS same day
- [ ] Every payment received recorded immediately in MIS
- [ ] WhatsApp inbox monitored continuously during business hours

### Evening (6:00–6:30 PM)
- [ ] Cash counted and reconciled with Day Book
- [ ] All today's payment reminders actioned (marked done or rescheduled)
- [ ] All 'Ready Not Delivered' orders dispatched or customer informed of delay
- [ ] All vendor deliveries due today verified or due date updated in MIS
- [ ] Operations Center reviewed by Owner before close
