# MongoDB Collections Audit Report

**Project:** MIS-Both- (MISBackend)  
**Date:** 2026-05-09  
**Total Collections:** 47  
**Model Files Location:** `MISBackend/src/repositories/`

---

## Table of Contents

1. [All Collections Overview](#all-collections-overview)
2. [Detailed Collection Breakdown by Domain](#detailed-collection-breakdown-by-domain)
3. [Duplicate & Overlap Analysis](#duplicate--overlap-analysis)
4. [Usage Heatmap (Most → Least Connected)](#usage-heatmap)
5. [Confirmed Unused Collections](#confirmed-unused-collections)
6. [Isolated / Low-Integration Collections](#isolated--low-integration-collections)
7. [Legacy & Overlapping Collections](#legacy--overlapping-collections)
8. [Recommendations Summary](#recommendations-summary)

---

## All Collections Overview

| # | Collection Name | Model File | Domain | Status |
|---|----------------|-----------|--------|--------|
| 1 | `orders` | `order.js` | Order Management | ✅ Core |
| 2 | `customers` | `customer.js` | CRM | ✅ Core |
| 3 | `users` | `users.js` | Auth/HR | ✅ Core |
| 4 | `transactions` | `transaction.js` | Finance | ✅ Core |
| 5 | `items` | `items.js` | Inventory | ✅ Core |
| 6 | `vendor_masters` | `vendorMaster.js` | Vendor | ✅ Core |
| 7 | `vendor_ledger` | `vendorLedger.js` | Vendor Finance | ✅ Core |
| 8 | `vendorworks` | `vendorWork.js` | Vendor Ops | ✅ Core |
| 9 | `attendances` | `attendance.js` | HR | ✅ Core |
| 10 | `app_settings` | `appSetting.js` | Config | ✅ Core |
| 11 | `counters` | `counter.js` | Utility | ✅ Core |
| 12 | `messages` | `Message.js` | WhatsApp (Legacy) | ✅ Active |
| 13 | `baileys_messages` | `BaileysMessage.js` | WhatsApp (Baileys) | ✅ Active |
| 14 | `baileys_auth_states` | `BaileysAuthState.js` | WhatsApp Auth | ✅ Active |
| 15 | `autoreplies` | `AutoReply.js` | WhatsApp Bot | ✅ Active |
| 16 | `flows` | `Flow.js` | WhatsApp Flows | ✅ Active |
| 17 | `flowSessions` | `FlowSession.js` | WhatsApp Flows | ✅ Active |
| 18 | `catalogsessions` | `catalogSession.js` | WhatsApp Bot | ✅ Active |
| 19 | `contacts` | `contact.js` | WhatsApp CRM | ✅ Active |
| 20 | `whatsappaccounts` | `whatsappAccount.js` | WhatsApp API | ✅ Active |
| 21 | `scheduledmessages` | `ScheduledMessage.js` | Messaging | ✅ Active |
| 22 | `campaignmessagestatuses` | `CampaignMessageStatus.js` | Campaign | ✅ Active |
| 23 | `gmailaccounts` | `GmailAccount.js` | Email | ✅ Active |
| 24 | `emailhistories` | `EmailHistory.js` | Email | ✅ Active |
| 25 | `googledrivetokens` | `googleDriveToken.js` | Google Drive | ✅ Active |
| 26 | `designfilelinks` | `DesignFileLink.js` | Design Files | ✅ Active |
| 27 | `bankstatements` | `bankStatement.js` | Finance | ✅ Active |
| 28 | `diarydrafts` | `diaryDraft.js` | Finance | ✅ Active |
| 29 | `upipaymentattempts` | `upiPaymentAttempt.js` | Payments | ✅ Active |
| 30 | `paymentfollowups` | `paymentFollowup.js` | Finance | ✅ Active |
| 31 | `payment_modes` | `payment_mode.js` | Finance | ✅ Active |
| 32 | `purchaseorders` | `purchaseOrder.js` | Procurement | ✅ Active |
| 33 | `production_jobs` | `productionJob.js` | Manufacturing | ✅ Active |
| 34 | `stockledgers` | `stockLedger.js` | Inventory | ⚠️ Overlap |
| 35 | `stock_movements` | `stockMovement.js` | Inventory | ⚠️ Overlap |
| 36 | `tasks` | `tasks.js` | Task Mgmt | ✅ Active |
| 37 | `usertasks` | `usertask.js` | Task Mgmt | ✅ Active |
| 38 | `itemworkflowtemplates` | `itemWorkflowTemplate.js` | Workflow | ✅ Active |
| 39 | `enquiries` | `enquiry.js` | CRM | ✅ Active |
| 40 | `notes` | `note.js` | Orders | ✅ Active |
| 41 | `itemgroups` | `itemgroup.js` | Inventory | ⚠️ Reference-Only |
| 42 | `customergroups` | `customergroup.js` | CRM | ⚠️ Reference-Only |
| 43 | `usergroups` | `usergroup.js` | HR | ⚠️ Reference-Only |
| 44 | `taskgroups` | `taskgroup.js` | Tasks | ⚠️ Reference-Only |
| 45 | `vendors` | `vendor.js` | Vendor | ⚠️ Legacy |
| 46 | `priorities` | `priority.js` | Reference | ⚠️ Isolated |
| 47 | `accounts` | `accounts.js` | Finance | ❌ UNUSED |
| 48 | `calllogs` | `callLogs.js` | Logs | ⚠️ Isolated |

---

## Detailed Collection Breakdown by Domain

### Domain 1: Order Management

#### `orders` — Central Business Entity
- **File:** `order.js`
- **Use Case:** The core of the entire system. Tracks the full lifecycle of a customer order from enquiry to payment, including items, pricing, vendor assignments, workflow steps, design file status, stage history, and bill status.
- **Key Fields:** Order_uuid, Order_Number, Customer_uuid, stage (enquiry→paid), Items[], workflowSteps[], vendorAssignments[], workRows[], driveFile, billStatus, dueDate, priority
- **Used by:** 15+ routes and services — Orders, Vendor, DesignFiles, Dashboard, BusinessWorkflow, OrderLifecycle, WorkflowTemplate, Transaction, Customer, etc.
- **Verdict:** ✅ Core — Do not touch

#### `enquiries` — Customer Enquiry Intake
- **File:** `enquiry.js`
- **Use Case:** Captures initial customer enquiries before they become orders. Has its own number sequence.
- **Key Fields:** Enquiry_uuid, Enquiry_Number, Customer_name, Priority, Item, Task, Assigned, Delivery_Date, Remark
- **Used by:** `whatsappController`, `customerTimelineController`, `routes/Enquiry`
- **Verdict:** ✅ Active — Used for pre-order CRM flow

#### `notes` — Order Notes/Remarks
- **File:** `note.js`
- **Use Case:** Stores additional notes attached to specific orders and customers.
- **Key Fields:** Note_uuid, Order_uuid, Customer_uuid, Note_name
- **Used by:** `routes/Note`
- **Verdict:** ✅ Active — Minimal but purposeful

---

### Domain 2: Customer & CRM

#### `customers` — Customer Master Data
- **File:** `customer.js`
- **Use Case:** Master record for all customers and vendors (dual-role via PartyRoles). Central entity referenced across orders, transactions, vendor flows, and WhatsApp.
- **Key Fields:** Customer_uuid, Customer_name, Mobile_number, Email, Customer_group, Status, Tags, PartyRoles (customer/vendor), LastInteraction
- **Used by:** 12+ routes and services
- **Note:** Also used as vendor records via `PartyRoles: ['vendor']` — no separate customer/vendor table split
- **Verdict:** ✅ Core — Do not touch

#### `customergroups` — Customer Grouping
- **File:** `customergroup.js`
- **Use Case:** Maintains the list of valid customer group names (e.g., "Retail", "Corporate"). Customer_group in `customers` stores this as a plain string, NOT a reference.
- **Key Fields:** Customer_group_uuid, Customer_group
- **Used by:** `routes/Customergroup` only — no other services query this collection
- **Verdict:** ⚠️ Reference-Only — Value is duplicated as a string in `customers`. Only serves the CRUD management UI for the group list.

#### `contacts` — WhatsApp Contact Directory
- **File:** `contact.js`
- **Use Case:** WhatsApp-specific contact directory distinct from the business customer master. Tracks conversation window state, tags, and agent assignment for WhatsApp chats.
- **Key Fields:** phone, name, tags[], lastMessage, conversation.windowOpen, assignedAgent
- **Used by:** `whatsappController`, `middleware/autoReply`, `routes/Contact`
- **Note:** Separate from `customers` — a customer may have a Contact record only if they interact via WhatsApp
- **Verdict:** ✅ Active — Different domain from customers

---

### Domain 3: Users & HR

#### `users` — Employee Accounts
- **File:** `users.js`
- **Use Case:** Authentication, authorization, and employee management. Stores login credentials and group membership.
- **Key Fields:** User_uuid, User_name, Password, Mobile_number, User_group, Allowed_Task_Groups, Amount
- **Used by:** 10+ routes and services
- **Verdict:** ✅ Core — Do not touch

#### `usergroups` — User Group Definitions
- **File:** `usergroup.js`
- **Use Case:** Maintains the list of valid user group names (e.g., "Admin", "Sales"). User_group in `users` stores this as a plain string.
- **Key Fields:** User_group_uuid, User_group
- **Used by:** `routes/Usergroup` only
- **Verdict:** ⚠️ Reference-Only — Same pattern as customergroups

#### `attendances` — Daily Attendance
- **File:** `attendance.js`
- **Use Case:** Tracks daily check-in/check-out for employees. Supports both dashboard entry and WhatsApp command entry.
- **Key Fields:** Employee_uuid, Date, Status, source (dashboard/whatsapp), User[] (time log entries)
- **Used by:** `routes/Attendance`, `dashboardSummaryController`, `attendanceService`, `whatsappAttendanceService`
- **Verdict:** ✅ Core — Do not touch

---

### Domain 4: Vendor Management

#### `vendor_masters` — Vendor Master Data
- **File:** `vendorMaster.js`
- **Use Case:** Full vendor profile — contact info, capabilities (material/jobwork), payment terms, opening balance.
- **Key Fields:** Vendor_uuid, Vendor_name, Mobile_number, Vendor_type, Jobwork_capable, Raw_material_capable, Opening_balance
- **Used by:** 8+ routes and services (Vendor, Order, DesignFiles, PurchaseOrder, ProductionJob, BusinessWorkflow)
- **Verdict:** ✅ Core — Do not touch

#### `vendorworks` — Vendor Work Records
- **File:** `vendorWork.js`
- **Use Case:** Records specific work given to a vendor for an order — process type, material source, quantities, amount, advance, payment status.
- **Key Fields:** work_uuid, Vendor_uuid, Order_uuid, Process, Input_Item_Name, Output_Item_Name, Amount, Status
- **Used by:** `routes/DesignFiles`, vendor workflow routes
- **Verdict:** ✅ Active

#### `vendor_ledger` — Vendor Financial Ledger
- **File:** `vendorLedger.js`
- **Use Case:** Double-entry style ledger tracking every financial event with a vendor: advance paid, materials issued, job bills, payments.
- **Key Fields:** entry_uuid, vendor_uuid, entry_type (advance_paid/material_issued/job_bill/payment), amount, dr_cr
- **Used by:** `routes/Vendor`, `routes/DesignFiles`, `businessWorkflowService`, `routes/Order`
- **Verdict:** ✅ Active

#### `vendors` (Legacy) — Old Vendor-Order Mapping
- **File:** `vendor.js`
- **Use Case:** A simplified legacy mapping of vendor assignments to orders. Predates `vendor_masters` and `vendorworks`. Only stores: which vendor did which order/item on which date.
- **Key Fields:** Vendor_uuid, Date, Order_Number, Order_uuid, Item_uuid
- **Used by:** `routes/Vendor.js` (still creates and reads records at lines 105, 113, 131, 556)
- **Overlap with:** `vendor_masters` (master info), `vendorworks` (detailed work records)
- **Verdict:** ⚠️ Legacy — Partially superseded but still written to. Needs migration planning.

---

### Domain 5: Inventory & Production

#### `items` — Product/Item Catalog with BOM
- **File:** `items.js`
- **Use Case:** Full product catalog with bill-of-materials (BOM) support. Tracks item type, execution mode (stock/vendor/in-house), preferred vendors/users, and stock settings.
- **Key Fields:** Item_uuid, Item_name, Item_group, itemType, executionMode, bom[], stockTracked, openingStock
- **Used by:** `routes/Items`, `routes/Vendor`, vendor and order workflows
- **Verdict:** ✅ Core — Do not touch

#### `itemgroups` — Item Group Definitions
- **File:** `itemgroup.js`
- **Use Case:** Categorizes items into groups (finished_goods, raw_materials, services, etc.). Item_group in `items` stored as plain string.
- **Key Fields:** Item_group_uuid, Item_group, groupType, defaultItemType, stockTrackedDefault
- **Used by:** `routes/Itemgroup` only
- **Verdict:** ⚠️ Reference-Only — Richer than other group tables (has groupType metadata), but still not referenced by ObjectId from items

#### `stockledgers` — Stock Transaction Ledger
- **File:** `stockLedger.js`
- **Use Case:** Records every stock in/out transaction per item. Simple debit-credit ledger.
- **Key Fields:** itemUuid, txnType (opening/purchase/issue/adjustment/return), qtyIn, qtyOut, rate, orderUuid
- **Used by:** `routes/Stock` only
- **Verdict:** ⚠️ Overlaps with `stock_movements` — see Duplicate Analysis

#### `stock_movements` — Detailed Stock Movement Tracking
- **File:** `stockMovement.js`
- **Use Case:** More granular stock movement recording linked to vendor jobs and production. Tracks movement_type with production-specific values.
- **Key Fields:** movement_uuid, item_uuid, movement_type (purchase/issue_to_vendor/receive_from_vendor/consume_in_production/wastage/finished_goods_receipt), qty_in, qty_out, rate, vendor_uuid, job_uuid
- **Used by:** `routes/Vendor` only
- **Verdict:** ⚠️ Overlaps with `stockledgers` — see Duplicate Analysis

#### `purchaseorders` — Purchase Orders to Vendors
- **File:** `purchaseOrder.js`
- **Use Case:** Formal PO documents sent to vendors for material procurement. Has draft/sent/received lifecycle.
- **Key Fields:** PO_uuid, PO_Number, Vendor_uuid, Order_uuid, Items[], totalAmount, status, expectedDelivery
- **Used by:** `gmailSendService`, `routes/PurchaseOrder`, `routes/Gmail`
- **Verdict:** ✅ Active

#### `production_jobs` — Manufacturing Job Records
- **File:** `productionJob.js`
- **Use Case:** Tracks complete production runs — input materials consumed, output items produced, linked customer orders, vendor used, costs.
- **Key Fields:** job_uuid, job_type, vendor_uuid, inputItems[], outputItems[], linkedOrders[], totalCost, status
- **Used by:** `routes/Vendor`, `businessWorkflowService`
- **Verdict:** ✅ Active

---

### Domain 6: Finance & Accounting

#### `transactions` — Financial Transactions
- **File:** `transaction.js`
- **Use Case:** Records every financial transaction with journal entries. Linked to orders and customers. Supports UPI payment metadata.
- **Key Fields:** Transaction_uuid, Transaction_id, Order_uuid, Transaction_date, Total_Debit, Total_Credit, Payment_mode, Journal_entry[], Customer_uuid, Source
- **Used by:** 10+ routes and services
- **Verdict:** ✅ Core — Do not touch

#### `payment_modes` — Payment Method Types
- **File:** `payment_mode.js`
- **Use Case:** Lookup table for payment method names (Cash, UPI, Bank Transfer, etc.). Payment_mode in `transactions` stored as a plain string.
- **Key Fields:** Payment_mode_uuid, Payment_name
- **Used by:** `routes/Payment_mode`, `dashboardSummaryController`, `accountingPostingService`, `businessWorkflowService`, `routes/Transaction`, `routes/Order`, `routes/BankStatement`, `routes/DiaryDraft`
- **Note:** Unlike other group tables, payment_mode IS actively referenced by value across many routes
- **Verdict:** ✅ Active — Worth keeping as it controls valid payment method names

#### `bankstatements` — Bank Statement Entries
- **File:** `bankStatement.js`
- **Use Case:** Stores uploaded bank statement data with individual transaction entries. Supports matching entries to diary/ledger records.
- **Key Fields:** statement_uuid, account_name, period_start, period_end, entries[] (with match_status, matched_diary_uuid)
- **Used by:** `routes/BankStatement`
- **Verdict:** ✅ Active

#### `diarydrafts` — Day-Book / Cash Book
- **File:** `diaryDraft.js`
- **Use Case:** Daily cash/bank book entries for accounting. Each diary has multiple entries with time-slot, party, amount, direction. Entries can be matched to bank statements.
- **Key Fields:** diary_uuid, diary_date, status, entries[] (entry_uuid, party, amount, direction, book, mode, checked, transaction_uuid)
- **Used by:** `routes/DiaryDraft`, `routes/BankStatement`
- **Verdict:** ✅ Active

#### `paymentfollowups` — Payment Follow-Up Tasks
- **File:** `paymentFollowup.js`
- **Use Case:** Tracks outstanding payment follow-up actions for customers. Created automatically in order lifecycle.
- **Key Fields:** followup_uuid, customer_name, amount, followup_date, status (pending/done)
- **Used by:** `orderLifecycleService`, `routes/paymentFollowup`
- **Verdict:** ✅ Active

#### `upipaymentattempts` — UPI Payment Attempts
- **File:** `upiPaymentAttempt.js`
- **Use Case:** Records each UPI payment link generation and tracks its status through the payment lifecycle.
- **Key Fields:** payment_uuid, customerId, amount, transactionRef, payeeUpiId, status (created→success/failed/expired)
- **Used by:** `routes/UpiPayments`
- **Verdict:** ✅ Active

#### `accounts` — Chart of Accounts
- **File:** `accounts.js`
- **Use Case:** Intended as a double-entry accounting chart-of-accounts (similar to a ledger account master).
- **Key Fields:** Account_uuid, Account_name, Account_type, Account_code, Balance, Currency
- **Used by:** **NOWHERE** — No route file, no service, no controller imports this model
- **Verdict:** ❌ **CONFIRMED UNUSED** — Dead model. No API endpoint, no data written or read.

---

### Domain 7: Task Management

#### `tasks` — Order-Linked Tasks
- **File:** `tasks.js`
- **Use Case:** System-generated tasks tied to order workflows. Created automatically by `orderLifecycleService` and `businessWorkflowService` when orders advance through stages.
- **Key Fields:** Task_uuid, Task_name, Task_group, orderId (ref to Orders), deadline, status (pending/in_progress/done)
- **Used by:** `businessWorkflowService`, `orderLifecycleService`, `taskService`, `routes/Task`
- **Verdict:** ✅ Active — Auto-managed by workflow engine

#### `usertasks` — User Personal Tasks
- **File:** `usertask.js`
- **Use Case:** Manual tasks assigned to specific users with deadlines. Not linked to orders. Used for reminders and WhatsApp scheduling.
- **Key Fields:** Usertask_uuid, Usertask_Number, User, Usertask_name, Date, Deadline, Status
- **Used by:** `dashboardSummaryController`, `messageScheduler`, `orderLifecycleService`, `workflowTemplateService`, `routes/Usertask`
- **Note:** Separate from `tasks` — these are personal to-do items vs order workflow tasks
- **Verdict:** ✅ Active — Different purpose from `tasks`

#### `taskgroups` — Task Group Definitions
- **File:** `taskgroup.js`
- **Use Case:** Lookup list for task group names. Task_group in `tasks` stored as plain string, not ObjectId reference.
- **Key Fields:** Task_group_uuid, Task_group, Id
- **Used by:** `routes/Taskgroup` only — no service queries this collection
- **Verdict:** ⚠️ Reference-Only — Only CRUD management, no cross-linking

#### `itemworkflowtemplates` — Workflow Templates
- **File:** `itemWorkflowTemplate.js`
- **Use Case:** Defines reusable workflow step templates per item name pattern. When an order is created for a matching item, the template auto-generates workflow steps, tasks, and vendor assignments.
- **Key Fields:** template_uuid, itemNamePattern, steps[] (with stage, autoAssignGroup, requiresVendor, vendorWorkType)
- **Used by:** `workflowTemplateService`, `routes/workflowTemplate`
- **Verdict:** ✅ Active

---

### Domain 8: WhatsApp & Messaging

#### `messages` — WhatsApp Messages (Cloud API / Legacy)
- **File:** `Message.js`
- **Use Case:** Stores all WhatsApp messages from the Cloud API integration. Used for conversation history, customer timeline, and 24-hour window guard.
- **Key Fields:** fromMe, from, to, message, body, direction, messageId, type, mediaUrl, customerUuid, flowId, flowToken
- **Used by:** `whatsappController`, `customerTimelineController`, `middleware/whatsapp24hGuard`, `routes/chat`
- **Verdict:** ✅ Active — Still primary message store for Cloud API

#### `baileys_messages` — WhatsApp Messages (Baileys)
- **File:** `BaileysMessage.js`
- **Use Case:** Message store for the Baileys (open-source WhatsApp) integration — a separate WhatsApp provider.
- **Key Fields:** to, from, conversationKey, baileysMessageId, direction, messageType, bodyText, mediaUrl, status, isAutoReply
- **Used by:** `baileysController`, `baileysService`, `unifiedWhatsAppService`
- **Note:** Parallel to `messages` — different schema suited for Baileys protocol
- **Verdict:** ✅ Active — Different WhatsApp provider

#### `baileys_auth_states` — Baileys Authentication
- **File:** `BaileysAuthState.js`
- **Use Case:** Persistent store for Baileys WhatsApp session/authentication state (keys, credentials).
- **Key Fields:** dataKey, dataValue
- **Used by:** `baileysService`, `services/baileysAuthState`
- **Verdict:** ✅ Active — Required for Baileys session persistence

#### `whatsappaccounts` — WhatsApp Cloud API Accounts
- **File:** `whatsappAccount.js`
- **Use Case:** Stores WhatsApp Business API account credentials (access tokens, phone number IDs, WABA IDs).
- **Key Fields:** userId, businessId, wabaId, phoneNumberId, accessToken, tokenExpiresAt
- **Used by:** `whatsappService`, `whatsappMessageService`, `routes/WhatsAppCloud`
- **Verdict:** ✅ Active

#### `autoreplies` — Auto-Reply Rules
- **File:** `AutoReply.js`
- **Use Case:** Keyword-triggered auto-reply rules for WhatsApp — supports text replies and product catalog flows.
- **Key Fields:** keyword, matchType (exact/contains/starts_with), replyType, reply, catalogRows, audienceScope, isActive, delaySeconds
- **Used by:** `whatsappController`, `middleware/autoReply`
- **Verdict:** ✅ Active

#### `flows` — WhatsApp Conversation Flows
- **File:** `Flow.js`
- **Use Case:** Visual flow builder for multi-step WhatsApp conversations (nodes + edges graph structure).
- **Key Fields:** name, triggerKeywords[], nodes[], edges[], isActive
- **Used by:** `flowController`, `flowEngineService`, `whatsappController`
- **Verdict:** ✅ Active

#### `flowSessions` — Active Flow Sessions
- **File:** `FlowSession.js`
- **Use Case:** Tracks the state of a user currently going through a Flow conversation — current node, collected variables, awaiting input.
- **Key Fields:** phone, flowId (ref Flow), currentNodeId, variables, awaiting, isCompleted
- **Used by:** `flowEngineService`
- **Verdict:** ✅ Active

#### `catalogsessions` — Product Catalog Sessions
- **File:** `catalogSession.js`
- **Use Case:** Tracks an active product catalog browsing session triggered by a keyword auto-reply. Maintains step index and selections.
- **Key Fields:** phone, ruleId (ref AutoReply), currentStepIndex, selectedValues, status (active/completed/expired)
- **Used by:** `middleware/autoReply`
- **Verdict:** ✅ Active

#### `contacts` — WhatsApp Contact Directory
- *See CRM domain above*

#### `scheduledmessages` — Scheduled Message Queue
- **File:** `ScheduledMessage.js`
- **Use Case:** Queue for WhatsApp messages scheduled to be sent at a future time. Consumed by `messageScheduler` cron job.
- **Key Fields:** sessionId, to, message, sendAt, status (scheduled/sent/failed)
- **Used by:** `messageScheduler`
- **Verdict:** ✅ Active

#### `campaignmessagestatuses` — Campaign Delivery Tracking
- **File:** `CampaignMessageStatus.js`
- **Use Case:** Tracks delivery status of bulk campaign messages (sent/delivered/read/failed) by messageId.
- **Key Fields:** messageId, status, timestamp, campaignId
- **Used by:** `whatsappController` (bulk write on webhooks, aggregate for campaign stats)
- **Verdict:** ✅ Active

---

### Domain 9: Email & Google Integration

#### `gmailaccounts` — Gmail Account Credentials
- **File:** `GmailAccount.js`
- **Use Case:** Stores OAuth credentials for connected Gmail accounts used to send emails. Includes daily send quota tracking.
- **Key Fields:** accountId, email, refreshToken, accessToken, dailySentCount, dailyLimit, isActive
- **Used by:** `gmailSendService`, `routes/Gmail`
- **Verdict:** ✅ Active

#### `emailhistories` — Email Sending History
- **File:** `EmailHistory.js`
- **Use Case:** Records every email sent from the system with full metadata including attachments stored in Google Drive.
- **Key Fields:** emailId, fromGmailAccountId, toEmail, vendorUuid, orderUuid, subject, attachments[], gmailMessageId, status
- **Used by:** `gmailSendService`, `routes/Gmail`
- **Verdict:** ✅ Active

#### `googledrivetokens` — Google Drive OAuth Token
- **File:** `googleDriveToken.js`
- **Use Case:** Stores the single Google Drive OAuth token for the application's Drive integration (design files, attachments).
- **Key Fields:** provider, email, refreshToken, accessToken, expiryDate
- **Used by:** `routes/googleDriveToken`, `routes/Order`
- **Verdict:** ✅ Active

#### `designfilelinks` — Design File Tracking
- **File:** `DesignFileLink.js`
- **Use Case:** Manually links Google Drive files to specific orders and tracks their lifecycle (draft → confirmed → printing).
- **Key Fields:** driveFileId, fileName, orderUuid, orderNumber, linkStatus, stageNumber, customerUuid, printJobId
- **Used by:** `routes/DesignFiles` (heavily used — 15+ operations)
- **Verdict:** ✅ Active

---

### Domain 10: System / Utility

#### `counters` — Auto-Increment Sequences
- **File:** `counter.js`
- **Use Case:** MongoDB-based sequence generator used by findOneAndUpdate+$inc to generate sequential IDs for orders, enquiries, transactions, etc.
- **Key Fields:** _id (sequence name), seq (current value)
- **Used by:** Most routes that create numbered records (Order, Transaction, Usertask, PurchaseOrder, etc.)
- **Verdict:** ✅ Core — Do not touch

#### `app_settings` — Application Configuration
- **File:** `appSetting.js`
- **Use Case:** Key-value store for dynamic application configuration (WhatsApp provider settings, attendance rules, API keys).
- **Key Fields:** key, value (Mixed), description
- **Used by:** `whatsappProviderSetting`, `whatsappAttendanceService`
- **Verdict:** ✅ Core — Do not touch

#### `calllogs` — Phone Call Logs
- **File:** `callLogs.js`
- **Use Case:** Intended to record phone call logs (name, mobile number, type, duration, status).
- **Key Fields:** CallLog_uuid, Name, Mobile_number, Type, Duration, Status
- **Used by:** `routes/CallLogs` only — No controller, service, or other route imports it
- **Verdict:** ⚠️ Isolated — Standalone CRUD API, no integration with any workflow

---

### Domain 11: Legacy / Deprecated

#### `priorities` — Priority Levels
- **File:** `priority.js`
- **Use Case:** A reference lookup for priority names (Normal, High, Low, Urgent). However, priority values in all other collections (orders, enquiries) are plain enum strings, NOT ObjectId references to this collection.
- **Key Fields:** Priority_uuid, Priority_name
- **Used by:** `routes/Priority` only
- **Verdict:** ⚠️ Isolated — No cross-referencing. Priority is hardcoded as enum strings in schemas, making this collection a dead-end CRUD table.

---

## Duplicate & Overlap Analysis

### Comparison 1: `stockledgers` vs `stock_movements`

| Attribute | `stockledgers` | `stock_movements` |
|-----------|---------------|-------------------|
| File | `stockLedger.js` | `stockMovement.js` |
| Used By | `routes/Stock` | `routes/Vendor` |
| Movement Types | opening, purchase, issue, adjustment, return | purchase, issue_to_vendor, receive_from_vendor, consume_in_production, adjustment, wastage, finished_goods_receipt |
| Vendor Link | vendorCustomerUuid (optional) | vendor_uuid, vendor_name (structured) |
| Job Link | ❌ None | job_uuid ✅ |
| Order Link | orderUuid | order_uuid, order_number |
| Rate/Value | rate ✅ | rate, value ✅ |
| Cross-reference | Neither references the other | Neither references the other |

**Assessment:** These are two parallel stock tracking systems that evolved independently. `stock_movements` is more detailed and production-aware; `stockledgers` is simpler. They likely record the same physical events from different entry paths. A single unified stock ledger would be better.

**Recommendation:** Plan consolidation into `stock_movements` (more complete schema). Requires audit of which records exist in each, migration script, and update to `routes/Stock` to use `stockMovement.js`.

---

### Comparison 2: `tasks` vs `usertasks`

| Attribute | `tasks` | `usertasks` |
|-----------|---------|------------|
| File | `tasks.js` | `usertask.js` |
| Linked to Orders | ✅ orderId (ObjectId ref) | ❌ No order link |
| Created By | Workflow engine (auto) | Manual by user |
| Has Sequential ID | ❌ | ✅ Usertask_Number |
| Deadline Tracking | ✅ deadline (Date) | ✅ Deadline (Date) + Time |
| Remark/Notes | ❌ | ✅ Remark |
| Status Values | pending/in_progress/done | Custom string |
| WhatsApp Scheduling | ❌ | ✅ Used by messageScheduler |

**Assessment:** These are intentionally different. `tasks` are workflow-engine tasks tied to orders; `usertasks` are personal manual task assignments. They are **not duplicates** — they serve different purposes.

**Recommendation:** ✅ Keep both as-is.

---

### Comparison 3: `messages` vs `baileys_messages`

| Attribute | `messages` | `baileys_messages` |
|-----------|------------|-------------------|
| File | `Message.js` | `BaileysMessage.js` |
| WhatsApp Provider | Cloud API (Meta official) | Baileys (open-source) |
| Direction Field | direction string | direction enum: INCOMING/OUTGOING |
| Conversation Key | ❌ | ✅ conversationKey |
| Flow Data | flowId, flowToken, flowResponseData | ❌ |
| Media Handling | mediaUrl, mediaId, caption, filename, mimeType | mediaUrl |
| Customer Link | customerUuid | ❌ (phone-based) |
| Auto-Reply Flag | ❌ | ✅ isAutoReply |

**Assessment:** Two different WhatsApp provider integrations. **Not duplicates** — different schemas for different APIs.

**Recommendation:** ✅ Keep both. Consider documenting which is actively used as the primary provider.

---

### Comparison 4: `vendors` (legacy) vs `vendor_masters` + `vendorworks`

| Attribute | `vendors` (legacy) | `vendor_masters` | `vendorworks` |
|-----------|-------------------|-----------------|--------------|
| File | `vendor.js` | `vendorMaster.js` | `vendorWork.js` |
| Vendor Info | Vendor_uuid only | Full contact, type, terms | Vendor name only (denormalized) |
| Order Link | ✅ Order_Number, Order_uuid | ❌ | ✅ Order_Number, Order_uuid |
| Item Link | ✅ Item_uuid | ❌ | Input/Output item names |
| Amount/Payment | ❌ | Opening_balance only | Amount, Advance, Paid |
| Process Type | ❌ | Vendor_type (material/jobwork) | Process (printing/cutting/etc.) |
| Still Written To | ✅ Line 113 of Vendor.js | ✅ Yes | ✅ Yes |

**Assessment:** `vendor.js` is a legacy model from before `vendorworks` existed. It captures a minimal vendor-order-item mapping. New `vendorworks` records are more detailed. Both are still being created in parallel via `routes/Vendor.js`.

**Recommendation:** ⚠️ The legacy `vendors` collection can be deprecated once `routes/Vendor.js` is updated to stop writing to it (lines 105, 113, 131, 556). Existing data should be migrated to `vendorworks` if needed.

---

## Usage Heatmap

### Tier 1 — Core (10+ cross-file references)
| Collection | Approx. References |
|------------|-------------------|
| `orders` | 15+ |
| `customers` | 12+ |
| `users` | 10+ |
| `transactions` | 10+ |

### Tier 2 — Active (5-9 cross-file references)
| Collection | Approx. References |
|------------|-------------------|
| `vendor_masters` | 8 |
| `items` | 7 |
| `vendor_ledger` | 6 |
| `app_settings` | 5 |
| `attendances` | 5 |
| `counters` | 12+ (utility) |
| `designfilelinks` | 5 |

### Tier 3 — Moderate (2-4 cross-file references)
autoreplies, baileys_messages, baileys_auth_states, flows, flowSessions, contacts, gmailaccounts, emailhistories, tasks, usertasks, purchaseorders, production_jobs, paymentfollowups, bankstatements, diarydrafts, campaignmessagestatuses, scheduledmessages

### Tier 4 — Isolated (1 cross-file reference — only own route/service)
| Collection | Only Used By |
|------------|-------------|
| `callLogs` | `routes/CallLogs` |
| `priorities` | `routes/Priority` |
| `taskgroups` | `routes/Taskgroup` |
| `customergroups` | `routes/Customergroup` |
| `usergroups` | `routes/Usergroup` |
| `itemgroups` | `routes/Itemgroup` |
| `notes` | `routes/Note` |

### Tier 5 — Unused
| Collection | References |
|------------|-----------|
| `accounts` | **0** — not imported anywhere |

---

## Confirmed Unused Collections

### ❌ `accounts` (`accounts.js`) — SAFE TO REMOVE

**Evidence:**
- No route file (`routes/Accounts.js` does not exist)
- No route mounting in `index.js`
- Zero imports: `grep -r "repositories/accounts"` returns no results
- No frontend API calls possible (no endpoint)

**What it was for:** A Chart of Accounts for double-entry bookkeeping (Account_name, Account_type, Account_code, Balance). This functionality was likely replaced by the `transactions` + `journal_entry` + `diarydrafts` approach.

**Action:** Delete `MISBackend/src/repositories/accounts.js`. Drop the `accounts` collection in MongoDB after confirming it is empty or the data is no longer needed.

---

## Isolated / Low-Integration Collections

These collections have an API route but zero integration with other workflows, services, or controllers. They are not "broken" but may represent dead-end features.

### ⚠️ `calllogs` (`callLogs.js`)
- Only mounted as `/api/calllogs`
- No service, controller, or other route references it
- Mobile_number stored as `Number` type (cannot store numbers starting with 0 or +)
- **Action needed:** Verify if the frontend actually calls this API. If no frontend usage, the route and model are dead code.

### ⚠️ `priorities` (`priority.js`)
- Only mounted as `/api/priority`
- The Priority field in `orders`, `enquiries`, and all other schemas is a plain **string** (e.g., `"Normal"`, `"High"`), never an ObjectId reference to this collection
- No service validates priority values against this collection
- **Conclusion:** This is a disconnected CRUD table. Adding/removing priorities here has zero effect on order creation.
- **Action needed:** Either (a) wire it up — change priority fields to enum or add validation against this collection, or (b) remove it and document valid priority values as enums in schemas.

### ⚠️ `taskgroups` (`taskgroup.js`)
- Only mounted as `/api/taskgroup`
- `Task_group` in `tasks` is a plain string — not validated against this collection
- `businessWorkflowService` hardcodes task group strings directly
- **Conclusion:** Same disconnect as `priorities`
- **Action needed:** Wire up as a validation source or remove.

---

## Legacy & Overlapping Collections

### ⚠️ `vendors` (legacy) — Candidate for Deprecation

**Overlapping with:** `vendorworks` (detailed records), `vendor_masters` (vendor profiles)

**Current state:** Still actively written to in `routes/Vendor.js`:
```
Line 105: VendorsLegacy.findOne({ Order_Number })   // duplicate check
Line 113: new VendorsLegacy({...}).save()             // creates new records
Line 131: VendorsLegacy.find({})                      // bulk read
Line 556: VendorsLegacy.findById(id)                  // single read
```

**Migration path:**
1. Identify which reads from `vendors` can be served by `vendorworks`
2. Stop writing new `vendors` records (remove lines 105, 113 logic)
3. Keep legacy read endpoint for historical data until old records expire

### ⚠️ `stockledgers` — Candidate for Consolidation

**Overlapping with:** `stock_movements`

**Problem:** Two separate routes write stock data independently:
- `routes/Stock` → `stockledgers` (simple)
- `routes/Vendor` → `stock_movements` (detailed)

**Migration path:**
1. Extend `stock_movements` with any missing txn types from `stockledgers`
2. Update `routes/Stock` to write to `stock_movements`
3. Archive/drop `stockledgers`

---

## Recommendations Summary

### Action: Remove Immediately (Confirmed Unused)
| Collection | File | Reason |
|-----------|------|--------|
| `accounts` | `accounts.js` | Zero imports, no route, no endpoint |

### Action: Investigate & Likely Remove
| Collection | File | Reason |
|-----------|------|--------|
| `calllogs` | `callLogs.js` | No cross-integration; verify frontend usage |
| `priorities` | `priority.js` | Disconnected from all priority fields in system |

### Action: Wire Up or Remove (Reference Tables)
| Collection | File | Current Gap |
|-----------|------|------------|
| `taskgroups` | `taskgroup.js` | Task_group stored as string, no validation |
| `customergroups` | `customergroup.js` | Customer_group stored as string, no validation |
| `usergroups` | `usergroup.js` | User_group stored as string, no validation |

> **Note:** `itemgroups` has richer metadata (groupType, defaultItemType, stockTrackedDefault) that could be valuable if wired up. Keep and wire up rather than remove.

### Action: Plan Deprecation (Legacy)
| Collection | File | Path |
|-----------|------|------|
| `vendors` (legacy) | `vendor.js` | Migrate to `vendorworks`; stop new writes in `routes/Vendor.js` |

### Action: Plan Consolidation (Overlapping)
| Collections | Recommended Winner | Loser |
|------------|-------------------|-------|
| `stockledgers` + `stock_movements` | `stock_movements` (richer schema) | `stockledgers` |

### Action: Keep As-Is
All other 37 collections are actively used with clear, distinct purposes.

---

## Schema Field Issues Identified

| Collection | Issue |
|-----------|-------|
| `calllogs` | `Mobile_number` is `Number` type — will corrupt numbers starting with `0` or `+91` prefix |
| `vendors` (legacy) | No `Vendor_name` stored — only Vendor_uuid, making joins required for display |
| `enquiries` | `Priority` field not validated against `priorities` collection |
| `orders` (legacy items) | `Priority` field exists at order level as `select: false` — deprecated but not removed |
| `users` | No `isActive` flag — no way to deactivate a user without deleting |
| `contacts` | Duplicate of customer mobile data with no FK link to `customers` |

---

*Report generated by automated audit of `/home/user/MIS-Both-/MISBackend/src/repositories/` and all cross-references in routes, services, controllers, and middleware.*
