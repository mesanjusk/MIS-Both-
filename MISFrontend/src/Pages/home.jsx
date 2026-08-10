import React, { lazy, Suspense, useState, useEffect } from 'react';
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
import { useAuth } from '../context/AuthContext';

import WorkflowWidget from '../Components/dashboard/WorkflowWidget';

const OutstandingReport = lazy(() => import('../Reports/outstandingReport'));
const AllTransaction4D = lazy(() => import('../Reports/allTransaction4D'));
const AllDelivery = lazy(() => import('../Reports/allDelivery'));
const AllBills = lazy(() => import('../Reports/allBills'));
const AllAttandance = lazy(() => import('./AllAttandance'));
const RateCalculator = lazy(() => import('./RateCalculator'));
const DayBook = lazy(() => import('./DayBook'));

const HOME_TABS = [
  { id: 'workflow', label: 'Workflow', icon: AssignmentRoundedIcon, Component: WorkflowWidget },
  { id: 'outstanding', label: 'Outstanding', icon: AccountBalanceWalletRoundedIcon, Component: OutstandingReport },
  { id: 'transaction4D', label: 'Transaction 4D', icon: SwapHorizRoundedIcon, Component: AllTransaction4D },
  { id: 'delivery', label: 'Delivery', icon: LocalShippingRoundedIcon, Component: AllDelivery },
  { id: 'bills', label: 'Bills', icon: ReceiptLongRoundedIcon, Component: AllBills },
  { id: 'attendance', label: 'Attendance', icon: EventAvailableRoundedIcon, Component: AllAttandance },
  { id: 'rateCalculator', label: 'Rate Calculator', icon: CalculateRoundedIcon, Component: RateCalculator },
  { id: 'dayBook', label: 'Day Book', icon: MenuBookRoundedIcon, Component: DayBook },
];

/* ─── Main Home Component ───────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName } = useAuth();

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('workflow');

  /* Init user */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!loggedInUser) return <LinearProgress sx={{ borderRadius: 1, mt: 2, bgcolor: '#dcfce7' }} />;

  const ActiveComponent = HOME_TABS.find((tab) => tab.id === activeTab)?.Component || WorkflowWidget;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f0fdf4' }}>

      {isLoading && (
        <LinearProgress sx={{ mx: { xs: 1, md: 1.5 }, mt: 1.5, mb: 1, borderRadius: 1, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }} />
      )}

      {/* ── Tab bar ── */}
      <Box sx={{ px: { xs: 1, md: 1.5 }, pt: 1.5, flexShrink: 0 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'white',
            overflow: 'hidden',
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, next) => setActiveTab(next)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
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
              '& .Mui-selected': { color: '#16a34a !important' },
              '& .MuiTabs-indicator': { bgcolor: '#16a34a', height: 2.5, borderRadius: 1.5 },
            }}
          >
            {HOME_TABS.map((tab) => {
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

      {/* ── Active tab ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1, md: 1.5 }, py: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'white',
            p: 1.5,
            minHeight: '100%',
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
          }}
        >
          <Suspense fallback={<LinearProgress sx={{ borderRadius: 1, bgcolor: '#dcfce7' }} />}>
            <ActiveComponent />
          </Suspense>
        </Paper>
      </Box>
    </Box>
  );
}
