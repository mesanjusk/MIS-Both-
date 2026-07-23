import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import {
  getWhatsAppActivityProviders,
  updateWhatsAppActivityProvider,
} from '../../services/whatsappCloudService';

const PROVIDER_CHIP = {
  official: { label: 'Official', color: 'success' },
  baileys: { label: 'Baileys', color: 'warning' },
};

export default function WhatsAppActivityRouting() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWhatsAppActivityProviders();
      setActivities(res.data?.activities || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load activity routing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleChange = async (activityKey, provider) => {
    setSavingKey(activityKey);
    try {
      const res = await updateWhatsAppActivityProvider(activityKey, provider);
      setActivities(res.data?.activities || []);
      setToast({ type: 'success', msg: `${activityKey.replaceAll('_', ' ')} routing updated.` });
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Failed to update routing.' });
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <CircularProgress size={22} />;

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>Activity Routing</Typography>
              <Typography color="text.secondary" fontSize={13}>
                Pin individual automated activities to Official (Meta Cloud API) or Baileys (WhatsApp Web),
                or leave on Inherit to follow the global API Provider switch.
              </Typography>
            </Box>

            <Divider />

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Stack spacing={1.25}>
              {activities.map((activity) => (
                <Box
                  key={activity.key}
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 1,
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                  }}
                >
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={700} fontSize={14}>{activity.label}</Typography>
                      <Chip
                        size="small"
                        label={PROVIDER_CHIP[activity.effectiveProvider]?.label || activity.effectiveProvider}
                        color={PROVIDER_CHIP[activity.effectiveProvider]?.color || 'default'}
                        sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" fontSize={12.5}>
                      {activity.description}
                    </Typography>
                  </Stack>

                  <Select
                    size="small"
                    value={activity.provider}
                    disabled={savingKey === activity.key}
                    onChange={(e) => handleChange(activity.key, e.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="inherit">Inherit (global)</MenuItem>
                    <MenuItem value="official">Official Meta API</MenuItem>
                    <MenuItem value="baileys">Baileys (WhatsApp Web)</MenuItem>
                  </Select>
                </Box>
              ))}
              {!activities.length && !error && (
                <Typography variant="body2" color="text.secondary">No activities found.</Typography>
              )}
            </Stack>
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
