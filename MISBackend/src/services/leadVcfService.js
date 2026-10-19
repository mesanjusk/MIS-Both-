/**
 * VCF/vCard 2.1, 3.0, 4.0 reader used for lead-name directory imports.
 * Names are stored as vcfName in Contact, never as Customer.Customer_name.
 * Untrusted uploads are capped by the route before reaching this parser.
 */
const { normalizePhone } = require('./leadIdentityService');

function decodeQp(value) {
  try {
    const bytes = [];
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === '=' && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
        bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(...Buffer.from(value[i], 'utf8'));
      }
    }
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return value;
  }
}

function unescapeVcard(value) {
  return String(value || '').replace(/\\([nN,;\\])/g, (_match, char) =>
    char === 'n' || char === 'N' ? ' ' : char
  ).trim();
}

function unfold(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && result.length) {
      result[result.length - 1] += line.slice(1);
    } else if (result.length && result[result.length - 1].endsWith('=') &&
               /ENCODING=QUOTED-PRINTABLE/i.test(result[result.length - 1].split(':')[0])) {
      result[result.length - 1] = result[result.length - 1].slice(0, -1) + line;
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseVcf(content, { maxCards = 30000 } = {}) {
  const records = new Map();
  let cards = 0;
  let skipped = 0;
  let inCard = false;
  let name = '';
  let familyName = '';
  let numbers = [];
  for (const line of unfold(content)) {
    const text = line.trim();
    if (/^BEGIN:VCARD$/i.test(text)) {
      inCard = true; name = ''; familyName = ''; numbers = [];
      cards += 1;
      if (cards > maxCards) throw new Error('VCF contains too many contacts (maximum 30,000).');
      continue;
    }
    if (!inCard) continue;
    if (/^END:VCARD$/i.test(text)) {
      const display = (name || familyName).trim().slice(0, 120);
      if (!display) skipped += 1;
      for (const number of numbers) {
        const phone = normalizePhone(number);
        if (!phone || !display) { skipped += 1; continue; }
        // The first named record wins when a VCF repeats a number.
        if (!records.has(phone)) records.set(phone, display);
      }
      inCard = false;
      continue;
    }
    const colon = text.indexOf(':');
    if (colon < 0) continue;
    const field = text.slice(0, colon);
    const prop = field.split(';')[0].split('.').pop().toUpperCase();
    let value = text.slice(colon + 1);
    if (/ENCODING=QUOTED-PRINTABLE/i.test(field)) value = decodeQp(value);
    if (prop === 'FN') name = unescapeVcard(value);
    if (prop === 'N' && !familyName) {
      const parts = value.split(';');
      familyName = [parts[1], parts[0]].filter(Boolean).map(unescapeVcard).join(' ').trim();
    }
    if (prop === 'TEL') {
      if (/^tel:/i.test(value)) value = value.slice(4);
      numbers.push(value);
    }
  }
  return { contacts: [...records].map(([phone, vcfName]) => ({ phone, vcfName })), cards, skipped };
}

module.exports = { parseVcf, decodeQp };
