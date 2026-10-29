const { GoogleGenAI } = require('@google/genai');
const logger = require('../utils/logger');

// One server-side entry point for all Gemini calls. Keep credentials and
// customer content out of logs; only task names and usage metadata are logged.
const DEFAULT_MODEL = process.env.GEMINI_OFFICE_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

let cachedClient;
let cachedApiKey;

function aiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

function getClient() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

function uniqueModels(model, fallbackModels) {
  return [...new Set([model || DEFAULT_MODEL, ...(fallbackModels ?? [FALLBACK_MODEL])].filter(Boolean))];
}

async function generateGemini({
  prompt,
  parts = [],
  model,
  fallbackModels,
  task = 'general',
  responseMimeType,
  responseSchema,
} = {}) {
  if (!aiConfigured()) throw new Error('GEMINI_API_KEY is not configured');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Gemini prompt must not be empty');
  const client = getClient();
  const models = uniqueModels(model, fallbackModels);
  const contents = [{ role: 'user', parts: [{ text: prompt }, ...parts] }];
  const config = responseMimeType ? { responseMimeType, ...(responseSchema ? { responseSchema } : {}) } : undefined;

  for (const [index, modelName] of models.entries()) {
    const startedAt = Date.now();
    try {
      const response = await client.models.generateContent({ model: modelName, contents, ...(config ? { config } : {}) });
      const resultText = typeof response?.text === 'function' ? response.text() : response?.text;
      const text = String(resultText || '').trim();
      if (!text) throw new Error('Gemini returned no text');
      const usage = response?.usageMetadata || {};
      const metadata = {
        model: modelName,
        task,
        latencyMs: Date.now() - startedAt,
        inputTokens: Number(usage.promptTokenCount || 0),
        outputTokens: Number(usage.candidatesTokenCount || 0),
        totalTokens: Number(usage.totalTokenCount || 0),
      };
      logger.info(metadata, 'Gemini request completed');
      return { text, metadata };
    } catch (error) {
      // Provider messages can include request details. Never log them or the
      // prompt. Let callers keep their existing deterministic fallbacks.
      logger.warn({ task, model: modelName, attempt: index + 1, retrying: index < models.length - 1 }, 'Gemini request failed');
      if (index === models.length - 1) throw new Error('Gemini temporarily unavailable');
    }
  }
  throw new Error('Gemini temporarily unavailable');
}

function parseJsonText(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

async function generateGeminiJson({ schema, ...options } = {}) {
  if (!schema || typeof schema.safeParse !== 'function') throw new Error('A validation schema is required');
  const result = await generateGemini({ ...options, responseMimeType: 'application/json' });
  let parsed;
  try { parsed = parseJsonText(result.text); } catch { throw new Error('Gemini returned invalid JSON'); }
  const validation = schema.safeParse(parsed);
  if (!validation.success) throw new Error('Gemini response failed schema validation');
  return { value: validation.data, metadata: result.metadata };
}

module.exports = { DEFAULT_MODEL, FALLBACK_MODEL, aiConfigured, generateGemini, generateGeminiJson, parseJsonText };
