const { looksLikeNewEnquiry, deterministicClassification } = require('../../src/services/leadAiService');

const context = (text, orders = []) => ({
  chat: [{ direction: 'customer', text }],
  orders,
});

describe('lead AI evidence-based fallback', () => {
  test('recognises a new requirement without a price question', () => {
    expect(looksLikeNewEnquiry('I need 200 wedding invitation cards')).toBe(true);
    expect(deterministicClassification(context('I need 200 wedding invitation cards')).category)
      .toBe('new_lead');
  });

  test('recognises an explicit Hindi quote enquiry', () => {
    expect(looksLikeNewEnquiry('बैनर बनवाना है कितना रेट पड़ेगा')).toBe(true);
  });

  test('does not override an active order as a new enquiry', () => {
    expect(deterministicClassification(context('I need 200 wedding invitation cards', [{ isActive: true }])))
      .toBeNull();
  });

  test('does not guess when no new requirement was expressed', () => {
    expect(deterministicClassification(context('Good morning'))).toBeNull();
    expect(deterministicClassification({ chat: [], orders: [] }).category).toBe('not_enough_context');
  });
});
