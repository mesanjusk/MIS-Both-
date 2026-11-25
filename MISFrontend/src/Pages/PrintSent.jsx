import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Divider, FormControlLabel, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import api from '../apiClient';

const base = '/api/gmail/print-sent';
const dateFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const formatDate = (date) => dateFormat.format(new Date(date));
const mailCount = (count) => `${count} ${count === 1 ? 'email' : 'emails'}`;
const loading = { data: null, failed: false };
const statuses = [['all', 'All'], ['received', 'Received'], ['pending', 'Pending']];

function FolderRow({ name, count, email, onClick }) {
  const details = email && email !== name ? `${email} · ${mailCount(count)}` : mailCount(count);
  return <ListItem disablePadding>
    <ListItemButton onClick={onClick} sx={{ gap: 1, borderRadius: 1, minHeight: 58 }}>
      <ListItemIcon sx={{ minWidth: 32 }}><FolderOutlined color="primary" /></ListItemIcon>
      <ListItemText primary={name} secondary={details}
        primaryTypographyProps={{ fontWeight: 700, sx: { overflowWrap: 'anywhere' } }}
        secondaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }} />
      <ChevronRightRounded fontSize="small" color="action" />
    </ListItemButton>
  </ListItem>;
}

function SentMessages({ date, recipient, status, refresh, onReceiptChange }) {
  const [page, setPage] = useState(1);
  const [{ data, failed }, setResult] = useState(loading);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setResult(loading);
    api.get(`${base}/messages`, { params: { date, recipient, page, status }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ data: null, failed: true }); });
    return () => controller.abort();
  }, [date, recipient, page, status, refresh]);

  const updateReceipt = async (id, index, received) => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch(`${base}/messages/${id}/attachments/${index}`, { received });
      onReceiptChange();
    } catch {
      setSaveError('Could not update the attachment. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <Alert severity="error">Could not load sent emails. Refresh to retry.</Alert>;
  if (!data) return <LinearProgress aria-label="Loading sent emails" />;
  return <Stack spacing={1}>
    {saveError && <Alert severity="error">{saveError}</Alert>}
    {!data.result.length && <Typography color="text.secondary">
      {status === 'all' ? 'No emails in this folder.' : `No ${status} attachments in this folder.`}
    </Typography>}
    {data.result.map((message) => <Paper key={message._id} variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="subtitle2" fontWeight={800}>{timeFormat.format(new Date(message.sentAt))}</Typography>
      {!message.attachments.length && <Typography variant="body2" color="text.secondary">No attachments</Typography>}
      <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
        {message.attachments.map((file, index) => {
          const received = file.received === true;
          if (status !== 'all' && (status === 'received') !== received) return null;
          return <Stack key={index} direction="row" alignItems="center" gap={1} sx={{ py: 0.75 }}>
            <Box sx={{ width: 52, height: 44, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {file.thumbnail ? <Box component="img" src={`data:image/jpeg;base64,${file.thumbnail}`} alt="" loading="lazy"
                sx={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0.5 }} />
                : <InsertDriveFileOutlined aria-label="File preview unavailable" color="disabled" />}
            </Box>
            <FormControlLabel sx={{ ml: 0, mr: 0, flex: 1, minWidth: 0 }} labelPlacement="start"
              control={<Checkbox checked={received} disabled={saving} onChange={(_, checked) => updateReceipt(message._id, index, checked)}
                inputProps={{ 'aria-label': `Received at office: ${file.originalName}` }} />}
              label={<Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{file.originalName}</Typography>
                <Typography variant="caption" color={received ? 'success.main' : 'text.secondary'}>
                  {file.storageMethod === 'google_drive' && 'Google Drive · '}
                  {received ? 'Received at office' : 'Pending receipt'}
                </Typography>
              </Box>} />
          </Stack>;
        })}
      </Stack>
    </Paper>)}
    {(page > 1 || data.hasMore) && <Stack direction="row" spacing={1} justifyContent="flex-end">
      <Button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
      <Button disabled={!data.hasMore || page >= 1000} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </Stack>}
  </Stack>;
}

export default function PrintSent({ showTitle = true } = {}) {
  const [date, setDate] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [status, setStatus] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const [{ data, failed }, setResult] = useState(loading);

  useEffect(() => {
    const controller = new AbortController();
    api.get(`${base}/folders`, { params: { status }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ data: null, failed: true }); });
    return () => controller.abort();
  }, [refresh, status]);

  const activeDate = status === 'all' && data && !data.dates.includes(date) ? '' : date;
  const folders = data?.folders.filter((folder) => folder.date === activeDate) ?? [];
  const reload = () => setRefresh((value) => value + 1);
  return <Stack spacing={1}>
    <Stack direction="row" alignItems="center" justifyContent={showTitle ? 'space-between' : 'flex-end'}>
      {showTitle && <Typography variant="h6" fontWeight={800}>Print Sent</Typography>}
      <Button size="small" onClick={reload}>Refresh</Button>
    </Stack>
    <Tabs value={status} onChange={(_, next) => { setResult(loading); setStatus(next); }}
      variant="fullWidth" aria-label="Print attachment status">
      {statuses.map(([value, label]) => <Tab key={value} value={value} label={label} />)}
    </Tabs>
    {failed && <Alert severity="error">Could not load print folders. Refresh to retry.</Alert>}
    {!data && !failed && <LinearProgress aria-label="Loading print folders" />}
    {data && !activeDate && !data.dates.length && <Typography color="text.secondary">No {status} attachments.</Typography>}
    {data && !activeDate && data.dates.length > 0 && <Paper variant="outlined">
      <List aria-label="Print dates" disablePadding>
        {data.dates.map((day) => <FolderRow key={day} name={formatDate(day)}
          count={data.folders.reduce((sum, folder) => folder.date === day ? sum + folder.count : sum, 0)}
          onClick={() => { setDate(day); setRecipient(null); }} />)}
      </List>
    </Paper>}
    {data && activeDate && <Stack spacing={1}>
      <Button startIcon={<ArrowBackRounded />} size="small" sx={{ alignSelf: 'flex-start' }}
        onClick={() => { if (recipient) setRecipient(null); else setDate(''); }}>
        {recipient ? 'Recipients' : 'Dates'}
      </Button>
      <Typography component="h3" variant="subtitle1" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
        {recipient ? recipient.name || recipient.email : formatDate(activeDate)}
      </Typography>
      {recipient ? <SentMessages key={`${activeDate}:${recipient.email}:${status}`} date={activeDate}
        recipient={recipient.email} status={status} refresh={refresh} onReceiptChange={reload} />
        : folders.length ? <Paper variant="outlined">
          <List aria-label="Recipient folders" disablePadding>
            {folders.sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email))
              .map((folder) => <FolderRow key={folder.email} name={folder.name || folder.email} count={folder.count}
                email={folder.email} onClick={() => setRecipient(folder)} />)}
          </List>
        </Paper> : <Typography color="text.secondary">
          {status === 'all' ? 'No print emails sent on this date.' : `No ${status} attachments on this date.`}
        </Typography>}
    </Stack>}
  </Stack>;
}
