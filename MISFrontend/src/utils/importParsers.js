import * as XLSX from 'xlsx';

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeCell = (value) => {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  if (['nan', 'null', 'undefined'].includes(normalized.toLowerCase())) return '';
  return normalized;
};

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const isMeaningfulValue = (value) => {
  const normalized = normalizeCell(value);
  return normalized !== '' && normalized !== '-';
};

const buildOrderedRow = (row = {}, headers = []) =>
  Object.fromEntries(headers.map((header) => [header, normalizeCell(row?.[header])]));

const getAllHeadersInOrder = (rows = []) => {
  const orderedHeaders = [];

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    for (const key of Object.keys(rawRow || {})) {
      const normalizedKey = normalizeKey(key);
      if (normalizedKey && !orderedHeaders.includes(normalizedKey)) {
        orderedHeaders.push(normalizedKey);
      }
    }
  }

  return orderedHeaders;
};

const removeCompletelyEmptyRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).filter((row) =>
    Object.values(row || {}).some((value) => isMeaningfulValue(value))
  );

const getNonEmptyHeaders = (rows = [], headers = []) =>
  headers.filter((header) =>
    rows.some((row) => isMeaningfulValue(row?.[header]))
  );

export const parseTabularFile = async (file) => {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    const text = await file.text();
    const workbook = XLSX.read(text, { type: 'string' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const firstNonEmptySheetName =
    workbook.SheetNames.find((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      return Array.isArray(rows) && rows.length > 0;
    }) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[firstNonEmptySheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
};

const getPreferredSheet = (workbook) => {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  const preferredName =
    names.find((sheetName) => String(sheetName || '').trim().toLowerCase() === 'price_list_clean') ||
    names.find((sheetName) => String(sheetName || '').trim().toLowerCase().includes('price')) ||
    names.find((sheetName) => String(sheetName || '').trim().toLowerCase().includes('catalog'));

  const candidateNames = preferredName ? [preferredName, ...names.filter((name) => name !== preferredName)] : names;

  const firstNonEmpty = candidateNames.find((sheetName) => {
    const sheet = workbook.Sheets?.[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return (Array.isArray(matrix) ? matrix : []).some((row) =>
      (Array.isArray(row) ? row : []).some((cell) => normalizeCell(cell) !== '')
    );
  });

  return workbook?.Sheets?.[firstNonEmpty || candidateNames[0] || names[0]];
};

const extractRowsAndHeaders = (sheet) => {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const [headerRow = [], ...dataRows] = Array.isArray(matrix) ? matrix : [];

  const headers = (Array.isArray(headerRow) ? headerRow : []).map((header, index) => {
    const normalized = normalizeKey(header);
    return normalized || `Column ${index + 1}`;
  });

  const rows = (Array.isArray(dataRows) ? dataRows : []).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, normalizeCell((Array.isArray(row) ? row : [])[index])])
    )
  );

  return { headers, rows };
};

export const parseDynamicCatalogFile = async (file) => {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  const workbook =
    extension === 'csv'
      ? XLSX.read(await file.text(), { type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const sheet = getPreferredSheet(workbook);
  const { headers, rows } = extractRowsAndHeaders(sheet || {});
  return parsePriceCatalogRows(rows, { headerOrder: headers });
};

export const parseContactsFromRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const normalized = Object.fromEntries(
        Object.entries(row || {}).map(([key, value]) => [
          normalizeKey(key).toLowerCase(),
          value,
        ])
      );

      const phone = digitsOnly(
        normalized.phone ||
          normalized.mobile ||
          normalized.number ||
          normalized.whatsapp ||
          normalized.contact
      );

      return {
        name: String(
          normalized.name || normalized.customer || normalized.contactname || ''
        ).trim(),
        phone,
        tags: String(normalized.tags || '').trim(),
        assignedAgent: String(
          normalized.assignedagent || normalized.agent || ''
        ).trim(),
      };
    })
    .filter((item) => item.phone);

export const parsePriceCatalogRows = (
  rows = [],
  options = {}
) => {
  const {
    resultColumnCount = 2,
    explicitResultFields = [],
    headerOrder = [],
  } = options || {};

  const normalizedRawRows = (Array.isArray(rows) ? rows : []).map((raw) =>
    Object.fromEntries(
      Object.entries(raw || {}).map(([key, value]) => [
        normalizeKey(key),
        normalizeCell(value),
      ])
    )
  );

  const meaningfulRows = removeCompletelyEmptyRows(normalizedRawRows);
  const normalizedHeaderOrder = (Array.isArray(headerOrder) ? headerOrder : [])
    .map((header) => normalizeKey(header))
    .filter(Boolean);
  const fallbackHeaders = getAllHeadersInOrder(meaningfulRows);
  const allHeaders = normalizedHeaderOrder.length ? normalizedHeaderOrder : fallbackHeaders;
  const activeHeaders = getNonEmptyHeaders(meaningfulRows, allHeaders);

  const cleanedRows = meaningfulRows.map((row) => buildOrderedRow(row, activeHeaders));

  const validRows = cleanedRows.filter((row) =>
    activeHeaders.some((header) => isMeaningfulValue(row?.[header]))
  );

  let resultFields = [];
  let selectionFields = [];
  const lowerHeaders = activeHeaders.map((header) => header.toLowerCase());
  const hasRate = lowerHeaders.includes('rate');
  const deliveryAliases = new Set(['dispatch days', 'delivery', 'delivary']);
  const hasDelivery = lowerHeaders.some((header) => deliveryAliases.has(header));

  if (Array.isArray(explicitResultFields) && explicitResultFields.length > 0) {
    resultFields = explicitResultFields
      .map((field) => normalizeKey(field))
      .filter((field) => activeHeaders.includes(field));

    selectionFields = activeHeaders.filter(
      (header) => !resultFields.includes(header)
    );
  } else if (hasRate) {
    resultFields = activeHeaders.filter((header) => {
      const key = header.toLowerCase();
      return key === 'rate' || deliveryAliases.has(key);
    });
    if (!resultFields.length) {
      resultFields = activeHeaders.filter((header) => header.toLowerCase() === 'rate');
    }
    selectionFields = activeHeaders.filter((header) => !resultFields.includes(header));
  } else if (activeHeaders.length === 1) {
    selectionFields = [];
    resultFields = [activeHeaders[0]];
  } else if (activeHeaders.length === 2) {
    selectionFields = [activeHeaders[0]];
    resultFields = [activeHeaders[1]];
  } else {
    const safeResultCount = Math.min(Math.max(Number(resultColumnCount) || 2, 1), 2);
    selectionFields = activeHeaders.slice(0, activeHeaders.length - safeResultCount);
    resultFields = activeHeaders.slice(activeHeaders.length - safeResultCount);
  }

  const skippedEmptyFields = allHeaders.filter(
    (header) => !activeHeaders.includes(header)
  );

  return {
    headers: activeHeaders,
    selectionFields,
    resultFields,
    skippedEmptyFields,
    rows: validRows,
  };
};
