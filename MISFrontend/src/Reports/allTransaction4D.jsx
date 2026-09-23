import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
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
import { getVoucherInfo } from '../utils/voucher';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const todayStr = () => new Date().toISOString().slice(0, 10);
const normalizeName = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── Section table (same columns as Day Book) ──────────────────────────────────
// `kind` is the direction of the section: money in is a receipt for the party,
// money out a payment. Both legs of every row here are cash or bank.
function TxnTable({ rows, title, color, customerMap = {}, kind = 'receipt' }) {
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
              <TableCell sx={{ fontWeight: 700, width: 55 }}>Txn #</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Voucher #</TableCell>
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
                <TableCell sx={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {getVoucherInfo({
                    transaction: row.txn,
                    entry: { Type: kind === 'receipt' ? 'Credit' : 'Debit' },
                    counterIsCashOrBank: true,
                  }).display || '—'}
                </TableCell>
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

function SummaryCards({ opening, receipts, payments, closing, prefix }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
      {[
        { label: 'Opening Balance', value: opening, color: 'text.primary' },
        { label: `${prefix} Receipts (+)`, value: receipts, color: 'success.dark' },
        { label: `${prefix} Payments (−)`, value: payments, color: 'error.dark' },
        { label: 'Closing Balance', value: closing, color: closing >= 0 ? 'success.dark' : 'error.dark' },
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

export default function AllTransaction() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [activeBook, setActiveBook] = useState('cash');
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('/api/transaction'),
      axios.get('/api/customers/GetCustomersList'),
      axios.get('/api/accounts'),
    ])
      .then(([txRes, custRes, acctRes]) => {
        if (txRes.data.success) setTransactions(txRes.data.result);
        if (custRes.data.success) setCustomers(custRes.data.result);
        if (acctRes.data.accounts) setAccounts(acctRes.data.accounts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const customerMap = customers.reduce((acc, c) => {
    if (c.Customer_uuid) acc[c.Customer_uuid] = c.Customer_name;
    return acc;
  }, {});
  const accountsMap = accounts.reduce((acc, a) => {
    if (a.Account_uuid) acc[a.Account_uuid] = a.Account_name;
    return acc;
  }, {});

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resolveName = (otherLeg) => {
    const rawId = otherLeg?.Account_id || '—';
    const storedName = otherLeg?.Account_name || '';
    if (storedName && !UUID_RE.test(storedName)) return storedName;
    return customerMap[rawId] || accountsMap[rawId] || rawId;
  };

  const ledgerAccounts = customers.filter((c) => c.Customer_group === 'Bank and Account');

  // Resolve the three books by ledger master name, never by hard-coded UUID.
  // This keeps existing account IDs portable across databases.
  const findLedgerDocs = (matcher) => ledgerAccounts.filter((c) => matcher(normalizeName(c.Customer_name)));
  const cashDocs = findLedgerDocs((name) => name.includes('cash'));
  const sanjuDocs = findLedgerDocs((name) => name.includes('sanju') && !name.includes('office'));
  const officeDocs = findLedgerDocs((name) => name.includes('office'));

  const buildMatcher = (docs, fallback) => {
    const uuidSet = new Set(docs.map((c) => c.Customer_uuid).filter(Boolean));
    const nameSet = new Set(docs.map((c) => normalizeName(c.Customer_name)));
    return (id) => {
      if (uuidSet.has(id)) return true;
      const normalized = normalizeName(id || '');
      if (nameSet.has(normalized)) return true;
      return uuidSet.size === 0 && nameSet.size === 0 ? fallback(normalized) : false;
    };
  };

  const books = useMemo(() => ([
    {
      id: 'cash',
      label: 'Cash',
      docs: cashDocs,
      isAccount: buildMatcher(cashDocs, (name) => name === 'cash' || name.includes('cash')),
      color: 'success',
    },
    {
      id: 'upi-sanju-sk',
      label: 'UPI Sanju SK',
      docs: sanjuDocs,
      isAccount: buildMatcher(sanjuDocs, (name) => name.includes('sanju') && !name.includes('office')),
      color: 'info',
    },
    {
      id: 'upi-office',
      label: 'UPI Office',
      docs: officeDocs,
      isAccount: buildMatcher(officeDocs, (name) => name.includes('office')),
      color: 'secondary',
    },
  ]), [cashDocs, sanjuDocs, officeDocs]);

  const availableDates = Array.from(
    new Set(transactions.map((txn) => new Date(txn.Transaction_date).toISOString().slice(0, 10)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const dateCountMap = transactions.reduce((map, txn) => {
    const date = new Date(txn.Transaction_date).toISOString().slice(0, 10);
    if (date) map[date] = (map[date] || 0) + 1;
    return map;
  }, {});

  const dayTxns = selectedDate
    ? transactions.filter((txn) => new Date(txn.Transaction_date).toISOString().slice(0, 10) === selectedDate)
    : transactions;

  const calcOpening = (isAccountFn) => {
    if (!selectedDate) return 0;
    let dr = 0;
    let cr = 0;
    for (const txn of transactions) {
      if (new Date(txn.Transaction_date).toISOString().slice(0, 10) >= selectedDate) continue;
      for (const leg of txn.Journal_entry || []) {
        if (!isAccountFn(leg.Account_id)) continue;
        if (leg.Type === 'Debit') dr += leg.Amount || 0;
        else cr += leg.Amount || 0;
      }
    }
    return dr - cr;
  };

  const classify = (isAccountFn) =>
    dayTxns
      .map((txn) => {
        const journal = txn.Journal_entry || [];
        const acctLeg = journal.find((e) => isAccountFn(e.Account_id));
        const otherLeg = journal.find((e) => e !== acctLeg);
        if (!acctLeg) return null;
        return {
          txn,
          direction: acctLeg.Type === 'Debit' ? 'in' : 'out',
          amount: acctLeg.Amount || txn.Total_Debit || 0,
          account: resolveName(otherLeg),
        };
      })
      .filter(Boolean);

  const bookSummaries = books.map((book) => {
    const rows = classify(book.isAccount);
    const inRows = rows.filter((r) => r.direction === 'in');
    const outRows = rows.filter((r) => r.direction === 'out');
    const receipts = inRows.reduce((sum, row) => sum + row.amount, 0);
    const payments = outRows.reduce((sum, row) => sum + row.amount, 0);
    const opening = calcOpening(book.isAccount);
    return {
      ...book,
      rows,
      inRows,
      outRows,
      receipts,
      payments,
      opening,
      closing: opening + receipts - payments,
    };
  });

  const activeSummary = bookSummaries.find((book) => book.id === activeBook) || bookSummaries[0];
  const selectedBookTxnCount = activeSummary?.rows?.length || 0;

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>
      <DeliveryDateSidebar
        title="Cash & Bank"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={transactions.length}
        loading={loading}
        countLabel="transactions"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={0.75}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mb: 1 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Cash & Bank</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedDate ? fmtDate(selectedDate) : 'All Dates'} · {selectedBookTxnCount} {activeSummary?.label || ''} transactions
            </Typography>
          </Box>
          <TextField
            label="Date"
            type="date"
            size="small"
            value={selectedDate || ''}
            onChange={(e) => setSelectedDate(e.target.value || null)}
            InputLabelProps={{ shrink: true }}
            sx={{ display: { xs: 'block', md: 'none' }, minWidth: 160 }}
          />
        </Stack>

        <Paper variant="outlined" sx={{ mb: 1.25, borderRadius: 2.5, overflow: 'hidden' }}>
          <Tabs
            value={activeBook}
            onChange={(_, value) => setActiveBook(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Cash and bank account tabs"
            sx={{ minHeight: 44, '& .MuiTab-root': { minHeight: 44, fontWeight: 800, textTransform: 'none' } }}
          >
            {bookSummaries.map((book) => (
              <Tab
                key={book.id}
                value={book.id}
                label={`${book.label} (${book.rows.length})`}
              />
            ))}
          </Tabs>
        </Paper>

        {loading && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>}

        {!loading && activeSummary && (
          <Paper
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 2.5,
              borderColor: activeSummary.id === 'cash' ? 'divider' : `${activeSummary.color}.main`,
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight={800}
              color={activeSummary.id === 'cash' ? 'text.primary' : `${activeSummary.color}.dark`}
              sx={{ mb: 1.5 }}
            >
              {activeSummary.label}
              {activeSummary.docs.length ? ` — ${activeSummary.docs.map((doc) => doc.Customer_name).join(' / ')}` : ''}
            </Typography>

            <SummaryCards
              opening={activeSummary.opening}
              receipts={activeSummary.receipts}
              payments={activeSummary.payments}
              closing={activeSummary.closing}
              prefix={activeSummary.label}
            />

            {activeSummary.rows.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                No {activeSummary.label} transactions found for this selection.
              </Typography>
            ) : (
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1}>
                <Box sx={{ flex: 1 }}>
                  <TxnTable
                    rows={activeSummary.inRows}
                    kind="receipt"
                    title={`${activeSummary.label} Receipts (IN)`}
                    color="success.dark"
                    customerMap={customerMap}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <TxnTable
                    rows={activeSummary.outRows}
                    kind="payment"
                    title={`${activeSummary.label} Payments (OUT)`}
                    color="error.dark"
                    customerMap={customerMap}
                  />
                </Box>
              </Stack>
            )}
          </Paper>
        )}
      </Box>
    </Box>
  );
}
