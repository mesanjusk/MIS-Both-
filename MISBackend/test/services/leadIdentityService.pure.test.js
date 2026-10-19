const { normalizePhone, groupLeadEvents, explicitlySharedPhone } = require('../../src/services/leadIdentityService');

const event = (id, source, date, extra = {}) => ({
  id, source, at: date, ...extra,
});

describe('unified lead identity', () => {
  test('normalizes Indian WhatsApp and call number formats consistently', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone('invalid')).toBe('');
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
  });

  test('WhatsApp and repeated calls to the same mobile are one lead', () => {
    const joined = groupLeadEvents([
      event('wa1', 'whatsapp', '2026-10-17T10:00:00Z', { phone: '+919876543210', detail: 'Hello' }),
      event('call1', 'call', '2026-10-18T11:00:00Z', { phone: '9876543210', name: 'Client', detail: 'Incoming' }),
      event('wa2', 'whatsapp', '2026-10-19T08:00:00Z', { phone: '98765 43210', detail: 'Following up' }),
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({
      phone: '9876543210',
      name: 'Client',
      sources: ['call', 'whatsapp'],
      interactions: 3,
    });
    expect(joined[0].firstContact.source).toBe('whatsapp');
    expect(joined[0].lastContact.source).toBe('whatsapp');
  });

  test('Instagram first, then WhatsApp and call, merges with verified phone link', () => {
    const joined = groupLeadEvents([
      event('ig1', 'instagram', '2026-10-10T10:00:00Z', { instagramId: 'user_123', instagramHandle: 'client_one', detail: 'DM received' }),
      event('wa1', 'whatsapp', '2026-10-14T10:00:00Z', { phone: '9876543210' }),
      event('call1', 'call', '2026-10-16T10:00:00Z', { phone: '+919876543210' }),
    ], { user_123: '9876543210' });
    expect(joined).toHaveLength(1);
    expect(joined[0].sources).toEqual(['call', 'instagram', 'whatsapp']);
    expect(joined[0].firstContact.source).toBe('instagram');
    expect(joined[0].instagramHandle).toBe('client_one');
    expect(joined[0].phone).toBe('9876543210');
  });

  test('only explicit self-described phone numbers can bridge Instagram automatically', () => {
    expect(explicitlySharedPhone('My WhatsApp number is +91 98765 43210')).toBe('9876543210');
    expect(explicitlySharedPhone('Call me at 9876543210')).toBe('9876543210');
    expect(explicitlySharedPhone('Our shop: 9876543210')).toBe('');
    expect(explicitlySharedPhone('Order number 9876543210')).toBe('');
  });

  test('same name alone never merges unrelated people', () => {
    const joined = groupLeadEvents([
      event('ig1', 'instagram', '2026-10-12T10:00:00Z', { instagramId: '987', name: 'Raj' }),
      event('wa1', 'whatsapp', '2026-10-12T11:00:00Z', { phone: '9876543210', name: 'Raj' }),
    ]);
    expect(joined).toHaveLength(2);
  });

  test('re-reading the same provider message cannot duplicate interactions', () => {
    const same = event('whatsapp:msg1', 'whatsapp', '2026-10-14T10:00:00Z', { phone: '9876543210' });
    const joined = groupLeadEvents([same, same, { ...same }]);
    expect(joined).toHaveLength(1);
    expect(joined[0].interactions).toBe(1);
  });

  test('different Instagram people remain separate without confirmed identity', () => {
    const joined = groupLeadEvents([
      event('ig1', 'instagram', '2026-10-12T10:00:00Z', { instagramId: 'ig1' }),
      event('ig2', 'instagram', '2026-10-12T11:00:00Z', { instagramId: 'ig2' }),
    ]);
    expect(joined).toHaveLength(2);
  });
});
