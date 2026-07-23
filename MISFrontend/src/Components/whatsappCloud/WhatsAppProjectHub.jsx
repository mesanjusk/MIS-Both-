import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { ROUTES } from '../../constants/routes';

const hubCards = [
  {
    title: 'Dashboard',
    description: 'Business overview: pending orders, dues, and daily activity.',
    icon: <DashboardRoundedIcon color="primary" />,
    actionPath: ROUTES.DASHBOARD,
  },
  {
    title: 'Orders Board',
    description: 'Track and advance order stages across the workflow.',
    icon: <Inventory2RoundedIcon color="primary" />,
    actionPath: ROUTES.ORDERS_BOARD,
  },
  {
    title: 'Attendance',
    description: 'Mark and review staff check-in / check-out.',
    icon: <EventAvailableRoundedIcon color="primary" />,
    actionPath: ROUTES.ATTENDANCE,
  },
  {
    title: 'Attendance Report',
    description: 'Attendance history and summaries by staff member.',
    icon: <EventAvailableRoundedIcon color="primary" />,
    actionPath: ROUTES.ATTENDANCE_REPORT,
  },
  {
    title: 'Tasks',
    description: 'Assigned and pending tasks across the team.',
    icon: <AssignmentTurnedInRoundedIcon color="primary" />,
    actionPath: ROUTES.TASKS,
  },
  {
    title: 'Vendors',
    description: 'Vendor directory and purchase-side details.',
    icon: <LocalShippingRoundedIcon color="primary" />,
    actionPath: ROUTES.VENDORS,
  },
  {
    title: 'Payment Follow-ups',
    description: 'Outstanding payment reminders and collection tracking.',
    icon: <PaymentsRoundedIcon color="primary" />,
    actionPath: ROUTES.FOLLOWUPS,
  },
  {
    title: 'User & Group Permissions',
    description: 'Manage staff roles, groups, and module permissions.',
    icon: <GroupRoundedIcon color="primary" />,
    actionPath: ROUTES.ADMIN_USER_PERMISSIONS,
  },
  {
    title: 'WhatsApp Action Log',
    description: 'Audit trail of WhatsApp-driven order actions and commands.',
    icon: <HistoryRoundedIcon color="primary" />,
    actionPath: ROUTES.WHATSAPP_ACTION_LOG,
  },
];

export default function WhatsAppProjectHub() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, overflowY: 'auto', height: '100%' }}>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Chip size="small" color="primary" label="Admin / Super Admin" sx={{ width: 'fit-content' }} />
        <Typography variant="h6" fontWeight={800}>Project Hub</Typography>
        <Typography variant="body2" color="text.secondary">
          Jump to the rest of the project without leaving the WhatsApp workspace.
        </Typography>
      </Stack>

      <Grid container spacing={1.5}>
        {hubCards.map((card) => (
          <Grid item xs={12} sm={6} lg={4} key={card.title}>
            <Card
              elevation={0}
              sx={{ height: '100%', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
            >
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {card.icon}
                  <Typography variant="subtitle1" fontWeight={700}>{card.title}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {card.description}
                </Typography>
                <Button size="small" variant="text" onClick={() => navigate(card.actionPath)} sx={{ alignSelf: 'flex-start' }}>
                  Open
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
