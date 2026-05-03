import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
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
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import { ROUTES } from './routes';

const ADMIN_ROLES = ['Admin', 'Owner'];
const OFFICE_ROLES = ['Admin', 'Owner', 'Designer', 'DataEntry', 'OfficeStaff'];
const ACCOUNT_ROLES = ['Admin', 'Owner', 'Accounts'];

export const SIDEBAR_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: ROUTES.HOME, icon: <DashboardRoundedIcon fontSize="small" />, roles: ['all'] },
      { label: 'Owner Dashboard', path: ROUTES.OWNER_DASHBOARD, icon: <DashboardRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Attendance', path: ROUTES.ATTENDANCE, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Attendance Report', path: ROUTES.ATTENDANCE_REPORT, icon: <EventAvailableRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Order Tasks', path: ROUTES.PENDING_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'My Day', path: ROUTES.MY_TASKS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ['all'] },
      { label: 'Planner', path: ROUTES.TASKS_PLANNER, icon: <AutoStoriesRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Team Progress', path: ROUTES.TASKS_TEAM, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Task Reviews', path: ROUTES.TASKS_REVIEW, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Operations Center',
    items: [
      { label: 'New Order', path: ROUTES.ORDERS_NEW, icon: <AddShoppingCartRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'DataEntry'] },
      { label: 'Order Board', path: ROUTES.ORDERS_BOARD, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'Designer'] },
      { label: 'Purchase Orders', path: ROUTES.PURCHASE_ORDERS, icon: <RequestQuoteRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Dispatch Queue', path: ROUTES.DISPATCH_QUEUE, icon: <LocalShippingRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'] },
      { label: 'Operations Center', path: ROUTES.BUSINESS_CONTROL, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Order Migration', path: ROUTES.MIGRATE_ORDERS, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'New Enquiry', path: ROUTES.ENQUIRIES_NEW, icon: <AddShoppingCartRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'DataEntry'] },
      { label: 'Deliveries', path: ROUTES.REPORTS_DELIVERY, icon: <LocalShippingRoundedIcon fontSize="small" />, roles: ['Admin', 'Owner', 'OfficeStaff'] },
      { label: 'Search Mobile', path: ROUTES.SEARCH_MOBILE, icon: <SearchRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Call Logs', path: ROUTES.CALL_LOGS, icon: <AssignmentRoundedIcon fontSize="small" />, roles: OFFICE_ROLES },
      { label: 'Add Note', path: ROUTES.ADD_NOTE, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Accounts & UPI',
    items: [
      { label: 'Receipt Entry', path: ROUTES.RECEIPT, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Payment Entry', path: ROUTES.PAYMENT, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Quick Payment', path: ROUTES.ADD_PAYMENT, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'UPI Payment', path: ROUTES.UPI_PAYMENT, icon: <QrCodeScannerRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Record Expense', path: ROUTES.ADD_PAYABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Record Income', path: ROUTES.ADD_RECEIVABLE, icon: <PaymentsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Payment Reminders', path: ROUTES.FOLLOWUPS, icon: <ReceiptLongRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Cash Ledger', path: ROUTES.CASH_LEDGER, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Bank Book', path: ROUTES.BANK_BOOK, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Trial Balance', path: ROUTES.TRIAL_BALANCE, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
    ],
  },
  {
    label: 'Masters',
    items: [
      { label: 'Add Customer', path: ROUTES.ADD_CUSTOMER, icon: <PersonAddRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Customer Group', path: ROUTES.ADD_CUSTOMER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add User', path: ROUTES.ADD_USER, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add User Group', path: ROUTES.ADD_USER_GROUP, icon: <GroupRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Item', path: ROUTES.ADD_ITEM, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Item Group', path: ROUTES.ADD_ITEM_GROUP, icon: <Inventory2RoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Task Master', path: ROUTES.ADD_TASK, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Task Group', path: ROUTES.ADD_TASK_GROUP, icon: <AssignmentRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Add Priority', path: ROUTES.ADD_PRIORITY, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Vendors', path: ROUTES.ALL_VENDORS, icon: <StorefrontRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { label: 'WhatsApp Cloud', path: ROUTES.WHATSAPP, icon: <ChatRoundedIcon fontSize="small" />, roles: ['all'] },
      { label: 'WhatsApp Home', path: ROUTES.WHATSAPP_LEGACY_HOME, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Send Message', path: ROUTES.WHATSAPP_SEND, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Bulk Message', path: ROUTES.WHATSAPP_BULK, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Broadcast Page', path: ROUTES.WHATSAPP_BROADCAST, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Admin Panel', path: ROUTES.WHATSAPP_ADMIN_PANEL, icon: <TuneRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Session', path: ROUTES.WHATSAPP_SESSION_PAGE, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Login', path: ROUTES.WHATSAPP_LOGIN_PAGE, icon: <ChatRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Flow Builder', path: ROUTES.FLOW_BUILDER, icon: <HubRoundedIcon fontSize="small" />, roles: ADMIN_ROLES, adminOnly: true },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Orders Report', path: ROUTES.REPORTS_ORDERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Delivery Report', path: ROUTES.REPORTS_DELIVERY, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Account Book', path: ROUTES.ALL_TRANSACTION, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 1', path: ROUTES.REPORTS_TRANSACTION_1, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 2', path: ROUTES.REPORTS_TRANSACTION_2, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 3', path: ROUTES.REPORTS_TRANSACTION_3, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Transactions 4D', path: ROUTES.REPORTS_TRANSACTION_4D, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Account Transaction', path: ROUTES.ACCOUNT_TRANSACTION, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Bills Report', path: ROUTES.REPORTS_BILLS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Cash Ledger', path: ROUTES.CASH_LEDGER, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Bank Book', path: ROUTES.BANK_BOOK, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Trial Balance', path: ROUTES.TRIAL_BALANCE, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Aging Report', path: ROUTES.AGING_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Customers Report', path: ROUTES.REPORTS_CUSTOMERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Payments Report', path: ROUTES.PAYMENT_REPORT, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ACCOUNT_ROLES },
      { label: 'Items Report', path: ROUTES.REPORTS_ITEMS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Tasks Report', path: ROUTES.REPORTS_TASKS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Priority Report', path: ROUTES.REPORTS_PRIORITY, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Users Report', path: ROUTES.REPORTS_USERS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'Vendor Bills', path: ROUTES.VENDOR_BILLS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
      { label: 'All Vendors', path: ROUTES.ALL_VENDORS, icon: <AnalyticsRoundedIcon fontSize="small" />, roles: ADMIN_ROLES },
    ],
  },
];
