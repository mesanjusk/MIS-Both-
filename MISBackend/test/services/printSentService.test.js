const { sentRecipients, normalizeRecipients, attachmentParts, syncPrintSentAccount } = require('../../src/services/printSentService');
const { makeThumbnail } = require('../../src/services/printSentThumbnail');
const GmailAccount = require('../../src/repositories/GmailAccount');
const EmailHistory = require('../../src/repositories/EmailHistory');
const { getPrintSentClient } = require('../../src/services/gmailOAuthService');

jest.mock('../../src/services/gmailOAuthService', () => ({ getPrintSentClient: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

test('includes all recipients, deduplicates addresses, and keeps configured display names', () => {
  const printers = normalizeRecipients([
    { email: ' PRINTER@example.com ', name: 'ABC Print' },
    { email: 'other@example.com' },
  ]);
  expect(sentRecipients([
    { name: 'To', value: '"A, B" <Printer@example.com>, "other@example.com" <unrelated@example.com>' },
    { name: 'Cc', value: 'other@example.com, Printer@example.com' },
    { name: 'Bcc', value: 'Copies <copies@example.com>' },
    { name: 'From', value: 'sender@example.com' },
  ], printers)).toEqual([
    { email: 'printer@example.com', name: 'ABC Print' },
    { email: 'unrelated@example.com', name: 'other@example.com' },
    { email: 'other@example.com', name: 'other@example.com' },
    { email: 'copies@example.com', name: 'Copies' },
  ]);
  expect(() => normalizeRecipients([{ email: 'x@printer.com OR to:private@example.com' }])).toThrow();
});

test('backfills a previously filtered account and saves an email without attachments', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-25T15:00:00Z'));
  try {
    const account = {
      _id: 'account', accountId: 'gmail', printSentToken: 'encrypted', printRecipients: [],
      printSentCursor: new Date('2026-11-25T14:30:00Z'),
      printSentPageToken: 'old-filter', printSentWindowEnd: new Date('2026-11-25T14:45:00Z'),
    };
    jest.spyOn(GmailAccount, 'findOneAndUpdate').mockReturnValue({
      select: () => ({ lean: async () => account }),
    });
    jest.spyOn(GmailAccount, 'exists').mockResolvedValue(true);
    const checkpoint = jest.spyOn(GmailAccount, 'updateOne').mockResolvedValue({});
    jest.spyOn(EmailHistory, 'distinct').mockResolvedValue([]);
    const save = jest.spyOn(EmailHistory, 'updateOne').mockResolvedValue({});
    const list = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'message' }], nextPageToken: 'new-filter' } });
    const get = jest.fn().mockResolvedValue({ data: {
      labelIds: ['SENT'], internalDate: String(Date.now() - 60_000),
      payload: { headers: [{ name: 'To', value: 'New Printer <new@example.com>' }] },
    } });
    getPrintSentClient.mockReturnValue({ users: { messages: { list, get } } });

    expect(await syncPrintSentAccount(account._id)).toBe(true);
    const since = Date.parse('2026-11-18T18:28:00Z') / 1000;
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      labelIds: ['SENT'], q: `after:${since} before:${Date.now() / 1000}`, pageToken: undefined,
    }), expect.any(Object));
    expect(save).toHaveBeenCalledWith(expect.any(Object), { $setOnInsert: expect.objectContaining({
      toEmail: 'new@example.com', toName: 'New Printer', attachments: [],
    }) }, { upsert: true });
    expect(checkpoint).toHaveBeenCalledWith(expect.any(Object), { $set: expect.objectContaining({
      printSentSyncVersion: 2, printSentPageToken: 'new-filter',
    }) });
  } finally {
    jest.useRealTimers();
  }
});

test('enumerates nested attachments without inline signatures or forwarded attachments', () => {
  const file = { filename: 'card.pdf' };
  const signature = { filename: 'logo.png', headers: [{ name: 'Content-Disposition', value: 'inline; filename="logo.png"' }] };
  expect(attachmentParts({ parts: [signature, { parts: [file] }, { mimeType: 'message/rfc822', parts: [file] }] })).toEqual([file]);
});

test('converts an image to a bounded JPEG thumbnail and skips oversized files', async () => {
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 600, height: 300, channels: 3, background: 'red' } }).png().toBuffer();
  const part = { mimeType: 'image/png', body: { data: image.toString('base64url'), size: image.length } };
  const preview = await makeThumbnail(null, '1', part);
  const metadata = await sharp(Buffer.from(preview, 'base64')).metadata();
  expect(metadata).toMatchObject({ format: 'jpeg', width: 160, height: 80 });
  expect(await makeThumbnail(null, '1', { ...part, body: { size: 20_000_000 } })).toBe('');
});
