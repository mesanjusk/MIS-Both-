import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import SimpleEntityCreateForm from '../components/forms/SimpleEntityCreateForm';

export default function AddPayment() {
  const navigate = useNavigate();
  const [Payment_name, setPayment_Name] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await axios.post('/api/payment_mode/addPayment', {
        Payment_name,
      });

      if (res.data === 'exist') {
        alert('Name already exists');
      } else if (res.data === 'notexist') {
        alert('Name added successfully');
        navigate('/home');
      }
    } catch (error) {
      alert('wrong details');
      console.log(error);
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
