import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

export default function OdooTopbar({ onToggleSidebar, notificationCount = 0 }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { userName, userGroup, clearAuth } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [search, setSearch] = useState('');

  const initials = (userName || 'U').slice(0, 2).toUpperCase();
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

  const handleLogout = () => {
    clearAuth();
    navigate(ROUTES.ROOT);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: theme.palette.primary.dark || theme.palette.primary.main,
        borderBottom: `1px solid ${alpha('#fff', 0.1)}`,
        zIndex: (t) => t.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, md: 60 }, px: { xs: 1, md: 2 }, gap: 1 }}>
        {/* Mobile menu toggle */}
        <IconButton
          onClick={onToggleSidebar}
          size="small"
          sx={{ color: '#fff', display: { md: 'none' } }}
        >
          <MenuRoundedIcon />
        </IconButton>

        {/* App title */}
        <Typography
          variant="subtitle1"
          fontWeight={800}
          noWrap
          sx={{ color: '#fff', letterSpacing: '-0.3px', mr: 2, display: { xs: 'none', sm: 'block' } }}
        >
          MIS Portal
        </Typography>

        {/* Global search */}
        <TextField
          size="small"
          placeholder="Search orders, customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            flex: 1,
            maxWidth: 400,
            '& .MuiOutlinedInput-root': {
              bgcolor: alpha('#fff', 0.12),
              borderRadius: 2,
              color: '#fff',
              '& fieldset': { border: 'none' },
              '&:hover': { bgcolor: alpha('#fff', 0.18) },
              '&.Mui-focused': { bgcolor: alpha('#fff', 0.2) },
            },
            '& input::placeholder': { color: alpha('#fff', 0.6), opacity: 1 },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 18, color: alpha('#fff', 0.7) }} />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ flex: 1 }} />

        {/* Date chip */}
        <Typography
          variant="caption"
          sx={{ color: alpha('#fff', 0.75), display: { xs: 'none', md: 'block' }, fontWeight: 500 }}
        >
          {todayLabel}
        </Typography>

        {/* Go to old dashboard */}
        <Tooltip title="Classic Dashboard">
          <IconButton size="small" sx={{ color: alpha('#fff', 0.8) }} onClick={() => navigate(ROUTES.HOME)}>
            <HomeRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Notifications placeholder */}
        <Tooltip title="Notifications">
          <IconButton size="small" sx={{ color: alpha('#fff', 0.8) }}>
            <NotificationsNoneRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* User avatar + menu */}
        <Tooltip title={`${userName} · ${userGroup || ''}`}>
          <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.25 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: alpha('#fff', 0.25), color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {initials}
            </Avatar>
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { mt: 1, minWidth: 160 } } }}
        >
          <MenuItem disabled sx={{ opacity: 1 }}>
            <Box>
              <Typography variant="body2" fontWeight={600}>{userName}</Typography>
              <Typography variant="caption" color="text.secondary">{userGroup}</Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ gap: 1, color: 'error.main' }}>
            <LogoutRoundedIcon fontSize="small" />
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
