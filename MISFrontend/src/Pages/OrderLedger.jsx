import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
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
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import axios from '../apiClient';
import { STAGE_LABELS, LEGACY_STAGE_LABELS } from '../constants/orderStages';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

const stageLabel = (stage) => STAGE_LABELS[stage] || LEGACY_STAGE_LABELS[stage] || stage || '—';

/** First day of the current month / today, as the yyyy-mm-dd a date input wants. */
function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

export default function OrderLedger() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  // Both ticked = everything. Unticking one narrows the list to the other.
  const [showPaid, setShowPaid] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const payment = showPaid && !showBalance ? 'paid'
    : showBalance && !showPaid ? 'balance'
    : 'all';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/orders/reports/order-ledger', {
        params: { from, to, stage: stage || undefined, search: search || undefined, payment },
      });
      setRows(res.data?.rows || []);
      setTotals(res.data?.totals || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load orders');
    } finally { setLoading(false); }
  }, [from, to, stage, search, payment]);

  useEffect(() => { load(); }, [load]);

  const visible = showPaid || showBalance ? rows : [];

  const exportRows = () => visible.map((r) => ({
    Date: fmtDate(r.orderDate),
    'Order No': r.orderNumber,
    Customer: r.customerName || '—',
    Status: stageLabel(r.stage),
    Amount: r.amount,
    Paid: r.paid,
    Balance: r.balance,
    Payment: r.isPaid ? 'Paid' : 'Balance',
  }));

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders-${from}-to-${to}.xlsx`);
  };

  const exportPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text(`Orders  ${fmtDate(from)} – ${fmtDate(to)}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      styles: { fontSize: 8 },
      head: [['Date', 'Order No', 'Customer', 'Status', 'Amount', 'Paid', 'Balance', 'Payment']],
      body: visible.map((r) => [
        fmtDate(r.orderDate), r.orderNumber, r.customerName || '—', stageLabel(r.stage),
        money(r.amount), money(r.paid), money(r.balance), r.isPaid ? 'Paid' : 'Balance',
      ]),
      foot: totals ? [[
        '', '', '', `${visible.length} orders`,
        money(totals.amount), money(totals.paid), money(totals.balance), '',
      ]] : undefined,
    });
    doc.save(`orders-${from}-to-${to}.pdf`);
  };

  const resetFilters = () => {
    setFrom(initial.from); setTo(initial.to); setStage(''); setSearch('');
    setShowPaid(true); setShowBalance(true);
  };

  return (
    <Box>
      {/* Filters */}
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.25, mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            type="date" label="From" size="small" value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          />
          <TextField
            type="date" label="To" size="small" value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          />
          <TextField
            select label="Status" size="small" value={stage}
            onChange={(e) => setStage(e.target.value)} sx={{ width: 160 }}
          >
            <MenuItem value=""><em>All stages</em></MenuItem>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Search" size="small" placeholder="Order no or customer…"
            value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }}
          />

          <FormControlLabel
            control={<Checkbox size="small" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} color="success" />}
            label={<Typography variant="body2">Paid</Typography>}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={showBalance} onChange={(e) => setShowBalance(e.target.checked)} color="warning" />}
            label={<Typography variant="body2">Balance</Typography>}
          />

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Reset filters">
            <IconButton size="small" onClick={resetFilters}><ClearRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Button
            size="small" variant="outlined" onClick={exportExcel} disabled={!visible.length}
            startIcon={<FileDownloadRoundedIcon sx={{ fontSize: '16px !important' }} />}
          >
            Excel
          </Button>
          <Button
            size="small" variant="outlined" color="error" onClick={exportPdf} disabled={!visible.length}
            startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: '16px !important' }} />}
          >
            PDF
          </Button>
        </Stack>
      </Paper>

      {/* Totals */}
      {totals && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${visible.length} orders`} />
          <Chip size="small" variant="outlined" label={`Amount ${money(totals.amount)}`} />
          <Chip size="small" color="success" variant="outlined" label={`Paid ${money(totals.paid)}`} />
          <Chip size="small" color="warning" label={`Balance ${money(totals.balance)}`} />
        </Stack>
      )}

      {loading && <LinearProgress sx={{ mb: 1, height: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: '65vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Order No</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Customer Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Order Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Paid</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Balance</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">Payment</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No orders for these filters.
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => (
              <TableRow key={r.orderId} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.orderDate)}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>#{r.orderNumber}</TableCell>
                <TableCell>
                  {r.customerName || <Typography variant="caption" color="text.disabled">No customer</Typography>}
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={stageLabel(r.stage)} sx={{ height: 20, fontSize: 11 }} />
                </TableCell>
                <TableCell align="right">{money(r.amount)}</TableCell>
                <TableCell align="right" sx={{ color: r.paid ? 'success.dark' : 'text.disabled' }}>{money(r.paid)}</TableCell>
                <TableCell align="right" sx={{ color: r.balance ? 'warning.dark' : 'text.disabled', fontWeight: r.balance ? 700 : 400 }}>
                  {money(r.balance)}
                </TableCell>
                <TableCell align="center">
                  <Checkbox
                    size="small" checked={r.isPaid} readOnly disableRipple color="success"
                    inputProps={{ 'aria-label': r.isPaid ? 'Paid' : 'Balance' }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {totals && visible.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ pr: 1 }}>
            <Typography variant="body2" color="text.secondary">Total</Typography>
            <Typography variant="body2" fontWeight={700}>{money(totals.amount)}</Typography>
            <Typography variant="body2" color="success.dark" fontWeight={700}>{money(totals.paid)}</Typography>
            <Typography variant="body2" color="warning.dark" fontWeight={800}>{money(totals.balance)}</Typography>
          </Stack>
        </>
      )}
    </Box>
  );
}
