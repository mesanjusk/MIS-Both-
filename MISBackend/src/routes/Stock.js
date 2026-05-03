const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const StockLedger = require('../repositories/stockLedger');

// GET /stock/summary — compute current qty per item from actual stock ledger entries
router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  try {
    const ledger = await StockLedger.find({}).lean();
    const map = {};
    for (const entry of ledger) {
      const itemUuid = entry.itemUuid || entry.Item_uuid || entry.itemId || 'unknown';
      if (!map[itemUuid]) {
        map[itemUuid] = {
          itemUuid,
          itemName: entry.itemName || entry.Item || entry.item || 'Unnamed Item',
          unit: entry.unit || entry.Unit || 'Nos',
          currentQty: 0,
          reorderLevel: Number(entry.reorderLevel || entry.Reorder_level || 5),
        };
      }
      map[itemUuid].currentQty += Number(entry.qtyIn || entry.QtyIn || 0) - Number(entry.qtyOut || entry.QtyOut || 0);
    }
    res.json({ items: Object.values(map).sort((a, b) => String(a.itemName).localeCompare(String(b.itemName))) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
