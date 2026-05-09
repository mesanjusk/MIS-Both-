import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

// =================== LEDGER DAY VIEW (historical transactions, read-only) ===================
function LedgerDayView({ txns, date, cashAccounts = [], cashNames = [], bankAccounts = [], bankNames = [], customerMap = {} }) {
  if (!txns.length) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No cash/bank transactions found for {fmtDate(date)}.</Typography>
      </Paper>
    );
  }

  // Match by UUID (new transactions) AND by name (old diary-confirmed transactions)
  const cashUuidSet = new Set(cashAccounts);
  const bankUuidSet = new Set(bankAccounts);
  const cashNameSet = new Set(cashNames.map((n) => n.toLowerCase()));
  const bankNameSet = new Set(bankNames.map((n) => n.toLowerCase()));
  const isCash = (id) => cashUuidSet.has(id) || cashNameSet.has((id || '').toLowerCase()) || (!cashUuidSet.size && /^cash$/i.test(id || ''));
  const isBank = (id) => bankUuidSet.has(id) || bankNameSet.has((id || '').toLowerCase()) || (!bankUuidSet.size && /sanju/i.test(id || ''));

  const classified = txns.map((txn) => {
    const j = txn.Journal_entry || [];
    const ledgerLeg = j.find((e) => isCash(e.Account_id) || isBank(e.Account_id));
    const otherLeg  = j.find((e) => e !== ledgerLeg);

    const book      = ledgerLeg ? (isBank(ledgerLeg.Account_id) ? 'bank' : 'cash') : 'cash';
    const direction = ledgerLeg?.Type === 'Debit' ? 'in' : 'out';
    // Resolve UUID → name, fall back to raw Account_id if not in map
    const rawId     = otherLeg?.Account_id || '—';
    const account   = customerMap[rawId] || rawId;

    return { txn, book, direction, account };
  });

  const cashIn  = classified.filter((r) => r.book === 'cash' && r.direction === 'in');
  const cashOut = classified.filter((r) => r.book === 'cash' && r.direction === 'out');
  const bank    = classified.filter((r) => r.book === 'bank');

  const totalIn  = cashIn.reduce((s, r)  => s + (r.txn.Total_Debit  || 0), 0);
  const totalOut = cashOut.reduce((s, r) => s + (r.txn.Total_Credit || 0), 0);

  const TxnTable = ({ rows, color, title }) => (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} color={color} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          {title}
        </Typography>
        <Typography variant="caption" fontWeight={700} color={color}>
          {money(rows.reduce((s, r) => s + r.txn.Total_Debit, 0))}
        </Typography>
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Account</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ txn, account }) => (
              <TableRow key={txn._id} hover>
                <TableCell sx={{ color: 'text.disabled', fontSize: 11 }}>{txn.Transaction_id}</TableCell>
                <TableCell>
                  <Typography variant="body2">{txn.Description}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={account} size="small" color="primary" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Chip label={txn.Payment_mode || 'Cash'} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>{money(txn.Total_Debit)}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <>
      <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
        Historical record from the ledger — read-only. To edit, use Receipt / Payment entry pages.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        {[
          { label: 'Cash Receipts', value: totalIn,  color: 'success.dark' },
          { label: 'Cash Payments', value: totalOut, color: 'error.dark' },
          { label: 'Bank Entries',  value: bank.reduce((s, r) => s + r.txn.Total_Debit, 0), color: 'info.dark' },
          { label: 'Total Entries', value: txns.length, color: 'text.primary', isCount: true },
        ].map(({ label, value, color, isCount }) => (
          <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" fontWeight={900} color={color}>
                {isCount ? value : money(value)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <TxnTable rows={cashIn}  title="Cash Receipts (IN)"  color="success.dark" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <TxnTable rows={cashOut} title="Cash Payments (OUT)" color="error.dark" />
        </Box>
      </Stack>

      {bank.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'info.main' }}>
          <Typography variant="subtitle2" fontWeight={700} color="info.dark" sx={{ mb: 1 }}>
            Bank Entries — UPI Sanju SK
          </Typography>
          <TxnTable rows={bank} title="Bank Entries" color="info.dark" />
        </Paper>
      )}
    </>
  );
}

