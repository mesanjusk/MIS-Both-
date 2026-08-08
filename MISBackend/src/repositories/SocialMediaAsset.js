const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// A single uploaded media file (Cloudinary-hosted), reusable across
// multiple SocialPosts/platforms — never duplicated per-platform.
const SocialMediaAssetSchema = new mongoose.Schema(
  {
    assetUuid: { type: String, default: uuidv4, unique: true, index: true },

    kind: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true }, // Cloudinary secure_url
    thumbnailUrl: { type: String, default: null },
    publicId: { type: String, default: null }, // Cloudinary public_id (for deletion)
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    bytes: { type: Number, default: null },
    format: { type: String, default: null },

    // Provenance — where the asset came from, for "Add from Design Files" /
    // "Add from Google Drive" without duplicating the underlying file.
    source: { type: String, enum: ['upload', 'design_file', 'google_drive'], default: 'upload' },
    sourceRef: { type: String, default: null }, // driveFileId / DesignFileLink._id, etc.

    tags: { type: [String], default: [] },
    campaign: { type: String, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    createdByName: { type: String, default: null },

    // Bumped every time a SocialPost references this asset — powers the
    // "usage status" filter without a join.
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SocialMediaAssetSchema.index({ createdBy: 1, createdAt: -1 });
SocialMediaAssetSchema.index({ tags: 1 });
SocialMediaAssetSchema.index({ campaign: 1 });

module.exports = mongoose.model('SocialMediaAsset', SocialMediaAssetSchema);
