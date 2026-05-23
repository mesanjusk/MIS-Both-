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

// ── Section table (same columns as Day Book) ──────────────────────────────────
function TxnTable({ rows, title, color, customerMap = {} }) {
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
                  <Chip label={customerMap[row.txn.Payment_mode] || row.txn.Payment_mode || 'Cash'} size="small" variant="outlined" />
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

// ── 4 summary cards per account section ──────────────────────────────────────
function SummaryCards({ opening, receipts, payments, closing, prefix }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
      {[
        { label: 'Opening Balance',        value: opening,  color: 'text.primary' },
        { label: `${prefix} Receipts (+)`, value: receipts, color: 'success.dark' },
        { label: `${prefix} Payments (−)`, value: payments, color: 'error.dark' },
        { label: 'Closing Balance',        value: closing,  color: closing >= 0 ? 'success.dark' : 'error.dark' },
      ].map(({ label, value, color }) => (
        <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6" fontWeight={900} color={color}>{money(value)}</Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AllTransaction() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [accounts, setAccounts]         = useState([]);
  const [loading, setLoading]           = useState(true);

  // Original endpoints from allTransaction4D
  useEffect(() => {
    Promise.all([
      axios.get('/api/transaction'),
      axios.get('/api/customers/GetCustomersList'),
      axios.get('/api/accounts'),
    ])
      .then(([txRes, custRes, acctRes]) => {
        if (txRes.data.success)   setTransactions(txRes.data.result);
        if (custRes.data.success) setCustomers(custRes.data.result);
        if (acctRes.data.accounts) setAccounts(acctRes.data.accounts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // UUID → name maps for both customers and system accounts
  const customerMap = customers.reduce((acc, c) => { if (c.Customer_uuid) acc[c.Customer_uuid] = c.Customer_name; return acc; }, {});
  const accountsMap = accounts.reduce((acc, a) => { if (a.Account_uuid) acc[a.Account_uuid] = a.Account_name; return acc; }, {});

  // UUID regex — used to detect when Account_name was never resolved (old data)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const resolveName = (otherLeg) => {
    const rawId     = otherLeg?.Account_id || '—';
    const storedName = otherLeg?.Account_name || '';
    // Prefer the denormalized Account_name unless it still looks like a UUID (old unfixed entry)
    if (storedName && !UUID_RE.test(storedName)) return storedName;
    // Fall back to lookup maps
    return customerMap[rawId] || accountsMap[rawId] || rawId;
  };

  // Cash/Bank accounts — match by UUID (new txns) and name (old diary-confirmed txns)
  const ledgerAccounts = customers.filter((c) => c.Customer_group === 'Bank and Account');
  const cashDocs  = ledgerAccounts.filter((c) => /cash/i.test(c.Customer_name));
  const bankDocs  = ledgerAccounts.filter((c) => !/cash/i.test(c.Customer_name));
  const cashUuids = cashDocs.map((c) => c.Customer_uuid).filter(Boolean);
  const bankUuids = bankDocs.map((c) => c.Customer_uuid).filter(Boolean);
  const cashNameSet = new Set(cashDocs.map((c) => (c.Customer_name || '').toLowerCase()));
  const bankNameSet = new Set(bankDocs.map((c) => (c.Customer_name || '').toLowerCase()));
  const cashUuidSet = new Set(cashUuids);
  const bankUuidSet = new Set(bankUuids);
  const isCash = (id) => cashUuidSet.has(id) || cashNameSet.has((id || '').toLowerCase()) || (!cashUuidSet.size && /^cash$/i.test(id || ''));
  const isBank = (id) => bankUuidSet.has(id) || bankNameSet.has((id || '').toLowerCase());

  // Opening balance for an account = DR − CR of all txns BEFORE selected date
  const calcOpening = (isAccountFn) => {
    let dr = 0, cr = 0;
    for (const txn of transactions) {
      if (new Date(txn.Transaction_date).toISOString().slice(0, 10) >= selectedDate) continue;
      for (const leg of txn.Journal_entry || []) {
        if (!isAccountFn(leg.Account_id)) continue;
        if (leg.Type === 'Debit') dr += leg.Amount || 0;
        else                      cr += leg.Amount || 0;
      }
    }
    return dr - cr;
  };

  // Transactions for selected date, classified by account leg
  const dayTxns = transactions.filter(
    (txn) => new Date(txn.Transaction_date).toISOString().slice(0, 10) === selectedDate
  );

  const classify = (isAccountFn) =>
    dayTxns
      .map((txn) => {
        const j        = txn.Journal_entry || [];
        const acctLeg  = j.find((e) => isAccountFn(e.Account_id));
        const otherLeg = j.find((e) => e !== acctLeg);
        if (!acctLeg) return null;
        return {
          txn,
          direction: acctLeg.Type === 'Debit' ? 'in' : 'out',
          amount:    acctLeg.Amount || txn.Total_Debit || 0,
          account:   resolveName(otherLeg),
        };
      })
      .filter(Boolean);

  const cashRows = classify(isCash);
  const bankRows = classify(isBank);

  const cashIn  = cashRows.filter((r) => r.direction === 'in');
  const cashOut = cashRows.filter((r) => r.direction === 'out');
  const bankIn  = bankRows.filter((r) => r.direction === 'in');
  const bankOut = bankRows.filter((r) => r.direction === 'out');

  const cashReceipts = cashIn.reduce((s, r)  => s + r.amount, 0);
  const cashPayments = cashOut.reduce((s, r) => s + r.amount, 0);
  const bankReceipts = bankIn.reduce((s, r)  => s + r.amount, 0);
  const bankPayments = bankOut.reduce((s, r) => s + r.amount, 0);

  const cashOpening  = calcOpening(isCash);
  const bankOpening  = calcOpening(isBank);
  const cashClosing  = cashOpening + cashReceipts - cashPayments;
  const bankClosing  = bankOpening + bankReceipts - bankPayments;

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>

      {/* ── LEFT sidebar ── */}
      <Paper
        variant="outlined"
        sx={{ width: 220, flexShrink: 0, borderRadius: 3, display: { xs: 'none', md: 'block' }, p: 2 }}
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
            {/* ── CASH SECTION ── */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
                Cash — {cashDocs[0]?.Customer_name || 'Cash'}
              </Typography>
              <SummaryCards
                opening={cashOpening}
                receipts={cashReceipts}
                payments={cashPayments}
                closing={cashClosing}
                prefix="Cash"
              />
              {cashRows.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>No cash transactions for this date.</Alert>
              ) : (
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <TxnTable rows={cashIn}  title="Cash Receipts (IN)"  color="success.dark" customerMap={customerMap} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <TxnTable rows={cashOut} title="Cash Payments (OUT)" color="error.dark" customerMap={customerMap} />
                  </Box>
                </Stack>
              )}
            </Paper>

            {/* ── BANK SECTION ── */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: 'info.main' }}>
              <Typography variant="subtitle1" fontWeight={800} color="info.dark" sx={{ mb: 1.5 }}>
                Bank — {bankDocs.map((b) => b.Customer_name).join(' / ') || 'Bank'}
              </Typography>
              <SummaryCards
                opening={bankOpening}
                receipts={bankReceipts}
                payments={bankPayments}
                closing={bankClosing}
                prefix="Bank"
              />
              {bankRows.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>No bank transactions for this date.</Alert>
              ) : (
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <TxnTable rows={bankIn}  title="Bank Receipts (IN)"  color="success.dark" customerMap={customerMap} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <TxnTable rows={bankOut} title="Bank Payments (OUT)" color="error.dark" customerMap={customerMap} />
                  </Box>
                </Stack>
              )}
            </Paper>
          </>
        )}
      </Box>
    </Box>
  );
}
