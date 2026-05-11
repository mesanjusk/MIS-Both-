import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import {
  fetchPostPrintJobs,
  fetchPostPrintPayables,
  updateProductionJobStatus,
  createProductionJob,
  fetchVendorMasters,
  createVendorLedgerEntry,
} from '../services/vendorService';
import { fetchPayments } from '../services/paymentService';
import axios from '../apiClient';

const TONE = '#7c3aed';
const TONE2 = '#5b21b6';

const JOB_TYPES = [
  { value: 'lamination',    label: 'Lamination' },
  { value: 'uv_coating',   label: 'UV Coating' },
  { value: 'cutting',      label: 'Die Cutting' },
  { value: 'foiling',      label: 'Foiling' },
  { value: 'binding',      label: 'Binding / Stitching' },
  { value: 'packing',      label: 'Packing' },
  { value: 'finishing',    label: 'Finishing' },
  { value: 'embossing',    label: 'Embossing' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'manual',       label: 'Manual Work' },
  { value: 'other',        label: 'Other' },
];

const JOB_TYPE_LABEL = Object.fromEntries(JOB_TYPES.map((t) => [t.value, t.label]));

const STATUS_COLOR = {
  draft:       'default',
  in_progress: 'warning',
  completed:   'success',
  cancelled:   'error',
};

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function emptyForm() {
  return {
    order_uuid: '', order_number: '', vendor_uuid: '', vendor_name: '',
    job_type: 'lamination', job_mode: 'jobwork_only',
    qty: '', unit: 'Sheets', rate: '', jobValue: '',
    advanceAmount: '', expected_completion: '', notes: '',
  };
}

