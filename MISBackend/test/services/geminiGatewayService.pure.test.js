jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn() }));

const { z } = require('zod');
const { GoogleGenAI } = require('@google/genai');
const logger = require('../../src/utils/logger');
const {
  generateGemini,
  generateGeminiJson,
  aiConfigured,
} = require('../../src/services/geminiGatewayService');

let counter = 0;
let generateContent;
const originalKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  counter += 1;
  process.env.GEMINI_API_KEY = `test-key-${counter}`;
  jest.clearAllMocks();
  generateContent = jest.fn();
  GoogleGenAI.mockImplementation(() => ({ models: { generateContent } }));
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

test('runs on the backend and records only usage metadata', async () => {
  generateContent.mockResolvedValue({
    text: 'Draft response',
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6, totalTokenCount: 26 },
  });
  const result = await generateGemini({ prompt: 'Sensitive customer notes', task: 'test_task', fallbackModels: [] });
  expect(result.text).toBe('Draft response');
  expect(result.metadata.inputTokens).toBe(20);
  expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
    contents: [{ role: 'user', parts: [{ text: 'Sensitive customer notes' }] }],
  }));
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Sensitive customer notes');
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain('test-key');
});

test('tries the fallback model on a provider failure without logging sensitive provider errors', async () => {
  generateContent.mockRejectedValueOnce(new Error('token=SECRET')).mockResolvedValueOnce({ text: 'ok' });
  const result = await generateGemini({
    prompt: 'Need help', model: 'primary', fallbackModels: ['backup'], task: 'test',
  });
  expect(result.metadata.model).toBe('backup');
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('SECRET');
});

test('passes document and image parts to Gemini for existing OCR workflows', async () => {
  generateContent.mockResolvedValue({ text: 'date,time,party' });
  const media = { inlineData: { mimeType: 'image/png', data: 'YQ==' } };
  await generateGemini({ prompt: 'Read image', parts: [media], fallbackModels: [] });
  expect(generateContent.mock.calls[0][0].contents[0].parts[1]).toEqual(media);
});

test('rejects malformed and semantically invalid structured outputs', async () => {
  const schema = z.object({ category: z.enum(['new_lead', 'followup']) });
  generateContent.mockResolvedValueOnce({ text: '{broken' }).mockResolvedValueOnce({ text: '{"category":"made_up"}' });
  await expect(generateGeminiJson({ prompt: 'Classify', schema, fallbackModels: [] }))
    .rejects.toThrow('invalid JSON');
  await expect(generateGeminiJson({ prompt: 'Classify', schema, fallbackModels: [] }))
    .rejects.toThrow('schema validation');
});

test('refuses to call Gemini without a server-side credential', async () => {
  delete process.env.GEMINI_API_KEY;
  expect(aiConfigured()).toBe(false);
  await expect(generateGemini({ prompt: 'Do work' })).rejects.toThrow('not configured');
  expect(generateContent).not.toHaveBeenCalled();
});
