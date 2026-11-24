import { lazy, Suspense, useState } from 'react';
import { Box, Button, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { ADMIN_ROLES, isRoleAllowed } from '../constants/roles';
import { useRoleKey } from '../hooks/useRouteAccess';

const TeamOperations = lazy(() => import('./TeamOperations'));
const MyOperations = lazy(() => import('./MyOperations'));
const DailyReport = lazy(() => import('./OperationsDailyReport'));
const PendingByAssigned = lazy(() => import('../Components/dashboard/PendingByAssignedWidget'));

// All panels use existing operations and order APIs. Nothing is copied into a
// second task collection. Management and staff retain their existing roles.
export default function TeamFollowupHome({ active = true }) {
  const { permissions } = useAuth();
  const isAdmin = isRoleAllowed(ADMIN_ROLES, useRoleKey());
  const [selected, setSelected] = useState('team');
  const view = isAdmin ? selected : 'mine';
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
        {isAdmin && permissions?.canViewWhatsapp !== false && (
          <Button component={RouterLink} to={ROUTES.WHATSAPP_SEND} variant="outlined" size="small">
            WhatsApp follow-up
          </Button>
        )}
      </Stack>
      {isAdmin && (
        <Tabs value={view} onChange={(_, next) => setSelected(next)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Team follow-up views">
          <Tab value="team" label="Team status" />
          <Tab value="orders" label="Pending orders by owner" />
          <Tab value="mine" label="My tasks" />
          <Tab value="daily" label="Daily report" />
        </Tabs>
      )}
      <Suspense fallback={<LinearProgress />}>
        {view === 'team' && <TeamOperations />}
        {view === 'orders' && <PendingByAssigned />}
        {view === 'mine' && <MyOperations />}
        {view === 'daily' && <DailyReport />}
      </Suspense>
    </Stack>
  );
}
