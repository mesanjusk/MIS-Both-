#!/usr/bin/env python3
import openpyxl
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side, GradientFill
)
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

wb = openpyxl.Workbook()

# ── colour palette ──────────────────────────────────────────────
RED    = "C0392B"
ORANGE = "E67E22"
GREEN  = "27AE60"
BLUE   = "2980B9"
PURPLE = "8E44AD"
DARK   = "1A1A2E"
WHITE  = "FFFFFF"
LGREY  = "F2F3F4"
MGREY  = "BDC3C7"

def hfill(hex_):   return PatternFill("solid", fgColor=hex_)
def bold(sz=11, colour=WHITE): return Font(bold=True, size=sz, color=colour)
def normal(sz=10, colour="333333"): return Font(size=sz, color=colour)
def center(): return Alignment(horizontal="center", vertical="center", wrap_text=True)
def left():   return Alignment(horizontal="left",   vertical="center", wrap_text=True)
def thin_border():
    s = Side(style="thin", color=MGREY)
    return Border(left=s, right=s, top=s, bottom=s)

def header_row(ws, row, cols_text, fill_hex, font_col=WHITE, height=28):
    ws.row_dimensions[row].height = height
    for col, text in enumerate(cols_text, 1):
        c = ws.cell(row=row, column=col, value=text)
        c.fill  = hfill(fill_hex)
        c.font  = bold(10, font_col)
        c.alignment = center()
        c.border = thin_border()

def section_header(ws, row, text, fill_hex, span, height=22):
    ws.row_dimensions[row].height = height
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    c = ws.cell(row=row, column=1, value=text)
    c.fill  = hfill(fill_hex)
    c.font  = bold(11, WHITE)
    c.alignment = left()
    c.border = thin_border()

def data_row(ws, row, values, alt=False):
    ws.row_dimensions[row].height = 20
    bg = LGREY if alt else WHITE
    for col, val in enumerate(values, 1):
        c = ws.cell(row=row, column=col, value=val)
        c.fill   = hfill(bg)
        c.font   = normal()
        c.border = thin_border()
        c.alignment = left() if col > 1 else center()

def add_dropdown(ws, col_letter, first_row, last_row, formula):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    dv.sqref = f"{col_letter}{first_row}:{col_letter}{last_row}"
    ws.add_data_validation(dv)

# ══════════════════════════════════════════════════════════════════
# SHEET 1 – PAGES / COMPONENTS TO DELETE
# ══════════════════════════════════════════════════════════════════
ws1 = wb.active
ws1.title = "1. Delete Dead Code"
ws1.freeze_panes = "A3"
ws1.sheet_view.showGridLines = False

cols1 = [
    ("A", 5),  ("B", 38), ("C", 22), ("D", 35), ("E", 15), ("F", 15)
]
for letter, width in cols1:
    ws1.column_dimensions[letter].width = width

header_row(ws1, 1,
    ["#", "File / Feature", "Area", "Why Remove", "Approve ✓", "Priority"],
    DARK, height=30)

