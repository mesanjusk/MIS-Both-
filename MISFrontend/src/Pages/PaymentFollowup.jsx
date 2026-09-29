import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast, { Toaster } from 'react-hot-toast';
import {
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Autocomplete,
  Paper,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  extractPhoneNumber,
  normalizeWhatsAppPhone,
} from '../utils/whatsapp.js';
import { FullscreenAddFormLayout } from '../Components/ui';
import { compactCardSx, compactFieldSx } from '../Components/ui/addFormStyles';

const todayISO = () => new Date().toLocaleDateString('en-CA');

const getCustomerName = (item = {}) =>
  (
    item?.Customer_name ||
    item?.customer_name ||
    item?.User_name ||
    item?.user_name ||
    item?.name ||
    item?.Name ||
    item?.Customer ||
    ''
  )
    .toString()
    .trim();

const getCustomerPhone = (item = {}) =>
  normalizeWhatsAppPhone(
    extractPhoneNumber(item) ||
      item?.mobile_number ||
      item?.Mobile ||
      item?.contact ||
      item?.Contact ||
      item?.WhatsApp_number ||
      item?.whatsapp_number ||
      item?.whatsapp ||
      ''
  );

const findCustomerRecord = (list = [], selectedName = '') => {
  const target = String(selectedName || '').trim().toLowerCase();
  if (!target) return null;

  return (
    list.find((item) => getCustomerName(item).toLowerCase() === target) ||
    list.find((item) => getCustomerName(item).toLowerCase().includes(target)) ||
    null
  );
};

