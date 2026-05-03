import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import WhatsAppAttendanceSettings from '../components/whatsappCloud/WhatsAppAttendanceSettings';
import {
  createProductionJob,
  createVendorLedgerEntry,
  createVendorMaster,
  fetchOrderListForAllocation,
  fetchProductionJobs,
  fetchStockMovements,
  fetchVendorLedger,
  fetchVendorMasters,
  fetchVendorSummary,
  updateVendorMaster,
} from '../services/vendorService';

const vendorFormInitial = {
  vendor_name: '',
  mobile_number: '',
  address: '',
  gst: '',
  payment_terms: '',
  vendor_type: 'mixed',
  opening_balance: 0,
  opening_balance_type: 'none',
  notes: '',
  raw_material_capable: false,
  jobwork_capable: true,
  active: true,
};

const ledgerFormInitial = {
  vendor_uuid: '',
  entry_type: 'advance_paid',
  amount: '',
  dr_cr: 'dr',
  narration: '',
  order_uuid: '',
  order_number: '',
};

const jobFormInitial = {
  vendor_uuid: '',
  job_type: 'printing',
  job_mode: 'own_material_sent',
  status: 'draft',
  notes: '',
  advanceAmount: '',
  jobValue: '',
  materialValue: '',
  otherCharges: '',
  inputItems: [{ itemName: '', itemType: 'raw', quantity: '', uom: 'pcs', rate: '', amount: '' }],
  outputItems: [{ itemName: '', itemType: 'finished', quantity: '', uom: 'pcs', rate: '', amount: '' }],
  linkedOrders: [],
};

const StatCard = ({ label, value, helper }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>
      {value}
    </Typography>
    {helper ? (
      <Typography variant="caption" color="text.secondary">
        {helper}
      </Typography>
    ) : null}
  </Paper>
);

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

function rowAmount(row) {
  const qty = Number(row.quantity || 0);
  const rate = Number(row.rate || 0);
  return qty * rate;
}

