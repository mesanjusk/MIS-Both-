import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { fetchWhatsAppStatus } from '../services/whatsappCloudService';
import { LoadingSkeleton } from '../Components/ui';

const MessagesPanel = lazy(() => import('../Components/whatsappCloud/MessagesPanel'));

/**
 * Home → Inbox tab.
 *
 * A WhatsApp Web-style inbox embedded directly on the home page: browse the
 * conversations connected through the WhatsApp account, open a chat and reply
 * with text or media, all without leaving /home.
 */
export default function HomeInbox() {
  const [connectionState, setConnectionState] = useState('loading');
  const [connectionStatus, setConnectionStatus] = useState('Checking…');

  useEffect(() => {
    let active = true;

    const refreshConnectionStatus = async () => {
      try {
        const res = await fetchWhatsAppStatus();
        const data = res?.data;
        const isConnected =
          data?.status === 'connected' ||
          (Array.isArray(data?.data) && data.data.some((acc) => acc?.status === 'connected'));

        if (!active) return;
        setConnectionState(isConnected ? 'connected' : 'disconnected');
        setConnectionStatus(isConnected ? 'Connected' : 'Disconnected');
      } catch {
        if (!active) return;
        setConnectionState('error');
        setConnectionStatus('Unavailable');
      }
    };

    refreshConnectionStatus();
    const interval = setInterval(refreshConnectionStatus, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const chipColor =
    connectionState === 'connected'
      ? 'success'
      : connectionState === 'loading'
        ? 'warning'
        : 'error';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <WhatsAppIcon sx={{ color: '#25d366' }} />
          <Typography variant="subtitle1" fontWeight={800}>
            Inbox
          </Typography>
        </Stack>
        <Chip
          size="small"
          color={chipColor}
          label={
            connectionState === 'loading' ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CircularProgress size={12} color="inherit" />
                <span>WhatsApp {connectionStatus}</span>
              </Stack>
            ) : (
              `WhatsApp ${connectionStatus}`
            )
          }
        />
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: { xs: 480, md: 560 },
          height: { xs: 'calc(100dvh - 15rem)', md: 'calc(100dvh - 13rem)' },
          overflow: 'hidden',
        }}
      >
        <Suspense fallback={<LoadingSkeleton lines={8} />}>
          <MessagesPanel />
        </Suspense>
      </Box>
    </Box>
  );
}
