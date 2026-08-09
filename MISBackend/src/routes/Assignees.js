const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Customers = require('../repositories/customer');
const Orders = require('../repositories/order');
const Transaction = require('../repositories/transaction');
const { CLOSED_STAGES } = require('../constants/orderStages');
const { ACCOUNT_PAYABLE_GROUP } = require('../constants/assignees');
const logger = require('../utils/logger');

router.use(requireAuth);

// "Account Payable" is a real, admin-maintained Customer_group this business
// already uses to mean "money we owe" — it covers vendors, freelancers,
// contractors, and even employees paid this way. It is NOT the same as the
// separate, mostly auto-populated vendor_masters collection (background jobs
// write junk/customer names into that one with no review), so external
// assignees are sourced from Customers here, not VendorMaster.

// The assign menu and Team & Partners report both list Account Payable
// parties ONLY — employees are deliberately excluded here (they're assigned
// through the office-staff default-assignment flow elsewhere, and tracked
// on the Workflow board's "By User" tab / My Tasks, not through this
// picker). A party only appears once an admin has explicitly tagged it
// with at least one stage capability — that tag is both "yes, this is a
// real assignable person" and "here's which stage they work."
router.get('/', async (_req, res) => {
  try {
    const payableParties = await Customers.find(
      { Status: 'active', Customer_group: ACCOUNT_PAYABLE_GROUP, 'Capabilities.0': { $exists: true } },
      { Customer_name: 1, Mobile_number: 1, Capabilities: 1 }
    ).sort({ Customer_name: 1 }).lean();

    // Activity stats per party — some Account Payable parties get 1-5 tasks
    // a day, others go 2-3 months without a single one. One task list can't
    // tell the two apart, so every payable party here carries how many
    // orders it's ever been assigned and when it last was, computed across
    // ALL orders (not just pending) so a dormant party still reads as
    // dormant even after its old orders closed out.
    const payableIds = payableParties.map((c) => c._id);
    const activityRows = payableIds.length
      ? await Orders.aggregate([
          { $match: { assignedToType: 'vendor', assignedTo: { $in: payableIds } } },
          { $group: { _id: '$assignedTo', lastActivityAt: { $max: '$updatedAt' }, taskCount: { $sum: 1 } } },
        ])
      : [];
    const activityById = new Map(activityRows.map((row) => [String(row._id), row]));

    const externals = payableParties.map((c) => {
      const activity = activityById.get(String(c._id));
      return {
        id: String(c._id),
        name: c.Customer_name,
        type: 'payable',
        mobile: c.Mobile_number || '',
        role: 'Account Payable',
        capabilities: c.Capabilities || [],
        lastActivityAt: activity?.lastActivityAt || null,
        taskCount: activity?.taskCount || 0,
      };
    });

    res.json({ success: true, result: externals });
  } catch (error) {
    logger.error('Error fetching assignees:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch assignees' });
  }
});

// Per-person "what do they have on, what do we owe them" report — the
// person picker on the Team & Partners report screen calls this after
// GET / resolves which type/id was picked. Pending/recent work is read off
// order.assignedTo + assignedToType (set by assignOrderToUser), so it's an
// exact id match rather than a fragile name lookup. Billing only applies to
// non-employee types since employees are salaried, not billed per job.
router.get('/:type/:id/report', async (req, res) => {
  try {
    // 'vendor' is the order-schema's generic label for "not an employee" —
    // covers the Account Payable customer here (see assignOrderToUser).
    const type = req.params.type === 'vendor' ? 'vendor' : 'user';
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'id is required' });

    const orders = await Orders.find(
      { assignedTo: id, assignedToType: type },
      { Order_Number: 1, Order_uuid: 1, stage: 1, dueDate: 1, Status: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 }).limit(200).lean();

    const pending = [];
    const recent = [];
    for (const order of orders) {
      const latest = Array.isArray(order.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
      const row = {
        orderId: String(order._id),
        orderNumber: order.Order_Number,
        stage: order.stage,
        task: latest?.Task || order.stage || 'Task',
        dueDate: order.dueDate,
        updatedAt: order.updatedAt,
      };
      if (!CLOSED_STAGES.has(String(order.stage || '').toLowerCase())) pending.push(row);
      else recent.push(row);
    }

    let billing = null;
    if (type === 'vendor') {
      // Same debit/credit-by-Account_id logic as the Outstanding Report
      // (MISFrontend/src/Reports/outstandingReport.jsx) — that's the real,
      // trusted accounts-payable/receivable ledger this business already
      // uses, keyed off Customer_uuid via Transaction.Journal_entry, not a
      // separate ad-hoc ledger.
      const customerDoc = await Customers.findById(id).select('Customer_uuid').lean();
      if (customerDoc?.Customer_uuid) {
        const transactions = await Transaction.find(
          { 'Journal_entry.Account_id': customerDoc.Customer_uuid },
          { Journal_entry: 1 }
        ).lean();
        let debit = 0;
        let credit = 0;
        for (const tx of transactions) {
          for (const entry of tx.Journal_entry || []) {
            if (entry.Account_id !== customerDoc.Customer_uuid) continue;
            if (entry.Type === 'Debit') debit += Number(entry.Amount || 0);
            else if (entry.Type === 'Credit') credit += Number(entry.Amount || 0);
          }
        }
        const balance = debit - credit; // >0 they owe us, <0 we owe them
        billing = {
          totalDebit: debit,
          totalCredit: credit,
          balance: Math.abs(balance),
          balanceNature: balance < 0 ? 'payable' : balance > 0 ? 'receivable' : 'settled',
        };
      }
    }

    res.json({ success: true, result: { pending, recent: recent.slice(0, 20), billing } });
  } catch (error) {
    logger.error('Error building assignee report:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to build assignee report' });
  }
});

module.exports = router;
