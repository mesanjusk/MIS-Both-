const { randomUUID } = require('crypto');
const SOPTask = require('../repositories/sopTask');
const SOPCompletion = require('../repositories/sopCompletion');
const Attendance = require('../repositories/attendance');
const User = require('../repositories/users');

function getIstDate(d = new Date()) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function getTodayDate() {
  const ist = getIstDate();
  const str = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
  return new Date(str);
}

async function hasActiveUsersInGroup(group, date) {
  const users = await User.find({ User_group: group }).select('User_uuid').lean();
  if (!users.length) return false;
  const uuids = users.map((u) => u.User_uuid);
  const record = await Attendance.findOne({
    Employee_uuid: { $in: uuids },
    Date: date,
    'User.Type': 'In',
  }).lean();
  return Boolean(record);
}

async function getEffectiveGroup(task, date) {
  const chain = [task.primaryGroup, ...(task.fallbackGroups || [])];
  for (const group of chain) {
    if (!group) continue;
    const active = await hasActiveUsersInGroup(group, date);
    if (active) return group;
  }
  return task.primaryGroup;
}

async function getTasksForGroup(userGroup, date) {
  const tasks = await SOPTask.find({ isActive: true, frequency: 'daily' })
    .sort({ sortOrder: 1 })
    .lean();

  const result = [];
  for (const task of tasks) {
    const effective = await getEffectiveGroup(task, date);
    if (effective === userGroup) result.push(task);
  }
  return result;
}

async function getDailyStatus(userGroup) {
  const date = getTodayDate();
  const tasks = await getTasksForGroup(userGroup, date);

  const completions = await SOPCompletion.find({
    sop_uuid: { $in: tasks.map((t) => t.sop_uuid) },
    date,
  }).lean();

  const completionMap = {};
  for (const c of completions) {
    completionMap[c.sop_uuid] = c;
  }

  const mandatory = tasks.filter((t) => !t.isSkippable);
  const blockingTasks = mandatory.filter((t) => !completionMap[t.sop_uuid]);
  const canEndDay = blockingTasks.length === 0;

  return { tasks, completionMap, canEndDay, blockingTasks, date };
}

async function markComplete({ sopUuid, userName, userGroup }) {
  const date = getTodayDate();
  const task = await SOPTask.findOne({ sop_uuid: sopUuid }).lean();
  if (!task) throw new Error('SOP task not found');

  const existing = await SOPCompletion.findOne({ sop_uuid: sopUuid, date });
  if (existing) return existing;

  return SOPCompletion.create({
    sop_uuid: sopUuid,
    date,
    completedBy: userName,
    completedByName: userName,
    completedAt: new Date(),
    skipped: false,
    assignedGroup: userGroup,
  });
}

async function markSkipped({ sopUuid, userName, userGroup, skipReason = '' }) {
  const date = getTodayDate();
  const task = await SOPTask.findOne({ sop_uuid: sopUuid }).lean();
  if (!task) throw new Error('SOP task not found');
  if (!task.isSkippable) throw new Error('This task cannot be skipped');

  const existing = await SOPCompletion.findOne({ sop_uuid: sopUuid, date });
  if (existing) return existing;

  return SOPCompletion.create({
    sop_uuid: sopUuid,
    date,
    completedBy: userName,
    completedByName: userName,
    completedAt: new Date(),
    skipped: true,
    skipReason,
    assignedGroup: userGroup,
  });
}

