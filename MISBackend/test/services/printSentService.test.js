const { matchingRecipients, normalizeRecipients, attachmentParts } = require('../../src/services/printSentService');
const { makeThumbnail } = require('../../src/services/printSentThumbnail');

test('matches only configured To recipients, including quoted display names', () => {
  const printers = normalizeRecipients([
    { email: ' PRINTER@example.com ', name: 'ABC Print' },
    { email: 'other@example.com' },
  ]);
  expect(matchingRecipients([
    { name: 'To', value: '"A, B" <Printer@example.com>, "other@example.com" <unrelated@example.com>' },
    { name: 'Cc', value: 'other@example.com' },
  ], printers)).toEqual([{ email: 'printer@example.com', name: 'ABC Print' }]);
  expect(() => normalizeRecipients([{ email: 'x@printer.com OR to:private@example.com' }])).toThrow();
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
