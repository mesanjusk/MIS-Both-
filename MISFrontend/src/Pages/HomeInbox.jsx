import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { fetchSanjuskInboxStatus } from '../services/sanjuskService';
import { sanjuskInboxService } from '../services/sanjuskInboxService';
import { LoadingSkeleton } from '../Components/ui';

const MessagesPanel = lazy(() => import('../Components/whatsappCloud/MessagesPanel'));

/**
 * Home → Inbox tab (fixed-height shell for independent pane scrolling).
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
        // The Inbox account is the SanjuSK WhatsApp account configured under
        // Admin → API — never the direct-Meta account. A valid status payload
        // (a phone number id / display number) means that account is live.
        const res = await fetchSanjuskInboxStatus();
        const data = res?.data?.data || res?.data || {};
        const number = data.displayPhoneNumber || data.phoneNumberId || '';
        const isConnected = Boolean(number) || data.status === 'connected';

        if (!active) return;
        setConnectionState(isConnected ? 'connected' : 'disconnected');
        setConnectionStatus(
          isConnected ? (number ? `Connected · ${number}` : 'Connected') : 'Disconnected',
        );
      } catch (err) {
        if (!active) return;
        // 409 = no SanjuSK key saved yet: tell the admin where to set it up.
        const notConfigured = err?.response?.status === 409;
        setConnectionState(notConfigured ? 'disconnected' : 'error');
        setConnectionStatus(notConfigured ? 'Not configured (Admin → API)' : 'Unavailable');
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
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
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Suspense fallback={<LoadingSkeleton lines={8} />}>
          <MessagesPanel service={sanjuskInboxService} showDetails={false} />
        </Suspense>
      </Box>
    </Box>
  );
}
