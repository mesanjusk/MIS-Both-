/**
 * Stores Baileys auth credentials in MongoDB so they survive Render redeploys.
 * Each document is a single key-value pair keyed by `dataKey`.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    dataKey:   { type: String, required: true, unique: true, index: true },
    dataValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'baileys_auth_states' }
);

module.exports = mongoose.model('BaileysAuthState', schema);
