import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';

import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';
import { PRIMARY_NAV, itemsForSection } from '../constants/sidebarMenu';
import { normalizeRoleKey } from '../constants/roles';
import { useNavCustomize, isTopNavItemVisible } from '../hooks/useNavCustomize';
import { usePageToggles } from '../hooks/usePageToggles';
import { useModuleConfig } from '../hooks/useModuleConfig';
import { visibleSectionItems } from '../constants/navVisibility';
import { useDashboardCustomize } from '../Pages/Layout';
import AttendanceStatus from './dashboard/AttendanceStatus';

/** A heading with one destination — no menu to open. */
function NavLink({ label, onClick }) {
  return (
    <Button
      size="small"
      onClick={onClick}
      sx={(t) => ({
        fontSize: '0.78rem',
        fontWeight: 600,
        color: 'text.secondary',
        borderRadius: 1.5,
        px: 1,
        py: 0.5,
        minWidth: 0,
        textTransform: 'none',
        whiteSpace: 'nowrap',
        '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.06), color: 'text.primary' },
      })}
    >
      {label}
    </Button>
  );
}

NavLink.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

function NavDropdown({ label, section, roleKey, allowedGroups, onNavigate }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleToggle = (e) => {
    setAnchorEl((prev) => (prev ? null : e.currentTarget));
  };

  const handleClose = () => setAnchorEl(null);
  // Pages an admin has switched off from Admin → API Performance. This is the
  // navigation most users actually see, so a page left here would still be
  // reachable after being switched off.
  const { isPageDisabled } = usePageToggles();
  const moduleConfig = useModuleConfig();

  // One decision, shared with the left rail and the route guards.
  const items = visibleSectionItems(itemsForSection(section), {
    roleKey,
    allowedGroups,
    isPageDisabled,
    moduleConfig,
  });

  // The original group labels survive as sub-headings inside the dropdown, so
  // a heading with twenty entries still reads as sections rather than a list.
  const matchedGroups = [];
  for (const item of items) {
    const last = matchedGroups[matchedGroups.length - 1];
    if (last && last.label === item.groupLabel) last.items.push(item);
    else matchedGroups.push({ label: item.groupLabel, items: [item] });
  }

  if (matchedGroups.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        endIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: '14px !important', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />}
        onClick={handleToggle}
        sx={(t) => ({
          fontSize: '0.78rem',
          fontWeight: 600,
          color: open ? t.palette.primary.main : 'text.secondary',
          borderRadius: 1.5,
          px: 1,
          py: 0.5,
          minWidth: 0,
          textTransform: 'none',
          whiteSpace: 'nowrap',
          bgcolor: open ? alpha(t.palette.primary.main, 0.07) : 'transparent',
          '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.06), color: 'text.primary' },
        })}
      >
        {label}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        disableAutoFocusItem
        MenuListProps={{ dense: true, sx: { minWidth: 200 } }}
        PaperProps={{
          elevation: 4,
          sx: { borderRadius: 2, border: '1px solid', borderColor: 'divider', mt: 0.5 },
        }}
      >
        {matchedGroups.map((group, gi) => (
          <Box key={group.label}>
            {gi > 0 && <Divider sx={{ my: 0.5 }} />}
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.8, px: 2, pt: 0.75, pb: 0.25 }}>
              {group.label}
            </Typography>
            {group.items.map((item) => (
              <MenuItem
                key={item.path}
                dense
                onClick={() => { handleClose(); onNavigate(item.path); }}
                sx={{ fontSize: '0.82rem', fontWeight: 500, gap: 1, borderRadius: 1, mx: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Box sx={{ color: 'text.secondary', display: 'flex', fontSize: 16 }}>{item.icon}</Box>
                {item.label}
              </MenuItem>
            ))}
          </Box>
        ))}
      </Menu>
    </>
  );
}

NavDropdown.propTypes = {
  label: PropTypes.string.isRequired,
  section: PropTypes.string.isRequired,
  roleKey: PropTypes.string.isRequired,
  allowedGroups: PropTypes.arrayOf(PropTypes.string).isRequired,
  onNavigate: PropTypes.func.isRequired,
};

