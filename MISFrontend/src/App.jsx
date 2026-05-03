import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import './apiClient.js';
import Layout from './Pages/Layout';
import { initVersionChecker } from './utils/versionChecker';
import { ToastContainer } from './Components';
import { ROUTE_ALIASES, ROUTES } from './constants/routes';

const Login = lazy(() => import('./Pages/login'));
const Register = lazy(() => import('./Pages/Register'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const AllAttandance = lazy(() => import('./Pages/AllAttandance'));
const AttendanceReport = lazy(() => import('./Pages/AttendanceReport'));
const PendingTasks = lazy(() => import('./Pages/PendingTasks'));
const UserTask = lazy(() => import('./Pages/userTask'));
const AddUsertask = lazy(() => import('./Pages/addUsertask'));
const AddEnquiry = lazy(() => import('./Pages/addEnquiry'));
const AddCustomer = lazy(() => import('./Pages/addCustomer'));
const AddUser = lazy(() => import('./Pages/addUser'));
const AddUsergroup = lazy(() => import('./Pages/addUsergroup'));
const AddItem = lazy(() => import('./Pages/addItem'));
const AddItemgroup = lazy(() => import('./Pages/addItemgroup'));
const AddTask = lazy(() => import('./Pages/addTask'));
const AddTaskgroup = lazy(() => import('./Pages/addTaskgroup'));
const AddOrder1 = lazy(() => import('./Pages/addOrder1'));
const OrderKanban = lazy(() => import('./Pages/OrderKanban'));
const BusinessControl = lazy(() => import('./Pages/BusinessControl'));
const OrderUpdate = lazy(() => import('./Pages/OrderUpdate'));
const UpdateDelivery = lazy(() => import('./Pages/updateDelivery'));
const AddTransaction = lazy(() => import('./Pages/AddTransaction'));
const AddTransaction1 = lazy(() => import('./Pages/addTransaction1'));
const CashLedger = lazy(() => import('./Pages/CashLedger'));
const BankBook = lazy(() => import('./Pages/BankBook'));
const TrialBalance = lazy(() => import('./Pages/TrialBalance'));
const DispatchQueue = lazy(() => import('./Pages/DispatchQueue'));
const OwnerDashboard = lazy(() => import('./Pages/OwnerDashboard'));
const PaymentFollowup = lazy(() => import('./Pages/PaymentFollowup'));
const Vendor = lazy(() => import('./Pages/vendor'));
const VendorDetails = lazy(() => import('./Pages/vendorDetails'));
const CustomerDetails = lazy(() => import('./Pages/CustomerDetails'));
const WhatsAppCloudDashboard = lazy(() => import('./Pages/WhatsAppCloudDashboard'));
const AllOrder = lazy(() => import('./Reports/allOrder'));
const AllDelivery = lazy(() => import('./Reports/allDelivery'));
const AllTransaction = lazy(() => import('./Reports/allTransaction'));
const AgingReport = lazy(() => import('./Reports/agingReport'));
const PurchaseOrder = lazy(() => import('./Pages/purchaseOrder'));
const CustomerReport = lazy(() => import('./Reports/customerReport'));
const PaymentReport = lazy(() => import('./Reports/paymentReport'));
const ItemReport = lazy(() => import('./Reports/itemReport'));
const TaskReport = lazy(() => import('./Reports/taskReport'));
const UserReport = lazy(() => import('./Reports/userReport'));
const VendorBills = lazy(() => import('./Reports/vendorBills'));
const AllVendors = lazy(() => import('./Reports/AllVendors'));
const AddPayable = lazy(() => import('./Pages/addPayable'));
const AddRecievable = lazy(() => import('./Pages/addRecievable'));
const AddNote = lazy(() => import('./Pages/addNote'));
const AddPayment = lazy(() => import('./Pages/addPayment'));
const CallLogs = lazy(() => import('./Pages/callLogs'));
const FlowBuilderPage = lazy(() => import('./Pages/FlowBuilderPage'));
const UpiCollectPublic = lazy(() => import('./Pages/UpiCollectPublic'));
const MigrateOrders = lazy(() => import('./Pages/MigrateOrders'));
const Planner = lazy(() => import('./Pages/Planner'));
const Review = lazy(() => import('./Pages/Review'));
const Team = lazy(() => import('./Pages/Team'));
const SendMessage = lazy(() => import('./Pages/SendMessage'));
const SendMessageAll = lazy(() => import('./Pages/SendMessageAll'));
const UpiPayment = lazy(() => import('./Pages/UpiPayment'));
const WhatsAppAdminPanel = lazy(() => import('./Pages/WhatsAppAdminPanel'));
const WhatsAppBroadcastPage = lazy(() => import('./Pages/WhatsAppBroadcastPage'));
const WhatsAppHome = lazy(() => import('./Pages/WhatsAppHome'));
const WhatsAppLogin = lazy(() => import('./Pages/WhatsAppLogin'));
const WhatsAppSendPage = lazy(() => import('./Pages/WhatsAppSendPage'));
const WhatsAppSession = lazy(() => import('./Pages/WhatsAppSession'));
const AddCustomergroup = lazy(() => import('./Pages/addCustomergroup'));
const AddPriority = lazy(() => import('./Pages/addPriority'));
const SearchMobile = lazy(() => import('./Pages/searchMobile'));
const AllBills = lazy(() => import('./Reports/allBills'));
const AccountTransaction = lazy(() => import('./Reports/accountTransaction'));
const AllTransaction1 = lazy(() => import('./Reports/allTransaction1'));
const AllTransaction2 = lazy(() => import('./Reports/allTransaction2'));
const AllTransaction3 = lazy(() => import('./Reports/allTransaction3'));
const AllTransaction4D = lazy(() => import('./Reports/allTransaction4D'));
const PriorityReport = lazy(() => import('./Reports/priorityReport'));

function RouteLoader() {
  return (
    <Stack alignItems="center" justifyContent="center" minHeight="50vh" spacing={2}>
      <CircularProgress size={32} />
      <Typography variant="body2" color="text.secondary">Loading page...</Typography>
    </Stack>
  );
}

function withSuspense(element) {
  return <Suspense fallback={<RouteLoader />}>{element}</Suspense>;
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
          <Route path={ROUTES.REGISTER} element={withSuspense(<Register />)} />
          <Route path={ROUTES.UPI_COLLECT_PUBLIC} element={withSuspense(<UpiCollectPublic />)} />

          <Route element={<Layout />}>
            <Route path={ROUTES.HOME} element={withSuspense(<Dashboard />)} />
            <Route path={ROUTES.OWNER_DASHBOARD} element={withSuspense(<OwnerDashboard />)} />
            <Route path={ROUTES.DASHBOARD} element={<Navigate to={ROUTES.HOME} replace />} />

            <Route path={ROUTES.ATTENDANCE} element={withSuspense(<AllAttandance />)} />
            <Route path={ROUTES.ATTENDANCE_REPORT} element={withSuspense(<AttendanceReport />)} />
            <Route path={ROUTES.ATTENDANCE_REPORT_OLD} element={withSuspense(<AttendanceReport />)} />
            <Route path={ROUTES.PENDING_TASKS} element={withSuspense(<PendingTasks />)} />
            <Route path={ROUTES.MY_TASKS} element={withSuspense(<UserTask />)} />
            <Route path={ROUTES.TASKS_NEW} element={withSuspense(<AddUsertask />)} />
            <Route path={ROUTES.TASKS_PLANNER} element={withSuspense(<Planner />)} />
            <Route path={ROUTES.TASKS_TEAM} element={withSuspense(<Team />)} />
            <Route path={ROUTES.TASKS_REVIEW} element={withSuspense(<Review />)} />
            <Route path={ROUTE_ALIASES.PLANNER_OLD} element={<Navigate to={ROUTES.TASKS_PLANNER} replace />} />
            <Route path={ROUTE_ALIASES.TEAM_OLD} element={<Navigate to={ROUTES.TASKS_TEAM} replace />} />
            <Route path={ROUTE_ALIASES.REVIEW_OLD} element={<Navigate to={ROUTES.TASKS_REVIEW} replace />} />

            <Route path={ROUTES.ENQUIRIES_NEW} element={withSuspense(<AddEnquiry />)} />
            <Route path={ROUTES.ADD_CUSTOMER} element={withSuspense(<AddCustomer />)} />
            <Route path={ROUTES.ADD_CUSTOMER_GROUP} element={withSuspense(<AddCustomergroup />)} />
            <Route path={ROUTES.ADD_USER} element={withSuspense(<AddUser />)} />
            <Route path={ROUTES.ADD_USER_GROUP} element={withSuspense(<AddUsergroup />)} />
            <Route path={ROUTES.ADD_ITEM} element={withSuspense(<AddItem />)} />
            <Route path={ROUTES.ADD_ITEM_GROUP} element={withSuspense(<AddItemgroup />)} />
            <Route path={ROUTES.ADD_TASK} element={withSuspense(<AddTask />)} />
            <Route path={ROUTES.ADD_TASK_GROUP} element={withSuspense(<AddTaskgroup />)} />
            <Route path={ROUTES.ADD_PRIORITY} element={withSuspense(<AddPriority />)} />

            <Route path={ROUTES.ORDERS_NEW} element={withSuspense(<AddOrder1 />)} />
            <Route path={ROUTES.ADD_ORDER} element={<Navigate to={ROUTES.ORDERS_NEW} replace />} />
            <Route path={ROUTES.ADD_ORDER_V2} element={<Navigate to={ROUTES.ORDERS_NEW} replace />} />
            <Route path={ROUTES.ORDERS_BOARD} element={withSuspense(<OrderKanban />)} />
            <Route path={ROUTES.BUSINESS_CONTROL} element={withSuspense(<BusinessControl />)} />
            <Route path={ROUTES.PURCHASE_ORDERS} element={withSuspense(<PurchaseOrder />)} />
            <Route path={ROUTES.DISPATCH_QUEUE} element={withSuspense(<DispatchQueue />)} />
            <Route path={ROUTES.MIGRATE_ORDERS} element={withSuspense(<MigrateOrders />)} />
            <Route path="/orderUpdate/:id" element={withSuspense(<OrderUpdate />)} />
            <Route path="/updateDelivery/:id" element={withSuspense(<UpdateDelivery />)} />
            <Route path="/customers/:id" element={withSuspense(<CustomerDetails />)} />
            <Route path={ROUTES.SEARCH_MOBILE} element={withSuspense(<SearchMobile />)} />
            <Route path={ROUTE_ALIASES.SEARCH_MOBILE_OLD} element={<Navigate to={ROUTES.SEARCH_MOBILE} replace />} />

            <Route path={ROUTES.RECEIPT} element={withSuspense(<AddTransaction />)} />
            <Route path="/addTransaction" element={<Navigate to={ROUTES.RECEIPT} replace />} />
            <Route path={ROUTES.PAYMENT} element={withSuspense(<AddTransaction1 />)} />
            <Route path="/addTransaction1" element={<Navigate to={ROUTES.PAYMENT} replace />} />
            <Route path={ROUTES.CASH_LEDGER} element={withSuspense(<CashLedger />)} />
            <Route path={ROUTES.BANK_BOOK} element={withSuspense(<BankBook />)} />
            <Route path={ROUTES.TRIAL_BALANCE} element={withSuspense(<TrialBalance />)} />
            <Route path={ROUTES.FOLLOWUPS} element={withSuspense(<PaymentFollowup />)} />
            <Route path={ROUTE_ALIASES.FOLLOWUPS_OLD} element={<Navigate to={ROUTES.FOLLOWUPS} replace />} />
            <Route path={ROUTES.ADD_PAYABLE} element={withSuspense(<AddPayable />)} />
            <Route path={ROUTES.ADD_RECEIVABLE} element={withSuspense(<AddRecievable />)} />
            <Route path={ROUTES.ADD_PAYMENT} element={withSuspense(<AddPayment />)} />
            <Route path={ROUTES.UPI_PAYMENT} element={withSuspense(<UpiPayment />)} />

            <Route path={ROUTES.VENDORS} element={withSuspense(<Vendor />)} />
            <Route path="/vendors/:id" element={withSuspense(<VendorDetails />)} />
            <Route path={ROUTE_ALIASES.HOME_VENDOR} element={<Navigate to={ROUTES.VENDORS} replace />} />

            <Route path={ROUTES.WHATSAPP} element={withSuspense(<WhatsAppCloudDashboard />)} />
            <Route path={ROUTES.WHATSAPP_CLOUD} element={withSuspense(<WhatsAppCloudDashboard />)} />
            <Route path={ROUTES.WHATSAPP_SEND} element={withSuspense(<WhatsAppSendPage />)} />
            <Route path={ROUTES.WHATSAPP_BULK} element={withSuspense(<SendMessageAll />)} />
            <Route path={ROUTES.WHATSAPP_BROADCAST} element={withSuspense(<WhatsAppBroadcastPage />)} />
            <Route path={ROUTES.WHATSAPP_LEGACY_HOME} element={withSuspense(<WhatsAppHome />)} />
            <Route path={ROUTES.WHATSAPP_LOGIN_PAGE} element={withSuspense(<WhatsAppLogin />)} />
            <Route path={ROUTES.WHATSAPP_SESSION_PAGE} element={withSuspense(<WhatsAppSession />)} />
            <Route path={ROUTES.WHATSAPP_ADMIN_PANEL} element={withSuspense(<WhatsAppAdminPanel />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_HOME} element={withSuspense(<WhatsAppHome />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_LOGIN} element={withSuspense(<WhatsAppLogin />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_SESSION} element={withSuspense(<WhatsAppSession />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_ADMIN} element={withSuspense(<WhatsAppAdminPanel />)} />
            <Route path={ROUTE_ALIASES.WHATSAPP_BROADCAST_PAGE} element={<Navigate to={ROUTES.WHATSAPP_BROADCAST} replace />} />
            <Route path={ROUTE_ALIASES.WHATSAPP_SEND_PAGE} element={<Navigate to={ROUTES.WHATSAPP_SEND} replace />} />
            <Route path="/SendMessage" element={withSuspense(<SendMessage />)} />

            <Route path="/reports/orders" element={withSuspense(<AllOrder />)} />
            <Route path="/allOrder" element={withSuspense(<AllOrder />)} />
            <Route path="/reports/delivery" element={withSuspense(<AllDelivery />)} />
            <Route path="/allDelivery" element={withSuspense(<AllDelivery />)} />
            <Route path={ROUTES.ALL_TRANSACTION} element={withSuspense(<AllTransaction />)} />
            <Route path={ROUTES.REPORTS_TRANSACTIONS} element={withSuspense(<AllTransaction />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_1} element={withSuspense(<AllTransaction1 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_2} element={withSuspense(<AllTransaction2 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_3} element={withSuspense(<AllTransaction3 />)} />
            <Route path={ROUTES.REPORTS_TRANSACTION_4D} element={withSuspense(<AllTransaction4D />)} />
            <Route path={ROUTE_ALIASES.ALL_TRANSACTION_1_TYPO} element={<Navigate to={ROUTES.REPORTS_TRANSACTION_1} replace />} />
            <Route path={ROUTE_ALIASES.ALL_TRANSACTION_2_LOWER} element={<Navigate to={ROUTES.REPORTS_TRANSACTION_2} replace />} />
            <Route path={ROUTES.AGING_REPORT} element={withSuspense(<AgingReport />)} />
            <Route path={ROUTES.ACCOUNT_TRANSACTION} element={withSuspense(<AccountTransaction />)} />
            <Route path="/allTransaction" element={withSuspense(<AllTransaction />)} />
            <Route path="/reports/customers" element={withSuspense(<CustomerReport />)} />
            <Route path="/customerReport" element={withSuspense(<CustomerReport />)} />
            <Route path={ROUTES.PAYMENT_REPORT} element={withSuspense(<PaymentReport />)} />
            <Route path="/reports/items" element={withSuspense(<ItemReport />)} />
            <Route path="/itemReport" element={withSuspense(<ItemReport />)} />
            <Route path="/reports/tasks" element={withSuspense(<TaskReport />)} />
            <Route path="/taskReport" element={withSuspense(<TaskReport />)} />
            <Route path="/reports/users" element={withSuspense(<UserReport />)} />
            <Route path="/userReport" element={withSuspense(<UserReport />)} />
            <Route path={ROUTES.VENDOR_BILLS} element={withSuspense(<VendorBills />)} />
            <Route path={ROUTES.ALL_VENDORS} element={withSuspense(<AllVendors />)} />
            <Route path={ROUTES.REPORTS_BILLS} element={withSuspense(<AllBills />)} />
            <Route path={ROUTES.REPORTS_PRIORITY} element={withSuspense(<PriorityReport />)} />

            <Route path={ROUTES.ADD_NOTE} element={withSuspense(<AddNote />)} />
            <Route path={ROUTE_ALIASES.ADD_NOTE_LOWER} element={<Navigate to={ROUTES.ADD_NOTE} replace />} />
            <Route path={ROUTES.CALL_LOGS} element={withSuspense(<CallLogs />)} />
            <Route path={ROUTES.FLOW_BUILDER} element={withSuspense(<FlowBuilderPage />)} />

            <Route path={ROUTE_ALIASES.HOME_ADMIN} element={<Navigate to={ROUTES.HOME} replace />} />
            <Route path={ROUTE_ALIASES.HOME_OLD} element={<Navigate to={ROUTES.HOME} replace />} />
          </Route>

          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Box>
    </Router>
  );
}