import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TaskRoundedIcon from '@mui/icons-material/TaskRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import Sidebar from '../Components/Sidebar';
import TopNavbar from '../Components/TopNavbar';
import Footer from '../Components/Footer';
import FloatingButtons from '../Components/FloatingButtons';
import axios, { getApiBase } from '../apiClient';
import { ROUTES } from '../constants/routes';

const DRAWER_WIDTH = 286;
const DRAWER_COLLAPSED = 76;
const NAVBAR_HEIGHT = 64;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [driveChecking, setDriveChecking] = useState(false);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState(null);

  const openGoogleDriveReconnect = () => {
    const baseUrl = getApiBase() || window.location.origin;
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${baseUrl}/api/google-drive/connect?returnTo=${returnTo}`;
  };

  const handleNewOrderClick = async () => {
    try {
      setDriveChecking(true);
      const response = await axios.get('/api/google-drive/status', { params: { check: 1 } });
      const status = response?.data || {};
      setDriveStatus(status);

      const driveRequired = Boolean(status?.automationEnabled);
      const configMissing = !status?.templateFileIdConfigured || !status?.redirectUriConfigured;

      if (driveRequired && (!status?.connected || status?.reconnectRequired || configMissing)) {
        setDriveDialogOpen(true);
        return;
      }

      navigate(ROUTES.ORDERS_NEW);
    } catch (error) {
      setDriveStatus({
        connected: false,
        reconnectRequired: true,
        message: error?.response?.data?.message || error?.message || 'Unable to check Google Drive status.',
      });
      setDriveDialogOpen(true);
    } finally {
      setDriveChecking(false);
    }
  };

  const buttonsList = useMemo(
    () => [
      { onClick: handleNewOrderClick, label: driveChecking ? 'Checking...' : 'Order' },
      { onClick: () => navigate(ROUTES.RECEIPT), label: 'Receipt' },
      { onClick: () => navigate(ROUTES.PAYMENT), label: 'Payment' },
      { onClick: () => navigate(ROUTES.FOLLOWUPS), label: 'Followups' },
      { onClick: () => navigate(ROUTES.TASKS_NEW), label: 'Task' },
    ],
    [navigate, driveChecking],
  );

  const sidebarWidth = isDesktop ? (desktopCollapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH) : 0;

  const bottomNavValue = useMemo(() => {
    const { pathname } = location;
    if (pathname.startsWith('/allOrder') || pathname.startsWith('/reports/orders')) return '/allOrder';
    if (pathname.startsWith('/business-control')) return ROUTES.BUSINESS_CONTROL;
    if (pathname.startsWith('/whatsapp')) return ROUTES.WHATSAPP;
    if (pathname.startsWith('/reports') || pathname.startsWith('/allTransaction') || pathname.startsWith('/customerReport') || pathname.startsWith('/paymentReport')) return '/reports';
    return ROUTES.HOME;
  }, [location]);

  return (
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', display: 'flex', overflow: 'hidden' }}>
      <Sidebar
        desktopCollapsed={desktopCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onNewOrderClick={handleNewOrderClick}
      />

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          ml: { md: `${sidebarWidth}px` },
          transition: (theme) => theme.transitions.create('margin-left'),
          pr: { lg: 1.25 },
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: { xs: 0, md: `${sidebarWidth}px` },
            right: 0,
            zIndex: 1200,
            transition: (theme) => theme.transitions.create(['left']),
          }}
        >
          <TopNavbar
            onToggleSidebar={() => setMobileOpen((prev) => !prev)}
            onToggleDesktopCollapse={() => setDesktopCollapsed((prev) => !prev)}
            desktopCollapsed={desktopCollapsed}
          />
        </Box>

        <Box
          component="main"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            px: { xs: 0.65, md: 1 },
            pt: `${NAVBAR_HEIGHT + 10}px`,
            pb: { xs: 13, md: 1.5 },
            scrollBehavior: 'smooth',
          }}
        >
          <Box sx={{ maxWidth: 1700, mx: 'auto', minHeight: `calc(100dvh - ${NAVBAR_HEIGHT + 24}px)` }}>
            <Outlet />
          </Box>
          <Footer />
        </Box>

        <FloatingButtons buttonsList={buttonsList} />

        <Dialog open={driveDialogOpen} onClose={() => setDriveDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Google Drive reconnect required</DialogTitle>
          <DialogContent>
            <Stack spacing={1.2} sx={{ pt: 0.5 }}>
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                New order file copy is enabled, but Google Drive is not ready. Reconnect Google Drive before creating a new order.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {driveStatus?.message || 'Google Drive token is missing, expired, revoked, or configuration is incomplete.'}
              </Typography>
              {!driveStatus?.templateFileIdConfigured && driveStatus?.automationEnabled ? (
                <Alert severity="error" sx={{ borderRadius: 2 }}>DRIVE_TEMPLATE_FILE_ID is missing in backend environment.</Alert>
              ) : null}
              {!driveStatus?.redirectUriConfigured && driveStatus?.automationEnabled ? (
                <Alert severity="error" sx={{ borderRadius: 2 }}>GOOGLE_REDIRECT_URI is missing in backend environment.</Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDriveDialogOpen(false)}>Close</Button>
            <Button variant="contained" onClick={openGoogleDriveReconnect} disabled={!driveStatus?.redirectUriConfigured && driveStatus?.automationEnabled}>
              Reconnect Google Drive
            </Button>
          </DialogActions>
        </Dialog>
      </Box>

      <Fab
        color="primary"
        aria-label="open menu"
        onClick={() => setMobileOpen(true)}
        size="small"
        sx={{ position: 'fixed', left: 12, bottom: 78, display: { xs: 'flex', md: 'none' }, zIndex: 1199 }}
      >
        <AddIcon fontSize="small" />
      </Fab>

      <Paper sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: { xs: 'block', md: 'none' }, zIndex: 1200 }} elevation={6}>
        <BottomNavigation
          showLabels
          value={bottomNavValue}
          onChange={(_, next) => {
            if (next === '/reports') {
              navigate('/allTransaction');
            } else {
              navigate(next);
            }
          }}
        >
          <BottomNavigationAction label="Home" value={ROUTES.HOME} icon={<HomeRoundedIcon />} />
          <BottomNavigationAction label="Orders" value="/allOrder" icon={<AssignmentRoundedIcon />} />
          <BottomNavigationAction label="Business" value={ROUTES.BUSINESS_CONTROL} icon={<StoreRoundedIcon />} />
          <BottomNavigationAction label="WhatsApp" value={ROUTES.WHATSAPP} icon={<ChatRoundedIcon />} />
          <BottomNavigationAction label="Reports" value="/reports" icon={<AssessmentRoundedIcon />} />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
