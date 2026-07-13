const { findEmployeeByWhatsAppNumber } = require('./whatsappAttendanceService');
const { getWhatsAppPermissionsForGroup } = require('./permissionService');

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

module.exports = { resolveStaffFromWhatsApp };
