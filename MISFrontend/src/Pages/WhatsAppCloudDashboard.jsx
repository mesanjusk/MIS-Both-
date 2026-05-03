import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { fetchWhatsAppStatus } from '../services/whatsappCloudService';
import { parseApiError } from '../utils/parseApiError';
import { ErrorState, FilterToolbar, LoadingSkeleton, SectionCard } from '../components/ui';

const MessagesPanel = lazy(() => import('../components/whatsappCloud/MessagesPanel'));
const SendMessagePanel = lazy(() => import('../components/whatsappCloud/SendMessagePanel'));
const BulkSender = lazy(() => import('../components/whatsappCloud/BulkSender'));
const AutoReplyManagementPanel = lazy(() => import('../components/whatsappCloud/AutoReplyManagementPanel'));
const AnalyticsDashboard = lazy(() => import('../components/whatsappCloud/AnalyticsDashboard'));
const WhatsAppAttendanceSettings = lazy(() => import('../components/whatsappCloud/WhatsAppAttendanceSettings'));

const navItems = [
  { key: 'inbox', label: 'Chats' },
  { key: 'templates', label: 'Templates' },
  { key: 'campaigns', label: 'Broadcast' },
  { key: 'autoReply', label: 'Auto Reply' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Settings' },
];

const getFriendlyStatusError = (error) => {
  const statusCode = error?.response?.status;
  if (statusCode === 401 || statusCode === 403) return 'Token expired. Please sign in again.';
  if (!error?.response) return 'Network issue. Please check your internet connection.';
  if (statusCode >= 500) return 'Server error while checking WhatsApp status.';
  return parseApiError(error, 'Unable to check WhatsApp status right now.');
};

export default function WhatsAppCloudDashboard() {
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [activeTab, setActiveTab] = useState('inbox');
  const [search, setSearch] = useState('');
  const [connectionState, setConnectionState] = useState('loading');
  const [connectionStatus, setConnectionStatus] = useState('Checking...');
  const [statusError, setStatusError] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    let active = true;

    const refreshConnectionStatus = async () => {
      if (!active) return;

      setConnectionState((prev) => (prev === 'connected' || prev === 'disconnected' ? prev : 'loading'));
      setStatusError('');

      try {
        const res = await fetchWhatsAppStatus();
        const data = res?.data;
        const isConnected = data?.status === 'connected' || (Array.isArray(data?.data) && data.data.some((acc) => acc?.status === 'connected'));

        if (!active) return;
        setConnectionState(isConnected ? 'connected' : 'disconnected');
        setConnectionStatus(isConnected ? 'Connected' : 'Disconnected');
      } catch (error) {
        if (!active) return;
        setConnectionState('error');
        setConnectionStatus('Unavailable');
        setStatusError(getFriendlyStatusError(error));
      } finally {
        if (active) setLastCheckedAt(new Date());
      }
    };

    refreshConnectionStatus();
    const interval = setInterval(refreshConnectionStatus, 12000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [statusTick]);

  const renderSection = useMemo(() => {
    if (activeTab === 'inbox') return <MessagesPanel search={search} />;
    if (activeTab === 'templates') return <SendMessagePanel />;
    if (activeTab === 'campaigns') return <BulkSender />;
    if (activeTab === 'autoReply') return <AutoReplyManagementPanel />;
    if (activeTab === 'analytics') return <AnalyticsDashboard />;
    return <WhatsAppAttendanceSettings />;
  }, [activeTab, search]);

  const connectionChipColor =
    connectionState === 'connected'
      ? 'success'
      : connectionState === 'loading'
        ? 'warning'
        : 'error';

  return (
    <Box sx={{ px: { xs: 0.5, md: 1 }, pb: { xs: 0.5, md: 0.75 } }}>
      <SectionCard
        contentSx={{
          p: 0,
          height: { xs: 'calc(100dvh - 8.3rem)', md: 'calc(100dvh - 7.4rem)' },
          minHeight: { xs: 520, md: 620 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: 1.5,
            bgcolor: '#111b21',
          }}
        >
          <Box
            sx={{
              width: 220,
              borderRight: '1px solid rgba(255,255,255,0.08)',
              bgcolor: '#111b21',
              color: '#e9edef',
              p: 1.5,
              display: { xs: 'none', md: 'block' },
            }}
          >
            <Typography variant="subtitle1" fontWeight={700} color="#e9edef">
              WhatsApp
            </Typography>
            <Typography variant="caption" color="rgba(233,237,239,0.72)">
              Web-style workspace
            </Typography>

            <Tabs
              orientation="vertical"
              variant="scrollable"
              value={activeTab}
              onChange={(_, value) => setActiveTab(value)}
              sx={{
                mt: 1.25,
                '& .MuiTabs-flexContainer': { gap: 0.75 },
                '& .MuiTabs-indicator': { left: 0, width: 3, borderRadius: 4, bgcolor: '#25d366' },
              }}
            >
              {navItems.map((item) => (
                <Tab
                  key={item.key}
                  value={item.key}
                  label={item.label}
                  disableRipple
                  sx={{
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    textAlign: 'left',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    px: 1.25,
                    py: 0.9,
                    borderRadius: 1.5,
                    minHeight: 38,
                    color: '#cfd4d8',
                    '&.Mui-selected': {
                      bgcolor: '#202c33',
                      color: '#25d366',
                    },
                  }}
                />
              ))}
            </Tabs>
          </Box>

          <Stack sx={{ minWidth: 0, flex: 1, bgcolor: '#f0f2f5' }}>
            <FilterToolbar>
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search or start new chat"
                size="small"
                sx={{ minWidth: { xs: '100%', sm: 320 }, flex: { md: 1 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                <Chip
                  color={connectionChipColor}
                  size="small"
                  label={
                    connectionState === 'loading' ? (
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <CircularProgress size={12} color="inherit" />
                        <span>WhatsApp {connectionStatus}</span>
                      </Stack>
                    ) : `WhatsApp ${connectionStatus}`
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  {lastCheckedAt
                    ? `Last checked ${lastCheckedAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}`
                    : 'Checking status...'}
                </Typography>
                <Button
                  size="small"
                  startIcon={<RefreshRoundedIcon fontSize="small" />}
                  onClick={() => setStatusTick((prev) => prev + 1)}
                >
                  Refresh
                </Button>
              </Stack>

              <Tabs
                value={activeTab}
                onChange={(_, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{
                  display: { xs: 'flex', md: 'none' },
                  minHeight: 34,
                  mt: 0.25,
                  '& .MuiTabs-indicator': { height: 2, borderRadius: 2, bgcolor: '#25d366' },
                  '& .MuiTab-root': {
                    minHeight: 34,
                    px: 1.25,
                    py: 0.5,
                    minWidth: 'fit-content',
                    borderRadius: 999,
                    border: '1px solid #d1d7db',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    mr: 0.75,
                  },
                  '& .MuiTab-root.Mui-selected': {
                    color: '#0f172a',
                    bgcolor: '#86efac',
                    borderColor: '#25d366',
                  },
                }}
              >
                {navItems.map((item) => (
                  <Tab key={item.key} label={item.label} value={item.key} disableRipple />
                ))}
              </Tabs>
            </FilterToolbar>

            {statusError ? <ErrorState message={statusError} /> : null}

            <Box sx={{ minHeight: 0, flex: 1, overflow: 'hidden' }}>
              <Suspense fallback={<LoadingSkeleton lines={isDesktop ? 9 : 7} />}>
                {renderSection}
              </Suspense>
            </Box>
          </Stack>
        </Box>
      </SectionCard>
    </Box>
  );
}