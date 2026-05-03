import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddLinkRoundedIcon from '@mui/icons-material/AddLinkRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ReactQRCode from 'react-qr-code';
import { toast } from '../../Components';
import { fetchCustomers } from '../../services/customerService';
import { addTransaction } from '../../services/transactionService';
import {
  createUpiPaymentAttempt,
  listUpiPaymentAttempts,
  updateUpiPaymentAttemptStatus,
} from '../../services/upiPaymentService';
import { parseApiError } from '../../utils/parseApiError';
import { buildUpiPayLink, generateTxnRef } from '../../utils/upi';

const DEFAULT_PAYEE_VPA_KEY = 'mis_upi_default_vpa';
const DEFAULT_PAYEE_NAME_KEY = 'mis_upi_default_name';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatDateTime = (value) => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const getCustomerPhone = (customer) => customer?.Mobile || customer?.Mobile_no || customer?.Phone || customer?.phone || '';

export default function UpiCollectionSection() {
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [txnRef, setTxnRef] = useState(generateTxnRef('COL'));
  const [payeeUpiId, setPayeeUpiId] = useState(localStorage.getItem(DEFAULT_PAYEE_VPA_KEY) || '');
  const [payeeName, setPayeeName] = useState(localStorage.getItem(DEFAULT_PAYEE_NAME_KEY) || '');
  const [recent, setRecent] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);

  const isCollectReady = Boolean(payeeUpiId.trim() && payeeName.trim());

  useEffect(() => {
    localStorage.setItem(DEFAULT_PAYEE_VPA_KEY, payeeUpiId);
  }, [payeeUpiId]);

  useEffect(() => {
    localStorage.setItem(DEFAULT_PAYEE_NAME_KEY, payeeName);
  }, [payeeName]);

  const loadBaseData = async () => {
    try {
      setLoading(true);
      const [custRes, attemptRes] = await Promise.all([
        fetchCustomers(),
        listUpiPaymentAttempts({ limit: 20 }),
      ]);
      const customerRows = Array.isArray(custRes?.data?.result) ? custRes.data.result : [];
      setCustomers(customerRows);
      setAccounts(customerRows.filter((item) => item.Customer_group === 'Bank and Account'));
      setRecent(Array.isArray(attemptRes?.data?.result) ? attemptRes.data.result : []);
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to load UPI data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  const shareLink = activeRequest?.shareLink || '';
  const upiLink = useMemo(() => {
    if (activeRequest?.upiLink) return activeRequest.upiLink;
    if (!isCollectReady) return '';
    return buildUpiPayLink({
      vpa: payeeUpiId,
      name: payeeName,
      amount,
      note,
      txnRef,
    });
  }, [activeRequest?.upiLink, amount, isCollectReady, note, payeeName, payeeUpiId, txnRef]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setSelectedAccount(null);
    setAmount('');
    setNote('');
    setTxnRef(generateTxnRef('COL'));
  };

  const validateBase = () => {
    if (!selectedCustomer) {
      toast.error('Select customer');
      return false;
    }
    if (!selectedAccount) {
      toast.error('Select bank account');
      return false;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter valid amount');
      return false;
    }
    return true;
  };

  const createRequest = async ({ markInitiated = false } = {}) => {
    if (!validateBase()) return null;
    if (!isCollectReady) {
      toast.error('Enter receiver UPI ID and name once for collection requests');
      return null;
    }

    try {
      setSaving(true);
      const payload = {
        customerId: selectedCustomer.Customer_uuid,
        customerName: selectedCustomer.Customer_name,
        mobileNumber: getCustomerPhone(selectedCustomer),
        relatedAccountId: selectedAccount.Customer_uuid,
        relatedAccountName: selectedAccount.Customer_name,
        amount: Number(amount),
        note: note.trim() || `Payment from ${selectedCustomer.Customer_name}`,
        transactionRef: txnRef.trim() || generateTxnRef('COL'),
        payeeUpiId: payeeUpiId.trim(),
        payeeName: payeeName.trim(),
        status: markInitiated ? 'initiated' : 'pending',
        initiationSource: markInitiated ? 'scanner-launch' : 'collection-link',
        metadata: { createdFrom: 'dashboard-top-section' },
      };

      const response = await createUpiPaymentAttempt(payload);
      const request = response?.data?.result;
      setActiveRequest(request);
      setTxnRef(request?.transactionRef || generateTxnRef('COL'));
      toast.success(markInitiated ? 'Pending scanner entry saved.' : 'Payment request created.');
      await loadBaseData();
      return request;
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to create payment request'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleOpenScanner = async () => {
    const request = await createRequest({ markInitiated: true });
    if (!request) return;
    window.location.href = 'upi://pay';
  };

  const handleGenerateCollection = async () => {
    await createRequest({ markInitiated: false });
  };

  const copyValue = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  };

  const confirmPayment = async (request) => {
    if (!request?._id) return;
    if (request?.transactionUuid) {
      toast.error('This request is already converted to transaction.');
      return;
    }

    try {
      setSaving(true);
      const journal = [
        { Account_id: request.relatedAccountId, Type: 'Debit', Amount: Number(request.amount) },
        { Account_id: request.customerId, Type: 'Credit', Amount: Number(request.amount) },
      ];

      const formData = new FormData();
      formData.append('Description', request.note || `UPI collection - ${request.customerName}`);
      formData.append('Total_Credit', Number(request.amount));
      formData.append('Total_Debit', Number(request.amount));
      formData.append('Payment_mode', request.relatedAccountName || 'UPI');
      formData.append('Created_by', localStorage.getItem('User_name') || 'system');
      formData.append('Transaction_date', new Date().toISOString().split('T')[0]);
      formData.append('Journal_entry', JSON.stringify(journal));
      formData.append('Customer_uuid', request.customerId || '');
      formData.append('Upi_reference', request.transactionRef || '');
      formData.append('Upi_status', 'SUCCESS');
      formData.append('Upi_payee_vpa', request.payeeUpiId || '');
      formData.append('Source', 'UPI_COLLECTION_REQUEST');

      const transactionResponse = await addTransaction(formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const tx = transactionResponse?.data?.result;
      await updateUpiPaymentAttemptStatus(request._id, {
        status: 'success',
        transactionUuid: tx?.Transaction_uuid || '',
        transactionId: tx?.Transaction_id || null,
      });
      toast.success('Payment marked paid and saved in accounts.');
      await loadBaseData();
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to confirm payment'));
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (request) => {
    if (!request?._id) return;
    try {
      setSaving(true);
      await updateUpiPaymentAttemptStatus(request._id, { status: 'cancelled' });
      toast.success('Request cancelled.');
      await loadBaseData();
    } catch (error) {
      toast.error(parseApiError(error, 'Unable to cancel request'));
    } finally {
      setSaving(false);
    }
  };

  const pendingRows = useMemo(
    () => recent.filter((row) => ['created', 'initiated', 'pending'].includes(String(row?.status || '').toLowerCase())),
    [recent],
  );

  return (
    <Stack spacing={1.2}>
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Create a payment request once, then share the link or QR. Even if the customer does not send a receipt,
        this entry stays in pending until your accounts team confirms it from the bank and marks it paid.
      </Alert>

      <Grid container spacing={1}>
        <Grid item xs={12} md={6}>
          <Autocomplete
            options={customers}
            loading={loading}
            value={selectedCustomer}
            onChange={(_, value) => setSelectedCustomer(value)}
            getOptionLabel={(option) => option?.Customer_name || ''}
            renderInput={(params) => <TextField {...params} label="Customer" size="small" />}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            size="small"
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, step: '0.01' }}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <Autocomplete
            options={accounts}
            loading={loading}
            value={selectedAccount}
            onChange={(_, value) => setSelectedAccount(value)}
            getOptionLabel={(option) => option?.Customer_name || ''}
            renderInput={(params) => <TextField {...params} label="Bank Account" size="small" />}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth size="small" label="Remark" value={note} onChange={(e) => setNote(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField fullWidth size="small" label="Receiver UPI ID" value={payeeUpiId} onChange={(e) => setPayeeUpiId(e.target.value)} placeholder="yourname@bank" />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField fullWidth size="small" label="Receiver Name" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Business name" />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" startIcon={<AddLinkRoundedIcon />} onClick={handleGenerateCollection} disabled={saving || loading}>
          Generate Link & QR
        </Button>
        <Button variant="outlined" startIcon={<QrCode2RoundedIcon />} onClick={handleOpenScanner} disabled={saving || loading}>
          Open Scanner & Save Pending
        </Button>
        <Button variant="text" onClick={resetForm} disabled={saving}>Reset</Button>
      </Stack>

      {activeRequest ? (
        <Stack spacing={1.2} sx={{ p: 1.1, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">Current payment request</Typography>
              <Typography variant="caption" color="text.secondary">
                Ref: {activeRequest.transactionRef} • Status: {activeRequest.status}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {shareLink ? (
                <Button size="small" variant="outlined" startIcon={<OpenInNewRoundedIcon />} component={Link} href={shareLink} target="_blank" rel="noreferrer">
                  Open Link
                </Button>
              ) : null}
              {shareLink ? (
                <Button size="small" variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={() => copyValue(shareLink, 'Link')}>
                  Copy Link
                </Button>
              ) : null}
              {upiLink ? (
                <Button size="small" variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={() => copyValue(upiLink, 'UPI link')}>
                  Copy UPI URI
                </Button>
              ) : null}
            </Stack>
          </Stack>

          <Grid container spacing={1} alignItems="stretch">
            <Grid item xs={12} md={4}>
              <Box sx={{ p: 1, border: (theme) => `1px dashed ${theme.palette.divider}`, borderRadius: 2, bgcolor: 'background.paper', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 190 }}>
                {upiLink ? <ReactQRCode value={upiLink} size={160} /> : <Typography variant="caption">UPI ID and name required for QR</Typography>}
              </Box>
            </Grid>
            <Grid item xs={12} md={8}>
              <Stack spacing={0.8}>
                <Typography variant="body2"><strong>Customer:</strong> {activeRequest.customerName || '—'}</Typography>
                <Typography variant="body2"><strong>Amount:</strong> {money(activeRequest.amount)}</Typography>
                <Typography variant="body2"><strong>Account:</strong> {activeRequest.relatedAccountName || '—'}</Typography>
                <Typography variant="body2"><strong>Receiver UPI ID:</strong> {activeRequest.payeeUpiId || '—'}</Typography>
                <Typography variant="body2"><strong>Remark:</strong> {activeRequest.note || '—'}</Typography>
                {activeRequest.mobileNumber ? (
                  <Typography variant="body2"><strong>Customer mobile:</strong> {activeRequest.mobileNumber}</Typography>
                ) : null}
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  Payment request is saved immediately. Your accounts team can confirm it later even if the customer does not send a receipt.
                </Alert>
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      ) : null}

      <Divider />

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Pending UPI confirmations</Typography>
        <Button size="small" onClick={loadBaseData}>Refresh</Button>
      </Stack>

      <Box sx={{ maxHeight: 310, overflow: 'auto', border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Ref</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pendingRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">No pending UPI entries.</TableCell>
              </TableRow>
            ) : (
              pendingRows.map((row) => (
                <TableRow key={row._id || row.transactionRef} hover>
                  <TableCell>
                    <Stack spacing={0.2}>
                      <Typography variant="body2" fontWeight={600}>{row.customerName || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.relatedAccountName || '—'}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{money(row.amount)}</TableCell>
                  <TableCell>{row.transactionRef}</TableCell>
                  <TableCell>
                    <Chip size="small" label={row.status} color={row.status === 'initiated' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {row.shareLink ? (
                        <Tooltip title="Copy link">
                          <IconButton size="small" onClick={() => copyValue(row.shareLink, 'Link')}>
                            <ContentCopyRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      <Tooltip title="Mark paid">
                        <span>
                          <IconButton size="small" color="success" onClick={() => confirmPayment(row)} disabled={saving}>
                            <CheckCircleRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Cancel">
                        <span>
                          <IconButton size="small" color="error" onClick={() => cancelRequest(row)} disabled={saving}>
                            <CancelRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}
