import { describe, expect, it } from 'vitest';
import { amountInWords, numberToIndianWords } from './amountInWords';

describe('numberToIndianWords', () => {
  it('handles zero', () => {
    expect(numberToIndianWords(0)).toBe('Zero');
  });

  it('handles two and three digit numbers', () => {
    expect(numberToIndianWords(7)).toBe('Seven');
    expect(numberToIndianWords(19)).toBe('Nineteen');
    expect(numberToIndianWords(40)).toBe('Forty');
    expect(numberToIndianWords(85)).toBe('Eighty Five');
    expect(numberToIndianWords(300)).toBe('Three Hundred');
    expect(numberToIndianWords(415)).toBe('Four Hundred Fifteen');
  });

  it('groups by lakh and crore', () => {
    expect(numberToIndianWords(1000)).toBe('One Thousand');
    expect(numberToIndianWords(100000)).toBe('One Lakh');
    expect(numberToIndianWords(1234567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');
    expect(numberToIndianWords(20000000)).toBe('Two Crore');
  });
});

describe('amountInWords', () => {
  it('formats whole rupees', () => {
    expect(amountInWords(2000)).toBe('Rupees Two Thousand Only');
  });

  it('includes paise when present', () => {
    expect(amountInWords(1250.5)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
  });

  it('handles negative and empty values', () => {
    expect(amountInWords(-500)).toBe('Minus Rupees Five Hundred Only');
    expect(amountInWords(null)).toBe('Rupees Zero Only');
  });
});
