const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Customers = require("../repositories/customer");
const { v4: uuid } = require("uuid");
const Transaction = require("../repositories/transaction");
const Order = require("../repositories/order");
const { getCustomerTimeline } = require("../controllers/customerTimelineController");
const logger = require('../utils/logger');
const { resolve: resolveAccount, updateBalancesForJournal } = require('../services/accountRegistry');

const OPENING_BALANCE_SOURCE = 'opening:balance';

// Helper: compute default FY start date (April 1)
function fyStartDate() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(`${year}-04-01`);
}

// Helper: post (or replace) the opening balance transaction for a customer
async function postCustomerOpeningBalance({ customerUuid, customerName, amount, side, date, createdBy }) {
  // Delete any existing opening balance transaction for this customer
  const existing = await Transaction.find({ Source: OPENING_BALANCE_SOURCE, Customer_uuid: customerUuid }).lean();
  for (const txn of existing) {
    const reversedLines = (txn.Journal_entry || []).map((l) => ({
      ...l,
      Type: l.Type === 'Debit' ? 'Credit' : 'Debit',
    }));
    await updateBalancesForJournal(reversedLines).catch(() => {});
    await Transaction.deleteOne({ _id: txn._id });
  }

  if (!amount || amount <= 0) return;

  const contraAcct = await resolveAccount('Opening Balance');
  const txnDate = date ? new Date(date) : fyStartDate();

  const customerLine = { Account_id: customerUuid, Account_name: customerName, Type: side === 'debit' ? 'Debit' : 'Credit', Amount: amount };
  const contraLine   = { Account_id: contraAcct.uuid, Account_name: contraAcct.name, Type: side === 'debit' ? 'Credit' : 'Debit', Amount: amount };
  const Journal_entry = side === 'debit' ? [customerLine, contraLine] : [contraLine, customerLine];

  const last = await Transaction.findOne().sort({ Transaction_id: -1 }).lean();
  const nextId = Number(last?.Transaction_id || 0) + 1;

  const txn = await Transaction.create({
    Transaction_uuid: uuid(),
    Transaction_id: nextId,
    Transaction_date: txnDate,
    Description: `Opening balance — ${customerName}`,
    Total_Debit: amount,
    Total_Credit: amount,
    Payment_mode: 'Journal',
    Created_by: createdBy || 'system',
    Journal_entry,
    Customer_uuid: customerUuid,
    Source: OPENING_BALANCE_SOURCE,
  });

  await updateBalancesForJournal(Journal_entry).catch(() => {});
  return txn;
}

/* ----------------------- helpers ----------------------- */
const S = (v) => String(v ?? "").trim();
const normalizePartyRoles = (roles = []) => {
  const allowed = new Set(["customer", "vendor"]);
  const normalized = Array.isArray(roles)
    ? roles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter((role) => allowed.has(role))
    : [];

  return normalized.length ? [...new Set(normalized)] : ["customer"];
};

/* ----------------------------------------------------------------
   ADD: ALIAS for frontends expecting /customer/GetCustomerList
   Returns a minimal, stable shape and avoids heavy joins
----------------------------------------------------------------- */
router.use(requireAuth);

router.get("/GetCustomerList", async (req, res) => {
  try {
    const customers = await Customers.find({})
      .select({
        Customer_name: 1,
        Mobile_number: 1,
        Customer_group: 1,
        Status: 1,
        Customer_uuid: 1,
        Tags: 1,
        PartyRoles: 1,
      })
      .sort({ Customer_name: 1 })
      .lean();

    const result = (customers || []).map((c) => ({
      Customer_name: S(c?.Customer_name),
      Mobile: S(c?.Mobile_number),
      Balance: 0, // TODO: map real balance if you maintain it
      Group: S(c?.Customer_group || "Customer"),
      Status: typeof c?.Status === "number" ? c.Status : 1,
      Customer_uuid: S(c?.Customer_uuid),
    }));

    return res.json({ success: true, result });
  } catch (error) {
    logger.error("GetCustomerList error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error in GetCustomerList" });
  }
});

