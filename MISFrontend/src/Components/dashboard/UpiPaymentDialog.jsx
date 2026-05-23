import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { toast } from '../../Components';
import { fetchCustomers } from '../../services/customerService';
import {
  createUpiPaymentAttempt,
  getUpiPaymentAttemptById,
  listUpiPaymentAttempts,
} from '../../services/upiPaymentService';
import { parseApiError } from '../../utils/parseApiError';
import { buildUpiPayLink, generateTxnRef, isMobileDevice } from '../../utils/upi';

const toRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const getCustomerPhone = (customer) => (
  customer?.Mobile || customer?.Mobile_no || customer?.Phone || customer?.phone || ''
);

const getCustomerId = (customer) => (
  customer?.Customer_uuid || customer?._id || customer?.id || ''
);

const getAttemptId = (row) => row?._id || row?.id || row?.attemptId || row?.PaymentAttempt_uuid;

export default function UpiPaymentDialog({ open, onClose }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [payeeUpiId, setPayeeUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [invoiceId, setInvoiceId] = useState('');

  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [activeAttemptId, setActiveAttemptId] = useState('');

  const mobileDevice = useMemo(() => isMobileDevice(), []);

  const resetForm = () => {
    setSelectedCustomer(null);
    setPhone('');
    setAmount('');
    setNote('');
    setTxnRef(generateTxnRef());
    setPayeeUpiId('');
    setPayeeName('');
    setInvoiceId('');
    setActiveAttemptId('');
  };

  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const response = await fetchCustomers();
      const rows = toRows(response?.data);
      setCustomers(rows);
    } catch (error) {
      setCustomers([]);
      toast.error(parseApiError(error, 'Unable to load customers.'));
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadAttempts = async () => {
    try {
      setLoadingAttempts(true);
      const response = await listUpiPaymentAttempts({ limit: 10 });
      setAttempts(toRows(response?.data));
    } catch (error) {
      setAttempts([]);
      toast.error(parseApiError(error, 'Unable to load recent UPI attempts.'));
    } finally {
      setLoadingAttempts(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTxnRef(generateTxnRef());
    loadCustomers();
    loadAttempts();
  }, [open]);

  useEffect(() => {
    if (!selectedCustomer) {
      setPhone('');
      return;
    }
    setPhone(getCustomerPhone(selectedCustomer));
  }, [selectedCustomer]);

  useEffect(() => {
    const onVisibilityBack = () => {
      if (document.visibilityState === 'visible' && activeAttemptId) {
        toast.success('Payment initiated. Please verify status.');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityBack);
    return () => document.removeEventListener('visibilitychange', onVisibilityBack);
  }, [activeAttemptId]);

  const validateForm = () => {
    if (!selectedCustomer) {
      toast.error('Please select customer/account.');
      return false;
    }
    if (!payeeUpiId.trim()) {
      toast.error('Payee UPI ID is required.');
      return false;
    }
    if (!payeeName.trim()) {
      toast.error('Payee name is required.');
      return false;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Amount must be greater than 0.');
      return false;
    }
    return true;
  };

  const payloadFromForm = (reference) => ({
    customerId: getCustomerId(selectedCustomer),
    customerName: selectedCustomer?.Customer_name || selectedCustomer?.name || '',
    phone,
    amount: Number(amount),
    note,
    txnRef: reference,
    payeeUpiId: payeeUpiId.trim(),
    payeeName: payeeName.trim(),
    invoiceId: invoiceId.trim() || undefined,
    status: 'initiated',
  });

  const createAttempt = async () => {
    if (!validateForm()) return null;

    const finalTxnRef = txnRef.trim() || generateTxnRef();
    if (!txnRef.trim()) setTxnRef(finalTxnRef);

    setSaving(true);
    try {
      const response = await createUpiPaymentAttempt(payloadFromForm(finalTxnRef));
      const record = response?.data?.result || response?.data?.data || response?.data;
      const attemptId = getAttemptId(record);
      if (attemptId) setActiveAttemptId(attemptId);
      toast.success('UPI payment attempt saved.');
      await loadAttempts();
      return { attemptId, txnRef: finalTxnRef };
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to save payment attempt.'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveDraft = async () => {
    await createAttempt();
  };

  const onLaunchUpi = async () => {
    const result = await createAttempt();
    if (!result) return;

    setLaunching(true);
    try {
      const upiLink = buildUpiPayLink({
        vpa: payeeUpiId,
        name: payeeName,
        amount,
        note,
        txnRef: result.txnRef,
      });

      toast.success('Opening UPI app chooser...');
      window.location.href = upiLink;
    } catch (error) {
      toast.error(parseApiError(error, 'Could not launch UPI app.'));
    } finally {
      setLaunching(false);
    }
  };

  const refreshAttemptStatus = async (attemptId) => {
    if (!attemptId) return;

    try {
      await getUpiPaymentAttemptById(attemptId);
      toast.success('Status refreshed.');
      await loadAttempts();
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to refresh payment status.'));
    }
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Pay via UPI</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25}>
          {!mobileDevice ? (
            <Alert severity="warning">
              UPI app chooser works best on mobile. On desktop you may need QR or manual payment.
            </Alert>
          ) : null}

          <Grid container spacing={1.25}>
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={customers}
                loading={loadingCustomers}
                value={selectedCustomer}
                onChange={(_, value) => setSelectedCustomer(value)}
                getOptionLabel={(option) => option?.Customer_name || option?.name || 'Unknown'}
                renderInput={(params) => <TextField {...params} label="Customer / Account" required />}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                inputProps={{ min: '0', step: '0.01' }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Note / Remark"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Transaction Reference"
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                helperText="Auto-generated if left empty"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Invoice / Order ID (optional)"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Payee UPI ID"
                value={payeeUpiId}
                onChange={(e) => setPayeeUpiId(e.target.value)}
                placeholder="merchant@upi"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Payee Name"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                required
              />
            </Grid>
          </Grid>

          <Divider />

          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
              <Typography variant="subtitle2">Recent UPI Attempts</Typography>
              {activeAttemptId ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon fontSize="small" />}
                  onClick={() => refreshAttemptStatus(activeAttemptId)}
                >
                  Refresh Status
                </Button>
              ) : null}
            </Stack>

            <Box sx={{ maxHeight: 220, overflow: 'auto', border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Customer</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Txn Ref</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loadingAttempts && attempts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">No attempts found.</TableCell>
                    </TableRow>
                  ) : (
                    attempts.map((row, idx) => (
                      <TableRow key={getAttemptId(row) || `${row?.txnRef}-${idx}`} hover>
                        <TableCell>{row?.customerName || row?.customer?.Customer_name || '—'}</TableCell>
                        <TableCell align="right">{formatMoney(row?.amount)}</TableCell>
                        <TableCell>{row?.txnRef || row?.transactionRef || '—'}</TableCell>
                        <TableCell>{row?.status || 'pending'}</TableCell>
                        <TableCell>{formatDateTime(row?.createdAt || row?.CreatedAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.25 }}>
        <Button onClick={handleClose} color="inherit">Cancel</Button>
        <Button
          variant="outlined"
          startIcon={<SaveRoundedIcon fontSize="small" />}
          onClick={onSaveDraft}
          disabled={saving || launching}
        >
          Save Draft / Create Attempt
        </Button>
        <Button
          variant="contained"
          startIcon={<LaunchRoundedIcon fontSize="small" />}
          onClick={onLaunchUpi}
          disabled={saving || launching}
        >
          Launch UPI App
        </Button>
      </DialogActions>
    </Dialog>
  );
}

UpiPaymentDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
