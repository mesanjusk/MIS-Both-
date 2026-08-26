// Team Operations — seeding.
//
// Everything here writes *initial configuration only*. Two rules hold:
//   1. No seeded row names a user. Responsibilities are created with empty
//      primary/backup slots; management fills them in from the frontend.
//   2. Seeding is additive and idempotent — it never overwrites an existing
//      row and never touches user identities.
const { randomUUID } = require('crypto');
const Responsibility = require('../repositories/responsibility');
const SOPTask = require('../repositories/sopTask');
const { AppSetting } = require('../repositories/appSetting');
const {
  STORE_SETTINGS_KEY,
  PRIORITY_LEVELS_KEY,
  DEPARTMENTS_KEY,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_PRIORITY_LEVELS,
  DEFAULT_DEPARTMENTS,
} = require('./operationsService');

// The §3 table, expressed as *defaults attached to a priority code* rather
// than to a person. Assigning P1 to a different user tomorrow carries this
// suggested role title with it; management can override the title per user.
const DEFAULT_PRIORITY_ROLE_TITLES = {
  P1: 'Senior Designer / Creative & Design Head',
  P2: 'Customer + Order + Production Coordinator',
  P3: 'Marketing + Growth + Junior Designer + Store Support',
  P4: 'Logistics + Delivery',
};

const DEFAULT_RESPONSIBILITIES = [
  { name: 'Complex Design', category: 'design', isCritical: true, sortOrder: 10 },
  { name: 'Creative Direction', category: 'design', isCritical: false, sortOrder: 20 },
  { name: 'Final QC', category: 'design', isCritical: true, sortOrder: 30 },
  { name: 'Customer Enquiry', category: 'customer', isCritical: true, sortOrder: 40 },
  { name: 'Quotation', category: 'customer', isCritical: true, sortOrder: 50 },
  { name: 'Order Coordination', category: 'customer', isCritical: true, sortOrder: 60 },
  { name: 'Vendor Coordination', category: 'production', isCritical: true, sortOrder: 70 },
  { name: 'Marketing', category: 'marketing', isCritical: false, sortOrder: 80 },

  // Inside-store work — deliberately its own category so it keeps running
  // while the logistics user is out on a delivery (§12).
  { name: 'Receive Outsourced Printing', category: 'inside_store', isCritical: true, sortOrder: 90 },
  { name: 'Quantity Check', category: 'inside_store', isCritical: true, sortOrder: 100 },
  { name: 'Physical QC', category: 'inside_store', isCritical: true, sortOrder: 110 },
  { name: 'Packaging', category: 'inside_store', isCritical: true, sortOrder: 120 },
  { name: 'Labelling', category: 'inside_store', isCritical: false, sortOrder: 130 },
  { name: 'Courier Preparation', category: 'inside_store', isCritical: false, sortOrder: 140 },
  { name: 'Finished-Job Organization', category: 'inside_store', isCritical: false, sortOrder: 150 },
  { name: 'Stock Checking', category: 'inside_store', isCritical: false, sortOrder: 160 },
  { name: 'Material Arrangement', category: 'inside_store', isCritical: false, sortOrder: 170 },

  // Outside logistics — a user marked Outside stays available for these.
  { name: 'Vendor Pickup', category: 'outside_logistics', isCritical: true, sortOrder: 180 },
  { name: 'Customer Delivery', category: 'outside_logistics', isCritical: true, sortOrder: 190 },
  { name: 'Courier', category: 'outside_logistics', isCritical: false, sortOrder: 200 },
  { name: 'Material Collection', category: 'outside_logistics', isCritical: false, sortOrder: 210 },
  { name: 'Outside Purchase', category: 'outside_logistics', isCritical: false, sortOrder: 220 },
  { name: 'External Errands', category: 'outside_logistics', isCritical: false, sortOrder: 230 },

  { name: 'Payment Collection', category: 'accounts', isCritical: true, sortOrder: 240 },
  { name: 'Daily Report', category: 'general', isCritical: false, sortOrder: 250 },
];

// §23 / §24. Times are initial values; every one is editable per task.
const OPENING_CHECKLIST = [
  { title: 'Open store', responsibility: 'Material Arrangement', time: '09:30' },
  { title: 'Prepare workspace', responsibility: 'Material Arrangement', time: '09:35' },
  { title: 'Start systems', responsibility: 'Material Arrangement', time: '09:40' },
  { title: 'Check new orders', responsibility: 'Order Coordination', time: '10:00' },
  { title: 'Check customer approvals', responsibility: 'Customer Enquiry', time: '10:05' },
  { title: 'Check vendor jobs', responsibility: 'Vendor Coordination', time: '10:10' },
  { title: 'Check design queue', responsibility: 'Complex Design', time: '10:15' },
  { title: 'Check deliveries', responsibility: 'Customer Delivery', time: '10:20' },
  { title: 'Check pickups', responsibility: 'Vendor Pickup', time: '10:25' },
  { title: 'Check marketing calendar', responsibility: 'Marketing', time: '10:30' },
];