const DEFAULT_SOP_TASKS = [
  { title: 'Mark attendance & login to MIS', description: 'All staff log in with individual credentials. Mark attendance via dashboard or WhatsApp command. Absences by 9:15 AM escalated to Owner.', section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: ['Office Marketing', 'Office Design'], isSkippable: false, kpi: '100% staff attendance by 9:15 AM', sortOrder: 1 },
  { title: 'Review dashboard summary cards', description: "Open Dashboard → review Today's Orders Count, Pending Orders, Today's Revenue, Today's Deliveries, Pending Receivables.", section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 unreviewed overdue orders at day start', sortOrder: 2 },
  { title: 'Action stuck orders widget', description: 'Ready Not Delivered → must be dispatched today. Delivered Unpaid → assign to Accounts for payment follow-up.', section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 stuck orders unactioned', sortOrder: 3 },
  { title: 'Review overdue orders', description: 'Check orders with dueDate in the past that are not delivered. Prioritise and escalate immediately.', section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 unreviewed overdue orders', sortOrder: 4 },
  { title: "Review today's payment reminders", description: 'Accounts opens Day Book, verifies cash opening balance. Reviews all Payment Reminders scheduled for today.', section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 unactioned reminders by 9:30 AM', sortOrder: 5 },
  { title: 'Complete 5-minute standup', description: "Each person states: what they're working on, what's pending, any blockers.", section: 'Section 1 — Day Start', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Admin', fallbackGroups: ['Office Marketing', 'Office Design'], isSkippable: false, kpi: 'All staff participation', sortOrder: 6 },
  { title: 'Monitor WhatsApp inbox continuously', description: 'Monitor WhatsApp Cloud inbox during all business hours. Verify automated Flow Builder triggers are active.', section: 'Section 2 — Enquiry Handling', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Admin', fallbackGroups: ['Office Marketing'], isSkippable: false, kpi: 'Response time < 15 min', sortOrder: 7 },
  { title: 'Log all new enquiries within 30 minutes', description: 'Every enquiry (WhatsApp, walk-in, phone, email) must be logged in MIS → Add Enquiry within 30 minutes of receipt. Respond/acknowledge within 15 minutes.', section: 'Section 2 — Enquiry Handling', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Admin', fallbackGroups: ['Office Marketing'], isSkippable: false, kpi: '100% enquiries logged | Response < 15 min', sortOrder: 8 },
  { title: 'Send quotations within 2 hours', description: 'Review enquiry and send quotation for standard items within 2 hours. Share via WhatsApp using order_new_sk template.', section: 'Section 3 — Quotation and Estimation', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: true, kpi: 'Quotation sent < 2 hours | 60%+ acceptance rate', sortOrder: 9 },
  { title: 'Check Gmail 3x daily (9:30 AM, 1:00 PM, 5:00 PM)', description: 'Check Gmail linked via MIS at scheduled times. Reply via MIS Email Compose to maintain history.', section: 'Section 2 — Enquiry Handling', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '100% emails replied same day', sortOrder: 10 },
  { title: 'Review design task queue from My Day', description: "Designer checks Dashboard → My Day for all pending design tasks. Confirm deadlines and prioritise.", section: 'Section 5 — Design Workflow', frequency: 'daily', timeOfDay: 'morning', primaryGroup: 'Office Design', fallbackGroups: ['Office Admin'], isSkippable: false, kpi: 'All design tasks reviewed by 9:30 AM', sortOrder: 11 },
  { title: 'Send proofs to customers with pending designs', description: 'Share proof via WhatsApp (Drive link or PDF/JPEG). Add Order Note: "Proof sent on [date/time]". Log approval or revision in notes.', section: 'Section 5 — Design Workflow', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Design', fallbackGroups: [], isSkippable: true, kpi: 'Proof sent < 4 working hours after design stage', sortOrder: 12 },
  { title: 'Confirm all active design files saved in Google Drive', description: 'Designer confirms all active files are saved in linked Google Drive folder. Pending customer approvals followed up.', section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Design', fallbackGroups: [], isSkippable: false, kpi: '100% files in Drive before close', sortOrder: 13 },
  { title: 'Follow up customer approvals pending >24 hours', description: 'Check all designs sent for approval >24 hours ago. Send follow-up message. Escalate delays to Owner.', section: 'Section 5 — Design Workflow', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Design', fallbackGroups: ['Office Admin'], isSkippable: false, kpi: '70%+ approval within 24 hours', sortOrder: 14 },
  { title: 'Check and respond to social media & sourced leads', description: 'Monitor Instagram, Google, referral leads. Log each as Enquiry or Call Log with source remark in MIS.', section: 'Section 15 — Marketing and Lead Generation', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Marketing', fallbackGroups: ['Office Admin'], isSkippable: true, kpi: 'All leads logged same day', sortOrder: 15 },
  { title: 'Plan or schedule WhatsApp broadcasts', description: 'Use MIS Broadcast Page. Build lists by Customer Group + Tags. Schedule campaigns at 10 AM or 6 PM.', section: 'Section 15 — Marketing and Lead Generation', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Marketing', fallbackGroups: [], isSkippable: true, kpi: '≥ 2 targeted campaigns/month', sortOrder: 16 },
  { title: 'Log all offline and social leads in MIS', description: 'Every lead from offline/social sources must be logged as Enquiry record with source tag (Instagram/Google/Referral).', section: 'Section 15 — Marketing and Lead Generation', frequency: 'daily', timeOfDay: 'during_day', primaryGroup: 'Office Marketing', fallbackGroups: ['Office Admin'], isSkippable: false, kpi: '100% leads logged | 55%+ enquiry-to-order conversion', sortOrder: 17 },
  { title: 'Order kanban sweep', description: 'Review Order Kanban. Ensure no order is stuck without a next action. Communicate delays to affected customers.', section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 stuck orders at close', sortOrder: 18 },
  { title: 'Cash reconciliation', description: 'Count physical cash. Compare with MIS Day Book (opening + receipts - payments = closing). Discrepancy > Rs 100 requires Owner sign-off.', section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '100% cash reconciled daily', sortOrder: 19 },
  { title: 'UPI reconciliation', description: "All today's UPI payments appear in system with reference numbers. Check Bank Reconciliation page for unmatched entries.", section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 unmatched UPI entries', sortOrder: 20 },
  { title: "Action all today's payment reminders", description: 'All due-today payment reminders must be actioned (called/messaged) and marked done or rescheduled. No unactioned reminders at close.', section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '0 unactioned payment reminders at close', sortOrder: 21 },
  { title: 'Vendor follow-up for deliveries due today', description: 'Verify all vendor assignments due today. If work not received, call vendor and update due date in MIS.', section: 'Section 17 — Day End Procedures', frequency: 'daily', timeOfDay: 'evening', primaryGroup: 'Office Admin', fallbackGroups: [], isSkippable: false, kpi: '100% vendor deliveries verified', sortOrder: 22 },
];

async function seedDefaultTasks() {
  const count = await SOPTask.countDocuments();
  if (count > 0) return { seeded: false, message: 'Tasks already exist. Clear first to re-seed.' };

  const docs = DEFAULT_SOP_TASKS.map((t) => ({ ...t, sop_uuid: randomUUID() }));
  await SOPTask.insertMany(docs);
  return { seeded: true, count: docs.length };
}

async function seedUserGroups() {
  const Usergroup = require('../repositories/usergroup');
  const newGroups = ['Office Design', 'Office Admin', 'Office Marketing'];
  const { randomUUID: uuid } = require('crypto');
  for (const group of newGroups) {
    const exists = await Usergroup.findOne({ User_group: group }).lean();
    if (!exists) {
      await Usergroup.create({ User_group_uuid: uuid(), User_group: group });
    }
  }
}

module.exports = {
  getDailyStatus,
  markComplete,
  markSkipped,
  seedDefaultTasks,
  seedUserGroups,
  SOPTask,
  SOPCompletion,
};
