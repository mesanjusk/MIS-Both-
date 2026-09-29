jest.mock('../../src/repositories/order');
jest.mock('../../src/repositories/publicInvoice');

const Orders = require('../../src/repositories/order');
const PublicInvoice = require('../../src/repositories/publicInvoice');
const {
  cleanItems, hasInvoiceSource, getStatementInvoiceDetails,
} = require('../../src/services/statementInvoiceDetailsService');

const invoiceTxn = {
  Transaction_uuid: 'txn-1', Order_uuid: 'ord-1', Order_number: 861,
  Source: 'invoice', Journal_entry: [],
};
const order = {
  Order_uuid: 'ord-1', Order_Number: 861,
  Items: [{ Item: 'Wedding Card', Quantity: 100, Rate: 21, Amount: 2100, Remark: 'Matt' }],
  extraCharges: [{ label: 'Packaging', amount: 50 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  Orders.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([order]) });
  PublicInvoice.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });
});

describe('Statement invoice source details', () => {
  test('uses real items and remarks from the linked order, without modifying transactions', async () => {
    const result = await getStatementInvoiceDetails([invoiceTxn]);
    expect(result['txn-1']).toEqual({
      items: [{ name: 'Wedding Card', quantity: 100, rate: 21, amount: 2100, remark: 'Matt' }],
      extraCharges: [{ label: 'Packaging', amount: 50 }],
      source: 'order',
    });
    expect(Orders.find).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.arrayContaining([{ Order_uuid: { $in: ['ord-1'] } }]) }),
      expect.objectContaining({ Items: 1, extraCharges: 1 }),
    );
    expect(Orders.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('prefers the item snapshot from the issued invoice over later order edits', async () => {
    PublicInvoice.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{
        orderNumber: '861',
        items: [{ Item: 'Original Invitation', Quantity: 50, Rate: 42, Amount: 2100, Remark: 'Original print' }],
      }]) }),
    });
    const result = await getStatementInvoiceDetails([invoiceTxn]);
    expect(result['txn-1'].items[0].name).toBe('Original Invitation');
    expect(result['txn-1'].source).toBe('issued_invoice');
  });

  test('does not wrongly display order invoice items on linked receipt/payment vouchers', async () => {
    expect(hasInvoiceSource({
      ...invoiceTxn, Source: 'business:customer_receipt', Journal_entry: [],
    })).toBe(false);
    const result = await getStatementInvoiceDetails([{
      ...invoiceTxn, Source: 'business:customer_receipt',
    }]);
    expect(result).toEqual({});
    expect(Orders.find).not.toHaveBeenCalled();
  });

  test('supports legacy sale-account invoices and rejects irrelevant or malformed item names', async () => {
    expect(hasInvoiceSource({
      ...invoiceTxn, Source: '', Journal_entry: [
        { Type: 'Credit', Account_name: 'Sales', Amount: 2100 },
      ],
    })).toBe(true);
    expect(cleanItems([{ Item: ' Letterhead ', Quantity: 500 }, { Item: '' }]))
      .toEqual([{ name: 'Letterhead', quantity: 500, rate: 0, amount: 0, remark: '' }]);
  });
});
