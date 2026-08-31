import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Collapse, IconButton, MenuItem,
  Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography, Divider,
} from '@mui/material';
import ExpandMoreRoundedIcon  from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon  from '@mui/icons-material/ExpandLessRounded';
import OpenInNewRoundedIcon   from '@mui/icons-material/OpenInNewRounded';
import SendRoundedIcon        from '@mui/icons-material/SendRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import AddRoundedIcon         from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon      from '@mui/icons-material/DeleteRounded';
import EmailRoundedIcon       from '@mui/icons-material/EmailRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon  from '@mui/icons-material/CheckCircleRounded';
import toast from 'react-hot-toast';
import { getEmailHistory } from '../services/gmailService';
import { getGmailAccounts, getGmailAuthUrl, getGmailStats, disconnectAccount } from '../services/gmailService';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const mb  = (b) => b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '';
const pct = (sent, limit) => Math.min(100, Math.round((sent / (limit || 499)) * 100));

function AttachmentRow({ att }) {
  const parsed = att.parseSuccess;
  return (
    <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mb: 0.3 }}>
      <Typography variant="caption" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
        {att.originalName} {att.fileSize ? `(${mb(att.fileSize)})` : ''}
      </Typography>
      {att.storageMethod === 'google_drive' && att.driveShareableLink && (
        <Tooltip title="Open Drive link">
          <IconButton size="small" href={att.driveShareableLink} target="_blank" rel="noreferrer">
            <OpenInNewRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {parsed && (
        <Chip
          size="small"
          label={`${att.parsedCustomer} | ${att.parsedSize} ×${att.parsedQty} | ${att.parsedItem}`}
          color="success" variant="outlined"
        />
      )}
    </Stack>
  );
}

function HistoryRow({ row }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <TableRow hover sx={{ '& td': { verticalAlign: 'middle' } }}>
        <TableCell>
          <Typography variant="caption">{fmt(row.sentAt)}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="caption">{row.fromEmail}</Typography>
        </TableCell>
        <TableCell>
          <Box>
            <Typography variant="body2" fontWeight={600} noWrap>{row.toName || row.toEmail}</Typography>
            {row.toName && <Typography variant="caption" color="text.secondary">{row.toEmail}</Typography>}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{row.subject}</Typography>
        </TableCell>
        <TableCell align="center">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip size="small" label={row.attachments?.length || 0} />
            {row.attachments?.some((a) => a.storageMethod === 'google_drive') && (
              <Tooltip title="Contains Drive link(s)">
                <OpenInNewRoundedIcon fontSize="small" color="info" />
              </Tooltip>
            )}
          </Stack>
        </TableCell>
        <TableCell>
          {row.poUuid
            ? (
              <Tooltip title="Auto-created Draft PO">
                <Chip
                  size="small" color="warning" variant="outlined"
                  icon={<ReceiptLongRoundedIcon />}
                  label="PO created"
                  onClick={() => navigate(ROUTES.PURCHASE_ORDERS)}
                  sx={{ cursor: 'pointer' }}
                />
              </Tooltip>
            )
            : <Typography variant="caption" color="text.disabled">—</Typography>
          }
        </TableCell>
        <TableCell>
          <Chip size="small" label={row.status} color={row.status === 'sent' ? 'success' : 'error'} />
        </TableCell>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen((p) => !p)}>
            {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              {row.bodyText && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" fontWeight={700}>Message body</Typography>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                    {row.bodyText}
                  </Typography>
                </Box>
              )}
              {row.attachments?.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700}>Attachments</Typography>
                  {row.attachments.map((att, i) => <AttachmentRow key={i} att={att} />)}
                </Box>
              )}
              {row.lastError && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                  Error: {row.lastError}
                </Typography>
              )}
              <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                Gmail Message ID: {row.gmailMessageId || '—'} | Sent by: {row.sentBy}
              </Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function GmailAccountsTab() {
  const [accounts, setAccounts]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [connecting, setConnecting] = useState(false);
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
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <EmailRoundedIcon color="primary" />
          <Typography variant="h6" fontWeight={800}>Gmail Accounts</Typography>
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

      {accounts.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2, borderColor: 'info.light', bgcolor: 'info.50' }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>Before adding an account</Typography>
          <Typography variant="body2" color="text.secondary" component="ol" sx={{ pl: 2 }}>
            <li>Open Google Cloud Console → Credentials → your OAuth 2.0 client</li>
            <li>Add this redirect URI: <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
              {window.location.origin.includes('localhost')
                ? 'http://localhost:5000/api/gmail/callback'
                : 'https://misbackend-e078.onrender.com/api/gmail/callback'}
            </code></li>
            <li>Enable the Gmail API in your Google Cloud project</li>
            <li>Set <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>GMAIL_REDIRECT_URI</code> in your Render backend env vars</li>
            <li>Then click "Add Gmail Account" above</li>
          </Typography>
        </Paper>
      )}

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

