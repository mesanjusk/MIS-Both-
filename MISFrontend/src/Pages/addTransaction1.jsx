import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '../apiClient.js';
import toast, { Toaster } from 'react-hot-toast';
import InvoiceModal from '../Components/InvoiceModal';
import {
  Autocomplete,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Paper,
} from '@mui/material';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { fetchCustomers } from '../services/customerService.js';
import { addTransaction } from '../services/transactionService.js';
import { extractPhoneNumber, normalizeWhatsAppPhone, sendAdminAlertText } from '../utils/whatsapp.js';
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  buildAmountPaidParameters,
} from '../constants/whatsappTemplates';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddTransaction1({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const previewRef = useRef();

  const [Description, setDescription] = useState('');
  const [Amount, setAmount] = useState('');
  const [Transaction_date, setTransaction_date] = useState('');
  const [Customer_name, setCustomer_Name] = useState('');
  const [CreditCustomer, setCreditCustomer] = useState('');
  const [DebitCustomer, setDebitCustomer] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDateChecked, setIsDateChecked] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [allCustomerOptions, setAllCustomerOptions] = useState([]);
  const [accountCustomerOptions, setAccountCustomerOptions] = useState([]);

  const [mobileToSend, setMobileToSend] = useState('');
  const [sendWhatsAppAfterSave, setSendWhatsAppAfterSave] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isTransactionSaved, setIsTransactionSaved] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState([]);

  useEffect(() => {
    const userNameFromState = location.state?.id || localStorage.getItem('User_name');
    if (userNameFromState) setLoggedInUser(userNameFromState);
    else navigate('/login');
    setIsAdminUser(localStorage.getItem('User_group') === 'Admin User');
  }, [location.state, navigate]);

  useEffect(() => {
    setOptionsLoading(true);
    fetchCustomers()
      .then((res) => {
        if (res.data.success) {
          setAllCustomerOptions(res.data.result);
          setAccountCustomerOptions(res.data.result.filter((item) => item.Customer_group === 'Bank and Account'));
        }
      })
      .catch(() => toast.error('Error fetching customers'))
      .finally(() => setOptionsLoading(false));
  }, []);

  const selectedCustomer = useMemo(
    () => allCustomerOptions.find((c) => c.Customer_uuid === CreditCustomer) || null,
    [allCustomerOptions, CreditCustomer]
  );
  const selectedPaymentMode = useMemo(
    () => accountCustomerOptions.find((c) => c.Customer_uuid === DebitCustomer) || null,
    [accountCustomerOptions, DebitCustomer]
  );
  const selectMenuProps = useMemo(
    () => ({
      sx: { zIndex: 2305 },
      PaperProps: { sx: { zIndex: 2305 } },
    }),
    []
  );
  const autocompleteSlotProps = useMemo(
    () => ({ popper: { sx: { zIndex: 2305 } } }),
    []
  );

  const closeModal = () => (onClose ? onClose() : navigate('/home'));
  const isEmbeddedFlow = typeof onClose === 'function';

  const submit = async (e) => {
    e.preventDefault();
    if (!Amount || Number.isNaN(Number(Amount)) || Number(Amount) <= 0) return toast.error('Enter valid amount.');
    if (!CreditCustomer || !DebitCustomer) return toast.error('Select both customer and payment mode.');

    const creditCustomer = allCustomerOptions.find((c) => c.Customer_uuid === CreditCustomer);
    const debitCustomer = accountCustomerOptions.find((c) => c.Customer_uuid === DebitCustomer);
    if (!creditCustomer || !debitCustomer) return toast.error('Selected customer or payment mode is invalid.');

    const todayDate = new Date().toISOString().split('T')[0];
    const journal = [
      { Account_id: debitCustomer.Customer_uuid, Type: 'Debit', Amount: Number(Amount) },
      { Account_id: creditCustomer.Customer_uuid, Type: 'Credit', Amount: Number(Amount) },
    ];

    const formData = new FormData();
    formData.append('Description', Description);
    formData.append('Total_Credit', Number(Amount));
    formData.append('Total_Debit', Number(Amount));
    formData.append('Payment_mode', debitCustomer.Customer_name);
    formData.append('Created_by', loggedInUser);
    formData.append('Transaction_date', isAdminUser && isDateChecked ? (Transaction_date || todayDate) : todayDate);
    formData.append('Journal_entry', JSON.stringify(journal));
    if (selectedImage) formData.append('image', selectedImage);

    try {
      setLoading(true);
      const res = await addTransaction(formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data.success) return toast.error('Failed to save transaction');

      const phoneNumber = extractPhoneNumber(creditCustomer);
      setMobileToSend(phoneNumber);
      setIsTransactionSaved(true);

      if (sendWhatsAppAfterSave) {
        await sendWhatsApp(phoneNumber, creditCustomer);
      }

      setInvoiceItems([{ Item: Description || 'Payment', Quantity: 1, Rate: Number(Amount), Amount: Number(Amount) }]);
      setShowInvoiceModal(true);
      toast.success('Payment saved.');
      if (isEmbeddedFlow) closeModal();
    } catch {
      toast.error('Submission error');
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsApp = async (phone = mobileToSend, customerData = null) => {
    if (!phone) return toast.error('Customer phone number is required');
    setIsSendingWhatsApp(true);
    try {
      const selected = customerData || selectedCustomer;
      const customerLabel = selected?.Customer_name || Customer_name || 'Customer';
      const cleanPhone = normalizeWhatsAppPhone(phone);
      const payload = {
        to: cleanPhone,
        template_name: WHATSAPP_TEMPLATES.AMOUNT_PAID,
        language: DEFAULT_TEMPLATE_LANGUAGE,
        components: [{
          type: 'body',
          parameters: buildAmountPaidParameters({
            customerName: customerLabel,
            date: new Date().toLocaleDateString('en-IN'),
            amount: String(Amount || '0'),
            reference: selectedPaymentMode?.Customer_name || '-',
            description: Description || 'Payment paid',
          }).map((text) => ({ type: 'text', text })),
        }],
      };
      const { data } = await axios.post('/api/whatsapp/send-template', payload);
      if (!data?.success) return toast.error(data?.error || 'Failed to send WhatsApp template');
      await sendAdminAlertText({
        axiosInstance: axios,
        message: `Payment alert: ${customerLabel} | Amount: ₹${Amount || 0} | ${Description || 'Payment recorded'}`,
      }).catch(() => null);
      toast.success('WhatsApp template sent');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to send WhatsApp template');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <InvoiceModal
        open={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        invoiceRef={previewRef}
        customerName={Customer_name}
        customerMobile={mobileToSend}
        items={invoiceItems}
        remark={Description}
        onSendWhatsApp={() => sendWhatsApp()}
      />

      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={closeModal}
        submitLabel={loading ? 'Saving...' : 'Submit'}
        busy={loading}
        disableSubmit={optionsLoading}
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1}>
            <Autocomplete
              loading={optionsLoading}
              options={allCustomerOptions}
              value={selectedCustomer}
              inputValue={Customer_name}
              slotProps={autocompleteSlotProps}
              onInputChange={(_, value) => {
                setCustomer_Name(value || '');
                if (!value) setCreditCustomer('');
              }}
              onChange={(_, value) => {
                setCreditCustomer(value?.Customer_uuid || '');
                setCustomer_Name(value?.Customer_name || '');
              }}
              getOptionLabel={(option) => option?.Customer_name || ''}
              isOptionEqualToValue={(option, value) => option?.Customer_uuid === value?.Customer_uuid}
              renderInput={(params) => <TextField {...params} label="Customer" placeholder="Search by customer name" size="small" sx={compactFieldSx} />}
            />

            <Button type="button" variant="outlined" size="small" startIcon={<PersonAddAlt1RoundedIcon />} onClick={() => navigate('/addCustomer')} sx={{ borderRadius: 2 }}>
              Add Customer
            </Button>

            <TextField label="Description" value={Description} onChange={(e) => setDescription(e.target.value)} placeholder="Payment description" size="small" sx={compactFieldSx} />

            <Stack direction="row" spacing={1}>
              <TextField label="Amount (₹)" type="number" value={Amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ min: 0, step: '0.01' }} fullWidth size="small" sx={compactFieldSx} />
              <TextField select label="Payment Mode" value={DebitCustomer} onChange={(e) => setDebitCustomer(e.target.value)} fullWidth size="small" sx={compactFieldSx} MenuProps={selectMenuProps}>
                <MenuItem value="">Select payment mode</MenuItem>
                {accountCustomerOptions.map((cust) => (
                  <MenuItem key={cust.Customer_uuid} value={cust.Customer_uuid}>{cust.Customer_name}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField type="file" size="small" inputProps={{ accept: 'image/*' }} onChange={(e) => setSelectedImage(e.target.files?.[0] || null)} helperText="Proof image is optional" sx={compactFieldSx} />

            <FormControlLabel sx={{ m: 0 }} control={<Checkbox checked={sendWhatsAppAfterSave} onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)} />} label="Send WhatsApp after saving" />

            {isAdminUser ? (
              <>
                <FormControlLabel sx={{ m: 0 }} control={<Checkbox checked={isDateChecked} onChange={() => { setIsDateChecked((prev) => !prev); setTransaction_date(''); }} />} label="Save custom date" />
                {isDateChecked ? <TextField label="Transaction Date" type="date" value={Transaction_date} onChange={(e) => setTransaction_date(e.target.value)} InputLabelProps={{ shrink: true }} size="small" sx={compactFieldSx} /> : null}
              </>
            ) : null}

            {isTransactionSaved ? (
              <Button type="button" variant="contained" size="small" startIcon={<SendRoundedIcon />} onClick={() => sendWhatsApp()} disabled={isSendingWhatsApp} sx={{ borderRadius: 2 }}>
                {isSendingWhatsApp ? 'Sending WhatsApp...' : 'Send WhatsApp Receipt'}
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </FullscreenAddFormLayout>
    </>
  );
}

AddTransaction1.propTypes = { onClose: PropTypes.func };
