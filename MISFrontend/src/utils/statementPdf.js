// Professional vector A4 account statement.
//
// The statement is built with real PDF text so it remains crisp, searchable
// and compact. Transaction narration and voucher information are kept in the
// same row as the financial figures so details never get clipped or orphaned
// across pages.

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const CONT_TOP = 30;
const BOTTOM = 20;

const INK = [17, 24, 39];
const BODY = [55, 65, 81];
const MUTED = [107, 114, 128];
const LINE = [226, 232, 240];
const RULE = [203, 213, 225];
const ACCENT = [29, 78, 216];
const TINT = [248, 250, 252];
const DANGER = [185, 28, 28];
const WHITE = [255, 255, 255];

export const money = (n) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function textRight(doc, text, x, y, charSpace = 0) {
  const str = String(text ?? '');
  if (!charSpace) {
    doc.text(str, x, y, { align: 'right' });
    return;
  }
  const width = doc.getTextWidth(str) + charSpace * Math.max(str.length - 1, 0);
  doc.text(str, x - width, y, { charSpace });
}

function label(doc, text, x, y, { align = 'left' } = {}) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(...MUTED);
  const value = String(text || '').toUpperCase();
  if (align === 'right') textRight(doc, value, x, y, 0.5);
  else doc.text(value, x, y, { charSpace: 0.5 });
}

function hairline(doc, y, color = LINE, width = 0.2) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(M, y, PAGE_W - M, y);
}

function periodText(s) {
  return s.periodFrom || s.periodTo
    ? `${s.periodFrom || 'Beginning'} to ${s.periodTo || 'Till date'}`
    : 'All dates';
}

/**
 * Compose the complete, user-readable transaction detail shown beneath the
 * counter-ledger name. Do not expose internal UUIDs in a customer statement.
 */
export function transactionDetailLines(row = {}) {
  const lines = [];
  if (row.voucherType) lines.push(`Voucher type: ${row.voucherType}`);
  if (row.description && row.description !== row.particulars) {
    lines.push(`Narration: ${row.description}`);
  }
  return lines;
}

function particularsCell(row = {}) {
  return [row.particulars || '—', ...transactionDetailLines(row)];
}

function drawFirstPageHeader(doc, s, profile) {
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(profile.name || '', M, y);

  doc.setFontSize(10.5);
  textRight(doc, 'ACCOUNT STATEMENT', PAGE_W - M, y, 1.4);

  y += 4.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);

  const address = (profile.addressLines || []).filter(Boolean).join(', ');
  const contact = [profile.phone && `Tel ${profile.phone}`, profile.email]
    .filter(Boolean)
    .join('   ·   ');
  const lines = [address, contact, profile.gst && `GSTIN ${profile.gst}`].filter(Boolean);

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(String(line), CONTENT_W * 0.62);
    doc.text(wrapped, M, y);
    y += wrapped.length * 3.7;
  }

  y += 1.6;
  hairline(doc, y, RULE, 0.3);
  doc.setFillColor(...ACCENT);
  doc.rect(M, y - 0.45, 24, 0.9, 'F');

  y += 8;
  label(doc, 'Statement for', M, y);
  label(doc, 'Period', PAGE_W - M, y, { align: 'right' });

  y += 5.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(s.partyName || '—', M, y, { maxWidth: CONTENT_W * 0.6 });

  doc.setFontSize(9.5);
  textRight(doc, periodText(s), PAGE_W - M, y);

  y += 4.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (s.partyMobile) doc.text(String(s.partyMobile), M, y);
  if (s.generatedOn) textRight(doc, `Generated on ${s.generatedOn}`, PAGE_W - M, y);

  y += 6;
  hairline(doc, y);
  const boxTop = y;
  const boxH = 16;
  doc.setFillColor(...TINT);
  doc.rect(M, boxTop, CONTENT_W, boxH, 'F');

  const closing = Number(s.closingBalance) || 0;
  const cells = [
    { label: 'Opening balance', value: money(s.openingBalance) },
    { label: 'Total debit', value: money(s.totalDebit) },
    { label: 'Total credit', value: money(s.totalCredit) },
    {
      label: closing >= 0 ? 'Closing (receivable)' : 'Closing (advance)',
      value: money(Math.abs(closing)),
      color: closing >= 0 ? ACCENT : DANGER,
      strong: true,
    },
  ];

  const cellW = CONTENT_W / cells.length;
  cells.forEach((cell, index) => {
    const x = M + cellW * index;
    if (index) {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(x, boxTop + 3, x, boxTop + boxH - 3);
    }
    label(doc, cell.label, x + 4, boxTop + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cell.strong ? 12 : 11);
    doc.setTextColor(...(cell.color || INK));
    doc.text(cell.value, x + 4, boxTop + 12.4);
  });

  y = boxTop + boxH;
  hairline(doc, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('LEDGER ENTRIES', M, y, { charSpace: 0.5 });
  textRight(doc, 'Amounts in INR', PAGE_W - M, y);

  return y + 2.5;
}