items_delete = [
    # FRONTEND PAGES
    ("FE Pages",),
    (1,  "MISFrontend/src/Components/RightSidebar.jsx",           "Navigation",   "Duplicates left nav; rail buttons confusing — replace with top-bar actions",              "","High"),
    (2,  "MISFrontend/src/Pages/FlowBuilderPage.jsx",             "Automation",   "Visual flow builder too complex; team of 4 has no time to design automations",            "","High"),
    (3,  "MISFrontend/src/Pages/BankReconciliation.jsx",          "Accounts",     "Enterprise feature; wrong scale for 10 orders/day",                                       "","High"),
    (4,  "MISFrontend/src/Pages/TrialBalance.jsx",                "Accounts",     "Accountant-level tool; not needed daily",                                                  "","High"),
    (5,  "MISFrontend/src/Pages/OpeningBalance.jsx",              "Accounts",     "One-time setup page; not needed after initial entry",                                     "","Medium"),
    (6,  "MISFrontend/src/Pages/GmailAccounts.jsx",               "Email",        "WhatsApp covers all customer communication; Gmail adds complexity",                       "","High"),
    (7,  "MISFrontend/src/Pages/EmailCompose.jsx",                "Email",        "Same — consolidated into WhatsApp",                                                        "","High"),
    (8,  "MISFrontend/src/Pages/EmailHistory.jsx",                "Email",        "Same — consolidated into WhatsApp",                                                        "","High"),
    (9,  "MISFrontend/src/Pages/CallLogs.jsx",                    "CRM",          "Not core to printing business ops; rarely used",                                          "","Medium"),
    (10, "MISFrontend/src/Pages/DiaryUpload.jsx",                 "Misc",         "Non-essential daily upload feature",                                                       "","Medium"),
    (11, "MISFrontend/src/Pages/SopPage.jsx",                     "Ops",          "Replace with simple daily checklist embedded in dashboard",                               "","Medium"),
    (12, "MISFrontend/src/Pages/WorkflowTemplates.jsx",           "Automation",   "Replaced by fixed pipeline; team doesn't need custom workflow editing",                   "","High"),
    (13, "MISFrontend/src/Pages/UpiPayment.jsx  (standalone)",    "Accounts",     "Merge UPI collection into dashboard quick-action widget instead",                         "","Medium"),
    (14, "MISFrontend/src/Pages/addTransaction1.jsx",             "Accounts",     "Replace with inline quick-add in simple accounts log",                                    "","Medium"),
    (15, "MISFrontend/src/Pages/AttendanceReport.jsx  (duplicate)","HR",          "Keep AllAttandance.jsx; remove duplicate report",                                         "","Low"),
    (16, "MISFrontend/src/Pages/purchaseOrder.jsx",               "Procurement",  "Overkill at current scale; add note on vendor payment instead",                           "","Medium"),
    # LEGACY WHATSAPP
    ("Legacy WhatsApp (Baileys)",),
    (17, "MISFrontend/src/Pages/WhatsApp*.jsx  (Baileys pages)",  "WhatsApp",     "Unofficial QR-based; fragile; Cloud API replaces it",                                     "","High"),
    (18, "MISFrontend/src/Components/whatsapp/ (legacy folder)",  "WhatsApp",     "All legacy WA components; superseded by whatsappCloud/ folder",                          "","High"),
    # REPORTS
    ("Reports — consolidate 17 → 3",),
    (19, "Reports/allTransaction.jsx",                             "Reports",      "5 transaction views → 1 smart Collections report",                                        "","High"),
    (20, "Reports/allTransaction4D.jsx",                           "Reports",      "Same",                                                                                     "","High"),
    (21, "Reports/allBills.jsx  (current 879-line version)",       "Reports",      "Rebuild as simplified Bills tab inside Collections report",                               "","High"),
    (22, "Reports/agingReport.jsx",                                "Reports",      "Overkill; receivables aging not actionable daily for small team",                         "","Medium"),
    (23, "Reports/priorityReport.jsx",                             "Reports",      "Admin-level; low daily use",                                                               "","Low"),
    (24, "Reports/taskReport.jsx",                                 "Reports",      "Tasks visible on dashboard; separate report not needed",                                   "","Low"),
    (25, "Reports/userReport.jsx",                                 "Reports",      "Admin-level; low daily use",                                                               "","Low"),
    (26, "Reports/allDelivery.jsx",                                "Reports",      "Fold delivery tracking into Orders report",                                                "","Medium"),
    (27, "Reports/billUpdate.jsx",                                 "Reports",      "Bill status updates happen from Kanban; standalone page redundant",                       "","Medium"),
    (28, "Reports/paymentReport.jsx",                              "Reports",      "Merge into Collections report",                                                            "","Medium"),
    # BACKEND
    ("Backend",),
    (29, "MISBackend/src/routes/Baileys.js",                       "Backend",      "Remove with Baileys frontend",                                                             "","High"),
    (30, "MISBackend/src/services/baileysService.js",              "Backend",      "Same",                                                                                     "","High"),
    (31, "MISBackend/src/repositories/baileysAuthState.js",        "Backend",      "Same",                                                                                     "","High"),
    (32, "MISBackend/src/routes/Gmail.js",                         "Backend",      "Remove with Gmail frontend",                                                               "","High"),
    (33, "MISBackend/src/routes/BankStatement.js",                 "Backend",      "Remove with BankReconciliation frontend",                                                  "","High"),
    (34, "MISBackend/src/routes/workflowTemplate.js",              "Backend",      "Remove with WorkflowTemplates frontend",                                                   "","High"),
    (35, "MISBackend/src/routes/PurchaseOrder.js",                 "Backend",      "Remove with purchaseOrder frontend",                                                       "","Medium"),
    (36, "MISBackend/src/repositories/flow.js + flowSession.js",   "Backend",      "Remove with FlowBuilder frontend",                                                         "","High"),
]

