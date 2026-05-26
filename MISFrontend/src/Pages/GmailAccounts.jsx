import { useEffect, useState, useCallback } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, IconButton, Paper,
  Stack, Tooltip, Typography,
} from '@mui/material';
import AddRoundedIcon      from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon   from '@mui/icons-material/DeleteRounded';
import EmailRoundedIcon    from '@mui/icons-material/EmailRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon  from '@mui/icons-material/CheckCircleRounded';
import toast from 'react-hot-toast';
import { getGmailAccounts, getGmailAuthUrl, getGmailStats, disconnectAccount } from '../services/gmailService';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const pct = (sent, limit) => Math.min(100, Math.round((sent / (limit || 499)) * 100));

export default function GmailAccounts() {
  const [accounts, setAccounts]       = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [connecting, setConnecting]   = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [accRes, statRes] = await Promise.all([getGmailAccounts(), getGmailStats()]);
      setAccounts(Array.isArray(accRes?.result) ? accRes.result : []);
      setStats(statRes?.result || null);
    } catch {
      toast.error('Failed to load Gmail accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Check for ?connected=1 after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      toast.success('Gmail account connected!');
      window.history.replaceState({}, '', window.location.pathname);
      load();
    }
    if (params.get('error')) {
      toast.error(`Connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const handleAddAccount = async () => {
    setConnecting(true);
    try {
      const res = await getGmailAuthUrl();
      if (res?.authUrl) window.location.href = res.authUrl;
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to start Gmail connection');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId, email) => {
    if (!window.confirm(`Disconnect ${email}?`)) return;
    try {
      await disconnectAccount(accountId);
      toast.success('Account disconnected');
      load();
    } catch {
      toast.error('Failed to disconnect account');
    }
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <EmailRoundedIcon color="primary" />
          <Typography variant="h5" fontWeight={900}>Gmail Accounts</Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={connecting ? <CircularProgress size={16} color="inherit" /> : <AddRoundedIcon />}
          onClick={handleAddAccount}
          disabled={connecting}
        >
          Add Gmail Account
        </Button>
      </Stack>

      {/* Stats strip */}
      {stats && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, flex: 1, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={900} color="primary">{stats.todaySent}</Typography>
            <Typography variant="caption" color="text.secondary">Emails sent today</Typography>
          </Paper>
          <Paper
            variant="outlined"
            sx={{ p: 1.5, borderRadius: 3, flex: 1, textAlign: 'center', borderColor: stats.pendingPricing > 0 ? 'warning.main' : undefined }}
          >
            <Typography variant="h4" fontWeight={900} color={stats.pendingPricing > 0 ? 'warning.main' : 'text.primary'}>
              {stats.pendingPricing}
            </Typography>
            <Typography variant="caption" color="text.secondary">Draft POs needing pricing</Typography>
            {stats.pendingPricing > 0 && (
              <Box>
                <Button size="small" onClick={() => navigate(ROUTES.PURCHASE_ORDERS)} sx={{ mt: 0.5 }}>
                  Update POs →
                </Button>
              </Box>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, flex: 1, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={900}>{accounts.filter((a) => a.isActive && a.isConnected).length}</Typography>
            <Typography variant="caption" color="text.secondary">Active accounts</Typography>
          </Paper>
        </Stack>
      )}

      {/* Setup instructions */}
      {accounts.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2, borderColor: 'info.light', bgcolor: 'info.50' }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>Before adding an account</Typography>
          <Typography variant="body2" color="text.secondary" component="ol" sx={{ pl: 2 }}>
            <li>Open Google Cloud Console → Credentials → your OAuth 2.0 client</li>
            <li>Add this redirect URI: <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
              {window.location.origin.includes('localhost')
                ? 'http://localhost:5000/api/gmail/callback'
                : 'https://mis-both.onrender.com/api/gmail/callback'}
            </code></li>
            <li>Enable the Gmail API in your Google Cloud project</li>
            <li>Set <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>GMAIL_REDIRECT_URI</code> in your Render backend env vars</li>
            <li>Then click "Add Gmail Account" above</li>
          </Typography>
        </Paper>
      )}

      {/* Account cards */}
      <Stack spacing={2}>
        {accounts.map((acc) => {
          const used    = acc.dailySentCount || 0;
          const limit   = acc.dailyLimit || 499;
          const percent = pct(used, limit);
          const near    = percent >= 80;

          return (
            <Paper key={acc.accountId} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <EmailRoundedIcon color={acc.isConnected ? 'success' : 'error'} />
                  <Box>
                    <Typography fontWeight={700}>{acc.email}</Typography>
                    {acc.displayName && <Typography variant="caption" color="text.secondary">{acc.displayName}</Typography>}
                  </Box>
                  <Chip
                    size="small"
                    icon={acc.isConnected ? <CheckCircleRoundedIcon /> : <WarningAmberRoundedIcon />}
                    label={acc.isConnected ? 'Connected' : 'Disconnected'}
                    color={acc.isConnected ? 'success' : 'error'}
                    variant="outlined"
                  />
                </Stack>

                <Stack direction="row" alignItems="center" spacing={2}>
                  {/* Daily quota bar */}
                  <Box sx={{ minWidth: 140 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color={near ? 'warning.main' : 'text.secondary'}>
                        {near && '⚠ '}{used} / {limit} sent today
                      </Typography>
                    </Stack>
                    <Box sx={{ height: 6, bgcolor: 'grey.200', borderRadius: 3, mt: 0.5, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${percent}%`, bgcolor: near ? 'warning.main' : 'success.main', borderRadius: 3, transition: 'width .3s' }} />
                    </Box>
                  </Box>

                  <Tooltip title="Disconnect account">
                    <IconButton size="small" color="error" onClick={() => handleDisconnect(acc.accountId, acc.email)}>
                      <DeleteRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              {acc.lastError && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" color="error">Last error: {acc.lastError}</Typography>
                </>
              )}
            </Paper>
          );
        })}
      </Stack>

      {accounts.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          The system auto-selects the account with available quota when sending. You can override per-send.
        </Typography>
      )}
    </Box>
  );
}
