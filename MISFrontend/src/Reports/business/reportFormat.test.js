import { describe, expect, it } from 'vitest';

import { amountTone, buildReportQuery, count, money, percent, toCsv } from './reportFormat';

describe('money', () => {
  it('drops the paise on a whole amount', () => {
    expect(money(125000)).toBe('₹1,25,000');
  });

  it('keeps both places when there are paise', () => {
    // Rounding this away would print a figure that does not match the invoice.
    expect(money(1234.5)).toBe('₹1,234.50');
  });

  it('shows a loss as negative rather than hiding it', () => {
    expect(money(-500)).toContain('500');
    expect(amountTone(-500)).toContain('text-red');
    expect(amountTone(500)).not.toContain('text-red');
  });

  it('prints a dash for a value that is not a number', () => {
    expect(money(undefined)).toBe('—');
    expect(money(null)).toBe('—');
    expect(money('abc')).toBe('—');
  });
});

describe('percent', () => {
  it('formats a share to one place', () => {
    expect(percent(0.3333)).toBe('33.3%');
    expect(percent(1)).toBe('100.0%');
  });

  it('prints a dash when the question has no answer', () => {
    // A margin on zero revenue is undefined, not 0% — printing 0% would read
    // as a real and very bad result.
    expect(percent(null)).toBe('—');
    expect(percent(undefined)).toBe('—');
  });

  it('shows a negative margin', () => {
    expect(percent(-0.25)).toBe('-25.0%');
  });
});

describe('count', () => {
  it('groups Indian-style and rounds a shared figure', () => {
    expect(count(1234567)).toBe('12,34,567');
    // Employee rows carry fractional orders from sharing; a table shows whole ones.
    expect(count(2.4)).toBe('2');
  });
});

describe('buildReportQuery', () => {
  it('sends nothing for the default range', () => {
    expect(buildReportQuery({ preset: '30d' })).toBe('');
  });

  it('sends a non-default preset', () => {
    expect(buildReportQuery({ preset: '90d' })).toBe('preset=90d');
  });

  it('prefers an explicit range over a preset', () => {
    const query = buildReportQuery({ preset: '90d', from: '2026-08-01', to: '2026-08-31' });
    expect(query).toContain('from=2026-08-01');
    expect(query).toContain('to=2026-08-31');
    expect(query).not.toContain('preset');
  });

  it('ignores a half-specified custom range', () => {
    // Both ends are required, or the server falls back to its default anyway.
    expect(buildReportQuery({ preset: '7d', from: '2026-08-01' })).toBe('preset=7d');
  });

  it('carries the granularity when one was chosen', () => {
    expect(buildReportQuery({ preset: '30d', granularity: 'monthly' })).toBe('granularity=monthly');
  });
});

describe('toCsv', () => {
  it('quotes the separators that would otherwise tear a row in half', () => {
    const csv = toCsv(
      ['Item', 'Note', 'Revenue'],
      [
        ['Rose, gold foil', 'He said "yes"', '250.00'],
        ['Plain', 'two\nlines', '0.00'],
      ]
    );
    expect(csv.split('\r\n')).toEqual([
      'Item,Note,Revenue',
      '"Rose, gold foil","He said ""yes""",250.00',
      'Plain,"two\nlines",0.00',
    ]);
  });
});
