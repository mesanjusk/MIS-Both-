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
  sendTemplateWithTextFallback,
} from '../utils/whatsapp.js';
import {
  WHATSAPP_TEMPLATES,
  buildFollowupDueTodayParameters,
  buildFollowupFriendlyParameters,
} from '../constants/whatsappTemplates';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

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

  const [whatsAppMessage, setWhatsAppMessage] = useState('');
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

  const sendWhatsApp = async (
    phone = mobileToSend,
    message = whatsAppMessage,
    customerData = null
  ) => {
    const selectedCustomer =
      customerData || findCustomerRecord(customerDetails, Customer);

    const resolvedPhone = normalizeWhatsAppPhone(
      phone || getCustomerPhone(selectedCustomer)
    );

    if (!resolvedPhone) {
      toast.error('Customer phone number is required');
      return;
    }

    setIsSendingWhatsApp(true);

    try {
      const customerLabel = getCustomerName(selectedCustomer) || Customer || 'Customer';
      const followupDate = Deadline || todayISO();
      const today = todayISO();

      const isDueToday = followupDate === today;
      const templateName = isDueToday
        ? WHATSAPP_TEMPLATES.FOLLOWUP_DUE_TODAY
        : WHATSAPP_TEMPLATES.FOLLOWUP_FRIENDLY;

      const bodyParameters = isDueToday
        ? buildFollowupDueTodayParameters({
            customerName: customerLabel,
            amount: String(Number(Amount || 0) || 0),
            dueDate: followupDate,
            reference: Title?.trim() || Remark?.trim() || '-',
          })
        : buildFollowupFriendlyParameters({
            customerName: customerLabel,
            amount: String(Number(Amount || 0) || 0),
            expectedDate: followupDate,
            reference: Title?.trim() || Remark?.trim() || '-',
          });

      const { data } = await sendTemplateWithTextFallback({
        axiosInstance: axios,
        phone: resolvedPhone,
        templateName,
        bodyParameters,
        fallbackMessage: message,
      });

      if (data?.success) {
        toast.success('WhatsApp message sent');
      } else {
        toast.error(data?.error || 'Failed to send WhatsApp message');
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to send WhatsApp message');
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
      setWhatsAppMessage('');
      setMobileToSend('');

      const res = await axios.post('/api/paymentfollowup/add', {
        Customer,
        Amount: Number(Amount),
        Title: Title?.trim(),
        Followup_date: finalDate,
        Remark: Remark?.trim(),
      });

      if (res.data === 'exist') {
        toast.error('A similar follow-up already exists for this customer/date.');
      } else {
        const selectedCustomer = findCustomerRecord(customerDetails, Customer);
        const phoneNumber = getCustomerPhone(selectedCustomer);
        const message = `Hello ${Customer}, we will follow up with you for ₹${Number(Amount)}. Thank you!`;

        toast.success('Payment follow-up added.');
        setWhatsAppMessage(message);
        setMobileToSend(phoneNumber);
        setIsTransactionSaved(true);

        if (sendWhatsAppAfterSave) {
          if (!phoneNumber) {
            toast.error('Customer phone number is missing for WhatsApp');
            return;
          }
          await sendWhatsApp(phoneNumber, message, selectedCustomer);
        }
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || 'Unknown error';
      console.error('Save follow-up error:', msg, err?.response?.data);
      toast.error(`Something went wrong: ${msg}`);
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
