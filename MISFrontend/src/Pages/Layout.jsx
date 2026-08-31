import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import PageToggleGuard from '../Components/PageToggleGuard';
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
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import Sidebar from '../Components/Sidebar';
import TopNavbar from '../Components/TopNavbar';
import Footer from '../Components/Footer';
import FloatingButtons from '../Components/FloatingButtons';
import RightSidebar from '../Components/RightSidebar';
import CustomizeDialog from '../Components/CustomizeDialog';
import axios, { getApiBase } from '../apiClient';
import { ROUTES } from '../constants/routes';
import { useSidebarVisibility } from '../hooks/useNavCustomize';
import { itemsForSection } from '../constants/sidebarMenu';
import { visibleSectionItems } from '../constants/navVisibility';
import { normalizeRoleKey } from '../constants/roles';
import { useAuth } from '../context/AuthContext';
import { usePageToggles } from '../hooks/usePageToggles';
import { useModuleConfig } from '../hooks/useModuleConfig';

const LEFT_SIDEBAR_WIDTH = 66;
const RIGHT_SIDEBAR_WIDTH = 66;
const NAVBAR_HEIGHT = 52;

export const DashboardCustomizeCtx = createContext(null);
export const useDashboardCustomize = () => useContext(DashboardCustomizeCtx);

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leftSidebarEnabled, rightSidebarEnabled } = useSidebarVisibility();
  const leftOffset = leftSidebarEnabled ? LEFT_SIDEBAR_WIDTH : 0;
  const rightOffset = rightSidebarEnabled ? RIGHT_SIDEBAR_WIDTH : 0;
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

  // ── Mobile bottom navigation ────────────────────────────────────────────
  //
  // Built from the same PRIMARY_NAV sections as the desktop headings, and
  // filtered through the same visibility rule. It previously hard-coded five
  // destinations with no role check at all, so a member of staff saw a
  // "Business" tab leading to a screen they were not allowed to open.
  //
  // Five slots is the practical maximum for a bottom bar, so it carries the
  // five sections a phone user actually works in; the rest stay one tap away
  // in the menu.
  const MOBILE_SECTIONS = [
    { section: 'home', label: 'Home', icon: <HomeRoundedIcon />, path: ROUTES.HOME },
    { section: 'my-work', label: 'My Work', icon: <AssignmentRoundedIcon />, path: ROUTES.MY_TASKS },
    { section: 'orders', label: 'Orders', icon: <ReceiptLongRoundedIcon />, path: ROUTES.REPORTS_ORDERS_LIST },
    { section: 'money', label: 'Money', icon: <PaymentsRoundedIcon />, path: ROUTES.REPORTS_TRANSACTIONS },
    { section: 'communicate', label: 'Chat', icon: <ChatRoundedIcon />, path: ROUTES.WHATSAPP },
  ];

  const { permissions, userGroup } = useAuth();
  const { isPageDisabled } = usePageToggles();
  const moduleConfig = useModuleConfig();
  const roleKey = normalizeRoleKey(userGroup || localStorage.getItem('User_group') || '');
  const allowedGroups = useMemo(() => permissions?.sidebarGroups || [], [permissions]);

  const mobileTabs = useMemo(() => {
    const context = { roleKey, allowedGroups, isPageDisabled, moduleConfig };
    return MOBILE_SECTIONS.map((tab) => {
      const items = visibleSectionItems(itemsForSection(tab.section), context);
      if (!items.length) return null;
      // Land on the section's own default when the user may open it, otherwise
      // on the first entry they can actually reach.
      const target = items.some((item) => item.path === tab.path) ? tab.path : items[0].path;
      return { ...tab, path: target };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleKey, allowedGroups, isPageDisabled, moduleConfig]);

  const bottomNavValue = useMemo(() => {
    const { pathname } = location;
    // Longest path first, so /operations/me does not match a shorter sibling.
    const match = [...mobileTabs]
      .sort((a, b) => b.path.length - a.path.length)
      .find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`));
    if (match) return match.path;

    // Familiar aliases that do not share a prefix with their section's default.
    if (pathname.startsWith('/allOrder') || pathname.startsWith('/reports/orders')) {
      return mobileTabs.find((tab) => tab.section === 'orders')?.path ?? false;
    }
    if (pathname.startsWith('/whatsapp') || pathname.startsWith('/social')) {
      return mobileTabs.find((tab) => tab.section === 'communicate')?.path ?? false;
    }
    if (pathname.startsWith('/accounts') || pathname.startsWith('/allTransaction')) {
      return mobileTabs.find((tab) => tab.section === 'money')?.path ?? false;
    }
    // `false` leaves every tab unselected rather than lighting up the wrong one.
    return mobileTabs.find((tab) => tab.section === 'home')?.path ?? false;
  }, [location, mobileTabs]);

  return (
    <DashboardCustomizeCtx.Provider
      value={{
        customizeOpen, openCustomize, closeCustomize,
        upiOpen, openUpi, closeUpi,
      }}
    >
      <Box sx={{ height: '100dvh', bgcolor: 'background.default', display: 'flex', overflow: 'hidden' }}>

        {/* ── Left Sidebar (fixed 66px on desktop) ── */}
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
            mr: { lg: `${rightOffset}px` },
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
              left: { xs: 0, md: `${leftOffset}px` },
              right: { xs: 0, lg: `${rightOffset}px` },
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
              display: 'flex',
              flexDirection: 'column',
              pt: `${NAVBAR_HEIGHT}px`,
              pb: { xs: '72px', md: 0 },
              scrollBehavior: 'smooth',
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0, maxWidth: 1700, mx: 'auto', width: '100%', px: { xs: 0.65, md: 1 } }}>
              {/* A switched-off page renders its notice here, inside the
                  navigation, so the user can go somewhere else rather than
                  reaching for the back button. */}
              <PageToggleGuard>
                <Outlet />
              </PageToggleGuard>
            </Box>
          </Box>

          {/* Footer outside the scrollable main Box */}
          <Footer />

          {/* Floating speed-dial (repositioned left of right sidebar on desktop) */}
          <FloatingButtons buttonsList={buttonsList} />
        </Box>

        {/* ── Right Sidebar (fixed 66px on lg+) ── */}
        <RightSidebar
          onNewOrderClick={handleNewOrderClick}
          openUpi={openUpi}
        />

        {/* ── Customize navigation dialog ── */}
        <CustomizeDialog open={customizeOpen} onClose={closeCustomize} />

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
        {leftSidebarEnabled && (
          <Fab
            aria-label="open menu"
            onClick={() => setMobileOpen(true)}
            size="small"
            sx={(t) => ({
              position: 'fixed',
              left: 12,
              bottom: 82,
              display: { xs: 'flex', md: 'none' },
              zIndex: 1199,
              bgcolor: 'background.paper',
              color: t.palette.primary.main,
              border: `1.5px solid ${alpha(t.palette.primary.main, 0.3)}`,
              boxShadow: `0 4px 14px ${alpha(t.palette.primary.main, 0.18)}`,
              '&:hover': {
                bgcolor: alpha(t.palette.primary.main, 0.06),
              },
            })}
          >
            <AddIcon fontSize="small" />
          </Fab>
        )}

        {/* ── Mobile: Bottom navigation ── */}
        <Paper
          elevation={0}
          sx={(t) => ({
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            display: { xs: 'block', md: 'none' },
            zIndex: 1200,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            borderTop: `1px solid ${alpha(t.palette.primary.main, 0.12)}`,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
          })}
        >
          <BottomNavigation
            showLabels
            value={bottomNavValue}
            onChange={(_, next) => navigate(next)}
            sx={(t) => ({
              height: 64,
              bgcolor: 'transparent',
              px: 0.5,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 0,
                px: 0.25,
                py: 0.75,
                borderRadius: 2,
                transition: 'all 0.2s ease',
                color: t.palette.text.secondary,
                '& .MuiBottomNavigationAction-label': {
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  transition: 'font-size 0.2s',
                  '&.Mui-selected': {
                    fontSize: '0.68rem',
                  },
                },
              },
              '& .Mui-selected': {
                color: `${t.palette.primary.main} !important`,
              },
            })}
          >
            {mobileTabs.map((tab) => (
              <BottomNavigationAction
                key={tab.section}
                label={tab.label}
                value={tab.path}
                icon={tab.icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      </Box>
    </DashboardCustomizeCtx.Provider>
  );
}
