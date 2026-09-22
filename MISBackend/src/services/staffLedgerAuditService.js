const Users = require('../repositories/users');
const Accounts = require('../repositories/accounts');
const Customers = require('../repositories/customer');
const Transaction = require('../repositories/transaction');

const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const money2 = (value) => Number(Number(value || 0).toFixed(2));

function journalBalanceFor(entity, transactions) {
  if (!entity?.uuid) return 0;
  const normalSide = entity.kind === 'account'
    ? (String(entity.normalSide || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit')
    : 'debit';

  let total = 0;
  for (const tx of transactions || []) {
    for (const line of tx?.Journal_entry || []) {
      if (String(line?.Account_id || '') !== String(entity.uuid)) continue;
      const amount = Number(line.Amount || 0);
      const onNormalSide =
        (line.Type === 'Debit' && normalSide === 'debit') ||
        (line.Type === 'Credit' && normalSide === 'credit');
      total += onNormalSide ? amount : -amount;
    }
  }
  return money2(total);
}

const CUSTOMER_CONTROL_NAMES = new Set(['customer receivable', 'customer advance']);

function statementBalanceForCustomer(customerUuid, transactions) {
  const customerId = String(customerUuid || '').trim();
  if (!customerId) return 0;

  let total = 0;
  for (const tx of transactions || []) {
    const legs = Array.isArray(tx?.Journal_entry) ? tx.Journal_entry : [];
    const direct = legs.filter((line) => String(line?.Account_id || '').trim() === customerId);

    let customerLegs = direct;
    if (!customerLegs.length && String(tx?.Customer_uuid || '').trim() === customerId) {
      const control = legs.filter((line) => {
        const name = norm(line?.Account_name);
        const id = norm(line?.Account_id);
        return CUSTOMER_CONTROL_NAMES.has(name) || CUSTOMER_CONTROL_NAMES.has(id);
      });
      if (control.length) {
        customerLegs = control;
      } else {
        const amount = Number(tx?.Total_Debit || tx?.Total_Credit || 0);
        const source = norm(tx?.Source);
        if (Number.isFinite(amount) && amount > 0) {
          if (source === 'invoice' || source.startsWith('business:customer_invoice')) {
            customerLegs = [{ Type: 'Debit', Amount: amount }];
          } else if (
            source.startsWith('business:customer_receipt') ||
            source.startsWith('business:customer_advance')
          ) {
            customerLegs = [{ Type: 'Credit', Amount: amount }];
          }
        }
      }
    }

    for (const line of customerLegs) {
      const amount = Number(line?.Amount || 0);
      if (line?.Type === 'Debit') total += amount;
      else if (line?.Type === 'Credit') total -= amount;
    }
  }

  return money2(total);
}

async function auditStaffOutstandingMappings() {
  const [users, accounts, customers, transactions] = await Promise.all([
    Users.find({}).select('User_uuid User_name User_group AccountID operations.active').lean(),
    Accounts.find({}).select('Account_uuid Account_name Account_group Account_type Normal_balance_side Balance').lean(),
    Customers.find({}).select('Customer_uuid Customer_name Customer_group').lean(),
    Transaction.find({}).select('Transaction_uuid Customer_uuid Total_Debit Total_Credit Source Journal_entry').lean(),
  ]);

  const accountById = new Map(
    accounts.filter((row) => row.Account_uuid).map((row) => [String(row.Account_uuid), row])
  );
  const customerById = new Map(
    customers.filter((row) => row.Customer_uuid).map((row) => [String(row.Customer_uuid), row])
  );
  const customersByName = new Map();
  for (const customer of customers) {
    const key = norm(customer.Customer_name);
    if (!key || !customer.Customer_uuid) continue;
    const list = customersByName.get(key) || [];
    list.push(customer);
    customersByName.set(key, list);
  }

  const rows = users
    .filter((user) => user?.operations?.active !== false)
    .map((user) => {
      const accountId = String(user.AccountID || '').trim();
      const mappedAccount = accountId ? accountById.get(accountId) : null;
      const mappedCustomer = accountId ? customerById.get(accountId) : null;
      const mappedName = mappedCustomer?.Customer_name || mappedAccount?.Account_name || '';
      const candidateName = mappedName || user.User_name;
      const customerMatches = customersByName.get(norm(candidateName)) || [];
      const uniqueCustomer = customerMatches.length === 1 ? customerMatches[0] : null;

      let status = 'unmapped';
      if (mappedCustomer) status = 'mapped_to_customer';
      else if (mappedAccount && uniqueCustomer) status = 'mapped_to_account_but_matching_customer_exists';
      else if (mappedAccount) status = 'mapped_to_account_only';
      else if (accountId) status = 'mapped_id_missing';
      else if (uniqueCustomer) status = 'unmapped_but_matching_customer_exists';
      if (customerMatches.length > 1 && !mappedCustomer) status = 'ambiguous_customer_name';

      const mappedEntity = mappedCustomer
        ? { uuid: mappedCustomer.Customer_uuid, kind: 'customer' }
        : mappedAccount
          ? {
              uuid: mappedAccount.Account_uuid,
              kind: 'account',
              normalSide: mappedAccount.Normal_balance_side,
            }
          : null;
      const customerEntity = uniqueCustomer
        ? { uuid: uniqueCustomer.Customer_uuid, kind: 'customer' }
        : null;

      const attendanceLedgerBalance = mappedEntity
        ? mappedEntity.kind === 'customer'
          ? statementBalanceForCustomer(mappedEntity.uuid, transactions)
          : journalBalanceFor(mappedEntity, transactions)
        : null;
      const outstandingLedgerBalance = customerEntity
        ? statementBalanceForCustomer(customerEntity.uuid, transactions)
        : null;
      const statementLedgerBalance = uniqueCustomer
        ? statementBalanceForCustomer(uniqueCustomer.Customer_uuid, transactions)
        : null;

      return {
        user: user.User_name,
        group: user.User_group,
        accountId,
        mappedType: mappedCustomer ? 'customer' : mappedAccount ? 'account' : accountId ? 'missing' : 'none',
        mappedName: mappedName || null,
        mappedAccountGroup: mappedAccount?.Account_group || null,
        storedAccountBalance: mappedAccount ? money2(mappedAccount.Balance) : null,
        attendanceLedgerBalance,
        matchingCustomerCount: customerMatches.length,
        matchingCustomerUuid: uniqueCustomer?.Customer_uuid || null,
        matchingCustomerName: uniqueCustomer?.Customer_name || null,
        matchingCustomerGroup: uniqueCustomer?.Customer_group || null,
        outstandingLedgerBalance,
        statementLedgerBalance,
        attendanceVsOutstanding:
          attendanceLedgerBalance === null || outstandingLedgerBalance === null
            ? null
            : money2(attendanceLedgerBalance - outstandingLedgerBalance),
        attendanceVsStatement:
          attendanceLedgerBalance === null || statementLedgerBalance === null
            ? null
            : money2(attendanceLedgerBalance - statementLedgerBalance),
        outstandingVsStatement:
          outstandingLedgerBalance === null || statementLedgerBalance === null
            ? null
            : money2(outstandingLedgerBalance - statementLedgerBalance),
        status,
      };
    });

  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      if (row.attendanceVsStatement !== null && Math.abs(row.attendanceVsStatement) >= 0.01) {
        acc.attendanceStatementDifferences += 1;
      }
      if (row.outstandingVsStatement !== null && Math.abs(row.outstandingVsStatement) >= 0.01) {
        acc.outstandingStatementDifferences += 1;
      }
      return acc;
    },
    { total: 0, attendanceStatementDifferences: 0, outstandingStatementDifferences: 0 }
  );

  return { summary, rows };
}

module.exports = {
  auditStaffOutstandingMappings,
  journalBalanceFor,
  statementBalanceForCustomer,
};
