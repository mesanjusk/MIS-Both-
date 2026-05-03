import PropTypes from 'prop-types';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import { useThemeConfig } from '../context/ThemeConfigContext.jsx';
import { ROUTES } from '../constants/routes';

const NAVBAR_HEIGHT = 64;
const RIGHT_SIDEBAR_WIDTH = 240;

export default function RightSidebar({ onNewOrderClick, onCustomize }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { themeKey, setThemeKey, themeOptions } = useThemeConfig();

  const isSelected = (path) => Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const quickActions = [
    {
      label: 'New Order',
      icon: <AddShoppingCartRoundedIcon fontSize="small" />,
      onClick: onNewOrderClick,
      color: 'primary',
    },
    {
      label: 'New Receipt',
      icon: <ReceiptLongRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.RECEIPT),
      color: 'success',
    },
    {
      label: 'New Payment',
      icon: <PaymentsRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.PAYMENT),
      color: 'warning',
    },
    {
      label: 'Add Followup',
      icon: <NotificationsActiveRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.FOLLOWUPS),
      color: 'error',
    },
    {
      label: 'New Task',
      icon: <AddTaskRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.TASKS_NEW),
      color: 'secondary',
    },
  ];

  const quickLinks = [
    { label: 'All Orders', icon: <AssignmentRoundedIcon sx={{ fontSize: 18 }} />, path: '/allOrder' },
    { label: 'Business Control', icon: <StoreRoundedIcon sx={{ fontSize: 18 }} />, path: ROUTES.BUSINESS_CONTROL },
    { label: 'WhatsApp', icon: <ChatRoundedIcon sx={{ fontSize: 18 }} />, path: ROUTES.WHATSAPP },
    { label: 'Reports', icon: <AssessmentRoundedIcon sx={{ fontSize: 18 }} />, path: '/allTransaction' },
    { label: 'Attendance', icon: <PeopleRoundedIcon sx={{ fontSize: 18 }} />, path: ROUTES.ATTENDANCE },
    { label: 'Dispatch Queue', icon: <LocalShippingRoundedIcon sx={{ fontSize: 18 }} />, path: ROUTES.DISPATCH_QUEUE },
  ];

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: RIGHT_SIDEBAR_WIDTH,
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: (t) => `1px solid ${t.palette.divider}`,
        zIndex: 1100,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Spacer for navbar */}
      <Box sx={{ height: NAVBAR_HEIGHT, flexShrink: 0 }} />

      {/* Quick Actions header */}
      <Box sx={{ px: 1.75, pt: 1.5, pb: 0.75 }}>
        <Typography
          variant="overline"
          fontWeight={800}
          sx={{ fontSize: '0.68rem', letterSpacing: 1, color: 'text.secondary' }}
        >
          Quick Actions
        </Typography>
      </Box>

      {/* Quick action buttons */}
      <Stack spacing={0.6} sx={{ px: 1.25, pb: 1 }}>
        {quickActions.map((action) => (
          <Button
            key={action.label}
            fullWidth
            size="small"
            variant={action.color === 'primary' ? 'contained' : 'outlined'}
            color={action.color}
            startIcon={action.icon}
            onClick={action.onClick}
            sx={{
              justifyContent: 'flex-start',
              fontWeight: 700,
              fontSize: '0.75rem',
              py: 0.65,
              borderRadius: 1.5,
              textTransform: 'none',
              ...(action.color !== 'primary' && {
                bgcolor: (t) => alpha(t.palette[action.color]?.main || t.palette.primary.main, 0.06),
                '&:hover': {
                  bgcolor: (t) => alpha(t.palette[action.color]?.main || t.palette.primary.main, 0.14),
                },
              }),
            }}
          >
            {action.label}
          </Button>
        ))}
      </Stack>

      <Divider sx={{ mx: 1.25 }} />

      {/* Quick Links header */}
      <Box sx={{ px: 1.75, pt: 1.25, pb: 0.5 }}>
        <Typography
          variant="overline"
          fontWeight={800}
          sx={{ fontSize: '0.68rem', letterSpacing: 1, color: 'text.secondary' }}
        >
          Quick Links
        </Typography>
      </Box>

      {/* Quick link items */}
      <List dense disablePadding sx={{ px: 0.75 }}>
        {quickLinks.map((link) => {
          const selected = isSelected(link.path);
          return (
            <ListItemButton
              key={link.path}
              selected={selected}
              onClick={() => navigate(link.path)}
              sx={{
                borderRadius: 1.5,
                mb: 0.25,
                py: 0.55,
                color: selected ? 'primary.main' : 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                  color: 'primary.main',
                },
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 28,
                  color: selected ? 'primary.main' : 'text.secondary',
                }}
              >
                {link.icon}
              </ListItemIcon>
              <ListItemText
                primary={link.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: selected ? 700 : 500,
                  fontSize: '0.78rem',
                  noWrap: true,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      <Divider sx={{ mx: 1.25, mb: 1 }} />

      {/* Bottom: Customize + Theme */}
      <Stack spacing={1} sx={{ px: 1.25, pb: 1.75 }}>
        {typeof onCustomize === 'function' ? (
          <Button
            fullWidth
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<DashboardCustomizeRoundedIcon fontSize="small" />}
            onClick={onCustomize}
            sx={{
              justifyContent: 'flex-start',
              fontWeight: 700,
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: 1.5,
            }}
          >
            Customize Dashboard
          </Button>
        ) : null}

        <FormControl size="small" fullWidth>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Colour Theme</InputLabel>
          <Select
            label="Colour Theme"
            value={themeKey}
            onChange={(e) => setThemeKey(e.target.value)}
            sx={{ fontSize: '0.78rem', borderRadius: 1.5 }}
          >
            {Object.entries(themeOptions).map(([key, option]) => (
              <MenuItem value={key} key={key} sx={{ fontSize: '0.78rem' }}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Box>
  );
}

RightSidebar.propTypes = {
  onNewOrderClick: PropTypes.func,
  onCustomize: PropTypes.func,
};

RightSidebar.defaultProps = {
  onNewOrderClick: null,
  onCustomize: null,
};
