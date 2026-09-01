import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Link,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

import {
  clearSanjuskKey,
  fetchSanjuskConfig,
  fetchSanjuskMessages,
  saveSanjuskConfig,
  sendSanjuskTestMessage,
  testSanjuskConnection,
} from '../services/sanjuskService';

/**
 * Admin → API: connect MIS to the SanjuSK WhatsApp API.
 *
 * MIS could already *receive* from SanjuSK — /webhook/metabsp has verified
 * the HMAC signature and fed messages into the inbound pipeline for a while —
 * but there was no way to see that from inside the product, no way to send
 * through SanjuSK, and nowhere to put the API key except an environment
 * variable only a deploy could change. This screen is those three things.
 *
 * The two directions are separated on purpose, because they fail
 * independently and for different reasons: outbound breaks when the key is
 * wrong, inbound breaks when the webhook destination or its secret is wrong.
 * A single "connected" light would hide half of that.
 *
 * The API key is written here and never read back — the server returns only a
 * prefix, enough to tell two keys apart and useless to anyone who sees the
 * screen over a shoulder.
 */

const CopyField = ({ label, value, helper }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="code"
          sx={{
            flex: 1,
            minWidth: 0,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontSize: '0.8125rem',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </Box>
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={copy} aria-label={`Copy ${label}`}>
            <ContentCopyRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {helper ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {helper}
        </Typography>
      ) : null}
    </Box>
  );
};

CopyField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  helper: PropTypes.node,
};

