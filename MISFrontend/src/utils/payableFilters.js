// Shared account-name/ID search for the Home Payable filters.
// Keep the matching rule identical for ledger rows and printing jobs.
export function matchesPayableAccountSearch(party, search) {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  if (!party) return false;
  return [party.Vendor_name, party.Vendor_uuid].some((value) =>
    String(value || '').toLowerCase().includes(needle)
  );
}
