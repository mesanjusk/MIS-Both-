// Strips everything but digits from a phone number (spaces, +, dashes,
// country-code punctuation, etc.) so values from different sources — user
// input, WhatsApp webhook payloads, stored contact records — compare equal.
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = { normalizePhone };
