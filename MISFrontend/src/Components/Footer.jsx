import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import { ROUTES } from '../constants/routes';

export default function Footer() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabs = useMemo(() => [
    { label: 'Home',     path: ROUTES.HOME,        icon: <DashboardRoundedIcon fontSize="small" /> },
    { label: 'Orders',   path: '/allOrder',         icon: <InventoryRoundedIcon fontSize="small" /> },
    { label: 'Add',      path: ROUTES.ORDERS_NEW,   icon: <AddCircleRoundedIcon color="primary" /> },
    { label: 'Accounts', path: ROUTES.DAY_BOOK,     icon: <AccountBalanceWalletRoundedIcon fontSize="small" /> },
  ], []);

  const active = tabs.find((t) => pathname.toLowerCase().startsWith(t.path.toLowerCase()))?.path ?? false;

  return (
    <Paper
      sx={{ position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 1100,
        display: { xs: 'block', md: 'none' },
        border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 2, overflow: 'hidden' }}
      elevation={1}
    >
      <BottomNavigation value={active} onChange={(_, next) => next && navigate(next)} showLabels sx={{ minHeight: 58 }}>
        {tabs.map((t) => (
          <BottomNavigationAction key={t.path} value={t.path} label={t.label} icon={t.icon} sx={{ minWidth: 0, px: 0.25 }} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
