import { describe, expect, it } from 'vitest';
import { canQuickCreateMisOrder } from './archiveOrderEligibility';

describe('Archive quick MIS order eligibility', () => {
  const finalFile = { fileId: 'drive-1', fileName: 'Design.pdf', stageNumber: 5, matched: false };

  it('allows an unlinked Final file', () => {
    expect(canQuickCreateMisOrder(finalFile)).toBe(true);
  });

  it('does not duplicate an already linked, matched or temporary order', () => {
    expect(canQuickCreateMisOrder({ ...finalFile, matched: true })).toBe(false);
    expect(canQuickCreateMisOrder({ ...finalFile, orderUuid: 'existing-order' })).toBe(false);
    expect(canQuickCreateMisOrder({ ...finalFile, isTemporaryOrder: true })).toBe(false);
  });

  it('does not expose creation in non-Final archive stages', () => {
    expect(canQuickCreateMisOrder({ ...finalFile, stageNumber: 6 })).toBe(false);
    expect(canQuickCreateMisOrder({ ...finalFile, stageNumber: 3 })).toBe(false);
    expect(canQuickCreateMisOrder(null)).toBe(false);
  });
});
