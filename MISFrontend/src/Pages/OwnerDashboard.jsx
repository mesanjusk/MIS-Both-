import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const age = (date) => {
  if (!date) return '—';
  const d = Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
  return d <= 0 ? 'Today' : `${d}d ago`;
};

export default function OwnerDashboard() {
  const [stuckOrders, setStuckOrders] = useState([]);
  const [outstanding, setOutstanding] = useState({});
  const [readyToDispatch, setReadyToDispatch] = useState([]);
  const [cashSummary, setCashSummary] = useState({});
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [stuckRes, outstandingRes, ordersRes, cashRes, stockRes] = await Promise.all([
        axios.get('/api/dashboard/stuck-orders').catch(() => ({ data: [] })),
        axios.get('/api/dashboard/outstanding-summary').catch(() => ({ data: {} })),
        axios.get('/api/orders', { params: { limit: 200 } }).catch(() => ({ data: { result: [] } })),
        axios.get('/api/dashboard/cash-book-summary').catch(() => ({ data: {} })),
        axios.get('/api/stock/summary').catch(() => ({ data: { items: [] } })),
      ]);
      setStuckOrders(Array.isArray(stuckRes?.data) ? stuckRes.data : Array.isArray(stuckRes?.data?.result) ? stuckRes.data.result : []);
      setOutstanding(outstandingRes?.data || {});
      const allOrders = Array.isArray(ordersRes?.data?.result) ? ordersRes.data.result : Array.isArray(ordersRes?.data) ? ordersRes.data : [];
      setReadyToDispatch(allOrders.filter((o) => {
        const stage = String(o.stage || (o.Status && o.Status.length ? o.Status[o.Status.length - 1]?.Task : '') || '').toLowerCase();
        return stage === 'ready' || stage === 'finished';
      }));
      setCashSummary(cashRes?.data || {});
      setStockItems(Array.isArray(stockRes?.data?.items) ? stockRes.data.items : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  const totalOutstanding = Number(outstanding.totalOutstandingAmount || outstanding.totalOutstanding || outstanding.total || 0);
  const overdue7 = Number(outstanding.overdue7Days || outstanding.overdue || 0);
  const lowStock = stockItems.filter((i) => Number(i.currentQty || 0) <= Number(i.reorderLevel || 5));

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Owner Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Typography>
        </Box>
        <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load}>Refresh</Button>
      </Stack>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          { label: 'Cash Balance', value: money(cashSummary.closingBalance), color: Number(cashSummary.closingBalance) >= 0 ? 'success.main' : 'error.main' },
          { label: 'Total Outstanding', value: money(totalOutstanding), color: totalOutstanding > 0 ? 'warning.main' : 'text.primary' },
          { label: 'Overdue > 7 Days', value: money(overdue7), color: overdue7 > 0 ? 'error.main' : 'success.main' },
          { label: 'Ready to Dispatch', value: `${readyToDispatch.length} orders`, color: readyToDispatch.length > 0 ? 'warning.main' : 'text.primary' },
        ].map((card) => (
          <Grid item xs={6} md={3} key={card.label}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent sx={{ p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                <Typography variant="h6" fontWeight={900} sx={{ color: card.color }}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Orders Not Started / Stuck &gt; 24h
        {stuckOrders.length > 0 && <Chip label={stuckOrders.length} color="error" size="small" sx={{ ml: 1 }} />}
      </Typography>
      {stuckOrders.length === 0 ? (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>All orders are moving. No stuck orders.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}>
          <Table size="small"><TableHead><TableRow><TableCell>Order #</TableCell><TableCell>Customer</TableCell><TableCell>Stage</TableCell><TableCell>Stuck Since</TableCell></TableRow></TableHead>
            <TableBody>{stuckOrders.slice(0, 10).map((o) => <TableRow key={o._id || o.Order_uuid} hover><TableCell><strong>#{o.Order_Number}</strong></TableCell><TableCell>{o.Customer_name || o.customerName}</TableCell><TableCell><Chip label={o.stage || o.currentStage || '—'} size="small" color="warning" /></TableCell><TableCell sx={{ color: 'error.main' }}>{age(o.stuckSince || o.updatedAt || o.createdAt)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Finished — Not Yet Dispatched {readyToDispatch.length > 0 && <Chip label={readyToDispatch.length} color="warning" size="small" sx={{ ml: 1 }} />}</Typography>
      {readyToDispatch.length === 0 ? (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>No orders waiting for dispatch.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}>
          <Table size="small"><TableHead><TableRow><TableCell>Order #</TableCell><TableCell>Customer</TableCell><TableCell align="right">Amount</TableCell><TableCell>Ready Since</TableCell></TableRow></TableHead>
            <TableBody>{readyToDispatch.slice(0, 10).map((o) => <TableRow key={o._id || o.Order_uuid} hover><TableCell><strong>#{o.Order_Number}</strong></TableCell><TableCell>{o.Customer_name || o.customerName}</TableCell><TableCell align="right">{money(o.Total_Amount || o.totalAmount || o.Amount || o.saleSubtotal)}</TableCell><TableCell sx={{ color: 'warning.main' }}>{age(o.updatedAt || o.createdAt)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Customer Outstanding &gt; 7 Days {overdue7 > 0 && <Chip label={money(overdue7)} color="error" size="small" sx={{ ml: 1 }} />}</Typography>
      <Alert severity={overdue7 > 0 ? 'error' : 'success'} sx={{ mb: 2, borderRadius: 3 }}>
        {overdue7 > 0 ? `Total overdue > 7 days: ${money(overdue7)} — Go to Aging Report for customer-wise details` : 'No overdue outstanding beyond 7 days.'}
      </Alert>

      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Inventory — Low Stock Alerts</Typography>
      {lowStock.length === 0 ? (
        <Alert severity="success" sx={{ borderRadius: 3 }}>All stock levels are adequate.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small"><TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Current Qty</TableCell><TableCell align="right">Reorder Level</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>{lowStock.map((item) => <TableRow key={item.itemUuid} hover><TableCell>{item.itemName}</TableCell><TableCell align="right">{item.currentQty} {item.unit}</TableCell><TableCell align="right">{item.reorderLevel || 5}</TableCell><TableCell><Chip label="Low Stock" color="error" size="small" /></TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
