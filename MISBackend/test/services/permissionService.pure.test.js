const { defaultWhatsAppPermissions } = require('../../src/services/permissionService');

describe('permissionService.defaultWhatsAppPermissions', () => {
  test('tier 0-1 (worker/delivery/unrecognized): assigned-scope view only, no advance/assign/create/payments', () => {
    for (const role of ['worker', 'delivery', 'intern']) {
      expect(defaultWhatsAppPermissions(role)).toEqual({
        viewOrders: true,
        viewScope: 'assigned',
        advanceOrderStage: false,
        assignOrders: false,
        createOrders: false,
        receivePayments: false,
      });
    }
  });

  test('tier 2 (office user): can view all + advance stage + create orders, but not assign or receive payments', () => {
    expect(defaultWhatsAppPermissions('office user')).toEqual({
      viewOrders: true,
      viewScope: 'all',
      advanceOrderStage: true,
      assignOrders: false,
      createOrders: true,
      receivePayments: false,
    });
  });

  test('tier 3-4 (manager/admin/owner): full permissions including assign and receive payments', () => {
    for (const role of ['manager', 'admin', 'owner']) {
      expect(defaultWhatsAppPermissions(role)).toEqual({
        viewOrders: true,
        viewScope: 'all',
        advanceOrderStage: true,
        assignOrders: true,
        createOrders: true,
        receivePayments: true,
      });
    }
  });

  test('resolves role aliases (e.g. "Admin User") to full tier-4 permissions', () => {
    expect(defaultWhatsAppPermissions('Admin User').receivePayments).toBe(true);
    expect(defaultWhatsAppPermissions('Admin User').assignOrders).toBe(true);
  });
});
