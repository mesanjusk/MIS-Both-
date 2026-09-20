const {
  inferPaymentMode,
  vendorCandidateSources,
  buildTransactionLookup,
  findExistingVendorTransaction,
} = require('../../src/services/ledgerRepairService');

describe('ledgerRepairService pure helpers', () => {
  test.each([
    [{ narration: 'paid by UPI PhonePe' }, 'UPI'],
    [{ narration: 'NEFT transfer from bank' }, 'Bank'],
    [{ narration: 'Cheque payment' }, 'Bank'],
    [{ narration: 'cash paid to vendor' }, 'Cash'],
    [{ narration: '' }, 'Cash'],
  ])('infers legacy vendor payment mode from narration', (row, expected) => {
    expect(inferPaymentMode(row)).toBe(expected);
  });

  test('maps purchase-order subledger rows to the canonical purchase source', () => {
    expect(vendorCandidateSources({
      reference_type: 'purchase_order',
      reference_id: 'po-1',
      entry_type: 'material_bill',
    })).toContain('business:purchase:po-1');
  });

  test('maps order-step bills to their deterministic vendor-bill source', () => {
    expect(vendorCandidateSources({
      reference_type: 'order_step_bill',
      reference_id: 'step-9',
      order_uuid: 'order-7',
      entry_type: 'job_bill',
    })).toContain('business:vendor_bill:order_step:order-7:step-9');
  });

  test('maps vendor-job bill and advance references to their canonical sources', () => {
    expect(vendorCandidateSources({
      reference_type: 'vendor_job_bill',
      reference_id: 'job-1',
      job_uuid: 'job-1',
      entry_type: 'job_bill',
    })).toContain('business:vendor_bill:job-1');

    expect(vendorCandidateSources({
      reference_type: 'vendor_job_advance',
      reference_id: 'job-2',
      job_uuid: 'job-2',
      entry_type: 'advance_paid',
    })).toContain('business:vendor_advance:job-2');
  });

  test('maps vendor opening rows to both historical opening source variants', () => {
    expect(vendorCandidateSources({
      vendor_uuid: 'vendor-1',
      entry_type: 'opening',
    })).toEqual(expect.arrayContaining([
      'business:vendor_opening:vendor:vendor-1',
      'business:vendor_opening:vendor-1',
    ]));
  });

  test('deduplicates candidate sources when reference and job identity match', () => {
    const sources = vendorCandidateSources({
      reference_type: 'vendor_job_bill',
      reference_id: 'job-1',
      job_uuid: 'job-1',
      entry_type: 'job_bill',
    });
    expect(new Set(sources).size).toBe(sources.length);
  });

  test('preloaded transaction lookup resolves vendor rows without database calls', () => {
    const txn = {
      Transaction_uuid: 'txn-1',
      Source: 'business:purchase:po-1',
    };
    const lookup = buildTransactionLookup([txn]);

    expect(findExistingVendorTransaction({
      reference_type: 'purchase_order',
      reference_id: 'po-1',
      entry_type: 'material_bill',
    }, lookup)).toBe(txn);

    expect(findExistingVendorTransaction({
      transaction_uuid: 'txn-1',
      entry_type: 'payment',
    }, lookup)).toBe(txn);
  });
});
