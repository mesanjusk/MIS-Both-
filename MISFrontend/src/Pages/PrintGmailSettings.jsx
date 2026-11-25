import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Chip, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import api from '../apiClient';

const base = '/api/gmail/print-sent/accounts';
const formatRecipients = (recipients) => (recipients || []).map(({ email, name }) => name ? `${email} | ${name}` : email).join('\n');
const parseRecipients = (input) => input.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
  const [email, ...name] = line.split('|');
  return { email: email.trim(), name: name.join('|').trim() };
});

function GmailAccountSettings({ account, onChange }) {
  const [input, setInput] = useState(() => formatRecipients(account.printRecipients));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const saved = formatRecipients(account.printRecipients);
  const update = async (action, label) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onChange();
      setMessage({ severity: 'success', label });
    } catch (error) {
      setMessage({ severity: 'error', label: error.response?.data?.message || 'Could not update this account.' });
    } finally { setBusy(false); }
  };
  const status = account.printSentEnabled ? 'Enabled' : 'Paused';
  return <Paper variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1}>
    <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
      <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{account.email}</Typography>
      <Chip label={status} size="small" />
    </Stack>
    {account.printSentError && <Alert severity="warning">{account.printSentError}</Alert>}
    {message && <Alert severity={message.severity}>{message.label}</Alert>}
    <TextField size="small" multiline minRows={2} maxRows={6} label="Recipient display names (optional)" value={input}
      placeholder="printer@example.com | ABC Printing" helperText="One email and display name per line, separated by |."
      onChange={(event) => setInput(event.target.value)} inputProps={{ maxLength: 10000 }} />
    <Stack direction="row" flexWrap="wrap" gap={0.5}>
      <Button size="small" variant="contained" disabled={busy || saved === input} onClick={() => update(
        () => api.patch(`${base}/${account._id}`, { recipients: parseRecipients(input) }), 'Recipient display names saved.',
      )}>Save display names</Button>
      <Button size="small" disabled={busy || !account.printSentEnabled} onClick={() => update(
        () => api.post(`${base}/${account._id}/sync`), 'Sync requested. Check Print Sent in a moment.',
      )}>Sync now</Button>
      <Button size="small" disabled={busy} onClick={() => update(
        () => api.patch(`${base}/${account._id}`, { enabled: !account.printSentEnabled }), account.printSentEnabled ? 'Sync paused.' : 'Sync resumed.',
      )}>{account.printSentEnabled ? 'Pause sync' : 'Resume sync'}</Button>
    </Stack>
    <Typography variant="caption" color="text.secondary">{account.printSentLastSync ? `Last sync ${new Date(account.printSentLastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'Waiting for first sync'}</Typography>
    {account.printSentEnabled && account.printSentHistoryComplete !== true &&
      <Typography variant="caption" color="text.secondary">Importing older sent emails</Typography>}
  </Stack></Paper>;
}

export default function PrintGmailSettings({ connectionResult }) {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const load = useCallback(async () => {
    const { data } = await api.get(base, { cache: false });
    setAccounts(data.result || []);
  }, []);
  useEffect(() => { load().catch(() => setError('Could not load Gmail settings.')); }, [load]);
  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { data } = await api.post(`${base}/connect`);
      window.location.assign(data.authUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start Gmail connection.');
      setConnecting(false);
    }
  };

  return <Stack spacing={1.25} sx={{ maxWidth: 720 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Typography variant="h6" fontWeight={800}>Gmail for Print Sent</Typography>
      <Button size="small" variant="contained" disabled={connecting} onClick={connect}>Add or reconnect Gmail</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">Print Sent keeps pending attachments visible until they are marked received. Connect the Gmail you use for print jobs. Pause old accounts after switching Gmail.</Typography>
    {connectionResult === 'connected' && <Alert severity="success">Gmail connected. Sent emails will sync automatically.</Alert>}
    {connectionResult === 'cancelled' && <Alert severity="info">Gmail connection cancelled.</Alert>}
    {connectionResult === 'error' && <Alert severity="error">Gmail connection failed. Try reconnecting and allow read access when Google asks.</Alert>}
    {error && <Alert severity="error" action={<Button size="small" onClick={() => { setError(''); load().catch(() => setError('Could not load Gmail settings.')); }}>Retry</Button>}>{error}</Alert>}
    {!accounts && !error && <LinearProgress />}
    {accounts?.map((account) => <GmailAccountSettings key={account._id} account={account} onChange={load} />)}
  </Stack>;
}
