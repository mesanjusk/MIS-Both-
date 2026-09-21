import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Paper, LinearProgress, Tabs, Tab } from '@mui/material';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
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
const loadAllTransaction4D = () => import('../Reports/allTransaction4D');
const loadAllDelivery = () => import('../Reports/allDelivery');
const loadAllBills = () => import('../Reports/allBills');
const loadAllAttandance = () => import('./AllAttandance');
const loadPayableAccount = () => import('./PayableAccount');
const loadWorkflowAudit = () => import('./WorkflowAudit');
const loadRateCalculator = () => import('./RateCalculator');
const loadDayBook = () => import('./DayBook');
const loadOrderLedger = () => import('./OrderLedger');
const loadHomeInbox = () => import('./HomeInbox');

const OutstandingReport = lazy(loadOutstandingReport);
const AllTransaction4D = lazy(loadAllTransaction4D);
const AllDelivery = lazy(loadAllDelivery);
const AllBills = lazy(loadAllBills);
const AllAttandance = lazy(loadAllAttandance);
const PayableAccount = lazy(loadPayableAccount);
const WorkflowAudit = lazy(loadWorkflowAudit);
const RateCalculator = lazy(loadRateCalculator);
const DayBook = lazy(loadDayBook);
const OrderLedger = lazy(loadOrderLedger);
const HomeInbox = lazy(loadHomeInbox);

const HOME_TABS = [
  { id: 'workflow', label: 'Workflow', icon: AssignmentRoundedIcon, Component: WorkflowWidget },
  { id: 'inbox', label: 'Inbox', icon: ChatRoundedIcon, Component: HomeInbox },
  { id: 'orders', label: 'Orders', icon: ListAltRoundedIcon, Component: OrderLedger },
  { id: 'outstanding', label: 'Outstanding', icon: AccountBalanceWalletRoundedIcon, Component: OutstandingReport },
  { id: 'transaction4D', label: 'Cash & Bank', icon: SwapHorizRoundedIcon, Component: AllTransaction4D },
  { id: 'delivery', label: 'Delivery', icon: LocalShippingRoundedIcon, Component: AllDelivery },
  { id: 'bills', label: 'Bills', icon: ReceiptLongRoundedIcon, Component: AllBills },
  { id: 'attendance', label: 'Attendance', icon: EventAvailableRoundedIcon, Component: AllAttandance },
  { id: 'payableAccount', label: 'Payable Account', icon: RequestQuoteRoundedIcon, Component: PayableAccount, requiresAccounts: true },
  { id: 'workflowAudit', label: 'Workflow Audit', icon: FactCheckRoundedIcon, Component: WorkflowAudit, requiresAccounts: true },
  { id: 'rateCalculator', label: 'Rate Calculator', icon: CalculateRoundedIcon, Component: RateCalculator },
  { id: 'dayBook', label: 'Day Book', icon: MenuBookRoundedIcon, Component: DayBook },
];

const HOME_TAB_PRELOADERS = [
  loadHomeInbox,
  loadOrderLedger,
  loadOutstandingReport,
  loadAllTransaction4D,
  loadAllDelivery,
  loadAllBills,
  loadAllAttandance,
  loadPayableAccount,
  loadWorkflowAudit,
  loadRateCalculator,
  loadDayBook,
];

const LEGACY_HOME_TAB_IDS = {
  quickLinks: 'workflow',
  recentAttendance: 'attendance',
  ordersBoard: 'orders',
};

const HOME_TAB_STORAGE_KEY = 'mis.home.activeTab';

function storedHomeTab() {
  try {
    return sessionStorage.getItem(HOME_TAB_STORAGE_KEY) || 'workflow';
  } catch {
    return 'workflow';
  }
}

