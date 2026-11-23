import { jsPDF } from 'jspdf';

const PAGE_MM = { portrait: [210, 297], landscape: [297, 210] };
const currency = number => {
  const amount = Number(number);
  return Number.isFinite(amount) ? 'Rs. ' + (Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)) + '/-' : 'Rs. 0/-';
};
const clean = value => String(value ?? '').replace(/[\r\n]/g, ' ').trim();

export function getLabelLayout({ columns, rows, orientation = 'portrait' }) {
  const cols = Number(columns);
  const rowCount = Number(rows);
  if (!Number.isSafeInteger(cols) || cols < 1 || cols > 8 ||
      !Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 12 ||
      !PAGE_MM[orientation]) {
    throw new Error('Select 1-8 columns, 1-12 rows and A4 orientation.');
  }
  const [pageWidth, pageHeight] = PAGE_MM[orientation];
  const margin = 7;
  const gutter = 1.8;
  const labelWidth = (pageWidth - 2 * margin - (cols - 1) * gutter) / cols;
  const labelHeight = (pageHeight - 2 * margin - (rowCount - 1) * gutter) / rowCount;
  if (labelWidth < 26 || labelHeight < 19) {
    throw new Error('Labels would be too small. Reduce rows/columns or change orientation.');
  }
  return {
    pageWidth, pageHeight, margin, gutter, labelWidth, labelHeight,
    columns: cols, rows: rowCount, perPage: cols * rowCount, orientation,
  };
}

function drawWeddingLabel(pdf, x, y, width, height, item) {
  const pad = Math.min(3.2, Math.max(1.4, width * 0.055));
  const titleSize = Math.max(7, Math.min(13.5, Math.min(width / 5.2, height / 3.3)));
  const codeSize = Math.max(6.5, Math.min(13, width / 5));
  const priceSize = Math.max(8, Math.min(16, Math.min(width / 4.25, height / 2.5)));
  pdf.setDrawColor(201, 137, 31);
  pdf.setFillColor(255, 252, 247);
  pdf.setLineWidth(0.55);
  pdf.roundedRect(x, y, width, height, 1.6, 1.6, 'FD');
  pdf.setFillColor(218, 142, 34);
  pdf.rect(x + 1.25, y + 1.2, width - 2.5, 1.1, 'F');
  pdf.setTextColor(98, 54, 8);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(titleSize);
  pdf.text('SK (' + clean(item.brand) + ')', x + pad, y + 5.3 + titleSize * 0.2);
  pdf.setTextColor(169, 35, 28);
  pdf.setFontSize(titleSize * 0.92);
  pdf.text(clean(item.code), x + width - pad, y + 5.3 + titleSize * 0.2, { align: 'right' });

  if (item.codedPrice) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(87, 63, 28);
    pdf.setFontSize(codeSize);
    pdf.text(clean(item.codedPrice), x + width / 2, y + height * 0.51, { align: 'center' });
  } else {
    pdf.setTextColor(91, 78, 60);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(Math.max(5.5, titleSize * 0.65));
    pdf.text('Wedding Card', x + width / 2, y + height * 0.51, { align: 'center' });
  }
  pdf.setDrawColor(224, 193, 144);
  pdf.setLineWidth(0.16);
  const lineY = y + height * 0.63;
  pdf.line(x + pad, lineY, x + width - pad, lineY);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(166, 35, 28);
  pdf.setFontSize(priceSize);
  const text = currency(item.price);
  const finalSize = Math.min(priceSize, priceSize * (width - 2 * pad) / Math.max(width - 2 * pad, pdf.getTextWidth(text)));
  pdf.setFontSize(finalSize);
  pdf.text(text, x + width / 2, y + height - Math.max(2.5, height * 0.095), { align: 'center' });
}