row = 2
alt = False
for item in items_delete:
    if len(item) == 1:
        section_header(ws1, row, f"  ▶  {item[0]}", BLUE, 6)
        row += 1
        continue
    data_row(ws1, row, list(item), alt)
    # colour the Approve cell
    c = ws1.cell(row=row, column=5)
    c.fill = hfill("D5F5E3")
    c.font = bold(10, "1E8449")
    c.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws1, "E", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')

# ══════════════════════════════════════════════════════════════════
# SHEET 2 – COMPONENTS TO REWRITE / SIMPLIFY
# ══════════════════════════════════════════════════════════════════
ws2 = wb.create_sheet("2. Rewrite & Simplify")
ws2.freeze_panes = "A3"
ws2.sheet_view.showGridLines = False

for letter, width in [("A",5),("B",38),("C",16),("D",14),("E",40),("F",14),("G",14)]:
    ws2.column_dimensions[letter].width = width

header_row(ws2, 1,
    ["#","File","Current Lines","Target Lines","Key Changes","Approve ✓","Priority"],
    DARK, height=30)

items_rewrite = [
    ("NAVIGATION",),
    (1, "Sidebar.jsx",                   "288",  "~80",   "6 items flat list (Dashboard/Orders/Customers/Accounts/Reports/Settings); remove sidebarMenu.jsx config file", "", "High"),
    (2, "TopNavbar.jsx",                 "100+", "~80",   "Add [+ New Order] primary button; move 5 right-sidebar actions here; remove right sidebar dependency", "", "High"),
    (3, "Footer.jsx  (mobile bottom nav)","50",  "~40",   "4 tabs: Dashboard / Orders / + New Order / Accounts; remove Tasks & Chat tabs", "", "Medium"),

    ("DASHBOARD",),
    (4, "Dashboard.jsx",                 "754",  "~200",  "5 KPI tiles (Today Orders, Ready, Overdue, Collected, Pending); Needs Attention list (max 5 stuck orders); Stage pipeline counts; remove resizable panels, customization drawer, attendance section, user tasks section", "", "High"),
    (5, "Components/dashboard/ (folder)","~300", "~80",   "Keep SummaryCard + QuickActions; delete CrmSidebarPanel, ActionList, RoleWidget, DesignFilesWidget; simplify UpiCollectionSection to inline widget", "", "High"),

    ("ORDER MANAGEMENT",),
    (6, "addOrder1.jsx",                 "1726", "~180",  "6 fields: Customer autocomplete, Items/Qty/Rate table (max 5 rows), Due Date, Priority, Advance Paid, 2 save buttons (Enquiry / Order); remove vendor section, task groups, Drive integration, date override, WA toggle (always auto-send)", "", "High"),
    (7, "OrderUpdate.jsx",               "710",  "~150",  "Read-only order detail; editable: due date, priority, items qty/rate, add note; stage advance moved to Kanban", "", "High"),
    (8, "OrderKanban.jsx + OrderCard.jsx","~300", "~150",  "Keep Kanban paradigm; simplify card: customer, item summary, due date, amount, [→ Next Stage] button; remove drag-drop complexity; 8 columns = full pipeline", "", "High"),

    ("ACCOUNTS (Simplify)",),
    (9, "DayBook.jsx",                   "1066", "~120",  "Replace double-entry complexity with simple Income/Expense log: date, type, amount, category, note, linked order; auto-create income entry when order marked paid", "", "High"),

    ("REPORTS (Rebuild 3)",),
    (10,"Reports/allOrder.jsx  → Orders Report","712","~200","Table + filters: date range, stage, customer; Export Excel; replaces allOrder, AllOrderTableView, allDelivery","","High"),
    (11,"Reports/Collections Report  (new)","—",  "~200",  "Income + expenses by date range; replaces allBills, allTransaction*, paymentReport","","High"),
    (12,"Reports/customerReport.jsx",    "303",  "~150",  "Minor cleanup: remove unused columns; keep search, filter by group, edit/delete","","Low"),

    ("BACKEND",),
    (13,"orderLifecycleController.js",   "~200", "~180",  "Add auto-WhatsApp send after each stage change using existing whatsappCloudService.sendTemplate()", "", "High"),
    (14,"messageScheduler.js",           "~150", "~200",  "Add: (a) daily 10am payment reminder for delivered-unpaid orders; (b) 7pm owner summary via WhatsApp","","High"),
    (15,"App.jsx  (router)",             "66 routes","~35 routes","Remove routes for deleted pages; keep active 35","","High"),
]