function drawContinuationHeader(doc, s, carried) {
  const y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(s.partyName || '—', M, y, { maxWidth: CONTENT_W * 0.55 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  textRight(doc, `${periodText(s)}  ·  continued`, PAGE_W - M, y);

  if (carried != null) {
    doc.setFontSize(7.6);
    doc.text(`Balance brought forward   ${money(carried)}`, M, y + 4.2);
  }
  hairline(doc, y + 6.4);
}

function drawFooter(doc, pageNo, pageCount) {
  const y = PAGE_H - 14;
  hairline(doc, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    'Computer generated statement — no signature required. Please report any discrepancy within 7 days.',
    M,
    y + 4.4
  );
  textRight(doc, `Page ${pageNo} of ${pageCount}`, PAGE_W - M, y + 4.4);
}

function drawClosing(doc, s, profile, qrDataUrl, startY) {
  const closing = Number(s.closingBalance) || 0;
  const receivable = closing >= 0;
  const showQr = Boolean(qrDataUrl) && receivable && closing > 0;
  const blockH = showQr ? 38 : 22;

  let y = startY + 8;
  if (y + blockH > PAGE_H - BOTTOM) {
    doc.addPage();
    y = CONT_TOP;
  }

  const qrW = showQr ? 34 : 0;
  const boxX = M + qrW;
  const boxW = CONTENT_W - qrW;
  const barH = 18;

  doc.setFillColor(...TINT);
  doc.rect(boxX, y, boxW, barH, 'F');
  doc.setFillColor(...(receivable ? ACCENT : DANGER));
  doc.rect(boxX, y, 1.4, barH, 'F');

  label(
    doc,
    receivable ? 'Closing balance receivable' : 'Closing balance (advance / payable)',
    boxX + 6,
    y + 8
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...(receivable ? ACCENT : DANGER));
  textRight(doc, money(Math.abs(closing)), boxX + boxW - 6, y + 12.6);

  if (showQr) {
    const qr = 26;
    doc.addImage(qrDataUrl, 'PNG', M, y, qr, qr);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text('SCAN TO PAY', M, y + 30, { charSpace: 0.4 });
    doc.setFontSize(7);
    doc.text(String(profile.upiId || ''), M, y + 34, { maxWidth: qr + 6 });
  }

  return y + blockH;
}

export async function buildStatementPdf(statement, profile = {}, qrDataUrl = '') {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const s = statement || {};
  const rows = Array.isArray(s.rows) ? s.rows : [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setProperties({
    title: `Account Statement — ${s.partyName || ''}`,
    subject: 'Account statement',
    author: profile.name || '',
  });

  const tableTop = drawFirstPageHeader(doc, s, profile);
  const opening = { opening: true, balance: Number(s.openingBalance) || 0 };
  const source = [opening, ...rows];
  if (!rows.length) source.push({ placeholder: true });

  const body = source.map((row) => {
    if (row.placeholder) {
      return [{
        content: 'No transactions in this period.',
        colSpan: 7,
        styles: { halign: 'center', textColor: MUTED, cellPadding: 6 },
      }];
    }
    if (row.opening) {
      return [{ content: 'Opening Balance', colSpan: 4 }, '', '', money(row.balance)];
    }
    return [
      row.txnNo ?? '',
      row.voucherNo || '—',
      row.dateStr || '',
      particularsCell(row),
      row.debit ? money(row.debit) : '',
      row.credit ? money(row.credit) : '',
      money(row.balance),
    ];
  });

  const firstRowOnPage = {};

  autoTable(doc, {
    head: [['Txn', 'Voucher', 'Date', 'Particulars / Details', 'Debit', 'Credit', 'Balance']],
    body,
    foot: rows.length
      ? [[
          { content: 'Total for the period', colSpan: 4 },
          money(s.totalDebit),
          money(s.totalCredit),
          money(s.closingBalance),
        ]]
      : undefined,
    showFoot: 'lastPage',
    startY: tableTop,
    margin: { top: CONT_TOP, left: M, right: M, bottom: BOTTOM },
    theme: 'plain',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.9,
      textColor: BODY,
      cellPadding: { top: 2.2, right: 2.4, bottom: 2.2, left: 2.4 },
      lineColor: LINE,
      lineWidth: { bottom: 0.15 },
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: INK,
      textColor: WHITE,
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: { top: 2.5, right: 2.4, bottom: 2.5, left: 2.4 },
      lineWidth: 0,
    },
    footStyles: {
      fillColor: TINT,
      textColor: INK,
      fontStyle: 'bold',
      fontSize: 8.2,
      lineWidth: { top: 0.5 },
      lineColor: INK,
    },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    columnStyles: {
      0: { cellWidth: 11 },
      1: { cellWidth: 21, textColor: ACCENT, fontStyle: 'bold' },
      2: { cellWidth: 20, overflow: 'visible' },
      3: { cellWidth: 58 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: INK },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 4) {
        data.cell.styles.halign = 'right';
      }
      if (data.section !== 'body') return;

      const src = source[data.row.index];
      if (!src || src.placeholder) return;

      if (src.opening) {
        data.cell.styles.fillColor = TINT;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = INK;
        return;
      }

      if (data.column.index === 3) {
        data.cell.styles.textColor = INK;
        data.cell.styles.fontStyle = 'normal';
        data.cell.styles.lineHeight = 1.25;
      }
      if (data.column.index === 6 && Number(src.balance) < 0) {
        data.cell.styles.textColor = DANGER;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;
      const page = doc.getCurrentPageInfo().pageNumber;
      if (firstRowOnPage[page] == null) firstRowOnPage[page] = data.row.index;
    },
  });

  const finalY = doc.lastAutoTable?.finalY ?? tableTop;
  drawClosing(doc, s, profile, qrDataUrl, finalY);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      const idx = firstRowOnPage[page];
      const prev = idx != null ? source[idx - 1] : null;
      drawContinuationHeader(doc, s, prev ? Number(prev.balance) : null);
    }
    drawFooter(doc, page, pageCount);
  }

  return doc;
}

export function svgToPngDataUrl(svg, size = 220) {
  return new Promise((resolve) => {
    try {
      if (!svg) return resolve('');
      const markup = new XMLSerializer().serializeToString(svg);
      const url = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(markup)))}`;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = url;
    } catch {
      resolve('');
    }
  });
}

export function statementFileName(partyName) {
  const safe = String(partyName || '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return safe ? `statement-${safe}.pdf` : 'statement.pdf';
}
