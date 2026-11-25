import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Paper, LinearProgress, Tabs, Tab } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import WorkflowWidget from '../Components/dashboard/WorkflowWidget';
import { getVisibleHomeTabs, HOME_TAB_PRELOADERS, LEGACY_HOME_TAB_IDS } from './homeTabs';

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
  const gmailConnectionResult = new URLSearchParams(location.search).get('printSentGmail') || '';

  const visibleTabs = useMemo(() => getVisibleHomeTabs(permissions), [permissions]);

  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
  }, [location.state?.id, navigate, userName]);

  useEffect(() => {
    if (location.state?.openTab !== 'paymentFollowup' || permissions?.canViewAccounts === false) return;
    setActiveTab('paymentFollowup');
    setMountedTabs((current) => new Set([...current, 'paymentFollowup']));
    try { sessionStorage.setItem(HOME_TAB_STORAGE_KEY, 'paymentFollowup'); } catch { /* preference only */ }
  }, [location.state?.openTab, location.key, permissions?.canViewAccounts]);

  useEffect(() => {
    if (!['connected', 'cancelled', 'error'].includes(gmailConnectionResult)
      || !visibleTabs.some((tab) => tab.id === 'teamFollowup')) return;
    setActiveTab('teamFollowup');
    setMountedTabs((current) => new Set([...current, 'teamFollowup']));
  }, [gmailConnectionResult, visibleTabs]);

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
  const isInboxActive = resolvedActiveTab === 'inbox';

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
    <Box sx={{ px: { xs: 1, md: 1.5 }, pt: 1.5, flexShrink: 0 }}><Paper elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Tabs value={resolvedActiveTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={(theme) => ({ minHeight: 44, px: 0.5, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', gap: 0.5, color: 'text.secondary' }, '& .Mui-selected': { color: `${theme.palette.primary.main} !important` }, '& .MuiTabs-indicator': { bgcolor: 'primary.main', height: 2.5, borderRadius: 1.5 } })}>
        {visibleTabs.map((tab) => { const Icon = tab.icon; return <Tab key={tab.id} value={tab.id} label={tab.label} icon={<Icon sx={{ fontSize: 17 }} />} iconPosition="start" />; })}
      </Tabs>
    </Paper></Box>
    <Box sx={{ flex: 1, minHeight: 0, overflow: isInboxActive ? 'hidden' : 'auto', px: { xs: 1, md: 1.5 }, py: 1.5 }}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          p: 1.5,
          minHeight: isInboxActive ? 0 : '100%',
          height: isInboxActive ? '100%' : 'auto',
          overflow: isInboxActive ? 'hidden' : 'visible',
          boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
        }}
      >
        {visibleTabs.filter((tab) => tab.id === resolvedActiveTab || mountedTabs.has(tab.id)).map((tab) => {
          const TabComponent = tab.id === 'workflow' ? WorkflowWidget : tab.Component;
          const isActive = tab.id === resolvedActiveTab;
          const isInboxTab = tab.id === 'inbox';
          return (
            <Box
              key={tab.id}
              role="tabpanel"
              aria-hidden={!isActive}
              sx={{
                display: isActive ? 'block' : 'none',
                minHeight: isInboxTab ? 0 : '100%',
                height: isInboxTab ? '100%' : 'auto',
                overflow: isInboxTab ? 'hidden' : 'visible',
              }}
            >
              <Suspense fallback={<LinearProgress sx={{ borderRadius: 1 }} />}>
                <TabComponent {...(tab.id === 'teamFollowup' ? { active: isActive, gmailConnectionResult } : tab.id === 'paymentFollowup'
                  ? { initialCustomerUuid: location.state?.followupCustomerUuid || '', prefillKey: location.key }
                  : {})} />
              </Suspense>
            </Box>
          );
        })}
      </Paper>
    </Box>
  </Box>;
}
