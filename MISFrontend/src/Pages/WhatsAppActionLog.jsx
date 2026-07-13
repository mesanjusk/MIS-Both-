import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, CircularProgress, MenuItem, Pagination, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';

const RESULT_COLOR = { success: 'success', denied: 'warning', error: 'error' };
const PAGE_SIZE = 25;

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function WhatsAppActionLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (result) params.result = result;
      if (orderNumber) params.orderNumber = orderNumber;
      const { data } = await axios.get('/api/whatsapp-action-log', { params });
      setRows(Array.isArray(data?.result) ? data.result : []);
      setTotal(Number(data?.total) || 0);
    } catch {
      toast.error('Failed to load WhatsApp action log');
    } finally {
      setLoading(false);
    }
  }, [page, result, orderNumber]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <HistoryRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>WhatsApp Action Log</Typography>
          <Typography variant="caption" color="text.secondary">
            Every order change triggered from a WhatsApp button — who, what, and whether it was allowed
          </Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, mt: 2 }}>
        <Select
          size="small"
          value={result}
          onChange={(e) => { setPage(1); setResult(e.target.value); }}
          displayEmpty
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All results</MenuItem>
          <MenuItem value="success">Success</MenuItem>
          <MenuItem value="denied">Denied</MenuItem>
          <MenuItem value="error">Error</MenuItem>
        </Select>
        <TextField
          size="small"
          placeholder="Order number"
          value={orderNumber}
          onChange={(e) => { setPage(1); setOrderNumber(e.target.value.replace(/\D/g, '')); }}
          sx={{ minWidth: 160 }}
        />
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Staff</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Order</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{formatWhen(row.createdAt)}</TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.userName || '—'}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.orderNumber != null ? `#${row.orderNumber}` : '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.result} color={RESULT_COLOR[row.result] || 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>{row.detail || '—'}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No WhatsApp order actions logged yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {pageCount > 1 && (
            <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
              <Pagination count={pageCount} page={page} onChange={(_, p) => setPage(p)} color="primary" size="small" />
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
