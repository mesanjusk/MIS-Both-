import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
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
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';

const titleFromPath = (pathname = '/home') => {
  const segment = pathname.split('/').filter(Boolean).at(-1) || 'home';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function TopNavbar({ onToggleSidebar }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { userName, userGroup, clearAuth } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState(null);

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
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
      <Toolbar sx={{ minHeight: { xs: 58, md: 64 }, px: { xs: 1, md: 1.5 }, gap: 1 }}>

        {/* Mobile sidebar toggle */}
        <IconButton onClick={onToggleSidebar} size="small" sx={{ display: { md: 'none' } }}>
          <MenuRoundedIcon fontSize="small" />
        </IconButton>

        {/* Page title + date */}
        <Stack sx={{ minWidth: 0, mr: { xs: 0.5, md: 1.5 } }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {titleFromPath(pathname)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
            {userGroup || 'Workspace'} • {todayLabel}
          </Typography>
        </Stack>

        {/* Search bar */}
        <TextField
          size="small"
          placeholder="Search customer, order, payment..."
          sx={{
            display: { xs: 'none', md: 'flex' },
            width: { md: 220, lg: 280, xl: 340 },
            mr: 'auto',
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
            sx: { borderRadius: 2, fontSize: '0.82rem' },
          }}
        />

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Notifications */}
        <IconButton size="small" aria-label="notifications">
          <Badge color="primary" variant="dot">
            <NotificationsNoneRoundedIcon fontSize="small" />
          </Badge>
        </IconButton>

        {/* User avatar + menu */}
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.72rem', fontWeight: 800 }}>
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
      </Toolbar>
    </AppBar>
  );
}

TopNavbar.propTypes = {
  onToggleSidebar: PropTypes.func.isRequired,
};