export default function PaymentFollowup() {
  const navigate = useNavigate();

  const [Customer, setCustomer] = useState('');
  const [Amount, setAmount] = useState('');
  const [Title, setTitle] = useState('');
  const [Remark, setRemark] = useState('');

  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerDetails, setCustomerDetails] = useState([]);

  const [savedFollowupId, setSavedFollowupId] = useState('');
  const [mobileToSend, setMobileToSend] = useState('');
  const [sendWhatsAppAfterSave, setSendWhatsAppAfterSave] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isTransactionSaved, setIsTransactionSaved] = useState(false);

  const [isDateChecked, setIsDateChecked] = useState(false);
  const [Deadline, setDeadline] = useState(todayISO());

  const [submitting, setSubmitting] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const inputLabelProps = { shrink: true };

  useEffect(() => {
    setIsAdminUser(localStorage.getItem('User_group') === 'Admin User');

    const loadCustomers = async () => {
      const normalizeNames = (arr) =>
        Array.from(new Set((arr || []).map((it) => getCustomerName(it)).filter(Boolean)));

      try {
        const r1 = await axios.get('/api/customers/GetCustomersList');
        if (r1?.data?.success && Array.isArray(r1.data.result)) {
          setCustomerDetails(r1.data.result);
          setCustomerOptions(normalizeNames(r1.data.result));
          return;
        }
        throw new Error('Singular route returned unexpected response');
      } catch {
        try {
          const r2 = await axios.get('/api/customers/GetCustomersList');
          if (r2?.data?.success && Array.isArray(r2.data.result)) {
            setCustomerDetails(r2.data.result);
            setCustomerOptions(normalizeNames(r2.data.result));
            return;
          }
          throw new Error('Plural route returned unexpected response');
        } catch (err2) {
          const msg =
            err2?.response?.data?.message || err2?.message || 'Unknown error';
          console.error('Error fetching customers:', msg, err2?.response?.data);
          toast.error(`Unable to load customers: ${msg}`);
        }
      }
    };

    loadCustomers();
  }, []);

  const closeModal = () => navigate('/Home');

  const handleDateCheckboxChange = () => {
    setIsDateChecked((prev) => !prev);
    setDeadline(todayISO());
  };

  // Both the legacy creation form and Home tab use the same guarded backend
  // sender, which verifies the live ledger, uses an approved template, and
  // records the send with a 48-hour duplicate cooldown.
  const sendWhatsApp = async (id = savedFollowupId) => {
    if (!id) return toast.error('Save a follow-up first.');
    if (!window.confirm('Send one approved WhatsApp payment reminder? This may incur a charge.')) return;
    setIsSendingWhatsApp(true);
    try {
      const { data } = await axios.post(
        '/api/paymentfollowup/' + encodeURIComponent(id) + '/send-reminder',
        { confirmed: true }
      );
      data?.success ? toast.success('WhatsApp reminder sent and logged') :
        toast.error(data?.message || 'Failed to send reminder');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send WhatsApp reminder');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!Customer) return toast.error('Please select a customer.');
    if (!customerOptions.includes(Customer)) {
      return toast.error('Please pick a customer from the suggestions.');
    }
    if (!Amount || Number(Amount) <= 0) {
      return toast.error('Please enter a valid amount.');
    }

    const finalDate =
      isAdminUser && isDateChecked ? Deadline || todayISO() : todayISO();

    try {
      setSubmitting(true);
      setIsTransactionSaved(false);
      setSavedFollowupId('');
      setMobileToSend('');

      const matching = customerDetails.filter(
        (item) => getCustomerName(item).toLowerCase() === Customer.trim().toLowerCase()
      );
      // Name-only legacy records remain supported; never link an ambiguous
      // duplicated display name to an arbitrary customer's ledger.
      const uniqueCustomer = matching.length === 1 ? matching[0] : null;
      const saved = await axios.post('/api/paymentfollowup/add', {
        Customer,
        Customer_uuid: uniqueCustomer?.Customer_uuid || '',
        Amount: Number(Amount),
        Title: Title?.trim(),
        Followup_date: finalDate,
        Remark: Remark?.trim(),
      });

      const selectedCustomer = uniqueCustomer || findCustomerRecord(customerDetails, Customer);
      const phoneNumber = getCustomerPhone(selectedCustomer);
      const id = saved.data?.result?._id || '';
      toast.success('Payment follow-up added.');
      setSavedFollowupId(id);
      setMobileToSend(phoneNumber);
      setIsTransactionSaved(true);

      if (sendWhatsAppAfterSave && id) {
        if (!phoneNumber) {
          toast.error('Customer phone number is missing for WhatsApp');
          return;
        }
        await sendWhatsApp(id);
      }
    } catch (err) {
      if (err?.response?.status === 409) {
        toast.error(err.response.data?.message || 'A similar follow-up already exists for this customer/date.');
      } else {
        const msg = err?.response?.data?.message || err?.message || 'Unknown error';
        console.error('Save follow-up error:', msg, err?.response?.data);
        toast.error(`Something went wrong: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={closeModal}
        submitLabel={submitting ? 'Saving...' : 'Submit'}
        busy={submitting}
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1}>
            <Autocomplete
              options={customerOptions}
              value={Customer}
              slotProps={{ popper: { sx: { zIndex: 2305 } } }}
              onChange={(_, value) => setCustomer(value || '')}
              onInputChange={(_, value) => setCustomer(value || '')}
              renderInput={(params) => (
                <TextField {...params} label="Select Customer" placeholder="Search customer" size="small" sx={compactFieldSx} />
              )}
            />

            <TextField
              label="Amount (₹)"
              type="number"
              value={Amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
              size="small"
              sx={compactFieldSx}
            />

            {isAdminUser && (
              <FormControlLabel
                sx={{ m: 0 }}
                control={<Checkbox checked={isDateChecked} onChange={handleDateCheckboxChange} />}
                label="Save Date"
              />
            )}

            {isAdminUser && isDateChecked ? (
              <TextField
                label="Follow-up Date"
                type="date"
                value={Deadline}
                onChange={(e) => setDeadline(e.target.value)}
                InputLabelProps={inputLabelProps}
                size="small"
                sx={compactFieldSx}
              />
            ) : null}

            <TextField
              label="Short Title / Reason"
              value={Title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Pending invoice for July"
              size="small"
              sx={compactFieldSx}
            />

            <TextField
              label="Remark"
              value={Remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Add remark"
              size="small"
              sx={compactFieldSx}
            />

            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Checkbox
                  checked={sendWhatsAppAfterSave}
                  onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)}
                />
              }
              label="Send WhatsApp after saving"
            />

            {isTransactionSaved ? (
              <Button
                type="button"
                variant="outlined"
                size="small"
                startIcon={<SendRoundedIcon fontSize="small" />}
                onClick={() => sendWhatsApp()}
                disabled={isSendingWhatsApp || !mobileToSend}
                sx={{ borderRadius: 2 }}
              >
                {isSendingWhatsApp
                  ? 'Sending WhatsApp...'
                  : !mobileToSend
                  ? 'Mobile number missing'
                  : 'Send WhatsApp Reminder'}
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </FullscreenAddFormLayout>
    </>
  );
}
