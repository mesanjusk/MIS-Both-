import { describe, expect, it } from 'vitest';
import { changedFields, SPREADSHEET_COLUMNS } from './WeddingBulkSpreadsheetDialog';

const initial = {
  originalPrice: '12.6', markupPercent: '10', discountPercent: '0',
  printingCharge: '300', packingCharge: '100', designCharge: '200',
  nameLabelCharge: '2', otherCharge: '0', otherServiceName: 'Other',
};

describe('Wedding Card Excel-style per-row bulk editing', () => {
  it('leaves untouched fields out of the update, even with formatting differences', () => {
    const edited = { ...initial, originalPrice: '12.60', printingCharge: '350' };
    expect(changedFields(initial, edited)).toEqual({
      changes: { printingCharge: 350 },
      expected: { printingCharge: 300 },
    });
  });

  it('supports different values for different product codes', () => {
    const a = changedFields(initial, { ...initial, designCharge: '250' });
    const b = changedFields(initial, {
      ...initial, markupPercent: '15', discountPercent: '5',
      otherServiceName: 'Lamination'
    });
    expect(a.changes).toEqual({ designCharge: 250 });
    expect(b.changes).toEqual({
      markupPercent: 15, discountPercent: 5, otherServiceName: 'Lamination'
    });
    expect(b.expected).toEqual({
      markupPercent: 10, discountPercent: 0, otherServiceName: 'Other'
    });
  });

  it('accepts zero without treating it as an empty cell', () => {
    expect(changedFields(initial, { ...initial, nameLabelCharge: '0' }))
      .toEqual({ changes: { nameLabelCharge: 0 }, expected: { nameLabelCharge: 2 } });
    expect(changedFields(initial, initial).changes).toEqual({});
    expect(SPREADSHEET_COLUMNS.length).toBe(9);
  });
});
