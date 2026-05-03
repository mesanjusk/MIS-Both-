import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Paper, Stack, TextField, Typography } from '@mui/material';
import { addNote } from '../services/noteService.js';
import { fetchCustomers } from '../services/customerService.js';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddNote({ onClose, order }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orderId, setOrderId] = useState(order?.Order_id || '');
  const [Customer_uuid, setCustomer_uuid] = useState('');
  const [Note_name, setNote_name] = useState('');
  const [Customer_name, setCustomer_name] = useState('');
  const [Order_uuid, setOrder_uuid] = useState('');
  const [loggedInUser, setLoggedInUser] = useState('');

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
    if (order) {
      setCustomer_uuid(order.Customer_uuid);
      setCustomer_name(order.Customer_name || '');
      setOrder_uuid(order.Order_uuid || '');
      setOrderId(order._id);
    }
  }, [order]);

  useEffect(() => {
    fetchCustomers()
      .then((res) => {
        if (res.data.success) {
          const customer = res.data.result.find((cust) => cust.Customer_uuid === Customer_uuid);
          if (customer) {
            setCustomer_name(customer.Customer_name);
          }
        }
      })
      .catch((err) => console.log('Error fetching customers list:', err));
  }, [Customer_uuid]);

  async function submit(e) {
    e.preventDefault();

    try {
      const response = await addNote({
        Customer_uuid,
        Order_uuid,
        Note_name,
      });

      if (response.data.success) {
        alert('Note added successfully!');
        navigate('/allOrder');
      }
    } catch (e) {
      console.log('Error updating transaction:', e);
    }
  }

  const handleClose = () => {
    if (onClose) onClose();
    else if (loggedInUser) navigate('/allOrder');
    else navigate('/home');
  };

  return (
    <FullscreenAddFormLayout
      onSubmit={submit}
      onClose={handleClose}
      submitLabel="Save"
      cancelLabel="Close"
    >
      <Paper sx={compactCardSx}>
        <Stack spacing={1.2}>
          <Typography variant="h6" fontWeight={700}>Add Note</Typography>
          {orderId ? <Typography variant="caption" color="text.secondary">Order Ref: {orderId}</Typography> : null}

          <TextField
            label="Customer"
            autoComplete="off"
            value={Customer_name}
            size="small"
            sx={compactFieldSx}
            InputProps={{ readOnly: true }}
          />

          <TextField
            label="Note"
            autoComplete="off"
            onChange={(e) => setNote_name(e.target.value)}
            value={Note_name}
            size="small"
            sx={compactFieldSx}
            multiline
            minRows={2}
          />
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}