row = 2
alt = False
for item in items_rewrite:
    if len(item) == 1:
        section_header(ws2, row, f"  ▶  {item[0]}", PURPLE, 7)
        row += 1
        continue
    data_row(ws2, row, list(item), alt)
    c = ws2.cell(row=row, column=6)
    c.fill = hfill("D5F5E3")
    c.font = bold(10, "1E8449")
    c.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws2, "F", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')

# ══════════════════════════════════════════════════════════════════
# SHEET 3 – AUTOMATION TO ADD
# ══════════════════════════════════════════════════════════════════
ws3 = wb.create_sheet("3. Automation to Add")
ws3.freeze_panes = "A3"
ws3.sheet_view.showGridLines = False

for letter, width in [("A",5),("B",30),("C",40),("D",30),("E",20),("F",14),("G",14)]:
    ws3.column_dimensions[letter].width = width

header_row(ws3, 1,
    ["#","Feature","What It Does","Files to Change","Trigger","Approve ✓","Priority"],
    DARK, height=30)

items_auto = [
    ("WHATSAPP AUTO-MESSAGES (Backend)",),
    (1, "Stage-change WA message","Auto-send WA to customer when order moves to approved / design / ready / delivered","orderLifecycleController.js + whatsappTemplates.js","Order stage PATCH","","High"),
    (2, "Payment reminder WA","Daily 10am: find delivered-unpaid orders older than 2 days → send WA payment due","messageScheduler.js","Cron 10:00","","High"),
    (3, "Order confirmation WA","On order creation: send 'Order #{n} received, amount ₹X, due date Y'","orderService.js (create)","Order created","","High"),
    (4, "Daily owner summary WA","7pm every day: New orders, collections, pending, overdue count → WA to owner number","messageScheduler.js","Cron 19:00","","High"),
    (5, "Enquiry follow-up WA","If enquiry stuck in 'quoted' stage > 24h, auto-send follow-up","messageScheduler.js","Cron daily","","Medium"),

    ("ORDER AUTOMATION (Backend)",),
    (6, "Auto vendor assignment","On order creation, auto-assign vendor to each production step based on preferred vendor in Item master","orderService.js + vendorService.js","Order created","","High"),
    (7, "Auto task creation","Auto-create designer task when order reaches 'design' stage (already partly built — wire up fully)","orderLifecycleController.js","Stage = design","","Medium"),
    (8, "SLA alert","Flag order in dashboard 'Needs Attention' if stuck in same stage > 2 days","Dashboard API + dashboard controller","Real-time check","","Medium"),

    ("ACCOUNTS AUTOMATION",),
    (9, "Auto income entry","When order marked 'paid', auto-create income transaction (no manual journal)","orderLifecycleController.js + transactionService.js","Stage = paid","","High"),
    (10,"Auto invoice generate","On delivery (stage = delivered), auto-generate PDF invoice and attach to order","orderLifecycleController.js + InvoiceModal.jsx","Stage = delivered","","Medium"),
]

