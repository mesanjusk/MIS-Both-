const axios = require('axios');
const Counter = require('../repositories/counter');
const Customers = require('../repositories/customer');
const ProvisionalReceipt = require('../repositories/provisionalReceipt');
const { AppSetting } = require('../repositories/appSetting');
const { buildCustomerPhoneQuery } = require('./whatsappIdentityService');
const { renderTemplate } = require('./whatsappTemplateService');
const { extractPaymentFromImage } = require('./geminiOcrService');
const { parseAmount } = require('../utils/money');
const { normalizePhone } = require('../utils/phone');
const logger = require('../utils/logger');

// When a customer sends a payment screenshot on WhatsApp, this service reads
// the amount off the screenshot, matches the sender to a customer record by
// mobile number, and sends back a *provisional* receipt — an acknowledgement
// that the claimed payment has been received and will be confirmed once the
// money is actually credited to the business bank account. It deliberately
// posts nothing to the accounting ledger: a provisional receipt is a promise,
// not a confirmed credit.

// The business's own UPI handle / name, which the receipt presents as the
// destination the money was sent to. Falls back to the SanjuSK account the
// product already sends from when no business profile has been filled in.
const DEFAULT_PAYEE_UPI_ID = 'sanjusk';
const DEFAULT_PAYEE_NAME = 'Sanju SK';

const IMAGE_MIME = /^image\//i;

// A screenshot is an image. WhatsApp delivers the real photo shot with the
// camera as an image too, but only a payment-confirmation image survives the
// OCR gate below, so treating every inbound image as a *candidate* is safe.
function isScreenshotImage(payload = {}, mimeType = '') {
  const type = String(payload.type || '').toLowerCase();
  if (type && type !== 'image') return false;
  const mime = String(mimeType || payload.mimeType || '');
  // Meta always tags images; some providers omit the mime on the webhook but
  // still set type:'image', so accept either signal.
  return type === 'image' || IMAGE_MIME.test(mime);
}

// Parses the JSON the OCR model is asked to return. Tolerant by design: a
// non-payment image, a refusal, or malformed JSON all degrade to
// { isPayment: false } so the caller simply skips rather than throwing.
function parsePaymentOcr(rawText) {
  const empty = { isPayment: false };
  if (!rawText || typeof rawText !== 'string') return empty;

  // The model is told to return bare JSON, but guard against stray prose by
  // pulling out the first {...} block.
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) return empty;

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (_err) {
    return empty;
  }

  const amount = Math.round(parseAmount(parsed.amount) * 100) / 100;
  const isPayment = parsed.is_payment === true && amount > 0;
  if (!isPayment) return empty;

  return {
    isPayment: true,
    amount,
    referenceId: String(parsed.reference_id || '').trim(),
    paidAtText: String(parsed.paid_at || '').trim(),
    payerName: String(parsed.payer_name || '').trim(),
    payeeName: String(parsed.payee_name || '').trim(),
    app: String(parsed.app || '').trim(),
    status: String(parsed.status || '').trim(),
  };
}

// The YYYYMMDD stamp for a date in IST (the business timezone). en-CA yields
// an ISO-style YYYY-MM-DD which we strip to digits.
function istDateStamp(now = new Date()) {
  try {
    return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
  } catch (_err) {
    return new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  }
}

