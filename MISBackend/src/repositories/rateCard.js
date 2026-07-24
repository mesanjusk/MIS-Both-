const mongoose = require("mongoose");

const slabSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 0 },
    maxQty: { type: Number, default: 0, min: 0 }, // 0 = no upper bound
    ratePerPiece: { type: Number, default: 0, min: 0 },
    flatPrice: { type: Number, default: 0, min: 0 }, // if > 0, overrides ratePerPiece * qty
  },
  { _id: false }
);

const RateCardSchema = new mongoose.Schema(
  {
    rateCard_uuid: { type: String, required: true, unique: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, default: "", trim: true },
    itemUuid: { type: String, default: "", trim: true },
    itemGroupUuid: { type: String, default: "", trim: true },
    pricingType: {
      type: String,
      enum: ["per_sqft", "per_piece", "slab"],
      default: "per_piece",
      required: true,
    },
    unit: { type: String, default: "Nos" },
    ratePerSqft: { type: Number, default: 0, min: 0 },
    minBillingSqft: { type: Number, default: 0, min: 0 },
    ratePerPiece: { type: Number, default: 0, min: 0 },
    minQty: { type: Number, default: 1, min: 0 },
    slabs: { type: [slabSchema], default: [] },
    gstPercent: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

RateCardSchema.index({ itemName: 1 });
RateCardSchema.index({ category: 1 });
RateCardSchema.index({ isActive: 1 });
RateCardSchema.index({ itemUuid: 1 });

module.exports = mongoose.model("RateCard", RateCardSchema);
