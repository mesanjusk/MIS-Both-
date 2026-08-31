import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import PermMediaRoundedIcon from '@mui/icons-material/PermMediaRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import { ROUTES } from './routes';
// The audiences live in constants/roles so the route guards can name the same
// sets these menu entries name — a link hidden here and a URL typed into the
// address bar now reach the same decision.
import { ACCOUNT_ROLES, ADMIN_ROLES, OFFICE_ROLES } from './roles';

export const SIDEBAR_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: ROUTES.HOME, icon: <DashboardRoundedIcon fontSize="small" />, roles: ['all'], section: 'home' },
    ],
  },
  {
    label: 'Attendance Report',
    items: [
      { label: 'Attendance', path: ROUTES.ATTENDANCE, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'my-work' },
      { label: 'Attendance Report', path: ROUTES.ATTENDANCE_REPORT, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Order Tasks', path: ROUTES.PENDING_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'orders' },
      { label: 'My Day', path: ROUTES.MY_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ['all'], section: 'my-work' },
      { label: 'Users Report', path: ROUTES.REPORTS_USERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Team & Partners Report', path: ROUTES.REPORTS_TEAM, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Add User', path: ROUTES.ADD_USER, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Add User Group', path: ROUTES.ADD_USER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
    ],
  },
  {
    label: 'Orders Reports',
    items: [
      { label: 'All Orders', path: ROUTES.REPORTS_ORDERS_LIST, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'orders' },
      { label: 'Purchase Orders', path: ROUTES.PURCHASE_ORDERS, icon: <RequestQuoteRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Post-Print Jobs', path: ROUTES.POST_PRINTING_JOBS, icon: <StorefrontRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Vendors / Freelancers', path: ROUTES.VENDORS, icon: <StorefrontRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Operations Center', path: ROUTES.BUSINESS_CONTROL, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Deliveries', path: ROUTES.REPORTS_DELIVERY, icon: <LocalShippingRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'], section: 'orders' },
      { label: 'Invoices', path: ROUTES.INVOICES_LIST, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff', 'Accounts'], section: 'orders' },
      { label: 'Bills Report', path: ROUTES.REPORTS_BILLS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
    ],
  },
  {
    label: 'Accounts & UPI',
    items: [
      { label: 'Opening Balance', path: ROUTES.OPENING_BALANCE, icon: <AccountBalanceRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'OB Upload (CSV)', path: ROUTES.OPENING_BALANCE_UPLOAD, icon: <UploadFileRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Diary Upload', path: ROUTES.DIARY_UPLOAD, icon: <UploadFileRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Day Book', path: ROUTES.DAY_BOOK, icon: <MenuBookRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Bank Reconciliation', path: ROUTES.BANK_RECONCILIATION, icon: <AccountBalanceRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
    ],
  },
  {
    label: 'Account Reports',
    items: [
      { label: 'UPI Payment', path: ROUTES.UPI_PAYMENT, icon: <QrCodeScannerRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Record Expense', path: ROUTES.ADD_PAYABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Record Income', path: ROUTES.ADD_RECEIVABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Payment Reminders', path: ROUTES.FOLLOWUPS, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Trial Balance', path: ROUTES.TRIAL_BALANCE, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Account Book', path: ROUTES.REPORTS_TRANSACTIONS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Transactions 1', path: ROUTES.REPORTS_TRANSACTION_1, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Transactions 2', path: ROUTES.REPORTS_TRANSACTION_2, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Customer Ledger', path: ROUTES.REPORTS_TRANSACTION_3, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Daily Cash & Bank', path: ROUTES.REPORTS_TRANSACTION_4D, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Transaction Register', path: ROUTES.REPORTS_TRANSACTION_5, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Payments Report', path: ROUTES.PAYMENT_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
    ],
  },
  {
    label: 'Collection Reports',
    items: [
      { label: 'Aging Report', path: ROUTES.AGING_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
      { label: 'Outstanding Report', path: ROUTES.OUTSTANDING_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES, section: 'money' },
    ],
  },
  {
    label: 'Dashboard Reports',
    items: [
      // Profit and the item/order/vendor/employee splits. Lives here because
      // this group is what the top navbar's "Reports" dropdown opens — the
      // only nav always on screen, since the left sidebar is opt-in. Margins
      // and per-person figures, so Admin and Owner only; the page checks again
      // for itself and the API enforces it regardless.
      { label: 'Business Reports', path: ROUTES.REPORTS_BUSINESS, icon: <InsightsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Customers Report', path: ROUTES.REPORTS_CUSTOMERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'orders' },
      { label: 'Add Customer', path: ROUTES.ADD_CUSTOMER, icon: <PersonAddRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'orders' },
      { label: 'Add Customer Group', path: ROUTES.ADD_CUSTOMER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'orders' },
      { label: 'Items Report', path: ROUTES.REPORTS_ITEMS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Add Item', path: ROUTES.ADD_ITEM, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Add Item Group', path: ROUTES.ADD_ITEM_GROUP, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Rate Calculator', path: ROUTES.RATE_CALCULATOR, icon: <CalculateRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'production' },
      { label: 'Rate Card Master', path: ROUTES.RATE_CARD_MASTER, icon: <CalculateRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'production' },
      { label: 'Tasks Report', path: ROUTES.REPORTS_TASKS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Add Task Master', path: ROUTES.ADD_TASK, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Add Task Group', path: ROUTES.ADD_TASK_GROUP, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Priority Report', path: ROUTES.REPORTS_PRIORITY, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Add Priority', path: ROUTES.ADD_PRIORITY, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
    ],
  },
  {
    label: 'Email',
    items: [
      { label: 'Email History', path: ROUTES.EMAIL_HISTORY, icon: <EmailRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'], section: 'communicate', module: 'gmail' },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { label: 'WhatsApp Cloud', path: ROUTES.WHATSAPP, icon: <ChatRoundedIcon fontSize="small" />, roles: ['all'], section: 'communicate' },
      { label: 'WhatsApp Home', path: ROUTES.WHATSAPP_LEGACY_HOME, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'communicate' },
      { label: 'Send Message', path: ROUTES.WHATSAPP_SEND, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'communicate' },
      { label: 'Broadcast Page', path: ROUTES.WHATSAPP_BROADCAST, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'communicate' },
      { label: 'Flow Builder', path: ROUTES.FLOW_BUILDER, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, adminOnly: true, section: 'communicate', module: 'flowBuilder' },
    ],
  },
  {
    label: 'Social Media',
    items: [
      { label: 'Overview', path: ROUTES.SOCIAL_OVERVIEW, icon: <ShareRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Create Post', path: ROUTES.SOCIAL_CREATE_POST, icon: <AddPhotoAlternateRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Calendar', path: ROUTES.SOCIAL_CALENDAR, icon: <CalendarMonthRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Content Library', path: ROUTES.SOCIAL_CONTENT_LIBRARY, icon: <PermMediaRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Approval', path: ROUTES.SOCIAL_APPROVAL, icon: <FactCheckRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Publishing Queue', path: ROUTES.SOCIAL_PUBLISHING_QUEUE, icon: <PendingActionsRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
      { label: 'Social Accounts', path: ROUTES.SOCIAL_ACCOUNTS, icon: <LinkRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'communicate', module: 'social' },
      { label: 'Social Analytics', path: ROUTES.SOCIAL_ANALYTICS, icon: <InsightsRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate', module: 'social' },
    ],
  },
  {
    label: 'Call Logs',
    items: [
      { label: 'Call Logs', path: ROUTES.CALL_LOGS, icon: <PhoneRoundedIcon fontSize="small" />, roles: OFFICE_ROLES, section: 'communicate' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Team Operations', path: ROUTES.OPERATIONS, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'My Operations', path: ROUTES.OPERATIONS_MY, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ['all'], section: 'my-work' },
      { label: 'Responsibilities', path: ROUTES.OPERATIONS_RESPONSIBILITIES, icon: <FactCheckRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Operations Settings', path: ROUTES.OPERATIONS_SETTINGS, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Team Daily Report', path: ROUTES.OPERATIONS_DAILY_REPORT, icon: <InsightsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
    ],
  },
  {
    label: 'SOP',
    items: [
      { label: 'SOP Tasks', path: ROUTES.SOP, icon: <ChecklistRoundedIcon fontSize="small" />, roles: ['all'], section: 'my-work' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'API Performance', path: ROUTES.REPORTS_API_PERFORMANCE, icon: <InsightsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'User Permissions', path: ROUTES.ADMIN_USER_PERMISSIONS, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Group Permissions', path: ROUTES.ADMIN_GROUP_PERMISSIONS, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'WhatsApp Action Log', path: ROUTES.WHATSAPP_ACTION_LOG, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
      { label: 'Drive Folder Report', path: ROUTES.DRIVE_FOLDER_REPORT, icon: <FolderOpenRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, section: 'admin' },
    ],
  },
];

/**
 * The primary navigation: seven headings, over the same groups and routes.
 *
 * This is a regrouping of menu entries, not a change to what any of them does.
 * Every `section` above points at one of these; no route moved, no component
 * changed, and every old URL still resolves.
 *
 * Why sections rather than renamed groups: a group's `label` is a permission
 * key. `permissions.sidebarGroups` stores an allowlist of these labels per
 * user, and Admin → User Permissions writes them. Renaming a group would
 * silently invalidate every stored allowlist and change what people can see.
 * So the group labels stay exactly as they were — they now render as
 * sub-headings inside a heading — and `section` is additive metadata.
 *
 * `legacy` carries the dropdown names this heading replaces, so a user who had
 * hidden "Accounts" still has "Money" hidden rather than having their
 * preference silently reset.
 */
export const PRIMARY_NAV = [
  {
    label: 'Home',
    section: 'home',
    // A direct link, not a dropdown: there is one destination behind it.
    directPath: ROUTES.HOME,
    legacy: [],
  },
  {
    label: 'My Work',
    section: 'my-work',
    legacy: ['Attendance', 'SOP'],
  },
  {
    label: 'Orders',
    section: 'orders',
    legacy: ['Orders'],
  },
  {
    label: 'Production',
    section: 'production',
    legacy: [],
  },
  {
    label: 'Money',
    section: 'money',
    legacy: ['Accounts'],
  },
  {
    label: 'Communicate',
    section: 'communicate',
    legacy: ['WhatsApp', 'Social', 'Call Logs'],
  },
  {
    label: 'Admin',
    section: 'admin',
    legacy: ['Admin', 'Reports', 'Operations'],
  },
];

/** Every menu item carrying a given section, with its group label attached. */
export const itemsForSection = (section) =>
  SIDEBAR_GROUPS.flatMap((group) =>
    group.items
      .filter((item) => item.section === section)
      .map((item) => ({ ...item, groupLabel: group.label }))
  );