function JobSlip({ job, onClose }) {
  const printRef = useRef();

  const doPrint = () => {
    const content = printRef.current?.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Job Slip #PPJ-${job.job_number}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; padding: 24px; }
        h2 { text-align: center; margin-bottom: 4px; }
        .sub { text-align: center; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        td, th { border: 1px solid #ccc; padding: 6px 10px; }
        th { background: #f3e8ff; }
        .sig { margin-top: 40px; display: flex; justify-content: space-between; }
        .sig div { border-top: 1px solid #333; width: 40%; text-align: center; padding-top: 4px; }
      </style>
    </head><body>${content}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Job Slip</DialogTitle>
      <DialogContent>
        <div ref={printRef}>
          <h2>POST-PRINTING JOB SLIP</h2>
          <p className="sub">Internal Work Order</p>
          <table>
            <tbody>
              <tr><th>Job #</th><td>PPJ-{job.job_number}</td><th>Date</th><td>{shortDate(job.job_date)}</td></tr>
              <tr><th>Vendor</th><td>{job.vendor_name || '-'}</td><th>Status</th><td>{job.status}</td></tr>
              <tr><th>Order #</th><td>{job.order_number ? `#${job.order_number}` : '-'}</td><th>Expected</th><td>{shortDate(job.expected_completion)}</td></tr>
              <tr><th>Job Type</th><td>{JOB_TYPE_LABEL[job.job_type] || job.job_type}</td><th>Job Mode</th><td>{job.job_mode}</td></tr>
              <tr><th>Qty / Unit</th><td colSpan="3">{job.jobValue ? `Amount: ${money(job.jobValue)}` : '-'}</td></tr>
              {job.advanceAmount > 0 && <tr><th>Advance</th><td colSpan="3">{money(job.advanceAmount)}</td></tr>}
              {job.notes && <tr><th>Notes</th><td colSpan="3">{job.notes}</td></tr>}
            </tbody>
          </table>
          <div className="sig">
            <div>Authorized By</div>
            <div>Vendor Signature</div>
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<PrintRoundedIcon />} onClick={doPrint} sx={{ bgcolor: TONE, '&:hover': { bgcolor: TONE2 } }}>
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PostPrintingJob() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [payables, setPayables] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paymentModes, setPaymentModes] = useState(['Cash', 'Bank', 'UPI']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [filters, setFilters] = useState({ vendor_uuid: '', job_type: '', status: '', fromDate: '', toDate: '' });
  const [form, setForm] = useState(emptyForm);
  const [slipJob, setSlipJob] = useState(null);
  const [payDialog, setPayDialog] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMode: 'UPI', reference: '', narration: '' });

  const prefilledOrder = searchParams.get('order');

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [jobRes, payRes, vendorRes, orderRes, pmRes] = await Promise.allSettled([
        fetchPostPrintJobs(filters),
        fetchPostPrintPayables(),
        fetchVendorMasters(),
        axios.get('/api/vendors/orders/list'),
        fetchPayments(),
      ]);
      if (jobRes.status === 'fulfilled') setJobs(Array.isArray(jobRes.value) ? jobRes.value : []);
      if (payRes.status === 'fulfilled') setPayables(Array.isArray(payRes.value) ? payRes.value : []);
      if (vendorRes.status === 'fulfilled') setVendors(Array.isArray(vendorRes.value) ? vendorRes.value : []);
      if (orderRes.status === 'fulfilled') {
        const rows = orderRes.value?.data?.result ?? [];
        setOrders(Array.isArray(rows) ? rows.filter((o) => ['post_printing', 'finishing'].includes(o.stage)) : []);
      }
      if (pmRes.status === 'fulfilled') {
        const modes = pmRes.value?.data?.result || pmRes.value?.data || [];
        const names = modes.map((m) => m.Payment_name || m.Payment_mode || m.name || m).filter(Boolean);
        if (names.length) setPaymentModes([...new Set([...names, 'Cash', 'Bank', 'UPI'])]);
      }
    } catch (err) {
      setMessage({ severity: 'error', text: err.message || 'Failed to load' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (prefilledOrder) setTab(1);
  }, []);

  useEffect(() => {
    if (prefilledOrder && orders.length) {
      const found = orders.find((o) => o.Order_uuid === prefilledOrder);
      if (found) setForm((p) => ({ ...p, order_uuid: found.Order_uuid, order_number: found.Order_Number }));
    }
  }, [prefilledOrder, orders]);

  const kpis = useMemo(() => [
    { label: 'Total Jobs', value: jobs.length, tone: TONE },
    { label: 'In Progress', value: jobs.filter((j) => j.status === 'in_progress').length, tone: '#b45309' },
    { label: 'Completed', value: jobs.filter((j) => j.status === 'completed').length, tone: '#0f766e' },
    { label: 'Payable', value: money(payables.reduce((s, v) => s + Number(v.balance || 0), 0)), tone: '#dc2626', isAmount: true },
  ], [jobs, payables]);

  const filteredJobs = useMemo(() => jobs, [jobs]);

  const handleFormChange = (field, value) => setForm((p) => {
    const next = { ...p, [field]: value };
    if (field === 'qty' || field === 'rate') {
      next.jobValue = String((Number(next.qty || 0) * Number(next.rate || 0)).toFixed(0));
    }
    if (field === 'vendor_uuid') {
      const v = vendors.find((x) => x.Vendor_uuid === value);
      next.vendor_name = v?.Vendor_name || '';
    }
    if (field === 'order_uuid') {
      const o = orders.find((x) => x.Order_uuid === value);
      next.order_number = o?.Order_Number || '';
    }
    return next;
  });

  const saveJob = async () => {
    if (!form.vendor_uuid && !form.vendor_name) {
      setMessage({ severity: 'error', text: 'Select a vendor/contractor' });
      return;
    }
    if (!form.job_type) {
      setMessage({ severity: 'error', text: 'Select a job type' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const linkedOrders = form.order_uuid
        ? [{ orderUuid: form.order_uuid, orderNumber: Number(form.order_number || 0), quantity: Number(form.qty || 0) }]
        : [];
      await createProductionJob({
        job_category: 'post_printing',
        job_type: form.job_type,
        job_mode: form.job_mode,
        vendor_uuid: form.vendor_uuid,
        vendor_name: form.vendor_name,
        job_date: new Date().toISOString(),
        expected_completion: form.expected_completion || null,
        order_uuid: form.order_uuid,
        order_number: form.order_number ? Number(form.order_number) : null,
        jobValue: Number(form.jobValue || 0),
        advanceAmount: Number(form.advanceAmount || 0),
        notes: form.notes,
        linkedOrders,
        status: 'draft',
        createdBy: localStorage.getItem('User_name') || 'System',
      });
      setMessage({ severity: 'success', text: 'Post-print job created. Vendor ledger updated.' });
      setForm(emptyForm());
      setTab(0);
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (job, status) => {
    try {
      await updateProductionJobStatus(job.job_uuid, status);
      setJobs((prev) => prev.map((j) => j.job_uuid === job.job_uuid ? { ...j, status } : j));
    } catch (err) {
      setMessage({ severity: 'error', text: err.message || 'Failed to update status' });
    }
  };

  const openPayDialog = (vendor) => {
    setPayDialog(vendor);
    setPayForm({ amount: String(vendor.balance || ''), paymentMode: paymentModes[0] || 'UPI', reference: '', narration: '' });
  };

  const submitPayment = async () => {
    if (!payDialog) return;
    setSaving(true);
    try {
      await createVendorLedgerEntry({
        vendor_uuid: payDialog.vendorUuid,
        vendor_name: payDialog.vendorName,
        entry_type: 'payment',
        amount: Number(payForm.amount || 0),
        dr_cr: 'dr',
        narration: payForm.narration || `Payment via ${payForm.paymentMode}${payForm.reference ? ` ref:${payForm.reference}` : ''}`,
        reference_type: payForm.paymentMode,
        reference_id: payForm.reference,
      });
      setMessage({ severity: 'success', text: `Payment of ${money(payForm.amount)} recorded for ${payDialog.vendorName}` });
      setPayDialog(null);
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || err.message || 'Payment failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: '#f3f3fa', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>

        {/* Header */}
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography variant="h5" fontWeight={900} color={TONE}>Post-Printing Jobs</Typography>
            <Typography variant="body2" color="text.secondary">Assign lamination, UV, cutting, foiling, binding & packing work to contractors</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<AddRoundedIcon />} variant="contained" onClick={() => setTab(1)} sx={{ bgcolor: TONE, borderRadius: 2.5, '&:hover': { bgcolor: TONE2 } }}>
              New Job
            </Button>
            <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon />} onClick={load} variant="outlined" sx={{ borderRadius: 2.5, borderColor: TONE, color: TONE }}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mt: 1.5, borderRadius: 2 }}>{message.text}</Alert>}

        {/* KPIs */}
        <Grid container spacing={1.25} sx={{ mt: 0.5, mb: 1.5 }}>
          {kpis.map((k) => (
            <Grid item xs={6} sm={3} key={k.label}>
              <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha(k.tone, 0.2), bgcolor: alpha(k.tone, 0.06), height: '100%' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>{k.label}</Typography>
                  <Typography variant="h5" fontWeight={900} color={k.tone}>{k.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Divider />

        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mt: 1, minHeight: 38, '& .MuiTab-root': { minHeight: 38, textTransform: 'none', fontWeight: 800 } }}>
          <Tab label={`Job List (${filteredJobs.length})`} />
          <Tab label="Create New Job" />
          <Tab label={`Vendor Payables (${payables.length})`} />
        </Tabs>

        {/* ── Tab 0: Job List ── */}
        {tab === 0 && (
          <>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1.5, mb: 1 }} flexWrap="wrap">
              <TextField select size="small" label="Vendor" value={filters.vendor_uuid} onChange={(e) => setFilters((p) => ({ ...p, vendor_uuid: e.target.value }))} sx={{ minWidth: 200 }}>
                <MenuItem value="">All Vendors</MenuItem>
                {vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Job Type" value={filters.job_type} onChange={(e) => setFilters((p) => ({ ...p, job_type: e.target.value }))} sx={{ minWidth: 160 }}>
                <MenuItem value="">All Types</MenuItem>
                {JOB_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} sx={{ minWidth: 140 }}>
                <MenuItem value="">All</MenuItem>
                {['draft', 'in_progress', 'completed', 'cancelled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} />
              <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} />
              <Button variant="contained" onClick={load} sx={{ bgcolor: TONE, '&:hover': { bgcolor: TONE2 } }}>Apply</Button>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', maxHeight: '58vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 900 }}>Job #</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Order #</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Vendor</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Job Type</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Amount</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Advance</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Expected</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
                  ) : filteredJobs.length === 0 ? (
                    <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No jobs yet. Create one from the New Job tab.</Typography></TableCell></TableRow>
                  ) : filteredJobs.map((job) => (
                    <TableRow hover key={job._id || job.job_uuid}>
                      <TableCell><Typography variant="body2" fontWeight={900} color={TONE}>PPJ-{job.job_number}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{shortDate(job.job_date)}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {job.order_number ? `#${job.order_number}` : (job.linkedOrders?.[0]?.orderNumber ? `#${job.linkedOrders[0].orderNumber}` : '-')}
                        </Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2">{job.vendor_name || '-'}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={JOB_TYPE_LABEL[job.job_type] || job.job_type} sx={{ bgcolor: alpha(TONE, 0.1), color: TONE2, fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={700}>{money(job.jobValue)}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" color="text.secondary">{job.advanceAmount > 0 ? money(job.advanceAmount) : '-'}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{shortDate(job.expected_completion)}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={job.status} color={STATUS_COLOR[job.status] || 'default'} />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {job.status === 'draft' && (
                          <Tooltip title="Mark In Progress">
                            <IconButton size="small" onClick={() => changeStatus(job, 'in_progress')} sx={{ border: '1px solid', borderColor: 'divider', mr: 0.5 }}>
                              <PlayArrowRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {job.status === 'in_progress' && (
                          <Tooltip title="Mark Completed">
                            <IconButton size="small" onClick={() => changeStatus(job, 'completed')} sx={{ border: '1px solid', borderColor: 'divider', mr: 0.5 }}>
                              <CheckCircleRoundedIcon fontSize="small" color="success" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!['completed', 'cancelled'].includes(job.status) && (
                          <Tooltip title="Cancel Job">
                            <IconButton size="small" onClick={() => changeStatus(job, 'cancelled')} sx={{ border: '1px solid', borderColor: 'divider', mr: 0.5 }}>
                              <CancelRoundedIcon fontSize="small" color="error" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Print Job Slip">
                          <IconButton size="small" onClick={() => setSlipJob(job)} sx={{ border: '1px solid', borderColor: 'divider' }}>
                            <PrintRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* ── Tab 1: Create New Job ── */}
        {tab === 1 && (
          <Paper variant="outlined" sx={{ p: 2, mt: 1.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1.5 }}>Create Post-Printing Job</Typography>
            <Stack spacing={1.5}>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    select fullWidth label="Link to Order (post-printing stage)"
                    value={form.order_uuid}
                    onChange={(e) => handleFormChange('order_uuid', e.target.value)}
                  >
                    <MenuItem value="">None / Manual</MenuItem>
                    {orders.map((o) => (
                      <MenuItem key={o.Order_uuid} value={o.Order_uuid}>
                        #{o.Order_Number}{o.Customer_name ? ` — ${o.Customer_name}` : ''} [{o.stage}]
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    select fullWidth label="Vendor / Contractor"
                    value={form.vendor_uuid}
                    onChange={(e) => handleFormChange('vendor_uuid', e.target.value)}
                  >
                    <MenuItem value="">Select or enter manually below</MenuItem>
                    {vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}
                  </TextField>
                </Grid>
                {!form.vendor_uuid && (
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Contractor Name (new / manual)" value={form.vendor_name} onChange={(e) => handleFormChange('vendor_name', e.target.value)} />
                  </Grid>
                )}
                <Grid item xs={12} sm={6}>
                  <TextField select fullWidth label="Job Type" value={form.job_type} onChange={(e) => handleFormChange('job_type', e.target.value)}>
                    {JOB_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField select fullWidth label="Job Mode" value={form.job_mode} onChange={(e) => handleFormChange('job_mode', e.target.value)}>
                    <MenuItem value="jobwork_only">Job Work Only (we supply material)</MenuItem>
                    <MenuItem value="own_material_sent">Our Material Sent to Vendor</MenuItem>
                    <MenuItem value="vendor_with_material">Vendor Supplies Material</MenuItem>
                    <MenuItem value="mixed">Mixed</MenuItem>
                  </TextField>
                </Grid>
              </Grid>

              <Divider />

              <Grid container spacing={1.5}>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth label="Qty" type="number" value={form.qty} onChange={(e) => handleFormChange('qty', e.target.value)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth label="Unit" value={form.unit} onChange={(e) => handleFormChange('unit', e.target.value)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth label="Rate (per unit)" type="number" value={form.rate} onChange={(e) => handleFormChange('rate', e.target.value)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth label="Total Amount" type="number" value={form.jobValue} onChange={(e) => handleFormChange('jobValue', e.target.value)} InputProps={{ sx: { fontWeight: 900 } }} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth label="Advance Amount (optional)" type="number" value={form.advanceAmount} onChange={(e) => handleFormChange('advanceAmount', e.target.value)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth type="date" label="Expected Completion" InputLabelProps={{ shrink: true }} value={form.expected_completion} onChange={(e) => handleFormChange('expected_completion', e.target.value)} />
                </Grid>
              </Grid>

              <TextField fullWidth label="Notes / Instructions" multiline minRows={2} value={form.notes} onChange={(e) => handleFormChange('notes', e.target.value)} />

              {Number(form.jobValue) > 0 && (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(TONE, 0.04) }}>
                  <Stack direction="row" spacing={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Job Value</Typography>
                      <Typography variant="h6" fontWeight={900} color={TONE}>{money(form.jobValue)}</Typography>
                    </Box>
                    {Number(form.advanceAmount) > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Advance</Typography>
                        <Typography variant="h6" fontWeight={900} color="#b45309">{money(form.advanceAmount)}</Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="caption" color="text.secondary">Balance Payable</Typography>
                      <Typography variant="h6" fontWeight={900} color="#dc2626">{money(Number(form.jobValue) - Number(form.advanceAmount || 0))}</Typography>
                    </Box>
                  </Stack>
                </Paper>
              )}

              <Stack direction="row" spacing={1.5}>
                <Button variant="contained" onClick={saveJob} disabled={saving} sx={{ bgcolor: TONE, '&:hover': { bgcolor: TONE2 } }}>
                  {saving ? 'Saving…' : 'Create Job & Update Ledger'}
                </Button>
                <Button variant="outlined" onClick={() => { setForm(emptyForm()); setMessage(null); }}>Clear</Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {/* ── Tab 2: Vendor Payables ── */}
        {tab === 2 && (
          <TableContainer component={Paper} elevation={0} sx={{ mt: 1.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', maxHeight: '62vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>Vendor / Contractor</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Jobs</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Total Billed</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Total Paid</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Balance</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : payables.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No post-print vendor payables.</Typography></TableCell></TableRow>
                ) : payables.map((v) => (
                  <TableRow hover key={v.vendorUuid}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={900}>{v.vendorName}</Typography>
                    </TableCell>
                    <TableCell align="right"><Typography variant="body2">{v.totalJobs}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" fontWeight={700}>{money(v.totalBilled)}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" color="success.main" fontWeight={700}>{money(v.totalPaid)}</Typography></TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={money(v.balance)} color={v.balance > 0 ? 'warning' : 'success'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Record Payment">
                        <span>
                          <Button
                            size="small" variant="contained" startIcon={<PaymentsRoundedIcon fontSize="small" />}
                            disabled={v.balance <= 0}
                            onClick={() => openPayDialog(v)}
                            sx={{ bgcolor: TONE, '&:hover': { bgcolor: TONE2 }, textTransform: 'none', fontSize: 12 }}
                          >
                            Pay
                          </Button>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Job Slip Dialog */}
      {slipJob && <JobSlip job={slipJob} onClose={() => setSlipJob(null)} />}

      {/* Pay Vendor Dialog */}
      <Dialog open={Boolean(payDialog)} onClose={() => setPayDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          <Stack>
            <Typography fontWeight={900}>Pay Contractor</Typography>
            {payDialog && <Typography variant="body2" color="text.secondary">{payDialog.vendorName} — Balance: {money(payDialog.balance)}</Typography>}
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField fullWidth label="Amount" type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />
            <TextField select fullWidth label="Payment Mode" value={payForm.paymentMode} onChange={(e) => setPayForm((p) => ({ ...p, paymentMode: e.target.value }))}>
              {paymentModes.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <TextField fullWidth label="Reference / UTR" value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} />
            <TextField fullWidth label="Narration" multiline minRows={2} value={payForm.narration} onChange={(e) => setPayForm((p) => ({ ...p, narration: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDialog(null)}>Cancel</Button>
          <Button disabled={saving || !payForm.amount} variant="contained" onClick={submitPayment} sx={{ bgcolor: TONE, '&:hover': { bgcolor: TONE2 } }}>
            {saving ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
