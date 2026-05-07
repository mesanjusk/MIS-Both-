import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import axios from '../apiClient';
import { ROUTES } from '../constants/routes';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';


function statusChip(status) {
  if (status === 'confirmed') return <Chip label="Confirmed" color="success" size="small" />;
  if (status === 'rejected')  return <Chip label="Rejected"  color="error"   size="small" />;
  return <Chip label="Draft" color="default" size="small" />;
}

// --- single entry row with inline account assignment ---
function EntryRow({ entry, diaryStatus, onUpdate, ledgerAccounts = [] }) {
  const [editing, setEditing] = useState(false);
  const [acct, setAcct]       = useState(entry.account_assigned || '');
  const [saving, setSaving]   = useState(false);

  const isDraft          = diaryStatus !== 'confirmed';
  const isSuggested      = entry.auto_suggested && entry.account_assigned;

  const save = async (overrideAcct) => {
    const finalAcct = overrideAcct ?? acct;
    if (!finalAcct) return;
    setSaving(true);
    await onUpdate(entry.entry_uuid, { account_assigned: finalAcct });
    setSaving(false);
    setEditing(false);
  };

  // Accept the auto-suggested account as-is (confirms it, clears auto_suggested flag)
  const acceptSuggestion = () => save(entry.account_assigned);

  const reject = async () => {
    await onUpdate(entry.entry_uuid, {
      entry_status: entry.entry_status === 'rejected' ? 'draft' : 'rejected',
    });
  };

  return (
    <TableRow
      hover
      sx={{
        opacity: entry.entry_status === 'rejected' ? 0.45 : 1,
        bgcolor: entry.entry_status === 'confirmed'
          ? 'success.50'
          : entry.entry_status === 'rejected'
          ? 'error.50'
          : isSuggested
          ? 'warning.50'
          : 'inherit',
      }}
    >
      {/* Time */}
      <TableCell sx={{ width: 40, color: 'text.disabled', fontWeight: 700, fontSize: 11 }}>
        {entry.time_slot || '—'}
      </TableCell>

      {/* Party */}
      <TableCell>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" fontWeight={600}>{entry.party}</Typography>
          {entry.checked && (
            <Tooltip title="Marked ✓ in diary">
              <CheckCircleRoundedIcon sx={{ fontSize: 14, color: 'success.main' }} />
            </Tooltip>
          )}
          {entry.mode && entry.mode !== 'cash' && (
            <Chip label={entry.mode.toUpperCase()} size="small" variant="outlined" sx={{ height: 16, fontSize: 9 }} />
          )}
        </Stack>
        {entry.notes && (
          <Typography variant="caption" color="text.secondary">{entry.notes}</Typography>
        )}
      </TableCell>

      {/* Amount */}
      <TableCell align="right">
        <Typography variant="body2" fontWeight={700}>{money(entry.amount)}</Typography>
      </TableCell>

      {/* Account assignment */}
      <TableCell sx={{ minWidth: 220 }}>
        {editing ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Autocomplete
              freeSolo
              size="small"
              options={ledgerAccounts}
              value={acct}
              onInputChange={(_, v) => setAcct(v)}
              onChange={(_, v) => setAcct(v || '')}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select or type account" sx={{ width: 190 }} />
              )}
            />
            <IconButton size="small" color="success" onClick={() => save()} disabled={saving || !acct}>
              <CheckCircleRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => { setEditing(false); setAcct(entry.account_assigned || ''); }}>
              <CancelRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
            {isSuggested ? (
              // ── Auto-suggested: show amber chip + Accept / Change buttons ──
              <>
                <Tooltip title={`Auto-suggested: ${entry.suggestion_source || 'from past entries'}`}>
                  <Chip
                    icon={<AutoFixHighRoundedIcon sx={{ fontSize: '14px !important' }} />}
                    label={entry.account_assigned}
                    size="small"
                    color="warning"
                    variant="filled"
                    sx={{ fontWeight: 700 }}
                  />
                </Tooltip>
                {isDraft && entry.entry_status !== 'rejected' && (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={acceptSuggestion}
                      disabled={saving}
                      sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: 11, height: 22 }}
                    >
                      ✓ Accept
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={() => { setAcct(entry.account_assigned || ''); setEditing(true); }}
                      sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: 11, height: 22 }}
                    >
                      Change
                    </Button>
                  </>
                )}
              </>
            ) : entry.account_assigned ? (
              // ── Manually confirmed account ──
              <>
                <Chip label={entry.account_assigned} size="small" color="primary" variant="outlined" />
                {isDraft && entry.entry_status !== 'rejected' && (
                  <IconButton size="small" onClick={() => { setAcct(entry.account_assigned); setEditing(true); }}>
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </>
            ) : (
              // ── Nothing assigned yet ──
              isDraft && entry.entry_status !== 'rejected' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<EditRoundedIcon sx={{ fontSize: 13 }} />}
                  onClick={() => setEditing(true)}
                  sx={{ fontSize: 11, py: 0.25, px: 1 }}
                >
                  Assign Account
                </Button>
              )
            )}
          </Stack>
        )}
      </TableCell>

      {/* Status + reject toggle */}
      <TableCell align="center" sx={{ width: 90 }}>
        <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
          {statusChip(entry.entry_status)}
          {isDraft && (
            <Tooltip title={entry.entry_status === 'rejected' ? 'Restore entry' : 'Reject entry'}>
              <IconButton size="small" color="error" onClick={reject}>
                <CancelRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

// --- section table (cash receipts / cash payments / bank) ---
function EntrySection({ title, entries, color, diaryStatus, onUpdate, ledgerAccounts }) {
  if (!entries.length) return null;
  const total = entries.reduce((s, e) => s + (e.entry_status !== 'rejected' ? e.amount : 0), 0);
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} color={color} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          {title}
        </Typography>
        <Typography variant="caption" fontWeight={700} color={color}>{money(total)}</Typography>
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }}>Time</TableCell>
              <TableCell>Party / Purpose</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Account</TableCell>
              <TableCell align="center">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <EntryRow key={e.entry_uuid} entry={e} diaryStatus={diaryStatus} onUpdate={onUpdate} ledgerAccounts={ledgerAccounts} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// =================== MAIN PAGE ===================
