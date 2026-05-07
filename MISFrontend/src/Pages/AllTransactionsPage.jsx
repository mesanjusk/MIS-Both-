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
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import { useAuth } from '../context/AuthContext';

const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

const PAYMENT_MODES = ['All', 'Cash', 'Bank', 'UPI', 'Cheque', 'Other'];

function EditDialog({ open, txn, onClose, onSaved }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (txn) setForm({
      Description: txn.Description || '',
      Transaction_date: txn.Transaction_date ? new Date(txn.Transaction_date).toISOString().slice(0, 10) : '',
      Payment_mode: txn.Payment_mode || '',
      Total_Debit: txn.Total_Debit ?? '',
      Total_Credit: txn.Total_Credit ?? '',
    });
  }, [txn]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.Description || !form.Transaction_date || !form.Payment_mode) {
      toast.error('Description, date and payment mode are required');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`/api/transaction/${txn.Transaction_uuid}`, {
        ...form,
        Total_Debit: Number(form.Total_Debit || 0),
        Total_Credit: Number(form.Total_Credit || 0),
        Created_by: txn.Created_by,
        Journal_entry: txn.Journal_entry,
      });
      toast.success('Transaction updated');
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
      <DialogTitle>Edit Transaction #{txn?.Transaction_id}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Description" value={form.Description || ''} onChange={(e) => setForm((p) => ({ ...p, Description: e.target.value }))} fullWidth />
          <TextField label="Date" type="date" value={form.Transaction_date || ''} onChange={(e) => setForm((p) => ({ ...p, Transaction_date: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select label="Payment Mode" value={form.Payment_mode || ''} onChange={(e) => setForm((p) => ({ ...p, Payment_mode: e.target.value }))} fullWidth>
            {['Cash', 'Bank', 'UPI', 'Cheque', 'Other'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField label="Debit (₹)" type="number" value={form.Total_Debit ?? ''} onChange={(e) => setForm((p) => ({ ...p, Total_Debit: e.target.value }))} fullWidth />
            <TextField label="Credit (₹)" type="number" value={form.Total_Credit ?? ''} onChange={(e) => setForm((p) => ({ ...p, Total_Credit: e.target.value }))} fullWidth />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, txn, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/transaction/${txn.Transaction_uuid}`);
      toast.success('Transaction deleted');
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
      <DialogTitle>Delete Transaction #{txn?.Transaction_id}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          This will permanently delete the transaction <strong>{txn?.Description}</strong>. This cannot be undone.
        </Typography>
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
      const res = await axios.post('/api/transaction/renumber');
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
      <DialogTitle>Renumber All Transactions?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mt: 1 }}>
          This will reassign sequential IDs (1, 2, 3…) to all transactions ordered by date. Existing ID references may break. Use only after removing unwanted records.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={run} disabled={running}>{running ? 'Renumbering…' : 'Renumber'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AllTransactionsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [editTxn, setEditTxn] = useState(null);
  const [deleteTxn, setDeleteTxn] = useState(null);
  const [showRenumber, setShowRenumber] = useState(false);

  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (paymentMode !== 'All') params.paymentMode = paymentMode;
      const res = await axios.get('/api/transaction', { params });
      setRows(Array.isArray(res.data?.result) ? res.data.result : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      return (
        String(r.Transaction_id || '').includes(q) ||
        String(r.Description || '').toLowerCase().includes(q) ||
        String(r.Created_by || '').toLowerCase().includes(q) ||
        String(r.Payment_mode || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const totalDebit = useMemo(() => filtered.reduce((s, r) => s + Number(r.Total_Debit || 0), 0), [filtered]);
  const totalCredit = useMemo(() => filtered.reduce((s, r) => s + Number(r.Total_Credit || 0), 0), [filtered]);

  const exportExcel = () => {
    const data = filtered.map((r) => ({
      'Txn #': r.Transaction_id,
      Date: fmtDate(r.Transaction_date),
      Description: r.Description,
      'Payment Mode': r.Payment_mode,
      Debit: r.Total_Debit || 0,
      Credit: r.Total_Credit || 0,
      'Created By': r.Created_by,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, `All_Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('All Transactions', 14, 15);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}  |  Total: ${filtered.length} records`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Txn #', 'Date', 'Description', 'Mode', 'Debit (₹)', 'Credit (₹)', 'Created By']],
      body: filtered.map((r) => [
        r.Transaction_id,
        fmtDate(r.Transaction_date),
        r.Description,
        r.Payment_mode,
        Number(r.Total_Debit || 0).toLocaleString('en-IN'),
        Number(r.Total_Credit || 0).toLocaleString('en-IN'),
        r.Created_by,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [25, 118, 210] },
    });
    doc.save(`All_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrint = useReactToPrint({ content: () => printRef.current });

  return (
    <Box p={{ xs: 1, md: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
        <Typography variant="h6" fontWeight={700}>All Transactions</Typography>
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
            <Tooltip title="Renumber all transaction IDs sequentially after deleting unwanted records">
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
            placeholder="Search description, ID, creator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <TextField select size="small" label="Payment Mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} sx={{ minWidth: 150 }}>
            {PAYMENT_MODES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <TextField size="small" label="From Date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="To Date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button size="small" variant="contained" onClick={load}>Apply</Button>
          <Button size="small" onClick={() => { setSearch(''); setPaymentMode('All'); setFromDate(''); setToDate(''); setRows([]); load(); }}>Reset</Button>
        </Stack>
      </Paper>

      {/* Summary chips */}
      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Chip label={`Records: ${filtered.length}`} />
        <Chip label={`Total Debit: ${fmt(totalDebit)}`} color="error" variant="outlined" />
        <Chip label={`Total Credit: ${fmt(totalCredit)}`} color="success" variant="outlined" />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Table */}
      <Paper ref={printRef} variant="outlined">
        {/* Print-only header */}
        <Box sx={{ display: 'none', '@media print': { display: 'block' }, p: 2, pb: 0 }}>
          <Typography variant="h6">All Transactions</Typography>
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
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Txn #</TableCell>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Mode</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Debit</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Credit</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created By</TableCell>
                  {isAdmin && <TableCell sx={{ fontWeight: 700, '@media print': { display: 'none' } }}>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{row.Transaction_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.Transaction_date)}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" noWrap title={row.Description}>{row.Description}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={row.Payment_mode || '—'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 500 }}>
                      {row.Total_Debit ? fmt(row.Total_Debit) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                      {row.Total_Credit ? fmt(row.Total_Credit) : '—'}
                    </TableCell>
                    <TableCell>{row.Created_by || '—'}</TableCell>
                    {isAdmin && (
                      <TableCell sx={{ '@media print': { display: 'none' } }}>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => setEditTxn(row)}>
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteTxn(row)}>
                              <DeleteRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Dialogs */}
      <EditDialog open={!!editTxn} txn={editTxn} onClose={() => setEditTxn(null)} onSaved={load} />
      <DeleteDialog open={!!deleteTxn} txn={deleteTxn} onClose={() => setDeleteTxn(null)} onDeleted={load} />
      <RenumberDialog open={showRenumber} onClose={() => setShowRenumber(false)} onDone={load} />
    </Box>
  );
}
