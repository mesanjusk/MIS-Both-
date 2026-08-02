const {
  isValidStage,
  isClosedStage,
  isForwardMove,
  normalizeLegacyStage,
  CLOSED_STAGES,
  DESIGN_LOOP_STAGES,
} = require('../../src/constants/orderStages');

describe('orderStages.isValidStage', () => {
  test('recognizes a known stage', () => {
    expect(isValidStage('enquiry')).toBe(true);
  });

  test('rejects an unknown stage', () => {
    expect(isValidStage('not_a_stage')).toBe(false);
  });
});

describe('orderStages.isClosedStage / CLOSED_STAGES', () => {
  test.each(['delivered', 'paid', 'lost', 'cancelled'])('%s is a closed stage', (stage) => {
    expect(isClosedStage(stage)).toBe(true);
    expect(CLOSED_STAGES.has(stage)).toBe(true);
  });

  test('an open stage is not closed', () => {
    expect(isClosedStage('print')).toBe(false);
  });
});

describe('orderStages.normalizeLegacyStage', () => {
  test('maps legacy aliases to their modern equivalent', () => {
    expect(normalizeLegacyStage('design')).toBe('new_design');
    expect(normalizeLegacyStage('printing')).toBe('print');
    expect(normalizeLegacyStage('post_printing')).toBe('fitting');
    expect(normalizeLegacyStage('finishing')).toBe('bind_packing');
  });

  test('passes through a stage that is not a legacy alias', () => {
    expect(normalizeLegacyStage('enquiry')).toBe('enquiry');
    expect(normalizeLegacyStage('totally_unknown')).toBe('totally_unknown');
  });
});

describe('orderStages.isForwardMove', () => {
  test('allows a strictly forward move', () => {
    expect(isForwardMove('enquiry', 'new_design')).toBe(true);
  });

  test('rejects a plain rollback', () => {
    expect(isForwardMove('new_design', 'enquiry')).toBe(false);
  });

  test('allows movement within the design loop in either direction', () => {
    expect(isForwardMove('approval', 'old_design')).toBe(true);
    expect(isForwardMove('old_design', 'approval')).toBe(true);
    for (const stage of DESIGN_LOOP_STAGES) {
      expect(DESIGN_LOOP_STAGES.has(stage)).toBe(true);
    }
  });

  test('rejects moving out of the design loop backward into an earlier production stage', () => {
    expect(isForwardMove('old_design', 'approved')).toBe(false);
  });

  test('treats terminal stages as reachable from any open stage but not reversible', () => {
    expect(isForwardMove('enquiry', 'lost')).toBe(true);
    expect(isForwardMove('lost', 'new_design')).toBe(false);
  });

  test('rejects moves involving an invalid stage name', () => {
    expect(isForwardMove('enquiry', 'nonsense')).toBe(false);
    expect(isForwardMove('nonsense', 'enquiry')).toBe(false);
  });
});
