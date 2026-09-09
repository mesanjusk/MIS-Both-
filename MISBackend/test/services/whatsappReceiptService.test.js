const {
  isScreenshotImage,
  parsePaymentOcr,
  handleIncomingScreenshotReceipt,
  DEFAULT_PAYEE_UPI_ID,
  DEFAULT_PAYEE_NAME,
} = require('../../src/services/whatsappReceiptService');

describe('whatsappReceiptService.isScreenshotImage', () => {
  test('accepts an explicit image type', () => {
    expect(isScreenshotImage({ type: 'image' })).toBe(true);
  });

  test('accepts an image mime with no type set', () => {
    expect(isScreenshotImage({}, 'image/jpeg')).toBe(true);
  });

  test('rejects non-image types', () => {
    expect(isScreenshotImage({ type: 'document' }, 'application/pdf')).toBe(false);
    expect(isScreenshotImage({ type: 'audio' })).toBe(false);
  });

  test('rejects when neither type nor mime indicate an image', () => {
    expect(isScreenshotImage({}, '')).toBe(false);
  });
});

describe('whatsappReceiptService.parsePaymentOcr', () => {
  test('parses a clean payment JSON object', () => {
    const raw = JSON.stringify({
      is_payment: true,
      amount: '1,234.50',
      reference_id: '4567890',
      paid_at: '9 Sep 2026, 4:05 PM',
      payer_name: 'Ramesh',
      payee_name: 'Sanju SK',
      app: 'Google Pay',
      status: 'Completed',
    });
    const result = parsePaymentOcr(raw);
    expect(result.isPayment).toBe(true);
    expect(result.amount).toBe(1234.5);
    expect(result.referenceId).toBe('4567890');
    expect(result.app).toBe('Google Pay');
  });

  test('tolerates code fences / stray prose around the JSON', () => {
    const raw = 'Here is the result:\n```json\n{"is_payment": true, "amount": 500}\n```';
    const result = parsePaymentOcr(raw);
    expect(result.isPayment).toBe(true);
    expect(result.amount).toBe(500);
  });

  test('treats a non-payment image as not a payment', () => {
    expect(parsePaymentOcr('{"is_payment": false, "amount": null}').isPayment).toBe(false);
  });

  test('rejects a payment with zero/invalid amount even if flagged', () => {
    expect(parsePaymentOcr('{"is_payment": true, "amount": 0}').isPayment).toBe(false);
    expect(parsePaymentOcr('{"is_payment": true, "amount": "abc"}').isPayment).toBe(false);
  });

  test('degrades to not-a-payment on malformed or empty input', () => {
    expect(parsePaymentOcr('not json at all').isPayment).toBe(false);
    expect(parsePaymentOcr('').isPayment).toBe(false);
    expect(parsePaymentOcr(undefined).isPayment).toBe(false);
  });
});

describe('whatsappReceiptService.handleIncomingScreenshotReceipt', () => {
  const baseDeps = () => ({
    resolveCustomer: jest.fn().mockResolvedValue({
      Customer_uuid: 'cust-1',
      _id: 'id-1',
      Customer_name: 'Ramesh Kumar',
    }),
    downloadImage: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    runOcr: jest.fn().mockResolvedValue(
      JSON.stringify({ is_payment: true, amount: 1500, reference_id: 'UTR123' })
    ),
    findExistingByReference: jest.fn().mockResolvedValue(null),
    createReceipt: jest.fn().mockImplementation(async (doc) => doc),
    render: jest.fn().mockResolvedValue({ body: 'receipt body' }),
    resolvePayee: jest
      .fn()
      .mockResolvedValue({ upiId: 'sanjusk', payeeName: 'Sanju SK', businessName: 'Sanju SK' }),
    generateReceiptNumber: jest.fn().mockResolvedValue('PR-20260909-0001'),
  });

  const payload = { from: '919876543210', type: 'image', messageId: 'wamid.1' };

  test('issues a provisional receipt for a payment screenshot from a known customer', async () => {
    const deps = baseDeps();
    const sendText = jest.fn().mockResolvedValue(undefined);

    const result = await handleIncomingScreenshotReceipt({
      payload,
      mediaUrl: 'https://cdn.example/img.jpg',
      mimeType: 'image/jpeg',
      sendText,
      deps,
    });

    expect(result.handled).toBe(true);
    expect(result.receiptNumber).toBe('PR-20260909-0001');
    expect(result.amount).toBe(1500);

    expect(deps.createReceipt).toHaveBeenCalledTimes(1);
    const saved = deps.createReceipt.mock.calls[0][0];
    expect(saved.status).toBe('provisional');
    expect(saved.amount).toBe(1500);
    expect(saved.payeeUpiId).toBe('sanjusk');
    expect(saved.customerUuid).toBe('cust-1');

    expect(sendText).toHaveBeenCalledWith({ to: '919876543210', body: 'receipt body' });
  });

  test('skips silently when the sender is not a known customer', async () => {
    const deps = baseDeps();
    deps.resolveCustomer.mockResolvedValue(null);
    const sendText = jest.fn();

    const result = await handleIncomingScreenshotReceipt({
      payload,
      mediaUrl: 'https://cdn.example/img.jpg',
      sendText,
      deps,
    });

    expect(result).toEqual({ handled: false, reason: 'no_customer' });
    expect(deps.runOcr).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  test('skips a non-payment image without sending anything', async () => {
    const deps = baseDeps();
    deps.runOcr.mockResolvedValue('{"is_payment": false, "amount": null}');
    const sendText = jest.fn();

    const result = await handleIncomingScreenshotReceipt({
      payload,
      mediaUrl: 'https://cdn.example/img.jpg',
      sendText,
      deps,
    });

    expect(result).toEqual({ handled: false, reason: 'not_payment' });
    expect(deps.createReceipt).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  test('does not issue a duplicate receipt for a resent screenshot', async () => {
    const deps = baseDeps();
    deps.findExistingByReference.mockResolvedValue({ receiptNumber: 'PR-20260909-0009' });
    const sendText = jest.fn();

    const result = await handleIncomingScreenshotReceipt({
      payload,
      mediaUrl: 'https://cdn.example/img.jpg',
      sendText,
      deps,
    });

    expect(result.reason).toBe('duplicate');
    expect(result.receiptNumber).toBe('PR-20260909-0009');
    expect(deps.createReceipt).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  test('skips non-image payloads', async () => {
    const result = await handleIncomingScreenshotReceipt({
      payload: { from: '919876543210', type: 'document' },
      mediaUrl: 'https://cdn.example/doc.pdf',
      mimeType: 'application/pdf',
      sendText: jest.fn(),
      deps: baseDeps(),
    });
    expect(result).toEqual({ handled: false, reason: 'not_image' });
  });

  test('skips and reports when OCR/download throws', async () => {
    const deps = baseDeps();
    deps.downloadImage.mockRejectedValue(new Error('network down'));
    const sendText = jest.fn();

    const result = await handleIncomingScreenshotReceipt({
      payload,
      mediaUrl: 'https://cdn.example/img.jpg',
      sendText,
      deps,
    });

    expect(result).toEqual({ handled: false, reason: 'ocr_failed' });
    expect(sendText).not.toHaveBeenCalled();
  });

  test('falls back to default UPI payee constants when none injected differently', () => {
    expect(DEFAULT_PAYEE_UPI_ID).toBe('sanjusk');
    expect(DEFAULT_PAYEE_NAME).toBe('Sanju SK');
  });
});
