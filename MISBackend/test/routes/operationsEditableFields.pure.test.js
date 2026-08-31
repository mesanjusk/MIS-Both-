// The operations fields that must stay editable from the frontend.
//
// Every one of these is a business decision the office makes and re-makes —
// who is P1, who covers whom, when someone works. None of them is allowed to
// become a value only a developer can change. This file reads the route source
// and fails if one of them stops being editable, which a refactor could
// otherwise do silently: the API would simply start ignoring the field, and
// the screen would keep showing a control that no longer saves.

const fs = require('fs');
const path = require('path');

const ROUTE = fs.readFileSync(
  path.join(__dirname, '../../src/routes/Operations.js'),
  'utf8'
);

const { OWNERSHIP_FIELDS } = require('../../src/constants/ownership');

describe('a user’s operations profile stays editable', () => {
  // USER_OPS_FIELDS is the audited field list on PUT /users/:uuid/operations.
  const declared = ROUTE.match(/const USER_OPS_FIELDS = \[([\s\S]*?)\];/)[1];

  test.each([
    ['priority', 'operational priority P1–P4'],
    ['roleTitle', 'role title'],
    ['department', 'department'],
    ['workingDays', 'working days'],
    ['startTime', 'working hours (start)'],
    ['endTime', 'working hours (end)'],
    ['backupEligible', 'backup eligibility'],
    ['active', 'operational availability'],
    ['alwaysAvailable', 'owner / always-available ownership'],
  ])('%s (%s) is an editable, audited field', (field) => {
    expect(declared).toContain(`'${field}'`);
  });

  test('the route accepts a priority from the editable catalogue, not a compiled-in list', () => {
    // If P1..P4 were hardcoded here, management could not add or rename a code.
    expect(ROUTE).toContain('getPriorityLevels()');
    expect(ROUTE).not.toMatch(/const\s+PRIORITY_CODES\s*=\s*\[\s*'P1'/);
  });

  test('Outside / Inside is set through the operational state endpoint', () => {
    expect(ROUTE).toContain("router.put('/users/:userUuid/state'");
    expect(ROUTE).toContain('OPERATIONAL_STATES');
  });
});

describe('a responsibility stays editable', () => {
  const editable = ROUTE.match(/const editable = \[([\s\S]*?)\];/)[1];

  test('Category remains editable', () => {
    expect(editable).toContain("'category'");
  });

  test('the whole ownership chain (Primary and Backup 1-4) remains editable', () => {
    // Spread from the shared constant rather than listed, so adding a Backup 5
    // there makes it editable here with no second edit — and so this list
    // cannot silently fall behind the schema.
    expect(editable).toContain('...OWNERSHIP_FIELDS');
    expect(OWNERSHIP_FIELDS).toHaveLength(5);
  });

  test('the chain covers a primary and four backups, no more and no fewer', () => {
    expect(OWNERSHIP_FIELDS).toEqual([
      'primaryUserUuid',
      'backup1UserUuid',
      'backup2UserUuid',
      'backup3UserUuid',
      'backup4UserUuid',
    ]);
  });
});

describe('validation refuses a broken chain rather than storing it', () => {
  test('both the create and the update path validate the chain', () => {
    const hits = ROUTE.match(/validateResponsibilityChain\(/g) || [];
    expect(hits).toHaveLength(2);
  });

  test('working hours are validated before a user profile is saved', () => {
    expect(ROUTE).toContain('validateWorkingHours(payload)');
  });

  test('the priority catalogue is validated before it is stored', () => {
    expect(ROUTE).toContain('validatePriorityLevels');
  });

  test('the update path validates against the stored record, so old rows stay editable', () => {
    expect(ROUTE).toContain('existing: before,');
  });
});
