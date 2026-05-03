import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  ButtonBase,
  Divider,
  Stack,
  Tooltip,
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
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import { ROUTES } from '../constants/routes';

const NAVBAR_HEIGHT = 64;
const RIGHT_SIDEBAR_WIDTH = 80;

/* ── Rail item: icon centred + label below ─────────────────────────── */
function RailItem({ icon, label, onClick, selected = false, accent }) {
  const theme = useTheme();
  const color = accent || theme.palette.primary.main;

  return (
    <Tooltip title={label} placement="left" arrow>
      <ButtonBase
        onClick={onClick}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          py: 0.9,
          gap: 0.35,
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
        <Box sx={{ fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: '0.6rem',
            fontWeight: 700,
            lineHeight: 1,
            color: 'inherit',
            textAlign: 'center',
            maxWidth: 64,
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

/* ── Section label ─────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <Typography
      sx={{
        fontSize: '0.55rem',
        fontWeight: 800,
        letterSpacing: 0.8,
        color: 'text.disabled',
        textTransform: 'uppercase',
        textAlign: 'center',
        display: 'block',
        py: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

/* ── Right Sidebar ─────────────────────────────────────────────────── */
export default function RightSidebar({ onNewOrderClick, onCustomize }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();

  const isSelected = (path) =>
    Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const quickActions = [
    {
      label: 'Order',
      icon: <AddShoppingCartRoundedIcon fontSize="small" />,
      onClick: onNewOrderClick,
      accent: theme.palette.primary.main,
    },
    {
      label: 'Receipt',
      icon: <ReceiptLongRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.RECEIPT),
      accent: theme.palette.success.main,
    },
    {
      label: 'Payment',
      icon: <PaymentsRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.PAYMENT),
      accent: theme.palette.warning.main,
    },
    {
      label: 'Followup',
      icon: <NotificationsActiveRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.FOLLOWUPS),
      accent: theme.palette.error.main,
    },
    {
      label: 'Task',
      icon: <AddTaskRoundedIcon fontSize="small" />,
      onClick: () => navigate(ROUTES.TASKS_NEW),
      accent: theme.palette.secondary.main,
    },
  ];

  const quickLinks = [
    { label: 'Orders', icon: <AssignmentRoundedIcon fontSize="small" />, path: '/allOrder' },
    { label: 'Business', icon: <StoreRoundedIcon fontSize="small" />, path: ROUTES.BUSINESS_CONTROL },
    { label: 'WhatsApp', icon: <ChatRoundedIcon fontSize="small" />, path: ROUTES.WHATSAPP },
    { label: 'Reports', icon: <AssessmentRoundedIcon fontSize="small" />, path: '/allTransaction' },
    { label: 'Attendance', icon: <PeopleRoundedIcon fontSize="small" />, path: ROUTES.ATTENDANCE },
    { label: 'Dispatch', icon: <LocalShippingRoundedIcon fontSize="small" />, path: ROUTES.DISPATCH_QUEUE },
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
        overflow: 'hidden',
      }}
    >
      {/* Spacer for fixed navbar */}
      <Box sx={{ height: NAVBAR_HEIGHT, flexShrink: 0 }} />

      {/* ── Quick Actions (fixed top) ── */}
      <Box sx={{ px: 0.75, pt: 1, pb: 0.5, flexShrink: 0 }}>
        <SectionLabel>Actions</SectionLabel>
        <Stack spacing={0.25}>
          {quickActions.map((a) => (
            <RailItem key={a.label} icon={a.icon} label={a.label} onClick={a.onClick} accent={a.accent} />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mx: 1 }} />

      {/* ── Quick Links (scrollable middle) ── */}
      <Box sx={{ px: 0.75, py: 0.5, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <SectionLabel>Links</SectionLabel>
        <Stack spacing={0.25}>
          {quickLinks.map((l) => (
            <RailItem
              key={l.label}
              icon={l.icon}
              label={l.label}
              onClick={() => navigate(l.path)}
              selected={isSelected(l.path)}
              accent={theme.palette.primary.main}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mx: 1 }} />

      {/* ── Customize (pinned bottom) ── */}
      <Box sx={{ px: 0.75, py: 0.75, flexShrink: 0 }}>
        <RailItem
          icon={<DashboardCustomizeRoundedIcon fontSize="small" />}
          label="Customize"
          onClick={onCustomize}
          accent={theme.palette.primary.main}
        />
      </Box>
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
