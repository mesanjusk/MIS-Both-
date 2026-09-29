import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import axios from '../apiClient';

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dateISO = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const money = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rowStatus = (row) => row.effectiveStatus || row.status;
const amountRemaining = (row) => Number(row.remainingAmount ?? row.amount ?? 0);
const statusLabel = (row) => {
  if (row.autoSettled) return 'Settled (ledger)';
  if (rowStatus(row) === 'done') return 'Done';
  if (row.overdue) return 'Overdue';
  if (row.dueToday) return 'Due today';
  return 'Pending';
};
const statusColor = (row) =>
  rowStatus(row) === 'done' ? 'success' : row.overdue ? 'error' : row.dueToday ? 'warning' : 'info';

export default function PaymentFollowupHome({ initialCustomerUuid = '', prefillKey = '' }) {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('pending');
  const [customer, setCustomer] = useState(null);
  const [customerBalance, setCustomerBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [followupDate, setFollowupDate] = useState(todayISO);
  const [title, setTitle] = useState('');
  const [remark, setRemark] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/paymentfollowup/list', {
        params: { limit: 500 }, cache: false,
      });
      if (!data?.success) throw new Error(data?.message || 'Unable to load follow-ups');
      setRows(Array.isArray(data.result) ? data.result : []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load payment follow-ups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
    axios.get('/api/customers/GetCustomersList')
      .then(({ data }) => { if (data?.success) setCustomers(data.result || []); })
      .catch(() => setError('Could not load customers for a new follow-up'));
  }, [loadRows]);

  useEffect(() => {
    if (!initialCustomerUuid || !customers.length) return;
    const match = customers.find((item) => item.Customer_uuid === initialCustomerUuid);
    if (match) { setCustomer(match); setAmount(''); }
  }, [initialCustomerUuid, prefillKey, customers]);

  useEffect(() => {
    if (!customer?.Customer_uuid) { setCustomerBalance(null); return undefined; }
    let active = true;
    setBalanceLoading(true);
    setCustomerBalance(null);
    axios.get('/api/paymentfollowup/balance/' + encodeURIComponent(customer.Customer_uuid), { cache: false })
      .then(({ data }) => {
        if (active) {
          setCustomerBalance(data?.result?.outstanding ?? 0);
          setAmount(String(data?.result?.outstanding > 0 ? data.result.outstanding : ''));
        }
      })
      .catch(() => {
        if (active) {
          setCustomerBalance(null);
          setError('Could not verify this customer’s live ledger balance');
        }
      })
      .finally(() => { if (active) setBalanceLoading(false); });
    return () => { active = false; };
  }, [customer]);

  const filtered = useMemo(() => rows.filter((row) => {
    const status = rowStatus(row);
    if (filter === 'pending' && status !== 'pending') return false;
    if (filter === 'done' && status !== 'done') return false;
    if (filter === 'overdue' && !row.overdue) return false;
    if (filter === 'today' && !row.dueToday) return false;
    const term = search.trim().toLowerCase();
    return !term || [row.customer_name, row.customer_uuid, row.title, row.assigned_to, row.remark]
      .some((field) => String(field || '').toLowerCase().includes(term));
  }), [rows, search, filter]);

  const summary = useMemo(() => ({
    pending: rows.filter((r) => rowStatus(r) === 'pending').length,
    overdue: rows.filter((r) => r.overdue).length,
    dueToday: rows.filter((r) => r.dueToday).length,
    outstanding: rows.filter((r) => rowStatus(r) === 'pending')
      .reduce((total, r) => total + amountRemaining(r), 0),
  }), [rows]);

  const create = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!customer?.Customer_uuid || !(customerBalance > 0) ||
        !(value > 0) || value > customerBalance + 0.01) {
      setError('Choose a customer with receivables and enter an amount within the live outstanding');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await axios.post('/api/paymentfollowup/add', {
        Customer: customer.Customer_name, Customer_uuid: customer.Customer_uuid,
        Amount: value, Followup_date: followupDate, Title: title,
        Remark: remark, Assigned_to: assignedTo, Promised_date: promisedDate || null,
      });
      setNotice('Follow-up created. No WhatsApp message was sent automatically.');
      setCustomer(null); setAmount(''); setTitle(''); setRemark('');
      setAssignedTo(''); setPromisedDate(''); setFollowupDate(todayISO());
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not create follow-up');
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      if (message) setNotice(message);
      setEditing(null);
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (row) => {
    setEditing(row);
    setDraft({
      followup_date: dateISO(row.followup_date),
      promised_date: dateISO(row.promised_date),
      title: row.title || '',
      remark: row.remark || '',
      assigned_to: row.assigned_to || '',
    });
  };

  const sendReminder = (row) => {
    if (!window.confirm('Send ONE approved WhatsApp reminder to ' + row.customer_name +
      ' for ' + money(amountRemaining(row)) + '? This may incur a provider charge.')) return;
    mutate(() => axios.post('/api/paymentfollowup/' + encodeURIComponent(row._id) +
      '/send-reminder', { confirmed: true }), 'WhatsApp reminder submitted and recorded.');
  };

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between">
        <Box>
          <Typography variant="h5" fontWeight={900}>Payment Follow-up</Typography>
          <Typography variant="body2" color="text.secondary">
            Track receivables from the actual customer ledger; no payments are posted here.
          </Typography>
        </Box>
        <Button variant="outlined" size="small" startIcon={<RefreshRoundedIcon />}
          onClick={loadRows} disabled={loading || busy}>Refresh ledger & follow-ups</Button>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
        {[
          ['Pending', summary.pending], ['Overdue', summary.overdue],
          ['Due today', summary.dueToday], ['Follow-up remaining', money(summary.outstanding)],
        ].map(([label, value]) => (
          <Card key={label} variant="outlined" sx={{ p: 1.5, flex: 1, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6" fontWeight={800}>{value}</Typography>
          </Card>
        ))}
      </Stack>

      <Paper component="form" onSubmit={create} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" fontWeight={800}>New customer follow-up</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
            <Autocomplete size="small" sx={{ flex: 2, minWidth: 180 }}
              options={customers.filter((item) => item.Customer_uuid)}
              value={customer} onChange={(_, value) => { setCustomer(value); setAmount(''); }}
              getOptionLabel={(item) => item?.Customer_name || ''}
              isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
              renderInput={(props) => <TextField {...props} label="Customer" required />}
            />
            <TextField size="small" label="Current receivable" sx={{ flex: 1 }}
              value={balanceLoading ? 'Checking…' : customerBalance === null ? 'Select customer' : money(customerBalance)}
              InputProps={{ readOnly: true }} />
            <TextField size="small" type="number" label="Follow-up amount (₹)" required sx={{ flex: 1 }}
              value={amount} onChange={(event) => setAmount(event.target.value)}
              inputProps={{ min: 0.01, max: customerBalance ?? undefined, step: 0.01 }} />
            <TextField size="small" type="date" label="Next follow-up" required sx={{ flex: 1 }}
              value={followupDate} onChange={(event) => setFollowupDate(event.target.value)}
              InputLabelProps={{ shrink: true }} />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
            <TextField size="small" label="Reason / invoice reference" sx={{ flex: 2 }}
              value={title} onChange={(event) => setTitle(event.target.value)} />
            <TextField size="small" label="Assigned staff" sx={{ flex: 1 }}
              value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} />
            <TextField size="small" type="date" label="Promised payment date" sx={{ flex: 1 }}
              value={promisedDate} onChange={(event) => setPromisedDate(event.target.value)}
              InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField size="small" label="Remark" value={remark}
            onChange={(event) => setRemark(event.target.value)} />
          <Stack direction="row" justifyContent="flex-end">
            <Button type="submit" variant="contained" startIcon={<AddRoundedIcon />}
              disabled={busy || balanceLoading || !(customerBalance > 0)}>Create follow-up</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            A follow-up records a request, not a receipt. Its remaining amount is estimated against
            customer-level ledger movement from creation; new invoices may require manual review.
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mb: 1.5 }}>
          <TextField size="small" label="Search customer, account, owner or remark"
            value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }} />
          <TextField select size="small" label="Show" value={filter}
            onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="today">Due today</MenuItem>
            <MenuItem value="done">Done / Settled</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </TextField>
        </Stack>
        {loading && <CircularProgress size={20} />}
        <TableContainer sx={{ maxHeight: '65vh' }}>
          <Table size="small" stickyHeader sx={{ minWidth: 820 }}>
            <TableHead><TableRow>
              <TableCell>Customer / reference</TableCell>
              <TableCell align="right">Follow-up ₹</TableCell>
              <TableCell align="right">Remaining ₹</TableCell>
              <TableCell>Next date / Promise</TableCell>
              <TableCell>Assigned</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {filtered.map((row) => <TableRow key={row._id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>{row.customer_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.title || row.remark || '—'}</Typography>
                  {row.liveOutstanding !== null && row.liveOutstanding !== undefined &&
                    <Typography variant="caption" display="block" color="text.secondary">
                      Live receivable: {money(row.liveOutstanding)}
                    </Typography>}
                </TableCell>
                <TableCell align="right">{money(row.amount)}</TableCell>
                <TableCell align="right">{money(amountRemaining(row))}</TableCell>
                <TableCell>
                  <Typography variant="body2">{dateISO(row.followup_date) || '—'}</Typography>
                  {row.promised_date &&
                    <Typography variant="caption" color="text.secondary">Promised: {dateISO(row.promised_date)}</Typography>}
                </TableCell>
                <TableCell>{row.assigned_to || 'Unassigned'}</TableCell>
                <TableCell><Chip size="small" color={statusColor(row)} label={statusLabel(row)} /></TableCell>
                <TableCell align="right">
                  <Stack direction="row" gap={0.5} justifyContent="flex-end">
                    <Button size="small" variant="outlined" startIcon={<EditRoundedIcon />}
                      onClick={() => openEdit(row)}>Manage</Button>
                    {rowStatus(row) === 'pending' && <Button size="small"
                      startIcon={<SendRoundedIcon />} onClick={() => sendReminder(row)}
                      disabled={busy || !row.customer_mobile || row.liveOutstanding === null || amountRemaining(row) <= 0}>
                      Remind
                    </Button>}
                  </Stack>
                </TableCell>
              </TableRow>)}
              {!filtered.length && !loading && <TableRow><TableCell align="center" colSpan={7}>
                No follow-ups match these filters.
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary">Latest 500 follow-ups · Reminder sends require confirmation and a 48-hour cooldown.</Typography>
      </Paper>

      <Dialog open={Boolean(editing)} onClose={() => !busy && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>Manage follow-up — {editing?.customer_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField size="small" label="Reason / reference" value={draft.title || ''}
              onChange={(e) => updateDraft('title', e.target.value)} />
            <TextField size="small" type="date" label="Next follow-up date" value={draft.followup_date || ''}
              onChange={(e) => updateDraft('followup_date', e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="Promised payment date" value={draft.promised_date || ''}
              onChange={(e) => updateDraft('promised_date', e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Assigned staff" value={draft.assigned_to || ''}
              onChange={(e) => updateDraft('assigned_to', e.target.value)} />
            <TextField size="small" multiline minRows={2} label="Notes" value={draft.remark || ''}
              onChange={(e) => updateDraft('remark', e.target.value)} />
            <Divider />
            <Typography variant="subtitle2">Recent activity</Typography>
            {(editing?.history || []).slice(-5).reverse().map((event, i) =>
              <Typography key={event._id || i} variant="caption" color="text.secondary">
                {dateISO(event.at)} · {event.by || 'System'} · {event.action}: {event.note || '—'}
              </Typography>)}
            {!editing?.history?.length && <Typography variant="caption">No prior history recorded.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          {editing && <Button color={rowStatus(editing) === 'done' ? 'warning' : 'success'}
            disabled={busy || Boolean(editing.autoSettled)}
            onClick={() => mutate(() => axios.patch('/api/paymentfollowup/' +
              encodeURIComponent(editing._id) + '/status', {
                status: rowStatus(editing) === 'done' ? 'pending' : 'done',
                note: rowStatus(editing) === 'done' ? 'Manually reopened' : 'Manually completed',
              }), 'Follow-up status updated.')}>
            {rowStatus(editing) === 'done' ? 'Reopen' : 'Mark done'}
          </Button>}
          {editing && <Button variant="contained" disabled={busy || !draft.followup_date}
            onClick={() => mutate(() => axios.patch('/api/paymentfollowup/' +
              encodeURIComponent(editing._id), draft), 'Follow-up updated.')}>Save</Button>}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
