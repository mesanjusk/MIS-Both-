const mongoose = require('mongoose');

// Given an order id in any of its three accepted forms — a Mongo _id, a
// numeric Order_Number, or an Order_uuid — build the right Mongoose filter
// to find it. Shared so every service that resolves "an order id from a
// caller" (WhatsApp commands, business workflow, inventory, workflow
// templates) agrees on the same three forms.
function resolveOrderFilter(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
}

module.exports = { resolveOrderFilter };
