/**
 * The SanjuSK API key is a live sending credential: anyone holding it can
 * send WhatsApp messages as this business. These tests pin the two properties
 * that keep it safe — it is stored encrypted, and it never leaves the server —
 * plus the save semantics that would otherwise destroy it by accident.
 *
 * AppSetting is stubbed with an in-memory mockStore so this runs without MongoDB.
 */
const mockStore = new Map();

jest.mock('../../src/repositories/appSetting', () => ({
  AppSetting: {
    getSetting: jest.fn(async (key, fallback = null) =>
      mockStore.has(key) ? mockStore.get(key) : fallback
    ),
    upsertSetting: jest.fn(async ({ key, value }) => {
      mockStore.set(key, value);
      return value;
    }),
  },
}));

const ORIGINAL_KEY = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;

describe('sanjuskApiService configuration', () => {
  let sanjusk;

  beforeAll(() => {
    // A throwaway 32-byte base64 key, only for these tests.
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    sanjusk = require('../../src/services/sanjuskApiService');
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    else process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  beforeEach(() => {
    mockStore.clear();
  });

  it('never returns the API key to a caller, only a prefix identifying it', async () => {
    await sanjusk.saveConfig({ apiKey: 'mbsp_secret_value_that_must_not_leak', enabled: false });

    const publicConfig = await sanjusk.getPublicConfig();

    expect(JSON.stringify(publicConfig)).not.toContain('secret_value_that_must_not_leak');
    expect(publicConfig.hasApiKey).toBe(true);
    expect(publicConfig.keyPrefix).toBe('mbsp_secret_');
  });

  it('stores the key encrypted rather than in plain text', async () => {
    await sanjusk.saveConfig({ apiKey: 'mbsp_plaintext_probe', enabled: false });

    const raw = JSON.stringify(mockStore.get(sanjusk.SETTING_KEY));
    expect(raw).not.toContain('mbsp_plaintext_probe');
    expect(mockStore.get(sanjusk.SETTING_KEY).apiKeyEncrypted).toMatch(/^[^:]+:[^:]+:[^:]+$/);
  });

  it('keeps the saved key when a later save omits it', async () => {
    // The UI never receives the key, so it cannot send one back. Treating an
    // absent field as "delete the credential" would wipe the integration
    // every time someone edited the base URL.
    await sanjusk.saveConfig({ apiKey: 'mbsp_keep_me', enabled: false });
    await sanjusk.saveConfig({ baseUrl: 'https://other.example' });

    const publicConfig = await sanjusk.getPublicConfig();
    expect(publicConfig.hasApiKey).toBe(true);
    expect(publicConfig.keyPrefix).toBe('mbsp_keep_me'.slice(0, 12));
    expect(publicConfig.baseUrl).toBe('https://other.example');
  });

  it('refuses to enable the integration with no key to send with', async () => {
    await expect(sanjusk.saveConfig({ enabled: true })).rejects.toThrow(/API key/i);
  });

  it('rejects a non-HTTPS base URL', async () => {
    await expect(
      sanjusk.saveConfig({ apiKey: 'mbsp_x', baseUrl: 'http://insecure.example' })
    ).rejects.toThrow(/https/i);
  });

  it('strips a trailing slash so endpoint paths do not double up', async () => {
    await sanjusk.saveConfig({ apiKey: 'mbsp_x', baseUrl: 'https://meta.sanjusk.in/' });
    expect((await sanjusk.getPublicConfig()).baseUrl).toBe('https://meta.sanjusk.in');
  });

  it('turns the integration off when the key is removed', async () => {
    await sanjusk.saveConfig({ apiKey: 'mbsp_x', enabled: true });
    expect(await sanjusk.isEnabled()).toBe(true);

    const publicConfig = await sanjusk.clearApiKey({});
    expect(publicConfig.hasApiKey).toBe(false);
    expect(publicConfig.enabled).toBe(false);
    expect(await sanjusk.isEnabled()).toBe(false);
  });

  it('reports disabled when a key exists but the switch is off', async () => {
    await sanjusk.saveConfig({ apiKey: 'mbsp_x', enabled: false });
    expect(await sanjusk.isEnabled()).toBe(false);
  });
});