row = 2
alt = False
for item in items_auto:
    if len(item) == 1:
        section_header(ws3, row, f"  ▶  {item[0]}", GREEN, 7)
        row += 1
        continue
    data_row(ws3, row, list(item), alt)
    c = ws3.cell(row=row, column=6)
    c.fill = hfill("D5F5E3")
    c.font = bold(10, "1E8449")
    c.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws3, "F", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')

# ══════════════════════════════════════════════════════════════════
# SHEET 4 – BACKEND DB / MODEL CLEANUP
# ══════════════════════════════════════════════════════════════════
ws4 = wb.create_sheet("4. DB & Backend Cleanup")
ws4.freeze_panes = "A3"
ws4.sheet_view.showGridLines = False

for letter, width in [("A",5),("B",34),("C",18),("D",40),("E",14),("F",14)]:
    ws4.column_dimensions[letter].width = width

header_row(ws4, 1,
    ["#","Collection / Code","Action","Why","Approve ✓","Priority"],
    DARK, height=30)

items_db = [
    ("MONGODB COLLECTIONS — REMOVE",),
    (1,  "Enquiry collection",          "Delete",   "All enquiries now stored as Orders with stage=enquiry; Enquiry table is dead","","High"),
    (2,  "Flow + FlowSession",          "Delete",   "Removing flow builder frontend; these collections unused","","High"),
    (3,  "BaileysAuthState + BaileysMessage","Delete","Removing Baileys WhatsApp; collections unused","","High"),
    (4,  "EmailHistory + GmailAccount", "Delete",   "Removing Gmail integration","","High"),
    (5,  "BankStatement",               "Delete",   "Removing bank reconciliation","","High"),
    (6,  "PurchaseOrder",               "Delete",   "Removing purchase order module","","Medium"),
    (7,  "CallLogs",                    "Delete",   "Removing call logs page","","Medium"),
    (8,  "DiaryDraft",                  "Delete",   "Removing diary upload","","Medium"),

    ("ORDER MODEL — FIELD CLEANUP",),
    (9,  "Order.Status[]  (array field)","Remove",  "Legacy; replaced by Order.stage (string); every query must account for both — confusing","","High"),
    (10, "Order.vendorCustomerUuid",    "Remove",   "Old FK; standardise to vendorUuid everywhere","","Medium"),
    (11, "Order.workflowSteps[]  (if empty for most orders)","Audit","Check if actively used; if <20% orders have data, remove","","Medium"),

    ("CODE QUALITY",),
    (12, "API naming: /GetOrderList, /GetDeliveredList","Rename to kebab-case","/get-order-list is inconsistent; rename to /orders, /delivered-orders","","Low"),
    (13, "Error response format inconsistency","Standardize","Mix of {success,message} and {status,message}; pick one schema","","Low"),
    (14, "Hardcoded 'Sai' as default assignee","Remove","Replace with null or first available user","","Medium"),
    (15, "Pagination on /api/orders/all-data","Add","Missing pagination causes slow load on large datasets","","High"),
]

row = 2
alt = False
for item in items_db:
    if len(item) == 1:
        section_header(ws4, row, f"  ▶  {item[0]}", ORANGE, 6)
        row += 1
        continue
    data_row(ws4, row, list(item), alt)
    c = ws4.cell(row=row, column=5)
    c.fill = hfill("D5F5E3")
    c.font = bold(10, "1E8449")
    c.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws4, "E", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')

# ══════════════════════════════════════════════════════════════════
# SHEET 5 – UI/UX NEW DESIGN SPEC
# ══════════════════════════════════════════════════════════════════
ws5 = wb.create_sheet("5. UI-UX New Design Spec")
ws5.freeze_panes = "A3"
ws5.sheet_view.showGridLines = False

for letter, width in [("A",22),("B",60),("C",14)]:
    ws5.column_dimensions[letter].width = width

header_row(ws5, 1, ["Component","New Design Spec","Approve ✓"], DARK, height=30)

