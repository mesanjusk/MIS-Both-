import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import {
  assignVendorToOrder,
  getBusinessControlSummary,
  markOrderReady,
  payVendor,
} from '../services/businessOpsService';
import { fetchPayments } from '../services/paymentService';
import { fetchVendorMasters, fetchPostPrintOrderSummary } from '../services/vendorService';
import { ROUTES } from '../constants/routes';

const POST_PRINT_STAGES = ['post_printing', 'finishing'];

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

function getCustomerLabel(row = {}) {
  return row.customerName || row.Customer_name || row.customer?.Customer_name || '-';
}

function KpiCard({ title, value, amount, icon, tone = '#7c3aed' }) {
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

const JOB_TYPE_LABEL = {
  lamination: 'Lam', uv_coating: 'UV', cutting: 'Cut', foiling: 'Foil',
  binding: 'Bind', packing: 'Pack', finishing: 'Finish', embossing: 'Emboss',
  quality_check: 'QC', manual: 'Manual', other: 'Other',
};

const JOB_STATUS_COLOR = { draft: 'default', in_progress: 'warning', completed: 'success', cancelled: 'error' };

export default function PostPrintingControl() {
  const navigate = useNavigate();
  const [allOrders, setAllOrders] = useState([]);
  const [vendorPayable, setVendorPayable] = useState([]);
  const [orderSummary, setOrderSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('needsAssignment');
  const [message, setMessage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [paymentModes, setPaymentModes] = useState(['Cash', 'Bank', 'UPI']);
  const [vendorForm, setVendorForm] = useState({ vendorId: '', vendorName: '', amount: '', dueDate: '', workType: 'Job Work', jobMode: 'jobwork_only', note: '' });
  const [vendorPayForm, setVendorPayForm] = useState({ amount: '', paymentMode: 'UPI', reference: '', narration: '' });

  const postPrintOrders = useMemo(() =>
    allOrders.filter((o) => POST_PRINT_STAGES.includes(String(o.stage || '').toLowerCase())),
    [allOrders]
  );

  const needsAssignment = useMemo(() =>
    postPrintOrders.filter((o) => !Array.isArray(o.vendorAssignments) || o.vendorAssignments.length === 0),
    [postPrintOrders]
  );

  const inProgress = useMemo(() =>
    postPrintOrders.filter((o) => Array.isArray(o.vendorAssignments) && o.vendorAssignments.length > 0),
    [postPrintOrders]
  );

  const tabRows = useMemo(() => {
    if (activeTab === 'needsAssignment') return needsAssignment;
    if (activeTab === 'inProgress') return inProgress;
    if (activeTab === 'contractorPayable') return vendorPayable;
    return [];
  }, [activeTab, needsAssignment, inProgress, vendorPayable]);

  const isTimelineTab = activeTab === 'orderTimeline';

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [summaryRes, vendorRes, paymentRes, orderSummaryRes] = await Promise.allSettled([
        getBusinessControlSummary(),
        fetchVendorMasters(),
        fetchPayments(),
        fetchPostPrintOrderSummary(),
      ]);

      if (summaryRes.status === 'fulfilled') {
        const summary = summaryRes.value?.result ?? summaryRes.value ?? {};
        const open = Array.isArray(summary.openOrders?.rows) ? summary.openOrders.rows : [];
        setAllOrders(open);
        setVendorPayable(Array.isArray(summary.vendorPayable?.rows) ? summary.vendorPayable.rows : []);
      }
      if (vendorRes.status === 'fulfilled') setVendors(Array.isArray(vendorRes.value) ? vendorRes.value : []);
      if (orderSummaryRes.status === 'fulfilled') setOrderSummary(Array.isArray(orderSummaryRes.value) ? orderSummaryRes.value : []);
      if (paymentRes.status === 'fulfilled') {
        const modes = paymentRes.value?.data?.result || paymentRes.value?.data || [];
        const names = modes.map((m) => m.Payment_name || m.Payment_mode || m.name || m).filter(Boolean);
        if (names.length) setPaymentModes([...new Set([...names, 'Cash', 'Bank', 'UPI'])]);
      }
    } catch (error) {
      setMessage({ severity: 'error', text: error?.response?.data?.message || error.message || 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const openVendor = (row) => {
    setSelected(row);
    setVendorForm({ vendorId: '', vendorName: '', amount: '', dueDate: '', workType: 'Job Work', jobMode: 'jobwork_only', note: '' });
    setDialog('vendor');
  };

  const openVendorPayment = (row) => {
    setSelected(row);
    setVendorPayForm({ amount: row.balance || '', paymentMode: paymentModes[0] || 'UPI', reference: '', narration: '' });
    setDialog('vendorPayment');
  };

  const kpis = [
    { title: 'Post Printing', value: postPrintOrders.filter((o) => o.stage === 'post_printing').length, icon: <PrintRoundedIcon fontSize="small" />, tone: '#7c3aed' },
    { title: 'Finishing', value: postPrintOrders.filter((o) => o.stage === 'finishing').length, icon: <CheckCircleRoundedIcon fontSize="small" />, tone: '#0f766e' },
    { title: 'Needs Assignment', value: needsAssignment.length, icon: <StorefrontRoundedIcon fontSize="small" />, tone: '#b45309' },
    { title: 'Contractor Payable', value: vendorPayable.length, amount: vendorPayable.reduce((s, r) => s + Number(r.balance || 0), 0), icon: <PaymentsRoundedIcon fontSize="small" />, tone: '#dc2626' },
  ];

  const tabItems = [
    { key: 'needsAssignment', label: `Needs Assignment (${needsAssignment.length})` },
    { key: 'inProgress', label: `In Progress (${inProgress.length})` },
    { key: 'contractorPayable', label: `Contractor Payable (${vendorPayable.length})` },
    { key: 'orderTimeline', label: `Order Timeline (${orderSummary.length})` },
  ];

  const isVendorTab = activeTab === 'contractorPayable';

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: '#f3f3fa', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography variant="h5" fontWeight={900} color="#5b21b6">Post Printing Control</Typography>
            <Typography variant="body2" color="text.secondary">Printing done → Post Design Team assigns contractors → Finishing → Ready → Delivery</Typography>
          </Box>
          <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon />} onClick={load} variant="contained" sx={{ bgcolor: '#7c3aed', borderRadius: 2.5, '&:hover': { bgcolor: '#5b21b6' } }}>
            Refresh
          </Button>
        </Stack>

        {message && <Alert severity={message.severity} sx={{ mt: 1.5, borderRadius: 2 }}>{message.text}</Alert>}

        <Grid container spacing={1.25} sx={{ mt: 0.5 }}>
          {kpis.map((card) => (
            <Grid item xs={6} sm={3} key={card.title}>
              <KpiCard {...card} />
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 1.5 }} />

        <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, textTransform: 'none', fontWeight: 800 } }}>
          {tabItems.map((tab) => <Tab key={tab.key} value={tab.key} label={tab.label} />)}
        </Tabs>

        {isTimelineTab ? (
          <Box sx={{ mt: 1.25, maxHeight: { xs: '62vh', md: '68vh' }, overflowY: 'auto' }}>
            {loading ? (
              <Stack alignItems="center" justifyContent="center" py={6}><CircularProgress size={28} /></Stack>
            ) : orderSummary.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" py={6}>
                <Typography color="text.secondary">No orders currently in post-printing or finishing stage.</Typography>
              </Stack>
            ) : orderSummary.map((order) => (
              <Paper key={order.Order_uuid} variant="outlined" sx={{ p: 1.5, mb: 1.25, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1} mb={1}>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    <Typography variant="subtitle2" fontWeight={900} color="#5b21b6">#{order.Order_Number || '-'}</Typography>
                    {order.customerName && <Typography variant="body2" color="text.secondary">{order.customerName}</Typography>}
                    <Chip size="small" label={order.stage} sx={{ bgcolor: alpha('#7c3aed', 0.1), color: '#5b21b6', fontWeight: 800 }} />
                    {order.jobs?.length > 0 && (
                      <Chip size="small" label={`${order.jobs.filter((j) => j.status === 'completed').length}/${order.jobs.length} done`}
                        color={order.jobs.every((j) => j.status === 'completed') ? 'success' : 'warning'} />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={0.75}>
                    <ActionButton
                      title="Add Post-Print Job"
                      icon={<StorefrontRoundedIcon fontSize="small" />}
                      onClick={() => navigate(`${ROUTES.POST_PRINTING_JOBS}?order=${order.Order_uuid}`)}
                    />
                    <ActionButton
                      title="Mark Ready"
                      icon={<CheckCircleRoundedIcon fontSize="small" />}
                      onClick={() => runAction(() => markOrderReady(order.Order_uuid), 'Order marked ready')}
                    />
                    <ActionButton
                      title="View Order"
                      icon={<VisibilityRoundedIcon fontSize="small" />}
                      onClick={() => navigate(`/orderUpdate/${order._id || order.Order_uuid}`)}
                    />
                  </Stack>
                </Stack>
                {order.jobs?.length > 0 ? (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {order.jobs.map((job) => (
                      <Chip
                        key={job.job_uuid}
                        size="small"
                        label={`${JOB_TYPE_LABEL[job.job_type] || job.job_type}${job.vendor_name ? ` · ${job.vendor_name}` : ''}`}
                        color={JOB_STATUS_COLOR[job.status] || 'default'}
                        variant={job.status === 'completed' ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700, fontSize: 11 }}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary" fontStyle="italic">
                    No post-print jobs assigned yet. Click the contractor icon to add one.
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ mt: 1.25, borderRadius: 3, border: '1px solid', borderColor: 'divider', maxHeight: { xs: '60vh', md: '65vh' } }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>{isVendorTab ? 'Contractor' : 'Order / Party'}</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>{isVendorTab ? 'Billed' : 'Customer'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>{isVendorTab ? 'Paid' : 'Amount'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Balance</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Stage</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : tabRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No records.</Typography></TableCell></TableRow>
                ) : tabRows.map((row, idx) => {
                  const id = isVendorTab ? (row.vendorUuid || row.vendorName) : orderId(row);
                  return (
                    <TableRow hover key={row._id || row.Order_uuid || row.vendorUuid || idx}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={900}>
                          {isVendorTab ? row.vendorName : `#${row.Order_Number || '-'}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {isVendorTab ? '' : row.orderNote || ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {isVendorTab ? money(row.credit) : getCustomerLabel(row)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {isVendorTab ? money(row.debit) : money(row.orderTotal ?? row.Amount ?? 0)}
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={money(isVendorTab ? row.balance : row.outstandingAmount)} color={(isVendorTab ? row.balance : row.outstandingAmount) > 0 ? 'warning' : 'success'} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={isVendorTab ? 'Payable' : row.stage || '-'} sx={{ bgcolor: alpha('#7c3aed', 0.1), color: '#5b21b6', fontWeight: 800 }} />
                      </TableCell>
                      <TableCell>{shortDate(isVendorTab ? null : row.dueDate)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {isVendorTab ? (
                          <ActionButton title="Pay Contractor" icon={<PaymentsRoundedIcon fontSize="small" />} onClick={() => openVendorPayment(row)} />
                        ) : (
                          <>
                            <ActionButton title="Assign Contractor" icon={<StorefrontRoundedIcon fontSize="small" />} onClick={() => openVendor(row)} disabled={!id} />
                            <ActionButton title="Mark Ready" icon={<CheckCircleRoundedIcon fontSize="small" />} onClick={() => runAction(() => markOrderReady(id), 'Order marked ready')} disabled={!id} />
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

      {/* Assign Contractor Dialog */}
      <Dialog open={dialog === 'vendor'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign Contractor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="Contractor" select value={vendorForm.vendorId} onChange={(e) => {
              const vendor = vendors.find((v) => v.Vendor_uuid === e.target.value);
              setVendorForm((p) => ({ ...p, vendorId: e.target.value, vendorName: vendor?.Vendor_name || '' }));
            }} fullWidth>
              <MenuItem value="">Select contractor</MenuItem>
              {vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}
            </TextField>
            <TextField label="Contractor Name (new / manual)" value={vendorForm.vendorName} onChange={(e) => setVendorForm((p) => ({ ...p, vendorName: e.target.value }))} fullWidth />
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField label="Amount" type="number" value={vendorForm.amount} onChange={(e) => setVendorForm((p) => ({ ...p, amount: e.target.value }))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Due Date" type="date" InputLabelProps={{ shrink: true }} value={vendorForm.dueDate} onChange={(e) => setVendorForm((p) => ({ ...p, dueDate: e.target.value }))} fullWidth /></Grid>
            </Grid>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField label="Work Type" value={vendorForm.workType} onChange={(e) => setVendorForm((p) => ({ ...p, workType: e.target.value }))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Job Mode" select value={vendorForm.jobMode} onChange={(e) => setVendorForm((p) => ({ ...p, jobMode: e.target.value }))} fullWidth>
                  <MenuItem value="jobwork_only">Job Work Only</MenuItem>
                  <MenuItem value="vendor_with_material">Vendor Supplies Material</MenuItem>
                  <MenuItem value="own_material_sent">Our Material Sent</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField label="Note" value={vendorForm.note} onChange={(e) => setVendorForm((p) => ({ ...p, note: e.target.value }))} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving || (!vendorForm.vendorId && !vendorForm.vendorName)} variant="contained" sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#5b21b6' } }}
            onClick={() => runAction(() => assignVendorToOrder(orderId(selected), vendorForm), 'Contractor assigned and follow-up created')}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pay Contractor Dialog */}
      <Dialog open={dialog === 'vendorPayment'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Pay Contractor</DialogTitle>
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
          <Button disabled={saving} variant="contained" sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#5b21b6' } }}
            onClick={() => runAction(() => payVendor(selected?.vendorUuid || selected?.Vendor_uuid, vendorPayForm), 'Payment recorded')}>
            Pay
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
