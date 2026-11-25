import { lazy, Suspense, useState } from 'react';
import { Box, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { ACCOUNT_ROLES, ADMIN_ROLES, OFFICE_ROLES, isRoleAllowed } from '../constants/roles';
import { useRoleKey } from '../hooks/useRouteAccess';

const TeamOperations = lazy(() => import('./TeamOperations'));
const AttentionOverview = lazy(() => import('./TeamAttentionOverview'));
const MyOperations = lazy(() => import('./MyOperations'));
const DailyReport = lazy(() => import('./OperationsDailyReport'));
const PendingByAssigned = lazy(() => import('../Components/dashboard/PendingByAssignedWidget'));
const WhatsApp = lazy(() => import('./TeamReminder'));
const OfficeAi = lazy(() => import('../Components/OfficeAiPanel'));
const CustomerAi = lazy(() => import('../Components/CustomerAiPanel'));
const Settings = lazy(() => import('./OperationsSettings'));
const PrintSent = lazy(() => import('./PrintSent'));
const PrintGmailSettings = lazy(() => import('./PrintGmailSettings'));

const VIEWS = [
  ['overview', 'Overview'], ['printSent', 'Print Sent'], ['team', 'Team Status'], ['orders', 'Pending Orders'],
  ['responsibilities', 'Responsibilities'], ['mine', 'My Tasks'], ['escalations', 'Escalations'],
  ['daily', 'Daily Report'], ['whatsapp', 'WhatsApp'], ['officeAi', 'Office AI'], ['customerAi', 'Customer AI'], ['settings', 'Settings'],
];

// All panels use existing operations and order APIs. Nothing is copied into a
// second task collection. Management and staff retain their existing roles.
export default function TeamFollowupHome({ active = true, gmailConnectionResult = '' }) {
  const { permissions } = useAuth();
  const role = useRoleKey();
  const isAdmin = isRoleAllowed(ADMIN_ROLES, role);
  const canViewPrintSent = isAdmin || [...OFFICE_ROLES, ...ACCOUNT_ROLES].includes(role)
    || ['manager', 'worker', 'delivery', 'office staff', 'accounts user'].includes(role.toLowerCase());
  const [selected, setSelected] = useState(gmailConnectionResult && isAdmin ? 'settings' : isAdmin ? 'overview' : 'mine');
  const [orderOwner, setOrderOwner] = useState('');
  const navigateView = (next, owner = '') => { setOrderOwner(owner); setSelected(next); };
  const visibleViews = isAdmin ? VIEWS.filter(([id]) => id !== 'whatsapp' || permissions?.canViewWhatsapp !== false)
    : VIEWS.filter(([id]) => id === 'mine' || (id === 'printSent' && canViewPrintSent));
  const view = visibleViews.some(([id]) => id === selected) ? selected : visibleViews[0][0];
  if (!active) return null;

  return (
    <Stack spacing={1.25} sx={{ '& .MuiTableCell-root': { py: 0.75 }, '& .MuiButton-root': { textTransform: 'none' } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography variant="h6" fontWeight={800}>Team Follow-up</Typography>
          <Typography variant="body2" color="text.secondary">
            Find delayed work, missing owners and next actions.
          </Typography>
        </Box>
      </Stack>
      {visibleViews.length > 1 && (
        <Tabs value={view} onChange={(_, next) => navigateView(next)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Team follow-up views"
          sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, px: 1.5, textTransform: 'none', fontWeight: 700, fontSize: '0.78rem' } }}>
          {visibleViews.map(([id, label]) => <Tab key={id} value={id} label={label} />)}
        </Tabs>
      )}
      <Suspense fallback={<LinearProgress />}>
        {view === 'overview' && <AttentionOverview onNavigate={navigateView} canFollowUp={permissions?.canViewWhatsapp !== false} />}
        {view === 'printSent' && <PrintSent />}
        {['team', 'responsibilities', 'escalations'].includes(view) && <TeamOperations key={view} view={view} />}
        {view === 'orders' && <PendingByAssigned initialOwner={orderOwner} compact />}
        {view === 'mine' && <MyOperations compact />}
        {view === 'daily' && <DailyReport compact />}
        {view === 'whatsapp' && <WhatsApp initialUser={orderOwner} />}
        {view === 'officeAi' && <OfficeAi />}
        {view === 'customerAi' && <CustomerAi />}
        {view === 'settings' && <Stack spacing={2}>
          {permissions?.canUseEmail !== false && <PrintGmailSettings connectionResult={gmailConnectionResult} />}
          <Settings />
        </Stack>}
      </Suspense>
    </Stack>
  );
}
