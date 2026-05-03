const express = require("express");
const Orders = require("../repositories/order");
const logger = require('../utils/logger');

const updateOrderStatus = async (orderId, newStatus) => {
  try {
    const order = await Orders.findById(orderId);
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    const currentStatusNumbers = order.Status.map(status => status.Status_number);
    const maxStatusNumber = Math.max(...currentStatusNumbers, 0);
    const nextStatusNumber = maxStatusNumber + 1;

    const updatedOrder = await Orders.findOneAndUpdate(
      { _id: orderId },
      { $push: { Status: { ...newStatus, Status_number: nextStatusNumber } } },
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
