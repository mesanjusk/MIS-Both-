export const WHATSAPP_TEMPLATES = {
  AMOUNT_RECEIVED: 'amount_received_sk',
  AMOUNT_PAID: 'amount_payment_sk',
  ORDER_CONFIRMATION: 'order_new_sk',
  ORDER_COMPLETED: 'order_completed_sk',
  FOLLOWUP_FRIENDLY: 'followup_friendly_sk',
  FOLLOWUP_DUE_TODAY: 'followup_due_today_sk',
  PURCHASE_ORDER: 'purchase_order_sk',
  ATTENDANCE_MARKED: 'attendance_marked_sk',
  TASK_ASSIGNED: 'task_assigned_sk',
  OPENING_BALANCE_PAYABLE: 'opening_balance_payable_sk',
  OPENING_BALANCE_RECEIVABLE: 'opening_balance_receivable_sk',
};

export const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';

export const TEMPLATE_VARIABLE_COUNTS = {
  [WHATSAPP_TEMPLATES.FOLLOWUP_FRIENDLY]: 4,
  [WHATSAPP_TEMPLATES.FOLLOWUP_DUE_TODAY]: 4,
  [WHATSAPP_TEMPLATES.PURCHASE_ORDER]: 4,
  [WHATSAPP_TEMPLATES.ATTENDANCE_MARKED]: 4,
  [WHATSAPP_TEMPLATES.TASK_ASSIGNED]: 5,
  [WHATSAPP_TEMPLATES.AMOUNT_PAID]: 5,
  [WHATSAPP_TEMPLATES.AMOUNT_RECEIVED]: 5,
  [WHATSAPP_TEMPLATES.OPENING_BALANCE_PAYABLE]: 4,
  [WHATSAPP_TEMPLATES.OPENING_BALANCE_RECEIVABLE]: 4,
  [WHATSAPP_TEMPLATES.ORDER_COMPLETED]: 2,
  [WHATSAPP_TEMPLATES.ORDER_CONFIRMATION]: 5,
};

const cleanValue = (value, fallback = '-') => {
  if (value === null || value === undefined) return String(fallback);
  const text = String(value).trim();
  return text || String(fallback);
};

const formatDate = (value = new Date()) => {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('en-IN');
    return date.toLocaleDateString('en-IN');
  } catch {
    return new Date().toLocaleDateString('en-IN');
  }
};

const normalizeParameterList = (templateName, values = []) => {
  const expected = TEMPLATE_VARIABLE_COUNTS[templateName] ?? values.length;
  const normalized = Array.isArray(values) ? values.slice(0, expected).map((item) => cleanValue(item)) : [];
  while (normalized.length < expected) normalized.push('-');
  return normalized;
};

export const buildTemplateBodyParameters = (templateName, values = []) =>
  normalizeParameterList(templateName, values).map((text) => ({ type: 'text', text }));

export const buildAmountReceivedParameters = ({
  customerName = 'Customer',
  date = formatDate(),
  amount = '0',
  reference = '-',
  description = 'Amount received',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.AMOUNT_RECEIVED, [customerName, formatDate(date), amount, reference, description]);

export const buildAmountPaidParameters = ({
  customerName = 'Customer',
  date = formatDate(),
  amount = '0',
  reference = '-',
  description = 'Amount paid',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.AMOUNT_PAID, [customerName, formatDate(date), amount, reference, description]);

export const buildOrderConfirmationParameters = ({
  customerName = 'Customer',
  orderNumber = '-',
  date = formatDate(),
  amount = '0',
  details = 'Order details',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.ORDER_CONFIRMATION, [customerName, orderNumber, formatDate(date), amount, details]);

export const buildOrderCompletedParameters = ({
  customerName = 'Customer',
  orderNumber = '-',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.ORDER_COMPLETED, [customerName, orderNumber]);

export const buildFollowupFriendlyParameters = ({
  customerName = 'Customer',
  amount = '0',
  expectedDate = formatDate(),
  reference = '-',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.FOLLOWUP_FRIENDLY, [customerName, amount, formatDate(expectedDate), reference]);

export const buildFollowupDueTodayParameters = ({
  customerName = 'Customer',
  amount = '0',
  dueDate = formatDate(),
  reference = '-',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.FOLLOWUP_DUE_TODAY, [customerName, amount, formatDate(dueDate), reference]);

export const buildPurchaseOrderParameters = ({
  customerName = 'Customer',
  purchaseOrderNumber = '-',
  date = formatDate(),
  amount = '0',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.PURCHASE_ORDER, [customerName, purchaseOrderNumber, formatDate(date), amount]);

export const buildAttendanceMarkedParameters = ({
  employeeName = 'Employee',
  attendanceDate = formatDate(),
  status = 'Present',
  markedBy = 'Admin',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.ATTENDANCE_MARKED, [employeeName, formatDate(attendanceDate), status, markedBy]);

export const buildTaskAssignedParameters = ({
  employeeName = 'Team Member',
  taskTitle = 'New Task',
  assignedDate = formatDate(),
  dueDate = '-',
  assignedBy = 'Admin',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.TASK_ASSIGNED, [employeeName, taskTitle, formatDate(assignedDate), cleanValue(dueDate), assignedBy]);

export const buildOpeningBalancePayableParameters = ({
  customerName = 'Customer',
  asOnDate = formatDate(),
  amount = '0',
  description = 'Opening balance payable',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.OPENING_BALANCE_PAYABLE, [customerName, formatDate(asOnDate), amount, description]);

export const buildOpeningBalanceReceivableParameters = ({
  customerName = 'Customer',
  asOnDate = formatDate(),
  amount = '0',
  description = 'Opening balance receivable',
} = {}) => normalizeParameterList(WHATSAPP_TEMPLATES.OPENING_BALANCE_RECEIVABLE, [customerName, formatDate(asOnDate), amount, description]);
