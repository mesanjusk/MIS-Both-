// Responsibility editor validation.
//
// These mirror the server-side rules in
// MISBackend/src/services/responsibilityValidation.js. They exist so a bad
// chain is refused while the dialog is still open; the API stays the
// authority, and its own tests cover the cases only it can judge (a user that
// was deleted or deactivated between page load and save).

import { describe, expect, test } from 'vitest';

import { uuidsUsedElsewhere, validateChainSelection } from './responsibilityChain';

const names = new Map([
  ['u-alice', 'Alice'],
  ['u-bob', 'Bob'],
  ['operator-ai-assistant', 'AI Assistant'],
]);

const check = (form) => validateChainSelection(form, names);

describe('the primary may not also be a backup', () => {
  test.each(['backup1UserUuid', 'backup2UserUuid', 'backup3UserUuid', 'backup4UserUuid'])(
    '%s holding the primary is refused',
    (field) => {
      const errors = check({ primaryUserUuid: 'u-alice', [field]: 'u-alice' });
      expect(errors.join(' ')).toMatch(/same person as the Primary/i);
      expect(errors.join(' ')).toContain('Alice');
    }
  );

  test('the message names the person, so the fix is obvious', () => {
    const [message] = check({ primaryUserUuid: 'u-bob', backup1UserUuid: 'u-bob' });
    expect(message).toContain('Bob');
    expect(message).toMatch(/uncovered/i);
  });

  test('an unknown uuid still produces a readable message', () => {
    const [message] = check({ primaryUserUuid: 'u-ghost', backup1UserUuid: 'u-ghost' });
    expect(message).toContain('That user');
  });
});

describe('two backups may not be the same person', () => {
  test('a repeated backup is refused', () => {
    const errors = check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: 'u-bob',
      backup2UserUuid: 'u-bob',
    });
    expect(errors.join(' ')).toMatch(/appears in both/i);
  });

  test('the clash names both slots', () => {
    const [message] = check({ backup1UserUuid: 'u-bob', backup3UserUuid: 'u-bob' });
    expect(message).toContain('Backup 1');
    expect(message).toContain('Backup 3');
  });
});

describe('valid chains are not obstructed', () => {
  test('a distinct chain passes', () => {
    expect(check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: 'u-bob',
      backup2UserUuid: 'operator-ai-assistant',
    })).toEqual([]);
  });

  test('empty slots do not count as duplicates of one another', () => {
    expect(check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: '',
      backup2UserUuid: '',
      backup3UserUuid: '',
      backup4UserUuid: '',
    })).toEqual([]);
  });

  test('a fully unconfigured chain is allowed — it is a warning, not a save block', () => {
    // A half-configured responsibility must stay visible and saveable so the
    // gap can be seen; validateConfiguration reports it separately.
    expect(check({})).toEqual([]);
  });

  test('a chain with only a primary is fine', () => {
    expect(check({ primaryUserUuid: 'u-alice' })).toEqual([]);
  });

  test('the AI assistant may hold a slot alongside real users', () => {
    expect(check({
      primaryUserUuid: 'operator-ai-assistant',
      backup1UserUuid: 'u-alice',
    })).toEqual([]);
  });
});

describe('uuidsUsedElsewhere', () => {
  test('reports the other slots, so a picker can grey them out', () => {
    const used = uuidsUsedElsewhere(
      { primaryUserUuid: 'u-alice', backup1UserUuid: 'u-bob' },
      'backup1UserUuid'
    );
    expect([...used]).toEqual(['u-alice']);
  });

  test('excludes the field being edited and ignores empty slots', () => {
    const used = uuidsUsedElsewhere(
      { primaryUserUuid: 'u-alice', backup1UserUuid: '', backup2UserUuid: 'u-bob' },
      'primaryUserUuid'
    );
    expect([...used].sort()).toEqual(['u-bob']);
  });
});