export default function VendorPage() {
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedVendorUuid, setSelectedVendorUuid] = useState('');
  const [ledger, setLedger] = useState({ entries: [], summary: {} });
  const [vendorForm, setVendorForm] = useState(vendorFormInitial);
  const [ledgerForm, setLedgerForm] = useState(ledgerFormInitial);
  const [jobForm, setJobForm] = useState(jobFormInitial);
  const [editingVendorUuid, setEditingVendorUuid] = useState('');
  const [openVendorDialog, setOpenVendorDialog] = useState(false);
  const [openLedgerDialog, setOpenLedgerDialog] = useState(false);
  const [openJobDialog, setOpenJobDialog] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.Vendor_uuid === selectedVendorUuid) || null,
    [selectedVendorUuid, vendors]
  );

  const loadAll = async () => {
    setError('');
    try {
      const [summaryData, vendorData, jobData, stockData, orderData] = await Promise.all([
        fetchVendorSummary(),
        fetchVendorMasters(),
        fetchProductionJobs(),
        fetchStockMovements(),
        fetchOrderListForAllocation(),
      ]);
      setSummary(summaryData);
      setVendors(vendorData);
      setJobs(jobData);
      setStockMovements(stockData);
      setOrders(orderData);
      const defaultVendorUuid = selectedVendorUuid || vendorData?.[0]?.Vendor_uuid || '';
      setSelectedVendorUuid(defaultVendorUuid);
      if (defaultVendorUuid) {
        const ledgerData = await fetchVendorLedger(defaultVendorUuid);
        setLedger(ledgerData);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load vendor accounting workspace.');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedVendorUuid) return;
    fetchVendorLedger(selectedVendorUuid)
      .then((data) => setLedger(data))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load vendor ledger.'));
  }, [selectedVendorUuid]);

  const linkedOrderOptions = useMemo(
    () =>
      orders.map((order) => ({
        label: `#${order.Order_Number} · ${order.Items?.map((item) => item.Item).join(', ') || 'No items'}`,
        value: order.Order_uuid,
        order,
      })),
    [orders]
  );

  const handleVendorSave = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingVendorUuid) {
        await updateVendorMaster(editingVendorUuid, vendorForm);
        setMessage('Vendor updated successfully.');
      } else {
        await createVendorMaster(vendorForm);
        setMessage('Vendor created successfully.');
      }
      setOpenVendorDialog(false);
      setVendorForm(vendorFormInitial);
      setEditingVendorUuid('');
      await loadAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save vendor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLedgerSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      await createVendorLedgerEntry({ ...ledgerForm, amount: Number(ledgerForm.amount || 0) });
      setMessage('Ledger entry added successfully.');
      setOpenLedgerDialog(false);
      setLedgerForm({ ...ledgerFormInitial, vendor_uuid: selectedVendorUuid });
      if (selectedVendorUuid) {
        const ledgerData = await fetchVendorLedger(selectedVendorUuid);
        setLedger(ledgerData);
      }
      await loadAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save ledger entry.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleJobSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      await createProductionJob({
        ...jobForm,
        advanceAmount: Number(jobForm.advanceAmount || 0),
        jobValue: Number(jobForm.jobValue || 0),
        materialValue: Number(jobForm.materialValue || 0),
        otherCharges: Number(jobForm.otherCharges || 0),
        inputItems: jobForm.inputItems.map((item) => ({ ...item, quantity: Number(item.quantity || 0), rate: Number(item.rate || 0), amount: rowAmount(item) })),
        outputItems: jobForm.outputItems.map((item) => ({ ...item, quantity: Number(item.quantity || 0), rate: Number(item.rate || 0), amount: rowAmount(item) })),
      });
      setMessage('Production job created successfully.');
      setOpenJobDialog(false);
      setJobForm(jobFormInitial);
      await loadAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save production job.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" fontWeight={800}>
          Vendor accounting & production control
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage vendor masters, advances, job work, raw material issue, finished goods receipt, and WhatsApp attendance settings from frontend only.
        </Typography>
      </Box>

      {message ? <Alert severity="success">{message}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={3}><StatCard label="Vendor masters" value={summary?.vendorCount || 0} /></Grid>
        <Grid item xs={12} md={3}><StatCard label="Production jobs" value={summary?.jobCount || 0} helper={currency(summary?.totalJobCost || 0)} /></Grid>
        <Grid item xs={12} md={3}><StatCard label="Vendor payable" value={currency(summary?.totalVendorPayable || 0)} /></Grid>
        <Grid item xs={12} md={3}><StatCard label="Vendor advance" value={currency(summary?.totalVendorAdvance || 0)} /></Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          <Tab value="overview" label="Overview" />
          <Tab value="vendors" label="Vendor Master" />
          <Tab value="ledger" label="Vendor Ledger" />
          <Tab value="jobs" label="Production Jobs" />
          <Tab value="stock" label="Stock Movements" />
          <Tab value="whatsapp" label="WhatsApp Attendance" />
        </Tabs>

        <Box sx={{ p: 2.5 }}>
          {tab === 'overview' ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={700}>Top vendor balances</Typography>
                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    {(summary?.topVendorBalances || []).map((row) => (
                      <Stack key={row.vendor_uuid} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2">{row.vendor_name}</Typography>
                        <Chip size="small" label={currency(row.balance)} color={row.balance >= 0 ? 'warning' : 'success'} />
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={700}>Live implementation notes</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    New jobs automatically create vendor ledger and stock movement records. Orders stay untouched, so your existing live workflow remains safe.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Use one production job for each real-world process like printing, lamination, cutting, or packing. Link multiple orders when one batch serves multiple parties.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          ) : null}

          {tab === 'vendors' ? (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>Vendor master setup</Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setEditingVendorUuid(''); setVendorForm(vendorFormInitial); setOpenVendorDialog(true); }}>
                  Add vendor
                </Button>
              </Stack>
              <Grid container spacing={2}>
                {vendors.map((vendor) => (
                  <Grid item xs={12} md={6} lg={4} key={vendor.Vendor_uuid}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                      <Stack spacing={1}>
                        <Typography variant="subtitle1" fontWeight={700}>{vendor.Vendor_name}</Typography>
                        <Typography variant="body2" color="text.secondary">{vendor.Vendor_type} · {vendor.Mobile_number || 'No mobile'}</Typography>
                        <Typography variant="body2" color="text.secondary">Terms: {vendor.Payment_terms || 'Not set'}</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip size="small" label={vendor.Active ? 'Active' : 'Inactive'} color={vendor.Active ? 'success' : 'default'} />
                          <Chip size="small" label={vendor.Raw_material_capable ? 'Raw Material' : 'Jobwork'} />
                        </Stack>
                        <Button
                          size="small"
                          onClick={() => {
                            setEditingVendorUuid(vendor.Vendor_uuid);
                            setVendorForm({
                              vendor_name: vendor.Vendor_name || '',
                              mobile_number: vendor.Mobile_number || '',
                              address: vendor.Address || '',
                              gst: vendor.GST || '',
                              payment_terms: vendor.Payment_terms || '',
                              vendor_type: vendor.Vendor_type || 'mixed',
                              opening_balance: vendor.Opening_balance || 0,
                              opening_balance_type: vendor.Opening_balance_type || 'none',
                              notes: vendor.Notes || '',
                              raw_material_capable: Boolean(vendor.Raw_material_capable),
                              jobwork_capable: vendor.Jobwork_capable !== false,
                              active: vendor.Active !== false,
                            });
                            setOpenVendorDialog(true);
                          }}
                        >
                          Edit
                        </Button>
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          ) : null}

          {tab === 'ledger' ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5}>
                <TextField select label="Select vendor" value={selectedVendorUuid} onChange={(e) => setSelectedVendorUuid(e.target.value)} sx={{ minWidth: 280 }}>
                  {vendors.map((vendor) => (
                    <MenuItem key={vendor.Vendor_uuid} value={vendor.Vendor_uuid}>{vendor.Vendor_name}</MenuItem>
                  ))}
                </TextField>
                <Stack direction="row" spacing={1}>
                  <Chip label={`Dr ${currency(ledger?.summary?.debit || 0)}`} />
                  <Chip label={`Cr ${currency(ledger?.summary?.credit || 0)}`} />
                  <Chip color={(ledger?.summary?.balance || 0) >= 0 ? 'warning' : 'success'} label={`Balance ${currency(Math.abs(ledger?.summary?.balance || 0))} ${ledger?.summary?.balanceNature || ''}`} />
                  <Button variant="contained" onClick={() => { setLedgerForm((prev) => ({ ...prev, vendor_uuid: selectedVendorUuid, order_uuid: '', order_number: '' })); setOpenLedgerDialog(true); }}>Add entry</Button>
                </Stack>
              </Stack>
              <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th align="left">Date</th><th align="left">Type</th><th align="left">Narration</th><th align="right">Dr</th><th align="right">Cr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger.entries || []).map((entry) => (
                        <tr key={entry.entry_uuid}>
                          <td>{new Date(entry.date).toLocaleDateString()}</td>
                          <td>{entry.entry_type}</td>
                          <td>{entry.narration || '-'}</td>
                          <td align="right">{entry.dr_cr === 'dr' ? currency(entry.amount) : '-'}</td>
                          <td align="right">{entry.dr_cr === 'cr' ? currency(entry.amount) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Paper>
            </Stack>
          ) : null}

          {tab === 'jobs' ? (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>Production jobs</Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setJobForm(jobFormInitial); setOpenJobDialog(true); }}>
                  Add job
                </Button>
              </Stack>
              <Grid container spacing={2}>
                {jobs.map((job) => (
                  <Grid item xs={12} md={6} lg={4} key={job.job_uuid}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                      <Stack spacing={1}>
                        <Typography variant="subtitle1" fontWeight={700}>Job #{job.job_number}</Typography>
                        <Typography variant="body2" color="text.secondary">{job.job_type} · {job.job_mode}</Typography>
                        <Typography variant="body2" color="text.secondary">Vendor: {job.vendor_name || 'Not linked'}</Typography>
                        <Typography variant="body2" color="text.secondary">Cost: {currency(job.totalCost)}</Typography>
                        <Typography variant="body2" color="text.secondary">Orders: {(job.linkedOrders || []).map((o) => o.orderNumber).filter(Boolean).join(', ') || 'None'}</Typography>
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          ) : null}

          {tab === 'stock' ? (
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ maxHeight: 520, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th align="left">Date</th><th align="left">Item</th><th align="left">Movement</th><th align="right">In</th><th align="right">Out</th><th align="right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockMovements.map((row) => (
                      <tr key={row.movement_uuid}>
                        <td>{new Date(row.date).toLocaleDateString()}</td>
                        <td>{row.item_name}</td>
                        <td>{row.movement_type}</td>
                        <td align="right">{row.qty_in || 0}</td>
                        <td align="right">{row.qty_out || 0}</td>
                        <td align="right">{currency(row.value || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </Paper>
          ) : null}

          {tab === 'whatsapp' ? <WhatsAppAttendanceSettings /> : null}
        </Box>
      </Paper>

      <Dialog open={openVendorDialog} onClose={() => setOpenVendorDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingVendorUuid ? 'Edit vendor' : 'Add vendor'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}><TextField fullWidth label="Vendor name" value={vendorForm.vendor_name} onChange={(e) => setVendorForm((prev) => ({ ...prev, vendor_name: e.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Mobile number" value={vendorForm.mobile_number} onChange={(e) => setVendorForm((prev) => ({ ...prev, mobile_number: e.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth select label="Vendor type" value={vendorForm.vendor_type} onChange={(e) => setVendorForm((prev) => ({ ...prev, vendor_type: e.target.value }))}><MenuItem value="material">Material</MenuItem><MenuItem value="jobwork">Jobwork</MenuItem><MenuItem value="mixed">Mixed</MenuItem></TextField></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="Opening balance" type="number" value={vendorForm.opening_balance} onChange={(e) => setVendorForm((prev) => ({ ...prev, opening_balance: e.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth select label="Opening balance type" value={vendorForm.opening_balance_type} onChange={(e) => setVendorForm((prev) => ({ ...prev, opening_balance_type: e.target.value }))}><MenuItem value="none">None</MenuItem><MenuItem value="payable">Payable</MenuItem><MenuItem value="advance">Advance</MenuItem></TextField></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Payment terms" value={vendorForm.payment_terms} onChange={(e) => setVendorForm((prev) => ({ ...prev, payment_terms: e.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="GST" value={vendorForm.gst} onChange={(e) => setVendorForm((prev) => ({ ...prev, gst: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Address" value={vendorForm.address} onChange={(e) => setVendorForm((prev) => ({ ...prev, address: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline minRows={3} value={vendorForm.notes} onChange={(e) => setVendorForm((prev) => ({ ...prev, notes: e.target.value }))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenVendorDialog(false)}>Cancel</Button><Button variant="contained" onClick={handleVendorSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button></DialogActions>
      </Dialog>

      <Dialog open={openLedgerDialog} onClose={() => setOpenLedgerDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add vendor ledger entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}><TextField select fullWidth label="Vendor" value={ledgerForm.vendor_uuid} onChange={(e) => setLedgerForm((prev) => ({ ...prev, vendor_uuid: e.target.value }))}>{vendors.map((vendor) => <MenuItem key={vendor.Vendor_uuid} value={vendor.Vendor_uuid}>{vendor.Vendor_name}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={6}><TextField select fullWidth label="Entry type" value={ledgerForm.entry_type} onChange={(e) => setLedgerForm((prev) => ({ ...prev, entry_type: e.target.value }))}><MenuItem value="advance_paid">Advance Paid</MenuItem><MenuItem value="payment">Payment</MenuItem><MenuItem value="job_bill">Job Bill</MenuItem><MenuItem value="material_bill">Material Bill</MenuItem><MenuItem value="adjustment">Adjustment</MenuItem></TextField></Grid>
            <Grid item xs={12} md={6}><TextField select fullWidth label="Debit / Credit" value={ledgerForm.dr_cr} onChange={(e) => setLedgerForm((prev) => ({ ...prev, dr_cr: e.target.value }))}><MenuItem value="dr">Debit</MenuItem><MenuItem value="cr">Credit</MenuItem></TextField></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth type="number" label="Amount" value={ledgerForm.amount} onChange={(e) => setLedgerForm((prev) => ({ ...prev, amount: e.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Narration" value={ledgerForm.narration} onChange={(e) => setLedgerForm((prev) => ({ ...prev, narration: e.target.value }))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenLedgerDialog(false)}>Cancel</Button><Button variant="contained" onClick={handleLedgerSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button></DialogActions>
      </Dialog>

      <Dialog open={openJobDialog} onClose={() => setOpenJobDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Create production job</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}><TextField select fullWidth label="Vendor" value={jobForm.vendor_uuid} onChange={(e) => setJobForm((prev) => ({ ...prev, vendor_uuid: e.target.value }))}>{vendors.map((vendor) => <MenuItem key={vendor.Vendor_uuid} value={vendor.Vendor_uuid}>{vendor.Vendor_name}</MenuItem>)}</TextField></Grid>
              <Grid item xs={12} md={4}><TextField select fullWidth label="Job type" value={jobForm.job_type} onChange={(e) => setJobForm((prev) => ({ ...prev, job_type: e.target.value }))}><MenuItem value="printing">Printing</MenuItem><MenuItem value="lamination">Lamination</MenuItem><MenuItem value="cutting">Cutting</MenuItem><MenuItem value="packing">Packing</MenuItem><MenuItem value="purchase">Purchase</MenuItem><MenuItem value="manual">Manual</MenuItem></TextField></Grid>
              <Grid item xs={12} md={4}><TextField select fullWidth label="Job mode" value={jobForm.job_mode} onChange={(e) => setJobForm((prev) => ({ ...prev, job_mode: e.target.value }))}><MenuItem value="own_material_sent">Own Material Sent</MenuItem><MenuItem value="jobwork_only">Jobwork Only</MenuItem><MenuItem value="vendor_with_material">Vendor With Material</MenuItem><MenuItem value="mixed">Mixed</MenuItem></TextField></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Advance" value={jobForm.advanceAmount} onChange={(e) => setJobForm((prev) => ({ ...prev, advanceAmount: e.target.value }))} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Job value" value={jobForm.jobValue} onChange={(e) => setJobForm((prev) => ({ ...prev, jobValue: e.target.value }))} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Material value" value={jobForm.materialValue} onChange={(e) => setJobForm((prev) => ({ ...prev, materialValue: e.target.value }))} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Other charges" value={jobForm.otherCharges} onChange={(e) => setJobForm((prev) => ({ ...prev, otherCharges: e.target.value }))} /></Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={700}>Input items</Typography>
              {jobForm.inputItems.map((item, index) => (
                <Grid container spacing={1.5} sx={{ mt: 0.5 }} key={`input-${index}`}>
                  <Grid item xs={12} md={4}><TextField fullWidth label="Item name" value={item.itemName} onChange={(e) => setJobForm((prev) => ({ ...prev, inputItems: prev.inputItems.map((row, i) => i === index ? { ...row, itemName: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth label="Type" value={item.itemType} onChange={(e) => setJobForm((prev) => ({ ...prev, inputItems: prev.inputItems.map((row, i) => i === index ? { ...row, itemType: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Qty" value={item.quantity} onChange={(e) => setJobForm((prev) => ({ ...prev, inputItems: prev.inputItems.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Rate" value={item.rate} onChange={(e) => setJobForm((prev) => ({ ...prev, inputItems: prev.inputItems.map((row, i) => i === index ? { ...row, rate: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth label="Amount" value={currency(rowAmount(item))} InputProps={{ readOnly: true }} /></Grid>
                </Grid>
              ))}
              <Button sx={{ mt: 1.5 }} onClick={() => setJobForm((prev) => ({ ...prev, inputItems: [...prev.inputItems, { itemName: '', itemType: 'raw', quantity: '', uom: 'pcs', rate: '', amount: '' }] }))}>Add input</Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={700}>Output items</Typography>
              {jobForm.outputItems.map((item, index) => (
                <Grid container spacing={1.5} sx={{ mt: 0.5 }} key={`output-${index}`}>
                  <Grid item xs={12} md={4}><TextField fullWidth label="Item name" value={item.itemName} onChange={(e) => setJobForm((prev) => ({ ...prev, outputItems: prev.outputItems.map((row, i) => i === index ? { ...row, itemName: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth label="Type" value={item.itemType} onChange={(e) => setJobForm((prev) => ({ ...prev, outputItems: prev.outputItems.map((row, i) => i === index ? { ...row, itemType: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Qty" value={item.quantity} onChange={(e) => setJobForm((prev) => ({ ...prev, outputItems: prev.outputItems.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Rate" value={item.rate} onChange={(e) => setJobForm((prev) => ({ ...prev, outputItems: prev.outputItems.map((row, i) => i === index ? { ...row, rate: e.target.value } : row) }))} /></Grid>
                  <Grid item xs={12} md={2}><TextField fullWidth label="Amount" value={currency(rowAmount(item))} InputProps={{ readOnly: true }} /></Grid>
                </Grid>
              ))}
              <Button sx={{ mt: 1.5 }} onClick={() => setJobForm((prev) => ({ ...prev, outputItems: [...prev.outputItems, { itemName: '', itemType: 'finished', quantity: '', uom: 'pcs', rate: '', amount: '' }] }))}>Add output</Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={700}>Link orders for costing split</Typography>
              <TextField
                select
                SelectProps={{ multiple: true }}
                fullWidth
                value={jobForm.linkedOrders.map((row) => row.orderUuid)}
                onChange={(e) => {
                  const selected = Array.isArray(e.target.value) ? e.target.value : [e.target.value];
                  setJobForm((prev) => ({
                    ...prev,
                    linkedOrders: selected.map((orderUuid) => {
                      const match = linkedOrderOptions.find((option) => option.value === orderUuid)?.order;
                      const firstItem = match?.Items?.[0];
                      return {
                        orderUuid,
                        orderNumber: match?.Order_Number || '',
                        orderItemLineId: firstItem?.lineId || firstItem?._id || '',
                        quantity: firstItem?.Quantity || 0,
                        outputQuantity: firstItem?.Quantity || 0,
                        costShareAmount: 0,
                        allocationBasis: 'manual',
                      };
                    }),
                  }));
                }}
              >
                {linkedOrderOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>
            </Paper>

            <TextField fullWidth label="Notes" multiline minRows={3} value={jobForm.notes} onChange={(e) => setJobForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenJobDialog(false)}>Cancel</Button><Button variant="contained" onClick={handleJobSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Create job'}</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
