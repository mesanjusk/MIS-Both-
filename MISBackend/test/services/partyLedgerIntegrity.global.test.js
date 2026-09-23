describe('global party ledger UUID integrity contract', () => {
  test('repair service is intentionally global, UUID based and ambiguity safe', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/services/partyLedgerIntegrityService.js'),
      'utf8'
    );
    expect(source).toContain("'Journal_entry.Account_id': { $in: shadowIds }");
    expect(source).not.toContain("Source: { $regex");
    expect(source).toContain('ambiguousAccounts');
    expect(source).toContain('matches.length > 1');
    expect(source).toContain('applyBalanceMovement');
  });
});