/* ─── Main Home Component ───────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName, permissions } = useAuth();

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [activeTab, setActiveTab] = useState(storedHomeTab);
  // Keep only tabs the user has actually opened mounted. That preserves each
  // screen's state/data when switching tabs without paying the cost of mounting
  // every dashboard screen on first load.
  const [mountedTabs, setMountedTabs] = useState(() => new Set([storedHomeTab()]));

  const visibleTabs = useMemo(() => {
    const accountVisibleTabs = HOME_TABS.filter(
      (tab) => !tab.requiresAccounts || permissions?.canViewAccounts !== false
    );

    const configured = permissions?.allowedWidgets || [];
    if (!configured.length) return accountVisibleTabs;

    const allowed = new Set(configured.map((id) => LEGACY_HOME_TAB_IDS[id] || id));
    const filtered = accountVisibleTabs.filter((tab) => allowed.has(tab.id));
    return filtered.length ? filtered : accountVisibleTabs;
  }, [permissions?.allowedWidgets, permissions?.canViewAccounts]);

  /* Init user — no artificial loading delay. */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) {
      navigate('/');
      return;
    }
    setLoggedInUser(user);
  }, [location.state?.id, navigate, userName]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallback = visibleTabs[0]?.id || 'workflow';
      setActiveTab(fallback);
      setMountedTabs((current) => {
        const next = new Set(current);
        next.add(fallback);
        return next;
      });
      try {
        sessionStorage.setItem(HOME_TAB_STORAGE_KEY, fallback);
      } catch {
        // sessionStorage can be unavailable in hardened/private browser modes.
      }
    }
  }, [activeTab, visibleTabs]);

  // Download the remaining home-tab JS chunks after the first screen is usable.
  // This does not mount the tabs or call their APIs; it only removes the
  // first-click chunk download so the dashboard feels like a local app.
  useEffect(() => {
    if (!loggedInUser) return undefined;

    const preload = () => {
      HOME_TAB_PRELOADERS.forEach((loader) => {
        loader().catch(() => {
          // A failed prefetch is harmless; React.lazy will retry on navigation.
        });
      });
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(preload, 800);
    return () => window.clearTimeout(id);
  }, [loggedInUser]);

  if (!loggedInUser) return <LinearProgress sx={{ borderRadius: 1, mt: 2 }} />;

  const resolvedActiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id || 'workflow');

  const handleTabChange = (_, next) => {
    setActiveTab(next);
    setMountedTabs((current) => {
      if (current.has(next)) return current;
      const updated = new Set(current);
      updated.add(next);
      return updated;
    });
    try {
      sessionStorage.setItem(HOME_TAB_STORAGE_KEY, next);
    } catch {
      // Non-critical preference only.
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* ── Tab bar ── */}
      <Box sx={{ px: { xs: 1, md: 1.5 }, pt: 1.5, flexShrink: 0 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <Tabs
            value={resolvedActiveTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={(theme) => ({
              minHeight: 44,
              px: 0.5,
              '& .MuiTab-root': {
                minHeight: 44,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                gap: 0.5,
                color: 'text.secondary',
              },
              '& .Mui-selected': { color: `${theme.palette.primary.main} !important` },
              '& .MuiTabs-indicator': { bgcolor: 'primary.main', height: 2.5, borderRadius: 1.5 },
            })}
          >
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  icon={<Icon sx={{ fontSize: 17 }} />}
                  iconPosition="start"
                />
              );
            })}
          </Tabs>
        </Paper>
      </Box>

      {/* ── Visited tabs stay mounted so returning to one is instant ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1, md: 1.5 }, py: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 1.5,
            minHeight: '100%',
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
          }}
        >
          {visibleTabs
            .filter((tab) => tab.id === resolvedActiveTab || mountedTabs.has(tab.id))
            .map((tab) => {
              const TabComponent = tab.Component;
              const isActive = tab.id === resolvedActiveTab;
              return (
                <Box
                  key={tab.id}
                  role="tabpanel"
                  aria-hidden={!isActive}
                  sx={{ display: isActive ? 'block' : 'none', minHeight: '100%' }}
                >
                  <Suspense fallback={<LinearProgress sx={{ borderRadius: 1 }} />}>
                    <TabComponent />
                  </Suspense>
                </Box>
              );
            })}
        </Paper>
      </Box>
    </Box>
  );
}
