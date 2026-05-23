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
const { requireAuth } = require("./middleware/auth");
const corsOptions = require("./config/corsOptions");
const { generalLimiter } = require("./middleware/rateLimit");
const logger = require("./utils/logger");

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
const Tasks = require("./routes/Task");
const Taskgroup = require("./routes/Taskgroup");
const Items = require("./routes/Items");
const Itemgroup = require("./routes/Itemgroup");
const Priority = require("./routes/Priority");
const Orders = require("./routes/Order");
const Enquiry = require("./routes/Enquiry");
const Payment_mode = require("./routes/Payment_mode");
const Transaction = require("./routes/Transaction");
const Attendance = require("./routes/Attendance");
const Vendors = require("./routes/Vendor");
const Note = require("./routes/Note");
const Usertasks = require("./routes/Usertask");
const OrderMigrate = require("./routes/OrderMigrate");
const paymentFollowupRouter = require("./routes/paymentFollowup");
const Dashboard = require("./routes/Dashboard");
const WhatsAppCloud = require("./routes/WhatsAppCloud");
const Contacts = require("./routes/Contact");
const CallLogs = require("./routes/CallLogs");
const Chat = require("./routes/chat");
const webhookRouter = require("./routes/webhook");
const googleDriveOAuthRoutes = require("./routes/googleDriveOAuth");
// Legacy googleDriveToken route removed — use /api/google-drive instead
const FlowRouter = require("./routes/Flow");
const DesignFiles = require("./routes/DesignFiles");
const UpiPayments = require("./routes/UpiPayments");
const BusinessOps = require("./routes/BusinessOps");
const WorkflowTemplate = require("./routes/workflowTemplate");
const PurchaseOrder = require("./routes/PurchaseOrder");
const Scheduler = require("./routes/Scheduler");
const Stock = require("./routes/Stock");
const { initScheduler, initTaskDigestScheduler, initAutoPOScheduler } = require("./services/messageScheduler");
const { getAnalytics } = require("./controllers/whatsappController");
const { initSocket } = require("./socket");
const BaileysRouter = require("./routes/Baileys");
const DiaryDraft = require("./routes/DiaryDraft");
const BankStatement = require("./routes/BankStatement");
const Gmail = require("./routes/Gmail");
const AccountsRouter = require("./routes/Accounts");
const SopRouter = require("./routes/sop");
const { seedUserGroups } = require("./services/sopService");
const BusinessProfile = require("./routes/BusinessProfile");
const PublicInvoiceRouter = require("./routes/PublicInvoice");

const app = express();
const server = http.createServer(app);
initSocket(server);

// ---------- Security middleware ----------
app.use(helmet({
  crossOriginEmbedderPolicy: false, // allow embedded resources (e.g. WhatsApp media)
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
}));
app.use(cors(corsOptions));
app.use(mongoSanitize());

// ---------- Core middleware ----------
app.use(
  express.json({
    limit: "5mb",
    verify: (_req, _res, buf) => { _req.rawBody = buf; },
  })
);
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(compression());

// ---------- General rate limit (all /api routes) ----------
app.use("/api", generalLimiter);

// ---------- Health check ----------
app.get("/", (_req, res) => res.json({ ok: true, service: "MIS Backend" }));

// ---------- API routes ----------
app.use("/api/users", Users);
app.use("/api/usergroup", Usergroup);
app.use("/api/customers", Customers);
app.use("/api/customergroup", Customergroup);
app.use("/api/tasks", Tasks);
app.use("/api/taskgroup", Taskgroup);
app.use("/api/items", Items);
app.use("/api/itemgroup", Itemgroup);
app.use("/api/priority", Priority);
app.use("/api/orders", Orders);
app.use("/api/enquiry", Enquiry);
app.use("/api/payment_mode", Payment_mode);
app.use("/api/transaction", Transaction);
app.use("/api/attendance", Attendance);
app.use("/api/vendors", Vendors);
app.use("/api/note", Note);
app.use("/api/usertasks", Usertasks);
app.use("/api/orders-migrate", OrderMigrate);
app.use("/api/paymentfollowup", paymentFollowupRouter);
app.use("/api/dashboard", Dashboard);
app.use("/api/whatsapp", WhatsAppCloud);
app.use("/api/contacts", Contacts);
app.use("/api/calllogs", CallLogs);
app.use("/api/upi", UpiPayments);
app.use("/api/business-control", BusinessOps);
app.use("/api/business-profile", BusinessProfile);
app.use("/api/public-invoices", PublicInvoiceRouter);
app.use("/api/workflow-templates", WorkflowTemplate);
app.use("/api/purchaseorder", PurchaseOrder);
app.use("/api/scheduler", Scheduler);
app.use("/api/stock", Stock);
app.use("/api/diary", DiaryDraft);
app.use("/api/bank-statement", BankStatement);
app.use("/api/accounts", AccountsRouter);
app.use("/api/sop", SopRouter);
app.use("/api/google-drive", googleDriveOAuthRoutes);
app.use("/api/gmail", Gmail);
app.use("/api", FlowRouter);
app.use("/api/design-files", DesignFiles);
app.use("/api", Chat);

// ---------- Baileys (unofficial WhatsApp Web / QR-based) ----------
app.use("/api/baileys", BaileysRouter);

// ---------- WhatsApp webhook (no auth — Meta calls this directly) ----------
app.use("/webhook", webhookRouter);
app.get("/analytics", requireAuth, getAnalytics);

// ---------- Legacy path redirects (301 permanent) ----------
// These keep old clients working while you migrate them to /api/* paths
const legacyRedirect = (newPath) => (_req, res) => res.redirect(301, `/api${newPath || _req.path}`);
app.use("/user", (req, res) => res.redirect(301, `/api/users${req.path}`));
app.use("/customer", (req, res) => res.redirect(301, `/api/customers${req.path}`));
app.use("/order", (req, res) => res.redirect(301, `/api/orders${req.path}`));
app.use("/orders", (req, res) => res.redirect(301, `/api/orders${req.path}`));
app.use("/items", (req, res) => res.redirect(301, `/api/items${req.path}`));
app.use("/vendors", (req, res) => res.redirect(301, `/api/vendors${req.path}`));
app.use("/paymentfollowup", (req, res) => res.redirect(301, `/api/paymentfollowup${req.path}`));

// ---------- Init DB + schedulers ----------
(async () => {
  await connectDB();
  initScheduler();
  initTaskDigestScheduler();
  initAutoPOScheduler();

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

  // ── Baileys auto-connect ──────────────────────────────────────────────────
  // If saved WhatsApp Web credentials exist in MongoDB, reconnect automatically
  // on every server boot — no manual QR scan needed after a restart.
  const { autoConnectIfCredentialsExist } = require('./services/baileysService');
  autoConnectIfCredentialsExist().catch((err) =>
    logger.error({ err: err.message }, '[baileys] Auto-connect failed on boot')
  );
  // ─────────────────────────────────────────────────────────────────────────
})();

// ---------- Error handling ----------
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});
