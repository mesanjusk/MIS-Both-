const fs = require('fs');
const path = require('path');

const src = (relative) =>
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', relative), 'utf8');

describe('financial write-path invariants', () => {
  test('outsourced order steps no longer write Transaction directly', () => {
    const code = src('routes/Order/stepsRouter.js');
    expect(code).toContain('upsertVendorBill');
    expect(code).toContain('reverseAndDeleteTransaction');
    expect(code).not.toMatch(/Transaction\.create\s*\(/);
    expect(code).not.toMatch(/lastTxn.*Transaction_id/);
  });

  test('vendor manual rows must create or verify a unified transaction', () => {
    const code = src('routes/Vendor.js');
    expect(code).toContain('postVendorLedgerEntry');
    expect(code).toContain("transaction_uuid does not reference an existing transaction");
    expect(code).toContain('transaction_uuid: transactionUuid');
  });

  test('vendor jobs link bills and advances and reverse stale postings', () => {
    const code = src('services/vendorJobService.js');
    expect(code).toContain('upsertVendorBill');
    expect(code).toContain('postVendorAdvance');
    expect(code).toContain('reverseAndDeleteTransaction');
    expect(code).toContain('transaction_uuid: transactionUuid');
    expect(code).toContain('transaction_uuid: advanceTxnUuid');
  });

  test('diary reopen reverses the old posting before reconfirmation', () => {
    const code = src('routes/DiaryDraft.js');
    expect(code).toContain('reverseAndDeleteTransaction({ Transaction_uuid: txnUuid })');
    expect(code).toContain('entry.transaction_uuid = null');
    expect(code).toContain('upsertBalancedTransaction');
  });

  test('bank confirmation reuses a matched diary transaction', () => {
    const code = src('routes/BankStatement.js');
    expect(code).toContain('Linked to matched Diary transaction');
    expect(code).toContain('upsertBalancedTransaction');
    expect(code).toContain('bank-owned postings reversed');
  });

  test('successful UPI status is ledger-gated', () => {
    const code = src('routes/UpiPayments.js');
    expect(code).toContain('ensureSuccessfulPaymentPosting');
    expect(code).toContain("status === 'success'");
    expect(code).not.toContain("if (Object.prototype.hasOwnProperty.call(req.body, 'transactionUuid'))");
  });

  test('purchase cancellation reverses its posting', () => {
    const code = src('routes/PurchaseOrder.js');
    expect(code).toContain("po.status === 'cancelled'");
    expect(code).toContain("reverseAndDeleteTransaction({ Source: txnSource })");
    expect(code).toContain("reference_type: 'purchase_order'");
  });

  test('paid/unpaid routes use derived ledger status instead of direct flags', () => {
    for (const file of ['routes/Order/updateRouter.js', 'routes/Order/queriesRouter.js']) {
      const code = src(file);
      expect(code).toContain('refreshOrderPaymentStatus');
      expect(code).toContain('Order cannot be marked paid until ledger receipts/advances cover the order total.');
    }
  });
});
