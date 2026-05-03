import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function TrialBalance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/dashboard/trial-balance');
      setRows(Array.isArray(res?.data?.accounts) ? res.data.accounts : []);
    } catch (e) {
      setError(`Failed to load trial balance. ${e?.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalDebit = rows.reduce((s, r) => s + Number(r.totalDebit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.totalCredit || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const balanced = diff < 0.01;

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Account: r.accountName,
      'Total Debit': r.totalDebit,
      'Total Credit': r.totalCredit,
      'Net Balance': r.totalDebit - r.totalCredit,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    XLSX.writeFile(wb, 'TrialBalance.xlsx');
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Trial Balance</Typography>
          <Typography variant="body2" color="text.secondary">All accounts — debits must equal credits</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
          <Button variant="contained" onClick={exportToExcel} disabled={rows.length === 0}>Export</Button>
        </Stack>
      </Stack>

      <Alert severity={balanced ? 'success' : 'error'} sx={{ mb: 1.5, borderRadius: 3 }}>
        {balanced
          ? `Balanced ✓ — Total Debits = Total Credits = ${money(totalDebit)}`
          : `NOT BALANCED ✗ — Difference: ${money(diff)}. Check your journal entries.`}
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Account</strong></TableCell>
              <TableCell align="right"><strong>Total Debit (Dr)</strong></TableCell>
              <TableCell align="right"><strong>Total Credit (Cr)</strong></TableCell>
              <TableCell align="right"><strong>Net Balance</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const net = Number(r.totalDebit || 0) - Number(r.totalCredit || 0);
              return (
                <TableRow key={r.accountName} hover>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell align="right">{r.totalDebit > 0 ? money(r.totalDebit) : '—'}</TableCell>
                  <TableCell align="right">{r.totalCredit > 0 ? money(r.totalCredit) : '—'}</TableCell>
                  <TableCell align="right" sx={{ color: net >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                    {money(Math.abs(net))} {net >= 0 ? 'Dr' : 'Cr'}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell><strong>TOTAL</strong></TableCell>
              <TableCell align="right"><strong>{money(totalDebit)}</strong></TableCell>
              <TableCell align="right"><strong>{money(totalCredit)}</strong></TableCell>
              <TableCell align="right" sx={{ color: balanced ? 'success.main' : 'error.main', fontWeight: 700 }}>
                {balanced ? '✓ Balanced' : `✗ Diff: ${money(diff)}`}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
