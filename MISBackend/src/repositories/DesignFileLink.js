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

    // Stage when last seen (stageNumber = subfolder leading digit 1-6)
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

    // Assignment — set when someone is assigned to this file, whether or not
    // it has a real order yet (draft files can be assigned too). New
    // assignments always go to Account Payable parties (Customers), not
    // employees — see MISBackend/src/routes/Assignees.js — but the ref stays
    // 'Users' as a populate hint only, since older rows point there; which
    // collection assignedTo actually points into is read off assignedToType.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      default: null,
    },
    assignedToType: {
      type: String,
      enum: ['user', 'vendor'],
      default: 'user',
    },
    assignedToName: {
      type: String,
      default: null,
    },
    assignedBy: {
      type: String,
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },

    // ── Activity tracking (when was this file first/last seen, how long in
    // its current stage) — powers the "not yet finalized" aging view.
    firstSeenAt: {
      type: Date,
      default: null,
    },
    stageEnteredAt: {
      type: Date,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    // Every stage the file has passed through, in order.
    fileStageHistory: {
      type: [
        {
          stageNumber: Number,
          stageLabel: String,
          enteredAt: Date,
        },
      ],
      default: [],
    },

    // ── Customer proof / approval cycle ──────────────────────────────────
    // none = no proof sent yet; awaiting_response = sent, waiting on customer;
    // changes_requested = customer asked for a revision; approved = customer
    // signed off (does not by itself confirm the order — that is still the
    // separate confirm-final step).
    proofStatus: {
      type: String,
      enum: ['none', 'awaiting_response', 'changes_requested', 'approved'],
      default: 'none',
      index: true,
    },
    proofRevisionCount: {
      type: Number,
      default: 0,
    },
    lastProofSentAt: {
      type: Date,
      default: null,
    },
    lastProofSentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      default: null,
    },
    lastCustomerResponseAt: {
      type: Date,
      default: null,
    },
    // Internal follow-up nudge sent to the designer/assignee when a customer
    // hasn't responded to a proof in time.
    lastNudgeAt: {
      type: Date,
      default: null,
    },
    nudgeCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

DesignFileLinkSchema.index({ orderUuid: 1 });
DesignFileLinkSchema.index({ linkStatus: 1 });
DesignFileLinkSchema.index({ stageNumber: 1, linkStatus: 1 });
DesignFileLinkSchema.index({ proofStatus: 1 });

module.exports = mongoose.model('DesignFileLink', DesignFileLinkSchema);