export default function ApiIntegration() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState(null);

  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('Test message from MIS.');
  const [sending, setSending] = useState(false);

  const [inbound, setInbound] = useState([]);
  const [inboundLoading, setInboundLoading] = useState(false);
  const [inboundError, setInboundError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSanjuskConfig();
      const result = res.data?.result || null;
      setConfig(result);
      setBaseUrl(result?.baseUrl || 'https://meta.sanjusk.in');
      setEnabled(Boolean(result?.enabled));
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || 'Could not load the API settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The public origin of this MIS backend is not something the browser can
  // know, so the URL is shown as a path with a placeholder host the admin
  // replaces. Guessing at the origin would produce a URL that looks right and
  // silently never receives anything.
  const webhookUrl = useMemo(
    () => `https://<your-mis-api-host>${config?.inboundWebhookPath || '/webhook/metabsp'}`,
    [config]
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveSanjuskConfig({
        baseUrl,
        // Blank means "leave the stored key alone" — the server treats it the
        // same way, so editing the URL never wipes the credential.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        enabled,
      });
      setConfig((prev) => ({ ...(prev || {}), ...(res.data?.result || {}) }));
      setApiKey('');
      setMessage({ severity: 'success', text: 'Saved.' });
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setConnection(null);
    setMessage(null);
    try {
      const res = await testSanjuskConnection();
      setConnection(res.data?.result || {});
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || 'The connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await clearSanjuskKey();
      setConfig((prev) => ({ ...(prev || {}), ...(res.data?.result || {}) }));
      setEnabled(false);
      setConnection(null);
      setMessage({ severity: 'success', text: 'The stored key has been removed and the integration turned off.' });
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || 'Could not remove the key.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setSending(true);
    setMessage(null);
    try {
      await sendSanjuskTestMessage({ phone: testPhone, text: testText });
      setMessage({ severity: 'success', text: `Sent to ${testPhone}.` });
    } catch (err) {
      const data = err?.response?.data || {};
      setMessage({
        severity: 'error',
        text:
          data.code === 'OUTSIDE_24H_WINDOW'
            ? 'That number has not messaged you in the last 24 hours, so WhatsApp only allows an approved template. This is working as intended, not a fault.'
            : data.message || 'Could not send.',
      });
    } finally {
      setSending(false);
    }
  };

  const loadInbound = async () => {
    setInboundLoading(true);
    setInboundError('');
    try {
      const res = await fetchSanjuskMessages({ direction: 'incoming', limit: 15 });
      setInbound(res.data?.result || []);
    } catch (err) {
      setInboundError(err?.response?.data?.message || 'Could not load recent messages.');
    } finally {
      setInboundLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          WhatsApp API
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Connect MIS to your SanjuSK account so it sends WhatsApp messages through the API you
          already own, and receives replies back into MIS.
        </Typography>
      </Stack>

      {message ? (
        <Alert severity={message.severity} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}

      <Grid container spacing={3}>
        {/* ── Outbound ─────────────────────────────────────────────────── */}
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
              <Typography variant="h6">Sending</Typography>
              <Chip
                size="small"
                label={config?.enabled ? 'On' : 'Off'}
                color={config?.enabled ? 'success' : 'default'}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              While this is off, MIS keeps sending through Meta directly, exactly as before.
              Turning it on routes outbound messages through SanjuSK instead; turning it off again
              restores the previous behaviour.
            </Typography>

            <Stack spacing={2.5}>
              <TextField
                label="API base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                fullWidth
                size="small"
                helperText="Your SanjuSK origin. Endpoints are appended as /api/v1/…"
              />

              <TextField
                label={config?.hasApiKey ? 'Replace API key' : 'API key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                fullWidth
                size="small"
                type="password"
                autoComplete="off"
                placeholder="mbsp_…"
                helperText={
                  config?.hasApiKey
                    ? `A key ending in the prefix ${config.keyPrefix}… is saved. Leave this blank to keep it.`
                    : 'Create one in SanjuSK under Developers → API keys. It is shown there only once.'
                }
              />

              <FormControlLabel
                control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                label="Send MIS messages through SanjuSK"
              />

              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="outlined" onClick={handleTest} disabled={testing || !config?.hasApiKey}>
                  {testing ? 'Testing…' : 'Test connection'}
                </Button>
                {config?.hasApiKey ? (
                  <Button color="error" onClick={handleClearKey} disabled={saving}>
                    Remove key
                  </Button>
                ) : null}
              </Stack>

              {connection ? (
                <Alert severity="success">
                  <AlertTitle>Connected</AlertTitle>
                  Sending from <strong>{connection.displayPhoneNumber || connection.phoneNumberId}</strong>
                  {connection.verifiedName ? ` (${connection.verifiedName})` : ''}
                  {connection.qualityRating ? ` · quality ${connection.qualityRating}` : ''}
                </Alert>
              ) : null}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Send a test message
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Free-form text only reaches someone who messaged you in the last 24 hours — outside
              that window WhatsApp requires an approved template.
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="To (with country code)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                size="small"
                fullWidth
                placeholder="919876543210"
              />
              <TextField
                label="Message"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
              <Box>
                <Button
                  variant="outlined"
                  onClick={handleSendTest}
                  disabled={sending || !testPhone.trim() || !config?.hasApiKey}
                >
                  {sending ? 'Sending…' : 'Send test'}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* ── Inbound ──────────────────────────────────────────────────── */}
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
              <Typography variant="h6">Receiving</Typography>
              <Chip
                size="small"
                label={config?.inboundSecretConfigured ? 'Secret set' : 'Secret missing'}
                color={config?.inboundSecretConfigured ? 'success' : 'warning'}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Incoming messages reach MIS by webhook, not by the API key above — the two are
              configured separately and fail separately.
            </Typography>

            <Stack spacing={2.5}>
              <CopyField
                label="Webhook URL to register in SanjuSK"
                value={webhookUrl}
                helper="Replace the host with this MIS backend's public address, then add it in SanjuSK under Developers → Webhook destinations."
              />

              {config?.inboundSecretConfigured ? (
                <Alert severity="success">
                  <code>METABSP_WEBHOOK_SECRET</code> is set on this server. MIS verifies the{' '}
                  <code>X-Metabsp-Signature-256</code> header on every delivery and rejects anything
                  that does not match.
                </Alert>
              ) : (
                <Alert severity="warning">
                  <AlertTitle>Inbound is not active</AlertTitle>
                  <code>METABSP_WEBHOOK_SECRET</code> is not set on this server, so every delivery is
                  rejected with 403. Copy the signing secret shown against the destination in
                  SanjuSK into that environment variable and restart.
                </Alert>
              )}

              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Recent inbound</Typography>
                  <Button
                    size="small"
                    startIcon={<RefreshRoundedIcon fontSize="small" />}
                    onClick={loadInbound}
                    disabled={inboundLoading || !config?.hasApiKey}
                  >
                    {inboundLoading ? 'Loading…' : 'Check'}
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Read from SanjuSK directly, so it shows what arrived there even if the webhook into
                  MIS is misconfigured — which is what makes it useful for telling the two apart.
                </Typography>

                {inboundError ? <Alert severity="error" sx={{ mb: 1 }}>{inboundError}</Alert> : null}

                {inbound.length ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>From</TableCell>
                          <TableCell>Message</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {inbound.map((row) => (
                          <TableRow key={row.id || `${row.from}-${row.timestamp}`}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.from}</TableCell>
                            <TableCell>{row.text || row.message || `(${row.type})`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {inboundLoading ? '' : 'Nothing loaded yet.'}
                  </Typography>
                )}
              </Box>

              <Typography variant="caption" color="text.secondary">
                Full reference:{' '}
                <Link href={`${baseUrl || 'https://meta.sanjusk.in'}/developer-docs`} target="_blank" rel="noopener">
                  SanjuSK developer docs
                </Link>
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
