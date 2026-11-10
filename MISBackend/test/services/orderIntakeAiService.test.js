jest.mock('../../src/services/officeAiService', () => ({ aiConfigured: jest.fn(), callGemini: jest.fn() }));
const { aiConfigured, callGemini } = require('../../src/services/officeAiService');
const { draftOrderFromNote, normalizeIntakeDraft } = require('../../src/services/orderIntakeAiService');

beforeEach(() => { jest.clearAllMocks(); aiConfigured.mockReturnValue(true); });

test('extracts an explicitly stated enquiry into a review-only draft', async () => {
  callGemini.mockResolvedValue('```json\n{"customerName":"Asha","product":"Wedding cards","quantity":200,"quotedAmount":null,"requiredDate":null}\n```');
  const result = await draftOrderFromNote({ source: 'whatsapp', note: 'Asha needs 200 wedding cards' });
  expect(result.orderCreated).toBe(false);
  expect(result.messageSent).toBe(false);
  expect(result.requiresReview).toBe(true);
  expect(result.draft.quantity).toBe(200);
  expect(result.draft.quotedAmount).toBeNull();
  expect(result.draft.missing).toContain('phone');
});

test('unknown and negative money never become a guessed price', () => {
  expect(normalizeIntakeDraft({ quotedAmount: null }).quotedAmount).toBeNull();
  expect(normalizeIntakeDraft({ quotedAmount: -100 }).quotedAmount).toBeNull();
  expect(normalizeIntakeDraft({ quantity: '' }).quantity).toBeNull();
});

test('refuses oversized notes before making an AI request', async () => {
  await expect(draftOrderFromNote({ note: 'x'.repeat(6001) })).rejects.toMatchObject({ statusCode: 400 });
  expect(callGemini).not.toHaveBeenCalled();
});

test('handles unavailable Gemini without fabricating a draft', async () => {
  aiConfigured.mockReturnValue(false);
  await expect(draftOrderFromNote({ note: 'Need a banner' })).rejects.toMatchObject({ statusCode: 503 });
  expect(callGemini).not.toHaveBeenCalled();
});
