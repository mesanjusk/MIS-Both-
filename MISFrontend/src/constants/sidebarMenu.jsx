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

const ADMIN_ROLES = ['Admin', 'Owner'];
const OFFICE_ROLES = ['Admin', 'Owner', 'Designer', 'DataEntry', 'OfficeStaff', 'OfficeAdmin', 'OfficeDesign', 'OfficeMarketing'];
const ACCOUNT_ROLES = ['Admin', 'Owner', 'Accounts'];

export const SIDEBAR_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: ROUTES.HOME, icon: <DashboardRoundedIcon fontSize="small" />, roles: ['all'] },
    ],
  },
  {
    label: 'Attendance Report',
    items: [
      { label: 'Attendance', path: ROUTES.ATTENDANCE, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Attendance Report', path: ROUTES.ATTENDANCE_REPORT, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Order Tasks', path: ROUTES.PENDING_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'My Day', path: ROUTES.MY_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ['all'] },
      { label: 'Users Report', path: ROUTES.REPORTS_USERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Team & Partners Report', path: ROUTES.REPORTS_TEAM, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add User', path: ROUTES.ADD_USER, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add User Group', path: ROUTES.ADD_USER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Orders Reports',
    items: [
      { label: 'All Orders', path: ROUTES.REPORTS_ORDERS_LIST, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Purchase Orders', path: ROUTES.PURCHASE_ORDERS, icon: <RequestQuoteRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Post-Print Jobs', path: ROUTES.POST_PRINTING_JOBS, icon: <StorefrontRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Vendors / Freelancers', path: ROUTES.VENDORS, icon: <StorefrontRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Operations Center', path: ROUTES.BUSINESS_CONTROL, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Deliveries', path: ROUTES.REPORTS_DELIVERY, icon: <LocalShippingRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'] },
      { label: 'Invoices', path: ROUTES.INVOICES_LIST, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff', 'Accounts'] },
      { label: 'Bills Report', path: ROUTES.REPORTS_BILLS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
    ],
  },
  {
    label: 'Accounts & UPI',
    items: [
      { label: 'Opening Balance', path: ROUTES.OPENING_BALANCE, icon: <AccountBalanceRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'OB Upload (CSV)', path: ROUTES.OPENING_BALANCE_UPLOAD, icon: <UploadFileRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Diary Upload', path: ROUTES.DIARY_UPLOAD, icon: <UploadFileRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Day Book', path: ROUTES.DAY_BOOK, icon: <MenuBookRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Bank Reconciliation', path: ROUTES.BANK_RECONCILIATION, icon: <AccountBalanceRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
    ],
  },
  {
    label: 'Account Reports',
    items: [
      { label: 'UPI Payment', path: ROUTES.UPI_PAYMENT, icon: <QrCodeScannerRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Record Expense', path: ROUTES.ADD_PAYABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Record Income', path: ROUTES.ADD_RECEIVABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Payment Reminders', path: ROUTES.FOLLOWUPS, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Trial Balance', path: ROUTES.TRIAL_BALANCE, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Account Book', path: ROUTES.ALL_TRANSACTION, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 1', path: ROUTES.REPORTS_TRANSACTION_1, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 2', path: ROUTES.REPORTS_TRANSACTION_2, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 3', path: ROUTES.REPORTS_TRANSACTION_3, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 4D', path: ROUTES.REPORTS_TRANSACTION_4D, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'All Transactions', path: ROUTES.REPORTS_TRANSACTION_5, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Account Transaction', path: ROUTES.REPORTS_TRANSACTIONS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Payments Report', path: ROUTES.PAYMENT_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
    ],
  },
  {
    label: 'Collection Reports',
    items: [
      { label: 'Aging Report', path: ROUTES.AGING_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Outstanding Report', path: ROUTES.OUTSTANDING_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
    ],
  },
  {
    label: 'Dashboard Reports',
    items: [
      { label: 'Customers Report', path: ROUTES.REPORTS_CUSTOMERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Customer', path: ROUTES.ADD_CUSTOMER, icon: <PersonAddRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Customer Group', path: ROUTES.ADD_CUSTOMER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Items Report', path: ROUTES.REPORTS_ITEMS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Item', path: ROUTES.ADD_ITEM, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Item Group', path: ROUTES.ADD_ITEM_GROUP, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Rate Calculator', path: ROUTES.RATE_CALCULATOR, icon: <CalculateRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Rate Card Master', path: ROUTES.RATE_CARD_MASTER, icon: <CalculateRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Tasks Report', path: ROUTES.REPORTS_TASKS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Task Master', path: ROUTES.ADD_TASK, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Task Group', path: ROUTES.ADD_TASK_GROUP, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Priority Report', path: ROUTES.REPORTS_PRIORITY, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Priority', path: ROUTES.ADD_PRIORITY, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Email',
    items: [
      { label: 'Email History', path: ROUTES.EMAIL_HISTORY, icon: <EmailRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'] },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { label: 'WhatsApp Cloud', path: ROUTES.WHATSAPP, icon: <ChatRoundedIcon fontSize="small" />, roles: ['all'] },
      { label: 'WhatsApp Home', path: ROUTES.WHATSAPP_LEGACY_HOME, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Send Message', path: ROUTES.WHATSAPP_SEND, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Broadcast Page', path: ROUTES.WHATSAPP_BROADCAST, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Flow Builder', path: ROUTES.FLOW_BUILDER, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, adminOnly: true },
    ],
  },
  {
    label: 'Social Media',
    items: [
      { label: 'Overview', path: ROUTES.SOCIAL_OVERVIEW, icon: <ShareRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Create Post', path: ROUTES.SOCIAL_CREATE_POST, icon: <AddPhotoAlternateRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Calendar', path: ROUTES.SOCIAL_CALENDAR, icon: <CalendarMonthRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Content Library', path: ROUTES.SOCIAL_CONTENT_LIBRARY, icon: <PermMediaRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Approval', path: ROUTES.SOCIAL_APPROVAL, icon: <FactCheckRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Publishing Queue', path: ROUTES.SOCIAL_PUBLISHING_QUEUE, icon: <PendingActionsRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Social Accounts', path: ROUTES.SOCIAL_ACCOUNTS, icon: <LinkRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Social Analytics', path: ROUTES.SOCIAL_ANALYTICS, icon: <InsightsRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
    ],
  },
  {
    label: 'Call Logs',
    items: [
      { label: 'Call Logs', path: ROUTES.CALL_LOGS, icon: <PhoneRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
    ],
  },
  {
    label: 'SOP',
    items: [
      { label: 'SOP Tasks', path: ROUTES.SOP, icon: <ChecklistRoundedIcon fontSize="small" />, roles: ['all'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'User Permissions', path: ROUTES.ADMIN_USER_PERMISSIONS, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Group Permissions', path: ROUTES.ADMIN_GROUP_PERMISSIONS, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'WhatsApp Action Log', path: ROUTES.WHATSAPP_ACTION_LOG, icon: <AdminPanelSettingsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Drive Folder Report', path: ROUTES.DRIVE_FOLDER_REPORT, icon: <FolderOpenRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
];
