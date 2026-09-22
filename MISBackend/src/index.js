require("dotenv").config();

// Validate required environment variables before anything else starts
const REQUIRED_ENV_VARS = ['MONGO_URI', 'ACCESS_TOKEN_SECRET'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require("helmet");
const http = require("http");
const connectDB = require("./config/mongo");
const compression = require("compression");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { uploadErrorHandler } = require("./middleware/uploadLimits");
const { drainPendingMetabspEvents } = require("./controllers/whatsappController");
const { requireAuth } = require("./middleware/auth");
const { apiUsageMiddleware } = require("./middleware/apiUsage");
const {
  featureToggleMiddleware,
  invalidate: invalidateFeatureToggles,
} = require("./middleware/featureToggle");
const corsOptions = require("./config/corsOptions");
const { generalLimiter } = require("./middleware/rateLimit");
const logger = require("./utils/logger");
const { getHealthPayload } = require("./utils/releaseInfo");

// Handle unhandled promise rejections — log and exit gracefully
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

// Routers
const Users = require("./routes/Users");
const Usergroup = require("./routes/Usergroup");
const Customers = require("./routes/Customer");
const Customergroup = require("./routes/Customergroup");
const MobileVisibility = require("./routes/MobileVisibility");
const Tasks = require("./routes/Task");
const Taskgroup = require("./routes/Taskgroup");
const Items = require("./routes/Items");
const Itemgroup = require("./routes/Itemgroup");
const RateCard = require("./routes/RateCard");
const Priority = require("./routes/Priority");
const Orders = require("./routes/Order");
const Enquiry = require("./routes/Enquiry");
const Payment_mode = require("./routes/Payment_mode");
const Transaction = require("./routes/Transaction");
const Attendance = require("./routes/Attendance");
const Vendors = require("./routes/Vendor");
const Assignees = require("./routes/Assignees");
const Note = require("./routes/Note");
const Usertasks = require("./routes/Usertask");
const OrderMigrate = require("./routes/OrderMigrate");
const paymentFollowupRouter = require("./routes/paymentFollowup");
const Dashboard = require("./routes/Dashboard");
const WhatsAppCloud = require("./routes/WhatsAppCloud");
const WhatsAppActionLogRouter = require("./routes/WhatsAppActionLog");
const Contacts = require("./routes/Contact");
const CallLogs = require("./routes/CallLogs");
const Chat = require("./routes/chat");
const webhookRouter = require("./routes/webhook");
const googleDriveOAuthRoutes = require("./routes/googleDriveOAuth");
// Legacy googleDriveToken route removed — use /api/google-drive instead
const FlowRouter = require("./routes/Flow");
const DesignFiles = require("./routes/DesignFiles");
const DriveFolderReport = require("./routes/driveFolderReport");
const BusinessReports = require("./routes/Reports");
const ApiUsageRouter = require("./routes/ApiUsage");
const UpiPayments = require("./routes/UpiPayments");
const BusinessOps = require("./routes/BusinessOps");
const WorkflowTemplate = require("./routes/workflowTemplate");
const PurchaseOrder = require("./routes/PurchaseOrder");
const Scheduler = require("./routes/Scheduler");
const Stock = require("./routes/Stock");
const { initScheduler, initTaskDigestScheduler, initProofFollowupScheduler } = require("./services/messageScheduler");
const { initAttendanceReminderScheduler } = require("./services/attendanceReminderScheduler");
const { getAnalytics, dispatchTextMessage, dispatchInteractiveButtons } = require("./controllers/whatsappController");
const { initSocket } = require("./socket");
const DiaryDraft = require("./routes/DiaryDraft");
const BankStatement = require("./routes/BankStatement");
const Gmail = require("./routes/Gmail");
const AccountsRouter = require("./routes/Accounts");
const SopRouter = require("./routes/sop");
const OperationsRouter = require("./routes/Operations");
const OfficeAiRouter = require("./routes/OfficeAI");
const { seedUserGroups } = require("./services/sopService");
const { ensureDefaultFeatureToggles } = require("./services/defaultFeatureToggleService");
const BusinessProfile = require("./routes/BusinessProfile");
const NetworkFileSettings = require("./routes/NetworkFileSettings");
const SanjuskApi = require("./routes/SanjuskApi");
const PublicInvoiceRouter = require("./routes/PublicInvoice");
const WorkflowAudit = require("./routes/WorkflowAudit");
const SocialAccountsRouter = require("./routes/SocialAccounts");
const SocialPostsRouter = require("./routes/SocialPosts");
const SocialCalendarRouter = require("./routes/SocialCalendar");
const SocialAssetsRouter = require("./routes/SocialAssets");
const SocialAnalyticsRouter = require("./routes/SocialAnalytics");
const SocialCampaignsRouter = require("./routes/SocialCampaigns");
const SocialOverviewRouter = require("./routes/SocialOverview");
const SocialProvidersRouter = require("./routes/SocialProviders");
const { initSocialPublishingScheduler } = require("./services/social/socialPublishingScheduler");
const { repairShadowPartyJournalLines } = require('./services/partyLedgerIntegrityService');
const { repairDuplicateCustomerOpeningBalances } = require('./services/openingBalanceIntegrityService');
const { auditStaffOutstandingMappings } = require('./services/staffLedgerAuditService');

/**
 * Re-run inbound WhatsApp deliveries that were recorded but never processed.
 *
 * The webhook stores each delivery before acknowledging it, so a crash or a
 * processing failure no longer loses the message — this is what picks those
 * rows back up.
 */
const INBOUND_RETRY_INTERVAL_MS = 60 * 1000;

function initInboundWebhookRetry() {
  const timer = setInterval(async () => {
    try {
      const processed = await drainPendingMetabspEvents();
      if (processed) {
        logger.info({ processed }, '[whatsapp] reprocessed pending inbound deliveries');
      }
    } catch (err) {
      logger.error({ err: err.message }, '[whatsapp] inbound retry sweep failed');
    }
  }, INBOUND_RETRY_INTERVAL_MS);

  // Never hold the process open for the sweep alone.
  if (timer.unref) timer.unref();
}

const app = express();
const server = http.createServer(app);
initSocket(server);

// ---------- Security middleware ----------
app.use(helmet({
  crossOriginEmbedderPolicy: false, // allow embedded resources (e.g. WhatsApp media)
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
}));
app.use(cors(corsOptions));

// Render and Vercel both put a proxy in front of this server, so req.ip is the
// proxy's address unless the hop count is declared. Without it the rate
// limiter groups every user behind one key. TRUST_PROXY names how many hops to
// trust; the default of 1 matches a single platform proxy. Set it to 0 when
// running with nothing in front, so a client cannot spoof X-Forwarded-For.
const trustProxyHops = Number(process.env.TRUST_PROXY ?? 1);
app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

// ---------- Core middleware ----------
app.use(
  express.json({
    limit: "5mb",
    verify: (_req, _res, buf) => { _req.rawBody = buf; },
  })
);
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Sanitization runs AFTER the body parsers: mounted before them it only ever
// saw the query string, so a JSON body carrying operator keys like $ne reached
// the routes untouched. The parsers have already captured rawBody above, so
// webhook HMAC verification still sees the bytes as sent.
//
// allowDots: true — otherwise mongo-sanitize deletes any key containing a
// literal ".", which strips Meta's hub.mode / hub.verify_token / hub.challenge
// webhook verification query params before they reach the route handler.
app.use(mongoSanitize({ allowDots: true }));

app.use(compression());

// ---------- General rate limit (all /api routes) ----------
app.use("/api", generalLimiter);

// ---------- API usage telemetry + switched-off endpoints ----------
// Usage is recorded on the way out (res 'finish'), so it must wrap the
// routers; the toggle guard answers on the way in, before any handler runs.
// Both sit after the rate limiter, so a throttled request is not counted as
// real traffic and cannot be mistaken for use of an endpoint.
app.use(apiUsageMiddleware);
app.use(featureToggleMiddleware);

// ---------- Health check ----------
// Adds `release` (the short deployed commit SHA) when the host provides one,
// so a deploy can be confirmed from outside. Nothing else about the
// environment is exposed here — see utils/releaseInfo.js.
app.get("/", (_req, res) => res.json(getHealthPayload()));

// ---------- API routes ----------
app.use("/api/users", Users);
app.use("/api/usergroup", Usergroup);
app.use("/api/customers", Customers);
app.use("/api/customergroup", Customergroup);
app.use("/api/mobile-visibility", MobileVisibility);
app.use("/api/tasks", Tasks);
app.use("/api/taskgroup", Taskgroup);
app.use("/api/items", Items);
app.use("/api/itemgroup", Itemgroup);
app.use("/api/rate-cards", RateCard);
app.use("/api/priority", Priority);
app.use("/api/orders", Orders);
app.use("/api/enquiry", Enquiry);
app.use("/api/payment_mode", Payment_mode);
app.use("/api/transaction", Transaction);
app.use("/api/attendance", Attendance);
app.use("/api/vendors", Vendors);
app.use("/api/assignees", Assignees);
app.use("/api/note", Note);
app.use("/api/usertasks", Usertasks);
app.use("/api/orders-migrate", OrderMigrate);
app.use("/api/paymentfollowup", paymentFollowupRouter);
app.use("/api/dashboard", Dashboard);
app.use("/api/whatsapp", WhatsAppCloud);
app.use("/api/whatsapp-action-log", WhatsAppActionLogRouter);
app.use("/api/contacts", Contacts);
app.use("/api/calllogs", CallLogs);
app.use("/api/upi", UpiPayments);
app.use("/api/business-control", BusinessOps);
app.use("/api/business-profile", BusinessProfile);
app.use("/api/network-files", NetworkFileSettings);
// Admin → API: the SanjuSK WhatsApp integration. The inbound half is not here
// — SanjuSK pushes to /webhook/metabsp, which authenticates by HMAC.
app.use("/api/sanjusk", SanjuskApi);
app.use("/api/public-invoices", PublicInvoiceRouter);
app.use("/api/workflow-audit", WorkflowAudit);
app.use("/api/workflow-templates", WorkflowTemplate);
app.use("/api/purchaseorder", PurchaseOrder);
app.use("/api/scheduler", Scheduler);
app.use("/api/stock", Stock);
app.use("/api/diary", DiaryDraft);
app.use("/api/bank-statement", BankStatement);
app.use("/api/accounts", AccountsRouter);
app.use("/api/sop", SopRouter);
app.use("/api/operations", OperationsRouter);
app.use("/api/office-ai", OfficeAiRouter);
app.use("/api/google-drive", googleDriveOAuthRoutes);
app.use("/api/gmail", Gmail);
app.use("/api", FlowRouter);
app.use("/api/design-files", DesignFiles);
app.use("/api/drive-folder-report", DriveFolderReport);
app.use("/api/reports", BusinessReports);
app.use("/api/api-usage", ApiUsageRouter);
app.use("/api/social/accounts", SocialAccountsRouter);
app.use("/api/social/posts", SocialPostsRouter);
app.use("/api/social/calendar", SocialCalendarRouter);
app.use("/api/social/assets", SocialAssetsRouter);
app.use("/api/social/analytics", SocialAnalyticsRouter);
app.use("/api/social/campaigns", SocialCampaignsRouter);
app.use("/api/social/overview", SocialOverviewRouter);
app.use("/api/social/providers", SocialProvidersRouter);
app.use("/api", Chat);

// ---------- WhatsApp webhook (no auth — Meta calls this directly) ----------
app.use("/webhook", webhookRouter);
app.get("/analytics", requireAuth, getAnalytics);

// ---------- Legacy path redirects (308 permanent) ----------
// These keep old clients working while you migrate them to /api/* paths.
//
// Use req.url, NOT req.path: inside app.use() req.url is the path after the
// mount point *including the query string*, while req.path drops it. Redirecting
// with req.path silently stripped every query parameter, so paginated calls like
// /order/GetBillListPaged?page=4&limit=50 landed on /api/orders/GetBillListPaged
// with no params and always returned page 1 ("Load more" kept re-fetching the
// first page).
//
// 308 rather than 301 so the method and body survive the redirect: a 301 lets
// clients rewrite POST/PUT/PATCH into GET, which would silently drop writes.
const legacyRedirect = (prefix) => (req, res) => res.redirect(308, `${prefix}${req.url}`);
app.use("/user", legacyRedirect("/api/users"));
app.use("/customer", legacyRedirect("/api/customers"));
app.use("/order", legacyRedirect("/api/orders"));
app.use("/orders", legacyRedirect("/api/orders"));
app.use("/items", legacyRedirect("/api/items"));
app.use("/vendors", legacyRedirect("/api/vendors"));
app.use("/paymentfollowup", legacyRedirect("/api/paymentfollowup"));

// ---------- Init DB + schedulers ----------
async function runLedgerIntegrityStartupTask() {
  const mode = String(process.env.LEDGER_INTEGRITY_STARTUP_MODE || '').trim().toLowerCase();
  if (!mode || mode === 'off' || mode === 'false' || mode === '0') return;

  try {
    if (mode === 'audit') {
      const { auditLedgerIntegrity } = require('./services/ledgerIntegrityService');
      const report = await auditLedgerIntegrity({ sampleLimit: 100 });
      logger.info({ report }, '[ledger-integrity-startup] AUDIT_RESULT');
      return;
    }

    if (mode === 'plan' || mode === 'repair') {
      const { repairLedgerIntegrity } = require('./services/ledgerRepairService');
      const report = await repairLedgerIntegrity({ apply: mode === 'repair' });
      logger.info(
        { report },
        `[ledger-integrity-startup] ${mode === 'repair' ? 'REPAIR_RESULT' : 'PLAN_RESULT'}`
      );
      return;
    }

    logger.error(
      { mode },
      '[ledger-integrity-startup] unsupported mode; expected audit, plan, repair, or off'
    );
  } catch (err) {
    logger.error(
      { mode, err: err?.message || err },
      '[ledger-integrity-startup] task failed'
    );
  }
}

(async () => {
  await connectDB();

  // Historical Diary/Bank Statement assignments could create a shadow chart-
  // of-accounts row with the same name as a customer (for example "SK Priyanka").
  // Repair those journal foreign keys before any reconciliation verification so
  // both sides of every posting appear in the correct party ledger.
  try {
    const partyRepair = await repairShadowPartyJournalLines();
    logger.info({ partyRepair }, '[party-ledger-startup-repair] RESULT');
  } catch (partyRepairError) {
    logger.error(
      { err: partyRepairError?.message || partyRepairError },
      '[party-ledger-startup-repair] failed'
    );
  }

  // A customer must have only one opening-balance posting. Legacy data can
  // contain duplicate rows for the same party/date/amount/side; remove only
  // those exact duplicates before the normal ledger-integrity audit runs.
  try {
    const openingBalanceRepair = await repairDuplicateCustomerOpeningBalances();
    logger.info({ openingBalanceRepair }, '[opening-balance-startup-repair] RESULT');
  } catch (openingBalanceRepairError) {
    logger.error(
      { err: openingBalanceRepairError?.message || openingBalanceRepairError },
      '[opening-balance-startup-repair] failed'
    );
  }

  // Read-only staff/outstanding audit. This verifies that every active
  // user's Attendance AccountID points at the same ledger entity used by the
  // Outstanding report, without changing any financial transaction.
  try {
    const staffLedgerAudit = await auditStaffOutstandingMappings();
    logger.info({ staffLedgerAudit }, '[staff-ledger-audit] RESULT');
  } catch (staffLedgerAuditError) {
    logger.error(
      { err: staffLedgerAuditError?.message || staffLedgerAuditError },
      '[staff-ledger-audit] failed'
    );
  }

  // Repair confirmed bank-statement rows only when the target bank ledger can
  // be proven from an explicit mapping, existing linked transaction, or a
  // confident statement/account-name match. This is idempotent and avoids the
  // old failure mode where confirmed rows existed but were posted to a hidden
  // generic Bank ledger instead of the visible bank account.
  try {
    const summary = await BankStatement.repairConfirmedBankStatementsWithEvidence?.();
    if (summary) logger.info({ summary }, '[bank-statement-startup-repair] RESULT');
  } catch (bankRepairError) {
    logger.error(
      { err: bankRepairError?.message || bankRepairError },
      '[bank-statement-startup-repair] failed'
    );
  }

  await runLedgerIntegrityStartupTask();
  try {
    const result = await ensureDefaultFeatureToggles();
    await invalidateFeatureToggles();
    if (result?.upsertedCount) {
      logger.info({ count: result.upsertedCount }, 'Default-off feature toggles created');
    }
  } catch (toggleError) {
    // Toggle seeding must never prevent the MIS from starting.
    logger.error({ err: toggleError }, 'Default-off feature toggle setup failed');
  }
  initScheduler();
  initTaskDigestScheduler();
  initProofFollowupScheduler();
  initAttendanceReminderScheduler({ sendText: dispatchTextMessage, sendButtons: dispatchInteractiveButtons });
  initSocialPublishingScheduler();
  initInboundWebhookRetry();

  // One-time migration: remove duplicate "Opening Balance" account and fix journal entries
  try {
    const Accounts = require('./repositories/accounts');
    const TransactionModel = require('./repositories/transaction');
    const { invalidateCache } = require('./services/accountRegistry');
    const OLD_OB_UUID = '45d3945d-949b-436d-b7f9-e11dac1a8eb7';
    const NEW_OB_UUID = '4cbfbba5-a50e-46fe-bd90-5877ea73e665';
    const dupAccount = await Accounts.findOne({ Account_uuid: OLD_OB_UUID }).lean();
    if (dupAccount) {
      const targetAccount = await Accounts.findOne({ Account_uuid: NEW_OB_UUID }).lean();
      if (targetAccount) {
        const txns = await TransactionModel.find({ 'Journal_entry.Account_id': OLD_OB_UUID }).lean();
        for (const txn of txns) {
          const updatedLines = txn.Journal_entry.map((l) =>
            l.Account_id === OLD_OB_UUID
              ? { ...l, Account_id: NEW_OB_UUID, Account_name: targetAccount.Account_name }
              : l
          );
          await TransactionModel.updateOne({ _id: txn._id }, { $set: { Journal_entry: updatedLines } });
        }
        await Accounts.deleteOne({ Account_uuid: OLD_OB_UUID });
        invalidateCache();
        logger.info(`[migration] Removed duplicate Opening Balance account. Fixed ${txns.length} transaction(s).`);
      }
    }
  } catch (migErr) {
    logger.error({ err: migErr.message }, '[migration] Opening balance UUID fix failed');
  }

  // Seed new office user groups if they don't exist
  seedUserGroups().catch((err) =>
    logger.error({ err: err.message }, '[sop] User group seed failed')
  );
})();

// ---------- Error handling ----------
app.use(notFound);
// Before the general handler: multer reports an oversized or over-count upload
// as its own error type, which would otherwise surface as an unexplained 500.
app.use(uploadErrorHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});
