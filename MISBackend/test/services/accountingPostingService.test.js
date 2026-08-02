require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Transaction = require('../../src/repositories/transaction');
const Accounts = require('../../src/repositories/accounts');
const accountRegistry = require('../../src/services/accountRegistry');
const {
  postBalancedTransaction,
  postCustomerAdvance,
  postCustomerInvoice,
  postCustomerReceipt,
  postVendorBill,
  postVendorPayment,
  postPurchase,
  postCashExpense,
  buildLine,
} = require('../../src/services/accountingPostingService');

// accountRegistry caches name->uuid in module-level memory, which the mongo
// helper's per-test collection wipe (test/helpers/mongoSetup.js) can't see —
// without this, a later test can resolve a cached uuid for an Accounts
// document that a previous test's cleanup already deleted.
beforeEach(() => {
  accountRegistry.invalidateCache();
});

describe('accountingPostingService.buildLine', () => {
  test('resolves an account name to a UUID, auto-creating the account', () => {
    return expect(buildLine('Cash', 'Debit', 100)).resolves.toMatchObject({
      Account_name: 'Cash',
      Type: 'Debit',
      Amount: 100,
    });
  });

  test('rejects a missing account identifier', async () => {
    await expect(buildLine('', 'Debit', 100)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects a non-positive amount', async () => {
    await expect(buildLine('Cash', 'Debit', 0)).rejects.toThrow(/greater than zero/i);
  });
});

describe('accountingPostingService.postBalancedTransaction', () => {
  test('writes a balanced Transaction document with an incrementing Transaction_id', async () => {
    const { transaction } = await postBalancedTransaction({
      amount: 250,
      debitAccount: 'Cash',
      creditAccount: 'Sales',
      description: 'Test sale',
    });
    expect(transaction.Total_Debit).toBe(250);
    expect(transaction.Total_Credit).toBe(250);
    expect(transaction.Journal_entry).toHaveLength(2);
    expect(transaction.Journal_entry[0].Type).toBe('Debit');
    expect(transaction.Journal_entry[1].Type).toBe('Credit');
  });

  test('assigns sequential Transaction_id values', async () => {
    const { transaction: first } = await postBalancedTransaction({ amount: 10, debitAccount: 'Cash', creditAccount: 'Sales' });
    const { transaction: second } = await postBalancedTransaction({ amount: 10, debitAccount: 'Cash', creditAccount: 'Sales' });
    expect(second.Transaction_id).toBe(first.Transaction_id + 1);
  });

  test('honors the duplicate guard: a second call with the same source+order returns the existing transaction', async () => {
    const orderUuid = uuid();
    const { transaction: first, existing: firstExisting } = await postBalancedTransaction({
      amount: 100,
      debitAccount: 'Cash',
      creditAccount: 'Sales',
      source: 'business:test_source',
      orderUuid,
      allowDuplicate: false,
    });
    expect(firstExisting).toBe(false);

    const { transaction: second, existing: secondExisting } = await postBalancedTransaction({
      amount: 999, // even a different amount should not create a second posting
      debitAccount: 'Cash',
      creditAccount: 'Sales',
      source: 'business:test_source',
      orderUuid,
      allowDuplicate: false,
    });
    expect(secondExisting).toBe(true);
    expect(String(second._id)).toBe(String(first._id));

    const count = await Transaction.countDocuments({ Source: 'business:test_source', Order_uuid: orderUuid });
    expect(count).toBe(1);
  });

  test('allowDuplicate: true (the default) posts a new transaction every time', async () => {
    const orderUuid = uuid();
    await postBalancedTransaction({ amount: 100, debitAccount: 'Cash', creditAccount: 'Sales', source: 'business:repeatable', orderUuid });
    await postBalancedTransaction({ amount: 100, debitAccount: 'Cash', creditAccount: 'Sales', source: 'business:repeatable', orderUuid });
    const count = await Transaction.countDocuments({ Source: 'business:repeatable', Order_uuid: orderUuid });
    expect(count).toBe(2);
  });
});

describe('business-event posting helpers', () => {
  test('postCustomerInvoice debits Customer Receivable and credits Sales, and cannot be posted twice for the same order', async () => {
    const orderUuid = uuid();
    const { transaction, existing } = await postCustomerInvoice({ amount: 1000, orderUuid, orderNumber: 5001 });
    expect(existing).toBe(false);
    const [debit, credit] = transaction.Journal_entry;
    expect(debit.Account_name).toBe('Customer Receivable');
    expect(debit.Type).toBe('Debit');
    expect(credit.Account_name).toBe('Sales');
    expect(credit.Type).toBe('Credit');

    const { existing: secondExisting } = await postCustomerInvoice({ amount: 1000, orderUuid, orderNumber: 5001 });
    expect(secondExisting).toBe(true);
  });

  test('postCustomerAdvance routes cash payments to the Cash account and credits Customer Advance', async () => {
    const { transaction } = await postCustomerAdvance({ amount: 300, paymentMode: 'Cash', orderUuid: uuid() });
    const [debit, credit] = transaction.Journal_entry;
    expect(debit.Account_name).toBe('Cash');
    expect(credit.Account_name).toBe('Customer Advance');
  });

  test('postCustomerReceipt routes UPI payments to the UPI account and credits Customer Receivable', async () => {
    const { transaction } = await postCustomerReceipt({ amount: 400, paymentMode: 'GPay', orderUuid: uuid() });
    const [debit, credit] = transaction.Journal_entry;
    expect(debit.Account_name).toBe('UPI');
    expect(credit.Account_name).toBe('Customer Receivable');
  });

  test('postVendorBill debits Job Work Expense and credits Vendor Payable, and cannot be posted twice for the same order', async () => {
    const orderUuid = uuid();
    const { existing: firstExisting, transaction } = await postVendorBill({ amount: 700, orderUuid });
    expect(firstExisting).toBe(false);
    const [debit, credit] = transaction.Journal_entry;
    expect(debit.Account_name).toBe('Job Work Expense');
    expect(credit.Account_name).toBe('Vendor Payable');

    const { existing: secondExisting } = await postVendorBill({ amount: 700, orderUuid });
    expect(secondExisting).toBe(true);
  });

  test('postVendorPayment debits Vendor Payable and credits the resolved payment account', async () => {
    const { transaction } = await postVendorPayment({ amount: 700, paymentMode: 'Bank Transfer', orderUuid: uuid() });
    const [debit, credit] = transaction.Journal_entry;
    expect(debit.Account_name).toBe('Vendor Payable');
    expect(credit.Account_name).toBe('Bank');
  });

  test('postPurchase debits Purchase by default and Stock when purchaseAccount is "stock"', async () => {
    const { transaction: purchaseTxn } = await postPurchase({ amount: 200, orderUuid: uuid() });
    expect(purchaseTxn.Journal_entry[0].Account_name).toBe('Purchase');

    const { transaction: stockTxn } = await postPurchase({ amount: 200, orderUuid: uuid(), purchaseAccount: 'stock' });
    expect(stockTxn.Journal_entry[0].Account_name).toBe('Stock');
  });

  test('postCashExpense debits the given expense account (or General Expense by default) and credits the payment account', async () => {
    const { transaction: defaultExpense } = await postCashExpense({ amount: 50, paymentMode: 'Cash' });
    expect(defaultExpense.Journal_entry[0].Account_name).toBe('General Expense');
    expect(defaultExpense.Journal_entry[1].Account_name).toBe('Cash');

    const { transaction: customExpense } = await postCashExpense({ amount: 50, paymentMode: 'Cash', expenseAccount: 'Courier' });
    expect(customExpense.Journal_entry[0].Account_name).toBe('Courier');
  });
});

describe('account auto-creation via posting', () => {
  test('posting through a brand-new account name creates it in the Accounts collection with sensible defaults', async () => {
    await postBalancedTransaction({ amount: 20, debitAccount: 'Cash', creditAccount: 'Sales' });
    const cash = await Accounts.findOne({ Account_name: 'Cash' }).lean();
    expect(cash).toBeTruthy();
    expect(cash.Account_type).toBe('Asset');
    expect(cash.Normal_balance_side).toBe('debit');
    expect(cash.Is_system).toBe(true);

    const sales = await Accounts.findOne({ Account_name: 'Sales' }).lean();
    expect(sales.Account_type).toBe('Income');
    expect(sales.Normal_balance_side).toBe('credit');
  });
});
