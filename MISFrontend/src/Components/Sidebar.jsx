import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Button, Divider, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Stack, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: 'Dashboard', path: ROUTES.HOME,        icon: <DashboardRoundedIcon fontSize="small" /> },
  { label: 'Orders',    path: '/allOrder',         icon: <InventoryRoundedIcon fontSize="small" /> },
  { label: 'Customers', path: ROUTES.ADD_CUSTOMER, icon: <PeopleRoundedIcon fontSize="small" /> },
  { label: 'Accounts',  path: ROUTES.DAY_BOOK,     icon: <AccountBalanceWalletRoundedIcon fontSize="small" /> },
  { label: 'Reports',   path: '/reports/orders',   icon: <BarChartRoundedIcon fontSize="small" /> },
  { label: 'Settings',  path: ROUTES.ADD_USER,     icon: <SettingsRoundedIcon fontSize="small" />, adminOnly: true },
];

export default function Sidebar({ mobileOpen, onCloseMobile, onNewOrderClick }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { clearAuth, userName } = useAuth();
  const isAdmin = (localStorage.getItem('User_group') || '').toLowerCase().includes('admin');
  const roleLabel = localStorage.getItem('User_group') || 'User';

  const c = {
    bg:       theme.palette.primary.dark || theme.palette.primary.main,
    text:     theme.palette.primary.contrastText || '#fff',
    muted:    alpha(theme.palette.primary.contrastText || '#fff', 0.68),
    border:   alpha(theme.palette.primary.contrastText || '#fff', 0.12),
    hover:    alpha(theme.palette.primary.contrastText || '#fff', 0.1),
    selected: alpha(theme.palette.primary.contrastText || '#fff', 0.16),
    accent:   theme.palette.primary.light || theme.palette.primary.main,
  };

  const goTo = (path) => {
    if (path === ROUTES.ORDERS_NEW && typeof onNewOrderClick === 'function') {
      onNewOrderClick();
    } else {
      navigate(path);
    }
    onCloseMobile?.();
  };

  const isSelected = (path) => pathname === path || pathname.startsWith(path + '/');
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const content = (
    <Stack sx={{ height: '100%', bgcolor: c.bg, color: c.text }}>
      <Box sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.1}>
          <Avatar sx={{ bgcolor: alpha(c.text, 0.94), color: c.bg, width: 36, height: 36, fontWeight: 900, fontSize: '0.9rem' }}>
            {(userName || 'U')[0].toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} color={c.text} noWrap>SK Digital MIS</Typography>
            <Typography variant="caption" color={c.muted} noWrap>
              {roleLabel} · {new Date().toLocaleDateString('en-IN')}
            </Typography>
          </Box>
        </Stack>
        <Button
          fullWidth size="small" variant="contained"
          startIcon={<AddShoppingCartRoundedIcon fontSize="small" />}
          onClick={() => goTo(ROUTES.ORDERS_NEW)}
          sx={{ mt: 1.25, bgcolor: c.accent, color: c.bg, fontWeight: 700, '&:hover': { bgcolor: alpha(c.accent, 0.86) } }}
        >
          New Order
        </Button>
      </Box>

      <Divider sx={{ borderColor: c.border }} />

      <List sx={{ py: 1, px: 0.75, flexGrow: 1 }}>
        {items.map((item) => {
          const sel = isSelected(item.path);
          return (
            <ListItemButton
              key={item.path} selected={sel} onClick={() => goTo(item.path)}
              sx={{ minHeight: 42, mb: 0.4, borderRadius: 2, color: sel ? c.text : c.muted,
                '&.Mui-selected': { bgcolor: c.selected }, '&:hover': { bgcolor: c.hover } }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: sel ? c.accent : alpha(c.text, 0.75) }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 700, fontSize: '0.82rem', noWrap: true }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 1 }}>
        <Button
          fullWidth color="inherit" variant="outlined"
          startIcon={<LogoutRoundedIcon fontSize="small" />}
          onClick={() => { clearAuth(); navigate('/'); }}
          sx={{ borderColor: c.border, color: c.text, fontSize: '0.8rem' }}
        >
          Logout
        </Button>
      </Box>
    </Stack>
  );

  return (
    <>
      <Drawer variant="permanent" open
        sx={{ display: { xs: 'none', md: 'block' }, width: DRAWER_WIDTH, flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: 'none', overflowX: 'hidden' } }}>
        {content}
      </Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={onCloseMobile}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: 'none' } }}>
        {content}
      </Drawer>
    </>
  );
}

Sidebar.propTypes = {
  mobileOpen: PropTypes.bool,
  onCloseMobile: PropTypes.func,
  onNewOrderClick: PropTypes.func,
};
Sidebar.defaultProps = { mobileOpen: false, onCloseMobile: () => {}, onNewOrderClick: null };
