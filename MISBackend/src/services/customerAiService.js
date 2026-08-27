const { GoogleGenerativeAI } = require('@google/generative-ai');
const RateCard = require('../repositories/rateCard');
const { computeRateCardAmount, computeGst } = require('../utils/rateCardPricing');

const MODEL = process.env.GEMINI_OFFICE_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';

const clean = (value) => String(value || '').trim();
const lower = (value) => clean(value).toLowerCase();

function parseSize(text) {
  const raw = lower(text).replace(/×/g, 'x');
  let match = raw.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\s*x\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)/i);
  if (match) return { width: Number(match[1]), height: Number(match[2]), unit: 'ft' };
  match = raw.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")\s*x\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")/i);
  if (match) return { width: Number(match[1]), height: Number(match[2]), unit: 'in' };
  match = raw.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)/i);
  if (match) return { width: Number(match[1]), height: Number(match[2]), unit: 'ft' };
  return null;
}

function sizeToFeet(size) {
  if (!size) return { widthFt: 0, heightFt: 0 };
  if (size.unit === 'ft') return { widthFt: size.width, heightFt: size.height };
  if (size.unit === 'in') return { widthFt: size.width / 12, heightFt: size.height / 12 };
  return { widthFt: 0, heightFt: 0 };
}

function parseRequirementRuleBased(message) {
  const text = clean(message);
  const l = lower(message);
  const qtyMatch = l.match(/(?:qty|quantity|qnty)?\s*[:=-]?\s*(\d{1,7})\s*(?:pcs?|pieces?|nos?|copies|cards?|flyers?|brochures?)?/i)
    || l.match(/\b(\d{2,7})\b/);
  const gsmMatch = l.match(/\b(\d{2,4})\s*gsm\b/i);
  const deadline = /\b(today|aaj)\b/i.test(l) ? 'today'
    : /\b(tomorrow|kal)\b/i.test(l) ? 'tomorrow'
      : null;
  const sides = /\b(double\s*side|both\s*side|front\s*(?:and|&)\s*back|2\s*side)\b/i.test(l) ? 'double'
    : /\b(single\s*side|one\s*side|1\s*side)\b/i.test(l) ? 'single'
      : null;
  const lamination = /\bmatt(?:e)?\s*lam/i.test(l) ? 'matte'
    : /\bgloss(?:y)?\s*lam/i.test(l) ? 'gloss'
      : /\bmatte\b/i.test(l) ? 'matte'
        : /\bglossy?\b/i.test(l) ? 'gloss'
          : null;
  const commonProducts = [
    ['visiting card', /\b(visiting|business)\s*cards?\b/i],
    ['flyer', /\bflyers?\b/i],
    ['brochure', /\bbrochures?\b/i],
    ['banner', /\bbanners?\b/i],
    ['flex', /\bflex\b/i],
    ['sticker', /\bstickers?\b/i],
    ['letterhead', /\bletter\s*heads?\b/i],
    ['envelope', /\benvelopes?\b/i],
    ['menu', /\bmenus?\b/i],
    ['poster', /\bposters?\b/i],
  ];
  const product = commonProducts.find(([, pattern]) => pattern.test(l))?.[0] || '';

  return {
    sourceMessage: text,
    product,
    quantity: qtyMatch ? Number(qtyMatch[1]) : null,
    size: parseSize(text),
    gsm: gsmMatch ? Number(gsmMatch[1]) : null,
    sides,
    lamination,
    deadline,
    notes: text,
  };
}

function missingFields(requirement) {
  const missing = [];
  if (!requirement.product) missing.push('product');
  if (!requirement.quantity) missing.push('quantity');
  return missing;
}

function followupQuestions(requirement, matchedRateCard = null) {
  const questions = [];
  if (!requirement.product) questions.push('Which print product do you need?');
  if (!requirement.quantity) questions.push('What quantity do you need?');
  if (matchedRateCard?.pricingType === 'per_sqft' && !requirement.size) questions.push('What size do you need (width × height in feet or inches)?');
  return questions;
}

function normalizeAiJson(text) {
  const raw = clean(text).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch { return null; }
}