function drawGeneralLabel(pdf, x, y, width, height, item) {
  const pad = 3;
  pdf.setDrawColor(185, 133, 45);
  pdf.setFillColor(255, 253, 248);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(x, y, width, height, 1.6, 1.6, 'FD');
  pdf.setTextColor(124, 79, 24);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.max(7, Math.min(11, width / 5)));
  pdf.text('SK DIGITAL', x + width / 2, y + 5.8, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(40, 40, 40);
  const labelSize = Math.max(6, Math.min(9.5, width / 6));
  pdf.setFontSize(labelSize);
  const lines = pdf.splitTextToSize(clean(item.name), width - 2 * pad).slice(0, 2);
  pdf.text(lines, x + width / 2, y + height * 0.41, { align: 'center' });
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(173, 47, 31);
  const titlePrice = currency(item.price);
  const targetSize = Math.max(8, Math.min(12, width / 4.8));
  pdf.setFontSize(targetSize);
  const measure = Math.max(1, pdf.getTextWidth(titlePrice));
  pdf.setFontSize(Math.min(targetSize, targetSize * (width - pad * 2) / measure));
  pdf.text(titlePrice, x + width / 2, y + height - 3.4, { align: 'center' });
}

// The six-line job slip in the supplied reference needs more space than a
// simple price tag. Preserve each selected/unchecked box and every line total.
export function isWeddingJobLayoutLegible(layout) {
  return Boolean(layout && layout.labelWidth >= 78 && layout.labelHeight >= 47);
}

const compactAmount = value => {
  const amount = Number(value) || 0;
  return 'Rs.' + (Number.isInteger(amount) ? String(amount) : amount.toFixed(2));
};
const quantityText = qty => Number.isInteger(Number(qty))
  ? String(qty) : Number(qty).toFixed(2);

function drawWeddingJobLabel(pdf, x, y, width, height, item) {
  const pad = 2.5;
  pdf.setDrawColor(80, 80, 80);
  pdf.setFillColor(255, 255, 255);
  pdf.setTextColor(35, 35, 35);
  pdf.setLineWidth(0.22);
  pdf.rect(x, y, width, height, 'S');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(10.5, width / 8.8));
  pdf.text('SK(' + clean(item.brand) + ')  ' + clean(item.code), x + pad, y + 7.5);
  if (item.codedPrice) {
    pdf.setFontSize(8.2);
    pdf.text(clean(item.codedPrice), x + width - pad, y + 7.5, { align: 'right' });
  }
  pdf.line(x + pad, y + 9.5, x + width - pad, y + 9.5);
  const rows = Array.isArray(item.lines) ? item.lines : [];
  const defaults = ['card', 'design', 'printing', 'packing', 'nameLabel', 'other'];
  const titles = {
    card: 'CARD RATE', design: 'DESIGNING', printing: 'PRINTING',
    packing: 'PACKING', nameLabel: 'NAME LABEL', other: 'OTHER'
  };
  const top = y + 11.1;
  const footerRule = y + height - 9.1;
  const lineHeight = (footerRule - top) / 6;
  // Fixed proportional columns match the sample: Checkbox/Service, Qty, Rate, Total.
  const qtyX = x + width * 0.51;
  const rateX = x + width * 0.76;
  const totalX = x + width - pad;
  defaults.forEach((key, index) => {
    const row = rows.find(value => value.key === key) || {
      selected: false, qty: 0, rate: 0, total: 0, label: titles[key]
    };
    const baseline = top + lineHeight * index + lineHeight * .66;
    const square = Math.min(2.7, lineHeight * .60);
    const left = x + pad;
    pdf.setLineWidth(0.20);
    pdf.rect(left, baseline - square + .45, square, square, 'S');
    if (row.selected) {
      pdf.setLineWidth(0.28);
      pdf.line(left + .55, baseline - .35, left + square * .43, baseline + .16);
      pdf.line(left + square * .43, baseline + .16, left + square - .45, baseline - square + .96);
    }
    const title = key === 'other'
      ? clean(row.label || 'Other').toUpperCase().slice(0, 24)
      : titles[key];
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.1);
    const maxLabel = qtyX - (left + 4.1) - 1;
    const labelWidth = Math.max(1, pdf.getTextWidth(title));
    pdf.setFontSize(Math.max(5.4, Math.min(7.1, 7.1 * maxLabel / labelWidth)));
    pdf.text(title, left + 4.1, baseline);
    pdf.setFontSize(6.4);
    pdf.text(quantityText(row.qty), qtyX, baseline, { align: 'center' });
    const rate = compactAmount(row.rate);
    const rowTotal = row.selected ? compactAmount(row.total) : '--';
    const rateMax = rateX - qtyX - 5;
    const rateWidth = Math.max(1, pdf.getTextWidth(rate));
    pdf.setFontSize(Math.max(5, Math.min(6.4, 6.4 * rateMax / rateWidth)));
    pdf.text(rate, rateX, baseline, { align: 'right' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.8);
    const lastWidth = Math.max(1, pdf.getTextWidth(rowTotal));
    const lastMax = totalX - rateX - 1.5;
    pdf.setFontSize(Math.max(4.8, Math.min(6.8, 6.8 * lastMax / lastWidth)));
    pdf.text(rowTotal, totalX, baseline, { align: 'right' });
  });
  pdf.setLineWidth(.25);
  pdf.line(x + pad, footerRule, x + width - pad, footerRule);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.1);
  const days = item.deliveryDays == null || item.deliveryDays === ''
    ? '____' : String(item.deliveryDays);
  pdf.text('Delivery ' + days + ' days', x + pad, y + height - 3.25);
  const grand = 'Grand Total ' + compactAmount(item.grandTotal);
  const grandMax = width * .55;
  const grandWidth = Math.max(1, pdf.getTextWidth(grand));
  pdf.setFontSize(Math.max(5.4, Math.min(7.1, 7.1 * grandMax / grandWidth)));
  pdf.text(grand, x + width - pad, y + height - 3.25, { align: 'right' });
}

