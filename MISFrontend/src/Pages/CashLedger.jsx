import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CashLedger() {
  const [summary, setSummary] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  const load = async () => {
    const [summaryRes, txnRes] = await Promise.all([
      axios.get('/api/dashboard/cash-book-summary'),
      axios.get('/api/transaction', { params: { accountFilter: 'Cash', limit: 500 } }),
    ]);
    setSummary(summaryRes?.data || {});
    setTransactions(Array.isArray(txnRes?.data?.result) ? txnRes.data.result : []);
  };

  useEffect(() => { load().catch((e) => console.error(e)); }, []);

  const cashEntries = useMemo(() => transactions.flatMap((txn) => (txn.Journal_entry || [])
    .filter((entry) => {
      const acct = String(entry.Account_id || entry.Account || '').trim();
      return acct.toLowerCase() === 'cash' || acct === 'Cash';
    })
    .map((entry) => ({ ...entry, Transaction_date: txn.Transaction_date, Description: txn.Description, Transaction_id: txn.Transaction_id })))
    .filter((entry) => {
      const d = new Date(entry.Transaction_date).toISOString().slice(0, 10);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    }), [transactions, startDate, endDate]);

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(cashEntries.map((entry) => ({
      Date: new Date(entry.Transaction_date).toLocaleDateString('en-IN'),
      Description: entry.Description,
      Account: entry.Account_id || entry.Account,
      Debit: String(entry.Type).toLowerCase() === 'debit' ? entry.Amount : '',
      Credit: String(entry.Type).toLowerCase() === 'credit' ? entry.Amount : '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Ledger');
    XLSX.writeFile(wb, 'CashLedger.xlsx');
  };

  const cards = [
    ['Opening Balance', summary.openingBalance],
    ["Today's Receipts (+)", summary.todayReceipts],
    ["Today's Payments (-)", summary.todayPayments],
    ['Closing Balance', summary.closingBalance],
  ];

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Cash Ledger</Typography>
          <Typography variant="body2" color="text.secondary">
            As of {summary.lastTransactionTime ? new Date(summary.lastTransactionTime).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}
          </Typography>
        </Box>
        <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load}>Refresh</Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
        {cards.map(([label, value]) => (
          <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3, bgcolor: label === 'Closing Balance' ? (Number(value || 0) >= 0 ? 'success.50' : 'error.50') : 'background.paper' }}>
            <CardContent sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" fontWeight={900}>{money(value)}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {summary.closingBalance !== undefined && (
        <Alert severity={Number(summary.closingBalance) >= 0 ? 'success' : 'error'} sx={{ mb: 1.5, borderRadius: 3 }}>
          Closing Balance as of {new Date().toLocaleDateString('en-IN')}:
          <strong> {money(summary.closingBalance)}</strong>
          {Number(summary.closingBalance) < 0 ? ' — CHECK ENTRIES IMMEDIATELY' : ' — Verified'}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 1, borderRadius: 3, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField size="small" type="date" label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="contained" onClick={exportToExcel}>Export</Button>
          <Button variant="outlined" onClick={() => window.print()}>Print</Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell>Account</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell></TableRow></TableHead>
          <TableBody>
            {cashEntries.map((entry, idx) => (
              <TableRow key={entry.Transaction_id || idx} hover>
                <TableCell>{new Date(entry.Transaction_date).toLocaleDateString('en-IN')}</TableCell>
                <TableCell>{entry.Description}</TableCell>
                <TableCell>{entry.Account_id || entry.Account}</TableCell>
                <TableCell align="right">{String(entry.Type).toLowerCase() === 'debit' ? money(entry.Amount) : ''}</TableCell>
                <TableCell align="right">{String(entry.Type).toLowerCase() === 'credit' ? money(entry.Amount) : ''}</TableCell>
              </TableRow>
            ))}
            {!cashEntries.length ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>No cash entries found.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
