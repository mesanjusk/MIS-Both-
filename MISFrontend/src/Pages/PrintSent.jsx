import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, FormControlLabel, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import api from '../apiClient';
import { ADMIN_ROLES, isRoleAllowed } from '../constants/roles';
import { useRoleKey } from '../hooks/useRouteAccess';
import PrintRecipientSettings from './PrintRecipientSettings';

const base = '/api/gmail/print-sent';
const dateFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const formatDate = (date) => dateFormat.format(new Date(date));
const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const folderPageSize = 30;
const mailCount = (count) => `${count} ${count === 1 ? 'email' : 'emails'}`;
const loading = { data: null, failed: false };
const statuses = [['all', 'All'], ['received', 'Received'], ['pending', 'Pending']];
const groupOptions = [['date', 'Date'], ['week', 'Week'], ['month', 'Month']];

function periodLabel(period, unit) {
  if (unit === 'month') return monthFormat.format(new Date(period.start));
  if (unit === 'week') return dateFormat.formatRange(new Date(period.start), new Date(period.end));
  return formatDate(period.start);
}

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
  const [receiptVersion, setReceiptVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.get(`${base}/messages`, { params: { date, recipient, page, status }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult((current) => current.data ? current : { data: null, failed: true }); });
    return () => controller.abort();
  }, [date, recipient, page, status, refresh, receiptVersion]);

  const updateReceipt = async (id, index, received) => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch(`${base}/messages/${id}/attachments/${index}`, { received });
      setResult((current) => {
        if (!current.data) return current;
        const result = current.data.result.map((message) => message._id === id
          ? { ...message, attachments: message.attachments.map((file, position) => position === index ? { ...file, received } : file) }
          : message);
        return { ...current, data: { ...current.data, result } };
      });
      if (status !== 'all') {
        if (page > 1 || data.hasMore) setReceiptVersion((value) => value + 1);
        onReceiptChange();
      }
    } catch {
      setSaveError('Could not update the attachment. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <Alert severity="error">Could not load sent emails. Refresh to retry.</Alert>;
  if (!data) return <LinearProgress aria-label="Loading sent emails" />;
  const matches = (file) => status === 'all' || (status === 'received') === (file.received === true);
  const messages = status === 'all' ? data.result : data.result.filter((message) => message.attachments.some(matches));
  const changePage = (amount) => { setResult(loading); setPage((value) => value + amount); };
  return <Stack spacing={1}>
    {saveError && <Alert severity="error">{saveError}</Alert>}
    {!messages.length && <Typography color="text.secondary">
      {status === 'all' ? 'No emails in this folder.' : `No ${status} attachments in this folder.`}
    </Typography>}
    {messages.map((message) => <Paper key={message._id} variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="subtitle2" fontWeight={800}>{timeFormat.format(new Date(message.sentAt))}</Typography>
      {!message.attachments.length && <Typography variant="body2" color="text.secondary">No attachments</Typography>}
      <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
        {message.attachments.map((file, index) => {
          const received = file.received === true;
          if (!matches(file)) return null;
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
      <Button disabled={saving || page === 1} onClick={() => changePage(-1)}>Previous</Button>
      <Button disabled={saving || !data.hasMore || page >= 1000} onClick={() => changePage(1)}>Next</Button>
    </Stack>}
  </Stack>;
}

export default function PrintSent({ showTitle = true } = {}) {
  const canManageRecipients = isRoleAllowed(ADMIN_ROLES, useRoleKey());
  const [date, setDate] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [status, setStatus] = useState('pending');
  const [groupBy, setGroupBy] = useState('date');
  const [period, setPeriod] = useState(null);
  const [visibleFolders, setVisibleFolders] = useState(folderPageSize);
  const [bulkChoice, setBulkChoice] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [folderRevision, setFolderRevision] = useState(0);
  const [{ data, failed }, setResult] = useState(loading);

  useEffect(() => {
    if (status === 'settings') return undefined;
    const controller = new AbortController();
    api.get(`${base}/folders`, { params: { status, groupBy }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setResult({ data: result, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult((current) => current.data ? current : { data: null, failed: true }); });
    return () => controller.abort();
  }, [refresh, status, groupBy, folderRevision]);

  const activeDate = status === 'all' && data && !data.dates.includes(date) ? '' : date;
  const folders = data?.folders.filter((folder) => folder.date === activeDate) ?? [];
  const activeRecipient = folders.find((folder) => folder.email === recipient?.email) || recipient;
  const reload = () => setRefresh((value) => value + 1);
  const dateCounts = new Map();
  for (const folder of data?.folders ?? []) dateCounts.set(folder.date, (dateCounts.get(folder.date) || 0) + folder.count);
  const showPeriods = status === 'pending' && groupBy !== 'date';
  const periodDates = showPeriods && period ? data?.periods?.find(({ start }) => start === period.start)?.dates ?? [] : [];
  const dates = showPeriods ? periodDates : data?.dates ?? [];
  const rootFolders = showPeriods && !period ? data?.periods ?? [] : dates;
  const dateCount = (day) => dateCounts.get(day) || 0;
  const openDate = (day) => { setDate(day); setRecipient(null); };
  const changeGroup = (_, next) => {
    if (!next || next === groupBy) return;
    setResult(loading);
    setGroupBy(next);
    setPeriod(null);
    openDate('');
    setVisibleFolders(folderPageSize);
  };
  const changeStatus = (_, next) => {
    if (next === status) return;
    setResult(loading);
    setStatus(next);
    if (next === 'settings') openDate('');
    setPeriod(null);
    setVisibleFolders(folderPageSize);
  };
  const receivePeriod = async () => {
    setBulkSaving(true);
    setBulkMessage(null);
    try {
      const { data: result } = await api.patch(`${base}/bulk-receive`, { date: bulkChoice.start, period: bulkChoice.unit });
      setBulkMessage({ severity: 'success', text: result.updatedEmails
        ? `Marked pending attachments received across ${mailCount(result.updatedEmails)}.`
        : 'No pending attachments remained in this period.' });
      setBulkChoice(null);
      reload();
    } catch {
      setBulkMessage({ severity: 'error', text: 'Could not mark this period received. Refresh and try again.' });
      setBulkChoice(null);
      reload();
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkButton = (selection, unit, hasPending) => status === 'pending' && hasPending && (
    <Button size="small" variant="outlined" onClick={() => { setBulkMessage(null); setBulkChoice({ ...selection, unit }); }}>
      Mark {unit} received
    </Button>
  );
  return <Stack spacing={1}>
    <Stack direction="row" alignItems="center" justifyContent={showTitle ? 'space-between' : 'flex-end'}>
      {showTitle && <Typography variant="h6" fontWeight={800}>Print Sent</Typography>}
      <Button size="small" onClick={reload}>Refresh</Button>
    </Stack>
    <Tabs value={status} onChange={changeStatus}
      variant="fullWidth" aria-label="Print attachment status" sx={{ '& .MuiTab-root': { minWidth: 0, px: 1 } }}>
      {statuses.map(([value, label]) => <Tab key={value} value={value} label={label} />)}
      {canManageRecipients && <Tab value="settings" label="Settings" />}
    </Tabs>
    {status === 'settings' ? <PrintRecipientSettings refresh={refresh} /> : <>
    {status === 'pending' && <ToggleButtonGroup exclusive size="small" value={groupBy} onChange={changeGroup}
      aria-label="Group pending attachments" fullWidth>
      {groupOptions.map(([value, label]) => <ToggleButton key={value} value={value}>{label}</ToggleButton>)}
    </ToggleButtonGroup>}
    {bulkMessage && <Alert severity={bulkMessage.severity} onClose={() => setBulkMessage(null)}>{bulkMessage.text}</Alert>}
    {failed && <Alert severity="error">Could not load print folders. Refresh to retry.</Alert>}
    {!data && !failed && <LinearProgress aria-label="Loading print folders" />}
    {data && !activeDate && <>
      {showPeriods && period && <>
        <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="space-between">
          <Button startIcon={<ArrowBackRounded />} size="small" onClick={() => setPeriod(null)}>{groupBy === 'week' ? 'Weeks' : 'Months'}</Button>
          {bulkButton(period, groupBy, dates.length > 0)}
        </Stack>
        <Typography component="h3" variant="subtitle1" fontWeight={800}>{periodLabel(period, groupBy)}</Typography>
      </>}
      {!rootFolders.length ? <Typography color="text.secondary">No {status} attachments.</Typography> : <Paper variant="outlined">
        <List aria-label={showPeriods && !period ? `Print ${groupBy === 'week' ? 'weeks' : 'months'}` : 'Print dates'} disablePadding>
          {showPeriods && !period
            ? rootFolders.slice(0, visibleFolders).map((item) => <FolderRow key={item.start} name={periodLabel(item, groupBy)}
              count={item.dates.reduce((sum, day) => sum + dateCount(day), 0)} onClick={() => setPeriod(item)} />)
            : rootFolders.slice(0, visibleFolders).map((day) => <FolderRow key={day} name={formatDate(day)}
              count={dateCount(day)} onClick={() => openDate(day)} />)}
        </List>
        {rootFolders.length > visibleFolders && <Button fullWidth onClick={() => setVisibleFolders((value) => value + folderPageSize)}>Show older</Button>}
      </Paper>}
    </>}
    {data && activeDate && <Stack spacing={1}>
      <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="space-between">
        <Button startIcon={<ArrowBackRounded />} size="small"
          onClick={() => { if (recipient) setRecipient(null); else setDate(''); }}>
          {recipient ? 'Recipients' : 'Dates'}
        </Button>
        {!recipient && bulkButton({ start: activeDate }, 'date', folders.length > 0)}
      </Stack>
      <Typography component="h3" variant="subtitle1" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
        {activeRecipient ? activeRecipient.alias || activeRecipient.name || activeRecipient.email : formatDate(activeDate)}
      </Typography>
      {recipient ? <SentMessages key={`${activeDate}:${recipient.email}:${status}`} date={activeDate}
        recipient={recipient.email} status={status} refresh={refresh}
        onReceiptChange={() => setFolderRevision((value) => value + 1)} />
        : folders.length ? <Paper variant="outlined">
          <List aria-label="Recipient folders" disablePadding>
            {folders.sort((left, right) => (left.alias || left.name || left.email).localeCompare(right.alias || right.name || right.email))
              .map((folder) => <FolderRow key={folder.email} name={folder.alias || folder.name || folder.email} count={folder.count}
                email={folder.alias ? undefined : folder.email} onClick={() => setRecipient(folder)} />)}
          </List>
        </Paper> : <Typography color="text.secondary">
          {status === 'all' ? 'No print emails sent on this date.' : `No ${status} attachments on this date.`}
        </Typography>}
    </Stack>}
    </>}
    <Dialog open={Boolean(bulkChoice)} onClose={bulkSaving ? undefined : () => setBulkChoice(null)}>
      <DialogTitle>Mark attachments received?</DialogTitle>
      <DialogContent>
        {bulkChoice && <DialogContentText>
          This marks every currently pending attachment for {periodLabel(bulkChoice, bulkChoice.unit)} as received at the office, across all recipients.
        </DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button disabled={bulkSaving} onClick={() => setBulkChoice(null)}>Cancel</Button>
        <Button disabled={bulkSaving} variant="contained" onClick={receivePeriod}>{bulkSaving ? 'Saving…' : 'Mark received'}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
