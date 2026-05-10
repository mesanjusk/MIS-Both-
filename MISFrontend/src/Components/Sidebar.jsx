import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { ROUTES } from '../constants/routes';

const DRAWER_WIDTH = 240;

const normalizeRoleKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['admin', 'adminuser', 'superadmin', 'owner'].includes(text)) return 'Admin';
  if (['designer'].includes(text)) return 'Designer';
  if (['dataentry', 'dataentryuser'].includes(text)) return 'DataEntry';
  if (['officestaff', 'officeuser', 'otheroffice'].includes(text)) return 'OfficeStaff';
  if (['accounts', 'accountant', 'accountsuser'].includes(text)) return 'Accounts';
  return value || 'User';
};

const canShowItem = (item, roleKey) => {
  const roles = item.roles || ['Admin'];
  return roles.includes('all') || roles.includes(roleKey) || (roleKey === 'Admin' && !item.hideForAdmin);
};

export default function Sidebar({ mobileOpen, onCloseMobile, onNewOrderClick }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { clearAuth, userName, permissions } = useAuth();
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || '');
  const allowedGroups = useMemo(() => permissions?.sidebarGroups || [], [permissions]);
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(SIDEBAR_GROUPS.map((group) => [group.label, true])),
  );

  const sidebarColors = useMemo(() => {
    const text = theme.palette.primary.contrastText || '#ffffff';
    return {
      bg: theme.palette.primary.dark || theme.palette.primary.main,
      accent: theme.palette.primary.light || theme.palette.primary.main,
      text,
      textSoft: alpha(text, 0.86),
      textMuted: alpha(text, 0.68),
      border: alpha(text, 0.12),
      surface: alpha(text, 0.08),
      selected: alpha(text, 0.16),
      hover: alpha(text, 0.1),
    };
  }, [theme]);

  const groups = useMemo(
    () =>
      SIDEBAR_GROUPS
        .filter((group) => allowedGroups.length === 0 || allowedGroups.includes(group.label))
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canShowItem(item, roleKey)),
        }))
        .filter((group) => group.items.length),
    [roleKey, allowedGroups],
  );

  const handleNavigate = (path) => {
    if (path === ROUTES.ORDERS_NEW && typeof onNewOrderClick === 'function') {
      onNewOrderClick();
      onCloseMobile();
      return;
    }
    navigate(path);
    onCloseMobile();
  };

  const toggleGroup = (label) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    clearAuth();
    onCloseMobile();
    navigate('/');
  };

  const isSelected = (path) => Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const drawerContent = (
    <Stack sx={{ height: '100%', bgcolor: sidebarColors.bg, color: sidebarColors.text }}>
      {/* Header */}
      <Box sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.1}>
          <Avatar
            sx={{
              bgcolor: alpha(sidebarColors.text, 0.94),
              color: sidebarColors.bg,
              width: 36,
              height: 36,
              fontWeight: 900,
              fontSize: '0.9rem',
            }}
          >
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} color={sidebarColors.text} noWrap>
              SK Digital MIS
            </Typography>
            <Typography variant="caption" color={sidebarColors.textSoft} noWrap>
              {roleKey} • {new Date().toLocaleDateString('en-IN')}
            </Typography>
          </Box>
        </Stack>

        <Button
          fullWidth
          size="small"
          variant="contained"
          startIcon={<AddShoppingCartRoundedIcon fontSize="small" />}
          onClick={() => handleNavigate(ROUTES.ORDERS_NEW)}
          sx={{
            mt: 1.25,
            bgcolor: sidebarColors.accent,
            color: sidebarColors.bg,
            fontWeight: 700,
            '&:hover': { bgcolor: alpha(sidebarColors.accent, 0.86) },
          }}
        >
          New Order
        </Button>
      </Box>

      <Divider sx={{ borderColor: sidebarColors.border }} />

      {/* Nav groups */}
      <List sx={{ py: 0.75, px: 0.75, overflowY: 'auto', flexGrow: 1 }}>
        {groups.map((group) => (
          <Box key={group.label} sx={{ mb: 0.85 }}>
            <ListItemButton
              onClick={() => toggleGroup(group.label)}
              sx={{ minHeight: 30, borderRadius: 2, '&:hover': { bgcolor: sidebarColors.hover } }}
            >
              <ListItemText
                primary={group.label}
                primaryTypographyProps={{
                  variant: 'caption',
                  fontWeight: 800,
                  sx: { letterSpacing: 0.45, textTransform: 'uppercase', color: sidebarColors.textMuted },
                }}
              />
              {openGroups[group.label]
                ? <ExpandLessRoundedIcon sx={{ fontSize: 14, color: sidebarColors.textMuted }} />
                : <ExpandMoreRoundedIcon sx={{ fontSize: 14, color: sidebarColors.textMuted }} />}
            </ListItemButton>

            <Collapse in={openGroups[group.label]} timeout="auto" unmountOnExit={false}>
              {group.items.map((item) => {
                const selected = isSelected(item.path);
                return (
                  <ListItemButton
                    key={item.path}
                    selected={selected}
                    onClick={() => handleNavigate(item.path)}
                    sx={{
                      minHeight: 38,
                      ml: 0.5,
                      mb: 0.4,
                      borderRadius: 2,
                      color: selected ? sidebarColors.text : sidebarColors.textSoft,
                      '&.Mui-selected': {
                        bgcolor: sidebarColors.selected,
                        color: sidebarColors.text,
                        boxShadow: `inset 0 0 0 1px ${alpha(sidebarColors.text, 0.1)}`,
                      },
                      '&.Mui-selected:hover': { bgcolor: alpha(sidebarColors.text, 0.22) },
                      '&:hover': { bgcolor: sidebarColors.hover },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 30, color: selected ? sidebarColors.accent : alpha(sidebarColors.text, 0.78) }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 700, noWrap: true, sx: { fontSize: '0.78rem' } }}
                    />
                    {item.badge ? (
                      <Chip
                        label={item.badge}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          bgcolor: alpha(sidebarColors.text, 0.14),
                          color: sidebarColors.text,
                        }}
                      />
                    ) : null}
                  </ListItemButton>
                );
              })}
            </Collapse>
          </Box>
        ))}
      </List>

      {/* Logout */}
      <Box sx={{ p: 1 }}>
        <Button
          fullWidth
          color="inherit"
          variant="outlined"
          startIcon={<LogoutRoundedIcon fontSize="small" />}
          onClick={handleLogout}
          sx={{ borderColor: sidebarColors.border, color: sidebarColors.text, fontSize: '0.8rem' }}
        >
          Logout
        </Button>
      </Box>
    </Stack>
  );

  return (
    <>
      {/* Desktop: permanent fixed sidebar */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            overflowX: 'hidden',
            borderRight: 'none',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Mobile: temporary drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onCloseMobile}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: 'none' } }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}

Sidebar.propTypes = {
  mobileOpen: PropTypes.bool,
  onCloseMobile: PropTypes.func,
  onNewOrderClick: PropTypes.func,
};

Sidebar.defaultProps = {
  mobileOpen: false,
  onCloseMobile: () => {},
  onNewOrderClick: null,
};
