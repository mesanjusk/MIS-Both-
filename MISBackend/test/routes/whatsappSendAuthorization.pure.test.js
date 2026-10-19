const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../../src/routes/WhatsAppCloud.js'), 'utf8');

// Every manual sending endpoint must check staff rights before sending.
test.each([
  '/send-text', '/send-template', '/send-admin-alert', '/send-flow',
  '/send-media', '/send-message', '/sanjusk/send-text', '/sanjusk/send-media',
])('%s enforces per-user send rights', (endpoint) => {
  const index = source.indexOf("'" + endpoint + "'");
  expect(index).toBeGreaterThan(0);
  const following = source.slice(index + endpoint.length + 2, index + endpoint.length + 140);
  expect(following).toMatch(/^\s*,\s*requireAuth\s*,\s*requireManualWhatsAppSend\b/);
});
