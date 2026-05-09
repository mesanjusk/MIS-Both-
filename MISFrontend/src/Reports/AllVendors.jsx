import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRoundedIcon         from '@mui/icons-material/AddRounded';
import EditRoundedIcon        from '@mui/icons-material/EditRounded';
import SaveRoundedIcon        from '@mui/icons-material/SaveRounded';
import CloseRoundedIcon       from '@mui/icons-material/CloseRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import { createVendorMaster, fetchVendorMasters, fetchVendorOrderLedger, fetchVendorSummaries } from '../services/vendorService';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function AllVendors() {
  const [vendors, setVendors]         = useState([]);
  const [search, setSearch]           = useState('');
  const [open, setOpen]               = useState(false);
  const [ledgerVendor, setLedgerVendor] = useState(null);
  const [ledgerRows, setLedgerRows]   = useState([]);
  const [editingEmail, setEditingEmail] = useState(null); // { uuid, value }
  const [form, setForm] = useState({
    vendor_name: '', mobile_number: '', email: '', vendor_type: 'jobwork', work_category: '', notes: '',
  });

  const loadVendors = async () => {
    try {
      const rows = await fetchVendorSummaries().catch(() => fetchVendorMasters());
      setVendors(Array.isArray(rows) ? rows : []);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => { loadVendors(); }, []);

  const filtered = useMemo(() =>
    vendors.filter((v) => String(v.Vendor_name || '').toLowerCase().includes(search.toLowerCase())),
    [vendors, search]
  );

  const openLedger = async (vendor) => {
    setLedgerVendor(vendor);
    try {
      const rows = await fetchVendorOrderLedger(vendor.Vendor_uuid);
      setLedgerRows(Array.isArray(rows) ? rows : []);
    } catch {
      setLedgerRows([]);
    }
  };

  const ledgerTotals = useMemo(() =>
    ledgerRows.reduce((acc, r) => ({
      amount:  acc.amount  + Number(r.amount  || 0),
      paid:    acc.paid    + Number(r.paid    || 0),
      balance: acc.balance + Number(r.balance || 0),
    }), { amount: 0, paid: 0, balance: 0 }),
    [ledgerRows]
  );

  const saveVendor = async () => {
    if (!form.vendor_name.trim()) return;
    await createVendorMaster({
      ...form,
      notes: `${form.work_category ? `Work: ${form.work_category}. ` : ''}${form.notes || ''}`,
    });
    setOpen(false);
    setForm({ vendor_name: '', mobile_number: '', email: '', vendor_type: 'jobwork', work_category: '', notes: '' });
    loadVendors();
  };

  const saveEmail = async (vendorUuid) => {
    try {
      await axios.put(`/api/vendors/masters/${vendorUuid}`, { email: editingEmail.value });
      toast.success('Email saved');
      setEditingEmail(null);
      loadVendors();
    } catch {
      toast.error('Failed to save email');
    }
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
              <TableCell>Email</TableCell>
              <TableCell align="right">Total Work Assigned</TableCell>
              <TableCell align="right">Total Paid</TableCell>
              <TableCell align="right">Balance Due</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Ledger</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((vendor) => {
              const isEditing = editingEmail?.uuid === vendor.Vendor_uuid;
              return (
                <TableRow key={vendor.Vendor_uuid} hover>
                  <TableCell><Typography fontWeight={800}>{vendor.Vendor_name}</Typography></TableCell>
                  <TableCell>{vendor.Vendor_type === 'jobwork' ? 'Freelancer' : 'Regular Vendor'}</TableCell>
                  <TableCell>{vendor.Mobile_number || '-'}</TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    {isEditing ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <TextField
                          size="small" type="email" value={editingEmail.value} autoFocus
                          onChange={(e) => setEditingEmail((p) => ({ ...p, value: e.target.value }))}
                          sx={{ width: 200 }}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEmail(vendor.Vendor_uuid); if (e.key === 'Escape') setEditingEmail(null); }}
                        />
                        <Tooltip title="Save">
                          <IconButton size="small" color="success" onClick={() => saveEmail(vendor.Vendor_uuid)}>
                            <SaveRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <IconButton size="small" onClick={() => setEditingEmail(null)}>
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" color={vendor.Email ? 'text.primary' : 'text.disabled'}>
                          {vendor.Email || 'No email'}
                        </Typography>
                        <Tooltip title="Edit email">
                          <IconButton
                            size="small"
                            onClick={() => setEditingEmail({ uuid: vendor.Vendor_uuid, value: vendor.Email || '' })}
                          >
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell align="right">{money(vendor.totalWorkAssigned)}</TableCell>
                  <TableCell align="right">{money(vendor.totalPaid)}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={900} color={Number(vendor.balanceDue || 0) > 0 ? 'error.main' : 'success.main'}>
                      {money(vendor.balanceDue)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={vendor.Active === false ? 'default' : 'success'} label={vendor.Active === false ? 'Inactive' : 'Active'} />
                  </TableCell>
                  <TableCell align="center">
                    <Button size="small" startIcon={<ReceiptLongRoundedIcon />} onClick={() => openLedger(vendor)}>
                      View Ledger
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>No vendors found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add vendor dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add New Vendor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.3} sx={{ pt: 1 }}>
            <TextField label="Vendor Name" required value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} />
            <TextField label="Phone" value={form.mobile_number} onChange={(e) => setForm((p) => ({ ...p, mobile_number: e.target.value }))} />
            <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} helperText="Used to auto-fill recipient when sending emails" />
            <TextField select label="Type" value={form.vendor_type} onChange={(e) => setForm((p) => ({ ...p, vendor_type: e.target.value }))}>
              <MenuItem value="jobwork">Freelancer</MenuItem>
              <MenuItem value="mixed">Regular Vendor</MenuItem>
            </TextField>
            <TextField label="Work Category" placeholder="Lamination, Cutting" value={form.work_category} onChange={(e) => setForm((p) => ({ ...p, work_category: e.target.value }))} />
            <TextField label="Notes" multiline minRows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveVendor}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Ledger dialog */}
      <Dialog open={Boolean(ledgerVendor)} onClose={() => setLedgerVendor(null)} fullWidth maxWidth="lg">
        <DialogTitle>{ledgerVendor?.Vendor_name} Ledger</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Order #</TableCell><TableCell>Date</TableCell><TableCell>Work Type</TableCell>
                  <TableCell align="right">Amount</TableCell><TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Balance</TableCell><TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerRows.map((row) => (
                  <TableRow key={`${row.orderUuid}-${row.workType}`}>
                    <TableCell>#{row.orderNumber}</TableCell>
                    <TableCell>{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</TableCell>
                    <TableCell>{row.workType}</TableCell>
                    <TableCell align="right">{money(row.amount)}</TableCell>
                    <TableCell align="right">{money(row.paid)}</TableCell>
                    <TableCell align="right">{money(row.balance)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 900 } }}>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell align="right">{money(ledgerTotals.amount)}</TableCell>
                  <TableCell align="right">{money(ledgerTotals.paid)}</TableCell>
                  <TableCell align="right">{money(ledgerTotals.balance)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setLedgerVendor(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
