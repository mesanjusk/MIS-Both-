const {
  parsePositiveAmount,
  isValidObjectId,
  normalizeStatus,
  buildUpiLink,
  buildShareLink,
  sanitizeAttempt,
} = require('../../src/routes/UpiPayments');

describe('UpiPayments.parsePositiveAmount', () => {
  test('accepts a positive number and rounds to 2 decimals', () => {
    expect(parsePositiveAmount(100)).toBe(100);
    expect(parsePositiveAmount('99.999')).toBe(100);
  });

  test('rejects zero, negative, or non-numeric values', () => {
    expect(parsePositiveAmount(0)).toBeNull();
    expect(parsePositiveAmount(-5)).toBeNull();
    expect(parsePositiveAmount('abc')).toBeNull();
    expect(parsePositiveAmount(undefined)).toBeNull();
  });
});

describe('UpiPayments.isValidObjectId', () => {
  test('accepts a valid 24-char hex ObjectId', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });

  test('rejects an arbitrary string', () => {
    expect(isValidObjectId('not-an-object-id')).toBe(false);
  });
});

describe('UpiPayments.normalizeStatus', () => {
  test('trims and lowercases', () => {
    expect(normalizeStatus('  SUCCESS ')).toBe('success');
  });

  test('handles missing input', () => {
    expect(normalizeStatus(undefined)).toBe('');
  });
});

describe('UpiPayments.buildUpiLink', () => {
  test('builds a upi:// deep link with the required parameters', () => {
    const link = buildUpiLink({
      payeeUpiId: 'shop@upi',
      payeeName: 'My Shop',
      amount: 250,
      transactionRef: 'REF123',
    });
    expect(link).toMatch(/^upi:\/\/pay\?/);
    const params = new URLSearchParams(link.split('?')[1]);
    expect(params.get('pa')).toBe('shop@upi');
    expect(params.get('pn')).toBe('My Shop');
    expect(params.get('am')).toBe('250');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tr')).toBe('REF123');
  });

  test('includes the note as the tn param when provided', () => {
    const link = buildUpiLink({
      payeeUpiId: 'shop@upi',
      payeeName: 'My Shop',
      amount: 100,
      transactionRef: 'REF1',
      note: 'Order #42',
    });
    const params = new URLSearchParams(link.split('?')[1]);
    expect(params.get('tn')).toBe('Order #42');
  });

  test('returns an empty string when the payee VPA or name is missing', () => {
    expect(buildUpiLink({ payeeUpiId: '', payeeName: 'My Shop', amount: 100, transactionRef: 'R1' })).toBe('');
    expect(buildUpiLink({ payeeUpiId: 'shop@upi', payeeName: '', amount: 100, transactionRef: 'R1' })).toBe('');
  });
});

describe('UpiPayments.buildShareLink', () => {
  test('builds an absolute collect link from the request origin and transaction ref', () => {
    const req = { protocol: 'https', get: (header) => (header === 'host' ? 'example.com' : undefined) };
    expect(buildShareLink(req, 'REF 123')).toBe('https://example.com/upi/collect/REF%20123');
  });
});

describe('UpiPayments.sanitizeAttempt', () => {
  test('returns null for a null/undefined doc', () => {
    expect(sanitizeAttempt(null)).toBeNull();
    expect(sanitizeAttempt(undefined)).toBeNull();
  });

  test('projects only the known-safe fields from the document', () => {
    const doc = {
      _id: 'abc',
      payment_uuid: 'p1',
      amount: 100,
      status: 'success',
      transactionRef: 'REF1',
      rawResponse: { secret: 'internal-gateway-payload' },
      // A field that must NOT leak through if present on the underlying doc.
      __v: 3,
    };
    const sanitized = sanitizeAttempt(doc);
    expect(sanitized.payment_uuid).toBe('p1');
    expect(sanitized.amount).toBe(100);
    expect(sanitized.status).toBe('success');
    expect(sanitized).not.toHaveProperty('__v');
  });
});
