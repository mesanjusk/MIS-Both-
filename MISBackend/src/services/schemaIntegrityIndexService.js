const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Create only indexes that use the new additive integrity-key fields.
 *
 * Historical records without these fields are excluded by partial filters, so
 * enabling the indexes cannot delete, merge, or rewrite legacy data. If an
 * unexpected conflict is present, the affected index is reported and startup
 * continues; the audit migration can then explain the conflicting rows.
 */
async function ensureSchemaIntegrityIndexes() {
  const db = mongoose.connection;
  if (db.readyState !== 1) return { created: [], failed: [] };

  const specs = [
    {
      collection: 'accounts',
      keys: { Account_name_key: 1 },
      options: {
        unique: true,
        partialFilterExpression: { Account_name_key: { $type: 'string' } },
        name: 'Account_name_key_unique',
      },
    },
    {
      collection: 'customers',
      keys: { Customer_identity_key: 1 },
      options: {
        unique: true,
        partialFilterExpression: { Customer_identity_key: { $type: 'string' } },
        name: 'Customer_identity_key_unique',
      },
    },
    {
      collection: 'users',
      keys: { User_identity_key: 1 },
      options: {
        unique: true,
        partialFilterExpression: { User_identity_key: { $type: 'string' } },
        name: 'User_identity_key_unique',
      },
    },
    {
      collection: 'attendances',
      keys: { Employee_uuid: 1, Business_day: 1 },
      options: {
        unique: true,
        partialFilterExpression: { Business_day: { $type: 'string' } },
        name: 'employee_business_day_unique',
      },
    },
  ];

  const created = [];
  const failed = [];

  for (const spec of specs) {
    try {
      await db.collection(spec.collection).createIndex(spec.keys, spec.options);
      created.push(`${spec.collection}.${spec.options.name}`);
    } catch (err) {
      failed.push({ index: `${spec.collection}.${spec.options.name}`, error: err.message });
      logger.error({ err, index: spec.options.name, collection: spec.collection }, 'Schema integrity index creation failed');
    }
  }

  if (created.length) logger.info({ indexes: created }, 'Schema integrity indexes ready');
  return { created, failed };
}

module.exports = { ensureSchemaIntegrityIndexes };