const CLOSING_CHECKLIST = [
  { title: 'Update orders', responsibility: 'Order Coordination', time: '18:30' },
  { title: 'Update vendor status', responsibility: 'Vendor Coordination', time: '18:35' },
  { title: 'Check pending designs', responsibility: 'Complex Design', time: '18:40' },
  { title: 'Check customer approvals', responsibility: 'Customer Enquiry', time: '18:45' },
  { title: "Prepare tomorrow's deliveries", responsibility: 'Customer Delivery', time: '18:50' },
  { title: "Prepare tomorrow's pickups", responsibility: 'Vendor Pickup', time: '18:55' },
  { title: 'Complete packaging', responsibility: 'Packaging', time: '19:00' },
  { title: 'Update payments', responsibility: 'Payment Collection', time: '19:05' },
  { title: 'Complete marketing tasks', responsibility: 'Marketing', time: '19:10' },
  { title: 'Generate daily report', responsibility: 'Daily Report', time: '19:15' },
  { title: 'Secure store', responsibility: 'Material Arrangement', time: '19:30' },
];

/** Write the default settings rows if an admin has never saved them. */
const seedSettings = async () => {
  const results = {};
  const existingStore = await AppSetting.getSetting(STORE_SETTINGS_KEY, null);
  if (!existingStore) {
    await AppSetting.upsertSetting({
      key: STORE_SETTINGS_KEY,
      value: DEFAULT_STORE_SETTINGS,
      description: 'Store reporting/opening/closing times and working days',
    });
    results.storeSettings = 'created';
  } else {
    results.storeSettings = 'exists';
  }

  const existingLevels = await AppSetting.getSetting(PRIORITY_LEVELS_KEY, null);
  if (!existingLevels) {
    await AppSetting.upsertSetting({
      key: PRIORITY_LEVELS_KEY,
      value: DEFAULT_PRIORITY_LEVELS.map((level) => ({
        ...level,
        defaultRoleTitle: DEFAULT_PRIORITY_ROLE_TITLES[level.code] || '',
      })),
      description: 'Operational priority codes available for assignment to users',
    });
    results.priorityLevels = 'created';
  } else {
    results.priorityLevels = 'exists';
  }

  const existingDepartments = await AppSetting.getSetting(DEPARTMENTS_KEY, null);
  if (!existingDepartments) {
    await AppSetting.upsertSetting({
      key: DEPARTMENTS_KEY,
      value: DEFAULT_DEPARTMENTS,
      description: 'Departments available for assignment to users',
    });
    results.departments = 'created';
  } else {
    results.departments = 'exists';
  }

  return results;
};

/** Create the responsibility catalogue with every ownership slot left empty. */
const seedResponsibilities = async () => {
  const existing = await Responsibility.find({}).select('name').lean();
  const existingNames = new Set(existing.map((item) => item.name.toLowerCase()));

  const toCreate = DEFAULT_RESPONSIBILITIES.filter(
    (item) => !existingNames.has(item.name.toLowerCase())
  ).map((item) => ({
    ...item,
    responsibility_uuid: randomUUID(),
    // Left unassigned on purpose — management assigns users from
    // Settings → Operations → Responsibilities.
    primaryUserUuid: '',
    backup1UserUuid: '',
    backup2UserUuid: '',
    isActive: true,
  }));

  if (toCreate.length) await Responsibility.insertMany(toCreate);
  return { created: toCreate.length, skipped: DEFAULT_RESPONSIBILITIES.length - toCreate.length };
};

/** Create the opening/closing checklists as SOP tasks linked to responsibilities. */
const seedChecklists = async () => {
  const responsibilities = await Responsibility.find({}).select('name responsibility_uuid category').lean();
  const byName = new Map(responsibilities.map((item) => [item.name.toLowerCase(), item]));

  const build = (entries, section, timeOfDay, startOrder) =>
    entries.map((entry, index) => {
      const responsibility = byName.get(entry.responsibility.toLowerCase());
      return {
        sop_uuid: randomUUID(),
        title: entry.title,
        description: '',
        section,
        frequency: 'daily',
        timeOfDay,
        // primaryGroup is required by the existing SOPTask schema; the
        // responsibility link below is what actually resolves ownership.
        primaryGroup: 'Office Admin',
        fallbackGroups: [],
        responsibility_uuid: responsibility?.responsibility_uuid || '',
        category: responsibility?.category || 'general',
        scheduledTime: entry.time,
        weekDays: [],
        isSkippable: false,
        isActive: true,
        sortOrder: startOrder + index,
      };
    });

  const wanted = [
    ...build(OPENING_CHECKLIST, 'Opening Checklist', 'morning', 1000),
    ...build(CLOSING_CHECKLIST, 'Closing Checklist', 'evening', 2000),
  ];

  const existing = await SOPTask.find({ section: { $in: ['Opening Checklist', 'Closing Checklist'] } })
    .select('title section')
    .lean();
  const existingKeys = new Set(existing.map((item) => `${item.section}::${item.title.toLowerCase()}`));

  const toCreate = wanted.filter(
    (item) => !existingKeys.has(`${item.section}::${item.title.toLowerCase()}`)
  );
  if (toCreate.length) await SOPTask.insertMany(toCreate);
  return { created: toCreate.length, skipped: wanted.length - toCreate.length };
};

const seedAll = async () => {
  const settings = await seedSettings();
  const responsibilities = await seedResponsibilities();
  const checklists = await seedChecklists();
  return { settings, responsibilities, checklists };
};

module.exports = {
  DEFAULT_PRIORITY_ROLE_TITLES,
  DEFAULT_RESPONSIBILITIES,
  OPENING_CHECKLIST,
  CLOSING_CHECKLIST,
  seedSettings,
  seedResponsibilities,
  seedChecklists,
  seedAll,
};