// =================== BANK STATEMENT ENTRIES (unmatched, from uploaded bank statement) ===================
function BankStmtEntryRow({ entry, onAssign, onConfirm, onReject, ledgerAccounts = [] }) {
  const [editing, setEditing] = useState(false);
  const [acct, setAcct]       = useState(entry.account_assigned || '');
  const [saving, setSaving]   = useState(false);

  const save = async (overrideAcct) => {
    const finalAcct = overrideAcct ?? acct;
    if (!finalAcct) return;
    setSaving(true);
    await onAssign(entry.statement_uuid, entry.entry_uuid, finalAcct);
    setSaving(false);
    setEditing(false);
  };

  const amt = entry.credit > 0 ? entry.credit : entry.debit;
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  return (
    <TableRow
      hover
      sx={{
        bgcolor: entry.entry_status === 'rejected' ? 'error.50' : '#ede7f6',
        opacity: entry.entry_status === 'rejected' ? 0.5 : 1,
      }}
    >
      <TableCell sx={{ width: 90, fontSize: 11, color: 'text.disabled' }}>
        {entry.txn_date ? new Date(entry.txn_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
      </TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight={600} sx={{ fontSize: 12 }}>{entry.description || '—'}</Typography>
        {entry.ref_no && <Typography variant="caption" color="text.disabled">{entry.ref_no}</Typography>}
        <Chip
          label={entry.direction === 'in' ? 'CR' : 'DR'}
          size="small"
          color={entry.direction === 'in' ? 'success' : 'error'}
          variant="outlined"
          sx={{ ml: 0.5, height: 16, fontSize: 9 }}
        />
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight={700}>{money(amt)}</Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        {editing ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Autocomplete
              freeSolo size="small" options={ledgerAccounts}
              value={acct}
              onInputChange={(_, v) => setAcct(v)}
              onChange={(_, v) => setAcct(v || '')}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select account" sx={{ width: 190 }} />
              )}
            />
            <IconButton size="small" color="success" onClick={() => save()} disabled={saving || !acct}>
              <CheckCircleRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => { setEditing(false); setAcct(entry.account_assigned || ''); }}>
              <CancelRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : entry.account_assigned ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip label={entry.account_assigned} size="small" color="secondary" variant="outlined" />
            {entry.entry_status !== 'confirmed' && entry.entry_status !== 'rejected' && (
              <IconButton size="small" onClick={() => { setAcct(entry.account_assigned); setEditing(true); }}>
                <EditRoundedIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        ) : (
          entry.entry_status !== 'rejected' && (
            <Button
              size="small" variant="outlined" color="secondary"
              startIcon={<EditRoundedIcon sx={{ fontSize: 13 }} />}
              onClick={() => setEditing(true)}
              sx={{ fontSize: 11, py: 0.25, px: 1 }}
            >
              Assign Account
            </Button>
          )
        )}
      </TableCell>
      <TableCell align="center" sx={{ width: 130 }}>
        {entry.entry_status === 'confirmed' ? (
          <Chip label="✓ Confirmed" color="success" size="small" />
        ) : entry.entry_status === 'rejected' ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip label="Skipped" color="error" size="small" />
            <Tooltip title="Restore">
              <IconButton size="small" color="warning" onClick={() => onReject(entry.statement_uuid, entry.entry_uuid, false)}>
                <CancelRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} justifyContent="center">
            {entry.account_assigned && (
              <Tooltip title="Confirm & post to ledger">
                <Button
                  size="small" variant="contained" color="secondary"
                  onClick={() => onConfirm(entry.statement_uuid, entry.entry_uuid)}
                  sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: 11, height: 22 }}
                >
                  ✓ Post
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Skip this entry">
              <IconButton size="small" color="error" onClick={() => onReject(entry.statement_uuid, entry.entry_uuid, true)}>
                <CancelRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </TableCell>
    </TableRow>
  );
}

function BankStmtSection({ entries, onAssign, onConfirm, onReject, ledgerAccounts }) {
  if (!entries.length) return null;
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const total = entries
    .filter((e) => e.entry_status !== 'rejected')
    .reduce((s, e) => s + (e.credit > 0 ? e.credit : e.debit), 0);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 3, borderColor: 'secondary.main', bgcolor: '#fdf5ff', mb: 2 }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} color="secondary.dark">
            Bank Statement Entries — Not in Diary
          </Typography>
          <Typography variant="caption" color="text.secondary">
            These entries are from your uploaded bank statement but have no matching diary entry.
            Assign accounts and post them, then remind your team to write them in the physical diary.
          </Typography>
        </Box>
        <Chip
          label={`${entries.filter((e) => e.entry_status !== 'confirmed').length} pending`}
          size="small" color="secondary" variant="outlined"
        />
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, borderColor: 'secondary.light' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#ede7f6' }}>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <BankStmtEntryRow
                key={e.entry_uuid}
                entry={e}
                onAssign={onAssign}
                onConfirm={onConfirm}
                onReject={onReject}
                ledgerAccounts={ledgerAccounts}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.5 }}>
        <Typography variant="caption" fontWeight={700} color="secondary.dark">
          Total pending: {money(total)}
        </Typography>
      </Stack>
    </Paper>
  );
}

