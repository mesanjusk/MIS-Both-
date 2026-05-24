import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactQRCode from 'react-qr-code';
import axios from '../apiClient.js';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
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
import { alpha } from '@mui/material/styles';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  assignVendorToOrder,
  getBusinessControlSummary,
  markOrderDelivered,
  markOrderReady,
  moveOrderStage,
  payVendor,
  receiveOrderPayment,
} from '../services/businessOpsService';
import { fetchPayments } from '../services/paymentService';
import { fetchUsers } from '../services/userService';
import { fetchVendorMasters } from '../services/vendorService';

const STAGES = ['enquiry', 'quoted', 'approved', 'design', 'printing', 'post_printing', 'finishing', 'ready', 'delivered'];
const DEFAULT_SUMMARY = {
  openOrders: { count: 0, rows: [] },
  unassignedOrders: { count: 0, rows: [] },
  readyNotDelivered: { count: 0, rows: [] },
  deliveredUnpaid: { count: 0, rows: [] },
  vendorPayable: { count: 0, amount: 0, rows: [] },
  todayReceipts: { count: 0, amount: 0, rows: [] },
  todayDeliveries: { count: 0, rows: [] },
  overdueTasks: { count: 0, rows: [] },
};

const tabItems = [
  { key: 'openOrders', label: 'Open Orders' },
  { key: 'readyNotDelivered', label: 'Ready Not Delivered' },
  { key: 'deliveredUnpaid', label: 'Delivered Unpaid' },
  { key: 'vendorPayable', label: 'Vendor Payable' },
  { key: 'overdueTasks', label: 'Overdue Tasks' },
  { key: 'businessProfile', label: '⚙ Business Profile' },
];

// Tabs where row checkboxes make sense
const SELECTABLE_TABS = new Set(['openOrders', 'readyNotDelivered', 'deliveredUnpaid']);

function unwrapRows(bucket) {
  if (Array.isArray(bucket)) return bucket;
  if (Array.isArray(bucket?.rows)) return bucket.rows;
  return [];
}

function bucketCount(bucket) {
  if (typeof bucket?.count === 'number') return bucket.count;
  return unwrapRows(bucket).length;
}

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function shortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function orderId(row = {}) {
  return row.Order_uuid || row.orderUuid || row.Order_Number || row._id || '';
}

function getOrderAmount(row = {}) {
  return row.orderTotal ?? row.finalAmount ?? row.totalAmount ?? row.grandTotal ?? row.saleSubtotal ?? row.Amount ?? 0;
}

function getCustomerLabel(row = {}) {
  return row.customerName || row.Customer_name || row.customer?.Customer_name || row.Customer_uuid || '-';
}

function getMobile(row = {}) {
  return row.customerMobile || row.Mobile_number || row.customer?.Mobile_number || '';
}

function rowKey(row, index) {
  return row._id || row.Order_uuid || row.vendorUuid || row.Task_uuid || index;
}

