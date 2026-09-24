import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Button, Paper, LinearProgress, Stack, Tabs, Tab, Typography } from '@mui/material';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import { useAuth } from '../context/AuthContext';
import WorkflowWidget from '../Components/dashboard/WorkflowWidget';

const loadOutstandingReport = () => import('../Reports/outstandingReport');
const loadAllOrders = () => import('../Reports/allOrdersList');
const loadAllAttandance = () => import('./AllAttandance');
const loadPayableAccount = () => import('./PayableAccount');
const loadWorkflowAudit = () => import('./WorkflowAudit');
const loadRateCalculator = () => import('./RateCalculator');
const loadDayBook = () => import('./DayBook');
const loadHomeInbox = () => import('./HomeInbox');

const OutstandingReport = lazy(loadOutstandingReport);
const AllOrders = lazy(loadAllOrders);
const AllAttandance = lazy(loadAllAttandance);
const PayableAccount = lazy(loadPayableAccount);
const WorkflowAudit = lazy(loadWorkflowAudit);
const RateCalculator = lazy(loadRateCalculator);
const DayBook = lazy(loadDayBook);
const HomeInbox = lazy(loadHomeInbox);

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

const HOME_TABS = [
  { id: 'workflow', label: 'Workflow', icon: AssignmentRoundedIcon, Component: WorkflowWidget },
  { id: 'inbox', label: 'Inbox', icon: ChatRoundedIcon, Component: HomeInbox },
  // Orders is now the single operational record for production + billing + payment + delivery.
  { id: 'orders', label: 'Orders', icon: ListAltRoundedIcon, Component: AllOrders },
  { id: 'outstanding', label: 'Outstanding', icon: AccountBalanceWalletRoundedIcon, Component: OutstandingReport },
  { id: 'attendance', label: 'Attendance', icon: EventAvailableRoundedIcon, Component: AttendanceHome },
  { id: 'payableAccount', label: 'Payable Account', icon: RequestQuoteRoundedIcon, Component: PayableAccount, requiresAccounts: true },
  { id: 'workflowAudit', label: 'Workflow Audit', icon: FactCheckRoundedIcon, Component: WorkflowAudit, requiresAccounts: true },
  { id: 'rateCalculator', label: 'Rate Calculator', icon: CalculateRoundedIcon, Component: RateCalculator },
  // Day Book already contains the cash + bank historical ledger view along with
  // diary review, account assignment, bank-statement posting, edit/reopen and
  // upload actions. Keep that complete UI as the single home accounting book.
  { id: 'dayBook', label: 'Day Book', icon: MenuBookRoundedIcon, Component: DayBook },
];

const HOME_TAB_PRELOADERS = [loadHomeInbox, loadAllOrders, loadOutstandingReport, loadAllAttandance, loadPayableAccount, loadWorkflowAudit, loadRateCalculator, loadDayBook];

const LEGACY_HOME_TAB_IDS = {
  quickLinks: 'workflow', recentAttendance: 'attendance', ordersBoard: 'orders',
  // Existing user/widget settings for retired tabs keep working.
  delivery: 'orders', bills: 'orders',
  // Cash & Bank is merged into Day Book. Persisted selections and widget
  // permissions that still reference the old id transparently land on Day Book.
  transaction4D: 'dayBook',
};
const HOME_TAB_STORAGE_KEY = 'mis.home.activeTab';
function storedHomeTab() {
  try {
    const stored = sessionStorage.getItem(HOME_TAB_STORAGE_KEY) || 'workflow';
    return LEGACY_HOME_TAB_IDS[stored] || stored;
  } catch { return 'workflow'; }
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName, permissions } = useAuth();
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [activeTab, setActiveTab] = useState(storedHomeTab);
  const [mountedTabs, setMountedTabs] = useState(() => new Set([storedHomeTab()]));

  const visibleTabs = useMemo(() => {
    const accountVisibleTabs = HOME_TABS.filter((tab) => !tab.requiresAccounts || permissions?.canViewAccounts !== false);
    const configured = permissions?.allowedWidgets || [];
    if (!configured.length) return accountVisibleTabs;
    const allowed = new Set(configured.map((id) => LEGACY_HOME_TAB_IDS[id] || id));
    const filtered = accountVisibleTabs.filter((tab) => allowed.has(tab.id));
    return filtered.length ? filtered : accountVisibleTabs;
  }, [permissions?.allowedWidgets, permissions?.canViewAccounts]);

  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
  }, [location.state?.id, navigate, userName]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallback = visibleTabs[0]?.id || 'workflow';
      setActiveTab(fallback);
      setMountedTabs((current) => new Set([...current, fallback]));
      try { sessionStorage.setItem(HOME_TAB_STORAGE_KEY, fallback); } catch { /* preference only */ }
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!loggedInUser) return undefined;
    const preload = () => HOME_TAB_PRELOADERS.forEach((loader) => loader().catch(() => {}));
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 800);
    return () => window.clearTimeout(id);
  }, [loggedInUser]);

  if (!loggedInUser) return <LinearProgress sx={{ borderRadius: 1, mt: 2 }} />;
  const resolvedActiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : (visibleTabs[0]?.id || 'workflow');
  const handleTabChange = (_, next) => {
    setActiveTab(next);
    setMountedTabs((current) => new Set([...current, next]));
    try { sessionStorage.setItem(HOME_TAB_STORAGE_KEY, next); } catch { /* preference only */ }
  };

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
    <Box sx={{ px: { xs: 1, md: 1.5 }, pt: 1.5, flexShrink: 0 }}><Paper elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Tabs value={resolvedActiveTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={(theme) => ({ minHeight: 44, px: 0.5, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', gap: 0.5, color: 'text.secondary' }, '& .Mui-selected': { color: `${theme.palette.primary.main} !important` }, '& .MuiTabs-indicator': { bgcolor: 'primary.main', height: 2.5, borderRadius: 1.5 } })}>
        {visibleTabs.map((tab) => { const Icon = tab.icon; return <Tab key={tab.id} value={tab.id} label={tab.label} icon={<Icon sx={{ fontSize: 17 }} />} iconPosition="start" />; })}
      </Tabs>
    </Paper></Box>
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1, md: 1.5 }, py: 1.5 }}><Paper elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 1.5, minHeight: '100%', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
      {visibleTabs.filter((tab) => tab.id === resolvedActiveTab || mountedTabs.has(tab.id)).map((tab) => { const TabComponent = tab.Component; const isActive = tab.id === resolvedActiveTab; return <Box key={tab.id} role="tabpanel" aria-hidden={!isActive} sx={{ display: isActive ? 'block' : 'none', minHeight: '100%' }}><Suspense fallback={<LinearProgress sx={{ borderRadius: 1 }} />}><TabComponent /></Suspense></Box>; })}
    </Paper></Box>
  </Box>;
}