// Human-friendly, per-day sequential receipt number: PR-YYYYMMDD-0001.
async function nextReceiptNumber(now = new Date()) {
  const ymd = istDateStamp(now);

  const counter = await Counter.findByIdAndUpdate(
    `provisional_receipt:${ymd}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(4, '0');
  return `PR-${ymd}-${seq}`;
}

// The business UPI handle / name the receipt credits the payment to.
async function resolveReceiptPayee() {
  try {
    const profile = await AppSetting.getSetting('business_profile', {});
    return {
      upiId: String(profile?.upiId || '').trim() || DEFAULT_PAYEE_UPI_ID,
      payeeName: String(profile?.upiName || profile?.name || '').trim() || DEFAULT_PAYEE_NAME,
      businessName: String(profile?.name || '').trim() || DEFAULT_PAYEE_NAME,
    };
  } catch (_err) {
    return { upiId: DEFAULT_PAYEE_UPI_ID, payeeName: DEFAULT_PAYEE_NAME, businessName: DEFAULT_PAYEE_NAME };
  }
}

async function resolveCustomerFromWhatsApp(rawPhone) {
  return Customers.findOne(buildCustomerPhoneQuery(rawPhone)).lean();
}

async function downloadImageBuffer(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return {
    buffer: Buffer.from(response.data),
    mimeType: response.headers['content-type'] || '',
  };
}

// Orchestrates the whole "screenshot in → provisional receipt out" flow.
//
// Dependencies are injected so the decision logic can be unit-tested without
// hitting Gemini, Mongo or WhatsApp. In production the controller passes only
// { payload, mediaUrl, mimeType, sendText } and the rest default to the real
// implementations above.
async function handleIncomingScreenshotReceipt({
  payload = {},
  mediaUrl = '',
  mimeType = '',
  sendText,
  now = new Date(),
  deps = {},
} = {}) {
  const {
    resolveCustomer = resolveCustomerFromWhatsApp,
    downloadImage = downloadImageBuffer,
    runOcr = extractPaymentFromImage,
    createReceipt = (doc) => ProvisionalReceipt.create(doc),
    findExistingByReference = (referenceId) =>
      ProvisionalReceipt.findOne({ referenceId }).lean(),
    render = renderTemplate,
    resolvePayee = resolveReceiptPayee,
    generateReceiptNumber = nextReceiptNumber,
  } = deps;

  if (typeof sendText !== 'function') {
    throw new Error('handleIncomingScreenshotReceipt requires a sendText function');
  }
  if (!isScreenshotImage(payload, mimeType)) {
    return { handled: false, reason: 'not_image' };
  }
  if (!mediaUrl) {
    return { handled: false, reason: 'no_media' };
  }

  // 1. The receipt can only go to a known customer — the whole point is that
  //    the sender's number matches a recipient record in the database.
  const customer = await resolveCustomer(payload.from);
  if (!customer) {
    logger.info({ from: payload?.from }, '[receipt] screenshot from unknown number, skipping receipt');
    return { handled: false, reason: 'no_customer' };
  }

  // 2. Read the screenshot. A download or OCR failure is logged and skipped —
  //    never allowed to throw into the inbound pipeline.
  let payment;
  try {
    const { buffer, mimeType: downloadedMime } = await downloadImage(mediaUrl);
    const raw = await runOcr(buffer, mimeType || downloadedMime || 'image/jpeg');
    payment = parsePaymentOcr(raw);
    payment.raw = typeof raw === 'string' ? raw : '';
  } catch (err) {
    logger.error({ err: err?.message }, '[receipt] OCR/download failed for screenshot');
    return { handled: false, reason: 'ocr_failed' };
  }

  // 3. Not a payment screenshot (a photo, a design proof, a chat capture) —
  //    stay silent so ordinary images never trigger a spurious receipt.
  if (!payment.isPayment) {
    return { handled: false, reason: 'not_payment' };
  }

  // 4. Don't issue a second receipt for the same transaction if the customer
  //    resends the screenshot.
  if (payment.referenceId) {
    const existing = await findExistingByReference(payment.referenceId);
    if (existing) {
      logger.info({ referenceId: payment.referenceId }, '[receipt] duplicate screenshot, receipt already issued');
      return { handled: false, reason: 'duplicate', receiptNumber: existing.receiptNumber };
    }
  }

  const payee = await resolvePayee();
  const receiptNumber = await generateReceiptNumber(now);
  const mobileNumber = normalizePhone(payload.from);
  const customerName = String(customer.Customer_name || payment.payerName || 'Customer').trim();

  const receiptDoc = {
    receiptNumber,
    customerUuid: String(customer.Customer_uuid || ''),
    customerId: String(customer._id || ''),
    customerName,
    mobileNumber,
    amount: payment.amount,
    currency: 'INR',
    referenceId: payment.referenceId,
    paidAtText: payment.paidAtText,
    payerName: payment.payerName,
    app: payment.app,
    payeeUpiId: payee.upiId,
    payeeName: payee.payeeName,
    status: 'provisional',
    mediaUrl,
    sourceMessageId: String(payload.messageId || ''),
    rawOcr: payment.raw || '',
    sentAt: new Date(),
  };

  let saved = null;
  try {
    saved = await createReceipt(receiptDoc);
  } catch (err) {
    // A unique-index clash on referenceNumber/referenceId means another
    // concurrent webhook already handled this exact screenshot. Treat as a
    // duplicate rather than sending a second receipt.
    if (err?.code === 11000) {
      return { handled: false, reason: 'duplicate' };
    }
    throw err;
  }

  const { body } = await render('receipt.provisional', {
    receiptNumber,
    customerName,
    amount: payment.amount.toLocaleString('en-IN'),
    reference: payment.referenceId || '—',
    paidAt: payment.paidAtText || '—',
    upiId: payee.upiId,
    payeeName: payee.payeeName,
    businessName: payee.businessName,
  });

  await sendText({ to: payload.from, body });

  logger.info(
    { receiptNumber, customerUuid: receiptDoc.customerUuid, amount: payment.amount },
    '[receipt] provisional receipt issued from screenshot'
  );

  return { handled: true, receiptNumber, amount: payment.amount, receipt: saved };
}

module.exports = {
  DEFAULT_PAYEE_UPI_ID,
  DEFAULT_PAYEE_NAME,
  isScreenshotImage,
  parsePaymentOcr,
  nextReceiptNumber,
  resolveReceiptPayee,
  resolveCustomerFromWhatsApp,
  downloadImageBuffer,
  handleIncomingScreenshotReceipt,
};
