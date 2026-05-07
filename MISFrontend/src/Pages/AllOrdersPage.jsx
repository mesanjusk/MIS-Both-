import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
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
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SortByAlphaRoundedIcon from '@mui/icons-material/SortByAlphaRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import { useAuth } from '../context/AuthContext';

const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

const STAGES = ['All', 'enquiry', 'quoted', 'approved', 'design', 'printing', 'post_printing', 'finishing', 'ready', 'delivered', 'paid'];
const BILL_STATUSES = ['All', 'paid', 'unpaid'];

const STAGE_COLORS = {
  enquiry: 'default',
  quoted: 'info',
  approved: 'primary',
  design: 'secondary',
  printing: 'warning',
  post_printing: 'warning',
  finishing: 'warning',
  ready: 'success',
  delivered: 'success',
  paid: 'success',
};

function EditDialog({ open, order, onClose, onSaved }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (order) setForm({
      orderNote: order.orderNote || '',
      stage: order.stage || 'enquiry',
      priority: order.priority || 'medium',
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString().slice(0, 10) : '',
      billStatus: order.billStatus || 'unpaid',
    });
  }, [order]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/orders/updateOrder/${order._id}`, form);
      toast.success('Order updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Order #{order?.Order_Number}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Order Note" value={form.orderNote || ''} onChange={(e) => setForm((p) => ({ ...p, orderNote: e.target.value }))} multiline rows={2} fullWidth />
          <TextField select label="Stage" value={form.stage || ''} onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))} fullWidth>
            {STAGES.filter((s) => s !== 'All').map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select label="Priority" value={form.priority || ''} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} fullWidth>
            {['low', 'medium', 'high'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Due Date" type="date" value={form.dueDate || ''} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select label="Bill Status" value={form.billStatus || ''} onChange={(e) => setForm((p) => ({ ...p, billStatus: e.target.value }))} fullWidth>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, order, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/orders/${order.Order_uuid}`);
      toast.success('Order deleted');
      onDeleted();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Order #{order?.Order_Number}?</DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mt: 1 }}>
          This will permanently delete Order <strong>#{order?.Order_Number}</strong> for customer <strong>{order?.Customer_name}</strong>. This cannot be undone.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={confirm} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function RenumberDialog({ open, onClose, onDone }) {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      const res = await axios.post('/api/orders/renumberOrders');
      toast.success(res.data?.message || 'Renumbered successfully');
      onDone();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to renumber');
    } finally {
      setRunning(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Renumber All Orders?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mt: 1 }}>
          This will reassign sequential order numbers (1, 2, 3…) ordered by creation date. Use only after removing unwanted orders. This action is irreversible.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={run} disabled={running}>{running ? 'Renumbering…' : 'Renumber'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AllOrdersPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('All');
  const [billStatus, setBillStatus] = useState('All');

  const [editOrder, setEditOrder] = useState(null);
  const [deleteOrder, setDeleteOrder] = useState(null);
  const [showRenumber, setShowRenumber] = useState(false);

  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 500 };
      if (stage !== 'All') params.stage = stage;
      if (billStatus !== 'All') params.billStatus = billStatus;
      if (search.trim()) params.search = search.trim();
      const res = await axios.get('/api/orders/GetAllOrders', { params });
      setRows(Array.isArray(res.data?.result) ? res.data.result : []);
      setTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r.Order_Number || '').includes(q) ||
      String(r.Customer_name || '').toLowerCase().includes(q) ||
      String(r.orderNote || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + Number(r.Amount || r.saleSubtotal || 0), 0), [filtered]);

  const exportExcel = () => {
    const data = filtered.map((r) => ({
      'Order #': r.Order_Number,
      Customer: r.Customer_name || '',
      Note: r.orderNote || '',
      Stage: r.stage || '',
      Priority: r.priority || '',
      'Due Date': fmtDate(r.dueDate),
      'Bill Status': r.billStatus || '',
      'Amount (₹)': Number(r.Amount || r.saleSubtotal || 0),
      'Created': fmtDate(r.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `All_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('All Orders', 14, 15);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}  |  Total: ${filtered.length} records`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Order #', 'Customer', 'Note', 'Stage', 'Priority', 'Due Date', 'Bill', 'Amount (₹)', 'Created']],
      body: filtered.map((r) => [
        r.Order_Number,
        r.Customer_name || '',
        (r.orderNote || '').slice(0, 40),
        r.stage || '',
        r.priority || '',
        fmtDate(r.dueDate),
        r.billStatus || '',
        Number(r.Amount || r.saleSubtotal || 0).toLocaleString('en-IN'),
        fmtDate(r.createdAt),
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [25, 118, 210] },
    });
    doc.save(`All_Orders_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrint = useReactToPrint({ content: () => printRef.current });

  return (
    <Box p={{ xs: 1, md: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
        <Typography variant="h6" fontWeight={700}>All Orders</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Tooltip title="Export Excel">
            <Button size="small" startIcon={<FileDownloadRoundedIcon />} variant="outlined" onClick={exportExcel}>Excel</Button>
          </Tooltip>
          <Tooltip title="Export PDF">
            <Button size="small" startIcon={<PictureAsPdfRoundedIcon />} variant="outlined" color="error" onClick={exportPDF}>PDF</Button>
          </Tooltip>
          <Tooltip title="Print">
            <Button size="small" startIcon={<PrintRoundedIcon />} variant="outlined" color="secondary" onClick={handlePrint}>Print</Button>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Renumber all order numbers sequentially after deleting unwanted orders">
              <Button size="small" startIcon={<SortByAlphaRoundedIcon />} variant="outlined" color="warning" onClick={() => setShowRenumber(true)}>Renumber</Button>
            </Tooltip>
          )}
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load}><RefreshRoundedIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <TextField
            size="small"
            placeholder="Search order #, customer, note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <TextField select size="small" label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} sx={{ minWidth: 150 }}>
            {STAGES.map((s) => <MenuItem key={s} value={s}>{s === 'All' ? 'All Stages' : s}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Bill Status" value={billStatus} onChange={(e) => setBillStatus(e.target.value)} sx={{ minWidth: 130 }}>
            {BILL_STATUSES.map((s) => <MenuItem key={s} value={s}>{s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>)}
          </TextField>
          <Button size="small" variant="contained" onClick={load}>Apply</Button>
          <Button size="small" onClick={() => { setSearch(''); setStage('All'); setBillStatus('All'); }}>Reset</Button>
        </Stack>
      </Paper>

      {/* Summary chips */}
      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Chip label={`Showing: ${filtered.length}`} />
        <Chip label={`Total in DB: ${total}`} variant="outlined" />
        <Chip label={`Total Amount: ${fmt(totalAmount)}`} color="primary" variant="outlined" />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Table */}
      <Paper ref={printRef} variant="outlined">
        {/* Print-only header */}
        <Box sx={{ display: 'none', '@media print': { display: 'block' }, p: 2, pb: 0 }}>
          <Typography variant="h6">All Orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Printed: {new Date().toLocaleDateString('en-IN')} | Records: {filtered.length}
          </Typography>
          <Divider sx={{ mt: 1 }} />
        </Box>

        {loading ? (
          <Stack alignItems="center" py={6}><CircularProgress /></Stack>
        ) : (
          <TableContainer sx={{ maxHeight: '65vh', '@media print': { maxHeight: 'none' } }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Order #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Note / Items</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Stage</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Priority</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Due Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bill</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 700, '@media print': { display: 'none' } }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>#{row.Order_Number}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.Customer_name || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography variant="body2" noWrap title={row.orderNote}>
                        {row.orderNote || (row.Items?.map((i) => i.Item).join(', ')) || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.stage || '—'}
                        size="small"
                        color={STAGE_COLORS[row.stage] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.priority || '—'}
                        size="small"
                        color={row.priority === 'high' ? 'error' : row.priority === 'medium' ? 'warning' : 'default'}
                        variant="filled"
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.dueDate)}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.billStatus || 'unpaid'}
                        size="small"
                        color={row.billStatus === 'paid' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 500 }}>
                      {fmt(row.Amount || row.saleSubtotal || 0)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.createdAt)}</TableCell>
                    <TableCell sx={{ '@media print': { display: 'none' } }}>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Open order">
                          <IconButton size="small" onClick={() => navigate(`/orderUpdate/${row._id}`)}>
                            <OpenInNewRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <>
                            <Tooltip title="Edit">
                              <IconButton size="small" color="primary" onClick={() => setEditOrder(row)}>
                                <EditRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => setDeleteOrder(row)}>
                                <DeleteRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Dialogs */}
      <EditDialog open={!!editOrder} order={editOrder} onClose={() => setEditOrder(null)} onSaved={load} />
      <DeleteDialog open={!!deleteOrder} order={deleteOrder} onClose={() => setDeleteOrder(null)} onDeleted={load} />
      <RenumberDialog open={showRenumber} onClose={() => setShowRenumber(false)} onDone={load} />
    </Box>
  );
}