export function buildRateLabelPdf({ item, columns = 3, rows = 7, orientation = 'portrait', count = 21 }) {
  const geometry = getLabelLayout({ columns, rows, orientation });
  if (item?.type === 'job' && !isWeddingJobLayoutLegible(geometry)) {
    throw new Error('Itemized job slips need at least 78 x 47 mm. Reduce rows/columns.');
  }
  const repeats = Number(count);
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 5000) {
    throw new Error('Choose between 1 and 5,000 labels.');
  }
  const price = Number(item?.price);
  if (!item || !Number.isFinite(price) || price < 0) {
    throw new Error('Calculate a valid item price before exporting labels.');
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  // One consistent grid for all pages, with no blank labels inserted.
  for (let i = 0; i < repeats; i++) {
    if (i && i % geometry.perPage === 0) pdf.addPage();
    const local = i % geometry.perPage;
    const col = local % geometry.columns;
    const row = Math.floor(local / geometry.columns);
    const x = geometry.margin + col * (geometry.labelWidth + geometry.gutter);
    const y = geometry.margin + row * (geometry.labelHeight + geometry.gutter);
    if (item.type === 'job') drawWeddingJobLabel(pdf, x, y, geometry.labelWidth, geometry.labelHeight, item);
    else if (item.type === 'wedding') drawWeddingLabel(pdf, x, y, geometry.labelWidth, geometry.labelHeight, item);
    else drawGeneralLabel(pdf, x, y, geometry.labelWidth, geometry.labelHeight, item);
  }
  return pdf;
}

export function downloadRateLabelPdf(options) {
  const pdf = buildRateLabelPdf(options);
  const item = options.item || {};
  const labelName = (item.type === 'wedding' || item.type === 'job')
    ? 'SK_' + clean(item.brand) + '_' + clean(item.code)
    : 'SK_' + clean(item.name).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 42);
  pdf.save(labelName + '_A4_' + options.columns + 'x' + options.rows + '_labels.pdf');
}
