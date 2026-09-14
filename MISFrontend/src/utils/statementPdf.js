// Vector A4 account statement.
//
// The statement used to be a screenshot: html2canvas painted the preview and
// jsPDF embedded it as a JPEG. That produced a heavy, soft, unselectable file
// whose table header sometimes drifted over the rows. This builds the sheet
// with real PDF text instead — crisp at any zoom, searchable, a few KB, and
// laid out the way a bank statement is: a quiet letterhead, hairline rules,
// one accent colour and numbers that line up.

// A4, in millimetres — the unit the document is built in.
const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;                      // side margin
const CONTENT_W = PAGE_W - M * 2;  // 178
const CONT_TOP = 30;               // where the table resumes on later pages
const BOTTOM = 20;                 // reserved for the footer rule and page no.

const INK = [17, 24, 39];
const BODY = [55, 65, 81];
const MUTED = [107, 114, 128];
const LINE = [226, 232, 240];
const RULE = [203, 213, 225];
const ACCENT = [29, 78, 216];
const TINT = [248, 250, 252];
const DANGER = [185, 28, 28];

export const money = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The built-in PDF fonts have no rupee glyph, so amounts are labelled in words
// ("Amounts in INR") rather than printed with a symbol that would come out as
// a box on half the readers.

/** Right-aligned text with optional letter spacing (jsPDF ignores charSpace
 *  when it aligns, so the width is measured here instead). */
function textRight(doc, text, x, y, charSpace = 0) {
  const str = String(text ?? '');
  if (!charSpace) {
    doc.text(str, x, y, { align: 'right' });
    return;
  }
  const w = doc.getTextWidth(str) + charSpace * Math.max(str.length - 1, 0);
  doc.text(str, x - w, y, { charSpace });
}

/** Small uppercase field label — the quiet grey caption above a value. */
function label(doc, text, x, y, { align = 'left' } = {}) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(...MUTED);
  if (align === 'right') textRight(doc, String(text).toUpperCase(), x, y, 0.5);
  else doc.text(String(text).toUpperCase(), x, y, { charSpace: 0.5 });
}

function hairline(doc, y, color = LINE, width = 0.2) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(M, y, PAGE_W - M, y);
}

/** Letterhead, party block and the four-figure summary. Returns the Y the
 *  ledger table should start at. */
