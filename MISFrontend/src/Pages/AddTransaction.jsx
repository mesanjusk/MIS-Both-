import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '../apiClient.js';
import { ToastContainer, toast } from '../Components';
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
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  buildAmountReceivedParameters,
} from '../constants/whatsappTemplates';
import { sendAdminAlertText } from '../utils/whatsapp';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddTransaction({ editMode, existingData, onClose, onSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [Description, setDescription] = useState('');
  const [Amount, setAmount] = useState('');
  const [Transaction_date, setTransaction_date] = useState('');
  const [group, setGroup] = useState('');
  const [customers, setCustomers] = useState('');
  const [Customer_name, setCustomer_Name] = useState('');
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
  const inputLabelProps = { shrink: true };

  useEffect(() => {
    const userNameFromState = location.state?.id || localStorage.getItem('User_name');
    if (userNameFromState) setLoggedInUser(userNameFromState);
    else navigate('/login');
    setIsAdminUser((localStorage.getItem('User_group') || '') === 'Admin User');
  }, [location.state, navigate]);

  useEffect(() => {
    setOptionsLoading(true);
    axios.get('/api/customers/GetCustomersList')
      .then((res) => {
        if (res.data.success) {
          setAllCustomerOptions(res.data.result);
          setAccountCustomerOptions(
            res.data.result.filter((item) => item.Customer_group === 'Bank and Account')
          );
        }
      })
      .catch(() => toast.error('Error fetching customers'))
      .finally(() => setOptionsLoading(false));
  }, []);

  useEffect(() => {
    if (!editMode || !existingData || allCustomerOptions.length === 0) return;

    const getCreditUuid = (txn) => txn.Journal_entry?.find((j) => j.Type.toLowerCase() === 'credit')?.Account_id;
    const getDebitUuid = (txn) => txn.Journal_entry?.find((j) => j.Type.toLowerCase() === 'debit')?.Account_id;

    const debitId = getDebitUuid(existingData) || '';
    setDescription(existingData.Description || '');
    setAmount(existingData.Total_Debit || existingData.Total_Credit || '');
    setTransaction_date(existingData.Transaction_date?.substring(0, 10) || '');
    setGroup(getCreditUuid(existingData) || '');
    setCustomers(debitId);
    const customer = allCustomerOptions.find((c) => c.Customer_uuid === debitId);
    setCustomer_Name(customer?.Customer_name || '');
    setIsDateChecked(!!existingData.Transaction_date);
  }, [editMode, existingData, allCustomerOptions]);

  const selectedCustomer = useMemo(
    () => allCustomerOptions.find((c) => c.Customer_uuid === customers) || null,
    [allCustomerOptions, customers]
  );
  const selectedPaymentMode = useMemo(
    () => accountCustomerOptions.find((c) => c.Customer_uuid === group) || null,
    [accountCustomerOptions, group]
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

  const closeModal = () => {
    if (onClose) onClose();
    else navigate('/home');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!Amount || Number.isNaN(Number(Amount)) || Number(Amount) <= 0) {
      return toast.error('Enter valid amount.');
    }
    if (!customers || !group) {
      return toast.error('Select both customer and payment mode.');
    }

    const customer = allCustomerOptions.find((c) => c.Customer_uuid === customers);
    const paymentMode = accountCustomerOptions.find((c) => c.Customer_uuid === group);
    if (!customer || !paymentMode) return toast.error('Selected customer or payment mode is invalid.');

    const todayDate = new Date().toISOString().split('T')[0];
    const journal = [
      { Account_id: customers, Type: 'Debit', Amount: Number(Amount) },
      { Account_id: group, Type: 'Credit', Amount: Number(Amount) },
    ];

    const formData = new FormData();
    formData.append('Description', Description);
    formData.append('Total_Credit', Number(Amount));
    formData.append('Total_Debit', Number(Amount));
    formData.append('Payment_mode', paymentMode.Customer_name);
    formData.append('Created_by', loggedInUser);
    formData.append('Transaction_date', isAdminUser && isDateChecked ? (Transaction_date || todayDate) : todayDate);
    formData.append('Journal_entry', JSON.stringify(journal));
    if (editMode && existingData?._id) formData.append('_id', existingData._id);
    if (selectedImage) formData.append('image', selectedImage);

    try {
      setLoading(true);
      const res = await axios.post('/api/transaction/addTransaction', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!res.data.success) return toast.error('Failed to save transaction');

      toast.success(editMode ? 'Receipt updated.' : 'Receipt saved.');
      const phoneNumber = customer?.Mobile_number || customer?.mobile || customer?.phone || '';
      setMobileToSend(phoneNumber);
      setIsTransactionSaved(true);

      if (sendWhatsAppAfterSave) {
        await sendWhatsApp(phoneNumber);
      }

      onSuccess?.();
      closeModal();
    } catch {
      toast.error('Submission error');
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsApp = async (phone = mobileToSend) => {
    if (!phone) return toast.error('Customer phone number is required');
    setIsSendingWhatsApp(true);
    try {
      let cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

      const payload = {
        to: cleanPhone,
        template_name: WHATSAPP_TEMPLATES.AMOUNT_RECEIVED,
        language: DEFAULT_TEMPLATE_LANGUAGE,
        components: [{
          type: 'body',
          parameters: buildAmountReceivedParameters({
            customerName: Customer_name || 'Customer',
            date: new Date().toLocaleDateString('en-IN'),
            amount: String(Amount || '0'),
            reference: selectedPaymentMode?.Customer_name || '-',
            description: Description || 'Payment received',
          }).map((text) => ({ type: 'text', text })),
        }],
      };

      const { data } = await axios.post('/api/whatsapp/send-template', payload);
      if (!data?.success) return toast.error(data?.error || 'Failed to send WhatsApp');

      await sendAdminAlertText({
        axiosInstance: axios,
        message: `Receipt alert: ${Customer_name || 'Customer'} | Amount: ₹${Amount || 0} | ${Description || 'Payment received'}`,
      }).catch(() => null);
      toast.success('WhatsApp message sent');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to send WhatsApp');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return (
    <>
      <ToastContainer />
      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={closeModal}
        submitLabel={loading ? 'Saving...' : editMode ? 'Update' : 'Submit'}
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
                if (!value) setCustomers('');
              }}
              onChange={(_, value) => {
                setCustomers(value?.Customer_uuid || '');
                setCustomer_Name(value?.Customer_name || '');
              }}
              getOptionLabel={(option) => option?.Customer_name || ''}
              isOptionEqualToValue={(option, value) => option?.Customer_uuid === value?.Customer_uuid}
              renderInput={(params) => <TextField {...params} label="Customer" placeholder="Search by customer name" size="small" sx={compactFieldSx} />}
            />

            <Button type="button" variant="outlined" size="small" startIcon={<PersonAddAlt1RoundedIcon />} onClick={() => navigate('/addCustomer')} sx={{ borderRadius: 2 }}>
              Add Customer
            </Button>

            <TextField label="Description" value={Description} onChange={(e) => setDescription(e.target.value)} placeholder="Receipt description" size="small" sx={compactFieldSx} />

            <Stack direction="row" spacing={1}>
              <TextField
                label="Amount (₹)"
                type="number"
                value={Amount}
                onChange={(e) => setAmount(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
                size="small"
                sx={compactFieldSx}
              />
              <TextField select label="Payment Mode" value={group} onChange={(e) => setGroup(e.target.value)} fullWidth size="small" sx={compactFieldSx} MenuProps={selectMenuProps}>
                <MenuItem value="">Select payment mode</MenuItem>
                {accountCustomerOptions.map((cust) => (
                  <MenuItem key={cust.Customer_uuid} value={cust.Customer_uuid}>{cust.Customer_name}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField type="file" size="small" inputProps={{ accept: 'image/*' }} onChange={(e) => setSelectedImage(e.target.files?.[0] || null)} helperText="Proof image is optional" sx={compactFieldSx} />

            <FormControlLabel
              sx={{ m: 0 }}
              control={<Checkbox checked={sendWhatsAppAfterSave} onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)} />}
              label="Send WhatsApp after saving"
            />

            {isAdminUser ? (
              <>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Checkbox checked={isDateChecked} onChange={() => { setIsDateChecked((prev) => !prev); setTransaction_date(''); }} />}
                  label="Save custom date"
                />
                {isDateChecked ? (
                  <TextField label="Transaction Date" type="date" value={Transaction_date} onChange={(e) => setTransaction_date(e.target.value)} InputLabelProps={inputLabelProps} size="small" sx={compactFieldSx} />
                ) : null}
              </>
            ) : null}

            {isTransactionSaved && mobileToSend ? (
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

AddTransaction.propTypes = {
  editMode: PropTypes.bool,
  existingData: PropTypes.object,
  onClose: PropTypes.func,
  onSuccess: PropTypes.func,
};
