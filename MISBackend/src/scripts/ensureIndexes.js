/**
 * ensureIndexes.js
 *
 * Run this once after every production deployment to guarantee all Mongoose
 * schema indexes exist in MongoDB. Required because autoIndex is disabled in
 * production (mongo.js) to avoid blocking app startup on large collections.
 *
 * Usage:
 *   NODE_ENV=production node src/scripts/ensureIndexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/mongo');

// Import every model that declares indexes
require('../repositories/order');
require('../repositories/transaction');
require('../repositories/customer');
require('../repositories/users');
require('../repositories/items');
require('../repositories/vendorMaster');
require('../repositories/productionJob');
require('../repositories/vendorLedger');
require('../repositories/counter');

async function run() {
  await connectDB();

  const modelNames = Object.keys(mongoose.models);
  console.log(`Ensuring indexes for ${modelNames.length} models: ${modelNames.join(', ')}`);

  for (const name of modelNames) {
    try {
      await mongoose.models[name].createIndexes();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('ensureIndexes failed:', err);
  process.exit(1);
});
