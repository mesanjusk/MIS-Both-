import { describe, expect, it } from 'vitest';
import { getLabelLayout, buildRateLabelPdf, isWeddingJobLayoutLegible } from './rateLabelPdf';

describe('printable label PDF grids', () => {
  it('starts with the previously used 3 column x 7 row A4 format', () => {
    const result = getLabelLayout({ columns: 3, rows: 7, orientation: 'portrait' });
    expect(result.perPage).toBe(21);
    expect(result.labelWidth).toBeGreaterThan(60);
    expect(result.labelHeight).toBeGreaterThan(38);
  });

  it('supports portrait, landscape, variable rows and columns', () => {
    const landscape = getLabelLayout({ columns: 4, rows: 4, orientation: 'landscape' });
    expect(landscape.perPage).toBe(16);
    expect(landscape.pageWidth).toBe(297);
    expect(landscape.pageHeight).toBe(210);
  });

  it('rejects layouts too dense to be legible or invalid dimensions', () => {
    expect(() => getLabelLayout({ columns: 8, rows: 12, orientation: 'portrait' })).toThrow();
    expect(() => getLabelLayout({ columns: 0, rows: 5 })).toThrow();
    expect(() => getLabelLayout({ columns: 4.5, rows: 5 })).toThrow();
    expect(() => getLabelLayout({ columns: 2, rows: 2, orientation: 'a3' })).toThrow();
  });

  it('paginates repeated SK(M) price labels without blank labels', () => {
    const pdf = buildRateLabelPdf({
      item: { type: 'wedding', brand: 'M', code: '501', codedPrice: 'UUY', price: 605 },
      columns: 3, rows: 7, count: 43
    });
    expect(pdf.internal.getNumberOfPages()).toBe(3);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });

  it('generates generic item price labels and bounds label quantities', () => {
    const pdf = buildRateLabelPdf({
      item: { type: 'other', name: 'Flex banner (Qty 50)', price: 2400 },
      columns: 2, rows: 6, count: 7
    });
    expect(pdf.internal.getNumberOfPages()).toBe(1);
    expect(() => buildRateLabelPdf({ item: { type: 'other', price: 10 }, count: 5001 })).toThrow();
  });
});

describe('reference-style Wedding Card job slips', () => {
  const lines = [
    { key: 'card', label: 'Card rate', selected: true, qty: 300, rate: 13.86, total: 4158 },
    { key: 'design', label: 'Designing', selected: true, qty: 1, rate: 200, total: 200 },
    { key: 'printing', label: 'Printing', selected: true, qty: 3, rate: 300, total: 900 },
    { key: 'packing', label: 'Packing', selected: true, qty: 3, rate: 100, total: 300 },
    { key: 'nameLabel', label: 'Name Label', selected: false, qty: 300, rate: 2.5, total: 0 },
    { key: 'other', label: 'Foil Finish', selected: false, qty: 1, rate: 75, total: 0 },
  ];
  const item = {
    type: 'job', brand: 'K', code: '1022', codedPrice: 'NA.R',
    price: 5558, grandTotal: 5558, deliveryDays: 5, lines,
  };
  it('renders same six service rows in 2x5 A4 portrait slips', () => {
    const geometry = getLabelLayout({ columns: 2, rows: 5 });
    expect(isWeddingJobLayoutLegible(geometry)).toBe(true);
    const pdf = buildRateLabelPdf({ item, columns: 2, rows: 5, count: 11 });
    expect(pdf.internal.getNumberOfPages()).toBe(2);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
  it('does not permit illegibly small detailed slips', () => {
    const geometry = getLabelLayout({ columns: 3, rows: 7 });
    expect(isWeddingJobLayoutLegible(geometry)).toBe(false);
    expect(() => buildRateLabelPdf({ item, columns: 3, rows: 7, count: 21 })).toThrow();
  });
});
