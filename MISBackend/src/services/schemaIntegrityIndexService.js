const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { auditProductionDuplicates } = require('./productionDuplicateAudit');

// The accounts owner confirmed these same-day HMV cash postings are separate.
async function separateConfirmedCashEventKeys(collection) {
  const firstId = new mongoose.Types.ObjectId('6ac0d8101afeb94eb37cc9be');
  const secondId = new mongoose.Types.ObjectId('6ac0d8101afeb94eb37cc9c2');
  const replacementKey = 'confirmed-separate:' + secondId.toHexString();
  const first = { _id: firstId, Transaction_id: 2907 };
  const second = { _id: secondId, Transaction_id: 2908 };
  const cash = {
    Description: 'HMV',
    Payment_mode: 'Cash',
    Total_Debit: 1000,
    Transaction_date: {
      $gte: new Date('2026-10-01T00:00:00+05:30'),
      $lt: new Date('2026-10-02T00:00:00+05:30'),
    },
  };
  const rows = await collection.find({ ...cash, $or: [first, second] })
    .project({ _id: 0, Transaction_id: 1, Event_key: 1 }).toArray();
  const original = rows.find((row) => row.Transaction_id === 2907)?.Event_key;
  const current = rows.find((row) => row.Transaction_id === 2908)?.Event_key;
  if (typeof original !== 'string' || !original || original === replacementKey) return false;
  if (current === replacementKey) return true;
  if (current !== original || await collection.countDocuments({ Event_key: original }) !== 2) return false;
  if (await collection.findOne({ Event_key: replacementKey }, { projection: { _id: 1 } })) return false;

  const result = await collection.updateOne({ ...cash, ...second, Event_key: original }, {
    $set: { Event_key: replacementKey },
  });
  return result.modifiedCount === 1 ||
    Boolean(await collection.findOne({ ...cash, ...second, Event_key: replacementKey }, { projection: { _id: 1 } }));
}

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
      const collection = db.collection(spec.collection);
      const isTransactionIndex = spec.options.name === 'Event_key_unique';
      const verifiedCashPair = isTransactionIndex && await separateConfirmedCashEventKeys(collection);
      await collection.createIndex(spec.keys, spec.options);
      if (isTransactionIndex) {
        auditProductionDuplicates(db.db).then((summary) => {
          logger.info({ ...summary, verifiedCashPair }, 'Production duplicate audit counts');
        }).catch((error) => {
          logger.error({ code: error.code, codeName: error.codeName }, 'Production duplicate audit failed');
        });
      }
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