ux_items = [
    ("Left Sidebar","6 items ONLY: Dashboard | Orders | Customers | Accounts | Reports | Settings (admin). Flat list, icon + label. No groups, no collapsible sections. Width 200px collapsed, 240px expanded.",""),
    ("Top Navbar","Left: hamburger + logo. Center: page title. Right: [+ New Order] primary button + bell icon + user avatar.",""),
    ("Right Sidebar","DELETE — replaced by top navbar actions",""),
    ("Mobile Bottom Nav","4 tabs: Dashboard | Orders | ➕ (add order) | Accounts. Sticky bottom. Remove Tasks & Chat.",""),
    ("Dashboard — KPI Row","5 tiles in one row: Today Orders (blue) | Ready (green) | Overdue (red, alert) | Collected ₹ (green) | Pending ₹ (orange). Tap any tile → filter orders.",""),
    ("Dashboard — Needs Attention","Max 5 items. Show: order# + customer + stage + days stuck + [→ Move] button. Red if overdue, yellow if 1-2 days. Empty state: ✅ All on track!",""),
    ("Dashboard — Pipeline","Horizontal stage count bar: Enquiry(n) → Quoted(n) → Approved(n) → Design(n) → Printing(n) → Post-Print(n) → Ready(n) → Delivered(n). Tap to filter kanban.",""),
    ("Add Order Form","6 fields: Customer (autocomplete), Item+Qty+Rate table (max 5 rows inline), Due Date (default +3 days), Priority (Low/Normal/Urgent chip), Advance Paid (yes/no + amount). Bottom: [Save as Enquiry] grey | [Save as Order] primary. No vendor section. No task groups.",""),
    ("Kanban Board","8 columns matching all stages. Card: #number · Customer name | Item summary (1 line) | Due: X days | ₹ amount | [→ Stage] button. Click card = order detail modal. No drag-drop (buttons only for stage advance).",""),
    ("Order Detail Modal","Read-only header (order#, customer, created date). Editable: due date, priority, note. Items table (edit qty/rate). Stage history timeline. [Mark Paid] button if delivered. [Print Invoice] button.",""),
    ("Accounts / Income-Expense Log","Two tabs: Income | Expenses. Simple table: Date | Category | Amount | Order# | Note. Top: totals — Income ₹X | Expenses ₹Y | Profit ₹Z. [+ Add Expense] button. Income auto-created from paid orders.",""),
    ("Reports — Orders","Filters: Date Range | Stage | Customer. Table columns: Order# | Customer | Items | Amount | Stage | Due Date | Assigned. Export Excel button.",""),
    ("Reports — Collections","Filters: Date Range | Type (Income/Expense). Summary: Total In | Total Out | Net. Table: Date | Type | Category | Amount | Order# | Note. Export Excel.",""),
    ("Notifications","Bell icon in top navbar. Dropdown list: overdue orders, payment reminders, stage changes. Badge count. Mark all read.",""),
    ("Colour Theme","Primary: Deep blue #2C3E50. Accent: Orange #E67E22. Success: Green #27AE60. Danger: Red #C0392B. Background: #F8F9FA. Cards: White with subtle shadow.",""),
    ("Typography","Headings: 600 weight, 16-20px. Body: 400 weight, 14px. Captions: 12px grey. Font: Inter or system-ui.",""),
    ("Spacing / Density","Comfortable density (not compact). Card padding 16px. Table row height 44px. Mobile tap targets min 44px.",""),
]

row = 2
alt = False
for comp, spec, approve in ux_items:
    ws5.row_dimensions[row].height = 50
    bg = LGREY if alt else WHITE
    for col, val in enumerate([comp, spec, approve], 1):
        c = ws5.cell(row=row, column=col, value=val)
        c.fill   = hfill(bg)
        c.border = thin_border()
        c.alignment = left()
        if col == 1:
            c.font = bold(10, DARK)
        else:
            c.font = normal()
        if col == 3:
            c.fill = hfill("D5F5E3")
            c.font = bold(10,"1E8449")
            c.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws5, "C", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')

# ══════════════════════════════════════════════════════════════════
# SHEET 6 – EXECUTION ROADMAP
# ══════════════════════════════════════════════════════════════════
ws6 = wb.create_sheet("6. Execution Roadmap")
ws6.freeze_panes = "A3"
ws6.sheet_view.showGridLines = False

for letter, width in [("A",6),("B",28),("C",18),("D",45),("E",16),("F",14),("G",14)]:
    ws6.column_dimensions[letter].width = width

