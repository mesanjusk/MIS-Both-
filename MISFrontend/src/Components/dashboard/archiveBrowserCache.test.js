import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyArchiveConfirmation, clearArchiveCache, normalizeArchiveScan, readArchiveCache, writeArchiveCache,
} from './archiveBrowserCache';
import { archiveFolderSummary } from './archiveFolderStatus';

const scan = () => ({
  months: ['November 2026'],
  summary: { total: 2, matched: 0, unmatched: 2 },
  dates: [{
    dateName: '03-11-2026', monthName: 'November 2026',
    sections: [
      { stageNumber: 5, files: [
        { fileId: 'drive-1', fileName: 'Customer File.cdr', matched: false },
        { fileId: 'drive-2', fileName: 'Another File.cdr', matched: false },
      ] },
      { stageNumber: 6, files: [{ fileId: 'print-1', fileName: 'Hidden Print.cdr' }] },
    ],
  }],
});

beforeEach(() => clearArchiveCache());

describe('Archive browser-session snapshot', () => {
  it('normalizes the scan without printing-stage files', () => {
    const normalized = normalizeArchiveScan(scan());
    expect(normalized.dates[0].fileCount).toBe(2);
    expect(normalized.dates[0].sections).toHaveLength(1);
    expect(archiveFolderSummary(normalized.dates)).toMatchObject({ pending: 2, confirmed: 0 });
  });

  it('restores loaded archive data for the same user without re-fetching', () => {
    const snapshot = normalizeArchiveScan(scan());
    writeArchiveCache('operator-a', snapshot);
    expect(readArchiveCache('operator-a')).toEqual(snapshot);
    expect(readArchiveCache('operator-b')).toBeNull();
  });

  it('patches a successful confirmation locally and updates folder status exactly once', () => {
    const snapshot = normalizeArchiveScan(scan());
    const confirmation = {
      fileId: 'drive-1', orderUuid: 'order-1', orderNumber: 7654,
      customerName: 'Ahuja', stage: 'print', newName: '7654 Ahuja.cdr',
    };
    const updated = applyArchiveConfirmation(snapshot, confirmation);
    const file = updated.dates[0].sections[0].files[0];
    expect(file).toMatchObject({
      matched: true, isDraft: false, isTemporaryOrder: false,
      orderUuid: 'order-1', orderNumber: 7654, fileName: '7654 Ahuja.cdr',
    });
    expect(updated.summary).toMatchObject({ total: 2, matched: 1, unmatched: 1 });
    expect(archiveFolderSummary(updated.dates)).toMatchObject({ pending: 1, confirmed: 1 });
    const replay = applyArchiveConfirmation(updated, confirmation);
    expect(replay.summary).toEqual(updated.summary);
    expect(snapshot.dates[0].sections[0].files[0].matched).toBe(false);
  });

  it('does not double-count a TEMP match already included in scan totals', () => {
    const snapshot = normalizeArchiveScan(scan());
    snapshot.dates[0].sections[0].files[0] = {
      ...snapshot.dates[0].sections[0].files[0], matched: true, isTemporaryOrder: true,
    };
    snapshot.summary = { total: 2, matched: 1, unmatched: 1 };
    const updated = applyArchiveConfirmation(snapshot, { fileId: 'drive-1', orderNumber: 7654 });
    expect(updated.summary).toEqual(snapshot.summary);
    expect(archiveFolderSummary(updated.dates).confirmed).toBe(1);
  });

  it('does not change the snapshot for an unknown Drive file', () => {
    const snapshot = normalizeArchiveScan(scan());
    expect(applyArchiveConfirmation(snapshot, { fileId: 'missing' })).toBe(snapshot);
  });
});
