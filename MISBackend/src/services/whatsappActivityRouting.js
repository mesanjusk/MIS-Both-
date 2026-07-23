/**
 * Per-activity WhatsApp provider routing.
 *
 * The global `whatsapp_provider` setting (see whatsappProviderSetting.js) is
 * the default used when an activity has no explicit override. This module
 * lets an admin pin individual automated activities (order updates,
 * attendance, task reminders, scheduled digests, payment reminders, ...) to
 * "official" or "baileys" independently of that default, or leave them on
 * "inherit" to keep following the global switch.
 */
const { AppSetting } = require('../repositories/appSetting');
const { getWhatsAppProvider } = require('./whatsappProviderSetting');

const ACTIVITY_MAP_KEY = 'whatsapp_activity_providers';

const ACTIVITIES = [
  { key: 'ORDER_UPDATES', label: 'Order Updates', description: 'Order stage changes and delivery notifications sent to customers.' },
  { key: 'ATTENDANCE', label: 'Attendance', description: 'Staff check-in / check-out confirmation replies.' },
  { key: 'TASK_NOTIFICATIONS', label: 'Task Notifications', description: 'Task assignment and reminder messages sent to staff.' },
  { key: 'SCHEDULED_MESSAGES', label: 'Scheduled Messages', description: 'One-off messages scheduled for a future send time.' },
  { key: 'DAILY_DIGEST', label: 'Daily Digest', description: 'Morning / evening pending work summary sent to staff.' },
  { key: 'OWNER_SUMMARY', label: 'Owner Daily Summary', description: 'End-of-day business summary sent to the owner number.' },
  { key: 'PAYMENT_REMINDERS', label: 'Payment Reminders', description: 'Overdue payment follow-up reminders sent to customers.' },
];

const ACTIVITY_KEYS = new Set(ACTIVITIES.map((a) => a.key));
const PROVIDER_VALUES = ['official', 'baileys', 'inherit'];

async function getActivityProviderMap() {
  const stored = await AppSetting.getSetting(ACTIVITY_MAP_KEY, {});
  return stored && typeof stored === 'object' ? stored : {};
}

async function getProviderForActivity(activityKey) {
  const map = await getActivityProviderMap();
  const override = map[activityKey];
  if (override === 'official' || override === 'baileys') return override;
  return getWhatsAppProvider();
}

async function setActivityProvider(activityKey, provider) {
  if (!ACTIVITY_KEYS.has(activityKey)) {
    throw new Error(`Unknown activity "${activityKey}". Must be one of: ${[...ACTIVITY_KEYS].join(', ')}`);
  }
  if (!PROVIDER_VALUES.includes(provider)) {
    throw new Error(`Invalid provider "${provider}". Must be one of: ${PROVIDER_VALUES.join(', ')}`);
  }

  const map = await getActivityProviderMap();
  if (provider === 'inherit') {
    delete map[activityKey];
  } else {
    map[activityKey] = provider;
  }

  await AppSetting.upsertSetting({
    key: ACTIVITY_MAP_KEY,
    value: map,
    description: 'Per-activity WhatsApp provider overrides ("official" | "baileys"). Missing keys inherit whatsapp_provider.',
  });

  return map;
}

async function listActivitiesWithProviders() {
  const [map, globalProvider] = await Promise.all([getActivityProviderMap(), getWhatsAppProvider()]);
  return ACTIVITIES.map((activity) => {
    const override = map[activity.key];
    const isOverridden = override === 'official' || override === 'baileys';
    return {
      ...activity,
      provider: isOverridden ? override : 'inherit',
      effectiveProvider: isOverridden ? override : globalProvider,
    };
  });
}

module.exports = {
  ACTIVITIES,
  getProviderForActivity,
  setActivityProvider,
  listActivitiesWithProviders,
  getActivityProviderMap,
};
