import { lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';

const loadOutstandingReport = () => import('../Reports/outstandingReport');
const loadAllOrders = () => import('../Reports/allOrdersList');
const loadAllAttandance = () => import('./AllAttandance');
const loadPayableAccount = () => import('./PayableAccount');
const loadRateCalculator = () => import('./RateCalculator');
const loadPaymentFollowup = () => import('./PaymentFollowupHome');
const loadDayBookLedger = () => import('../Reports/allTransaction4D');
const loadHomeInbox = () => import('./HomeInbox');
const loadHomeLeads = () => import('./HomeLeads');
const loadPendingBills = () => import('./PendingBills');
const loadTeamFollowup = () => import('./TeamFollowupHome');

const OutstandingReport = lazy(loadOutstandingReport);
const AllOrders = lazy(loadAllOrders);
const AllAttandance = lazy(loadAllAttandance);
const PayableAccount = lazy(loadPayableAccount);
const RateCalculator = lazy(loadRateCalculator);
const PaymentFollowup = lazy(loadPaymentFollowup);
const DayBookLedger = lazy(loadDayBookLedger);
const HomeInbox = lazy(loadHomeInbox);
const HomeLeads = lazy(loadHomeLeads);
const PendingBills = lazy(loadPendingBills);
const TeamFollowup = lazy(loadTeamFollowup);

function AttendanceHome() {
  const navigate = useNavigate();
  return (
    <Stack spacing={1.25}>
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 2.5,
          display: 'flex',
          gap: 1,
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Box>
          <Typography variant="subtitle2" fontWeight={800}>Month-wise Attendance Report</Typography>
          <Typography variant="caption" color="text.secondary">
            Check any month staff-wise with working days, present, absent and attendance percentage.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<EventAvailableRoundedIcon />}
          onClick={() => navigate('/attendance-report')}
          sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2, whiteSpace: 'nowrap' }}
        >
          Monthly Report
        </Button>
      </Paper>
      <AllAttandance />
    </Stack>
  );
}

function DayBookHome() {
  const navigate = useNavigate();
  return (
    <Stack spacing={1.25}>
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 2.5,
          display: 'flex',
          gap: 1,
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Box>
          <Typography variant="subtitle2" fontWeight={900}>Day Book — All Transactions</Typography>
          <Typography variant="caption" color="text.secondary">
            Check Cash, UPI Sanju SK and UPI Office separately. Opening, receipts, payments and closing balance are calculated per book.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<MenuBookRoundedIcon />}
          onClick={() => navigate('/accounts/day-book')}
          sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2, whiteSpace: 'nowrap' }}
        >
          Diary Review / Posting
        </Button>
      </Paper>
      <DayBookLedger />
    </Stack>
  );
}

const HOME_TABS = [
  { id: 'workflow', label: 'Workflow', icon: AssignmentRoundedIcon },
  { id: 'teamFollowup', label: 'Team Follow-up', icon: PeopleAltRoundedIcon, Component: TeamFollowup },
  { id: 'inbox', label: 'Inbox', icon: ChatRoundedIcon, Component: HomeInbox },
  { id: 'dayBook', label: 'Day Book', icon: MenuBookRoundedIcon, Component: DayBookHome, requiresAccounts: true },
  { id: 'attendance', label: 'Attendance', icon: EventAvailableRoundedIcon, Component: AttendanceHome },
  { id: 'orders', label: 'Orders', icon: ListAltRoundedIcon, Component: AllOrders },
  { id: 'outstanding', label: 'Outstanding', icon: AccountBalanceWalletRoundedIcon, Component: OutstandingReport },
  { id: 'payableAccount', label: 'Payable', icon: RequestQuoteRoundedIcon, Component: PayableAccount, requiresAccounts: true },
  { id: 'rateCalculator', label: 'Rate Calculator', icon: CalculateRoundedIcon, Component: RateCalculator },
  { id: 'paymentFollowup', label: 'Payment Follow-up', icon: NotificationsActiveRoundedIcon, Component: PaymentFollowup, requiresAccounts: true },
  { id: 'pendingBills', label: 'Pending Bills', icon: ReceiptLongRoundedIcon, Component: PendingBills },
  { id: 'leads', label: 'Leads', icon: PeopleAltRoundedIcon, Component: HomeLeads, requiresWhatsApp: true },
];

export const HOME_TAB_PRELOADERS = [loadHomeInbox, loadDayBookLedger, loadAllAttandance, loadAllOrders, loadOutstandingReport, loadPayableAccount, loadRateCalculator, loadPaymentFollowup];

export const LEGACY_HOME_TAB_IDS = {
  quickLinks: 'workflow', recentAttendance: 'attendance', ordersBoard: 'orders',
  delivery: 'orders', bills: 'orders',
  transaction4D: 'dayBook', workflowAudit: 'workflow',
};
export function getVisibleHomeTabs(permissions) {
  const available = HOME_TABS.filter((tab) =>
    (!tab.requiresAccounts || permissions?.canViewAccounts !== false)
    && (!tab.requiresWhatsApp || permissions?.canViewWhatsapp !== false));
  const configured = permissions?.allowedWidgets || [];
  if (!configured.length) return available;
  const allowed = new Set(configured.map((id) => LEGACY_HOME_TAB_IDS[id] || id));
  const filtered = available.filter(({ id }) =>
    allowed.has(id) || ['paymentFollowup', 'pendingBills', 'leads'].includes(id));
  return filtered.length ? filtered : available;
}
