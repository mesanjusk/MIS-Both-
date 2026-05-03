import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import PropTypes from 'prop-types';
import toast, { Toaster } from 'react-hot-toast';
import { FullscreenAddFormLayout, compactCardSx, compactFieldSx } from '../components/ui';
import { fetchCustomers } from '../services/customerService';
import { addTransaction } from '../services/transactionService';

const PENDING_PAYMENT_KEY = 'mis_pending_upi_payment';
const PAYEE_VPA_KEY = 'mis_upi_payee_vpa';
const PAYEE_NAME_KEY = 'mis_upi_payee_name';

function buildUpiLink({ pa, pn, am, tn, tr }) {
  const params = new URLSearchParams({
    pa: String(pa || '').trim(),
    pn: String(pn || '').trim(),
    am: String(am || '').trim(),
    tn: String(tn || '').trim(),
    tr: String(tr || '').trim(),
    cu: 'INR',
  });

  return `upi://pay?${params.toString()}`;
}

function createReference() {
  return `MISUPI${Date.now()}`;
}

export default function UpiPayment({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const resumePromptedRef = useRef(false);
  const returnCheckTimer = useRef(null);

  const [mode, setMode] = useState('scan_qr');
  const [loggedInUser, setLoggedInUser] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [allCustomerOptions, setAllCustomerOptions] = useState([]);
  const [accountCustomerOptions, setAccountCustomerOptions] = useState([]);

  const [customerName, setCustomerName] = useState('');
  const [creditCustomer, setCreditCustomer] = useState('');
  const [debitCustomer, setDebitCustomer] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const [payeeVpa, setPayeeVpa] = useState(
    localStorage.getItem(PAYEE_VPA_KEY) || import.meta.env.VITE_UPI_PAYEE_VPA || '',
  );
  const [payeeName, setPayeeName] = useState(
    localStorage.getItem(PAYEE_NAME_KEY) || import.meta.env.VITE_UPI_PAYEE_NAME || '',
  );

  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);

  useEffect(() => {
    const userNameFromState = location.state?.id || localStorage.getItem('User_name');
    if (userNameFromState) setLoggedInUser(userNameFromState);
    else navigate('/login');
  }, [location.state, navigate]);

  useEffect(() => {
    setOptionsLoading(true);
    fetchCustomers()
      .then((res) => {
        if (res?.data?.success) {
          const customers = Array.isArray(res.data.result) ? res.data.result : [];
          setAllCustomerOptions(customers);
          setAccountCustomerOptions(
            customers.filter((item) => item.Customer_group === 'Bank and Account'),
          );
        }
      })
      .catch(() => toast.error('Error fetching customers'))
      .finally(() => setOptionsLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(PAYEE_VPA_KEY, payeeVpa);
  }, [payeeVpa]);

  useEffect(() => {
    localStorage.setItem(PAYEE_NAME_KEY, payeeName);
  }, [payeeName]);

  const selectedCustomer = useMemo(
    () => allCustomerOptions.find((c) => c.Customer_uuid === creditCustomer) || null,
    [allCustomerOptions, creditCustomer],
  );

  const autocompleteSlotProps = useMemo(() => ({ popper: { sx: { zIndex: 2305 } } }), []);
  const selectMenuProps = useMemo(
    () => ({ sx: { zIndex: 2305 }, PaperProps: { sx: { zIndex: 2305 } } }),
    [],
  );

  const closeModal = () => (onClose ? onClose() : navigate('/home'));

  const validateCommonForm = useCallback(() => {
    if (!creditCustomer) {
      toast.error('Select customer.');
      return false;
    }

    if (!debitCustomer) {
      toast.error('Select payment account.');
      return false;
    }

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter valid amount.');
      return false;
    }

    return true;
  }, [amount, creditCustomer, debitCustomer]);

  const validatePaymentForm = useCallback(() => {
    if (!validateCommonForm()) return false;

    if (mode === 'pay_to_upi') {
      if (!payeeVpa.trim()) {
        toast.error('Enter receiver UPI ID.');
        return false;
      }

      if (!payeeName.trim()) {
        toast.error('Enter receiver name.');
        return false;
      }
    }

    return true;
  }, [mode, payeeName, payeeVpa, validateCommonForm]);

  const clearPending = useCallback(() => {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    setPendingPayment(null);
    setResumeDialogOpen(false);
    setLaunching(false);
    resumePromptedRef.current = false;
  }, []);

  const persistTransaction = useCallback(
    async (paymentData) => {
      const customer = allCustomerOptions.find(
        (c) => c.Customer_uuid === paymentData.creditCustomer,
      );
      const paymentModeAccount = accountCustomerOptions.find(
        (c) => c.Customer_uuid === paymentData.debitCustomer,
      );

      if (!customer || !paymentModeAccount) {
        toast.error('Customer or payment account not found.');
        return;
      }

      const todayDate = new Date().toISOString().split('T')[0];
      const journal = [
        {
          Account_id: paymentModeAccount.Customer_uuid,
          Type: 'Debit',
          Amount: Number(paymentData.amount),
        },
        {
          Account_id: customer.Customer_uuid,
          Type: 'Credit',
          Amount: Number(paymentData.amount),
        },
      ];

      const formData = new FormData();
      formData.append(
        'Description',
        paymentData.description || `UPI payment - ${customer.Customer_name}`,
      );
      formData.append('Total_Credit', Number(paymentData.amount));
      formData.append('Total_Debit', Number(paymentData.amount));
      formData.append('Payment_mode', paymentModeAccount.Customer_name);
      formData.append('Created_by', loggedInUser);
      formData.append('Transaction_date', todayDate);
      formData.append('Journal_entry', JSON.stringify(journal));
      formData.append('Customer_uuid', customer.Customer_uuid);
      formData.append('Upi_reference', paymentData.reference || '');
      formData.append('Upi_status', 'SUCCESS');
      formData.append('Upi_app', '');
      formData.append('Upi_payee_vpa', paymentData.payeeVpa || '');
      formData.append('Source', paymentData.source || 'UPI_QR_SCAN');

      await addTransaction(formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    [accountCustomerOptions, allCustomerOptions, loggedInUser],
  );

  const handleResumeConfirm = async () => {
    if (!pendingPayment) return;

    try {
      setSaving(true);
      await persistTransaction(pendingPayment);
      toast.success('UPI payment saved in dashboard.');
      clearPending();
      closeModal();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const promptForResume = useCallback(() => {
    const raw = sessionStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw || resumePromptedRef.current) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.reference) return;

      resumePromptedRef.current = true;
      setPendingPayment(parsed);
      setMode(parsed.mode || 'scan_qr');
      setDescription(parsed.description || '');
      setAmount(parsed.amount || '');
      setCreditCustomer(parsed.creditCustomer || '');
      setDebitCustomer(parsed.debitCustomer || '');
      setPayeeVpa(parsed.payeeVpa || '');
      setPayeeName(parsed.payeeName || '');
      setResumeDialogOpen(true);
      setLaunching(false);
    } catch {
      sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (returnCheckTimer.current) clearTimeout(returnCheckTimer.current);
        returnCheckTimer.current = window.setTimeout(promptForResume, 350);
      }
    };

    const onFocus = () => {
      if (returnCheckTimer.current) clearTimeout(returnCheckTimer.current);
      returnCheckTimer.current = window.setTimeout(promptForResume, 350);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    promptForResume();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      if (returnCheckTimer.current) clearTimeout(returnCheckTimer.current);
    };
  }, [promptForResume]);

  const launchPayToUpi = () => {
    if (!validatePaymentForm()) return;

    const reference = createReference();
    const nextPendingPayment = {
      mode: 'pay_to_upi',
      creditCustomer,
      debitCustomer,
      amount: String(Number(amount)),
      description:
        description.trim() ||
        `UPI payment - ${customerName || selectedCustomer?.Customer_name || 'Customer'}`,
      payeeVpa: payeeVpa.trim(),
      payeeName: payeeName.trim(),
      source: 'UPI_INTENT',
      reference,
      launchedAt: Date.now(),
    };

    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(nextPendingPayment));
    setPendingPayment(nextPendingPayment);
    setLaunching(true);

    const upiUrl = buildUpiLink({
      pa: nextPendingPayment.payeeVpa,
      pn: nextPendingPayment.payeeName,
      am: nextPendingPayment.amount,
      tn: nextPendingPayment.description,
      tr: nextPendingPayment.reference,
    });

    window.location.href = upiUrl;
  };

  const launchQrScan = () => {
    if (!validatePaymentForm()) return;

    const reference = createReference();
    const nextPendingPayment = {
      mode: 'scan_qr',
      creditCustomer,
      debitCustomer,
      amount: String(Number(amount)),
      description:
        description.trim() ||
        `UPI QR payment - ${customerName || selectedCustomer?.Customer_name || 'Customer'}`,
      payeeVpa: '',
      payeeName: '',
      source: 'UPI_QR_SCAN',
      reference,
      launchedAt: Date.now(),
    };

    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(nextPendingPayment));
    setPendingPayment(nextPendingPayment);
    setLaunching(true);

    window.location.href = 'upi://pay';
  };

  const handlePrimaryAction = () => {
    if (mode === 'scan_qr') {
      launchQrScan();
      return;
    }
    launchPayToUpi();
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />

      <Dialog open={resumeDialogOpen} onClose={() => setResumeDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Did the UPI payment complete?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Alert severity="info">
              After returning from the UPI app, confirm payment here to save it in the dashboard.
            </Alert>

            {pendingPayment ? (
              <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                <Typography variant="body2">
                  <strong>Mode:</strong>{' '}
                  {pendingPayment.mode === 'scan_qr' ? 'Scan QR' : 'Pay by UPI ID'}
                </Typography>
                <Typography variant="body2">
                  <strong>Amount:</strong> ₹{pendingPayment.amount}
                </Typography>
                <Typography variant="body2">
                  <strong>Reference:</strong> {pendingPayment.reference}
                </Typography>
                {pendingPayment.payeeVpa ? (
                  <Typography variant="body2">
                    <strong>Receiver UPI ID:</strong> {pendingPayment.payeeVpa}
                  </Typography>
                ) : null}
              </Paper>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button startIcon={<CancelRoundedIcon />} onClick={clearPending} color="inherit">
            Not Paid
          </Button>
          <Button
            startIcon={<CheckCircleRoundedIcon />}
            onClick={handleResumeConfirm}
            disabled={saving}
            variant="contained"
          >
            {saving ? 'Saving...' : 'Yes, Save Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      <FullscreenAddFormLayout
        onSubmit={(e) => {
          e.preventDefault();
          handlePrimaryAction();
        }}
        onClose={closeModal}
        submitLabel={
          launching
            ? 'Waiting for return...'
            : mode === 'scan_qr'
              ? 'Open UPI App'
              : 'Open UPI Apps'
        }
        busy={launching}
        disableSubmit={optionsLoading}
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1.25}>
         

            <Tabs
              value={mode}
              onChange={(_, nextValue) => setMode(nextValue)}
              variant="fullWidth"
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  minHeight: 40,
                  py: 0.75,
                  textTransform: 'none',
                  fontWeight: 600,
                },
              }}
            >
              <Tab
                value="scan_qr"
                icon={<QrCodeScannerRoundedIcon fontSize="small" />}
                iconPosition="start"
                label="Scan QR"
              />
              <Tab
                value="pay_to_upi"
                icon={<AccountBalanceWalletRoundedIcon fontSize="small" />}
                iconPosition="start"
                label="Pay by UPI ID"
              />
            </Tabs>

            <Autocomplete
              loading={optionsLoading}
              options={allCustomerOptions}
              value={selectedCustomer}
              inputValue={customerName}
              slotProps={autocompleteSlotProps}
              onInputChange={(_, value) => {
                setCustomerName(value || '');
                if (!value) setCreditCustomer('');
              }}
              onChange={(_, value) => {
                setCreditCustomer(value?.Customer_uuid || '');
                setCustomerName(value?.Customer_name || '');
              }}
              getOptionLabel={(option) => option?.Customer_name || ''}
              isOptionEqualToValue={(option, value) => option?.Customer_uuid === value?.Customer_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Customer"
                  placeholder="Search by customer name"
                  size="small"
                  sx={compactFieldSx}
                />
              )}
            />

            <Stack direction="row" spacing={1}>
              <TextField
                label="Amount (₹)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
                size="small"
                sx={compactFieldSx}
              />
              <TextField
                select
                label="Payment Account"
                value={debitCustomer}
                onChange={(e) => setDebitCustomer(e.target.value)}
                fullWidth
                size="small"
                sx={compactFieldSx}
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">Select account</MenuItem>
                {accountCustomerOptions.map((cust) => (
                  <MenuItem key={cust.Customer_uuid} value={cust.Customer_uuid}>
                    {cust.Customer_name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for payment"
              size="small"
              sx={compactFieldSx}
            />

            {mode === 'scan_qr' ? (
              <Box>
                
              </Box>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Receiver UPI ID"
                  value={payeeVpa}
                  onChange={(e) => setPayeeVpa(e.target.value)}
                  placeholder="yourname@bank"
                  fullWidth
                  size="small"
                  sx={compactFieldSx}
                />
                <TextField
                  label="Receiver Name"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="Business name"
                  fullWidth
                  size="small"
                  sx={compactFieldSx}
                />
              </Stack>
            )}

          </Stack>
        </Paper>
      </FullscreenAddFormLayout>
    </>
  );
}

UpiPayment.propTypes = {
  onClose: PropTypes.func,
};