import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import axios from '../apiClient.js';
import toast, { Toaster } from 'react-hot-toast';
import { extractPhoneNumber, normalizeWhatsAppPhone } from '../utils/whatsapp.js';
import {
  FullscreenAddFormLayout,
} from '../components/ui';
import {
  compactCardSx,
  compactFieldSx,
} from '../components/ui/addFormStyles';
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  buildOpeningBalanceReceivableParameters,
} from '../constants/whatsappTemplates';

export default function AddRecievable() {
  const navigate = useNavigate();
  const location = useLocation();

  const [Description, setDescription] = useState('');
  const [Amount, setAmount] = useState('');
  const [Total_Debit, setTotal_Debit] = useState('');
  const [userGroup, setUserGroup] = useState('');
  const [Total_Credit, setTotal_Credit] = useState('');
  const [CreditCustomer, setCreditCustomer] = useState('');
  const [, setDebitCustomer] = useState('');
  const [allCustomerOptions, setAllCustomerOptions] = useState([]);
  const [accountCustomerOptions, setAccountCustomerOptions] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [Customer_name, setCustomer_Name] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [mobileToSend, setMobileToSend] = useState('');
  const [sendWhatsAppAfterSave, setSendWhatsAppAfterSave] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isTransactionSaved, setIsTransactionSaved] = useState(false);

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const logInUser = userNameFromState || localStorage.getItem('User_name');

    if (logInUser) {
      setLoggedInUser(logInUser);
    } else {
      navigate('/login');
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const group = localStorage.getItem('User_group');
    setUserGroup(group);
  }, []);

  const handleFileChange = (e) => {
    setSelectedImage(e.target.files[0]);
  };

  useEffect(() => {
    axios.get('/api/customers/GetCustomersList')
      .then((res) => {
        if (res.data.success) {
          setAllCustomerOptions(res.data.result);

          const accountOptions = res.data.result.filter((item) => item.Customer_group === 'Bank and Account');
          setAccountCustomerOptions(accountOptions);
          setDebitCustomer(accountOptions[0]?.Customer_uuid || '');
        }
      })
      .catch((err) => {
        console.error('Error fetching customer options:', err);
      });
  }, []);

  const selectedCustomer = useMemo(
    () => allCustomerOptions.find((option) => option.Customer_uuid === CreditCustomer) || null,
    [allCustomerOptions, CreditCustomer]
  );

  function addCustomer() {
    navigate('/addCustomer');
  }

  const sendWhatsApp = async (phone = mobileToSend, customerData = null) => {
    if (!phone) return toast.error('Customer phone number is required');
    setIsSendingWhatsApp(true);

    try {
      const customer = customerData || selectedCustomer;
      const customerLabel = customer?.Customer_name || Customer_name || 'Customer';
      const cleanPhone = normalizeWhatsAppPhone(phone);

      const payload = {
        to: cleanPhone,
        template_name: WHATSAPP_TEMPLATES.OPENING_BALANCE_RECEIVABLE,
        language: DEFAULT_TEMPLATE_LANGUAGE,
        components: [{
          type: 'body',
          parameters: buildOpeningBalanceReceivableParameters({
            customerName: customerLabel,
            asOnDate: '01-04-2025',
            amount: String(Amount || '0'),
            description: Description || 'Opening balance receivable',
          }).map((text) => ({ type: 'text', text })),
        }],
      };

      const { data } = await axios.post('/api/whatsapp/send-template', payload);
      if (!data?.success) return toast.error(data?.error || 'Failed to send WhatsApp');
      toast.success('WhatsApp message sent');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to send WhatsApp');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  async function submit(e) {
    e.preventDefault();

    if (!Amount || Number.isNaN(Number(Amount)) || Number(Amount) <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    if (!CreditCustomer) {
      toast.error('Please select a customer.');
      return;
    }

    try {
      const creditCustomer = allCustomerOptions.find((option) => option.Customer_uuid === CreditCustomer);

      const journal = [
        {
          Account_id: '81f36451-41f2-402d-9dd3-cc11af039142',
          Type: 'Debit',
          Amount: Number(Amount),
        },
        {
          Account_id: creditCustomer.Customer_uuid,
          Type: 'Credit',
          Amount: Number(Amount),
        },
      ];

      const formData = new FormData();
      formData.append('Description', Description);
      formData.append('Total_Credit', Number(Amount));
      formData.append('Total_Debit', Number(Amount));
      formData.append('Payment_mode', 'Opening Balance');
      formData.append('Transaction_date', '01-04-2025');
      formData.append('Created_by', loggedInUser);
      formData.append('Journal_entry', JSON.stringify(journal));
      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      const response = await axios.post('/api/transaction/addTransaction', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const phoneNumber = extractPhoneNumber(creditCustomer);
        setMobileToSend(phoneNumber);
        setIsTransactionSaved(true);
        toast.success(response.data.message || 'Opening receivable added');

        if (sendWhatsAppAfterSave) {
          await sendWhatsApp(phoneNumber, creditCustomer);
        }

        navigate('/allOrder');
      } else {
        toast.error('Failed to add Transaction');
      }
    } catch (err) {
      console.error('Error adding Transaction:', err);
      toast.error('Error occurred while submitting the form.');
    }
  }

  const handleAmountChange = (e) => {
    const value = e.target.value;
    setAmount(value);
    setTotal_Debit(value);
    setTotal_Credit(value);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCustomer_Name(value);

    if (value) {
      const filtered = allCustomerOptions.filter((option) =>
        option.Customer_name.toLowerCase().includes(value.toLowerCase()));
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions([]);
    }
  };

  const closeModal = () => {
    if (userGroup === 'Office User') {
      navigate('/home');
    } else if (userGroup === 'Admin User') {
      navigate('/home');
    }
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={closeModal}
        submitLabel="Submit"
        cancelLabel="Close"
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1.2}>
            <Typography variant="h6" fontWeight={700}>Add Receivable</Typography>
            <TextField
              label="Search by Customer Name"
              value={Customer_name}
              onChange={handleInputChange}
              size="small"
              sx={compactFieldSx}
            />
            <TextField
              label="Matched Customers"
              select
              value={CreditCustomer}
              onChange={(e) => setCreditCustomer(e.target.value)}
              size="small"
              sx={compactFieldSx}
            >
              <MenuItem value="">Select Customer</MenuItem>
              {(filteredOptions.length ? filteredOptions : allCustomerOptions).map((option) => (
                <MenuItem key={option.Customer_uuid} value={option.Customer_uuid}>{option.Customer_name}</MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={addCustomer}>Add Customer</Button>

            <TextField
              label="Description"
              autoComplete="off"
              onChange={(e) => setDescription(e.target.value)}
              value={Description}
              size="small"
              sx={compactFieldSx}
            />
            <TextField
              label="Amount"
              autoComplete="off"
              onChange={handleAmountChange}
              value={Amount}
              size="small"
              sx={compactFieldSx}
            />
            <TextField
              type="file"
              size="small"
              sx={compactFieldSx}
              inputProps={{ accept: 'image/*' }}
              onChange={handleFileChange}
              helperText="Upload supporting image (optional)"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="Total Debit" value={Total_Debit} InputProps={{ readOnly: true }} size="small" sx={compactFieldSx} />
              <TextField label="Total Credit" value={Total_Credit} InputProps={{ readOnly: true }} size="small" sx={compactFieldSx} />
            </Stack>

            <Alert severity="info" icon={<ReceiptLongRoundedIcon fontSize="inherit" />}>
              <Typography variant="caption">
                Customer: {selectedCustomer?.Customer_name || 'Not selected'}
                <br />
                As on: 01-04-2025
              </Typography>
            </Alert>

            <FormControlLabel
              control={<Checkbox checked={sendWhatsAppAfterSave} onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)} />}
              label="Send WhatsApp after saving"
            />

            {isTransactionSaved && mobileToSend ? (
              <Button
                type="button"
                variant="contained"
                startIcon={<SendRoundedIcon />}
                onClick={() => sendWhatsApp()}
                disabled={isSendingWhatsApp}
              >
                {isSendingWhatsApp ? 'Sending WhatsApp...' : 'Send WhatsApp Opening Balance'}
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </FullscreenAddFormLayout>
    </>
  );
}
