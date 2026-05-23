import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';

import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';

const isUuidOrId = (s) => /^[0-9a-f]{8,}[-0-9a-f]*$/i.test(s) || /^[a-f0-9]{24}$/i.test(s);

const titleFromPath = (pathname = '/home') => {
  const parts = pathname.split('/').filter(Boolean);
  const segment = [...parts].reverse().find((p) => !isUuidOrId(p)) || parts.at(-1) || 'home';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

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

const NAV_DROPDOWN_DEFS = [
  { label: 'Attendance', groups: ['Attendance Report'] },
  { label: 'Orders',     groups: ['Orders Reports'] },
  { label: 'Accounts',   groups: ['Accounts & UPI', 'Account Reports', 'Collection Reports'] },
  { label: 'Reports',    groups: ['Dashboard Reports'] },
  { label: 'WhatsApp',   groups: ['WhatsApp', 'Email'] },
  { label: 'More',       groups: ['Call Logs', 'SOP', 'Admin'] },
];

function NavDropdown({ label, groups, roleKey, onNavigate }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const closeTimer = useRef(null);

  const open = Boolean(anchorEl);

  const handleMouseEnter = (e) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setAnchorEl(e.currentTarget);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setAnchorEl(null), 120);
  };

  const handleMenuMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleMenuMouseLeave = () => {
    closeTimer.current = setTimeout(() => setAnchorEl(null), 120);
  };

  const matchedGroups = SIDEBAR_GROUPS.filter((g) => groups.includes(g.label)).map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      const roles = item.roles || ['Admin'];
      return roles.includes('all') || roles.includes(roleKey) || (roleKey === 'Admin' && !item.hideForAdmin);
    }),
  })).filter((g) => g.items.length > 0);

  if (matchedGroups.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        endIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: '14px !important', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        disableAutoFocusItem
        MenuListProps={{
          onMouseEnter: handleMenuMouseEnter,
          onMouseLeave: handleMenuMouseLeave,
          dense: true,
          sx: { minWidth: 200 },
        }}
        PaperProps={{
          elevation: 4,
          sx: { borderRadius: 2, border: '1px solid', borderColor: 'divider', mt: 0.5 },
        }}
      >
        {matchedGroups.map((group, gi) => (
          <Box key={group.label}>
            {gi > 0 && <Divider sx={{ my: 0.5 }} />}
            <Typography
              sx={{
                fontSize: '0.6rem',
                fontWeight: 800,
                color: 'text.disabled',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                px: 2,
                pt: 0.75,
                pb: 0.25,
              }}
            >
              {group.label}
            </Typography>
            {group.items.map((item) => (
              <MenuItem
                key={item.path}
                dense
                onClick={() => { setAnchorEl(null); onNavigate(item.path); }}
                sx={{
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  gap: 1,
                  borderRadius: 1,
                  mx: 0.5,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
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
  groups: PropTypes.arrayOf(PropTypes.string).isRequired,
  roleKey: PropTypes.string.isRequired,
  onNavigate: PropTypes.func.isRequired,
};

export default function TopNavbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { userName, userGroup, clearAuth } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || userGroup || '');

  useEffect(() => {
    if (!userName) navigate(ROUTES.LOGIN);
  }, [navigate, userName]);

  const handleLogout = () => {
    clearAuth();
    navigate(ROUTES.ROOT);
  };

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

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
      <Toolbar sx={{ minHeight: { xs: 56, md: 56 }, px: { xs: 1, md: 1.5 }, gap: 0.5 }}>

        {/* Page title + date */}
        <Stack sx={{ minWidth: 0, mr: { xs: 0.5, md: 1 }, flexShrink: 0 }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.2, fontSize: { xs: '0.9rem', md: '0.92rem' } }}>
            {titleFromPath(pathname)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.65rem' }}>
            {userGroup || 'Workspace'} &bull; {todayLabel}
          </Typography>
        </Stack>

        {/* Nav dropdowns — desktop only */}
        <Stack
          direction="row"
          spacing={0}
          sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', flexShrink: 0 }}
        >
          {NAV_DROPDOWN_DEFS.map((def) => (
            <NavDropdown
              key={def.label}
              label={def.label}
              groups={def.groups}
              roleKey={roleKey}
              onNavigate={navigate}
            />
          ))}
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search order #, customer, item, vendor, amount…"
          sx={{
            display: { xs: 'none', lg: 'flex' },
            width: { lg: 260, xl: 340 },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            sx: {
              borderRadius: 2.5,
              fontSize: '0.82rem',
              bgcolor: (t) => t.palette.background.default,
            },
          }}
        />

        <Box sx={{ flex: 1 }} />

        {/* Notification bell */}
        <IconButton
          size="small"
          aria-label="notifications"
          sx={(t) => ({
            borderRadius: 2,
            '&:hover': { bgcolor: t.palette.action.hover },
          })}
        >
          <Badge color="primary" variant="dot">
            <NotificationsNoneRoundedIcon fontSize="small" />
          </Badge>
        </IconButton>

        {/* Avatar + dropdown */}
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ p: 0.5 }}
        >
          <Avatar
            sx={(t) => ({
              bgcolor: t.palette.primary.main,
              width: 32,
              height: 32,
              fontSize: '0.72rem',
              fontWeight: 800,
              boxShadow: `0 2px 8px ${t.palette.primary.main}40`,
            })}
          >
            {userName ? userName.slice(0, 2).toUpperCase() : 'NA'}
          </Avatar>
        </IconButton>

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

          <MenuItem dense onClick={() => { setMenuAnchor(null); navigate(ROUTES.BUSINESS_CONTROL); }}>
            <StoreRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Business Control
          </MenuItem>

          <MenuItem dense onClick={() => { setMenuAnchor(null); navigate(ROUTES.POST_PRINTING_CONTROL); }}>
            <StoreRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Post Printing
          </MenuItem>

          <MenuItem dense onClick={() => { setMenuAnchor(null); navigate(ROUTES.WORKFLOW_TEMPLATES); }}>
            <StoreRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Workflow Templates
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
