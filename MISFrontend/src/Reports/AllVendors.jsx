import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  MenuItem,
  Paper,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import { createVendorMaster, fetchVendorMasters, fetchVendorOrderLedger, fetchVendorSummaries } from '../services/vendorService';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function AllVendors() {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [ledgerVendor, setLedgerVendor] = useState(null);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [form, setForm] = useState({ vendor_name: '', mobile_number: '', vendor_type: 'jobwork', work_category: '', notes: '' });

  const loadVendors = async () => {
    try {
      const rows = await fetchVendorSummaries().catch(() => fetchVendorMasters());
      setVendors(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Vendor load failed:', error);
      setVendors([]);
    }
  };

  useEffect(() => { loadVendors(); }, []);

  const filtered = useMemo(() => vendors.filter((vendor) =>
    String(vendor.Vendor_name || '').toLowerCase().includes(search.toLowerCase())
  ), [vendors, search]);

  const openLedger = async (vendor) => {
    setLedgerVendor(vendor);
    try {
      const rows = await fetchVendorOrderLedger(vendor.Vendor_uuid);
      setLedgerRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Vendor ledger load failed:', error);
      setLedgerRows([]);
    }
  };

  const ledgerTotals = useMemo(() => ledgerRows.reduce((acc, row) => ({
    amount: acc.amount + Number(row.amount || 0),
    paid: acc.paid + Number(row.paid || 0),
    balance: acc.balance + Number(row.balance || 0),
  }), { amount: 0, paid: 0, balance: 0 }), [ledgerRows]);

  const saveVendor = async () => {
    if (!form.vendor_name.trim()) return;
    await createVendorMaster({ ...form, notes: `${form.work_category ? `Work: ${form.work_category}. ` : ''}${form.notes || ''}` });
    setOpen(false);
    setForm({ vendor_name: '', mobile_number: '', vendor_type: 'jobwork', work_category: '', notes: '' });
    loadVendors();
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Vendor / Freelancer Accounts</Typography>
          <Typography variant="body2" color="text.secondary">Freelancer ledger, work assigned, paid and balance due.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField size="small" label="Search vendor" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>Add New Vendor</Button>
        </Stack>
      </Stack>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Vendor Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell align="right">Total Work Assigned</TableCell>
              <TableCell align="right">Total Paid</TableCell>
              <TableCell align="right">Balance Due</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Ledger</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((vendor) => (
              <TableRow key={vendor.Vendor_uuid} hover>
                <TableCell><Typography fontWeight={800}>{vendor.Vendor_name}</Typography></TableCell>
                <TableCell>{vendor.Vendor_type === 'jobwork' ? 'Freelancer' : 'Regular Vendor'}</TableCell>
                <TableCell>{vendor.Mobile_number || '-'}</TableCell>
                <TableCell align="right">{money(vendor.totalWorkAssigned)}</TableCell>
                <TableCell align="right">{money(vendor.totalPaid)}</TableCell>
                <TableCell align="right"><Typography fontWeight={900} color={Number(vendor.balanceDue || 0) > 0 ? 'error.main' : 'success.main'}>{money(vendor.balanceDue)}</Typography></TableCell>
                <TableCell><Chip size="small" color={vendor.Active === false ? 'default' : 'success'} label={vendor.Active === false ? 'Inactive' : 'Active'} /></TableCell>
                <TableCell align="center"><Button size="small" startIcon={<ReceiptLongRoundedIcon />} onClick={() => openLedger(vendor)}>View Ledger</Button></TableCell>
              </TableRow>
            ))}
            {!filtered.length ? <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No vendors found.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add New Vendor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.3} sx={{ pt: 1 }}>
            <TextField label="Vendor Name" required value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} />
            <TextField label="Phone" value={form.mobile_number} onChange={(e) => setForm((p) => ({ ...p, mobile_number: e.target.value }))} />
            <TextField select label="Type" value={form.vendor_type} onChange={(e) => setForm((p) => ({ ...p, vendor_type: e.target.value }))}>
              <MenuItem value="jobwork">Freelancer</MenuItem>
              <MenuItem value="mixed">Regular Vendor</MenuItem>
            </TextField>
            <TextField label="Work Category" placeholder="Lamination, Cutting" value={form.work_category} onChange={(e) => setForm((p) => ({ ...p, work_category: e.target.value }))} />
            <TextField label="Notes" multiline minRows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={saveVendor}>Save</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(ledgerVendor)} onClose={() => setLedgerVendor(null)} fullWidth maxWidth="lg">
        <DialogTitle>{ledgerVendor?.Vendor_name} Ledger</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell>Order #</TableCell><TableCell>Date</TableCell><TableCell>Work Type</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Balance</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
              <TableBody>
                {ledgerRows.map((row) => <TableRow key={`${row.orderUuid}-${row.workType}`}><TableCell>#{row.orderNumber}</TableCell><TableCell>{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</TableCell><TableCell>{row.workType}</TableCell><TableCell align="right">{money(row.amount)}</TableCell><TableCell align="right">{money(row.paid)}</TableCell><TableCell align="right">{money(row.balance)}</TableCell><TableCell>{row.status}</TableCell></TableRow>)}
                <TableRow sx={{ '& td': { fontWeight: 900 } }}><TableCell colSpan={3}>Total</TableCell><TableCell align="right">{money(ledgerTotals.amount)}</TableCell><TableCell align="right">{money(ledgerTotals.paid)}</TableCell><TableCell align="right">{money(ledgerTotals.balance)}</TableCell><TableCell /></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setLedgerVendor(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
