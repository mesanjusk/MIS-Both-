import { describe, expect, it } from 'vitest';
import { getVoucherInfo, isSalesInvoiceTransaction, pickPartyLeg } from './voucher';

const salesInvoice = {
  Transaction_id: 782,
  Order_uuid: 'ord-1',
  Order_number: 782,
  Source: 'invoice',
  Journal_entry: [
    { Account_id: 'cust-1', Account_name: 'Anand Colour Lab', Type: 'Debit', Amount: 16500 },
    { Account_id: 'acct-sales', Account_name: 'Sales', Type: 'Credit', Amount: 16500 },
  ],
};

describe('isSalesInvoiceTransaction', () => {
  it('accepts an order-backed posting tagged as an invoice', () => {
    expect(isSalesInvoiceTransaction(salesInvoice)).toBe(true);
  });

  it('accepts a legacy order-backed posting with a Sales credit leg and no Source', () => {
    expect(isSalesInvoiceTransaction({ ...salesInvoice, Source: '' })).toBe(true);
  });

  it('accepts the accounting service source code', () => {
    expect(isSalesInvoiceTransaction({ ...salesInvoice, Source: 'business:customer_invoice:ord-1' })).toBe(true);
  });

  it('rejects a receipt raised against the same order', () => {
    expect(isSalesInvoiceTransaction({
      Transaction_id: 800,
      Order_uuid: 'ord-1',
      Order_number: 782,
      Source: 'business:customer_receipt',
      Journal_entry: [
        { Account_id: 'acct-cash', Account_name: 'Cash', Type: 'Debit', Amount: 5000 },
        { Account_id: 'cust-1', Account_name: 'Anand Colour Lab', Type: 'Credit', Amount: 5000 },
      ],
    })).toBe(false);
  });

  it('rejects a posting with no order behind it', () => {
    expect(isSalesInvoiceTransaction({ ...salesInvoice, Order_uuid: null, Order_number: null })).toBe(false);
  });

  it('rejects a purchase posting', () => {
    expect(isSalesInvoiceTransaction({ ...salesInvoice, Source: 'business:purchase:po-1' })).toBe(false);
  });
});

describe('getVoucherInfo', () => {
  it('numbers a sale invoice by its order number', () => {
    const v = getVoucherInfo({ transaction: salesInvoice, entry: salesInvoice.Journal_entry[0] });
    expect(v).toMatchObject({ type: 'invoice', label: 'Invoice', number: 782, display: 'INV-782' });
  });

  it('numbers a receipt by its transaction id', () => {
    const txn = { Transaction_id: 775, Source: 'business:customer_receipt' };
    const v = getVoucherInfo({ transaction: txn, entry: { Type: 'Credit', Amount: 250 } });
    expect(v.display).toBe('RCT-775');
  });

  it('treats a credit leg with no source as a receipt', () => {
    const v = getVoucherInfo({ transaction: { Transaction_id: 12 }, entry: { Type: 'Credit' } });
    expect(v.display).toBe('RCT-12');
  });

  it('treats a debit against cash or bank as a payment', () => {
    const v = getVoucherInfo({
      transaction: { Transaction_id: 13 },
      entry: { Type: 'Debit' },
      counterIsCashOrBank: true,
    });
    expect(v.display).toBe('PAY-13');
  });

  it('falls back to a journal voucher for any other debit', () => {
    const v = getVoucherInfo({ transaction: { Transaction_id: 14 }, entry: { Type: 'Debit' } });
    expect(v.display).toBe('JV-14');
  });

  it('numbers a purchase posting as a purchase voucher', () => {
    const v = getVoucherInfo({
      transaction: { Transaction_id: 15, Source: 'business:purchase:po-9' },
      entry: { Type: 'Credit' },
    });
    expect(v.display).toBe('PUR-15');
  });

  it('returns empty details with no transaction', () => {
    expect(getVoucherInfo({}).display).toBe('');
  });
});

describe('pickPartyLeg', () => {
  const cashLeg = { Account_id: 'acct-cash', Account_name: 'Cash', Type: 'Debit', Amount: 500 };
  const custLeg = { Account_id: 'cust-1', Account_name: 'Anand Colour Lab', Type: 'Credit', Amount: 500 };
  const isParty = (id) => id === 'cust-1';

  it('prefers the leg matching the posting\'s own customer', () => {
    const txn = { Customer_uuid: 'cust-1', Journal_entry: [cashLeg, custLeg] };
    expect(pickPartyLeg(txn, () => false)).toBe(custLeg);
  });

  it('falls back to a leg the caller recognises as a party account', () => {
    const txn = { Journal_entry: [cashLeg, custLeg] };
    expect(pickPartyLeg(txn, isParty)).toBe(custLeg);
  });

  it('falls back to the debit leg when neither side is a known party', () => {
    const txn = { Journal_entry: [custLeg, cashLeg] };
    expect(pickPartyLeg(txn, () => false)).toBe(cashLeg);
  });

  it('returns null for a posting with no journal', () => {
    expect(pickPartyLeg({ Journal_entry: [] }, isParty)).toBeNull();
    expect(pickPartyLeg(undefined, isParty)).toBeNull();
  });

  it('gives a receipt voucher when paired with getVoucherInfo', () => {
    const txn = { Transaction_id: 91, Customer_uuid: 'cust-1', Journal_entry: [cashLeg, custLeg] };
    const leg = pickPartyLeg(txn, isParty);
    expect(getVoucherInfo({ transaction: txn, entry: leg, counterIsCashOrBank: true }).display).toBe('RCT-91');
  });
});
