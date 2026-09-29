// The folder indicators follow precisely the same "confirmed real MIS order"
// rule as the existing green file cards. A matched TEMP/draft is still pending.
export function isConfirmedArchiveOrder(file) {
  return Boolean(file?.matched && !file?.isDraft && !file?.isTemporaryOrder);
}

export function archiveFolderSummary(dateGroups = []) {
  const files = (dateGroups || []).flatMap((dateGroup) =>
    (dateGroup?.sections || []).flatMap((section) => section?.files || [])
  );
  const confirmed = files.filter(isConfirmedArchiveOrder).length;
  const total = files.length;
  const pending = total - confirmed;
  return {
    total,
    confirmed,
    pending,
    status: total === 0 ? 'empty' : pending > 0 ? 'pending' : 'confirmed',
  };
}

export const archiveFolderStatusSx = {
  pending: {
    bgcolor: '#fff3e0', borderColor: '#efb548', color: '#a84b00',
    hoverBg: '#ffe0b2', iconColor: '#e65100',
  },
  confirmed: {
    bgcolor: '#e8f5e9', borderColor: '#81c784', color: '#2e7d32',
    hoverBg: '#c8e6c9', iconColor: '#388e3c',
  },
  empty: {
    bgcolor: 'background.paper', borderColor: 'divider', color: 'text.secondary',
    hoverBg: 'action.hover', iconColor: 'warning.main',
  },
};
