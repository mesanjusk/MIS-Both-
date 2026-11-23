const mongoose = require("mongoose");

// SKU variants under the single existing Wedding Card item, NOT Items-master items.
// A stable composite _id enforces uniqueness even with production autoIndex off.
const WeddingCardRateSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // M:501 / K:901
  brand: { type: String, required: true, enum: ["M", "K"] },
  code: { type: String, required: true, match: /^\d{3,5}$/ },
  originalPrice: { type: Number, required: true, min: 0 },
  printingCharge: { type: Number, default: 0, min: 0 },
  packingCharge: { type: Number, default: 0, min: 0 },
  designCharge: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: "" },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("WeddingCardRate", WeddingCardRateSchema);
