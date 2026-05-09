const express = require("express");
const Orders = require("../repositories/order");
const logger = require('../utils/logger');

const updateOrderStatus = async (orderId, newStatus) => {
  try {
    // Aggregation pipeline update: Status_number is derived from $size of the
    // current array inside the same atomic write — no separate read, no race condition.
    const updatedOrder = await Orders.findOneAndUpdate(
      { _id: orderId },
      [{
        $set: {
          Status: {
            $concatArrays: [
              { $ifNull: ['$Status', []] },
              [{ ...newStatus, Status_number: { $add: [{ $size: { $ifNull: ['$Status', []] } }, 1] } }],
            ],
          },
        },
      }],
      { new: true }
    );

    if (updatedOrder) {
      return { success: true, result: updatedOrder };
    } else {
      return { success: false, message: 'Order not found' };
    }
  } catch (error) {
    logger.error('Error updating order status:', error);
    return { success: false, message: 'Error updating order status' };
  }
};

module.exports = {
  updateOrderStatus,
};