header_row(ws6, 1,
    ["Phase","Phase Name","Files Changed","Tasks","Est. Effort","Approve ✓","Status"],
    DARK, height=30)

roadmap = [
    ("Phase 1 — Delete",),
    ("1","Delete dead code","~25 frontend pages, ~12 backend routes, ~8 DB models","Remove Baileys, Gmail, FlowBuilder, BankReconciliation, TrialBalance, CallLogs, DiaryUpload, legacy WA, 14 reports, SopPage, WorkflowTemplates, PurchaseOrder. Update App.jsx routes.","1-2 days","","⬜ Pending"),
    ("Phase 2 — Navigation",),
    ("2","Rebuild Sidebar + Navbar + Footer","Sidebar.jsx, TopNavbar.jsx, Footer.jsx, sidebarMenu.jsx (delete)","Flat 6-item sidebar, top quick-action bar, 4-tab mobile footer","0.5 day","","⬜ Pending"),
    ("Phase 3 — Dashboard",),
    ("3","Rebuild Dashboard","Dashboard.jsx, dashboard/ components folder","5 KPI tiles, Needs Attention section, Pipeline bar. Remove all panels/customization.","1 day","","⬜ Pending"),
    ("Phase 4 — Order Forms",),
    ("4","Rebuild Add Order + Order Update","addOrder1.jsx, OrderUpdate.jsx","6-field add order form, simplified edit form","1 day","","⬜ Pending"),
    ("Phase 5 — Kanban",),
    ("5","Simplify Kanban board","OrderKanban.jsx, OrderBoard.jsx, OrderCard.jsx","Simpler cards, [→ Stage] button, 8 columns, remove drag-drop","0.5 day","","⬜ Pending"),
    ("Phase 6 — Reports",),
    ("6","Rebuild Reports (17 → 3)","Reports/ folder","Orders Report, Collections Report, Customer Report","1 day","","⬜ Pending"),
    ("Phase 7 — Accounts",),
    ("7","Simplify Accounts","DayBook.jsx, Accounts routes","Replace with simple Income/Expense log","0.5 day","","⬜ Pending"),
    ("Phase 8 — Automation",),
    ("8","Add backend automation","orderLifecycleController.js, messageScheduler.js, whatsappTemplates.js","Auto WA on stage change, payment reminders, daily owner summary, auto income entry","1 day","","⬜ Pending"),
    ("Phase 9 — DB Cleanup",),
    ("9","Clean DB models","repositories/ folder, migration script","Remove unused collections, remove Status[] array from Order model, add pagination","0.5 day","","⬜ Pending"),
    ("Phase 10 — QA",),
    ("10","End-to-end testing","All changed files","Test golden path: Create order → advance stages → verify WA sent → mark paid → check reports. Time it: target <2 min order creation.","0.5 day","","⬜ Pending"),
]

row = 2
alt = False
for item in roadmap:
    if len(item) == 1:
        section_header(ws6, row, f"  ▶  {item[0]}", DARK, 7)
        row += 1
        continue
    ws6.row_dimensions[row].height = 50
    bg = LGREY if alt else WHITE
    for col, val in enumerate(list(item), 1):
        c = ws6.cell(row=row, column=col, value=val)
        c.fill = hfill(bg)
        c.font = normal()
        c.border = thin_border()
        c.alignment = left()
    c6 = ws6.cell(row=row, column=6)
    c6.fill = hfill("D5F5E3"); c6.font = bold(10,"1E8449"); c6.alignment = center()
    c7 = ws6.cell(row=row, column=7)
    c7.fill = hfill("EBF5FB"); c7.font = normal(10, "2471A3"); c7.alignment = center()
    alt = not alt
    row += 1

add_dropdown(ws6, "F", 2, row - 1, '"✅ Yes,⏭ Skip,❓ Later"')
add_dropdown(ws6, "G", 2, row - 1, '"⬜ Pending,🔄 In Progress,✅ Done,⏸ On Hold"')

# ── save ────────────────────────────────────────────────────────
out = "/home/user/MIS-Both-/MIS_Reconstruction_Plan.xlsx"
wb.save(out)
print(f"Saved: {out}")