export default function EmailHistory() {
  const [tab, setTab]             = useState(0);
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [filters, setFilters]     = useState({ toEmail: '', status: '', fromDate: '', toDate: '', subject: '' });
  const navigate = useNavigate();
  const LIMIT = 30;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const res = await getEmailHistory({ page: pg, limit: LIMIT, ...filters });
      setRows(Array.isArray(res?.result) ? res.result : []);
      setTotal(res?.total || 0);
      setPage(pg);
    } catch {
      toast.error('Failed to load email history');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { if (tab === 0) load(1); }, [load, tab]);

  const applyFilters = () => load(1);
  const clearFilters = () => {
    setFilters({ toEmail: '', status: '', fromDate: '', toDate: '', subject: '' });
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={900}>Email</Typography>
        <Button variant="contained" startIcon={<SendRoundedIcon />} onClick={() => navigate(ROUTES.EMAIL_COMPOSE)}>
          Compose Email
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Email History" />
        <Tab label="Gmail Accounts" />
      </Tabs>

      {tab === 0 && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap">
            <TextField
              size="small" label="Recipient email" value={filters.toEmail}
              onChange={(e) => setFilters((p) => ({ ...p, toEmail: e.target.value }))}
              sx={{ minWidth: 200 }}
            />
            <TextField
              size="small" label="Subject" value={filters.subject}
              onChange={(e) => setFilters((p) => ({ ...p, subject: e.target.value }))}
              sx={{ minWidth: 180 }}
            />
            <TextField select size="small" label="Status" value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} sx={{ minWidth: 130 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <TextField size="small" type="date" label="From" value={filters.fromDate}
              onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="To" value={filters.toDate}
              onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
            <Button variant="contained" onClick={applyFilters} size="small">Search</Button>
            <Button variant="outlined" onClick={clearFilters} size="small">Clear</Button>
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {total} email{total !== 1 ? 's' : ''} found
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No emails found. Try adjusting your filters.</Typography>
              <Button sx={{ mt: 1 }} onClick={() => navigate(ROUTES.EMAIL_COMPOSE)}>Send your first email</Button>
            </Paper>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell>Sent At</TableCell>
                      <TableCell>From</TableCell>
                      <TableCell>To</TableCell>
                      <TableCell>Subject</TableCell>
                      <TableCell align="center">Files</TableCell>
                      <TableCell>Auto PO</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => <HistoryRow key={row.emailId || row._id} row={row} />)}
                  </TableBody>
                </Table>
              </TableContainer>

              {total > LIMIT && (
                <Stack direction="row" justifyContent="center" spacing={1} sx={{ mt: 2 }}>
                  <Button size="small" disabled={page <= 1} onClick={() => load(page - 1)}>Prev</Button>
                  <Typography variant="body2" sx={{ alignSelf: 'center' }}>
                    Page {page} of {Math.ceil(total / LIMIT)}
                  </Typography>
                  <Button size="small" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => load(page + 1)}>Next</Button>
                </Stack>
              )}
            </>
          )}
        </>
      )}

      {tab === 1 && <GmailAccountsTab />}
    </Box>
  );
}
