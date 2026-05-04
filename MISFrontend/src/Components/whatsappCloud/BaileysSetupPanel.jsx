import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import LinkIcon     from '@mui/icons-material/Link';
import LinkOffIcon  from '@mui/icons-material/LinkOff';
import RefreshIcon  from '@mui/icons-material/Refresh';
import {
  baileysGetStatus,
  baileysConnect,
  baileysDisconnect,
} from '../../services/whatsappCloudService';

const STATUS_COLORS = {
  CONNECTED:    'success',
  QR_PENDING:   'warning',
  DISCONNECTED: 'default',
};

export default function BaileysSetupPanel() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const pollRef               = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await baileysGetStatus();
      setStatus(res.data);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to fetch Baileys status');
    }
  }, []);

  // Poll every 4 s while QR is pending, 15 s otherwise
  useEffect(() => {
    fetchStatus();
    const interval = status?.status === 'QR_PENDING' ? 4000 : 15000;
    pollRef.current = setInterval(fetchStatus, interval);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus, status?.status]);

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      await baileysConnect();
      await fetchStatus();
    } catch (err) {
      setError(err?.response?.data?.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError('');
    try {
      await baileysDisconnect();
      await fetchStatus();
    } catch (err) {
      setError(err?.response?.data?.message || 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  const isConnected  = status?.status === 'CONNECTED';
  const isQrPending  = status?.status === 'QR_PENDING';

  return (
    <Box>
      <Stack spacing={2}>
        {/* Status chip */}
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            Baileys (WhatsApp Web) Status
          </Typography>
          <Chip
            label={status?.status || 'Loading…'}
            color={STATUS_COLORS[status?.status] || 'default'}
            size="small"
          />
          {status?.phone && (
            <Typography variant="body2" color="text.secondary">
              +{status.phone}
            </Typography>
          )}
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {/* QR Code */}
        {isQrPending && status?.qr && (
          <Box>
            <Alert severity="info" sx={{ mb: 1 }}>
              Open WhatsApp → Linked Devices → Link a Device → scan this QR code
            </Alert>
            <Box
              component="img"
              src={status.qr}
              alt="WhatsApp QR Code"
              sx={{ width: 240, height: 240, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            />
          </Box>
        )}

        {isConnected && (
          <Alert severity="success">
            Baileys is connected. WhatsApp Web messages will use this number (+{status.phone}).
          </Alert>
        )}

        {!isConnected && !isQrPending && (
          <Alert severity="warning">
            Baileys is disconnected. Click <strong>Connect</strong> to generate a QR code.
          </Alert>
        )}

        <Divider />

        {/* Action buttons */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {!isConnected && (
            <Button
              variant="contained"
              color="success"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
              onClick={handleConnect}
              disabled={loading}
            >
              {isQrPending ? 'Regenerate QR' : 'Connect'}
            </Button>
          )}
          {isConnected && (
            <Button
              variant="outlined"
              color="error"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <LinkOffIcon />}
              onClick={handleDisconnect}
              disabled={loading}
            >
              Disconnect
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchStatus}
            disabled={loading}
          >
            Refresh Status
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