async function aiEnhanceRequirement(message, base) {
  const key = clean(process.env.GEMINI_API_KEY);
  if (!key) return { requirement: base, aiUsed: false };
  try {
    const client = new GoogleGenerativeAI(key);
    const model = client.getGenerativeModel({ model: MODEL });
    const prompt = `Extract printing enquiry fields. Return ONLY valid JSON with keys product, quantity, size, gsm, sides, lamination, deadline, notes. size must be null or {"width":number,"height":number,"unit":"ft"|"in"}. Never invent missing values. Understand English, Hindi and Hinglish. Message:\n${JSON.stringify(clean(message))}`;
    const result = await model.generateContent(prompt);
    const parsed = normalizeAiJson(result?.response?.text?.());
    if (!parsed) return { requirement: base, aiUsed: false };
    return {
      aiUsed: true,
      requirement: {
        ...base,
        product: clean(parsed.product) || base.product,
        quantity: Number(parsed.quantity) > 0 ? Number(parsed.quantity) : base.quantity,
        size: parsed.size && Number(parsed.size.width) > 0 && Number(parsed.size.height) > 0 ? parsed.size : base.size,
        gsm: Number(parsed.gsm) > 0 ? Number(parsed.gsm) : base.gsm,
        sides: clean(parsed.sides) || base.sides,
        lamination: clean(parsed.lamination) || base.lamination,
        deadline: clean(parsed.deadline) || base.deadline,
        notes: clean(parsed.notes) || base.notes,
      },
    };
  } catch {
    return { requirement: base, aiUsed: false };
  }
}

function tokenize(value) {
  return lower(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function scoreRateCard(requirement, card) {
  const productTokens = tokenize(requirement.product);
  const cardTokens = new Set(tokenize(`${card.itemName || ''} ${card.category || ''} ${card.notes || ''}`));
  let score = 0;
  for (const token of productTokens) if (cardTokens.has(token)) score += 4;
  if (lower(card.itemName) === lower(requirement.product)) score += 10;
  if (requirement.gsm && lower(card.itemName).includes(String(requirement.gsm))) score += 2;
  if (requirement.lamination && lower(card.itemName).includes(lower(requirement.lamination))) score += 1;
  return score;
}

async function findRateCardMatches(requirement) {
  const cards = await RateCard.find({ isActive: true }).lean();
  return cards
    .map((card) => ({ card, score: scoreRateCard(requirement, card) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ card, score }) => ({
      rateCard_uuid: card.rateCard_uuid,
      itemName: card.itemName,
      category: card.category,
      pricingType: card.pricingType,
      unit: card.unit,
      gstPercent: card.gstPercent || 0,
      score,
    }));
}

async function prepareQuote(requirement, rateCardUuid) {
  const card = await RateCard.findOne({ rateCard_uuid: rateCardUuid, isActive: true }).lean();
  if (!card) return { ready: false, error: 'Rate card not found or inactive' };
  if (!requirement.quantity) return { ready: false, error: 'Quantity is required' };
  const feet = sizeToFeet(requirement.size);
  const pricing = computeRateCardAmount(card, { ...feet, qty: requirement.quantity });
  if (pricing.error) return { ready: false, error: pricing.error, rateCard: card };
  const tax = computeGst(pricing.amount, card.gstPercent);
  return {
    ready: true,
    rateCard: {
      rateCard_uuid: card.rateCard_uuid,
      itemName: card.itemName,
      category: card.category,
      pricingType: card.pricingType,
      unit: card.unit,
      gstPercent: card.gstPercent || 0,
    },
    pricing: {
      quantity: requirement.quantity,
      widthFt: feet.widthFt || null,
      heightFt: feet.heightFt || null,
      sqft: pricing.sqft || null,
      subtotal: pricing.amount,
      gst: tax.gst,
      total: tax.total,
    },
  };
}

async function parseCustomerEnquiry(message) {
  const base = parseRequirementRuleBased(message);
  const enhanced = await aiEnhanceRequirement(message, base);
  const requirement = enhanced.requirement;
  const matches = await findRateCardMatches(requirement);
  const top = matches[0] || null;
  const selectedCard = top ? await RateCard.findOne({ rateCard_uuid: top.rateCard_uuid }).lean() : null;
  const questions = followupQuestions(requirement, selectedCard);
  let quote = null;
  if (top && questions.length === 0) quote = await prepareQuote(requirement, top.rateCard_uuid);
  return {
    mode: 'prepare_only',
    canSend: false,
    canCreateOrder: false,
    aiUsed: enhanced.aiUsed,
    requirement,
    missing: missingFields(requirement),
    followupQuestions: questions,
    rateCardMatches: matches,
    quote,
  };
}

module.exports = {
  parseSize,
  sizeToFeet,
  parseRequirementRuleBased,
  missingFields,
  followupQuestions,
  scoreRateCard,
  prepareQuote,
  parseCustomerEnquiry,
};
