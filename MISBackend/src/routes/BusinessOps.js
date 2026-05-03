const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const express = require('express');
const router = express.Router();
const {
  createQuickOrderWorkflow,
  moveOrderStage,
  markOrderReady,
  markOrderDelivered,
  receiveOrderPayment,
  assignVendorToOrder,
  payVendorForOrder,
  getBusinessControlSummary,
} = require('../services/businessWorkflowService');
const logger = require('../utils/logger');

function actorFromReq(req) {
  return req.user?.userName || req.user?.User_name || req.body?.createdBy || req.body?.Created_by || 'system';
}

function sendOk(res, result, message = 'OK') {
  return res.json({ success: true, message, result });
}

function sendError(res, error, fallback = 'Operation failed') {
  logger.error('[business-control]', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || fallback,
  });
}

// All business ops routes require authentication
router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  try {
    const summary = await getBusinessControlSummary();
    return res.json({ success: true, result: summary, ...summary });
  } catch (error) {
    return sendError(res, error, 'Failed to load business control summary');
  }
});

router.post('/orders/quick', async (req, res) => {
  try {
    const result = await createQuickOrderWorkflow({ ...req.body, createdBy: actorFromReq(req) });
    return sendOk(res, result, 'Quick order workflow created');
  } catch (error) {
    return sendError(res, error, 'Failed to create quick order');
  }
});

router.post('/orders/:orderUuid/stage', async (req, res) => {
  try {
    const result = await moveOrderStage({
      orderUuid: req.params.orderUuid,
      stage: req.body?.nextStage || req.body?.stage,
      assignedTo: req.body?.assignedTo || req.body?.assignedToName,
      note: req.body?.note,
      createdBy: actorFromReq(req),
    });
    return sendOk(res, result, 'Order stage moved');
  } catch (error) {
    return sendError(res, error, 'Failed to move order stage');
  }
});

router.post('/orders/:orderUuid/ready', async (req, res) => {
  try {
    const result = await markOrderReady({
      orderUuid: req.params.orderUuid,
      assignedTo: req.body?.assignedTo || 'Delivery',
      note: req.body?.note,
      createdBy: actorFromReq(req),
    });
    return sendOk(res, result, 'Order marked ready');
  } catch (error) {
    return sendError(res, error, 'Failed to mark order ready');
  }
});

router.post('/orders/:orderUuid/delivered', async (req, res) => {
  try {
    const result = await markOrderDelivered({
      orderUuid: req.params.orderUuid,
      deliveredBy: actorFromReq(req),
      note: req.body?.note,
    });
    return sendOk(res, result, 'Order marked delivered and invoice checked');
  } catch (error) {
    return sendError(res, error, 'Failed to mark order delivered');
  }
});

router.post('/orders/:orderUuid/payment', async (req, res) => {
  try {
    const result = await receiveOrderPayment({
      orderUuid: req.params.orderUuid,
      amount: req.body?.amount,
      paymentMode: req.body?.paymentMode || req.body?.Payment_mode || 'Cash',
      reference: req.body?.reference || req.body?.Upi_reference || '',
      narration: req.body?.narration || req.body?.note || '',
      createdBy: actorFromReq(req),
    });
    return sendOk(res, result, 'Payment received and accounting posted');
  } catch (error) {
    return sendError(res, error, 'Failed to receive payment');
  }
});

router.post('/orders/:orderUuid/vendor', async (req, res) => {
  try {
    const result = await assignVendorToOrder({
      orderUuid: req.params.orderUuid,
      vendorId: req.body?.vendorId || req.body?.vendorUuid || req.body?.Vendor_uuid,
      vendorName: req.body?.vendorName || req.body?.Vendor_name,
      amount: req.body?.amount,
      dueDate: req.body?.dueDate,
      note: req.body?.note,
      workType: req.body?.workType || req.body?.process || 'General',
      jobMode: req.body?.jobMode || 'jobwork_only',
      createdBy: actorFromReq(req),
    });
    return sendOk(res, result, 'Vendor assigned and payable checked');
  } catch (error) {
    return sendError(res, error, 'Failed to assign vendor');
  }
});

router.post('/vendors/:vendorId/payment', async (req, res) => {
  try {
    const result = await payVendorForOrder({
      vendorId: req.params.vendorId,
      orderUuid: req.body?.orderUuid || req.body?.Order_uuid || '',
      amount: req.body?.amount,
      paymentMode: req.body?.paymentMode || req.body?.Payment_mode || 'Cash',
      reference: req.body?.reference || '',
      narration: req.body?.narration || req.body?.note || '',
      createdBy: actorFromReq(req),
    });
    return sendOk(res, result, 'Vendor payment posted');
  } catch (error) {
    return sendError(res, error, 'Failed to post vendor payment');
  }
});

module.exports = router;
