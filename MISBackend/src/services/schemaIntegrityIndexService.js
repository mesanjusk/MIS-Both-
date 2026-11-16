const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { auditProductionDuplicates } = require('./productionDuplicateAudit');

/**
 * Install partial uniqueness guards for keys used by active write paths.
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
      collection: 'transactions',
      keys: { Event_key: 1 },
      options: {
        unique: true,
        partialFilterExpression: { Event_key: { $type: 'string' } },
        name: 'Event_key_unique',
      },
    },
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
      if (spec.options.name === 'Event_key_unique' && err.code === 11000) {
        logger.error({ code: err.code, index: spec.options.name }, 'Duplicate journal events blocked the unique index');
        auditProductionDuplicates(db.db).then((summary) => {
          logger.info(summary, 'Production duplicate audit counts');
        }).catch((error) => {
          logger.error({ code: error.code, codeName: error.codeName }, 'Production duplicate audit failed');
        });
      } else {
        logger.error({ err, index: spec.options.name, collection: spec.collection }, 'Schema integrity index creation failed');
      }
    }
  }

  if (created.length) logger.info({ indexes: created }, 'Schema integrity indexes ready');
  return { created, failed };
}

module.exports = { ensureSchemaIntegrityIndexes };