export default function TopNavbar() {
  const navigate = useNavigate();
  const { userName, userGroup, clearAuth } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const roleKey = normalizeRoleKey(userGroup || localStorage.getItem('User_group') || '');
  const { prefs } = useNavCustomize();
  const { permissions } = useAuth();
  const allowedGroups = permissions?.sidebarGroups || [];
  const dashCtx = useDashboardCustomize();
  // A heading is hidden if it, or any of the older dropdown names it replaced,
  // was hidden. Without the legacy check, consolidating the menu would silently
  // un-hide entries that an admin or the user had deliberately turned off.
  const adminHidden = permissions?.topNavHidden || [];
  const visibleNavDefs = PRIMARY_NAV.filter((def) => {
    const names = [def.label, ...(def.legacy || [])];
    if (names.some((name) => adminHidden.includes(name))) return false;
    return names.every((name) => isTopNavItemVisible(prefs, name));
  });

  useEffect(() => {
    if (!userName) navigate(ROUTES.LOGIN);
  }, [navigate, userName]);

  const handleLogout = () => {
    clearAuth();
    navigate(ROUTES.ROOT);
  };

  const handleCustomize = () => dashCtx?.openCustomize?.();

  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={(t) => ({
        borderBottom: `1px solid ${t.palette.divider}`,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(16px)',
      })}
    >
      <Toolbar sx={{ minHeight: { xs: 52, md: 52 }, px: { xs: 1, md: 1.5 }, gap: 0.5 }}>

        {/* Brand name */}
        <Typography
          noWrap
          onClick={() => navigate(ROUTES.HOME)}
          sx={(t) => ({
            fontWeight: 900,
            fontSize: '0.88rem',
            color: t.palette.primary.main,
            letterSpacing: 0.3,
            cursor: 'pointer',
            mr: 0.5,
            flexShrink: 0,
            display: { xs: 'none', sm: 'block' },
            '&:hover': { opacity: 0.8 },
          })}
        >
          SK Digital
        </Typography>

        {/* Nav dropdowns — desktop only */}
        <Stack
          direction="row"
          spacing={0}
          sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', flexShrink: 0 }}
        >
          {visibleNavDefs.map((def) => (def.directPath ? (
            <NavLink
              key={def.label}
              label={def.label}
              onClick={() => navigate(def.directPath)}
            />
          ) : (
            <NavDropdown
              key={def.label}
              label={def.label}
              section={def.section}
              roleKey={roleKey}
              allowedGroups={allowedGroups}
              onNavigate={navigate}
            />
          )))}
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Attendance — start/end day, next to the user's name */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, mr: 0.5 }}>
          <AttendanceStatus />
        </Box>

        {/* User zone: avatar + name + role + dropdown */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={(t) => ({
            cursor: 'pointer',
            px: 0.75,
            py: 0.4,
            borderRadius: 2,
            ml: 0.25,
            '&:hover': { bgcolor: t.palette.action.hover },
          })}
        >
          <Avatar
            sx={(t) => ({
              bgcolor: t.palette.primary.main,
              width: 30,
              height: 30,
              fontSize: '0.68rem',
              fontWeight: 800,
              boxShadow: `0 2px 8px ${t.palette.primary.main}40`,
              flexShrink: 0,
            })}
          >
            {userName ? userName.slice(0, 2).toUpperCase() : 'NA'}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 800, lineHeight: 1.2 }}>
              {userName || 'Guest'}
            </Typography>
            <Typography noWrap sx={{ fontSize: '0.62rem', color: 'text.secondary', lineHeight: 1 }}>
              {userGroup || 'User'}
            </Typography>
          </Box>
          <KeyboardArrowDownRoundedIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
        </Stack>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            elevation: 4,
            sx: { borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 180 },
          }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">{userName || 'Guest'}</Typography>
            <Typography variant="caption" color="text.secondary">{userGroup || 'Unknown role'}</Typography>
          </Box>

          <Divider />

          <MenuItem dense onClick={() => { setMenuAnchor(null); navigate(ROUTES.HOME); }}>
            <HomeRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Home
          </MenuItem>

          <MenuItem dense onClick={() => { setMenuAnchor(null); handleCustomize(); }}>
            <DashboardCustomizeRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Customize
          </MenuItem>

          <Divider />

          <MenuItem dense onClick={() => { setMenuAnchor(null); handleLogout(); }}>
            <LogoutRoundedIcon fontSize="small" sx={{ mr: 1, color: 'error.main' }} />
            <Typography sx={{ color: 'error.main', fontSize: '0.875rem' }}>Logout</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

TopNavbar.propTypes = {};
