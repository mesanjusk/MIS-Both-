// Routers/Dashboard.js
const express = require('express');
const router = express.Router();
const Orders = require('../repositories/order');
const Transaction = require('../repositories/transaction');
const { requireAuth } = require('../middleware/auth');
const {
  getDashboardSummary,
  getOutstandingSummary,
  getStuckOrders,
  getDailyCashPosition,
  getCustomerAging,
  getCashBookSummary,
} = require('../controllers/dashboardSummaryController');
const logger = require('../utils/logger');

// All dashboard routes require authentication
router.use(requireAuth);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay   = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function getRange(period) {
  const now = new Date();
  if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) };

  if (period === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: startOfDay(monday), to: endOfDay(sunday) };
  }

  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: startOfDay(first), to: endOfDay(last) };
  }

  return { from: startOfDay(now), to: endOfDay(now) };
}

router.get('/summary', getDashboardSummary);
router.get('/outstanding-summary', getOutstandingSummary);
router.get('/stuck-orders', getStuckOrders);
router.get('/daily-cash-position', getDailyCashPosition);
router.get('/customer-aging', getCustomerAging);
router.get('/cash-book-summary', getCashBookSummary);

router.get('/bank-book-summary', async (_req, res) => {
  try {
    const txns = await Transaction.find({}).lean();
    let total = 0;
    for (const txn of txns) {
      for (const entry of (txn.Journal_entry || [])) {
        const acct = String(entry.Account_id || entry.Account || '').trim();
        if (acct.toLowerCase() === 'bank') {
          if (String(entry.Type).toLowerCase() === 'debit') total += Number(entry.Amount || 0);
          else total -= Number(entry.Amount || 0);
        }
      }
    }
    res.json({ closingBalance: total, lastTransactionTime: new Date() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trial-balance', async (_req, res) => {
  try {
    const txns = await Transaction.find({}).lean();
    const map = {};
    for (const txn of txns) {
      for (const entry of (txn.Journal_entry || [])) {
        const acct = String(entry.Account_id || entry.Account || '').trim();
        if (!acct) continue;
        if (!map[acct]) map[acct] = { accountName: acct, totalDebit: 0, totalCredit: 0 };
        const amt = Number(entry.Amount || 0);
        if (String(entry.Type).toLowerCase() === 'debit') map[acct].totalDebit += amt;
        else map[acct].totalCredit += amt;
      }
    }
    const accounts = Object.values(map).sort((a, b) => a.accountName.localeCompare(b.accountName));
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:period', async (req, res) => {
  try {
    const period = String(req.params.period || 'today').toLowerCase();
    const { from, to } = getRange(period);

    const [ordersCount, deliveredCount, txAgg] = await Promise.all([
      Orders.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      Orders.countDocuments({ Status: { $elemMatch: { Task: 'Delivered' } }, updatedAt: { $gte: from, $lte: to } }),
      Transaction.aggregate([
        { $match: { Transaction_date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: { $ifNull: ['$Total_Debit', 0] } },
            totalCredit:{ $sum: { $ifNull: ['$Total_Credit', 0] } },
          }
        }
      ])
    ]);

    const totals = txAgg[0] || { totalDebit: 0, totalCredit: 0 };

    res.json({
      success: true,
      period,
      range: { from, to },
      metrics: {
        orders: ordersCount,
        delivered: deliveredCount,
        receipts: totals.totalDebit || 0,
        payments: totals.totalCredit || 0,
      }
    });
  } catch (err) {
    logger.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Dashboard error' });
  }
});

module.exports = router;
