jest.mock('../../src/repositories/transaction', () => ({}));
jest.mock('../../src/repositories/accounts', () => ({}));
jest.mock('../../src/repositories/customer', () => ({}));
jest.mock('../../src/repositories/vendorLedger', () => ({}));
jest.mock('../../src/repositories/diaryDraft', () => ({}));
jest.mock('../../src/repositories/bankStatement', () => ({}));
jest.mock('../../src/repositories/purchaseOrder', () => ({}));
jest.mock('../../src/repositories/order', () => ({}));
jest.mock('../../src/repositories/upiPaymentAttempt', () => ({ UpiPaymentAttempt: {} }));

const { journalProblem, orderTotal } = require('../../src/services/ledgerIntegrityService');

describe('ledgerIntegrityService pure checks', () => {
  test('accepts a balanced transaction whose totals match its journal', () => {
    expect(journalProblem({
      Total_Debit: 100,
      Total_Credit: 100,
      Journal_entry: [
        { Account_id: 'cash', Type: 'Debit', Amount: 100 },
        { Account_id: 'sales', Type: 'Credit', Amount: 100 },
      ],
    })).toBe('');
  });

  test('detects unbalanced and malformed journal rows', () => {
    expect(journalProblem({
      Total_Debit: 100,
      Total_Credit: 50,
      Journal_entry: [
        { Account_id: 'cash', Type: 'Debit', Amount: 100 },
        { Account_id: 'sales', Type: 'Credit', Amount: 50 },
      ],
    })).toMatch(/debit 100 != credit 50/);

    expect(journalProblem({
      Total_Debit: 1,
      Total_Credit: 1,
      Journal_entry: [
        { Account_id: '', Type: 'Debit', Amount: 1 },
        { Account_id: 'x', Type: 'Credit', Amount: 1 },
      ],
    })).toMatch(/no Account_id/);
  });

  test('uses the same positive-value priority as order accounting totals', () => {
    expect(orderTotal({ saleSubtotal: 250, Amount: 300 })).toBe(250);
    expect(orderTotal({ Items: [{ Amount: 40 }, { Amount: 60 }] })).toBe(100);
  });
});
