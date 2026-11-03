// The archive scan walks many Drive folders. Keep its last snapshot in this
// browser tab so tab changes / successful confirmations do not repeat the scan.
const snapshots = new Map();
const keyFor = (user) => `mis.designArchive.v1:${encodeURIComponent(user || 'current-user')}`;

export function readArchiveCache(user) {
  const key = keyFor(user);
  if (snapshots.has(key)) return snapshots.get(key);
  try {
    const saved = window.sessionStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.dates)) return null;
    snapshots.set(key, parsed);
    return parsed;
  } catch {
    return null; // Browser storage may be disabled; memory cache still works.
  }
}

export function writeArchiveCache(user, data) {
  if (!data || !Array.isArray(data.dates)) return;
  const key = keyFor(user);
  snapshots.set(key, data);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Large archives can exceed storage quota; retain the in-memory snapshot.
  }
}

export function normalizeArchiveScan(data = {}, printingStageNumber = 6) {
  return {
    ...data,
    dates: (data.dates || [])
      .map((date) => {
        const sections = (date.sections || [])
          .filter((section) => section.stageNumber !== printingStageNumber);
        return {
          ...date,
          sections,
          fileCount: sections.reduce((count, section) => count + (section.files?.length || 0), 0),
        };
      })
      .filter((date) => date.fileCount > 0),
  };
}

export function applyArchiveConfirmation(data, confirmation) {
  if (!data?.dates || !confirmation?.fileId) return data;
  let found = false;
  let newlyMatched = false;
  const dates = data.dates.map((date) => ({
    ...date,
    sections: (date.sections || []).map((section) => ({
      ...section,
      files: (section.files || []).map((file) => {
        if (file.fileId !== confirmation.fileId) return file;
        found = true;
        newlyMatched = !file.matched;
        return {
          ...file,
          matched: true,
          isDraft: false,
          isTemporaryOrder: false,
          orderUuid: confirmation.orderUuid || file.orderUuid,
          orderNumber: confirmation.orderNumber ?? file.orderNumber,
          orderStage: confirmation.stage || file.orderStage,
          customerName: confirmation.customerName || file.customerName,
          fileName: confirmation.newName || file.fileName,
        };
      }),
    })),
  }));
  if (!found) return data;
  const summary = data.summary && newlyMatched
    ? {
        ...data.summary,
        matched: Number(data.summary.matched || 0) + 1,
        unmatched: Math.max(0, Number(data.summary.unmatched || 0) - 1),
      }
    : data.summary;
  return { ...data, dates, summary };
}

// Explicitly clear between test cases; never clear after each popup close.
export function clearArchiveCache(user) {
  if (user === undefined) {
    for (const key of snapshots.keys()) {
      try { window.sessionStorage.removeItem(key); } catch { /* no browser storage */ }
    }
    snapshots.clear();
    return;
  }
  const key = keyFor(user);
  snapshots.delete(key);
  try { window.sessionStorage.removeItem(key); } catch { /* no browser storage */ }
}
