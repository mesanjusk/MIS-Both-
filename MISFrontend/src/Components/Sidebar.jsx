import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Divider, Drawer, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
// Shared with the top navigation and the route guards, so this rail cannot
// show a link to a page the guard behind it will refuse.
import { normalizeRoleKey } from '../constants/roles';
import { isNavItemVisible } from '../constants/navVisibility';
import { useNavCustomize, isLeftItemVisible, useSidebarVisibility } from '../hooks/useNavCustomize';
import { usePageToggles } from '../hooks/usePageToggles';
import { useModuleConfig } from '../hooks/useModuleConfig';

const DRAWER_WIDTH = 66;


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

RailIcon.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  onClick: PropTypes.func,
  selected: PropTypes.bool,
  accent: PropTypes.string,
  tooltipPlacement: PropTypes.string,
};

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { permissions, userGroup } = useAuth();
  const roleKey = normalizeRoleKey(userGroup || localStorage.getItem('User_group') || '');
  const allowedGroups = useMemo(() => permissions?.sidebarGroups || [], [permissions]);
  const adminHiddenItems = useMemo(() => permissions?.leftHidden || [], [permissions]);
  const { prefs } = useNavCustomize();
  const { leftSidebarEnabled } = useSidebarVisibility();
  // Pages an admin has switched off from Admin → API Performance.
  const { isPageDisabled } = usePageToggles();
  const moduleConfig = useModuleConfig();

  const groups = useMemo(
    () =>
      SIDEBAR_GROUPS
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              // The shared decision — the same one the dropdowns and the route
              // guards use, so this rail cannot disagree with either.
              isNavItemVisible(
                { ...item, groupLabel: group.label },
                { roleKey, allowedGroups, isPageDisabled, moduleConfig },
              ) &&
              !adminHiddenItems.includes(item.path) &&
              isLeftItemVisible(prefs, item.path),
          ),
        }))
        .filter((group) => group.items.length),
    [roleKey, allowedGroups, adminHiddenItems, prefs, isPageDisabled, moduleConfig],
  );

  // Opt-in: nothing to show until enabled, or nothing left after filtering — hide entirely.
  if (!leftSidebarEnabled || groups.length === 0) return null;

  const handleNavigate = (path) => {
    navigate(path);
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
