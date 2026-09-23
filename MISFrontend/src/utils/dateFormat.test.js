import { describe, expect, it } from 'vitest';
import { DATE_DISPLAY_FORMAT, formatDate, formatDateTime, toIsoDate } from './dateFormat';

describe('MIS date formatting standard', () => {
  it('uses DD-MM-YYYY for user-visible dates', () => {
    expect(DATE_DISPLAY_FORMAT).toBe('DD-MM-YYYY');
    expect(formatDate('2026-09-23')).toBe('23-09-2026');
    expect(formatDate('2026-09-23T12:30:00.000Z')).toBe('23-09-2026');
  });

  it('keeps API/storage dates ISO when converting form values', () => {
    expect(toIsoDate('23-09-2026')).toBe('2026-09-23');
    expect(toIsoDate('2026-09-23')).toBe('2026-09-23');
  });

  it('formats date-time values consistently', () => {
    expect(formatDateTime(new Date(2026, 8, 23, 12, 30))).toBe('23-09-2026 12:30');
  });
});
