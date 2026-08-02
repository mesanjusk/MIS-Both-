require('../helpers/mongoSetup');
const Usergroup = require('../../src/repositories/usergroup');
const { getWhatsAppPermissionsForGroup, defaultWhatsAppPermissions } = require('../../src/services/permissionService');

describe('permissionService.getWhatsAppPermissionsForGroup', () => {
  test('falls back to the tier default when no userGroup is given', async () => {
    const perms = await getWhatsAppPermissionsForGroup('');
    expect(perms).toEqual(defaultWhatsAppPermissions(''));
  });

  test('falls back to the tier default when the Usergroup has no modulePermissions configured', async () => {
    await Usergroup.create({ User_group: 'Office User', modulePermissions: {} });
    const perms = await getWhatsAppPermissionsForGroup('Office User');
    expect(perms).toEqual(defaultWhatsAppPermissions('Office User'));
  });

  test('falls back to the tier default when no matching Usergroup document exists at all', async () => {
    const perms = await getWhatsAppPermissionsForGroup('Nonexistent Group');
    expect(perms).toEqual(defaultWhatsAppPermissions('Nonexistent Group'));
  });

  test('overrides individual default permissions with the group\'s configured modulePermissions', async () => {
    await Usergroup.create({
      User_group: 'Office User',
      modulePermissions: { assignOrders: true, receivePayments: true },
    });
    const perms = await getWhatsAppPermissionsForGroup('Office User');
    const fallback = defaultWhatsAppPermissions('Office User');
    expect(perms).toEqual({ ...fallback, assignOrders: true, receivePayments: true });
  });
});
