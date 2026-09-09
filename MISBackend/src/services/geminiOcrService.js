const { GoogleGenerativeAI } = require('@google/generative-ai');

const DIARY_PROMPT = `You are a bookkeeping assistant. Extract all diary entries from this handwritten or printed diary page.

Return ONLY a CSV with these exact columns (header row first):
date,time,party,amount,direction,book,mode,checked,notes

Column rules:
- date: YYYY-MM-DD format. If year not visible use current year.
- time: hour number (e.g. 8, 10, 14) OR "OB" for opening balance OR "CB" for closing balance
- party: name of person or entity
- amount: numeric only, no currency symbol or commas
- direction: "in" for money received/income, "out" for money paid/expense
- book: "cash" for cash transactions, "bank" for cheque/UPI/NEFT/bank transfer
- mode: cash / cheque / upi / neft / bank
- checked: "yes" if tick mark is visible next to the entry, otherwise "no"
- notes: any extra note visible (cheque number, remark), leave empty if none

Important:
- Include OB (opening balance) and CB (closing balance) rows if visible
- Do NOT include any explanation, markdown formatting, or code blocks
- Return ONLY the CSV rows starting with the header line`;

async function extractCsvFromFile(fileBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const filePart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType,
    },
  };

  let result;
  try {
    result = await model.generateContent([DIARY_PROMPT, filePart]);
  } catch (apiErr) {
    const detail = apiErr?.message || String(apiErr);
    throw new Error(`Gemini API error: ${detail}`);
  }

  const text = result.response.text().trim();
  return text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

const PAYMENT_PROMPT = `You are a payments assistant. The attached image may be a screenshot of a
UPI / bank transfer payment confirmation (GPay, PhonePe, Paytm, BHIM, a bank
app, etc.), or it may be something else entirely (a photo, a design, a chat
screenshot).

Return ONLY a single JSON object, no markdown, no code fences, with these keys:
- is_payment: true only if the image clearly shows a money transfer / payment
  confirmation with an amount. false for anything else.
- amount: the transferred amount as a plain number (no currency symbol or
  commas). Use null if not a payment.
- reference_id: the UPI transaction id / UTR / reference / order id shown
  (the long digits labelled "UPI transaction ID", "UTR", "Txn ID",
  "Reference"). Empty string if none visible.
- paid_at: the date/time of the payment exactly as shown on screen, or empty
  string if not visible.
- payer_name: the name of the person/account the money was sent FROM, if
  shown. Empty string if not visible.
- payee_name: the name the money was sent TO, if shown. Empty string if not
  visible.
- app: the app or bank the screenshot is from (e.g. "Google Pay", "PhonePe",
  "Paytm", "BHIM", bank name), or empty string.
- status: the payment status word shown (e.g. "Completed", "Success",
  "Paid", "Failed", "Pending"), or empty string.

Rules:
- Respond with ONLY the JSON object, nothing before or after it.
- Never invent a value — use null/empty string when something is not clearly
  visible in the image.`;

// Extracts structured payment details from a screenshot. Returns the raw
// model text (expected to be a JSON object); the caller parses and validates
// it, so a malformed or non-payment response degrades to "skip" rather than
// throwing. Kept separate from the diary CSV path because the prompt, output
// shape and failure handling are all different.
async function extractPaymentFromImage(fileBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const filePart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType,
    },
  };

  let result;
  try {
    result = await model.generateContent([PAYMENT_PROMPT, filePart]);
  } catch (apiErr) {
    const detail = apiErr?.message || String(apiErr);
    throw new Error(`Gemini API error: ${detail}`);
  }

  const text = result.response.text().trim();
  return text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

module.exports = { extractCsvFromFile, extractPaymentFromImage };
