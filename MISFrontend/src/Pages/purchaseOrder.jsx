import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import axios from '../apiClient';
import { fetchVendorMasters } from '../services/vendorService';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const emptyItem = () => ({ itemName: '', qty: 1, unit: 'Nos', rate: 0, amount: 0 });
const statusColor = { draft: 'default', sent: 'info', received: 'success', cancelled: 'error' };

export default function PurchaseOrder() {
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ status: '', vendorId: '', fromDate: '', toDate: '' });
  const [form, setForm] = useState({ Vendor_uuid: '', Order_uuid: '', expectedDelivery: '', notes: '', Items: [emptyItem()] });

  const load = async () => {
    const [poRes, vendorRows, orderRes] = await Promise.all([
      axios.get('/api/purchaseorder/list', { params: filters }),
      fetchVendorMasters(),
      axios.get('/api/vendors/orders/list').catch(() => ({ data: { result: [] } })),
    ]);
    setRows(Array.isArray(poRes?.data?.result) ? poRes.data.result : []);
    setVendors(Array.isArray(vendorRows) ? vendorRows : []);
    setOrders(Array.isArray(orderRes?.data?.result) ? orderRes.data.result : []);
  };

  useEffect(() => { load().catch((e) => console.error(e)); }, []);
  const total = useMemo(() => form.Items.reduce((s, item) => s + Number(item.amount || Number(item.qty || 0) * Number(item.rate || 0)), 0), [form.Items]);

  const updateItem = (index, patch) => setForm((prev) => ({ ...prev, Items: prev.Items.map((row, i) => {
    if (i !== index) return row;
    const next = { ...row, ...patch };
    next.amount = Number(next.qty || 0) * Number(next.rate || 0);
    return next;
  }) }));

  const save = async (status = 'draft') => {
    if (!form.Vendor_uuid) return;
    await axios.post('/api/purchaseorder/create', { ...form, status, createdBy: localStorage.getItem('User_name') || 'System' });
    setForm({ Vendor_uuid: '', Order_uuid: '', expectedDelivery: '', notes: '', Items: [emptyItem()] });
    setTab(0);
    await load();
  };

  const updateStatus = async (po, status) => { await axios.put(`/purchaseorder/${po.PO_uuid}/status`, { status }); await load(); };

  return <Box sx={{ p: { xs: 1, md: 2 } }}><Typography variant="h5" fontWeight={900} sx={{ mb: 1 }}>Purchase Orders</Typography><Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}><Tab label="PO List" /><Tab label="Create New PO" /></Tabs>{tab === 0 ? <><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }}><TextField select size="small" label="Status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} sx={{ minWidth: 140 }}><MenuItem value="">All</MenuItem>{['draft','sent','received','cancelled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField><TextField select size="small" label="Vendor" value={filters.vendorId} onChange={(e) => setFilters((p) => ({ ...p, vendorId: e.target.value }))} sx={{ minWidth: 220 }}><MenuItem value="">All</MenuItem>{vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}</TextField><TextField size="small" type="date" label="From" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} InputLabelProps={{ shrink: true }} /><TextField size="small" type="date" label="To" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} InputLabelProps={{ shrink: true }} /><Button variant="contained" onClick={load}>Apply</Button></Stack><TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}><Table size="small"><TableHead><TableRow><TableCell>PO #</TableCell><TableCell>Date</TableCell><TableCell>Vendor</TableCell><TableCell>Items Summary</TableCell><TableCell align="right">Total Amount</TableCell><TableCell>Expected Delivery</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell></TableRow></TableHead><TableBody>{rows.map((po) => <TableRow key={po.PO_uuid} hover><TableCell>#{po.PO_Number}</TableCell><TableCell>{new Date(po.createdAt).toLocaleDateString('en-IN')}</TableCell><TableCell>{po.Vendor_name}</TableCell><TableCell>{(po.Items || []).slice(0,2).map((i) => i.itemName).join(', ')}{(po.Items || []).length > 2 ? ` +${po.Items.length - 2}` : ''}</TableCell><TableCell align="right">{money(po.totalAmount)}</TableCell><TableCell>{po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-IN') : '-'}</TableCell><TableCell><Chip size="small" color={statusColor[po.status] || 'default'} label={po.status} /></TableCell><TableCell><Stack direction="row" spacing={0.5}>{po.status !== 'received' && po.status !== 'cancelled' ? <Button size="small" onClick={() => updateStatus(po, 'received')}>Mark Received</Button> : null}{po.status !== 'cancelled' ? <Button size="small" color="error" onClick={() => updateStatus(po, 'cancelled')}>Cancel</Button> : null}</Stack></TableCell></TableRow>)}</TableBody></Table></TableContainer></> : <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}><Stack spacing={1.2}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1}><TextField select required label="Vendor" value={form.Vendor_uuid} onChange={(e) => setForm((p) => ({ ...p, Vendor_uuid: e.target.value }))} fullWidth>{vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}</TextField><TextField select label="Link to Order" value={form.Order_uuid} onChange={(e) => setForm((p) => ({ ...p, Order_uuid: e.target.value }))} fullWidth><MenuItem value="">None</MenuItem>{orders.map((o) => <MenuItem key={o.Order_uuid} value={o.Order_uuid}>#{o.Order_Number}</MenuItem>)}</TextField><TextField type="date" label="Expected Delivery" value={form.expectedDelivery} onChange={(e) => setForm((p) => ({ ...p, expectedDelivery: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /></Stack><TextField label="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} multiline minRows={2} />{form.Items.map((item, index) => <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1}><TextField label="Item Name" value={item.itemName} onChange={(e) => updateItem(index, { itemName: e.target.value })} fullWidth /><TextField label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(index, { qty: e.target.value })} /><TextField label="Unit" value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })} /><TextField label="Rate" type="number" value={item.rate} onChange={(e) => updateItem(index, { rate: e.target.value })} /><TextField label="Amount" value={item.amount} disabled /><IconButton color="error" onClick={() => setForm((p) => ({ ...p, Items: p.Items.filter((_, i) => i !== index) }))}><DeleteRoundedIcon /></IconButton></Stack>)}<Button startIcon={<AddRoundedIcon />} onClick={() => setForm((p) => ({ ...p, Items: [...p.Items, emptyItem()] }))}>Add Item</Button><Typography variant="h6" fontWeight={900}>Total: {money(total)}</Typography><Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => save('draft')}>Save as Draft</Button><Button variant="contained" onClick={() => save('sent')}>Send to Vendor</Button></Stack></Stack></Paper>}</Box>;
}
