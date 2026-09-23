import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import { ORDER_STAGES } from '../constants/orderStages';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import SearchIcon from '@mui/icons-material/Search';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import ReceiptIcon from '@mui/icons-material/Receipt';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtAmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const isoDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const DELIVERED_STAGES = new Set(['delivered', 'paid']);

function orderAmount(order) {
  const itemsTotal = (order.Items || []).reduce((s, it) => s + (Number(it.Amount) || 0), 0);
  return Number(order.billTotal) || itemsTotal || Number(order.Amount) || 0;
}
function orderRemark(order) {
  if (order.Items?.length) return order.Items.map((it) => it.Remark || it.Item || '').filter(Boolean).join(', ');
  return order.Remark || order.orderNote || '—';
}
function latestTask(order) {
  const status = order.Status || [];
  return status.length ? (status[status.length - 1].Task || '—') : '—';
}
function delivered(order) {
  const stage = String(order.stage || '').toLowerCase();
  if (DELIVERED_STAGES.has(stage)) return true;
  return (order.Status || []).some((s) => String(s?.Task || '').toLowerCase().includes('delivered'));
}

export default function AllOrdersList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [view, setView] = useState(searchParams.get('view') || 'all');
  const [stageFilter, setStageFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [sidebarDateInput, setSidebarDateInput] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/orders/GetOrderList?limit=1000'),
      axios.get('/api/orders/GetDeliveredList'),
      axios.get('/api/orders/GetBillListPaged?page=1&limit=200'),
      axios.get('/api/customers/GetCustomersList'),
    ]).then(([activeRes, deliveredRes, billRes, custRes]) => {
      const active = activeRes.data?.success ? (activeRes.data.result || []) : [];
      const done = deliveredRes.data?.success ? (deliveredRes.data.result || []) : [];
      const bills = billRes.data?.success ? (billRes.data.result || []) : [];
      const byKey = new Map();
      [...active, ...done, ...bills].forEach((o) => {
        const key = o.Order_uuid || o._id;
        if (!key) return;
        byKey.set(key, { ...(byKey.get(key) || {}), ...o });
      });
      setOrders([...byKey.values()]);
      if (custRes.data?.success) setCustomers(custRes.data.result || []);
    }).catch(() => toast.error('Failed to load orders')).finally(() => setLoading(false));
  }, []);

  const customerMap = useMemo(
    () => Object.fromEntries(customers.filter((c) => c.Customer_uuid).map((c) => [c.Customer_uuid, c.Customer_name])),
    [customers]
  );

  const rows = useMemo(() => orders.map((o) => {
    const amount = orderAmount(o);
    const isDelivered = delivered(o);
    const billStatus = String(o.billStatus || 'unpaid').toLowerCase();
    const date = o.createdAt || o.updatedAt || '';
    return {
      order: o,
      customerName: o.Customer_name || customerMap[o.Customer_uuid] || o.Customer_uuid || '—',
      remark: orderRemark(o),
      amount,
      stage: String(o.stage || latestTask(o)).toLowerCase(),
      latestTask: latestTask(o),
      billStatus,
      isDelivered,
      isBillable: amount > 0,
      isComplete: isDelivered && (amount <= 0 || billStatus === 'paid'),
      date,
      dateISO: isoDate(date),
    };
  }), [orders, customerMap]);

  const quickFiltered = useMemo(() => rows.filter((r) => {
    if (view === 'active' && r.isDelivered) return false;
    if (view === 'payment' && (!r.isBillable || r.billStatus === 'paid')) return false;
    if (view === 'delivery' && r.isDelivered) return false;
    if (view === 'completed' && !r.isComplete) return false;
    return true;
  }), [rows, view]);

  const searchedRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return quickFiltered.filter((r) => {
      if (stageFilter && r.stage !== stageFilter && r.latestTask.toLowerCase() !== stageFilter) return false;
      if (q && ![r.order.Order_Number, r.customerName, r.remark, r.stage, r.latestTask].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [quickFiltered, searchText, stageFilter]);

  const availableDates = useMemo(() => {
    const set = new Set(searchedRows.map((r) => r.dateISO).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [searchedRows]);

  const dateCountMap = useMemo(() => {
    const map = {};
    searchedRows.forEach((r) => { if (r.dateISO) map[r.dateISO] = (map[r.dateISO] || 0) + 1; });
    return map;
  }, [searchedRows]);

  const filtered = useMemo(
    () => selectedDate ? searchedRows.filter((r) => r.dateISO === selectedDate) : searchedRows,
    [searchedRows, selectedDate]
  );

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => !r.isDelivered).length,
    payment: rows.filter((r) => r.isBillable && r.billStatus !== 'paid').length,
    delivery: rows.filter((r) => !r.isDelivered).length,
    completed: rows.filter((r) => r.isComplete).length,
  }), [rows]);

  const stats = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, r) => s + r.amount, 0),
    paymentDue: filtered.filter((r) => r.isBillable && r.billStatus !== 'paid').length,
    deliveryPending: filtered.filter((r) => !r.isDelivered).length,
    completed: filtered.filter((r) => r.isComplete).length,
  }), [filtered]);

  const quickViews = [
    ['all', 'All'], ['active', 'Active'], ['payment', 'Payment Due'], ['delivery', 'Delivery Pending'], ['completed', 'Completed'],
  ];

  const setQuickView = (next) => {
    setView(next);
    setSelectedDate(null);
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('view'); else p.set('view', next);
    setSearchParams(p, { replace: true });
  };

  const goToDate = () => { if (sidebarDateInput) setSelectedDate(sidebarDateInput); };
  const selectedLabel = selectedDate ? fmtDate(selectedDate) : 'All Dates';

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>
      <Paper
        variant="outlined"
        sx={{ width: 210, flexShrink: 0, borderRadius: 3, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', overflow: 'hidden', height: 'calc(100vh - 80px)', position: 'sticky', top: 16 }}
      >
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>Orders</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
            <TextField
              type="date"
              size="small"
              value={sidebarDateInput}
              onChange={(e) => setSidebarDateInput(e.target.value)}
              sx={{ flex: 1, '& input': { fontSize: 12, py: 0.6 } }}
              InputLabelProps={{ shrink: true }}
            />
            <Tooltip title="Go to date">
              <Button size="small" onClick={goToDate} sx={{ minWidth: 34, px: 0.5 }}><EventIcon fontSize="small" /></Button>
            </Tooltip>
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          <Box
            onClick={() => setSelectedDate(null)}
            sx={{ px: 2, py: 1.25, cursor: 'pointer', bgcolor: selectedDate === null ? 'primary.main' : 'transparent', color: selectedDate === null ? 'primary.contrastText' : 'text.primary', '&:hover': { bgcolor: selectedDate === null ? 'primary.dark' : 'action.hover' } }}
          >
            <Typography variant="body2" fontWeight={700}>All Dates</Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>{searchedRows.length} orders</Typography>
          </Box>
          <Divider />
          {availableDates.map((date) => (
            <Box key={date}>
              <Box
                onClick={() => setSelectedDate(date)}
                sx={{ px: 2, py: 1.25, cursor: 'pointer', bgcolor: selectedDate === date ? 'primary.main' : 'transparent', color: selectedDate === date ? 'primary.contrastText' : 'text.primary', '&:hover': { bgcolor: selectedDate === date ? 'primary.dark' : 'action.hover' } }}
              >
                <Typography variant="body2" fontWeight={600}>{fmtDate(date)}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>{dateCountMap[date] || 0} orders</Typography>
              </Box>
              <Divider />
            </Box>
          ))}
        </Box>
      </Paper>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Orders</Typography>
            <Typography variant="body2" color="text.secondary">{selectedLabel} · {stats.count} orders · Production, billing, payment & delivery</Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Search order / customer"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            sx={{ width: { xs: '100%', sm: 210 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />

          <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
            <InputLabel>Stage</InputLabel>
            <Select value={stageFilter} label="Stage" onChange={(e) => setStageFilter(e.target.value)}>
              <MenuItem value="">All stages</MenuItem>
              {ORDER_STAGES.map((s) => <MenuItem key={s} value={s}>{s.replaceAll('_', ' ')}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          {quickViews.map(([key, label]) => (
            <Chip
              key={key}
              clickable
              onClick={() => setQuickView(key)}
              label={`${label} (${counts[key]})`}
              color={view === key ? 'primary' : 'default'}
              variant={view === key ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
          ))}
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
          {[
            { label: 'Orders', value: stats.count, color: 'text.primary' },
            { label: 'Order Value', value: fmtAmt(stats.value), color: 'primary.main' },
            { label: 'Payment Due', value: stats.paymentDue, color: 'error.dark' },
            { label: 'Delivery Pending', value: stats.deliveryPending, color: 'warning.dark' },
            { label: 'Completed', value: stats.completed, color: 'success.dark' },
          ].map((item) => (
            <Card key={item.label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" fontWeight={900} color={item.color}>{item.value}</Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No orders found for this selection.</Typography>
        ) : (
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <LocalShippingIcon fontSize="small" color="success" />
                <Typography variant="subtitle2" fontWeight={700} color="success.dark" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Orders Control
                </Typography>
              </Stack>
              <Typography variant="subtitle2" fontWeight={700} color="primary.main">{fmtAmt(stats.value)}</Typography>
            </Stack>

            <TableContainer sx={{ maxHeight: '66vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 56, px: 0.75 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, px: 0.75 }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 150, px: 0.75 }}>Remark</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 110, px: 0.75 }}>Stage</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 90, px: 0.75 }}>Amount</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 88, px: 0.75 }}>Payment</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 92, px: 0.75 }}>Delivery</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 112, px: 0.5 }}>·</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r, idx) => {
                    const id = r.order.Order_uuid || r.order._id;
                    return (
                      <TableRow key={id || idx} hover>
                        <TableCell sx={{ px: 0.75 }}><Typography variant="caption" fontWeight={800}>#{r.order.Order_Number}</Typography></TableCell>
                        <TableCell sx={{ px: 0.75 }}>
                          <Tooltip title={r.customerName}>
                            <Button variant="text" size="small" onClick={() => navigate(`/orderUpdate/${id}`)} sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 700, maxWidth: 170, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.customerName}
                            </Button>
                          </Tooltip>
                          <Typography variant="caption" color="text.secondary">{fmtDate(r.date)}</Typography>
                        </TableCell>
                        <TableCell sx={{ px: 0.75 }}>
                          <Tooltip title={r.remark}>
                            <Typography variant="caption" sx={{ display: 'block', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.remark}</Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ px: 0.75 }}><Chip size="small" variant="outlined" label={(r.stage || '—').replaceAll('_', ' ')} sx={{ height: 20, fontSize: 10.5 }} /></TableCell>
                        <TableCell align="right" sx={{ px: 0.75, fontWeight: 800 }}>{r.amount > 0 ? fmtAmt(r.amount) : '—'}</TableCell>
                        <TableCell align="center" sx={{ px: 0.75 }}>
                          <Chip size="small" label={r.isBillable ? (r.billStatus === 'paid' ? 'Paid' : 'Due') : 'No bill'} color={r.billStatus === 'paid' ? 'success' : r.isBillable ? 'error' : 'default'} variant="outlined" sx={{ height: 20, fontSize: 10.5 }} />
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.75 }}>
                          <Chip size="small" label={r.isDelivered ? 'Delivered' : 'Pending'} color={r.isDelivered ? 'success' : 'warning'} variant="outlined" sx={{ height: 20, fontSize: 10.5 }} />
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.5, whiteSpace: 'nowrap' }}>
                          <Tooltip title="Edit order"><Button size="small" onClick={() => navigate(`/orderUpdate/${id}`)} sx={{ minWidth: 28, px: 0.5 }}><EditIcon fontSize="small" /></Button></Tooltip>
                          <Tooltip title="Invoice"><Button size="small" onClick={() => navigate(`/reports/invoices?q=${encodeURIComponent(r.order.Order_Number || '')}`)} sx={{ minWidth: 28, px: 0.5 }}><ReceiptIcon fontSize="small" /></Button></Tooltip>
                          <Tooltip title="Delivery"><Button size="small" color="success" onClick={() => navigate(`/updateDelivery/${id}`)} sx={{ minWidth: 28, px: 0.5 }}><LocalShippingIcon fontSize="small" /></Button></Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
