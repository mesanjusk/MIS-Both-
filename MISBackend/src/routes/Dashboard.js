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
    const now = new Date();
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = new Date(`${fyYear}-04-01T00:00:00.000Z`);

    const result = await Transaction.aggregate([
      { $match: { Transaction_date: { $gte: fyStart } } },
      { $unwind: '$Journal_entry' },
      {
        $addFields: {
          acctKey: {
            $toLower: {
              $trim: {
                input: { $toString: { $ifNull: ['$Journal_entry.Account_id', { $ifNull: ['$Journal_entry.Account', ''] }] } }
              }
            }
          }
        }
      },
      { $match: { acctKey: 'bank' } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $eq: [{ $toLower: { $toString: '$Journal_entry.Type' } }, 'debit'] },
                { $ifNull: ['$Journal_entry.Amount', 0] },
                { $multiply: [-1, { $ifNull: ['$Journal_entry.Amount', 0] }] }
              ]
            }
          }
        }
      }
    ]);

    res.json({ closingBalance: result[0]?.total || 0, lastTransactionTime: new Date() });
  } catch (err) {
    logger.error('bank-book-summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to load bank book summary' });
  }
});

router.get('/trial-balance', async (_req, res) => {
  try {
    const now = new Date();
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = new Date(`${fyYear}-04-01T00:00:00.000Z`);

    const accounts = await Transaction.aggregate([
      { $match: { Transaction_date: { $gte: fyStart } } },
      { $unwind: '$Journal_entry' },
      {
        $addFields: {
          acctKey: {
            $trim: {
              input: { $toString: { $ifNull: ['$Journal_entry.Account_id', { $ifNull: ['$Journal_entry.Account', ''] }] } }
            }
          }
        }
      },
      { $match: { acctKey: { $ne: '' } } },
      {
        $group: {
          _id: '$acctKey',
          accountName: { $first: '$acctKey' },
          totalDebit: {
            $sum: {
              $cond: [
                { $eq: [{ $toLower: { $toString: '$Journal_entry.Type' } }, 'debit'] },
                { $ifNull: ['$Journal_entry.Amount', 0] },
                0
              ]
            }
          },
          totalCredit: {
            $sum: {
              $cond: [
                { $eq: [{ $toLower: { $toString: '$Journal_entry.Type' } }, 'credit'] },
                { $ifNull: ['$Journal_entry.Amount', 0] },
                0
              ]
            }
          }
        }
      },
      { $sort: { accountName: 1 } },
      { $project: { _id: 0, accountName: 1, totalDebit: 1, totalCredit: 1 } }
    ]);

    res.json({ accounts });
  } catch (err) {
    logger.error('trial-balance error:', err);
    res.status(500).json({ success: false, message: 'Failed to load trial balance' });
  }
});

const VALID_PERIODS = ['today', 'week', 'month'];

router.get('/:period', async (req, res) => {
  try {
    const period = String(req.params.period || 'today').toLowerCase();
    if (!VALID_PERIODS.includes(period)) {
      return res.status(400).json({ success: false, message: `Invalid period. Use one of: ${VALID_PERIODS.join(', ')}` });
    }
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