export default function DayBook() {
  const { uuid: selectedUuid } = useParams();
  const navigate = useNavigate();

  const [diaryList, setDiaryList]     = useState([]);
  const [diary, setDiary]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [confirming, setConfirming]   = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [error, setError]             = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [ledgerAccounts, setLedgerAccounts] = useState([]);

  const loggedInUser = localStorage.getItem('User_name') || 'user';

  // --- load diary list ---
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await axios.get('/api/diary');
      setDiaryList(Array.isArray(res.data?.result) ? res.data.result : []);
    } catch {
      setDiaryList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  // --- load single diary ---
  const loadDiary = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await axios.get(`/api/diary/${uid}`);
      setDiary(res.data?.result || null);
    } catch {
      setError('Could not load diary. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selectedUuid) loadDiary(selectedUuid); }, [selectedUuid, loadDiary]);

  useEffect(() => {
    axios.get('/api/customers')
      .then((res) => {
        const accounts = (Array.isArray(res.data?.result) ? res.data.result : [])
          
          .map((c) => c.Customer_name)
          .filter(Boolean)
          .sort();
        setLedgerAccounts(accounts);
      })
      .catch(() => {});
  }, []);

  const handleSelectDiary = (uid) => {
    navigate(`${ROUTES.DAY_BOOK}/${uid}`);
  };

  // --- update single entry ---
  const handleUpdateEntry = useCallback(async (entryUuid, fields) => {
    if (!diary) return;
    try {
      const res = await axios.put(`/api/diary/${diary.diary_uuid}/entry/${entryUuid}`, fields);
      setDiary(res.data?.result || diary);
    } catch {
      setError('Failed to update entry.');
    }
  }, [diary]);

  // --- accept all auto-suggestions at once ---
  const handleAcceptAllSuggestions = useCallback(async () => {
    if (!diary) return;
    const pending = (diary.entries || []).filter(
      (e) => e.auto_suggested && e.account_assigned && e.entry_status !== 'rejected',
    );
    for (const e of pending) {
      await handleUpdateEntry(e.entry_uuid, { account_assigned: e.account_assigned });
    }
  }, [diary, handleUpdateEntry]);

  // --- confirm all ---
  const handleConfirm = async () => {
    if (!diary) return;
    setConfirming(true);
    setConfirmDialog(false);
    setError('');
    try {
      const res = await axios.post(`/api/diary/${diary.diary_uuid}/confirm`, {
        confirmed_by: loggedInUser,
      });
      setDiary(res.data?.result || diary);
      setSuccessMsg(res.data?.message || 'Confirmed successfully');
      loadList();
    } catch (err) {
      setError(err?.response?.data?.message || 'Confirm failed.');
    } finally {
      setConfirming(false);
    }
  };

  // derived data
  const entries     = diary?.entries || [];
  const cashIn      = entries.filter((e) => e.book === 'cash' && e.direction === 'in');
  const cashOut     = entries.filter((e) => e.book === 'cash' && e.direction === 'out');
  const bankEntries = entries.filter((e) => e.book === 'bank');

  const totalIn  = cashIn.filter((e)  => e.entry_status !== 'rejected').reduce((s, e) => s + e.amount, 0);
  const totalOut = cashOut.filter((e) => e.entry_status !== 'rejected').reduce((s, e) => s + e.amount, 0);
  const bankTotal = bankEntries.filter((e) => e.entry_status !== 'rejected').reduce((s, e) => s + e.amount, 0);

  const suggestedCount = entries.filter((e) => e.auto_suggested && e.account_assigned && e.entry_status !== 'rejected').length;
  const unassigned     = entries.filter((e) => e.entry_status !== 'rejected' && !e.account_assigned).length;
  const isDraft        = diary?.status !== 'confirmed';

  const summaryCards = [
    { label: 'Opening Balance', value: diary?.opening_balance, color: 'text.primary' },
    { label: 'Cash Receipts (+)', value: totalIn, color: 'success.dark' },
    { label: 'Cash Payments (−)', value: totalOut, color: 'error.dark' },
    { label: 'Closing Balance', value: diary?.closing_balance, color: 'primary.main' },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ---- LEFT: diary list sidebar ---- */}
      <Paper
        variant="outlined"
        sx={{ width: 220, flexShrink: 0, borderRadius: 3, display: { xs: 'none', md: 'block' } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, pb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>Day Books</Typography>
          <Stack direction="row" spacing={0.5}>
            <IconButton size="small" onClick={loadList}><RefreshRoundedIcon fontSize="small" /></IconButton>
            <IconButton size="small" color="primary" onClick={() => navigate(ROUTES.DIARY_UPLOAD)}>
              <AddRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Divider />
        {listLoading ? (
          <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
        ) : (
          <List dense disablePadding>
            {diaryList.map((d) => (
              <ListItem key={d.diary_uuid} disablePadding>
                <ListItemButton
                  selected={d.diary_uuid === selectedUuid}
                  onClick={() => handleSelectDiary(d.diary_uuid)}
                  sx={{ borderRadius: 2 }}
                >
                  <ListItemText
                    primary={fmtDate(d.diary_date)}
                    secondary={d.status === 'confirmed' ? '✓ Confirmed' : 'Draft'}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                    secondaryTypographyProps={{
                      variant: 'caption',
                      color: d.status === 'confirmed' ? 'success.main' : 'warning.main',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {!diaryList.length && (
              <ListItem>
                <ListItemText
                  primary="No diaries yet"
                  secondary="Upload a CSV to start"
                  primaryTypographyProps={{ variant: 'caption', color: 'text.disabled' }}
                />
              </ListItem>
            )}
          </List>
        )}
      </Paper>

      {/* ---- RIGHT: diary detail ---- */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              Day Book {diary ? `— ${fmtDate(diary.diary_date)}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review diary entries, assign accounts, then confirm to post transactions
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<AddRoundedIcon />}
              onClick={() => navigate(ROUTES.DIARY_UPLOAD)}
              size="small"
            >
              Upload New
            </Button>
            {diary && isDraft && (() => {
              const suggestedCount = (diary.entries || []).filter(
                (e) => e.auto_suggested && e.account_assigned && e.entry_status !== 'rejected',
              ).length;
              return suggestedCount > 0 ? (
                <Tooltip title={`Accept all ${suggestedCount} auto-suggested accounts at once`}>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={<AutoFixHighRoundedIcon />}
                    onClick={handleAcceptAllSuggestions}
                  >
                    Accept {suggestedCount} Suggestions
                  </Button>
                </Tooltip>
              ) : null;
            })()}
            {diary && isDraft && (
              <Button
                variant="contained"
                color="success"
                size="small"
                onClick={() => setConfirmDialog(true)}
                disabled={confirming}
              >
                {confirming ? 'Confirming…' : 'Confirm All'}
              </Button>
            )}
          </Stack>
        </Stack>

        {/* No diary selected */}
        {!selectedUuid && !loading && (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Select a day book from the list, or upload a new CSV.
            </Typography>
            <Button variant="contained" onClick={() => navigate(ROUTES.DIARY_UPLOAD)} startIcon={<AddRoundedIcon />}>
              Upload Diary CSV
            </Button>
          </Paper>
        )}

        {loading && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{successMsg}</Alert>}

        {diary && !loading && (
          <>
            {/* Status banner */}
            {diary.status === 'confirmed' && (
              <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
                This day book is confirmed. All transactions have been posted to the ledger.
              </Alert>
            )}
            {isDraft && suggestedCount > 0 && (
              <Alert severity="warning" icon={<AutoFixHighRoundedIcon />} sx={{ mb: 2, borderRadius: 3 }}>
                <strong>{suggestedCount} {suggestedCount === 1 ? 'entry has' : 'entries have'} auto-suggested accounts</strong> (shown in amber).
                Review and click <strong>Accept</strong> on each, or use <strong>Accept {suggestedCount} Suggestions</strong> to approve all at once.
              </Alert>
            )}
            {isDraft && unassigned > 0 && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
                {unassigned} {unassigned === 1 ? 'entry needs' : 'entries need'} an account assigned before confirming.
              </Alert>
            )}

            {/* Summary cards */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              {summaryCards.map(({ label, value, color }) => (
                <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
                  <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="h6" fontWeight={900} color={color}>{money(value)}</Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>

            {/* Cash entries */}
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <EntrySection
                  title="Cash Receipts (IN)"
                  entries={cashIn}
                  color="success.dark"
                  diaryStatus={diary.status}
                  onUpdate={handleUpdateEntry}
                  ledgerAccounts={ledgerAccounts}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <EntrySection
                  title="Cash Payments (OUT)"
                  entries={cashOut}
                  color="error.dark"
                  diaryStatus={diary.status}
                  onUpdate={handleUpdateEntry}
                  ledgerAccounts={ledgerAccounts}
                />
              </Box>
            </Stack>

            {/* Bank entries */}
            {bankEntries.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'info.main' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="info.dark">
                    Bank Entries — Sanju SK Account
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label="PENDING bank confirmation" size="small" color="warning" variant="outlined" />
                    <Typography variant="caption" fontWeight={700} color="info.dark">{money(bankTotal)}</Typography>
                  </Stack>
                </Stack>
                <EntrySection
                  title="Bank Book Entries (below the line)"
                  entries={bankEntries}
                  color="info.dark"
                  diaryStatus={diary.status}
                  onUpdate={handleUpdateEntry}
                  ledgerAccounts={ledgerAccounts}
                />
                <Typography variant="caption" color="text.secondary">
                  These entries will appear in the Bank Book. Upload your bank statement in 2–3 days to auto-match them.
                </Typography>
              </Paper>
            )}
          </>
        )}
      </Box>

      {/* Confirm dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Confirm Day Book?</DialogTitle>
        <DialogContent>
          <Typography>
            This will create <strong>{entries.filter((e) => e.account_assigned && e.entry_status !== 'rejected').length}</strong> transactions
            in the ledger for <strong>{fmtDate(diary?.diary_date)}</strong>.
          </Typography>
          {unassigned > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {unassigned} {unassigned === 1 ? 'entry has' : 'entries have'} no account assigned and will be skipped.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This cannot be undone. Make sure all accounts are correctly assigned.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleConfirm}>
            Confirm &amp; Post
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
