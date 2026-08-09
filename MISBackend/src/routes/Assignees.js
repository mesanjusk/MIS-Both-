const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Users = require('../repositories/users');
const VendorMaster = require('../repositories/vendorMaster');
const Orders = require('../repositories/order');
const VendorLedger = require('../repositories/vendorLedger');
const { CLOSED_STAGES } = require('../constants/orderStages');
const logger = require('../utils/logger');

router.use(requireAuth);

// One combined "who can this task be assigned to" list — in-house employees
// (Users) plus freelancers/vendors/contractors (VendorMaster), each tagged
// with a `type` and `capabilities` so the frontend can filter a single big
// list down to "who does design/print/postprint/delivery" per stage instead
// of showing everyone everywhere. Capabilities empty = unrestricted (shows
// on every stage) so nothing disappears from the assign menu until someone
// actually tags it.
router.get('/', async (_req, res) => {
  try {
    const [users, vendors] = await Promise.all([
      Users.find({}, { User_name: 1, Mobile_number: 1, User_group: 1, Capabilities: 1 }).sort({ User_name: 1 }).lean(),
      VendorMaster.find({ Active: true }, { Vendor_name: 1, Mobile_number: 1, Engagement_type: 1, Capabilities: 1 }).sort({ Vendor_name: 1 }).lean(),
    ]);

    const employees = users.map((u) => ({
      id: String(u._id),
      name: u.User_name,
      type: 'employee',
      mobile: u.Mobile_number || '',
      role: u.User_group || '',
      capabilities: u.Capabilities || [],
    }));

    const externals = vendors.map((v) => ({
      id: String(v._id),
      name: v.Vendor_name,
      type: v.Engagement_type || 'vendor',
      mobile: v.Mobile_number || '',
      role: '',
      capabilities: v.Capabilities || [],
    }));

    res.json({ success: true, result: [...employees, ...externals] });
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
      // Orders/report above are keyed by the vendor's Mongo _id (same id
      // space as employees), but the ledger (vendor_masters/vendor_ledger)
      // was built keyed by Vendor_uuid — resolve once here rather than
      // changing the ledger's join key everywhere it's already used.
      const vendorDoc = await VendorMaster.findById(id).select('Vendor_uuid').lean();
      const entries = vendorDoc ? await VendorLedger.find({ vendor_uuid: vendorDoc.Vendor_uuid }).lean() : [];
      let debit = 0;
      let credit = 0;
      for (const entry of entries) {
        const amount = Number(entry.amount || 0);
        if (entry.dr_cr === 'dr') debit += amount;
        else credit += amount;
      }
      const balance = credit - debit;
      billing = {
        totalPaid: debit,
        totalBilled: credit,
        balance: Math.abs(balance),
        balanceNature: balance >= 0 ? 'payable' : 'advance',
      };
    }

    res.json({ success: true, result: { pending, recent: recent.slice(0, 20), billing } });
  } catch (error) {
    logger.error('Error building assignee report:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to build assignee report' });
  }
});

module.exports = router;
