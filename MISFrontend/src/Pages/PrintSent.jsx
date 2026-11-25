import { useEffect, useState } from 'react';
import { Alert, Box, Button, Divider, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from '@mui/material';
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

function SentMessages({ date, recipient }) {
  const [page, setPage] = useState(1);
  const [{ data, failed }, setResult] = useState(loading);

  useEffect(() => {
    const controller = new AbortController();
    setResult(loading);
    api.get(`${base}/messages`, { params: { date, recipient, page }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ data: null, failed: true }); });
    return () => controller.abort();
  }, [date, recipient, page]);

  if (failed) return <Alert severity="error">Could not load sent emails. Refresh to retry.</Alert>;
  if (!data) return <LinearProgress aria-label="Loading sent emails" />;
  return <Stack spacing={1}>
    {!data.result.length && <Typography color="text.secondary">No emails in this folder.</Typography>}
    {data.result.map((message) => <Paper key={message._id} variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="subtitle2" fontWeight={800}>{timeFormat.format(new Date(message.sentAt))}</Typography>
      {!message.attachments.length && <Typography variant="body2" color="text.secondary">No attachments</Typography>}
      <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
        {message.attachments.map((file, index) => <Stack key={index} direction="row" alignItems="center" gap={1.25} sx={{ py: 0.75 }}>
          <Box sx={{ width: 52, height: 44, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {file.thumbnail ? <Box component="img" src={`data:image/jpeg;base64,${file.thumbnail}`} alt="" loading="lazy"
              sx={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0.5 }} />
              : <InsertDriveFileOutlined aria-label="File preview unavailable" color="disabled" />}
          </Box>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{file.originalName}</Typography>
        </Stack>)}
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
  const [recipient, setRecipient] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [{ data, failed }, setResult] = useState(loading);

  useEffect(() => {
    const controller = new AbortController();
    api.get(`${base}/folders`, { cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ data: null, failed: true }); });
    return () => controller.abort();
  }, [refresh]);

  const activeDate = data?.dates.includes(date) ? date : '';
  const folders = data?.folders.filter((folder) => folder.date === activeDate) ?? [];
  const activeFolder = folders.find((folder) => folder.email === recipient);
  return <Stack spacing={1}>
    <Stack direction="row" alignItems="center" justifyContent={showTitle ? 'space-between' : 'flex-end'}>
      {showTitle && <Typography variant="h6" fontWeight={800}>Print Sent</Typography>}
      <Button size="small" onClick={() => { setResult(loading); setRefresh((value) => value + 1); }}>Refresh</Button>
    </Stack>
    {failed && <Alert severity="error">Could not load print folders. Refresh to retry.</Alert>}
    {!data && !failed && <LinearProgress aria-label="Loading print folders" />}
    {data && !activeDate && <Paper variant="outlined">
      <List aria-label="Print dates" disablePadding>
        {data.dates.map((day) => <FolderRow key={day} name={formatDate(day)}
          count={data.folders.reduce((sum, folder) => folder.date === day ? sum + folder.count : sum, 0)}
          onClick={() => { setDate(day); setRecipient(''); }} />)}
      </List>
    </Paper>}
    {activeDate && <Stack spacing={1}>
      <Button startIcon={<ArrowBackRounded />} size="small" sx={{ alignSelf: 'flex-start' }}
        onClick={() => { if (activeFolder) setRecipient(''); else setDate(''); }}>
        {activeFolder ? 'Recipients' : 'Dates'}
      </Button>
      <Typography component="h3" variant="subtitle1" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
        {activeFolder ? activeFolder.name || activeFolder.email : formatDate(activeDate)}
      </Typography>
      {activeFolder ? <SentMessages key={`${activeDate}:${recipient}`} date={activeDate} recipient={recipient} />
        : folders.length ? <Paper variant="outlined">
          <List aria-label="Recipient folders" disablePadding>
            {folders.sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email))
              .map((folder) => <FolderRow key={folder.email} name={folder.name || folder.email} count={folder.count}
                email={folder.email} onClick={() => setRecipient(folder.email)} />)}
          </List>
        </Paper> : <Typography color="text.secondary">No print emails sent on this date.</Typography>}
    </Stack>}
  </Stack>;
}
