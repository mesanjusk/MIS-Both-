const {
  looksLikeNewEnquiry, deterministicClassification, priorityForCategory,
  validateModelClassification, redactLeadText, snapshotHash,
} = require('../../src/services/leadAiService');
const AiInsight = require('../../src/repositories/aiInsight');

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

  test('provides a safe, review-only reply draft for a new requirement', () => {
    const result = deterministicClassification(context('I need 200 wedding invitation cards'));
    expect(result.priority).toBe('high');
    expect(result.replyDraft).toMatch(/quotation/);
    expect(result.replyDraft).not.toMatch(/we have sent|confirmed/i);
  });

  test('validates priority, trims untrusted draft text and restricts order references', () => {
    const result = validateModelClassification({
      category: 'order_update', confidence: 2, priority: 'critical',
      summary: 'Short summary', replyDraft: 'x'.repeat(1000),
      relatedOrderNumbers: [12, 999],
    }, { orders: [{ orderNumber: 12 }] });
    expect(result.confidence).toBe(1);
    expect(result.priority).toBe('high');
    expect(result.replyDraft).toHaveLength(350);
    expect(result.relatedOrderNumbers).toEqual([12]);
    expect(priorityForCategory('support_issue')).toBe('high');
  });

  test('omits contact details from prompts and fingerprints updated conversations', () => {
    const redacted = redactLeadText('Call +91 9876543210 or email abc@example.com. Attachment: https://media.example.com/file?token=private');
    expect(redacted).not.toContain('9876543210');
    expect(redacted).not.toContain('abc@example.com');
    expect(redacted).not.toContain('media.example.com');
    const first = { chat: [{ text: 'hello' }], orders: [] };
    const second = { chat: [{ text: 'hello again' }], orders: [] };
    expect(snapshotHash(first)).not.toBe(snapshotHash(second));
  });

  test('uses one expiring, uniquely keyed insight collection', () => {
    const indexes = AiInsight.schema.indexes();
    expect(indexes.some(([fields, options]) => fields.namespace === 1 && fields.subjectHash === 1 && options.unique)).toBe(true);
    expect(indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0)).toBe(true);
  });
});
