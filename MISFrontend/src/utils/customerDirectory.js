const pickCustomerName = (customer = {}) =>
  customer?.Customer_name || customer?.name || customer?.fullName || '';

const pickCustomerPhone = (customer = {}) =>
  customer?.Mobile_number || customer?.Mobile || customer?.mobile || customer?.phone || '';

export const normalizePhoneDigits = (value) => String(value ?? '').replace(/\D/g, '');

export const getPhoneLookupKeys = (value) => {
  const digits = normalizePhoneDigits(value);
  if (!digits) return [];

  const keys = new Set([digits]);

  if (digits.length >= 10) {
    const local10 = digits.slice(-10);
    keys.add(local10);
    keys.add(`91${local10}`);
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    keys.add(digits.slice(2));
  }

  return [...keys];
};

export const buildCustomerPhoneLookup = (customers = []) => {
  const lookup = new Map();

  customers.forEach((customer) => {
    getPhoneLookupKeys(pickCustomerPhone(customer)).forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, customer);
      }
    });
  });

  return lookup;
};

export const findCustomerByPhone = (lookup, phone) => {
  if (!lookup) return null;

  const keys = getPhoneLookupKeys(phone);
  for (const key of keys) {
    if (lookup.has(key)) return lookup.get(key);
  }

  return null;
};

export const formatPhoneForDisplay = (value) => {
  const digits = normalizePhoneDigits(value);
  if (!digits) return '';
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
};

export const getCustomerDisplayName = (customer, fallback = '') =>
  pickCustomerName(customer) || fallback;

