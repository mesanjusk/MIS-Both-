import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography,
} from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookIcon from '@mui/icons-material/Facebook';
import YouTubeIcon from '@mui/icons-material/YouTube';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import MusicNoteRoundedIcon from '@mui/icons-material/MusicNoteRounded';
import toast from 'react-hot-toast';
import { listAccounts, validateAccount, disconnectAccount, getConnectUrl } from '../services/socialMediaService';

const PLATFORM_META = {
  instagram: { label: 'Instagram', icon: InstagramIcon, provider: 'meta', color: '#C13584' },
  facebook: { label: 'Facebook', icon: FacebookIcon, provider: 'meta', color: '#1877F2' },
  youtube: { label: 'YouTube', icon: YouTubeIcon, provider: 'youtube', color: '#FF0000' },
  linkedin: { label: 'LinkedIn', icon: LinkedInIcon, provider: 'linkedin', color: '#0A66C2' },
  tiktok: { label: 'TikTok', icon: MusicNoteRoundedIcon, provider: 'tiktok', color: '#000000' },
};

const STATUS_META = {
  NOT_CONFIGURED: { label: 'Developer credentials not configured', color: 'default' },
  CONNECTED: { label: 'Connected', color: 'success' },
  PERMISSION_REQUIRED: { label: 'Permission required', color: 'warning' },
  RECONNECT_REQUIRED: { label: 'Reconnect required', color: 'error' },
  DISCONNECTED: { label: 'Not connected', color: 'default' },
  ERROR: { label: 'Error', color: 'error' },
};

function AccountCard({ platform, accounts, onChanged }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  const [busyId, setBusyId] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const authUrl = await getConnectUrl(meta.provider);
      window.location.href = authUrl;
    } catch (err) {
      toast.error(err?.response?.data?.message || `Failed to start ${meta.label} connection`);
      setConnecting(false);
    }
  };

  const handleValidate = async (id) => {
    setBusyId(id);
    try {
      const result = await validateAccount(id);
      if (result.connected) toast.success('Connection verified');
      else toast.error(result.message || 'Connection check failed');
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Test connection failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (id) => {
    setBusyId(id);
    try {
      await disconnectAccount(id);
      toast.success(`${meta.label} disconnected`);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Disconnect failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Avatar sx={{ bgcolor: meta.color, width: 36, height: 36 }}><Icon sx={{ fontSize: 20 }} /></Avatar>
          <Typography variant="subtitle1" fontWeight={800}>{meta.label}</Typography>
        </Stack>

        {!accounts.length ? (
          <Stack spacing={1}>
            <Chip size="small" label={STATUS_META.DISCONNECTED.label} sx={{ alignSelf: 'flex-start' }} />
            <Button variant="contained" size="small" startIcon={<LinkRoundedIcon />} onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Redirecting…' : 'Connect'}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {accounts.map((a) => {
              const status = STATUS_META[a.status] || STATUS_META.ERROR;
              return (
                <Box key={a._id} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
                  <Typography variant="body2" fontWeight={700} noWrap>{a.name}</Typography>
                  {a.username && <Typography variant="caption" color="text.secondary">@{a.username}</Typography>}
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, mb: 0.75 }}>
                    <Chip size="small" label={status.label} color={status.color} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Connected {a.connectedAt ? new Date(a.connectedAt).toLocaleDateString('en-IN') : '-'}
                    {a.lastValidatedAt ? ` · Last checked ${new Date(a.lastValidatedAt).toLocaleString('en-IN')}` : ''}
                  </Typography>
                  {a.lastError && (
                    <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.25 }}>{a.lastError}</Typography>
                  )}
                  {a.metadata?.auditNote && (
                    <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.25 }}>{a.metadata.auditNote}</Typography>
                  )}
                  {a.metadata?.apiProjectVerificationNote && (
                    <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.25 }}>{a.metadata.apiProjectVerificationNote}</Typography>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="outlined" disabled={busyId === a._id} onClick={() => handleValidate(a._id)}>
                      {busyId === a._id ? <CircularProgress size={14} /> : 'Test Connection'}
                    </Button>
                    {status.label === 'Reconnect required' ? (
                      <Button size="small" variant="contained" onClick={handleConnect} disabled={connecting}>Reconnect</Button>
                    ) : (
                      <Button size="small" color="error" disabled={busyId === a._id} onClick={() => handleDisconnect(a._id)}>Disconnect</Button>
                    )}
                  </Stack>
                </Box>
              );
            })}
            <Button size="small" variant="text" startIcon={<LinkRoundedIcon />} onClick={handleConnect} disabled={connecting}>
              Connect another {meta.label} account
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function SocialAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await listAccounts();
      setAccounts(data);
    } catch {
      toast.error('Failed to load social accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <LinkRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>Social Accounts</Typography>
          <Typography variant="caption" color="text.secondary">
            Connect via each platform's official OAuth. Test Connection always makes a real API call — no fake checkmarks.
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        {Object.keys(PLATFORM_META).map((platform) => (
          <Grid item xs={12} sm={6} md={4} key={platform}>
            <AccountCard platform={platform} accounts={accounts.filter((a) => a.platform === platform)} onChanged={load} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
