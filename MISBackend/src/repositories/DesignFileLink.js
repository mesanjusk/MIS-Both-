/**
 * DesignFileLink.js
 *
 * Tracks every Google Drive design file — from first appearance as a draft
 * through confirmation as a real MIS order and on to the printing stage.
 *
 * Lifecycle:
 *   draft      → file seen in stage 1-7, no order assigned yet
 *   confirmed  → office confirmed in Final (stage 8), real order assigned
 *   printing   → file in stage 9, purchase order created
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

    // File name at time of last update
    fileName: {
      type: String,
      default: null,
    },

    // Stage when last seen (stageNumber = subfolder leading digit 1-9)
    stageNumber: {
      type: Number,
      default: null,
    },
    stageLabel: {
      type: String,
      default: null,
    },

    // draft | confirmed | printing
    linkStatus: {
      type: String,
      enum: ['draft', 'confirmed', 'printing'],
      default: 'draft',
      index: true,
    },

    // MIS order reference — null until confirmed in Final folder
    orderUuid: {
      type: String,
      default: null,
      index: true,
    },
    orderNumber: {
      type: Number,
      default: null,
    },

    // Customer details at confirmation time
    customerUuid: {
      type: String,
      default: null,
    },
    customerName: {
      type: String,
      default: null,
    },

    // Print job reference (set when file enters Printing stage)
    printJobId: {
      type: String,
      default: null,
    },
    printJobNumber: {
      type: Number,
      default: null,
    },

    // Who created this link and when
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

DesignFileLinkSchema.index({ orderUuid: 1 });
DesignFileLinkSchema.index({ linkStatus: 1 });

module.exports = mongoose.model('DesignFileLink', DesignFileLinkSchema);
