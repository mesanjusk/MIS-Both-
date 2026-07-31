const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const { getStockSummary } = require('../services/inventoryService');

// GET /stock/summary — current qty per stock-tracked item, computed from
// Items.openingStock + StockMovement (the one real, actively-written stock
// ledger). Previously read from StockLedger, which had zero writers
// anywhere and always returned empty.
router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  try {
    const items = await getStockSummary();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
