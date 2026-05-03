import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import { useDashboardData } from '../hooks/useDashboardData';
import { useUserRole } from '../hooks/useUserRole';
import { useAuth } from '../context/AuthContext';
import OdooShell from '../components/dashboardV2/OdooShell';
import KpiCard from '../components/dashboardV2/KpiCard';
import QuickLaunchGrid from '../components/dashboardV2/QuickLaunchGrid';
import { ROUTES } from '../constants/routes';

const normalizeRoleKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['admin', 'adminuser', 'superadmin', 'owner'].includes(text)) return 'Admin';
  if (['designer'].includes(text)) return 'Designer';
  if (['dataentry', 'dataentryuser'].includes(text)) return 'DataEntry';
  if (['officestaff', 'officeuser', 'otheroffice'].includes(text)) return 'OfficeStaff';
  if (['accounts', 'accountant', 'accountsuser'].includes(text)) return 'Accounts';
  return value || 'User';
};

function RecentOrdersList({ orders, loading }) {
  const theme = useTheme();
  if (loading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2 }} />;
  if (!orders?.length) {
    return (
      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
        No pending orders
      </Typography>
    );
  }

  return (
    <List disablePadding dense>
      {orders.slice(0, 8).map((order, idx) => {
        const name = order?.Customer_name || order?.customer_name || '—';
        const task = order?.highestStatusTask?.Task || '—';
        const orderId = order?.Order_id || order?.Order_uuid || `#${idx + 1}`;
        return (
          <ListItem
            key={order?._id || idx}
            divider={idx < Math.min(orders.length, 8) - 1}
            sx={{ px: 0, py: 0.75 }}
          >
            <ListItemAvatar sx={{ minWidth: 40 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main, fontSize: 12, fontWeight: 700 }}>
                {name.charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={name}
              secondary={`${orderId} · ${task}`}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 500, noWrap: true }}
              secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
            />
            <Chip label={task} size="small" sx={{ fontSize: 10, height: 20, ml: 1, flexShrink: 0 }} />
          </ListItem>
        );
      })}
    </List>
  );
}

export default function DashboardV2() {
  const navigate = useNavigate();
  const { userName } = useAuth();
  const { role, isAdmin } = useUserRole();
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || '');

  const { summary, myPendingOrders, activeOrders, isOrdersLoading, loadError } = useDashboardData({
    role,
    userName,
    isAdmin,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!userName) navigate(ROUTES.LOGIN);
  }, [userName, navigate]);

  const theme = useTheme();
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const kpiCards = [
    {
      title: 'Active Orders',
      value: isOrdersLoading ? '…' : summary.activeOrders,
      icon: Inventory2RoundedIcon,
      color: '#6366f1',
      onClick: () => navigate(ROUTES.ORDERS_BOARD),
    },
    {
      title: 'Pending Today',
      value: isOrdersLoading ? '…' : summary.pendingToday,
      icon: AutorenewRoundedIcon,
      color: '#f59e0b',
      onClick: () => navigate(ROUTES.ORDERS_BOARD),
    },
    {
      title: 'Delivered Today',
      value: isOrdersLoading ? '…' : summary.deliveredToday,
      icon: CheckCircleRoundedIcon,
      color: '#10b981',
      onClick: () => navigate(ROUTES.ORDERS_BOARD),
    },
    {
      title: 'Cancelled Today',
      value: isOrdersLoading ? '…' : summary.cancelledToday,
      icon: CancelRoundedIcon,
      color: '#ef4444',
      onClick: () => navigate(ROUTES.ORDERS_BOARD),
    },
  ];

  return (
    <OdooShell>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ letterSpacing: '-0.4px' }}>
          {greeting}, {userName?.split(' ')[0] || 'there'} 👋
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Typography>
      </Box>

      {/* Error banner */}
      {loadError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not load some dashboard data. Showing cached or partial results.
        </Alert>
      )}

      {/* KPI cards row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpiCards.map((card) => (
          <Grid item xs={6} sm={3} key={card.title}>
            <KpiCard {...card} />
          </Grid>
        ))}
      </Grid>

      {/* Main content grid: recent orders + quick launch */}
      <Grid container spacing={2.5}>
        {/* Recent pending orders */}
        <Grid item xs={12} md={7}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AssignmentRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="subtitle2" fontWeight={700}>
                    Pending Orders
                  </Typography>
                </Box>
                <Chip
                  label={`${activeOrders?.length ?? 0} total`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 11 }}
                />
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              <RecentOrdersList orders={myPendingOrders} loading={isOrdersLoading} />
            </CardContent>
          </Card>
        </Grid>

        {/* Quick launch panel */}
        <Grid item xs={12} md={5}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <QuickLaunchGrid roleKey={roleKey} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Footer note */}
      <Box sx={{ mt: 4, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="caption" color="text.disabled">
            Dashboard V2 Preview — data from existing APIs, no backend changes
          </Typography>
          <Chip
            label="Classic UI →"
            size="small"
            variant="outlined"
            clickable
            onClick={() => navigate(ROUTES.HOME)}
            sx={{ fontSize: 11 }}
          />
        </Stack>
      </Box>
    </OdooShell>
  );
}
