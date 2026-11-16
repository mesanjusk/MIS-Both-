'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

async function summarize(collection, match, key) {
  const [summary] = await collection.aggregate([
    { $match: match },
    { $group: { _id: key, rows: { $sum: 1 } } },
    { $match: { rows: { $gt: 1 } } },
    {
      $group: {
        _id: null,
        groups: { $sum: 1 },
        affectedRows: { $sum: '$rows' },
        excessRows: { $sum: { $subtract: ['$rows', 1] } },
      },
    },
    { $project: { _id: 0 } },
  ], { allowDiskUse: true, maxTimeMS: 120000 }).toArray();
  return summary || { groups: 0, affectedRows: 0, excessRows: 0 };
}

async function audit() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI to a read-only database connection.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const transactions = db.collection('transactions');
  const diaryDrafts = db.collection('diarydrafts');
  const accounts = db.collection('accounts');
  const [eventKeys, diaryDays, accountNames, indexes] = await Promise.all([
    summarize(transactions, { Event_key: { $type: 'string', $ne: '' } }, '$Event_key'),
    summarize(diaryDrafts, { diary_date: { $type: 'date' } }, {
      $dateToString: { date: '$diary_date', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' },
    }),
    summarize(accounts, { Account_name: { $type: 'string', $regex: /\S/ }, Is_archived: { $ne: true } }, {
      $toLower: { $trim: { input: '$Account_name' } },
    }),
    transactions.indexes(),
  ]);
  console.log(JSON.stringify({
    duplicateTransactionEventKeys: eventKeys,
    repeatedDiaryDays: diaryDays,
    repeatedActiveAccountNames: accountNames,
    transactionEventKeyIndexes: indexes.filter(({ key }) => Object.hasOwn(key, 'Event_key')),
  }, null, 2));
}

audit().catch((error) => {
  console.error('Duplicate audit failed:', error.name, error.codeName || error.code || '');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
