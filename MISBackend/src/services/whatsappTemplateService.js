const { AppSetting } = require('../repositories/appSetting');

// Every WhatsApp message body and button label the project sends is defined
// here as a template, not as a literal string at the call site. Admins edit
// the text/labels from the frontend (Settings > WhatsApp Message Templates);
// the {{variable}} placeholders are filled in at send time by renderTemplate.
// Button `id` values double as the action wiring the rest of the backend
// switches on (e.g. "paymode:cash:{{orderUuid}}") — admins can reword the
// label, but the id shape stays intact so the underlying action is unchanged.

const SETTING_KEY = 'whatsapp_message_templates';

function tpl(key, category, label, body, { buttons = [], listButtonLabel = '' } = {}) {
  return { key, category, label, body, buttons, listButtonLabel };
}

const DEFAULT_TEMPLATES = [
  // ── Orders (staff commands) ─────────────────────────────────────────────
  tpl('order.pay_denied', 'Orders', 'Payment: role not permitted', 'Your role cannot record payments from WhatsApp.'),
  tpl('order.not_found', 'Orders', 'Order not found', 'That order no longer exists.'),
  tpl('order.no_outstanding', 'Orders', 'Payment: nothing outstanding', 'Order #{{orderNumber}} has no outstanding balance.'),
  tpl('order.pay_ask_amount', 'Orders', 'Payment: ask amount', 'Order #{{orderNumber}} outstanding: ₹{{outstanding}}. Reply with the amount received (numbers only), or CANCEL.'),
  tpl('order.pay_use_buttons', 'Orders', 'Payment: use buttons', 'Please use the buttons above, or reply CANCEL.'),
  tpl('order.pay_invalid_amount', 'Orders', 'Payment: invalid amount', 'Please send a valid amount (e.g. 500), or CANCEL.'),
  tpl('order.pay_amount_too_high', 'Orders', 'Payment: amount exceeds balance', "That's more than the outstanding balance of ₹{{outstanding}}. Please send an amount up to ₹{{outstanding}}, or CANCEL."),
  tpl('order.pay_mode_prompt', 'Orders', 'Payment: choose mode', 'Amount: ₹{{amount}}. How was it received?', {
    buttons: [
      { id: 'paymode:cash:{{orderUuid}}', label: 'Cash' },
      { id: 'paymode:upi:{{orderUuid}}', label: 'UPI' },
      { id: 'paymode:bank:{{orderUuid}}', label: 'Bank' },
    ],
  }),
  tpl('order.pay_step_expired', 'Orders', 'Payment: step expired', "That payment step has expired. Start again from the order's Receive payment button."),
  tpl('order.pay_confirm', 'Orders', 'Payment: confirm', 'Receive ₹{{amount}} via {{mode}} for Order #{{orderNumber}}?', {
    buttons: [
      { id: 'ok:pay:{{orderUuid}}', label: 'Confirm' },
      { id: 'no:pay:{{orderUuid}}', label: 'Cancel' },
    ],
  }),
  tpl('order.pay_recorded', 'Orders', 'Payment: recorded', 'Recorded ₹{{amount}} ({{mode}}) for Order #{{orderNumber}}. Outstanding: ₹{{outstanding}}.'),
  tpl('order.pay_error', 'Orders', 'Payment: error', 'Could not record that payment — please use the app.'),

  tpl('order.create_denied', 'Orders', 'New order: role not permitted', 'Your role cannot create orders from WhatsApp.'),
  tpl('order.create_ask_phone', 'Orders', 'New order: ask phone', "New order — send the customer's 10-digit mobile number, or CANCEL."),
  tpl('order.create_invalid_phone', 'Orders', 'New order: invalid phone', 'Please send a valid 10-digit mobile number, or CANCEL.'),
  tpl('order.create_customer_found', 'Orders', 'New order: customer matched', 'Customer: {{customerName}}. Now send a short order description (e.g. "500 visiting cards").'),
  tpl('order.create_ask_new_name', 'Orders', 'New order: ask new customer name', "No customer found for that number. Send the customer's name to create a new customer record, or CANCEL."),
  tpl('order.create_invalid_name', 'Orders', 'New order: invalid name', 'Please send a valid name, or CANCEL.'),
  tpl('order.create_customer_created', 'Orders', 'New order: customer created', 'Created new customer {{customerName}}. Now send a short order description.'),
  tpl('order.create_invalid_description', 'Orders', 'New order: invalid description', 'Please send a short description, or CANCEL.'),
  tpl('order.create_ask_amount', 'Orders', 'New order: ask amount', 'Enter the order amount (₹, numbers only).'),
  tpl('order.create_invalid_amount', 'Orders', 'New order: invalid amount', 'Please send a valid amount (e.g. 1500), or CANCEL.'),
  tpl('order.create_confirm', 'Orders', 'New order: confirm', 'Create order for {{customerName}}: "{{note}}" — ₹{{amount}}. Confirm?', {
    buttons: [
      { id: 'ok:createOrder:new', label: 'Confirm' },
      { id: 'no:createOrder:new', label: 'Cancel' },
    ],
  }),
  tpl('order.create_use_buttons', 'Orders', 'New order: use buttons', 'Please use the Confirm/Cancel buttons above, or reply CANCEL.'),
  tpl('order.create_draft_expired', 'Orders', 'New order: draft expired', 'That order draft has expired. Start again with "new order".'),
  tpl('order.create_success', 'Orders', 'New order: created', 'Order #{{orderNumber}} created for {{customerName}} — ₹{{amount}}.'),
  tpl('order.create_error', 'Orders', 'New order: error', 'Could not create that order — please use the app.'),

  tpl('order.cancelled', 'Orders', 'Action cancelled', 'Cancelled — no changes made.'),
  tpl('order.stage_final', 'Orders', 'Stage: already final', 'Order #{{orderNumber}} is already at its final stage.'),
  tpl('order.stage_denied', 'Orders', 'Stage: role not permitted', 'Your role cannot change order stages from WhatsApp.'),
  tpl('order.stage_moved', 'Orders', 'Stage: moved', 'Order #{{orderNumber}} moved to "{{stage}}".'),
  tpl('order.assign_denied', 'Orders', 'Assign: role not permitted', 'Your role cannot self-assign orders from WhatsApp.'),
  tpl('order.assign_already', 'Orders', 'Assign: already assigned', 'Order #{{orderNumber}} is already assigned.'),
  tpl('order.assign_error', 'Orders', 'Assign: error', 'Could not assign that order — please use the app.'),
  tpl('order.assign_success', 'Orders', 'Assign: success', 'Order #{{orderNumber}} assigned to you.'),
  tpl('order.unknown_action', 'Orders', 'Unknown action', 'Unknown action.'),
  tpl('order.number_not_found', 'Orders', 'Order number not found', 'Order #{{orderNumber}} not found.'),
  tpl('order.action_confirm_generic', 'Orders', 'Generic action: confirm', 'Please confirm this action.', {
    buttons: [
      { id: 'ok:{{action}}:{{orderUuid}}', label: 'Confirm' },
      { id: 'no:{{action}}:{{orderUuid}}', label: 'Cancel' },
    ],
  }),

  tpl('order.list_empty', 'Orders', 'Order list: empty', 'No open orders right now.'),
  tpl('order.list_intro', 'Orders', 'Order list: intro', '{{count}} open order{{plural}} for you:', { listButtonLabel: 'View orders' }),

  tpl('order.detail_header', 'Orders', 'Order detail: header', 'Order #{{orderNumber}}\nStage: {{stage}}\nDue: {{due}}\nAmount: ₹{{amount}}'),
  tpl('order.detail_outstanding_line', 'Orders', 'Order detail: outstanding line', 'Outstanding: ₹{{outstanding}}'),
  tpl('order.detail_button_ready', 'Orders', 'Order detail: mark ready button', 'Mark ready'),
  tpl('order.detail_button_delivered', 'Orders', 'Order detail: mark delivered button', 'Mark delivered'),
  tpl('order.detail_button_move', 'Orders', 'Order detail: move-to button', 'Move to {{stage}}'),
  tpl('order.detail_button_assign', 'Orders', 'Order detail: assign-to-me button', 'Assign to me'),
  tpl('order.detail_button_pay', 'Orders', 'Order detail: receive payment button', 'Receive payment'),

  // ── Customer-facing order lookups ───────────────────────────────────────
  tpl('customer.no_account', 'Customers', 'No order account found', "We couldn't find an order account for this number. Please contact us directly."),
  tpl('customer.no_orders', 'Customers', 'No orders yet', "You don't have any orders with us yet."),
  tpl('customer.list_intro', 'Customers', 'Order list: intro', '{{count}} order{{plural}} on your account:', { listButtonLabel: 'View orders' }),
  tpl('customer.order_not_found', 'Customers', 'Order not found', 'Order not found on your account.'),
  tpl('customer.detail_header', 'Customers', 'Order detail: header', 'Order #{{orderNumber}}\nStatus: {{stage}}\nAmount: ₹{{amount}}'),
  tpl('customer.detail_footer_due', 'Customers', 'Order detail: balance due footer', 'Balance due: ₹{{outstanding}}\nFor payment options, reply CONTACT and our team will assist you.'),
  tpl('customer.detail_footer_paid', 'Customers', 'Order detail: fully paid footer', 'Fully paid — thank you!'),

  // ── Attendance ───────────────────────────────────────────────────────────
  tpl('attendance.checkin_prompt', 'Attendance', 'Daily check-in prompt', 'Good morning {{name}}! Are you coming in today?', {
    buttons: [
      { id: 'attn:mark:start', label: 'Start' },
      { id: 'attn:today:absent', label: 'Not Coming Today' },
    ],
  }),
  tpl('attendance.menu_active', 'Attendance', 'Menu: actions available', 'Hi {{name}}, what would you like to do?'),
  tpl('attendance.menu_complete', 'Attendance', 'Menu: day complete', 'Hi {{name}}, your attendance for today is complete.'),
  tpl('attendance.update_button', 'Attendance', 'Menu: Update button', 'Update'),
  tpl('attendance.today_summary', 'Attendance', "Today's attendance summary", "Today's attendance:\n{{statusLines}}"),
  tpl('attendance.no_marks_yet', 'Attendance', 'No attendance marked yet', 'No attendance marked yet today.'),
  tpl('attendance.disabled_reply', 'Attendance', 'WhatsApp attendance disabled', 'Attendance via WhatsApp is currently unavailable.'),
  tpl('attendance.absence_reason_prompt', 'Attendance', 'Ask absence reason', "Please share a short reason you won't be in today."),
  tpl('attendance.absence_empty_reason', 'Attendance', 'Absence reason empty', 'Please send a short text reason.'),
  tpl('attendance.absence_ack', 'Attendance', 'Absence acknowledged', "Thanks — noted that you won't be in today. The team has been informed."),
  tpl('attendance.office_absence_notify', 'Attendance', 'Notify office of absence', "{{employeeName}} won't be in today ({{date}}).\nReason: {{reason}}"),

  // ── Order lifecycle & tasks ──────────────────────────────────────────────
  tpl('lifecycle.delivered_notify', 'Order Lifecycle', 'Order delivered notice', 'Dear {{customerName}}, your order #{{orderNumber}} is ready for delivery.\n\nAmount due: Rs {{amount}}.\n\nPlease arrange payment. Thank you! - {{businessName}}'),
  tpl('task.pending_overview_empty', 'Tasks', 'Pending overview: all clear', 'Pending tasks overview: all clear, no open orders right now.'),
  tpl('task.pending_overview', 'Tasks', 'Pending overview', 'Pending tasks overview ({{total}} total, {{overdue}} overdue):\n{{lines}}'),
  tpl('task.assignment_notify', 'Tasks', 'Assigned to you', "📌 NEW DESIGN ORDER ASSIGNED\n\n━━━━━━━━━━━━━━━━━━\n\n🆔 Order ID: #{{orderNumber}}\n👤 Customer: {{customerName}}\n👨‍💼 Assigned By: {{assignedBy}}\n📅 Due Date: {{dueDate}}\n⏰ Due Time: {{dueTime}}\n\n━━━━━━━━━━━━━━━━━━"),
  tpl('task.admin_assignment_notify', 'Tasks', 'Admin: order assigned', "📌 NEW DESIGN ORDER ASSIGNED\n\n━━━━━━━━━━━━━━━━━━\n\n🆔 Order ID: #{{orderNumber}}\n👤 Customer: {{customerName}}\n🧑‍🎨 Assigned To: {{userName}}\n👨‍💼 Assigned By: {{assignedBy}}\n📅 Due Date: {{dueDate}}\n⏰ Due Time: {{dueTime}}\n\n━━━━━━━━━━━━━━━━━━"),
  tpl('task.summary_none', 'Tasks', 'No pending tasks', 'Hi {{name}}, no pending order tasks are assigned to you right now.'),
  tpl('task.summary_intro', 'Tasks', 'Pending task list', 'Hi {{name}}, here are your pending order tasks for today till 8:00 PM:\n{{list}}'),
  tpl('task.list_intro', 'Tasks', 'Pending task list (interactive)', 'Hi {{name}}, you have {{count}} pending task{{plural}}:', { listButtonLabel: 'View tasks' }),

  // ── Scheduled digests ────────────────────────────────────────────────────
  tpl('digest.evening', 'Scheduler', 'Evening overdue digest', 'Hi {{userName}}, {{total}} items are overdue:\n{{lines}}\nPlease update status or contact manager.'),
  tpl('digest.morning_empty', 'Scheduler', 'Morning digest: nothing pending', 'Good morning {{userName}}! No pending tasks today.'),
  tpl('digest.morning', 'Scheduler', 'Morning digest', 'Good Morning {{userName}}! Your tasks for today:\n\nORDERS:\n{{orderLines}}\n\nTASKS:\n{{taskLines}}\n\nTotal pending: {{total}}\nHave a productive day! - {{businessName}}'),
  tpl('digest.owner_summary', 'Scheduler', 'Owner daily summary', '📊 *Daily Business Summary*\n{{date}}\n\n📋 Active Orders: {{activeOrders}}\n🚚 Ready to Dispatch: {{readyOrders}}\n💰 Total Outstanding: ₹{{outstanding}}\n\nLogin to dashboard for full details.'),

  // ── Payment follow-up ────────────────────────────────────────────────────
  tpl('followup.overdue_reminder', 'Payment Follow-up', 'Overdue payment reminder', 'Dear {{customerName}},\n\nThis is a payment reminder for {{amount}} pending against your order/account.\n\nKindly arrange payment at the earliest.\n\nThank you.'),
];

