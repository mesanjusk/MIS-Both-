import { useEffect, useState } from 'react';
import { Alert, Button, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import api from '../apiClient';

const endpoint = '/api/gmail/print-sent/recipients';
const pageSize = 25;

function RecipientAlias({ recipient, onSave }) {
  const [input, setInput] = useState(recipient.alias);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    if (saving || input.trim() === recipient.alias) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(endpoint, { email: recipient.email, alias: input.trim() });
      setInput(data.alias);
      onSave(data);
    } catch {
      setError('Could not save this alias. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return <Paper variant="outlined" sx={{ p: 1.25 }}>
    <Stack component="form" spacing={0.75} onSubmit={save}>
      <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{recipient.email}</Typography>
      <Stack direction="row" spacing={0.75} alignItems="flex-start">
        <TextField label="Folder alias" size="small" fullWidth value={input} disabled={saving}
          inputProps={{ maxLength: 120, 'aria-label': `Folder alias for ${recipient.email}` }}
          onChange={(event) => setInput(event.target.value)} />
        <Button type="submit" size="small" variant="outlined" disabled={saving || input.trim() === recipient.alias}>Save</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  </Paper>;
}

export default function PrintRecipientSettings({ refresh }) {
  const [recipients, setRecipients] = useState(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api.get(endpoint, { cache: false, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRecipients(data.result); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [refresh]);

  const filter = query.trim().toLowerCase();
  const matches = recipients?.filter(({ email, alias }) => email.toLowerCase().includes(filter) || alias.toLowerCase().includes(filter)) ?? [];
  return <Stack spacing={1}>
    <Typography component="h3" variant="subtitle1" fontWeight={800}>Recipient folder names</Typography>
    <Typography variant="body2" color="text.secondary">Save an alias to use it as the folder name. Clear it to restore the original name.</Typography>
    <TextField label="Search recipients" size="small" value={query}
      onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }} />
    {failed && <Alert severity="error">Could not load recipients. Refresh to retry.</Alert>}
    {!recipients && !failed && <LinearProgress aria-label="Loading recipients" />}
    {recipients && !matches.length && <Typography color="text.secondary">No matching recipients.</Typography>}
    {matches.slice(0, limit).map((recipient) => <RecipientAlias key={`${recipient.email}:${recipient.alias}`} recipient={recipient}
      onSave={(saved) => setRecipients((current) => current.map((entry) => entry.email === saved.email ? saved : entry))} />)}
    {matches.length > limit && <Button onClick={() => setLimit((value) => value + pageSize)}>Show more recipients</Button>}
  </Stack>;
}
