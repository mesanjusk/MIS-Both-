import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import Sidebar from '../Components/Sidebar';
import TopNavbar from '../Components/TopNavbar';
import Footer from '../Components/Footer';
import FloatingButtons from '../Components/FloatingButtons';
import RightSidebar from '../Components/RightSidebar';
import axios, { getApiBase } from '../apiClient';
import { ROUTES } from '../constants/routes';

const LEFT_SIDEBAR_WIDTH = 240;
const RIGHT_SIDEBAR_WIDTH = 80;
const NAVBAR_HEIGHT = 64;

export const DashboardCustomizeCtx = createContext(null);
export const useDashboardCustomize = () => useContext(DashboardCustomizeCtx);

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [driveChecking, setDriveChecking] = useState(false);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState(null);

  /* Customize drawer — controlled here so right sidebar can trigger it */
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const openCustomize = useCallback(() => setCustomizeOpen(true), []);
  const closeCustomize = useCallback(() => setCustomizeOpen(false), []);

  /* UPI dialog — controlled here so SpeedDial can trigger it */
  const [upiOpen, setUpiOpen] = useState(false);
  const openUpi = useCallback(() => setUpiOpen(true), []);
  const closeUpi = useCallback(() => setUpiOpen(false), []);

  const openGoogleDriveReconnect = () => {
    const baseUrl = getApiBase() || window.location.origin;
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${baseUrl}/api/google-drive/connect?returnTo=${returnTo}`;
  };

  const handleNewOrderClick = useCallback(async () => {
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
  }, [navigate]);

  const buttonsList = useMemo(
    () => [
      { onClick: handleNewOrderClick, label: driveChecking ? 'Checking...' : 'New Order' },
      { onClick: () => navigate(ROUTES.RECEIPT), label: 'Receipt' },
      { onClick: () => navigate(ROUTES.PAYMENT), label: 'Payment' },
      { onClick: () => navigate(ROUTES.FOLLOWUPS), label: 'Followup' },
      { onClick: () => navigate(ROUTES.TASKS_NEW), label: 'Task' },
      { onClick: openUpi, label: 'Add UPI' },
    ],
    [navigate, driveChecking, handleNewOrderClick, openUpi],
  );

  const bottomNavValue = useMemo(() => {
    const { pathname } = location;
    if (pathname.startsWith('/allOrder') || pathname.startsWith('/reports/orders')) return '/allOrder';
    if (pathname.startsWith('/business-control')) return ROUTES.BUSINESS_CONTROL;
    if (pathname.startsWith('/whatsapp')) return ROUTES.WHATSAPP;
    if (
      pathname.startsWith('/reports') ||
      pathname.startsWith('/allTransaction') ||
      pathname.startsWith('/customerReport') ||
      pathname.startsWith('/paymentReport')
    )
      return '/reports';
    return ROUTES.HOME;
  }, [location]);

  return (
    <DashboardCustomizeCtx.Provider value={{ customizeOpen, openCustomize, closeCustomize, upiOpen, openUpi, closeUpi }}>
      <Box sx={{ height: '100dvh', bgcolor: 'background.default', display: 'flex', overflow: 'hidden' }}>

        {/* ── Left Sidebar (fixed 240px on desktop) ── */}
        <Sidebar
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onNewOrderClick={handleNewOrderClick}
        />

        {/* ── Middle column: Navbar + main content ── */}
        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            
            mr: { lg: `${RIGHT_SIDEBAR_WIDTH}px` },
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Fixed TopNavbar */}
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: { xs: 0, md: `${LEFT_SIDEBAR_WIDTH}px` },
              right: { xs: 0, lg: `${RIGHT_SIDEBAR_WIDTH}px` },
              zIndex: 1200,
            }}
          >
            <TopNavbar
              onToggleSidebar={() => setMobileOpen((prev) => !prev)}
            />
          </Box>

          {/* Scrollable main content */}
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

          {/* Floating speed-dial (repositioned left of right sidebar on desktop) */}
          <FloatingButtons buttonsList={buttonsList} />
        </Box>

        {/* ── Right Sidebar (fixed 240px on lg+) ── */}
        <RightSidebar
          onNewOrderClick={handleNewOrderClick}
          onCustomize={openCustomize}
        />

        {/* ── Google Drive reconnect dialog ── */}
        <Dialog open={driveDialogOpen} onClose={() => setDriveDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Google Drive reconnect required</DialogTitle>
          <DialogContent>
            <Stack spacing={1.2} sx={{ pt: 0.5 }}>
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                New order file copy is enabled, but Google Drive is not ready. Reconnect Google Drive before creating a
                new order.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {driveStatus?.message ||
                  'Google Drive token is missing, expired, revoked, or configuration is incomplete.'}
              </Typography>
              {!driveStatus?.templateFileIdConfigured && driveStatus?.automationEnabled ? (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  DRIVE_TEMPLATE_FILE_ID is missing in backend environment.
                </Alert>
              ) : null}
              {!driveStatus?.redirectUriConfigured && driveStatus?.automationEnabled ? (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  GOOGLE_REDIRECT_URI is missing in backend environment.
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDriveDialogOpen(false)}>Close</Button>
            <Button
              variant="contained"
              onClick={openGoogleDriveReconnect}
              disabled={!driveStatus?.redirectUriConfigured && driveStatus?.automationEnabled}
            >
              Reconnect Google Drive
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Mobile: FAB to open left sidebar ── */}
        <Fab
          color="primary"
          aria-label="open menu"
          onClick={() => setMobileOpen(true)}
          size="small"
          sx={{ position: 'fixed', left: 12, bottom: 78, display: { xs: 'flex', md: 'none' }, zIndex: 1199 }}
        >
          <AddIcon fontSize="small" />
        </Fab>

        {/* ── Mobile: Bottom navigation ── */}
        <Paper
          sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: { xs: 'block', md: 'none' }, zIndex: 1200 }}
          elevation={6}
        >
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
    </DashboardCustomizeCtx.Provider>
  );
}
