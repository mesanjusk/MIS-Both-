import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddPayment() {
  const navigate = useNavigate();
  const [Payment_name, setPayment_Name] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await axios.post('/api/payment_mode/addPayment', { Payment_name });
      toast.success('Payment mode added successfully');
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Payment mode already exists');
      } else {
        toast.error(error.response?.data?.message || 'Error saving payment mode');
      }
    }
  }

  return (
    <SimpleEntityCreateForm
      title="Add Payment"
      label="Payment Name"
      value={Payment_name}
      placeholder="Payment Name"
      onChange={setPayment_Name}
      onSubmit={submit}
      submitLabel="Submit"
    />
  );
}