function drawFirstPageHeader(doc, s, p) {
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(p.name || '', M, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  textRight(doc, 'ACCOUNT STATEMENT', PAGE_W - M, y, 1.4);

  y += 4.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);

  const addr = (p.addressLines || []).filter(Boolean).join(', ');
  const contact = [p.phone && `Tel ${p.phone}`, p.email].filter(Boolean).join('   ·   ');
  const lines = [addr, contact, p.gst && `GSTIN ${p.gst}`].filter(Boolean);
  for (const line of lines) {
    doc.text(line, M, y, { maxWidth: CONTENT_W * 0.62 });
    y += 3.7;
  }

  // Rule under the letterhead, with a short accent tab at the left edge.
  y += 1.6;
  hairline(doc, y, RULE, 0.3);
  doc.setFillColor(...ACCENT);
  doc.rect(M, y - 0.45, 24, 0.9, 'F');

  // ── Party and period ─────────────────────────────────────────────
  y += 8;
  label(doc, 'Statement for', M, y);
  label(doc, 'Period', PAGE_W - M, y, { align: 'right' });

  y += 5.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(s.partyName || '—', M, y, { maxWidth: CONTENT_W * 0.6 });

  doc.setFontSize(9.5);
  const period =
    s.periodFrom || s.periodTo
      ? `${s.periodFrom || 'Beginning'}  to  ${s.periodTo || 'Till date'}`
      : 'All dates';
  textRight(doc, period, PAGE_W - M, y);

  y += 4.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (s.partyMobile) doc.text(String(s.partyMobile), M, y);
  if (s.generatedOn) textRight(doc, `Generated on ${s.generatedOn}`, PAGE_W - M, y);

  // ── Summary: opening, debit, credit, closing ─────────────────────
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
  cells.forEach((cell, i) => {
    const x = M + cellW * i;
    if (i) {
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

/** Slim running header for pages two and up. */
function drawContinuationHeader(doc, s, carried) {
  const y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(s.partyName || '—', M, y, { maxWidth: CONTENT_W * 0.55 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const period =
    s.periodFrom || s.periodTo
      ? `${s.periodFrom || 'Beginning'} to ${s.periodTo || 'Till date'}`
      : 'All dates';
  textRight(doc, `${period}  ·  continued`, PAGE_W - M, y);

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

/** Closing-balance callout plus, when the party owes money, the UPI block. */
function drawClosing(doc, s, p, qrDataUrl, startY) {
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

  label(doc, receivable ? 'Closing balance receivable' : 'Closing balance (advance / payable)', boxX + 6, y + 8);
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
    doc.text(String(p.upiId || ''), M, y + 34, { maxWidth: qr + 6 });
  }

  return y + blockH;
}

/**
 * Build the statement as a jsPDF document.
 *
 * @param {object} statement  partyName, period, totals and rows
 * @param {object} profile    business letterhead
 * @param {string} [qrDataUrl] PNG data URL of the UPI QR, when there is one
 */
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

  // The opening balance leads the ledger, the way a passbook opens.
  const opening = { opening: true, balance: Number(s.openingBalance) || 0 };
  const source = [opening, ...rows];
  if (!rows.length) source.push({ placeholder: true });

  const body = source.map((r) =>
    r.placeholder
      ? [{
          content: 'No transactions in this period.',
          colSpan: 7,
          styles: { halign: 'center', textColor: MUTED, cellPadding: 6 },
        }]
      : r.opening
      ? [{ content: 'Opening Balance', colSpan: 4 }, '', '', money(r.balance)]
      : [
          r.txnNo ?? '',
          r.voucherNo || '—',
          r.dateStr || '',
          r.particulars || '—',
          r.debit ? money(r.debit) : '',
          r.credit ? money(r.credit) : '',
          money(r.balance),
        ]
  );

  // First body row drawn on each page, so a continuation page can say what
  // balance it carried in.
  const firstRowOnPage = {};

  autoTable(doc, {
    head: [['Txn', 'Voucher', 'Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
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
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      textColor: BODY,
      cellPadding: { top: 2, right: 2.4, bottom: 2, left: 2.4 },
      lineColor: LINE,
      lineWidth: { bottom: 0.15 },
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: INK,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: { top: 2.4, right: 2.4, bottom: 2.4, left: 2.4 },
      lineWidth: 0,
    },
    footStyles: {
      fillColor: TINT,
      textColor: INK,
      fontStyle: 'bold',
      fontSize: 8.4,
      lineWidth: { top: 0.5 },
      lineColor: INK,
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 24, textColor: ACCENT, fontStyle: 'bold' },
      2: { cellWidth: 21, overflow: 'visible' },
      3: { cellWidth: 49 },
      4: { cellWidth: 23, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: INK },
    },
    didParseCell: (data) => {
      // Money headings sit over right-aligned figures, so they align right too.
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
      if (data.column.index === 6 && Number(src.balance) < 0) {
        data.cell.styles.textColor = DANGER;
      }
      // Reserve a second line under the particulars for the narration.
      if (data.column.index === 3) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = INK;
        if (src.description && src.description !== src.particulars) {
          data.cell.styles.minCellHeight = 9;
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const page = doc.getCurrentPageInfo().pageNumber;
      if (data.column.index === 0 && firstRowOnPage[page] == null) {
        firstRowOnPage[page] = data.row.index;
      }
      if (data.column.index !== 3) return;

      const src = source[data.row.index];
      if (!src || src.opening || src.placeholder) return;
      if (!src.description || src.description === src.particulars) return;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      const wrapped = doc.splitTextToSize(String(src.description), data.cell.width - 4.8);
      const text = wrapped.length > 1 ? `${wrapped[0].trimEnd()}…` : wrapped[0];
      doc.text(text, data.cell.x + 2.4, data.cell.y + 7.6);
    },
  });

  const finalY = doc.lastAutoTable?.finalY ?? tableTop;
  drawClosing(doc, s, profile, qrDataUrl, finalY);

  // Continuation headers and footers are stamped last, once the page count and
  // each page's opening row are known.
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

/** Rasterise the preview's QR <svg> so it can be embedded in the PDF. */
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
  const safe = String(partyName || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return safe ? `statement-${safe}.pdf` : 'statement.pdf';
}
