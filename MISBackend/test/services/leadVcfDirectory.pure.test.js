const { parseVcf } = require('../../src/services/leadVcfService');
jest.mock('../../src/repositories/contact');
jest.mock('../../src/repositories/appSetting');
const Contact = require('../../src/repositories/contact');
const { importVcf, updatePhoneLeadName, decorateLeads } = require('../../src/services/leadContactDirectoryService');

const card = (name, phone) => [
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:' + name,
  'TEL;TYPE=CELL:' + phone, 'END:VCARD', '',
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  Contact.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  Contact.bulkWrite.mockResolvedValue({ ok: 1 });
  Contact.updateOne.mockResolvedValue({ acknowledged: true });
});

test('VCF extracts international/Indian numbers and deduplicates repeated entries', () => {
  const result = parseVcf(
    card('Lead One', '+91 98765 43210') +
    card('Duplicate name', '09876543210') +
    card('Lead Two', '+14155552671')
  );
  expect(result.cards).toBe(3);
  expect(result.contacts).toEqual([
    { phone: '9876543210', vcfName: 'Lead One' },
    { phone: '+14155552671', vcfName: 'Lead Two' },
  ]);
});

test('supports folded Unicode lines and fallback N field', () => {
  const result = parseVcf([
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:प्रिया ',
    ' शर्मा', 'TEL;VALUE=uri:tel:+919876543210', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Patel;Anil;;;',
    'TEL;TYPE=CELL:9988776655', 'END:VCARD',
  ].join('\r\n'));
  expect(result.contacts).toEqual([
    { phone: '9876543210', vcfName: 'प्रिया शर्मा' },
    { phone: '9988776655', vcfName: 'Anil Patel' },
  ]);
});

test('parses 7,500 contacts without truncation', () => {
  const large = Array.from({ length: 7500 }, (_, n) =>
    card('Person ' + n, String(6000000000 + n))
  ).join('');
  const parsed = parseVcf(large);
  expect(parsed.cards).toBe(7500);
  expect(parsed.contacts).toHaveLength(7500);
});

test('VCF writes only vcfName and import timestamp; never customer or manual lead name', async () => {
  const outcome = await importVcf(Buffer.from(
    card('VCF label', '9876543210') + card('Another', '9876543211')
  ));
  expect(outcome.added).toBe(2);
  expect(Contact.bulkWrite).toHaveBeenCalledTimes(1);
  const ops = Contact.bulkWrite.mock.calls[0][0];
  expect(ops).toHaveLength(2);
  for (const op of ops) {
    expect(Object.keys(op.updateOne.update.$set).sort()).toEqual(['leadLastImportedAt', 'vcfName']);
    expect(JSON.stringify(op)).not.toMatch(/Customer_name|customerUuid|leadName"/);
  }
});

test('manual lead name uses a separate field and does not change WhatsApp Contact.name', async () => {
  await updatePhoneLeadName('+91 9876543210', 'Sales prospect');
  const update = Contact.updateOne.mock.calls[0][1];
  expect(update.$set).toEqual({ leadName: 'Sales prospect' });
  expect(JSON.stringify(update)).not.toContain('Customer_name');
  expect(JSON.stringify(update)).not.toContain('"name"');
});

test('manual Lead Name takes precedence over VCF and message contact name', () => {
  const rows = decorateLeads([
    {
      id: 'phone:9876543210', name: 'Message Contact', phone: '9876543210',
      instagramId: '', instagramHandle: '', sources: ['whatsapp'],
      firstContact: { source: 'whatsapp', at: '2026-10-10T10:00:00.000Z' },
      lastContact: { source: 'whatsapp', at: '2026-10-10T10:00:00.000Z' },
      interactions: 1, history: [],
    },
  ], {
    phones: new Map([['9876543210', { phone: '9876543210', leadName: 'Manual Lead', vcfName: 'Phone Book Label' }]]),
    instagramNames: new Map(),
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe('Manual Lead');
  expect(rows[0].vcfName).toBe('Phone Book Label');
  expect(rows[0].firstContact.source).toBe('whatsapp');
});

test('imported contact without a conversation does not falsely claim first contact', () => {
  const rows = decorateLeads([], {
    phones: new Map([['9876543210', { phone: '9876543210', leadName: '', vcfName: 'VCard Label' }]]),
    instagramNames: new Map(),
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: 'VCard Label', directoryOnly: true, interactions: 0, sources: [], firstContact: null });
});
