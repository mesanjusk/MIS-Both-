import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import axios from '../apiClient.js';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Section table ─────────────────────────────────────────────────────────────
function TxnTable({ rows, title, color }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} color={color}
          sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
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
            {rows.map((row, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ color: 'text.disabled', fontSize: 11 }}>{row.txn.Transaction_id}</TableCell>
                <TableCell>
                  <Typography variant="body2">{row.txn.Description}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={row.account} size="small" color="primary" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Chip label={row.txn.Payment_mode || 'Cash'} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>{money(row.amount)}</Typography>
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
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('/api/transaction'),
      axios.get('/api/customers/GetCustomersList'),
    ])
      .then(([txRes, custRes]) => {
        if (txRes.data.success)   setTransactions(txRes.data.result);
        if (custRes.data.success) setCustomers(custRes.data.result);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Exact account names from Customer master (Customer_group === 'Bank and Account')
  const ledgerAccounts = customers.filter((c) => c.Customer_group === 'Bank and Account');
  const cashAccounts   = ledgerAccounts.filter((c) => /cash/i.test(c.Customer_name)).map((c) => c.Customer_name);
  const bankAccounts   = ledgerAccounts.filter((c) => /sanju/i.test(c.Customer_name)).map((c) => c.Customer_name);

  const cashSet = new Set(cashAccounts.map((n) => n.toLowerCase()));
  const bankSet = new Set(bankAccounts.map((n) => n.toLowerCase()));
  const isCash  = (id) => cashSet.size ? cashSet.has((id || '').toLowerCase()) : /^cash$/i.test(id || '');
  const isBank  = (id) => bankSet.size ? bankSet.has((id || '').toLowerCase()) : /sanju/i.test(id || '');

  // Filter transactions for selected date (client-side, original function)
  const dayTxns = transactions.filter((txn) => {
    const d = new Date(txn.Transaction_date).toISOString().slice(0, 10);
    return d === selectedDate;
  });

  // Classify each transaction
  const classified = dayTxns
    .map((txn) => {
      const j          = txn.Journal_entry || [];
      const ledgerLeg  = j.find((e) => isCash(e.Account_id) || isBank(e.Account_id));
      const otherLeg   = j.find((e) => e !== ledgerLeg);
      if (!ledgerLeg) return null;
      const book      = isBank(ledgerLeg.Account_id) ? 'bank' : 'cash';
      const direction = ledgerLeg.Type === 'Debit' ? 'in' : 'out';
      const amount    = ledgerLeg.Amount || txn.Total_Debit || 0;
      const account   = otherLeg?.Account_id || '—';
      return { txn, book, direction, amount, account };
    })
    .filter(Boolean);

  const cashIn  = classified.filter((r) => r.book === 'cash' && r.direction === 'in');
  const cashOut = classified.filter((r) => r.book === 'cash' && r.direction === 'out');
  const bank    = classified.filter((r) => r.book === 'bank');

  const totalCashIn  = cashIn.reduce((s, r)  => s + r.amount, 0);
  const totalCashOut = cashOut.reduce((s, r) => s + r.amount, 0);
  const totalBank    = bank.reduce((s, r)    => s + r.amount, 0);

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ── LEFT sidebar ── */}
      <Paper
        variant="outlined"
        sx={{
          width: 220, flexShrink: 0, borderRadius: 3,
          display: { xs: 'none', md: 'block' }, p: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Account Ledger</Typography>
        <Divider sx={{ mb: 2 }} />
        <TextField
          label="Date"
          type="date"
          size="small"
          fullWidth
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Paper>

      {/* ── RIGHT panel ── */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              Account Ledger{selectedDate ? ` — ${fmtDate(selectedDate)}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cash and bank transactions for the selected date
            </Typography>
          </Box>
        </Stack>

        {loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>}

        {!loading && (
          <>
            {/* Summary cards */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              {[
                { label: 'Cash Receipts', value: totalCashIn,       color: 'success.dark' },
                { label: 'Cash Payments', value: totalCashOut,      color: 'error.dark' },
                { label: 'Bank Entries',  value: totalBank,         color: 'info.dark' },
                { label: 'Total Entries', value: classified.length, color: 'text.primary', isCount: true },
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

            {classified.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                No cash or bank transactions found for {fmtDate(selectedDate)}.
              </Alert>
            ) : (
              <>
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
                      Bank Entries — {bankAccounts[0] || 'UPI Sanju SK'}
                    </Typography>
                    <TxnTable rows={bank} title="Bank Entries" color="info.dark" />
                  </Paper>
                )}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
