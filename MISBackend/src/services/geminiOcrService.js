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

module.exports = { extractCsvFromFile };
