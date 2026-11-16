'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const { auditProductionDuplicates } = require('../src/services/productionDuplicateAudit');

async function audit() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI to a read-only database connection.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  console.log(JSON.stringify(await auditProductionDuplicates(mongoose.connection.db), null, 2));
}

audit().catch((error) => {
  console.error('Duplicate audit failed:', error.name, error.codeName || error.code || '');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
