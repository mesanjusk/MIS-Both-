import { lazy, Suspense, useState } from 'react';
import { Box, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES, isRoleAllowed } from '../constants/roles';
import { useRoleKey } from '../hooks/useRouteAccess';

const TeamOperations = lazy(() => import('./TeamOperations'));
const MyOperations = lazy(() => import('./MyOperations'));
const DailyReport = lazy(() => import('./OperationsDailyReport'));
const PendingByAssigned = lazy(() => import('../Components/dashboard/PendingByAssignedWidget'));
const WhatsApp = lazy(() => import('./WhatsAppSendPage'));
const OfficeAi = lazy(() => import('../Components/OfficeAiPanel'));
const CustomerAi = lazy(() => import('../Components/CustomerAiPanel'));
const Settings = lazy(() => import('./OperationsSettings'));

const VIEWS = [
  ['overview', 'Overview'], ['team', 'Team Status'], ['orders', 'Pending Orders'],
  ['responsibilities', 'Responsibilities'], ['mine', 'My Tasks'], ['escalations', 'Escalations'],
  ['daily', 'Daily Report'], ['whatsapp', 'WhatsApp'], ['officeAi', 'Office AI'], ['customerAi', 'Customer AI'], ['settings', 'Settings'],
];

// All panels use existing operations and order APIs. Nothing is copied into a
// second task collection. Management and staff retain their existing roles.
export default function TeamFollowupHome({ active = true }) {
  const { permissions } = useAuth();
  const isAdmin = isRoleAllowed(ADMIN_ROLES, useRoleKey());
  const [selected, setSelected] = useState('overview');
  const visibleViews = isAdmin ? VIEWS.filter(([id]) => id !== 'whatsapp' || permissions?.canViewWhatsapp !== false) : VIEWS.filter(([id]) => id === 'mine');
  const view = visibleViews.some(([id]) => id === selected) ? selected : visibleViews[0][0];
  if (!active) return null;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography variant="h6" fontWeight={800}>Team Follow-up</Typography>
          <Typography variant="body2" color="text.secondary">
            Track current owners, pending work, overdue tasks and responsibility coverage from existing records.
          </Typography>
        </Box>
      </Stack>
      {isAdmin && (
        <Tabs value={view} onChange={(_, next) => setSelected(next)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Team follow-up views"
          sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, px: 1.5, textTransform: 'none', fontWeight: 700, fontSize: '0.78rem' } }}>
          {visibleViews.map(([id, label]) => <Tab key={id} value={id} label={label} />)}
        </Tabs>
      )}
      <Suspense fallback={<LinearProgress />}>
        {['overview', 'team', 'responsibilities', 'escalations'].includes(view) && <TeamOperations key={view} view={view} />}
        {view === 'orders' && <PendingByAssigned />}
        {view === 'mine' && <MyOperations />}
        {view === 'daily' && <DailyReport />}
        {view === 'whatsapp' && <WhatsApp />}
        {view === 'officeAi' && <OfficeAi />}
        {view === 'customerAi' && <CustomerAi />}
        {view === 'settings' && <Settings />}
      </Suspense>
    </Stack>
  );
}
