import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import CloudIcon        from '@mui/icons-material/Cloud';
import {
  getWhatsAppProvider,
  updateWhatsAppProvider,
} from '../../services/whatsappCloudService';

function ProviderCard({ value, current, saving, onSelect, icon, label, description, alertMsg, alertSeverity }) {
  const selected = current === value;
  return (
    <Box
      onClick={() => !saving && !selected && onSelect(value)}
      sx={{
        flex: 1,
        minWidth: { xs: '100%', sm: 220 },
        border: '2px solid',
        borderColor: selected
          ? (value === 'baileys' ? 'warning.main' : 'success.main')
          : 'divider',
        borderRadius: 3,
        p: 2.5,
        cursor: saving || selected ? 'default' : 'pointer',
        bgcolor: selected
          ? value === 'baileys' ? '#fff8e1' : '#e8f5e9'
          : 'background.paper',
        transition: 'all 0.2s',
        '&:hover': !selected && !saving
          ? {
              borderColor: value === 'baileys' ? 'warning.light' : 'success.light',
              bgcolor: value === 'baileys' ? '#fffde7' : '#f1f8e9',
            }
          : {},
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          {icon}
          <Typography fontWeight={700} fontSize={15}>{label}</Typography>
          {selected && (
            <Chip
              label="ACTIVE"
              size="small"
              color={value === 'baileys' ? 'warning' : 'success'}
              sx={{ ml: 'auto', height: 20, fontSize: 10, fontWeight: 700 }}
            />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" fontSize={13}>
          {description}
        </Typography>
        {selected && alertMsg && (
          <Alert severity={alertSeverity || 'info'} sx={{ py: 0.5, fontSize: 12 }}>
            {alertMsg}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}

export default function WhatsAppProviderSwitcher() {
  const [provider, setProvider] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWhatsAppProvider();
      setProvider(res.data?.provider || 'official');
    } catch {
      setProvider('official');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (value) => {
    setSaving(true);
    try {
      await updateWhatsAppProvider(value);
      setProvider(value);
      setToast({ type: 'success', msg: `Switched to ${value === 'baileys' ? 'Baileys (WhatsApp Web)' : 'Official Meta API'} ✅` });
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Failed to switch provider' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress size={22} />;

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>WhatsApp Provider</Typography>
              <Typography color="text.secondary" fontSize={13}>
                Choose which WhatsApp API to use for sending messages. Both providers keep separate message logs.
              </Typography>
            </Box>

            <Divider />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <ProviderCard
                value="official"
                current={provider}
                saving={saving}
                onSelect={handleSelect}
                icon={<CloudIcon color="success" />}
                label="Official Meta API"
                description="Uses Meta's WhatsApp Cloud API. Requires approved templates for outbound messages. Best for business-grade reliability."
                alertMsg="All outbound messages use the official Meta Cloud API number."
                alertSeverity="success"
              />
              <ProviderCard
                value="baileys"
                current={provider}
                saving={saving}
                onSelect={handleSelect}
                icon={<PhoneAndroidIcon color="warning" />}
                label="Baileys (WhatsApp Web)"
                description="Uses WhatsApp Web via QR scan. Can send free-form text messages anytime. Requires the number to stay scanned / active."
                alertMsg="Scan the QR code in the Baileys Setup tab to connect your WhatsApp Web number."
                alertSeverity="warning"
              />
            </Stack>

            {saving && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <Typography fontSize={13} color="text.secondary">Saving…</Typography>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert severity={toast.type} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