/* ----------------------------------------------------------------
   Add a new customer
----------------------------------------------------------------- */
router.post("/addCustomer", async (req, res) => {
  const {
    Customer_name,
    Mobile_number,
    Email,
    Customer_group,
    Status,
    Tags,
    PartyRoles,
    LastInteraction,
    Opening_balance,
    Opening_balance_type,
    Opening_balance_date,
  } = req.body;

  try {
    const name = S(Customer_name);
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Customer name is required" });
    }

    const check = await Customers.findOne({ Customer_name: name }).lean();
    if (check) {
      return res
        .status(400)
        .json({ success: false, message: "Customer name already exists" });
    }

    const mobile =
      Mobile_number && S(Mobile_number) !== "" ? S(Mobile_number) : null;

    const obAmount = Number(Opening_balance) || 0;
    const obType   = Opening_balance_type === 'credit' ? 'credit' : 'debit';
    const obDate   = Opening_balance_date ? new Date(Opening_balance_date) : null;

    const newCustomer = new Customers({
      Customer_name: name,
      Mobile_number: mobile,
      Email: S(Email || ''),
      Customer_group,
      Status,
      Tags,
      PartyRoles: normalizePartyRoles(PartyRoles),
      LastInteraction,
      Customer_uuid: uuid(),
      Opening_balance: obAmount,
      Opening_balance_type: obType,
      Opening_balance_date: obDate,
    });

    await newCustomer.save();

    if (obAmount > 0) {
      await postCustomerOpeningBalance({
        customerUuid: newCustomer.Customer_uuid,
        customerName: name,
        amount: obAmount,
        side: obType,
        date: obDate,
        createdBy: req.user?.userName || 'system',
      }).catch((err) => logger.error('Opening balance post error:', err));
    }

    return res
      .status(201)
      .json({ success: true, message: "Customer added successfully" });
  } catch (error) {
    logger.error("Error saving customer:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

/* ----------------------------------------------------------------
   Get all customers (with usage flags)
----------------------------------------------------------------- */
router.get("/GetCustomersList", async (req, res) => {
  try {
    const [customers, orders, transactions] = await Promise.all([
      Customers.find({}).lean(),
      Order.find({}, "Customer_uuid").lean(),
      Transaction.find({}, "Journal_entry Customer_uuid").lean(),
    ]);

    // Orders usage by Customer_uuid
    const usedFromOrders = new Set(
      (orders || []).map((o) => S(o?.Customer_uuid)).filter(Boolean)
    );

    // Transactions usage: either Transaction.Customer_uuid
    // or any Journal_entry[].Account_id equals Customer_uuid
    const usedFromTransactions = new Set();

    for (const tx of transactions || []) {
      const txCust = S(tx?.Customer_uuid);
      if (txCust) usedFromTransactions.add(txCust);

      const entries = Array.isArray(tx?.Journal_entry) ? tx.Journal_entry : [];
      for (const entry of entries) {
        const acc = S(entry?.Account_id);
        if (acc) usedFromTransactions.add(acc);
      }
    }

    const allUsed = new Set([...usedFromOrders, ...usedFromTransactions]);

    const result = (customers || []).map((cust) => {
      const uuid = S(cust?.Customer_uuid);
      return {
        ...cust,
        isUsed: uuid ? allUsed.has(uuid) : false,
      };
    });

    return res.json({ success: true, result });
  } catch (error) {
    logger.error("Error fetching customers:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

/* ----------------------------------------------------------------
   Check for duplicate customer name
----------------------------------------------------------------- */
router.get("/checkDuplicateName", async (req, res) => {
  try {
    const name = S(req.query?.name);
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Customer name is required" });
    }

    const existingCustomer = await Customers.findOne({
      Customer_name: name,
    }).lean();

    return res
      .status(200)
      .json({ success: true, exists: Boolean(existingCustomer) });
  } catch (error) {
    logger.error("Error in /checkDuplicateName:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

/* ----------------------------------------------------------------
   Get UUIDs that are linked (orders or transactions)
----------------------------------------------------------------- */
router.get("/GetLinkedCustomerIds", async (req, res) => {
  try {
    const orders = await Order.find({}, "Customer_uuid").lean();
    const transactions = await Transaction.find(
      {},
      "Customer_uuid Journal_entry"
    ).lean();

    const linkedSet = new Set();

    for (const o of orders || []) {
      const id = S(o?.Customer_uuid);
      if (id) linkedSet.add(id);
    }

    for (const t of transactions || []) {
      const id = S(t?.Customer_uuid);
      if (id) linkedSet.add(id);

      const entries = Array.isArray(t?.Journal_entry) ? t.Journal_entry : [];
      for (const e of entries) {
        const acc = S(e?.Account_id);
        if (acc) linkedSet.add(acc);
      }
    }

    const linkedCustomerIds = Array.from(linkedSet);
    return res.json({ success: true, linkedCustomerIds });
  } catch (err) {
    logger.error("Error fetching linked customer UUIDs:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server Error" });
  }
});

/* ----------------------------------------------------------------
   Get customer report (Status, Tags, LastInteraction)
----------------------------------------------------------------- */
router.get("/GetCustomerReport", async (req, res) => {
  try {
    const data = await Customers.find({}).lean();
    if ((data || []).length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No customers found" });
    }

    const report = data.map((customer) => ({
      Customer_name: S(customer?.Customer_name),
      Mobile_number: S(customer?.Mobile_number),
      Customer_group: S(customer?.Customer_group),
      Status: customer?.Status,
      Tags: Array.isArray(customer?.Tags) ? customer.Tags.join(", ") : "",
      LastInteraction: customer?.LastInteraction || "No interaction",
    }));

    return res.json({ success: true, result: report });
  } catch (error) {
    logger.error("Error generating customer report:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

router.get("/:id/timeline", getCustomerTimeline);

/* ----------------------------------------------------------------
   Get a specific customer by Mongo _id
----------------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const customer = await Customers.findById(id);
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    return res.status(200).json({ success: true, result: customer });
  } catch (error) {
    logger.error("Error fetching customer:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer",
      error: error.message,
    });
  }
});

/* ----------------------------------------------------------------
   Update a customer
----------------------------------------------------------------- */
router.patch("/:uuid/email", async (req, res) => {
  try {
    const updated = await Customers.findOneAndUpdate(
      { Customer_uuid: req.params.uuid },
      { $set: { Email: S(req.body.email || '') } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, message: 'Customer not found' });
    return res.json({ success: true });
  } catch (err) {
    logger.error('Patch customer email error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const {
    Customer_name,
    Mobile_number,
    Email,
    Customer_group,
    Status,
    Tags,
    PartyRoles,
    LastInteraction,
    Opening_balance,
    Opening_balance_type,
    Opening_balance_date,
  } = req.body;

  try {
    const obAmount = Opening_balance !== undefined ? Number(Opening_balance) || 0 : undefined;
    const obType   = Opening_balance_type === 'credit' ? 'credit' : 'debit';
    const obDate   = Opening_balance_date ? new Date(Opening_balance_date) : null;

    const updateFields = {
      Customer_name,
      Mobile_number,
      Email: S(Email || ''),
      Customer_group,
      Status,
      Tags,
      PartyRoles: normalizePartyRoles(PartyRoles),
      LastInteraction,
    };

    if (obAmount !== undefined) {
      updateFields.Opening_balance = obAmount;
      updateFields.Opening_balance_type = obType;
      updateFields.Opening_balance_date = obDate;
    }

    const updated = await Customers.findByIdAndUpdate(id, updateFields, { new: true });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    if (obAmount !== undefined) {
      await postCustomerOpeningBalance({
        customerUuid: updated.Customer_uuid,
        customerName: S(updated.Customer_name),
        amount: obAmount,
        side: obType,
        date: obDate,
        createdBy: req.user?.userName || 'system',
      }).catch((err) => logger.error('Opening balance update error:', err));
    }

    return res.json({ success: true, result: updated });
  } catch (error) {
    logger.error("Update customer error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ----------------------------------------------------------------
   Delete a customer
   - Prevent delete if linked via Orders (Customer_uuid)
   - Prevent delete if linked via Transactions (Customer_uuid)
   - Prevent delete if any Transaction.Journal_entry[].Account_id == Customer_uuid
----------------------------------------------------------------- */
router.delete("/DeleteCustomer/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    // Ensure customer exists and get its UUID
    const customer = await Customers.findById(customerId).lean();
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found." });
    }
    const cUuid = S(customer.Customer_uuid);
    if (!cUuid) {
      // No UUID: allow delete
      await Customers.findByIdAndDelete(customerId);
      return res.json({ success: true, message: "Customer deleted successfully." });
    }

    // Check links in Orders
    const isLinkedToOrder = await Order.exists({ Customer_uuid: cUuid });

    // Check direct link in Transactions
    const isLinkedToTransaction = await Transaction.exists({
      Customer_uuid: cUuid,
    });

    // Check Journal entries referencing this customer UUID as Account_id
    const isLinkedInJournal = await Transaction.exists({
      "Journal_entry.Account_id": cUuid,
    });

    if (isLinkedToOrder || isLinkedToTransaction || isLinkedInJournal) {
      return res.json({
        success: false,
        message:
          "Cannot delete: Customer linked with orders or transactions.",
      });
    }

    await Customers.findByIdAndDelete(customerId);
    return res.json({ success: true, message: "Customer deleted successfully." });
  } catch (error) {
    logger.error("Delete customer error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting customer.",
    });
  }
});


module.exports = router;
