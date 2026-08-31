import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import './apiClient.js';
import Layout from './Pages/Layout';
import ErrorBoundary from './Components/ErrorBoundary';
import { initVersionChecker } from './utils/versionChecker';
import { ToastContainer } from './Components';
import { ROUTE_ALIASES, ROUTES } from './constants/routes';
import {
  RequireAccounts,
  RequireAdmin,
  RequireAuth,
  RequireRoles,
} from './Components/routeGuards';
import { ACCOUNT_ROLES, NAV_ROLES, OFFICE_ROLES } from './constants/roles';

// Screens the menus give to Admin, Owner and general office staff — the
// outbound-communication and delivery views, which are wider than Admin but
// narrower than every signed-in account.
const EMAIL_ROLES = [...ACCOUNT_ROLES.filter((role) => role !== NAV_ROLES.ACCOUNTS), NAV_ROLES.OFFICE_STAFF];

const Login = lazy(() => import('./Pages/login'));
const Dashboard = lazy(() => import('./Pages/home'));
const AllAttandance = lazy(() => import('./Pages/AllAttandance'));
const AttendanceReport = lazy(() => import('./Pages/AttendanceReport'));
const PendingTasks = lazy(() => import('./Pages/PendingTasks'));
const UserTask = lazy(() => import('./Pages/userTask'));
const AddUsertask = lazy(() => import('./Pages/addUsertask'));
const AddCustomer = lazy(() => import('./Pages/addCustomer'));
const AddUser = lazy(() => import('./Pages/addUser'));
const AddUsergroup = lazy(() => import('./Pages/addUsergroup'));
const AddItem = lazy(() => import('./Pages/addItem'));
const AddItemgroup = lazy(() => import('./Pages/addItemgroup'));
const RateCalculator = lazy(() => import('./Pages/RateCalculator'));
const RateCardMaster = lazy(() => import('./Pages/RateCardMaster'));
const AddTask = lazy(() => import('./Pages/addTask'));
const AddTaskgroup = lazy(() => import('./Pages/addTaskgroup'));
const AddOrder1 = lazy(() => import('./Pages/addOrder1'));
const OrderKanban = lazy(() => import('./Pages/OrderKanban'));
const BusinessControl = lazy(() => import('./Pages/BusinessControl'));
const PostPrintingControl = lazy(() => import('./Pages/PostPrintingControl'));
const WorkflowTemplates = lazy(() => import('./Pages/WorkflowTemplates'));
const OrderUpdate = lazy(() => import('./Pages/OrderUpdate'));
const UpdateDelivery = lazy(() => import('./Pages/updateDelivery'));
const AddTransaction = lazy(() => import('./Pages/AddTransaction'));
const AddTransaction1 = lazy(() => import('./Pages/addTransaction1'));
const TrialBalance = lazy(() => import('./Pages/TrialBalance'));
const PaymentFollowup = lazy(() => import('./Pages/PaymentFollowup'));
const Vendor = lazy(() => import('./Pages/vendor'));
const VendorDetails = lazy(() => import('./Pages/vendorDetails'));
const CustomerDetails = lazy(() => import('./Pages/CustomerDetails'));
const WhatsAppCloudDashboard = lazy(() => import('./Pages/WhatsAppCloudDashboard'));
const AllOrder = lazy(() => import('./Reports/allOrder'));
const AllOrdersList = lazy(() => import('./Reports/allOrdersList'));
const AllDelivery = lazy(() => import('./Reports/allDelivery'));
const AllTransaction = lazy(() => import('./Reports/allTransaction'));
const AgingReport = lazy(() => import('./Reports/agingReport'));
const OutstandingReport = lazy(() => import('./Reports/outstandingReport'));
const PurchaseOrder = lazy(() => import('./Pages/purchaseOrder'));
const PostPrintingJob = lazy(() => import('./Pages/PostPrintingJob'));
const CustomerReport = lazy(() => import('./Reports/customerReport'));
const PaymentReport = lazy(() => import('./Reports/paymentReport'));
const ItemReport = lazy(() => import('./Reports/itemReport'));
const TaskReport = lazy(() => import('./Reports/taskReport'));
const UserReport = lazy(() => import('./Reports/userReport'));
const TeamReport = lazy(() => import('./Reports/teamReport'));
const BusinessReports = lazy(() => import('./Reports/business/BusinessReports'));
const ApiPerformance = lazy(() => import('./Reports/business/ApiPerformance'));
const AddPayable = lazy(() => import('./Pages/addPayable'));
const AddRecievable = lazy(() => import('./Pages/addRecievable'));
const AddPayment = lazy(() => import('./Pages/addPayment'));
const CallLogs = lazy(() => import('./Pages/callLogs'));
const FlowBuilderPage = lazy(() => import('./Pages/FlowBuilderPage'));
const UpiCollectPublic = lazy(() => import('./Pages/UpiCollectPublic'));
const PublicInvoice = lazy(() => import('./Pages/PublicInvoice'));
const InvoicesList = lazy(() => import('./Pages/InvoicesList'));
const SendMessage = lazy(() => import('./Pages/SendMessage'));
const UpiPayment = lazy(() => import('./Pages/UpiPayment'));
const WhatsAppBroadcastPage = lazy(() => import('./Pages/WhatsAppBroadcastPage'));
const WhatsAppHome = lazy(() => import('./Pages/WhatsAppHome'));
const WhatsAppSendPage = lazy(() => import('./Pages/WhatsAppSendPage'));
const AddCustomergroup = lazy(() => import('./Pages/addCustomergroup'));
const AddPriority = lazy(() => import('./Pages/addPriority'));
const AllBills = lazy(() => import('./Reports/allBills'));
const AllTransaction1 = lazy(() => import('./Reports/allTransaction1'));
const AllTransaction2 = lazy(() => import('./Reports/allTransaction2'));
const AllTransaction3 = lazy(() => import('./Reports/allTransaction3'));
const AllTransaction4D = lazy(() => import('./Reports/allTransaction4D'));
const AllTransaction5  = lazy(() => import('./Reports/allTransaction5'));
const PriorityReport = lazy(() => import('./Reports/priorityReport'));
const DiaryUpload = lazy(() => import('./Pages/DiaryUpload'));
const DayBook = lazy(() => import('./Pages/DayBook'));
const BankReconciliation = lazy(() => import('./Pages/BankReconciliation'));
const GmailAccounts = lazy(() => import('./Pages/GmailAccounts'));
const EmailCompose  = lazy(() => import('./Pages/EmailCompose'));
const EmailHistory  = lazy(() => import('./Pages/EmailHistory'));
const OpeningBalance = lazy(() => import('./Pages/OpeningBalance'));
const OpeningBalanceUpload = lazy(() => import('./Pages/OpeningBalanceUpload'));
const AdminUserPermissions = lazy(() => import('./Pages/AdminUserPermissions'));
const AdminGroupPermissions = lazy(() => import('./Pages/AdminGroupPermissions'));
const WhatsAppActionLogPage = lazy(() => import('./Pages/WhatsAppActionLog'));
const DriveFolderReport = lazy(() => import('./Pages/DriveFolderReport'));
const SopPage = lazy(() => import('./Pages/SopPage'));
const TeamOperations = lazy(() => import('./Pages/TeamOperations'));
const MyOperations = lazy(() => import('./Pages/MyOperations'));
const OperationsResponsibilities = lazy(() => import('./Pages/OperationsResponsibilities'));
const OperationsSettings = lazy(() => import('./Pages/OperationsSettings'));
const OperationsDailyReport = lazy(() => import('./Pages/OperationsDailyReport'));
const UserOperationsProfile = lazy(() => import('./Pages/UserOperationsProfile'));
const SocialOverview = lazy(() => import('./Pages/SocialOverview'));
const SocialCreatePost = lazy(() => import('./Pages/SocialCreatePost'));
const SocialCalendar = lazy(() => import('./Pages/SocialCalendar'));
const SocialContentLibrary = lazy(() => import('./Pages/SocialContentLibrary'));
const SocialApproval = lazy(() => import('./Pages/SocialApproval'));
const SocialPublishingQueue = lazy(() => import('./Pages/SocialPublishingQueue'));
const SocialAccounts = lazy(() => import('./Pages/SocialAccounts'));
const SocialAnalytics = lazy(() => import('./Pages/SocialAnalytics'));

