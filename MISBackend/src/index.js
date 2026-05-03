require("dotenv").config();
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
const PurchaseOrder = require("./routes/PurchaseOrder");
const Scheduler = require("./routes/Scheduler");
const Stock = require("./routes/Stock");
const { initScheduler, initTaskDigestScheduler } = require("./services/messageScheduler");
const { getAnalytics } = require("./controllers/whatsappController");
const { initSocket } = require("./socket");

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
app.use("/api/purchaseorder", PurchaseOrder);
app.use("/api/scheduler", Scheduler);
app.use("/api/stock", Stock);
app.use("/api/google-drive", googleDriveOAuthRoutes);
app.use("/api", FlowRouter);
app.use("/api/design-files", DesignFiles);
app.use("/api", Chat);

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
})();

// ---------- Error handling ----------
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});
