import { describe, expect, it } from 'vitest';
import { formatStatementDescription } from './statementDescription';

describe('ledger Statement descriptions', () => {
  const invoice = { Description: 'Info Origin', Source: 'invoice' };
  const details = {
    items: [
      { name: 'Wedding Invitation', quantity: 100, rate: 21, amount: 2100, remark: 'Gold foil' },
      { name: 'Envelope', quantity: 100, rate: 2.5, amount: 250, remark: '' },
    ],
    extraCharges: [{ label: 'Packaging', amount: 50 }],
  };

  it('shows invoice products, quantities, rates, amounts, remarks and charges', () => {
    expect(formatStatementDescription(invoice, details, 'Info Origin')).toBe(
      'Wedding Invitation × 100 @ ₹21 = ₹2,100 (Gold foil); Envelope × 100 @ ₹2.5 = ₹250; Charges: Packaging ₹50'
    );
  });

  it('appends an edited invoice description without hiding actual item lines', () => {
    expect(formatStatementDescription({ Description: 'Dispatch with courier' }, details, 'Info Origin'))
      .toContain('Note: Dispatch with courier');
    expect(formatStatementDescription({ Description: 'Dispatch with courier' }, details, 'Info Origin'))
      .toContain('Wedding Invitation × 100');
  });

  it('uses receipt and payment voucher narration from Description, not unrelated invoice items', () => {
    expect(formatStatementDescription({ Description: 'Received against INV-861' }, null, 'Info Origin'))
      .toBe('Received against INV-861');
    expect(formatStatementDescription({ Description: 'UPI payment to printer' }, {}, 'Info Origin'))
      .toBe('UPI payment to printer');
  });

  it('gracefully preserves old descriptions when an invoice or API details are absent', () => {
    expect(formatStatementDescription(invoice, undefined, 'Info Origin')).toBe('Info Origin');
    expect(formatStatementDescription({ Description: '' }, undefined)).toBe('—');
  });
});
