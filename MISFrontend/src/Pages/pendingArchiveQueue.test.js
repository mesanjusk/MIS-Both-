import { describe, expect, it } from 'vitest';
import { filterPendingArchiveFiles, pendingArchiveFiles } from './pendingArchiveQueue';

const snapshot = {
  dates: [
    { monthName: 'November 2026', dateName: '03 Nov', sections: [{
      sectionName: 'Final', stageNumber: 5, files: [
        { fileId: 'a', fileName: 'Unconfirmed.cdr', matched: false },
        { fileId: 'b', fileName: 'Draft.cdr', matched: true, isDraft: true },
        { fileId: 'c', fileName: 'Temp.cdr', matched: true, isTemporaryOrder: true },
        { fileId: 'd', fileName: 'Done.cdr', matched: true, isDraft: false },
      ],
    }] },
    { monthName: 'October 2026', dateName: '30 Oct', sections: [{
      sectionName: 'Other', stageNumber: null, files: [
        { fileId: 'e', fileName: 'Loose.cdr', matched: false },
        { fileId: 'a', fileName: 'Duplicate.cdr', matched: false },
      ],
    }] },
  ],
};

describe('Pending archive queue', () => {
  it('matches Archive folder pending logic for unlinked, draft and temporary files', () => {
    const rows = pendingArchiveFiles(snapshot);
    expect(rows.map((row) => row.fileId)).toEqual(['a', 'b', 'c', 'e']);
    expect(rows.filter((row) => row.canConfirmOrder).map((row) => row.fileId))
      .toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ archiveMonth: 'November 2026', archiveDate: '03 Nov' });
  });

  it('searches the complete locally loaded queue', () => {
    const rows = pendingArchiveFiles(snapshot);
    expect(filterPendingArchiveFiles(rows, 'october')).toHaveLength(1);
    expect(filterPendingArchiveFiles(rows, 'draft')[0].fileId).toBe('b');
  });

  it('removes a file once the archive cache is patched as confirmed', () => {
    const confirmed = JSON.parse(JSON.stringify(snapshot));
    confirmed.dates[0].sections[0].files[0].matched = true;
    expect(pendingArchiveFiles(confirmed).some((row) => row.fileId === 'a')).toBe(false);
  });
});
