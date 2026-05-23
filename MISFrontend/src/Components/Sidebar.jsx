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
import { useNavCustomize, isLeftItemVisible } from '../hooks/useNavCustomize';

const DRAWER_WIDTH = 240;

const normalizeRoleKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['admin', 'adminuser', 'superadmin', 'owner'].includes(text)) return 'Admin';
  if (['designer'].includes(text)) return 'Designer';
  if (['dataentry', 'dataentryuser'].includes(text)) return 'DataEntry';
  if (['officestaff', 'officeuser', 'otheroffice'].includes(text)) return 'OfficeStaff';
  if (['officeadmin'].includes(text)) return 'OfficeAdmin';
  if (['officedesign'].includes(text)) return 'OfficeDesign';
  if (['officemarketing'].includes(text)) return 'OfficeMarketing';
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
  const { prefs } = useNavCustomize();
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(SIDEBAR_GROUPS.map((group) => [group.label, true])),
  );

  const groups = useMemo(
    () =>
      SIDEBAR_GROUPS
        .filter((group) => allowedGroups.length === 0 || allowedGroups.includes(group.label))
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => canShowItem(item, roleKey) && isLeftItemVisible(prefs, item.path),
          ),
        }))
        .filter((group) => group.items.length),
    [roleKey, allowedGroups, prefs],
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
    <Stack sx={{ height: '100%', bgcolor: 'background.paper' }}>
      {/* ── Header ── */}
      <Box
        sx={{
          px: 2,
          pt: 2,
          pb: 1.75,
          background: `linear-gradient(160deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, transparent 80%)`,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
          <Avatar
            sx={{
              width: 38,
              height: 38,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              color: theme.palette.primary.main,
              fontWeight: 900,
              fontSize: '1rem',
              border: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} color="text.primary" noWrap>
              SK Digital MIS
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {roleKey} &bull; {userName || '—'}
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
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: '#fff',
            fontWeight: 700,
            borderRadius: 2,
            minHeight: 34,
            fontSize: '0.8rem',
            boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.28)}`,
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
              boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}`,
            },
          }}
        >
          + New Order
        </Button>
      </Box>

      {/* ── Navigation ── */}
      <List sx={{ py: 1, px: 0.75, overflowY: 'auto', flexGrow: 1 }}>
        {groups.map((group) => (
          <Box key={group.label} sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => toggleGroup(group.label)}
              sx={{
                minHeight: 26,
                borderRadius: 1.5,
                px: 1,
                '&:hover': { bgcolor: 'transparent' },
              }}
            >
              <ListItemText
                primary={group.label}
                primaryTypographyProps={{
                  variant: 'caption',
                  fontWeight: 800,
                  sx: {
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    color: 'text.disabled',
                    fontSize: '0.62rem',
                  },
                }}
              />
              {openGroups[group.label]
                ? <ExpandLessRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                : <ExpandMoreRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
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
                      borderRadius: 1.75,
                      mb: 0.2,
                      pl: 1.25,
                      borderLeft: `3px solid ${selected ? theme.palette.primary.main : 'transparent'}`,
                      transition: 'all 0.15s',
                      '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                      },
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 30,
                        color: selected ? theme.palette.primary.main : 'text.secondary',
                        '& svg': { fontSize: '1.1rem' },
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: selected ? 700 : 500,
                        noWrap: true,
                        sx: {
                          fontSize: '0.8rem',
                          color: selected ? theme.palette.primary.main : 'text.primary',
                        },
                      }}
                    />
                    {item.badge ? (
                      <Chip
                        label={item.badge}
                        size="small"
                        sx={{
                          height: 17,
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          color: theme.palette.primary.main,
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

      {/* ── Footer ── */}
      <Box sx={{ p: 1.25, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutRoundedIcon fontSize="small" />}
          onClick={handleLogout}
          sx={{
            borderColor: theme.palette.divider,
            color: 'text.secondary',
            fontSize: '0.78rem',
            borderRadius: 2,
            minHeight: 34,
            '&:hover': {
              borderColor: theme.palette.error.light,
              color: theme.palette.error.main,
              bgcolor: alpha(theme.palette.error.main, 0.04),
            },
          }}
        >
          Sign Out
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
            borderRight: `1px solid ${theme.palette.divider}`,
            boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
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
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            borderRight: 'none',
            boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
          },
        }}
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
