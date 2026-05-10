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

import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';

import { ROUTES } from '../constants/routes';

const NAVBAR_HEIGHT = 64;
const RIGHT_SIDEBAR_WIDTH = 80;

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

export default function RightSidebar({ onCustomize, openUpi }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();

  const isSelected = (path) =>
    Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

  const quickActions = [
    {
      label: 'Day Book',
      icon: <MenuBookRoundedIcon fontSize="small" />,
      onClick: () => navigate('/dayBook'),
      accent: theme.palette.primary.main,
    },
    {
      label: 'Send Email',
      icon: <EmailRoundedIcon fontSize="small" />,
      onClick: () => navigate('/sendEmail'),
      accent: theme.palette.success.main,
    },
    {
      label: 'UPI Payment',
      icon: <PaymentsRoundedIcon fontSize="small" />,
      onClick: openUpi,
      accent: theme.palette.warning.main,
    },
    {
      label: 'Transaction 4D',
      icon: <ReceiptLongRoundedIcon fontSize="small" />,
      onClick: () => navigate('/allTransaction4d'),
      accent: theme.palette.error.main,
    },
    {
      label: 'Attendance',
      icon: <PeopleRoundedIcon fontSize="small" />,
      onClick: () => navigate('/attendanceReport'),
      accent: theme.palette.secondary.main,
    },
  ];

  const quickLinks = [
    { label: 'Orders', icon: <AssignmentRoundedIcon fontSize="small" />, path: '/allOrder' },
    { label: 'Business', icon: <StoreRoundedIcon fontSize="small" />, path: ROUTES.BUSINESS_CONTROL },
    { label: 'Post Print', icon: <PrintRoundedIcon fontSize="small" />, path: ROUTES.POST_PRINTING_CONTROL },
    { label: 'Workflows', icon: <PrintRoundedIcon fontSize="small" />, path: ROUTES.WORKFLOW_TEMPLATES },
    { label: 'WhatsApp', icon: <ChatRoundedIcon fontSize="small" />, path: ROUTES.WHATSAPP },
    { label: 'Reports', icon: <AssessmentRoundedIcon fontSize="small" />, path: '/allTransaction' },
    { label: 'Attendance', icon: <PeopleRoundedIcon fontSize="small" />, path: ROUTES.ATTENDANCE },
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
      <Box sx={{ height: NAVBAR_HEIGHT, flexShrink: 0 }} />

      <Box sx={{ px: 0.75, pt: 1, pb: 0.5, flexShrink: 0 }}>
        <SectionLabel>Actions</SectionLabel>
        <Stack spacing={0.25}>
          {quickActions.map((a) => (
            <RailItem key={a.label} icon={a.icon} label={a.label} onClick={a.onClick} accent={a.accent} />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mx: 1 }} />

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
  onCustomize: PropTypes.func,
  openUpi: PropTypes.func,
};
