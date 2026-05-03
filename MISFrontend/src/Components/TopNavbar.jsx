import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';

const titleFromPath = (pathname = '/home') => {
  const segment = pathname.split('/').filter(Boolean).at(-1) || 'home';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function TopNavbar({ onToggleSidebar, onToggleDesktopCollapse, desktopCollapsed }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { userName, userGroup, clearAuth } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState(null);

  const tabs = useMemo(
    () => [
      { label: 'Home', path: ROUTES.HOME, icon: <HomeRoundedIcon sx={{ fontSize: 16 }} /> },
      { label: 'Orders', path: '/allOrder', icon: <AssignmentRoundedIcon sx={{ fontSize: 16 }} /> },
      { label: 'Business', path: ROUTES.BUSINESS_CONTROL, icon: <StoreRoundedIcon sx={{ fontSize: 16 }} /> },
      { label: 'WhatsApp', path: ROUTES.WHATSAPP, icon: <ChatRoundedIcon sx={{ fontSize: 16 }} /> },
    ],
    [],
  );

  useEffect(() => {
    if (!userName) navigate(ROUTES.LOGIN);
  }, [navigate, userName]);

  const handleLogout = () => {
    clearAuth();
    navigate(ROUTES.ROOT);
  };

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <AppBar position="static" color="inherit" elevation={0}>
      <Toolbar sx={{ minHeight: { xs: 58, md: 64 }, px: { xs: 1, md: 1.5 }, gap: 1 }}>
        <IconButton onClick={onToggleSidebar} sx={{ display: { md: 'none' } }}>
          <MenuRoundedIcon fontSize="small" />
        </IconButton>

        <IconButton onClick={onToggleDesktopCollapse} sx={{ display: { xs: 'none', md: 'inline-flex' } }}>
          {desktopCollapsed ? <MenuRoundedIcon fontSize="small" /> : <MenuOpenRoundedIcon fontSize="small" />}
        </IconButton>

        <Stack sx={{ minWidth: 0, mr: { xs: 0.5, md: 1 } }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800 }}>
            {titleFromPath(pathname)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {userGroup || 'Workspace'} • {todayLabel}
          </Typography>
        </Stack>

        <TextField
          size="small"
          placeholder="Search customer, order, payment..."
          sx={{
            display: { xs: 'none', lg: 'flex' },
            width: { lg: 260, xl: 320 },
            mr: 'auto',
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', xl: 'flex' } }}>
          {tabs.map((tab) => (
            <Chip
              key={tab.path}
              clickable
              size="small"
              icon={tab.icon}
              label={<NavLink style={{ textDecoration: 'none', color: 'inherit', fontWeight: 700 }} to={tab.path}>{tab.label}</NavLink>}
              variant={pathname === tab.path ? 'filled' : 'outlined'}
              color={pathname === tab.path ? 'primary' : 'default'}
            />
          ))}
        </Stack>

        <Chip size="small" label="Live" color="success" variant="outlined" sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />

        <IconButton aria-label="notifications">
          <Badge color="primary" variant="dot">
            <NotificationsNoneRoundedIcon fontSize="small" />
          </Badge>
        </IconButton>

        <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34, fontSize: 12, fontWeight: 800 }}>
            {userName ? userName.slice(0, 2).toUpperCase() : 'NA'}
          </Avatar>
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">{userName || 'Guest'}</Typography>
            <Typography variant="caption" color="text.secondary">{userGroup || 'Unknown role'}</Typography>
          </Box>
          <MenuItem onClick={() => { setMenuAnchor(null); navigate(ROUTES.HOME); }}>
            <HomeRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Home
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); navigate(ROUTES.BUSINESS_CONTROL); }}>
            <StoreRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Business Control
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); handleLogout(); }}>
            <LogoutRoundedIcon fontSize="small" sx={{ mr: 1 }} /> Logout
          </MenuItem>
        </Menu>

        <IconButton sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

TopNavbar.propTypes = {
  onToggleSidebar: PropTypes.func.isRequired,
  onToggleDesktopCollapse: PropTypes.func.isRequired,
  desktopCollapsed: PropTypes.bool.isRequired,
};
