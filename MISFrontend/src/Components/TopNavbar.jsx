import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useNavCustomize, isTopNavItemVisible } from '../hooks/useNavCustomize';

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
  { label: 'Call Logs',  groups: ['Call Logs'] },
  { label: 'SOP',        groups: ['SOP'] },
  { label: 'Admin',      groups: ['Admin'] },
];

function NavDropdown({ label, groups, roleKey, onNavigate }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleToggle = (e) => {
    setAnchorEl((prev) => (prev ? null : e.currentTarget));
  };

  const handleClose = () => setAnchorEl(null);

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
  groups: PropTypes.arrayOf(PropTypes.string).isRequired,
  roleKey: PropTypes.string.isRequired,
  onNavigate: PropTypes.func.isRequired,
};

export default function TopNavbar() {
  const navigate = useNavigate();
  const { userName, userGroup, clearAuth } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || userGroup || '');
  const { prefs } = useNavCustomize();
  const visibleNavDefs = NAV_DROPDOWN_DEFS.filter((d) => isTopNavItemVisible(prefs, d.label));

  useEffect(() => {
    if (!userName) navigate(ROUTES.LOGIN);
  }, [navigate, userName]);

  const handleLogout = () => {
    clearAuth();
    navigate(ROUTES.ROOT);
  };

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
          {visibleNavDefs.map((def) => (
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
            width: { lg: 170, xl: 220 },
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

        {/* Right quick links — desktop only */}
        <Stack
          direction="row"
          spacing={0}
          sx={{ display: { xs: 'none', xl: 'flex' }, alignItems: 'center', flexShrink: 0, mr: 0.5 }}
        >
          {[
            { label: 'Day Book', path: ROUTES.DAY_BOOK },
            { label: 'SOP', path: ROUTES.SOP },
            { label: 'Email', path: ROUTES.EMAIL_COMPOSE },
          ].map((link) => (
            <Button
              key={link.label}
              size="small"
              onClick={() => navigate(link.path)}
              sx={(t) => ({
                fontSize: '0.76rem',
                fontWeight: 600,
                color: 'text.secondary',
                borderRadius: 1.5,
                px: 1,
                py: 0.5,
                minWidth: 0,
                textTransform: 'none',
                '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.06), color: 'text.primary' },
              })}
            >
              {link.label}
            </Button>
          ))}
        </Stack>

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
            <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 700, lineHeight: 1.2, color: 'text.primary' }}>
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
