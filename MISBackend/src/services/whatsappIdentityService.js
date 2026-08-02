const { findEmployeeByWhatsAppNumber } = require('./whatsappAttendanceService');
const { getWhatsAppPermissionsForGroup } = require('./permissionService');
const { normalizePhone } = require('../utils/phone');

// Resolves an inbound WhatsApp sender to an internal staff record plus the
// permissions their group grants for WhatsApp order commands. Returns null
// for numbers that aren't a registered staff member (customers, wrong
// numbers, other-project traffic that slipped past the MIS gate).
async function resolveStaffFromWhatsApp(rawPhone) {
  const user = await findEmployeeByWhatsAppNumber(rawPhone);
  if (!user) return null;

  const permissions = await getWhatsAppPermissionsForGroup(user.User_group);
  return { user, permissions };
}

// Customers.Mobile_number isn't stored in one consistent format across the
// app — WhatsApp auto-registration stores the full normalized number
// (country code included), while records created from the web form
// typically store the bare 10-digit local number. Match every shape rather
// than assuming one, same approach as findEmployeeByWhatsAppNumber above.
function buildCustomerPhoneQuery(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  const last10 = normalized.slice(-10);
  return {
    $or: [
      { Mobile_number: normalized },
      { Mobile_number: `+${normalized}` },
      { Mobile_number: last10 },
      { $expr: { $eq: [{ $toString: '$Mobile_number' }, last10] } },
    ],
  };
}

module.exports = { resolveStaffFromWhatsApp, buildCustomerPhoneQuery };
