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
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { ROUTES } from '../constants/routes';

const DRAWER_WIDTH = 286;
const DRAWER_COLLAPSED = 76;

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

export default function Sidebar({ desktopCollapsed, mobileOpen, onCloseMobile, onNewOrderClick }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { clearAuth, userName } = useAuth();
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || '');
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
      SIDEBAR_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => canShowItem(item, roleKey)),
      })).filter((group) => group.items.length),
    [roleKey],
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
    if (desktopCollapsed) return;
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    clearAuth();
    onCloseMobile();
    navigate('/');
  };

  const isSelected = (path) => Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const drawerContent = (
    <Stack sx={{ height: '100%', bgcolor: sidebarColors.bg, color: sidebarColors.text, transition: theme.transitions.create(['background-color', 'color']) }}>
      <Box sx={{ p: desktopCollapsed ? 1 : 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1.1}>
          <Avatar
            sx={{
              bgcolor: alpha(sidebarColors.text, 0.94),
              color: sidebarColors.bg,
              width: 38,
              height: 38,
              fontWeight: 900,
            }}
          >
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </Avatar>
          {!desktopCollapsed ? (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={800} color={sidebarColors.text} noWrap>
                SK Digital MIS
              </Typography>
              <Typography variant="caption" color={sidebarColors.textSoft} noWrap>
                {roleKey} • {new Date().toLocaleDateString('en-IN')}
              </Typography>
            </Box>
          ) : null}
        </Stack>

        {!desktopCollapsed ? (
          <Stack direction="row" spacing={0.8} sx={{ mt: 1.2 }}>
            <Button
              fullWidth
              size="small"
              variant="contained"
              startIcon={<AddShoppingCartRoundedIcon fontSize="small" />}
              onClick={() => handleNavigate(ROUTES.ORDERS_NEW)}
              sx={{
                bgcolor: sidebarColors.accent,
                color: sidebarColors.bg,
                '&:hover': { bgcolor: alpha(sidebarColors.accent, 0.86) },
              }}
            >
              Order
            </Button>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<AddTaskRoundedIcon fontSize="small" />}
              onClick={() => handleNavigate(ROUTES.TASKS_NEW)}
              sx={{ borderColor: sidebarColors.border, color: sidebarColors.text }}
            >
              Task
            </Button>
          </Stack>
        ) : null}
      </Box>

      <Divider sx={{ borderColor: sidebarColors.border }} />

      <List sx={{ py: 0.75, px: 0.75, overflowY: 'auto', flexGrow: 1 }}>
        {groups.map((group) => (
          <Box key={group.label} sx={{ mb: 0.85 }}>
            {!desktopCollapsed ? (
              <ListItemButton onClick={() => toggleGroup(group.label)} sx={{ minHeight: 34, borderRadius: 2.5, '&:hover': { bgcolor: sidebarColors.hover } }}>
                <ListItemText
                  primary={group.label}
                  primaryTypographyProps={{
                    variant: 'caption',
                    fontWeight: 800,
                    sx: {
                      letterSpacing: 0.45,
                      textTransform: 'uppercase',
                      color: sidebarColors.textMuted,
                    },
                  }}
                />
                {openGroups[group.label] ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
              </ListItemButton>
            ) : null}

            <Collapse in={desktopCollapsed || openGroups[group.label]} timeout="auto" unmountOnExit={false}>
              {group.items.map((item) => {
                const selected = isSelected(item.path);
                return (
                  <Tooltip key={item.path} title={desktopCollapsed ? item.label : ''} placement="right">
                    <ListItemButton
                      selected={selected}
                      onClick={() => handleNavigate(item.path)}
                      sx={{
                        minHeight: 40,
                        ml: desktopCollapsed ? 0 : 0.5,
                        mb: 0.55,
                        borderRadius: 2.5,
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
                      <ListItemIcon sx={{ minWidth: 32, color: selected ? sidebarColors.accent : alpha(sidebarColors.text, 0.78) }}>
                        {item.icon}
                      </ListItemIcon>
                      {!desktopCollapsed ? (
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 700, noWrap: true }}
                        />
                      ) : null}
                    </ListItemButton>
                  </Tooltip>
                );
              })}
            </Collapse>
          </Box>
        ))}
      </List>

      <Box sx={{ p: 1 }}>
        {!desktopCollapsed ? (
          <Stack spacing={1} sx={{ mb: 1 }}>
            
          </Stack>
        ) : null}

        <Button
          fullWidth
          color="inherit"
          variant="outlined"
          startIcon={<LogoutRoundedIcon fontSize="small" />}
          onClick={handleLogout}
          sx={{ borderColor: sidebarColors.border, color: sidebarColors.text }}
        >
          {!desktopCollapsed ? 'Logout' : ''}
        </Button>
      </Box>
    </Stack>
  );

  return (
    <>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: desktopCollapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: desktopCollapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH,
            overflowX: 'hidden',
            transition: (theme) => theme.transitions.create('width'),
            borderRight: 'none',
          },
        }}
      >
        {drawerContent}
      </Drawer>

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
  desktopCollapsed: PropTypes.bool,
  mobileOpen: PropTypes.bool,
  onCloseMobile: PropTypes.func,
  onNewOrderClick: PropTypes.func,
};

Sidebar.defaultProps = {
  desktopCollapsed: false,
  mobileOpen: false,
  onCloseMobile: () => {},
  onNewOrderClick: null,
};
