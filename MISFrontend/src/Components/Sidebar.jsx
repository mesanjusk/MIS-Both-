import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Divider, Drawer, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { ROUTES } from '../constants/routes';
import { useNavCustomize, isLeftItemVisible } from '../hooks/useNavCustomize';
import { useDashboardCustomize } from '../Pages/Layout';

const DRAWER_WIDTH = 66;

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

function RailIcon({ icon, label, onClick, selected = false, accent, tooltipPlacement = 'right' }) {
  const theme = useTheme();
  const color = accent || theme.palette.primary.main;

  return (
    <Tooltip title={label} placement={tooltipPlacement} arrow>
      <ButtonBase
        onClick={onClick}
        sx={{
          width: 54,
          py: 0.75,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.4,
          borderRadius: 2,
          bgcolor: selected ? alpha(color, 0.12) : 'transparent',
          color: selected ? color : 'text.secondary',
          transition: 'background 0.15s, color 0.15s',
          '&:hover': {
            bgcolor: alpha(color, 0.08),
            color,
          },
        }}
      >
        <Box
          sx={{
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'inherit',
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: '0.56rem',
            fontWeight: 700,
            lineHeight: 1,
            color: 'inherit',
            textAlign: 'center',
            maxWidth: 54,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { clearAuth, permissions } = useAuth();
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || '');
  const allowedGroups = useMemo(() => permissions?.sidebarGroups || [], [permissions]);
  const { prefs } = useNavCustomize();
  const dashCtx = useDashboardCustomize();

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
    navigate(path);
    onCloseMobile();
  };

  const handleLogout = () => {
    clearAuth();
    onCloseMobile();
    navigate('/');
  };

  const handleWidgets = () => {
    if (pathname === ROUTES.HOME || pathname.startsWith(ROUTES.HOME + '?')) {
      dashCtx?.openWidgetLib?.();
    } else {
      navigate(ROUTES.HOME + '?widgets=1');
    }
    onCloseMobile();
  };

  const isSelected = (path) => Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const drawerContent = (
    <Stack
      sx={{
        height: '100%',
        bgcolor: 'background.paper',
        alignItems: 'center',
        py: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {groups.map((group, gi) => (
        <Box key={group.label}>
          {gi > 0 && (
            <Divider sx={{ width: 38, my: 0.5 }} />
          )}
          <Stack spacing={0.15} alignItems="center">
            {group.items.map((item) => (
              <RailIcon
                key={item.path}
                icon={item.icon}
                label={item.label}
                selected={isSelected(item.path)}
                onClick={() => handleNavigate(item.path)}
              />
            ))}
          </Stack>
        </Box>
      ))}

      {/* Spacer pushes widgets + logout to bottom */}
      <Box sx={{ flex: 1 }} />

      <Divider sx={{ width: 38, my: 0.5 }} />

      <RailIcon
        icon={<WidgetsRoundedIcon sx={{ fontSize: 22 }} />}
        label="Widgets"
        onClick={handleWidgets}
        accent={theme.palette.primary.main}
      />

      <RailIcon
        icon={<LogoutRoundedIcon sx={{ fontSize: 22 }} />}
        label="Sign Out"
        onClick={handleLogout}
        accent={theme.palette.error.main}
      />
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