function RouteLoader() {
  return (
    <Stack alignItems="center" justifyContent="center" minHeight="50vh" spacing={2}>
      <CircularProgress size={32} />
      <Typography variant="body2" color="text.secondary">Loading page...</Typography>
    </Stack>
  );
}

function withSuspense(element) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoader />}>{element}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * Route element for a screen only Admin and Owner may open.
 *
 * The guard sits outside Suspense so an unauthorized user never triggers the
 * page's lazy chunk download — the denial is decided before the code for the
 * thing being denied is fetched.
 */
function adminOnly(element) {
  return <RequireAdmin>{withSuspense(element)}</RequireAdmin>;
}

/** Route element for the Accounts audience (Admin, Owner, Accounts). */
function accountsOnly(element) {
  return <RequireAccounts>{withSuspense(element)}</RequireAccounts>;
}

/** Route element restricted to an explicit list of menu role keys. */
function rolesOnly(roles, element) {
  return <RequireRoles roles={roles}>{withSuspense(element)}</RequireRoles>;
}

export default function App() {
  useEffect(() => {
    if (import.meta.env.PROD) {
      const id = initVersionChecker();
      return () => clearInterval(id);
    }
  }, []);

  return (
    <Router>
      <ToastContainer />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
        <Routes>
          <Route path={ROUTES.ROOT} element={withSuspense(<Login />)} />
          <Route path={ROUTES.LOGIN} element={withSuspense(<Login />)} />
          {/* Public registration was removed: this is an internal MIS and staff
              accounts are created from Admin → Add User. The path stays mounted so
              existing bookmarks land on the login screen instead of a dead route. */}
          <Route path={ROUTES.REGISTER} element={<Navigate to={ROUTES.LOGIN} replace />} />
          <Route path={ROUTES.UPI_COLLECT_PUBLIC} element={withSuspense(<UpiCollectPublic />)} />
          <Route path={ROUTES.PUBLIC_INVOICE} element={withSuspense(<PublicInvoice />)} />

          <Route element={<RequireAuth><ErrorBoundary><Layout /></ErrorBoundary></RequireAuth>}>
            <Route path={ROUTES.HOME} element={withSuspense(<Dashboard />)} />
            <Route path={ROUTES.DASHBOARD} element={<Navigate to={ROUTES.HOME} replace />} />

            <Route path={ROUTES.ATTENDANCE} element={withSuspense(<AllAttandance />)} />
            <Route path={ROUTES.ATTENDANCE_REPORT} element={adminOnly(<AttendanceReport />)} />
            <Route path={ROUTES.ATTENDANCE_REPORT_OLD} element={adminOnly(<AttendanceReport />)} />
            <Route path={ROUTES.PENDING_TASKS} element={adminOnly(<PendingTasks />)} />
            <Route path={ROUTES.MY_TASKS} element={withSuspense(<UserTask />)} />
            <Route path={ROUTES.TASKS_NEW} element={withSuspense(<AddUsertask />)} />
            <Route path={ROUTES.ADD_CUSTOMER} element={rolesOnly(OFFICE_ROLES, <AddCustomer />)} />
            <Route path={ROUTES.ADD_CUSTOMER_GROUP} element={adminOnly(<AddCustomergroup />)} />
            <Route path={ROUTES.ADD_USER} element={adminOnly(<AddUser />)} />
            <Route path={ROUTES.ADD_USER_GROUP} element={adminOnly(<AddUsergroup />)} />
            <Route path={ROUTES.ADD_ITEM} element={adminOnly(<AddItem />)} />
            <Route path={ROUTES.ADD_ITEM_GROUP} element={adminOnly(<AddItemgroup />)} />
            <Route path={ROUTES.RATE_CALCULATOR} element={rolesOnly(OFFICE_ROLES, <RateCalculator />)} />
            <Route path={ROUTES.RATE_CARD_MASTER} element={adminOnly(<RateCardMaster />)} />
            <Route path={ROUTES.ADD_TASK} element={adminOnly(<AddTask />)} />
            <Route path={ROUTES.ADD_TASK_GROUP} element={adminOnly(<AddTaskgroup />)} />
            <Route path={ROUTES.ADD_PRIORITY} element={adminOnly(<AddPriority />)} />

            <Route path={ROUTES.ORDERS_NEW} element={withSuspense(<AddOrder1 />)} />
            <Route path={ROUTES.ADD_ORDER} element={<Navigate to={ROUTES.ORDERS_NEW} replace />} />
            <Route path={ROUTES.ADD_ORDER_V2} element={<Navigate to={ROUTES.ORDERS_NEW} replace />} />
            <Route path={ROUTES.ORDERS_BOARD} element={withSuspense(<OrderKanban />)} />
            <Route path={ROUTES.BUSINESS_CONTROL} element={adminOnly(<BusinessControl />)} />
            <Route path={ROUTES.POST_PRINTING_CONTROL} element={rolesOnly(OFFICE_ROLES, <PostPrintingControl />)} />
            <Route path={ROUTES.WORKFLOW_TEMPLATES} element={adminOnly(<WorkflowTemplates />)} />
            <Route path={ROUTES.PURCHASE_ORDERS} element={adminOnly(<PurchaseOrder />)} />
            <Route path={ROUTES.POST_PRINTING_JOBS} element={adminOnly(<PostPrintingJob />)} />
            <Route path="/orderUpdate/:id" element={withSuspense(<OrderUpdate />)} />
            <Route path="/updateDelivery/:id" element={withSuspense(<UpdateDelivery />)} />
            <Route path="/customers/:id" element={withSuspense(<CustomerDetails />)} />

            <Route path={ROUTES.RECEIPT} element={accountsOnly(<AddTransaction />)} />
            <Route path="/addTransaction" element={<Navigate to={ROUTES.RECEIPT} replace />} />
            <Route path={ROUTES.PAYMENT} element={accountsOnly(<AddTransaction1 />)} />
            <Route path="/addTransaction1" element={<Navigate to={ROUTES.PAYMENT} replace />} />
            <Route path={ROUTES.TRIAL_BALANCE} element={accountsOnly(<TrialBalance />)} />
            <Route path={ROUTES.FOLLOWUPS} element={accountsOnly(<PaymentFollowup />)} />
            <Route path={ROUTES.OPENING_BALANCE} element={accountsOnly(<OpeningBalance />)} />
            <Route path={ROUTES.OPENING_BALANCE_UPLOAD} element={accountsOnly(<OpeningBalanceUpload />)} />
            <Route path={ROUTES.DIARY_UPLOAD} element={accountsOnly(<DiaryUpload />)} />
            <Route path={`${ROUTES.DAY_BOOK}/:uuid`} element={accountsOnly(<DayBook />)} />
            <Route path={ROUTES.DAY_BOOK} element={accountsOnly(<DayBook />)} />
            <Route path={`${ROUTES.BANK_RECONCILIATION}/:uuid`} element={accountsOnly(<BankReconciliation />)} />
            <Route path={ROUTES.BANK_RECONCILIATION} element={accountsOnly(<BankReconciliation />)} />
            <Route path={ROUTE_ALIASES.FOLLOWUPS_OLD} element={<Navigate to={ROUTES.FOLLOWUPS} replace />} />
            <Route path={ROUTES.ADD_PAYABLE} element={accountsOnly(<AddPayable />)} />
            <Route path={ROUTES.ADD_RECEIVABLE} element={accountsOnly(<AddRecievable />)} />
            <Route path={ROUTES.ADD_PAYMENT} element={accountsOnly(<AddPayment />)} />
            <Route path={ROUTES.UPI_PAYMENT} element={accountsOnly(<UpiPayment />)} />

            <Route path={ROUTES.VENDORS} element={adminOnly(<Vendor />)} />
            <Route path="/vendors/:id" element={adminOnly(<VendorDetails />)} />
            <Route path={ROUTE_ALIASES.HOME_VENDOR} element={<Navigate to={ROUTES.VENDORS} replace />} />

            <Route path={ROUTES.WHATSAPP} element={withSuspense(<WhatsAppCloudDashboard />)} />
            <Route path={ROUTES.WHATSAPP_CLOUD} element={withSuspense(<WhatsAppCloudDashboard />)} />
            <Route path={ROUTES.WHATSAPP_SEND} element={adminOnly(<WhatsAppSendPage />)} />
            <Route path={ROUTES.WHATSAPP_BROADCAST} element={adminOnly(<WhatsAppBroadcastPage />)} />
            <Route path={ROUTES.WHATSAPP_LEGACY_HOME} element={adminOnly(<WhatsAppHome />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_HOME} element={adminOnly(<WhatsAppHome />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_BROADCAST_PAGE} element={<Navigate to={ROUTES.WHATSAPP_BROADCAST} replace />} />
            <Route path={ROUTE_ALIASES.WHATSAPP_SEND_PAGE} element={<Navigate to={ROUTES.WHATSAPP_SEND} replace />} />
            <Route path="/SendMessage" element={adminOnly(<SendMessage />)} />

            <Route path="/reports/orders" element={rolesOnly(OFFICE_ROLES, <AllOrder />)} />
            <Route path="/allOrder" element={rolesOnly(OFFICE_ROLES, <AllOrder />)} />
            <Route path={ROUTES.REPORTS_ORDERS_LIST} element={adminOnly(<AllOrdersList />)} />
            <Route path="/reports/delivery" element={rolesOnly(EMAIL_ROLES, <AllDelivery />)} />
            <Route path="/allDelivery" element={rolesOnly(EMAIL_ROLES, <AllDelivery />)} />
            <Route path={ROUTES.ALL_TRANSACTION} element={accountsOnly(<AllTransaction />)} />
            <Route path={ROUTES.REPORTS_TRANSACTIONS} element={accountsOnly(<AllTransaction />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_1} element={accountsOnly(<AllTransaction1 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_2} element={accountsOnly(<AllTransaction2 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_3} element={accountsOnly(<AllTransaction3 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_4D} element={accountsOnly(<AllTransaction4D />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_5}  element={accountsOnly(<AllTransaction5 />)} />
            <Route path={ROUTE_ALIASES.ALL_TRANSACTION_1_TYPO} element={<Navigate to={ROUTES.REPORTS_TRANSACTION_1} replace />} />
            <Route path={ROUTE_ALIASES.ALL_TRANSACTION_2_LOWER} element={<Navigate to={ROUTES.REPORTS_TRANSACTION_2} replace />} />
            <Route path={ROUTES.AGING_REPORT} element={accountsOnly(<AgingReport />)} />
            <Route path={ROUTES.OUTSTANDING_REPORT} element={accountsOnly(<OutstandingReport />)} />
            <Route path="/allTransaction" element={accountsOnly(<AllTransaction />)} />
            <Route path="/reports/customers" element={adminOnly(<CustomerReport />)} />
            <Route path="/customerReport" element={adminOnly(<CustomerReport />)} />
            <Route path={ROUTES.PAYMENT_REPORT} element={accountsOnly(<PaymentReport />)} />
            <Route path="/reports/items" element={adminOnly(<ItemReport />)} />
            <Route path="/itemReport" element={adminOnly(<ItemReport />)} />
            <Route path="/reports/tasks" element={adminOnly(<TaskReport />)} />
            <Route path="/taskReport" element={adminOnly(<TaskReport />)} />
            <Route path="/reports/users" element={adminOnly(<UserReport />)} />
            <Route path="/userReport" element={adminOnly(<UserReport />)} />
            <Route path={ROUTES.REPORTS_TEAM} element={adminOnly(<TeamReport />)} />
            <Route path={ROUTES.REPORTS_BUSINESS} element={adminOnly(<BusinessReports />)} />
            <Route path={ROUTES.REPORTS_API_PERFORMANCE} element={adminOnly(<ApiPerformance />)} />
            <Route path={ROUTES.REPORTS_BILLS} element={accountsOnly(<AllBills />)} />
            <Route path={ROUTES.INVOICES_LIST} element={rolesOnly([...ACCOUNT_ROLES, NAV_ROLES.OFFICE_STAFF], <InvoicesList />)} />
            <Route path={ROUTES.REPORTS_PRIORITY} element={adminOnly(<PriorityReport />)} />

            <Route path={ROUTES.GMAIL_ACCOUNTS} element={adminOnly(<GmailAccounts />)} />
            <Route path={ROUTES.EMAIL_COMPOSE}  element={rolesOnly(EMAIL_ROLES, <EmailCompose />)} />
            <Route path={ROUTES.EMAIL_HISTORY}  element={rolesOnly(EMAIL_ROLES, <EmailHistory />)} />

            <Route path={ROUTES.CALL_LOGS} element={rolesOnly(OFFICE_ROLES, <CallLogs />)} />
            <Route path={ROUTES.FLOW_BUILDER} element={adminOnly(<FlowBuilderPage />)} />
            <Route path={ROUTES.ADMIN_USER_PERMISSIONS} element={adminOnly(<AdminUserPermissions />)} />
            <Route path={ROUTES.ADMIN_GROUP_PERMISSIONS} element={adminOnly(<AdminGroupPermissions />)} />
            <Route path={ROUTES.WHATSAPP_ACTION_LOG} element={adminOnly(<WhatsAppActionLogPage />)} />
            <Route path={ROUTES.DRIVE_FOLDER_REPORT} element={adminOnly(<DriveFolderReport />)} />
            <Route path={ROUTES.SOP} element={withSuspense(<SopPage />)} />

            <Route path={ROUTES.OPERATIONS} element={adminOnly(<TeamOperations />)} />
            <Route path={ROUTES.OPERATIONS_MY} element={withSuspense(<MyOperations />)} />
            <Route path={ROUTES.OPERATIONS_RESPONSIBILITIES} element={adminOnly(<OperationsResponsibilities />)} />
            <Route path={ROUTES.OPERATIONS_SETTINGS} element={adminOnly(<OperationsSettings />)} />
            <Route path={ROUTES.OPERATIONS_DAILY_REPORT} element={adminOnly(<OperationsDailyReport />)} />
            <Route path={`${ROUTES.OPERATIONS_USERS}/:userUuid`} element={adminOnly(<UserOperationsProfile />)} />

            <Route path={ROUTES.SOCIAL_OVERVIEW} element={rolesOnly(OFFICE_ROLES, <SocialOverview />)} />
            <Route path={ROUTES.SOCIAL_CREATE_POST} element={rolesOnly(OFFICE_ROLES, <SocialCreatePost />)} />
            <Route path={`${ROUTES.SOCIAL_CREATE_POST}/:id`} element={rolesOnly(OFFICE_ROLES, <SocialCreatePost />)} />
            <Route path={ROUTES.SOCIAL_CALENDAR} element={rolesOnly(OFFICE_ROLES, <SocialCalendar />)} />
            <Route path={ROUTES.SOCIAL_CONTENT_LIBRARY} element={rolesOnly(OFFICE_ROLES, <SocialContentLibrary />)} />
            <Route path={ROUTES.SOCIAL_APPROVAL} element={rolesOnly(OFFICE_ROLES, <SocialApproval />)} />
            <Route path={ROUTES.SOCIAL_PUBLISHING_QUEUE} element={rolesOnly(OFFICE_ROLES, <SocialPublishingQueue />)} />
            <Route path={ROUTES.SOCIAL_ACCOUNTS} element={adminOnly(<SocialAccounts />)} />
            <Route path={ROUTES.SOCIAL_ANALYTICS} element={rolesOnly(OFFICE_ROLES, <SocialAnalytics />)} />

            <Route path={ROUTE_ALIASES.HOME_ADMIN} element={<Navigate to={ROUTES.HOME} replace />} />
            <Route path={ROUTE_ALIASES.HOME_OLD} element={<Navigate to={ROUTES.HOME} replace />} />
          </Route>

          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Box>
    </Router>
  );
}