import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
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
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import axios from '../apiClient';
import { STAGE_LABELS, LEGACY_STAGE_LABELS } from '../constants/orderStages';
import { VENDOR_SECTIONS } from '../Components/orders/orderControlSections';
import { useRoleKey } from '../hooks/useRouteAccess';
import { ADMIN_ROLES, isRoleAllowed } from '../constants/roles';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';

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
const todayISO = new Date().toISOString().slice(0, 10);
const toISODate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

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
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  // Both ticked = everything. Unticking one narrows the list to the other.
  const [showPaid, setShowPaid] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  // Placeholder orders the design flow created for an unnumbered file.
  const [kind, setKind] = useState('all'); // 'all' | 'temp' | 'real'

  const [rows, setRows] = useState([]);
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
          stage: stage || undefined,
          search: search || undefined,
          payment,
          kind: kind === 'all' ? undefined : kind,
        },
      });
      setRows(res.data?.rows || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load orders');
    } finally { setLoading(false); }
  }, [stage, search, payment, kind]);

  useEffect(() => { load(); }, [load]);

  const availableDates = useMemo(() => {
    const set = new Set(rows.map((r) => toISODate(r.orderDate)).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const dateCountMap = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const date = toISODate(r.orderDate);
      if (date) map[date] = (map[date] || 0) + 1;
    });
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    if (!(showPaid || showBalance)) return [];
    if (!selectedDate) return rows;
    return rows.filter((r) => toISODate(r.orderDate) === selectedDate);
  }, [rows, selectedDate, showPaid, showBalance]);

  const displayTotals = useMemo(() => visible.reduce(
    (acc, r) => ({
      amount: acc.amount + Number(r.amount || 0),
      paid: acc.paid + Number(r.paid || 0),
      balance: acc.balance + Number(r.balance || 0),
    }),
    { amount: 0, paid: 0, balance: 0 },
  ), [visible]);

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : 'All Dates';

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
    XLSX.writeFile(wb, `orders-${selectedDate || 'all'}.xlsx`);
  };

  const exportPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text(`Orders — ${selectedLabel}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      styles: { fontSize: 8 },
      head: [['Date', 'Order No', 'Customer', 'Status', 'Amount', 'Paid', 'Balance', 'Payment']],
      body: visible.map((r) => [
        fmtDate(r.orderDate), r.orderNumber, r.customerName || '—', stageLabel(r.stage),
        money(r.amount), money(r.paid), money(r.balance), r.isPaid ? 'Paid' : 'Balance',
      ]),
      foot: visible.length ? [[
        '', '', '', `${visible.length} orders`,
        money(displayTotals.amount), money(displayTotals.paid), money(displayTotals.balance), '',
      ]] : undefined,
    });
    doc.save(`orders-${selectedDate || 'all'}.pdf`);
  };

  const resetFilters = () => {
    setStage('');
    setSearch('');
    setShowPaid(true);
    setShowBalance(true);
    setKind('all');
  };

  const setPaymentFilter = (value) => {
    if (value === 'paid') {
      setShowPaid(true);
      setShowBalance(false);
    } else if (value === 'balance') {
      setShowPaid(false);
      setShowBalance(true);
    } else {
      setShowPaid(true);
      setShowBalance(true);
    }
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
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>
      <DeliveryDateSidebar
        title="Orders"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={rows.length}
        loading={loading}
        countLabel="orders"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <LedgerTabs value={ledgerTab} onChange={setLedgerTab} showVendor={canSeeVendorPayable} />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mb: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Orders</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedLabel} · {visible.length} orders
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            sx={{ width: { xs: '100%', sm: 120 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="real">Real</MenuItem>
            <MenuItem value="temp">Temp</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Status"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            sx={{ width: { xs: '100%', sm: 135 } }}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Payment"
            value={payment}
            onChange={(e) => setPaymentFilter(e.target.value)}
            sx={{ width: { xs: '100%', sm: 125 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="balance">Balance</MenuItem>
          </TextField>

          <TextField
            size="small"
            placeholder="Search order / customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 190 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Tooltip title="Reset filters">
            <Button size="small" variant="outlined" onClick={resetFilters}
              sx={{ minWidth: 0, px: 1, borderRadius: 2, textTransform: 'none' }}>
              Reset
            </Button>
          </Tooltip>

          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          <ExportGuard>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Export as PDF">
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<PictureAsPdfRoundedIcon />}
                  onClick={exportPdf}
                  disabled={!visible.length}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
                >
                  PDF
                </Button>
              </Tooltip>
              <Tooltip title="Export as Excel">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FileDownloadRoundedIcon />}
                  onClick={exportExcel}
                  disabled={!visible.length}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
                >
                  Excel
                </Button>
              </Tooltip>
            </Stack>
          </ExportGuard>
        </Stack>

        <TextField
          type="date"
          size="small"
          value={selectedDate || ''}
          onChange={(e) => setSelectedDate(e.target.value || null)}
          sx={{ display: { xs: 'block', md: 'none' }, mb: 1, width: '100%' }}
          InputLabelProps={{ shrink: true }}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
          {[
            { label: 'Total Orders', value: visible.length, color: 'text.primary' },
            { label: 'Order Value', value: money(displayTotals.amount), color: 'text.primary' },
            { label: 'Paid', value: money(displayTotals.paid), color: 'success.dark' },
            { label: 'Balance', value: money(displayTotals.balance), color: 'warning.dark' },
          ].map((item) => (
            <Card key={item.label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" fontWeight={900} color={item.color}>{item.value}</Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {loading && <LinearProgress sx={{ mb: 1, height: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, maxHeight: '68vh' }}>
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
                    No orders found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ''}.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => (
                <TableRow key={r.orderId} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.orderDate)}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>#{r.orderNumber}</TableCell>
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
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ fontSize: 10.5, maxWidth: 320 }}>
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
                  <TableCell align="right" sx={{ color: r.balance ? 'warning.dark' : 'text.disabled', fontWeight: r.balance ? 700 : 400 }}>
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
