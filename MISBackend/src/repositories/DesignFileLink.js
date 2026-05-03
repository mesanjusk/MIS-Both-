/**
 * DesignFileLink.js
 *
 * Stores the one-time manual link between a Google Drive file
 * (in the designer's Daily folder) and an MIS order.
 *
 * Once linked, the system can track which stage/subfolder
 * the file is currently in without any manual input.
 */

const mongoose = require('mongoose');

const DesignFileLinkSchema = new mongoose.Schema(
  {
    // Google Drive file ID (stable — does not change when file is renamed or moved)
    driveFileId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // File name at time of linking (may drift if designer renames — that's OK)
    fileName: {
      type: String,
      default: null,
    },

    // Stage when linked (stageNumber = subfolder leading digit)
    stageNumber: {
      type: Number,
      default: null,
    },
    stageLabel: {
      type: String,
      default: null,
    },

    // MIS order reference
    orderUuid: {
      type: String,
      required: true,
      index: true,
    },
    orderNumber: {
      type: Number,
      default: null,
    },

    // Customer name as known at link time (for display, not matching)
    customerName: {
      type: String,
      default: null,
    },

    // Who linked it and when
    linkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      default: null,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Quickly find all files for an order
DesignFileLinkSchema.index({ orderUuid: 1 });

module.exports = mongoose.model('DesignFileLink', DesignFileLinkSchema);
