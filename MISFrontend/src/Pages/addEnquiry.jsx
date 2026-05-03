import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import axios from '../apiClient.js';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddCategory() {
  const navigate = useNavigate();
  const [Customer_name, setCustomer_Name] = useState('');
  const [Remark, setRemark] = useState('');
  const [userGroup, setUserGroup] = useState('');
  const [customerRecords, setCustomerRecords] = useState([]);
  const [savedEnquiry, setSavedEnquiry] = useState(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    axios.get('/api/customers/GetCustomersList')
      .then((res) => {
        if (res.data.success) setCustomerRecords(Array.isArray(res.data.result) ? res.data.result : []);
      })
      .catch((err) => console.error('Error fetching customer options:', err));
  }, []);

  useEffect(() => { setUserGroup(localStorage.getItem('User_group') || ''); }, []);

  const selectedCustomer = useMemo(
    () => customerRecords.find((item) => item.Customer_name === Customer_name) || null,
    [Customer_name, customerRecords],
  );

  function addCustomer() { navigate('/addCustomer'); }

  async function submit(e) {
    e.preventDefault();
    try {
      if (!Customer_name) {
        alert('Customer Name is required.');
        return;
      }
      const payload = { Customer_name, Remark };
      const response = await axios.post('/api/enquiry/addEnquiry', payload);
      if (response.data.success) {
        alert(response.data.message);
        setSavedEnquiry({
          ...payload,
          Customer_uuid: selectedCustomer?.Customer_uuid,
          Mobile_number: selectedCustomer?.Mobile_number,
          Enquiry_uuid: response?.data?.result?.Enquiry_uuid,
          _id: response?.data?.result?._id,
        });
      } else {
        alert('Failed to add Enquiry');
      }
    } catch (err) {
      console.log('Error adding Enquiry:', err);
      alert(err?.response?.data?.message || err.message || 'Error adding enquiry');
    }
  }

  const convertToOrder = async () => {
    if (!savedEnquiry) return;
    if (!savedEnquiry.Customer_uuid) {
      alert('Customer UUID not found. Please select an existing customer before converting.');
      return;
    }
    setConverting(true);
    try {
      const orderPayload = {
        Customer_uuid: savedEnquiry.Customer_uuid,
        Items: savedEnquiry.Remark ? [{ Item: 'Order Note', Quantity: 0, Rate: 0, Amount: 0, Remark: savedEnquiry.Remark }] : [],
        Remark: savedEnquiry.Remark || '',
        orderNote: savedEnquiry.Remark || '',
        stage: 'approved',
        convertedFromEnquiry: savedEnquiry._id || savedEnquiry.Enquiry_uuid,
      };
      const res = await axios.post('/api/orders/addOrder', orderPayload);
      const order = res?.data?.result || res?.data?.order || res?.data;
      const orderNumber = order?.Order_Number || res?.data?.Order_Number;
      alert(`Order #${orderNumber || ''} created successfully!`);
      navigate(`/orderUpdate/${order?._id || order?.Order_uuid || orderNumber}`);
    } catch (e) {
      alert(`Failed to convert: ${e?.response?.data?.message || e?.response?.data?.error || e.message}`);
    } finally {
      setConverting(false);
    }
  };

  const closeModal = () => {
    if (userGroup === 'Office User' || userGroup === 'Admin User') navigate('/home');
    else navigate('/home');
  };

  return (
    <FullscreenAddFormLayout onSubmit={submit} onClose={closeModal} submitLabel="Submit" cancelLabel="Close">
      <Paper sx={compactCardSx}>
        <Stack spacing={1.2}>
          <Typography variant="h6" fontWeight={700}>Add Enquiry</Typography>
          {savedEnquiry && (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Enquiry saved. You can convert it to an order now.
            </Alert>
          )}
          <TextField label="Customer Name" select value={Customer_name} onChange={(e) => setCustomer_Name(e.target.value)} size="small" sx={compactFieldSx}>
            <MenuItem value="">Select Customer</MenuItem>
            {customerRecords.map((option) => (
              <MenuItem key={option.Customer_uuid || option._id || option.Customer_name} value={option.Customer_name}>{option.Customer_name}</MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={addCustomer}>Add Customer</Button>
          <TextField label="Order Details" autoComplete="off" onChange={(e) => setRemark(e.target.value)} value={Remark} placeholder="Remarks" multiline minRows={3} size="small" sx={compactFieldSx} />
          {savedEnquiry && (
            <Button variant="contained" color="success" onClick={convertToOrder} disabled={converting} sx={{ mt: 1 }}>
              {converting ? 'Converting...' : '✓ Convert to Order Now'}
            </Button>
          )}
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}
