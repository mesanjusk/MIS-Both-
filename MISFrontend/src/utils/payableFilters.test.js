import { describe, expect, it } from 'vitest';
import { matchesPayableAccountSearch } from './payableFilters';

const party = { Vendor_uuid: 'vendor-123', Vendor_name: 'SK Print Works' };

describe('Home Payable account search', () => {
  it('keeps all accounts when search is empty or whitespace', () => {
    expect(matchesPayableAccountSearch(party, '')).toBe(true);
    expect(matchesPayableAccountSearch(party, '   ')).toBe(true);
  });

  it('matches names and account IDs case-insensitively', () => {
    expect(matchesPayableAccountSearch(party, 'print')).toBe(true);
    expect(matchesPayableAccountSearch(party, '  SK PRINT ')).toBe(true);
    expect(matchesPayableAccountSearch(party, 'VENDOR-123')).toBe(true);
  });

  it('does not show unrelated or unregistered accounts for a search', () => {
    expect(matchesPayableAccountSearch(party, 'freelancer')).toBe(false);
    expect(matchesPayableAccountSearch(null, 'print')).toBe(false);
  });
});