function KpiCard({ title, value, amount, icon, tone = '#16a34a' }) {
  return (
    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha(tone, 0.16), bgcolor: alpha(tone, 0.055), height: '100%' }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.15), color: tone }}>
            {icon}
          </Box>
          <Box minWidth={0}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap>{title}</Typography>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="h6" fontWeight={900} lineHeight={1}>{value}</Typography>
              {amount !== undefined && <Typography variant="caption" color="text.secondary" fontWeight={700}>{money(amount)}</Typography>}
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActionButton({ title, icon, onClick, disabled }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} sx={{ border: '1px solid', borderColor: 'divider', mr: 0.5 }}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default function BusinessControl() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('openOrders');
  const [message, setMessage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  const [paymentModes, setPaymentModes] = useState(['Cash', 'Bank', 'UPI']);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMode: 'UPI', reference: '', narration: '' });
  const [vendorForm, setVendorForm] = useState({ vendorId: '', vendorName: '', amount: '', dueDate: '', workType: 'Job Work', jobMode: 'jobwork_only', note: '' });
  const [stageForm, setStageForm] = useState({ nextStage: 'printing', assignedTo: '', note: '' });
  const [vendorPayForm, setVendorPayForm] = useState({ amount: '', paymentMode: 'UPI', reference: '', narration: '' });

  // Business Profile
  const EMPTY_PROFILE = { name: '', addressLine1: '', addressLine2: '', city: '', phone: '', email: '', gst: '', upiId: '', upiName: '' };
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // Bulk selection
  const [checkedIds, setCheckedIds] = useState(new Set());

  const rows = useMemo(() => unwrapRows(summary?.[activeTab]), [summary, activeTab]);

  const selectableRows = useMemo(
    () => (SELECTABLE_TABS.has(activeTab) ? rows.filter((r) => orderId(r)) : []),
    [rows, activeTab],
  );

  const allChecked = selectableRows.length > 0 && selectableRows.every((r) => checkedIds.has(orderId(r)));
  const someChecked = !allChecked && selectableRows.some((r) => checkedIds.has(orderId(r)));

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(selectableRows.map((r) => orderId(r))));
    }
  };

  const toggleRow = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setCheckedIds(new Set());

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [summaryData, vendorRows, userRes, paymentRes] = await Promise.allSettled([
        getBusinessControlSummary(),
        fetchVendorMasters(),
        fetchUsers(),
        fetchPayments(),
      ]);

      const rawSummary = summaryData.status === 'fulfilled' ? summaryData.value : {};
      setSummary(rawSummary?.result || rawSummary || DEFAULT_SUMMARY);
      if (vendorRows.status === 'fulfilled') setVendors(Array.isArray(vendorRows.value) ? vendorRows.value : []);
      if (userRes.status === 'fulfilled') setUsers(userRes.value?.data?.result || userRes.value?.data || []);
      if (paymentRes.status === 'fulfilled') {
        const modes = paymentRes.value?.data?.result || paymentRes.value?.data || [];
        const names = modes.map((mode) => mode.Payment_name || mode.Payment_mode || mode.name || mode).filter(Boolean);
        if (names.length) setPaymentModes([...new Set([...names, 'Cash', 'Bank', 'UPI'])]);
      }
    } catch (error) {
      setMessage({ severity: 'error', text: error?.response?.data?.message || error.message || 'Failed to load business control data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Load business profile when that tab is active
  useEffect(() => {
    if (activeTab !== 'businessProfile') return;
    setProfileLoading(true);
    axios.get('/api/business-profile')
      .then((res) => {
        if (res.data?.success && res.data.result && Object.keys(res.data.result).length) {
          setProfileForm({ ...EMPTY_PROFILE, ...res.data.result });
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [activeTab]);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await axios.put('/api/business-profile', profileForm);
      if (res.data?.success) {
        setProfileMsg({ severity: 'success', text: 'Business profile saved successfully.' });
      } else {
        setProfileMsg({ severity: 'error', text: res.data?.message || 'Save failed.' });
      }
    } catch (err) {
      setProfileMsg({ severity: 'error', text: err?.response?.data?.message || 'Save failed.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Clear selection whenever tab changes
  useEffect(() => {
    setCheckedIds(new Set());
  }, [activeTab]);

  const runAction = async (fn, successText) => {
    setSaving(true);
    setMessage(null);
    try {
      await fn();
      setDialog(null);
      setSelected(null);
      setMessage({ severity: 'success', text: successText });
      await load();
    } catch (error) {
      setMessage({ severity: 'error', text: error?.response?.data?.message || error.message || 'Action failed' });
    } finally {
      setSaving(false);
    }
  };

  // Bulk action: runs fn(id) for each selected row in parallel, reports results
  const runBulkAction = async (fn, label) => {
    if (checkedIds.size === 0) return;
    setSaving(true);
    setMessage(null);
    setDialog(null);
    const ids = [...checkedIds];
    try {
      const results = await Promise.allSettled(ids.map((id) => fn(id)));
      const failed = results.filter((r) => r.status === 'rejected');
      clearSelection();
      if (failed.length === 0) {
        setMessage({ severity: 'success', text: `${label}: ${ids.length} order${ids.length > 1 ? 's' : ''} updated` });
      } else {
        setMessage({ severity: 'warning', text: `${label}: ${ids.length - failed.length} succeeded, ${failed.length} failed` });
      }
      await load();
    } catch (error) {
      setMessage({ severity: 'error', text: error?.response?.data?.message || error.message || 'Bulk action failed' });
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (row) => {
    setSelected(row);
    setPaymentForm({ amount: row.outstandingAmount || '', paymentMode: paymentModes[0] || 'UPI', reference: '', narration: '' });
    setDialog('payment');
  };

  const openVendor = (row) => {
    setSelected(row);
    setVendorForm({ vendorId: '', vendorName: '', amount: '', dueDate: '', workType: 'Job Work', jobMode: 'jobwork_only', note: '' });
    setDialog('vendor');
  };

  const openStage = (row) => {
    setSelected(row);
    setStageForm({ nextStage: 'printing', assignedTo: '', note: '' });
    setDialog('stage');
  };

  const openBulkStage = () => {
    setSelected(null);
    setStageForm({ nextStage: 'printing', assignedTo: '', note: '' });
    setDialog('bulkStage');
  };

  const openVendorPayment = (row) => {
    setSelected(row);
    setVendorPayForm({ amount: row.balance || '', paymentMode: paymentModes[0] || 'UPI', reference: '', narration: '' });
    setDialog('vendorPayment');
  };

  const kpis = [
    { title: 'Open Orders', value: bucketCount(summary.openOrders), icon: <TimelineRoundedIcon fontSize="small" /> },
    { title: 'Unassigned Orders', value: bucketCount(summary.unassignedOrders), icon: <TimelineRoundedIcon fontSize="small" />, tone: '#64748b' },
    { title: 'Ready Not Delivered', value: bucketCount(summary.readyNotDelivered), icon: <LocalShippingRoundedIcon fontSize="small" />, tone: '#16a34a' },
    { title: 'Delivered Unpaid', value: bucketCount(summary.deliveredUnpaid), icon: <PaymentsRoundedIcon fontSize="small" />, tone: '#b45309' },
    { title: 'Vendor Payable', value: bucketCount(summary.vendorPayable), amount: summary.vendorPayable?.amount, icon: <StorefrontRoundedIcon fontSize="small" />, tone: '#16a34a' },
    { title: 'Today Receipts', value: bucketCount(summary.todayReceipts), amount: summary.todayReceipts?.amount, icon: <PaymentsRoundedIcon fontSize="small" />, tone: '#16a34a' },
  ];

  const bulkCount = checkedIds.size;
  const showBulkBar = bulkCount > 0 && SELECTABLE_TABS.has(activeTab);

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: 'background.default', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography variant="h5" fontWeight={900} color="primary.main">Business Control Center</Typography>
            <Typography variant="body2" color="text.secondary">Order → Task → Vendor/Purchase → Ready → Delivery → Payment → Accounting</Typography>
          </Box>
          <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon />} onClick={load} variant="contained" sx={{ borderRadius: 2.5 }}>
            Refresh
          </Button>
        </Stack>

        {message && <Alert severity={message.severity} sx={{ mt: 1.5, borderRadius: 2 }}>{message.text}</Alert>}

        <Grid container spacing={1.25} sx={{ mt: 0.5 }}>
          {kpis.map((card) => (
            <Grid item xs={6} sm={4} md={2} key={card.title}>
              <KpiCard {...card} />
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 1.5 }} />

        <Tabs value={activeTab} onChange={(_event, value) => setActiveTab(value)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, textTransform: 'none', fontWeight: 800 } }}>
          {tabItems.map((tab) => (
            <Tab
              key={tab.key}
              value={tab.key}
              label={tab.key === 'businessProfile' ? tab.label : `${tab.label} (${bucketCount(summary[tab.key])})`}
            />
          ))}
        </Tabs>

        {/* Bulk action bar */}
        {showBulkBar && (
          <Paper variant="outlined" sx={(t) => ({ mt: 1, px: 2, py: 1, borderRadius: 2, bgcolor: alpha(t.palette.primary.main, 0.06), borderColor: alpha(t.palette.primary.main, 0.3) })}>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" gap={1}>
              <Typography variant="body2" fontWeight={800} color="primary.main">
                {bulkCount} selected
              </Typography>
              <Divider orientation="vertical" flexItem />
              {(activeTab === 'openOrders') && (
                <>
                  <Button
                    size="small" variant="contained" startIcon={<CheckCircleRoundedIcon fontSize="small" />}
                    disabled={saving}
                    sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                    onClick={() => runBulkAction((id) => markOrderReady(id), 'Mark Ready')}
                  >
                    Mark Ready
                  </Button>
                  <Button
                    size="small" variant="outlined" startIcon={<TimelineRoundedIcon fontSize="small" />}
                    disabled={saving}
                    onClick={openBulkStage}
                  >
                    Move Stage
                  </Button>
                </>
              )}
              {activeTab === 'readyNotDelivered' && (
                <Button
                  size="small" variant="contained" startIcon={<LocalShippingRoundedIcon fontSize="small" />}
                  disabled={saving}
                  sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                  onClick={() => runBulkAction((id) => markOrderDelivered(id), 'Mark Delivered')}
                >
                  Mark Delivered
                </Button>
              )}
              {activeTab === 'deliveredUnpaid' && (
                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                  Select individual rows to receive payment
                </Typography>
              )}
              <Box sx={{ ml: 'auto' }}>
                <Tooltip title="Clear selection">
                  <IconButton size="small" onClick={clearSelection}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Stack>
          </Paper>
        )}

        {/* ── Business Profile Tab ── */}
        {activeTab === 'businessProfile' && (
          <Box sx={{ mt: 2 }}>
            {profileLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                    <Typography variant="subtitle1" fontWeight={800} gutterBottom>Business Details</Typography>
                    {profileMsg && <Alert severity={profileMsg.severity} sx={{ mb: 2, borderRadius: 2 }}>{profileMsg.text}</Alert>}
                    <Stack spacing={2}>
                      <TextField label="Business Name" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} fullWidth size="small" />
                      <TextField label="Address Line 1" value={profileForm.addressLine1} onChange={(e) => setProfileForm((p) => ({ ...p, addressLine1: e.target.value }))} fullWidth size="small" />
                      <TextField label="Address Line 2" value={profileForm.addressLine2} onChange={(e) => setProfileForm((p) => ({ ...p, addressLine2: e.target.value }))} fullWidth size="small" />
                      <TextField label="City" value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} fullWidth size="small" />
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} sm={6}>
                          <TextField label="Phone" value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} fullWidth size="small" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField label="Email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} fullWidth size="small" />
                        </Grid>
                      </Grid>
                      <TextField label="GST Number" value={profileForm.gst} onChange={(e) => setProfileForm((p) => ({ ...p, gst: e.target.value }))} fullWidth size="small" placeholder="e.g. 27AABCU9603R1ZX" />
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} sm={6}>
                          <TextField label="UPI ID" value={profileForm.upiId} onChange={(e) => setProfileForm((p) => ({ ...p, upiId: e.target.value }))} fullWidth size="small" placeholder="e.g. business@upi" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField label="UPI Name (display)" value={profileForm.upiName} onChange={(e) => setProfileForm((p) => ({ ...p, upiName: e.target.value }))} fullWidth size="small" />
                        </Grid>
                      </Grid>
                      <Button
                        variant="contained"
                        disabled={profileSaving}
                        onClick={saveProfile}
                        sx={{ alignSelf: 'flex-start', borderRadius: 2, bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                      >
                        {profileSaving ? 'Saving…' : 'Save Business Profile'}
                      </Button>
                    </Stack>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="subtitle1" fontWeight={800} gutterBottom>Invoice QR Preview</Typography>
                    {profileForm.upiId ? (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                          <ReactQRCode
                            value={`upi://pay?pa=${encodeURIComponent(profileForm.upiId)}&pn=${encodeURIComponent(profileForm.upiName || profileForm.name || '')}&cu=INR`}
                            size={160}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary">{profileForm.upiId}</Typography>
                        <Typography variant="caption" color="text.secondary">This QR will appear on all invoices</Typography>
                      </>
                    ) : (
                      <Box sx={{ py: 4, color: 'text.disabled' }}>
                        <Typography variant="body2">Enter a UPI ID to see the QR preview</Typography>
                      </Box>
                    )}
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom color="text.secondary">Invoice Header Preview</Typography>
                    <Typography variant="body1" fontWeight={800}>{profileForm.name || '—'}</Typography>
                    {profileForm.addressLine1 && <Typography variant="caption" display="block">{profileForm.addressLine1}</Typography>}
                    {profileForm.addressLine2 && <Typography variant="caption" display="block">{profileForm.addressLine2}</Typography>}
                    {profileForm.city && <Typography variant="caption" display="block">{profileForm.city}</Typography>}
                    {profileForm.phone && <Typography variant="caption" display="block">📞 {profileForm.phone}</Typography>}
                    {profileForm.email && <Typography variant="caption" display="block">✉ {profileForm.email}</Typography>}
                    {profileForm.gst && <Typography variant="caption" display="block">GST: {profileForm.gst}</Typography>}
                  </Paper>
                </Grid>
              </Grid>
            )}
          </Box>
        )}

        {activeTab !== 'businessProfile' && (
        <TableContainer component={Paper} elevation={0} sx={{ mt: 1.25, borderRadius: 3, border: '1px solid', borderColor: 'divider', maxHeight: { xs: '60vh', md: '63vh' } }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {SELECTABLE_TABS.has(activeTab) && (
                  <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper' }}>
                    <Checkbox
                      size="small"
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleAll}
                      disabled={selectableRows.length === 0}
                    />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 900 }}>Order / Party</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Customer / Mobile</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Amount</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Received</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Outstanding</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Stage</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Responsible</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={SELECTABLE_TABS.has(activeTab) ? 10 : 9} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={SELECTABLE_TABS.has(activeTab) ? 10 : 9} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No records in this bucket.</Typography></TableCell></TableRow>
              ) : rows.map((row, index) => {
                const isVendorRow = activeTab === 'vendorPayable';
                const isTaskRow = activeTab === 'overdueTasks';
                const id = orderId(row);
                const isSelectable = SELECTABLE_TABS.has(activeTab) && Boolean(id);
                const isChecked = checkedIds.has(id);
                return (
                  <TableRow
                    hover
                    key={rowKey(row, index)}
                    selected={isChecked}
                    onClick={isSelectable ? () => toggleRow(id) : undefined}
                    sx={isSelectable ? { cursor: 'pointer' } : undefined}
                  >
                    {SELECTABLE_TABS.has(activeTab) && (
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        {isSelectable && (
                          <Checkbox size="small" checked={isChecked} onChange={() => toggleRow(id)} />
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Stack spacing={0.35}>
                        <Typography variant="body2" fontWeight={900}>{isVendorRow ? row.vendorName : isTaskRow ? row.Task_name : `#${row.Order_Number || id || '-'}`}</Typography>
                        <Typography variant="caption" color="text.secondary">{isVendorRow ? `${money(row.balance)} payable` : row.orderNote || row.latestTask || ''}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{isVendorRow ? row.vendorUuid || '-' : getCustomerLabel(row)}</Typography>
                      <Typography variant="caption" color="text.secondary">{isVendorRow ? '' : getMobile(row)}</Typography>
                    </TableCell>
                    <TableCell align="right">{isVendorRow ? money(row.credit) : money(getOrderAmount(row))}</TableCell>
                    <TableCell align="right">{isVendorRow ? money(row.debit) : money(row.receivedAmount)}</TableCell>
                    <TableCell align="right"><Chip size="small" label={isVendorRow ? money(row.balance) : money(row.outstandingAmount)} color={(isVendorRow ? row.balance : row.outstandingAmount) > 0 ? 'warning' : 'success'} variant="outlined" /></TableCell>
                    <TableCell><Chip size="small" label={isTaskRow ? row.status : row.stage || row.latestTask || '-'} sx={{ bgcolor: 'primary.50', color: 'primary.main', fontWeight: 800 }} /></TableCell>
                    <TableCell>{isTaskRow ? row.Task_group : row.responsiblePerson || row.assignedUserName || '-'}</TableCell>
                    <TableCell>{shortDate(isTaskRow ? row.deadline : row.dueDate || row.Delivery_Date)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {isVendorRow ? (
                        <ActionButton title="Pay Vendor" icon={<PaymentsRoundedIcon fontSize="small" />} onClick={() => openVendorPayment(row)} />
                      ) : isTaskRow ? null : (
                        <>
                          <ActionButton title="Mark Ready" icon={<CheckCircleRoundedIcon fontSize="small" />} onClick={() => runAction(() => markOrderReady(id), 'Order marked ready')} disabled={!id} />
                          <ActionButton title="Mark Delivered" icon={<LocalShippingRoundedIcon fontSize="small" />} onClick={() => runAction(() => markOrderDelivered(id), 'Order marked delivered')} disabled={!id} />
                          <ActionButton title="Receive Payment" icon={<PaymentsRoundedIcon fontSize="small" />} onClick={() => openPayment(row)} disabled={!id} />
                          <ActionButton title="Assign Vendor" icon={<StorefrontRoundedIcon fontSize="small" />} onClick={() => openVendor(row)} disabled={!id} />
                          <ActionButton title="Move Stage" icon={<TimelineRoundedIcon fontSize="small" />} onClick={() => openStage(row)} disabled={!id} />
                          <ActionButton title="View Order" icon={<VisibilityRoundedIcon fontSize="small" />} onClick={() => navigate(`/orderUpdate/${row._id || id}`)} disabled={!id} />
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        )}
      </Paper>

      {/* Single-order dialogs */}
      <Dialog open={dialog === 'payment'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Receive Payment</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Amount" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} fullWidth />
            <TextField label="Payment Mode" select value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))} fullWidth>
              {paymentModes.map((mode) => <MenuItem key={mode} value={mode}>{mode}</MenuItem>)}
            </TextField>
            <TextField label="Reference" value={paymentForm.reference} onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))} fullWidth />
            <TextField label="Narration" value={paymentForm.narration} onChange={(e) => setPaymentForm((p) => ({ ...p, narration: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={() => runAction(() => receiveOrderPayment(orderId(selected), paymentForm), 'Payment received and accounting posted')}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'vendor'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign Vendor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Vendor" select value={vendorForm.vendorId} onChange={(e) => {
              const vendor = vendors.find((item) => item.Vendor_uuid === e.target.value);
              setVendorForm((p) => ({ ...p, vendorId: e.target.value, vendorName: vendor?.Vendor_name || '' }));
            }} fullWidth>
              <MenuItem value="">Select vendor</MenuItem>
              {vendors.map((vendor) => <MenuItem key={vendor.Vendor_uuid} value={vendor.Vendor_uuid}>{vendor.Vendor_name}</MenuItem>)}
            </TextField>
            <TextField label="Vendor Name (new/manual)" value={vendorForm.vendorName} onChange={(e) => setVendorForm((p) => ({ ...p, vendorName: e.target.value }))} fullWidth />
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField label="Amount" type="number" value={vendorForm.amount} onChange={(e) => setVendorForm((p) => ({ ...p, amount: e.target.value }))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Due Date" type="date" InputLabelProps={{ shrink: true }} value={vendorForm.dueDate} onChange={(e) => setVendorForm((p) => ({ ...p, dueDate: e.target.value }))} fullWidth /></Grid>
            </Grid>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField label="Work Type" value={vendorForm.workType} onChange={(e) => setVendorForm((p) => ({ ...p, workType: e.target.value }))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Job Mode" select value={vendorForm.jobMode} onChange={(e) => setVendorForm((p) => ({ ...p, jobMode: e.target.value }))} fullWidth>
                  <MenuItem value="jobwork_only">Jobwork Only</MenuItem>
                  <MenuItem value="vendor_with_material">Vendor With Material</MenuItem>
                  <MenuItem value="own_material_sent">Own Material Sent</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField label="Note" value={vendorForm.note} onChange={(e) => setVendorForm((p) => ({ ...p, note: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={() => runAction(() => assignVendorToOrder(orderId(selected), vendorForm), 'Vendor assigned and payable posted')}>Assign</Button>
        </DialogActions>
      </Dialog>

      {/* Single-order stage dialog */}
      <Dialog open={dialog === 'stage'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Move Stage</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Next Stage" select value={stageForm.nextStage} onChange={(e) => setStageForm((p) => ({ ...p, nextStage: e.target.value }))} fullWidth>
              {STAGES.map((stage) => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}
            </TextField>
            <TextField label="Assigned To" select value={stageForm.assignedTo} onChange={(e) => setStageForm((p) => ({ ...p, assignedTo: e.target.value }))} fullWidth>
              <MenuItem value="">None</MenuItem>
              {users.map((user) => <MenuItem key={user._id || user.User_uuid || user.User_name} value={user.User_name || user._id}>{user.User_name || user.name}</MenuItem>)}
            </TextField>
            <TextField label="Note" value={stageForm.note} onChange={(e) => setStageForm((p) => ({ ...p, note: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={() => runAction(() => moveOrderStage(orderId(selected), stageForm), 'Order stage moved')}>Move</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk stage move dialog */}
      <Dialog open={dialog === 'bulkStage'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Move Stage — {bulkCount} Orders</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Next Stage" select value={stageForm.nextStage} onChange={(e) => setStageForm((p) => ({ ...p, nextStage: e.target.value }))} fullWidth>
              {STAGES.map((stage) => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}
            </TextField>
            <TextField label="Assigned To" select value={stageForm.assignedTo} onChange={(e) => setStageForm((p) => ({ ...p, assignedTo: e.target.value }))} fullWidth>
              <MenuItem value="">None</MenuItem>
              {users.map((user) => <MenuItem key={user._id || user.User_uuid || user.User_name} value={user.User_name || user._id}>{user.User_name || user.name}</MenuItem>)}
            </TextField>
            <TextField label="Note" value={stageForm.note} onChange={(e) => setStageForm((p) => ({ ...p, note: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            disabled={saving}
            variant="contained"
            onClick={() => runBulkAction((id) => moveOrderStage(id, stageForm), 'Move Stage')}
          >
            Move {bulkCount} Orders
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'vendorPayment'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Pay Vendor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Amount" type="number" value={vendorPayForm.amount} onChange={(e) => setVendorPayForm((p) => ({ ...p, amount: e.target.value }))} fullWidth />
            <TextField label="Payment Mode" select value={vendorPayForm.paymentMode} onChange={(e) => setVendorPayForm((p) => ({ ...p, paymentMode: e.target.value }))} fullWidth>
              {paymentModes.map((mode) => <MenuItem key={mode} value={mode}>{mode}</MenuItem>)}
            </TextField>
            <TextField label="Reference" value={vendorPayForm.reference} onChange={(e) => setVendorPayForm((p) => ({ ...p, reference: e.target.value }))} fullWidth />
            <TextField label="Narration" value={vendorPayForm.narration} onChange={(e) => setVendorPayForm((p) => ({ ...p, narration: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={() => runAction(() => payVendor(selected?.vendorUuid, vendorPayForm), 'Vendor payment posted')}>Pay</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
