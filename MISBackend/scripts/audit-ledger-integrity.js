#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { auditLedgerIntegrity } = require('../src/services/ledgerIntegrityService');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

(async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI / MONGODB_URI / DATABASE_URL is not configured.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    const report = await auditLedgerIntegrity({ sampleLimit: 100 });
    console.log(JSON.stringify(report, null, 2));
    await mongoose.disconnect();
    process.exit(report.ok ? 0 : 2);
  } catch (error) {
    console.error('Ledger integrity audit failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
