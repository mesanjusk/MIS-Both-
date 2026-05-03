import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import axios from '../apiClient';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function DispatchQueue() {
  const [readyOrders, setReadyOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/orders', { params: { stage: 'ready', limit: 100 } });
      const all = Array.isArray(res?.data?.result) ? res.data.result : Array.isArray(res?.data) ? res.data : [];
      const ready = all.filter((o) => {
        const stage = String(o.stage || (o.Status && o.Status.length ? o.Status[o.Status.length - 1]?.Task : '') || '').toLowerCase();
        return ['ready', 'finished', 'dispatch'].includes(stage);
      });
      setReadyOrders(ready);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load dispatch queue');
    } finally {
      setLoading(false);
    }
  };

  const markDispatched = async (orderId) => {
    try {
      await axios.post(`/api/orders/${orderId}/lifecycle`, { action: 'advance_stage', stage: 'delivered' });
      setSuccessMsg('Order marked as dispatched!');
      setTimeout(() => setSuccessMsg(''), 3000);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to mark dispatched');
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>Dispatch Queue</Typography>
          <Typography variant="body2" color="text.secondary">
            {readyOrders.length} order{readyOrders.length !== 1 ? 's' : ''} ready to dispatch
          </Typography>
        </Box>
        <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
      </Stack>

      {successMsg && <Alert severity="success" sx={{ mb: 1.5, borderRadius: 3 }}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 3 }}>{error}</Alert>}

      {readyOrders.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No orders pending dispatch right now.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Items</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {readyOrders.map((order) => (
                <TableRow key={order._id || order.Order_uuid} hover>
                  <TableCell><strong>#{order.Order_Number}</strong></TableCell>
                  <TableCell>{order.Customer_name || order.customerName || '—'}</TableCell>
                  <TableCell>
                    {(order.Items || order.items || []).slice(0, 2).map((item, i) => (
                      <div key={`${item.Item || item.itemName}-${i}`} style={{ fontSize: 12 }}>{item.Item || item.itemName} × {item.Quantity || item.qty}</div>
                    ))}
                    {(order.Items || order.items || []).length > 2 && (
                      <div style={{ fontSize: 11, color: '#888' }}>+{(order.Items || order.items).length - 2} more</div>
                    )}
                  </TableCell>
                  <TableCell align="right">{money(order.Total_Amount || order.totalAmount || order.Amount || order.saleSubtotal)}</TableCell>
                  <TableCell>{order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                  <TableCell><Chip label="Ready" color="success" size="small" /></TableCell>
                  <TableCell>
                    <Button size="small" variant="contained" startIcon={<LocalShippingRoundedIcon />} onClick={() => markDispatched(order.Order_uuid || order._id)}>
                      Dispatch
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
