export default function normalizeWhatsAppNumber(input) {
  if (input == null) return '';

  let value = input;

  if (typeof value === 'object') {
    value =
      value?.Mobile_number ??
      value?.mobile ??
      value?.phone ??
      value?.number ??
      value?.value ??
      '';
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return '91' + digits;
  return digits;
}