// =================== MAIN PAGE ===================
export default function DayBook() {
  const { uuid: selectedUuid } = useParams();
  const [searchParams] = useSearchParams();
  const ledgerDateParam = searchParams.get('date'); // YYYY-MM-DD for historical view
  const navigate = useNavigate();

  const [diaryList, setDiaryList]         = useState([]);
  const [ledgerDates, setLedgerDates]     = useState([]);  // historical dates
  const [diary, setDiary]                 = useState(null);
  const [ledgerTxns, setLedgerTxns]       = useState(null); // historical transactions
  const [ledgerMeta, setLedgerMeta]       = useState({ cashAccounts: [], cashNames: [], bankAccounts: [], bankNames: [] });
  const [bankStmtEntries, setBankStmtEntries] = useState([]); // unmatched bank statement entries for date
  const [loading, setLoading]             = useState(false);
  const [listLoading, setListLoading]     = useState(true);
  const [confirming, setConfirming]       = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [error, setError]                 = useState('');
  const [successMsg, setSuccessMsg]       = useState('');
  const [ledgerAccounts, setLedgerAccounts] = useState([]);
  const [customerMap, setCustomerMap]       = useState({});

  const loggedInUser = localStorage.getItem('User_name') || 'user';

  // --- load diary list + ledger dates ---
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const [draftRes, ldRes] = await Promise.all([
        axios.get('/api/diary'),
        axios.get('/api/diary/ledger-dates'),
      ]);
      setDiaryList(Array.isArray(draftRes.data?.result) ? draftRes.data.result : []);
      setLedgerDates(Array.isArray(ldRes.data?.result) ? ldRes.data.result : []);
    } catch {
      setDiaryList([]);
      setLedgerDates([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  // --- load single diary + bank statement entries for that date ---
  const loadDiary = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    setBankStmtEntries([]);
    try {
      const res = await axios.get(`/api/diary/${uid}`);
      const d = res.data?.result || null;
      setDiary(d);
      if (d?.diary_date) {
        const dateStr = new Date(d.diary_date).toISOString().slice(0, 10);
        axios.get(`/api/bank-statement/by-date?date=${dateStr}`)
          .then((r) => setBankStmtEntries(Array.isArray(r.data?.result) ? r.data.result : []))
          .catch(() => {});
      }
    } catch {
      setError('Could not load diary. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedUuid) {
      setLedgerTxns(null);
      loadDiary(selectedUuid);
    }
  }, [selectedUuid, loadDiary]);

  useEffect(() => {
    if (!ledgerDateParam) {
      setLedgerTxns(null);
      setLedgerMeta({ cashAccounts: [], cashNames: [], bankAccounts: [], bankNames: [] });
      return;
    }
    setDiary(null);
    setLoading(true);
    setError('');
    axios.get(`/api/diary/ledger?date=${ledgerDateParam}`)
      .then((res) => {
        setLedgerTxns(Array.isArray(res.data?.result) ? res.data.result : []);
        setLedgerMeta(res.data?.meta || { cashAccounts: [], cashNames: [], bankAccounts: [], bankNames: [] });
      })
      .catch(() => setError('Could not load transactions.'))
      .finally(() => setLoading(false));
  }, [ledgerDateParam]);

  useEffect(() => {
    axios.get('/api/customers/GetCustomersList')
      .then((res) => {
        const all = Array.isArray(res.data?.result) ? res.data.result : [];
        // Build UUID → name map for all customers (used in LedgerDayView display)
        const map = {};
        all.forEach((c) => { if (c.Customer_uuid) map[c.Customer_uuid] = c.Customer_name; });
        setCustomerMap(map);
        // Dropdown: only Bank and Account group, sorted names
        const accounts = all
       
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

  const handleSelectLedgerDate = (date) => {
    navigate(`${ROUTES.DAY_BOOK}?date=${date}`);
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

  // --- bank statement entry handlers ---
  const handleBsAssign = useCallback(async (stmtUuid, entryUuid, account) => {
    await axios.put(`/api/bank-statement/${stmtUuid}/entry/${entryUuid}`, { account_assigned: account });
    setBankStmtEntries((prev) =>
      prev.map((e) => (e.entry_uuid === entryUuid ? { ...e, account_assigned: account } : e))
    );
  }, []);

  const handleBsConfirm = useCallback(async (stmtUuid, entryUuid) => {
    try {
      await axios.post(`/api/bank-statement/${stmtUuid}/entry/${entryUuid}/confirm`, {
        confirmed_by: loggedInUser,
      });
      setBankStmtEntries((prev) =>
        prev.map((e) => (e.entry_uuid === entryUuid ? { ...e, entry_status: 'confirmed' } : e))
      );
      setSuccessMsg('Bank entry posted to ledger.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not confirm entry.');
    }
  }, [loggedInUser]);

  const handleBsReject = useCallback(async (stmtUuid, entryUuid, reject) => {
    const newStatus = reject ? 'rejected' : 'pending';
    await axios.put(`/api/bank-statement/${stmtUuid}/entry/${entryUuid}`, { entry_status: newStatus });
    setBankStmtEntries((prev) =>
      prev.map((e) => (e.entry_uuid === entryUuid ? { ...e, entry_status: newStatus } : e))
    );
  }, []);

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
        ) : (() => {
          // Merge diary drafts + ledger dates into one sorted list
          const draftDateSet = new Set(
            diaryList.map((d) => new Date(d.diary_date).toISOString().slice(0, 10))
          );
          // Ledger dates not already covered by a draft
          const extraLedgerDates = ledgerDates.filter((ld) => !draftDateSet.has(ld));

          const sidebarItems = [
            ...diaryList.map((d) => ({
              key: d.diary_uuid,
              date: new Date(d.diary_date),
              label: fmtDate(d.diary_date),
              sub: d.status === 'confirmed' ? '✓ Confirmed' : 'Draft',
              subColor: d.status === 'confirmed' ? 'success.main' : 'warning.main',
              onClick: () => handleSelectDiary(d.diary_uuid),
              selected: d.diary_uuid === selectedUuid,
            })),
            ...extraLedgerDates.map((ld) => ({
              key: `ledger-${ld}`,
              date: new Date(ld),
              label: fmtDate(ld),
              sub: 'Manual entries',
              subColor: 'info.main',
              onClick: () => handleSelectLedgerDate(ld),
              selected: ledgerDateParam === ld,
            })),
          ].sort((a, b) => b.date - a.date);

          return (
            <List dense disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
              {sidebarItems.map((item) => (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton selected={item.selected} onClick={item.onClick} sx={{ borderRadius: 2 }}>
                    <ListItemText
                      primary={item.label}
                      secondary={item.sub}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                      secondaryTypographyProps={{ variant: 'caption', color: item.subColor }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {!sidebarItems.length && (
                <ListItem>
                  <ListItemText
                    primary="No records yet"
                    secondary="Upload a CSV to start"
                    primaryTypographyProps={{ variant: 'caption', color: 'text.disabled' }}
                  />
                </ListItem>
              )}
            </List>
          );
        })()}
      </Paper>

      {/* ---- RIGHT: diary detail ---- */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              Day Book{diary ? ` — ${fmtDate(diary.diary_date)}` : ledgerDateParam ? ` — ${fmtDate(ledgerDateParam)}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {ledgerDateParam ? 'Historical cash/bank transactions (read-only)' : 'Review diary entries, assign accounts, then confirm to post transactions'}
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
        {!selectedUuid && !ledgerDateParam && !loading && (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Select a day from the list, or upload a new CSV.
            </Typography>
            <Button variant="contained" onClick={() => navigate(ROUTES.DIARY_UPLOAD)} startIcon={<AddRoundedIcon />}>
              Upload Diary CSV
            </Button>
          </Paper>
        )}

        {/* Historical ledger view (read-only) */}
        {ledgerDateParam && !loading && ledgerTxns && (
          <LedgerDayView
            txns={ledgerTxns}
            date={ledgerDateParam}
            cashAccounts={ledgerMeta.cashAccounts}
            cashNames={ledgerMeta.cashNames || []}
            bankAccounts={ledgerMeta.bankAccounts}
            bankNames={ledgerMeta.bankNames || []}
            customerMap={customerMap}
          />
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

            {/* Bank entries (from diary) */}
            {bankEntries.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'info.main', mb: 2 }}>
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

            {/* Bank statement entries not in diary (purple section) */}
            <BankStmtSection
              entries={bankStmtEntries}
              onAssign={handleBsAssign}
              onConfirm={handleBsConfirm}
              onReject={handleBsReject}
              ledgerAccounts={ledgerAccounts}
            />
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
