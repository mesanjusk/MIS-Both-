import { isConfirmedArchiveOrder } from '../Components/dashboard/archiveFolderStatus';

// Mirror the Archive folder's orange "pending confirmation" rule exactly.
// These are Drive files, not yet necessarily MIS orders or customer invoices.
export function pendingArchiveFiles(snapshot) {
  const seen = new Set();
  return (snapshot?.dates || []).flatMap((date) =>
    (date.sections || []).flatMap((section) =>
      (section.files || []).flatMap((file) => {
        if (!file?.fileId || isConfirmedArchiveOrder(file) || seen.has(file.fileId)) return [];
        seen.add(file.fileId);
        return [{
          ...file,
          archiveMonth: date.monthName || file.monthFolderName || '',
          archiveDate: date.dateName || file.dateFolderName || '',
          archiveSection: section.sectionName || file.sectionFolderName || '',
          canConfirmOrder: section.stageNumber === 5,
        }];
      })
    )
  );
}

export function filterPendingArchiveFiles(rows, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => [
    row.fileName, row.customerName, row.archiveMonth, row.archiveDate,
    row.archiveSection, row.extractedOrderNumber, row.orderNumber,
  ].some((field) => String(field || '').toLowerCase().includes(term)));
}