const DEFAULT_TEMPLATE_MAP = new Map(DEFAULT_TEMPLATES.map((t) => [t.key, t]));

function interpolate(str, vars) {
  let text = String(str ?? '');
  Object.entries(vars || {}).forEach(([key, value]) => {
    text = text.replaceAll(`{{${key}}}`, String(value ?? ''));
  });
  return text;
}

function sanitizeButtons(buttons, fallback) {
  if (!Array.isArray(buttons) || !buttons.length) return fallback;
  return buttons.map((button, index) => ({
    id: String(button?.id || fallback[index]?.id || `btn_${index + 1}`),
    label: String(button?.label ?? fallback[index]?.label ?? ''),
  }));
}

// Only known keys can be overridden — admins edit text/labels for messages
// the code already sends, never invent a new key the code has no reference to.
function sanitizeTemplates(payload) {
  const overrides = Array.isArray(payload) ? payload : [];
  const byKey = new Map(overrides.map((entry) => [entry?.key, entry]));

  return DEFAULT_TEMPLATES.map((defaultTemplate) => {
    const override = byKey.get(defaultTemplate.key);
    if (!override) return defaultTemplate;
    return {
      key: defaultTemplate.key,
      category: defaultTemplate.category,
      label: defaultTemplate.label,
      body: String(override.body ?? defaultTemplate.body),
      buttons: sanitizeButtons(override.buttons, defaultTemplate.buttons),
      listButtonLabel: String(override.listButtonLabel ?? defaultTemplate.listButtonLabel ?? ''),
    };
  });
}

