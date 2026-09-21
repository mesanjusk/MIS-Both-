import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import ExportGuard from '../Components/ExportGuard';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import axios from '../apiClient';
import { STAGE_LABELS, LEGACY_STAGE_LABELS } from '../constants/orderStages';
import { VENDOR_SECTIONS } from '../Components/orders/orderControlSections';
import { useRoleKey } from '../hooks/useRouteAccess';
import { ADMIN_ROLES, isRoleAllowed } from '../constants/roles';

// Money owed to vendors is a ledger, not a pipeline, so it belongs beside the
// order ledger rather than on the work board. Lazy so its heavier query only
// runs when the tab is actually opened.
const OrderControlPanel = lazy(() => import('../Components/orders/OrderControlPanel'));

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

function LedgerTabs({ value, onChange, showVendor }) {
  // One tab is not a choice — hide the strip entirely for non-admins so the
  // ledger looks exactly as it did before.
  if (!showVendor) return null;
  return (
    <Tabs
      value={value}
      onChange={(_event, next) => onChange(next)}
      sx={{ minHeight: 36, mb: 1, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 800 } }}
    >
      <Tab value="orders" label="Orders" />
      <Tab value="vendorPayable" label="Vendor Payable" />
    </Tabs>
  );
}

LedgerTabs.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  showVendor: PropTypes.bool,
};

