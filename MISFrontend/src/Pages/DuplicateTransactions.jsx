import { useState } from 'react';
import {
  Alert, Button, Card, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material';
import axios from '../apiClient';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const dates = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

export default function DuplicateTransactions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  async function findDuplicates() {
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const { data } = await axios.get('/api/transaction/duplicate-events', { cache: false });
      if (!data?.success || !Array.isArray(data.result)) throw new Error('Unexpected response');
      setReport(data);
    } catch (failure) {
      setError(failure.response?.data?.message || 'Could not check duplicate transactions. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Find Duplicate Transactions</Typography>
      <Typography variant="body2">
        Look up ledger entries that share an internal event key. Compare their references and amounts with the original payment.
      </Typography>
      <Button variant="contained" onClick={findDuplicates} disabled={busy} sx={{ alignSelf: 'flex-start' }}>
        {busy ? 'Checking ledger…' : 'Run Duplicate Check'}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {report?.result.length === 0 && <Alert severity="success">No shared event keys found.</Alert>}
      {report?.hasMore && <Alert severity="info">Showing the first 20 groups.</Alert>}
      {report?.result.map((group) => (
        <Card key={group.entries[0]?._id} variant="outlined">
          <Typography sx={{ p: 2 }} fontWeight={600}>
            {group.count} entries share one event key{group.count > group.entries.length ? ' (first 20 shown)' : ''}
          </Typography>
          <TableContainer>
            <Table size="small" aria-label="Transactions sharing an event key">
              <TableHead>
                <TableRow>
                  {['Transaction no.', 'Date', 'Amount', 'Description', 'Payment mode', 'Order no.', 'UPI reference', 'Record ID'].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {group.entries.map((entry) => {
                  const date = entry.Transaction_date ? new Date(entry.Transaction_date) : null;
                  return (
                    <TableRow key={entry._id}>
                      <TableCell sx={{ fontWeight: 700 }}>{entry.Transaction_id ?? '—'}</TableCell>
                      <TableCell>{date && !Number.isNaN(date.getTime()) ? dates.format(date) : '—'}</TableCell>
                      <TableCell>{entry.Total_Debit == null ? '—' : money.format(entry.Total_Debit)}</TableCell>
                      <TableCell>{entry.Description || '—'}</TableCell>
                      <TableCell>{entry.Payment_mode || '—'}</TableCell>
                      <TableCell>{entry.Order_number ?? '—'}</TableCell>
                      <TableCell>{entry.Upi_reference || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry._id}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ))}
    </Stack>
  );
}