async function getTemplates() {
  const stored = await AppSetting.getSetting(SETTING_KEY, null);
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_TEMPLATES;
  return sanitizeTemplates(stored);
}

async function saveTemplates(payload) {
  const sanitized = sanitizeTemplates(payload);
  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: sanitized,
    description: 'Admin-managed WhatsApp message text and button labels',
  });
  return sanitized;
}

async function getTemplateMap() {
  const templates = await getTemplates();
  return new Map(templates.map((t) => [t.key, t]));
}

// Renders one template with variables substituted into the body and every
// button's id/label. Falls back to the built-in default if an unknown key is
// requested, so a bad admin edit or a stale deploy never breaks a send.
async function renderTemplate(key, vars = {}) {
  const map = await getTemplateMap();
  const template = map.get(key) || DEFAULT_TEMPLATE_MAP.get(key);
  if (!template) throw new Error(`Unknown WhatsApp template: ${key}`);

  return {
    body: interpolate(template.body, vars),
    buttons: (template.buttons || []).map((button) => ({
      id: interpolate(button.id, vars),
      title: interpolate(button.label, vars),
    })),
    listButtonLabel: template.listButtonLabel || '',
  };
}

module.exports = {
  DEFAULT_TEMPLATES,
  getTemplates,
  saveTemplates,
  renderTemplate,
};