export default function OrderLedger() {
  // Vendor payables are money leaving the business. Gated on the same strict
  // Admin/Owner decision the route guards use — not AuthContext's loose
  // `isAdmin`, which admits "Office Admin" and excludes "Owner".
  const canSeeVendorPayable = isRoleAllowed(ADMIN_ROLES, useRoleKey());
  // 'orders' = the per-order ledger; 'vendorPayable' = what we owe out.
  const [ledgerTab, setLedgerTab] = useState('orders');
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  // Both ticked = everything. Unticking one narrows the list to the other.
  const [showPaid, setShowPaid] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  // Placeholder orders the design flow created for an unnumbered file.
  const [kind, setKind] = useState('all'); // 'all' | 'temp' | 'real'

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
        params: {
          from, to, stage: stage || undefined, search: search || undefined,
          payment, kind: kind === 'all' ? undefined : kind,
        },
      });
      setRows(res.data?.rows || []);
      setTotals(res.data?.totals || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load orders');
    } finally { setLoading(false); }
  }, [from, to, stage, search, payment, kind]);

  useEffect(() => { load(); }, [load]);

  const visible = showPaid || showBalance ? rows : [];

  const exportRows = () => visible.map((r) => ({
    Date: fmtDate(r.orderDate),
    'Order No': r.orderNumber,
    Customer: r.customerName || '—',
    Status: stageLabel(r.stage),
    Type: r.isTemporary ? 'Temp' : 'Order',
    'From file': r.sourceFile || '',
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

  // Vendor payables are money leaving the business, so they follow the same
  // Admin/Owner rule as the rest of the payment actions.
  if (canSeeVendorPayable && ledgerTab === 'vendorPayable') {
    return (
      <Box>
        <LedgerTabs value={ledgerTab} onChange={setLedgerTab} showVendor={canSeeVendorPayable} />
        <Suspense fallback={<LinearProgress />}>
          <OrderControlPanel sections={VENDOR_SECTIONS} embedded />
        </Suspense>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 1.5, p: { xs: 0.5, md: 1 } }}>
      {/* Delivery-style filter sidebar */}
      <Paper
        variant="outlined"
        sx={{
          width: 190,
          flexShrink: 0,
          borderRadius: 2.5,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 8,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 1.25 }}>
          <Typography variant="subtitle2" fontWeight={800}>Order Filters</Typography>
          <Typography variant="caption" color="text.secondary">Choose date range and status</Typography>
        </Box>
        <Divider />
        <Stack spacing={1} sx={{ p: 1.25 }}>
          <TextField
            type="date" label="From" size="small" value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ '& input': { fontSize: 12, py: 0.7 } }}
          />
          <TextField
            type="date" label="To" size="small" value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ '& input': { fontSize: 12, py: 0.7 } }}
          />
          <TextField
            select label="Type" size="small" value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <MenuItem value="all">All orders</MenuItem>
            <MenuItem value="real">Real orders</MenuItem>
            <MenuItem value="temp">Temp (from a file)</MenuItem>
          </TextField>
          <TextField
            select label="Status" size="small" value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <MenuItem value="">All stages</MenuItem>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          <Divider />
          <FormControlLabel
            sx={{ m: 0 }}
            control={<Checkbox size="small" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} color="success" />}
            label={<Typography variant="body2">Paid</Typography>}
          />
          <FormControlLabel
            sx={{ m: 0 }}
            control={<Checkbox size="small" checked={showBalance} onChange={(e) => setShowBalance(e.target.checked)} color="warning" />}
            label={<Typography variant="body2">Balance</Typography>}
          />
          <Button size="small" variant="outlined" startIcon={<ClearRoundedIcon />} onClick={resetFilters}
            sx={{ textTransform: 'none', borderRadius: 1.5 }}>
            Reset
          </Button>
        </Stack>
      </Paper>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <LedgerTabs value={ledgerTab} onChange={setLedgerTab} showVendor={canSeeVendorPayable} />

        {/* Delivery-style header toolbar */}
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={0.8}
          alignItems={{ xs: 'stretch', lg: 'center' }}
          sx={{ mb: 1 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Orders</Typography>
            <Typography variant="body2" color="text.secondary">
              {fmtDate(from)} – {fmtDate(to)} · {visible.length} order{visible.length === 1 ? '' : 's'}
            </Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Search order / customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', lg: 215 } }}
            InputProps={{
              startAdornment: <SearchRoundedIcon sx={{ mr: 0.75, fontSize: 18, color: 'text.secondary' }} />,
            }}
          />

          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={load} disabled={loading} sx={{ border: '1px solid', borderColor: 'divider' }}>
                {loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <ExportGuard>
              <Button size="small" variant="contained" onClick={exportExcel} disabled={!visible.length}
                startIcon={<FileDownloadRoundedIcon sx={{ fontSize: '16px !important' }} />}
                sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 800 }}>
                Excel
              </Button>
            </ExportGuard>
            <ExportGuard>
              <Button size="small" variant="contained" color="error" onClick={exportPdf} disabled={!visible.length}
                startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: '16px !important' }} />}
                sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 800 }}>
                PDF
              </Button>
            </ExportGuard>
          </Stack>

          {/* Mobile filters kept inline */}
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'flex', md: 'none' }, overflowX: 'auto' }}>
            <TextField type="date" size="small" value={from} onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 140 }} />
            <TextField type="date" size="small" value={to} onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 140 }} />
          </Stack>
        </Stack>

        {totals && (
          <Stack direction="row" spacing={0.75} sx={{ mb: 1, overflowX: 'auto', pb: 0.25 }}>
            {[
              { label: 'Orders', value: visible.length, color: 'text.primary' },
              { label: 'Amount', value: money(totals.amount), color: 'text.primary' },
              { label: 'Paid', value: money(totals.paid), color: 'success.dark' },
              { label: 'Balance', value: money(totals.balance), color: 'warning.dark' },
            ].map((item) => (
              <Card key={item.label} variant="outlined" sx={{ minWidth: 125, flex: 1, borderRadius: 2 }}>
                <CardContent sx={{ px: 1.1, py: 0.7, '&:last-child': { pb: 0.7 } }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="subtitle1" fontWeight={900} color={item.color} lineHeight={1.15}>{item.value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        {loading && <LinearProgress sx={{ mb: 1, height: 2, borderRadius: 1 }} />}
        {error && <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }} action={<Button size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5, maxHeight: '68vh' }}>
          <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { py: 0.75 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Order</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 800 }} align="right">Amount</TableCell>
                <TableCell sx={{ fontWeight: 800 }} align="right">Paid</TableCell>
                <TableCell sx={{ fontWeight: 800 }} align="right">Balance</TableCell>
                <TableCell sx={{ fontWeight: 800 }} align="center">Payment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No orders for these filters.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => (
                <TableRow key={r.orderId} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.orderDate)}</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>#{r.orderNumber}</TableCell>
                  <TableCell>
                    <Stack spacing={0} sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" noWrap>
                          {r.customerName || <Typography component="span" variant="caption" color="text.disabled">No customer</Typography>}
                        </Typography>
                        {r.isTemporary && (
                          <Chip size="small" color="warning" variant="outlined" label="temp"
                            sx={{ height: 16, fontSize: 9.5, '& .MuiChip-label': { px: 0.5 } }} />
                        )}
                      </Stack>
                      {r.sourceFile && (
                        <Tooltip title={r.sourceFile}>
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ fontSize: 10.5, maxWidth: 280 }}>
                            {r.sourceFile}
                          </Typography>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={stageLabel(r.stage)} sx={{ height: 20, fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="right">{money(r.amount)}</TableCell>
                  <TableCell align="right" sx={{ color: r.paid ? 'success.dark' : 'text.disabled' }}>{money(r.paid)}</TableCell>
                  <TableCell align="right" sx={{ color: r.balance ? 'warning.dark' : 'text.disabled', fontWeight: r.balance ? 800 : 400 }}>
                    {money(r.balance)}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      color={r.isPaid ? 'success' : 'warning'}
                      variant={r.isPaid ? 'filled' : 'outlined'}
                      label={r.isPaid ? 'Paid' : 'Balance'}
                      sx={{ height: 20, fontSize: 10.5, fontWeight: 800 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
