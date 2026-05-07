import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient.js';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// ── Section table (cash receipts / cash payments / bank) ──────────────────────
function TxnTable({ rows, title, color }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (r.txn.Total_Debit || 0), 0);
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
              <TableCell sx={{ fontWeight: 700, width: 55 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Mode</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
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
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AllTransaction() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get('date');

  const [ledgerDates, setLedgerDates] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [txns, setTxns]               = useState([]);
  const [meta, setMeta]               = useState({ cashAccounts: [], bankAccounts: [] });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const loadDates = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await axios.get('/api/diary/ledger-dates');
      setLedgerDates(Array.isArray(res.data?.result) ? res.data.result : []);
    } catch { setLedgerDates([]); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadDates(); }, [loadDates]);

  useEffect(() => {
    if (!selectedDate) { setTxns([]); setMeta({ cashAccounts: [], bankAccounts: [] }); return; }
    setLoading(true);
    setError('');
    axios.get(`/api/diary/ledger?date=${selectedDate}`)
      .then((res) => {
        setTxns(Array.isArray(res.data?.result) ? res.data.result : []);
        setMeta(res.data?.meta || { cashAccounts: [], bankAccounts: [] });
      })
      .catch(() => setError('Could not load transactions.'))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // Classify each txn by cash/bank + direction using exact account names from meta
  const cashSet = new Set(meta.cashAccounts.map((n) => n.toLowerCase()));
  const bankSet = new Set(meta.bankAccounts.map((n) => n.toLowerCase()));
  const isCash  = (id) => cashSet.size ? cashSet.has((id || '').toLowerCase()) : /^cash$/i.test(id || '');
  const isBank  = (id) => bankSet.size ? bankSet.has((id || '').toLowerCase()) : /sanju/i.test(id || '');

  const classified = txns.map((txn) => {
    const j = txn.Journal_entry || [];
    const ledgerLeg = j.find((e) => isCash(e.Account_id) || isBank(e.Account_id));
    const otherLeg  = j.find((e) => e !== ledgerLeg);
    const book      = ledgerLeg ? (isBank(ledgerLeg.Account_id) ? 'bank' : 'cash') : 'cash';
    const direction = ledgerLeg?.Type === 'Debit' ? 'in' : 'out';
    return { txn, book, direction, account: otherLeg?.Account_id || '—' };
  });

  const cashIn  = classified.filter((r) => r.book === 'cash' && r.direction === 'in');
  const cashOut = classified.filter((r) => r.book === 'cash' && r.direction === 'out');
  const bank    = classified.filter((r) => r.book === 'bank');

  const totalCashIn  = cashIn.reduce((s, r)  => s + (r.txn.Total_Debit || 0), 0);
  const totalCashOut = cashOut.reduce((s, r) => s + (r.txn.Total_Debit || 0), 0);
  const totalBank    = bank.reduce((s, r)    => s + (r.txn.Total_Debit || 0), 0);

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ── LEFT: date sidebar (exact Day Book pattern) ── */}
      <Paper
        variant="outlined"
        sx={{ width: 220, flexShrink: 0, borderRadius: 3, display: { xs: 'none', md: 'block' } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, pb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>Account Ledger</Typography>
          <IconButton size="small" onClick={loadDates}><RefreshRoundedIcon fontSize="small" /></IconButton>
        </Stack>
        <Divider />
        {listLoading ? (
          <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
        ) : (
          <List dense disablePadding sx={{ overflowY: 'auto' }}>
            {ledgerDates.map((date) => (
              <ListItem key={date} disablePadding>
                <ListItemButton
                  selected={selectedDate === date}
                  onClick={() => setSearchParams({ date })}
                  sx={{ borderRadius: 2 }}
                >
                  <ListItemText
                    primary={fmtDate(date)}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {!ledgerDates.length && (
              <ListItem>
                <ListItemText
                  primary="No records found"
                  primaryTypographyProps={{ variant: 'caption', color: 'text.disabled' }}
                />
              </ListItem>
            )}
          </List>
        )}
      </Paper>

      {/* ── RIGHT: day detail ── */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              Account Ledger{selectedDate ? ` — ${fmtDate(selectedDate)}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cash and bank transactions for the selected date (read-only)
            </Typography>
          </Box>
        </Stack>

        {!selectedDate && !loading && (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">Select a date from the left to view transactions.</Typography>
          </Paper>
        )}

        {loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>}

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}

        {selectedDate && !loading && txns.length > 0 && (
          <>
            {/* Summary cards */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              {[
                { label: 'Cash Receipts',  value: totalCashIn,  color: 'success.dark' },
                { label: 'Cash Payments',  value: totalCashOut, color: 'error.dark' },
                { label: 'Bank Entries',   value: totalBank,    color: 'info.dark' },
                { label: 'Total Entries',  value: txns.length,  color: 'text.primary', isCount: true },
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

            {/* Cash section — IN and OUT side by side */}
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <TxnTable rows={cashIn}  title="Cash Receipts (IN)"  color="success.dark" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <TxnTable rows={cashOut} title="Cash Payments (OUT)" color="error.dark" />
              </Box>
            </Stack>

            {/* Bank section */}
            {bank.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'info.main' }}>
                <Typography variant="subtitle2" fontWeight={700} color="info.dark" sx={{ mb: 1 }}>
                  Bank Entries — {meta.bankAccounts[0] || 'UPI Sanju SK'}
                </Typography>
                <TxnTable rows={bank} title="Bank Entries" color="info.dark" />
              </Paper>
            )}
          </>
        )}

        {selectedDate && !loading && !error && txns.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            No cash or bank transactions found for this date.
          </Alert>
        )}
      </Box>
    </Box>
  );
}
