import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  Paper,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import axios from '../apiClient';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const ymd = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const prettyDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';

export default function AllTransaction() {
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ fromDate: '', toDate: '', paymentMode: 'All', transactionType: 'All', search: '', account: '' });

  const load = async () => {
    const [txnRes, custRes] = await Promise.all([axios.get('/api/transaction'), axios.get('/api/customers/GetCustomersList')]);
    setTransactions(Array.isArray(txnRes?.data?.result) ? txnRes.data.result : []);
    setCustomers(Array.isArray(custRes?.data?.result) ? custRes.data.result : []);
  };

  useEffect(() => { load().catch((e) => console.error(e)); }, []);

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.Customer_uuid, c.Customer_name])), [customers]);
  const modes = useMemo(() => ['All', ...new Set(transactions.map((t) => t.Payment_mode).filter(Boolean))], [transactions]);
  const accounts = useMemo(() => [...new Set(transactions.flatMap((t) => (t.Journal_entry || []).map((e) => e.Account_id || e.Account)).filter(Boolean))].sort(), [transactions]);

  const normalized = useMemo(() => transactions.map((txn) => {
    const debit = (txn.Journal_entry || []).find((e) => String(e.Type).toLowerCase() === 'debit');
    const credit = (txn.Journal_entry || []).find((e) => String(e.Type).toLowerCase() === 'credit');
    const inAmount = Number(txn.Total_Debit ?? debit?.Amount ?? 0);
    const outAmount = Number(txn.Total_Credit ?? credit?.Amount ?? 0);
    return {
      ...txn,
      id: txn.Transaction_uuid || txn._id,
      customerName: customerMap[txn.Customer_uuid] || customerMap[credit?.Account_id] || customerMap[debit?.Account_id] || '',
      inAmount,
      outAmount,
      transactionKind: inAmount >= outAmount ? 'Receipt' : 'Payment',
    };
  }).sort((a, b) => new Date(b.Transaction_date) - new Date(a.Transaction_date)), [transactions, customerMap]);

  const filtered = useMemo(() => normalized.filter((txn) => {
    const d = ymd(txn.Transaction_date);
    if (filters.fromDate && d < filters.fromDate) return false;
    if (filters.toDate && d > filters.toDate) return false;
    if (filters.paymentMode !== 'All' && txn.Payment_mode !== filters.paymentMode) return false;
    if (filters.transactionType !== 'All' && txn.transactionKind !== filters.transactionType) return false;
    const q = filters.search.toLowerCase();
    if (q && ![txn.Description, txn.Order_number, txn.Order_Number, txn.customerName].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }), [normalized, filters]);

  const summary = useMemo(() => ({
    cashIn: filtered.filter((t) => String(t.Payment_mode || '').toLowerCase().includes('cash')).reduce((s, t) => s + Number(t.inAmount || 0), 0),
    cashOut: filtered.filter((t) => String(t.Payment_mode || '').toLowerCase().includes('cash')).reduce((s, t) => s + Number(t.outAmount || 0), 0),
    totalIn: filtered.reduce((s, t) => s + Number(t.inAmount || 0), 0),
    totalOut: filtered.reduce((s, t) => s + Number(t.outAmount || 0), 0),
    count: filtered.length,
  }), [filtered]);

  const ledgerRows = useMemo(() => {
    if (!filters.account) return [];
    let balance = 0;
    return normalized
      .flatMap((txn) => (txn.Journal_entry || []).filter((e) => (e.Account_id || e.Account) === filters.account).map((entry) => ({ txn, entry })))
      .sort((a, b) => new Date(a.txn.Transaction_date) - new Date(b.txn.Transaction_date))
      .map(({ txn, entry }) => {
        const debit = String(entry.Type).toLowerCase() === 'debit' ? Number(entry.Amount || 0) : 0;
        const credit = String(entry.Type).toLowerCase() === 'credit' ? Number(entry.Amount || 0) : 0;
        balance += debit - credit;
        return { txn, debit, credit, balance };
      });
  }, [normalized, filters.account]);

  const exportExcel = () => {
    const rows = filtered.map((txn) => ({
      Date: prettyDate(txn.Transaction_date),
      'Txn #': txn.Transaction_id,
      Description: txn.Description,
      'Order #': txn.Order_number || txn.Order_Number || '',
      Customer: txn.customerName,
      Mode: txn.Payment_mode,
      'Debit/In': txn.inAmount,
      'Credit/Out': txn.outAmount,
      'Created By': txn.Created_by,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'Transactions_Report.xlsx');
  };

  const clear = () => setFilters({ fromDate: '', toDate: '', paymentMode: 'All', transactionType: 'All', search: '', account: '' });
  const pageRows = filtered.slice(page * 50, page * 50 + 50);

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 1 }}>Master Transaction Report</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }}>
        <TextField size="small" type="date" label="From Date" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To Date" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField select size="small" label="Payment Mode" value={filters.paymentMode} onChange={(e) => setFilters((p) => ({ ...p, paymentMode: e.target.value }))} sx={{ minWidth: 150 }}>{modes.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}</TextField>
        <TextField select size="small" label="Type" value={filters.transactionType} onChange={(e) => setFilters((p) => ({ ...p, transactionType: e.target.value }))} sx={{ minWidth: 130 }}>{['All', 'Receipt', 'Payment'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}</TextField>
        <TextField size="small" label="Search" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
        <Button variant="outlined" onClick={clear}>Clear</Button>
        <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={exportExcel}>Excel</Button>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
        {[['Total Cash In', summary.cashIn], ['Total Cash Out', summary.cashOut], ['Net Cash', summary.cashIn - summary.cashOut], ['Transactions', summary.count]].map(([label, value]) => <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}><CardContent sx={{ p: 1.25 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" fontWeight={900}>{typeof value === 'number' && label !== 'Transactions' ? money(value) : value}</Typography></CardContent></Card>)}
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}><Tab label="Transactions" /><Tab label="Account Ledger" /></Tabs>
      {tab === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '70vh' }}><Table stickyHeader size="small"><TableHead><TableRow>{['Date', 'Txn #', 'Description', 'Order #', 'Customer', 'Mode', 'Debit (In)', 'Credit (Out)', 'Created By'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{pageRows.map((txn) => <TableRow key={txn.id} hover sx={{ bgcolor: txn.transactionKind === 'Receipt' ? 'rgba(46,125,50,0.05)' : 'rgba(211,47,47,0.05)' }}><TableCell>{prettyDate(txn.Transaction_date)}</TableCell><TableCell>{txn.Transaction_id}</TableCell><TableCell>{txn.Description}</TableCell><TableCell>{txn.Order_number || txn.Order_Number || '-'}</TableCell><TableCell>{txn.customerName || '-'}</TableCell><TableCell><Chip size="small" label={txn.Payment_mode || '-'} /></TableCell><TableCell>{money(txn.inAmount)}</TableCell><TableCell>{money(txn.outAmount)}</TableCell><TableCell>{txn.Created_by || '-'}</TableCell></TableRow>)}</TableBody></Table></TableContainer><TablePagination component="div" count={filtered.length} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={50} rowsPerPageOptions={[50]} /></Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 3 }}><FormControl size="small" sx={{ minWidth: 240, mb: 1 }}><InputLabel>Account</InputLabel><Select label="Account" value={filters.account} onChange={(e) => setFilters((p) => ({ ...p, account: e.target.value }))}>{accounts.map((account) => <MenuItem key={account} value={account}>{account}</MenuItem>)}</Select></FormControl><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell><TableCell align="right">Running Balance</TableCell></TableRow></TableHead><TableBody>{ledgerRows.map((row, index) => <TableRow key={`${row.txn.id}-${index}`}><TableCell>{prettyDate(row.txn.Transaction_date)}</TableCell><TableCell>{row.txn.Description}</TableCell><TableCell align="right">{money(row.debit)}</TableCell><TableCell align="right">{money(row.credit)}</TableCell><TableCell align="right">{money(row.balance)}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
      )}
    </Box>
  );
}
